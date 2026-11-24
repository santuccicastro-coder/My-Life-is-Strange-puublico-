import { useState } from 'react';
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  PlusSquare,
  RefreshCw,
  Share,
  Smartphone,
  X,
} from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { ModalPortal } from './ModalPortal';

interface PWAInstallButtonProps {
  variant?: 'header' | 'card' | 'sidebar';
  showFallbackInfo?: boolean;
}

function resolveInstallableAppUrl(): {
  installUrl: string;
  isDevPreviewOrigin: boolean;
  isAiStudioProxyOrigin: boolean;
} {
  if (typeof window === 'undefined') {
    return { installUrl: '', isDevPreviewOrigin: false, isAiStudioProxyOrigin: false };
  }
  const origin = window.location.origin;
  const isDevPreviewOrigin = /^https:\/\/ais-dev-/i.test(origin);
  const isAiStudioProxyOrigin = /^https:\/\/ais-(?:dev|pre)-/i.test(origin);
  const installUrl = isDevPreviewOrigin ? origin.replace(/^https:\/\/ais-dev-/i, 'https://ais-pre-') : origin;
  return { installUrl, isDevPreviewOrigin, isAiStudioProxyOrigin };
}

export function PWAInstallButton({
  variant = 'header',
  showFallbackInfo = false,
}: PWAInstallButtonProps) {
  const { isInstallable, isInstalled, isIOS, isInIframe, install, refreshPWA } = usePWAInstall();
  const [showInstructions, setShowInstructions] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [updating, setUpdating] = useState(false);

  const { installUrl, isDevPreviewOrigin, isAiStudioProxyOrigin } = resolveInstallableAppUrl();

  const handleCopyUrl = async () => {
    if (!installUrl) return;
    let copied = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(installUrl);
        copied = true;
      }
    } catch {
      copied = false;
    }
    if (!copied) {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = installUrl;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        copied = document.execCommand('copy');
        document.body.removeChild(textarea);
      } catch {
        copied = false;
      }
    }
    if (copied) {
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2200);
    }
  };

  const handleUpdateNow = async () => {
    setUpdating(true);
    await refreshPWA();
  };

  if (isInstalled) {
    if (variant === 'card') {
      return (
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-2 px-3 py-2 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-lg text-xs font-medium text-emerald-800 dark:text-emerald-300">
            <Smartphone className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>App instalado neste dispositivo</span>
          </div>
          <button
            type="button"
            disabled={updating}
            onClick={handleUpdateNow}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-900 dark:bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 dark:hover:bg-emerald-500 transition-colors cursor-pointer disabled:opacity-60 whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${updating ? 'animate-spin' : ''}`} />
            <span>{updating ? 'Atualizando...' : 'Atualizar app'}</span>
          </button>
        </div>
      );
    }
    return null;
  }

  const canTriggerDirectly = isInstallable || isIOS || showFallbackInfo;
  if (!canTriggerDirectly) return null;

  const handleClick = async () => {
    if (isInstallable) {
      const accepted = await install();
      if (!accepted) {
        setShowInstructions(true);
      }
    } else {
      setShowInstructions(true);
    }
  };

  const buttonClass =
    variant === 'sidebar'
      ? 'w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer whitespace-nowrap'
      : variant === 'card'
        ? 'inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors cursor-pointer whitespace-nowrap'
        : 'inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0';

  const label = isInstallable
    ? 'Instalar no celular (PWA)'
    : isIOS
      ? 'Instalar no iPhone / iPad'
      : variant === 'card'
        ? 'Instalar no celular (PWA)'
        : 'Instalar app';

  return (
    <>
      <button type="button" onClick={handleClick} className={buttonClass}>
        <Download className="w-4 h-4 shrink-0" />
        <span>{label}</span>
      </button>

      {showInstructions && (
        <ModalPortal>
          <div
            className="duofin-backdrop-enter fixed inset-0 z-50 flex items-start justify-center bg-slate-900/50 pt-4 px-3 pb-6 sm:pt-8 sm:px-4 overflow-y-auto"
            onClick={() => setShowInstructions(false)}
          >
            <div
              className="duofin-dialog-enter w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-xl max-h-[88dvh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    {isIOS ? 'Instalar DuoFin no iPhone / iPad' : 'Instalar DuoFin no Chrome (PWA)'}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Adicione o DuoFin à tela inicial ou à área de trabalho com uso offline.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowInstructions(false)}
                  aria-label="Fechar instruções"
                  className="p-1.5 text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {(isInIframe || isAiStudioProxyOrigin) && (
                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300 space-y-1.5">
                  <p className="font-semibold">
                    {isInIframe
                      ? 'Você está dentro da pré-visualização.'
                      : isDevPreviewOrigin
                        ? 'Você está no link de edição (ais-dev).'
                        : 'Link de prévia compartilhada (ais-pre).'}
                  </p>
                  <p>
                    {isDevPreviewOrigin
                      ? <>Para instalar no Chrome, abra o link <strong>ais-pre</strong> abaixo em uma aba normal. </>
                      : <>Para outras pessoas abrirem este link sem cair em erro 404 do AI Studio, </>}
                    Ative <strong>Compartilhar → Qualquer pessoa com o link</strong> no AI Studio ou publique via{' '}
                    <strong>Deploy (Cloud Run)</strong> para gerar um link público direto.
                  </p>
                </div>
              )}

              {installUrl && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                    <input
                      type="text"
                      readOnly
                      value={installUrl}
                      aria-label="Link instalável do DuoFin"
                      onFocus={(e) => e.currentTarget.select()}
                      className="flex-1 bg-transparent text-[11px] font-mono text-slate-700 dark:text-slate-200 outline-none truncate"
                    />
                    <button
                      type="button"
                      onClick={handleCopyUrl}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 dark:bg-emerald-600 text-white text-[11px] font-semibold hover:bg-slate-800 cursor-pointer shrink-0"
                    >
                      {copiedUrl ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedUrl ? 'Copiado!' : 'Copiar link'}
                    </button>
                  </div>

                  <a
                    href={installUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full min-h-[40px] inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Abrir link direto no navegador
                  </a>
                </div>
              )}

              {isIOS ? (
                <ol className="space-y-3 text-sm text-slate-700 dark:text-slate-300">
                  <li className="flex items-start gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-900 dark:bg-emerald-600 text-xs font-semibold text-white">
                      1
                    </span>
                    <span>
                      Abra este endereço diretamente no <strong>Safari</strong> (fora de outros aplicativos).
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-900 dark:bg-emerald-600 text-xs font-semibold text-white">
                      2
                    </span>
                    <span>
                      Toque no botão <Share className="inline w-4 h-4 text-slate-900 dark:text-white mx-0.5" />{' '}
                      <strong>Compartilhar</strong> na barra inferior do Safari.
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-900 dark:bg-emerald-600 text-xs font-semibold text-white">
                      3
                    </span>
                    <span>
                      Role para baixo e toque em{' '}
                      <PlusSquare className="inline w-4 h-4 text-slate-900 dark:text-white mx-0.5" />{' '}
                      <strong>Adicionar à Tela de Início</strong> e confirme em <strong>Adicionar</strong>.
                    </span>
                  </li>
                </ol>
              ) : (
                <div className="space-y-3 text-sm text-slate-700 dark:text-slate-300">
                  <ol className="space-y-2.5 text-xs text-slate-700 dark:text-slate-300">
                    <li className="flex items-start gap-2.5">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-slate-900 dark:bg-emerald-600 text-[11px] font-semibold text-white">
                        1
                      </span>
                      <span>
                        Abra o link do aplicativo diretamente no <strong>Google Chrome</strong> (Android/PC) ou{' '}
                        <strong>Safari</strong> (iPhone).
                      </span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-slate-900 dark:bg-emerald-600 text-[11px] font-semibold text-white">
                        2
                      </span>
                      <span>
                        No Android (Chrome), toque no menu <strong>⋮</strong> e escolha{' '}
                        <strong>Instalar aplicativo</strong> ou <strong>Adicionar à tela inicial</strong>.
                      </span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-slate-900 dark:bg-emerald-600 text-[11px] font-semibold text-white">
                        3
                      </span>
                      <span>
                        No iPhone/iPad (Safari), toque em <strong>Compartilhar</strong> e depois em{' '}
                        <strong>Adicionar à Tela de Início</strong>.
                      </span>
                    </li>
                  </ol>
                </div>
              )}

              <button
                type="button"
                onClick={() => setShowInstructions(false)}
                className="w-full min-h-[42px] rounded-lg bg-slate-900 dark:bg-slate-800 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              >
                Entendi
              </button>
            </div>
          </div>
        </ModalPortal>
      )}
    </>
  );
}
