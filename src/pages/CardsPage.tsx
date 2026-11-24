import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  CreditCard as CardIcon,
  Layers,
  Pencil,
  Plus,
  RotateCcw,
  ShieldCheck,
  Trash2,
  Wallet,
  X,
} from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useFinance } from '../context/AuthHouseholdContext';
import { useTheme } from '../context/ThemeContext';
import type { CardInvoiceStatus, CardLimitRule, CreditCard } from '../types/finance';
import { ModalPortal } from '../components/ModalPortal';
import { CHART_ANIMATION, getChartTheme, getLimitUsageColor, SEMANTIC_COLORS } from '../utils/chartColors';
import {
  addMonthsToKey,
  computeCardLimitUsage,
  computeInstallmentSummary,
  formatBRL,
  formatDateBR,
  formatMonthFull,
  formatMonthShort,
  getCardInvoiceInMonth,
  getCurrentMonthKey,
  getHouseholdPeople,
  getMonthKeysFromStart,
  getTodayISO,
  matchesCard,
} from '../utils/financeCalculations';

const CARD_COLORS = [
  SEMANTIC_COLORS.orangeDeep,
  SEMANTIC_COLORS.yellow,
  SEMANTIC_COLORS.negative,
  SEMANTIC_COLORS.positive,
  SEMANTIC_COLORS.orange,
  SEMANTIC_COLORS.amber,
];

function getInvoiceStatusStyle(status: CardInvoiceStatus): { badge: string; label: string } {
  switch (status) {
    case 'Paga':
      return {
        badge: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800',
        label: 'Paga',
      };
    case 'Parcialmente paga':
      return {
        badge: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800',
        label: 'Parcialmente paga',
      };
    case 'Vencida':
      return {
        badge: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800',
        label: 'Vencida',
      };
    case 'Fechada':
      return {
        badge: 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-950/60 dark:text-orange-300 dark:border-orange-800',
        label: 'Fechada',
      };
    case 'Aberta':
    default:
      return {
        badge: 'bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-800',
        label: 'Aberta',
      };
  }
}

