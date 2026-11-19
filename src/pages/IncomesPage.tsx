import React, { useMemo, useState } from 'react';
import { PauseCircle, Pencil, PlayCircle, Plus, Repeat, Trash2, Users, X } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useFinance } from '../context/AuthHouseholdContext';
import { useTheme } from '../context/ThemeContext';
import type { Income, IncomeFrequency, RecurringFrequency, RecurringItem } from '../types/finance';
import { ModalPortal } from '../components/ModalPortal';
import { CHART_ANIMATION, getChartTheme, SEMANTIC_COLORS } from '../utils/chartColors';
import {
  addMonthsToKey,
  computeMemberIncomeAndSpendingBreakdown,
  computeNegativeBalanceIncomeOffsets,
  formatBRL,
  formatDateBR,
  formatMonthFull,
  formatMonthShort,
  formatPct,
  getCurrentMonthKey,
  getHouseholdPeople,
  getIncomeAmountInMonth,
  getMonthKeysFromStart,
  getRecurringItemRawAmountInMonth,
  getTodayISO,
  parseSignedDecimal,
  sanitizeSignedDecimalInput,
} from '../utils/financeCalculations';

export function IncomesPage() {
  const {
    household,
    incomes,
    transactions,
    installments,
    recurringItems,
    bankAccounts,
    currentPartnerName,
    saveIncome,
    deleteIncome,
    saveRecurringItem,
    toggleRecurringItemActive,
    deleteRecurringItem,
  } = useFinance();
  const { isDark } = useTheme();
  const chartTheme = getChartTheme(isDark);

  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthKey());
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Income | null>(null);
  const [editingRecurring, setEditingRecurring] = useState<RecurringItem | null>(null);
  const [person, setPerson] = useState(currentPartnerName);
  const [source, setSource] = useState('');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState<IncomeFrequency>('Mensal');
  const [receiptDay, setReceiptDay] = useState('5');
  const [receiptDate, setReceiptDate] = useState(getTodayISO());
  const [endMonthKey, setEndMonthKey] = useState('');
  const [active, setActive] = useState(true);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const monthOptions = useMemo(() => {
    const start = household?.periodStart ?? `${new Date().getFullYear()}-01-01`;
    const base = getMonthKeysFromStart(start, 24);
    const cur = getCurrentMonthKey();
    return Array.from(new Set([...base, addMonthsToKey(cur, -1), cur, addMonthsToKey(cur, 1), selectedMonth])).sort();
  }, [household, selectedMonth]);

  const breakdown = useMemo(
    () =>
      computeMemberIncomeAndSpendingBreakdown({
        monthKey: selectedMonth,
        household,
        incomes,
        transactions,
        installments,
        recurringItems,
      }),
    [selectedMonth, household, incomes, transactions, installments, recurringItems]
  );

  const individualRows = useMemo(
    () =>
      breakdown.rows.filter(
        (r) => !r.isShared || r.monthlyIncome > 0 || r.individualSpending > 0
      ),
    [breakdown.rows]
  );

  const chartData = useMemo(
    () =>
      individualRows.map((r) => ({
        name: r.person,
        Renda: Math.round(r.monthlyIncome * 100) / 100,
        Gasto: Math.round(r.individualSpending * 100) / 100,
      })),
    [individualRows]
  );

  const incomeHistory = useMemo(() => {
    const extraEntries = transactions
      .filter((t) => t.type === 'Entrada')
      .map((t) => ({
        id: `tx-${t.id}`,
        date: t.date,
        source: t.description,
        person: t.person,
        amount: t.actualAmount,
        kind: 'Entrada avulsa',
        author: t.createdByName,
      }));

    const oneOffIncomes = incomes
      .filter((i) => i.frequency === 'Única' && i.receiptDate)
      .map((i) => ({
        id: `inc-${i.id}`,
        date: i.receiptDate,
        source: i.source,
        person: i.person,
        amount: i.amount,
        kind: 'Renda extra',
        author: i.createdByName,
      }));

    return [...extraEntries, ...oneOffIncomes].sort((a, b) => b.date.localeCompare(a.date));
  }, [transactions, incomes]);

  const positiveRecurringIncomes = useMemo(
    () => recurringItems.filter((item) => item.type === 'Entrada'),
    [recurringItems]
  );

  const incomeOffsets = useMemo(
    () =>
      computeNegativeBalanceIncomeOffsets({
        bankAccounts,
        incomes,
        recurringItems,
        transactions,
      }),
    [bankAccounts, incomes, recurringItems, transactions]
  );

  const monthIncomeDiscount = Math.min(
    breakdown.totalIncome,
    incomeOffsets.deductionsByMonth[selectedMonth] ?? 0
  );
  const netMonthIncome = Math.max(0, breakdown.totalIncome - monthIncomeDiscount);
  const netMonthBalance = netMonthIncome - breakdown.totalSpending;

  const future12MonthsProjection = useMemo(() => {
    const start = getCurrentMonthKey();
    return Array.from({ length: 12 }, (_, idx) => {
      const mk = addMonthsToKey(start, idx);
      const fromSources = incomes.reduce((s, inc) => s + getIncomeAmountInMonth(inc, mk), 0);
      const fromFixed = positiveRecurringIncomes.reduce(
        (s, rec) => s + getRecurringItemRawAmountInMonth(rec, mk),
        0
      );
      const gross = fromSources + fromFixed;
      const discount = Math.min(gross, incomeOffsets.deductionsByMonth[mk] ?? 0);
      return {
        monthKey: mk,
        label: formatMonthShort(mk),
        fromSources,
        fromFixed,
        discount,
        netIncome: Math.max(0, gross - discount),
      };
    });
  }, [incomes, positiveRecurringIncomes, incomeOffsets]);

  const openNew = () => {
    setEditing(null);
    setEditingRecurring(null);
    setPerson(currentPartnerName);
    setSource('');
    setAmount('');
    setFrequency('Mensal');
    setReceiptDay('5');
    setReceiptDate(getTodayISO());
    setEndMonthKey('');
    setActive(true);
    setNotes('');
    setError('');
    setModalOpen(true);
  };

  const openEdit = (inc: Income) => {
    setEditingRecurring(null);
    setEditing(inc);
    setPerson(inc.person);
    setSource(inc.source);
    setAmount(String(inc.amount));
    setFrequency(inc.frequency);
    setReceiptDay(String(inc.receiptDay));
    setReceiptDate(inc.receiptDate || getTodayISO());
    setEndMonthKey('');
    setActive(inc.active);
    setNotes(inc.notes);
    setError('');
    setModalOpen(true);
  };

  const openEditRecurringIncome = (rec: RecurringItem) => {
    setEditing(null);
    setEditingRecurring(rec);
    setPerson(rec.person);
    setSource(rec.description);
    setAmount(String(rec.amount));
    setFrequency(rec.frequency as IncomeFrequency);
    setReceiptDay(String(rec.dayOfMonth));
    setReceiptDate(getTodayISO());
    setEndMonthKey(rec.endMonthKey);
    setActive(rec.active);
    setNotes(rec.notes);
    setError('');
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const num = parseSignedDecimal(amount);
    if (!Number.isFinite(num) || num <= 0) {
      setError('Informe um valor maior que zero.');
      return;
    }
    setSaving(true);
    try {
      if (editingRecurring) {
        const safeFreq: RecurringFrequency =
          frequency === 'Quinzenal' || frequency === 'Semanal' || frequency === 'Anual' ? frequency : 'Mensal';
        await saveRecurringItem(
          {
            type: 'Entrada',
            description: source,
            amount: num,
            category: editingRecurring.category || 'Outros',
            person,
            frequency: safeFreq,
            dayOfMonth: Number(receiptDay) || 5,
            startMonthKey: editingRecurring.startMonthKey || getCurrentMonthKey(),
            endMonthKey,
            paymentMethod: editingRecurring.paymentMethod || 'Pix',
            accountOrCard: editingRecurring.accountOrCard || 'Conta corrente',
            cardId: editingRecurring.cardId || '',
            active,
            notes,
          },
          editingRecurring.id
        );
      } else {
        await saveIncome(
          {
            person,
            source,
            amount: num,
            frequency,
            receiptDay: Number(receiptDay) || 5,
            receiptDate:
              frequency === 'Única' || frequency === 'Anual' || frequency === 'Quinzenal' || frequency === 'Semanal'
                ? receiptDate
                : '',
            active,
            notes,
          },
          editing?.id
        );
      }
      setModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar renda.');
    } finally {
      setSaving(false);
    }
  };

  if (!household) return null;
  const peopleOptions = getHouseholdPeople(household);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Fontes de Renda</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Salários, ganhos fixos, receitas extras e projeção líquida no mês.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <select
            aria-label="Mês de referência"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="px-3 py-2 text-xs font-medium border border-slate-200 rounded-lg bg-white text-slate-800"
          >
            {monthOptions.map((mk) => (
              <option key={mk} value={mk}>
                {formatMonthFull(mk)}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={openNew}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 cursor-pointer whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            Cadastrar renda
          </button>
        </div>
      </div>

      {/* KPIs Consolidados do Mês */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900 text-white rounded-xl p-5 space-y-1.5">
          <span className="text-xs font-medium text-slate-300">Renda total ({formatMonthFull(selectedMonth)})</span>
          <p className="text-2xl font-bold font-mono tabular-nums text-emerald-300">
            {formatBRL(netMonthIncome)}
          </p>
          <p className="text-xs text-slate-300">
            Salários + ganhos fixos + extras
            {monthIncomeDiscount > 0 ? ` (−${formatBRL(monthIncomeDiscount)} saldo negativo)` : ''}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-1.5">
          <span className="text-xs font-medium text-slate-500">Total gasto no mês</span>
          <p className="text-2xl font-bold font-mono tabular-nums text-red-600">
            {formatBRL(breakdown.totalSpending)}
          </p>
          <p className="text-xs text-slate-500">Saídas, contas fixas e parcelas atribuídas</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-1.5">
          <span className="text-xs font-medium text-slate-500">Saldo líquido consolidado</span>
          <p
            className={`text-2xl font-bold font-mono tabular-nums ${
              netMonthBalance >= 0 ? 'text-emerald-700' : 'text-red-600'
            }`}
          >
            {formatBRL(netMonthBalance)}
          </p>
          <p className="text-xs text-slate-500">
            Projeção mensal consolidada
          </p>
        </div>
      </section>

      {incomeOffsets.negativeBalanceDebt > 0 && (
        <div className="duofin-expand-enter p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800">
          Saldo atual negativo nas contas (<strong>{formatBRL(incomeOffsets.totalAccountsBalance)}</strong>): desconto automático de{' '}
          <strong>{formatBRL(incomeOffsets.negativeBalanceDebt)}</strong> aplicado na próxima entrada de renda fixa
          {incomeOffsets.firstImpactedEvent
            ? ` (${incomeOffsets.firstImpactedEvent.title} em ${formatDateBR(incomeOffsets.firstImpactedEvent.dateISO)} — líquido previsto ${formatBRL(
                incomeOffsets.firstImpactedEvent.netAmountAfterDiscount
              )}).`
            : '.'}
        </div>
      )}

      {individualRows.length > 1 && (
      <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-emerald-600 shrink-0" />
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Contribuição na renda (%) e gasto individual
              </h2>
              <p className="text-xs text-slate-500">
                Participação na renda total e quanto foi gasto em{' '}
                {formatMonthFull(selectedMonth)}.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {individualRows.map((row) => (
            <div
              key={row.person}
              className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-3"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-bold text-slate-900 truncate">{row.person}</p>
                <span className="text-xs font-bold font-mono tabular-nums text-emerald-700 shrink-0">
                  {formatPct(row.incomeSharePct, 1)} da renda
                </span>
              </div>

              {/* Barra % de contribuição na renda */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">Renda no mês</span>
                  <span className="font-mono tabular-nums font-semibold text-emerald-700">
                    {formatBRL(row.monthlyIncome)}
                  </span>
                </div>
                <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-600 rounded-full transition-all"
                    style={{ width: `${Math.min(100, row.incomeSharePct * 100)}%` }}
                  />
                </div>
              </div>

              {/* Gasto individual */}
              <div className="space-y-1 pt-2 border-t border-slate-200/80">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">Gasto individual</span>
                  <span className="font-mono tabular-nums font-semibold text-red-600">
                    {formatBRL(row.individualSpending)}
                  </span>
                </div>
                <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-red-600 rounded-full transition-all"
                    style={{ width: `${Math.min(100, row.spendingSharePct * 100)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-500 pt-0.5">
                  <span>{formatPct(row.spendingSharePct, 1)} dos gastos totais</span>
                  {row.monthlyIncome > 0 && (
                    <span>{formatPct(row.individualCommittedPct, 0)} da própria renda</span>
                  )}
                </div>
              </div>

              {/* Saldo individual */}
              <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-200/80">
                <span className="text-slate-600 font-medium">Saldo individual</span>
                <span
                  className={`font-mono tabular-nums font-bold ${
                    row.individualBalance >= 0 ? 'text-emerald-700' : 'text-red-600'
                  }`}
                >
                  {formatBRL(row.individualBalance)}
                </span>
              </div>
            </div>
          ))}
        </div>

        {chartData.length > 0 && (
          <div className="pt-2 border-t border-slate-100">
            <p className="text-xs font-semibold text-slate-700 mb-2">Comparativo: Renda × Gasto</p>
            <div className="h-56 min-w-0 w-full duofin-chart-enter">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridStroke} vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: chartTheme.axisTick }} axisLine={false} tickLine={false} />
                  <YAxis
                    width={52}
                    tick={{ fontSize: 10, fill: chartTheme.axisTick }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `R$${Math.round(v)}`}
                  />
                  <Tooltip formatter={(val: unknown) => formatBRL(Number(val))} contentStyle={chartTheme.tooltipStyle} />
                  <Legend wrapperStyle={chartTheme.legendStyle} />
                  <Bar {...CHART_ANIMATION} dataKey="Renda" name="Renda" fill={SEMANTIC_COLORS.positive} radius={[4, 4, 0, 0]} />
                  <Bar {...CHART_ANIMATION} dataKey="Gasto" name="Gasto individual" fill={SEMANTIC_COLORS.negative} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </section>
      )}

      {/* Lista de Fontes de Renda (Rendas diretas + Contas Fixas positivas) */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Fontes cadastradas</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Inclui salários e todas as contas fixas positivas projetadas automaticamente nos próximos meses.
            </p>
          </div>
          <span className="text-xs text-slate-500 shrink-0">
            {incomes.length + positiveRecurringIncomes.length} fontes
          </span>
        </div>

        {incomes.length === 0 && positiveRecurringIncomes.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <p className="text-sm text-slate-500">Nenhuma fonte de renda cadastrada ainda.</p>
            <button
              type="button"
              onClick={openNew}
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Adicionar primeiro salário ou renda
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {incomes.map((inc) => (
              <div key={inc.id} className="p-4 sm:px-5 flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 hover:bg-slate-50/70">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-slate-900 truncate">{inc.source}</p>
                    {!inc.active && <span className="text-xs text-slate-400">· Inativa</span>}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {inc.person} · {inc.frequency} ·{' '}
                    {inc.frequency === 'Única' || inc.frequency === 'Anual'
                      ? `Data: ${formatDateBR(inc.receiptDate)}`
                      : `Recebimento dia ${inc.receiptDay}`}
                    {inc.notes ? ` · ${inc.notes}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <p className="text-sm font-bold font-mono tabular-nums text-emerald-700">
                      {formatBRL(inc.amount)}
                    </p>
                    <p className="text-[11px] text-slate-400">Por {inc.createdByName}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => openEdit(inc)}
                    className="p-1.5 text-slate-400 hover:text-slate-900 rounded-lg hover:bg-slate-100 cursor-pointer"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteIncome(inc.id)}
                    className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}

            {positiveRecurringIncomes.map((rec) => (
              <div
                key={`rec-${rec.id}`}
                className={`p-4 sm:px-5 flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 ${
                  !rec.active ? 'opacity-60 bg-slate-50/50' : 'hover:bg-slate-50/70'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-slate-900 truncate">{rec.description}</p>
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                      <Repeat className="w-3 h-3" />
                      Via Conta Fixa · Projetada
                    </span>
                    {!rec.active && (
                      <span className="text-[11px] font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md">
                        Pausada
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {rec.person} · {rec.frequency} · Recebimento dia {rec.dayOfMonth} · Início {formatMonthShort(rec.startMonthKey)}
                    {rec.endMonthKey ? ` até ${formatMonthShort(rec.endMonthKey)}` : ' · Contínuo'}
                    {rec.notes ? ` · ${rec.notes}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="text-right mr-1">
                    <p className="text-sm font-bold font-mono tabular-nums text-emerald-700">
                      {formatBRL(rec.amount)}
                    </p>
                    <p className="text-[11px] text-slate-400">Por {rec.createdByName}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleRecurringItemActive(rec)}
                    title={rec.active ? 'Pausar projeção' : 'Reativar projeção'}
                    className="p-1.5 text-slate-400 hover:text-slate-900 rounded-lg hover:bg-slate-100 cursor-pointer"
                  >
                    {rec.active ? <PauseCircle className="w-4 h-4" /> : <PlayCircle className="w-4 h-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => openEditRecurringIncome(rec)}
                    title="Editar"
                    className="p-1.5 text-slate-400 hover:text-slate-900 rounded-lg hover:bg-slate-100 cursor-pointer"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteRecurringItem(rec.id)}
                    title="Excluir"
                    className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Projeção Futura de Rendas (12 meses) */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-900">Projeção futura das rendas (12 meses)</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Salários, ganhos fixos recorrentes e eventual desconto automático de saldo atual negativo.
          </p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 p-4 sm:p-5">
          {future12MonthsProjection.map((m) => (
            <div
              key={m.monthKey}
              className="p-3 rounded-xl border border-slate-200 bg-slate-50/60 space-y-1"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-900">{m.label}</span>
                {m.discount > 0 && (
                  <span className="text-[10px] font-semibold text-red-600">
                    −{formatBRL(m.discount)}
                  </span>
                )}
              </div>
              <p className="text-sm font-bold font-mono tabular-nums text-emerald-700">
                {formatBRL(m.netIncome)}
              </p>
              <p className="text-[11px] text-slate-500 truncate">
                {m.fromFixed > 0
                  ? `Base ${formatBRL(m.fromSources)} + Fixos ${formatBRL(m.fromFixed)}`
                  : 'Fontes ativas do mês'}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Histórico de Entradas */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-900">Histórico de entradas extras</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Entradas avulsas registradas em Lançamentos e rendas únicas cadastradas acima.
          </p>
        </div>

        {incomeHistory.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500">Nenhuma entrada avulsa registrada até o momento.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {incomeHistory.map((item) => (
              <div key={item.id} className="px-5 py-3 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{item.source}</p>
                  <p className="text-xs text-slate-500">
                    {formatDateBR(item.date)} · {item.person} · {item.kind} · Por {item.author}
                  </p>
                </div>
                <span className="text-sm font-semibold font-mono tabular-nums text-emerald-700 shrink-0">
                  + {formatBRL(item.amount)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Modal */}
      {modalOpen && (
        <ModalPortal>
          <div
            className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/45 backdrop-blur-[2px] pt-3 px-3 pb-6 sm:pt-8 sm:px-4 overflow-y-auto duofin-backdrop-enter"
            onClick={(e) => {
              if (e.target === e.currentTarget) setModalOpen(false);
            }}
          >
            <div className="duofin-dialog-enter bg-white w-full sm:max-w-md rounded-2xl border border-slate-200 max-h-[88dvh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h3 className="text-base font-semibold text-slate-900">
                {editingRecurring
                  ? 'Editar ganho fixo (Conta Fixa)'
                  : editing
                    ? 'Editar fonte de renda'
                    : 'Nova fonte de renda'}
              </h3>
              <button type="button" onClick={() => setModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">{error}</div>}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Quem recebe</label>
                <select
                  value={person}
                  onChange={(e) => setPerson(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                >
                  {peopleOptions.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Fonte de renda</label>
                <input
                  type="text"
                  required
                  maxLength={100}
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  placeholder="Ex.: Salário, Pró-labore, Aluguel"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Valor (R$)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    required
                    value={amount}
                    onChange={(e) => setAmount(sanitizeSignedDecimalInput(e.target.value, false))}
                    placeholder="0,00"
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Frequência</label>
                  <select
                    value={frequency}
                    onChange={(e) => setFrequency(e.target.value as IncomeFrequency)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="Mensal">Mensal</option>
                    <option value="Quinzenal">Quinzenal</option>
                    <option value="Semanal">Semanal</option>
                    {!editingRecurring && <option value="Única">Única (extra)</option>}
                    <option value="Anual">Anual</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {!editingRecurring && (frequency === 'Única' || frequency === 'Anual') ? (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Data de recebimento</label>
                    <input
                      type="date"
                      required
                      value={receiptDate}
                      onChange={(e) => setReceiptDate(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Dia do recebimento</label>
                    <input
                      type="number"
                      min="1"
                      max="31"
                      value={receiptDay}
                      onChange={(e) => setReceiptDay(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg"
                    />
                  </div>
                )}
                <div className="flex items-end pb-2">
                  <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={(e) => setActive(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300"
                    />
                    Renda ativa
                  </label>
                </div>
              </div>
              {!editingRecurring && (frequency === 'Quinzenal' || frequency === 'Semanal') && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Data do 1º recebimento (opcional, calcula datas reais a cada {frequency === 'Semanal' ? '7 dias' : '14 dias'})
                  </label>
                  <input
                    type="date"
                    value={receiptDate}
                    onChange={(e) => setReceiptDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
              )}
              {editingRecurring && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Mês final (opcional)</label>
                  <input
                    type="month"
                    value={endMonthKey}
                    onChange={(e) => setEndMonthKey(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Observações</label>
                <input
                  type="text"
                  maxLength={300}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm text-slate-600 cursor-pointer">
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-800 disabled:opacity-60 cursor-pointer active:scale-[0.98] transition-all"
                >
                  {saving ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  );
}
