import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Calendar,
  CalendarClock,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Clock,
  Infinity as InfinityIcon,
  Layers,
  Plus,
  Search,
  ShoppingBag,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useFinance } from '../context/AuthHouseholdContext';
import { useTheme } from '../context/ThemeContext';
import type {
  AppRoute,
  HorizonScenarioRule,
  HorizonScenarioType,
  SimulatedPurchase,
  SimulatedPurchaseMode,
} from '../types/finance';
import { CHART_ANIMATION, getChartTheme, SEMANTIC_COLORS } from '../utils/chartColors';
import {
  addDaysISO,
  addMonthsToKey,
  computeFreeMoneyProjection,
  computeMonthCalendarData,
  computeShortHorizon,
  computeSpendingHorizon,
  computeWeeklyRollupFromShortHorizon,
  formatBRL,
  formatBRL0,
  formatDateBR,
  formatMonthFull,
  formatMonthShort,
  formatPct,
  getCurrentMonthKey,
  getHouseholdMembersList,
  getMonthKeysFromStart,
  getMonthKeysRange,
  getTodayISO,
  MAX_HORIZON_MONTHS,
  queryFreeMoneyAtDate,
} from '../utils/financeCalculations';
import { InstallmentsPage } from './InstallmentsPage';
import { PlannedPurchasesPage } from './PlannedPurchasesPage';
import { ScenariosPage } from './ScenariosPage';

export type HorizonHubTab = 'projecao' | 'parcelamentos' | 'compras' | 'cenarios';

interface HorizonPageProps {
  onNavigate: (route: AppRoute) => void;
  initialTab?: HorizonHubTab;
}

type HorizonRangePreset =
  | 'diarios'
  | 'semanais'
  | '30d'
  | '90d'
  | 'mensais'
  | 'trimestral'
  | '12m'
  | '24m'
  | '36m'
  | '60m'
  | '120m'
  | 'infinito'
  | 'custom';

type HorizonDataView = 'detalhamento' | 'timeline' | 'calendario';
type SimulatorComposerTab = 'cenarios' | 'compra';

const SCENARIO_TYPE_LABELS: Record<HorizonScenarioType, string> = {
  perda_renda: 'Perda de renda',
  aumento_renda: 'Aumento de renda',
  nova_despesa: 'Nova despesa',
  compra_parcelada: 'Compra parcelada',
  antecipacao_divida: 'Antecipação de dívida',
  alteracao_data_recebimento: 'Alteração de data de recebimento',
};

