import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, Wallet } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useFinance } from '../context/AuthHouseholdContext';
import { useTheme } from '../context/ThemeContext';
import type { ReportsHubTab } from '../types/finance';
import { CHART_ANIMATION, getChartTheme, getSemanticCategoryColor, SEMANTIC_COLORS } from '../utils/chartColors';
import {
  addMonthsToKey,
  computeMonthlyPanel,
  formatBRL,
  formatMonthShort,
  formatPct,
  getCurrentMonthKey,
  getInstallmentAmountInMonth,
  getMonthKeysFromStart,
  getMonthKeysRange,
  getMonthlyCoupleIncome,
  getRecurringItemAmountInMonth,
} from '../utils/financeCalculations';
import { classifyIncomeSourceToCategory, resolveHouseholdIncomeCategories } from '../utils/validation';
import { IncomesPage } from './IncomesPage';

const INCOME_COLORS = [
  '#059669',
  '#10b981',
  '#0d9488',
  '#14b8a6',
  '#0284c7',
  '#0ea5e9',
  '#16a34a',
  '#22c55e',
  '#047857',
];

interface ReportsPageProps {
  initialTab?: ReportsHubTab;
}

export function ReportsPage({ initialTab = 'resumo' }: ReportsPageProps) {
  const { household, incomes, transactions, installments, recurringItems, bankAccounts, cards } = useFinance();
  const { isDark } = useTheme();
  const chartTheme = getChartTheme(isDark);

  const [activeTab, setActiveTab] = useState<ReportsHubTab>(initialTab);
  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const currentMonthKey = getCurrentMonthKey();
  const [periodMode, setPeriodMode] = useState<string>('PERIOD_12');
  const [customStart, setCustomStart] = useState<string>('2026-12');
  const [customEnd, setCustomEnd] = useState<string>(addMonthsToKey('2026-12', 23));

  const availableYears = useMemo(() => {
    const years = new Set<string>([String(new Date().getFullYear()), '2026', '2027']);
    transactions.forEach((t) => years.add(t.date.slice(0, 4)));
    installments.forEach((i) => years.add(i.firstChargeDate.slice(0, 4)));
    return Array.from(years).sort().reverse();
  }, [transactions, installments]);

  const monthKeys = useMemo(() => {
    const start = household?.periodStart ?? `${new Date().getFullYear()}-01-01`;
    if (periodMode === 'PERIOD_12') return getMonthKeysFromStart(start, 12);
    if (periodMode === 'PERIOD_24') return getMonthKeysFromStart(start, 24);
    if (periodMode === 'PERIOD_36') return getMonthKeysFromStart(start, 36);
    if (periodMode === 'PERIOD_60') return getMonthKeysFromStart(start, 60);
    if (periodMode === 'CUSTOM') return getMonthKeysRange(customStart, customEnd);
    return getMonthKeysFromStart(`${periodMode}-01-01`, 12);
  }, [periodMode, household, customStart, customEnd]);

  const panelRows = useMemo(
    () =>
      computeMonthlyPanel(
        monthKeys,
        incomes,
        transactions,
        installments,
        recurringItems,
        bankAccounts,
        undefined,
        cards
      ),
    [monthKeys, incomes, transactions, installments, recurringItems, bankAccounts, cards]
  );

  const periodTotals = useMemo(() => {
    const totalEntries = panelRows.reduce((s, r) => s + r.totalEntries, 0);
    const totalExpenses = panelRows.reduce((s, r) => s + r.totalExpenses, 0);
    const totalSavings = panelRows.reduce((s, r) => s + r.savingsTotal, 0);
    const totalSurplus = panelRows.reduce((s, r) => s + r.monthlySurplus, 0);
    return { totalEntries, totalExpenses, totalSavings, totalSurplus };
  }, [panelRows]);

  // Infográfico "Para onde foi o dinheiro" — Gastos por categoria no período inteiro
  const categoryData = useMemo(() => {
    const map = new Map<string, number>();
    const monthSet = new Set(monthKeys);
    for (const tx of transactions) {
      if (tx.type === 'Saída' && monthSet.has(tx.monthKey)) {
        map.set(tx.category, (map.get(tx.category) ?? 0) + tx.actualAmount);
      }
    }
    for (const item of recurringItems) {
      if (item.type === 'Saída') {
        for (const mk of monthKeys) {
          const amt = getRecurringItemAmountInMonth(item, mk, transactions);
          if (amt > 0) {
            map.set(item.category, (map.get(item.category) ?? 0) + amt);
          }
        }
      }
    }
    for (const inst of installments) {
      for (const mk of monthKeys) {
        const amt = getInstallmentAmountInMonth(inst, mk);
        if (amt > 0) {
          const cat = inst.category || 'Parcelamentos';
          map.set(cat, (map.get(cat) ?? 0) + amt);
        }
      }
    }
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [monthKeys, transactions, recurringItems, installments]);

  const totalCategoryExpenses = useMemo(
    () => categoryData.reduce((s, c) => s + c.value, 0),
    [categoryData]
  );

  // Infográfico "De onde veio o dinheiro" — Receitas por categoria no período inteiro
  const incomeCategoryData = useMemo(() => {
    const map = new Map<string, number>();
    const monthSet = new Set(monthKeys);
    const availableIncomeCats = resolveHouseholdIncomeCategories(household);

    for (const tx of transactions) {
      if (tx.type === 'Entrada' && monthSet.has(tx.monthKey)) {
        const cat = tx.category || 'Outras receitas';
        map.set(cat, (map.get(cat) ?? 0) + tx.actualAmount);
      }
    }

    for (const item of recurringItems) {
      if (item.type === 'Entrada') {
        for (const mk of monthKeys) {
          const amt = getRecurringItemAmountInMonth(item, mk, transactions);
          if (amt > 0) {
            const cat = item.category || 'Outras receitas';
            map.set(cat, (map.get(cat) ?? 0) + amt);
          }
        }
      }
    }

    for (const inc of incomes) {
      if (!inc.active) continue;
      const cat = classifyIncomeSourceToCategory(inc.source, availableIncomeCats);
      for (const mk of monthKeys) {
        const amt = getMonthlyCoupleIncome([inc], mk);
        if (amt > 0) {
          map.set(cat, (map.get(cat) ?? 0) + amt);
        }
      }
    }

    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [monthKeys, household, transactions, recurringItems, incomes]);

  const totalCategoryIncome = useMemo(
    () => incomeCategoryData.reduce((s, c) => s + c.value, 0),
    [incomeCategoryData]
  );

  const finalCumBalance = panelRows[panelRows.length - 1]?.cumulativeBalance ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Relatórios e Fontes de Renda</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {activeTab === 'resumo'
              ? `Visão consolidada de ${monthKeys.length} meses (${formatMonthShort(monthKeys[0])} até ${formatMonthShort(monthKeys[monthKeys.length - 1])}).`
              : 'Gerencie salários, renda recorrente e divisão entre os membros da casa.'}
          </p>
        </div>

        {activeTab === 'resumo' && (
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <select
              value={periodMode}
              onChange={(e) => setPeriodMode(e.target.value)}
              className="w-full sm:w-auto min-w-0 px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white font-medium text-slate-800 shrink-0"
            >
              <option value="PERIOD_12">Período inicial (12 meses)</option>
              <option value="PERIOD_24">24 meses (2 anos)</option>
              <option value="PERIOD_36">36 meses (3 anos)</option>
              <option value="PERIOD_60">60 meses (5 anos)</option>
              <option value="CUSTOM">Escolha livre (mês inicial e final)</option>
              {availableYears.map((y) => (
                <option key={y} value={y}>
                  Ano calendário {y}
                </option>
              ))}
            </select>

            {periodMode === 'CUSTOM' && (
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <input
                  type="month"
                  aria-label="Mês inicial"
                  value={customStart}
                  onChange={(e) => e.target.value && setCustomStart(e.target.value)}
                  className="flex-1 sm:w-auto px-2.5 py-2 text-xs border border-slate-200 rounded-lg bg-white"
                />
                <span className="text-xs text-slate-400">→</span>
                <input
                  type="month"
                  aria-label="Mês final"
                  min={customStart}
                  value={customEnd}
                  onChange={(e) => e.target.value && setCustomEnd(e.target.value)}
                  className="flex-1 sm:w-auto px-2.5 py-2 text-xs border border-slate-200 rounded-lg bg-white"
                />
              </div>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-800">
        <button
          type="button"
          onClick={() => setActiveTab('resumo')}
          className={`min-h-[42px] px-3 py-2 rounded-xl text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
            activeTab === 'resumo'
              ? 'bg-slate-900 dark:bg-emerald-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5 shrink-0" />
          <span>Resumo e Análises</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('renda')}
          className={`min-h-[42px] px-3 py-2 rounded-xl text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
            activeTab === 'renda'
              ? 'bg-slate-900 dark:bg-emerald-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
          }`}
        >
          <Wallet className="w-3.5 h-3.5 shrink-0" />
          <span>Fontes de Renda</span>
        </button>
      </div>

      {activeTab === 'renda' ? (
        <div key="renda" className="duofin-tab-enter">
          <IncomesPage />
        </div>
      ) : (
        <div key="resumo" className="duofin-tab-enter space-y-6">
          {/* KPIs do Período */}
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
          <span className="text-xs font-medium text-slate-500">Entradas no período</span>
          <p className="text-2xl font-bold font-mono tabular-nums text-emerald-700">
            {formatBRL(periodTotals.totalEntries)}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
          <span className="text-xs font-medium text-slate-500">Gastos no período</span>
          <p className="text-2xl font-bold font-mono tabular-nums text-red-600">
            {formatBRL(periodTotals.totalExpenses)}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
          <span className="text-xs font-medium text-slate-500">Economias lançadas</span>
          <p className="text-2xl font-bold font-mono tabular-nums text-amber-600">
            {formatBRL(periodTotals.totalSavings)}
          </p>
        </div>
        <div className="bg-slate-900 text-white rounded-xl p-5 space-y-2">
          <span className="text-xs font-medium text-slate-300">Sobra acumulada no período</span>
          <p className={`text-2xl font-bold font-mono tabular-nums ${periodTotals.totalSurplus < 0 ? 'text-red-300' : 'text-emerald-300'}`}>
            {formatBRL(periodTotals.totalSurplus)}
          </p>
        </div>
      </section>

      {/* Gráficos Principais (Verde Positivo / Vermelho Negativo / Amarelo-Laranja Atenção) */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 duofin-chart-enter">
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 min-w-0">
          <h2 className="text-base font-semibold text-slate-900">Entradas × Gastos × Economias</h2>
          <div className="h-64 min-w-0 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={panelRows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridStroke} vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: chartTheme.axisTick }} axisLine={false} tickLine={false} />
                <YAxis
                  width={46}
                  tick={{ fontSize: 10, fill: chartTheme.axisTick }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `R$${Math.round(v / 1000)}k`}
                />
                <Tooltip formatter={(val: unknown) => formatBRL(Number(val))} contentStyle={chartTheme.tooltipStyle} />
                <Legend wrapperStyle={chartTheme.legendStyle} />
                <Bar {...CHART_ANIMATION} dataKey="totalEntries" name="Entradas" fill={SEMANTIC_COLORS.positive} radius={[3, 3, 0, 0]} />
                <Bar {...CHART_ANIMATION} dataKey="totalExpenses" name="Gastos" fill={SEMANTIC_COLORS.negative} radius={[3, 3, 0, 0]} />
                <Bar {...CHART_ANIMATION} dataKey="savingsTotal" name="Economias" fill={SEMANTIC_COLORS.yellow} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 min-w-0">
          <h2 className="text-base font-semibold text-slate-900">Evolução do saldo acumulado</h2>
          <div className="h-64 min-w-0 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={panelRows} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridStroke} vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: chartTheme.axisTick }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fontSize: 11, fill: chartTheme.axisTick }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `R$${Math.round(v / 1000)}k`}
                />
                <Tooltip formatter={(val: unknown) => formatBRL(Number(val))} contentStyle={chartTheme.tooltipStyle} />
                <Line
                  {...CHART_ANIMATION}
                  type="monotone"
                  dataKey="cumulativeBalance"
                  name="Saldo acumulado"
                  stroke={finalCumBalance < 0 ? SEMANTIC_COLORS.negative : SEMANTIC_COLORS.positive}
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: finalCumBalance < 0 ? SEMANTIC_COLORS.negative : SEMANTIC_COLORS.positive }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* Infográfico "Para onde foi o dinheiro" — Rosca + Barras por categoria */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-5 min-w-0">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Para onde foi o dinheiro ({monthKeys.length} meses)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Distribuição completa dos gastos por categoria com participação percentual no orçamento.
          </p>
        </div>

        {categoryData.length === 0 ? (
          <p className="text-sm text-slate-500 py-6 text-center">Nenhum gasto registrado nos meses exibidos.</p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center duofin-chart-enter">
            <div className="lg:col-span-5 min-w-0 w-full h-64 relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    {...CHART_ANIMATION}
                    data={categoryData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={58}
                    outerRadius={92}
                    paddingAngle={2}
                  >
                    {categoryData.map((cat, idx) => {
                      const share = totalCategoryExpenses > 0 ? cat.value / totalCategoryExpenses : 0;
                      return <Cell key={cat.name} fill={getSemanticCategoryColor(idx, share)} />;
                    })}
                  </Pie>
                  <Tooltip formatter={(val: unknown) => formatBRL(Number(val))} contentStyle={chartTheme.tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center px-4">
                <span className="text-[10px] uppercase tracking-wide text-slate-500">Total no período</span>
                <span className="text-xs font-bold font-mono tabular-nums text-slate-900">
                  {formatBRL(totalCategoryExpenses)}
                </span>
              </div>
            </div>

            <div className="lg:col-span-7 min-w-0 w-full h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryData} margin={{ top: 8, right: 8, left: 0, bottom: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridStroke} vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 10, fill: chartTheme.axisTick }}
                    tickFormatter={(v: string) => (v.length > 9 ? `${v.slice(0, 8)}…` : v)}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    width={46}
                    tick={{ fontSize: 10, fill: chartTheme.axisTick }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `R$${Math.round(v / 1000)}k`}
                  />
                  <Tooltip formatter={(val: unknown) => formatBRL(Number(val))} contentStyle={chartTheme.tooltipStyle} />
                  <Bar {...CHART_ANIMATION} dataKey="value" name="Total gasto" radius={[4, 4, 0, 0]} barSize={28}>
                    {categoryData.map((cat, idx) => {
                      const share = totalCategoryExpenses > 0 ? cat.value / totalCategoryExpenses : 0;
                      return <Cell key={cat.name} fill={getSemanticCategoryColor(idx, share)} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="lg:col-span-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-2 border-t border-slate-100">
              {categoryData.map((cat, idx) => {
                const share = totalCategoryExpenses > 0 ? cat.value / totalCategoryExpenses : 0;
                const fillHex = getSemanticCategoryColor(idx, share);
                return (
                  <div key={cat.name} className="p-3 rounded-lg bg-slate-50 border border-slate-100 space-y-1.5">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="inline-flex items-center gap-2 font-semibold text-slate-800 truncate">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: fillHex }} />
                        <span className="truncate">{cat.name}</span>
                      </span>
                      <span className="font-mono tabular-nums text-slate-900 font-bold shrink-0">
                        {formatPct(share, 1)}
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${Math.min(100, share * 100)}%`, backgroundColor: fillHex }}
                      />
                    </div>
                    <p className="text-[11px] font-mono tabular-nums text-slate-600">{formatBRL(cat.value)}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* Infográfico "De onde veio o dinheiro" — Receitas por categoria */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-5 min-w-0">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            De onde veio o dinheiro — Receitas por categoria ({monthKeys.length} meses)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Distribuição independente das fontes de entrada e receitas lançadas com participação percentual.
          </p>
        </div>

        {incomeCategoryData.length === 0 ? (
          <p className="text-sm text-slate-500 py-6 text-center">Nenhuma receita registrada nos meses exibidos.</p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center duofin-chart-enter">
            <div className="lg:col-span-5 min-w-0 w-full h-64 relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    {...CHART_ANIMATION}
                    data={incomeCategoryData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={58}
                    outerRadius={92}
                    paddingAngle={2}
                  >
                    {incomeCategoryData.map((cat, idx) => (
                      <Cell key={cat.name} fill={INCOME_COLORS[idx % INCOME_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(val: unknown) => formatBRL(Number(val))} contentStyle={chartTheme.tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center px-4">
                <span className="text-[10px] uppercase tracking-wide text-slate-500">Total receitas</span>
                <span className="text-xs font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                  {formatBRL(totalCategoryIncome)}
                </span>
              </div>
            </div>

            <div className="lg:col-span-7 min-w-0 w-full h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={incomeCategoryData} margin={{ top: 8, right: 8, left: 0, bottom: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridStroke} vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 10, fill: chartTheme.axisTick }}
                    tickFormatter={(v: string) => (v.length > 10 ? `${v.slice(0, 9)}…` : v)}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    width={46}
                    tick={{ fontSize: 10, fill: chartTheme.axisTick }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `R$${Math.round(v / 1000)}k`}
                  />
                  <Tooltip formatter={(val: unknown) => formatBRL(Number(val))} contentStyle={chartTheme.tooltipStyle} />
                  <Bar {...CHART_ANIMATION} dataKey="value" name="Total receita" radius={[4, 4, 0, 0]} barSize={28}>
                    {incomeCategoryData.map((cat, idx) => (
                      <Cell key={cat.name} fill={INCOME_COLORS[idx % INCOME_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="lg:col-span-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
              {incomeCategoryData.map((cat, idx) => {
                const share = totalCategoryIncome > 0 ? cat.value / totalCategoryIncome : 0;
                const fillHex = INCOME_COLORS[idx % INCOME_COLORS.length];
                return (
                  <div
                    key={cat.name}
                    className="p-3 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/50 space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="inline-flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-100 truncate">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: fillHex }} />
                        <span className="truncate">{cat.name}</span>
                      </span>
                      <span className="font-mono tabular-nums text-emerald-700 dark:text-emerald-400 font-bold shrink-0">
                        {formatPct(share, 1)}
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-emerald-100 dark:bg-emerald-950 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${Math.min(100, share * 100)}%`, backgroundColor: fillHex }}
                      />
                    </div>
                    <p className="text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-400">
                      {formatBRL(cat.value)}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* Tabela Comparativa Mês a Mês (Painel completo) */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-900">Comparação mês a mês e histórico anual</h2>
        </div>

        {/* Mobile Cards (Zero horizontal scroll) */}
        <div className="md:hidden divide-y divide-slate-100">
          {panelRows.map((row) => {
            const isNow = row.monthKey === currentMonthKey;
            return (
              <div
                key={row.monthKey}
                className={`p-4 space-y-2.5 ${
                  row.hasPastMonthImpact
                    ? 'bg-orange-50/70'
                    : isNow
                      ? 'bg-sky-50/70'
                      : ''
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-900">
                    {formatMonthShort(row.monthKey)} {isNow ? '· Atual' : ''}
                    {row.hasPastMonthImpact && (
                      <span className="ml-2 px-1.5 py-0.5 text-[10px] font-semibold rounded bg-orange-100 text-orange-800 border border-orange-200">
                        Fatura/mês anterior
                      </span>
                    )}
                  </span>
                  <span
                    className={`text-xs font-mono tabular-nums font-bold ${
                      row.hasPastMonthImpact
                        ? 'text-orange-700'
                        : row.monthlySurplus < 0
                          ? 'text-red-600'
                          : 'text-emerald-700'
                    }`}
                  >
                    Saldo: {formatBRL(row.monthlySurplus)}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                  <div className="flex justify-between gap-1">
                    <span className="text-slate-500">
                      Entradas{row.negativeBalanceDiscount > 0 ? ' (líq.)' : ''}
                    </span>
                    <span className="font-mono tabular-nums text-emerald-700 font-medium">{formatBRL(row.totalEntries)}</span>
                  </div>
                  <div className="flex justify-between gap-1">
                    <span className="text-slate-500">Gastos</span>
                    <span className="font-mono tabular-nums text-red-600 font-medium">{formatBRL(row.totalExpenses)}</span>
                  </div>
                  <div className="flex justify-between gap-1">
                    <span className="text-slate-500">Parcelas</span>
                    <span className="font-mono tabular-nums text-slate-700">{formatBRL(row.installmentsTotal)}</span>
                  </div>
                  <div className="flex justify-between gap-1">
                    <span className="text-slate-500">Economias</span>
                    <span className="font-mono tabular-nums text-amber-600">{formatBRL(row.savingsTotal)}</span>
                  </div>
                  <div className="col-span-2 flex justify-between gap-1 pt-1 border-t border-slate-100">
                    <span className="text-slate-500">Saldo acumulado</span>
                    <span className="font-mono tabular-nums font-semibold text-slate-900">{formatBRL(row.cumulativeBalance)}</span>
                  </div>
                </div>
              </div>
            );
          })}
          <div className="p-4 bg-slate-900 text-white space-y-2 text-xs">
            <p className="font-semibold tracking-wide">TOTAL DO PERÍODO</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              <div className="flex justify-between gap-1">
                <span className="text-slate-300">Entradas</span>
                <span className="font-mono tabular-nums font-semibold">{formatBRL(periodTotals.totalEntries)}</span>
              </div>
              <div className="flex justify-between gap-1">
                <span className="text-slate-300">Gastos</span>
                <span className="font-mono tabular-nums font-semibold">{formatBRL(periodTotals.totalExpenses)}</span>
              </div>
              <div className="flex justify-between gap-1">
                <span className="text-slate-300">Economias</span>
                <span className="font-mono tabular-nums font-semibold">{formatBRL(periodTotals.totalSavings)}</span>
              </div>
              <div className="flex justify-between gap-1">
                <span className="text-slate-300">Sobra</span>
                <span className="font-mono tabular-nums font-semibold">{formatBRL(periodTotals.totalSurplus)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs sm:text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <th className="py-3 px-4">Mês</th>
                <th className="py-3 px-4 text-right">Entradas</th>
                <th className="py-3 px-4 text-right">Fixos e lançados</th>
                <th className="py-3 px-4 text-right">Parcelas</th>
                <th className="py-3 px-4 text-right">Total gastos</th>
                <th className="py-3 px-4 text-right">Economias</th>
                <th className="py-3 px-4 text-right">Sobra do mês</th>
                <th className="py-3 px-4 text-right">Saldo acumulado</th>
                <th className="py-3 px-4 text-right">Diárias</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {panelRows.map((row) => {
                const isNow = row.monthKey === currentMonthKey;
                return (
                  <tr
                    key={row.monthKey}
                    className={
                      row.hasPastMonthImpact
                        ? 'bg-orange-50/70 hover:bg-orange-50'
                        : isNow
                          ? 'bg-sky-50/70 font-medium'
                          : 'hover:bg-slate-50/60'
                    }
                  >
                    <td className="py-3 px-4 whitespace-nowrap font-medium text-slate-900">
                      <div className="flex items-center gap-2">
                        <span>
                          {formatMonthShort(row.monthKey)} {isNow ? '· Atual' : ''}
                        </span>
                        {row.hasPastMonthImpact && (
                          <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-orange-100 text-orange-800 border border-orange-200">
                            Fatura/mês anterior
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-emerald-700">
                      {formatBRL(row.totalEntries)}
                      {row.negativeBalanceDiscount > 0 && (
                        <span className="block text-[10px] text-amber-700 font-normal">
                          −{formatBRL(row.negativeBalanceDiscount)} saldo neg.
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                      {formatBRL(row.launchedExpenses + row.recurringExpenses)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                      {formatBRL(row.installmentsTotal)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-red-600">
                      {formatBRL(row.totalExpenses)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-amber-600">
                      {formatBRL(row.savingsTotal)}
                    </td>
                    <td
                      className={`py-3 px-4 text-right font-mono tabular-nums font-semibold ${
                        row.hasPastMonthImpact
                          ? 'text-orange-700'
                          : row.monthlySurplus < 0
                            ? 'text-red-600'
                            : 'text-emerald-700'
                      }`}
                    >
                      {formatBRL(row.monthlySurplus)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-900">
                      {formatBRL(row.cumulativeBalance)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-500">
                      {formatBRL(row.dailyExpenses)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-900 text-white font-semibold">
                <td className="py-3 px-4">TOTAL</td>
                <td className="py-3 px-4 text-right font-mono tabular-nums">{formatBRL(periodTotals.totalEntries)}</td>
                <td className="py-3 px-4 text-right font-mono tabular-nums">
                  {formatBRL(panelRows.reduce((s, r) => s + r.launchedExpenses + r.recurringExpenses, 0))}
                </td>
                <td className="py-3 px-4 text-right font-mono tabular-nums">
                  {formatBRL(panelRows.reduce((s, r) => s + r.installmentsTotal, 0))}
                </td>
                <td className="py-3 px-4 text-right font-mono tabular-nums">{formatBRL(periodTotals.totalExpenses)}</td>
                <td className="py-3 px-4 text-right font-mono tabular-nums">{formatBRL(periodTotals.totalSavings)}</td>
                <td className="py-3 px-4 text-right font-mono tabular-nums">{formatBRL(periodTotals.totalSurplus)}</td>
                <td className="py-3 px-4 text-right font-mono tabular-nums">
                  {formatBRL(panelRows[panelRows.length - 1]?.cumulativeBalance ?? 0)}
                </td>
                <td className="py-3 px-4 text-right font-mono tabular-nums">
                  {formatBRL(panelRows.reduce((s, r) => s + r.dailyExpenses, 0))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
        </div>
      )}
    </div>
  );
}
