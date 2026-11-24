import React, { useEffect, useMemo, useState } from 'react';
import {
  Bell,
  CheckCircle2,
  Database,
  IdCard,
  LogOut,
  Settings,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { useFinance } from '../context/AuthHouseholdContext';
import type { ProfileHubTab } from '../types/finance';
import {
  computePaymentReminders,
  formatBRL,
  formatDateBR,
  getCurrentMonthKey,
} from '../utils/financeCalculations';
import { RemindersPage } from './RemindersPage';
import { SettingsPage } from './SettingsPage';

interface ProfileHubPageProps {
  initialTab?: ProfileHubTab;
  focusAnchorId?: string | null;
}

const NOTIF_PREF_KEY = 'duofin_payment_reminders_notif_enabled';

export function ProfileHubPage({ initialTab = 'lembretes', focusAnchorId }: ProfileHubPageProps) {
  const {
    user,
    household,
    currentAuthorName,
    transactions,
    recurringItems,
    cards,
    installments,
    goals,
    plannedPurchases,
    bankAccounts,
    setPaymentReminderStatus,
    logout,
  } = useFinance();

  const [activeTab, setActiveTab] = useState<ProfileHubTab>(initialTab);
  const [notifEnabled, setNotifEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(NOTIF_PREF_KEY) === '1';
  });
  const [notifMsg, setNotifMsg] = useState('');
  const [busyReminderId, setBusyReminderId] = useState<string | null>(null);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (!focusAnchorId) return;
    const timer = window.setTimeout(() => {
      const target = document.getElementById(focusAnchorId);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 120);
    return () => window.clearTimeout(timer);
  }, [focusAnchorId, activeTab]);

  const currentMonthKey = getCurrentMonthKey();
  const reminders = useMemo(
    () =>
      computePaymentReminders({
        monthKey: currentMonthKey,
        transactions,
        recurringItems,
        cards,
        installments,
      }),
    [currentMonthKey, transactions, recurringItems, cards, installments]
  );

  const toggleBrowserNotifications = async () => {
    setNotifMsg('');
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setNotifMsg('Este navegador usa apenas notificações visuais dentro do DuoFin.');
      return;
    }
    if (notifEnabled) {
      window.localStorage.setItem(NOTIF_PREF_KEY, '0');
      setNotifEnabled(false);
      setNotifMsg('Alertas do navegador desativados.');
      return;
    }
    const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (perm === 'granted') {
      window.localStorage.setItem(NOTIF_PREF_KEY, '1');
      setNotifEnabled(true);
      setNotifMsg('Alertas ativados para vencimentos de hoje e atrasos.');
    } else {
      setNotifEnabled(false);
      setNotifMsg('Permissão bloqueada no navegador. Você continua vendo tudo no sino do app.');
    }
  };

  const handleQuickPay = async (item: (typeof reminders.items)[number]) => {
    setBusyReminderId(item.id);
    try {
      await setPaymentReminderStatus({
        status: 'Pago',
        tx: item.tx,
        recurringItem: item.recurringItem,
        card: item.card,
        monthKey: currentMonthKey,
        amount: item.amount,
        dueDate: item.dueDate,
      });
    } finally {
      setBusyReminderId(null);
    }
  };

  const normalizedView: 'lembretes' | 'notificacoes' | 'configuracoes' | 'dados' =
    activeTab === 'membros' ? 'configuracoes' : activeTab;

  return (
    <div className="space-y-5">
      {/* Abas: Lembretes | Notificações | Membros e Configurações | Dados e Segurança */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-800">
        {(
          [
            { id: 'lembretes', label: 'Lembretes', icon: Bell },
            { id: 'notificacoes', label: 'Notificações', icon: CheckCircle2 },
            { id: 'configuracoes', label: 'Configurações', icon: Settings },
            { id: 'dados', label: 'Dados e Segurança', icon: ShieldCheck },
          ] as Array<{ id: ProfileHubTab; label: string; icon: React.ComponentType<{ className?: string }> }>
        ).map((tab) => {
          const Icon = tab.icon;
          const active = normalizedView === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`min-h-[42px] px-2.5 py-2 rounded-xl text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                active
                  ? 'bg-slate-900 dark:bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {normalizedView === 'lembretes' && (
        <div key="tab-lembretes" className="duofin-tab-enter">
          <RemindersPage />
        </div>
      )}

      {normalizedView === 'notificacoes' && (
        <div key="tab-notificacoes" className="duofin-tab-enter space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-slate-200 rounded-2xl p-5">
            <div>
              <h1 className="text-xl font-bold text-slate-900">Central de Notificações</h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Avisos de vencimentos próximos, contas atrasadas e alertas no aparelho.
              </p>
            </div>
            <button
              type="button"
              onClick={toggleBrowserNotifications}
              className={`px-4 py-2 text-xs font-semibold rounded-xl border transition-colors cursor-pointer shrink-0 ${
                notifEnabled
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-white text-slate-800 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {notifEnabled ? 'Avisos do navegador ativos' : 'Ativar avisos do navegador'}
            </button>
          </div>

          {notifMsg && (
            <div className="p-3 rounded-xl bg-sky-50 border border-sky-200 text-xs text-sky-900">
              {notifMsg}
            </div>
          )}

          <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-2">
              <h2 className="text-base font-bold text-slate-900">
                Pendências em aberto ({reminders.items.filter((i) => i.status === 'Pendente').length})
              </h2>
              <button
                type="button"
                onClick={() => setActiveTab('lembretes')}
                className="text-xs font-semibold text-emerald-700 hover:underline cursor-pointer"
              >
                Abrir todos os lembretes &rsaquo;
              </button>
            </div>

            {reminders.items.filter((i) => i.status === 'Pendente').length === 0 ? (
              <div className="p-10 text-center space-y-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                <p className="text-sm font-semibold text-slate-800">Nenhuma notificação pendente!</p>
                <p className="text-xs text-slate-500">Todos os vencimentos deste mês estão em dia.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {reminders.items
                  .filter((i) => i.status === 'Pendente')
                  .map((item) => (
                    <div key={item.id} className="p-4 sm:px-5 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">{item.title}</p>
                        <p className="text-xs text-slate-500">
                          Vence em {formatDateBR(item.dueDate)} · {item.category} · {item.person}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-sm font-bold font-mono tabular-nums text-red-600">
                          {formatBRL(item.amount)}
                        </span>
                        <button
                          type="button"
                          disabled={busyReminderId === item.id}
                          onClick={() => handleQuickPay(item)}
                          className="px-3 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg cursor-pointer disabled:opacity-50"
                        >
                          {busyReminderId === item.id ? '...' : 'Pagar'}
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </section>
        </div>
      )}

      {normalizedView === 'configuracoes' && (
        <div key="tab-configuracoes" className="duofin-tab-enter">
          <SettingsPage />
        </div>
      )}

      {normalizedView === 'dados' && (
        <div key="tab-dados" id="duofin-security-section" className="duofin-tab-enter space-y-5 max-w-4xl">
          <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-2.5">
              <IdCard className="w-5 h-5 text-emerald-600 shrink-0" />
              <div>
                <h2 className="text-base font-bold text-slate-900">Dados pessoais e conta Google</h2>
                <p className="text-xs text-slate-500">
                  Identificação autenticada e painel sincronizado em nuvem.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-0.5">
                <span className="text-slate-500">Nome nos lançamentos</span>
                <p className="font-bold text-slate-900 text-sm truncate">{currentAuthorName}</p>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-0.5">
                <span className="text-slate-500">E-mail Google conectado</span>
                <p className="font-bold text-slate-900 text-sm truncate">{user?.email || 'Conta Google'}</p>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-0.5">
                <span className="text-slate-500">Painel familiar ativo</span>
                <p className="font-bold text-slate-900 text-sm truncate">{household?.name || 'DuoFin'}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={() => setActiveTab('configuracoes')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
              >
                <Users className="w-3.5 h-3.5" />
                Gerenciar membros da casa e convites
              </button>
            </div>
          </section>

          <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-2.5">
              <Database className="w-5 h-5 text-emerald-600 shrink-0" />
              <div>
                <h2 className="text-base font-bold text-slate-900">Gerenciamento de dados e segurança</h2>
                <p className="text-xs text-slate-500">
                  Resumo dos dados sincronizados no Firebase e proteção de acesso via Google.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-slate-500">Lançamentos</span>
                <p className="text-base font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                  {transactions.length}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-slate-500">Contas e cartões</span>
                <p className="text-base font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                  {bankAccounts.length + cards.length}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-slate-500">Metas e projetos</span>
                <p className="text-base font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                  {goals.length + plannedPurchases.length}
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200 text-xs text-emerald-900 flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>
                Seus registros ficam isolados por grupo familiar com regras de segurança autenticadas e cache offline automático para não perder lançamentos sem internet.
              </span>
            </div>

            <div className="pt-2 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={logout}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-xl hover:bg-red-100 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                Encerrar sessão neste aparelho
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