const WEEKDAY_HEADERS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export function HorizonPage({ onNavigate, initialTab = 'projecao' }: HorizonPageProps) {
  const {
    household,
    incomes,
    transactions,
    installments,
    recurringItems,
    cards,
    goals,
    plannedPurchases,
    bankAccounts,
  } = useFinance();
  const { isDark } = useTheme();
  const chartTheme = getChartTheme(isDark);

  const [hubTab, setHubTab] = useState<HorizonHubTab>(initialTab);
  useEffect(() => {
    setHubTab(initialTab);
  }, [initialTab]);

  const todayISO = getTodayISO();
  const currentMonth = getCurrentMonthKey();
  const nextMonth = useMemo(() => addMonthsToKey(currentMonth, 1), [currentMonth]);

  const [startMonth, setStartMonth] = useState<string>(currentMonth);
  const [preset, setPreset] = useState<HorizonRangePreset>('12m');
  const [customEndMonth, setCustomEndMonth] = useState<string>(addMonthsToKey(nextMonth, 35));
  const [infiniteMonthsCount, setInfiniteMonthsCount] = useState<number>(36);
  const [visibleRowsLimit, setVisibleRowsLimit] = useState<number>(36);
  const [onlyImpactRows, setOnlyImpactRows] = useState<boolean>(false);
  const [dataView, setDataView] = useState<HorizonDataView>('detalhamento');
  const [inspectedMonthKey, setInspectedMonthKey] = useState<string | null>(null);

  // Pergunta central: "Quanto dinheiro realmente estará disponível em determinada data?"
  const [targetQueryDate, setTargetQueryDate] = useState<string>(() => addDaysISO(todayISO, 30));

  // Calendário financeiro dentro do horizonte
  const [calendarMonthKey, setCalendarMonthKey] = useState<string>(currentMonth);
  const [selectedCalendarDateISO, setSelectedCalendarDateISO] = useState<string>(todayISO);

  // Simulador determinístico (6 tipos) + Simulador de novas compras
  const [composerTab, setComposerTab] = useState<SimulatorComposerTab>('cenarios');
  const [scenarioRules, setScenarioRules] = useState<HorizonScenarioRule[]>([]);
  const [scType, setScType] = useState<HorizonScenarioType>('perda_renda');
  const [scTitle, setScTitle] = useState('');
  const [scAmount, setScAmount] = useState('');
  const [scUsePct, setScUsePct] = useState(false);
  const [scStartMonth, setScStartMonth] = useState(currentMonth);
  const [scEndMonth, setScEndMonth] = useState('');
  const [scDay, setScDay] = useState('15');
  const [scInstallmentsCount, setScInstallmentsCount] = useState('6');
  const [scCardId, setScCardId] = useState('');
  const [scTargetIncomeId, setScTargetIncomeId] = useState('');
  const [scNewReceiptDay, setScNewReceiptDay] = useState('20');
  const [scTargetInstallmentId, setScTargetInstallmentId] = useState('');
  const [scAnticipateCount, setScAnticipateCount] = useState('');
  const [scIsRecurring, setScIsRecurring] = useState(true);

  const [simulatedPurchases, setSimulatedPurchases] = useState<SimulatedPurchase[]>([]);
  const [simDesc, setSimDesc] = useState('');
  const [simAmount, setSimAmount] = useState('');
  const [simMode, setSimMode] = useState<SimulatedPurchaseMode>('parcelado');
  const [simInstallments, setSimInstallments] = useState('12');
  const [simStartMonth, setSimStartMonth] = useState(currentMonth);
  const [simEndMonth, setSimEndMonth] = useState('');
  const [simDay, setSimDay] = useState('15');
  const [simCardId, setSimCardId] = useState('');

  const isDaily7Mode = preset === 'diarios';
  const isWeekly28Mode = preset === 'semanais';
  const is30dMode = preset === '30d';
  const is90dMode = preset === '90d';
  const isDailyWindowMode = isDaily7Mode || isWeekly28Mode || is30dMode || is90dMode;

  const dailyWindowDaysCount = isDaily7Mode ? 7 : isWeekly28Mode ? 28 : is30dMode ? 30 : 90;

  const monthKeys = useMemo(() => {
    switch (preset) {
      case 'diarios':
      case 'semanais':
      case '30d':
        return getMonthKeysFromStart(startMonth, 2);
      case '90d':
      case 'trimestral':
        return getMonthKeysFromStart(startMonth, 3);
      case 'mensais':
        return getMonthKeysFromStart(startMonth, 6);
      case '12m':
        return getMonthKeysFromStart(startMonth, 12);
      case '24m':
        return getMonthKeysFromStart(startMonth, 24);
      case '36m':
        return getMonthKeysFromStart(startMonth, 36);
      case '60m':
        return getMonthKeysFromStart(startMonth, 60);
      case '120m':
        return getMonthKeysFromStart(startMonth, 120);
      case 'infinito':
        return getMonthKeysFromStart(startMonth, infiniteMonthsCount);
      case 'custom':
        return getMonthKeysRange(startMonth, customEndMonth);
    }
  }, [preset, startMonth, customEndMonth, infiniteMonthsCount]);

  // Motor Prompt 4 — Projeção de Dinheiro Livre & Compromissos
  const freeMoneyProj = useMemo(
    () =>
      computeFreeMoneyProjection({
        mode: isDailyWindowMode ? 'daily' : 'monthly',
        count: isDailyWindowMode ? dailyWindowDaysCount : Math.min(60, monthKeys.length),
        startDateISO: todayISO,
        startMonthKey: startMonth,
        bankAccounts,
        incomes,
        transactions,
        installments,
        recurringItems,
        cards,
        goals,
        simulatedPurchases,
        scenarioRules,
      }),
    [
      isDailyWindowMode,
      dailyWindowDaysCount,
      monthKeys.length,
      todayISO,
      startMonth,
      bankAccounts,
      incomes,
      transactions,
      installments,
      recurringItems,
      cards,
      goals,
      simulatedPurchases,
      scenarioRules,
    ]
  );

  // Motor legado preservado para compatibilidade de gráficos mensais de faturas/sobra e modo 120m/infinito
  const shortHorizon = useMemo(() => {
    if (!isDailyWindowMode) return null;
    return computeShortHorizon({
      daysCount: dailyWindowDaysCount,
      startDateISO: todayISO,
      bankAccounts,
      incomes,
      transactions,
      installments,
      recurringItems,
      cards,
      simulatedPurchases,
    });
  }, [
    isDailyWindowMode,
    dailyWindowDaysCount,
    todayISO,
    bankAccounts,
    incomes,
    transactions,
    installments,
    recurringItems,
    cards,
    simulatedPurchases,
  ]);

  const weeklyHorizonRows = useMemo(() => {
    if (!isWeekly28Mode || !shortHorizon) return [];
    return computeWeeklyRollupFromShortHorizon(shortHorizon);
  }, [isWeekly28Mode, shortHorizon]);

  const horizon = useMemo(
    () =>
      computeSpendingHorizon({
        monthKeys,
        incomes,
        transactions,
        installments,
        recurringItems,
        cards,
        simulatedPurchases,
        bankAccounts,
      }),
    [monthKeys, incomes, transactions, installments, recurringItems, cards, simulatedPurchases, bankAccounts]
  );

  // Consulta direta por data: "Quanto dinheiro realmente estará disponível em determinada data?"
  const targetDateQuery = useMemo(
    () =>
      queryFreeMoneyAtDate({
        targetDateISO: targetQueryDate,
        startDateISO: todayISO,
        bankAccounts,
        incomes,
        transactions,
        installments,
        recurringItems,
        cards,
        goals,
        simulatedPurchases,
        scenarioRules,
      }),
    [
      targetQueryDate,
      todayISO,
      bankAccounts,
      incomes,
      transactions,
      installments,
      recurringItems,
      cards,
      goals,
      simulatedPurchases,
      scenarioRules,
    ]
  );

  // Amostra enxuta para gráficos longos
  const chartData = useMemo(() => {
    const rows = horizon.rows;
    if (rows.length <= 48) return rows;
    const step = Math.ceil(rows.length / 48);
    return rows.filter((_, idx) => idx % step === 0 || idx === rows.length - 1);
  }, [horizon.rows]);

  const freeMoneyChartData = useMemo(() => {
    if (isDailyWindowMode) {
      const pts = freeMoneyProj.dailyPoints;
      const step = pts.length > 45 ? Math.ceil(pts.length / 45) : 1;
      return pts
        .filter((_, idx) => idx % step === 0 || idx === pts.length - 1)
        .map((p) => ({
          label: p.label,
          projectedFreeMoney: p.projectedFreeMoney,
          entries: p.entries,
          expenses: p.expenses + p.reserves,
        }));
    }
    const pts = freeMoneyProj.monthlyPoints;
    const step = pts.length > 48 ? Math.ceil(pts.length / 48) : 1;
    return pts
      .filter((_, idx) => idx % step === 0 || idx === pts.length - 1)
      .map((p) => ({
        label: p.label,
        projectedFreeMoney: p.projectedFreeMoney,
        entries: p.receitasPrevistas,
        expenses: p.compromissosTotais + p.reservasPlanejadas,
      }));
  }, [isDailyWindowMode, freeMoneyProj.dailyPoints, freeMoneyProj.monthlyPoints]);

  const monthlyPointByKey = useMemo(() => {
    const map = new Map<string, (typeof freeMoneyProj.monthlyPoints)[number]>();
    for (const mp of freeMoneyProj.monthlyPoints) {
      map.set(mp.monthKey, mp);
    }
    return map;
  }, [freeMoneyProj.monthlyPoints]);

  const dailyPointByDate = useMemo(() => {
    const map = new Map<string, (typeof freeMoneyProj.dailyPoints)[number]>();
    for (const dp of freeMoneyProj.dailyPoints) {
      map.set(dp.dateISO, dp);
    }
    return map;
  }, [freeMoneyProj.dailyPoints]);

  const inspectedMonthPoint = useMemo(() => {
    if (!inspectedMonthKey) return null;
    return monthlyPointByKey.get(inspectedMonthKey) ?? null;
  }, [inspectedMonthKey, monthlyPointByKey]);

  const displayedRows = useMemo(() => {
    const filtered = onlyImpactRows
      ? horizon.rows.filter((r) => {
          const fm = monthlyPointByKey.get(r.monthKey);
          return r.simulatedPurchaseImpact > 0 || r.simulatedSurplus < 0 || r.hasPastMonthImpact || fm?.isCritical;
        })
      : horizon.rows;
    return filtered.slice(0, visibleRowsLimit);
  }, [horizon.rows, monthlyPointByKey, onlyImpactRows, visibleRowsLimit]);

  const displayedDailyPoints = useMemo(() => {
    const pts = freeMoneyProj.dailyPoints;
    return onlyImpactRows
      ? pts.filter((r) => r.entries > 0 || r.expenses > 0 || r.reserves > 0 || r.projectedFreeMoney < 0)
      : pts;
  }, [freeMoneyProj.dailyPoints, onlyImpactRows]);

  // Calendário Financeiro do mês escolhido
  const calendarData = useMemo(
    () =>
      computeMonthCalendarData({
        monthKey: calendarMonthKey,
        transactions,
        recurringItems,
        incomes,
        cards,
        installments,
      }),
    [calendarMonthKey, transactions, recurringItems, incomes, cards, installments]
  );

  const selectedDayCalendarSummary = calendarData.daySummaries[selectedCalendarDateISO];
  const selectedDayProjectedPoint = dailyPointByDate.get(selectedCalendarDateISO);

  const pendingPlanned = useMemo(
    () => plannedPurchases.filter((p) => p.status === 'Pendente' || p.status === 'Pesquisando'),
    [plannedPurchases]
  );

  const activeIncomesList = useMemo(() => incomes.filter((i) => i.active && i.amount > 0), [incomes]);
  const activeCardsList = useMemo(() => cards.filter((c) => c.active), [cards]);
  const openInstallmentsList = useMemo(
    () => installments.filter((i) => i.status !== 'Cancelado' && i.status !== 'Quitado'),
    [installments]
  );

  // Handlers
  const handleAddScenarioRule = (e: React.FormEvent) => {
    e.preventDefault();
    const numeric = Number(scAmount.replace(',', '.')) || 0;

    if (scType === 'perda_renda' || scType === 'aumento_renda' || scType === 'nova_despesa' || scType === 'compra_parcelada') {
      if (numeric <= 0) return;
    }

    if (scType === 'antecipacao_divida' && !scTargetInstallmentId && numeric <= 0) {
      return;
    }

    const chosenIncome = activeIncomesList.find((i) => i.id === (scTargetIncomeId || activeIncomesList[0]?.id));
    const chosenInst = openInstallmentsList.find((i) => i.id === scTargetInstallmentId);

    const autoTitle =
      scTitle.trim() ||
      (scType === 'alteracao_data_recebimento'
        ? `Mudança de data: ${chosenIncome?.source || 'Renda'} → dia ${scNewReceiptDay}`
        : scType === 'antecipacao_divida'
          ? `Antecipação: ${chosenInst?.description || 'Parcelamento'}`
          : SCENARIO_TYPE_LABELS[scType]);

    const newRule: HorizonScenarioRule = {
      id: `sc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: scType,
      title: autoTitle,
      enabled: true,
      amount: Math.round(numeric * 100) / 100,
      usePercentage: (scType === 'perda_renda' || scType === 'aumento_renda') && scUsePct,
      startMonthKey: scStartMonth || currentMonth,
      endMonthKey:
        scType === 'compra_parcelada' || scType === 'antecipacao_divida'
          ? ''
          : scType === 'nova_despesa' && !scIsRecurring
            ? scStartMonth || currentMonth
            : scEndMonth,
      dayOfMonth: Math.max(1, Math.min(31, Math.round(Number(scDay) || 15))),
      installmentsCount:
        scType === 'compra_parcelada' ? Math.max(1, Math.min(120, Math.round(Number(scInstallmentsCount) || 6))) : undefined,
      cardId: scType === 'nova_despesa' || scType === 'compra_parcelada' ? scCardId : '',
      targetIncomeId:
        scType === 'alteracao_data_recebimento' || scType === 'perda_renda'
          ? scTargetIncomeId || chosenIncome?.id || ''
          : '',
      newReceiptDay:
        scType === 'alteracao_data_recebimento'
          ? Math.max(1, Math.min(31, Math.round(Number(scNewReceiptDay) || 20)))
          : undefined,
      targetInstallmentId: scType === 'antecipacao_divida' ? scTargetInstallmentId : '',
      anticipateCount:
        scType === 'antecipacao_divida' && Number(scAnticipateCount) > 0
          ? Math.round(Number(scAnticipateCount))
          : undefined,
      isRecurringExpense: scType === 'nova_despesa' ? scIsRecurring : undefined,
    };

    setScenarioRules((prev) => [...prev, newRule]);
    setScTitle('');
    setScAmount('');
  };

  const toggleScenarioRule = (id: string) => {
    setScenarioRules((prev) => prev.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)));
  };

  const removeScenarioRule = (id: string) => {
    setScenarioRules((prev) => prev.filter((r) => r.id !== id));
  };

  const handleAddSimulated = (e: React.FormEvent) => {
    e.preventDefault();
    const numeric = Number(simAmount.replace(',', '.'));
    if (!simDesc.trim() || !Number.isFinite(numeric) || numeric <= 0) return;

    const newItem: SimulatedPurchase = {
      id: `sim-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      description: simDesc.trim(),
      totalAmount: Math.round(numeric * 100) / 100,
      mode: simMode,
      installmentsCount: simMode === 'parcelado' ? Math.max(1, Math.min(120, Math.round(Number(simInstallments) || 1))) : 1,
      startMonthKey: simStartMonth || startMonth,
      endMonthKey: simMode === 'fixo' ? simEndMonth : '',
      purchaseDay: Math.max(1, Math.min(31, Math.round(Number(simDay) || 15))),
      cardId: simMode === 'fixo' ? '' : simCardId,
      enabled: true,
    };

    setSimulatedPurchases((prev) => [...prev, newItem]);
    setSimDesc('');
    setSimAmount('');
  };

  const handleImportPlanned = (purchaseId: string) => {
    const item = pendingPlanned.find((p) => p.id === purchaseId);
    if (!item) return;
    const total = Math.max(1, item.quantity) * (item.hasActualPrice ? item.actualUnitPrice : item.estimatedUnitPrice);
    setComposerTab('compra');
    setSimDesc(item.product);
    setSimAmount(String(total.toFixed(2)));
    setSimMode('parcelado');
    setSimInstallments('10');
    if (item.targetDate && item.targetDate.length >= 7) {
      setSimStartMonth(item.targetDate.slice(0, 7));
    }
  };

  const toggleSimulated = (id: string) => {
    setSimulatedPurchases((prev) => prev.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s)));
  };

  const removeSimulated = (id: string) => {
    setSimulatedPurchases((prev) => prev.filter((s) => s.id !== id));
  };

  const handleExpandInfinite = (extraMonths: number) => {
    const next = Math.min(MAX_HORIZON_MONTHS, infiniteMonthsCount + extraMonths);
    setInfiniteMonthsCount(next);
    setVisibleRowsLimit((prev) => Math.max(prev, next));
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho Unificado do Hub Horizonte de Gastos */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Horizonte Financeiro &amp; Dinheiro Livre
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Projeção real de fluxo de caixa, datas de recebimento e vencimento, reservas e cenários determinísticos.
          </p>
        </div>
      </div>

      {/* Abas Agrupadas do Hub */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-800">
        {(
          [
            { id: 'projecao', label: 'Projeção & Dinheiro Livre', icon: CalendarRange },
            { id: 'parcelamentos', label: 'Parcelamentos', icon: CalendarClock },
            { id: 'compras', label: 'Compras e Projetos', icon: ShoppingBag },
            { id: 'cenarios', label: 'Cenários Salvos', icon: SlidersHorizontal },
          ] as Array<{ id: HorizonHubTab; label: string; icon: React.ComponentType<{ className?: string }> }>
        ).map((tab) => {
          const Icon = tab.icon;
          const active = hubTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setHubTab(tab.id)}
              className={`min-h-[42px] px-2.5 py-2 rounded-xl text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                active
                  ? 'bg-slate-900 dark:bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {hubTab === 'parcelamentos' && (
        <div key="parcelamentos" className="duofin-tab-enter">
          <InstallmentsPage embedded />
        </div>
      )}
      {hubTab === 'compras' && (
        <div key="compras" className="duofin-tab-enter">
          <PlannedPurchasesPage embedded />
        </div>
      )}
      {hubTab === 'cenarios' && (
        <div key="cenarios" className="duofin-tab-enter">
          <ScenariosPage embedded />
        </div>
      )}

      {hubTab === 'projecao' && (
        <div key="projecao" className="duofin-tab-enter space-y-6">
          {/* 1. Controles de Período (30d, 90d, 12m, 24m, 36m + legado Diários/Semanais/Mensais/Trimestral/60m/120m/∞) */}
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CalendarRange className="w-4 h-4 text-slate-600 dark:text-slate-400 shrink-0" />
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Janela de projeção financeira
                </h2>
              </div>
              <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                {isDailyWindowMode
                  ? `${formatDateBR(freeMoneyProj.startDateISO)} → ${formatDateBR(freeMoneyProj.endDateISO)} · ${dailyWindowDaysCount} dias`
                  : `${formatMonthShort(horizon.summary.horizonStart)} → ${formatMonthShort(horizon.summary.horizonEnd)} · ${horizon.summary.monthsCount} meses`}
              </span>
            </div>

            <div className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    { id: '30d', label: '30 dias' },
                    { id: '90d', label: '90 dias' },
                    { id: '12m', label: '12 meses' },
                    { id: '24m', label: '24 meses' },
                    { id: '36m', label: '36 meses' },
                    { id: 'diarios', label: '7 dias' },
                    { id: 'semanais', label: '4 semanas' },
                    { id: 'mensais', label: '6 meses' },
                    { id: 'trimestral', label: 'Trimestral' },
                    { id: '60m', label: '5 anos' },
                    { id: 'infinito', label: 'Infinito ∞' },
                    { id: 'custom', label: 'Personalizado' },
                  ] as Array<{ id: HorizonRangePreset; label: string }>
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setPreset(opt.id);
                      if (opt.id === 'custom' && customEndMonth < startMonth) {
                        setCustomEndMonth(addMonthsToKey(startMonth, 23));
                      }
                    }}
                    className={`min-h-[36px] px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                      preset === opt.id
                        ? 'bg-slate-900 dark:bg-emerald-600 text-white border-slate-900 dark:border-emerald-600'
                        : 'bg-slate-50 dark:bg-slate-800/70 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {!isDailyWindowMode && (
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end pt-1">
                  <div className="md:col-span-4 space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Mês inicial</label>
                      <div className="flex items-center gap-2 text-[11px]">
                        <button
                          type="button"
                          onClick={() => setStartMonth(currentMonth)}
                          className={`font-semibold cursor-pointer ${
                            startMonth === currentMonth
                              ? 'text-slate-900 dark:text-slate-100 underline'
                              : 'text-slate-500 hover:underline'
                          }`}
                        >
                          Atual ({formatMonthShort(currentMonth)})
                        </button>
                        <button
                          type="button"
                          onClick={() => setStartMonth(nextMonth)}
                          className={`font-semibold cursor-pointer ${
                            startMonth === nextMonth
                              ? 'text-slate-900 dark:text-slate-100 underline'
                              : 'text-sky-700 dark:text-sky-400 hover:underline'
                          }`}
                        >
                          Próx. ({formatMonthShort(nextMonth)})
                        </button>
                      </div>
                    </div>
                    <input
                      type="month"
                      value={startMonth}
                      onChange={(e) => e.target.value && setStartMonth(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                    />
                  </div>

                  <div className="md:col-span-8 space-y-1">
                    {preset === 'custom' ? (
                      <>
                        <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Mês final (livre)</label>
                        <input
                          type="month"
                          min={startMonth}
                          value={customEndMonth}
                          onChange={(e) => e.target.value && setCustomEndMonth(e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                        />
                      </>
                    ) : preset === 'infinito' ? (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => handleExpandInfinite(12)}
                          disabled={infiniteMonthsCount >= MAX_HORIZON_MONTHS}
                          className="min-h-[38px] px-3 py-1.5 text-xs font-semibold bg-sky-50 dark:bg-sky-950/40 text-sky-900 dark:text-sky-300 border border-sky-200 dark:border-sky-800 rounded-lg hover:bg-sky-100 disabled:opacity-50 cursor-pointer whitespace-nowrap"
                        >
                          +12 meses
                        </button>
                        <button
                          type="button"
                          onClick={() => handleExpandInfinite(60)}
                          disabled={infiniteMonthsCount >= MAX_HORIZON_MONTHS}
                          className="min-h-[38px] px-3 py-1.5 text-xs font-semibold bg-sky-50 dark:bg-sky-950/40 text-sky-900 dark:text-sky-300 border border-sky-200 dark:border-sky-800 rounded-lg hover:bg-sky-100 disabled:opacity-50 cursor-pointer whitespace-nowrap"
                        >
                          +5 anos
                        </button>
                      </div>
                    ) : (
                      <div className="h-[38px] px-3 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-lg">
                        <span>Projeção até {formatMonthFull(horizon.summary.horizonEnd)}</span>
                        {horizon.summary.monthsCount > 60 && (
                          <span className="text-[11px] text-slate-400">Dinheiro livre diário detalhado até 60 meses</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* 2. Resposta Direta por Data Alvo: "Quanto dinheiro realmente estará disponível em determinada data?" */}
          <section className="bg-slate-900 dark:bg-slate-950 text-white border border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="space-y-1">
                <span className="text-xs font-medium text-slate-300">
                  Consulta direta de liquidez em data específica
                </span>
                <h2 className="text-lg font-bold tracking-tight text-white">
                  Quanto dinheiro realmente estará disponível em{' '}
                  <span className="text-emerald-300 font-mono tabular-nums">{formatDateBR(targetDateQuery.targetDateISO)}</span>?
                </h2>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="date"
                    min={todayISO}
                    max={addDaysISO(todayISO, 1095)}
                    value={targetQueryDate}
                    onChange={(e) => e.target.value && setTargetQueryDate(e.target.value)}
                    aria-label="Data para consultar dinheiro livre"
                    className="pl-8 pr-3 py-1.5 text-xs font-mono tabular-nums bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-400"
                  />
                </div>
                {(
                  [
                    { label: '+7d', days: 7 },
                    { label: '+30d', days: 30 },
                    { label: '+90d', days: 90 },
                    { label: '+180d', days: 180 },
                    { label: '+365d', days: 365 },
                  ] as Array<{ label: string; days: number }>
                ).map((q) => {
                  const d = addDaysISO(todayISO, q.days);
                  const active = targetQueryDate === d;
                  return (
                    <button
                      key={q.label}
                      type="button"
                      onClick={() => setTargetQueryDate(d)}
                      className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg border cursor-pointer transition-colors whitespace-nowrap ${
                        active
                          ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                          : 'bg-slate-800/80 text-slate-200 border-slate-700 hover:bg-slate-700'
                      }`}
                    >
                      {q.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-2 border-t border-slate-800">
              <div>
                <span className="text-[11px] text-slate-400 block">Saldo bancário atual</span>
                <span className="text-base font-bold font-mono tabular-nums text-white">
                  {formatBRL(targetDateQuery.saldoBancarioReal)}
                </span>
              </div>
              <div>
                <span className="text-[11px] text-slate-400 block">+ Entradas previstas</span>
                <span className="text-base font-bold font-mono tabular-nums text-emerald-300">
                  +{formatBRL(targetDateQuery.entradasPrevistasAteData)}
                </span>
              </div>
              <div>
                <span className="text-[11px] text-slate-400 block">− Compromissos futuros</span>
                <span className="text-base font-bold font-mono tabular-nums text-rose-300">
                  −{formatBRL(targetDateQuery.compromissosFuturosAteData)}
                </span>
              </div>
              <div>
                <span className="text-[11px] text-slate-400 block">− Reservas planejadas</span>
                <span className="text-base font-bold font-mono tabular-nums text-amber-300">
                  −{formatBRL(targetDateQuery.reservasPlanejadasAteData)}
                </span>
              </div>
              <div className="col-span-2 sm:col-span-1 sm:text-right">
                <span className="text-[11px] text-slate-300 block font-medium">
                  = Dinheiro livre em {formatDateBR(targetDateQuery.targetDateISO)}
                </span>
                <span
                  className={`text-xl font-bold font-mono tabular-nums ${
                    targetDateQuery.dinheiroLivreProjetado < 0 ? 'text-rose-400' : 'text-emerald-400'
                  }`}
                >
                  {formatBRL(targetDateQuery.dinheiroLivreProjetado)}
                </span>
              </div>
            </div>

            {targetDateQuery.minimumBeforeTargetDate.projectedFreeMoney < 0 && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-950/60 border border-rose-800/80 text-xs text-rose-200">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>
                  Atenção: antes dessa data o saldo livre passa por um vale de{' '}
                  <strong className="font-mono tabular-nums text-rose-300">
                    {formatBRL(targetDateQuery.minimumBeforeTargetDate.projectedFreeMoney)}
                  </strong>{' '}
                  em {formatDateBR(targetDateQuery.minimumBeforeTargetDate.dateISO)} (antes de novos recebimentos).
                </span>
              </div>
            )}
          </section>

          {/* 3. Painel das 10 Dimensões Diferenciadas */}
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                  Posição Realizada
                </h3>
                {!freeMoneyProj.hasBankAccounts && (
                  <button
                    type="button"
                    onClick={() => onNavigate('config')}
                    className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 underline cursor-pointer"
                  >
                    Cadastrar contas
                  </button>
                )}
              </div>
              <dl className="space-y-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-slate-600 dark:text-slate-300">Saldo bancário real</dt>
                  <dd className="font-mono tabular-nums font-bold text-slate-900 dark:text-slate-100">
                    {formatBRL(freeMoneyProj.dimensions.saldoBancarioReal)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-slate-600 dark:text-slate-300">Receitas já recebidas (mês atual)</dt>
                  <dd className="font-mono tabular-nums font-semibold text-emerald-700 dark:text-emerald-400">
                    +{formatBRL(freeMoneyProj.dimensions.receitasRecebidas)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-slate-600 dark:text-slate-300">Despesas já pagas (mês atual)</dt>
                  <dd className="font-mono tabular-nums font-semibold text-slate-700 dark:text-slate-300">
                    −{formatBRL(freeMoneyProj.dimensions.despesasPagas)}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5 space-y-3">
              <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                Previsto &amp; Compromissos no Horizonte
              </h3>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-slate-600 dark:text-slate-300">Receitas previstas</dt>
                  <dd className="font-mono tabular-nums font-semibold text-emerald-700 dark:text-emerald-400">
                    +{formatBRL0(freeMoneyProj.dimensions.receitasPrevistas)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-slate-600 dark:text-slate-300">Despesas pendentes</dt>
                  <dd className="font-mono tabular-nums font-semibold text-rose-600 dark:text-rose-400">
                    {formatBRL0(freeMoneyProj.dimensions.despesasPendentes)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-slate-600 dark:text-slate-300">Despesas recorrentes</dt>
                  <dd className="font-mono tabular-nums font-semibold text-slate-800 dark:text-slate-200">
                    {formatBRL0(freeMoneyProj.dimensions.despesasRecorrentes)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-slate-600 dark:text-slate-300">Faturas futuras</dt>
                  <dd className="font-mono tabular-nums font-semibold text-orange-700 dark:text-orange-400">
                    {formatBRL0(freeMoneyProj.dimensions.faturasFuturas)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2 sm:col-span-2 pt-1 border-t border-slate-100 dark:border-slate-800">
                  <dt className="text-slate-600 dark:text-slate-300">Parcelamentos incluídos nas faturas/período</dt>
                  <dd className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                    {formatBRL(freeMoneyProj.dimensions.parcelamentos)}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                  Reservas &amp; Dinheiro Livre Final
                </h3>
                <InfinityIcon className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              </div>
              <dl className="space-y-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-slate-600 dark:text-slate-300">Reservas atuais + planejadas</dt>
                  <dd className="font-mono tabular-nums font-semibold text-amber-700 dark:text-amber-400">
                    {formatBRL(freeMoneyProj.dimensions.reservasFinanceiras)}{' '}
                    <span className="text-[11px] font-normal text-slate-400">
                      ({formatBRL0(freeMoneyProj.dimensions.reservasPlanejadas)} futuras)
                    </span>
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-slate-600 dark:text-slate-300">Compromissos futuros totais</dt>
                  <dd className="font-mono tabular-nums font-semibold text-rose-600 dark:text-rose-400">
                    −{formatBRL(freeMoneyProj.dimensions.compromissosFuturos)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-slate-100 dark:border-slate-800">
                  <dt className="font-semibold text-slate-900 dark:text-slate-100">Dinheiro livre ao fim da janela</dt>
                  <dd
                    className={`font-mono tabular-nums text-base font-bold ${
                      freeMoneyProj.dimensions.dinheiroLivreProjetado < 0
                        ? 'text-rose-600 dark:text-rose-400'
                        : 'text-emerald-700 dark:text-emerald-400'
                    }`}
                  >
                    {formatBRL(freeMoneyProj.dimensions.dinheiroLivreProjetado)}
                  </dd>
                </div>
              </dl>
            </div>
          </section>

          {/* 4. Alertas de Saldo Negativo, Offset de Saldo Atual & Meses Críticos */}
          {(freeMoneyProj.negativeAlerts.length > 0 ||
            freeMoneyProj.criticalMonths.length > 0 ||
            horizon.summary.negativeBalanceOffset.negativeBalanceDebt > 0) && (
            <section className="space-y-2.5">
              {horizon.summary.negativeBalanceOffset.negativeBalanceDebt > 0 && (
                <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 flex flex-wrap items-center justify-between gap-2">
                  <span>
                    Saldo atual negativo de{' '}
                    <strong className="font-mono tabular-nums">
                      −{formatBRL(horizon.summary.negativeBalanceOffset.negativeBalanceDebt)}
                    </strong>{' '}
                    descontado automaticamente da próxima entrada de renda fixa
                    {horizon.summary.negativeBalanceOffset.firstImpactedEvent
                      ? ` (${horizon.summary.negativeBalanceOffset.firstImpactedEvent.title} em ${formatDateBR(
                          horizon.summary.negativeBalanceOffset.firstImpactedEvent.dateISO
                        )})`
                      : ''}
                    .
                  </span>
                </div>
              )}

              {(freeMoneyProj.negativeAlerts.length > 0 || freeMoneyProj.criticalMonths.length > 0) && (
                <div className="p-4 rounded-xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs font-semibold text-rose-900 dark:text-rose-200">
                      <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                      <span>
                        Alertas de liquidez e meses críticos ({freeMoneyProj.negativeAlerts.length} alerta(s) de saldo negativo ·{' '}
                        {freeMoneyProj.criticalMonths.length} mês(es) crítico(s))
                      </span>
                    </div>
                    <span className="text-[11px] font-mono tabular-nums text-rose-700 dark:text-rose-300">
                      Ponto mínimo: {formatBRL(freeMoneyProj.lowestPoint.projectedFreeMoney)} ({freeMoneyProj.lowestPoint.label})
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {freeMoneyProj.negativeAlerts.slice(0, 4).map((al) => (
                      <div
                        key={al.dateISO}
                        className="px-2.5 py-1.5 rounded-lg bg-white/90 dark:bg-slate-900 border border-rose-200 dark:border-rose-800 text-xs text-rose-800 dark:text-rose-200 font-mono tabular-nums"
                      >
                        {formatDateBR(al.dateISO)}: {formatBRL(al.projectedFreeMoney)}
                      </div>
                    ))}
                    {freeMoneyProj.criticalMonths.slice(0, 4).map((cm) => (
                      <button
                        key={cm.monthKey}
                        type="button"
                        onClick={() => {
                          setDataView('detalhamento');
                          setInspectedMonthKey(cm.monthKey);
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 hover:bg-amber-100 cursor-pointer"
                      >
                        {cm.label}: {cm.criticalReasons[0] ?? 'Atenção'}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          {/* 5. Coluna Esquerda: Simulador de 6 Cenários + Nova Compra | Coluna Direita: Gráficos */}
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 min-w-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Simulador do Horizonte</h2>
                <div className="flex items-center gap-1 p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setComposerTab('cenarios')}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-md cursor-pointer whitespace-nowrap ${
                      composerTab === 'cenarios'
                        ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    6 Cenários
                  </button>
                  <button
                    type="button"
                    onClick={() => setComposerTab('compra')}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-md cursor-pointer whitespace-nowrap ${
                      composerTab === 'compra'
                        ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    Compra Rápida
                  </button>
                </div>
              </div>

              {composerTab === 'cenarios' ? (
                <form onSubmit={handleAddScenarioRule} className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Tipo de cenário determinístico
                    </label>
                    <select
                      value={scType}
                      onChange={(e) => setScType(e.target.value as HorizonScenarioType)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                    >
                      {(Object.keys(SCENARIO_TYPE_LABELS) as HorizonScenarioType[]).map((t) => (
                        <option key={t} value={t}>
                          {SCENARIO_TYPE_LABELS[t]}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Rótulo do cenário (opcional)
                    </label>
                    <input
                      type="text"
                      maxLength={80}
                      value={scTitle}
                      onChange={(e) => setScTitle(e.target.value)}
                      placeholder={`Ex.: ${SCENARIO_TYPE_LABELS[scType]}`}
                      className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                    />
                  </div>

                  {(scType === 'perda_renda' || scType === 'alteracao_data_recebimento') && activeIncomesList.length > 0 && (
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Renda impactada
                      </label>
                      <select
                        value={scTargetIncomeId}
                        onChange={(e) => setScTargetIncomeId(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                      >
                        {scType === 'perda_renda' && <option value="">Todas as rendas ativas</option>}
                        {activeIncomesList.map((inc) => (
                          <option key={inc.id} value={inc.id}>
                            {inc.source} ({inc.person} · dia {inc.receiptDay} · {formatBRL0(inc.amount)})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {scType === 'alteracao_data_recebimento' ? (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                          Novo dia de recebimento
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="31"
                          required
                          value={scNewReceiptDay}
                          onChange={(e) => setScNewReceiptDay(e.target.value)}
                          className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                          A partir do mês
                        </label>
                        <input
                          type="month"
                          value={scStartMonth}
                          onChange={(e) => setScStartMonth(e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                        />
                      </div>
                    </div>
                  ) : scType === 'antecipacao_divida' ? (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                          Parcelamento a antecipar
                        </label>
                        <select
                          value={scTargetInstallmentId}
                          onChange={(e) => setScTargetInstallmentId(e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                        >
                          <option value="">Antecipação avulsa (informar valor)</option>
                          {openInstallmentsList.map((inst) => (
                            <option key={inst.id} value={inst.id}>
                              {inst.description} ({inst.installmentsCount}x · total {formatBRL0(inst.totalAmount)})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                            Qtde. parcelas (vazio = todas)
                          </label>
                          <input
                            type="number"
                            min="1"
                            max="120"
                            value={scAnticipateCount}
                            onChange={(e) => setScAnticipateCount(e.target.value)}
                            placeholder="Todas restantes"
                            className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                            Valor pago c/ desconto (R$)
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={scAmount}
                            onChange={(e) => setScAmount(e.target.value)}
                            placeholder="0 = nominal"
                            className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                            Mês da quitação
                          </label>
                          <input
                            type="month"
                            value={scStartMonth}
                            onChange={(e) => setScStartMonth(e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Dia do débito</label>
                          <input
                            type="number"
                            min="1"
                            max="31"
                            value={scDay}
                            onChange={(e) => setScDay(e.target.value)}
                            className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                            {scUsePct && (scType === 'perda_renda' || scType === 'aumento_renda')
                              ? 'Percentual (%)'
                              : scType === 'compra_parcelada'
                                ? 'Valor total (R$)'
                                : 'Valor mensal (R$)'}
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            required
                            value={scAmount}
                            onChange={(e) => setScAmount(e.target.value)}
                            placeholder="0,00"
                            className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                          />
                        </div>

                        {scType === 'perda_renda' || scType === 'aumento_renda' ? (
                          <div className="flex items-end pb-2">
                            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={scUsePct}
                                onChange={(e) => setScUsePct(e.target.checked)}
                                className="w-4 h-4 rounded border-slate-300"
                              />
                              Calcular em % sobre renda
                            </label>
                          </div>
                        ) : scType === 'compra_parcelada' ? (
                          <div>
                            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                              Parcelas
                            </label>
                            <input
                              type="number"
                              min="1"
                              max="120"
                              value={scInstallmentsCount}
                              onChange={(e) => setScInstallmentsCount(e.target.value)}
                              className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                            />
                          </div>
                        ) : (
                          <div className="flex items-end pb-2">
                            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={scIsRecurring}
                                onChange={(e) => setScIsRecurring(e.target.checked)}
                                className="w-4 h-4 rounded border-slate-300"
                              />
                              Despesa recorrente mensal
                            </label>
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                            Mês inicial
                          </label>
                          <input
                            type="month"
                            value={scStartMonth}
                            onChange={(e) => setScStartMonth(e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                          />
                        </div>
                        {scType === 'compra_parcelada' || (scType === 'nova_despesa' && !scIsRecurring) ? (
                          <div>
                            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                              Dia do evento
                            </label>
                            <input
                              type="number"
                              min="1"
                              max="31"
                              value={scDay}
                              onChange={(e) => setScDay(e.target.value)}
                              className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                            />
                          </div>
                        ) : (
                          <div>
                            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                              Mês final (opcional)
                            </label>
                            <input
                              type="month"
                              value={scEndMonth}
                              onChange={(e) => setScEndMonth(e.target.value)}
                              className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                            />
                          </div>
                        )}
                      </div>

                      {(scType === 'nova_despesa' || scType === 'compra_parcelada') && activeCardsList.length > 0 && (
                        <div>
                          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                            Cartão (respeita fechamento/vencimento)
                          </label>
                          <select
                            value={scCardId}
                            onChange={(e) => setScCardId(e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                          >
                            <option value="">Sem cartão (saída direta em conta)</option>
                            {activeCardsList.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name} (fecha dia {c.closingDay} · vence dia {c.dueDay})
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </>
                  )}

                  <button
                    type="submit"
                    className="w-full min-h-[42px] inline-flex items-center justify-center gap-2 px-4 py-2 bg-slate-900 dark:bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-slate-800 dark:hover:bg-emerald-500 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    Aplicar Cenário no Fluxo
                  </button>
                </form>
              ) : (
                <form onSubmit={handleAddSimulated} className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Descrição da compra
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={80}
                      value={simDesc}
                      onChange={(e) => setSimDesc(e.target.value)}
                      placeholder="Ex.: Geladeira, Viagem, Sofá..."
                      className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        {simMode === 'fixo' ? 'Valor mensal (R$)' : 'Valor total (R$)'}
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        required
                        value={simAmount}
                        onChange={(e) => setSimAmount(e.target.value)}
                        placeholder="0,00"
                        className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Modalidade</label>
                      <select
                        value={simMode}
                        onChange={(e) => setSimMode(e.target.value as SimulatedPurchaseMode)}
                        className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                      >
                        <option value="parcelado">Parcelado (Nx)</option>
                        <option value="avista">À vista (1x)</option>
                        <option value="fixo">Gasto fixo contínuo</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Mês da compra
                      </label>
                      <input
                        type="month"
                        value={simStartMonth}
                        onChange={(e) => setSimStartMonth(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                      />
                    </div>

                    {simMode === 'parcelado' ? (
                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Parcelas</label>
                        <input
                          type="number"
                          min="1"
                          max="120"
                          value={simInstallments}
                          onChange={(e) => setSimInstallments(e.target.value)}
                          className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                        />
                      </div>
                    ) : simMode === 'fixo' ? (
                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                          Mês final (opcional)
                        </label>
                        <input
                          type="month"
                          value={simEndMonth}
                          onChange={(e) => setSimEndMonth(e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                        />
                      </div>
                    ) : (
                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                          Dia da compra
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="31"
                          value={simDay}
                          onChange={(e) => setSimDay(e.target.value)}
                          className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                        />
                      </div>
                    )}
                  </div>

                  {simMode !== 'fixo' && activeCardsList.length > 0 && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                          Cartão (fechamento)
                        </label>
                        <select
                          value={simCardId}
                          onChange={(e) => setSimCardId(e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                        >
                          <option value="">Sem cartão</option>
                          {activeCardsList.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name} (dia {c.closingDay})
                            </option>
                          ))}
                        </select>
                      </div>
                      {simMode === 'parcelado' && (
                        <div>
                          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                            Dia da compra
                          </label>
                          <input
                            type="number"
                            min="1"
                            max="31"
                            value={simDay}
                            onChange={(e) => setSimDay(e.target.value)}
                            className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                          />
                        </div>
                      )}
                    </div>
                  )}

                  <button
                    type="submit"
                    className="w-full min-h-[42px] inline-flex items-center justify-center gap-2 px-4 py-2 bg-slate-900 dark:bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-slate-800 dark:hover:bg-emerald-500 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    Adicionar Compra Simulada
                  </button>
                </form>
              )}

              {pendingPlanned.length > 0 && (
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                    <ShoppingBag className="w-3.5 h-3.5 text-slate-500" />
                    Importar das Compras Planejadas:
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {pendingPlanned.slice(0, 4).map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => handleImportPlanned(p.id)}
                        className="px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200 cursor-pointer truncate max-w-full"
                      >
                        + {p.product} ({formatBRL0(p.estimatedUnitPrice * p.quantity)})
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Lista de Cenários & Compras Ativas */}
              {(scenarioRules.length > 0 || simulatedPurchases.length > 0) && (
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                      Simulações ativas ({scenarioRules.length + simulatedPurchases.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setScenarioRules([]);
                        setSimulatedPurchases([]);
                      }}
                      className="text-xs text-slate-500 hover:text-rose-600 cursor-pointer"
                    >
                      Limpar tudo
                    </button>
                  </div>

                  <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                    {scenarioRules.map((rule) => (
                      <div
                        key={rule.id}
                        className={`p-2.5 rounded-lg border flex items-center justify-between gap-2 ${
                          rule.enabled
                            ? 'bg-sky-50/60 dark:bg-sky-950/30 border-sky-200 dark:border-sky-800'
                            : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800 opacity-60'
                        }`}
                      >
                        <label className="flex items-start gap-2 min-w-0 flex-1 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={rule.enabled}
                            onChange={() => toggleScenarioRule(rule.id)}
                            className="mt-0.5 w-4 h-4 rounded border-slate-300"
                          />
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">{rule.title}</p>
                            <p className="text-[11px] text-slate-600 dark:text-slate-400">
                              {SCENARIO_TYPE_LABELS[rule.type]} · {formatMonthShort(rule.startMonthKey)}
                              {rule.amount > 0
                                ? ` · ${rule.usePercentage ? `${rule.amount}%` : formatBRL(rule.amount)}`
                                : ''}
                            </p>
                          </div>
                        </label>
                        <button
                          type="button"
                          onClick={() => removeScenarioRule(rule.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer shrink-0"
                          aria-label="Remover cenário"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}

                    {simulatedPurchases.map((sim) => (
                      <div
                        key={sim.id}
                        className={`p-2.5 rounded-lg border flex items-center justify-between gap-2 ${
                          sim.enabled
                            ? 'bg-amber-50/60 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800'
                            : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800 opacity-60'
                        }`}
                      >
                        <label className="flex items-start gap-2 min-w-0 flex-1 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={sim.enabled}
                            onChange={() => toggleSimulated(sim.id)}
                            className="mt-0.5 w-4 h-4 rounded border-slate-300"
                          />
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                              {sim.description}
                            </p>
                            <p className="text-[11px] text-slate-600 dark:text-slate-400 font-mono tabular-nums">
                              {formatBRL(sim.totalAmount)} ·{' '}
                              {sim.mode === 'avista'
                                ? `À vista em ${formatMonthShort(sim.startMonthKey)}`
                                : sim.mode === 'parcelado'
                                  ? `${sim.installmentsCount}x de ${formatBRL(sim.totalAmount / sim.installmentsCount)}`
                                  : 'Fixo mensal'}
                            </p>
                          </div>
                        </label>
                        <button
                          type="button"
                          onClick={() => removeSimulated(sim.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer shrink-0"
                          aria-label="Remover compra simulada"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Gráficos à Direita */}
            <div key={isDailyWindowMode ? preset : `long-${horizon.summary.monthsCount}`} className="lg:col-span-7 min-w-0 space-y-6 duofin-chart-enter">
              {/* Gráfico Principal: Evolução do Dinheiro Livre Projetado */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3 min-w-0">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                      Evolução do dinheiro livre projetado
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {isDailyWindowMode
                        ? `Saldo bancário real dia a dia (${dailyWindowDaysCount} dias) após receitas, contas, faturas e reservas`
                        : 'Saldo livre acumulado ao final de cada mês considerando receitas reais, compromissos e reservas'}
                    </p>
                  </div>
                  <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                    Mínimo: {formatBRL(freeMoneyProj.lowestPoint.projectedFreeMoney)} ({freeMoneyProj.lowestPoint.label})
                  </span>
                </div>

                <div className="h-64 min-w-0 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={freeMoneyChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridStroke} vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: chartTheme.axisTick }} axisLine={false} tickLine={false} />
                      <YAxis
                        width={56}
                        tick={{ fontSize: 10, fill: chartTheme.axisTick }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) => `R$${Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : Math.round(v)}`}
                      />
                      <ReferenceLine y={0} stroke={SEMANTIC_COLORS.negative} strokeDasharray="3 3" />
                      <Tooltip
                        formatter={(val: unknown) => [formatBRL(Number(val)), 'Dinheiro livre']}
                        contentStyle={chartTheme.tooltipStyle}
                      />
                      <Area
                        {...CHART_ANIMATION}
                        type="monotone"
                        dataKey="projectedFreeMoney"
                        name="Dinheiro livre projetado"
                        stroke={
                          freeMoneyProj.lowestPoint.projectedFreeMoney < 0
                            ? SEMANTIC_COLORS.orangeDeep
                            : SEMANTIC_COLORS.positive
                        }
                        fill={
                          freeMoneyProj.lowestPoint.projectedFreeMoney < 0
                            ? SEMANTIC_COLORS.orangeLight
                            : SEMANTIC_COLORS.positiveSoft
                        }
                        fillOpacity={0.28}
                        strokeWidth={2.5}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {isDailyWindowMode ? (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3 min-w-0">
                  <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    {isWeekly28Mode ? 'Entradas vs Compromissos semanais' : 'Fluxo diário de entradas e saídas'}
                  </h2>
                  <div className="h-64 min-w-0 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={
                          isWeekly28Mode && shortHorizon
                            ? weeklyHorizonRows.map((r) => ({
                                label: r.label,
                                entries: r.entries,
                                expenses: r.expenses,
                              }))
                            : freeMoneyChartData
                        }
                        margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridStroke} vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 10, fill: chartTheme.axisTick }} axisLine={false} tickLine={false} />
                        <YAxis
                          width={52}
                          tick={{ fontSize: 10, fill: chartTheme.axisTick }}
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={(v) => `R$${Math.round(v)}`}
                        />
                        <Tooltip formatter={(val: unknown) => formatBRL(Number(val))} contentStyle={chartTheme.tooltipStyle} />
                        <Legend wrapperStyle={chartTheme.legendStyle} />
                        <Bar {...CHART_ANIMATION} dataKey="entries" name="Entradas" fill={SEMANTIC_COLORS.positive} radius={[3, 3, 0, 0]} />
                        <Bar
                          {...CHART_ANIMATION}
                          dataKey="expenses"
                          name="Saídas, faturas e reservas"
                          fill={SEMANTIC_COLORS.negative}
                          radius={[3, 3, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ) : (
                <>
                  {/* Saldo do mês com destaque laranja para impacto de meses passados / faturas */}
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3 min-w-0">
                    <div>
                      <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                        Saldo do mês (projeção dos próximos meses)
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Meses em laranja possuem impacto de faturas, parcelas ou saldo de meses passados.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600 dark:text-slate-400">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-xs" style={{ backgroundColor: SEMANTIC_COLORS.positive }} />
                        Saldo positivo
                      </span>
                      <span className="inline-flex items-center gap-1.5 font-medium text-orange-700 dark:text-orange-400">
                        <span className="w-2.5 h-2.5 rounded-xs" style={{ backgroundColor: SEMANTIC_COLORS.orangeDeep }} />
                        Impacto de faturas/meses passados
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-xs" style={{ backgroundColor: SEMANTIC_COLORS.negative }} />
                        Saldo negativo
                      </span>
                    </div>
                    <div className="h-60 min-w-0 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridStroke} vertical={false} />
                          <XAxis dataKey="label" tick={{ fontSize: 10, fill: chartTheme.axisTick }} axisLine={false} tickLine={false} />
                          <YAxis
                            width={52}
                            tick={{ fontSize: 10, fill: chartTheme.axisTick }}
                            axisLine={false}
                            tickLine={false}
                            tickFormatter={(v) => `R$${Math.round(v / 1000)}k`}
                          />
                          <ReferenceLine y={0} stroke={chartTheme.axisTick} strokeDasharray="3 3" />
                          <Tooltip
                            content={({ active, payload }) => {
                              if (!active || !payload || payload.length === 0) return null;
                              const row = payload[0].payload as (typeof chartData)[number];
                              return (
                                <div style={chartTheme.tooltipStyle} className="p-3 shadow-md space-y-1 max-w-xs">
                                  <p className="text-xs font-bold">{formatMonthFull(row.monthKey)}</p>
                                  <p
                                    className={`text-xs font-mono tabular-nums font-bold ${
                                      row.hasPastMonthImpact
                                        ? 'text-orange-600'
                                        : row.simulatedSurplus < 0
                                          ? 'text-red-600'
                                          : 'text-emerald-600'
                                    }`}
                                  >
                                    Saldo do mês: {formatBRL(row.simulatedSurplus)}
                                  </p>
                                  <p className="text-[11px] opacity-80 font-mono tabular-nums">
                                    Entradas: {formatBRL(row.totalEntries)} · Despesas: {formatBRL(row.simulatedExpenses)}
                                  </p>
                                </div>
                              );
                            }}
                          />
                          <Bar {...CHART_ANIMATION} dataKey="simulatedSurplus" name="Saldo do mês" radius={[4, 4, 0, 0]}>
                            {chartData.map((row) => {
                              const barColor = row.hasPastMonthImpact
                                ? SEMANTIC_COLORS.orangeDeep
                                : row.simulatedSurplus < 0
                                  ? SEMANTIC_COLORS.negative
                                  : SEMANTIC_COLORS.positive;
                              return <Cell key={row.monthKey} fill={barColor} />;
                            })}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Composição de comprometimento */}
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3 min-w-0">
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                      <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                        Composição mensal dos compromissos
                      </h2>
                    </div>
                    <div className="h-56 min-w-0 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridStroke} vertical={false} />
                          <XAxis dataKey="label" tick={{ fontSize: 10, fill: chartTheme.axisTick }} axisLine={false} tickLine={false} />
                          <YAxis
                            width={48}
                            tick={{ fontSize: 10, fill: chartTheme.axisTick }}
                            axisLine={false}
                            tickLine={false}
                            tickFormatter={(v) => `R$${Math.round(v / 1000)}k`}
                          />
                          <Tooltip formatter={(val: unknown) => formatBRL(Number(val))} contentStyle={chartTheme.tooltipStyle} />
                          <Legend wrapperStyle={chartTheme.legendStyle} />
                          <Bar {...CHART_ANIMATION} dataKey="recurringExpenses" name="Fixas" stackId="a" fill={SEMANTIC_COLORS.negative} />
                          <Bar {...CHART_ANIMATION} dataKey="installmentsTotal" name="Parcelas" stackId="a" fill={SEMANTIC_COLORS.orangeDeep} />
                          <Bar {...CHART_ANIMATION} dataKey="launchedExpenses" name="Lançados" stackId="a" fill={SEMANTIC_COLORS.yellow} />
                          <Bar {...CHART_ANIMATION} dataKey="simulatedPurchaseImpact" name="Simulados" stackId="a" fill={SEMANTIC_COLORS.orangeLight} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </>
              )}
            </div>
          </section>

          {/* 6. Sub-abas de Análise Detalhada: Detalhamento (com Clique para Origens), Linha do Tempo, Calendário Financeiro */}
          <section className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
                {(
                  [
                    { id: 'detalhamento', label: isDailyWindowMode ? 'Fluxo Dia a Dia' : 'Projeção Mês a Mês', icon: Layers },
                    { id: 'timeline', label: 'Linha do Tempo', icon: Clock },
                    { id: 'calendario', label: 'Calendário Financeiro', icon: Calendar },
                  ] as Array<{ id: HorizonDataView; label: string; icon: React.ComponentType<{ className?: string }> }>
                ).map((sub) => {
                  const Icon = sub.icon;
                  const active = dataView === sub.id;
                  return (
                    <button
                      key={sub.id}
                      type="button"
                      onClick={() => setDataView(sub.id)}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                        active
                          ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5 shrink-0" />
                      {sub.label}
                    </button>
                  );
                })}
              </div>

              {dataView === 'detalhamento' && (
                <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={onlyImpactRows}
                    onChange={(e) => setOnlyImpactRows(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300"
                  />
                  Mostrar só linhas com impacto / negativo
                </label>
              )}
            </div>

            {dataView === 'detalhamento' && (
              <>
                {isDailyWindowMode ? (
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
                      <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                        Fluxo diário de dinheiro livre ({dailyWindowDaysCount} dias)
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Exibindo {displayedDailyPoints.length} de {freeMoneyProj.dailyPoints.length} dias com entradas, contas, faturas e reservas.
                      </p>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-xs font-semibold text-slate-600 dark:text-slate-300">
                            <th className="py-3 px-4">Data</th>
                            <th className="py-3 px-4">Eventos do dia</th>
                            <th className="py-3 px-4 text-right">Entradas</th>
                            <th className="py-3 px-4 text-right">Saídas / Faturas</th>
                            <th className="py-3 px-4 text-right">Reservas</th>
                            <th className="py-3 px-4 text-right">Dinheiro livre</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {displayedDailyPoints.map((dp) => (
                            <tr
                              key={dp.dateISO}
                              className={
                                dp.projectedFreeMoney < 0
                                  ? 'bg-rose-50/70 dark:bg-rose-950/25'
                                  : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/40'
                              }
                            >
                              <td className="py-2.5 px-4 whitespace-nowrap font-medium text-slate-900 dark:text-slate-100">
                                {dp.label} <span className="text-xs text-slate-500 dark:text-slate-400">({dp.weekday})</span>
                              </td>
                              <td className="py-2.5 px-4 text-xs text-slate-600 dark:text-slate-300 max-w-sm truncate">
                                {dp.events.length > 0 ? dp.events.map((ev) => ev.title).join(' · ') : '—'}
                              </td>
                              <td className="py-2.5 px-4 text-right font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                                {dp.entries > 0 ? `+${formatBRL(dp.entries)}` : '—'}
                              </td>
                              <td className="py-2.5 px-4 text-right font-mono tabular-nums text-rose-600 dark:text-rose-400">
                                {dp.expenses > 0 ? `−${formatBRL(dp.expenses)}` : '—'}
                              </td>
                              <td className="py-2.5 px-4 text-right font-mono tabular-nums text-amber-700 dark:text-amber-400">
                                {dp.reserves > 0 ? `−${formatBRL(dp.reserves)}` : '—'}
                              </td>
                              <td
                                className={`py-2.5 px-4 text-right font-mono tabular-nums font-semibold ${
                                  dp.projectedFreeMoney < 0
                                    ? 'text-rose-600 dark:text-rose-400'
                                    : 'text-slate-900 dark:text-slate-100'
                                }`}
                              >
                                {formatBRL(dp.projectedFreeMoney)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Drawer inline de Origem dos Valores quando um mês for clicado */}
                    {inspectedMonthPoint && (
                      <div className="bg-white dark:bg-slate-900 border border-sky-300 dark:border-sky-800 rounded-xl p-5 space-y-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                              Origem dos valores — {formatMonthFull(inspectedMonthPoint.monthKey)}
                            </h3>
                            <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums mt-0.5">
                              Entradas {formatBRL(inspectedMonthPoint.receitasPrevistas)} − Compromissos{' '}
                              {formatBRL(inspectedMonthPoint.compromissosTotais)} − Reservas{' '}
                              {formatBRL(inspectedMonthPoint.reservasPlanejadas)} = Resultado{' '}
                              {formatBRL(inspectedMonthPoint.netMonth)} · Dinheiro livre acumulado:{' '}
                              {formatBRL(inspectedMonthPoint.projectedFreeMoney)}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setInspectedMonthKey(null)}
                            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg cursor-pointer"
                            aria-label="Fechar detalhamento do mês"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                          <div className="space-y-1.5">
                            <h4 className="font-semibold text-emerald-700 dark:text-emerald-400">
                              Receitas ({inspectedMonthPoint.origins.incomes.length + inspectedMonthPoint.origins.extraEntries.length})
                            </h4>
                            {inspectedMonthPoint.origins.incomes.length === 0 &&
                            inspectedMonthPoint.origins.extraEntries.length === 0 ? (
                              <p className="text-slate-400">Sem entradas previstas.</p>
                            ) : (
                              <ul className="space-y-1">
                                {inspectedMonthPoint.origins.incomes.map((item, i) => (
                                  <li key={i} className="flex justify-between gap-2 text-slate-700 dark:text-slate-300">
                                    <span className="truncate">
                                      {item.title} ({item.dateISO.slice(8, 10)}/{item.dateISO.slice(5, 7)})
                                    </span>
                                    <span className="font-mono tabular-nums text-emerald-700 dark:text-emerald-400 shrink-0">
                                      +{formatBRL0(item.amount)}
                                    </span>
                                  </li>
                                ))}
                                {inspectedMonthPoint.origins.extraEntries.map((item, i) => (
                                  <li key={`ex-${i}`} className="flex justify-between gap-2 text-slate-700 dark:text-slate-300">
                                    <span className="truncate">{item.title}</span>
                                    <span className="font-mono tabular-nums text-emerald-700 dark:text-emerald-400 shrink-0">
                                      +{formatBRL0(item.amount)}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>

                          <div className="space-y-1.5">
                            <h4 className="font-semibold text-rose-700 dark:text-rose-400">
                              Fixos &amp; Pendentes (
                              {inspectedMonthPoint.origins.recurringExpenses.length +
                                inspectedMonthPoint.origins.pendingExpenses.length}
                              )
                            </h4>
                            {inspectedMonthPoint.origins.recurringExpenses.length === 0 &&
                            inspectedMonthPoint.origins.pendingExpenses.length === 0 ? (
                              <p className="text-slate-400">Sem fixos ou pendentes.</p>
                            ) : (
                              <ul className="space-y-1">
                                {inspectedMonthPoint.origins.recurringExpenses.map((item, i) => (
                                  <li key={i} className="flex justify-between gap-2 text-slate-700 dark:text-slate-300">
                                    <span className="truncate">
                                      {item.title}
                                      {item.isCard ? ' (cartão)' : ''}
                                    </span>
                                    <span className="font-mono tabular-nums text-rose-600 dark:text-rose-400 shrink-0">
                                      −{formatBRL0(item.amount)}
                                    </span>
                                  </li>
                                ))}
                                {inspectedMonthPoint.origins.pendingExpenses.map((item, i) => (
                                  <li key={`p-${i}`} className="flex justify-between gap-2 text-slate-700 dark:text-slate-300">
                                    <span className="truncate">{item.title}</span>
                                    <span className="font-mono tabular-nums text-rose-600 dark:text-rose-400 shrink-0">
                                      −{formatBRL0(item.amount)}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>

                          <div className="space-y-1.5">
                            <h4 className="font-semibold text-orange-700 dark:text-orange-400">
                              Faturas &amp; Parcelas ({inspectedMonthPoint.origins.installments.length} parc.)
                            </h4>
                            {inspectedMonthPoint.origins.cardInvoices.filter((c) => c.remainingAmount > 0).length === 0 &&
                            inspectedMonthPoint.origins.installments.length === 0 ? (
                              <p className="text-slate-400">Sem faturas em aberto.</p>
                            ) : (
                              <ul className="space-y-1">
                                {inspectedMonthPoint.origins.cardInvoices
                                  .filter((c) => c.total > 0 || c.remainingAmount > 0)
                                  .map((inv, i) => (
                                    <li key={i} className="flex justify-between gap-2 text-slate-700 dark:text-slate-300 font-medium">
                                      <span className="truncate">
                                        Fatura {inv.cardName} ({inv.status})
                                      </span>
                                      <span className="font-mono tabular-nums text-orange-700 dark:text-orange-400 shrink-0">
                                        {formatBRL0(inv.remainingAmount)}
                                      </span>
                                    </li>
                                  ))}
                                {inspectedMonthPoint.origins.installments.slice(0, 5).map((inst, i) => (
                                  <li key={`inst-${i}`} className="flex justify-between gap-2 text-slate-500 dark:text-slate-400">
                                    <span className="truncate">
                                      · {inst.description} ({inst.installmentNumber}/{inst.installmentsCount})
                                    </span>
                                    <span className="font-mono tabular-nums shrink-0">{formatBRL0(inst.amount)}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>

                          <div className="space-y-1.5">
                            <h4 className="font-semibold text-amber-700 dark:text-amber-400">
                              Reservas &amp; Cenários ({inspectedMonthPoint.origins.reserves.length + inspectedMonthPoint.origins.scenarioImpacts.length})
                            </h4>
                            {inspectedMonthPoint.origins.reserves.length === 0 &&
                            inspectedMonthPoint.origins.scenarioImpacts.length === 0 ? (
                              <p className="text-slate-400">Sem reservas/cenários no mês.</p>
                            ) : (
                              <ul className="space-y-1">
                                {inspectedMonthPoint.origins.reserves.map((res, i) => (
                                  <li key={i} className="flex justify-between gap-2 text-slate-700 dark:text-slate-300">
                                    <span className="truncate">Reserva: {res.goalName}</span>
                                    <span className="font-mono tabular-nums text-amber-700 dark:text-amber-400 shrink-0">
                                      −{formatBRL0(res.amount)}
                                    </span>
                                  </li>
                                ))}
                                {inspectedMonthPoint.origins.scenarioImpacts.map((sc, i) => (
                                  <li key={`sc-${i}`} className="flex justify-between gap-2 text-slate-700 dark:text-slate-300">
                                    <span className="truncate" title={sc.note}>
                                      {sc.title}
                                    </span>
                                    <span
                                      className={`font-mono tabular-nums shrink-0 ${
                                        sc.delta >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                                      }`}
                                    >
                                      {sc.delta >= 0 ? `+${formatBRL0(sc.delta)}` : formatBRL0(sc.delta)}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                      <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                            Projeção mês a mês (clique no mês para ver a origem de cada valor)
                          </h3>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Exibindo {displayedRows.length} de {horizon.rows.length} meses. Linhas em laranja possuem impacto de faturas/parcelas anteriores.
                          </p>
                        </div>
                      </div>

                      {/* Mobile Cards */}
                      <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
                        {displayedRows.map((row) => {
                          const fm = monthlyPointByKey.get(row.monthKey);
                          const selected = inspectedMonthKey === row.monthKey;
                          return (
                            <button
                              key={row.monthKey}
                              type="button"
                              onClick={() => fm && setInspectedMonthKey(selected ? null : row.monthKey)}
                              className={`w-full text-left p-4 space-y-2 cursor-pointer ${
                                selected
                                  ? 'bg-sky-50/70 dark:bg-sky-950/30'
                                  : row.hasPastMonthImpact
                                    ? 'bg-orange-50/70 dark:bg-orange-950/25'
                                    : row.simulatedSurplus < 0
                                      ? 'bg-rose-50/50 dark:bg-rose-950/20'
                                      : ''
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                  {formatMonthShort(row.monthKey)}
                                  {row.hasPastMonthImpact && (
                                    <span className="ml-2 text-[11px] font-medium text-orange-700 dark:text-orange-400">
                                      · Fatura/mês anterior
                                    </span>
                                  )}
                                </span>
                                <span
                                  className={`text-xs font-mono tabular-nums font-bold ${
                                    row.hasPastMonthImpact
                                      ? 'text-orange-700 dark:text-orange-400'
                                      : row.simulatedSurplus < 0
                                        ? 'text-rose-600 dark:text-rose-400'
                                        : 'text-emerald-700 dark:text-emerald-400'
                                  }`}
                                >
                                  Saldo mês: {formatBRL(row.simulatedSurplus)}
                                </span>
                              </div>
                              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                                <div className="flex justify-between gap-1">
                                  <span className="text-slate-500">Entradas</span>
                                  <span className="font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                                    {formatBRL(fm ? fm.receitasPrevistas : row.totalEntries)}
                                  </span>
                                </div>
                                <div className="flex justify-between gap-1">
                                  <span className="text-slate-500">Dinheiro livre</span>
                                  <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                                    {fm ? formatBRL(fm.projectedFreeMoney) : formatBRL(row.simulatedCumulativeBalance)}
                                  </span>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>

                      {/* Desktop Table */}
                      <div className="hidden md:block overflow-x-auto">
                        <table className="w-full text-left border-collapse text-sm">
                          <thead>
                            <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-xs font-semibold text-slate-600 dark:text-slate-300">
                              <th className="py-3 px-4">Mês</th>
                              <th className="py-3 px-4 text-right">Entradas prev.</th>
                              <th className="py-3 px-4 text-right">Fixas + Pend.</th>
                              <th className="py-3 px-4 text-right">Faturas/Parc.</th>
                              <th className="py-3 px-4 text-right">Reservas</th>
                              <th className="py-3 px-4 text-right">Saldo do mês</th>
                              <th className="py-3 px-4 text-right">Dinheiro livre</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {displayedRows.map((row) => {
                              const fm = monthlyPointByKey.get(row.monthKey);
                              const selected = inspectedMonthKey === row.monthKey;
                              const isCritical = fm?.isCritical;
                              return (
                                <tr
                                  key={row.monthKey}
                                  onClick={() => fm && setInspectedMonthKey(selected ? null : row.monthKey)}
                                  className={`${fm ? 'cursor-pointer' : ''} ${
                                    selected
                                      ? 'bg-sky-50/80 dark:bg-sky-950/40'
                                      : row.hasPastMonthImpact
                                        ? 'bg-orange-50/70 dark:bg-orange-950/25 hover:bg-orange-50'
                                        : row.simulatedSurplus < 0
                                          ? 'bg-rose-50/50 dark:bg-rose-950/20'
                                          : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/40'
                                  }`}
                                >
                                  <td className="py-2.5 px-4 whitespace-nowrap font-medium text-slate-900 dark:text-slate-100">
                                    <div className="flex items-center gap-2">
                                      <span>{formatMonthShort(row.monthKey)}</span>
                                      {row.hasPastMonthImpact && (
                                        <span className="text-[11px] font-medium text-orange-700 dark:text-orange-400">
                                          · Fatura anterior
                                        </span>
                                      )}
                                      {isCritical && (
                                        <span className="text-[11px] font-medium text-rose-700 dark:text-rose-400">· Crítico</span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="py-2.5 px-4 text-right font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                                    {formatBRL(fm ? fm.receitasPrevistas : row.totalEntries)}
                                  </td>
                                  <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                                    {formatBRL(fm ? fm.despesasRecorrentesNaoCartao + fm.despesasPendentes : row.recurringExpenses + row.launchedExpenses)}
                                  </td>
                                  <td className="py-2.5 px-4 text-right font-mono tabular-nums text-orange-700 dark:text-orange-400">
                                    {formatBRL(fm ? fm.faturasEmAberto : row.installmentsTotal)}
                                  </td>
                                  <td className="py-2.5 px-4 text-right font-mono tabular-nums text-amber-700 dark:text-amber-400">
                                    {fm && fm.reservasPlanejadas > 0 ? formatBRL(fm.reservasPlanejadas) : '—'}
                                  </td>
                                  <td
                                    className={`py-2.5 px-4 text-right font-mono tabular-nums font-semibold ${
                                      row.hasPastMonthImpact
                                        ? 'text-orange-700 dark:text-orange-400'
                                        : row.simulatedSurplus < 0
                                          ? 'text-rose-600 dark:text-rose-400'
                                          : 'text-emerald-700 dark:text-emerald-400'
                                    }`}
                                  >
                                    {formatBRL(row.simulatedSurplus)}
                                  </td>
                                  <td
                                    className={`py-2.5 px-4 text-right font-mono tabular-nums font-bold ${
                                      (fm ? fm.projectedFreeMoney : row.simulatedCumulativeBalance) < 0
                                        ? 'text-rose-600 dark:text-rose-400'
                                        : 'text-slate-900 dark:text-slate-100'
                                    }`}
                                  >
                                    {formatBRL(fm ? fm.projectedFreeMoney : row.simulatedCumulativeBalance)}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {(visibleRowsLimit < horizon.rows.length || preset === 'infinito') && (
                        <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex flex-wrap items-center justify-center gap-2">
                          {visibleRowsLimit < horizon.rows.length && (
                            <button
                              type="button"
                              onClick={() => setVisibleRowsLimit((v) => v + 24)}
                              className="px-4 py-2 text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 hover:bg-slate-100 cursor-pointer"
                            >
                              Exibir mais 24 meses da lista
                            </button>
                          )}
                          {preset === 'infinito' && infiniteMonthsCount < MAX_HORIZON_MONTHS && (
                            <button
                              type="button"
                              onClick={() => handleExpandInfinite(24)}
                              className="px-4 py-2 text-xs font-semibold bg-slate-900 dark:bg-emerald-600 text-white rounded-lg hover:bg-slate-800 cursor-pointer"
                            >
                              Projetar mais 24 meses rumo ao infinito (∞)
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}

            {dataView === 'timeline' && (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    Linha do tempo cronológica de compromissos e entradas
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Ordem exata de recebimentos, boletos pendentes, faturas, parcelas, reservas e impactos de cenários com saldo após cada evento.
                  </p>
                </div>

                {freeMoneyProj.commitmentsTimeline.length === 0 ? (
                  <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                    Nenhum compromisso futuro ou entrada programada na janela selecionada.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[540px] overflow-y-auto">
                    {freeMoneyProj.commitmentsTimeline.slice(0, 120).map((item) => (
                      <div
                        key={item.id}
                        className="px-5 py-3 flex items-center justify-between gap-3 hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {item.isOutflow ? (
                            <ArrowDownRight className="w-4 h-4 text-rose-500 shrink-0" />
                          ) : (
                            <ArrowUpRight className="w-4 h-4 text-emerald-500 shrink-0" />
                          )}
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{item.title}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {formatDateBR(item.dateISO)} · {item.category}
                            </p>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p
                            className={`text-sm font-mono tabular-nums font-semibold ${
                              item.isOutflow ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400'
                            }`}
                          >
                            {item.isOutflow ? `−${formatBRL(item.amount)}` : `+${formatBRL(item.amount)}`}
                          </p>
                          <p
                            className={`text-[11px] font-mono tabular-nums ${
                              item.projectedBalanceAfter < 0
                                ? 'text-rose-600 dark:text-rose-400 font-semibold'
                                : 'text-slate-500 dark:text-slate-400'
                            }`}
                          >
                            Saldo após: {formatBRL(item.projectedBalanceAfter)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {dataView === 'calendario' && (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                      Calendário financeiro do horizonte
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Clique em qualquer dia para visualizar recebimentos, vencimentos e dinheiro livre projetado na data.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCalendarMonthKey((m) => addMonthsToKey(m, -1))}
                      className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                      aria-label="Mês anterior"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 min-w-[140px] text-center">
                      {formatMonthFull(calendarMonthKey)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setCalendarMonthKey((m) => addMonthsToKey(m, 1))}
                      className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                      aria-label="Próximo mês"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 lg:gap-5">
                  <div className="md:col-span-7 lg:col-span-8">
                    <div className="grid grid-cols-7 gap-1 mb-1">
                      {WEEKDAY_HEADERS.map((wd) => (
                        <div key={wd} className="text-center text-[11px] font-semibold text-slate-500 dark:text-slate-400 py-1">
                          {wd}
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-7 gap-1">
                      {Array.from({ length: calendarData.leadingEmptyDays }).map((_, i) => (
                        <div key={`empty-${i}`} className="min-h-[64px]" />
                      ))}
                      {Array.from({ length: calendarData.daysInMonth }).map((_, idx) => {
                        const day = idx + 1;
                        const dISO = `${calendarMonthKey}-${String(day).padStart(2, '0')}`;
                        const sum = calendarData.daySummaries[dISO];
                        const dp = dailyPointByDate.get(dISO);
                        const selected = selectedCalendarDateISO === dISO;
                        const isNeg = dp ? dp.projectedFreeMoney < 0 : false;

                        return (
                          <button
                            key={dISO}
                            type="button"
                            onClick={() => setSelectedCalendarDateISO(dISO)}
                            className={`min-h-[68px] p-1.5 rounded-lg border text-left flex flex-col justify-between transition-colors cursor-pointer ${
                              selected
                                ? 'border-slate-900 dark:border-emerald-400 bg-slate-100 dark:bg-slate-800'
                                : isNeg
                                  ? 'border-rose-200 dark:border-rose-900 bg-rose-50/60 dark:bg-rose-950/20'
                                  : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-xs font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                                {day}
                              </span>
                              {sum && sum.events.length > 0 && (
                                <span
                                  className={`text-[10px] font-mono tabular-nums ${
                                    sum.tone === 'positive'
                                      ? 'text-emerald-600 dark:text-emerald-400'
                                      : sum.tone === 'warning'
                                        ? 'text-orange-600 dark:text-orange-400'
                                        : 'text-rose-600 dark:text-rose-400'
                                  }`}
                                >
                                  {sum.events.length}
                                </span>
                              )}
                            </div>
                            <div className="space-y-0.5">
                              {sum && sum.entriesTotal > 0 && (
                                <span className="block text-[10px] font-mono tabular-nums text-emerald-700 dark:text-emerald-400 truncate">
                                  +{formatBRL0(sum.entriesTotal)}
                                </span>
                              )}
                              {sum && sum.expensesTotal > 0 && (
                                <span className="block text-[10px] font-mono tabular-nums text-rose-600 dark:text-rose-400 truncate">
                                  −{formatBRL0(sum.expensesTotal)}
                                </span>
                              )}
                              {dp && (
                                <span
                                  className={`block text-[10px] font-mono tabular-nums truncate ${
                                    dp.projectedFreeMoney < 0
                                      ? 'text-rose-700 dark:text-rose-400 font-bold'
                                      : 'text-slate-500 dark:text-slate-400'
                                  }`}
                                >
                                  {formatBRL0(dp.projectedFreeMoney)}
                                </span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="md:col-span-5 lg:col-span-4 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3 bg-slate-50/70 dark:bg-slate-950/60">
                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Dia selecionado</p>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                        {formatDateBR(selectedCalendarDateISO)}
                      </h4>
                      {selectedDayProjectedPoint && (
                        <p
                          className={`text-xs font-mono tabular-nums font-semibold mt-1 ${
                            selectedDayProjectedPoint.projectedFreeMoney < 0
                              ? 'text-rose-600 dark:text-rose-400'
                              : 'text-emerald-700 dark:text-emerald-400'
                          }`}
                        >
                          Dinheiro livre estimado: {formatBRL(selectedDayProjectedPoint.projectedFreeMoney)}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2 border-t border-slate-200 dark:border-slate-800 pt-3">
                      {!selectedDayCalendarSummary || selectedDayCalendarSummary.events.length === 0 ? (
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Nenhuma movimentação prevista para esta data.
                        </p>
                      ) : (
                        selectedDayCalendarSummary.events.map((ev) => (
                          <div key={ev.id} className="flex items-start justify-between gap-2 text-xs">
                            <div className="min-w-0">
                              <p className="font-medium text-slate-900 dark:text-slate-100 truncate">{ev.title}</p>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{ev.subtitle}</p>
                            </div>
                            {ev.amount !== null && (
                              <span
                                className={`font-mono tabular-nums font-semibold shrink-0 ${
                                  ev.tone === 'positive'
                                    ? 'text-emerald-700 dark:text-emerald-400'
                                    : ev.tone === 'warning'
                                      ? 'text-orange-700 dark:text-orange-400'
                                      : 'text-rose-600 dark:text-rose-400'
                                }`}
                              >
                                {formatBRL(ev.amount)}
                              </span>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
