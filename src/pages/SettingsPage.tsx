import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Cloud,
  Copy,
  KeyRound,
  Landmark,
  Moon,
  Plus,
  Smartphone,
  Sun,
  Trash2,
  UserMinus,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { PWAInstallButton } from '../components/PWAInstallButton';
import { ModalPortal } from '../components/ModalPortal';
import { useFinance } from '../context/AuthHouseholdContext';
import { useTheme } from '../context/ThemeContext';
import type { BankAccount, BankAccountType } from '../types/finance';
import {
  formatBRL,
  getHouseholdMembersList,
  parseSignedDecimal,
  sanitizeSignedDecimalInput,
} from '../utils/financeCalculations';

export function SettingsPage() {
  const {
    user,
    household,
    invites,
    bankAccounts,
    updateHouseholdSettings,
    createInviteCode,
    deleteInviteCode,
    removeMember,
    saveBankAccount,
    deleteBankAccount,
  } = useFinance();

  const { theme, setTheme } = useTheme();

  const [name, setName] = useState('');
  const [partner1Name, setPartner1Name] = useState('');
  const [partner2Name, setPartner2Name] = useState('');
  const [memberNamesDraft, setMemberNamesDraft] = useState<Record<string, string>>({});
  const [periodStart, setPeriodStart] = useState('');
  const [categoriesText, setCategoriesText] = useState('');
  const [paymentMethodsText, setPaymentMethodsText] = useState('');
  const [roomsText, setRoomsText] = useState('');
  const [accountsText, setAccountsText] = useState('');

  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const [error, setError] = useState('');
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [copiedCode, setCopiedCode] = useState('');
  const [removingUid, setRemovingUid] = useState('');

  // Manual bank account form state
  const [accFormOpen, setAccFormOpen] = useState(false);
  const [editingAcc, setEditingAcc] = useState<BankAccount | null>(null);
  const [accName, setAccName] = useState('');
  const [accInstitution, setAccInstitution] = useState('');
  const [accType, setAccType] = useState<BankAccountType>('Corrente');
  const [accBalance, setAccBalance] = useState('');
  const [accSaving, setAccSaving] = useState(false);

  const membersList = useMemo(() => getHouseholdMembersList(household), [household]);

  useEffect(() => {
    if (!household) return;
    setName(household.name);
    setPartner1Name(household.partner1Name);
    setPartner2Name(household.partner2Name);
    const nextMap: Record<string, string> = {};
    for (const m of getHouseholdMembersList(household)) {
      nextMap[m.uid] = m.name;
    }
    setMemberNamesDraft(nextMap);
    setPeriodStart(household.periodStart);
    setCategoriesText(household.categories.join(', '));
    setPaymentMethodsText(household.paymentMethods.join(', '));
    setRoomsText(household.rooms.join(', '));
    setAccountsText(household.accounts.join(', '));
  }, [household]);

  const totalAccountsBalance = useMemo(
    () => bankAccounts.filter((a) => a.active).reduce((s, a) => s + a.balance, 0),
    [bankAccounts]
  );

  if (!household || !user) return null;

  const isOwner = household.ownerUid === user.uid;
  const maxMembers = 7;
  const canInviteMore = household.memberUids.length < maxMembers;

  const splitCommaList = (txt: string) =>
    txt
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSavedMsg('');
    setSaving(true);
    try {
      const sanitizedMemberNames: Record<string, string> = {};
      for (const uid of household.memberUids) {
        const draft = memberNamesDraft[uid]?.trim();
        if (draft) {
          sanitizedMemberNames[uid] = draft.slice(0, 50);
        }
      }
      const p1Resolved = sanitizedMemberNames[household.ownerUid] || partner1Name;
      const secondUid = household.memberUids.find((u) => u !== household.ownerUid);
      const p2Resolved = (secondUid && sanitizedMemberNames[secondUid]) || partner2Name;

      await updateHouseholdSettings({
        name,
        partner1Name: p1Resolved,
        partner2Name: p2Resolved,
        memberNames: sanitizedMemberNames,
        periodStart,
        categories: splitCommaList(categoriesText),
        paymentMethods: splitCommaList(paymentMethodsText),
        rooms: splitCommaList(roomsText),
        accounts: splitCommaList(accountsText),
      });
      setSavedMsg('Configurações salvas com sucesso.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar configurações.');
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateInvite = async () => {
    setError('');
    setCreatingInvite(true);
    try {
      await createInviteCode();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao gerar código de vínculo.');
    } finally {
      setCreatingInvite(false);
    }
  };

  const handleRemoveMember = async (targetUid: string) => {
    setError('');
    setRemovingUid(targetUid);
    try {
      await removeMember(targetUid);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao desvincular pessoa.');
    } finally {
      setRemovingUid('');
    }
  };

  const copyCode = async (code: string) => {
    await navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(''), 2500);
  };

  const openAccountForm = (acc?: BankAccount) => {
    setEditingAcc(acc ?? null);
    setAccName(acc?.name ?? '');
    setAccInstitution(acc?.institution ?? '');
    setAccType(acc?.type ?? 'Corrente');
    setAccBalance(acc ? String(acc.balance) : '');
    setAccFormOpen(true);
  };

  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const parsedBal = parseSignedDecimal(accBalance);
    if (!Number.isFinite(parsedBal)) {
      setError('Informe um saldo válido (pode ser negativo, zero ou positivo).');
      return;
    }
    setAccSaving(true);
    try {
      await saveBankAccount(
        {
          name: accName,
          institution: accInstitution || 'Manual',
          type: accType,
          balance: parsedBal,
          annualYieldRate: editingAcc?.annualYieldRate,
          currency: 'BRL',
          lastSyncedAt: new Date().toISOString(),
          active: true,
        },
        editingAcc?.id
      );
      setAccFormOpen(false);
      setEditingAcc(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar conta.');
    } finally {
      setAccSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Configurações</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Tema escuro, nuvem compartilhada (até 7 pessoas), saldos das contas, aplicativo no celular e listas.
        </p>
      </div>

      {/* Aparência e Cores Semânticas */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-2.5">
            {theme === 'dark' ? (
              <Moon className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            ) : (
              <Sun className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            )}
            <div>
              <h2 className="text-base font-semibold text-slate-900">Aparência e Tema Escuro</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Alterne entre o modo claro e o modo escuro. A preferência fica salva neste dispositivo.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg shrink-0 self-start sm:self-center">
            <button
              type="button"
              onClick={() => setTheme('light')}
              className={`inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                theme === 'light'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Sun className="w-3.5 h-3.5" />
              Claro
            </button>
            <button
              type="button"
              onClick={() => setTheme('dark')}
              className={`inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                theme === 'dark'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Moon className="w-3.5 h-3.5" />
              Escuro
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-3 border-t border-slate-100 text-xs">
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-slate-50 border border-slate-100">
            <span className="w-3 h-3 rounded-full bg-emerald-600 shrink-0" />
            <span className="text-slate-700">
              <strong>Verde:</strong> Positivo, entradas e sobra
            </span>
          </div>
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-slate-50 border border-slate-100">
            <span className="w-3 h-3 rounded-full bg-amber-500 shrink-0" />
            <span className="text-slate-700">
              <strong>Amarelo / Laranja:</strong> Melhora ou piora
            </span>
          </div>
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-slate-50 border border-slate-100">
            <span className="w-3 h-3 rounded-full bg-red-600 shrink-0" />
            <span className="text-slate-700">
              <strong>Vermelho:</strong> Negativo, despesas e déficit
            </span>
          </div>
        </div>
      </section>

      {/* Nuvem Compartilhada (Até 7 Pessoas) */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <Cloud className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold text-slate-900">Nuvem Compartilhada e Código de Vínculo</h2>
                <span className="px-2 py-0.5 text-[11px] font-semibold rounded border bg-emerald-50 text-emerald-700 border-emerald-200">
                  {household.memberUids.length}/{maxMembers} pessoas
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Vincule até 7 pessoas na mesma nuvem para sincronizar lançamentos, faturas e metas em tempo real, com cálculo de % de contribuição na renda e gasto individual.
              </p>
            </div>
          </div>

          {canInviteMore && (
            <button
              type="button"
              disabled={creatingInvite}
              onClick={handleGenerateInvite}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 disabled:opacity-60 cursor-pointer shrink-0 w-full sm:w-auto"
            >
              <KeyRound className="w-3.5 h-3.5" />
              {creatingInvite ? 'Gerando...' : 'Gerar código de vínculo'}
            </button>
          )}
        </div>

        {/* Lista de pessoas conectadas na nuvem */}
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
            <Users className="w-3.5 h-3.5 text-slate-500" />
            Pessoas conectadas neste armazenamento ({membersList.length})
          </div>
          <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
            {membersList.map((member) => {
              const isSelf = member.uid === user.uid;
              return (
                <div
                  key={member.uid}
                  className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900 truncate">{member.name}</p>
                      {member.isOwner && (
                        <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200 rounded">
                          Administrador
                        </span>
                      )}
                      {isSelf && (
                        <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded">
                          Você
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Sincronizado na nuvem · ID {member.uid.slice(0, 8)}...
                    </p>
                  </div>

                  {isOwner && !member.isOwner && (
                    <button
                      type="button"
                      disabled={removingUid === member.uid}
                      onClick={() => handleRemoveMember(member.uid)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 bg-white border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50 cursor-pointer shrink-0 self-start sm:self-center"
                    >
                      <UserMinus className="w-3.5 h-3.5" />
                      {removingUid === member.uid ? 'Desvinculando...' : 'Desvincular'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Códigos de vínculo ativos */}
        {canInviteMore && (
          <div className="space-y-2.5 pt-2 border-t border-slate-100">
            <p className="text-xs text-slate-600">
              Envie um código de uso único para outra pessoa. Ao entrar com Google ou usuário e senha, ela escolhe{' '}
              <strong>&ldquo;Vincular código&rdquo;</strong> e digita o código abaixo. Restam{' '}
              <strong>{maxMembers - household.memberUids.length}</strong> vaga(s) na nuvem.
            </p>
            {invites.length > 0 && (
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
                {invites.map((inv) => (
                  <div key={inv.id} className="px-4 py-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-mono font-bold text-slate-900">{inv.id}</p>
                      <p className="text-xs text-slate-500">Código ativo · uso único</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => copyCode(inv.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg cursor-pointer"
                      >
                        {copiedCode === inv.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        {copiedCode === inv.id ? 'Copiado' : 'Copiar'}
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteInviteCode(inv.id)}
                        aria-label={`Excluir código ${inv.id}`}
                        className="p-1.5 text-slate-400 hover:text-red-600 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Contas Bancárias & Carteiras (Manuais) */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <Landmark className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-slate-900">Contas Bancárias e Carteiras</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Cadastre os saldos atuais das suas contas e carteiras para acompanhar quanto pode gastar por dia no Início e o saldo projetado no Horizonte.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => openAccountForm()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg cursor-pointer shrink-0 self-start sm:self-center"
          >
            <Plus className="w-3.5 h-3.5" />
            Adicionar conta
          </button>
        </div>

        <div className="space-y-2.5 pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
              <Wallet className="w-4 h-4 text-slate-500" />
              Saldo total nas contas ({bankAccounts.filter((a) => a.active).length})
            </span>
            <span
              className={`text-sm font-bold font-mono tabular-nums ${
                totalAccountsBalance >= 0 ? 'text-emerald-700' : 'text-red-600'
              }`}
            >
              {formatBRL(totalAccountsBalance)}
            </span>
          </div>

          {bankAccounts.length === 0 ? (
            <p className="text-xs text-slate-500 py-2">
              Nenhuma conta com saldo cadastrada ainda. Clique em <strong>Adicionar conta</strong> para informar o saldo disponível no Início e no Horizonte.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {bankAccounts.map((acc) => (
                <div
                  key={acc.id}
                  className="p-3 border border-slate-200 rounded-lg bg-slate-50/60 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-900 truncate">{acc.name}</p>
                    <p className="text-[11px] text-slate-500 truncate">
                      {acc.institution} · {acc.type}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`text-xs font-bold font-mono tabular-nums ${
                        acc.balance >= 0 ? 'text-emerald-700' : 'text-red-600'
                      }`}
                    >
                      {formatBRL(acc.balance)}
                    </span>
                    <button
                      type="button"
                      onClick={() => openAccountForm(acc)}
                      className="text-[11px] font-medium text-slate-600 hover:text-slate-900 px-1.5 py-1 rounded hover:bg-slate-100 cursor-pointer"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      aria-label={`Excluir ${acc.name}`}
                      onClick={() => deleteBankAccount(acc.id)}
                      className="p-1 text-slate-400 hover:text-red-600 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Instalar no celular (Android, APK e iPhone / iOS) */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-2.5">
            <Smartphone className="w-5 h-5 text-slate-700 shrink-0 mt-0.5" />
            <div>
              <h2 className="text-base font-semibold text-slate-900">Instalar no celular (Android, APK e iOS)</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Instale o DuoFin na tela inicial do Android ou iPhone/iPad (Apple), com uso offline e sincronização automática ao reconectar.
              </p>
            </div>
          </div>
          <PWAInstallButton variant="card" showFallbackInfo />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100 text-xs text-slate-600">
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 space-y-1">
            <p className="font-semibold text-slate-900">Android (Chrome / App direto)</p>
            <p>
              Abra no Google Chrome e toque em <strong>Instalar app</strong> acima ou no menu <strong>⋮</strong> &rarr; <strong>Instalar aplicativo</strong>.
            </p>
          </div>
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 space-y-1">
            <p className="font-semibold text-slate-900">Arquivo .APK instalável</p>
            <p>
              Para gerar o arquivo <strong>.apk</strong> fora do navegador, use o fluxo automático do repositório (Capacitor Android) ou gere o pacote Android pela URL compartilhada no PWABuilder.
            </p>
          </div>
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 space-y-1">
            <p className="font-semibold text-slate-900">Apple (iPhone / iPad — iOS)</p>
            <p>
              Abra no <strong>Safari</strong>, toque em <strong>Compartilhar</strong> e selecione <strong>Adicionar à Tela de Início</strong>. Suporta modo tela cheia, área segura do notch e cache offline.
            </p>
          </div>
        </div>
      </section>

      {/* Formulário de Configurações */}
      <form onSubmit={handleSave} className="bg-white border border-slate-200 rounded-xl p-5 space-y-5">
        <h2 className="text-base font-semibold text-slate-900">Nomes, período e listas</h2>

        {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">{error}</div>}
        {savedMsg && <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-700">{savedMsg}</div>}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Nome do espaço</label>
            <input
              type="text"
              required
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Início do período (12 meses)</label>
            <input
              type="month"
              required
              value={periodStart.slice(0, 7)}
              onChange={(e) => setPeriodStart(`${e.target.value}-01`)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
            />
          </div>
        </div>

        {/* Nomes das pessoas conectadas (1 a 7) */}
        <div className="space-y-3 pt-2 border-t border-slate-100">
          <p className="text-xs font-medium text-slate-700">Nomes das pessoas no espaço</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {membersList.map((member, idx) => (
              <div key={member.uid}>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Pessoa {idx + 1} {member.isOwner ? '(Administrador)' : ''}
                </label>
                <input
                  type="text"
                  required
                  maxLength={50}
                  value={memberNamesDraft[member.uid] ?? member.name}
                  onChange={(e) =>
                    setMemberNamesDraft((prev) => ({
                      ...prev,
                      [member.uid]: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>
            ))}
            {household.memberUids.length <= 1 && (
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Pessoa 2 (rótulo padrão)</label>
                <input
                  type="text"
                  required
                  maxLength={50}
                  value={partner2Name}
                  onChange={(e) => setPartner2Name(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>
            )}
          </div>
        </div>

        <div className="space-y-3 pt-2 border-t border-slate-100">
          <p className="text-xs text-slate-500">Separe os itens das listas por vírgula.</p>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Categorias de lançamentos</label>
            <input
              type="text"
              value={categoriesText}
              onChange={(e) => setCategoriesText(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Contas bancárias / carteiras</label>
            <input
              type="text"
              value={accountsText}
              onChange={(e) => setAccountsText(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Formas de pagamento</label>
            <input
              type="text"
              value={paymentMethodsText}
              onChange={(e) => setPaymentMethodsText(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Ambientes (Compras planejadas)</label>
            <input
              type="text"
              value={roomsText}
              onChange={(e) => setRoomsText(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
            />
          </div>
        </div>

        <div className="flex justify-end pt-2 border-t border-slate-100">
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-800 disabled:opacity-60 cursor-pointer"
          >
            {saving ? 'Salvando...' : 'Salvar configurações'}
          </button>
        </div>
      </form>

      {/* Modal Conta Bancária Manual */}
      {accFormOpen && (
        <ModalPortal>
          <div
            className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/45 backdrop-blur-[2px] pt-3 px-3 pb-6 sm:pt-8 sm:px-4 overflow-y-auto duofin-backdrop-enter"
            onClick={(e) => {
              if (e.target === e.currentTarget) setAccFormOpen(false);
            }}
          >
            <div className="duofin-dialog-enter bg-white w-full sm:max-w-md rounded-2xl border border-slate-200 p-5 space-y-4 max-h-[88dvh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-semibold text-slate-900">
                {editingAcc ? 'Editar conta' : 'Nova conta / saldo atual'}
              </h3>
              <button
                type="button"
                onClick={() => setAccFormOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-900 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveAccount} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Nome da conta</label>
                <input
                  type="text"
                  required
                  value={accName}
                  onChange={(e) => setAccName(e.target.value)}
                  placeholder="Ex.: Conta Nubank, Carteira"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Instituição</label>
                  <input
                    type="text"
                    value={accInstitution}
                    onChange={(e) => setAccInstitution(e.target.value)}
                    placeholder="Ex.: Nubank, Itaú"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Tipo</label>
                  <select
                    value={accType}
                    onChange={(e) => setAccType(e.target.value as BankAccountType)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="Corrente">Corrente</option>
                    <option value="Poupança">Poupança</option>
                    <option value="Carteira">Carteira</option>
                    <option value="Investimento">Investimento</option>
                    <option value="Outro">Outro</option>
                  </select>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <label className="block text-xs font-medium text-slate-700">Saldo atual (R$)</label>
                  <span className="text-[11px] text-slate-400">Aceita negativo (cheque especial)</span>
                </div>
                <div className="flex items-stretch gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const trimmed = accBalance.trimStart();
                      setAccBalance(trimmed.startsWith('-') ? trimmed.slice(1) : `-${trimmed}`);
                    }}
                    aria-label={accBalance.startsWith('-') ? 'Tornar saldo positivo' : 'Tornar saldo negativo'}
                    className={`min-w-[44px] px-3 rounded-lg border text-sm font-bold font-mono transition-all cursor-pointer active:scale-95 flex items-center justify-center shrink-0 ${
                      accBalance.startsWith('-')
                        ? 'bg-red-50 border-red-200 text-red-700'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {accBalance.startsWith('-') ? '−' : '+/−'}
                  </button>
                  <input
                    type="text"
                    inputMode="decimal"
                    required
                    value={accBalance}
                    onChange={(e) => setAccBalance(sanitizeSignedDecimalInput(e.target.value, true))}
                    placeholder="0,00 ou -150,00"
                    className={`w-full px-3 py-2 text-sm font-mono tabular-nums border rounded-lg ${
                      accBalance.startsWith('-') ? 'border-red-300 text-red-700' : 'border-slate-200'
                    }`}
                  />
                </div>
                {accBalance.startsWith('-') && (
                  <p className="mt-1 text-[11px] text-red-600 duofin-expand-enter">
                    Saldo negativo será descontado automaticamente da próxima entrada de renda fixa.
                  </p>
                )}
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAccFormOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={accSaving}
                  className="px-5 py-2 text-xs font-semibold bg-slate-900 text-white rounded-lg cursor-pointer disabled:opacity-60 active:scale-[0.98] transition-all"
                >
                  {accSaving ? 'Salvando...' : 'Salvar conta'}
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
