import React, { useMemo, useState } from 'react';
import {
  BarChart3,
  Bell,
  CalendarRange,
  CreditCard,
  Home,
  LayoutList,
  LogOut,
  Menu,
  PiggyBank,
  Plus,
  Repeat,
  Settings,
  Sparkles,
  TrendingUp,
  X,
} from 'lucide-react';
import { useFinance } from '../context/AuthHouseholdContext';
import type { AppRoute } from '../types/finance';
import {
  computePaymentReminders,
  getCurrentMonthKey,
  getHouseholdMembersList,
} from '../utils/financeCalculations';
import { OfflineIndicator } from './OfflineIndicator';
import { PWAInstallButton } from './PWAInstallButton';
import { ModalPortal } from './ModalPortal';

interface AppShellProps {
  route: AppRoute;
  onNavigate: (route: AppRoute) => void;
  onQuickAdd: () => void;
  children: React.ReactNode;
}

const NAV_ITEMS: Array<{ id: AppRoute; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'inicio', label: 'Início', icon: Home },
  { id: 'lancamentos', label: 'Lançamentos', icon: LayoutList },
  { id: 'lembretes', label: 'Lembretes de Pagamento', icon: Bell },
  { id: 'horizonte', label: 'Horizonte de Gastos', icon: CalendarRange },
  { id: 'economias', label: 'Investimentos e Cofrinho', icon: PiggyBank },
  { id: 'cartoes', label: 'Cartões e Faturas', icon: CreditCard },
  { id: 'fixos', label: 'Contas Fixas', icon: Repeat },
  { id: 'renda', label: 'Renda', icon: TrendingUp },
  { id: 'relatorios', label: 'Painel e Relatórios', icon: BarChart3 },
  { id: 'ia', label: 'Assistente IA e Voz', icon: Sparkles },
  { id: 'config', label: 'Configurações', icon: Settings },
];

// Posição central (índice 2) reservada para "Início" na barra inferior mobile
const MOBILE_PRIMARY_TABS: Array<{
  id: AppRoute;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  isCenter?: boolean;
}> = [
  { id: 'lancamentos', label: 'Lançar', icon: LayoutList },
  { id: 'horizonte', label: 'Horizonte', icon: CalendarRange },
  { id: 'inicio', label: 'Início', icon: Home, isCenter: true },
  { id: 'economias', label: 'Investir', icon: PiggyBank },
];

function normalizeHubRoute(route: AppRoute): AppRoute {
  if (route === 'parcelamentos' || route === 'compras' || route === 'cenarios') {
    return 'horizonte';
  }
  return route;
}

