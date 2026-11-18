import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  BellOff,
  CalendarClock,
  CheckCircle2,
  Clock,
  Plus,
  Search,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import { CategoryBadgeIcon } from '../utils/categoryVisuals';
import { ModalPortal } from '../components/ModalPortal';
import { useFinance } from '../context/AuthHouseholdContext';
import type { TransactionStatus } from '../types/finance';
import {
  computePaymentReminders,
  formatBRL,
  formatDateBR,
  formatMonthFull,
  formatMonthShort,
  getCurrentMonthKey,
  getHouseholdPeople,
  getMonthKeysFromStart,
  getTodayISO,
  parseSignedDecimal,
  sanitizeSignedDecimalInput,
  type PaymentReminderItem,
  type PaymentReminderUrgency,
} from '../utils/financeCalculations';

type ReminderFilter = 'all' | 'pending' | 'urgent' | 'paid';

const NOTIF_PREF_KEY = 'duofin_payment_reminders_notif_enabled';
const NOTIF_LAST_SENT_KEY = 'duofin_payment_reminders_last_notified_day';

function getUrgencyBadge(item: PaymentReminderItem): {
  label: string;
  className: string;
  icon: React.ComponentType<{ className?: string }>;
} {
  const map: Record<
    PaymentReminderUrgency,
    { label: string; className: string; icon: React.ComponentType<{ className?: string }> }
  > = {
    overdue: {
      label: item.daysDelta === -1 ? 'Atrasado 1 dia' : `Atrasado ${Math.abs(item.daysDelta)} dias`,
      className:
        'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-900',
      icon: AlertTriangle,
    },
    today: {
      label: 'Vence hoje',
      className:
        'bg-orange-50 text-orange-800 border-orange-200 dark:bg-orange-950/50 dark:text-orange-300 dark:border-orange-900',
      icon: Bell,
    },
    soon: {
      label: item.daysDelta === 1 ? 'Vence amanhã' : `Vence em ${item.daysDelta} dias`,
      className:
        'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-900',
      icon: CalendarClock,
    },
    upcoming: {
      label: `Vence em ${formatDateBR(item.dueDate)}`,
      className:
        'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
      icon: Clock,
    },
    paid: {
      label: 'Pago',
      className:
        'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900',
      icon: CheckCircle2,
    },
  };
  return map[item.urgency];
}

function getSourceLabel(sourceKind: PaymentReminderItem['sourceKind']): string {
  if (sourceKind === 'card_invoice') return 'Fatura do cartão';
  if (sourceKind === 'recurring') return 'Conta fixa';
  return 'Lançamento';
}

