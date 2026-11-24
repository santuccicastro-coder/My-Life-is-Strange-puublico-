import React, { useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  BarChart3,
  Bell,
  CalendarClock,
  CalendarRange,
  ChevronRight,
  CreditCard,
  Home,
  IdCard,
  LogOut,
  Menu,
  Moon,
  PiggyBank,
  Plus,
  Settings,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  Sun,
  User,
  Users,
  X,
} from 'lucide-react';
import { useFinance } from '../context/AuthHouseholdContext';
import { useTheme } from '../context/ThemeContext';
import type { AppRoute, ProfileHubTab } from '../types/finance';
import {
  computePaymentReminders,
  getCurrentMonthKey,
} from '../utils/financeCalculations';
import { ModalPortal } from './ModalPortal';
import { OfflineIndicator } from './OfflineIndicator';
import { PWAInstallButton } from './PWAInstallButton';

interface AppShellProps {
  route: AppRoute;
  onNavigate: (route: AppRoute) => void;
  onOpenProfileSection?: (tab: ProfileHubTab, anchorId?: string) => void;
  onQuickAdd: () => void;
  children: React.ReactNode;
}

const SIDEBAR_GROUPS: Array<{
  title: string;
  items: Array<{ id: AppRoute; label: string; icon: React.ComponentType<{ className?: string }> }>;
}> = [
  {
    title: 'Visão & Movimentações',
    items: [
      { id: 'inicio', label: 'Início / Visão geral', icon: Home },
      { id: 'relatorios', label: 'Relatórios e Renda', icon: BarChart3 },
      { id: 'lancamentos', label: 'Lançamentos', icon: ArrowLeftRight },
    ],
  },
  {
    title: 'Planejamento',
    items: [
      { id: 'horizonte', label: 'Horizonte de gastos', icon: CalendarRange },
      { id: 'parcelamentos', label: 'Parcelamentos', icon: CalendarClock },
      { id: 'compras', label: 'Compras planejadas', icon: ShoppingBag },
      { id: 'cenarios', label: 'Cenários financeiros', icon: SlidersHorizontal },
    ],
  },
  {
    title: 'Patrimônio & Contas',
    items: [
      { id: 'cartoes', label: 'Cartões e contas', icon: CreditCard },
      { id: 'economias', label: 'Investimentos e metas', icon: PiggyBank },
      { id: 'lembretes', label: 'Lembretes e notificações', icon: Bell },
      { id: 'config', label: 'Perfil e configurações', icon: Settings },
    ],
  },
];

const ROUTE_TITLES: Record<AppRoute, string> = {
  inicio: 'Início',
  relatorios: 'Relatórios',
  renda: 'Relatórios e Renda',
  lancamentos: 'Lançamentos',
  horizonte: 'Planejamento financeiro',
  parcelamentos: 'Parcelamentos',
  compras: 'Compras planejadas',
  cenarios: 'Cenários financeiros',
  cartoes: 'Cartões e contas',
  fixos: 'Cartões e contas',
  economias: 'Investimentos e metas',
  lembretes: 'Lembretes e perfil',
  config: 'Perfil e configurações',
};

