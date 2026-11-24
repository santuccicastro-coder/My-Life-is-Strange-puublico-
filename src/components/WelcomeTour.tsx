import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Circle,
  Landmark,
  Plus,
  X,
} from 'lucide-react';
import { useFinance } from '../context/AuthHouseholdContext';
import type { AppRoute } from '../types/finance';
import { ModalPortal } from './ModalPortal';

interface WelcomeTourProps {
  onNavigateToBankAccounts: () => void;
  onNavigate: (route: AppRoute) => void;
  onQuickAdd: () => void;
}

export function WelcomeTour({
  onNavigateToBankAccounts,
  onNavigate,
  onQuickAdd,
}: WelcomeTourProps) {
  const { household, dataLoading, transactions, bankAccounts, currentAuthorName } = useFinance();

  const hasTransactions = transactions.length > 0;
  const hasBankAccounts = bankAccounts.length > 0;
  const shouldShowTour = !dataLoading && Boolean(household) && !hasTransactions;

  const [modalOpen, setModalOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [completedToast, setCompletedToast] = useState(false);

  const prevTxCountRef = useRef<number | null>(null);
  const initializedForHouseholdRef = useRef<string | null>(null);

  const storageKey = household ? `duofin_tour_minimized_${household.id}` : null;

  // Abre automaticamente o guia passo a passo na primeira entrada enquanto não houver lançamentos
  useEffect(() => {
    if (!shouldShowTour || !household) return;
    if (initializedForHouseholdRef.current === household.id) return;
    initializedForHouseholdRef.current = household.id;

    let minimized = false;
    try {
      minimized = Boolean(storageKey && window.sessionStorage.getItem(storageKey) === '1');
    } catch {
      minimized = false;
    }

    setStep(hasBankAccounts ? 2 : 1);
    if (!minimized) {
      setModalOpen(true);
    }
  }, [shouldShowTour, household, hasBankAccounts, storageKey]);

  // Avança automaticamente para o passo 2 quando a primeira conta bancária for configurada
  useEffect(() => {
    if (shouldShowTour && hasBankAccounts) {
      setStep((curr) => (curr === 1 ? 2 : curr));
    }
  }, [shouldShowTour, hasBankAccounts]);

  // Detecta realização do primeiro lançamento para encerrar o tour com confirmação breve
  useEffect(() => {
    if (dataLoading || !household) return;
    const prev = prevTxCountRef.current;
    prevTxCountRef.current = transactions.length;

    if (prev === 0 && transactions.length > 0) {
      setModalOpen(false);
      try {
        if (storageKey) window.sessionStorage.removeItem(storageKey);
      } catch {
        // ignore storage restrictions
      }
      setCompletedToast(true);
      const timer = window.setTimeout(() => setCompletedToast(false), 4500);
      return () => window.clearTimeout(timer);
    }
  }, [dataLoading, household, transactions.length, storageKey]);

  const minimizeModal = () => {
    setModalOpen(false);
    try {
      if (storageKey) window.sessionStorage.setItem(storageKey, '1');
    } catch {
      // ignore storage restrictions
    }
  };

  const handleGoBankAccounts = () => {
    minimizeModal();
    onNavigateToBankAccounts();
  };

  const handleStartFirstTransaction = () => {
    minimizeModal();
    onQuickAdd();
  };

  if (completedToast) {
    return (
      <div className="mb-4 p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 flex items-center justify-between gap-3 duofin-expand-enter">
        <div className="flex items-center gap-2.5 min-w-0">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <div className="min-w-0">
            <p className="text-xs sm:text-sm font-semibold text-emerald-900 dark:text-emerald-200">
              Primeiro lançamento registrado! Tour de boas-vindas concluído.
            </p>
            <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
              Seus saldos e projeções já estão sendo atualizados automaticamente.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setCompletedToast(false)}
          aria-label="Fechar aviso"
          className="p-1 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 rounded-md cursor-pointer shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  if (!shouldShowTour) return null;

  return (
    <>
      {/* Barra persistente enquanto não houver o primeiro lançamento */}
      <div className="mb-5 bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800/80 rounded-xl p-3.5 sm:p-4 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <BookOpen className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Primeiros passos no DuoFin
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-semibold rounded-md bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300">
                  Aguardando 1º lançamento
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Configure suas contas bancárias e faça seu primeiro lançamento para liberar o painel completo.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer shrink-0 self-start sm:self-center"
          >
            <BookOpen className="w-3.5 h-3.5" />
            Abrir tour guiado
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={handleGoBankAccounts}
            className={`text-left p-2.5 rounded-lg border transition-colors cursor-pointer flex items-center justify-between gap-2.5 ${
              hasBankAccounts
                ? 'bg-emerald-50/70 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800'
                : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 hover:border-emerald-400'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              {hasBankAccounts ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              ) : (
                <Circle className="w-4 h-4 text-slate-400 shrink-0" />
              )}
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                  1. Configurar contas bancárias
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  {hasBankAccounts
                    ? `${bankAccounts.length} conta(s) configurada(s)`
                    : 'Informar saldo inicial das contas e carteiras'}
                </p>
              </div>
            </div>
            <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 shrink-0">
              {hasBankAccounts ? 'Editar' : 'Configurar →'}
            </span>
          </button>

          <button
            type="button"
            onClick={handleStartFirstTransaction}
            className="text-left p-2.5 rounded-lg border border-slate-900/15 dark:border-emerald-700 bg-slate-900 dark:bg-emerald-600 text-white hover:bg-slate-800 dark:hover:bg-emerald-500 transition-colors cursor-pointer flex items-center justify-between gap-2.5"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <Plus className="w-4 h-4 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-semibold truncate">2. Fazer o primeiro lançamento</p>
                <p className="text-[11px] text-slate-200 dark:text-emerald-100 truncate">
                  Registre uma entrada ou saída para concluir
                </p>
              </div>
            </div>
            <span className="text-[11px] font-semibold shrink-0">Lançar agora →</span>
          </button>
        </div>
      </div>

      {/* Modal interativo do tour guiado */}
      {modalOpen && (
        <ModalPortal>
          <div
            className="duofin-backdrop-enter fixed inset-0 z-50 flex items-start justify-center bg-slate-900/55 backdrop-blur-[2px] pt-4 px-3 pb-6 sm:pt-10 sm:px-4 overflow-y-auto"
            onClick={(e) => {
              if (e.target === e.currentTarget) minimizeModal();
            }}
          >
            <div className="duofin-dialog-enter w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-5 shadow-2xl max-h-[90dvh] overflow-y-auto">
              {/* Cabeçalho */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
                    <BookOpen className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                      Tour guiado de boas-vindas
                    </p>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                      Olá, {currentAuthorName}! Bem-vindo ao DuoFin
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Siga estes 2 passos rápidos. O guia ficará disponível até o seu primeiro lançamento.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={minimizeModal}
                  aria-label="Minimizar tour"
                  className="p-1.5 text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Indicador de passos */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className={`p-2.5 rounded-xl border text-left transition-colors cursor-pointer ${
                    step === 1
                      ? 'border-slate-900 dark:border-emerald-500 bg-slate-50 dark:bg-slate-800/80'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">PASSO 1</span>
                    {hasBankAccounts && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />}
                  </div>
                  <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                    Contas bancárias
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className={`p-2.5 rounded-xl border text-left transition-colors cursor-pointer ${
                    step === 2
                      ? 'border-slate-900 dark:border-emerald-500 bg-slate-50 dark:bg-slate-800/80'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">PASSO 2</span>
                    <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">Obrigatório</span>
                  </div>
                  <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                    Primeiro lançamento
                  </p>
                </button>
              </div>

              {/* Conteúdo do passo ativo */}
              {step === 1 ? (
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3">
                  <div className="flex items-center gap-2.5">
                    <Landmark className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      Como configurar suas contas bancárias e carteiras
                    </h4>
                  </div>

                  <ol className="space-y-2 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                    <li className="flex items-start gap-2">
                      <span className="w-5 h-5 rounded bg-slate-900 dark:bg-emerald-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                        1
                      </span>
                      <span>
                        Acesse <strong>Configurações → Contas Bancárias e Carteiras</strong> (botão abaixo) e toque em{' '}
                        <strong>Adicionar conta</strong>.
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="w-5 h-5 rounded bg-slate-900 dark:bg-emerald-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                        2
                      </span>
                      <span>
                        Informe o nome (ex.: Nubank, Itaú, Carteira), o tipo e o <strong>saldo atual</strong>{' '}
                        (aceita até saldo negativo caso esteja no cheque especial).
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="w-5 h-5 rounded bg-slate-900 dark:bg-emerald-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                        3
                      </span>
                      <span>
                        Com isso, o <strong>Início</strong> e o <strong>Horizonte</strong> calculam seu saldo real,
                        quanto pode gastar por dia e o impacto de receitas e faturas.
                      </span>
                    </li>
                  </ol>

                  <div className="flex flex-col sm:flex-row gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleGoBankAccounts}
                      className="flex-1 min-h-[40px] inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                    >
                      <Landmark className="w-3.5 h-3.5" />
                      Ir para Contas Bancárias
                    </button>
                    <button
                      type="button"
                      onClick={() => setStep(2)}
                      className="min-h-[40px] inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                      Próximo: 1º lançamento
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3">
                  <div className="flex items-center gap-2.5">
                    <Plus className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      Como fazer seu primeiro lançamento
                    </h4>
                  </div>

                  <ol className="space-y-2 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                    <li className="flex items-start gap-2">
                      <span className="w-5 h-5 rounded bg-slate-900 dark:bg-emerald-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                        1
                      </span>
                      <span>
                        Toque em <strong>Adicionar lançamento</strong> (na barra lateral ou no botão <strong>+</strong>{' '}
                        do celular) ou clique no botão verde abaixo.
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="w-5 h-5 rounded bg-slate-900 dark:bg-emerald-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                        2
                      </span>
                      <span>
                        Escolha se é uma <strong>Saída</strong> (despesa) ou <strong>Entrada</strong> (receita). As
                        categorias mostradas mudam automaticamente conforme o tipo escolhido.
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="w-5 h-5 rounded bg-slate-900 dark:bg-emerald-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                        3
                      </span>
                      <span>
                        Preencha <strong>Descrição</strong>, <strong>Valor</strong>, <strong>Forma de pagamento</strong>{' '}
                        e salve. Assim que salvar o primeiro registro, este tour é concluído!
                      </span>
                    </li>
                  </ol>

                  <div className="flex flex-col sm:flex-row gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleStartFirstTransaction}
                      className="flex-1 min-h-[40px] inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Fazer 1º lançamento agora
                    </button>
                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      className="min-h-[40px] inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                      ← Passo 1
                    </button>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    minimizeModal();
                    onNavigate('inicio');
                  }}
                  className="text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
                >
                  Minimizar e usar o app (guia fica no topo)
                </button>
                <span className="text-[11px] text-slate-400">Passo {step} de 2</span>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </>
  );
}
