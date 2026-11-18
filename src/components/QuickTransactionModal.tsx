import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CreditCard as CardIcon, Minus, Plus, Repeat, Tag, X } from 'lucide-react';
import { useFinance } from '../context/AuthHouseholdContext';
import type { RecurringFrequency, Transaction, TransactionStatus, TransactionType } from '../types/finance';
import { ModalPortal } from './ModalPortal';
import {
  addMonthsToKey,
  computeFirstCreditInstallmentDate,
  formatBRL,
  formatMonthFull,
  formatMonthShort,
  getHouseholdPeople,
  getTodayISO,
  parseSignedDecimal,
  resolveTransactionSignAndType,
  sanitizeSignedDecimalInput,
} from '../utils/financeCalculations';

interface QuickTransactionModalProps {
  open: boolean;
  onClose: () => void;
  editingTransaction?: Transaction | null;
  defaultType?: TransactionType;
}

const CREDIT_QUICK_INSTALLMENTS = [1, 2, 3, 6, 10, 12];

export function QuickTransactionModal({
  open,
  onClose,
  editingTransaction,
  defaultType = 'Saída',
}: QuickTransactionModalProps) {
  const {
    household,
    cards,
    bankAccounts,
    currentPartnerName,
    addHouseholdCategory,
    saveTransaction,
    saveTransactionWithRecurrence,
    saveInstallment,
  } = useFinance();

  const [type, setType] = useState<TransactionType>(defaultType);
  const [description, setDescription] = useState('');
  const [actualAmount, setActualAmount] = useState('');
  const [plannedAmount, setPlannedAmount] = useState('');
  const [category, setCategory] = useState('Outros');
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [categorySaving, setCategorySaving] = useState(false);

  const [person, setPerson] = useState(currentPartnerName);
  const [date, setDate] = useState(getTodayISO());
  const [paymentMethod, setPaymentMethod] = useState('Pix');
  const [accountOrCard, setAccountOrCard] = useState('Conta corrente');
  const [status, setStatus] = useState<TransactionStatus>('Pago');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Quantidade de X (0x = Gasto Fixo constante em todos os meses, 1x = somente este mês, 2x/3x... = N meses)
  const [repeatCount, setRepeatCount] = useState<number>(1);
  const [recurringFrequency, setRecurringFrequency] = useState<RecurringFrequency>('Mensal');

  // Parcelamento automático quando Forma de Pagamento = Crédito
  const [creditInstallments, setCreditInstallments] = useState<number>(1);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [autoExpenseFromNegative, setAutoExpenseFromNegative] = useState(false);
  const amountInputRef = useRef<HTMLInputElement | null>(null);

  const handleAmountChange = (raw: string) => {
    const res = resolveTransactionSignAndType(raw, type);
    setActualAmount(res.sanitized);
    if (res.isNegative) {
      setType('Saída');
      setAutoExpenseFromNegative(true);
    } else {
      setAutoExpenseFromNegative(false);
    }
  };

  const toggleAmountSign = () => {
    const trimmed = actualAmount.trimStart();
    if (trimmed.startsWith('-')) {
      setActualAmount(trimmed.slice(1));
      setAutoExpenseFromNegative(false);
    } else {
      setActualAmount(`-${trimmed}`);
      setType('Saída');
      setAutoExpenseFromNegative(true);
    }
    amountInputRef.current?.focus();
  };

  const accountAndCardOptions = useMemo(() => {
    const activeCards = cards
      .filter((c) => c.active)
      .map((c) => ({ label: `${c.name} (Cartão)`, value: c.name, cardId: c.id }));
    const syncedAccountNames = bankAccounts.filter((a) => a.active).map((a) => a.name);
    const householdAccounts = household?.accounts ?? ['Conta corrente', 'Poupança', 'Carteira'];
    const mergedAccountNames = Array.from(new Set([...syncedAccountNames, ...householdAccounts]));
    const accounts = mergedAccountNames.map((a) => ({
      label: a,
      value: a,
      cardId: '',
    }));
    return { activeCards, accounts, all: [...activeCards, ...accounts] };
  }, [cards, bankAccounts, household]);

  useEffect(() => {
    if (!open) return;
    setError('');
    setAutoExpenseFromNegative(false);
    setRepeatCount(1);
    setRecurringFrequency('Mensal');
    setCreditInstallments(1);
    setCreatingCategory(false);
    setNewCategoryName('');

    if (editingTransaction) {
      setType(editingTransaction.type);
      setDescription(editingTransaction.description);
      setActualAmount(String(editingTransaction.actualAmount));
      setPlannedAmount(
        editingTransaction.plannedAmount !== editingTransaction.actualAmount
          ? String(editingTransaction.plannedAmount)
          : ''
      );
      setCategory(editingTransaction.category);
      setPerson(editingTransaction.person);
      setDate(editingTransaction.date);
      setPaymentMethod(editingTransaction.paymentMethod);
      setAccountOrCard(editingTransaction.accountOrCard);
      setStatus(editingTransaction.status);
      setDueDate(editingTransaction.dueDate);
      setNotes(editingTransaction.notes);
      setShowAdvanced(
        Boolean(editingTransaction.notes || editingTransaction.plannedAmount !== editingTransaction.actualAmount)
      );
    } else {
      setType(defaultType);
      setDescription('');
      setActualAmount('');
      setPlannedAmount('');
      setCategory(household?.categories[0] ?? 'Outros');
      setPerson(currentPartnerName);
      setDate(getTodayISO());
      setPaymentMethod(household?.paymentMethods[0] ?? 'Pix');
      setAccountOrCard(accountAndCardOptions.accounts[0]?.value ?? household?.accounts[0] ?? 'Conta corrente');
      setStatus('Pago');
      setDueDate('');
      setNotes('');
      setShowAdvanced(false);
    }

    const timer = window.setTimeout(() => {
      amountInputRef.current?.focus();
    }, 60);
    return () => window.clearTimeout(timer);
  }, [open, editingTransaction, defaultType, household, currentPartnerName]);

  const handlePaymentMethodChange = (nextMethod: string) => {
    setPaymentMethod(nextMethod);
    if (nextMethod === 'Crédito') {
      if (accountAndCardOptions.activeCards.length > 0) {
        const currentIsCard = accountAndCardOptions.activeCards.some((c) => c.value === accountOrCard);
        if (!currentIsCard) {
          setAccountOrCard(accountAndCardOptions.activeCards[0].value);
        }
      }
    } else {
      setCreditInstallments(1);
    }
  };

  const handleCreateCustomCategory = async () => {
    const trimmed = newCategoryName.trim();
    if (!trimmed) {
      setError('Digite um nome para a nova categoria.');
      return;
    }
    setError('');
    setCategorySaving(true);
    try {
      const created = await addHouseholdCategory(trimmed);
      setCategory(created);
      setCreatingCategory(false);
      setNewCategoryName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível criar a categoria.');
    } finally {
      setCategorySaving(false);
    }
  };

  if (!open || !household) return null;

  const peopleOptions = getHouseholdPeople(household);
  const matchedCard = cards.find((c) => c.name === accountOrCard);
  const isCreditInstallmentFlow = !editingTransaction && type === 'Saída' && paymentMethod === 'Crédito';
  const isParceladoNoCredito = isCreditInstallmentFlow && creditInstallments >= 2;

  const canRepeat = !editingTransaction && (type === 'Saída' || type === 'Entrada') && !isParceladoNoCredito;
  const isRecurring = canRepeat && repeatCount !== 1;
  const startMonthKey = date.slice(0, 7);
  const computedEndMonthKey =
    repeatCount === 0 ? '' : repeatCount >= 2 ? addMonthsToKey(startMonthKey, repeatCount - 1) : '';

  const parsedSignedPreview = parseSignedDecimal(actualAmount);
  const parsedAmountPreview = Number.isFinite(parsedSignedPreview) ? Math.abs(parsedSignedPreview) : NaN;
  const hasValidAmount = Number.isFinite(parsedAmountPreview) && parsedAmountPreview > 0;
  const firstCreditDate = computeFirstCreditInstallmentDate(date, matchedCard?.closingDay);
  const firstCreditMonthKey = firstCreditDate.slice(0, 7);
  const lastCreditMonthKey = addMonthsToKey(firstCreditMonthKey, Math.max(1, creditInstallments) - 1);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const parsedSigned = parseSignedDecimal(actualAmount);
    const parsedActual = Number.isFinite(parsedSigned) ? Math.abs(parsedSigned) : NaN;
    if (!Number.isFinite(parsedActual) || parsedActual <= 0) {
      setError('Informe um valor diferente de zero.');
      return;
    }

    const effectiveType: TransactionType = parsedSigned < 0 ? 'Saída' : type;

    setSaving(true);
    try {
      let resolvedCategory = category;
      if (creatingCategory && newCategoryName.trim()) {
        resolvedCategory = await addHouseholdCategory(newCategoryName.trim());
        setCategory(resolvedCategory);
        setCreatingCategory(false);
        setNewCategoryName('');
      }

      if (isParceladoNoCredito) {
        await saveInstallment({
          description,
          cardId: matchedCard?.id ?? '',
          cardName: matchedCard?.name ?? accountOrCard,
          person,
          category: resolvedCategory,
          totalAmount: parsedActual,
          installmentsCount: creditInstallments,
          firstChargeDate: firstCreditDate,
          notes,
        });
        onClose();
        return;
      }

      const parsedPlannedRaw = plannedAmount.trim() ? parseSignedDecimal(plannedAmount) : parsedActual;
      const parsedPlanned = Number.isFinite(parsedPlannedRaw) ? Math.abs(parsedPlannedRaw) : parsedActual;

      const payload = {
        type: effectiveType,
        description,
        plannedAmount: Number.isFinite(parsedPlanned) && parsedPlanned >= 0 ? parsedPlanned : parsedActual,
        actualAmount: parsedActual,
        category: resolvedCategory,
        person,
        date,
        paymentMethod,
        accountOrCard,
        cardId: matchedCard?.id ?? '',
        status,
        dueDate: status === 'Pendente' ? dueDate || date : dueDate,
        notes,
        recurringId: editingTransaction?.recurringId ?? '',
        recurringMonthKey: editingTransaction?.recurringMonthKey ?? '',
      };

      if (isRecurring) {
        await saveTransactionWithRecurrence(payload, {
          frequency: recurringFrequency,
          endMonthKey: computedEndMonthKey,
        });
      } else {
        await saveTransaction(payload, editingTransaction?.id);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar lançamento.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/45 backdrop-blur-[2px] pt-3 px-3 pb-6 sm:pt-8 sm:px-4 overflow-y-auto duofin-backdrop-enter"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="duofin-dialog-enter bg-white w-full max-w-full sm:max-w-lg rounded-2xl border border-slate-200 max-h-[88dvh] overflow-y-auto overflow-x-hidden shadow-xl">
        <div className="flex items-center justify-between px-4 sm:px-5 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
          <h2 className="text-base font-semibold text-slate-900">
            {editingTransaction ? 'Editar lançamento' : 'Novo lançamento'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
              {error}
            </div>
          )}

          {/* Tipo */}
          <div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 p-1 bg-slate-100 rounded-xl">
              {(['Saída', 'Entrada', 'Economia', 'Transferência'] as TransactionType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setType(t);
                    if (t !== 'Saída') {
                      setCreditInstallments(1);
                      if (actualAmount.trimStart().startsWith('-')) {
                        setActualAmount(actualAmount.trimStart().slice(1));
                      }
                      setAutoExpenseFromNegative(false);
                    }
                    if (t !== 'Saída' && t !== 'Entrada') setRepeatCount(1);
                  }}
                  className={`py-2 px-2 text-xs font-semibold rounded-lg transition-all whitespace-nowrap cursor-pointer active:scale-[0.98] ${
                    type === t
                      ? t === 'Saída'
                        ? 'bg-white text-red-600 shadow-xs'
                        : t === 'Entrada'
                          ? 'bg-white text-emerald-600 shadow-xs'
                          : 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {t === 'Saída' ? 'Despesa' : t === 'Entrada' ? 'Receita' : t}
                </button>
              ))}
            </div>
          </div>

          {/* Valor (primeiro campo com teclado numérico + botão +/- para negativo em iOS/Android) e Descrição */}
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <label
                  htmlFor="quick-tx-amount"
                  className="block text-xs font-medium text-slate-700"
                >
                  {isParceladoNoCredito ? 'Valor total da compra (R$)' : 'Valor (R$)'}
                </label>
                <span className="text-[11px] text-slate-400">Negativo = despesa automática</span>
              </div>
              <div className="flex items-stretch gap-2">
                <button
                  type="button"
                  onClick={toggleAmountSign}
                  aria-label={actualAmount.startsWith('-') ? 'Remover sinal negativo' : 'Marcar valor negativo (Despesa)'}
                  title={actualAmount.startsWith('-') ? 'Tornar positivo' : 'Inserir sinal negativo (Despesa)'}
                  className={`min-w-[46px] px-3 rounded-xl border text-sm font-bold font-mono transition-all cursor-pointer active:scale-95 flex items-center justify-center shrink-0 ${
                    actualAmount.startsWith('-')
                      ? 'bg-red-50 border-red-200 text-red-700'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {actualAmount.startsWith('-') ? '−' : '+/−'}
                </button>
                <div className="relative flex-1 min-w-0">
                  <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-base font-bold font-mono text-slate-400">
                    R$
                  </span>
                  <input
                    id="quick-tx-amount"
                    ref={amountInputRef}
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    enterKeyHint="next"
                    autoFocus
                    required
                    value={actualAmount}
                    onChange={(e) => handleAmountChange(e.target.value)}
                    placeholder="0,00"
                    className={`w-full pl-11 pr-3 py-3 text-2xl font-bold font-mono tabular-nums border rounded-xl focus:outline-none focus:ring-2 ${
                      actualAmount.startsWith('-')
                        ? 'border-red-300 text-red-700 focus:ring-red-500'
                        : 'border-slate-200 focus:ring-slate-900'
                    }`}
                  />
                </div>
              </div>
              {autoExpenseFromNegative && (
                <p className="mt-1.5 text-[11px] font-medium text-red-600 duofin-expand-enter">
                  Valor negativo identificado → categoria de lançamento alterada automaticamente para Despesa.
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="quick-tx-description"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Descrição
              </label>
              <input
                id="quick-tx-description"
                type="text"
                required
                maxLength={120}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ex.: Supermercado, Aluguel, Salário"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>
          </div>

          {/* Categoria (com criador inline) + Responsável + Data */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <div className="flex items-center justify-between gap-1 mb-1">
                <label className="block text-xs font-medium text-slate-700">Categoria</label>
                <button
                  type="button"
                  onClick={() => {
                    setCreatingCategory((v) => !v);
                    setNewCategoryName('');
                    setError('');
                  }}
                  className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 cursor-pointer"
                >
                  <Tag className="w-3 h-3" />
                  {creatingCategory ? 'Usar lista' : '+ Nova'}
                </button>
              </div>

              {creatingCategory ? (
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    maxLength={60}
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleCreateCustomCategory();
                      }
                    }}
                    placeholder="Ex.: Pets, Beleza..."
                    className="w-full min-w-0 px-2.5 py-2 text-xs border border-emerald-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                  <button
                    type="button"
                    disabled={categorySaving}
                    onClick={handleCreateCustomCategory}
                    className="px-2.5 py-2 text-xs font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 cursor-pointer shrink-0"
                  >
                    {categorySaving ? '...' : 'Criar'}
                  </button>
                </div>
              ) : (
                <select
                  value={category}
                  onChange={(e) => {
                    if (e.target.value === '__CUSTOM_CATEGORY__') {
                      setCreatingCategory(true);
                      return;
                    }
                    setCategory(e.target.value);
                  }}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                >
                  {household.categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                  <option value="__CUSTOM_CATEGORY__">+ Criar nova categoria...</option>
                </select>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Responsável</label>
              <select
                value={person}
                onChange={(e) => setPerson(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
              >
                {peopleOptions.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Data</label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>
          </div>

          {/* Forma de pagamento e Conta/Cartão */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Forma de pagamento</label>
              <select
                value={paymentMethod}
                onChange={(e) => handlePaymentMethodChange(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
              >
                {household.paymentMethods.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 leading-snug">
                No Crédito, o valor vai para a fatura do cartão conforme o fechamento.
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Conta ou cartão</label>
              <select
                value={accountOrCard}
                onChange={(e) => setAccountOrCard(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
              >
                {accountAndCardOptions.all.map((opt) => (
                  <option key={opt.label} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 leading-snug">
                Escolha o cartão usado na compra ou a conta de onde saiu o dinheiro.
              </p>
            </div>
          </div>

          {/* Seletor de Parcelas automático ao escolher Crédito */}
          {isCreditInstallmentFlow && (
            <div className="duofin-expand-enter p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="min-w-0">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-900">
                    <CardIcon className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    Parcelamento no crédito
                  </span>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {creditInstallments === 1
                      ? 'Compra à vista (1x) na fatura do cartão.'
                      : hasValidAmount
                        ? `${creditInstallments}x de ${formatBRL(parsedAmountPreview / creditInstallments)} · Faturas de ${formatMonthShort(
                            firstCreditMonthKey
                          )} até ${formatMonthShort(lastCreditMonthKey)}`
                        : `Será registrado em ${creditInstallments} meses seguidos a partir de ${formatMonthShort(
                            firstCreditMonthKey
                          )}.`}
                  </p>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    aria-label="Diminuir parcelas"
                    disabled={creditInstallments <= 1}
                    onClick={() => setCreditInstallments((n) => Math.max(1, n - 1))}
                    className="w-9 h-9 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-800 hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <select
                    aria-label="Quantidade de parcelas"
                    value={creditInstallments}
                    onChange={(e) => setCreditInstallments(Number(e.target.value))}
                    className="min-w-[96px] h-9 px-2.5 text-xs font-bold font-mono tabular-nums border border-slate-200 rounded-lg bg-white text-slate-900 text-center"
                  >
                    {Array.from({ length: 48 }, (_, idx) => idx + 1).map((n) => (
                      <option key={n} value={n}>
                        {n === 1 ? '1x (à vista)' : `${n}x`}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    aria-label="Aumentar parcelas"
                    disabled={creditInstallments >= 48}
                    onClick={() => setCreditInstallments((n) => Math.min(48, n + 1))}
                    className="w-9 h-9 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-800 hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {CREDIT_QUICK_INSTALLMENTS.map((qty) => (
                  <button
                    key={qty}
                    type="button"
                    onClick={() => setCreditInstallments(qty)}
                    className={`px-2.5 py-1 text-[11px] font-semibold rounded-md border transition-colors cursor-pointer ${
                      creditInstallments === qty
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {qty === 1 ? '1x à vista' : `${qty}x`}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Status de pagamento (ocultado quando é parcelamento em 2x+, pois vira cronograma de faturas) */}
          {!isParceladoNoCredito && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Situação do pagamento</label>
                <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg">
                  {(['Pago', 'Pendente'] as TransactionStatus[]).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setStatus(st)}
                      className={`py-1.5 px-3 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                        status === st
                          ? st === 'Pago'
                            ? 'bg-white text-emerald-700 shadow-xs'
                            : 'bg-white text-amber-700 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {st === 'Pago' ? 'Realizado' : 'Pendente'}
                    </button>
                  ))}
                </div>
              </div>

              {status === 'Pendente' && !isRecurring && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Data de vencimento</label>
                  <input
                    type="date"
                    value={dueDate || date}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
              )}
            </div>
          )}

          {/* Quantidade de X (0x = Gasto Fixo, 1x = único, 2x/3x... = meses seguintes) */}
          {canRepeat && (
            <div className="duofin-expand-enter p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="min-w-0">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-900">
                    <Repeat className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                    Repetição mensal (X)
                  </span>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {repeatCount === 0
                      ? type === 'Entrada'
                        ? `Ganho Fixo — constante em todos os meses a partir de ${formatMonthFull(startMonthKey)}.`
                        : `Gasto Fixo — constante em todos os meses a partir de ${formatMonthFull(startMonthKey)}.`
                      : repeatCount === 1
                        ? `Lançamento único em ${formatMonthFull(startMonthKey)}. Toque em − para 0x (Gasto Fixo) ou + para repetir.`
                        : `Projetado por ${repeatCount} meses: de ${formatMonthShort(startMonthKey)} até ${formatMonthShort(
                            computedEndMonthKey
                          )}.`}
                  </p>
                </div>

                <div className="flex items-center gap-1.5 shrink-0 self-start sm:self-center">
                  <button
                    type="button"
                    aria-label="Diminuir quantidade de meses"
                    disabled={repeatCount <= 0}
                    onClick={() => setRepeatCount((c) => Math.max(0, c - 1))}
                    className="w-9 h-9 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-800 hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <div
                    className={`min-w-[126px] h-9 px-3 inline-flex items-center justify-center rounded-lg border text-xs font-bold tabular-nums ${
                      repeatCount === 0
                        ? 'bg-amber-50 border-amber-200 text-amber-800'
                        : repeatCount === 1
                          ? 'bg-white border-slate-200 text-slate-700'
                          : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    }`}
                  >
                    {repeatCount === 0
                      ? type === 'Entrada'
                        ? '0x · Ganho Fixo'
                        : '0x · Gasto Fixo'
                      : repeatCount === 1
                        ? '1x · Único'
                        : `${repeatCount}x (${repeatCount} meses)`}
                  </div>
                  <button
                    type="button"
                    aria-label="Aumentar quantidade de meses"
                    disabled={repeatCount >= 120}
                    onClick={() => setRepeatCount((c) => Math.min(120, c + 1))}
                    className="w-9 h-9 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-800 hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {repeatCount !== 1 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200/80 items-center">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Frequência da projeção</label>
                    <select
                      value={recurringFrequency}
                      onChange={(e) => setRecurringFrequency(e.target.value as RecurringFrequency)}
                      className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white"
                    >
                      <option value="Mensal">Mensal</option>
                      <option value="Quinzenal">Quinzenal</option>
                      <option value="Semanal">Semanal</option>
                      <option value="Anual">Anual</option>
                    </select>
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {repeatCount === 0
                      ? 'Permanece ativo todos os meses até você pausar em Contas Fixas.'
                      : `Encerra automaticamente após ${formatMonthFull(computedEndMonthKey)}.`}
                  </div>
                </div>
              )}
            </div>
          )}

          {paymentMethod === 'Crédito' && matchedCard && Number(date.slice(8, 10)) >= matchedCard.closingDay && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Como o cartão {matchedCard.name} fecha dia {matchedCard.closingDay}, a 1ª cobrança entra na fatura de{' '}
              <strong>{formatMonthShort(firstCreditMonthKey)}</strong>.
            </p>
          )}

          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="text-xs font-medium text-slate-500 hover:text-slate-900 cursor-pointer"
            >
              {showAdvanced ? '− Ocultar valor previsto e observações' : '+ Valor previsto e observações'}
            </button>

            {showAdvanced && (
              <div className="duofin-expand-enter mt-3 space-y-3 pt-3 border-t border-slate-100">
                {!isParceladoNoCredito && (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Valor previsto (R$) — opcional
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={plannedAmount}
                      onChange={(e) => setPlannedAmount(sanitizeSignedDecimalInput(e.target.value, false))}
                      placeholder="Igual ao realizado se vazio"
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
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
                    placeholder="Detalhes adicionais..."
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="min-h-[42px] px-5 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 disabled:opacity-60 transition-colors cursor-pointer"
            >
              {saving
                ? 'Salvando...'
                : editingTransaction
                  ? 'Salvar alterações'
                  : isParceladoNoCredito
                    ? `Registrar em ${creditInstallments}x`
                    : 'Registrar'}
            </button>
          </div>
        </form>
        </div>
      </div>
    </ModalPortal>
  );
}
