import React, { useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Landmark,
  Pencil,
  PiggyBank,
  Plus,
  Trash2,
  TrendingUp,
  X,
} from 'lucide-react';
import { useFinance } from '../context/AuthHouseholdContext';
import type { BankAccount, BankAccountType, Goal, GoalMovementType } from '../types/finance';
import { ModalPortal } from '../components/ModalPortal';
import {
  computeGoalProjection,
  formatBRL,
  formatDateBR,
  formatMonthShort,
  formatPct,
  getHouseholdPeople,
  getTodayISO,
  parseSignedDecimal,
  sanitizeSignedDecimalInput,
} from '../utils/financeCalculations';

type InvestmentHubTab = 'cofrinho' | 'poupanca' | 'historico';

export function GoalsPage() {
  const {
    household,
    goals,
    goalMovements,
    bankAccounts,
    currentPartnerName,
    saveGoal,
    deleteGoal,
    addGoalMovement,
    deleteGoalMovement,
    saveBankAccount,
    deleteBankAccount,
  } = useFinance();

  const [activeTab, setActiveTab] = useState<InvestmentHubTab>('cofrinho');

  // Modal Cofrinho/Meta
  const [goalModalOpen, setGoalModalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [name, setName] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [currentAmount, setCurrentAmount] = useState('0');
  const [monthlyContribution, setMonthlyContribution] = useState('0');
  const [annualYieldPct, setAnnualYieldPct] = useState('10.5');
  const [notes, setNotes] = useState('');
  const [savingGoal, setSavingGoal] = useState(false);
  const [goalError, setGoalError] = useState('');

  // Modal Movimentação (Depósito / Retirada)
  const [movModalGoal, setMovModalGoal] = useState<Goal | null>(null);
  const [movType, setMovType] = useState<GoalMovementType>('Depósito');
  const [movAmount, setMovAmount] = useState('');
  const [movDate, setMovDate] = useState(getTodayISO());
  const [movPerson, setMovPerson] = useState(currentPartnerName);
  const [movNotes, setMovNotes] = useState('');
  const [savingMov, setSavingMov] = useState(false);
  const [movError, setMovError] = useState('');

  // Modal Conta Poupança / Investimento
  const [accModalOpen, setAccModalOpen] = useState(false);
  const [editingAcc, setEditingAcc] = useState<BankAccount | null>(null);
  const [accName, setAccName] = useState('');
  const [accInstitution, setAccInstitution] = useState('');
  const [accType, setAccType] = useState<BankAccountType>('Poupança');
  const [accBalance, setAccBalance] = useState('');
  const [accYieldPct, setAccYieldPct] = useState('6.17');
  const [savingAcc, setSavingAcc] = useState(false);
  const [accError, setAccError] = useState('');

  // Edição inline rápida da % da Poupança / Investimento ou Cofrinho
  const [inlineAccRateId, setInlineAccRateId] = useState<string | null>(null);
  const [inlineAccRateValue, setInlineAccRateValue] = useState('');
  const [savingInlineAccRate, setSavingInlineAccRate] = useState(false);
  const [inlineGoalRateId, setInlineGoalRateId] = useState<string | null>(null);
  const [inlineGoalRateValue, setInlineGoalRateValue] = useState('');
  const [savingInlineGoalRate, setSavingInlineGoalRate] = useState(false);

  const investmentAccounts = useMemo(
    () => bankAccounts.filter((a) => a.active && (a.type === 'Poupança' || a.type === 'Investimento')),
    [bankAccounts]
  );

  const getAccountAnnualYieldRate = (acc: BankAccount): number => {
    if (typeof acc.annualYieldRate === 'number' && Number.isFinite(acc.annualYieldRate)) {
      return acc.annualYieldRate;
    }
    return acc.type === 'Poupança' ? 0.0617 : 0.105;
  };

  const summary = useMemo(() => {
    let totalSavedGoals = 0;
    let totalMonthly = 0;
    let totalProjected12 = 0;
    let totalYield12 = 0;
    for (const g of goals) {
      const p = computeGoalProjection(g);
      totalSavedGoals += g.currentAmount;
      totalMonthly += g.monthlyContribution;
      totalProjected12 += p.balanceIn12Months;
      totalYield12 += p.estimated12MonthYield;
    }
    let totalInInvestmentAccounts = 0;
    let accountsYield12 = 0;
    for (const acc of investmentAccounts) {
      totalInInvestmentAccounts += acc.balance;
      const rate = getAccountAnnualYieldRate(acc);
      if (acc.balance > 0 && rate > 0) {
        accountsYield12 += acc.balance * rate;
      }
    }
    const totalConsolidated = totalSavedGoals + totalInInvestmentAccounts;
    return {
      totalSavedGoals,
      totalInInvestmentAccounts,
      totalConsolidated,
      totalMonthly,
      totalProjected12: totalProjected12 + totalInInvestmentAccounts + accountsYield12,
      totalYield12: totalYield12 + accountsYield12,
    };
  }, [goals, investmentAccounts]);

  const openNewGoal = () => {
    setEditingGoal(null);
    setName('');
    setTargetAmount('');
    setCurrentAmount('0');
    setMonthlyContribution('0');
    setAnnualYieldPct('10.5');
    setNotes('');
    setGoalError('');
    setGoalModalOpen(true);
  };

  const openEditGoal = (g: Goal) => {
    setEditingGoal(g);
    setName(g.name);
    setTargetAmount(String(g.targetAmount));
    setCurrentAmount(String(g.currentAmount));
    setMonthlyContribution(String(g.monthlyContribution));
    setAnnualYieldPct((g.annualYieldRate * 100).toFixed(2));
    setNotes(g.notes);
    setGoalError('');
    setGoalModalOpen(true);
  };

  const handleSaveGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    setGoalError('');
    const t = Number(targetAmount.replace(',', '.'));
    if (!Number.isFinite(t) || t <= 0) {
      setGoalError('Informe o valor desejado da meta.');
      return;
    }
    setSavingGoal(true);
    try {
      await saveGoal(
        {
          name,
          targetAmount: t,
          currentAmount: Number(currentAmount.replace(',', '.')) || 0,
          monthlyContribution: Number(monthlyContribution.replace(',', '.')) || 0,
          annualYieldRate: (Number(annualYieldPct.replace(',', '.')) || 0) / 100,
          notes,
        },
        editingGoal?.id
      );
      setGoalModalOpen(false);
    } catch (err) {
      setGoalError(err instanceof Error ? err.message : 'Erro ao salvar objetivo.');
    } finally {
      setSavingGoal(false);
    }
  };

  const openMovement = (g: Goal, type: GoalMovementType) => {
    setMovModalGoal(g);
    setMovType(type);
    setMovAmount('');
    setMovDate(getTodayISO());
    setMovPerson(currentPartnerName);
    setMovNotes('');
    setMovError('');
  };

  const handleSaveMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!movModalGoal) return;
    setMovError('');
    const parsedSigned = parseSignedDecimal(movAmount);
    const amt = Number.isFinite(parsedSigned) ? Math.abs(parsedSigned) : NaN;
    if (!Number.isFinite(amt) || amt <= 0) {
      setMovError('Informe um valor diferente de zero.');
      return;
    }
    const effectiveType: GoalMovementType = parsedSigned < 0 ? 'Retirada' : movType;
    setSavingMov(true);
    try {
      await addGoalMovement({
        goalId: movModalGoal.id,
        goalName: movModalGoal.name,
        type: effectiveType,
        amount: amt,
        date: movDate,
        person: movPerson,
        notes: movNotes,
      });
      setMovModalGoal(null);
    } catch (err) {
      setMovError(err instanceof Error ? err.message : 'Erro ao registrar movimentação.');
    } finally {
      setSavingMov(false);
    }
  };

  const openNewAccount = () => {
    setEditingAcc(null);
    setAccName('');
    setAccInstitution('');
    setAccType('Poupança');
    setAccBalance('');
    setAccYieldPct('6.17');
    setAccError('');
    setAccModalOpen(true);
  };

  const openEditAccount = (acc: BankAccount) => {
    setEditingAcc(acc);
    setAccName(acc.name);
    setAccInstitution(acc.institution);
    setAccType(acc.type === 'Poupança' ? 'Poupança' : 'Investimento');
    setAccBalance(String(acc.balance));
    setAccYieldPct((getAccountAnnualYieldRate(acc) * 100).toFixed(2));
    setAccError('');
    setAccModalOpen(true);
  };

  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setAccError('');
    const num = parseSignedDecimal(accBalance);
    const pctNum = parseSignedDecimal(accYieldPct);
    if (!accName.trim() || !Number.isFinite(num)) {
      setAccError('Informe o nome e o saldo atual.');
      return;
    }
    if (!Number.isFinite(pctNum) || pctNum < 0 || pctNum > 500) {
      setAccError('Informe uma taxa anual válida (0% a 500%).');
      return;
    }
    setSavingAcc(true);
    try {
      await saveBankAccount(
        {
          name: accName.trim(),
          institution: accInstitution.trim() || 'Manual',
          type: accType,
          balance: num,
          annualYieldRate: pctNum / 100,
          currency: 'BRL',
          lastSyncedAt: editingAcc?.lastSyncedAt ?? '',
          active: true,
        },
        editingAcc?.id
      );
      setAccModalOpen(false);
    } catch (err) {
      setAccError(err instanceof Error ? err.message : 'Erro ao salvar conta de investimento.');
    } finally {
      setSavingAcc(false);
    }
  };

  const handleSaveInlineAccountRate = async (acc: BankAccount) => {
    const pct = Number(inlineAccRateValue.replace(',', '.'));
    if (!Number.isFinite(pct) || pct < 0 || pct > 500) return;
    setSavingInlineAccRate(true);
    try {
      await saveBankAccount(
        {
          name: acc.name,
          institution: acc.institution,
          type: acc.type,
          balance: acc.balance,
          annualYieldRate: pct / 100,
          currency: acc.currency,
          lastSyncedAt: acc.lastSyncedAt,
          active: acc.active,
        },
        acc.id
      );
      setInlineAccRateId(null);
    } finally {
      setSavingInlineAccRate(false);
    }
  };

  const handleSaveInlineGoalRate = async (g: Goal) => {
    const pct = Number(inlineGoalRateValue.replace(',', '.'));
    if (!Number.isFinite(pct) || pct < 0 || pct > 500) return;
    setSavingInlineGoalRate(true);
    try {
      await saveGoal(
        {
          name: g.name,
          targetAmount: g.targetAmount,
          currentAmount: g.currentAmount,
          monthlyContribution: g.monthlyContribution,
          annualYieldRate: pct / 100,
          notes: g.notes,
        },
        g.id
      );
      setInlineGoalRateId(null);
    } finally {
      setSavingInlineGoalRate(false);
    }
  };

  if (!household) return null;
  const peopleOptions = getHouseholdPeople(household);

  return (
    <div className="space-y-6">
      {/* Cabeçalho Unificado do Hub Investimentos */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Investimentos e Cofrinho</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Metas de economia, cofrinho do casal, contas de poupança/investimento e projeções de rendimento.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {activeTab === 'poupanca' ? (
            <button
              type="button"
              onClick={openNewAccount}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white text-xs font-semibold rounded-xl hover:bg-emerald-700 cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              Nova poupança / aplicação
            </button>
          ) : (
            <button
              type="button"
              onClick={openNewGoal}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white text-xs font-semibold rounded-xl hover:bg-slate-800 cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              Novo cofrinho / meta
            </button>
          )}
        </div>
      </div>

      {/* Navegação em Abas do Hub Investimentos */}
      <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200/80">
        {(
          [
            { id: 'cofrinho', label: 'Cofrinho & Metas', icon: PiggyBank },
            { id: 'poupanca', label: 'Poupança & Contas', icon: Landmark },
            { id: 'historico', label: 'Rendimentos & Aportes', icon: TrendingUp },
          ] as Array<{ id: InvestmentHubTab; label: string; icon: React.ComponentType<{ className?: string }> }>
        ).map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`min-h-[42px] px-2 sm:px-3 py-2 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                active
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 shrink-0 ${active ? 'text-emerald-600' : 'text-slate-400'}`} />
              <span className="truncate">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* KPIs Consolidados */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900 text-white rounded-2xl p-5 space-y-1.5">
          <span className="text-xs font-medium text-slate-300">Patrimônio acumulado</span>
          <p className="text-2xl font-bold font-mono tabular-nums text-emerald-300">
            {formatBRL(summary.totalConsolidated)}
          </p>
          <p className="text-[11px] text-slate-300">
            Cofrinhos {formatBRL(summary.totalSavedGoals)} + Contas {formatBRL(summary.totalInInvestmentAccounts)}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-1.5">
          <span className="text-xs font-medium text-slate-500">Aporte mensal planejado</span>
          <p className="text-2xl font-bold font-mono tabular-nums text-slate-900">{formatBRL(summary.totalMonthly)}</p>
          <p className="text-[11px] text-slate-500">{goals.length} cofrinho(s) ativo(s)</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-1.5">
          <span className="text-xs font-medium text-slate-500">Saldo projetado (12 meses)</span>
          <p className="text-2xl font-bold font-mono tabular-nums text-slate-900">
            {formatBRL(summary.totalProjected12)}
          </p>
          <p className="text-[11px] text-slate-500">Com aportes e taxa das aplicações</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-1.5">
          <span className="text-xs font-medium text-slate-500">Rendimento estimado (12m)</span>
          <p className="text-2xl font-bold font-mono tabular-nums text-emerald-700">
            {formatBRL(summary.totalYield12)}
          </p>
          <p className="text-[11px] text-slate-500">Cofrinhos e poupança/investimentos</p>
        </div>
      </section>

      {/* ABA 1: COFRINHO & METAS */}
      {activeTab === 'cofrinho' && (
        <div key="cofrinho" className="duofin-tab-enter">
          {goals.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center space-y-3">
              <PiggyBank className="w-8 h-8 text-emerald-600 mx-auto" />
              <p className="text-sm font-medium text-slate-700">Nenhum cofrinho ou meta de economia cadastrado.</p>
              <p className="text-xs text-slate-500">
                Crie uma reserva de emergência, viagem ou reforma para acompanhar depósitos e rendimento.
              </p>
              <button
                type="button"
                onClick={openNewGoal}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white text-xs font-semibold rounded-xl hover:bg-slate-800 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Criar primeiro objetivo
              </button>
            </div>
          ) : (
            <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {goals.map((g) => {
                const proj = computeGoalProjection(g);
                return (
                  <div key={g.id} className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="text-base font-semibold text-slate-900 truncate">{g.name}</h3>
                        <p className="text-xs text-slate-500 mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1">
                          <span>Meta {formatBRL(g.targetAmount)}</span>
                          <span>·</span>
                          <span>Aporte {formatBRL(g.monthlyContribution)}/mês</span>
                          <span>·</span>
                          {inlineGoalRateId === g.id ? (
                            <span className="inline-flex items-center gap-1">
                              <input
                                type="text"
                                inputMode="decimal"
                                aria-label={`Taxa anual de ${g.name}`}
                                value={inlineGoalRateValue}
                                onChange={(e) => setInlineGoalRateValue(e.target.value.replace(/[^0-9.,]/g, ''))}
                                className="w-16 px-1.5 py-0.5 text-xs font-mono tabular-nums border border-emerald-300 rounded bg-white text-slate-900"
                              />
                              <span>% a.a.</span>
                              <button
                                type="button"
                                disabled={savingInlineGoalRate}
                                onClick={() => handleSaveInlineGoalRate(g)}
                                className="px-2 py-0.5 text-[11px] font-semibold bg-emerald-600 text-white rounded hover:bg-emerald-700 cursor-pointer"
                              >
                                Salvar
                              </button>
                              <button
                                type="button"
                                onClick={() => setInlineGoalRateId(null)}
                                className="px-1.5 py-0.5 text-[11px] text-slate-500 hover:text-slate-900 cursor-pointer"
                              >
                                Cancelar
                              </button>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setInlineGoalRateId(g.id);
                                setInlineGoalRateValue((g.annualYieldRate * 100).toFixed(2));
                              }}
                              title="Clique para editar a % de rendimento"
                              className="inline-flex items-center gap-1 font-semibold text-emerald-700 hover:underline cursor-pointer"
                            >
                              {formatPct(g.annualYieldRate, 2)} a.a. (editar %)
                            </button>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => openEditGoal(g)}
                          aria-label={`Editar ${g.name}`}
                          className="p-1.5 text-slate-400 hover:text-slate-900 rounded-lg hover:bg-slate-100 cursor-pointer"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteGoal(g.id)}
                          aria-label={`Excluir ${g.name}`}
                          className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-baseline justify-between">
                        <span className="text-2xl font-bold font-mono tabular-nums text-slate-900">
                          {formatBRL(g.currentAmount)}
                        </span>
                        <span className="text-sm font-semibold font-mono tabular-nums text-emerald-700">
                          {proj.progressPct.toFixed(1).replace('.', ',')}%
                        </span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-600 rounded-full transition-all"
                          style={{ width: `${Math.min(100, proj.progressPct)}%` }}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100 text-xs">
                      <div>
                        <p className="text-slate-500">Em 12 meses</p>
                        <p className="font-mono tabular-nums font-semibold text-slate-900 mt-0.5">
                          {formatBRL(proj.balanceIn12Months)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-slate-500">Previsão da meta</p>
                        <p className="font-semibold text-slate-900 mt-0.5">
                          {proj.monthsToGoal === 0
                            ? 'Meta atingida'
                            : proj.completionMonthKey
                              ? `${formatMonthShort(proj.completionMonthKey)} (${proj.monthsToGoal}m)`
                              : 'Defina um aporte'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => openMovement(g, 'Depósito')}
                        className="flex-1 min-h-[40px] inline-flex items-center justify-center gap-1.5 py-2 px-3 bg-emerald-600 text-white text-xs font-semibold rounded-xl hover:bg-emerald-700 cursor-pointer"
                      >
                        <ArrowDownLeft className="w-3.5 h-3.5" />
                        Depositar
                      </button>
                      <button
                        type="button"
                        onClick={() => openMovement(g, 'Retirada')}
                        className="flex-1 min-h-[40px] inline-flex items-center justify-center gap-1.5 py-2 px-3 bg-white border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl hover:bg-slate-50 cursor-pointer"
                      >
                        <ArrowUpRight className="w-3.5 h-3.5" />
                        Retirar
                      </button>
                    </div>
                  </div>
                );
              })}
            </section>
          )}
        </div>
      )}

      {/* ABA 2: POUPANÇA & CONTAS DE INVESTIMENTO */}
      {activeTab === 'poupanca' && (
        <section key="poupanca" className="duofin-tab-enter space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Contas de Poupança e Investimentos</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Saldos dedicados a reserva, CDB, Tesouro ou poupança com edição rápida da taxa anual (%).
              </p>
            </div>
            <button
              type="button"
              onClick={openNewAccount}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-slate-900 text-white text-xs font-semibold rounded-xl hover:bg-slate-800 cursor-pointer shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              Adicionar conta
            </button>
          </div>

          {investmentAccounts.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center space-y-3">
              <Landmark className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-sm font-medium text-slate-700">
                Nenhuma conta de Poupança ou Investimento cadastrada ainda.
              </p>
              <p className="text-xs text-slate-500">
                Cadastre sua caixinha, CDB, Tesouro Direto ou conta poupança para projetar os rendimentos.
              </p>
              <button
                type="button"
                onClick={openNewAccount}
                className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-xs font-semibold rounded-xl hover:bg-emerald-700 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Cadastrar poupança ou investimento
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {investmentAccounts.map((acc) => {
                const rate = getAccountAnnualYieldRate(acc);
                const estimated12m = Math.max(0, acc.balance) * rate;
                return (
                  <div
                    key={acc.id}
                    className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                          <Landmark className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900 truncate">{acc.name}</p>
                          <p className="text-xs text-slate-500 truncate">
                            {acc.type} · {acc.institution}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-base font-bold font-mono tabular-nums text-emerald-700">
                          {formatBRL(acc.balance)}
                        </span>
                        <div className="flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => openEditAccount(acc)}
                            aria-label={`Editar ${acc.name}`}
                            className="p-1.5 text-slate-400 hover:text-slate-900 rounded-lg hover:bg-slate-100 cursor-pointer"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteBankAccount(acc.id)}
                            aria-label={`Excluir ${acc.name}`}
                            className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500">Rendimento:</span>
                        {inlineAccRateId === acc.id ? (
                          <span className="inline-flex items-center gap-1.5">
                            <input
                              type="text"
                              inputMode="decimal"
                              aria-label={`Taxa anual de ${acc.name}`}
                              value={inlineAccRateValue}
                              onChange={(e) => setInlineAccRateValue(e.target.value.replace(/[^0-9.,]/g, ''))}
                              className="w-16 px-2 py-1 text-xs font-mono tabular-nums border border-emerald-300 rounded-md bg-white text-slate-900"
                            />
                            <span className="text-slate-500">% a.a.</span>
                            <button
                              type="button"
                              disabled={savingInlineAccRate}
                              onClick={() => handleSaveInlineAccountRate(acc)}
                              className="px-2.5 py-1 text-[11px] font-semibold bg-emerald-600 text-white rounded-md hover:bg-emerald-700 cursor-pointer"
                            >
                              Salvar
                            </button>
                            <button
                              type="button"
                              onClick={() => setInlineAccRateId(null)}
                              className="px-1.5 py-1 text-[11px] text-slate-500 hover:text-slate-900 cursor-pointer"
                            >
                              Cancelar
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setInlineAccRateId(acc.id);
                              setInlineAccRateValue((rate * 100).toFixed(2));
                            }}
                            className="inline-flex items-center gap-1 font-semibold font-mono tabular-nums text-emerald-700 hover:underline cursor-pointer"
                          >
                            {formatPct(rate, 2)} a.a. · Editar %
                          </button>
                        )}
                      </div>
                      <span className="text-slate-500 font-mono tabular-nums">
                        +{formatBRL(estimated12m)}/ano
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* ABA 3: HISTÓRICO & RENDIMENTOS */}
      {activeTab === 'historico' && (
        <div key="historico" className="duofin-tab-enter space-y-5">
          {(goals.length > 0 || investmentAccounts.length > 0) && (
            <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100">
                <h2 className="text-base font-semibold text-slate-900">Projeção de rendimento em 12 meses</h2>
              </div>
              <div className="divide-y divide-slate-100">
                {goals.map((g) => {
                  const p = computeGoalProjection(g);
                  return (
                    <div key={g.id} className="px-5 py-3.5 flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">{g.name}</p>
                        <p className="text-xs text-slate-500">
                          Cofrinho · Taxa {formatPct(g.annualYieldRate, 2)} a.a. · Saldo final em 12m:{' '}
                          <strong className="font-mono tabular-nums text-slate-800">{formatBRL(p.balanceIn12Months)}</strong>
                        </p>
                      </div>
                      <span className="text-sm font-bold font-mono tabular-nums text-emerald-700 shrink-0">
                        +{formatBRL(p.estimated12MonthYield)}
                      </span>
                    </div>
                  );
                })}
                {investmentAccounts.map((acc) => {
                  const rate = getAccountAnnualYieldRate(acc);
                  const yield12 = Math.max(0, acc.balance) * rate;
                  return (
                    <div key={acc.id} className="px-5 py-3.5 flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">{acc.name}</p>
                        <p className="text-xs text-slate-500">
                          {acc.type} · Taxa {formatPct(rate, 2)} a.a. · Saldo em 12m:{' '}
                          <strong className="font-mono tabular-nums text-slate-800">
                            {formatBRL(acc.balance + yield12)}
                          </strong>
                        </p>
                      </div>
                      <span className="text-sm font-bold font-mono tabular-nums text-emerald-700 shrink-0">
                        +{formatBRL(yield12)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-900">Histórico de depósitos e retiradas</h2>
            </div>
            {goalMovements.length === 0 ? (
              <p className="p-8 text-center text-sm text-slate-500">
                Nenhuma movimentação registrada nos cofrinhos até agora.
              </p>
            ) : (
              <div className="divide-y divide-slate-100">
                {goalMovements.map((m) => (
                  <div key={m.id} className="px-5 py-3.5 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">
                        {m.type} · {m.goalName}
                      </p>
                      <p className="text-xs text-slate-500">
                        {formatDateBR(m.date)} · {m.person} · Por {m.createdByName}
                        {m.notes ? ` · ${m.notes}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span
                        className={`text-sm font-semibold font-mono tabular-nums ${
                          m.type === 'Depósito' ? 'text-emerald-700' : 'text-red-600'
                        }`}
                      >
                        {m.type === 'Depósito' ? '+' : '−'} {formatBRL(m.amount)}
                      </span>
                      <button
                        type="button"
                        onClick={() => deleteGoalMovement(m)}
                        title="Estornar e excluir movimentação"
                        className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* Modal Objetivo */}
      {goalModalOpen && (
        <ModalPortal>
          <div
            className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/45 backdrop-blur-[2px] pt-3 px-3 pb-6 sm:pt-8 sm:px-4 overflow-y-auto duofin-backdrop-enter"
            onClick={(e) => {
              if (e.target === e.currentTarget) setGoalModalOpen(false);
            }}
          >
            <div className="duofin-dialog-enter bg-white w-full sm:max-w-md rounded-2xl border border-slate-200 max-h-[88dvh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h3 className="text-base font-semibold text-slate-900">
                {editingGoal ? 'Editar objetivo' : 'Novo cofrinho / meta'}
              </h3>
              <button
                type="button"
                onClick={() => setGoalModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveGoal} className="p-5 space-y-4">
              {goalError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">{goalError}</div>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Nome do objetivo / reserva</label>
                <input
                  type="text"
                  required
                  maxLength={80}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex.: Reserva de emergência, Viagem"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Valor desejado (R$)</label>
                  <input
                    type="number"
                    required
                    step="0.01"
                    min="0.01"
                    value={targetAmount}
                    onChange={(e) => setTargetAmount(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Valor acumulado (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={currentAmount}
                    onChange={(e) => setCurrentAmount(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Aporte mensal (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={monthlyContribution}
                    onChange={(e) => setMonthlyContribution(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Rendimento (% ao ano)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="500"
                    value={annualYieldPct}
                    onChange={(e) => setAnnualYieldPct(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg"
                  />
                </div>
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
                <button
                  type="button"
                  onClick={() => setGoalModalOpen(false)}
                  className="px-4 py-2 text-sm text-slate-600 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingGoal}
                  className="px-5 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 disabled:opacity-60 cursor-pointer"
                >
                  {savingGoal ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* Modal Movimentação */}
      {movModalGoal && (
        <ModalPortal>
          <div
            className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/45 backdrop-blur-[2px] pt-3 px-3 pb-6 sm:pt-8 sm:px-4 overflow-y-auto duofin-backdrop-enter"
            onClick={(e) => {
              if (e.target === e.currentTarget) setMovModalGoal(null);
            }}
          >
            <div className="duofin-dialog-enter bg-white w-full sm:max-w-md rounded-2xl border border-slate-200 max-h-[88dvh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h3 className="text-base font-semibold text-slate-900">
                {movType} — {movModalGoal.name}
              </h3>
              <button
                type="button"
                onClick={() => setMovModalGoal(null)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveMovement} className="p-5 space-y-4">
              {movError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">{movError}</div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Valor (R$)</label>
                  <div className="flex items-stretch gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        const trimmed = movAmount.trimStart();
                        if (trimmed.startsWith('-')) {
                          setMovAmount(trimmed.slice(1));
                        } else {
                          setMovAmount(`-${trimmed}`);
                          setMovType('Retirada');
                        }
                      }}
                      aria-label={movAmount.startsWith('-') ? 'Valor positivo' : 'Valor negativo (Retirada)'}
                      className={`min-w-[40px] px-2 rounded-lg border text-xs font-bold font-mono transition-all cursor-pointer active:scale-95 flex items-center justify-center shrink-0 ${
                        movAmount.startsWith('-')
                          ? 'bg-red-50 border-red-200 text-red-700'
                          : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {movAmount.startsWith('-') ? '−' : '+/−'}
                    </button>
                    <input
                      type="text"
                      inputMode="decimal"
                      required
                      autoFocus
                      value={movAmount}
                      onChange={(e) => {
                        const sanitized = sanitizeSignedDecimalInput(e.target.value, true);
                        setMovAmount(sanitized);
                        if (sanitized.startsWith('-')) {
                          setMovType('Retirada');
                        }
                      }}
                      placeholder="0,00"
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Data</label>
                  <input
                    type="date"
                    required
                    value={movDate}
                    onChange={(e) => setMovDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Responsável</label>
                <select
                  value={movPerson}
                  onChange={(e) => setMovPerson(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                >
                  {peopleOptions.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Observações</label>
                <input
                  type="text"
                  maxLength={300}
                  value={movNotes}
                  onChange={(e) => setMovNotes(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setMovModalGoal(null)}
                  className="px-4 py-2 text-sm text-slate-600 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingMov}
                  className="px-5 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 disabled:opacity-60 cursor-pointer"
                >
                  {savingMov ? 'Registrando...' : `Confirmar ${movType.toLowerCase()}`}
                </button>
              </div>
            </form>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* Modal Poupança / Conta de Investimento */}
      {accModalOpen && (
        <ModalPortal>
          <div
            className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/45 backdrop-blur-[2px] pt-3 px-3 pb-6 sm:pt-8 sm:px-4 overflow-y-auto duofin-backdrop-enter"
            onClick={(e) => {
              if (e.target === e.currentTarget) setAccModalOpen(false);
            }}
          >
            <div className="duofin-dialog-enter bg-white w-full sm:max-w-md rounded-2xl border border-slate-200 max-h-[88dvh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h3 className="text-base font-semibold text-slate-900">
                {editingAcc ? 'Editar conta de investimento' : 'Nova poupança / investimento'}
              </h3>
              <button
                type="button"
                onClick={() => setAccModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveAccount} className="p-5 space-y-4">
              {accError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">{accError}</div>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Nome da aplicação / conta</label>
                <input
                  type="text"
                  required
                  maxLength={80}
                  value={accName}
                  onChange={(e) => setAccName(e.target.value)}
                  placeholder="Ex.: Caixinha Nubank, CDB Itaú, Poupança"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Tipo</label>
                  <select
                    value={accType}
                    onChange={(e) => {
                      const next = e.target.value as BankAccountType;
                      setAccType(next);
                      if (!editingAcc) {
                        setAccYieldPct(next === 'Poupança' ? '6.17' : '10.5');
                      }
                    }}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="Poupança">Poupança</option>
                    <option value="Investimento">Investimento</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Saldo atual (R$)</label>
                  <div className="flex items-stretch gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        const trimmed = accBalance.trimStart();
                        setAccBalance(trimmed.startsWith('-') ? trimmed.slice(1) : `-${trimmed}`);
                      }}
                      aria-label={accBalance.startsWith('-') ? 'Tornar positivo' : 'Tornar negativo'}
                      className={`min-w-[38px] px-2 rounded-lg border text-xs font-bold font-mono transition-all cursor-pointer active:scale-95 flex items-center justify-center shrink-0 ${
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
                      placeholder="0,00"
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg"
                    />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Rendimento (% ao ano)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    required
                    value={accYieldPct}
                    onChange={(e) => setAccYieldPct(e.target.value.replace(/[^0-9.,]/g, ''))}
                    placeholder="6,17"
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Instituição</label>
                  <input
                    type="text"
                    maxLength={80}
                    value={accInstitution}
                    onChange={(e) => setAccInstitution(e.target.value)}
                    placeholder="Ex.: Nubank, Caixa, Inter"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setAccModalOpen(false)}
                  className="px-4 py-2 text-sm text-slate-600 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingAcc}
                  className="px-5 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 disabled:opacity-60 cursor-pointer"
                >
                  {savingAcc ? 'Salvando...' : 'Salvar conta'}
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
