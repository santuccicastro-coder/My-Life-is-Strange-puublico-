import React, { useMemo, useState } from 'react';
import { BookmarkPlus, Trash2 } from 'lucide-react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useFinance } from '../context/AuthHouseholdContext';
import { useTheme } from '../context/ThemeContext';
import type { ScenarioMode } from '../types/finance';
import { CHART_ANIMATION, getChartTheme, SEMANTIC_COLORS } from '../utils/chartColors';
import {
  computeMonthlyPanel,
  computeScenarioAnalysis,
  formatBRL,
  formatPct,
  getMonthKeysFromStart,
} from '../utils/financeCalculations';

export function ScenariosPage({ embedded = false }: { embedded?: boolean }) {
  const { household, incomes, transactions, installments, recurringItems, bankAccounts, cards, goals, scenarios, saveScenario, deleteScenario } =
    useFinance();
  const { isDark } = useTheme();
  const chartTheme = getChartTheme(isDark);

  const [expenseChangePctInput, setExpenseChangePctInput] = useState(15);
  const [incomeChangePctInput, setIncomeChangePctInput] = useState(0);
  const [mode, setMode] = useState<ScenarioMode>('De uma vez');
  const [useCustomBaseExpense, setUseCustomBaseExpense] = useState(false);
  const [customBaseExpense, setCustomBaseExpense] = useState('0');
  const [scenarioName, setScenarioName] = useState('');
  const [saving, setSaving] = useState(false);

  const monthKeys = useMemo(() => {
    const start = household?.periodStart ?? `${new Date().getFullYear()}-01-01`;
    return getMonthKeysFromStart(start, 12);
  }, [household]);

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

  const analysis = useMemo(
    () =>
      computeScenarioAnalysis({
        panelRows,
        incomes,
        recurringItems,
        goals,
        expenseChangePct: expenseChangePctInput / 100,
        incomeChangePct: incomeChangePctInput / 100,
        mode,
        useCustomBaseExpense,
        customBaseExpense: Number(customBaseExpense.replace(',', '.')) || 0,
      }),
    [panelRows, incomes, recurringItems, goals, expenseChangePctInput, incomeChangePctInput, mode, useCustomBaseExpense, customBaseExpense]
  );

  // Cor semântica para linha do cenário:
  // Verde = positivo e melhorando; Laranja/Amarelo = melhora ou piora moderada; Vermelho = negativo
  const scenarioLineColor =
    analysis.scenarioSurplus < 0
      ? SEMANTIC_COLORS.negative
      : analysis.scenarioSurplus >= analysis.todaySurplus
        ? SEMANTIC_COLORS.positive
        : SEMANTIC_COLORS.orangeDeep;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scenarioName.trim()) return;
    setSaving(true);
    try {
      await saveScenario({
        name: scenarioName.trim(),
        expenseChangePct: expenseChangePctInput / 100,
        incomeChangePct: incomeChangePctInput / 100,
        mode,
        customBaseExpense: Number(customBaseExpense.replace(',', '.')) || 0,
        useCustomBaseExpense,
      });
      setScenarioName('');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        {embedded ? (
          <h2 className="text-lg font-bold tracking-tight text-slate-900">Cenários Financeiros</h2>
        ) : (
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Cenários Financeiros</h1>
        )}
        <p className="text-sm text-slate-500 mt-0.5">
          Simule variações nos seus gastos e na renda para avaliar o impacto na sobra mensal e na reserva em 12 meses.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Controles do Cenário */}
        <section className="lg:col-span-5 min-w-0 bg-white border border-slate-200 rounded-xl p-5 space-y-5">
          <h2 className="text-base font-semibold text-slate-900">Parâmetros da simulação</h2>

          <div className="space-y-2">
            <div className="flex justify-between text-xs font-medium">
              <span className="text-slate-700">Variação nos gastos (%)</span>
              <span className={`font-mono tabular-nums font-bold ${expenseChangePctInput > 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                {expenseChangePctInput > 0 ? '+' : ''}
                {expenseChangePctInput}%
              </span>
            </div>
            <input
              type="range"
              min="-50"
              max="100"
              step="1"
              value={expenseChangePctInput}
              onChange={(e) => setExpenseChangePctInput(Number(e.target.value))}
              className="w-full accent-slate-900 cursor-pointer"
            />
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-xs font-medium">
              <span className="text-slate-700">Variação na renda (%)</span>
              <span className={`font-mono tabular-nums font-bold ${incomeChangePctInput < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                {incomeChangePctInput > 0 ? '+' : ''}
                {incomeChangePctInput}%
              </span>
            </div>
            <input
              type="range"
              min="-50"
              max="100"
              step="1"
              value={incomeChangePctInput}
              onChange={(e) => setIncomeChangePctInput(Number(e.target.value))}
              className="w-full accent-slate-900 cursor-pointer"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">Como a variação acontece</label>
            <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg">
              {(['De uma vez', 'Gradual em 12 meses'] as ScenarioMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`py-2 px-2 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                    mode === m ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">Renda mensal base (Renda):</span>
              <span className="font-mono tabular-nums font-semibold text-slate-900">{formatBRL(analysis.baseIncome)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Gasto médio automático:</span>
              <span className="font-mono tabular-nums font-semibold text-slate-900">{formatBRL(analysis.autoBaseExpense)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Reserva atual (Economias):</span>
              <span className="font-mono tabular-nums font-semibold text-slate-900">{formatBRL(analysis.currentReserve)}</span>
            </div>
          </div>

          <div className="space-y-2">
            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={useCustomBaseExpense}
                onChange={(e) => setUseCustomBaseExpense(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300"
              />
              Usar outro gasto mensal base manualmente
            </label>
            {useCustomBaseExpense && (
              <input
                type="number"
                step="0.01"
                min="0"
                value={customBaseExpense}
                onChange={(e) => setCustomBaseExpense(e.target.value)}
                placeholder="Gasto base mensal (R$)"
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg"
              />
            )}
          </div>

          {/* Salvar cenário */}
          <form onSubmit={handleSave} className="pt-3 border-t border-slate-100 flex gap-2">
            <input
              type="text"
              maxLength={80}
              value={scenarioName}
              onChange={(e) => setScenarioName(e.target.value)}
              placeholder="Nome para salvar simulação..."
              className="flex-1 min-w-0 px-3 py-2 text-xs border border-slate-200 rounded-lg"
            />
            <button
              type="submit"
              disabled={saving || !scenarioName.trim()}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 disabled:opacity-50 cursor-pointer shrink-0"
            >
              <BookmarkPlus className="w-3.5 h-3.5" />
              Salvar
            </button>
          </form>
        </section>

        {/* Resultado Comparativo */}
        <section className="lg:col-span-7 min-w-0 space-y-5">
          <div
            className={`p-4 rounded-xl border text-sm font-medium ${
              analysis.verdict.level === 'danger'
                ? 'bg-red-50 border-red-200 text-red-800'
                : analysis.verdict.level === 'warning'
                  ? 'bg-amber-50 border-amber-200 text-amber-800'
                  : analysis.verdict.level === 'ok'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-slate-100 border-slate-200 text-slate-700'
            }`}
          >
            {analysis.verdict.text}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            {/* Mobile Stacked Comparison Cards (Zero horizontal scroll) */}
            <div className="md:hidden divide-y divide-slate-100">
              {[
                {
                  label: 'Renda mensal',
                  today: formatBRL(analysis.todayIncome),
                  scenario: formatBRL(analysis.scenarioIncome),
                  diff: formatBRL(analysis.scenarioIncome - analysis.todayIncome),
                  highlight: false,
                  todayNeg: false,
                  scenNeg: false,
                },
                {
                  label: 'Gasto mensal',
                  today: formatBRL(analysis.todayExpense),
                  scenario: formatBRL(analysis.scenarioExpense),
                  diff: formatBRL(analysis.scenarioExpense - analysis.todayExpense),
                  highlight: false,
                  todayNeg: false,
                  scenNeg: false,
                },
                {
                  label: 'Sobra mensal',
                  today: formatBRL(analysis.todaySurplus),
                  scenario: formatBRL(analysis.scenarioSurplus),
                  diff: formatBRL(analysis.scenarioSurplus - analysis.todaySurplus),
                  highlight: true,
                  todayNeg: analysis.todaySurplus < 0,
                  scenNeg: analysis.scenarioSurplus < 0,
                },
                {
                  label: '% da renda comprometida',
                  today: formatPct(analysis.todayCommittedPct),
                  scenario: formatPct(analysis.scenarioCommittedPct),
                  diff: formatPct(analysis.scenarioCommittedPct - analysis.todayCommittedPct),
                  highlight: false,
                  todayNeg: false,
                  scenNeg: false,
                },
                {
                  label: 'Saldo final em 12 meses',
                  today: formatBRL(analysis.todayFinal12m),
                  scenario: formatBRL(analysis.scenarioFinal12m),
                  diff: formatBRL(analysis.scenarioFinal12m - analysis.todayFinal12m),
                  highlight: false,
                  todayNeg: false,
                  scenNeg: false,
                },
                {
                  label: 'Duração da reserva',
                  today: analysis.todayReserveDuration === null ? 'Não acaba' : `${analysis.todayReserveDuration.toFixed(1)}m`,
                  scenario: analysis.scenarioReserveDuration === null ? 'Não acaba' : `${analysis.scenarioReserveDuration.toFixed(1)}m`,
                  diff: '—',
                  highlight: false,
                  todayNeg: false,
                  scenNeg: false,
                },
              ].map((item) => (
                <div key={item.label} className={`p-4 space-y-2 ${item.highlight ? 'bg-slate-50/70' : ''}`}>
                  <p className="text-xs font-semibold text-slate-900">{item.label}</p>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="min-w-0">
                      <p className="text-[11px] text-slate-500">Hoje</p>
                      <p
                        className={`font-mono tabular-nums font-medium truncate ${
                          item.highlight ? (item.todayNeg ? 'text-red-600' : 'text-emerald-700') : 'text-slate-800'
                        }`}
                      >
                        {item.today}
                      </p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] text-slate-500">No cenário</p>
                      <p
                        className={`font-mono tabular-nums font-semibold truncate ${
                          item.highlight ? (item.scenNeg ? 'text-red-600' : 'text-emerald-700') : 'text-slate-900'
                        }`}
                      >
                        {item.scenario}
                      </p>
                    </div>
                    <div className="min-w-0 text-right">
                      <p className="text-[11px] text-slate-500">Diferença</p>
                      <p className="font-mono tabular-nums text-slate-700 truncate">{item.diff}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table */}
            <div className="hidden md:block">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                    <th className="py-3 px-4">Indicador</th>
                    <th className="py-3 px-4 text-right">Hoje</th>
                    <th className="py-3 px-4 text-right">No cenário</th>
                    <th className="py-3 px-4 text-right">Diferença</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr>
                    <td className="py-3 px-4 font-medium text-slate-800">Renda mensal</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">{formatBRL(analysis.todayIncome)}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold">{formatBRL(analysis.scenarioIncome)}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-600">
                      {formatBRL(analysis.scenarioIncome - analysis.todayIncome)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4 font-medium text-slate-800">Gasto mensal</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">{formatBRL(analysis.todayExpense)}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold">{formatBRL(analysis.scenarioExpense)}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-600">
                      {formatBRL(analysis.scenarioExpense - analysis.todayExpense)}
                    </td>
                  </tr>
                  <tr className="bg-slate-50/70">
                    <td className="py-3 px-4 font-semibold text-slate-900">Sobra mensal</td>
                    <td className={`py-3 px-4 text-right font-mono tabular-nums font-semibold ${analysis.todaySurplus < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                      {formatBRL(analysis.todaySurplus)}
                    </td>
                    <td className={`py-3 px-4 text-right font-mono tabular-nums font-bold ${analysis.scenarioSurplus < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                      {formatBRL(analysis.scenarioSurplus)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold">
                      {formatBRL(analysis.scenarioSurplus - analysis.todaySurplus)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4 font-medium text-slate-800">% da renda comprometida</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">{formatPct(analysis.todayCommittedPct)}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold">{formatPct(analysis.scenarioCommittedPct)}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">
                      {formatPct(analysis.scenarioCommittedPct - analysis.todayCommittedPct)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4 font-medium text-slate-800">Saldo final em 12 meses</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">{formatBRL(analysis.todayFinal12m)}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold">{formatBRL(analysis.scenarioFinal12m)}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">
                      {formatBRL(analysis.scenarioFinal12m - analysis.todayFinal12m)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4 font-medium text-slate-800">Duração da reserva</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">
                      {analysis.todayReserveDuration === null ? 'Não acaba' : `${analysis.todayReserveDuration.toFixed(1)} meses`}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold">
                      {analysis.scenarioReserveDuration === null ? 'Não acaba' : `${analysis.scenarioReserveDuration.toFixed(1)} meses`}
                    </td>
                    <td className="py-3 px-4 text-right text-slate-400">—</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Gráfico de projeção 12 meses */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 min-w-0 duofin-chart-enter">
            <h3 className="text-base font-semibold text-slate-900">Evolução da reserva em 12 meses</h3>
            <div className="h-64 min-w-0 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={analysis.projection} margin={{ top: 8, right: 12, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridStroke} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 12, fill: chartTheme.axisTick }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 11, fill: chartTheme.axisTick }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `R$${Math.round(v / 1000)}k`}
                  />
                  <Tooltip formatter={(val: unknown) => formatBRL(Number(val))} contentStyle={chartTheme.tooltipStyle} />
                  <Legend wrapperStyle={chartTheme.legendStyle} />
                  <Line
                    {...CHART_ANIMATION}
                    type="monotone"
                    dataKey="todayCumulativeBalance"
                    name="Saldo acumulado hoje"
                    stroke={SEMANTIC_COLORS.yellow}
                    strokeWidth={2.5}
                    dot={false}
                  />
                  <Line
                    {...CHART_ANIMATION}
                    type="monotone"
                    dataKey="scenarioCumulativeBalance"
                    name="Saldo no cenário"
                    stroke={scenarioLineColor}
                    strokeWidth={2.5}
                    strokeDasharray="4 4"
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>
      </div>

      {/* Cenários salvos */}
      {scenarios.length > 0 && (
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="text-base font-semibold text-slate-900">Cenários salvos</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {scenarios.map((s) => (
              <div key={s.id} className="px-5 py-3 flex items-center justify-between gap-4 hover:bg-slate-50">
                <button
                  type="button"
                  onClick={() => {
                    setExpenseChangePctInput(Math.round(s.expenseChangePct * 100));
                    setIncomeChangePctInput(Math.round(s.incomeChangePct * 100));
                    setMode(s.mode);
                    setUseCustomBaseExpense(s.useCustomBaseExpense);
                    setCustomBaseExpense(String(s.customBaseExpense));
                  }}
                  className="text-left min-w-0 flex-1 cursor-pointer"
                >
                  <p className="text-sm font-semibold text-slate-900 truncate">{s.name}</p>
                  <p className="text-xs text-slate-500">
                    Gastos {s.expenseChangePct >= 0 ? '+' : ''}
                    {(s.expenseChangePct * 100).toFixed(0)}% · Renda {s.incomeChangePct >= 0 ? '+' : ''}
                    {(s.incomeChangePct * 100).toFixed(0)}% · {s.mode} · Por {s.createdByName}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => deleteScenario(s.id)}
                  className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
