import React, { useMemo, useState } from 'react';
import { CreditCard as CardIcon, Pencil, Plus, Trash2, X } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useFinance } from '../context/AuthHouseholdContext';
import { useTheme } from '../context/ThemeContext';
import type { CreditCard } from '../types/finance';
import { ModalPortal } from '../components/ModalPortal';
import { CHART_ANIMATION, getChartTheme, getLimitUsageColor, SEMANTIC_COLORS } from '../utils/chartColors';
import {
  addMonthsToKey,
  computeInstallmentSummary,
  formatBRL,
  formatDateBR,
  formatMonthFull,
  formatMonthShort,
  getCardInvoiceInMonth,
  getCurrentMonthKey,
  getHouseholdPeople,
  getMonthKeysFromStart,
} from '../utils/financeCalculations';

const CARD_COLORS = [
  SEMANTIC_COLORS.orangeDeep,
  SEMANTIC_COLORS.yellow,
  SEMANTIC_COLORS.negative,
  SEMANTIC_COLORS.positive,
  SEMANTIC_COLORS.orange,
  SEMANTIC_COLORS.amber,
];

export function CardsPage() {
  const { household, cards, transactions, installments, recurringItems, currentPartnerName, saveCard, deleteCard } =
    useFinance();
  const { isDark } = useTheme();
  const chartTheme = getChartTheme(isDark);

  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthKey());
  const [selectedCardId, setSelectedCardId] = useState<string>('ALL');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CreditCard | null>(null);

  const [name, setName] = useState('');
  const [holder, setHolder] = useState(currentPartnerName);
  const [limit, setLimit] = useState('');
  const [closingDay, setClosingDay] = useState('10');
  const [dueDay, setDueDay] = useState('17');
  const [color, setColor] = useState<string>(CARD_COLORS[0]);
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const monthKeys = useMemo(() => {
    const start = household?.periodStart ?? `${new Date().getFullYear()}-01-01`;
    return getMonthKeysFromStart(start, 12);
  }, [household]);

  const nextMonthKey = addMonthsToKey(selectedMonth, 1);

  const totalRemainingInstallments = useMemo(() => {
    return installments.reduce((s, inst) => s + computeInstallmentSummary(inst).remainingAmount, 0);
  }, [installments]);

  // 12-month stacked invoice data
  const chartData = useMemo(() => {
    return monthKeys.map((mk) => {
      const row: Record<string, string | number> = { monthKey: mk, label: formatMonthShort(mk) };
      for (const c of cards.filter((x) => x.active)) {
        row[c.name] =
          Math.round(getCardInvoiceInMonth(c, mk, transactions, installments, recurringItems).total * 100) / 100;
      }
      return row;
    });
  }, [monthKeys, cards, transactions, installments, recurringItems]);

  const cardSummaries = useMemo(() => {
    return cards.map((card) => {
      const currentInv = getCardInvoiceInMonth(card, selectedMonth, transactions, installments, recurringItems);
      const nextInv = getCardInvoiceInMonth(card, nextMonthKey, transactions, installments, recurringItems);
      const committedFuture = installments
        .filter((i) => i.cardId === card.id || i.cardName === card.name)
        .reduce((s, i) => s + computeInstallmentSummary(i).remainingAmount, 0);
      const usedLimit = committedFuture + currentInv.creditPurchasesTotal + currentInv.recurringTotal;
      const availableLimit = Math.max(0, card.limit - usedLimit);
      const usedPct = card.limit > 0 ? Math.min(100, (usedLimit / card.limit) * 100) : 0;
      return {
        card,
        currentInv,
        nextInv,
        committedFuture,
        usedLimit,
        availableLimit,
        usedPct,
      };
    });
  }, [cards, selectedMonth, nextMonthKey, transactions, installments, recurringItems]);

  const totalLimitsSum = cardSummaries.filter((cs) => cs.card.active).reduce((s, cs) => s + cs.card.limit, 0);
  const totalUsedLimitsSum = cardSummaries.filter((cs) => cs.card.active).reduce((s, cs) => s + cs.usedLimit, 0);

  const activeDetails = useMemo(() => {
    const targetCards =
      selectedCardId === 'ALL' ? cardSummaries : cardSummaries.filter((s) => s.card.id === selectedCardId);

    const purchases: Array<{ id: string; title: string; date: string; cardName: string; person: string; amount: number; badge: string }> = [];
    for (const cs of targetCards) {
      for (const inst of cs.currentInv.matchingInstallments) {
        purchases.push({
          id: `inst-${inst.id}`,
          title: `${inst.description} (${inst.installmentIndex}/${inst.installmentsCount})`,
          date: inst.firstChargeDate,
          cardName: cs.card.name,
          person: inst.person,
          amount: inst.monthAmount,
          badge: 'Parcela',
        });
      }
      for (const tx of cs.currentInv.matchingTransactions) {
        purchases.push({
          id: `tx-${tx.id}`,
          title: tx.description,
          date: tx.date,
          cardName: cs.card.name,
          person: tx.person,
          amount: tx.actualAmount,
          badge: 'À vista no crédito',
        });
      }
      for (const rec of cs.currentInv.matchingRecurring) {
        purchases.push({
          id: `rec-${rec.id}-${rec.occurrenceMonthKey}`,
          title: rec.description,
          date: `${rec.occurrenceMonthKey}-${String(Math.min(28, rec.dayOfMonth)).padStart(2, '0')}`,
          cardName: cs.card.name,
          person: rec.person,
          amount: rec.monthAmount,
          badge: `Fixo (${rec.frequency})`,
        });
      }
    }
    return purchases.sort((a, b) => b.amount - a.amount);
  }, [cardSummaries, selectedCardId]);

  const currentTotalAllCards = cardSummaries.reduce((s, cs) => s + cs.currentInv.total, 0);
  const nextTotalAllCards = cardSummaries.reduce((s, cs) => s + cs.nextInv.total, 0);

  const openNew = () => {
    setEditing(null);
    setName('');
    setHolder(currentPartnerName);
    setLimit('');
    setClosingDay('10');
    setDueDay('17');
    setColor(CARD_COLORS[cards.length % CARD_COLORS.length]);
    setActive(true);
    setError('');
    setModalOpen(true);
  };

  const openEdit = (c: CreditCard) => {
    setEditing(c);
    setName(c.name);
    setHolder(c.holder);
    setLimit(String(c.limit));
    setClosingDay(String(c.closingDay));
    setDueDay(String(c.dueDay));
    setColor(c.color);
    setActive(c.active);
    setError('');
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const lim = Number(limit.replace(',', '.')) || 0;
    setSaving(true);
    try {
      await saveCard(
        {
          name,
          holder,
          limit: lim,
          closingDay: Number(closingDay) || 10,
          dueDay: Number(dueDay) || 17,
          color,
          active,
        },
        editing?.id
      );
      setModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar cartão.');
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
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Cartões e Faturas</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Faturas atuais e futuras, limite usado e limite disponível por cartão.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full sm:w-auto shrink-0">
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="w-full sm:w-auto px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white font-medium text-slate-800"
          >
            {Array.from(new Set([...monthKeys, selectedMonth, nextMonthKey]))
              .sort()
              .map((mk) => (
                <option key={mk} value={mk}>
                  {formatMonthFull(mk)}
                </option>
              ))}
          </select>
          <button
            type="button"
            onClick={openNew}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 sm:py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            Cadastrar cartão
          </button>
        </div>
      </div>

      {/* KPIs */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900 text-white rounded-xl p-5 space-y-1.5">
          <span className="text-xs font-medium text-slate-300">Fatura de {formatMonthShort(selectedMonth)}</span>
          <p className="text-2xl font-bold font-mono tabular-nums">{formatBRL(currentTotalAllCards)}</p>
          <p className="text-[11px] text-slate-400">Valor total para pagar neste mês (somando todos os cartões).</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-1.5">
          <span className="text-xs font-medium text-slate-500">Limite usado agora</span>
          <p className="text-2xl font-bold font-mono tabular-nums text-red-600">{formatBRL(totalUsedLimitsSum)}</p>
          <p className="text-[11px] text-slate-400">
            {totalLimitsSum > 0
              ? `${((totalUsedLimitsSum / totalLimitsSum) * 100).toFixed(0)}% de ${formatBRL(totalLimitsSum)} usados com faturas + parcelas.`
              : 'Preencha o limite ao cadastrar o cartão para acompanhar o uso.'}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-1.5">
          <span className="text-xs font-medium text-slate-500">Fatura de {formatMonthShort(nextMonthKey)}</span>
          <p className="text-2xl font-bold font-mono tabular-nums text-amber-600">{formatBRL(nextTotalAllCards)}</p>
          <p className="text-[11px] text-slate-400">Parcelas já marcadas + compras feitas após o dia de fechamento.</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-1.5">
          <span className="text-xs font-medium text-slate-500">Parcelas que ainda faltam</span>
          <p className="text-2xl font-bold font-mono tabular-nums text-slate-900">
            {formatBRL(totalRemainingInstallments)}
          </p>
          <p className="text-[11px] text-slate-400">Soma das próximas parcelas que ainda vão cair nas faturas futuras.</p>
        </div>
      </section>

      {/* Cards Grid */}
      {cards.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-3">
          <CardIcon className="w-8 h-8 text-slate-300 mx-auto" />
          <p className="text-sm font-medium text-slate-700">Nenhum cartão de crédito cadastrado.</p>
          <p className="text-xs text-slate-500">Cadastre os cartões do casal com limite, fechamento e vencimento.</p>
          <button
            type="button"
            onClick={openNew}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Adicionar primeiro cartão
          </button>
        </div>
      ) : (
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {cardSummaries.map(({ card, currentInv, committedFuture, usedLimit, availableLimit, usedPct }) => {
            const isSelected = selectedCardId === card.id;
            const limitUsage = getLimitUsageColor(usedPct);
            return (
              <div
                key={card.id}
                onClick={() => setSelectedCardId(isSelected ? 'ALL' : card.id)}
                className={`bg-white border rounded-xl p-5 space-y-4 cursor-pointer transition-colors ${
                  isSelected ? 'border-slate-900 ring-1 ring-slate-900' : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-3 h-3 rounded-xs shrink-0" style={{ backgroundColor: card.color }} />
                    <div className="min-w-0">
                      <h3 className="text-base font-semibold text-slate-900 truncate">{card.name}</h3>
                      <p className="text-xs text-slate-500">
                        {card.holder} · Fecha dia {card.closingDay} · Vence dia {card.dueDay}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => openEdit(card)}
                      className="p-1.5 text-slate-400 hover:text-slate-900 rounded-lg hover:bg-slate-100 cursor-pointer"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteCard(card.id)}
                      className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                  <div>
                    <p className="text-[11px] text-slate-500">Fatura {formatMonthShort(selectedMonth)}</p>
                    <p className="text-lg font-bold font-mono tabular-nums text-slate-900">
                      {formatBRL(currentInv.total)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] text-slate-500">Comprometido parcelas</p>
                    <p className="text-sm font-semibold font-mono tabular-nums text-slate-700">
                      {formatBRL(committedFuture)}
                    </p>
                  </div>
                </div>

                {card.limit > 0 && (
                  <div className="space-y-2 pt-2 border-t border-slate-100">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-slate-500">
                        Limite usado:{' '}
                        <strong className="font-mono tabular-nums text-slate-900">{formatBRL(usedLimit)}</strong>{' '}
                        <span className="text-[11px] font-mono">({usedPct.toFixed(0)}%)</span>
                      </span>
                      <span className={`px-2 py-0.5 text-[10px] font-semibold rounded border ${limitUsage.badgeClass}`}>
                        {limitUsage.label}
                      </span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${usedPct}%`, backgroundColor: limitUsage.barHex }}
                      />
                    </div>
                    <div className="flex flex-wrap justify-between gap-2 text-[11px] text-slate-500">
                      <span>
                        Disponível:{' '}
                        <strong className="font-mono tabular-nums text-emerald-700">{formatBRL(availableLimit)}</strong>
                      </span>
                      <span className="font-mono tabular-nums">Limite: {formatBRL(card.limit)}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </section>
      )}

      {/* Gráfico 12 meses */}
      {cards.length > 0 && (
        <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 min-w-0">
          <h2 className="text-base font-semibold text-slate-900">Faturas atuais e futuras (12 meses)</h2>
          <div className="h-64 min-w-0 w-full duofin-chart-enter">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
                {cards
                  .filter((c) => c.active)
                  .map((c) => (
                    <Bar {...CHART_ANIMATION} key={c.id} dataKey={c.name} stackId="cards" fill={c.color} radius={[2, 2, 0, 0]} />
                  ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* Detalhamento das compras na fatura */}
      {cards.length > 0 && (
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Compras na fatura de {formatMonthFull(selectedMonth)}
              </h2>
              <p className="text-xs text-slate-500">
                {selectedCardId === 'ALL'
                  ? 'Mostrando todos os cartões. Clique em um cartão acima para filtrar.'
                  : `Filtrando: ${cards.find((c) => c.id === selectedCardId)?.name ?? ''}`}
              </p>
            </div>
            {selectedCardId !== 'ALL' && (
              <button
                type="button"
                onClick={() => setSelectedCardId('ALL')}
                className="text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                Mostrar todos os cartões
              </button>
            )}
          </div>

          {activeDetails.length === 0 ? (
            <p className="p-8 text-center text-sm text-slate-500">Nenhuma compra ou parcela lançada nesta fatura.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {activeDetails.map((item) => (
                <div key={item.id} className="px-5 py-3 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{item.title}</p>
                    <p className="text-xs text-slate-500">
                      {item.cardName} · {item.badge} · {item.person} · {formatDateBR(item.date)}
                    </p>
                  </div>
                  <span className="text-sm font-semibold font-mono tabular-nums text-red-600 shrink-0">
                    {formatBRL(item.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Modal Cartão */}
      {modalOpen && (
        <ModalPortal>
          <div
            className="duofin-backdrop-enter fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 pt-3 px-3 pb-6 sm:pt-8 sm:px-4 overflow-y-auto"
            onClick={() => setModalOpen(false)}
          >
            <div
              className="duofin-dialog-enter bg-white w-full sm:max-w-md rounded-2xl border border-slate-200 max-h-[88dvh] overflow-y-auto shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  {editing ? 'Configurar cartão e fatura' : 'Cadastrar cartão de crédito'}
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Preencha com os dados do app do seu banco para calcular faturas e limite certinho.
                </p>
              </div>
              <button type="button" onClick={() => setModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">{error}</div>}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Nome do cartão</label>
                <input
                  type="text"
                  required
                  maxLength={60}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex.: Nubank, Itaú Black"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 leading-snug">
                  Coloque um apelido simples para achar o cartão rápido ao lançar uma compra.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Quem usa (Titular)</label>
                  <select
                    value={holder}
                    onChange={(e) => setHolder(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    {peopleOptions.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 leading-snug">
                    Dono principal do cartão para separar faturas por pessoa.
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Limite total (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={limit}
                    onChange={(e) => setLimit(e.target.value)}
                    placeholder="5000,00"
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg"
                  />
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 leading-snug">
                    Limite máximo do cartão no banco. Se não quiser acompanhar limite, deixe 0.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Dia que a fatura fecha</label>
                  <input
                    type="number"
                    required
                    min="1"
                    max="31"
                    value={closingDay}
                    onChange={(e) => setClosingDay(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg"
                  />
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 leading-snug">
                    Compras feitas nesse dia ou depois vão para a fatura do mês seguinte.
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Dia de vencimento da fatura</label>
                  <input
                    type="number"
                    required
                    min="1"
                    max="31"
                    value={dueDay}
                    onChange={(e) => setDueDay(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg"
                  />
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 leading-snug">
                    Dia do mês em que a fatura vence para pagamento e entra nos lembretes.
                  </p>
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
                <p className="text-[11px] font-medium text-slate-600">Resumo de como suas faturas vão funcionar:</p>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Compras a partir do dia <strong className="text-slate-600">{Number(closingDay) || 10}</strong> entram só na fatura do mês seguinte, com vencimento todo dia <strong className="text-slate-600">{Number(dueDay) || 17}</strong>.
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">Cor de identificação</label>
                <div className="flex items-center gap-2">
                  {CARD_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      className={`w-7 h-7 rounded-lg cursor-pointer ${color === c ? 'ring-2 ring-offset-2 ring-slate-900' : ''}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5 leading-snug">
                  Cor usada para diferenciar este cartão nos gráficos e na lista de faturas.
                </p>
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
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
