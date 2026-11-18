import React, { useState } from 'react';
import { ArrowRight, Eye, EyeOff, KeyRound, Lock, ShieldCheck, UserPlus, Users } from 'lucide-react';
import { useFinance } from '../context/AuthHouseholdContext';
import { OfflineIndicator } from './OfflineIndicator';
import { PWAInstallButton } from './PWAInstallButton';

export function AuthGate({ children }: { children: React.ReactNode }) {
  const {
    user,
    authReady,
    household,
    householdLoading,
    signInWithGoogle,
    signInWithCredentials,
    registerWithCredentials,
    logout,
    createHousehold,
    joinHouseholdWithCode,
    currentAuthorName,
    currentUsernameLabel,
  } = useFinance();

  // Credentials auth state
  const [authTab, setAuthTab] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState('');
  const [signingIn, setSigningIn] = useState(false);

  // Onboarding state
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [householdName, setHouseholdName] = useState('Finanças do Casal');
  const [partner1Name, setPartner1Name] = useState('');
  const [partner2Name, setPartner2Name] = useState('');
  const [periodStart, setPeriodStart] = useState(() => `${new Date().getFullYear()}-01-01`);
  const [inviteCode, setInviteCode] = useState('');
  const [myJoinName, setMyJoinName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [onboardingError, setOnboardingError] = useState('');

  if (!authReady || (user && householdLoading)) {
    return (
      <div className="min-h-[100dvh] bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-sm w-full space-y-4 text-center">
          <div className="w-8 h-8 border-2 border-slate-300 border-t-slate-900 rounded-full animate-spin mx-auto" />
          <p className="text-sm text-slate-600">Carregando seu espaço financeiro...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    const handleCredentialsSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      setAuthError('');
      setSigningIn(true);
      try {
        if (authTab === 'login') {
          await signInWithCredentials(username, password);
        } else {
          await registerWithCredentials(username, password, displayName);
        }
      } catch (err) {
        setAuthError(err instanceof Error ? err.message : 'Não foi possível entrar.');
      } finally {
        setSigningIn(false);
      }
    };

    const handleGoogleSignIn = async () => {
      setAuthError('');
      setSigningIn(true);
      try {
        await signInWithGoogle();
      } catch (err) {
        setAuthError(err instanceof Error ? err.message : 'Não foi possível entrar com o Google.');
      } finally {
        setSigningIn(false);
      }
    };

    return (
      <div className="min-h-[100dvh] w-full max-w-full overflow-x-clip bg-slate-50 flex flex-col justify-between p-4 sm:p-6 md:p-12 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <header className="max-w-5xl w-full mx-auto flex items-center justify-between gap-3">
          <span className="text-xl font-bold tracking-tight text-slate-900" style={{ fontFamily: 'var(--font-display)' }}>
            DuoFin
          </span>
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline text-xs text-slate-500">Finanças compartilhadas na nuvem</span>
            <PWAInstallButton variant="header" />
          </div>
        </header>

        <main className="duofin-page-enter max-w-5xl w-full mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center my-auto py-8 sm:py-12">
          <div className="lg:col-span-6 space-y-6">
            <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-slate-900 leading-tight [text-wrap:balance]">
              Seu diário financeiro compartilhado, pronto no celular todos os dias.
            </h1>
            <p className="text-base sm:text-lg text-slate-600 leading-relaxed max-w-xl">
              Registrem despesas, receitas e contas fixas em segundos, acompanhem faturas futuras, parcelamentos e metas — tudo salvo no dispositivo mesmo offline e sincronizado na nuvem para até 7 pessoas.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-slate-200">
              <div>
                <p className="text-sm font-semibold text-slate-900">Uso diário e offline</p>
                <p className="text-xs text-slate-500 mt-1">Sessão contínua no aparelho, funcionando offline com sincronização automática.</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">Nuvem para até 7 pessoas</p>
                <p className="text-xs text-slate-500 mt-1">Vincule família ou parceiros com código único e acompanhe renda e gastos por pessoa.</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">Google ou usuário</p>
                <p className="text-xs text-slate-500 mt-1">Entre com sua conta Google em um toque ou crie usuário e senha pessoal.</p>
              </div>
            </div>
          </div>

          <div className="lg:col-span-6">
            <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-8 space-y-5">
              <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => {
                    setAuthTab('login');
                    setAuthError('');
                  }}
                  className={`flex items-center justify-center gap-2 py-2 px-3 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                    authTab === 'login' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Lock className="w-3.5 h-3.5" />
                  Entrar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthTab('register');
                    setAuthError('');
                  }}
                  className={`flex items-center justify-center gap-2 py-2 px-3 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                    authTab === 'register' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  Criar usuário
                </button>
              </div>

              <div className="space-y-1">
                <h2 className="text-xl font-semibold text-slate-900">
                  {authTab === 'login' ? 'Entrar no DuoFin' : 'Criar acesso pessoal'}
                </h2>
                <p className="text-sm text-slate-500">
                  {authTab === 'login'
                    ? 'Entre com Google ou digite seu usuário e senha para abrir a nuvem compartilhada.'
                    : 'Entre com Google ou crie seu usuário e senha para começar ou vincular um código.'}
                </p>
              </div>

              <button
                type="button"
                disabled={signingIn}
                onClick={handleGoogleSignIn}
                className="w-full min-h-[44px] flex items-center justify-center gap-2.5 px-4 py-2.5 bg-white border border-slate-300 text-slate-800 text-sm font-semibold rounded-lg hover:bg-slate-50 disabled:opacity-60 transition-colors cursor-pointer"
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                Entrar com Google
              </button>

              <div className="relative flex items-center py-0.5">
                <div className="flex-grow border-t border-slate-200" />
                <span className="shrink mx-3 text-[11px] font-medium uppercase tracking-wider text-slate-400">
                  ou com usuário e senha
                </span>
                <div className="flex-grow border-t border-slate-200" />
              </div>

              {authError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 leading-relaxed">
                  {authError}
                </div>
              )}

              <form key={authTab} onSubmit={handleCredentialsSubmit} className="duofin-tab-enter space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Usuário (ou e-mail)
                  </label>
                  <input
                    type="text"
                    required
                    autoComplete="username"
                    autoCapitalize="none"
                    autoCorrect="off"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Ex.: joao.silva"
                    className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>

                {authTab === 'register' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Seu nome (como aparecerá nos lançamentos)
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={80}
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Ex.: João"
                      className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Senha</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      autoComplete={authTab === 'login' ? 'current-password' : 'new-password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                      className="w-full pl-3 pr-10 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={signingIn}
                  className="w-full min-h-[44px] flex items-center justify-center gap-2 px-4 py-3 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-800 disabled:opacity-60 transition-colors cursor-pointer"
                >
                  {signingIn
                    ? authTab === 'login'
                      ? 'Entrando...'
                      : 'Criando usuário...'
                    : authTab === 'login'
                    ? 'Entrar com usuário e senha'
                    : 'Criar usuário e continuar'}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>

              <div className="flex items-start gap-2.5 pt-2 border-t border-slate-100 text-xs text-slate-500">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  Após entrar uma vez, o app permanece conectado no celular para lançamentos rápidos do dia a dia, mesmo quando estiver offline (AFK).
                </span>
              </div>
            </div>
          </div>
        </main>

        <footer className="max-w-5xl w-full mx-auto text-xs text-slate-400">
          DuoFin · Valores em Real brasileiro (R$)
        </footer>
        <OfflineIndicator />
      </div>
    );
  }

  if (!household) {
    const handleCreate = async (e: React.FormEvent) => {
      e.preventDefault();
      setOnboardingError('');
      setSubmitting(true);
      try {
        await createHousehold({
          name: householdName,
          partner1Name: partner1Name || currentAuthorName,
          partner2Name: partner2Name || 'Parceiro(a)',
          periodStart,
        });
      } catch (err) {
        setOnboardingError(err instanceof Error ? err.message : 'Erro ao criar espaço.');
      } finally {
        setSubmitting(false);
      }
    };

    const handleJoin = async (e: React.FormEvent) => {
      e.preventDefault();
      setOnboardingError('');
      setSubmitting(true);
      try {
        await joinHouseholdWithCode(inviteCode, myJoinName || currentAuthorName);
      } catch (err) {
        setOnboardingError(err instanceof Error ? err.message : 'Erro ao entrar com convite.');
      } finally {
        setSubmitting(false);
      }
    };

    return (
      <div className="min-h-[100dvh] w-full max-w-full overflow-x-clip bg-slate-50 flex flex-col justify-center p-4 sm:p-8 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <div className="duofin-page-enter max-w-lg w-full mx-auto space-y-6">
          <div className="flex items-center justify-between gap-2">
            <span className="text-lg font-bold text-slate-900">DuoFin</span>
            <button
              type="button"
              onClick={logout}
              className="text-xs font-medium text-slate-500 hover:text-slate-900 cursor-pointer truncate max-w-[200px]"
            >
              Sair ({currentUsernameLabel})
            </button>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-8 space-y-6">
            <div className="space-y-1">
              <h1 className="text-xl font-bold text-slate-900">Configurar nuvem compartilhada</h1>
              <p className="text-sm text-slate-500">
                Crie um novo painel financeiro na nuvem (para você ou até 7 pessoas) ou entre usando um código de vínculo.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => {
                  setMode('create');
                  setOnboardingError('');
                }}
                className={`flex items-center justify-center gap-2 py-2 px-3 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                  mode === 'create' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                Criar nova nuvem
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('join');
                  setOnboardingError('');
                }}
                className={`flex items-center justify-center gap-2 py-2 px-3 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                  mode === 'join' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <KeyRound className="w-3.5 h-3.5" />
                Vincular código
              </button>
            </div>

            {onboardingError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                {onboardingError}
              </div>
            )}

            {mode === 'create' ? (
              <form key="create" onSubmit={handleCreate} className="duofin-tab-enter space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Nome do espaço</label>
                  <input
                    type="text"
                    required
                    maxLength={80}
                    value={householdName}
                    onChange={(e) => setHouseholdName(e.target.value)}
                    placeholder="Ex.: Finanças da Casa"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Seu nome (Pessoa 1)</label>
                    <input
                      type="text"
                      required
                      maxLength={50}
                      value={partner1Name}
                      onChange={(e) => setPartner1Name(e.target.value)}
                      placeholder={currentAuthorName}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Nome do parceiro(a)</label>
                    <input
                      type="text"
                      required
                      maxLength={50}
                      value={partner2Name}
                      onChange={(e) => setPartner2Name(e.target.value)}
                      placeholder="Ex.: Esposa / Marido"
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Início do período anual</label>
                  <input
                    type="month"
                    required
                    value={periodStart.slice(0, 7)}
                    onChange={(e) => setPeriodStart(`${e.target.value}-01`)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                  <p className="text-xs text-slate-400 mt-1">
                    Define o mês inicial da janela de 12 meses no Painel e Parcelamentos. Você pode alterar depois.
                  </p>
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full min-h-[44px] flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-800 disabled:opacity-60 transition-colors cursor-pointer"
                >
                  {submitting ? 'Criando espaço...' : 'Criar espaço e começar'}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            ) : (
              <form key="join" onSubmit={handleJoin} className="duofin-tab-enter space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Código de vínculo da nuvem</label>
                  <input
                    type="text"
                    required
                    maxLength={64}
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                    placeholder="Ex.: DUO-A7K9M2"
                    className="w-full px-3 py-2 text-sm font-mono uppercase border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Até 7 pessoas podem compartilhar o mesmo armazenamento na nuvem usando códigos gerados em Configurações.
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Como você quer ser identificado(a)</label>
                  <input
                    type="text"
                    required
                    maxLength={50}
                    value={myJoinName}
                    onChange={(e) => setMyJoinName(e.target.value)}
                    placeholder={currentAuthorName}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full min-h-[44px] flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-800 disabled:opacity-60 transition-colors cursor-pointer"
                >
                  {submitting ? 'Conectando...' : 'Entrar na nuvem compartilhada'}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
