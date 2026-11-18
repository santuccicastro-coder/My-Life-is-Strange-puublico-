import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  Calendar,
  CheckCircle2,
  PauseCircle,
  Pencil,
  PlayCircle,
  Plus,
  Repeat,
  Trash2,
  X,
} from 'lucide-react';
import { useFinance } from '../context/AuthHouseholdContext';
import type { AppRoute, RecurringFrequency, RecurringItem, RecurringType } from '../types/finance';
import { ModalPortal } from '../components/ModalPortal';
import {
  addMonthsToKey,
  computeNegativeBalanceIncomeOffsets,
  formatBRL,
  formatDateBR,
  formatMonthFull,
  formatMonthShort,
  getCurrentMonthKey,
  getHouseholdPeople,
  getMonthlyCoupleIncome,
  getMonthKeysFromStart,
  getRecurringItemRawAmountInMonth,
  isRecurringItemSettledInMonth,
  parseSignedDecimal,
  sanitizeSignedDecimalInput,
} from '../utils/financeCalculations';

interface RecurringPageProps {
  onNavigate: (route: AppRoute) => void;
}

export function RecurringPage({ onNavigate }: RecurringPageProps) {
  const {
    household,
    recurringItems,
    incomes,
    transactions,
    cards,
    bankAccounts,
    currentPartnerName,
    saveRecurringItem,
    toggleRecurringItemActive,
    deleteRecurringItem,
    settleRecurringItemForMonth,
  } = useFinance();

  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthKey());
  const [filterType, setFilterType] = useState<'ALL' | RecurringType>('ALL');
  const [settlingId, setSettlingId] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<RecurringItem | null>(null);

  const [type, setType] = useState<RecurringType>('Saída');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('Contas fixas');
  const [person, setPerson] = useState(currentPartnerName);
  const [frequency, setFrequency] = useState<RecurringFrequency>('Mensal');
  const [dayOfMonth, setDayOfMonth] = useState('5');
  const [startMonthKey, setStartMonthKey] = useState(getCurrentMonthKey());
  const [endMonthKey, setEndMonthKey] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Pix');
  const [accountOrCard, setAccountOrCard] = useState('Conta corrente');
  const [active, setActive] = useState(true);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const monthOptions = useMemo(() => {
    const start = household?.periodStart ?? `${new Date().getFullYear()}-01-01`;
    const base = getMonthKeysFromStart(start, 12);
    const current = getCurrentMonthKey();
    const extras = [current, addMonthsToKey(current, 1), selectedMonth];
    return Array.from(new Set([...base, ...extras])).sort();
  }, [household, selectedMonth]);

  const accountAndCardOptions = useMemo(() => {
    const activeCards = cards
      .filter((c) => c.active)
      .map((c) => ({ label: `${c.name} (Cartão)`, value: c.name, cardId: c.id }));
    const accounts = (household?.accounts ?? ['Conta corrente', 'Poupança', 'Carteira']).map((a) => ({
      label: a,
      value: a,
      cardId: '',
    }));
    return { activeCards, accounts, all: [...activeCards, ...accounts] };
  }, [cards, household]);

  const filteredItems = useMemo(() => {
    return recurringItems
      .filter((item) => (filterType === 'ALL' ? true : item.type === filterType))
      .sort((a, b) => {
        if (a.active !== b.active) return a.active ? -1 : 1;
        if (a.type !== b.type) return a.type === 'Saída' ? -1 : 1;
        return a.dayOfMonth - b.dayOfMonth;
      });
  }, [recurringItems, filterType]);

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

  const monthStats = useMemo(() => {
    const salaryIncome = getMonthlyCoupleIncome(incomes, selectedMonth);
    let fixedExtraGains = 0;
    let fixedExpenses = 0;
    let settledExpenses = 0;

    for (const item of recurringItems) {
      const raw = getRecurringItemRawAmountInMonth(item, selectedMonth);
      if (raw <= 0) continue;
      if (item.type === 'Entrada') {
        fixedExtraGains += raw;
      } else {
        fixedExpenses += raw;
        if (isRecurringItemSettledInMonth(item.id, selectedMonth, transactions)) {
          settledExpenses += raw;
        }
      }
    }

    const grossFixedGains = salaryIncome + fixedExtraGains;
    const negativeDiscount = Math.min(grossFixedGains, incomeOffsets.deductionsByMonth[selectedMonth] ?? 0);
    const totalFixedGains = Math.max(0, grossFixedGains - negativeDiscount);
    return {
      salaryIncome,
      fixedExtraGains,
      grossFixedGains,
      negativeDiscount,
      totalFixedGains,
      fixedExpenses,
      settledExpenses,
      pendingExpenses: Math.max(0, fixedExpenses - settledExpenses),
      netFixed: totalFixedGains - fixedExpenses,
    };
  }, [incomes, recurringItems, selectedMonth, transactions, incomeOffsets]);

  const projection12Months = useMemo(() => {
    const start = getCurrentMonthKey();
    return Array.from({ length: 12 }, (_, idx) => {
      const mk = addMonthsToKey(start, idx);
      const salary = getMonthlyCoupleIncome(incomes, mk);
      let gains = salary;
      let expenses = 0;
      for (const item of recurringItems) {
        const raw = getRecurringItemRawAmountInMonth(item, mk);
        if (item.type === 'Entrada') gains += raw;
        else expenses += raw;
      }
      const discount = Math.min(gains, incomeOffsets.deductionsByMonth[mk] ?? 0);
      const netGains = Math.max(0, gains - discount);
      return {
        monthKey: mk,
        label: formatMonthShort(mk),
        grossGains: gains,
        discount,
        gains: netGains,
        expenses,
        net: netGains - expenses,
      };
    });
  }, [incomes, recurringItems, incomeOffsets]);

  const openNew = (defaultType: RecurringType = 'Saída') => {
    setEditing(null);
    setType(defaultType);
    setDescription('');
    setAmount('');
    setCategory(
      defaultType === 'Saída'
        ? household?.categories.find((c) => c.toLowerCase().includes('fixa')) ?? household?.categories[0] ?? 'Contas fixas'
        : 'Outros'
    );
    setPerson(currentPartnerName);
    setFrequency('Mensal');
    setDayOfMonth('5');
    setStartMonthKey(selectedMonth);
    setEndMonthKey('');
    setPaymentMethod(household?.paymentMethods[0] ?? 'Pix');
    setAccountOrCard(household?.accounts[0] ?? 'Conta corrente');
    setActive(true);
    setNotes('');
    setError('');
    setModalOpen(true);
  };

  const openEdit = (item: RecurringItem) => {
    setEditing(item);
    setType(item.type);
    setDescription(item.description);
    setAmount(String(item.amount));
    setCategory(item.category);
    setPerson(item.person);
    setFrequency(item.frequency);
    setDayOfMonth(String(item.dayOfMonth));
    setStartMonthKey(item.startMonthKey);
    setEndMonthKey(item.endMonthKey);
    setPaymentMethod(item.paymentMethod);
    setAccountOrCard(item.accountOrCard);
    setActive(item.active);
    setNotes(item.notes);
    setError('');
    setModalOpen(true);
  };

  const handlePaymentMethodChange = (nextMethod: string) => {
    setPaymentMethod(nextMethod);
    if (nextMethod === 'Crédito' && accountAndCardOptions.activeCards.length > 0) {
      const currentIsCard = accountAndCardOptions.activeCards.some((c) => c.value === accountOrCard);
      if (!currentIsCard) {
        setAccountOrCard(accountAndCardOptions.activeCards[0].value);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const parsedSigned = parseSignedDecimal(amount);
    const num = Number.isFinite(parsedSigned) ? Math.abs(parsedSigned) : NaN;
    if (!Number.isFinite(num) || num <= 0) {
      setError('Informe um valor diferente de zero.');
      return;
    }
    const effectiveType: RecurringType = parsedSigned < 0 ? 'Saída' : type;
    const matchedCard = cards.find((c) => c.name === accountOrCard);
    setSaving(true);
    try {
      await saveRecurringItem(
        {
          type: effectiveType,
          description,
          amount: num,
          category,
          person,
          frequency,
          dayOfMonth: Number(dayOfMonth) || 5,
          startMonthKey,
          endMonthKey,
          paymentMethod,
          accountOrCard,
          cardId: matchedCard?.id ?? '',
          active,
          notes,
        },
        editing?.id
      );
      setModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar item fixo.');
    } finally {
      setSaving(false);
    }
  };

  const handleSettle = async (item: RecurringItem) => {
    setSettlingId(item.id);
    try {
      await settleRecurringItemForMonth(item, selectedMonth, item.amount, 'Pago');
    } finally {
      setSettlingId(null);
    }
  };

  if (!household) return null;
  const peopleOptions = getHouseholdPeople(household);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Contas e Ganhos Fixos</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Cadastre contas, assinaturas, faturas e ganhos recorrentes para projeção automática nos próximos meses.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full sm:w-auto shrink-0">
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2">
            <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
            <select
              aria-label="Mês de referência"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-full min-w-0 text-sm font-medium text-slate-800 bg-transparent focus:outline-none cursor-pointer"
            >
              {monthOptions.map((mk) => (
                <option key={mk} value={mk}>
                  {formatMonthFull(mk)}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => openNew('Saída')}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            Novo item fixo
          </button>
        </div>
      </div>

      {/* KPIs do Mês */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
          <span className="text-xs font-medium text-slate-500">Ganhos fixos ({formatMonthShort(selectedMonth)})</span>
          <p className="text-2xl font-bold font-mono tabular-nums text-emerald-700">
            {formatBRL(monthStats.totalFixedGains)}
          </p>
          <p className="text-xs text-slate-500">
            Salários {formatBRL(monthStats.salaryIncome)} · Outros fixos {formatBRL(monthStats.fixedExtraGains)}
            {monthStats.negativeDiscount > 0 && (
              <span className="text-red-600 font-medium">
                {' '}· Abate saldo negativo −{formatBRL(monthStats.negativeDiscount)}
              </span>
            )}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
          <span className="text-xs font-medium text-slate-500">Despesas fixas ({formatMonthShort(selectedMonth)})</span>
          <p className="text-2xl font-bold font-mono tabular-nums text-slate-900">
            {formatBRL(monthStats.fixedExpenses)}
          </p>
          <p className="text-xs text-slate-500">
            Pago {formatBRL(monthStats.settledExpenses)} · Projetado {formatBRL(monthStats.pendingExpenses)}
          </p>
        </div>
        <div className="bg-slate-900 text-white rounded-xl p-5 space-y-2">
          <span className="text-xs font-medium text-slate-300">Saldo fixo previsto</span>
          <p className={`text-2xl font-bold font-mono tabular-nums ${monthStats.netFixed < 0 ? 'text-red-300' : 'text-white'}`}>
            {formatBRL(monthStats.netFixed)}
          </p>
          <p className="text-xs text-slate-300">Ganhos fixos menos contas fixas no mês</p>
        </div>
      </section>

      {incomeOffsets.negativeBalanceDebt > 0 && (
        <div className="duofin-expand-enter p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800">
          Saldo atual negativo nas contas (<strong>{formatBRL(incomeOffsets.totalAccountsBalance)}</strong>): o valor de{' '}
          <strong>{formatBRL(incomeOffsets.negativeBalanceDebt)}</strong> está sendo descontado automaticamente da próxima entrada de renda fixa
          {incomeOffsets.firstImpactedEvent
            ? ` (${incomeOffsets.firstImpactedEvent.title} em ${formatDateBR(incomeOffsets.firstImpactedEvent.dateISO)}).`
            : '.'}
        </div>
      )}

      {/* Filtros + Lista de Itens Fixos */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 sm:px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Itens fixos cadastrados</h2>
            <p className="text-xs text-slate-500">
              Ao confirmar no mês, o lançamento real substitui a projeção sem duplicar o valor.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg w-full sm:w-auto">
            {(
              [
                { id: 'ALL', label: 'Todos' },
                { id: 'Saída', label: 'Despesas' },
                { id: 'Entrada', label: 'Ganhos' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterType(tab.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                  filterType === tab.id ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {filteredItems.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <Repeat className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-sm font-medium text-slate-700">Nenhum ganho ou conta fixa cadastrada.</p>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Cadastre aluguel, condomínio, internet, academia, faturas recorrentes ou ganhos fixos para vê-los projetados automaticamente nos próximos 12 meses.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => openNew('Saída')}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Cadastrar conta fixa
              </button>
              <button
                type="button"
                onClick={() => openNew('Entrada')}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-200 text-slate-800 text-xs font-semibold rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Cadastrar ganho fixo
              </button>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredItems.map((item) => {
              const appliesThisMonth = getRecurringItemRawAmountInMonth(item, selectedMonth) > 0;
              const settled = isRecurringItemSettledInMonth(item.id, selectedMonth, transactions);
              return (
                <div
                  key={item.id}
                  className={`p-4 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    !item.active ? 'opacity-60 bg-slate-50/50' : 'hover:bg-slate-50/60'
                  }`}
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${
                          item.type === 'Entrada'
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {item.type === 'Entrada' ? 'Ganho fixo · Renda' : 'Despesa fixa'}
                      </span>
                      <p className="text-sm font-semibold text-slate-900 truncate">{item.description}</p>
                      {item.type === 'Entrada' && (
                        <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                          Projetada na aba Renda
                        </span>
                      )}
                      {!item.active && (
                        <span className="text-[11px] font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md">
                          Pausado
                        </span>
                      )}
                      {item.paymentMethod === 'Crédito' && (
                        <span className="text-[11px] font-medium text-sky-700 bg-sky-50 px-2 py-0.5 rounded-md">
                          Na fatura
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">
                      {item.frequency} · Dia {item.dayOfMonth} · {item.category} · {item.person} · {item.paymentMethod} ({item.accountOrCard})
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Início: {formatMonthShort(item.startMonthKey)}
                      {item.endMonthKey ? ` · Término: ${formatMonthShort(item.endMonthKey)}` : ' · Contínuo'}
                      {item.notes ? ` · ${item.notes}` : ''}
                    </p>
                  </div>

                  <div className="flex flex-wrap sm:flex-nowrap items-center justify-between sm:justify-end gap-3 shrink-0">
                    <div className="text-left sm:text-right">
                      <p
                        className={`text-sm font-bold font-mono tabular-nums ${
                          item.type === 'Entrada' ? 'text-emerald-700' : 'text-slate-900'
                        }`}
                      >
                        {item.type === 'Entrada' ? '+' : '−'} {formatBRL(item.amount)}
                      </p>
                      {appliesThisMonth ? (
                        settled ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                            <CheckCircle2 className="w-3 h-3" />
                            Confirmado em {formatMonthShort(selectedMonth)}
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={settlingId === item.id}
                            onClick={() => handleSettle(item)}
                            className="text-[11px] font-semibold text-sky-700 hover:text-sky-900 hover:underline cursor-pointer disabled:opacity-50"
                          >
                            {settlingId === item.id
                              ? 'Confirmando...'
                              : item.type === 'Entrada'
                              ? `Confirmar recebimento (${formatMonthShort(selectedMonth)})`
                              : `Marcar como pago (${formatMonthShort(selectedMonth)})`}
                          </button>
                        )
                      ) : (
                        <span className="text-[11px] text-slate-400">Fora de {formatMonthShort(selectedMonth)}</span>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => toggleRecurringItemActive(item)}
                        title={item.active ? 'Pausar projeção' : 'Reativar projeção'}
                        className="p-1.5 text-slate-400 hover:text-slate-900 rounded-lg hover:bg-slate-100 cursor-pointer"
                      >
                        {item.active ? <PauseCircle className="w-4 h-4" /> : <PlayCircle className="w-4 h-4" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => openEdit(item)}
                        title="Editar"
                        className="p-1.5 text-slate-400 hover:text-slate-900 rounded-lg hover:bg-slate-100 cursor-pointer"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteRecurringItem(item.id)}
                        title="Excluir"
                        className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Resumo de Salários (Renda) */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-slate-900">Salários e rendas cadastradas</h2>
          <p className="text-xs text-slate-500">
            Os salários ativos na aba Renda ({formatBRL(monthStats.salaryIncome)}/mês) também entram automaticamente nas projeções futuras.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('renda')}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-white border border-slate-200 text-slate-800 text-xs font-semibold rounded-lg hover:bg-slate-50 cursor-pointer shrink-0"
        >
          Gerenciar salários em Renda
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </section>

      {/* Projeção dos próximos 12 meses */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-900">Projeção automática dos próximos 12 meses</h2>
          <p className="text-xs text-slate-500">
            Soma de salários, ganhos fixos e despesas fixas projetadas mês a mês.
          </p>
        </div>

        {/* Mobile Cards (Zero horizontal scroll) */}
        <div className="md:hidden divide-y divide-slate-100">
          {projection12Months.map((row) => (
            <div key={row.monthKey} className="p-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900">{row.label}</p>
                <p className="text-xs text-slate-500">
                  +{formatBRL(row.gains)} · −{formatBRL(row.expenses)}
                </p>
                {row.discount > 0 && (
                  <p className="text-[11px] font-medium text-red-600">
                    Desconto saldo negativo: −{formatBRL(row.discount)}
                  </p>
                )}
              </div>
              <span
                className={`text-sm font-bold font-mono tabular-nums shrink-0 ${
                  row.net < 0 ? 'text-red-600' : 'text-emerald-700'
                }`}
              >
                {formatBRL(row.net)}
              </span>
            </div>
          ))}
        </div>

        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <th className="py-3 px-4">Mês</th>
                <th className="py-3 px-4 text-right">Ganhos fixos + Salários</th>
                <th className="py-3 px-4 text-right">Despesas fixas</th>
                <th className="py-3 px-4 text-right">Saldo fixo líquido</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {projection12Months.map((row) => (
                <tr key={row.monthKey} className="hover:bg-slate-50/70">
                  <td className="py-2.5 px-4 font-medium text-slate-900">
                    {row.label}
                    {row.discount > 0 && (
                      <span className="ml-2 text-[11px] font-medium text-red-600">
                        (−{formatBRL(row.discount)} saldo neg.)
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums text-emerald-700">
                    {formatBRL(row.gains)}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-800">
                    {formatBRL(row.expenses)}
                  </td>
                  <td
                    className={`py-2.5 px-4 text-right font-mono tabular-nums font-semibold ${
                      row.net < 0 ? 'text-red-600' : 'text-emerald-700'
                    }`}
                  >
                    {formatBRL(row.net)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Modal Criar / Editar Item Fixo */}
      {modalOpen && (
        <ModalPortal>
          <div
            className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/45 backdrop-blur-[2px] pt-3 px-3 pb-6 sm:pt-8 sm:px-4 overflow-y-auto duofin-backdrop-enter"
            onClick={(e) => {
              if (e.target === e.currentTarget) setModalOpen(false);
            }}
          >
            <div className="duofin-dialog-enter bg-white w-full max-w-full sm:max-w-lg rounded-2xl border border-slate-200 max-h-[88dvh] overflow-y-auto overflow-x-hidden shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
              <h3 className="text-base font-semibold text-slate-900">
                {editing ? 'Editar item fixo' : 'Novo ganho ou conta fixa'}
              </h3>
              <button type="button" onClick={() => setModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">{error}</div>}

              <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg">
                {(['Saída', 'Entrada'] as RecurringType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      setType(t);
                      if (t === 'Entrada' && amount.trimStart().startsWith('-')) {
                        setAmount(amount.trimStart().slice(1));
                      }
                    }}
                    className={`py-2 px-3 text-xs font-semibold rounded-md transition-all cursor-pointer active:scale-[0.98] ${
                      type === t
                        ? t === 'Saída'
                          ? 'bg-white text-red-600 shadow-xs'
                          : 'bg-white text-emerald-700 shadow-xs'
                        : 'text-slate-600'
                    }`}
                  >
                    {t === 'Saída' ? 'Despesa fixa (−)' : 'Ganho fixo (+)'}
                  </button>
                ))}
              </div>

              {type === 'Entrada' && (
                <div className="duofin-expand-enter p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-[11px] font-medium text-emerald-800">
                  Conta fixa positiva → configurada automaticamente como Renda e projetada nos meses futuros.
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                <div className="sm:col-span-7">
                  <label className="block text-xs font-medium text-slate-700 mb-1">Descrição</label>
                  <input
                    type="text"
                    required
                    maxLength={120}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={type === 'Saída' ? 'Ex.: Aluguel, Internet, Energia' : 'Ex.: Salário, Aluguel recebido'}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div className="sm:col-span-5">
                  <label className="block text-xs font-medium text-slate-700 mb-1">Valor (R$)</label>
                  <div className="flex items-stretch gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        const trimmed = amount.trimStart();
                        if (trimmed.startsWith('-')) {
                          setAmount(trimmed.slice(1));
                          setType('Entrada');
                        } else {
                          setAmount(`-${trimmed}`);
                          setType('Saída');
                        }
                      }}
                      aria-label={amount.startsWith('-') ? 'Tornar ganho positivo' : 'Tornar despesa negativa'}
                      className={`min-w-[38px] px-2 rounded-lg border text-xs font-bold font-mono transition-all cursor-pointer active:scale-95 flex items-center justify-center shrink-0 ${
                        amount.startsWith('-') || type === 'Saída'
                          ? 'bg-red-50 border-red-200 text-red-700'
                          : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                      }`}
                    >
                      {amount.startsWith('-') ? '−' : '+/−'}
                    </button>
                    <input
                      type="text"
                      inputMode="decimal"
                      required
                      value={amount}
                      onChange={(e) => {
                        const sanitized = sanitizeSignedDecimalInput(e.target.value, true);
                        setAmount(sanitized);
                        if (sanitized.startsWith('-')) {
                          setType('Saída');
                        }
                      }}
                      placeholder="0,00"
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Frequência</label>
                  <select
                    value={frequency}
                    onChange={(e) => setFrequency(e.target.value as RecurringFrequency)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="Mensal">Mensal</option>
                    <option value="Quinzenal">Quinzenal</option>
                    <option value="Semanal">Semanal</option>
                    <option value="Anual">Anual</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Dia do mês</label>
                  <input
                    type="number"
                    required
                    min="1"
                    max="31"
                    value={dayOfMonth}
                    onChange={(e) => setDayOfMonth(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Responsável</label>
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
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Projetar a partir de</label>
                  <input
                    type="month"
                    required
                    value={startMonthKey}
                    onChange={(e) => setStartMonthKey(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Mês final (opcional)</label>
                  <input
                    type="month"
                    value={endMonthKey}
                    onChange={(e) => setEndMonthKey(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Categoria</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    {household.categories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Pagamento</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => handlePaymentMethodChange(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    {household.paymentMethods.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Conta ou cartão</label>
                  <select
                    value={accountOrCard}
                    onChange={(e) => setAccountOrCard(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    {accountAndCardOptions.all.map((opt) => (
                      <option key={opt.label} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Observações</label>
                  <input
                    type="text"
                    maxLength={300}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Opcional..."
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer pt-4">
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={(e) => setActive(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300"
                  />
                  Projeção ativa
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm text-slate-600 cursor-pointer">
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-800 disabled:opacity-60 cursor-pointer"
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
