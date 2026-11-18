import { useState } from 'react';
import { Download, PlusSquare, Share, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { ModalPortal } from './ModalPortal';

interface PWAInstallButtonProps {
  variant?: 'header' | 'card' | 'sidebar';
  showFallbackInfo?: boolean;
}

export function PWAInstallButton({
  variant = 'header',
  showFallbackInfo = false,
}: PWAInstallButtonProps) {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showInstructions, setShowInstructions] = useState(false);

  if (isInstalled) {
    if (variant === 'card') {
      return (
        <div className="inline-flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-xs font-medium text-emerald-800">
          <Smartphone className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>Aplicativo já está instalado neste dispositivo</span>
        </div>
      );
    }
    return null;
  }

  const canTriggerDirectly = isInstallable || isIOS || showFallbackInfo;
  if (!canTriggerDirectly) return null;

  const handleClick = async () => {
    if (isInstallable) {
      await install();
    } else {
      setShowInstructions(true);
    }
  };

  const buttonClass =
    variant === 'sidebar'
      ? 'w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer whitespace-nowrap'
      : variant === 'card'
        ? 'inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap'
        : 'inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0';

  const label = isInstallable
    ? 'Instalar app'
    : isIOS
      ? 'Instalar no iPhone'
      : 'Como instalar';

  return (
    <>
      <button type="button" onClick={handleClick} className={buttonClass}>
        <Download className="w-3.5 h-3.5 shrink-0" />
        <span>{label}</span>
      </button>

      {showInstructions && (
        <ModalPortal>
          <div
            className="duofin-backdrop-enter fixed inset-0 z-50 flex items-start justify-center bg-slate-900/50 pt-4 px-3 pb-6 sm:pt-8 sm:px-4 overflow-y-auto"
            onClick={() => setShowInstructions(false)}
          >
            <div
              className="duofin-dialog-enter w-full max-w-md rounded-2xl bg-white border border-slate-200 p-6 space-y-4 shadow-xl max-h-[88dvh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {isIOS ? 'Instalar DuoFin no iPhone / iPad' : 'Instalar DuoFin no celular'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Adicione o DuoFin à tela inicial para abrir em tela cheia como aplicativo.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowInstructions(false)}
                aria-label="Fechar instruções"
                className="p-1.5 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isIOS ? (
              <ol className="space-y-3 text-sm text-slate-700">
                <li className="flex items-start gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-900 text-xs font-semibold text-white">
                    1
                  </span>
                  <span>
                    Abra este endereço diretamente no <strong>Safari</strong> (fora de outros aplicativos).
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-900 text-xs font-semibold text-white">
                    2
                  </span>
                  <span>
                    Toque no botão <Share className="inline w-4 h-4 text-slate-900 mx-0.5" />{' '}
                    <strong>Compartilhar</strong> na barra inferior do Safari.
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-900 text-xs font-semibold text-white">
                    3
                  </span>
                  <span>
                    Role para baixo e toque em{' '}
                    <PlusSquare className="inline w-4 h-4 text-slate-900 mx-0.5" />{' '}
                    <strong>Adicionar à Tela de Início</strong> e confirme em <strong>Adicionar</strong>.
                  </span>
                </li>
              </ol>
            ) : (
              <div className="space-y-3 text-sm text-slate-700">
                <p className="text-xs text-slate-600 leading-relaxed">
                  Se o botão de instalação automática ainda não apareceu (por exemplo, dentro de uma pré-visualização ou navegador integrado):
                </p>
                <ol className="space-y-2.5 text-xs text-slate-700">
                  <li className="flex items-start gap-2.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-slate-900 text-[11px] font-semibold text-white">
                      1
                    </span>
                    <span>
                      Abra a <strong>URL compartilhada do aplicativo</strong> diretamente no <strong>Google Chrome</strong> (Android/Desktop) ou <strong>Safari</strong> (iPhone).
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-slate-900 text-[11px] font-semibold text-white">
                      2
                    </span>
                    <span>
                      No Android (Chrome), toque no menu <strong>⋮</strong> e escolha{' '}
                      <strong>Instalar aplicativo</strong> ou <strong>Adicionar à tela inicial</strong>.
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-slate-900 text-[11px] font-semibold text-white">
                      3
                    </span>
                    <span>
                      No iPhone (Safari), toque em <strong>Compartilhar</strong> e depois em{' '}
                      <strong>Adicionar à Tela de Início</strong>.
                    </span>
                  </li>
                </ol>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowInstructions(false)}
              className="w-full min-h-[42px] rounded-lg bg-slate-900 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 transition-colors cursor-pointer"
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
