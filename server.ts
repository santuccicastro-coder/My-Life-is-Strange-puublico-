import 'dotenv/config';
import { GoogleGenAI, LiveServerMessage, Modality, ThinkingLevel } from '@google/genai';
import express, { NextFunction, Request, Response } from 'express';
import { getApp, getApps, initializeApp } from 'firebase-admin/app';
import { DecodedIdToken, getAuth } from 'firebase-admin/auth';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

const MAX_CONTEXT_SUMMARY_CHARS = 16000;
const MAX_HORIZON_SUMMARY_CHARS = 8000;
const MAX_CHAT_MESSAGE_CHARS = 4000;
const MAX_CHAT_MESSAGES = 24;
const MAX_EXPORT_ROWS = 5000;
const MAX_WS_PAYLOAD_BYTES = 256 * 1024;
const MAX_WS_CONCURRENT_PER_USER = 2;
const MAX_WS_SESSION_MS = 5 * 60 * 1000;
const WS_AUTH_TIMEOUT_MS = 5000;

interface FirebaseAppletConfig {
  projectId?: string;
}

function resolveFirebaseProjectId(): string | undefined {
  const envId = process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
  if (envId && envId.trim()) return envId.trim();

  const configPath = path.resolve(__dirname, 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(configPath, 'utf8')) as FirebaseAppletConfig;
      if (raw.projectId && raw.projectId !== 'remixed-project-id') {
        return raw.projectId;
      }
    } catch {
      // ignore invalid config read here; verification will reject tokens if unconfigured
    }
  }
  return undefined;
}

const FIREBASE_PROJECT_ID = resolveFirebaseProjectId();
const adminApp = getApps().length
  ? getApp()
  : initializeApp(FIREBASE_PROJECT_ID ? { projectId: FIREBASE_PROJECT_ID } : undefined);

interface VerifiedCaller {
  uid: string;
  email: string;
  provider: string;
}

async function verifyFirebaseIdToken(token: string | undefined | null): Promise<VerifiedCaller> {
  const clean = typeof token === 'string' ? token.trim() : '';
  if (!clean || clean.length > 8192) {
    throw Object.assign(new Error('Token de autenticação ausente ou inválido.'), { statusCode: 401 });
  }
  let decoded: DecodedIdToken;
  try {
    decoded = await getAuth(adminApp).verifyIdToken(clean);
  } catch {
    throw Object.assign(new Error('Sessão Firebase expirada ou inválida. Faça login novamente.'), {
      statusCode: 401,
    });
  }
  const provider = decoded.firebase?.sign_in_provider ?? 'unknown';
  if (provider === 'anonymous') {
    throw Object.assign(new Error('Acesso anônimo não permitido para este recurso.'), {
      statusCode: 403,
    });
  }
  return {
    uid: decoded.uid,
    email: decoded.email ?? '',
    provider,
  };
}

interface AuthenticatedRequest extends Request {
  caller?: VerifiedCaller;
}

const rateBuckets = new Map<string, number[]>();

function checkRateLimit(bucketKey: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const cutoff = now - windowMs;
  const prev = rateBuckets.get(bucketKey) ?? [];
  const active = prev.filter((ts) => ts > cutoff);
  if (active.length >= maxRequests) {
    rateBuckets.set(bucketKey, active);
    return false;
  }
  active.push(now);
  rateBuckets.set(bucketKey, active);
  if (rateBuckets.size > 5000) {
    for (const [key, timestamps] of rateBuckets.entries()) {
      if (timestamps.length === 0 || timestamps[timestamps.length - 1] <= cutoff) {
        rateBuckets.delete(key);
      }
    }
  }
  return true;
}

function getClientIp(req: http.IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || 'unknown';
}

function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || typeof header !== 'string') return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

