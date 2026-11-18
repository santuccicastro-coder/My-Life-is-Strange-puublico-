import React, { useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Calculator,
  Calendar,
  CalendarRange,
  CheckCircle2,
  ChevronRight,
  Circle,
  Eye,
  EyeOff,
  Landmark,
  PiggyBank,
  Plus,
  RefreshCw,
  Sparkles,
  Wallet,
} from 'lucide-react';
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { HomeCalendarModal } from '../components/HomeCalendarModal';
import { QuickCalculatorModal } from '../components/QuickCalculatorModal';
import { useFinance } from '../context/AuthHouseholdContext';
import { useTheme } from '../context/ThemeContext';
import type { AppRoute, RecurringItem, Transaction } from '../types/finance';
import { CategoryBadgeIcon } from '../utils/categoryVisuals';
import { CHART_ANIMATION, getChartTheme, getSemanticCategoryColor, SEMANTIC_COLORS } from '../utils/chartColors';
import {
  addMonthsToKey,
  buildDateInMonth,
  computeHomeRealizedAndDailyMetrics,
  computePaymentReminders,
  computeShortHorizon,
  formatBRL,
  formatDateBR,
  formatDeviceBalanceTimestamp,
  formatMonthFull,
  formatPct,
  formatShortDayMonth,
  getCardInvoiceInMonth,
  getCurrentMonthKey,
  getInstallmentAmountInMonth,
  getMonthAbbr,
  getRecurringItemAmountInMonth,
} from '../utils/financeCalculations';

interface HomePageProps {
  onNavigate: (route: AppRoute) => void;
  onQuickAdd: () => void;
  onEditTransaction: (tx: Transaction) => void;
}

const HIDE_BALANCE_STORAGE_KEY = 'duofin_hide_balances';