export function AppShell({
  route,
  onNavigate,
  onOpenProfileSection,
  onQuickAdd,
  children,
}: AppShellProps) {
  const { user, household, currentAuthorName, logout, transactions, recurringItems, cards, installments } = useFinance();
  const { theme, setTheme } = useTheme();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const remindersSummary = useMemo(
    () =>
      computePaymentReminders({
        monthKey: getCurrentMonthKey(),
        transactions,
        recurringItems,
        cards,
        installments,
      }).summary,
    [transactions, recurringItems, cards, installments]
  );
  const urgentCount = remindersSummary.overdueCount + remindersSummary.dueTodayCount + remindersSummary.dueSoonCount;
  const pendingCount = remindersSummary.pendingCount;
  const unreadNotificationsCount = urgentCount > 0 ? urgentCount : pendingCount;

  const isReportsActive = route === 'relatorios' || route === 'renda';
  const isTransactionsActive = route === 'lancamentos';
  const isHomeActive = route === 'inicio';
  const isCardsAccountsActive = route === 'cartoes' || route === 'fixos';
  const isInvestmentsActive = route === 'economias';

  const openProfileTab = (tab: ProfileHubTab, anchorId?: string) => {
    setDrawerOpen(false);
    if (onOpenProfileSection) {
      onOpenProfileSection(tab, anchorId);
    } else {
      onNavigate(tab === 'lembretes' ? 'lembretes' : 'config');
    }
  };

  const navigateAndClose = (next: AppRoute) => {
    setDrawerOpen(false);
    onNavigate(next);
  };

  const authorInitials = (currentAuthorName || 'U').trim().slice(0, 2).toUpperCase();

  return (
    <div className="min-h-[100dvh] w-full max-w-full overflow-x-clip bg-slate-50 dark:bg-slate-950 flex flex-col xl:flex-row">
      {/* Desktop Sidebar (>= 1280px; celulares e tablets usam barra inferior) */}
      <aside className="hidden xl:flex xl:flex-col xl:w-64 xl:fixed xl:inset-y-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 z-30">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <button
              type="button"
              onClick={() => navigateAndClose('inicio')}
              className="text-lg font-extrabold tracking-tight text-slate-900 dark:text-slate-100 cursor-pointer text-left"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              DuoFin
            </button>
            {household && (
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {household.name || currentAuthorName}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Abrir menu lateral da conta"
            title="Perfil, membros e preferências"
            className="p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <Menu className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4">
          <button
            type="button"
            onClick={onQuickAdd}
            className="w-full min-h-[42px] flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-sm font-semibold rounded-xl active:scale-[0.98] transition-all cursor-pointer whitespace-nowrap shadow-xs"
          >
            <Plus className="w-4 h-4 shrink-0" />
            Adicionar lançamento
          </button>
        </div>

        <nav className="flex-1 px-3 space-y-4 overflow-y-auto pb-4">
          {SIDEBAR_GROUPS.map((group) => (
            <div key={group.title} className="space-y-1">
              <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {group.title}
              </p>
              {group.items.map((item) => {
                const Icon = item.icon;
                const active =
                  route === item.id ||
                  (item.id === 'cartoes' && route === 'fixos') ||
                  (item.id === 'relatorios' && route === 'renda');
                const badgeCount = item.id === 'lembretes' ? unreadNotificationsCount : 0;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => navigateAndClose(item.id)}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-sm font-medium rounded-xl transition-colors cursor-pointer whitespace-nowrap ${
                      active
                        ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-semibold'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-100'
                    }`}
                  >
                    <span className="flex items-center gap-2.5 min-w-0">
                      <Icon
                        className={`w-4 h-4 shrink-0 ${
                          active ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'
                        }`}
                      />
                      <span className="truncate">{item.label}</span>
                    </span>
                    {badgeCount > 0 && (
                      <span
                        className={`px-1.5 py-0.5 text-[10px] font-bold font-mono tabular-nums rounded-md shrink-0 ${
                          urgentCount > 0
                            ? 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300'
                            : 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-200'
                        }`}
                      >
                        {badgeCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => openProfileTab('configuracoes')}
            className="flex items-center gap-2.5 min-w-0 text-left cursor-pointer hover:opacity-85"
          >
            <span className="w-8 h-8 rounded-xl bg-slate-900 dark:bg-emerald-600 text-white text-xs font-bold flex items-center justify-center shrink-0">
              {authorInitials}
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                {currentAuthorName}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                Perfil e dados
              </p>
            </div>
          </button>
          <button
            type="button"
            onClick={logout}
            title="Sair"
            aria-label="Sair"
            className="p-2 text-slate-400 hover:text-red-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 xl:pl-64 flex flex-col min-w-0 max-w-full">
        {/* Barra Superior: Esquerda Hambúrguer + DuoFin | Direita Sino de Notificações */}
        <header className="sticky top-0 z-20 w-full max-w-full bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur-sm border-b border-slate-200/80 dark:border-slate-800 px-3.5 sm:px-8 pt-[max(0.4rem,env(safe-area-inset-top))] pb-1.5 sm:py-2.5 flex items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="Abrir menu lateral"
              title="Menu lateral"
              className="w-11 h-11 -ml-1 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-colors shrink-0 cursor-pointer shadow-2xs"
            >
              <Menu className="w-5 h-5" />
            </button>

            <button
              type="button"
              onClick={() => navigateAndClose('inicio')}
              className="flex items-center gap-2 min-w-0 text-left cursor-pointer"
            >
              <span
                className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 shrink-0 whitespace-nowrap"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                DuoFin
              </span>
              <span className="hidden sm:inline text-xs font-medium text-slate-500 dark:text-slate-400 truncate">
                {ROUTE_TITLES[route] ?? 'Início'}
              </span>
            </button>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <PWAInstallButton variant="header" />

            <button
              type="button"
              onClick={onQuickAdd}
              className="hidden md:inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Novo lançamento
            </button>

            {/* Sino de Notificações no canto superior direito */}
            <button
              type="button"
              onClick={() => openProfileTab('notificacoes')}
              aria-label={
                unreadNotificationsCount > 0
                  ? `Notificações (${unreadNotificationsCount} pendentes)`
                  : 'Notificações e lembretes'
              }
              title="Notificações e lembretes"
              className={`relative w-11 h-11 sm:w-auto sm:h-10 sm:px-3 rounded-2xl border flex items-center justify-center gap-1.5 transition-colors shrink-0 cursor-pointer shadow-2xs ${
                route === 'lembretes'
                  ? 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-orange-950/60 dark:border-orange-800 dark:text-orange-200'
                  : urgentCount > 0
                    ? 'bg-white border-orange-200 text-orange-700 dark:bg-slate-900 dark:border-orange-800 dark:text-orange-300 hover:bg-orange-50'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Bell className={`w-4.5 h-4.5 ${urgentCount > 0 ? 'text-orange-600 dark:text-orange-400' : ''}`} />
              <span className="hidden sm:inline text-xs font-semibold">Notificações</span>
              {unreadNotificationsCount > 0 && (
                <span
                  aria-hidden="true"
                  className={`absolute -top-1 -right-1 sm:static min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold font-mono tabular-nums flex items-center justify-center ${
                    urgentCount > 0
                      ? 'bg-red-600 text-white'
                      : 'bg-slate-900 text-white dark:bg-emerald-600'
                  }`}
                >
                  {unreadNotificationsCount > 9 ? '9+' : unreadNotificationsCount}
                </span>
              )}
            </button>
          </div>
        </header>

        <main className="flex-1 max-w-6xl w-full min-w-0 mx-auto px-3.5 sm:px-8 py-4 sm:py-6 pb-24 xl:pb-10 overflow-x-clip">
          {children}
        </main>
      </div>

      {/* Barra Inferior Fixa para Celulares e Tablets (< 1280px): Relatórios | Lançamentos | Início | Cartões | Investir */}
      <nav
        aria-label="Navegação principal"
        className="xl:hidden fixed bottom-0 inset-x-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 z-30 pb-[max(0.25rem,env(safe-area-inset-bottom))] pt-1 shadow-[0_-4px_20px_rgba(15,23,42,0.06)]"
      >
        <div className="max-w-2xl mx-auto grid grid-cols-5 items-end">
          {/* 1. Relatórios */}
          <button
            type="button"
            onClick={() => navigateAndClose('relatorios')}
            aria-current={isReportsActive ? 'page' : undefined}
            className={`min-h-[54px] flex flex-col items-center justify-center gap-0.5 py-1 px-0.5 text-[10px] md:text-[11px] transition-all active:scale-95 cursor-pointer ${
              isReportsActive
                ? 'text-slate-900 dark:text-emerald-400 font-bold'
                : 'text-slate-500 dark:text-slate-400 font-medium'
            }`}
          >
            <BarChart3
              className={`w-4.5 h-4.5 md:w-5 md:h-5 ${
                isReportsActive ? 'text-slate-900 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'
              }`}
            />
            <span className="truncate max-w-full whitespace-nowrap">Relatórios</span>
          </button>

          {/* 2. Lançamentos */}
          <button
            type="button"
            onClick={() => navigateAndClose('lancamentos')}
            aria-current={isTransactionsActive ? 'page' : undefined}
            className={`min-h-[54px] flex flex-col items-center justify-center gap-0.5 py-1 px-0.5 text-[10px] md:text-[11px] transition-all active:scale-95 cursor-pointer ${
              isTransactionsActive
                ? 'text-slate-900 dark:text-emerald-400 font-bold'
                : 'text-slate-500 dark:text-slate-400 font-medium'
            }`}
          >
            <ArrowLeftRight
              className={`w-4.5 h-4.5 md:w-5 md:h-5 ${
                isTransactionsActive ? 'text-slate-900 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'
              }`}
            />
            <span className="truncate max-w-full whitespace-nowrap">Lançamentos</span>
          </button>

          {/* 3. Início (Tela principal / Visão geral) */}
          <button
            type="button"
            onClick={() => navigateAndClose('inicio')}
            aria-current={isHomeActive ? 'page' : undefined}
            aria-label="Início (tela principal e visão geral)"
            className="min-h-[54px] flex flex-col items-center justify-end gap-0.5 pb-1 px-0.5 text-[10px] md:text-[11px] font-bold transition-all active:scale-95 cursor-pointer"
          >
            <span
              className={`-mt-4 w-12 h-10 rounded-2xl flex items-center justify-center shadow-md border-2 border-white dark:border-slate-900 transition-colors ${
                isHomeActive
                  ? 'bg-slate-900 text-white dark:bg-emerald-600'
                  : 'bg-slate-800 text-white dark:bg-slate-700'
              }`}
            >
              <Home className="w-5 h-5" />
            </span>
            <span
              className={`truncate max-w-full whitespace-nowrap ${
                isHomeActive
                  ? 'text-slate-900 dark:text-emerald-400'
                  : 'text-slate-700 dark:text-slate-300'
              }`}
            >
              Início
            </span>
          </button>

          {/* 4. Cartões e contas */}
          <button
            type="button"
            onClick={() => navigateAndClose('cartoes')}
            aria-label="Cartões e contas"
            aria-current={isCardsAccountsActive ? 'page' : undefined}
            className={`min-h-[54px] flex flex-col items-center justify-center gap-0.5 py-1 px-0.5 text-[10px] md:text-[11px] transition-all active:scale-95 cursor-pointer ${
              isCardsAccountsActive
                ? 'text-slate-900 dark:text-emerald-400 font-bold'
                : 'text-slate-500 dark:text-slate-400 font-medium'
            }`}
          >
            <CreditCard
              className={`w-4.5 h-4.5 md:w-5 md:h-5 ${
                isCardsAccountsActive ? 'text-slate-900 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'
              }`}
            />
            <span className="truncate max-w-full whitespace-nowrap">Cartões</span>
          </button>

          {/* 5. Investimentos */}
          <button
            type="button"
            onClick={() => navigateAndClose('economias')}
            aria-current={isInvestmentsActive ? 'page' : undefined}
            className={`min-h-[54px] flex flex-col items-center justify-center gap-0.5 py-1 px-0.5 text-[10px] md:text-[11px] transition-all active:scale-95 cursor-pointer ${
              isInvestmentsActive
                ? 'text-slate-900 dark:text-emerald-400 font-bold'
                : 'text-slate-500 dark:text-slate-400 font-medium'
            }`}
          >
            <PiggyBank
              className={`w-4.5 h-4.5 md:w-5 md:h-5 ${
                isInvestmentsActive ? 'text-slate-900 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'
              }`}
            />
            <span className="truncate max-w-full whitespace-nowrap">Investir</span>
          </button>
        </div>
      </nav>

      {/* Menu Lateral (Hambúrguer Superior Esquerdo): Conta, Planejamento, Configurações, Preferências e Segurança */}
      {drawerOpen && (
        <ModalPortal>
          <div
            className="duofin-backdrop-enter fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-[2px] flex justify-start"
            onClick={() => setDrawerOpen(false)}
          >
            <aside
              aria-label="Menu lateral da conta"
              className="w-[86%] max-w-xs h-full bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col justify-between overflow-y-auto shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-5 space-y-5">
                {/* Cabeçalho do Menu Lateral */}
                <div className="flex items-start justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-11 h-11 rounded-2xl bg-slate-900 dark:bg-emerald-600 text-white text-sm font-bold flex items-center justify-center shrink-0">
                      {authorInitials}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                        {currentAuthorName}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {household?.name || 'Painel DuoFin'}
                      </p>
                      {user?.email && (
                        <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">{user.email}</p>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDrawerOpen(false)}
                    aria-label="Fechar menu lateral"
                    className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Subdivisão 1: Conta & Casa */}
                <div className="space-y-1.5">
                  <p className="px-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    Conta e Casa
                  </p>
                  <button
                    type="button"
                    onClick={() => openProfileTab('configuracoes', 'duofin-profile-section')}
                    className="w-full px-3 py-2.5 rounded-xl flex items-center justify-between gap-3 text-sm font-medium text-slate-900 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    <span className="flex items-center gap-3">
                      <User className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                      Perfil
                    </span>
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  </button>

                  <button
                    type="button"
                    onClick={() => openProfileTab('dados')}
                    className="w-full px-3 py-2.5 rounded-xl flex items-center justify-between gap-3 text-sm font-medium text-slate-900 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    <span className="flex items-center gap-3">
                      <IdCard className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                      Dados pessoais
                    </span>
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  </button>

                  <button
                    type="button"
                    onClick={() => openProfileTab('membros')}
                    className="w-full px-3 py-2.5 rounded-xl flex items-center justify-between gap-3 text-sm font-medium text-slate-900 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    <span className="flex items-center gap-3">
                      <Users className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      Membros da casa
                    </span>
                    <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                      {household?.memberUids.length ?? 1}
                    </span>
                  </button>
                </div>

                {/* Subdivisão 2: Planejamento */}
                <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <p className="px-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    Planejamento
                  </p>
                  <button
                    type="button"
                    onClick={() => navigateAndClose('horizonte')}
                    className="w-full px-3 py-2.5 rounded-xl flex items-center justify-between gap-3 text-sm font-medium text-slate-900 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    <span className="flex items-center gap-3">
                      <CalendarRange className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      Horizonte de gastos
                    </span>
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  </button>
                  <button
                    type="button"
                    onClick={() => navigateAndClose('parcelamentos')}
                    className="w-full px-3 py-2.5 rounded-xl flex items-center justify-between gap-3 text-sm font-medium text-slate-900 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    <span className="flex items-center gap-3">
                      <CalendarClock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                      Parcelamentos
                    </span>
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  </button>
                  <button
                    type="button"
                    onClick={() => navigateAndClose('compras')}
                    className="w-full px-3 py-2.5 rounded-xl flex items-center justify-between gap-3 text-sm font-medium text-slate-900 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    <span className="flex items-center gap-3">
                      <ShoppingBag className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                      Compras planejadas
                    </span>
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  </button>
                  <button
                    type="button"
                    onClick={() => navigateAndClose('cenarios')}
                    className="w-full px-3 py-2.5 rounded-xl flex items-center justify-between gap-3 text-sm font-medium text-slate-900 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    <span className="flex items-center gap-3">
                      <SlidersHorizontal className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                      Cenários financeiros
                    </span>
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  </button>
                </div>

                {/* Subdivisão 3: Ajustes & Sistema */}
                <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <p className="px-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    Ajustes e Sistema
                  </p>
                  <button
                    type="button"
                    onClick={() => openProfileTab('configuracoes')}
                    className="w-full px-3 py-2.5 rounded-xl flex items-center justify-between gap-3 text-sm font-medium text-slate-900 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    <span className="flex items-center gap-3">
                      <Settings className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                      Configurações
                    </span>
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  </button>

                  <button
                    type="button"
                    onClick={() => openProfileTab('configuracoes', 'duofin-theme-section')}
                    className="w-full px-3 py-2.5 rounded-xl flex items-center justify-between gap-3 text-sm font-medium text-slate-900 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    <span className="flex items-center gap-3">
                      <SlidersHorizontal className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                      Preferências
                    </span>
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  </button>

                  <button
                    type="button"
                    onClick={() => openProfileTab('dados', 'duofin-security-section')}
                    className="w-full px-3 py-2.5 rounded-xl flex items-center justify-between gap-3 text-sm font-medium text-slate-900 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    <span className="flex items-center gap-3">
                      <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      Segurança
                    </span>
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  </button>
                </div>

                {/* Alternância rápida de Tema dentro de Preferências */}
                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-800 space-y-2">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                    Aparência do aplicativo
                  </p>
                  <div className="grid grid-cols-2 gap-1 p-1 bg-slate-200/70 dark:bg-slate-950 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setTheme('light')}
                      className={`py-1.5 px-2.5 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer ${
                        theme === 'light'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      <Sun className="w-3.5 h-3.5" />
                      Claro
                    </button>
                    <button
                      type="button"
                      onClick={() => setTheme('dark')}
                      className={`py-1.5 px-2.5 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer ${
                        theme === 'dark'
                          ? 'bg-slate-900 text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      <Moon className="w-3.5 h-3.5" />
                      Escuro
                    </button>
                  </div>
                </div>
              </div>

              <div className="p-5 border-t border-slate-100 dark:border-slate-800 space-y-2">
                <button
                  type="button"
                  onClick={() => openProfileTab('lembretes')}
                  className="w-full px-3 py-2 rounded-xl flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <Bell className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                    Lembretes de pagamento
                  </span>
                  {unreadNotificationsCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300 font-mono tabular-nums">
                      {unreadNotificationsCount}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDrawerOpen(false);
                    logout();
                  }}
                  className="w-full px-3 py-2.5 rounded-xl flex items-center gap-2.5 text-xs font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  Sair da conta
                </button>
              </div>
            </aside>
          </div>
        </ModalPortal>
      )}

      <OfflineIndicator />
    </div>
  );
}
