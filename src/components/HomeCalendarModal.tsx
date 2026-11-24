import React, { useMemo, useState } from 'react';
import {
  Calendar as CalendarIcon,
  Check,
  ChevronLeft,
  ChevronRight,
  CreditCard as CreditCardIcon,
  Plus,
  X,
} from 'lucide-react';
import { ModalPortal } from './ModalPortal';
import type {
  AppRoute,
  CreditCard,
  Income,
  Installment,
  RecurringItem,
  Transaction,
} from '../types/finance';
import {
  addMonthsToKey,
  computeMonthCalendarData,
  formatBRL,
  formatMonthFull,
  getCurrentMonthKey,
  getMonthAbbr,
  getTodayISO,
  type CalendarDayEvent,
  type CalendarEventTone,
} from '../utils/financeCalculations';

interface HomeCalendarModalProps {
  open: boolean;
  onClose: () => void;
  selectedMonth: string;
  onSelectMonth: (monthKey: string) => void;
  hideBalances: boolean;
  transactions: Transaction[];
  recurringItems: RecurringItem[];
  incomes: Income[];
  cards: CreditCard[];
  installments: Installment[];
  onQuickAdd: () => void;
  onEditTransaction: (tx: Transaction) => void;
  onNavigate: (route: AppRoute) => void;
  onSettleRecurring: (item: RecurringItem, monthKey: string) => void;
  onToggleTransactionStatus: (tx: Transaction) => void;
}

const WEEKDAY_HEADERS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

function getDayCircleClass(tone: CalendarEventTone | null, isSelected: boolean, isToday: boolean): string {
  const selectionRing = isSelected
    ? 'ring-2 ring-slate-900 dark:ring-white ring-offset-2 ring-offset-white dark:ring-offset-slate-900'
    : '';

  if (tone === 'positive') {
    return `bg-emerald-600 text-white font-bold shadow-xs ${selectionRing}`;
  }
  if (tone === 'negative') {
    return `bg-red-600 text-white font-bold shadow-xs ${selectionRing}`;
  }
  if (tone === 'warning') {
    return `bg-amber-500 text-slate-950 font-bold shadow-xs ${selectionRing}`;
  }
  if (tone === 'neutral') {
    return `bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-100 font-semibold ${selectionRing}`;
  }
  if (isSelected) {
    return 'bg-slate-900 dark:bg-white text-white dark:text-slate-950 font-bold';
  }
  if (isToday) {
    return 'border border-emerald-600 text-emerald-700 dark:text-emerald-400 font-bold hover:bg-slate-100 dark:hover:bg-slate-800';
  }
  return 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800';
}

function getPreviewDotClass(tone: CalendarEventTone | undefined): string {
  if (tone === 'positive') return 'bg-emerald-600 text-white font-bold';
  if (tone === 'negative') return 'bg-red-600 text-white font-bold';
  if (tone === 'warning') return 'bg-amber-500 text-slate-950 font-bold';
  if (tone === 'neutral') return 'bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 font-semibold';
  return 'text-slate-400 dark:text-slate-500';
}

function getEventBarClass(ev: CalendarDayEvent): string {
  if (!ev.isPrimary) {
    return 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200/70 dark:border-slate-700/80 hover:bg-slate-200/70 dark:hover:bg-slate-700';
  }
  if (ev.tone === 'positive') {
    return 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs';
  }
  if (ev.tone === 'negative') {
    return 'bg-red-600 text-white hover:bg-red-700 shadow-xs';
  }
  if (ev.tone === 'warning') {
    return 'bg-amber-500 text-slate-950 hover:bg-amber-400 shadow-xs';
  }
  return 'bg-slate-900 dark:bg-slate-700 text-white hover:bg-slate-800 shadow-xs';
}

