import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  CalendarRange,
  Infinity as InfinityIcon,
  Layers,
  Plus,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  Trash2,
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
import type { AppRoute, SimulatedPurchase, SimulatedPurchaseMode } from '../types/finance';
import { CHART_ANIMATION, getChartTheme, SEMANTIC_COLORS } from '../utils/chartColors';
import {
  addMonthsToKey,
  buildCoupleFinancialContextSummary,
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
  MAX_HORIZON_MONTHS,
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
  | 'mensais'
  | 'trimestral'
  | '12m'
  | '24m'
  | '60m'
  | '120m'
  | 'infinito'
  | 'custom';

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

  const currentMonth = getCurrentMonthKey();
  const nextMonth = useMemo(() => addMonthsToKey(currentMonth, 1), [currentMonth]);
  const [startMonth, setStartMonth] = useState<string>(nextMonth);
  const [preset, setPreset] = useState<HorizonRangePreset>('mensais');
  const [customEndMonth, setCustomEndMonth] = useState<string>(addMonthsToKey(nextMonth, 35));
  const [infiniteMonthsCount, setInfiniteMonthsCount] = useState<number>(36);
  const [visibleRowsLimit, setVisibleRowsLimit] = useState<number>(36);
  const [onlyImpactRows, setOnlyImpactRows] = useState<boolean>(false);

  // Simulador de novas compras no horizonte
  const [simulatedPurchases, setSimulatedPurchases] = useState<SimulatedPurchase[]>([]);
  const [simDesc, setSimDesc] = useState('');
  const [simAmount, setSimAmount] = useState('');
  const [simMode, setSimMode] = useState<SimulatedPurchaseMode>('parcelado');
  const [simInstallments, setSimInstallments] = useState('12');
  const [simStartMonth, setSimStartMonth] = useState(currentMonth);
  const [simEndMonth, setSimEndMonth] = useState('');
  const [simDay, setSimDay] = useState('15');
  const [simCardId, setSimCardId] = useState('');

  // Insight de IA
  const [aiLoading, setAiLoading] = useState(false);
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  const isDailyMode = preset === 'diarios';
  const isWeeklyMode = preset === 'semanais';
  const isShortTerm = isDailyMode || isWeeklyMode;

  const shortHorizon = useMemo(() => {
    if (!isShortTerm) return null;
    return computeShortHorizon({
      daysCount: preset === 'diarios' ? 7 : 28,
      bankAccounts,
      incomes,
      transactions,
      installments,
      recurringItems,
      cards,
      simulatedPurchases,
    });
  }, [isShortTerm, preset, bankAccounts, incomes, transactions, installments, recurringItems, cards, simulatedPurchases]);

  const weeklyHorizonRows = useMemo(() => {
    if (!isWeeklyMode || !shortHorizon) return [];
    return computeWeeklyRollupFromShortHorizon(shortHorizon);
  }, [isWeeklyMode, shortHorizon]);

  const monthKeys = useMemo(() => {
    switch (preset) {
      case 'diarios':
      case 'semanais':
      case 'trimestral':
        return getMonthKeysFromStart(startMonth, 3);
      case 'mensais':
        return getMonthKeysFromStart(startMonth, 6);
      case '12m':
        return getMonthKeysFromStart(startMonth, 12);
      case '24m':
        return getMonthKeysFromStart(startMonth, 24);
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

  // Amostra enxuta para gráficos quando o horizonte mensal é muito longo (> 48 meses)
  const chartData = useMemo(() => {
    const rows = horizon.rows;
    if (rows.length <= 48) return rows;
    const step = Math.ceil(rows.length / 48);
    return rows.filter((_, idx) => idx % step === 0 || idx === rows.length - 1);
  }, [horizon.rows]);

  const displayedRows = useMemo(() => {
    const filtered = onlyImpactRows
      ? horizon.rows.filter((r) => r.simulatedPurchaseImpact > 0 || r.simulatedSurplus < 0 || r.hasPastMonthImpact)
      : horizon.rows;
    return filtered.slice(0, visibleRowsLimit);
  }, [horizon.rows, onlyImpactRows, visibleRowsLimit]);

  const displayedDailyRows = useMemo(() => {
    if (!shortHorizon) return [];
    return onlyImpactRows
      ? shortHorizon.rows.filter((r) => r.entries > 0 || r.expenses > 0 || r.simulatedImpact > 0 || r.projectedBalance < 0)
      : shortHorizon.rows;
  }, [shortHorizon, onlyImpactRows]);

  const pendingPlanned = useMemo(
    () => plannedPurchases.filter((p) => p.status === 'Pendente' || p.status === 'Pesquisando'),
    [plannedPurchases]
  );

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
    setAiInsight(null);
  };

  const handleImportPlanned = (purchaseId: string) => {
    const item = pendingPlanned.find((p) => p.id === purchaseId);
    if (!item) return;
    const total = Math.max(1, item.quantity) * (item.hasActualPrice ? item.actualUnitPrice : item.estimatedUnitPrice);
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
    setAiInsight(null);
  };

  const removeSimulated = (id: string) => {
    setSimulatedPurchases((prev) => prev.filter((s) => s.id !== id));
    setAiInsight(null);
  };

  const handleExpandInfinite = (extraMonths: number) => {
    const next = Math.min(MAX_HORIZON_MONTHS, infiniteMonthsCount + extraMonths);
    setInfiniteMonthsCount(next);
    setVisibleRowsLimit((prev) => Math.max(prev, next));
  };

  const handleAnalyzeWithAi = async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      const contextSummary = buildCoupleFinancialContextSummary({
        householdName: household?.name,
        partner1Name: household?.partner1Name,
        partner2Name: household?.partner2Name,
        memberNames: getHouseholdMembersList(household).map((m) => m.name),
        incomes,
        transactions,
        recurringItems,
        cards,
        installments,
        goals,
        plannedPurchases,
        bankAccounts,
        horizonStartMonth: startMonth,
        horizonMonthsCount: monthKeys.length,
      });

      const activeSimsText =
        simulatedPurchases
          .filter((s) => s.enabled)
          .map(
            (s) =>
              `${s.description}: ${formatBRL(s.totalAmount)} (${
                s.mode === 'avista'
                  ? `à vista em ${formatMonthShort(s.startMonthKey)}`
                  : s.mode === 'parcelado'
                    ? `${s.installmentsCount}x a partir de ${formatMonthShort(s.startMonthKey)}`
                    : `fixo mensal a partir de ${formatMonthShort(s.startMonthKey)}${
                        s.endMonthKey ? ` até ${formatMonthShort(s.endMonthKey)}` : ' (sem término)'
                      }`
              })`
          )
          .join('; ') || 'Nenhuma nova compra simulada no momento';

      const horizonSummary =
        isShortTerm && shortHorizon
          ? [
              `Acompanhamento (${preset === 'diarios' ? 'Lançamentos diários · 7 dias' : preset === 'semanais' ? 'Semanais · 4 semanas' : 'Mensais · 30 dias'}): ${formatDateBR(shortHorizon.startDateISO)} até ${formatDateBR(shortHorizon.endDateISO)}.`,
              `Saldo inicial nas contas: ${formatBRL(shortHorizon.summary.startBalance)}.`,
              `Entradas previstas: ${formatBRL(shortHorizon.summary.totalEntries)} | Saídas e faturas: ${formatBRL(shortHorizon.summary.totalExpenses)}.`,
              `Saldo final no período: ${formatBRL(shortHorizon.summary.endBalance)}.`,
              `Compras simuladas: ${activeSimsText}.`,
              shortHorizon.summary.firstNegativeDay
                ? `Primeiro dia com saldo negativo: ${formatDateBR(shortHorizon.summary.firstNegativeDay.dateISO)} (${formatBRL(shortHorizon.summary.firstNegativeDay.projectedBalance)}).`
                : 'Saldo permanece positivo em todos os dias do período.',
            ].join('\n')
          : [
              `Período analisado: ${formatMonthShort(horizon.summary.horizonStart)} até ${formatMonthShort(
                horizon.summary.horizonEnd
              )} (${horizon.summary.monthsCount} meses${preset === 'infinito' ? ', modo contínuo até o infinito' : ''}).`,
              `Compras simuladas: ${activeSimsText}.`,
              `Total de entradas no período: ${formatBRL(horizon.summary.totalBaseEntries)}.`,
              `Gastos base no período: ${formatBRL(horizon.summary.totalBaseExpenses)} | Adicional simulado: ${formatBRL(
                horizon.summary.totalSimulatedAdded
              )} | Total com simulações: ${formatBRL(horizon.summary.totalSimulatedExpenses)}.`,
              `Sobra acumulada no horizonte: ${formatBRL(horizon.summary.totalSimulatedSurplus)}.`,
              horizon.summary.firstNegativeRow
                ? `Primeiro mês com saldo negativo: ${formatMonthShort(horizon.summary.firstNegativeRow.monthKey)} (${formatBRL(
                    horizon.summary.firstNegativeRow.simulatedSurplus
                  )}).`
                : 'Nenhum mês fica negativo no horizonte analisado.',
              horizon.summary.lastInstallmentMonth
                ? `Último mês de parcelas ativas/simuladas: ${formatMonthShort(horizon.summary.lastInstallmentMonth)}.`
                : 'Sem parcelamentos ativos.',
              `Equilíbrio perpétuo (ao infinito, após parcelas): Renda contínua ${formatBRL(
                horizon.summary.perpetualIncome
              )} − Fixos contínuos ${formatBRL(horizon.summary.perpetualFixedExpense)} = ${formatBRL(
                horizon.summary.perpetualMonthlySurplus
              )}/mês.`,
            ].join('\n');

      const res = await fetch('/api/ai/horizon-insight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ horizonSummary, contextSummary }),
      });
      const data = (await res.json()) as { insight?: string; error?: string };
      if (!res.ok) {
        throw new Error(data.error || 'Falha ao consultar análise de IA.');
      }
      setAiInsight(data.insight || null);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Erro ao analisar horizonte.');
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho Unificado do Hub Horizonte de Gastos */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Horizonte de Gastos</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Projeção futura, gráficos de fluxo, parcelamentos, compras planejadas e cenários do casal.
          </p>
        </div>

        {hubTab === 'projecao' && (
          <button
            type="button"
            onClick={handleAnalyzeWithAi}
            disabled={aiLoading}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-xl hover:bg-slate-800 disabled:opacity-50 transition-colors cursor-pointer shrink-0"
          >
            <Sparkles className="w-4 h-4 text-emerald-300" />
            {aiLoading ? 'Analisando horizonte...' : 'Analisar Horizonte com IA'}
          </button>
        )}
      </div>

      {/* Abas Agrupadas do Hub */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200/80">
        {(
          [
            { id: 'projecao', label: 'Projeção & Gráficos', icon: CalendarRange },
            { id: 'parcelamentos', label: 'Parcelamentos', icon: CalendarClock },
            { id: 'compras', label: 'Planejamento', icon: ShoppingBag },
            { id: 'cenarios', label: 'Cenários', icon: SlidersHorizontal },
          ] as Array<{ id: HorizonHubTab; label: string; icon: React.ComponentType<{ className?: string }> }>
        ).map((tab) => {
          const Icon = tab.icon;
          const active = hubTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setHubTab(tab.id)}
              className={`min-h-[42px] px-2.5 py-2 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                active ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 shrink-0 ${active ? 'text-emerald-600' : 'text-slate-400'}`} />
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
          {/* Controles de Período (Lançamentos diários, Semanais, Mensais, Trimestral, ... Infinito) */}
          <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CalendarRange className="w-4 h-4 text-slate-600 shrink-0" />
            <h2 className="text-sm font-semibold text-slate-900">Acompanhamento e período de projeção</h2>
          </div>
          <span className="text-xs font-mono tabular-nums text-slate-500">
            {isShortTerm && shortHorizon
              ? `${formatDateBR(shortHorizon.startDateISO)} → ${formatDateBR(shortHorizon.endDateISO)} (${
                  isWeeklyMode ? '4 semanas' : `${shortHorizon.daysCount} dias`
                })`
              : `${formatMonthShort(horizon.summary.horizonStart)} → ${
                  preset === 'infinito'
                    ? `${formatMonthShort(horizon.summary.horizonEnd)} (${horizon.summary.monthsCount}m · Contínuo ∞)`
                    : `${formatMonthShort(horizon.summary.horizonEnd)} (${horizon.summary.monthsCount} meses)`
                }`}
          </span>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">Tipo de acompanhamento</label>
            <div className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-10 gap-1.5">
              {(
                [
                  { id: 'diarios', label: 'Lançamentos diários' },
                  { id: 'semanais', label: 'Semanais' },
                  { id: 'mensais', label: 'Mensais' },
                  { id: 'trimestral', label: 'Trimestral' },
                  { id: '12m', label: '12 meses' },
                  { id: '24m', label: '24 meses' },
                  { id: '60m', label: '5 anos' },
                  { id: '120m', label: '10 anos' },
                  { id: 'infinito', label: 'Infinito ∞' },
                  { id: 'custom', label: 'Mês final' },
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
                  className={`min-h-[38px] px-2 py-1.5 text-xs font-semibold rounded-lg border transition-colors cursor-pointer whitespace-nowrap truncate ${
                    preset === opt.id
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {!isShortTerm && (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end pt-1">
              <div className="md:col-span-4 space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-slate-700">Mês inicial</label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setStartMonth(nextMonth)}
                      className={`text-[11px] font-semibold cursor-pointer ${
                        startMonth === nextMonth ? 'text-slate-900 underline' : 'text-sky-700 hover:underline'
                      }`}
                    >
                      Próx. ({formatMonthShort(nextMonth)})
                    </button>
                    <button
                      type="button"
                      onClick={() => setStartMonth(currentMonth)}
                      className={`text-[11px] font-semibold cursor-pointer ${
                        startMonth === currentMonth ? 'text-slate-900 underline' : 'text-slate-500 hover:underline'
                      }`}
                    >
                      Atual
                    </button>
                  </div>
                </div>
                <input
                  type="month"
                  value={startMonth}
                  onChange={(e) => e.target.value && setStartMonth(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                />
              </div>

              <div className="md:col-span-8 space-y-1">
                {preset === 'custom' ? (
                  <>
                    <label className="text-xs font-medium text-slate-700">Mês final (livre)</label>
                    <input
                      type="month"
                      min={startMonth}
                      value={customEndMonth}
                      onChange={(e) => e.target.value && setCustomEndMonth(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                    />
                  </>
                ) : preset === 'infinito' ? (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleExpandInfinite(12)}
                      disabled={infiniteMonthsCount >= MAX_HORIZON_MONTHS}
                      className="min-h-[38px] px-3 py-1.5 text-xs font-semibold bg-sky-50 text-sky-900 border border-sky-200 rounded-lg hover:bg-sky-100 disabled:opacity-50 cursor-pointer whitespace-nowrap"
                    >
                      +12 meses
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExpandInfinite(60)}
                      disabled={infiniteMonthsCount >= MAX_HORIZON_MONTHS}
                      className="min-h-[38px] px-3 py-1.5 text-xs font-semibold bg-sky-50 text-sky-900 border border-sky-200 rounded-lg hover:bg-sky-100 disabled:opacity-50 cursor-pointer whitespace-nowrap"
                    >
                      +5 anos
                    </button>
                  </div>
                ) : (
                  <div className="h-[38px] px-3 flex items-center text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg">
                    Projeção até {formatMonthFull(horizon.summary.horizonEnd)}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Análise de IA (quando solicitada) */}
      {(aiInsight || aiError) && (
        <section
          className={`rounded-xl border p-5 space-y-3 ${
            aiError ? 'bg-red-50 border-red-200' : 'bg-white border-sky-200'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Sparkles className={`w-4 h-4 ${aiError ? 'text-red-600' : 'text-sky-600'}`} />
              <h2 className="text-sm font-semibold text-slate-900">Leitura do Horizonte pela IA</h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('ia')}
              className="text-xs font-semibold text-sky-700 hover:underline cursor-pointer"
            >
              Continuar no Assistente IA
            </button>
          </div>
          {aiError ? (
            <p className="text-sm text-red-700">{aiError}</p>
          ) : (
            <div className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">{aiInsight}</div>
          )}
        </section>
      )}

      {/* KPIs do Horizonte (Curto Prazo Diário/Semanal/Mensal vs Trimestral/Longo Prazo) */}
      {isShortTerm && shortHorizon ? (
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-900 text-white rounded-xl p-5 space-y-1.5">
            <span className="text-xs font-medium text-slate-300">Saldo inicial nas contas</span>
            <p className="text-2xl font-bold font-mono tabular-nums text-emerald-300">
              {formatBRL(shortHorizon.summary.startBalance)}
            </p>
            <p className="text-xs text-slate-300">
              {shortHorizon.hasAccountBalances ? (
                'Soma atual das contas cadastradas'
              ) : (
                <button
                  type="button"
                  onClick={() => onNavigate('config')}
                  className="underline text-amber-300 cursor-pointer"
                >
                  Informe os saldos das suas contas
                </button>
              )}
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-1.5">
            <span className="text-xs font-medium text-slate-500">
              Saldo projetado ({preset === 'diarios' ? '7 dias' : '4 semanas'})
            </span>
            <p
              className={`text-2xl font-bold font-mono tabular-nums ${
                shortHorizon.summary.endBalance < 0 ? 'text-red-600' : 'text-emerald-700'
              }`}
            >
              {formatBRL(shortHorizon.summary.endBalance)}
            </p>
            <p className="text-xs text-slate-500">Em {formatDateBR(shortHorizon.endDateISO)}</p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-1.5">
            <span className="text-xs font-medium text-slate-500">Fluxo no período</span>
            <p className="text-sm font-bold font-mono tabular-nums text-emerald-700">
              + {formatBRL(shortHorizon.summary.totalEntries)} <span className="text-[11px] font-normal text-slate-500">entradas</span>
            </p>
            <p className="text-sm font-bold font-mono tabular-nums text-red-600">
              − {formatBRL(shortHorizon.summary.totalExpenses)}{' '}
              <span className="text-[11px] font-normal text-slate-500">saídas/faturas</span>
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-1.5">
            <span className="text-xs font-medium text-slate-500">Menor saldo no período</span>
            <p
              className={`text-2xl font-bold font-mono tabular-nums ${
                shortHorizon.summary.lowestBalance < 0 ? 'text-red-600' : 'text-amber-600'
              }`}
            >
              {formatBRL(shortHorizon.summary.lowestBalance)}
            </p>
            <p className="text-xs text-slate-500">
              {shortHorizon.summary.lowestDay
                ? `Em ${formatDateBR(shortHorizon.summary.lowestDay.dateISO)}`
                : 'Sem movimentação'}
            </p>
          </div>
        </section>
      ) : (
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {(() => {
            const firstHorizonRow = horizon.rows[0];
            const pastImpactAmount =
              (firstHorizonRow?.pastMonthInvoiceImpact ?? 0) + (firstHorizonRow?.pastMonthCarryoverDebt ?? 0);
            return (
              <div className="bg-slate-900 text-white rounded-xl p-5 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-slate-300">
                    Saldo previsto ·{' '}
                    {firstHorizonRow ? formatMonthShort(firstHorizonRow.monthKey) : formatMonthShort(startMonth)}
                  </span>
                  {firstHorizonRow?.hasPastMonthImpact && (
                    <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-orange-500/20 text-orange-300 border border-orange-400/30">
                      Faturas
                    </span>
                  )}
                </div>
                <p
                  className={`text-2xl font-bold font-mono tabular-nums ${
                    firstHorizonRow?.hasPastMonthImpact
                      ? 'text-orange-300'
                      : (firstHorizonRow?.simulatedSurplus ?? 0) < 0
                        ? 'text-red-300'
                        : 'text-emerald-300'
                  }`}
                >
                  {firstHorizonRow ? formatBRL(firstHorizonRow.simulatedSurplus) : '—'}
                </p>
                <p className="text-xs text-slate-300 font-mono tabular-nums">
                  Salário/Ganhos {formatBRL0(firstHorizonRow?.totalEntries ?? 0)} − Despesas{' '}
                  {formatBRL0(firstHorizonRow?.simulatedExpenses ?? 0)}
                </p>
                {firstHorizonRow?.hasPastMonthImpact && pastImpactAmount > 0 && (
                  <p className="text-[11px] text-orange-300">
                    Inclui {formatBRL0(pastImpactAmount)} de meses passados
                  </p>
                )}
              </div>
            );
          })()}

          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-1.5">
            <span className="text-xs font-medium text-slate-500">Gastos totais no horizonte</span>
            <p className="text-2xl font-bold font-mono tabular-nums text-red-600">
              {formatBRL(horizon.summary.totalSimulatedExpenses)}
            </p>
            <p className="text-xs text-slate-500">
              Base {formatBRL(horizon.summary.totalBaseExpenses)}
              {horizon.summary.totalSimulatedAdded > 0 && (
                <span className="text-amber-600 font-semibold">
                  {' '}
                  + {formatBRL(horizon.summary.totalSimulatedAdded)} simulado
                </span>
              )}
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-1.5">
            <span className="text-xs font-medium text-slate-500">Mês de maior aperto</span>
            <p
              className={`text-2xl font-bold font-mono tabular-nums ${
                (horizon.summary.lowestSurplusRow?.simulatedSurplus ?? 0) < 0 ? 'text-red-600' : 'text-emerald-700'
              }`}
            >
              {horizon.summary.lowestSurplusRow ? formatBRL(horizon.summary.lowestSurplusRow.simulatedSurplus) : '—'}
            </p>
            <p className="text-xs text-slate-500">
              {horizon.summary.lowestSurplusRow
                ? `Em ${formatMonthShort(horizon.summary.lowestSurplusRow.monthKey)} (gasto ${formatBRL(
                    horizon.summary.lowestSurplusRow.simulatedExpenses
                  )})`
                : 'Sem meses no período'}
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-500">Equilíbrio ao infinito (pós-parcelas)</span>
              <InfinityIcon className="w-4 h-4 text-emerald-600 shrink-0" />
            </div>
            <p
              className={`text-2xl font-bold font-mono tabular-nums ${
                horizon.summary.perpetualMonthlySurplus < 0 ? 'text-red-600' : 'text-emerald-700'
              }`}
            >
              {formatBRL(horizon.summary.perpetualMonthlySurplus)}/mês
            </p>
            <p className="text-xs text-slate-500">
              Renda contínua {formatBRL0(horizon.summary.perpetualIncome)} − Fixos contínuos{' '}
              {formatBRL0(horizon.summary.perpetualFixedExpense)}
            </p>
          </div>
        </section>
      )}

      {horizon.summary.negativeBalanceOffset.negativeBalanceDebt > 0 && (
        <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex flex-wrap items-center justify-between gap-2">
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
          {horizon.summary.negativeBalanceOffset.remainingUnabsorbedDebt > 0 && (
            <span className="font-semibold text-red-700 font-mono tabular-nums">
              Restante sem renda fixa futura: −{formatBRL(horizon.summary.negativeBalanceOffset.remainingUnabsorbedDebt)}
            </span>
          )}
        </div>
      )}

      {/* Simulador de Impacto de Compras + Gráficos */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 min-w-0 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Simular nova compra no horizonte</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Teste uma compra agora ou nos próximos meses (à vista, parcelada ou fixa) sem alterar seus lançamentos reais.
            </p>
          </div>

          <form onSubmit={handleAddSimulated} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Descrição da compra</label>
              <input
                type="text"
                required
                maxLength={80}
                value={simDesc}
                onChange={(e) => setSimDesc(e.target.value)}
                placeholder="Ex.: Geladeira, Viagem, Sofá, Academia..."
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
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
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Modalidade</label>
                <select
                  value={simMode}
                  onChange={(e) => setSimMode(e.target.value as SimulatedPurchaseMode)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                >
                  <option value="parcelado">Parcelado (Nx)</option>
                  <option value="avista">À vista (1x)</option>
                  <option value="fixo">Gasto fixo contínuo</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Mês da compra / início</label>
                <input
                  type="month"
                  value={simStartMonth}
                  onChange={(e) => setSimStartMonth(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>

              {simMode === 'parcelado' ? (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Parcelas</label>
                  <input
                    type="number"
                    min="1"
                    max="120"
                    value={simInstallments}
                    onChange={(e) => setSimInstallments(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg"
                  />
                </div>
              ) : simMode === 'fixo' ? (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Mês final (opcional)</label>
                  <input
                    type="month"
                    value={simEndMonth}
                    onChange={(e) => setSimEndMonth(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Dia da compra</label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    value={simDay}
                    onChange={(e) => setSimDay(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg"
                  />
                </div>
              )}
            </div>

            {simMode !== 'fixo' && cards.filter((c) => c.active).length > 0 && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Cartão (respeita fechamento)</label>
                  <select
                    value={simCardId}
                    onChange={(e) => setSimCardId(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="">Sem cartão (no mês)</option>
                    {cards
                      .filter((c) => c.active)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} (fecha dia {c.closingDay})
                        </option>
                      ))}
                  </select>
                </div>
                {simMode === 'parcelado' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Dia da compra</label>
                    <input
                      type="number"
                      min="1"
                      max="31"
                      value={simDay}
                      onChange={(e) => setSimDay(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg"
                    />
                  </div>
                )}
              </div>
            )}

            <button
              type="submit"
              className="w-full min-h-[42px] inline-flex items-center justify-center gap-2 px-4 py-2 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-800 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Adicionar ao Horizonte
            </button>
          </form>

          {pendingPlanned.length > 0 && (
            <div className="pt-3 border-t border-slate-100 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                <ShoppingBag className="w-3.5 h-3.5 text-slate-500" />
                Simular item das Compras Planejadas:
              </div>
              <div className="flex flex-wrap gap-1.5">
                {pendingPlanned.slice(0, 5).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleImportPlanned(p.id)}
                    className="px-2.5 py-1.5 text-xs bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-slate-700 cursor-pointer truncate max-w-full"
                  >
                    + {p.product} ({formatBRL0(p.estimatedUnitPrice * p.quantity)})
                  </button>
                ))}
              </div>
            </div>
          )}

          {simulatedPurchases.length > 0 && (
            <div className="pt-3 border-t border-slate-100 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-900">Compras simuladas ({simulatedPurchases.length})</span>
                <button
                  type="button"
                  onClick={() => {
                    setSimulatedPurchases([]);
                    setAiInsight(null);
                  }}
                  className="text-xs text-slate-500 hover:text-red-600 cursor-pointer"
                >
                  Limpar todas
                </button>
              </div>
              <div className="space-y-2">
                {simulatedPurchases.map((sim) => (
                  <div
                    key={sim.id}
                    className={`p-3 rounded-lg border flex items-center justify-between gap-2 ${
                      sim.enabled ? 'bg-amber-50/60 border-amber-200' : 'bg-slate-50 border-slate-200 opacity-60'
                    }`}
                  >
                    <label className="flex items-start gap-2.5 min-w-0 flex-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={sim.enabled}
                        onChange={() => toggleSimulated(sim.id)}
                        className="mt-1 w-4 h-4 rounded border-slate-300"
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-900 truncate">{sim.description}</p>
                        <p className="text-[11px] text-slate-600">
                          {formatBRL(sim.totalAmount)} ·{' '}
                          {sim.mode === 'avista'
                            ? `À vista em ${formatMonthShort(sim.startMonthKey)}`
                            : sim.mode === 'parcelado'
                              ? `${sim.installmentsCount}x de ${formatBRL(sim.totalAmount / sim.installmentsCount)} (${formatMonthShort(
                                  sim.startMonthKey
                                )})`
                              : `Fixo mensal (${formatMonthShort(sim.startMonthKey)}${
                                  sim.endMonthKey ? ` → ${formatMonthShort(sim.endMonthKey)}` : ' → ∞'
                                })`}
                        </p>
                      </div>
                    </label>
                    <button
                      type="button"
                      onClick={() => removeSimulated(sim.id)}
                      className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg cursor-pointer shrink-0"
                      aria-label="Remover simulação"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Gráficos do Horizonte (Verde = Positivo, Vermelho = Negativo, Laranja/Amarelo = Melhora/Piora) */}
        <div key={isShortTerm ? preset : `long-${horizon.summary.monthsCount}`} className="lg:col-span-7 min-w-0 space-y-6 duofin-chart-enter">
          {isShortTerm && shortHorizon ? (
            <>
              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-base font-semibold text-slate-900">
                    {isWeeklyMode
                      ? 'Evolução do saldo por semana (Semanais)'
                      : 'Evolução do saldo dia a dia (Lançamentos diários · 7d)'}
                  </h2>
                  <span className="text-xs text-slate-500">Saldo acumulado projetado</span>
                </div>
                <div className="h-64 min-w-0 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={
                        (isWeeklyMode ? weeklyHorizonRows : shortHorizon.rows).map((r) => ({
                          label: r.label,
                          projectedBalance: r.projectedBalance,
                          entries: r.entries,
                          expenses: r.expenses,
                          simulatedImpact: r.simulatedImpact,
                        }))
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
                      <Area
                        {...CHART_ANIMATION}
                        type="monotone"
                        dataKey="projectedBalance"
                        name="Saldo projetado"
                        stroke={
                          shortHorizon.summary.endBalance < 0
                            ? SEMANTIC_COLORS.negative
                            : SEMANTIC_COLORS.positive
                        }
                        fill={
                          shortHorizon.summary.endBalance < 0
                            ? SEMANTIC_COLORS.negativeSoft
                            : SEMANTIC_COLORS.positiveSoft
                        }
                        fillOpacity={0.28}
                        strokeWidth={2.5}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 min-w-0">
                <h2 className="text-base font-semibold text-slate-900">
                  {isWeeklyMode ? 'Entradas vs Saídas e Faturas semanais' : 'Entradas vs Saídas e Faturas diárias'}
                </h2>
                <div className="h-64 min-w-0 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={
                        (isWeeklyMode ? weeklyHorizonRows : shortHorizon.rows).map((r) => ({
                          label: r.label,
                          projectedBalance: r.projectedBalance,
                          entries: r.entries,
                          expenses: r.expenses,
                          simulatedImpact: r.simulatedImpact,
                        }))
                      }
                      margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridStroke} vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: chartTheme.axisTick }} axisLine={false} tickLine={false} />
                      <YAxis
                        width={48}
                        tick={{ fontSize: 10, fill: chartTheme.axisTick }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) => `R$${Math.round(v)}`}
                      />
                      <Tooltip formatter={(val: unknown) => formatBRL(Number(val))} contentStyle={chartTheme.tooltipStyle} />
                      <Legend wrapperStyle={chartTheme.legendStyle} />
                      <Bar {...CHART_ANIMATION} dataKey="entries" name="Entradas" fill={SEMANTIC_COLORS.positive} radius={[3, 3, 0, 0]} />
                      <Bar {...CHART_ANIMATION} dataKey="expenses" name="Saídas / Faturas" fill={SEMANTIC_COLORS.negative} radius={[3, 3, 0, 0]} />
                      <Bar {...CHART_ANIMATION} dataKey="simulatedImpact" name="Simulação" fill={SEMANTIC_COLORS.orangeDeep} radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 min-w-0">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">Saldo do mês (projeção dos próximos meses)</h2>
                    <p className="text-xs text-slate-500">
                      Meses em laranja têm impacto de faturas, parcelas ou saldo de meses passados.
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-xs" style={{ backgroundColor: SEMANTIC_COLORS.positive }} />
                    Saldo livre positivo
                  </span>
                  <span className="inline-flex items-center gap-1.5 font-medium text-orange-700">
                    <span className="w-2.5 h-2.5 rounded-xs" style={{ backgroundColor: SEMANTIC_COLORS.orangeDeep }} />
                    Impacto de meses passados (faturas sendo usadas)
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-xs" style={{ backgroundColor: SEMANTIC_COLORS.negative }} />
                    Saldo negativo
                  </span>
                </div>
                <div className="h-64 min-w-0 w-full">
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
                            <div
                              style={chartTheme.tooltipStyle}
                              className="p-3 shadow-md space-y-1.5 max-w-xs"
                            >
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
                                Entradas: {formatBRL(row.totalEntries)} · Despesas/Faturas: {formatBRL(row.simulatedExpenses)}
                              </p>
                              {row.hasPastMonthImpact && (
                                <div className="pt-1 border-t border-orange-200/60 text-[11px] text-orange-600 space-y-0.5">
                                  <p className="font-semibold">Impacto de meses passados:</p>
                                  {row.pastMonthImpactReasons.map((reason, idx) => (
                                    <p key={idx}>• {reason}</p>
                                  ))}
                                </div>
                              )}
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

              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-base font-semibold text-slate-900">Impacto na sobra e gastos futuros</h2>
                  <span className="text-xs text-slate-500">Base × Com novas compras</span>
                </div>
                <div className="h-64 min-w-0 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
                      <Area
                        {...CHART_ANIMATION}
                        type="monotone"
                        dataKey="totalEntries"
                        name="Entradas (Positivo)"
                        stroke={SEMANTIC_COLORS.positive}
                        fill={SEMANTIC_COLORS.positiveSoft}
                        fillOpacity={0.28}
                        strokeWidth={2}
                      />
                      <Area
                        {...CHART_ANIMATION}
                        type="monotone"
                        dataKey="totalExpenses"
                        name="Gasto base (Negativo)"
                        stroke={SEMANTIC_COLORS.negative}
                        fill={SEMANTIC_COLORS.negativeSoft}
                        fillOpacity={0.25}
                        strokeWidth={2}
                      />
                      {horizon.summary.totalSimulatedAdded > 0 && (
                        <Area
                          {...CHART_ANIMATION}
                          type="monotone"
                          dataKey="simulatedExpenses"
                          name="Gasto com simulação (Piora)"
                          stroke={SEMANTIC_COLORS.orangeDeep}
                          fill={SEMANTIC_COLORS.yellowBright}
                          fillOpacity={0.35}
                          strokeWidth={2.5}
                        />
                      )}
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-slate-600" />
                    <h2 className="text-base font-semibold text-slate-900">Composição do comprometimento mensal</h2>
                  </div>
                </div>
                <div className="h-64 min-w-0 w-full">
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
                      <Bar {...CHART_ANIMATION} dataKey="simulatedPurchaseImpact" name="Nova compra" stackId="a" fill={SEMANTIC_COLORS.orangeLight} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </>
          )}
        </div>
      </section>

      {/* Tabela / Lista (Semanais OU Dia a Dia para Diários/Mensais OU Mês a Mês para Trimestral+) */}
      {isWeeklyMode && shortHorizon ? (
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="text-base font-semibold text-slate-900">Acompanhamento Semanal (4 semanas)</h2>
            <p className="text-xs text-slate-500">
              Consolidado semanal de entradas, saídas, faturas e saldo acumulado.
            </p>
          </div>
          <div className="md:hidden divide-y divide-slate-100">
            {weeklyHorizonRows.map((wk) => (
              <div key={wk.weekIndex} className={`p-4 space-y-2 ${wk.projectedBalance < 0 ? 'bg-red-50/50' : ''}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-900">
                    {wk.label} ({wk.rangeLabel})
                  </span>
                  <span
                    className={`text-xs font-mono tabular-nums font-bold ${
                      wk.projectedBalance < 0 ? 'text-red-600' : 'text-emerald-700'
                    }`}
                  >
                    Saldo: {formatBRL(wk.projectedBalance)}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <div className="flex justify-between gap-1">
                    <span className="text-slate-500">Entradas</span>
                    <span className="font-mono tabular-nums text-emerald-700">{formatBRL(wk.entries)}</span>
                  </div>
                  <div className="flex justify-between gap-1">
                    <span className="text-slate-500">Saídas</span>
                    <span className="font-mono tabular-nums text-red-600">{formatBRL(wk.expenses)}</span>
                  </div>
                </div>
                {wk.events.length > 0 && (
                  <p className="text-[11px] text-slate-500 truncate">{wk.events.slice(0, 4).join(' · ')}</p>
                )}
              </div>
            ))}
          </div>
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Semana</th>
                  <th className="py-3 px-4">Período</th>
                  <th className="py-3 px-4">Principais eventos</th>
                  <th className="py-3 px-4 text-right">Entradas</th>
                  <th className="py-3 px-4 text-right">Saídas / Faturas</th>
                  <th className="py-3 px-4 text-right">Saldo da semana</th>
                  <th className="py-3 px-4 text-right">Saldo acumulado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {weeklyHorizonRows.map((wk) => (
                  <tr key={wk.weekIndex} className={wk.projectedBalance < 0 ? 'bg-red-50/50' : 'hover:bg-slate-50/60'}>
                    <td className="py-2.5 px-4 font-semibold text-slate-900">{wk.label}</td>
                    <td className="py-2.5 px-4 text-xs text-slate-500 whitespace-nowrap">{wk.rangeLabel}</td>
                    <td className="py-2.5 px-4 text-xs text-slate-600 max-w-xs truncate">
                      {wk.events.length > 0 ? wk.events.slice(0, 5).join(' · ') : '—'}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-emerald-700">
                      {wk.entries > 0 ? `+${formatBRL(wk.entries)}` : '—'}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-red-600">
                      {wk.expenses > 0 ? `−${formatBRL(wk.expenses)}` : '—'}
                    </td>
                    <td
                      className={`py-2.5 px-4 text-right font-mono tabular-nums font-medium ${
                        wk.netWeek > 0 ? 'text-emerald-700' : wk.netWeek < 0 ? 'text-red-600' : 'text-slate-400'
                      }`}
                    >
                      {formatBRL(wk.netWeek)}
                    </td>
                    <td
                      className={`py-2.5 px-4 text-right font-mono tabular-nums font-semibold ${
                        wk.projectedBalance < 0 ? 'text-red-600' : 'text-slate-900'
                      }`}
                    >
                      {formatBRL(wk.projectedBalance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : isDailyMode && shortHorizon ? (
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Lançamentos diários (7 dias)
              </h2>
              <p className="text-xs text-slate-500">
                Exibindo {displayedDailyRows.length} de {shortHorizon.rows.length} dias com faturas, fixos e entradas.
              </p>
            </div>
            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={onlyImpactRows}
                onChange={(e) => setOnlyImpactRows(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300"
              />
              Mostrar só dias com movimentação / negativo
            </label>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden divide-y divide-slate-100">
            {displayedDailyRows.map((row) => (
              <div key={row.dateISO} className={`p-4 space-y-2 ${row.projectedBalance < 0 ? 'bg-red-50/50' : ''}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-900">
                    {row.label} ({row.weekday})
                  </span>
                  <span
                    className={`text-xs font-mono tabular-nums font-bold ${
                      row.projectedBalance < 0 ? 'text-red-600' : 'text-emerald-700'
                    }`}
                  >
                    Saldo: {formatBRL(row.projectedBalance)}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <div className="flex justify-between gap-1">
                    <span className="text-slate-500">Entradas</span>
                    <span className="font-mono tabular-nums text-emerald-700">{formatBRL(row.entries)}</span>
                  </div>
                  <div className="flex justify-between gap-1">
                    <span className="text-slate-500">Saídas</span>
                    <span className="font-mono tabular-nums text-red-600">{formatBRL(row.expenses)}</span>
                  </div>
                </div>
                {row.events.length > 0 && (
                  <p className="text-[11px] text-slate-500 truncate">{row.events.join(' · ')}</p>
                )}
              </div>
            ))}
          </div>

          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Data</th>
                  <th className="py-3 px-4">Eventos previstos</th>
                  <th className="py-3 px-4 text-right">Entradas</th>
                  <th className="py-3 px-4 text-right">Saídas / Faturas</th>
                  <th className="py-3 px-4 text-right">Saldo do dia</th>
                  <th className="py-3 px-4 text-right">Saldo acumulado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayedDailyRows.map((row) => (
                  <tr key={row.dateISO} className={row.projectedBalance < 0 ? 'bg-red-50/50' : 'hover:bg-slate-50/60'}>
                    <td className="py-2.5 px-4 whitespace-nowrap font-medium text-slate-900">
                      {row.label} <span className="text-xs text-slate-500">({row.weekday})</span>
                    </td>
                    <td className="py-2.5 px-4 text-xs text-slate-600 max-w-xs truncate">
                      {row.events.length > 0 ? row.events.join(' · ') : '—'}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-emerald-700">
                      {row.entries > 0 ? `+${formatBRL(row.entries)}` : '—'}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-red-600">
                      {row.expenses > 0 ? `−${formatBRL(row.expenses)}` : '—'}
                    </td>
                    <td
                      className={`py-2.5 px-4 text-right font-mono tabular-nums font-medium ${
                        row.netDay > 0 ? 'text-emerald-700' : row.netDay < 0 ? 'text-red-600' : 'text-slate-400'
                      }`}
                    >
                      {row.netDay !== 0 ? formatBRL(row.netDay) : '—'}
                    </td>
                    <td
                      className={`py-2.5 px-4 text-right font-mono tabular-nums font-semibold ${
                        row.projectedBalance < 0 ? 'text-red-600' : 'text-slate-900'
                      }`}
                    >
                      {formatBRL(row.projectedBalance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Projeção mês a mês</h2>
              <p className="text-xs text-slate-500">
                Exibindo {displayedRows.length} de {horizon.rows.length} meses
                {preset === 'infinito' ? ' (expanda continuamente abaixo)' : ''}.
              </p>
            </div>
            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={onlyImpactRows}
                onChange={(e) => setOnlyImpactRows(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300"
              />
              Mostrar só meses impactados / negativos
            </label>
          </div>

          {/* Mobile Cards (Zero horizontal scroll) */}
          <div className="md:hidden divide-y divide-slate-100">
            {displayedRows.map((row) => (
              <div
                key={row.monthKey}
                className={`p-4 space-y-2 ${
                  row.hasPastMonthImpact
                    ? 'bg-orange-50/70 dark:bg-orange-950/25'
                    : row.simulatedSurplus < 0
                      ? 'bg-red-50/50'
                      : ''
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-semibold text-slate-900">{formatMonthShort(row.monthKey)}</span>
                    {row.hasPastMonthImpact && (
                      <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-orange-100 text-orange-800 border border-orange-200 truncate">
                        Fatura/mês anterior
                      </span>
                    )}
                  </div>
                  <span
                    className={`text-xs font-mono tabular-nums font-bold ${
                      row.hasPastMonthImpact
                        ? 'text-orange-700'
                        : row.simulatedSurplus < 0
                          ? 'text-red-600'
                          : 'text-emerald-700'
                    }`}
                  >
                    Saldo: {formatBRL(row.simulatedSurplus)}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <div className="flex justify-between gap-1">
                    <span className="text-slate-500">Entradas</span>
                    <span className="font-mono tabular-nums text-emerald-700">{formatBRL(row.totalEntries)}</span>
                  </div>
                  <div className="flex justify-between gap-1">
                    <span className="text-slate-500">Gasto base</span>
                    <span className="font-mono tabular-nums text-red-600">{formatBRL(row.totalExpenses)}</span>
                  </div>
                  <div className="flex justify-between gap-1">
                    <span className="text-slate-500">Nova compra</span>
                    <span className="font-mono tabular-nums text-amber-600 font-medium">
                      +{formatBRL(row.simulatedPurchaseImpact)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-1">
                    <span className="text-slate-500">Comprometido</span>
                    <span className="font-mono tabular-nums text-slate-900 font-medium">
                      {formatPct(row.simulatedCommittedPct, 0)}
                    </span>
                  </div>
                </div>
                {row.hasPastMonthImpact && row.pastMonthImpactReasons.length > 0 && (
                  <p className="text-[11px] text-orange-700 truncate">
                    {row.pastMonthImpactReasons.join(' · ')}
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Mês</th>
                  <th className="py-3 px-4 text-right">Entradas</th>
                  <th className="py-3 px-4 text-right">Fixas + Lançados</th>
                  <th className="py-3 px-4 text-right">Parcelas</th>
                  <th className="py-3 px-4 text-right">Nova compra</th>
                  <th className="py-3 px-4 text-right">Gasto total</th>
                  <th className="py-3 px-4 text-right">Comprometido</th>
                  <th className="py-3 px-4 text-right">Saldo do mês</th>
                  <th className="py-3 px-4 text-right">Saldo acumulado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayedRows.map((row) => (
                  <tr
                    key={row.monthKey}
                    className={
                      row.hasPastMonthImpact
                        ? 'bg-orange-50/70 dark:bg-orange-950/25 hover:bg-orange-50'
                        : row.simulatedSurplus < 0
                          ? 'bg-red-50/50'
                          : 'hover:bg-slate-50/60'
                    }
                  >
                    <td className="py-2.5 px-4 whitespace-nowrap font-medium text-slate-900">
                      <div className="flex items-center gap-2">
                        <span>{formatMonthShort(row.monthKey)}</span>
                        {row.hasPastMonthImpact && (
                          <span
                            title={row.pastMonthImpactReasons.join(' | ')}
                            className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-orange-100 text-orange-800 border border-orange-200"
                          >
                            Fatura/mês anterior
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-emerald-700">
                      {formatBRL(row.totalEntries)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700">
                      {formatBRL(row.recurringExpenses + row.launchedExpenses)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700">
                      {formatBRL(row.installmentsTotal)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-amber-600 font-medium">
                      {row.simulatedPurchaseImpact > 0 ? `+${formatBRL(row.simulatedPurchaseImpact)}` : '—'}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-red-600">
                      {formatBRL(row.simulatedExpenses)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-600">
                      {formatPct(row.simulatedCommittedPct, 0)}
                    </td>
                    <td
                      className={`py-2.5 px-4 text-right font-mono tabular-nums font-semibold ${
                        row.hasPastMonthImpact
                          ? 'text-orange-700'
                          : row.simulatedSurplus < 0
                            ? 'text-red-600'
                            : 'text-emerald-700'
                      }`}
                    >
                      {formatBRL(row.simulatedSurplus)}
                      {row.hasPastMonthImpact && row.pastMonthInvoiceImpact > 0 && (
                        <span className="block text-[10px] font-normal text-orange-600">
                          {formatBRL(row.pastMonthInvoiceImpact)} de meses passados
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-900">
                      {formatBRL(row.simulatedCumulativeBalance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {(visibleRowsLimit < horizon.rows.length || preset === 'infinito') && (
            <div className="px-5 py-4 border-t border-slate-100 bg-slate-50 flex flex-wrap items-center justify-center gap-2">
              {visibleRowsLimit < horizon.rows.length && (
                <button
                  type="button"
                  onClick={() => setVisibleRowsLimit((v) => v + 24)}
                  className="px-4 py-2 text-xs font-semibold bg-white border border-slate-200 rounded-lg text-slate-800 hover:bg-slate-100 cursor-pointer"
                >
                  Exibir mais 24 meses da lista
                </button>
              )}
              {preset === 'infinito' && infiniteMonthsCount < MAX_HORIZON_MONTHS && (
                <button
                  type="button"
                  onClick={() => handleExpandInfinite(24)}
                  className="px-4 py-2 text-xs font-semibold bg-slate-900 text-white rounded-lg hover:bg-slate-800 cursor-pointer"
                >
                  Projetar mais 24 meses rumo ao infinito (∞)
                </button>
              )}
            </div>
          )}
        </section>
      )}
        </div>
      )}
    </div>
  );
}
