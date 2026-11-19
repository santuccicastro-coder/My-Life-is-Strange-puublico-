import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  MessageSquare,
  Mic,
  MicOff,
  PhoneOff,
  Send,
  Sparkles,
  Trash2,
  Volume2,
} from 'lucide-react';
import { useFinance } from '../context/AuthHouseholdContext';
import { auth } from '../firebase';
import type { AiChatMode, AppRoute } from '../types/finance';
import {
  buildCoupleFinancialContextSummary,
  formatBRL,
  formatMonthShort,
  getCurrentMonthKey,
  getHouseholdMembersList,
} from '../utils/financeCalculations';

interface AssistantPageProps {
  onNavigate: (route: AppRoute) => void;
}

interface VoiceTurn {
  id: string;
  speaker: 'você' | 'duofin';
  text: string;
}

const SUGGESTIONS = [
  'Se eu gastar R$ 300 por mês numa compra nova, quanto tira da minha renda e quanto fica?',
  'Quanto já saiu da minha renda neste mês e quanto ainda posso gastar?',
  'Onde dá para economizar rápido sem apertar o básico?',
  'Quando acabam minhas parcelas atuais e quanto vai sobrar por mês?',
];

function downsampleFloat32(buffer: Float32Array, inputRate: number, targetRate: number): Float32Array {
  if (!inputRate || inputRate <= targetRate) return buffer;
  const ratio = inputRate / targetRate;
  const outLength = Math.max(1, Math.round(buffer.length / ratio));
  const out = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(buffer.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    let count = 0;
    for (let j = start; j < end; j++) {
      sum += buffer[j];
      count++;
    }
    out[i] = count > 0 ? sum / count : buffer[Math.min(buffer.length - 1, start)];
  }
  return out;
}

function createCompatibleAudioContext(desiredSampleRate: number): AudioContext {
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) {
    throw new Error('Este navegador não suporta captura de áudio em tempo real.');
  }
  try {
    return new Ctx({ sampleRate: desiredSampleRate });
  } catch {
    return new Ctx();
  }
}

function float32ToPcm16Base64(float32: Float32Array): { base64: string; rms: number } {
  const int16 = new Int16Array(float32.length);
  let sumSq = 0;
  for (let i = 0; i < float32.length; i++) {
    const clamped = Math.max(-1, Math.min(1, float32[i]));
    sumSq += clamped * clamped;
    int16[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }
  const bytes = new Uint8Array(int16.buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return {
    base64: btoa(binary),
    rms: Math.sqrt(sumSq / Math.max(1, float32.length)),
  };
}

function pcm16Base64ToFloat32(base64: string): Float32Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const int16 = new Int16Array(bytes.buffer);
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / 0x8000;
  }
  return float32;
}