function createAuthAndRateLimitMiddleware(scope: string, maxRequests: number, windowMs: number) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const ip = getClientIp(req);
      if (!checkRateLimit(`ip:${scope}:${ip}`, maxRequests * 3, windowMs)) {
        return res.status(429).json({ error: 'Muitas requisições deste endereço. Aguarde alguns instantes.' });
      }
      const token = extractBearerToken(req);
      const caller = await verifyFirebaseIdToken(token);
      if (!checkRateLimit(`uid:${scope}:${caller.uid}`, maxRequests, windowMs)) {
        return res.status(429).json({ error: 'Limite de requisições atingido para sua conta. Tente novamente em 1 minuto.' });
      }
      req.caller = caller;
      return next();
    } catch (err) {
      const status =
        typeof err === 'object' && err !== null && 'statusCode' in err
          ? Number((err as { statusCode?: number }).statusCode) || 401
          : 401;
      const msg = err instanceof Error ? err.message : 'Não autorizado.';
      return res.status(status).json({ error: msg });
    }
  };
}

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

  const boundedContext =
    typeof contextSummary === 'string' ? contextSummary.trim().slice(0, MAX_CONTEXT_SUMMARY_CHARS) : '';
  if (!boundedContext) {
    return base;
  }
  return `${base}\n\n[DADOS ATUAIS]\n${boundedContext}`;
}

export function sanitizeCsvFormulaPrefix(raw: string): string {
  if (!raw) return '';
  if (/^[=+\t\r@]/.test(raw) || (/^-/.test(raw) && !/^-\d+(,\d+)?$/.test(raw))) {
    return `'${raw}`;
  }
  return raw;
}