export function CardsPage() {
  const {
    household,
    cards,
    transactions,
    installments,
    recurringItems,
    currentPartnerName,
    saveCard,
    deleteCard,
    recordCardInvoicePayment,
    recordCardRefund,
  } = useFinance();
  const { isDark } = useTheme();
  const chartTheme = getChartTheme(isDark);

  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthKey());
  const [selectedCardId, setSelectedCardId] = useState<string>('ALL');

  // Modal Cadastro/Edição Cartão
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CreditCard | null>(null);
  const [name, setName] = useState('');
  const [holder, setHolder] = useState(currentPartnerName);
  const [limit, setLimit] = useState('');
  const [closingDay, setClosingDay] = useState('10');
  const [dueDay, setDueDay] = useState('17');
  const [limitRule, setLimitRule] = useState<CardLimitRule>('total_parcelamento');
  const [color, setColor] = useState<string>(CARD_COLORS[0]);
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Modal Pagamento Parcial / Integral de Fatura
  const [paymentModal, setPaymentModal] = useState<{
    card: CreditCard;
    mode: 'full' | 'partial';
    remaining: number;
  } | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(getTodayISO());
  const [paymentAccount, setPaymentAccount] = useState('');
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [paymentErr, setPaymentErr] = useState('');

  // Modal Estorno
  const [refundModalCard, setRefundModalCard] = useState<CreditCard | null>(null);
  const [refundDesc, setRefundDesc] = useState('');
  const [refundAmount, setRefundAmount] = useState('');
  const [refundDate, setRefundDate] = useState(getTodayISO());
  const [refundNotes, setRefundNotes] = useState('');
  const [refundBusy, setRefundBusy] = useState(false);
  const [refundErr, setRefundErr] = useState('');

  const todayISO = getTodayISO();

  const monthKeys = useMemo(() => {
    const start = household?.periodStart ?? `${new Date().getFullYear()}-01-01`;
    return getMonthKeysFromStart(start, 12);
  }, [household]);

  const nextMonthKey = addMonthsToKey(selectedMonth, 1);

  const activeInstallmentsSummary = useMemo(() => {
    let activeCount = 0;
    let remainingTotal = 0;
    for (const inst of installments) {
      const s = computeInstallmentSummary(inst, selectedMonth, cards);
      if (s.remainingInstallments > 0 && s.overallStatus !== 'Cancelado') {
        activeCount++;
        remainingTotal += s.remainingAmount;
      }
    }
    return { activeCount, remainingTotal };
  }, [installments, selectedMonth, cards]);

  // 12-month stacked invoice data
  const chartData = useMemo(() => {
    return monthKeys.map((mk) => {
      const row: Record<string, string | number> = { monthKey: mk, label: formatMonthShort(mk) };
      for (const c of cards.filter((x) => x.active)) {
        row[c.name] =
          Math.round(getCardInvoiceInMonth(c, mk, transactions, installments, recurringItems, todayISO).total * 100) / 100;
      }
      return row;
    });
  }, [monthKeys, cards, transactions, installments, recurringItems, todayISO]);

  const cardSummaries = useMemo(() => {
    return cards.map((card) => {
      const currentInv = getCardInvoiceInMonth(card, selectedMonth, transactions, installments, recurringItems, todayISO);
      const nextInv = getCardInvoiceInMonth(card, nextMonthKey, transactions, installments, recurringItems, todayISO);
      const cardActiveInstallments = installments
        .filter((i) => matchesCard(card, i.cardId, i.cardName))
        .map((i) => ({ inst: i, summary: computeInstallmentSummary(i, selectedMonth, cards) }))
        .filter((item) => item.summary.remainingInstallments > 0 && item.summary.overallStatus !== 'Cancelado');
      const committedFuture = cardActiveInstallments.reduce((s, item) => s + item.summary.remainingAmount, 0);
      const limitUsageInfo = computeCardLimitUsage({
        card,
        refMonthKey: selectedMonth,
        transactions,
        installments,
        recurringItems,
        todayISO,
      });
      return {
        card,
        currentInv,
        nextInv,
        cardActiveInstallments,
        committedFuture,
        limitUsageInfo,
      };
    });
  }, [cards, selectedMonth, nextMonthKey, transactions, installments, recurringItems, todayISO]);

  const totalLimitsSum = cardSummaries.filter((cs) => cs.card.active).reduce((s, cs) => s + cs.card.limit, 0);
  const totalUsedLimitsSum = cardSummaries
    .filter((cs) => cs.card.active)
    .reduce((s, cs) => s + cs.limitUsageInfo.usedLimit, 0);
  const totalAvailableLimitsSum = Math.max(0, totalLimitsSum - totalUsedLimitsSum);

  const currentTotalAllCards = cardSummaries.reduce((s, cs) => s + cs.currentInv.total, 0);
  const currentRemainingAllCards = cardSummaries.reduce((s, cs) => s + cs.currentInv.remainingAmount, 0);
  const nextTotalAllCards = cardSummaries.reduce((s, cs) => s + cs.nextInv.total, 0);

  const nextDueSummary = useMemo(() => {
    const candidates = cardSummaries
      .filter((cs) => cs.card.active && cs.currentInv.remainingAmount > 0.005)
      .sort((a, b) => a.currentInv.dueDateISO.localeCompare(b.currentInv.dueDateISO));
    return candidates[0] ?? null;
  }, [cardSummaries]);

  const focusedCardSummary = useMemo(
    () => (selectedCardId === 'ALL' ? null : cardSummaries.find((s) => s.card.id === selectedCardId) ?? null),
    [cardSummaries, selectedCardId]
  );

  // Próximas 6 faturas do cartão selecionado individualmente
  const focusedUpcomingInvoices = useMemo(() => {
    if (!focusedCardSummary) return [];
    return Array.from({ length: 6 }, (_, idx) => {
      const mk = addMonthsToKey(selectedMonth, idx);
      const inv = getCardInvoiceInMonth(
        focusedCardSummary.card,
        mk,
        transactions,
        installments,
        recurringItems,
        todayISO
      );
      return { monthKey: mk, label: formatMonthShort(mk), inv };
    });
  }, [focusedCardSummary, selectedMonth, transactions, installments, recurringItems, todayISO]);

  // Histórico completo da fatura (compras, parcelas, fixos, pagamentos e estornos)
  const activeDetails = useMemo(() => {
    const targetCards =
      selectedCardId === 'ALL' ? cardSummaries : cardSummaries.filter((s) => s.card.id === selectedCardId);

    const rows: Array<{
      id: string;
      title: string;
      date: string;
      cardName: string;
      person: string;
      amount: number;
      badge: string;
      kind: 'charge' | 'payment' | 'refund';
    }> = [];

    for (const cs of targetCards) {
      for (const inst of cs.currentInv.matchingInstallments) {
        rows.push({
          id: `inst-${inst.id}`,
          title: `${inst.description} (${inst.installmentIndex}/${inst.installmentsCount})`,
          date: inst.firstChargeDate,
          cardName: cs.card.name,
          person: inst.person,
          amount: inst.monthAmount,
          badge: 'Parcela',
          kind: 'charge',
        });
      }
      for (const tx of cs.currentInv.matchingTransactions) {
        rows.push({
          id: `tx-${tx.id}`,
          title: tx.description,
          date: tx.date,
          cardName: cs.card.name,
          person: tx.person,
          amount: tx.actualAmount,
          badge: 'À vista no crédito',
          kind: 'charge',
        });
      }
      for (const rec of cs.currentInv.matchingRecurring) {
        rows.push({
          id: `rec-${rec.id}-${rec.occurrenceMonthKey}`,
          title: rec.description,
          date: `${rec.occurrenceMonthKey}-${String(Math.min(28, rec.dayOfMonth)).padStart(2, '0')}`,
          cardName: cs.card.name,
          person: rec.person,
          amount: rec.monthAmount,
          badge: `Fixo (${rec.frequency})`,
          kind: 'charge',
        });
      }
      for (const ref of cs.currentInv.matchingRefunds) {
        rows.push({
          id: `ref-${ref.id}`,
          title: ref.description,
          date: ref.date,
          cardName: cs.card.name,
          person: ref.person,
          amount: ref.actualAmount,
          badge: 'Estorno',
          kind: 'refund',
        });
      }
      for (const pay of cs.currentInv.paymentTransactions) {
        rows.push({
          id: `pay-${pay.id}`,
          title: pay.description,
          date: pay.date,
          cardName: cs.card.name,
          person: pay.person,
          amount: pay.actualAmount > 0 ? pay.actualAmount : cs.currentInv.total,
          badge: pay.actualAmount > 0 && pay.actualAmount < cs.currentInv.total - 0.01 ? 'Pagamento parcial' : 'Pagamento integral',
          kind: 'payment',
        });
      }
    }

    return rows.sort((a, b) => b.date.localeCompare(a.date) || b.amount - a.amount);
  }, [cardSummaries, selectedCardId]);

  const openNew = () => {
    setEditing(null);
    setName('');
    setHolder(currentPartnerName);
    setLimit('');
    setClosingDay('10');
    setDueDay('17');
    setLimitRule('total_parcelamento');
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
    setLimitRule(c.limitRule === 'parcela_mensal' ? 'parcela_mensal' : 'total_parcelamento');
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
          limitRule,
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

  const openPaymentModal = (card: CreditCard, mode: 'full' | 'partial', remaining: number) => {
    setPaymentModal({ card, mode, remaining });
    setPaymentAmount(remaining > 0 ? remaining.toFixed(2) : '');
    setPaymentDate(todayISO);
    setPaymentAccount(household?.accounts?.[0] ?? 'Conta principal');
    setPaymentErr('');
  };

  const handleConfirmPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentModal) return;
    setPaymentErr('');
    const numeric = Number(paymentAmount.replace(',', '.'));
    const amountToUse = paymentModal.mode === 'full' ? paymentModal.remaining : numeric;
    if (!Number.isFinite(amountToUse) || amountToUse <= 0) {
      setPaymentErr('Informe um valor válido maior que zero.');
      return;
    }
    setPaymentBusy(true);
    try {
      await recordCardInvoicePayment({
        card: paymentModal.card,
        monthKey: selectedMonth,
        amount: amountToUse,
        mode: paymentModal.mode,
        dateISO: paymentDate,
        accountName: paymentAccount,
      });
      setPaymentModal(null);
    } catch (err) {
      setPaymentErr(err instanceof Error ? err.message : 'Erro ao registrar pagamento.');
    } finally {
      setPaymentBusy(false);
    }
  };

  const openRefundModal = (card: CreditCard) => {
    setRefundModalCard(card);
    setRefundDesc('');
    setRefundAmount('');
    setRefundDate(todayISO);
    setRefundNotes('');
    setRefundErr('');
  };

  const handleConfirmRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!refundModalCard) return;
    setRefundErr('');
    const numeric = Number(refundAmount.replace(',', '.'));
    if (!Number.isFinite(numeric) || numeric <= 0) {
      setRefundErr('Informe o valor positivo do estorno.');
      return;
    }
    setRefundBusy(true);
    try {
      await recordCardRefund({
        card: refundModalCard,
        description: refundDesc || `Estorno ${refundModalCard.name}`,
        amount: numeric,
        dateISO: refundDate,
        notes: refundNotes,
      });
      setRefundModalCard(null);
    } catch (err) {
      setRefundErr(err instanceof Error ? err.message : 'Erro ao lançar estorno.');
    } finally {
      setRefundBusy(false);
    }
  };

  if (!household) return null;
  const peopleOptions = getHouseholdPeople(household);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Central de Cartões e Faturas
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Limites disponíveis, status das faturas, pagamentos parciais ou integrais, estornos e parcelamentos ativos.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full sm:w-auto shrink-0">
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="w-full sm:w-auto px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 font-medium text-slate-800 dark:text-slate-100"
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

      {/* KPIs da Central */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900 text-white rounded-xl p-5 space-y-1.5">
          <span className="text-xs font-medium text-slate-300">Fatura atual ({formatMonthShort(selectedMonth)})</span>
          <p className="text-2xl font-bold font-mono tabular-nums">{formatBRL(currentRemainingAllCards)}</p>
          <p className="text-[11px] text-slate-400">
            Em aberto · Total bruto no mês {formatBRL(currentTotalAllCards)}
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-1.5">
          <span className="text-xs font-medium text-slate-500">Limite disponível total</span>
          <p className="text-2xl font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
            {formatBRL(totalAvailableLimitsSum)}
          </p>
          <p className="text-[11px] text-slate-400">
            {totalLimitsSum > 0
              ? `Usado: ${formatBRL(totalUsedLimitsSum)} (${((totalUsedLimitsSum / totalLimitsSum) * 100).toFixed(
                  0
                )}% de ${formatBRL(totalLimitsSum)})`
              : 'Informe o limite dos cartões para monitorar o uso.'}
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-1.5">
          <span className="text-xs font-medium text-slate-500">Próximo vencimento & próxima fatura</span>
          <p className="text-2xl font-bold font-mono tabular-nums text-amber-600">{formatBRL(nextTotalAllCards)}</p>
          <p className="text-[11px] text-slate-400">
            {nextDueSummary
              ? `Vence em ${formatDateBR(nextDueSummary.currentInv.dueDateISO)} (${nextDueSummary.card.name}: ${formatBRL(
                  nextDueSummary.currentInv.remainingAmount
                )})`
              : `Previsão para ${formatMonthShort(nextMonthKey)}`}
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-1.5">
          <span className="text-xs font-medium text-slate-500">Parcelamentos ativos</span>
          <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {formatBRL(activeInstallmentsSummary.remainingTotal)}
          </p>
          <p className="text-[11px] text-slate-400">
            {activeInstallmentsSummary.activeCount} parcelamento(s) ativo(s) comprometendo faturas futuras
          </p>
        </div>
      </section>

      {/* Grid de Cartões */}
      {cards.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center space-y-3">
          <CardIcon className="w-8 h-8 text-slate-300 mx-auto" />
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Nenhum cartão de crédito cadastrado.</p>
          <p className="text-xs text-slate-500">Cadastre os cartões com limite, fechamento, vencimento e regra do emissor.</p>
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
          {cardSummaries.map(({ card, currentInv, nextInv, committedFuture, limitUsageInfo }) => {
            const isSelected = selectedCardId === card.id;
            const limitUsage = getLimitUsageColor(limitUsageInfo.usedPct);
            const statusStyle = getInvoiceStatusStyle(currentInv.status);
            return (
              <div
                key={card.id}
                onClick={() => setSelectedCardId(isSelected ? 'ALL' : card.id)}
                className={`bg-white dark:bg-slate-900 border rounded-2xl p-4 space-y-3.5 cursor-pointer transition-colors ${
                  isSelected
                    ? 'border-slate-900 dark:border-emerald-500 ring-1 ring-slate-900 dark:ring-emerald-500'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                {/* Face do Cartão */}
                <div className="bg-slate-900 dark:bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3.5 text-white shadow-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className="w-6 h-4 rounded-sm shrink-0 border border-white/25"
                        style={{ backgroundColor: card.color }}
                      />
                      <div className="min-w-0">
                        <h3 className="text-base font-bold text-white truncate">{card.name}</h3>
                        <p className="text-[11px] text-slate-300 truncate">
                          {card.holder} · Fecha dia {card.closingDay}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                      {card.limit > 0 && (
                        <div className="text-right hidden xs:block">
                          <p className="text-[10px] text-slate-300">Limite disponível</p>
                          <p className="text-xs font-bold font-mono tabular-nums text-emerald-400">
                            {formatBRL(limitUsageInfo.availableLimit)}
                          </p>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => openEdit(card)}
                        className="p-1.5 text-slate-300 hover:text-white rounded-lg hover:bg-white/10 cursor-pointer"
                        aria-label="Editar cartão"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteCard(card.id)}
                        className="p-1.5 text-slate-300 hover:text-red-300 rounded-lg hover:bg-white/10 cursor-pointer"
                        aria-label="Excluir cartão"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-2.5 border-t border-white/15">
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-[11px] text-slate-300">Fatura {formatMonthShort(selectedMonth)}</p>
                        <span className={`px-1.5 py-0.5 text-[10px] font-semibold rounded border ${statusStyle.badge}`}>
                          {statusStyle.label}
                        </span>
                      </div>
                      <p className="text-lg font-bold font-mono tabular-nums text-white mt-0.5">
                        {formatBRL(currentInv.remainingAmount > 0 ? currentInv.remainingAmount : currentInv.total)}
                      </p>
                      {currentInv.status === 'Parcialmente paga' && (
                        <p className="text-[10px] text-amber-200 font-mono tabular-nums">
                          Pago {formatBRL(currentInv.paidAmount)} de {formatBRL(currentInv.total)}
                        </p>
                      )}
                    </div>
                    <div className="text-right border-l border-white/15 pl-3">
                      <p className="text-[11px] text-slate-300">Vence dia {String(card.dueDay).padStart(2, '0')}</p>
                      <p className="text-xs font-semibold font-mono tabular-nums text-slate-100 mt-0.5">
                        Próx. ({formatMonthShort(nextMonthKey)}): {formatBRL(nextInv.total)}
                      </p>
                      <p className="text-[10px] text-slate-400 font-mono tabular-nums">
                        Parcelas: {formatBRL(committedFuture)}
                      </p>
                    </div>
                  </div>
                </div>

                {card.limit > 0 && (
                  <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-slate-500">
                        Usado:{' '}
                        <strong className="font-mono tabular-nums text-slate-900 dark:text-slate-100">
                          {formatBRL(limitUsageInfo.usedLimit)}
                        </strong>{' '}
                        <span className="text-[11px] font-mono">({limitUsageInfo.usedPct.toFixed(0)}%)</span>
                      </span>
                      <span className={`px-2 py-0.5 text-[10px] font-semibold rounded border ${limitUsage.badgeClass}`}>
                        {limitUsage.label}
                      </span>
                    </div>
                    <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${limitUsageInfo.usedPct}%`, backgroundColor: limitUsage.barHex }}
                      />
                    </div>
                    <div className="flex flex-wrap justify-between gap-2 text-[11px] text-slate-500">
                      <span>
                        Disponível:{' '}
                        <strong className="font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                          {formatBRL(limitUsageInfo.availableLimit)}
                        </strong>
                      </span>
                      <span className="font-mono tabular-nums">
                        {limitUsageInfo.limitRule === 'parcela_mensal' ? 'Regra: parcela mensal' : 'Regra: total parcelamento'}
                      </span>
                    </div>
                  </div>
                )}

                <div
                  className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-1.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  {currentInv.remainingAmount > 0.005 && (
                    <>
                      <button
                        type="button"
                        onClick={() => openPaymentModal(card, 'full', currentInv.remainingAmount)}
                        className="px-2.5 py-1 text-[11px] font-semibold bg-emerald-600 text-white rounded-md hover:bg-emerald-700 cursor-pointer"
                      >
                        Pagar integral
                      </button>
                      <button
                        type="button"
                        onClick={() => openPaymentModal(card, 'partial', currentInv.remainingAmount)}
                        className="px-2.5 py-1 text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 rounded-md hover:bg-amber-100 cursor-pointer"
                      >
                        Pagar parcial
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => openRefundModal(card)}
                    className="px-2.5 py-1 text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-md hover:bg-slate-200 cursor-pointer"
                  >
                    + Estorno
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedCardId(isSelected ? 'ALL' : card.id)}
                    className="ml-auto text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:underline cursor-pointer"
                  >
                    {isSelected ? 'Fechar detalhe' : 'Ver detalhes →'}
                  </button>
                </div>
              </div>
            );
          })}
        </section>
      )}

      {/* Detalhes Individuais do Cartão Selecionado */}
      {focusedCardSummary && (
        <section className="bg-white dark:bg-slate-900 border border-slate-900/20 dark:border-slate-700 rounded-xl p-5 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <span className="w-4 h-4 rounded-sm shrink-0" style={{ backgroundColor: focusedCardSummary.card.color }} />
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  Detalhes de {focusedCardSummary.card.name}
                </h2>
                <p className="text-xs text-slate-500">
                  Responsável: <strong>{focusedCardSummary.card.holder}</strong> · Fechamento:{' '}
                  <strong>{formatDateBR(focusedCardSummary.currentInv.closingDateISO)}</strong> · Vencimento:{' '}
                  <strong>{formatDateBR(focusedCardSummary.currentInv.dueDateISO)}</strong> · Regra de limite:{' '}
                  <strong>
                    {focusedCardSummary.limitUsageInfo.limitRule === 'parcela_mensal'
                      ? 'Somente parcela do ciclo'
                      : 'Valor total do parcelamento'}
                  </strong>
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {focusedCardSummary.currentInv.remainingAmount > 0.005 && (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      openPaymentModal(
                        focusedCardSummary.card,
                        'full',
                        focusedCardSummary.currentInv.remainingAmount
                      )
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 cursor-pointer"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Quitar fatura ({formatBRL(focusedCardSummary.currentInv.remainingAmount)})
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      openPaymentModal(
                        focusedCardSummary.card,
                        'partial',
                        focusedCardSummary.currentInv.remainingAmount
                      )
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-800 border border-amber-200 text-xs font-semibold rounded-lg hover:bg-amber-100 cursor-pointer"
                  >
                    <Wallet className="w-3.5 h-3.5" />
                    Pagamento parcial
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => openRefundModal(focusedCardSummary.card)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-semibold rounded-lg hover:bg-slate-200 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Registrar estorno
              </button>
              <button
                type="button"
                onClick={() => setSelectedCardId('ALL')}
                className="px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 cursor-pointer"
              >
                Ver todos
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
              <p className="text-slate-500">Limite total</p>
              <p className="font-mono tabular-nums font-bold text-slate-900 dark:text-slate-100 text-sm mt-0.5">
                {formatBRL(focusedCardSummary.card.limit)}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
              <p className="text-slate-500">Limite utilizado</p>
              <p className="font-mono tabular-nums font-bold text-red-600 text-sm mt-0.5">
                {formatBRL(focusedCardSummary.limitUsageInfo.usedLimit)}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
              <p className="text-slate-500">Limite disponível</p>
              <p className="font-mono tabular-nums font-bold text-emerald-700 dark:text-emerald-400 text-sm mt-0.5">
                {formatBRL(focusedCardSummary.limitUsageInfo.availableLimit)}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
              <p className="text-slate-500">Pago na fatura</p>
              <p className="font-mono tabular-nums font-bold text-emerald-700 dark:text-emerald-400 text-sm mt-0.5">
                {formatBRL(focusedCardSummary.currentInv.paidAmount)}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
              <p className="text-slate-500">Restante / Estornos</p>
              <p className="font-mono tabular-nums font-bold text-slate-900 dark:text-slate-100 text-sm mt-0.5">
                {formatBRL(focusedCardSummary.currentInv.remainingAmount)}
                {focusedCardSummary.currentInv.refundsTotal > 0 && (
                  <span className="text-[11px] font-normal text-emerald-600 block">
                    Estornos: −{formatBRL(focusedCardSummary.currentInv.refundsTotal)}
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Próximas 6 Faturas do Cartão */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <CalendarClock className="w-3.5 h-3.5" />
              Próximas faturas de {focusedCardSummary.card.name}
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
              {focusedUpcomingInvoices.map(({ monthKey, label, inv }) => {
                const st = getInvoiceStatusStyle(inv.status);
                return (
                  <button
                    key={monthKey}
                    type="button"
                    onClick={() => setSelectedMonth(monthKey)}
                    className={`p-2.5 rounded-lg border text-left transition-colors cursor-pointer ${
                      monthKey === selectedMonth
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[11px] font-semibold">{label}</span>
                      <span
                        className={`px-1 py-0.5 text-[9px] font-semibold rounded border ${
                          monthKey === selectedMonth ? 'bg-white/15 text-white border-white/20' : st.badge
                        }`}
                      >
                        {st.label}
                      </span>
                    </div>
                    <p className="font-mono tabular-nums font-bold text-xs mt-1">{formatBRL(inv.total)}</p>
                    <p
                      className={`text-[10px] mt-0.5 ${
                        monthKey === selectedMonth ? 'text-slate-300' : 'text-slate-400'
                      }`}
                    >
                      Vence {formatDateBR(inv.dueDateISO)}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Parcelamentos ativos do cartão */}
          {focusedCardSummary.cardActiveInstallments.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5" />
                Parcelamentos ativos neste cartão ({focusedCardSummary.cardActiveInstallments.length})
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {focusedCardSummary.cardActiveInstallments.map(({ inst, summary }) => (
                  <div
                    key={inst.id}
                    className="p-3 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 dark:text-slate-100 truncate">{inst.description}</p>
                      <p className="text-slate-500">
                        Restam {summary.remainingInstallments}/{inst.installmentsCount}x de{' '}
                        {formatBRL(summary.installmentValue)}
                        {summary.nextDueDateISO ? ` · Próx. ${formatDateBR(summary.nextDueDateISO)}` : ''}
                      </p>
                    </div>
                    <span className="font-mono tabular-nums font-bold text-slate-900 dark:text-slate-100 shrink-0">
                      {formatBRL(summary.remainingAmount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Gráfico 12 meses */}
      {cards.length > 0 && (
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4 min-w-0">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Faturas atuais e futuras (12 meses)</h2>
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

      {/* Histórico de Utilização, Pagamentos e Estornos */}
      {cards.length > 0 && (
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Histórico da fatura de {formatMonthFull(selectedMonth)}
              </h2>
              <p className="text-xs text-slate-500">
                {selectedCardId === 'ALL'
                  ? 'Compras, parcelas, fixos, estornos e pagamentos registrados. Clique em um cartão acima para filtrar.'
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
            <p className="p-8 text-center text-sm text-slate-500">Nenhuma movimentação lançada nesta fatura.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {activeDetails.map((item) => (
                <div key={item.id} className="px-5 py-3 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{item.title}</p>
                    <p className="text-xs text-slate-500">
                      {item.cardName} · {item.badge} · {item.person} · {formatDateBR(item.date)}
                    </p>
                  </div>
                  <span
                    className={`text-sm font-semibold font-mono tabular-nums shrink-0 ${
                      item.kind === 'charge'
                        ? 'text-red-600'
                        : 'text-emerald-700 dark:text-emerald-400'
                    }`}
                  >
                    {item.kind === 'charge' ? formatBRL(item.amount) : `−${formatBRL(item.amount)}`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Modal Configurar Cartão */}
      {modalOpen && (
        <ModalPortal>
          <div
            className="duofin-backdrop-enter fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 pt-3 px-3 pb-6 sm:pt-8 sm:px-4 overflow-y-auto"
            onClick={() => setModalOpen(false)}
          >
            <div
              className="duofin-dialog-enter bg-white dark:bg-slate-900 w-full sm:max-w-md rounded-2xl border border-slate-200 dark:border-slate-700 max-h-[88dvh] overflow-y-auto shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
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
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Nome do cartão</label>
                  <input
                    type="text"
                    required
                    maxLength={60}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex.: Nubank, Itaú Black"
                    className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950"
                  />
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 leading-snug">
                    Coloque um apelido simples para achar o cartão rápido ao lançar uma compra.
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Quem usa (Responsável)</label>
                    <select
                      value={holder}
                      onChange={(e) => setHolder(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950"
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
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Limite total (R$)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={limit}
                      onChange={(e) => setLimit(e.target.value)}
                      placeholder="5000,00"
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950"
                    />
                    <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 leading-snug">
                      Limite máximo do cartão no banco. Se não quiser acompanhar limite, deixe 0.
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Dia que a fatura fecha</label>
                    <input
                      type="number"
                      required
                      min="1"
                      max="31"
                      value={closingDay}
                      onChange={(e) => setClosingDay(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950"
                    />
                    <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 leading-snug">
                      Compras feitas nesse dia ou depois vão para a fatura do mês seguinte.
                    </p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Dia de vencimento da fatura</label>
                    <input
                      type="number"
                      required
                      min="1"
                      max="31"
                      value={dueDay}
                      onChange={(e) => setDueDay(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950"
                    />
                    <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 leading-snug">
                      Dia do mês em que a fatura vence para pagamento e entra nos lembretes.
                    </p>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Regra de limite do emissor (compras parceladas)
                  </label>
                  <select
                    value={limitRule}
                    onChange={(e) => setLimitRule(e.target.value as CardLimitRule)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950"
                  >
                    <option value="total_parcelamento">Padrão Brasil — Compromete o total do parcelamento</option>
                    <option value="parcela_mensal">Por parcela — Compromete apenas a parcela do ciclo</option>
                  </select>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 leading-snug">
                    No padrão dos bancos, uma compra de R$ 1.200 em 10x ocupa R$ 1.200 do limite até as parcelas serem pagas.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">Cor de identificação</label>
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
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
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

      {/* Modal Pagamento de Fatura (Integral ou Parcial) */}
      {paymentModal && (
        <ModalPortal>
          <div
            className="duofin-backdrop-enter fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 pt-3 px-3 pb-6 sm:pt-8 sm:px-4 overflow-y-auto"
            onClick={() => setPaymentModal(null)}
          >
            <div
              className="duofin-dialog-enter bg-white dark:bg-slate-900 w-full sm:max-w-md rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    {paymentModal.mode === 'full' ? 'Quitar fatura integralmente' : 'Registrar pagamento parcial'}
                  </h3>
                </div>
                <button type="button" onClick={() => setPaymentModal(null)} className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleConfirmPayment} className="p-5 space-y-4">
                {paymentErr && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">{paymentErr}</div>
                )}
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs space-y-1">
                  <p className="font-semibold text-slate-900 dark:text-slate-100">
                    {paymentModal.card.name} · {formatMonthFull(selectedMonth)}
                  </p>
                  <p className="text-slate-500">
                    Saldo restante da fatura: <strong className="font-mono tabular-nums">{formatBRL(paymentModal.remaining)}</strong>
                  </p>
                  <p className="text-[11px] text-slate-400">
                    O pagamento da fatura libera seu limite proporcionalmente sem contabilizar as compras duas vezes nas despesas.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Valor pago (R$)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      max={paymentModal.remaining}
                      required
                      disabled={paymentModal.mode === 'full'}
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 disabled:opacity-70"
                    />
                    <p className="text-[11px] text-slate-400 mt-1">
                      {paymentModal.mode === 'partial'
                        ? 'Fatura ficará como Parcialmente paga com saldo atualizado.'
                        : 'Quita o restante integral e encerra a obrigação.'}
                    </p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Data do pagamento</label>
                    <input
                      type="date"
                      required
                      value={paymentDate}
                      onChange={(e) => setPaymentDate(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Conta de origem</label>
                  <select
                    value={paymentAccount}
                    onChange={(e) => setPaymentAccount(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950"
                  >
                    {(household.accounts.length > 0 ? household.accounts : ['Conta principal']).map((acc) => (
                      <option key={acc} value={acc}>
                        {acc}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <button type="button" onClick={() => setPaymentModal(null)} className="px-4 py-2 text-sm text-slate-600 cursor-pointer">
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={paymentBusy}
                    className="px-5 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-60 cursor-pointer"
                  >
                    {paymentBusy ? 'Registrando...' : 'Confirmar pagamento'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* Modal Estorno / Reembolso no Cartão */}
      {refundModalCard && (
        <ModalPortal>
          <div
            className="duofin-backdrop-enter fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 pt-3 px-3 pb-6 sm:pt-8 sm:px-4 overflow-y-auto"
            onClick={() => setRefundModalCard(null)}
          >
            <div
              className="duofin-dialog-enter bg-white dark:bg-slate-900 w-full sm:max-w-md rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    Registrar estorno · {refundModalCard.name}
                  </h3>
                </div>
                <button type="button" onClick={() => setRefundModalCard(null)} className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleConfirmRefund} className="p-5 space-y-4">
                {refundErr && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">{refundErr}</div>
                )}
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Descrição do estorno</label>
                  <input
                    type="text"
                    required
                    maxLength={120}
                    value={refundDesc}
                    onChange={(e) => setRefundDesc(e.target.value)}
                    placeholder="Ex.: Devolução compra loja X"
                    className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    O estorno fica rastreável na fatura e abate o saldo devedor e o limite utilizado.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Valor estornado (R$)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      value={refundAmount}
                      onChange={(e) => setRefundAmount(e.target.value)}
                      placeholder="0,00"
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Data do estorno</label>
                    <input
                      type="date"
                      required
                      value={refundDate}
                      onChange={(e) => setRefundDate(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950"
                    />
                    <p className="text-[11px] text-slate-400 mt-1">
                      Respeita o dia de fechamento ({refundModalCard.closingDay}) para alocar na fatura certa.
                    </p>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Motivo / Referência</label>
                  <input
                    type="text"
                    maxLength={200}
                    value={refundNotes}
                    onChange={(e) => setRefundNotes(e.target.value)}
                    placeholder="Protocolo ou detalhe opcional"
                    className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <button type="button" onClick={() => setRefundModalCard(null)} className="px-4 py-2 text-sm text-slate-600 cursor-pointer">
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={refundBusy}
                    className="px-5 py-2 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-800 disabled:opacity-60 cursor-pointer"
                  >
                    {refundBusy ? 'Lançando...' : 'Salvar estorno'}
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
