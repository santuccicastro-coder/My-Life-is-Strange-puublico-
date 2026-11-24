import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import { getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

const MAX_EXPORT_ROWS = 5000;

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

  const server = http.createServer(app);

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
      app.use(
        express.static(distDir, {
          setHeaders: (res, filePath) => {
            const base = path.basename(filePath);
            if (base === 'sw.js') {
              res.setHeader('Cache-Control', 'no-cache, max-age=0, must-revalidate');
              res.setHeader('Service-Worker-Allowed', '/');
            } else if (base === 'manifest.webmanifest') {
              res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
              res.setHeader('Cache-Control', 'no-cache, max-age=0, must-revalidate');
            } else if (base === 'index.html' || base === 'registerSW.js') {
              res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            }
          },
        })
      );
      app.get('*', (_req, res) => {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    const status =
      typeof err === 'object' && err !== null && 'statusCode' in err && typeof (err as { statusCode?: unknown }).statusCode === 'number'
        ? (err as { statusCode: number }).statusCode
        : typeof err === 'object' && err !== null && 'status' in err && typeof (err as { status?: unknown }).status === 'number'
          ? (err as { status: number }).status
          : 500;
    const message =
      err instanceof SyntaxError && status === 400
        ? 'Corpo da requisição inválido.'
        : err instanceof Error && status < 500
          ? err.message
          : 'Erro interno temporário. Tente novamente.';
    console.error(`[API Error] ${req.method} ${req.originalUrl}:`, err);
    if (res.headersSent) return;
    if (req.path.startsWith('/api/')) {
      res.status(status).json({ error: message });
      return;
    }
    res.status(status).send('Erro temporário ao processar solicitação.');
  });

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
  process.on('unhandledRejection', (reason) => {
    console.error('[Process unhandledRejection]:', reason);
  });
  process.on('uncaughtException', (err) => {
    console.error('[Process uncaughtException]:', err);
  });

  startServer().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}