export function AssistantPage({ onNavigate }: AssistantPageProps) {
  const {
    household,
    incomes,
    transactions,
    recurringItems,
    cards,
    installments,
    goals,
    plannedPurchases,
    bankAccounts,
    aiMessages,
    addAiMessage,
    clearAiMessages,
  } = useFinance();

  const [tab, setTab] = useState<'chat' | 'voice'>('chat');
  const [mode, setMode] = useState<AiChatMode>('fast');
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Estado da conversa por voz em tempo real (Live API)
  const [voiceState, setVoiceState] = useState<'idle' | 'connecting' | 'active' | 'error'>('idle');
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [micLevel, setMicLevel] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [voiceTurns, setVoiceTurns] = useState<VoiceTurn[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const scheduledSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const isMutedRef = useRef<boolean>(false);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [aiMessages.length, sending]);

  const contextSummary = useMemo(
    () =>
      buildCoupleFinancialContextSummary({
        householdName: household?.name,
        partner1Name: household?.partner1Name,
        partner2Name: household?.partner2Name,
        memberNames: getHouseholdMembersList(household).map((m) => m.name),
        incomes,
        transactions,
        recurringItems,
        cards,
        installments,
        goals,
        plannedPurchases,
        bankAccounts,
        horizonStartMonth: getCurrentMonthKey(),
        horizonMonthsCount: 24,
      }),
    [household, incomes, transactions, recurringItems, cards, installments, goals, plannedPurchases, bankAccounts]
  );

  const quickSnapshot = useMemo(() => {
    const totalSaved = goals.reduce((s, g) => s + g.currentAmount, 0);
    return {
      totalSaved,
      activeRecurring: recurringItems.filter((r) => r.active).length,
      activeInstallments: installments.length,
    };
  }, [goals, recurringItems, installments]);

  const sendPrompt = async (rawPrompt: string) => {
    const clean = rawPrompt.trim();
    if (!clean || sending) return;
    setChatError(null);
    setInputText('');
    setSending(true);

    try {
      const historyPayload = [
        ...aiMessages.slice(-18).map((m) => ({ role: m.role, text: m.text })),
        { role: 'user' as const, text: clean },
      ];

      await addAiMessage({
        role: 'user',
        text: clean,
        mode,
        modelUsed: mode === 'fast' ? 'gemini-3.1-flash-lite' : 'gemini-4-hydrogen',
      });

      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        throw new Error('Sessão expirada. Faça login novamente para usar o assistente.');
      }

      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          messages: historyPayload,
          mode,
          contextSummary,
        }),
      });

      const data = (await res.json()) as { reply?: string; modelUsed?: string; error?: string };
      if (!res.ok) {
        throw new Error(data.error || 'Não foi possível obter resposta do assistente.');
      }

      if (data.reply) {
        await addAiMessage({
          role: 'model',
          text: data.reply,
          mode,
          modelUsed: data.modelUsed || 'gemini-4-hydrogen',
        });
      }
    } catch (err) {
      setChatError(err instanceof Error ? err.message : 'Erro ao enviar mensagem.');
    } finally {
      setSending(false);
    }
  };

  const stopVoiceSession = () => {
    for (const src of scheduledSourcesRef.current) {
      try {
        src.stop();
      } catch {
        // ignore
      }
    }
    scheduledSourcesRef.current = [];
    nextStartTimeRef.current = 0;

    if (processorRef.current) {
      try {
        processorRef.current.disconnect();
      } catch {
        // ignore
      }
      processorRef.current.onaudioprocess = null;
      processorRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }

    if (inputCtxRef.current) {
      inputCtxRef.current.close().catch(() => {});
      inputCtxRef.current = null;
    }

    if (outputCtxRef.current) {
      outputCtxRef.current.close().catch(() => {});
      outputCtxRef.current = null;
    }

    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {
        // ignore
      }
      wsRef.current = null;
    }

    setMicLevel(0);
    setVoiceState('idle');
  };

  useEffect(() => {
    return () => {
      stopVoiceSession();
    };
  }, []);

  const playAudioChunk24k = (base64Audio: string) => {
    const ctx = outputCtxRef.current;
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => {});
    }

    const float32 = pcm16Base64ToFloat32(base64Audio);
    const buffer = ctx.createBuffer(1, float32.length, 24000);
    buffer.copyToChannel(new Float32Array(float32), 0);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    const startTime = Math.max(ctx.currentTime, nextStartTimeRef.current);
    source.start(startTime);
    nextStartTimeRef.current = startTime + buffer.duration;
    scheduledSourcesRef.current.push(source);

    source.onended = () => {
      scheduledSourcesRef.current = scheduledSourcesRef.current.filter((s) => s !== source);
    };
  };

  const appendVoiceTranscript = (speaker: 'você' | 'duofin', chunkText: string) => {
    const clean = chunkText.trim();
    if (!clean) return;
    setVoiceTurns((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.speaker === speaker) {
        return [...prev.slice(0, -1), { ...last, text: `${last.text} ${clean}`.trim() }];
      }
      return [...prev, { id: `vt-${Date.now()}-${Math.random()}`, speaker, text: clean }];
    });
  };

  const startVoiceSession = async () => {
    if (voiceState === 'connecting' || voiceState === 'active') return;
    setVoiceError(null);
    setVoiceState('connecting');

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error(
          'Acesso ao microfone indisponível neste navegador. No iPhone/iPad, use o Safari atualizado.'
        );
      }

      // Cria e desbloqueia o AudioContext no gesto síncrono do usuário (exigência do iOS Safari)
      const inputCtx = createCompatibleAudioContext(16000);
      const outputCtx = createCompatibleAudioContext(24000);
      inputCtxRef.current = inputCtx;
      outputCtxRef.current = outputCtx;
      if (inputCtx.state === 'suspended') {
        void inputCtx.resume().catch(() => {});
      }
      if (outputCtx.state === 'suspended') {
        void outputCtx.resume().catch(() => {});
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      nextStartTimeRef.current = outputCtx.currentTime;

      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        throw new Error('Sessão expirada. Faça login novamente para usar a voz em tempo real.');
      }

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/api/ai/live?token=${encodeURIComponent(token)}`);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'init', token, contextSummary }));

        const source = inputCtx.createMediaStreamSource(stream);
        const processor = inputCtx.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;

        source.connect(processor);
        processor.connect(inputCtx.destination);

        processor.onaudioprocess = (event) => {
          if (isMutedRef.current) {
            setMicLevel(0);
            return;
          }
          const rawChannel = event.inputBuffer.getChannelData(0);
          const normalized = downsampleFloat32(rawChannel, inputCtx.sampleRate, 16000);
          const { base64, rms } = float32ToPcm16Base64(normalized);
          setMicLevel(Math.min(1, rms * 5));
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ audio: base64 }));
          }
        };
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as {
            status?: string;
            audio?: string;
            interrupted?: boolean;
            inputTranscript?: string;
            outputTranscript?: string;
            error?: string;
          };

          if (msg.status === 'ready') {
            setVoiceState('active');
          }
          if (msg.error) {
            setVoiceError(msg.error);
            stopVoiceSession();
            setVoiceState('error');
            return;
          }
          if (msg.interrupted) {
            for (const src of scheduledSourcesRef.current) {
              try {
                src.stop();
              } catch {
                // ignore
              }
            }
            scheduledSourcesRef.current = [];
            if (outputCtxRef.current) {
              nextStartTimeRef.current = outputCtxRef.current.currentTime;
            }
          }
          if (msg.audio) {
            playAudioChunk24k(msg.audio);
          }
          if (msg.inputTranscript) {
            appendVoiceTranscript('você', msg.inputTranscript);
          }
          if (msg.outputTranscript) {
            appendVoiceTranscript('duofin', msg.outputTranscript);
          }
        } catch {
          // ignore malformed WS frames
        }
      };

      ws.onerror = () => {
        setVoiceError('Não foi possível conectar ao canal de voz em tempo real.');
        stopVoiceSession();
        setVoiceState('error');
      };

      ws.onclose = () => {
        if (wsRef.current) {
          stopVoiceSession();
        }
      };
    } catch (err) {
      const msg =
        err instanceof Error && err.name === 'NotAllowedError'
          ? 'Permissão de microfone negada. Libere o microfone no navegador para conversar por voz.'
          : err instanceof Error
          ? err.message
          : 'Erro ao iniciar microfone.';
      setVoiceError(msg);
      stopVoiceSession();
      setVoiceState('error');
    }
  };

  return (
    <div className="space-y-5">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Assistente Financeiro IA</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Converse por texto ou voz em tempo real com base nos seus dados reais ({formatMonthShort(getCurrentMonthKey())}).
          </p>
        </div>

        <div className="grid grid-cols-2 gap-1 p-1 bg-slate-200/70 rounded-xl w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setTab('chat')}
            className={`min-h-[38px] inline-flex items-center justify-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
              tab === 'chat' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            Chat Inteligente
          </button>
          <button
            type="button"
            onClick={() => setTab('voice')}
            className={`min-h-[38px] inline-flex items-center justify-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
              tab === 'voice' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            <Mic className="w-3.5 h-3.5" />
            Voz ao Vivo
          </button>
        </div>
      </div>

      {/* Faixa de contexto conectado */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-center justify-between gap-2">
          <span className="text-xs text-slate-500">Reserva acumulada</span>
          <span className="text-sm font-bold font-mono tabular-nums text-slate-900">
            {formatBRL(quickSnapshot.totalSaved)}
          </span>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-center justify-between gap-2">
          <span className="text-xs text-slate-500">Itens fixos e parcelados</span>
          <span className="text-sm font-bold font-mono tabular-nums text-slate-900">
            {quickSnapshot.activeRecurring} fixos · {quickSnapshot.activeInstallments} parc.
          </span>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('horizonte')}
          className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-center justify-between gap-2 hover:bg-slate-50 transition-colors cursor-pointer text-left"
        >
          <span className="text-xs font-medium text-sky-700">Abrir Horizonte de Gastos</span>
          <Sparkles className="w-4 h-4 text-sky-600 shrink-0" />
        </button>
      </section>

      {tab === 'chat' ? (
        <section key="chat" className="duofin-tab-enter bg-white border border-slate-200 rounded-xl flex flex-col min-h-[500px] max-h-[68vh]">
          {/* Barra superior do Chat */}
          <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              {(
                [
                  { id: 'fast', label: 'Rápido' },
                  { id: 'deep', label: 'Profunda' },
                ] as Array<{ id: AiChatMode; label: string }>
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setMode(opt.id)}
                  className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                    mode === opt.id
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {aiMessages.length > 0 && (
              <button
                type="button"
                onClick={clearAiMessages}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:text-red-600 rounded-lg hover:bg-red-50 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Limpar conversa
              </button>
            )}
          </div>

          {/* Lista de mensagens */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
            {aiMessages.length === 0 ? (
              <div className="py-6 space-y-5">
                <div className="max-w-lg mx-auto text-center space-y-2">
                  <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center mx-auto">
                    <Bot className="w-5 h-5" />
                  </div>
                  <h2 className="text-base font-semibold text-slate-900">
                    Tire dúvidas diretas sobre sua renda e gastos
                  </h2>
                  <p className="text-xs text-slate-500">
                    Escolha <strong>Rápido</strong> para resposta curta ("tira X da renda e fica Y") ou <strong>Profunda</strong> para ver os detalhes dos próximos meses.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-w-2xl mx-auto">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => sendPrompt(s)}
                      className="p-3 text-left text-xs text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors cursor-pointer"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              aiMessages.map((msg) => {
                const isUser = msg.role === 'user';
                return (
                  <div key={msg.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[88%] sm:max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                        isUser
                          ? 'bg-slate-900 text-white rounded-br-sm'
                          : 'bg-slate-100 text-slate-900 rounded-bl-sm border border-slate-200/80'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3 mb-1">
                        <span className={`text-[11px] font-semibold ${isUser ? 'text-slate-300' : 'text-slate-500'}`}>
                          {isUser ? msg.createdByName : 'DuoFin IA'}
                        </span>
                      </div>
                      <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                    </div>
                  </div>
                );
              })
            )}

            {sending && (
              <div className="flex justify-start">
                <div className="bg-slate-100 border border-slate-200 rounded-2xl rounded-bl-sm px-4 py-3 text-xs text-slate-500">
                  Analisando seus números...
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {chatError && (
            <div className="mx-4 mb-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
              {chatError}
            </div>
          )}

          {/* Input de mensagem */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void sendPrompt(inputText);
            }}
            className="p-3 sm:p-4 border-t border-slate-100 flex items-center gap-2"
          >
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Pergunte sobre gastos, parcelamentos ou horizonte futuro..."
              className="flex-1 min-w-0 px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-slate-400"
            />
            <button
              type="submit"
              disabled={sending || !inputText.trim()}
              aria-label="Enviar mensagem"
              className="min-h-[42px] min-w-[42px] inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-slate-900 text-white text-sm font-semibold rounded-xl hover:bg-slate-800 disabled:opacity-50 cursor-pointer shrink-0"
            >
              <Send className="w-4 h-4" />
              <span className="hidden sm:inline">Enviar</span>
            </button>
          </form>
        </section>
      ) : (
        /* Modo Voz em Tempo Real (Gemini 3.8 Live) */
        <section key="voice" className="duofin-tab-enter bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-slate-700" />
                <h2 className="text-base font-semibold text-slate-900">Conversa por Voz em Tempo Real</h2>
              </div>
              <p className="text-xs text-slate-500">
                Fale naturalmente sobre o seu orçamento, compras futuras ou metas e receba resposta falada imediata.
              </p>
            </div>

            <div className="flex items-center gap-2">
              {voiceState === 'active' && (
                <button
                  type="button"
                  onClick={() => setIsMuted((m) => !m)}
                  className={`min-h-[42px] inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg border cursor-pointer ${
                    isMuted
                      ? 'bg-amber-50 border-amber-200 text-amber-800'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  {isMuted ? 'Microfone mudo' : 'Silenciar'}
                </button>
              )}

              {voiceState === 'idle' || voiceState === 'error' ? (
                <button
                  type="button"
                  onClick={startVoiceSession}
                  className="min-h-[42px] inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 cursor-pointer"
                >
                  <Mic className="w-4 h-4" />
                  Iniciar conversa por voz
                </button>
              ) : (
                <button
                  type="button"
                  onClick={stopVoiceSession}
                  className="min-h-[42px] inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-xs font-semibold rounded-lg hover:bg-red-700 cursor-pointer"
                >
                  <PhoneOff className="w-4 h-4" />
                  Encerrar chamada
                </button>
              )}
            </div>
          </div>

          {voiceError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
              {voiceError}
            </div>
          )}

          {/* Medidor visual real do microfone e estado da conexão */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 flex flex-col items-center justify-center gap-3 text-center">
            <div
              className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-colors ${
                voiceState === 'active'
                  ? 'bg-slate-900 text-white'
                  : voiceState === 'connecting'
                  ? 'bg-sky-100 text-sky-800'
                  : 'bg-white border border-slate-200 text-slate-500'
              }`}
            >
              {voiceState === 'active' && !isMuted ? <Mic className="w-6 h-6" /> : <Volume2 className="w-6 h-6" />}
            </div>
            <p className="text-sm font-semibold text-slate-900">
              {voiceState === 'idle'
                ? 'Sessão encerrada'
                : voiceState === 'connecting'
                ? 'Conectando canal de voz em tempo real...'
                : voiceState === 'error'
                ? 'Falha na conexão de voz'
                : isMuted
                ? 'Conectado (microfone mutado)'
                : 'Ouvindo — pode falar naturalmente'}
            </p>
            <div className="w-full max-w-xs h-2 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-slate-900 transition-all duration-75"
                style={{ width: `${Math.round(micLevel * 100)}%` }}
              />
            </div>
          </div>

          {/* Transcrição ao vivo */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-slate-700">Transcrição da conversa</h3>
              {voiceTurns.length > 0 && (
                <button
                  type="button"
                  onClick={() => setVoiceTurns([])}
                  className="text-xs text-slate-500 hover:text-slate-900 cursor-pointer"
                >
                  Limpar transcrição
                </button>
              )}
            </div>

            {voiceTurns.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center border border-dashed border-slate-200 rounded-xl">
                As falas e respostas em áudio aparecerão transcritas aqui durante a sessão.
              </p>
            ) : (
              <div className="max-h-64 overflow-y-auto space-y-2.5 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                {voiceTurns.map((t) => (
                  <div key={t.id} className="text-xs leading-relaxed">
                    <span className="font-semibold text-slate-900">
                      {t.speaker === 'você' ? 'Você: ' : 'DuoFin Voz: '}
                    </span>
                    <span className="text-slate-700">{t.text}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
