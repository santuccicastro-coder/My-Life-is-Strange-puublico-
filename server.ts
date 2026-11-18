import 'dotenv/config';
import { GoogleGenAI, LiveServerMessage, Modality, ThinkingLevel } from '@google/genai';
import express from 'express';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

interface ExportRow {
  date?: string;
  type?: string;
  category?: string;
  description?: string;
  person?: string;
  paymentMethod?: string;
  accountOrCard?: string;
  plannedAmount?: number;
  actualAmount?: number;
  status?: string;
  createdByName?: string;
  notes?: string;
}

interface ChatTurnInput {
  role: 'user' | 'model';
  text: string;
}

function getGenAIClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Chave de API Gemini não configurada no servidor.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function buildFinancialSystemInstruction(
  contextSummary?: string,
  mode: 'fast' | 'deep' = 'fast'
): string {
  const modeRule =
    mode === 'deep'
      ? 'Modo Profunda: explique passo a passo com palavras simples o que acontece mês a mês na renda, faturas e metas, e dê ideias práticas do que ajustar para sobrar dinheiro.'
      : 'Modo Rápido: responda em no máximo 2 a 4 frases curtas, indo direto ao número final de quanto tira e quanto fica.';

  const base = [
    'Você é o Assistente Financeiro do DuoFin.',
    'Comunique-se sempre em português brasileiro com uma linguagem bem básica, simples e do dia a dia — nunca use termos técnicos difíceis de economia ou contabilidade.',
    'Use exclusivamente os números reais do contexto abaixo em Reais (R$) e nunca invente valores.',
    'Sempre que o usuário perguntar sobre uma compra, gasto, parcela ou mudança, faça a conta direta e mostre exatamente no estilo: "Se fizer isso vai tirar R$ X da sua renda e fica R$ Y livre" (ou "vai faltar R$ Y" se ficar negativo).',
    modeRule,
  ].join(' ');

  if (!contextSummary || !contextSummary.trim()) {
    return base;
  }
  return `${base}\n\n[DADOS ATUAIS]\n${contextSummary.trim()}`;
}

