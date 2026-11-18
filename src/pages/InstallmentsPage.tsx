import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2, X } from 'lucide-react';
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
  const { household, cards, installments, currentPartnerName, saveInstallment, deleteInstallment } = useFinance();

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
    for (const inst of installments) {
      monthlyNow += getInstallmentAmountInMonth(inst, currentMonthKey);
      remainingTotal += computeInstallmentSummary(inst, currentMonthKey).remainingAmount;
    }
    return { monthlyNow, remainingTotal };
  }, [installments, currentMonthKey]);

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
            <h2 className="text-lg font-bold tracking-tight text-slate-900">Compras Parceladas</h2>
          ) : (
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Parcelamentos</h1>
          )}
          <p className="text-sm text-slate-500 mt-0.5">
            Cadastre a compra parcelada uma vez. As parcelas são distribuídas nos meses seguintes e somadas às faturas e horizonte.
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
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
          <span className="text-xs font-medium text-slate-500">Parcelas neste mês</span>
          <p className="text-2xl font-bold font-mono tabular-nums text-slate-900">{formatBRL(totals.monthlyNow)}</p>
          <p className="text-xs text-slate-500">Compromisso mensal atual</p>
        </div>
        <div className="bg-slate-900 text-white rounded-xl p-5 space-y-2">
          <span className="text-xs font-medium text-slate-300">Ainda a pagar (total futuro)</span>
          <p className="text-2xl font-bold font-mono tabular-nums">{formatBRL(totals.remainingTotal)}</p>
          <p className="text-xs text-slate-300">Soma das parcelas restantes</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
          <span className="text-xs font-medium text-slate-500">Compras cadastradas</span>
          <p className="text-2xl font-bold font-mono tabular-nums text-slate-900">{installments.length}</p>
          <p className="text-xs text-slate-500">Parcelamentos ativos e concluídos</p>
        </div>
      </section>

      {/* Distribuição mensal (12 meses) */}
      {installments.length > 0 && (
        <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <h2 className="text-base font-semibold text-slate-900">Distribuição nos próximos 12 meses</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-12 gap-2">
            {monthlyTotals.map((m) => {
              const isNow = m.monthKey === currentMonthKey;
              return (
                <div
                  key={m.monthKey}
                  className={`p-2.5 rounded-lg border text-center ${
                    isNow ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-slate-50 text-slate-800'
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
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-3">
          <p className="text-sm font-medium text-slate-700">Nenhuma compra parcelada cadastrada.</p>
          <p className="text-xs text-slate-500">Informe o valor total, quantidade de parcelas e data da 1ª cobrança para calcular automaticamente.</p>
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
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
          {installments.map((inst) => {
            const summary = computeInstallmentSummary(inst, currentMonthKey);
            const isExpanded = expandedId === inst.id;
            const schedule = isExpanded ? getInstallmentSchedule(inst, currentMonthKey) : [];

            return (
              <div key={inst.id} className="p-4 sm:p-5 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : inst.id)}
                      className="mt-0.5 p-1 text-slate-400 hover:text-slate-900 rounded cursor-pointer"
                      aria-label="Ver cronograma de parcelas"
                    >
                      {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">{inst.description}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {inst.cardName} · {inst.person} · {inst.category} · 1ª cobrança {formatDateBR(inst.firstChargeDate)} · Por {inst.createdByName}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-5">
                    <div className="text-left sm:text-right">
                      <p className="text-xs text-slate-500">
                        {inst.installmentsCount}x de{' '}
                        <strong className="font-mono tabular-nums text-slate-900">{formatBRL(summary.installmentValue)}</strong>
                      </p>
                      <p className="text-xs text-slate-500">
                        Pagas {summary.paidInstallments}/{inst.installmentsCount} · Falta{' '}
                        <strong className="font-mono tabular-nums text-slate-900">{formatBRL(summary.remainingAmount)}</strong>
                      </p>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => openEdit(inst)}
                        className="p-1.5 text-slate-400 hover:text-slate-900 rounded-lg hover:bg-slate-100 cursor-pointer"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteInstallment(inst.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="pl-0 sm:pl-8 pt-2">
                    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
                      {schedule.map((item) => (
                        <div
                          key={item.number}
                          className={`p-2 rounded-lg border text-xs ${
                            item.isCurrent
                              ? 'border-slate-900 bg-slate-900 text-white'
                              : item.isPaid
                              ? 'border-slate-100 bg-slate-50 text-slate-400'
                              : 'border-slate-200 bg-white text-slate-800'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span>
                              {item.number}/{inst.installmentsCount}
                            </span>
                            <span>{formatMonthShort(item.monthKey)}</span>
                          </div>
                          <p className="font-mono tabular-nums font-semibold mt-1">{formatBRL(item.amount)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
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
              <h3 className="text-base font-semibold text-slate-900">
                {editing ? 'Editar parcelamento' : 'Nova compra parcelada'}
              </h3>
              <button type="button" onClick={() => setModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">{error}</div>}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Descrição da compra</label>
                <input
                  type="text"
                  required
                  maxLength={120}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ex.: Geladeira, Sofá, Notebook"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Cartão utilizado</label>
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
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
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
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                    />
                  )}
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 leading-snug">
                    As parcelas entram direto na fatura desse cartão.
                  </p>
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
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 leading-snug">
                    Quem fez a compra ou divide a parcela.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Valor total (R$)</label>
                  <input
                    type="number"
                    required
                    step="0.01"
                    min="0.01"
                    value={totalAmount}
                    onChange={(e) => setTotalAmount(e.target.value)}
                    placeholder="0,00"
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg"
                  />
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 leading-snug">
                    Valor cheio da compra (não da parcela).
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Parcelas</label>
                  <input
                    type="number"
                    required
                    min="1"
                    max="120"
                    value={installmentsCount}
                    onChange={(e) => setInstallmentsCount(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg"
                  />
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 leading-snug">
                    Em quantas vezes dividiu (ex.: 10).
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Mês da 1ª fatura</label>
                  <input
                    type="date"
                    required
                    value={firstChargeDate}
                    onChange={(e) => setFirstChargeDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 leading-snug">
                    Data em que a 1ª parcela será cobrada na fatura.
                  </p>
                </div>
              </div>

              {previewInstallmentValue > 0 && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between text-xs">
                  <span className="text-slate-600">Valor calculado de cada parcela</span>
                  <span className="font-mono tabular-nums font-bold text-slate-900">
                    {formatBRL(previewInstallmentValue)}
                  </span>
                </div>
              )}

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
