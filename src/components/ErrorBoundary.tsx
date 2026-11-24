import React from 'react';
import { AlertTriangle, Home, RefreshCw, RotateCcw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  variant?: 'root' | 'page';
  resetKey?: string | number;
  onNavigateHome?: () => void;
}

interface State {
  hasError: boolean;
  message: string;
  isChunkError: boolean;
}

const CHUNK_RELOAD_GUARD_KEY = 'duofin_chunk_reload_ts';
const CHUNK_RELOAD_COOLDOWN_MS = 15_000;

export function isChunkOrModuleLoadError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? '');
  return (
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /Importing a module script failed/i.test(msg) ||
    /Loading chunk [\w-]+ failed/i.test(msg) ||
    /ChunkLoadError/i.test(msg) ||
    /Unable to preload CSS/i.test(msg)
  );
}

export function triggerGuardedChunkReload(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const rawLast = window.sessionStorage.getItem(CHUNK_RELOAD_GUARD_KEY);
    const lastTs = rawLast ? Number(rawLast) : 0;
    const now = Date.now();
    if (!Number.isFinite(lastTs) || now - lastTs > CHUNK_RELOAD_COOLDOWN_MS) {
      window.sessionStorage.setItem(CHUNK_RELOAD_GUARD_KEY, String(now));
      window.location.reload();
      return true;
    }
  } catch {
    // sessionStorage unavailable; skip auto-reload loop
  }
  return false;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, State> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, message: '', isChunkError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    const chunkError = isChunkOrModuleLoadError(error);
    let message = chunkError
      ? 'Uma atualização do aplicativo foi detectada enquanto a tela carregava.'
      : error?.message || 'Ocorreu um erro inesperado na aplicação.';

    if (!chunkError) {
      try {
        const parsed = JSON.parse(error.message);
        if (parsed && parsed.error) {
          if (
            String(parsed.error).includes('permission-denied') ||
            String(parsed.error).includes('insufficient permissions')
          ) {
            message =
              'Sem permissão para acessar ou modificar este registro. Verifique se você está autenticado com a sua conta.';
          } else {
            message = String(parsed.error);
          }
        }
      } catch {
        // plain error message
      }
    }

    return { hasError: true, message, isChunkError: chunkError };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught error:', error, info);
    if (isChunkOrModuleLoadError(error)) {
      triggerGuardedChunkReload();
    }
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, message: '', isChunkError: false });
    }
  }

  handleRecover = () => {
    this.setState({ hasError: false, message: '', isChunkError: false });
  };

  render() {
    if (this.state.hasError) {
      const isPage = this.props.variant === 'page';

      return (
        <div
          className={
            isPage
              ? 'py-8 flex items-center justify-center'
              : 'min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6'
          }
        >
          <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4 shadow-sm">
            <div className="flex items-center gap-3 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {this.state.isChunkError ? 'Atualizando visualização' : 'Esta tela precisou ser recuperada'}
              </h2>
            </div>

            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{this.state.message}</p>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={this.handleRecover}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 dark:bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 dark:hover:bg-emerald-500 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Tentar novamente
              </button>

              {isPage && this.props.onNavigateHome && (
                <button
                  type="button"
                  onClick={() => {
                    this.handleRecover();
                    this.props.onNavigateHome?.();
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-semibold rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                >
                  <Home className="w-3.5 h-3.5" />
                  Voltar ao Início
                </button>
              )}

              <button
                type="button"
                onClick={() => window.location.reload()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Recarregar aplicativo
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
