import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  KeyRound,
  Landmark,
  Moon,
  Pencil,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  Smartphone,
  Sun,
  Tag,
  Trash2,
  UserPlus,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { PWAInstallButton } from '../components/PWAInstallButton';
import { ModalPortal } from '../components/ModalPortal';
import { useFinance } from '../context/AuthHouseholdContext';
import { useTheme } from '../context/ThemeContext';
import { usePWAInstall } from '../hooks/usePWAInstall';
import type { BankAccount, BankAccountType } from '../types/finance';
import { CATEGORY_ICON_OPTIONS, CategoryBadgeIcon } from '../utils/categoryVisuals';
import {
  formatBRL,
  parseSignedDecimal,
  sanitizeSignedDecimalInput,
} from '../utils/financeCalculations';
import {
  resolveHouseholdExpenseCategories,
  resolveHouseholdIncomeCategories,
} from '../utils/validation';

export function SettingsPage() {
  const {
    user,
    household,
    invites,
    currentAuthorName,
    bankAccounts,
    updateHouseholdSettings,
    addHouseholdCategory,
    updateHouseholdCategory,
    deleteHouseholdCategory,
    setHouseholdCategoryIcon,
    createInviteCode,
    deleteInviteCode,
    removeMember,
    joinHouseholdWithCode,
    saveBankAccount,
    deleteBankAccount,
  } = useFinance();

  const { theme, setTheme } = useTheme();
  const { isInstalled, refreshPWA } = usePWAInstall();
  const [refreshingPwa, setRefreshingPwa] = useState(false);

  // Pessoas sincronizadas & código de convite
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteFeedback, setInviteFeedback] = useState('');
  const [inviteError, setInviteError] = useState('');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [removingUid, setRemovingUid] = useState<string | null>(null);
  const [showJoinForm, setShowJoinForm] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joinName, setJoinName] = useState('');
  const [joining, setJoining] = useState(false);

  const [name, setName] = useState('');
  const [partner1Name, setPartner1Name] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [categoriesText, setCategoriesText] = useState('');
  const [paymentMethodsText, setPaymentMethodsText] = useState('');
  const [roomsText, setRoomsText] = useState('');
  const [accountsText, setAccountsText] = useState('');

  // Retrocesso das configurações expostas: ocultas por padrão em acordeões recolhíveis
  const [showSemanticLegend, setShowSemanticLegend] = useState(false);
  const [showInstallGuide, setShowInstallGuide] = useState(false);
  const [showAdvancedLists, setShowAdvancedLists] = useState(false);

  // Gerenciador independente de categorias (Despesas vs Receitas)
  const [catTab, setCatTab] = useState<'Saída' | 'Entrada'>('Saída');
  const [newCatName, setNewCatName] = useState('');
  const [newCatIcon, setNewCatIcon] = useState('Package');
  const [editingCat, setEditingCat] = useState<string | null>(null);
  const [editingCatName, setEditingCatName] = useState('');
  const [editingCatIcon, setEditingCatIcon] = useState('Package');
  const [catBusy, setCatBusy] = useState(false);
  const [catFeedback, setCatFeedback] = useState('');

  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const [error, setError] = useState('');

  // Manual bank account form state
  const [accFormOpen, setAccFormOpen] = useState(false);
  const [editingAcc, setEditingAcc] = useState<BankAccount | null>(null);
  const [accName, setAccName] = useState('');
  const [accInstitution, setAccInstitution] = useState('');
  const [accType, setAccType] = useState<BankAccountType>('Corrente');
  const [accBalance, setAccBalance] = useState('');
  const [accSaving, setAccSaving] = useState(false);

  useEffect(() => {
    if (!household) return;
    setName(household.name);
    const myResolvedName =
      (user?.uid ? household.memberNames?.[user.uid] : undefined) ||
      (user?.uid === household.ownerUid ? household.partner1Name : currentAuthorName) ||
      household.partner1Name;
    setPartner1Name(myResolvedName);
    setJoinName((prev) => prev || myResolvedName);
    setPeriodStart(household.periodStart);
    setCategoriesText(household.categories.join(', '));
    setPaymentMethodsText(household.paymentMethods.join(', '));
    setRoomsText(household.rooms.join(', '));
    setAccountsText(household.accounts.join(', '));
  }, [household, user?.uid, currentAuthorName]);

  useEffect(() => {
    setNewCatIcon(catTab === 'Entrada' ? 'Briefcase' : 'Package');
    setEditingCat(null);
    setCatFeedback('');
  }, [catTab]);

  const totalAccountsBalance = useMemo(
    () => bankAccounts.filter((a) => a.active).reduce((s, a) => s + a.balance, 0),
    [bankAccounts]
  );

  const expenseCategories = useMemo(
    () => resolveHouseholdExpenseCategories(household),
    [household]
  );

  const incomeCategories = useMemo(
    () => resolveHouseholdIncomeCategories(household),
    [household]
  );

  const visibleCategories = catTab === 'Entrada' ? incomeCategories : expenseCategories;

  const activeInvites = useMemo(
    () => (household ? invites.filter((inv) => !inv.used && inv.householdId === household.id) : []),
    [invites, household]
  );

  const syncedMembers = useMemo(() => {
    if (!household) return [];
    return household.memberUids.map((uid, idx) => {
      const mappedName = household.memberNames?.[uid]?.trim();
      const fallbackName =
        uid === household.ownerUid || idx === 0
          ? household.partner1Name
          : uid === household.partner2Uid || idx === 1
            ? household.partner2Name
            : `Pessoa ${idx + 1}`;
      return {
        uid,
        name: mappedName || fallbackName || `Pessoa ${idx + 1}`,
        isOwner: uid === household.ownerUid,
        isMe: uid === user?.uid,
      };
    });
  }, [household, user?.uid]);

  if (!household || !user) return null;

  const isHouseholdOwner = user.uid === household.ownerUid;

  const handleCopyInviteCode = async (code: string) => {
    let copied = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(code);
        copied = true;
      }
    } catch {
      copied = false;
    }
    if (!copied) {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = code;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        copied = document.execCommand('copy');
        document.body.removeChild(textarea);
      } catch {
        copied = false;
      }
    }
    if (copied) {
      setCopiedCode(code);
      setTimeout(() => setCopiedCode((curr) => (curr === code ? null : curr)), 2200);
    }
  };

  const handleGenerateInvite = async () => {
    setInviteError('');
    setInviteFeedback('');
    setInviteBusy(true);
    try {
      const code = await createInviteCode();
      await handleCopyInviteCode(code);
      setInviteFeedback(`Código ${code} gerado e pronto para compartilhar.`);
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Erro ao gerar código de convite.');
    } finally {
      setInviteBusy(false);
    }
  };

  const handleDeleteInvite = async (code: string) => {
    setInviteError('');
    setInviteFeedback('');
    setInviteBusy(true);
    try {
      await deleteInviteCode(code);
      setInviteFeedback(`Código ${code} removido.`);
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Erro ao excluir código de convite.');
    } finally {
      setInviteBusy(false);
    }
  };

  const handleRemoveMember = async (memberUid: string) => {
    setInviteError('');
    setInviteFeedback('');
    setRemovingUid(memberUid);
    try {
      await removeMember(memberUid);
      setInviteFeedback('Pessoa removida do painel.');
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Erro ao remover pessoa sincronizada.');
    } finally {
      setRemovingUid(null);
    }
  };

  const handleJoinWithCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = joinCode.trim().toUpperCase();
    if (!cleaned) return;
    setInviteError('');
    setInviteFeedback('');
    setJoining(true);
    try {
      await joinHouseholdWithCode(cleaned, joinName.trim() || currentAuthorName);
      setJoinCode('');
      setShowJoinForm(false);
      setInviteFeedback('Você entrou no painel compartilhado com sucesso.');
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Erro ao entrar com código de convite.');
    } finally {
      setJoining(false);
    }
  };

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
      const resolvedMyName = (partner1Name || currentAuthorName || household.partner1Name || 'Titular')
        .trim()
        .slice(0, 50);
      const sanitizedMemberNames: Record<string, string> = {
        ...(household.memberNames ?? {}),
        [user.uid]: resolvedMyName,
      };

      const parsedLegacyCats = splitCommaList(categoriesText);
      const mergedCategories =
        parsedLegacyCats.length > 0
          ? Array.from(new Set([...parsedLegacyCats, ...expenseCategories, ...incomeCategories]))
          : Array.from(new Set([...expenseCategories, ...incomeCategories]));

      await updateHouseholdSettings({
        name,
        partner1Name: isHouseholdOwner ? resolvedMyName : household.partner1Name,
        partner2Name: isHouseholdOwner ? household.partner2Name : resolvedMyName,
        memberNames: sanitizedMemberNames,
        periodStart,
        categories: mergedCategories,
        expenseCategories,
        incomeCategories,
        categoryIcons: household.categoryIcons,
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

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newCatName.trim();
    if (!trimmed) return;
    setError('');
    setCatFeedback('');
    setCatBusy(true);
    try {
      const created = await addHouseholdCategory(trimmed, catTab, newCatIcon);
      setNewCatName('');
      setCatFeedback(`Categoria "${created}" adicionada em ${catTab === 'Entrada' ? 'Receitas' : 'Despesas'}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao adicionar categoria.');
    } finally {
      setCatBusy(false);
    }
  };

  const startEditCategory = (catName: string) => {
    setEditingCat(catName);
    setEditingCatName(catName);
    setEditingCatIcon(household.categoryIcons?.[catName] ?? (catTab === 'Entrada' ? 'Briefcase' : 'Package'));
    setCatFeedback('');
  };

  const handleSaveCategoryEdit = async (oldName: string) => {
    const trimmed = editingCatName.trim();
    if (!trimmed) return;
    setError('');
    setCatBusy(true);
    try {
      if (trimmed !== oldName) {
        await updateHouseholdCategory(oldName, trimmed, catTab, editingCatIcon);
      } else {
        await setHouseholdCategoryIcon(oldName, editingCatIcon);
      }
      setEditingCat(null);
      setCatFeedback(`Categoria "${trimmed}" atualizada.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao editar categoria.');
    } finally {
      setCatBusy(false);
    }
  };

  const handleDeleteCategory = async (catName: string) => {
    setError('');
    setCatFeedback('');
    setCatBusy(true);
    try {
      await deleteHouseholdCategory(catName, catTab);
      if (editingCat === catName) setEditingCat(null);
      setCatFeedback(`Categoria "${catName}" removida.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao remover categoria.');
    } finally {
      setCatBusy(false);
    }
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
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Configurações</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Pessoas sincronizadas, convite compartilhado, tema, contas, categorias e perfil do painel.
        </p>
      </div>

      {/* 1. Pessoas sincronizadas no mesmo perfil e Código de Convite */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <Users className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Pessoas sincronizadas
                </h2>
                <span className="px-2 py-0.5 text-[11px] font-semibold rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 tabular-nums">
                  {syncedMembers.length} / 7
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Quem compartilha o mesmo painel vê e registra lançamentos, cartões, metas e contas em tempo real.
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={inviteBusy || household.memberUids.length >= 7}
            onClick={handleGenerateInvite}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-slate-900 dark:bg-emerald-600 text-white hover:bg-slate-800 dark:hover:bg-emerald-500 rounded-lg cursor-pointer shrink-0 self-start sm:self-center disabled:opacity-50"
          >
            <KeyRound className="w-3.5 h-3.5" />
            {inviteBusy ? 'Gerando...' : 'Gerar código de convite'}
          </button>
        </div>

        {inviteError && (
          <div className="p-2.5 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-lg text-xs text-red-700 dark:text-red-300">
            {inviteError}
          </div>
        )}
        {inviteFeedback && (
          <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900 rounded-lg text-xs text-emerald-700 dark:text-emerald-300">
            {inviteFeedback}
          </div>
        )}

        {/* Lista de pessoas sincronizadas */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {syncedMembers.map((member) => (
            <div
              key={member.uid}
              className="p-3 border border-slate-200 dark:border-slate-800 rounded-lg bg-slate-50/70 dark:bg-slate-800/50 flex items-center justify-between gap-2"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-8 h-8 rounded-lg bg-slate-900 dark:bg-emerald-600 text-white text-xs font-bold flex items-center justify-center shrink-0 uppercase">
                  {member.name.slice(0, 1)}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {member.name}
                    </p>
                    {member.isMe && (
                      <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300">
                        Você
                      </span>
                    )}
                    {member.isOwner && (
                      <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200">
                        Proprietário
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Sincronizado neste perfil
                  </p>
                </div>
              </div>

              {isHouseholdOwner && !member.isOwner && (
                <button
                  type="button"
                  disabled={removingUid === member.uid}
                  onClick={() => handleRemoveMember(member.uid)}
                  aria-label={`Remover ${member.name}`}
                  className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded cursor-pointer shrink-0 disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Remover
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Códigos de convite ativos */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Códigos de convite ativos ({activeInvites.length})
            </span>
            <button
              type="button"
              onClick={() => setShowJoinForm((v) => !v)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5" />
              {showJoinForm ? 'Cancelar entrada com código' : 'Entrar em outro painel com código'}
            </button>
          </div>

          {activeInvites.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Nenhum código ativo no momento. Clique em <strong>Gerar código de convite</strong> para convidar outra pessoa com login Google.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {activeInvites.map((inv) => (
                <div
                  key={inv.id}
                  className="px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-bold font-mono tracking-wider text-slate-900 dark:text-slate-100">
                      {inv.id}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Uso único · pronto para compartilhar
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleCopyInviteCode(inv.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold bg-slate-900 dark:bg-emerald-600 text-white rounded-md hover:bg-slate-800 cursor-pointer"
                    >
                      {copiedCode === inv.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedCode === inv.id ? 'Copiado!' : 'Copiar'}
                    </button>
                    <button
                      type="button"
                      disabled={inviteBusy}
                      onClick={() => handleDeleteInvite(inv.id)}
                      aria-label={`Excluir código ${inv.id}`}
                      className="p-1.5 text-slate-400 hover:text-red-600 rounded hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {showJoinForm && (
            <form
              onSubmit={handleJoinWithCode}
              className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2.5 duofin-expand-enter"
            >
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Recebeu um código de outra pessoa? Informe abaixo para sincronizar sua conta ao painel dela.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  required
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="Código (ex.: DUOABC123)"
                  className="px-3 py-2 text-xs font-mono uppercase border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950"
                />
                <input
                  type="text"
                  required
                  maxLength={50}
                  value={joinName}
                  onChange={(e) => setJoinName(e.target.value)}
                  placeholder="Seu nome no painel"
                  className="px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950"
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={joining || !joinCode.trim()}
                  className="px-4 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg cursor-pointer disabled:opacity-50"
                >
                  {joining ? 'Sincronizando...' : 'Entrar com código'}
                </button>
              </div>
            </form>
          )}
        </div>
      </section>

      {/* 2. Aparência e Tema Escuro */}
      <section
        id="duofin-theme-section"
        className="scroll-mt-20 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-2.5">
            {theme === 'dark' ? (
              <Moon className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            ) : (
              <Sun className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            )}
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Aparência e Tema Escuro</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Alterne entre o modo claro e o modo escuro. A preferência fica salva neste dispositivo.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg shrink-0 self-start sm:self-center">
            <button
              type="button"
              onClick={() => setTheme('light')}
              className={`inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                theme === 'light'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
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
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <Moon className="w-3.5 h-3.5" />
              Escuro
            </button>
          </div>
        </div>

        <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setShowSemanticLegend((v) => !v)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
          >
            {showSemanticLegend ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {showSemanticLegend ? 'Ocultar legenda de cores' : 'Ver legenda de cores'}
          </button>

          {showSemanticLegend && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-3 text-xs duofin-expand-enter">
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                <span className="w-3 h-3 rounded-full bg-emerald-600 shrink-0" />
                <span className="text-slate-700 dark:text-slate-300">
                  <strong>Verde:</strong> Positivo, entradas e sobra
                </span>
              </div>
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                <span className="w-3 h-3 rounded-full bg-amber-500 shrink-0" />
                <span className="text-slate-700 dark:text-slate-300">
                  <strong>Amarelo / Laranja:</strong> Melhora ou piora
                </span>
              </div>
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                <span className="w-3 h-3 rounded-full bg-red-600 shrink-0" />
                <span className="text-slate-700 dark:text-slate-300">
                  <strong>Vermelho:</strong> Negativo, despesas e déficit
                </span>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Contas Bancárias & Carteiras (Manuais) */}
      <section
        id="duofin-bank-accounts-section"
        className="scroll-mt-20 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <Landmark className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Contas Bancárias e Carteiras</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
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

        <div className="space-y-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
              <Wallet className="w-4 h-4 text-slate-500" />
              Saldo total nas contas ({bankAccounts.filter((a) => a.active).length})
            </span>
            <span
              className={`text-sm font-bold font-mono tabular-nums ${
                totalAccountsBalance >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
              }`}
            >
              {formatBRL(totalAccountsBalance)}
            </span>
          </div>

          {bankAccounts.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 py-2">
              Nenhuma conta com saldo cadastrada ainda. Clique em <strong>Adicionar conta</strong> para informar o saldo disponível no Início e no Horizonte.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {bankAccounts.map((acc) => (
                <div
                  key={acc.id}
                  className="p-3 border border-slate-200 dark:border-slate-800 rounded-lg bg-slate-50/60 dark:bg-slate-800/50 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">{acc.name}</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {acc.institution} · {acc.type}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`text-xs font-bold font-mono tabular-nums ${
                        acc.balance >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {formatBRL(acc.balance)}
                    </span>
                    <button
                      type="button"
                      onClick={() => openAccountForm(acc)}
                      className="text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white px-1.5 py-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
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

      {/* 4. Gerenciador de Categorias (Despesas vs Receitas) com ícones personalizáveis */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <Tag className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Categorias de Receitas e Despesas
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Grupos independentes com ícones exclusivos. Cada tipo aparece somente nos lançamentos correspondentes.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg shrink-0 self-start sm:self-center">
            <button
              type="button"
              onClick={() => setCatTab('Saída')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                catTab === 'Saída'
                  ? 'bg-red-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Despesas ({expenseCategories.length})
            </button>
            <button
              type="button"
              onClick={() => setCatTab('Entrada')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                catTab === 'Entrada'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Receitas ({incomeCategories.length})
            </button>
          </div>
        </div>

        {catFeedback && (
          <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900 rounded-lg text-xs text-emerald-700 dark:text-emerald-300">
            {catFeedback}
          </div>
        )}

        {/* Lista de categorias do grupo ativo */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {visibleCategories.map((cat) => {
            const isEditing = editingCat === cat;
            return (
              <div
                key={cat}
                className="p-2.5 border border-slate-200 dark:border-slate-800 rounded-lg bg-slate-50/70 dark:bg-slate-800/50 space-y-2"
              >
                {isEditing ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        maxLength={40}
                        value={editingCatName}
                        onChange={(e) => setEditingCatName(e.target.value)}
                        className="flex-1 px-2.5 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-md bg-white dark:bg-slate-900"
                      />
                      <button
                        type="button"
                        disabled={catBusy}
                        onClick={() => handleSaveCategoryEdit(cat)}
                        aria-label="Confirmar edição da categoria"
                        className="p-1.5 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer disabled:opacity-60"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingCat(null)}
                        aria-label="Cancelar edição"
                        className="p-1.5 rounded-md text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {CATEGORY_ICON_OPTIONS.slice(0, 18).map((opt) => {
                        const OptIcon = opt.Icon;
                        const active = editingCatIcon === opt.key;
                        return (
                          <button
                            key={opt.key}
                            type="button"
                            title={opt.label}
                            onClick={() => setEditingCatIcon(opt.key)}
                            className={`w-7 h-7 rounded-md flex items-center justify-center border cursor-pointer ${
                              active
                                ? 'bg-slate-900 dark:bg-emerald-600 text-white border-slate-900 dark:border-emerald-600'
                                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            <OptIcon className="w-3.5 h-3.5" />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <CategoryBadgeIcon
                        category={cat}
                        type={catTab}
                        size="sm"
                        customIcons={household.categoryIcons}
                      />
                      <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {cat}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => startEditCategory(cat)}
                        aria-label={`Editar categoria ${cat}`}
                        className="p-1 text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 rounded hover:bg-slate-200/70 dark:hover:bg-slate-700 cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      {visibleCategories.length > 1 && (
                        <button
                          type="button"
                          disabled={catBusy}
                          onClick={() => handleDeleteCategory(cat)}
                          aria-label={`Remover categoria ${cat}`}
                          className="p-1 text-slate-400 hover:text-red-600 rounded hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer disabled:opacity-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Adicionar nova categoria + escolha de ícone */}
        <form onSubmit={handleAddCategory} className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              maxLength={40}
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              placeholder={
                catTab === 'Entrada'
                  ? 'Nova categoria de receita (ex.: Pró-labore, Dividendos)...'
                  : 'Nova categoria de despesa (ex.: Pet, Academia)...'
              }
              className="flex-1 px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950"
            />
            <button
              type="submit"
              disabled={catBusy || !newCatName.trim()}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold bg-slate-900 dark:bg-emerald-600 text-white rounded-lg hover:bg-slate-800 disabled:opacity-50 cursor-pointer shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              Adicionar em {catTab === 'Entrada' ? 'Receitas' : 'Despesas'}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-slate-500 dark:text-slate-400 mr-1">Ícone:</span>
            {CATEGORY_ICON_OPTIONS.slice(0, 16).map((opt) => {
              const OptIcon = opt.Icon;
              const active = newCatIcon === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  title={opt.label}
                  onClick={() => setNewCatIcon(opt.key)}
                  className={`w-7 h-7 rounded-md flex items-center justify-center border cursor-pointer transition-colors ${
                    active
                      ? 'bg-slate-900 dark:bg-emerald-600 text-white border-slate-900 dark:border-emerald-600'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <OptIcon className="w-3.5 h-3.5" />
                </button>
              );
            })}
          </div>
        </form>
      </section>

      {/* Formulário de Perfil e Configurações Avançadas recolhíveis */}
      <form
        id="duofin-profile-section"
        onSubmit={handleSave}
        className="scroll-mt-20 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Perfil do painel</h2>
          <button
            type="button"
            onClick={() => setShowAdvancedLists((v) => !v)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 cursor-pointer self-start sm:self-center"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            {showAdvancedLists ? 'Ocultar configurações avançadas' : 'Configurações avançadas (listas e período)'}
            {showAdvancedLists ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

        {error && <div className="p-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-lg text-xs text-red-700 dark:text-red-300">{error}</div>}
        {savedMsg && <div className="p-3 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900 rounded-lg text-xs text-emerald-700 dark:text-emerald-300">{savedMsg}</div>}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Nome do painel</label>
            <input
              type="text"
              required
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Seu nome nos lançamentos</label>
            <input
              type="text"
              required
              maxLength={50}
              value={partner1Name}
              onChange={(e) => setPartner1Name(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950"
            />
          </div>
        </div>

        {showAdvancedLists && (
          <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800 duofin-expand-enter">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Listas auxiliares avançadas (separe os itens por vírgula).
            </p>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Início do período (12 meses)</label>
              <input
                type="month"
                required
                value={periodStart.slice(0, 7)}
                onChange={(e) => setPeriodStart(`${e.target.value}-01`)}
                className="w-full sm:w-56 px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Contas bancárias / carteiras</label>
              <input
                type="text"
                value={accountsText}
                onChange={(e) => setAccountsText(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Formas de pagamento</label>
              <input
                type="text"
                value={paymentMethodsText}
                onChange={(e) => setPaymentMethodsText(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Categorias / ambientes (Futuras Compras e Projetos)
              </label>
              <input
                type="text"
                value={roomsText}
                onChange={(e) => setRoomsText(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Lista geral de categorias (compatibilidade)</label>
              <input
                type="text"
                value={categoriesText}
                onChange={(e) => setCategoriesText(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950"
              />
            </div>
          </div>
        )}

        <div className="flex justify-end pt-2 border-t border-slate-100 dark:border-slate-800">
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2.5 bg-slate-900 dark:bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-slate-800 dark:hover:bg-emerald-500 disabled:opacity-60 cursor-pointer"
          >
            {saving ? 'Salvando...' : 'Salvar configurações'}
          </button>
        </div>
      </form>

      {/* 6. Instalar no celular (Android, APK e iPhone / iOS) */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-2.5">
            <Smartphone className="w-5 h-5 text-slate-700 dark:text-slate-300 shrink-0 mt-0.5" />
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Instalar no celular (Android, APK e iOS)</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Instale o DuoFin na tela inicial do Android ou iPhone/iPad (Apple), com uso offline e sincronização automática ao reconectar.
              </p>
            </div>
          </div>
          <PWAInstallButton variant="card" showFallbackInfo />
        </div>

        <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setShowInstallGuide((v) => !v)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
            >
              {showInstallGuide ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              {showInstallGuide ? 'Ocultar instruções de instalação' : 'Ver instruções de instalação'}
            </button>

            {!isInstalled && (
              <button
                type="button"
                disabled={refreshingPwa}
                onClick={async () => {
                  setRefreshingPwa(true);
                  await refreshPWA();
                }}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer disabled:opacity-60"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshingPwa ? 'animate-spin' : ''}`} />
                {refreshingPwa ? 'Atualizando versão...' : 'Verificar atualização do app'}
              </button>
            )}
          </div>

          {showInstallGuide && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 text-xs text-slate-600 dark:text-slate-300 duofin-expand-enter">
              <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-100 dark:border-slate-800 space-y-1">
                <p className="font-semibold text-slate-900 dark:text-slate-100">Android (Chrome / App direto)</p>
                <p>
                  Abra no Google Chrome e toque em <strong>Instalar no celular (PWA)</strong> acima ou no menu <strong>⋮</strong> &rarr; <strong>Instalar aplicativo</strong>.
                </p>
              </div>
              <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-100 dark:border-slate-800 space-y-1">
                <p className="font-semibold text-slate-900 dark:text-slate-100">Arquivo .APK instalável</p>
                <p>
                  Para gerar o arquivo <strong>.apk</strong> fora do navegador, use o fluxo automático do repositório (Capacitor Android) ou gere o pacote Android pela URL compartilhada no PWABuilder.
                </p>
              </div>
              <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-100 dark:border-slate-800 space-y-1">
                <p className="font-semibold text-slate-900 dark:text-slate-100">Apple (iPhone / iPad — iOS)</p>
                <p>
                  Abra no <strong>Safari</strong>, toque em <strong>Compartilhar</strong> e selecione <strong>Adicionar à Tela de Início</strong>. Suporta modo tela cheia, área segura do notch e cache offline.
                </p>
              </div>
            </div>
          )}
        </div>
      </section>

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
