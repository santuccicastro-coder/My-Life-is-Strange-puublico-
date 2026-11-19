import React, { useMemo, useState } from 'react';
import {
  Ban,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  FastForward,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { useFinance } from '../context/AuthHouseholdContext';
import type { Installment } from '../types/finance';
import { ModalPortal } from '../components/ModalPortal';
import {
  computeInstallmentSummary,
  formatBRL,
  formatDateBR,
  formatMonthShort,
  getCurrentMonthKey,
  getHouseholdPeople,
  getInstallmentAmountInMonth,
  getInstallmentSchedule,
  getMonthKeysFromStart,
  getTodayISO,
} from '../utils/financeCalculations';

export function InstallmentsPage({ embedded = false }: { embedded?: boolean }) {
  const {
    household,
    cards,
    installments,
    currentPartnerName,
    saveInstallment,
    toggleInstallmentPayment,
    anticipateInstallments,
    cancelOrRefundInstallment,
    deleteInstallment,
  } = useFinance();

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Installment | null>(null);

  const [description, setDescription] = useState('');
  const [cardId, setCardId] = useState('');
  const [cardName, setCardName] = useState('');
  const [person, setPerson] = useState(currentPartnerName);
  const [category, setCategory] = useState('Compras da casa');
  const [totalAmount, setTotalAmount] = useState('');
  const [installmentsCount, setInstallmentsCount] = useState('10');
  const [firstChargeDate, setFirstChargeDate] = useState(getTodayISO());
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Modal Antecipação de Parcelas
  const [anticipateTarget, setAnticipateTarget] = useState<Installment | null>(null);
  const [anticipateSelected, setAnticipateSelected] = useState<number[]>([]);
  const [anticipatePayAmount, setAnticipatePayAmount] = useState('');
  const [anticipateCreateTx, setAnticipateCreateTx] = useState(true);
  const [anticipateDate, setAnticipateDate] = useState(getTodayISO());
  const [anticipateBusy, setAnticipateBusy] = useState(false);
  const [anticipateErr, setAnticipateErr] = useState('');

  // Modal Estorno / Cancelamento
  const [cancelTarget, setCancelTarget] = useState<Installment | null>(null);
  const [cancelMode, setCancelMode] = useState<'remaining' | 'full'>('remaining');
  const [cancelRefundAmount, setCancelRefundAmount] = useState('');
  const [cancelCreateRefundTx, setCancelCreateRefundTx] = useState(true);
  const [cancelDate, setCancelDate] = useState(getTodayISO());
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelErr, setCancelErr] = useState('');

  const monthKeys = useMemo(() => {
    const start = household?.periodStart ?? `${new Date().getFullYear()}-01-01`;
    return getMonthKeysFromStart(start, 12);
  }, [household]);

  const currentMonthKey = getCurrentMonthKey();

  const monthlyTotals = useMemo(() => {
    return monthKeys.map((mk) => ({
      monthKey: mk,
      label: formatMonthShort(mk),
      total: installments.reduce((s, inst) => s + getInstallmentAmountInMonth(inst, mk), 0),
    }));
  }, [monthKeys, installments]);

  const totals = useMemo(() => {
    let monthlyNow = 0;
    let remainingTotal = 0;
    let overdueTotal = 0;
    let activeCount = 0;
    for (const inst of installments) {
      monthlyNow += getInstallmentAmountInMonth(inst, currentMonthKey);
      const s = computeInstallmentSummary(inst, currentMonthKey, cards);
      remainingTotal += s.remainingAmount;
      overdueTotal += s.overdueAmount;
      if (s.remainingInstallments > 0 && s.overallStatus !== 'Cancelado') activeCount++;
    }
    return { monthlyNow, remainingTotal, overdueTotal, activeCount };
  }, [installments, currentMonthKey, cards]);

  const openNew = () => {
    setEditing(null);
    setDescription('');
    const firstCard = cards[0];
    setCardId(firstCard?.id ?? '');
    setCardName(firstCard?.name ?? 'Cartão principal');
    setPerson(currentPartnerName);
    setCategory(household?.categories.includes('Compras da casa') ? 'Compras da casa' : household?.categories[0] ?? 'Outros');
    setTotalAmount('');
    setInstallmentsCount('10');
    setFirstChargeDate(getTodayISO());
    setNotes('');
    setError('');
    setModalOpen(true);
  };

  const openEdit = (inst: Installment) => {
    setEditing(inst);
    setDescription(inst.description);
    setCardId(inst.cardId);
    setCardName(inst.cardName);
    setPerson(inst.person);
    setCategory(inst.category);
    setTotalAmount(String(inst.totalAmount));
    setInstallmentsCount(String(inst.installmentsCount));
    setFirstChargeDate(inst.firstChargeDate);
    setNotes(inst.notes);
    setError('');
    setModalOpen(true);
  };

  const openAnticipate = (inst: Installment) => {
    const sched = getInstallmentSchedule(inst, currentMonthKey, cards);
    const unpaidNums = sched.filter((s) => !s.isPaid && !s.isCancelled).map((s) => s.number);
    const lastTwo = unpaidNums.slice(-Math.min(2, unpaidNums.length));
    const unit = inst.totalAmount / Math.max(1, inst.installmentsCount);
    setAnticipateTarget(inst);
    setAnticipateSelected(lastTwo);
    setAnticipatePayAmount((lastTwo.length * unit).toFixed(2));
    setAnticipateCreateTx(true);
    setAnticipateDate(getTodayISO());
    setAnticipateErr('');
  };

  const toggleAnticipateNumber = (num: number, unitValue: number) => {
    setAnticipateSelected((prev) => {
      const next = prev.includes(num) ? prev.filter((n) => n !== num) : [...prev, num].sort((a, b) => a - b);
      setAnticipatePayAmount((next.length * unitValue).toFixed(2));
      return next;
    });
  };

  const handleConfirmAnticipate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!anticipateTarget) return;
    setAnticipateErr('');
    if (anticipateSelected.length === 0) {
      setAnticipateErr('Selecione ao menos uma parcela para antecipar.');
      return;
    }
    const amt = Number(anticipatePayAmount.replace(',', '.'));
    setAnticipateBusy(true);
    try {
      await anticipateInstallments(anticipateTarget, anticipateSelected, {
        payNowAmount: Number.isFinite(amt) && amt > 0 ? amt : undefined,
        createPaymentTx: anticipateCreateTx,
        dateISO: anticipateDate,
      });
      setAnticipateTarget(null);
    } catch (err) {
      setAnticipateErr(err instanceof Error ? err.message : 'Erro ao antecipar parcelas.');
    } finally {
      setAnticipateBusy(false);
    }
  };

  const openCancel = (inst: Installment) => {
    const summary = computeInstallmentSummary(inst, currentMonthKey, cards);
    setCancelTarget(inst);
    setCancelMode(summary.remainingInstallments > 0 ? 'remaining' : 'full');
    setCancelRefundAmount(summary.remainingAmount > 0 ? summary.remainingAmount.toFixed(2) : inst.totalAmount.toFixed(2));
    setCancelCreateRefundTx(Boolean(inst.cardId));
    setCancelDate(getTodayISO());
    setCancelErr('');
  };

  const handleConfirmCancel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancelTarget) return;
    setCancelErr('');
    const amt = Number(cancelRefundAmount.replace(',', '.'));
    setCancelBusy(true);
    try {
      await cancelOrRefundInstallment(cancelTarget, {
        mode: cancelMode,
        refundedAmount: Number.isFinite(amt) && amt >= 0 ? amt : undefined,
        createCardRefundTx: cancelCreateRefundTx,
        dateISO: cancelDate,
      });
      setCancelTarget(null);
    } catch (err) {
      setCancelErr(err instanceof Error ? err.message : 'Erro ao cancelar ou estornar parcelamento.');
    } finally {
      setCancelBusy(false);
    }
  };

  const previewInstallmentValue = useMemo(() => {
    const t = Number(totalAmount.replace(',', '.'));
    const c = Number(installmentsCount);
    if (!Number.isFinite(t) || t <= 0 || !Number.isFinite(c) || c <= 0) return 0;
    return t / Math.round(c);
  }, [totalAmount, installmentsCount]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const numTotal = Number(totalAmount.replace(',', '.'));
    const numCount = Math.round(Number(installmentsCount));
    if (!Number.isFinite(numTotal) || numTotal <= 0) {
      setError('Informe o valor total da compra.');
      return;
    }
    setSaving(true);
    try {
      await saveInstallment(
        {
          description,
          cardId,
          cardName,
          person,
          category,
          totalAmount: numTotal,
          installmentsCount: numCount,
          firstChargeDate,
          notes,
        },
        editing?.id
      );
      setModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar parcelamento.');
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
          {embedded ? (
            <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100">Compras Parceladas</h2>
          ) : (
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Parcelamentos</h1>
          )}
          <p className="text-sm text-slate-500 mt-0.5">
            Controle individual de cada parcela, vencimento real, antecipação com abatimento de faturas e estorno rastreável.
          </p>
        </div>
        <button
          type="button"
          onClick={openNew}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 cursor-pointer whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          Nova compra parcelada
        </button>
      </div>

      {/* KPIs */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-1.5">
          <span className="text-xs font-medium text-slate-500">Parcelas neste mês</span>
          <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {formatBRL(totals.monthlyNow)}
          </p>
          <p className="text-xs text-slate-500">Compromisso mensal atual</p>
        </div>
        <div className="bg-slate-900 text-white rounded-xl p-5 space-y-1.5">
          <span className="text-xs font-medium text-slate-300">Valor ainda comprometido</span>
          <p className="text-2xl font-bold font-mono tabular-nums">{formatBRL(totals.remainingTotal)}</p>
          <p className="text-xs text-slate-300">Soma das parcelas em aberto</p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-1.5">
          <span className="text-xs font-medium text-slate-500">Em atraso (não baixado)</span>
          <p className={`text-2xl font-bold font-mono tabular-nums ${totals.overdueTotal > 0 ? 'text-red-600' : 'text-emerald-700'}`}>
            {formatBRL(totals.overdueTotal)}
          </p>
          <p className="text-xs text-slate-500">Vencidas aguardando quitação</p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-1.5">
          <span className="text-xs font-medium text-slate-500">Parcelamentos ativos</span>
          <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {totals.activeCount} <span className="text-sm font-normal text-slate-400">/ {installments.length}</span>
          </p>
          <p className="text-xs text-slate-500">Compras em andamento</p>
        </div>
      </section>

      {/* Distribuição mensal (12 meses) */}
      {installments.length > 0 && (
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Distribuição nos próximos 12 meses</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-12 gap-2">
            {monthlyTotals.map((m) => {
              const isNow = m.monthKey === currentMonthKey;
              return (
                <div
                  key={m.monthKey}
                  className={`p-2.5 rounded-lg border text-center ${
                    isNow
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-800 dark:text-slate-200'
                  }`}
                >
                  <p className={`text-[11px] font-medium ${isNow ? 'text-slate-300' : 'text-slate-500'}`}>{m.label}</p>
                  <p className="text-xs font-bold font-mono tabular-nums mt-1">{formatBRL(m.total)}</p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Lista de Parcelamentos */}
      {installments.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center space-y-3">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Nenhuma compra parcelada cadastrada.</p>
          <p className="text-xs text-slate-500">
            Informe o valor total, quantidade de parcelas e data da 1ª cobrança para calcular vencimentos e limite automaticamente.
          </p>
          <button
            type="button"
            onClick={openNew}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Cadastrar parcelamento
          </button>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
          {installments.map((inst) => {
            const summary = computeInstallmentSummary(inst, currentMonthKey, cards);
            const isExpanded = expandedId === inst.id;
            const schedule = isExpanded ? getInstallmentSchedule(inst, currentMonthKey, cards) : [];

            const statusBadge =
              summary.overallStatus === 'Cancelado'
                ? 'bg-slate-200 text-slate-700 border-slate-300'
                : summary.overallStatus === 'Quitado'
                  ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                  : summary.overallStatus === 'Com atraso'
                    ? 'bg-red-100 text-red-800 border-red-200'
                    : 'bg-sky-50 text-sky-800 border-sky-200';

            return (
              <div key={inst.id} className="p-4 sm:p-5 space-y-3">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : inst.id)}
                      className="mt-0.5 p-1 text-slate-400 hover:text-slate-900 dark:hover:text-white rounded cursor-pointer"
                      aria-label="Ver cronograma de parcelas"
                    >
                      {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {inst.description}
                        </p>
                        <span className={`px-1.5 py-0.5 text-[10px] font-semibold rounded border ${statusBadge}`}>
                          {summary.overallStatus}
                        </span>
                        {summary.prepaidInstallments > 0 && (
                          <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded border bg-emerald-50 text-emerald-700 border-emerald-200">
                            {summary.prepaidInstallments} antecipada(s)
                          </span>
                        )}
                        {summary.cancelledInstallments > 0 && (
                          <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded border bg-amber-50 text-amber-800 border-amber-200">
                            Estorno: {formatBRL(summary.refundedAmount)}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500">
                        {inst.cardName} · {inst.person} · {inst.category} · Total {formatBRL(inst.totalAmount)} · Parcela atual:{' '}
                        <strong>
                          {summary.currentInstallmentNumber ?? '—'}/{inst.installmentsCount}
                        </strong>
                        {summary.nextDueDateISO ? ` · Próx. vencimento ${formatDateBR(summary.nextDueDateISO)}` : ''}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between lg:justify-end gap-4">
                    <div className="text-left lg:text-right">
                      <p className="text-xs text-slate-500">
                        {inst.installmentsCount}x de{' '}
                        <strong className="font-mono tabular-nums text-slate-900 dark:text-slate-100">
                          {formatBRL(summary.installmentValue)}
                        </strong>
                      </p>
                      <p className="text-xs text-slate-500">
                        Pagas {summary.paidInstallments}/{inst.installmentsCount} · Restam{' '}
                        <strong>{summary.remainingInstallments}</strong> ({' '}
                        <strong className="font-mono tabular-nums text-slate-900 dark:text-slate-100">
                          {formatBRL(summary.remainingAmount)}
                        </strong>
                        )
                      </p>
                      {summary.overdueInstallments > 0 && (
                        <p className="text-[11px] font-semibold text-red-600 mt-0.5">
                          {summary.overdueInstallments} vencida(s) em aberto ({formatBRL(summary.overdueAmount)})
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {summary.remainingInstallments > 0 && (
                        <button
                          type="button"
                          onClick={() => openAnticipate(inst)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg hover:bg-emerald-100 cursor-pointer"
                          title="Antecipar parcelas"
                        >
                          <FastForward className="w-3.5 h-3.5" />
                          Antecipar
                        </button>
                      )}
                      {summary.overallStatus !== 'Cancelado' && (
                        <button
                          type="button"
                          onClick={() => openCancel(inst)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 rounded-lg hover:bg-amber-100 cursor-pointer"
                          title="Cancelar ou estornar"
                        >
                          <Ban className="w-3.5 h-3.5" />
                          Estornar
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => openEdit(inst)}
                        className="p-1.5 text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                        aria-label="Editar parcelamento"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteInstallment(inst.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 cursor-pointer"
                        aria-label="Excluir parcelamento"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="pl-0 sm:pl-8 pt-2 space-y-2">
                    <p className="text-[11px] text-slate-500">
                      Clique em uma parcela para marcar ou desmarcar manualmente como paga. Parcelas vencidas nunca recebem baixa automática.
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
                      {schedule.map((item) => (
                        <button
                          key={item.number}
                          type="button"
                          disabled={item.isCancelled}
                          onClick={() => void toggleInstallmentPayment(inst, item.number)}
                          className={`p-2 rounded-lg border text-xs text-left transition-colors ${
                            item.isCancelled
                              ? 'border-slate-200 bg-slate-100 text-slate-400 line-through cursor-not-allowed'
                              : item.isPaid
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100/80 cursor-pointer'
                                : item.isOverdue
                                  ? 'border-red-300 bg-red-50 text-red-900 hover:bg-red-100/80 cursor-pointer'
                                  : item.isCurrent
                                    ? 'border-slate-900 bg-slate-900 text-white hover:bg-slate-800 cursor-pointer'
                                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 hover:bg-slate-50 cursor-pointer'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-medium">
                              {item.number}/{inst.installmentsCount}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <span>{formatMonthShort(item.monthKey)}</span>
                              {item.isPaid ? (
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              ) : (
                                <Circle className="w-3.5 h-3.5 opacity-60 shrink-0" />
                              )}
                            </span>
                          </div>
                          <p className="font-mono tabular-nums font-semibold mt-1">{formatBRL(item.amount)}</p>
                          <p
                            className={`text-[10px] mt-0.5 ${
                              item.isCurrent && !item.isPaid && !item.isCancelled ? 'text-slate-300' : 'text-slate-400'
                            }`}
                          >
                            Venc. {formatDateBR(item.dueDateISO)}
                          </p>
                          <p
                            className={`text-[10px] mt-0.5 font-medium ${
                              item.isCancelled
                                ? 'text-slate-500'
                                : item.isPrepaid
                                  ? 'text-emerald-700'
                                  : item.isPaid
                                    ? 'text-emerald-700'
                                    : item.isOverdue
                                      ? 'text-red-700'
                                      : item.isCurrent
                                        ? 'text-slate-200'
                                        : 'text-slate-500'
                            }`}
                          >
                            {item.isCancelled
                              ? 'Estornada'
                              : item.isPrepaid
                                ? 'Antecipada'
                                : item.isPaid
                                  ? 'Pago'
                                  : item.isOverdue
                                    ? 'Atrasada'
                                    : item.isCurrent
                                      ? 'Mês atual'
                                      : 'Em aberto'}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Cadastro / Edição */}
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
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  {editing ? 'Editar parcelamento' : 'Nova compra parcelada'}
                </h3>
                <button type="button" onClick={() => setModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleSubmit} className="p-5 space-y-4">
                {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">{error}</div>}
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Descrição da compra</label>
                  <input
                    type="text"
                    required
                    maxLength={120}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Ex.: Geladeira, Sofá, Notebook"
                    className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Cartão utilizado</label>
                    {cards.length > 0 ? (
                      <select
                        value={cardId || cardName}
                        onChange={(e) => {
                          const found = cards.find((c) => c.id === e.target.value);
                          if (found) {
                            setCardId(found.id);
                            setCardName(found.name);
                          } else {
                            setCardId('');
                            setCardName(e.target.value);
                          }
                        }}
                        className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950"
                      >
                        {cards.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        required
                        maxLength={60}
                        value={cardName}
                        onChange={(e) => setCardName(e.target.value)}
                        placeholder="Nome do cartão"
                        className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950"
                      />
                    )}
                    <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 leading-snug">
                      As parcelas entram direto na fatura desse cartão.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Responsável</label>
                    <select
                      value={person}
                      onChange={(e) => setPerson(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950"
                    >
                      {peopleOptions.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Valor total (R$)</label>
                    <input
                      type="number"
                      required
                      step="0.01"
                      min="0.01"
                      value={totalAmount}
                      onChange={(e) => setTotalAmount(e.target.value)}
                      placeholder="0,00"
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Parcelas</label>
                    <input
                      type="number"
                      required
                      min="1"
                      max="120"
                      value={installmentsCount}
                      onChange={(e) => setInstallmentsCount(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Mês da 1ª fatura</label>
                    <input
                      type="date"
                      required
                      value={firstChargeDate}
                      onChange={(e) => setFirstChargeDate(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950"
                    />
                  </div>
                </div>

                {previewInstallmentValue > 0 && (
                  <div className="p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg flex items-center justify-between text-xs">
                    <span className="text-slate-600 dark:text-slate-300">Valor calculado de cada parcela</span>
                    <span className="font-mono tabular-nums font-bold text-slate-900 dark:text-slate-100">
                      {formatBRL(previewInstallmentValue)}
                    </span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Categoria</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950"
                  >
                    {household.categories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Observações</label>
                  <input
                    type="text"
                    maxLength={300}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950"
                  />
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

      {/* Modal Antecipação de Parcelas */}
      {anticipateTarget && (
        <ModalPortal>
          <div
            className="duofin-backdrop-enter fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 pt-3 px-3 pb-6 sm:pt-8 sm:px-4 overflow-y-auto"
            onClick={() => setAnticipateTarget(null)}
          >
            <div
              className="duofin-dialog-enter bg-white dark:bg-slate-900 w-full sm:max-w-lg rounded-2xl border border-slate-200 dark:border-slate-700 max-h-[88dvh] overflow-y-auto shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    Antecipar parcelas · {anticipateTarget.description}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Parcelas antecipadas saem das faturas futuras e liberam seu limite na hora.
                  </p>
                </div>
                <button type="button" onClick={() => setAnticipateTarget(null)} className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleConfirmAnticipate} className="p-5 space-y-4">
                {anticipateErr && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">{anticipateErr}</div>
                )}
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Selecione as parcelas em aberto que deseja antecipar:
                  </label>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-48 overflow-y-auto p-1">
                    {getInstallmentSchedule(anticipateTarget, currentMonthKey, cards)
                      .filter((s) => !s.isPaid && !s.isCancelled)
                      .map((s) => {
                        const checked = anticipateSelected.includes(s.number);
                        return (
                          <button
                            key={s.number}
                            type="button"
                            onClick={() => toggleAnticipateNumber(s.number, s.amount)}
                            className={`p-2 rounded-lg border text-xs text-left cursor-pointer ${
                              checked
                                ? 'border-emerald-600 bg-emerald-50 text-emerald-900'
                                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'
                            }`}
                          >
                            <p className="font-semibold">
                              {s.number}/{anticipateTarget.installmentsCount} · {formatMonthShort(s.monthKey)}
                            </p>
                            <p className="font-mono tabular-nums text-[11px]">{formatBRL(s.amount)}</p>
                          </button>
                        );
                      })}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Valor pago (com eventual desconto)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={anticipatePayAmount}
                      onChange={(e) => setAnticipatePayAmount(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Data da quitação</label>
                    <input
                      type="date"
                      value={anticipateDate}
                      onChange={(e) => setAnticipateDate(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950"
                    />
                  </div>
                </div>

                <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={anticipateCreateTx}
                    onChange={(e) => setAnticipateCreateTx(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300"
                  />
                  Registrar saída correspondente nos Lançamentos de hoje (evita esquecer no caixa)
                </label>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <button type="button" onClick={() => setAnticipateTarget(null)} className="px-4 py-2 text-sm text-slate-600 cursor-pointer">
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={anticipateBusy}
                    className="px-5 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-60 cursor-pointer"
                  >
                    {anticipateBusy ? 'Processando...' : `Confirmar antecipação (${anticipateSelected.length})`}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* Modal Cancelamento / Estorno de Parcelamento */}
      {cancelTarget && (
        <ModalPortal>
          <div
            className="duofin-backdrop-enter fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 pt-3 px-3 pb-6 sm:pt-8 sm:px-4 overflow-y-auto"
            onClick={() => setCancelTarget(null)}
          >
            <div
              className="duofin-dialog-enter bg-white dark:bg-slate-900 w-full sm:max-w-md rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Estornar / cancelar · {cancelTarget.description}
                </h3>
                <button type="button" onClick={() => setCancelTarget(null)} className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleConfirmCancel} className="p-5 space-y-4">
                {cancelErr && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">{cancelErr}</div>
                )}
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Escopo do cancelamento</label>
                  <select
                    value={cancelMode}
                    onChange={(e) => {
                      const nextMode = e.target.value as 'remaining' | 'full';
                      setCancelMode(nextMode);
                      const s = computeInstallmentSummary(cancelTarget, currentMonthKey, cards);
                      setCancelRefundAmount(nextMode === 'full' ? cancelTarget.totalAmount.toFixed(2) : s.remainingAmount.toFixed(2));
                    }}
                    className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950"
                  >
                    <option value="remaining">Cancelar somente parcelas futuras/em aberto</option>
                    <option value="full">Cancelar/Estornar parcelamento inteiro</option>
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Valor do estorno (R$)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={cancelRefundAmount}
                      onChange={(e) => setCancelRefundAmount(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Data do estorno</label>
                    <input
                      type="date"
                      value={cancelDate}
                      onChange={(e) => setCancelDate(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950"
                    />
                  </div>
                </div>

                {Boolean(cancelTarget.cardId) && (
                  <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={cancelCreateRefundTx}
                      onChange={(e) => setCancelCreateRefundTx(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300"
                    />
                    Registrar estorno rastreável na fatura do cartão {cancelTarget.cardName}
                  </label>
                )}

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <button type="button" onClick={() => setCancelTarget(null)} className="px-4 py-2 text-sm text-slate-600 cursor-pointer">
                    Voltar
                  </button>
                  <button
                    type="submit"
                    disabled={cancelBusy}
                    className="px-5 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 disabled:opacity-60 cursor-pointer"
                  >
                    {cancelBusy ? 'Estornando...' : 'Confirmar estorno'}
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