export function HomeCalendarModal({
  open,
  onClose,
  selectedMonth,
  onSelectMonth,
  hideBalances,
  transactions,
  recurringItems,
  incomes,
  cards,
  installments,
  onQuickAdd,
  onEditTransaction,
  onNavigate,
  onSettleRecurring,
  onToggleTransactionStatus,
}: HomeCalendarModalProps) {
  const todayISO = getTodayISO();
  const [selectedDayISO, setSelectedDayISO] = useState<string | null>(null);
  const [mobilePane, setMobilePane] = useState<'calendario' | 'agenda'>('calendario');

  const calendarData = useMemo(
    () =>
      computeMonthCalendarData({
        monthKey: selectedMonth,
        transactions,
        recurringItems,
        incomes,
        cards,
        installments,
      }),
    [selectedMonth, transactions, recurringItems, incomes, cards, installments]
  );

  const monthHeaderTitle = useMemo(() => {
    const abbr = getMonthAbbr(selectedMonth).toUpperCase();
    const year = selectedMonth.slice(0, 4);
    return `${abbr} ${year}`;
  }, [selectedMonth]);

  const nextMonthTitle = useMemo(() => {
    const mk = calendarData.nextMonthPreview.monthKey;
    return `${getMonthAbbr(mk).toUpperCase()} ${mk.slice(0, 4)}`;
  }, [calendarData.nextMonthPreview.monthKey]);

  const visibleAgendaGroups = useMemo(() => {
    if (selectedDayISO && selectedDayISO.slice(0, 7) === selectedMonth) {
      const summary = calendarData.daySummaries[selectedDayISO];
      return summary && summary.events.length > 0 ? [summary] : [];
    }
    return calendarData.agendaGroups;
  }, [calendarData, selectedDayISO, selectedMonth]);

  const selectedDaySummary = useMemo(() => {
    if (!selectedDayISO || selectedDayISO.slice(0, 7) !== selectedMonth) return null;
    return calendarData.daySummaries[selectedDayISO] ?? null;
  }, [calendarData.daySummaries, selectedDayISO, selectedMonth]);

  const monthTotals = useMemo(() => {
    let entries = 0;
    let expenses = 0;
    for (const grp of calendarData.agendaGroups) {
      entries += grp.entriesTotal;
      expenses += grp.expensesTotal;
    }
    return { entries, expenses };
  }, [calendarData.agendaGroups]);

  const displayMoney = (v: number) => (hideBalances ? 'R$ •••••' : formatBRL(v));

  const changeMonth = (nextMonthKey: string) => {
    setSelectedDayISO(null);
    onSelectMonth(nextMonthKey);
  };

  const handleDayClick = (dateISO: string) => {
    setSelectedDayISO((prev) => (prev === dateISO ? null : dateISO));
  };

  const handleEventClick = (ev: CalendarDayEvent) => {
    if (ev.kind === 'tx' && ev.tx) {
      onClose();
      onEditTransaction(ev.tx);
      return;
    }
    if (ev.route) {
      onClose();
      onNavigate(ev.route);
    }
  };

  if (!open) return null;

  return (
    <ModalPortal>
      <div
        className="duofin-backdrop-enter fixed inset-0 z-50 flex items-start justify-center bg-black/55 backdrop-blur-xs pt-3 px-3 pb-6 sm:pt-8 sm:px-4 overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-label={`Calendário financeiro de ${formatMonthFull(selectedMonth)}`}
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="duofin-dialog-enter w-full md:max-w-3xl lg:max-w-5xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[86dvh]">

        {/* Cabeçalho do Calendário */}
        <div className="px-4 sm:px-6 pt-3 pb-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-slate-900 dark:bg-emerald-600 text-white flex items-center justify-center shrink-0">
              <CalendarIcon className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 truncate">
                Calendário financeiro
              </h2>
              <p className="text-[11px] text-slate-500 truncate">{formatMonthFull(selectedMonth)}</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {selectedMonth !== getCurrentMonthKey() && (
              <button
                type="button"
                onClick={() => changeMonth(getCurrentMonthKey())}
                className="min-h-[36px] px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 cursor-pointer whitespace-nowrap"
              >
                Hoje
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar calendário"
              className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Seletor de painel no Mobile (Calendário vs Agenda) */}
        <div className="px-4 pt-3 md:hidden">
          <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setMobilePane('calendario')}
              className={`min-h-[44px] rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                mobilePane === 'calendario'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Calendário ({monthHeaderTitle})
            </button>
            <button
              type="button"
              onClick={() => setMobilePane('agenda')}
              className={`min-h-[44px] rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                mobilePane === 'agenda'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Agenda ({visibleAgendaGroups.length} dia{visibleAgendaGroups.length === 1 ? '' : 's'})
            </button>
          </div>
        </div>

        {/* Corpo em 2 painéis inspirados na referência: Esquerda (Calendário + Próximo Mês) / Direita (Agenda Cronológica) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 lg:p-6">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-5 lg:gap-6 items-start">
            {/* PAINEL ESQUERDO: Grade Mensal + Prévia do Próximo Mês */}
            <div
              className={`md:col-span-5 flex flex-col justify-between space-y-5 md:border-r md:border-slate-100 dark:md:border-slate-800 md:pr-5 lg:pr-6 ${
                mobilePane === 'calendario' ? 'block' : 'hidden md:block'
              }`}
            >
              {/* Navegação de Mês */}
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => changeMonth(addMonthsToKey(selectedMonth, -1))}
                  aria-label="Mês anterior"
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <span className="text-sm font-extrabold tracking-widest text-slate-900 dark:text-white font-display">
                  {monthHeaderTitle}
                </span>
                <button
                  type="button"
                  onClick={() => changeMonth(addMonthsToKey(selectedMonth, 1))}
                  aria-label="Próximo mês"
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>

              {/* Grade 7 colunas */}
              <div className="space-y-2">
                <div className="grid grid-cols-7 text-center">
                  {WEEKDAY_HEADERS.map((wd, idx) => (
                    <span
                      key={`${wd}-${idx}`}
                      className="text-[11px] font-bold text-slate-500 dark:text-slate-400 py-1"
                    >
                      {wd}
                    </span>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-y-1.5 place-items-center">
                  {Array.from({ length: calendarData.leadingEmptyDays }).map((_, i) => (
                    <div key={`empty-${i}`} className="w-9 h-9 md:w-10 md:h-10 lg:w-11 lg:h-11" />
                  ))}

                  {Array.from({ length: calendarData.daysInMonth }, (_, i) => {
                    const day = i + 1;
                    const dateISO = `${selectedMonth}-${String(day).padStart(2, '0')}`;
                    const summary = calendarData.daySummaries[dateISO];
                    const tone = summary?.tone ?? null;
                    const isSelected = selectedDayISO === dateISO;
                    const isToday = dateISO === todayISO;

                    return (
                      <button
                        key={dateISO}
                        type="button"
                        onClick={() => handleDayClick(dateISO)}
                        aria-label={`Dia ${day} de ${formatMonthFull(selectedMonth)}${
                          summary?.events.length ? `, ${summary.events.length} evento(s)` : ''
                        }`}
                        className={`w-9 h-9 md:w-10 md:h-10 lg:w-11 lg:h-11 rounded-full flex items-center justify-center text-xs sm:text-sm font-mono tabular-nums transition-all cursor-pointer ${getDayCircleClass(
                          tone,
                          isSelected,
                          isToday
                        )}`}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Legenda semântica enxuta */}
              <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 pt-1 text-[11px] text-slate-600 dark:text-slate-400">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
                  Entradas
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-600" />
                  Contas / A pagar
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                  Cartão / Misto
                </span>
              </div>

              {/* Resumo rápido do dia selecionado no mobile */}
              {selectedDaySummary && (
                <div className="duofin-expand-enter md:hidden bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 dark:text-slate-100">
                      Dia {selectedDaySummary.day} ({selectedDaySummary.weekdayShort})
                    </p>
                    <p className="text-[11px] text-slate-500 truncate">
                      {selectedDaySummary.events.length === 0
                        ? 'Sem lançamentos neste dia'
                        : `${selectedDaySummary.events.length} evento(s) agendado(s)`}
                    </p>
                  </div>
                  {selectedDaySummary.events.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setMobilePane('agenda')}
                      className="min-h-[36px] px-3 py-1.5 rounded-xl bg-slate-900 dark:bg-emerald-600 text-white text-xs font-semibold shrink-0 cursor-pointer"
                    >
                      Ver agenda
                    </button>
                  )}
                </div>
              )}

              {/* Mini prévia do próximo mês (inspirada na referência visual) */}
              <button
                type="button"
                onClick={() => changeMonth(calendarData.nextMonthPreview.monthKey)}
                className="w-full text-left pt-3 border-t border-slate-100 dark:border-slate-800 group cursor-pointer"
                title={`Avançar para ${formatMonthFull(calendarData.nextMonthPreview.monthKey)}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-extrabold tracking-widest text-slate-800 dark:text-slate-200 group-hover:text-emerald-600 transition-colors">
                    {nextMonthTitle}
                  </span>
                  <span className="text-[11px] font-medium text-slate-400 group-hover:text-emerald-600 inline-flex items-center gap-0.5">
                    Próximo mês
                    <ChevronRight className="w-3.5 h-3.5" />
                  </span>
                </div>
                <div className="grid grid-cols-7 gap-y-1 text-center opacity-85 group-hover:opacity-100 transition-opacity">
                  {WEEKDAY_HEADERS.map((wd, idx) => (
                    <span key={`next-wd-${idx}`} className="text-[10px] font-semibold text-slate-400">
                      {wd}
                    </span>
                  ))}
                  {Array.from({ length: calendarData.nextMonthPreview.leadingEmptyDays }).map((_, i) => (
                    <span key={`next-empty-${i}`} className="h-6" />
                  ))}
                  {Array.from({ length: Math.min(14, calendarData.nextMonthPreview.daysInMonth) }, (_, i) => {
                    const day = i + 1;
                    const tone = calendarData.nextMonthPreview.dayTones[day];
                    return (
                      <span
                        key={`next-d-${day}`}
                        className="h-6 flex items-center justify-center"
                      >
                        <span
                          className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-mono tabular-nums ${getPreviewDotClass(
                            tone
                          )}`}
                        >
                          {day}
                        </span>
                      </span>
                    );
                  })}
                </div>
              </button>

              {/* Botão circular "+" centralizado abaixo do calendário (fiel à referência) */}
              <div className="flex justify-center pt-1">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onQuickAdd();
                  }}
                  aria-label="Novo lançamento"
                  className="w-12 h-12 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white shadow-md flex items-center justify-center cursor-pointer active:scale-95 transition-transform"
                >
                  <Plus className="w-6 h-6" />
                </button>
              </div>
            </div>

            {/* PAINEL DIREITO: Agenda Cronológica por Dia */}
            <div
              className={`md:col-span-7 flex flex-col space-y-4 ${
                mobilePane === 'agenda' ? 'block' : 'hidden md:block'
              }`}
            >
              {/* Resumo de Entradas vs Saídas + Filtro de Dia */}
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h3 className="text-sm font-extrabold tracking-wide text-slate-900 dark:text-slate-100 uppercase">
                    {selectedDaySummary
                      ? `Dia ${selectedDaySummary.day} · ${selectedDaySummary.weekdayShort}`
                      : `Agenda · ${monthHeaderTitle}`}
                  </h3>
                  <p className="text-xs text-slate-500 font-mono tabular-nums mt-0.5">
                    Entradas: <span className="text-emerald-600 font-semibold">{displayMoney(monthTotals.entries)}</span>
                    {' · '}
                    Saídas: <span className="text-red-600 font-semibold">{displayMoney(monthTotals.expenses)}</span>
                  </p>
                </div>

                {selectedDayISO && (
                  <button
                    type="button"
                    onClick={() => setSelectedDayISO(null)}
                    className="min-h-[36px] px-3 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer whitespace-nowrap"
                  >
                    Ver mês inteiro
                  </button>
                )}
              </div>

              {visibleAgendaGroups.length === 0 ? (
                <div className="py-12 px-4 text-center space-y-3 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-100 dark:border-slate-800">
                  <p className="text-sm text-slate-500">
                    {selectedDayISO
                      ? 'Nenhum lançamento, conta fixa ou vencimento agendado para este dia.'
                      : `Nenhum evento financeiro registrado em ${formatMonthFull(selectedMonth)}.`}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onQuickAdd();
                    }}
                    className="inline-flex items-center gap-1.5 min-h-[44px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    Registrar lançamento
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {visibleAgendaGroups.map((group) => (
                    <div key={group.dateISO} className="grid grid-cols-[44px_1fr] gap-3 items-start">
                      {/* Coluna da Data (ex: 12 qua) fiel ao design de referência */}
                      <button
                        type="button"
                        onClick={() => handleDayClick(group.dateISO)}
                        className="text-left pt-1 cursor-pointer group"
                      >
                        <p className="text-lg font-bold font-mono tabular-nums leading-none text-slate-900 dark:text-slate-100 group-hover:text-emerald-600">
                          {String(group.day).padStart(2, '0')}
                        </p>
                        <p className="text-[11px] font-medium text-slate-400 mt-0.5">{group.weekdayShort}</p>
                      </button>

                      {/* Lista de barras de eventos do dia */}
                      <div className="space-y-2 pl-3 border-l border-slate-100 dark:border-slate-800 min-w-0">
                        {group.events.map((ev) => (
                          <div key={ev.id} className="flex items-center gap-2 min-w-0">
                            <button
                              type="button"
                              onClick={() => handleEventClick(ev)}
                              className={`flex-1 min-w-0 min-h-[44px] px-3.5 py-2.5 rounded-xl flex items-center justify-between gap-3 text-left transition-colors cursor-pointer ${getEventBarClass(
                                ev
                              )}`}
                            >
                              <div className="min-w-0">
                                <p className="text-xs sm:text-sm font-semibold truncate flex items-center gap-1.5">
                                  {(ev.kind === 'card_due' || ev.kind === 'card_close') && (
                                    <CreditCardIcon className="w-3.5 h-3.5 shrink-0" />
                                  )}
                                  <span className="truncate">{ev.title}</span>
                                </p>
                                <p
                                  className={`text-[11px] truncate ${
                                    ev.isPrimary
                                      ? ev.tone === 'warning'
                                        ? 'text-slate-900/75'
                                        : 'text-white/80'
                                      : 'text-slate-500 dark:text-slate-400'
                                  }`}
                                >
                                  {ev.subtitle}
                                </p>
                              </div>
                              {ev.amount !== null && (
                                <span className="text-xs sm:text-sm font-bold font-mono tabular-nums shrink-0">
                                  {displayMoney(ev.amount)}
                                </span>
                              )}
                            </button>

                            {/* Ação rápida para confirmar pendente ou fixo */}
                            {ev.kind === 'tx' && ev.tx && ev.tx.status === 'Pendente' && (
                              <button
                                type="button"
                                onClick={() => onToggleTransactionStatus(ev.tx!)}
                                title="Marcar como pago"
                                aria-label={`Marcar ${ev.title} como pago`}
                                className="min-w-[44px] min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 text-slate-500 hover:text-emerald-600 flex items-center justify-center shrink-0 cursor-pointer"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                            )}
                            {ev.kind === 'recurring' && ev.recurringItem && (
                              <button
                                type="button"
                                onClick={() => onSettleRecurring(ev.recurringItem!, selectedMonth)}
                                title="Confirmar no mês"
                                aria-label={`Confirmar ${ev.title} no mês`}
                                className="min-w-[44px] min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 text-slate-500 hover:text-emerald-600 flex items-center justify-center shrink-0 cursor-pointer"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Botão circular "+" no mobile dentro do painel de agenda */}
              <div className="md:hidden flex justify-center pt-2">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onQuickAdd();
                  }}
                  aria-label="Novo lançamento"
                  className="w-12 h-12 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white shadow-md flex items-center justify-center cursor-pointer active:scale-95 transition-transform"
                >
                  <Plus className="w-6 h-6" />
                </button>
              </div>
            </div>
          </div>
        </div>
        </div>
      </div>
    </ModalPortal>
  );
}
