import React, { useEffect, useState } from 'react';
import { AppShell } from './components/AppShell';
import { AuthGate } from './components/AuthGate';
import { ErrorBoundary } from './components/ErrorBoundary';
import { QuickTransactionModal } from './components/QuickTransactionModal';
import { WelcomeTour } from './components/WelcomeTour';
import { AuthHouseholdProvider, useFinance } from './context/AuthHouseholdContext';
import { ThemeProvider } from './context/ThemeContext';
import { CardsAccountsHubPage } from './pages/CardsAccountsHubPage';
import { GoalsPage } from './pages/GoalsPage';
import { HomePage } from './pages/HomePage';
import { HorizonPage, type HorizonHubTab } from './pages/HorizonPage';
import { ProfileHubPage } from './pages/ProfileHubPage';
import { ReportsPage } from './pages/ReportsPage';
import { TransactionsPage } from './pages/TransactionsPage';
import type {
  AppRoute,
  CardsAccountsTab,
  ProfileHubTab,
  ReportsHubTab,
  Transaction,
} from './types/finance';

function getHorizonInitialTab(route: AppRoute): HorizonHubTab {
  if (route === 'parcelamentos') return 'parcelamentos';
  if (route === 'compras') return 'compras';
  if (route === 'cenarios') return 'cenarios';
  return 'projecao';
}

function getTransitionGroupKey(route: AppRoute): string {
  if (route === 'horizonte' || route === 'parcelamentos' || route === 'compras' || route === 'cenarios') {
    return 'horizonte';
  }
  if (route === 'cartoes' || route === 'fixos') {
    return 'cartoes';
  }
  if (route === 'relatorios' || route === 'renda') {
    return 'relatorios';
  }
  if (route === 'lembretes' || route === 'config') {
    return 'perfil';
  }
  return route;
}

function scrollPageToTop() {
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
}

function AuthenticatedApp() {
  const { dataLoading } = useFinance();
  const [route, setRoute] = useState<AppRoute>('inicio');
  const [cardsTab, setCardsTab] = useState<CardsAccountsTab>('cartoes');
  const [reportsTab, setReportsTab] = useState<ReportsHubTab>('resumo');
  const [profileTab, setProfileTab] = useState<ProfileHubTab>('lembretes');
  const [profileAnchorId, setProfileAnchorId] = useState<string | null>(null);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);

  useEffect(() => {
    if (profileAnchorId) return;
    scrollPageToTop();
    const raf = window.requestAnimationFrame(scrollPageToTop);
    return () => window.cancelAnimationFrame(raf);
  }, [route, profileAnchorId]);

  const openNewTransaction = () => {
    setEditingTransaction(null);
    setQuickAddOpen(true);
  };

  const openEditTransaction = (tx: Transaction) => {
    setEditingTransaction(tx);
    setQuickAddOpen(true);
  };

  const handleNavigate = (nextRoute: AppRoute) => {
    setProfileAnchorId(null);
    if (nextRoute === 'fixos') {
      setCardsTab('fixos');
    } else if (nextRoute === 'cartoes') {
      setCardsTab('cartoes');
    } else if (nextRoute === 'renda') {
      setReportsTab('renda');
    } else if (nextRoute === 'relatorios') {
      setReportsTab('resumo');
    } else if (nextRoute === 'lembretes') {
      setProfileTab('lembretes');
    } else if (nextRoute === 'config') {
      setProfileTab('configuracoes');
    }
    setRoute(nextRoute);
    scrollPageToTop();
  };

  const handleOpenProfileSection = (tab: ProfileHubTab, anchorId?: string) => {
    setProfileTab(tab);
    setProfileAnchorId(anchorId ?? null);
    setRoute(tab === 'lembretes' ? 'lembretes' : 'config');
    if (!anchorId) {
      scrollPageToTop();
    }
  };

  const handleNavigateToBankAccounts = () => {
    handleOpenProfileSection('configuracoes', 'duofin-bank-accounts-section');
  };

  const isHorizonHub =
    route === 'horizonte' || route === 'parcelamentos' || route === 'compras' || route === 'cenarios';
  const isCardsHub = route === 'cartoes' || route === 'fixos';
  const isReportsHub = route === 'relatorios' || route === 'renda';
  const isProfileHub = route === 'lembretes' || route === 'config';
  const pageTransitionKey = getTransitionGroupKey(route);

  return (
    <AppShell
      route={route}
      onNavigate={handleNavigate}
      onOpenProfileSection={handleOpenProfileSection}
      onQuickAdd={openNewTransaction}
    >
      {dataLoading ? (
        <div className="py-16 text-center text-sm text-slate-500">Carregando dados sincronizados...</div>
      ) : (
        <>
          <WelcomeTour
            onNavigateToBankAccounts={handleNavigateToBankAccounts}
            onNavigate={handleNavigate}
            onQuickAdd={openNewTransaction}
          />
          <ErrorBoundary
            variant="page"
            resetKey={route}
            onNavigateHome={() => handleNavigate('inicio')}
          >
            <div key={pageTransitionKey} className="duofin-page-enter">
              {route === 'inicio' && (
                <HomePage
                  onNavigate={handleNavigate}
                  onQuickAdd={openNewTransaction}
                  onEditTransaction={openEditTransaction}
                />
              )}
              {route === 'lancamentos' && (
                <TransactionsPage onQuickAdd={openNewTransaction} onEditTransaction={openEditTransaction} />
              )}
              {isReportsHub && (
                <ReportsPage initialTab={route === 'renda' ? 'renda' : reportsTab} />
              )}
              {isCardsHub && (
                <CardsAccountsHubPage
                  onNavigate={handleNavigate}
                  initialTab={route === 'fixos' ? 'fixos' : cardsTab}
                />
              )}
              {isHorizonHub && (
                <HorizonPage onNavigate={handleNavigate} initialTab={getHorizonInitialTab(route)} />
              )}
              {route === 'economias' && <GoalsPage />}
              {isProfileHub && (
                <ProfileHubPage
                  initialTab={route === 'lembretes' && !profileAnchorId ? profileTab : profileTab}
                  focusAnchorId={profileAnchorId}
                />
              )}
            </div>
          </ErrorBoundary>
        </>
      )}

      <QuickTransactionModal
        open={quickAddOpen}
        onClose={() => {
          setQuickAddOpen(false);
          setEditingTransaction(null);
        }}
        editingTransaction={editingTransaction}
      />
    </AppShell>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthHouseholdProvider>
          <AuthGate>
            <AuthenticatedApp />
          </AuthGate>
        </AuthHouseholdProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