export function escapeCsvCell(value: string | number | undefined | null): string {
  const raw = String(value ?? '').slice(0, 500);
  const safe = sanitizeCsvFormulaPrefix(raw);
  if (safe.includes(';') || safe.includes('"') || safe.includes('\n') || safe.includes('\r')) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

function formatNumberBR(num: number | undefined | null): string {
  const n = Number(num ?? 0);
  if (!Number.isFinite(n)) return '0,00';
  return n.toFixed(2).replace('.', ',');
}

interface CachedIndicators {
  cdiAnnualPct: number;
  selicAnnualPct: number;
  poupancaAnnualPct: number;
  trAnnualPct: number;
  updatedAt: string;
  source: 'bcb' | 'fallback';
  expiresAtMs: number;
}

const FALLBACK_INDICATORS = {
  cdiAnnualPct: 11.15,
  selicAnnualPct: 11.25,
  trAnnualPct: 0.85,
  poupancaAnnualPct: Number((((Math.pow(1.005, 12) - 1) * 100) + 0.85).toFixed(2)),
  updatedAt: '2026-11-01T12:00:00.000Z',
  source: 'fallback' as const,
};

let cachedIndicators: CachedIndicators | null = null;

async function fetchBcbSeriesLatest(seriesCode: number): Promise<number | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    const res = await fetch(
      `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${seriesCode}/dados/ultimos/1?formato=json`,
      {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{ data?: string; valor?: string }>;
    const raw = data?.[0]?.valor;
    if (typeof raw !== 'string') return null;
    const parsed = Number(raw.replace(',', '.'));
    return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100 ? parsed : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function getLatestBenchmarkIndicators() {
  const nowMs = Date.now();
  if (cachedIndicators && cachedIndicators.expiresAtMs > nowMs) {
    return {
      cdiAnnualPct: cachedIndicators.cdiAnnualPct,
      selicAnnualPct: cachedIndicators.selicAnnualPct,
      poupancaAnnualPct: cachedIndicators.poupancaAnnualPct,
      trAnnualPct: cachedIndicators.trAnnualPct,
      updatedAt: cachedIndicators.updatedAt,
      source: cachedIndicators.source,
    };
  }

  const [selicRaw, cdiRaw, trMonthlyRaw] = await Promise.all([
    fetchBcbSeriesLatest(432),
    fetchBcbSeriesLatest(4389),
    fetchBcbSeriesLatest(226),
  ]);

  if (selicRaw !== null || cdiRaw !== null) {
    const selicAnnualPct = selicRaw ?? (cdiRaw !== null ? Number((cdiRaw + 0.1).toFixed(2)) : FALLBACK_INDICATORS.selicAnnualPct);
    const cdiAnnualPct = cdiRaw ?? Number(Math.max(0, selicAnnualPct - 0.1).toFixed(2));
    const trMonthlyPct = trMonthlyRaw !== null && trMonthlyRaw < 2 ? trMonthlyRaw : 0.07;
    const trAnnualPct = Number((((Math.pow(1 + trMonthlyPct / 100, 12) - 1) * 100)).toFixed(2));
    const poupancaAnnualPct = Number(
      (
        (selicAnnualPct > 8.5
          ? ((Math.pow(1.005, 12) - 1) * 100) + trAnnualPct
          : selicAnnualPct * 0.7 + trAnnualPct)
      ).toFixed(2)
    );
    const result: CachedIndicators = {
      cdiAnnualPct: Number(cdiAnnualPct.toFixed(2)),
      selicAnnualPct: Number(selicAnnualPct.toFixed(2)),
      poupancaAnnualPct,
      trAnnualPct,
      updatedAt: new Date().toISOString(),
      source: 'bcb',
      expiresAtMs: nowMs + 6 * 60 * 60 * 1000,
    };
    cachedIndicators = result;
    return {
      cdiAnnualPct: result.cdiAnnualPct,
      selicAnnualPct: result.selicAnnualPct,
      poupancaAnnualPct: result.poupancaAnnualPct,
      trAnnualPct: result.trAnnualPct,
      updatedAt: result.updatedAt,
      source: result.source,
    };
  }

  return FALLBACK_INDICATORS;
}

async function startServer() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'duofin-api', timestamp: new Date().toISOString() });
  });

  app.get(
    '/api/indicators',
    createAuthAndRateLimitMiddleware('indicators', 30, 60_000),
    async (_req, res) => {
      const indicators = await getLatestBenchmarkIndicators();
      return res.json(indicators);
    }
  );

  app.post(
    '/api/export-csv',
    createAuthAndRateLimitMiddleware('export-csv', 30, 60_000),
    (req, res) => {
      if (!Array.isArray(req.body?.rows)) {
        return res.status(400).json({ error: 'Lista de lançamentos inválida.' });
      }
      if (req.body.rows.length > MAX_EXPORT_ROWS) {
        return res.status(400).json({
          error: `Limite máximo de ${MAX_EXPORT_ROWS} linhas por exportação excedido.`,
        });
      }

      const rows = req.body.rows as ExportRow[];
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
            typeof r?.date === 'string' ? r.date : '',
            typeof r?.type === 'string' ? r.type : '',
            typeof r?.category === 'string' ? r.category : '',
            typeof r?.description === 'string' ? r.description : '',
            typeof r?.person === 'string' ? r.person : '',
            typeof r?.paymentMethod === 'string' ? r.paymentMethod : '',
            typeof r?.accountOrCard === 'string' ? r.accountOrCard : '',
            formatNumberBR(r?.plannedAmount),
            formatNumberBR(r?.actualAmount),
            typeof r?.status === 'string' ? r.status : '',
            typeof r?.createdByName === 'string' ? r.createdByName : '',
            typeof r?.notes === 'string' ? r.notes : '',
          ]
            .map(escapeCsvCell)
            .join(';')
        ),
      ];

      const csvContent = '\uFEFF' + lines.join('\r\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="lancamentos-duofin.csv"');
      return res.send(csvContent);
    }
  );

  app.post(
    '/api/ai/chat',
    createAuthAndRateLimitMiddleware('ai-chat', 20, 60_000),
    async (req, res) => {
      try {
        if (!Array.isArray(req.body?.messages)) {
          return res.status(400).json({ error: 'Formato de mensagens inválido.' });
        }
        const rawMessages = req.body.messages as ChatTurnInput[];
        const mode: 'fast' | 'deep' = req.body?.mode === 'deep' ? 'deep' : 'fast';
        const contextSummary =
          typeof req.body?.contextSummary === 'string'
            ? req.body.contextSummary.slice(0, MAX_CONTEXT_SUMMARY_CHARS)
            : '';

        const validMessages = rawMessages
          .filter(
            (m) =>
              m &&
              (m.role === 'user' || m.role === 'model') &&
              typeof m.text === 'string' &&
              m.text.trim().length > 0
          )
          .slice(-MAX_CHAT_MESSAGES)
          .map((m) => ({
            role: m.role,
            text: m.text.trim().slice(0, MAX_CHAT_MESSAGE_CHARS),
          }));

        if (validMessages.length === 0) {
          return res
            .status(400)
            .json({ error: 'Envie ao menos uma mensagem para conversar com o assistente.' });
        }

        const ai = getGenAIClient();
        const primaryModel = mode === 'fast' ? 'gemini-3.1-flash-lite' : 'gemini-4-hydrogen';
        const formattedContents = validMessages.map((m) => ({
          role: m.role,
          parts: [{ text: m.text }],
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

        const reply =
          response.text?.trim() ||
          'Não consegui formular uma resposta agora. Tente reformular sua pergunta.';
        return res.json({ reply, modelUsed, mode });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro ao consultar o assistente IA.';
        console.error('[AI Chat Error]:', message);
        return res.status(500).json({ error: message });
      }
    }
  );

  app.post(
    '/api/ai/horizon-insight',
    createAuthAndRateLimitMiddleware('ai-horizon', 15, 60_000),
    async (req, res) => {
      try {
        const horizonSummary =
          typeof req.body?.horizonSummary === 'string'
            ? req.body.horizonSummary.trim().slice(0, MAX_HORIZON_SUMMARY_CHARS)
            : '';
        const contextSummary =
          typeof req.body?.contextSummary === 'string'
            ? req.body.contextSummary.slice(0, MAX_CONTEXT_SUMMARY_CHARS)
            : '';
        if (!horizonSummary) {
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
    }
  );

  const server = http.createServer(app);
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_WS_PAYLOAD_BYTES,
  });

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

  const activeWsByUid = new Map<string, number>();

  server.on('upgrade', async (request, socket, head) => {
    const rawUrl = request.url || '';
    const urlPath = rawUrl.split('?')[0];
    if (urlPath !== '/api/ai/live') {
      return;
    }

    const ip = getClientIp(request);
    if (!checkRateLimit(`ws:ip:${ip}`, 20, 60_000)) {
      socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n');
      socket.destroy();
      return;
    }

    let upgradeCaller: VerifiedCaller | null = null;
    try {
      const parsedUrl = new URL(rawUrl, 'http://localhost');
      const queryToken = parsedUrl.searchParams.get('token');
      const authHeader = request.headers.authorization;
      const bearerToken =
        typeof authHeader === 'string' ? authHeader.match(/^Bearer\s+(.+)$/i)?.[1] ?? null : null;
      const candidateToken = queryToken || bearerToken;
      if (candidateToken) {
        upgradeCaller = await verifyFirebaseIdToken(candidateToken);
      }
    } catch {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request, upgradeCaller);
    });
  });

  wss.on(
    'connection',
    (clientWs: WebSocket, request: http.IncomingMessage, preVerifiedCaller?: VerifiedCaller | null) => {
      let liveSession: Awaited<ReturnType<GoogleGenAI['live']['connect']>> | null = null;
      let verifiedCaller: VerifiedCaller | null = preVerifiedCaller ?? null;
      let sessionSlotAcquired = false;
      let isClosed = false;
      let connecting = false;

      const sendSafe = (payload: unknown) => {
        if (!isClosed && clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(JSON.stringify(payload));
        }
      };

      const releaseSessionSlot = () => {
        if (sessionSlotAcquired && verifiedCaller) {
          const current = activeWsByUid.get(verifiedCaller.uid) ?? 0;
          if (current <= 1) {
            activeWsByUid.delete(verifiedCaller.uid);
          } else {
            activeWsByUid.set(verifiedCaller.uid, current - 1);
          }
          sessionSlotAcquired = false;
        }
      };

      const acquireSessionSlot = (caller: VerifiedCaller): boolean => {
        if (sessionSlotAcquired) return true;
        if (!checkRateLimit(`ws:uid:${caller.uid}`, 10, 60_000)) {
          sendSafe({ error: 'Limite de conexões de voz atingido. Aguarde 1 minuto.' });
          clientWs.close(4008, 'Rate limit exceeded');
          return false;
        }
        const current = activeWsByUid.get(caller.uid) ?? 0;
        if (current >= MAX_WS_CONCURRENT_PER_USER) {
          sendSafe({ error: 'Limite de sessões de voz simultâneas atingido.' });
          clientWs.close(4008, 'Concurrent session limit exceeded');
          return false;
        }
        activeWsByUid.set(caller.uid, current + 1);
        sessionSlotAcquired = true;
        return true;
      };

      if (verifiedCaller && !acquireSessionSlot(verifiedCaller)) {
        return;
      }

      const authTimer = verifiedCaller
        ? null
        : setTimeout(() => {
            if (!verifiedCaller && !isClosed) {
              sendSafe({ error: 'Autenticação Firebase obrigatória.' });
              clientWs.close(4001, 'Authentication timeout');
            }
          }, WS_AUTH_TIMEOUT_MS);

      const lifetimeTimer = setTimeout(() => {
        if (!isClosed) {
          sendSafe({ status: 'closed', error: 'Sessão de voz encerrada após o limite de 5 minutos.' });
          clientWs.close(1000, 'Session lifetime limit');
        }
      }, MAX_WS_SESSION_MS);

      const startLiveSession = async (contextSummary = '') => {
        if (connecting || liveSession || isClosed || !verifiedCaller) return;
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
          const rawText = rawData.toString();
          if (rawText.length > MAX_WS_PAYLOAD_BYTES) {
            sendSafe({ error: 'Mensagem excede o tamanho máximo permitido.' });
            return;
          }
          const parsed = JSON.parse(rawText) as {
            type?: string;
            token?: string;
            contextSummary?: string;
            audio?: string;
            text?: string;
          };

          if (!verifiedCaller) {
            if (parsed.type === 'init' && typeof parsed.token === 'string') {
              try {
                verifiedCaller = await verifyFirebaseIdToken(parsed.token);
                if (authTimer) clearTimeout(authTimer);
                if (!acquireSessionSlot(verifiedCaller)) {
                  return;
                }
              } catch (authErr) {
                const msg = authErr instanceof Error ? authErr.message : 'Autenticação inválida.';
                sendSafe({ error: msg });
                clientWs.close(4001, 'Unauthorized');
                return;
              }
            } else {
              sendSafe({ error: 'Autenticação Firebase obrigatória antes do envio.' });
              clientWs.close(4001, 'Unauthorized');
              return;
            }
          }

          if (parsed.type === 'init') {
            await startLiveSession(
              typeof parsed.contextSummary === 'string' ? parsed.contextSummary : ''
            );
            return;
          }

          if (!liveSession && !connecting) {
            await startLiveSession(
              typeof parsed.contextSummary === 'string' ? parsed.contextSummary : ''
            );
          }

          if (liveSession && typeof parsed.audio === 'string' && parsed.audio.length <= 196608) {
            liveSession.sendRealtimeInput({
              audio: { data: parsed.audio, mimeType: 'audio/pcm;rate=16000' },
            });
          } else if (liveSession && typeof parsed.text === 'string' && parsed.text.trim()) {
            liveSession.sendRealtimeInput({
              text: parsed.text.trim().slice(0, 2000),
            });
          }
        } catch (err) {
          console.error('[Live WS Message Error]:', err, 'from', getClientIp(request));
        }
      });

      const cleanup = () => {
        isClosed = true;
        if (authTimer) clearTimeout(authTimer);
        clearTimeout(lifetimeTimer);
        releaseSessionSlot();
        try {
          liveSession?.close();
        } catch {
          // ignore close cleanup errors
        }
        liveSession = null;
      };

      clientWs.on('close', cleanup);
      clientWs.on('error', cleanup);
    }
  );

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`DuoFin server running on http://0.0.0.0:${PORT}`);
  });
}

const isEntrypoint =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(__filename);

if (isEntrypoint) {
  startServer().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}