function escapeCsvCell(value: string | number | undefined | null): string {
  const str = String(value ?? '');
  if (str.includes(';') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function formatNumberBR(num: number | undefined | null): string {
  const n = Number(num ?? 0);
  if (!Number.isFinite(n)) return '0,00';
  return n.toFixed(2).replace('.', ',');
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'duofin-api', timestamp: new Date().toISOString() });
  });

  app.post('/api/export-csv', (req, res) => {
    const rows = Array.isArray(req.body?.rows) ? (req.body.rows as ExportRow[]) : [];
    const header = [
      'Data',
      'Tipo',
      'Categoria',
      'Descrição',
      'Responsável',
      'Forma de pagamento',
      'Conta / Cartão',
      'Valor previsto (R$)',
      'Valor realizado (R$)',
      'Status',
      'Lançado por',
      'Observações',
    ];

    const lines = [
      header.map(escapeCsvCell).join(';'),
      ...rows.map((r) =>
        [
          r.date,
          r.type,
          r.category,
          r.description,
          r.person,
          r.paymentMethod,
          r.accountOrCard,
          formatNumberBR(r.plannedAmount),
          formatNumberBR(r.actualAmount),
          r.status,
          r.createdByName,
          r.notes,
        ]
          .map(escapeCsvCell)
          .join(';')
      ),
    ];

    const csvContent = '\uFEFF' + lines.join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="lancamentos-casal.csv"');
    res.send(csvContent);
  });

  app.post('/api/ai/chat', async (req, res) => {
    try {
      const rawMessages = Array.isArray(req.body?.messages) ? (req.body.messages as ChatTurnInput[]) : [];
      const mode: 'fast' | 'deep' = req.body?.mode === 'deep' ? 'deep' : 'fast';
      const contextSummary = typeof req.body?.contextSummary === 'string' ? req.body.contextSummary : '';

      const validMessages = rawMessages
        .filter((m) => m && (m.role === 'user' || m.role === 'model') && typeof m.text === 'string' && m.text.trim())
        .slice(-24);

      if (validMessages.length === 0) {
        return res.status(400).json({ error: 'Envie ao menos uma mensagem para conversar com o assistente.' });
      }

      const ai = getGenAIClient();
      const primaryModel = mode === 'fast' ? 'gemini-3.1-flash-lite' : 'gemini-4-hydrogen';
      const formattedContents = validMessages.map((m) => ({
        role: m.role,
        parts: [{ text: m.text.trim() }],
      }));
      const systemInstruction = buildFinancialSystemInstruction(contextSummary, mode);

      let modelUsed = primaryModel;
      let response;
      try {
        response = await ai.models.generateContent({
          model: primaryModel,
          contents: formattedContents,
          config: {
            systemInstruction,
            ...(mode === 'deep'
              ? {
                  thinkingConfig: {
                    thinkingLevel: ThinkingLevel.HIGH,
                  },
                }
              : {}),
          },
        });
      } catch (primaryErr) {
        const msg = primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
        const isTransient = msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('429');
        if (primaryModel !== 'gemini-3.1-flash-lite' && isTransient) {
          modelUsed = 'gemini-3.1-flash-lite';
          response = await ai.models.generateContent({
            model: modelUsed,
            contents: formattedContents,
            config: { systemInstruction },
          });
        } else {
          throw primaryErr;
        }
      }

      const reply = response.text?.trim() || 'Não consegui formular uma resposta agora. Tente reformular sua pergunta.';
      return res.json({ reply, modelUsed, mode });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao consultar o assistente IA.';
      console.error('[AI Chat Error]:', message);
      return res.status(500).json({ error: message });
    }
  });

  app.post('/api/ai/horizon-insight', async (req, res) => {
    try {
      const horizonSummary = typeof req.body?.horizonSummary === 'string' ? req.body.horizonSummary : '';
      const contextSummary = typeof req.body?.contextSummary === 'string' ? req.body.contextSummary : '';
      if (!horizonSummary.trim()) {
        return res.status(400).json({ error: 'Resumo do horizonte ausente.' });
      }

      const ai = getGenAIClient();
      const modelUsed = 'gemini-4-hydrogen';
      const response = await ai.models.generateContent({
        model: modelUsed,
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `Explique com palavras bem simples este cenário de gastos do usuário em até 4 pontos curtos (quanto tira da renda por mês, quanto ainda sobra ou falta, quando as parcelas acabam e uma dica prática):\n\n${horizonSummary}`,
              },
            ],
          },
        ],
        config: {
          systemInstruction: buildFinancialSystemInstruction(contextSummary, 'deep'),
        },
      });

      const insight = response.text?.trim() || 'Não foi possível gerar a análise do horizonte.';
      return res.json({ insight, modelUsed });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao analisar horizonte com IA.';
      console.error('[AI Horizon Insight Error]:', message);
      return res.status(500).json({ error: message });
    }
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
        ws: { server, path: '/__vite_hmr' },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  server.on('upgrade', (request, socket, head) => {
    const urlPath = request.url ? request.url.split('?')[0] : '';
    if (urlPath === '/api/ai/live') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });

  wss.on('connection', (clientWs: WebSocket) => {
    let liveSession: Awaited<ReturnType<GoogleGenAI['live']['connect']>> | null = null;
    let isClosed = false;
    let connecting = false;

    const sendSafe = (payload: unknown) => {
      if (!isClosed && clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify(payload));
      }
    };

    const startLiveSession = async (contextSummary = '') => {
      if (connecting || liveSession || isClosed) return;
      connecting = true;
      try {
        const ai = getGenAIClient();
        liveSession = await ai.live.connect({
          model: 'gemini-3.8-live',
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
            },
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            systemInstruction:
              buildFinancialSystemInstruction(contextSummary, 'fast') +
              ' Como é uma conversa falada ao vivo, responda com 2 ou 3 frases bem simples e diretas dizendo quanto tira da renda e quanto fica.',
          },
          callbacks: {
            onmessage: (message: LiveServerMessage) => {
              const content = message.serverContent;
              if (content?.inputTranscription?.text) {
                sendSafe({ inputTranscript: content.inputTranscription.text });
              }
              if (content?.outputTranscription?.text) {
                sendSafe({ outputTranscript: content.outputTranscription.text });
              }
              for (const part of content?.modelTurn?.parts ?? []) {
                if (part.inlineData?.data) {
                  sendSafe({ audio: part.inlineData.data });
                }
              }
              if (content?.interrupted) {
                sendSafe({ interrupted: true });
              }
              if (content?.turnComplete) {
                sendSafe({ turnComplete: true });
              }
            },
            onerror: (err) => {
              console.error('[Gemini Live Session Error]:', err);
              sendSafe({ error: 'Falha na sessão de voz em tempo real.' });
            },
            onclose: () => {
              sendSafe({ status: 'closed' });
            },
          },
        });
        sendSafe({ status: 'ready' });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Não foi possível iniciar a conversa por voz.';
        console.error('[Gemini Live Connect Error]:', msg);
        sendSafe({ error: msg });
      } finally {
        connecting = false;
      }
    };

    clientWs.on('message', async (rawData) => {
      try {
        const parsed = JSON.parse(rawData.toString()) as {
          type?: string;
          contextSummary?: string;
          audio?: string;
          text?: string;
        };

        if (parsed.type === 'init') {
          await startLiveSession(parsed.contextSummary || '');
          return;
        }

        if (!liveSession && !connecting) {
          await startLiveSession(parsed.contextSummary || '');
        }

        if (liveSession && parsed.audio) {
          liveSession.sendRealtimeInput({
            audio: { data: parsed.audio, mimeType: 'audio/pcm;rate=16000' },
          });
        } else if (liveSession && parsed.text) {
          liveSession.sendRealtimeInput({
            text: parsed.text,
          });
        }
      } catch (err) {
        console.error('[Live WS Message Error]:', err);
      }
    });

    clientWs.on('close', () => {
      isClosed = true;
      try {
        liveSession?.close();
      } catch {
        // ignore close cleanup errors
      }
      liveSession = null;
    });
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`DuoFin server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