export function HomePage({ onNavigate, onQuickAdd, onEditTransaction }: HomePageProps) {
  const {
    transactions,
    recurringItems,
    incomes,
    cards,
    installments,
    goals,
    bankAccounts,
    currentAuthorName,
    currentPartnerName,
    dataLoading,
    toggleTransactionStatus,
    settleRecurringItemForMonth,
  } = useFinance();
  const { isDark } = useTheme();
  const chartTheme = getChartTheme(isDark);

  const currentMonthKey = getCurrentMonthKey();
  const nextMonthKey = useMemo(() => addMonthsToKey(currentMonthKey, 1), [currentMonthKey]);
  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey);
  const [calculatorOpen, setCalculatorOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [lastBalanceConsultAt, setLastBalanceConsultAt] = useState<Date>(() => new Date());
  const [hideBalances, setHideBalances] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(HIDE_BALANCE_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [showBalanceDetails, setShowBalanceDetails] = useState(false);

  React.useEffect(() => {
    setLastBalanceConsultAt(new Date());
  }, [bankAccounts, transactions]);

  const balanceAuthorLabel = useMemo(() => {
    const resolvedCurrent =
      currentPartnerName && currentPartnerName !== 'Pessoa 1' && currentPartnerName !== 'Pessoa 2'
        ? currentPartnerName
        : currentAuthorName;
    return resolvedCurrent || currentAuthorName || 'Usuário';
  }, [currentPartnerName, currentAuthorName]);

  const balanceUpdateLabel = useMemo(
    () => formatDeviceBalanceTimestamp(lastBalanceConsultAt, balanceAuthorLabel),
    [lastBalanceConsultAt, balanceAuthorLabel]
  );

  const toggleHideBalances = () => {
    setHideBalances((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(HIDE_BALANCE_STORAGE_KEY, next ? '1' : '0');
      } catch {
        // Ignore storage errors
      }
      return next;
    });
  };

  const displayMoney = (value: number) => (hideBalances ? 'R$ •••••' : formatBRL(value));

  const threeMonthTabs = useMemo(() => {
    const prev = addMonthsToKey(selectedMonth, -1);
    const next = addMonthsToKey(selectedMonth, 1);
    return [
      { key: prev, label: getMonthAbbr(prev), active: false },
      { key: selectedMonth, label: getMonthAbbr(selectedMonth), active: true },
      { key: next, label: getMonthAbbr(next), active: false },
    ];
  }, [selectedMonth]);

  const metrics = useMemo(
    () =>
      computeHomeRealizedAndDailyMetrics({
        monthKey: selectedMonth,
        bankAccounts,
        incomes,
        transactions,
        installments,
        recurringItems,
        cards,
      }),
    [selectedMonth, bankAccounts, incomes, transactions, installments, recurringItems, cards]
  );

  const nextMonthMetrics = useMemo(
    () =>
      computeHomeRealizedAndDailyMetrics({
        monthKey: nextMonthKey,
        bankAccounts,
        incomes,
        transactions,
        installments,
        recurringItems,
        cards,
      }),
    [nextMonthKey, bankAccounts, incomes, transactions, installments, recurringItems, cards]
  );

  const dailyCashFlow = useMemo(
    () =>
      computeShortHorizon({
        daysCount: 30,
        bankAccounts,
        incomes,
        transactions,
        installments,
        recurringItems,
        cards,
        simulatedPurchases: [],
      }),
    [bankAccounts, incomes, transactions, installments, recurringItems, cards]
  );

  const monthSummary = useMemo(() => {
    const totalSavedGoals = goals.reduce((s, g) => s + g.currentAmount, 0);
    const investmentAccountsBalance = bankAccounts
      .filter((a) => a.active && (a.type === 'Poupança' || a.type === 'Investimento'))
      .reduce((s, a) => s + a.balance, 0);
    const invoicesTotal = cards
      .filter((c) => c.active)
      .reduce(
        (s, c) => s + getCardInvoiceInMonth(c, selectedMonth, transactions, installments, recurringItems).total,
        0
      );
    const committedPct =
      metrics.expectedEntriesTotal > 0 ? metrics.expectedExpensesTotal / metrics.expectedEntriesTotal : 0;

    return {
      totalSavedGoals,
      investmentAccountsBalance,
      totalPatrimony: totalSavedGoals + investmentAccountsBalance,
      invoicesTotal,
      committedPct,
    };
  }, [selectedMonth, transactions, installments, recurringItems, goals, bankAccounts, cards, metrics]);

  const paymentReminders = useMemo(
    () =>
      computePaymentReminders({
        monthKey: selectedMonth,
        transactions,
        recurringItems,
        cards,
        installments,
      }),
    [selectedMonth, transactions, recurringItems, cards, installments]
  );

  // Próximos lançamentos (Pendentes + Fixas não confirmadas + Faturas dos cartões no mês)
  const upcomingBills = useMemo(() => {
    const pendingTxs = transactions
      .filter((tx) => tx.type === 'Saída' && tx.status === 'Pendente')
      .map((tx) => ({
        kind: 'tx' as const,
        id: tx.id,
        title: tx.description,
        category: tx.category,
        kindLabel: 'Pendente',
        dueDate: tx.dueDate || tx.date,
        amount: tx.actualAmount,
        tx,
      }))
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    const projectedFixedBills = recurringItems
      .filter((item) => item.type === 'Saída' && item.paymentMethod !== 'Crédito')
      .map((item) => {
        const amt = getRecurringItemAmountInMonth(item, selectedMonth, transactions);
        if (amt <= 0) return null;
        return {
          kind: 'recurring' as const,
          id: `rec-${item.id}`,
          title: item.description,
          category: item.category,
          kindLabel: item.frequency === 'Mensal' ? 'Recorrência' : item.frequency,
          dueDate: buildDateInMonth(selectedMonth, item.dayOfMonth),
          amount: amt,
          item,
        };
      })
      .filter(
        (
          x
        ): x is {
          kind: 'recurring';
          id: string;
          title: string;
          category: string;
          kindLabel: string;
          dueDate: string;
          amount: number;
          item: RecurringItem;
        } => x !== null
      );

    const cardDueItems = cards
      .filter((c) => c.active)
      .map((c) => {
        const inv = getCardInvoiceInMonth(c, selectedMonth, transactions, installments, recurringItems);
        const dayStr = String(Math.min(28, Math.max(1, c.dueDay))).padStart(2, '0');
        return {
          kind: 'card' as const,
          id: `card-${c.id}`,
          title: `Fatura ${c.name}`,
          category: 'Cartão',
          kindLabel: `Vence dia ${c.dueDay}`,
          dueDate: `${selectedMonth}-${dayStr}`,
          amount: inv.total,
        };
      })
      .filter((item) => item.amount > 0);

    return [...pendingTxs, ...projectedFixedBills, ...cardDueItems]
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .slice(0, 8);
  }, [transactions, recurringItems, cards, selectedMonth, installments]);

  // Infográfico "Para onde foi o dinheiro"
  const categoryBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const tx of transactions) {
      if (tx.type === 'Saída' && tx.monthKey === selectedMonth) {
        map.set(tx.category, (map.get(tx.category) ?? 0) + tx.actualAmount);
      }
    }
    for (const item of recurringItems) {
      if (item.type === 'Saída') {
        const amt = getRecurringItemAmountInMonth(item, selectedMonth, transactions);
        if (amt > 0) {
          map.set(item.category, (map.get(item.category) ?? 0) + amt);
        }
      }
    }
    for (const inst of installments) {
      const amt = getInstallmentAmountInMonth(inst, selectedMonth);
      if (amt > 0) {
        const cat = inst.category || 'Parcelamentos';
        map.set(cat, (map.get(cat) ?? 0) + amt);
      }
    }
    const items = Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
    const total = items.reduce((s, i) => s + i.value, 0);
    return { items: items.slice(0, 8), allCount: items.length, total };
  }, [transactions, recurringItems, installments, selectedMonth]);

  const recentTransactions = useMemo(() => transactions.slice(0, 6), [transactions]);

  const entriesRatio =
    metrics.expectedEntriesTotal > 0 ? Math.min(100, (metrics.realizedEntries / metrics.expectedEntriesTotal) * 100) : 0;
  const expensesRatio =
    metrics.expectedExpensesTotal > 0
      ? Math.min(100, (metrics.realizedExpenses / metrics.expectedExpensesTotal) * 100)
      : 0;

  if (dataLoading) {
    return (
      <div className="space-y-5">
        <div className="h-44 bg-slate-900/90 rounded-2xl animate-pulse" />
        <div className="grid grid-cols-2 gap-3">
          <div className="h-24 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl animate-pulse" />
          <div className="h-24 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl animate-pulse" />
        </div>
        <div className="h-48 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-6">
      {/* Bloco Principal: Cabeçalho Bancário Slate-Esmeralda + Tabs de 3 Meses + Saldo Total */}
      <section className="space-y-3">
        <div className="bg-slate-900 text-white rounded-2xl p-5 sm:p-6 border border-slate-800 shadow-sm">
          {/* Topo do Hero: Calculadora rápida à esquerda, Navegador 3 meses ao centro, Calendário visual à direita */}
          <div className="flex items-center justify-between gap-2 pb-5">
            <button
              type="button"
              onClick={() => setCalculatorOpen(true)}
              aria-label="Calculadora econômica rápida"
              title="Calculadora econômica rápida"
              className="min-w-[44px] min-h-[44px] -ml-2 flex items-center justify-center rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <Calculator className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-4 sm:gap-6">
              {threeMonthTabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setSelectedMonth(tab.key)}
                  className={`relative py-2 px-1.5 text-sm transition-colors cursor-pointer whitespace-nowrap ${
                    tab.active ? 'font-bold text-white' : 'font-medium text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                  {tab.active && (
                    <span className="absolute inset-x-1 bottom-0 h-0.5 rounded-full bg-emerald-400" />
                  )}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setCalendarOpen(true)}
              aria-label="Abrir calendário financeiro"
              title="Calendário financeiro e agenda do mês"
              className="min-w-[44px] min-h-[44px] -mr-2 flex items-center justify-center rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <Calendar className="w-5 h-5" />
            </button>
          </div>

          {/* Linha Saldo Total / Saldo Previsto + Olho + Detalhes > */}
          <div className="flex items-end justify-between gap-4">
            <div className="space-y-1 min-w-0">
              <p className="text-xs font-medium text-slate-300">
                {metrics.isFutureMonth
                  ? `Saldo previsto · ${formatMonthFull(selectedMonth)}`
                  : `Saldo total · ${formatMonthFull(selectedMonth)}`}
              </p>
              <div className="flex items-center gap-2.5 flex-wrap">
                <span
                  className={`text-3xl sm:text-4xl font-bold font-mono tabular-nums tracking-tight ${
                    metrics.heroBalance < 0 ? 'text-red-300' : 'text-white'
                  }`}
                >
                  {displayMoney(metrics.heroBalance)}
                </span>
                <button
                  type="button"
                  onClick={toggleHideBalances}
                  aria-label={hideBalances ? 'Mostrar valores' : 'Ocultar valores'}
                  className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-full text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  {hideBalances ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {metrics.isFutureMonth ? (
                <div className="flex items-center gap-2 pt-0.5">
                  <span className="text-[11px] font-medium text-slate-300 font-mono tabular-nums">
                    Entradas ({displayMoney(metrics.expectedEntriesTotal)}) − Faturas/Despesas (
                    {displayMoney(metrics.expectedExpensesTotal)})
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 pt-0.5">
                  <span className="text-[11px] font-medium text-slate-300 font-mono tabular-nums">
                    {balanceUpdateLabel}
                  </span>
                  <button
                    type="button"
                    onClick={() => setLastBalanceConsultAt(new Date())}
                    aria-label="Atualizar horário da consulta de saldo"
                    title="Atualizar horário pelo sistema do celular"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              <p className="text-xs text-slate-300 pt-0.5">
                Posso gastar/dia:{' '}
                <strong
                  className={`font-mono tabular-nums ${
                    metrics.dailySafeSpend > 0 ? 'text-emerald-300' : 'text-red-300'
                  }`}
                >
                  {displayMoney(metrics.dailySafeSpend)}
                </strong>
                {' · '}
                {metrics.activeAccountsCount > 0 ? (
                  <span>{metrics.activeAccountsCount} conta(s) ativa(s)</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onNavigate('config')}
                    className="underline text-emerald-300 hover:text-emerald-200 cursor-pointer"
                  >
                    Cadastrar saldos das contas
                  </button>
                )}
              </p>
              {!metrics.isFutureMonth && (
                <button
                  type="button"
                  onClick={() => setSelectedMonth(nextMonthKey)}
                  className="mt-1.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800/90 hover:bg-slate-800 border border-slate-700 text-[11px] font-medium text-slate-200 transition-colors cursor-pointer"
                >
                  <span>Próx. mês ({getMonthAbbr(nextMonthKey)}):</span>
                  <strong
                    className={`font-mono tabular-nums ${
                      nextMonthMetrics.projectedMonthBalance < 0 ? 'text-red-300' : 'text-emerald-300'
                    }`}
                  >
                    {displayMoney(nextMonthMetrics.projectedMonthBalance)}
                  </strong>
                  <span className="hidden xs:inline text-slate-400">· Salário − Despesas</span>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowBalanceDetails((v) => !v)}
              className="min-h-[44px] inline-flex items-center gap-1 px-2.5 py-2 text-xs sm:text-sm font-semibold text-emerald-300 hover:text-emerald-200 rounded-xl hover:bg-slate-800/80 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Detalhes
              <ChevronRight className={`w-4 h-4 transition-transform ${showBalanceDetails ? 'rotate-90' : ''}`} />
            </button>
          </div>
        </div>

        {/* Painel Expandível de Detalhes (Saldos por Conta, Diário, Faturas e Patrimônio) */}
        {showBalanceDetails && (
          <div className="duofin-expand-enter bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="space-y-1">
                <p className="text-xs text-slate-500">Posso gastar por dia</p>
                <p
                  className={`text-base font-bold font-mono tabular-nums ${
                    metrics.dailySafeSpend > 0 ? 'text-emerald-700' : 'text-red-600'
                  }`}
                >
                  {displayMoney(metrics.dailySafeSpend)}
                </p>
                <p className="text-[11px] text-slate-500">
                  {metrics.daysRemainingInMonth} dia(s) restante(s)
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-slate-500">
                  {metrics.isFutureMonth ? 'Saldo previsto do mês' : 'Sobra prevista do mês'}
                </p>
                <p
                  className={`text-base font-bold font-mono tabular-nums ${
                    (metrics.isFutureMonth ? metrics.projectedMonthBalance : metrics.monthlySurplus) >= 0
                      ? 'text-emerald-700'
                      : 'text-red-600'
                  }`}
                >
                  {displayMoney(metrics.isFutureMonth ? metrics.projectedMonthBalance : metrics.monthlySurplus)}
                </p>
                <p className="text-[11px] text-slate-500">
                  {formatPct(monthSummary.committedPct, 0)} comprometido
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('cartoes')}
                className="text-left space-y-1 hover:opacity-80 cursor-pointer"
              >
                <p className="text-xs text-slate-500">Faturas dos cartões</p>
                <p className="text-base font-bold font-mono tabular-nums text-amber-600">
                  {displayMoney(monthSummary.invoicesTotal)}
                </p>
                <p className="text-[11px] text-slate-500">Ver cartões &rsaquo;</p>
              </button>
              <button
                type="button"
                onClick={() => onNavigate('economias')}
                className="text-left space-y-1 hover:opacity-80 cursor-pointer"
              >
                <p className="text-xs text-slate-500">Investimentos e cofrinho</p>
                <p className="text-base font-bold font-mono tabular-nums text-emerald-700">
                  {displayMoney(monthSummary.totalPatrimony)}
                </p>
                <p className="text-[11px] text-slate-500">Ver patrimônio &rsaquo;</p>
              </button>
            </div>

            <div className="border-t border-slate-100 dark:border-slate-800 pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              {bankAccounts.filter((a) => a.active).length === 0 ? (
                <p className="text-xs text-slate-500">
                  Nenhuma conta bancária cadastrada ainda. Adicione suas contas em Configurações.
                </p>
              ) : (
                <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                  {bankAccounts
                    .filter((a) => a.active)
                    .map((acc) => (
                      <div key={acc.id} className="text-xs text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                        <Landmark className="w-3.5 h-3.5 text-slate-400" />
                        <span className="font-medium">{acc.name}</span>
                        <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                          {displayMoney(acc.balance)}
                        </span>
                      </div>
                    ))}
                </div>
              )}
              <button
                type="button"
                onClick={() => onNavigate('config')}
                className="text-xs font-semibold text-slate-900 dark:text-slate-100 hover:underline self-start sm:self-auto shrink-0 cursor-pointer"
              >
                Gerenciar contas e saldos
              </button>
            </div>
            {metrics.negativeBalanceDebt > 0 && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
                Saldo negativo de{' '}
                <strong className="font-mono tabular-nums">−{displayMoney(metrics.negativeBalanceDebt)}</strong>{' '}
                {metrics.nextFixedIncomeDiscount
                  ? `abatido automaticamente na próxima entrada de renda fixa (${metrics.nextFixedIncomeDiscount.title} em ${formatDateBR(
                      metrics.nextFixedIncomeDiscount.dateISO
                    )}).`
                  : 'sendo descontado da disponibilidade diária do mês (cadastre uma renda fixa para projetar o abatimento).'}
              </div>
            )}
          </div>
        )}

        {/* Dupla Ganhos vs Gastos (fiel ao layout de referência com semântica verde/vermelho) */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex flex-col justify-between gap-2 shadow-xs">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <ArrowUpRight className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-base sm:text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100 truncate">
                  {displayMoney(metrics.isFutureMonth ? metrics.expectedEntriesTotal : metrics.realizedEntries)}
                </p>
                <p className="text-xs font-medium text-slate-500">
                  {metrics.isFutureMonth ? 'Ganhos previstos' : 'Ganhos'}
                </p>
              </div>
            </div>
            <div className="space-y-1">
              <div className="h-1 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-600 rounded-full"
                  style={{
                    width: `${
                      metrics.isFutureMonth
                        ? metrics.expectedEntriesTotal > 0
                          ? 100
                          : 0
                        : entriesRatio
                    }%`,
                  }}
                />
              </div>
              <p className="text-[11px] text-slate-500 truncate">
                {metrics.isFutureMonth
                  ? `Confirmado: ${displayMoney(metrics.realizedEntries)}`
                  : `Previsto: ${displayMoney(metrics.expectedEntriesTotal)}`}
              </p>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex flex-col justify-between gap-2 shadow-xs">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
                <ArrowDownRight className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-base sm:text-xl font-bold font-mono tabular-nums text-red-600 dark:text-red-400 truncate">
                  {displayMoney(metrics.isFutureMonth ? metrics.expectedExpensesTotal : metrics.realizedExpenses)}
                </p>
                <p className="text-xs font-medium text-slate-500">
                  {metrics.isFutureMonth ? 'Faturas / Despesas' : 'Gastos'}
                </p>
              </div>
            </div>
            <div className="space-y-1">
              <div className="h-1 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-red-600 rounded-full"
                  style={{
                    width: `${
                      metrics.isFutureMonth
                        ? metrics.expectedExpensesTotal > 0
                          ? 100
                          : 0
                        : expensesRatio
                    }%`,
                  }}
                />
              </div>
              <p className="text-[11px] text-slate-500 truncate">
                {metrics.isFutureMonth
                  ? `Já pago: ${displayMoney(metrics.realizedExpenses)}`
                  : `Total mês: ${displayMoney(metrics.expectedExpensesTotal)}`}
              </p>
            </div>
          </div>
        </div>

        {/* Faixa compacta de orçamento diário, faturas, sobra e previsão do próximo mês */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2.5">
            <p className="text-[11px] text-slate-500 truncate">Posso gastar/dia</p>
            <p
              className={`text-sm font-bold font-mono tabular-nums mt-0.5 truncate ${
                metrics.dailySafeSpend > 0 ? 'text-emerald-700' : 'text-red-600'
              }`}
            >
              {displayMoney(metrics.dailySafeSpend)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('cartoes')}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2.5 text-left hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <p className="text-[11px] text-slate-500 truncate">Faturas do mês</p>
            <p className="text-sm font-bold font-mono tabular-nums text-amber-600 mt-0.5 truncate">
              {displayMoney(monthSummary.invoicesTotal)}
            </p>
          </button>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2.5">
            <p className="text-[11px] text-slate-500 truncate">
              {metrics.isFutureMonth ? 'Saldo previsto' : 'Sobra prevista'}
            </p>
            <p
              className={`text-sm font-bold font-mono tabular-nums mt-0.5 truncate ${
                (metrics.isFutureMonth ? metrics.projectedMonthBalance : metrics.monthlySurplus) >= 0
                  ? 'text-emerald-700'
                  : 'text-red-600'
              }`}
            >
              {displayMoney(metrics.isFutureMonth ? metrics.projectedMonthBalance : metrics.monthlySurplus)}
            </p>
          </div>
          {!metrics.isFutureMonth ? (
            <button
              type="button"
              onClick={() => setSelectedMonth(nextMonthKey)}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2.5 text-left hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <p className="text-[11px] text-slate-500 truncate">Prev. {getMonthAbbr(nextMonthKey)}</p>
              <p
                className={`text-sm font-bold font-mono tabular-nums mt-0.5 truncate ${
                  nextMonthMetrics.projectedMonthBalance >= 0 ? 'text-emerald-700' : 'text-red-600'
                }`}
              >
                {displayMoney(nextMonthMetrics.projectedMonthBalance)}
              </p>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setSelectedMonth(currentMonthKey)}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2.5 text-left hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <p className="text-[11px] text-slate-500 truncate">Saldo atual contas</p>
              <p
                className={`text-sm font-bold font-mono tabular-nums mt-0.5 truncate ${
                  metrics.totalAccountsBalance >= 0 ? 'text-slate-900 dark:text-slate-100' : 'text-red-600'
                }`}
              >
                {displayMoney(metrics.totalAccountsBalance)}
              </p>
            </button>
          )}
        </div>
      </section>

      {/* Notificação de Lembretes de Pagamento */}
      {paymentReminders.summary.urgentCount > 0 && (
        <section className="bg-orange-50 dark:bg-orange-950/35 border border-orange-200 dark:border-orange-900 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-orange-100 dark:bg-orange-900/60 text-orange-700 dark:text-orange-300 flex items-center justify-center shrink-0">
              <Bell className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-orange-950 dark:text-orange-100">
                {paymentReminders.summary.urgentCount} lembrete(s) de pagamento para revisar
              </p>
              <p className="text-xs text-orange-800 dark:text-orange-300 truncate">
                {paymentReminders.summary.overdueCount > 0
                  ? `${paymentReminders.summary.overdueCount} atrasado(s)`
                  : paymentReminders.summary.dueTodayCount > 0
                    ? `${paymentReminders.summary.dueTodayCount} vence(m) hoje`
                    : `${paymentReminders.summary.dueSoonCount} vence(m) em breve`}
                {' · '}
                {displayMoney(
                  paymentReminders.summary.overdueAmount +
                    paymentReminders.summary.dueTodayAmount +
                    paymentReminders.summary.dueSoonAmount
                )}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('lembretes')}
            className="min-h-[40px] inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Marcar Pago / Não pago
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </section>
      )}

      {/* Próximos lançamentos (Carrossel horizontal deslizável no mobile, grid limpo no desktop) */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Próximos lançamentos
          </h2>
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => onNavigate('lembretes')}
              className="text-xs font-semibold text-orange-700 dark:text-orange-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              Lembretes
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onNavigate('fixos')}
              className="text-xs font-semibold text-slate-500 hover:text-slate-900 inline-flex items-center gap-1 cursor-pointer"
            >
              Ver fixos
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {upcomingBills.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl py-8 px-4 text-center space-y-2">
            <p className="text-sm text-slate-500">Nenhuma conta pendente ou fatura em aberto para este mês.</p>
            <button
              type="button"
              onClick={onQuickAdd}
              className="text-xs font-semibold text-emerald-700 hover:underline cursor-pointer"
            >
              + Registrar uma despesa ou conta fixa
            </button>
          </div>
        ) : (
          <div className="flex overflow-x-auto snap-x snap-mandatory gap-3 pb-1 lg:grid lg:grid-cols-3 lg:overflow-visible">
            {upcomingBills.map((item) => (
              <div
                key={item.id}
                className="min-w-[235px] sm:min-w-[255px] lg:min-w-0 snap-start bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex flex-col justify-between gap-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <CategoryBadgeIcon category={item.category} size="sm" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{item.title}</p>
                      <p className="text-xs text-slate-500 truncate">
                        {item.category} | {item.kindLabel}
                      </p>
                    </div>
                  </div>
                  {item.kind === 'tx' ? (
                    <button
                      type="button"
                      onClick={() => toggleTransactionStatus(item.tx)}
                      title="Marcar como pago"
                      aria-label={`Marcar ${item.title} como pago`}
                      className="min-w-[36px] min-h-[36px] -mt-1 -mr-1 flex items-center justify-center rounded-full text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors cursor-pointer shrink-0"
                    >
                      <Circle className="w-4 h-4" />
                    </button>
                  ) : item.kind === 'recurring' ? (
                    <button
                      type="button"
                      onClick={() => settleRecurringItemForMonth(item.item, selectedMonth)}
                      title="Confirmar pagamento no mês"
                      aria-label={`Confirmar pagamento de ${item.title}`}
                      className="min-w-[36px] min-h-[36px] -mt-1 -mr-1 flex items-center justify-center rounded-full text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors cursor-pointer shrink-0"
                    >
                      <Circle className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onNavigate('cartoes')}
                      title="Abrir faturas do cartão"
                      aria-label={`Abrir ${item.title}`}
                      className="min-w-[36px] min-h-[36px] -mt-1 -mr-1 flex items-center justify-center rounded-full text-amber-500 hover:bg-amber-50 transition-colors cursor-pointer shrink-0"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
                  <span className="text-xs font-medium text-slate-500 tabular-nums">
                    {formatShortDayMonth(item.dueDate)}
                  </span>
                  <span className="text-sm font-bold font-mono tabular-nums text-red-600 dark:text-red-400">
                    {displayMoney(item.amount)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Grid Principal: Últimas transações + Infográfico Para onde foi o dinheiro */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Últimas transações */}
        <div className="lg:col-span-6 min-w-0 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Últimas transações
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('lancamentos')}
              className="text-xs font-semibold text-slate-500 hover:text-slate-900 inline-flex items-center gap-1 cursor-pointer shrink-0"
            >
              Ver todas
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
            {recentTransactions.length === 0 ? (
              <div className="py-10 px-4 text-center space-y-2">
                <p className="text-sm text-slate-500">
                  Nenhum lançamento registrado ainda.
                </p>
                <button
                  type="button"
                  onClick={onQuickAdd}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Fazer primeiro lançamento
                </button>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {recentTransactions.map((tx) => (
                  <button
                    key={tx.id}
                    type="button"
                    onClick={() => onEditTransaction(tx)}
                    className="w-full min-h-[64px] px-4 py-3 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-left cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <CategoryBadgeIcon category={tx.category} type={tx.type} size="md" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {tx.description}
                        </p>
                        <p className="text-xs text-slate-500 truncate">
                          {tx.category} | {tx.paymentMethod} · {tx.person}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right">
                        <p
                          className={`text-sm font-bold font-mono tabular-nums ${
                            tx.type === 'Entrada'
                              ? 'text-emerald-700'
                              : tx.type === 'Economia'
                                ? 'text-amber-600'
                                : 'text-red-600'
                          }`}
                        >
                          {tx.type === 'Entrada' ? '+' : tx.type === 'Saída' ? '' : ''}
                          {displayMoney(tx.actualAmount)}
                        </p>
                        <p className="text-[11px] text-slate-400 tabular-nums">
                          {formatShortDayMonth(tx.date)}
                          {tx.status === 'Pendente' ? ' · Pendente' : ''}
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Infográfico "Para onde foi o dinheiro" */}
        <div className="lg:col-span-6 min-w-0 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Para onde foi o dinheiro
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('relatorios')}
              className="text-xs font-semibold text-slate-500 hover:text-slate-900 inline-flex items-center gap-1 cursor-pointer shrink-0"
            >
              Relatórios
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
            {categoryBreakdown.items.length === 0 ? (
              <div className="py-10 text-center space-y-2">
                <p className="text-sm text-slate-500">Ainda não há gastos registrados neste mês.</p>
                <button
                  type="button"
                  onClick={onQuickAdd}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Registrar gasto
                </button>
              </div>
            ) : (
              <div key={selectedMonth} className="duofin-chart-enter grid grid-cols-1 sm:grid-cols-12 gap-5 items-center">
                <div className="sm:col-span-5 min-w-0 w-full h-52 relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        {...CHART_ANIMATION}
                        data={categoryBreakdown.items}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={78}
                        paddingAngle={2}
                      >
                        {categoryBreakdown.items.map((cat, index) => {
                          const share = categoryBreakdown.total > 0 ? cat.value / categoryBreakdown.total : 0;
                          return <Cell key={cat.name} fill={getSemanticCategoryColor(index, share)} />;
                        })}
                      </Pie>
                      <Tooltip
                        formatter={(val: unknown) => [hideBalances ? '•••••' : formatBRL(Number(val)), 'Gasto']}
                        contentStyle={chartTheme.tooltipStyle}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center px-3">
                    <span className="text-[10px] font-medium text-slate-500">Total gasto</span>
                    <span className="text-xs font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                      {displayMoney(categoryBreakdown.total)}
                    </span>
                  </div>
                </div>

                <div className="sm:col-span-7 space-y-2.5">
                  {categoryBreakdown.items.map((cat, index) => {
                    const pct = categoryBreakdown.total > 0 ? cat.value / categoryBreakdown.total : 0;
                    const fillHex = getSemanticCategoryColor(index, pct);
                    return (
                      <div key={cat.name} className="space-y-1">
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="inline-flex items-center gap-2 font-medium text-slate-700 dark:text-slate-300 min-w-0 truncate">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: fillHex }} />
                            <span className="truncate">{cat.name}</span>
                          </span>
                          <span className="font-mono tabular-nums text-slate-900 dark:text-slate-100 font-semibold shrink-0">
                            {displayMoney(cat.value)}{' '}
                            <span className="text-[11px] font-normal text-slate-500">({formatPct(pct, 0)})</span>
                          </span>
                        </div>
                        <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-300 ease-out"
                            style={{ width: `${Math.min(100, pct * 100)}%`, backgroundColor: fillHex }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Atalhos Rápidos dos Hubs Unificados */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <button
          type="button"
          onClick={() => onNavigate('horizonte')}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex items-center justify-between gap-3 hover:bg-slate-50 transition-colors text-left cursor-pointer"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-slate-900 text-white flex items-center justify-center shrink-0">
              <CalendarRange className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">Horizonte de Gastos</p>
              <p className="text-xs text-slate-500 truncate">Projeção · Parcelas · Planejamento</p>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
        </button>

        <button
          type="button"
          onClick={() => onNavigate('economias')}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex items-center justify-between gap-3 hover:bg-slate-50 transition-colors text-left cursor-pointer"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <PiggyBank className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">Investimentos e Cofrinho</p>
              <p className="text-xs text-slate-500 truncate">
                {displayMoney(monthSummary.totalPatrimony)} acumulado
              </p>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
        </button>

        <button
          type="button"
          onClick={() => onNavigate('ia')}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex items-center justify-between gap-3 hover:bg-slate-50 transition-colors text-left cursor-pointer"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-400 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">Assistente IA e Voz</p>
              <p className="text-xs text-slate-500 truncate">Análise inteligente e comandos</p>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
        </button>
      </section>

      {/* Fluxo de Caixa Diário (final do Início ao rolar para baixo) */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Fluxo de caixa diário
            </h2>
            <p className="text-xs text-slate-500">
              Entradas, saídas, faturas e saldo projetado dia a dia ({formatDateBR(dailyCashFlow.startDateISO)} a{' '}
              {formatDateBR(dailyCashFlow.endDateISO)}).
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('horizonte')}
            className="text-xs font-semibold text-slate-500 hover:text-slate-900 inline-flex items-center gap-1 cursor-pointer shrink-0"
          >
            Abrir horizonte
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
              <p className="text-[11px] text-slate-500">Saldo inicial</p>
              <p className="text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-0.5">
                {displayMoney(dailyCashFlow.summary.startBalance)}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
              <p className="text-[11px] text-slate-500">Entradas (30d)</p>
              <p className="text-sm font-bold font-mono tabular-nums text-emerald-700 mt-0.5">
                + {displayMoney(dailyCashFlow.summary.totalEntries)}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
              <p className="text-[11px] text-slate-500">Saídas / Faturas (30d)</p>
              <p className="text-sm font-bold font-mono tabular-nums text-red-600 mt-0.5">
                − {displayMoney(dailyCashFlow.summary.totalExpenses)}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
              <p className="text-[11px] text-slate-500">Saldo final projetado</p>
              <p
                className={`text-sm font-bold font-mono tabular-nums mt-0.5 ${
                  dailyCashFlow.summary.endBalance < 0 ? 'text-red-600' : 'text-emerald-700'
                }`}
              >
                {displayMoney(dailyCashFlow.summary.endBalance)}
              </p>
            </div>
          </div>

          <div className="h-64 min-w-0 w-full duofin-chart-enter">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={dailyCashFlow.rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridStroke} vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: chartTheme.axisTick }}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={16}
                />
                <YAxis
                  width={52}
                  tick={{ fontSize: 10, fill: chartTheme.axisTick }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => (hideBalances ? '•••' : `R$${Math.round(v)}`)}
                />
                <Tooltip
                  formatter={(val: unknown, name: unknown) => [
                    hideBalances ? 'R$ •••••' : formatBRL(Number(val)),
                    String(name ?? ''),
                  ]}
                  contentStyle={chartTheme.tooltipStyle}
                />
                <Legend wrapperStyle={chartTheme.legendStyle} />
                <Bar {...CHART_ANIMATION} dataKey="entries" name="Entradas" fill={SEMANTIC_COLORS.positive} radius={[3, 3, 0, 0]} />
                <Bar {...CHART_ANIMATION} dataKey="expenses" name="Saídas / Faturas" fill={SEMANTIC_COLORS.negative} radius={[3, 3, 0, 0]} />
                <Line
                  {...CHART_ANIMATION}
                  type="monotone"
                  dataKey="projectedBalance"
                  name="Saldo acumulado"
                  stroke={dailyCashFlow.summary.endBalance < 0 ? SEMANTIC_COLORS.orangeDeep : SEMANTIC_COLORS.amber}
                  strokeWidth={2.2}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* Botão Flutuante de Novo Lançamento no Mobile */}
      <button
        type="button"
        onClick={onQuickAdd}
        aria-label="Novo lançamento"
        className="lg:hidden fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 w-14 h-14 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg flex items-center justify-center z-20 cursor-pointer active:scale-95 transition-transform"
      >
        <Plus className="w-6 h-6" />
      </button>

      {/* Modal da Calculadora Econômica Rápida (sem histórico) */}
      <QuickCalculatorModal open={calculatorOpen} onClose={() => setCalculatorOpen(false)} />

      {/* Modal Visual de Calendário e Agenda Financeira */}
      <HomeCalendarModal
        open={calendarOpen}
        onClose={() => setCalendarOpen(false)}
        selectedMonth={selectedMonth}
        onSelectMonth={setSelectedMonth}
        hideBalances={hideBalances}
        transactions={transactions}
        recurringItems={recurringItems}
        incomes={incomes}
        cards={cards}
        installments={installments}
        onQuickAdd={onQuickAdd}
        onEditTransaction={onEditTransaction}
        onNavigate={onNavigate}
        onSettleRecurring={settleRecurringItemForMonth}
        onToggleTransactionStatus={toggleTransactionStatus}
      />
    </div>
  );
}