export function AppShell({ route, onNavigate, onQuickAdd, children }: AppShellProps) {
  const { household, currentAuthorName, logout, transactions, recurringItems, cards, installments } = useFinance();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const effectiveRoute = normalizeHubRoute(route);
  const activeItem = NAV_ITEMS.find((i) => i.id === effectiveRoute) ?? NAV_ITEMS[0];
  const isSecondaryRoute = !MOBILE_PRIMARY_TABS.some((t) => t.id === effectiveRoute);
  const membersList = getHouseholdMembersList(household);

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

  return (
    <div className="min-h-[100dvh] w-full max-w-full overflow-x-clip bg-slate-50 dark:bg-slate-950 flex flex-col lg:flex-row">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 z-30">
        <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100" style={{ fontFamily: 'var(--font-display)' }}>
              DuoFin
            </span>
          </div>
          {household && (
            <p className="text-xs text-slate-500 mt-1 truncate">
              {membersList.length > 2
                ? `${membersList.slice(0, 2).map((m) => m.name).join(', ')} +${membersList.length - 2}`
                : membersList.length === 2
                  ? `${membersList[0].name} & ${membersList[1].name}`
                  : `${household.partner1Name}`}
            </p>
          )}
        </div>

        <div className="p-4">
          <button
            type="button"
            onClick={onQuickAdd}
            className="w-full min-h-[42px] flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-800 active:scale-[0.98] transition-all cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4 shrink-0" />
            Adicionar lançamento
          </button>
        </div>

        <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto pb-4">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = effectiveRoute === item.id;
            const badgeCount = item.id === 'lembretes' ? (urgentCount > 0 ? urgentCount : pendingCount) : 0;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <span className="flex items-center gap-3 min-w-0">
                  <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-slate-900 dark:text-slate-100' : 'text-slate-400'}`} />
                  <span className="truncate">{item.label}</span>
                </span>
                {badgeCount > 0 && (
                  <span
                    className={`px-1.5 py-0.5 text-[10px] font-bold font-mono tabular-nums rounded-md shrink-0 ${
                      urgentCount > 0
                        ? 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300'
                        : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    {badgeCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">{currentAuthorName}</p>
            <p className="text-xs text-slate-400 truncate">
              {household ? `Nuvem: ${household.memberUids.length}/7 pessoas` : 'Espaço compartilhado'}
            </p>
          </div>
          <button
            type="button"
            onClick={logout}
            title="Sair"
            aria-label="Sair"
            className="p-2 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0 max-w-full">
        {/* Top Bar (compacta no mobile para respeitar <= 15% da altura de tela) */}
        <header className="sticky top-0 z-20 w-full max-w-full bg-white/95 dark:bg-slate-900/95 backdrop-blur-xs border-b border-slate-200 dark:border-slate-800 px-3.5 sm:px-8 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 sm:py-3 flex items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <span className="lg:hidden text-base font-bold text-slate-900 dark:text-slate-100 shrink-0" style={{ fontFamily: 'var(--font-display)' }}>
              DuoFin
            </span>
            <span className="hidden lg:inline text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
              {activeItem.label}
            </span>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <PWAInstallButton variant="header" />
            <button
              type="button"
              onClick={() => onNavigate('lembretes')}
              aria-label="Lembretes de Pagamento"
              title="Lembretes de Pagamento"
              className={`relative inline-flex items-center justify-center gap-1.5 px-2.5 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                effectiveRoute === 'lembretes'
                  ? 'bg-orange-50 border-orange-200 text-orange-900 dark:bg-orange-950/60 dark:border-orange-800 dark:text-orange-200'
                  : urgentCount > 0
                    ? 'bg-orange-50/70 border-orange-200 text-orange-800 dark:bg-orange-950/40 dark:border-orange-900 dark:text-orange-300 hover:bg-orange-100'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
              }`}
            >
              <Bell className={`w-3.5 h-3.5 ${urgentCount > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-slate-500'}`} />
              <span className="hidden sm:inline">Lembretes</span>
              {(urgentCount > 0 || pendingCount > 0) && (
                <span
                  className={`px-1.5 py-0.2 text-[10px] font-bold font-mono tabular-nums rounded ${
                    urgentCount > 0
                      ? 'bg-orange-600 text-white'
                      : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
                  }`}
                >
                  {urgentCount > 0 ? urgentCount : pendingCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => onNavigate('ia')}
              aria-label="Assistente IA e Voz"
              className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                effectiveRoute === 'ia'
                  ? 'bg-sky-50 border-sky-200 text-sky-900'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-sky-600" />
              <span className="hidden xs:inline sm:inline">IA</span>
              <span className="hidden sm:inline">Assistente</span>
            </button>
            {effectiveRoute !== 'inicio' && (
              <button
                type="button"
                onClick={onQuickAdd}
                className="lg:hidden inline-flex items-center gap-1 px-2.5 py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Lançar
              </button>
            )}
            <button
              type="button"
              onClick={onQuickAdd}
              className="hidden lg:inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Adicionar lançamento
            </button>
          </div>
        </header>

        <main className="flex-1 max-w-6xl w-full min-w-0 mx-auto px-3.5 sm:px-8 py-4 sm:py-6 pb-24 lg:pb-10 overflow-x-clip">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation (Início centralizado na posição 3 de 5) */}
      <nav
        aria-label="Navegação principal"
        className="lg:hidden fixed bottom-0 inset-x-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 z-30 grid grid-cols-5 items-center pb-[env(safe-area-inset-bottom)]"
      >
        {MOBILE_PRIMARY_TABS.map((tab) => {
          const Icon = tab.icon;
          const active = effectiveRoute === tab.id && !mobileMenuOpen;

          if (tab.isCenter) {
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  onNavigate(tab.id);
                  setMobileMenuOpen(false);
                }}
                aria-current={active ? 'page' : undefined}
                className="min-h-[58px] flex flex-col items-center justify-center gap-0.5 py-1.5 px-1 text-[11px] font-semibold transition-all active:scale-95 cursor-pointer"
              >
                <span
                  className={`w-10 h-7 rounded-xl flex items-center justify-center transition-colors ${
                    active ? 'bg-slate-900 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </span>
                <span className={`truncate max-w-full whitespace-nowrap ${active ? 'text-slate-900 dark:text-slate-100 font-bold' : 'text-slate-600'}`}>
                  {tab.label}
                </span>
              </button>
            );
          }

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                onNavigate(tab.id);
                setMobileMenuOpen(false);
              }}
              aria-current={active ? 'page' : undefined}
              className={`min-h-[58px] flex flex-col items-center justify-center gap-1 py-1.5 px-1 text-[11px] font-medium transition-all active:scale-95 cursor-pointer ${
                active ? 'text-slate-900 dark:text-slate-100 font-semibold' : 'text-slate-500'
              }`}
            >
              <Icon className={`w-4 h-4 ${active ? 'text-slate-900 dark:text-slate-100' : 'text-slate-400'}`} />
              <span className="truncate max-w-full whitespace-nowrap">{tab.label}</span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => setMobileMenuOpen((v) => !v)}
          className={`min-h-[58px] flex flex-col items-center justify-center gap-1 py-1.5 px-1 text-[11px] font-medium transition-colors cursor-pointer ${
            mobileMenuOpen || isSecondaryRoute ? 'text-slate-900 dark:text-slate-100 font-semibold' : 'text-slate-500'
          }`}
        >
          {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          <span className="whitespace-nowrap">Mais</span>
        </button>
      </nav>

      {/* Mobile Secondary Drawer */}
      {mobileMenuOpen && (
        <ModalPortal>
          <div className="duofin-backdrop-enter lg:hidden fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-[2px] flex items-start justify-center pt-4 px-3 pb-6 overflow-y-auto" onClick={() => setMobileMenuOpen(false)}>
            <div
              className="duofin-dialog-enter w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4 max-h-[85dvh] overflow-y-auto shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{household?.name}</p>
                <p className="text-xs text-slate-500">Conectado como {currentAuthorName}</p>
              </div>
              <button
                type="button"
                onClick={logout}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-50 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sair
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = effectiveRoute === item.id;
                const badgeCount = item.id === 'lembretes' ? (urgentCount > 0 ? urgentCount : pendingCount) : 0;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onNavigate(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`min-h-[44px] flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border text-xs font-medium text-left cursor-pointer ${
                      active
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-50'
                    }`}
                  >
                    <span className="flex items-center gap-2.5 min-w-0">
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </span>
                    {badgeCount > 0 && (
                      <span
                        className={`px-1.5 py-0.5 text-[10px] font-bold font-mono tabular-nums rounded shrink-0 ${
                          active
                            ? 'bg-white/20 text-white'
                            : urgentCount > 0
                              ? 'bg-orange-100 text-orange-800'
                              : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {badgeCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          </div>
        </ModalPortal>
      )}
      <OfflineIndicator />
    </div>
  );
}