export function RemindersPage() {
  const {
    household,
    transactions,
    recurringItems,
    cards,
    installments,
    bankAccounts,
    currentPartnerName,
    saveTransaction,
    deleteTransaction,
    setPaymentReminderStatus,
  } = useFinance();

  const todayISO = getTodayISO();
  const currentMonthKey = getCurrentMonthKey();

  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey);
  const [filter, setFilter] = useState<ReminderFilter>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  // Notificações no navegador/aparelho
  const notificationsSupported = typeof window !== 'undefined' && 'Notification' in window;
  const [notifEnabled, setNotifEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(NOTIF_PREF_KEY) === '1';
  });
  const [notifPermission, setNotifPermission] = useState<string>(() =>
    notificationsSupported ? Notification.permission : 'unsupported'
  );

  // Modal de Novo Lembrete
  const [modalOpen, setModalOpen] = useState(false);
  const [newDesc, setNewDesc] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [newDueDate, setNewDueDate] = useState(todayISO);
  const [newCategory, setNewCategory] = useState('Contas fixas');
  const [newPerson, setNewPerson] = useState(currentPartnerName);
  const [newMethod, setNewMethod] = useState('Pix');
  const [newAccount, setNewAccount] = useState('Conta corrente');
  const [newNotes, setNewNotes] = useState('');
  const [savingNew, setSavingNew] = useState(false);
  const [modalError, setModalError] = useState('');

  const monthKeys = useMemo(() => {
    const start = household?.periodStart ?? `${new Date().getFullYear()}-01-01`;
    const base = getMonthKeysFromStart(start, 18);
    return Array.from(new Set([...base, currentMonthKey, selectedMonth])).sort();
  }, [household, currentMonthKey, selectedMonth]);

  const reminders = useMemo(
    () =>
      computePaymentReminders({
        monthKey: selectedMonth,
        todayISO,
        transactions,
        recurringItems,
        cards,
        installments,
      }),
    [selectedMonth, todayISO, transactions, recurringItems, cards, installments]
  );

  const filteredItems = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return reminders.items.filter((item) => {
      if (filter === 'pending' && item.status !== 'Pendente') return false;
      if (filter === 'paid' && item.status !== 'Pago') return false;
      if (
        filter === 'urgent' &&
        item.urgency !== 'overdue' &&
        item.urgency !== 'today' &&
        item.urgency !== 'soon'
      ) {
        return false;
      }
      if (q) {
        const hay = `${item.title} ${item.category} ${item.person} ${item.accountOrCard}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [reminders.items, filter, searchTerm]);

  // Disparo seguro de notificação diária do navegador quando autorizado pelo usuário
  useEffect(() => {
    if (!notificationsSupported || !notifEnabled || notifPermission !== 'granted') return;
    if (reminders.summary.overdueCount === 0 && reminders.summary.dueTodayCount === 0) return;

    const alreadyNotified = window.localStorage.getItem(NOTIF_LAST_SENT_KEY);
    if (alreadyNotified === todayISO) return;

    const count = reminders.summary.overdueCount + reminders.summary.dueTodayCount;
    const total = reminders.summary.overdueAmount + reminders.summary.dueTodayAmount;
    try {
      new Notification('DuoFin · Lembretes de Pagamento', {
        body: `Você tem ${count} conta(s) para pagar (${formatBRL(total)}). Toque para marcar Pago ou Não pago.`,
        tag: `duofin-reminders-${todayISO}`,
      });
      window.localStorage.setItem(NOTIF_LAST_SENT_KEY, todayISO);
    } catch {
      // Alguns navegadores mobile exigem Service Worker para Notification constructor
    }
  }, [notificationsSupported, notifEnabled, notifPermission, reminders.summary, todayISO]);

  const handleToggleBrowserNotifications = async () => {
    setActionFeedback(null);
    if (!notificationsSupported) {
      setActionFeedback('Seu navegador atual não suporta notificações de sistema, mas os alertas continuam visíveis aqui no app.');
      return;
    }

    if (notifEnabled) {
      window.localStorage.setItem(NOTIF_PREF_KEY, '0');
      setNotifEnabled(false);
      setActionFeedback('Alertas no navegador desativados.');
      return;
    }

    try {
      const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
      setNotifPermission(perm);
      if (perm === 'granted') {
        window.localStorage.setItem(NOTIF_PREF_KEY, '1');
        setNotifEnabled(true);
        setActionFeedback('Alertas ativados! Quando houver contas vencendo ou atrasadas, você será avisado.');
        try {
          new Notification('DuoFin · Lembretes ativados', {
            body:
              reminders.summary.urgentCount > 0
                ? `${reminders.summary.urgentCount} lembrete(s) exigem sua atenção neste mês.`
                : 'Seus lembretes de pagamento estão monitorados.',
          });
        } catch {
          // Ignora silenciosamente quando o runtime mobile usa apenas notificações via app
        }
      } else {
        setNotifEnabled(false);
        setActionFeedback('Permissão de notificação bloqueada no navegador. Você pode ver todos os alertas diretamente nesta aba.');
      }
    } catch {
      setActionFeedback('Não foi possível solicitar permissão de notificação neste dispositivo.');
    }
  };

  const handleSetStatus = async (item: PaymentReminderItem, status: TransactionStatus) => {
    setActionFeedback(null);
    setBusyId(item.id);
    try {
      await setPaymentReminderStatus({
        status,
        tx: item.tx,
        recurringItem: item.recurringItem,
        card: item.card,
        monthKey: selectedMonth,
        amount: item.amount,
        dueDate: item.dueDate,
      });
    } catch (err) {
      setActionFeedback(err instanceof Error ? err.message : 'Erro ao atualizar status do pagamento.');
    } finally {
      setBusyId(null);
    }
  };

  const openNewReminderModal = () => {
    setNewDesc('');
    setNewAmount('');
    setNewDueDate(selectedMonth === currentMonthKey ? todayISO : `${selectedMonth}-10`);
    setNewCategory(
      household?.categories.includes('Contas fixas')
        ? 'Contas fixas'
        : household?.categories[0] ?? 'Outros'
    );
    setNewPerson(currentPartnerName);
    setNewMethod(household?.paymentMethods.find((m) => m !== 'Crédito') ?? 'Pix');
    const firstActiveAccount = bankAccounts.find((a) => a.active)?.name ?? household?.accounts[0] ?? 'Conta corrente';
    setNewAccount(firstActiveAccount);
    setNewNotes('');
    setModalError('');
    setModalOpen(true);
  };

  const handleCreateReminder = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError('');
    const parsed = parseSignedDecimal(newAmount);
    const amount = Number.isFinite(parsed) ? Math.abs(parsed) : 0;
    if (!newDesc.trim()) {
      setModalError('Informe o que você precisa pagar.');
      return;
    }
    if (amount <= 0) {
      setModalError('Informe um valor maior que zero.');
      return;
    }

    setSavingNew(true);
    try {
      await saveTransaction({
        type: 'Saída',
        description: newDesc.trim(),
        plannedAmount: amount,
        actualAmount: amount,
        category: newCategory,
        person: newPerson,
        date: newDueDate,
        paymentMethod: newMethod,
        accountOrCard: newAccount,
        cardId: '',
        status: 'Pendente',
        dueDate: newDueDate,
        notes: newNotes.trim(),
      });
      setModalOpen(false);
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Não foi possível salvar o lembrete.');
    } finally {
      setSavingNew(false);
    }
  };

  if (!household) return null;

  const peopleOptions = getHouseholdPeople(household);
  const accountOptions = Array.from(
    new Set([
      ...bankAccounts.filter((a) => a.active).map((a) => a.name),
      ...household.accounts,
      'Conta corrente',
    ])
  );

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Lembretes de Pagamento
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Acompanhe contas vencidas, contas fixas e faturas do mês e confirme se está Pago ou Não pago.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            aria-label="Mês de referência"
            className="px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 font-medium text-slate-800 dark:text-slate-100"
          >
            {monthKeys.map((mk) => (
              <option key={mk} value={mk}>
                {formatMonthFull(mk)}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={handleToggleBrowserNotifications}
            className={`min-h-[40px] inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg border transition-colors cursor-pointer whitespace-nowrap ${
              notifEnabled && notifPermission === 'granted'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/50 dark:border-emerald-800 dark:text-emerald-300'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
            }`}
          >
            {notifEnabled && notifPermission === 'granted' ? (
              <>
                <Bell className="w-3.5 h-3.5 text-emerald-600" />
                Avisos ativos
              </>
            ) : (
              <>
                <BellOff className="w-3.5 h-3.5 text-slate-400" />
                Ativar avisos
              </>
            )}
          </button>

          <button
            type="button"
            onClick={openNewReminderModal}
            className="min-h-[40px] inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            Novo lembrete
          </button>
        </div>
      </div>

      {actionFeedback && (
        <div className="p-3.5 rounded-xl bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-900 text-xs text-sky-900 dark:text-sky-200 flex items-center justify-between gap-3">
          <span>{actionFeedback}</span>
          <button
            type="button"
            onClick={() => setActionFeedback(null)}
            className="p-1 text-sky-600 hover:text-sky-900 cursor-pointer"
            aria-label="Fechar aviso"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Faixa de Notificação de Coisas a Pagar */}
      {reminders.alertItems.length > 0 && (
        <section
          aria-live="polite"
          className="rounded-xl border border-orange-200 dark:border-orange-900 bg-orange-50/90 dark:bg-orange-950/35 p-4 space-y-2.5"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-orange-100 dark:bg-orange-900/60 text-orange-700 dark:text-orange-300 flex items-center justify-center shrink-0">
                <Bell className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-orange-950 dark:text-orange-100">
                  Atenção: você tem {reminders.alertItems.length} pagamento(s) vencido(s) ou próximo(s) do vencimento
                </h2>
                <p className="text-xs text-orange-800 dark:text-orange-300 mt-0.5">
                  {reminders.summary.overdueCount > 0 && (
                    <span className="font-semibold">
                      {reminders.summary.overdueCount} atrasado(s) ({formatBRL(reminders.summary.overdueAmount)})
                    </span>
                  )}
                  {reminders.summary.overdueCount > 0 && reminders.summary.dueTodayCount > 0 && ' · '}
                  {reminders.summary.dueTodayCount > 0 && (
                    <span className="font-semibold">
                      {reminders.summary.dueTodayCount} vence(m) hoje ({formatBRL(reminders.summary.dueTodayAmount)})
                    </span>
                  )}
                  {(reminders.summary.overdueCount > 0 || reminders.summary.dueTodayCount > 0) &&
                    reminders.summary.dueSoonCount > 0 &&
                    ' · '}
                  {reminders.summary.dueSoonCount > 0 && (
                    <span>
                      {reminders.summary.dueSoonCount} vence(m) em até 3 dias (
                      {formatBRL(reminders.summary.dueSoonAmount)})
                    </span>
                  )}
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            {reminders.alertItems.slice(0, 4).map((alert) => (
              <button
                key={alert.id}
                type="button"
                disabled={busyId === alert.id}
                onClick={() => handleSetStatus(alert, 'Pago')}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-orange-200 dark:border-orange-800 text-xs text-slate-900 dark:text-slate-100 hover:bg-emerald-50 hover:border-emerald-300 transition-colors cursor-pointer"
              >
                <span className="font-medium truncate max-w-[160px]">{alert.title}</span>
                <span className="font-mono tabular-nums font-bold text-orange-700 dark:text-orange-300">
                  {formatBRL(alert.amount)}
                </span>
                <span className="text-[11px] font-semibold text-emerald-700">· Marcar Pago</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* KPIs */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900 text-white rounded-xl p-5 space-y-1.5">
          <span className="text-xs font-medium text-slate-300">
            A pagar em {formatMonthShort(selectedMonth)}
          </span>
          <p className="text-2xl font-bold font-mono tabular-nums text-amber-300">
            {formatBRL(reminders.summary.pendingAmount)}
          </p>
          <p className="text-xs text-slate-300 font-mono tabular-nums">
            {reminders.summary.pendingCount} lembrete(s) como Não pago
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-1.5">
          <span className="text-xs font-medium text-slate-500">Atrasados e vencendo hoje</span>
          <p
            className={`text-2xl font-bold font-mono tabular-nums ${
              reminders.summary.overdueCount + reminders.summary.dueTodayCount > 0
                ? 'text-red-600'
                : 'text-emerald-700'
            }`}
          >
            {formatBRL(reminders.summary.overdueAmount + reminders.summary.dueTodayAmount)}
          </p>
          <p className="text-xs text-slate-500 font-mono tabular-nums">
            {reminders.summary.overdueCount} atrasado(s) · {reminders.summary.dueTodayCount} hoje
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-1.5">
          <span className="text-xs font-medium text-slate-500">Confirmados como Pago</span>
          <p className="text-2xl font-bold font-mono tabular-nums text-emerald-700">
            {formatBRL(reminders.summary.paidAmount)}
          </p>
          <p className="text-xs text-slate-500 font-mono tabular-nums">
            {reminders.summary.paidCount} de {reminders.summary.totalCount} pagamento(s)
          </p>
        </div>
      </section>

      {/* Filtros e Busca */}
      <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-1.5">
          {(
            [
              { id: 'all', label: `Todos (${reminders.summary.totalCount})` },
              { id: 'pending', label: `Não pagos (${reminders.summary.pendingCount})` },
              { id: 'urgent', label: `Urgentes (${reminders.summary.urgentCount})` },
              { id: 'paid', label: `Pagos (${reminders.summary.paidCount})` },
            ] as Array<{ id: ReminderFilter; label: string }>
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={`min-h-[38px] px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors cursor-pointer whitespace-nowrap ${
                filter === tab.id
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar conta ou fatura..."
            className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
          />
        </div>
      </section>

      {/* Lista de Lembretes com Botões "Pago" e "Não pago" */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        {filteredItems.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <Bell className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
              {reminders.items.length === 0
                ? `Nenhuma conta a pagar encontrada em ${formatMonthFull(selectedMonth)}.`
                : 'Nenhum lembrete corresponde ao filtro selecionado.'}
            </p>
            <p className="text-xs text-slate-500">
              Crie um lembrete rápido ou cadastre contas fixas e faturas para ser notificado automaticamente.
            </p>
            <button
              type="button"
              onClick={openNewReminderModal}
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Adicionar lembrete
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {filteredItems.map((item) => {
              const badge = getUrgencyBadge(item);
              const BadgeIcon = badge.icon;
              const isPaid = item.status === 'Pago';
              const isUnpaid = item.status === 'Pendente';
              const isBusy = busyId === item.id;

              return (
                <div
                  key={item.id}
                  className={`p-4 sm:px-5 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors ${
                    item.urgency === 'overdue'
                      ? 'bg-red-50/40 dark:bg-red-950/15'
                      : item.urgency === 'today'
                        ? 'bg-orange-50/40 dark:bg-orange-950/15'
                        : isPaid
                          ? 'bg-slate-50/50 dark:bg-slate-900/40'
                          : ''
                  }`}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <CategoryBadgeIcon category={item.category} type="Saída" size="md" />
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p
                          className={`text-sm font-semibold truncate ${
                            isPaid
                              ? 'text-slate-500 line-through'
                              : 'text-slate-900 dark:text-slate-100'
                          }`}
                        >
                          {item.title}
                        </p>
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded border ${badge.className}`}
                        >
                          <BadgeIcon className="w-3 h-3 shrink-0" />
                          {badge.label}
                        </span>
                      </div>

                      <p className="text-xs text-slate-500">
                        {getSourceLabel(item.sourceKind)} · {item.category} · {item.person} · Vencimento{' '}
                        <span className="font-mono tabular-nums font-medium text-slate-700 dark:text-slate-300">
                          {formatDateBR(item.dueDate)}
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between md:justify-end gap-3 shrink-0">
                    <span
                      className={`text-base font-bold font-mono tabular-nums ${
                        isPaid ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-900 dark:text-slate-100'
                      }`}
                    >
                      {formatBRL(item.amount)}
                    </span>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={isBusy}
                        aria-pressed={isPaid}
                        onClick={() => handleSetStatus(item, 'Pago')}
                        className={`min-h-[44px] flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50 ${
                          isPaid
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                            : 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-50'
                        }`}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        Pago
                      </button>

                      <button
                        type="button"
                        disabled={isBusy}
                        aria-pressed={isUnpaid}
                        onClick={() => handleSetStatus(item, 'Pendente')}
                        className={`min-h-[44px] flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50 ${
                          isUnpaid
                            ? 'bg-red-600 text-white border-red-600 shadow-xs'
                            : 'bg-white dark:bg-slate-900 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800 hover:bg-red-50'
                        }`}
                      >
                        <XCircle className="w-3.5 h-3.5 shrink-0" />
                        Não pago
                      </button>

                      {item.sourceKind === 'transaction' && item.tx && (
                        <button
                          type="button"
                          onClick={() => deleteTransaction(item.tx!.id)}
                          title="Excluir lembrete"
                          aria-label={`Excluir ${item.title}`}
                          className="min-h-[44px] min-w-[40px] inline-flex items-center justify-center p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Modal de Novo Lembrete de Pagamento */}
      {modalOpen && (
        <ModalPortal>
          <div
            className="duofin-backdrop-enter fixed inset-0 z-50 flex items-start justify-center bg-slate-900/45 pt-3 px-3 pb-6 sm:pt-8 sm:px-4 overflow-y-auto"
            onClick={() => setModalOpen(false)}
          >
            <div
              className="duofin-dialog-enter bg-white dark:bg-slate-900 w-full sm:max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 max-h-[88dvh] overflow-y-auto shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    Novo lembrete de pagamento
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Fica salvo como Não pago até você confirmar o pagamento.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreateReminder} className="p-5 space-y-4">
                {modalError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                    {modalError}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    O que precisa pagar?
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={120}
                    value={newDesc}
                    onChange={(e) => setNewDesc(e.target.value)}
                    placeholder="Ex.: Conta de luz, Boleto escola, IPVA..."
                    className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Valor (R$)
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      required
                      value={newAmount}
                      onChange={(e) => setNewAmount(sanitizeSignedDecimalInput(e.target.value, false))}
                      placeholder="0,00"
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Data de vencimento
                    </label>
                    <input
                      type="date"
                      required
                      value={newDueDate}
                      onChange={(e) => setNewDueDate(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Categoria
                    </label>
                    <select
                      value={newCategory}
                      onChange={(e) => setNewCategory(e.target.value)}
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
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Responsável
                    </label>
                    <select
                      value={newPerson}
                      onChange={(e) => setNewPerson(e.target.value)}
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

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Forma de pagamento
                    </label>
                    <select
                      value={newMethod}
                      onChange={(e) => setNewMethod(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950"
                    >
                      {household.paymentMethods
                        .filter((m) => m !== 'Crédito')
                        .map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Conta
                    </label>
                    <select
                      value={newAccount}
                      onChange={(e) => setNewAccount(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950"
                    >
                      {accountOptions.map((acc) => (
                        <option key={acc} value={acc}>
                          {acc}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Observação (opcional)
                  </label>
                  <input
                    type="text"
                    maxLength={300}
                    value={newNotes}
                    onChange={(e) => setNewNotes(e.target.value)}
                    placeholder="Código de barras, número do boleto..."
                    className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="px-4 py-2 text-sm text-slate-600 cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={savingNew}
                    className="px-5 py-2 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-800 disabled:opacity-60 cursor-pointer"
                  >
                    {savingNew ? 'Salvando...' : 'Criar lembrete'}
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
