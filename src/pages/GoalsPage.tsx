import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  Calculator,
  Landmark,
  Pencil,
  PiggyBank,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  Trash2,
  TrendingUp,
  X,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ModalPortal } from '../components/ModalPortal';
import { useFinance } from '../context/AuthHouseholdContext';
import { useTheme } from '../context/ThemeContext';
import { auth } from '../firebase';
import type {
  BankAccount,
  BankAccountType,
  BenchmarkIndicators,
  Goal,
  GoalMovementType,
  InvestmentYieldType,
} from '../types/finance';
import { CHART_ANIMATION, getChartTheme, SEMANTIC_COLORS } from '../utils/chartColors';
import {
  compareInvestmentModalities,
  computeGoalProjection,
  computePoupancaAnnualPct,
  DEFAULT_BENCHMARK_INDICATORS,
  formatBRL,
  formatDateBR,
  formatMonthShort,
  formatPct,
  getHouseholdPeople,
  getTodayISO,
  getYieldTypeLabel,
  parseSignedDecimal,
  resolveInvestmentAnnualRatePct,
  sanitizeSignedDecimalInput,
  simulateInvestmentGrowth,
} from '../utils/financeCalculations';

type InvestmentHubTab = 'cofrinho' | 'simulador' | 'poupanca' | 'historico';

const YIELD_OPTIONS: Array<{ id: InvestmentYieldType; label: string; hint: string }> = [
  { id: 'cdi', label: 'CDI', hint: 'Ex.: 100% ou 110% do CDI (com IR regressivo)' },
  { id: 'poupanca', label: 'Poupança', hint: 'Regra oficial com isenção de IR e IOF para PF' },
  { id: 'selic', label: 'Tesouro Selic', hint: 'Taxa Selic anual + eventual custódia B3' },
  { id: 'personalizado', label: 'Personalizado', hint: 'Informe manualmente a taxa anual desejada' },
];

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

  const { isDark } = useTheme();
  const chartTheme = getChartTheme(isDark);

  const [activeTab, setActiveTab] = useState<InvestmentHubTab>('cofrinho');

  // Indicadores financeiros (BCB + ajuste manual)
  const [indicators, setIndicators] = useState<BenchmarkIndicators>(DEFAULT_BENCHMARK_INDICATORS);
  const [loadingIndicators, setLoadingIndicators] = useState(false);
  const [indicatorNotice, setIndicatorNotice] = useState('');
  const [showManualIndicators, setShowManualIndicators] = useState(false);

  const refreshIndicators = useCallback(async () => {
    setLoadingIndicators(true);
    setIndicatorNotice('');
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        setIndicatorNotice('Modo local: usando indicadores de referência padrão.');
        return;
      }
      const res = await fetch('/api/indicators', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Falha ao consultar taxas');
      const data = (await res.json()) as BenchmarkIndicators;
      if (typeof data.cdiAnnualPct === 'number' && typeof data.selicAnnualPct === 'number') {
        setIndicators({
          cdiAnnualPct: data.cdiAnnualPct,
          selicAnnualPct: data.selicAnnualPct,
          trAnnualPct: typeof data.trAnnualPct === 'number' ? data.trAnnualPct : DEFAULT_BENCHMARK_INDICATORS.trAnnualPct,
          poupancaAnnualPct:
            typeof data.poupancaAnnualPct === 'number'
              ? data.poupancaAnnualPct
              : computePoupancaAnnualPct(data.selicAnnualPct, data.trAnnualPct ?? 0.85),
          updatedAt: data.updatedAt || new Date().toISOString(),
          source: data.source === 'bcb' ? 'bcb' : 'fallback',
        });
      }
    } catch {
      setIndicatorNotice('Sem conexão com fonte externa. Você pode ajustar as taxas manualmente.');
    } finally {
      setLoadingIndicators(false);
    }
  }, []);

  useEffect(() => {
    void refreshIndicators();
  }, [refreshIndicators]);

  // Estado do Simulador de Juros Compostos
  const [simInitial, setSimInitial] = useState('5000');
  const [simMonthly, setSimMonthly] = useState('500');
  const [simExtraAmount, setSimExtraAmount] = useState('0');
  const [simExtraMonth, setSimExtraMonth] = useState('6');
  const [simPeriodMode, setSimPeriodMode] = useState<'months' | 'days'>('months');
  const [simTermMonths, setSimTermMonths] = useState('24');
  const [simDurationDays, setSimDurationDays] = useState('15');
  const [simYieldType, setSimYieldType] = useState<InvestmentYieldType>('cdi');
  const [simIndicatorPct, setSimIndicatorPct] = useState('100');
  const [simCustomRatePct, setSimCustomRatePct] = useState('12');
  const [simCustodyFeePct, setSimCustodyFeePct] = useState('0');

  // Modal Caixinha / Meta
  const [goalModalOpen, setGoalModalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [name, setName] = useState('');
  const [objective, setObjective] = useState('');
  const [initialAmount, setInitialAmount] = useState('0');
  const [targetAmount, setTargetAmount] = useState('');
  const [currentAmount, setCurrentAmount] = useState('0');
  const [monthlyContribution, setMonthlyContribution] = useState('0');
  const [termMonths, setTermMonths] = useState('12');
  const [yieldType, setYieldType] = useState<InvestmentYieldType>('cdi');
  const [yieldIndicatorPct, setYieldIndicatorPct] = useState('100');
  const [annualYieldPct, setAnnualYieldPct] = useState(String(DEFAULT_BENCHMARK_INDICATORS.cdiAnnualPct));
  const [custodyFeePct, setCustodyFeePct] = useState('0');
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
  const [accYieldPct, setAccYieldPct] = useState(String(DEFAULT_BENCHMARK_INDICATORS.poupancaAnnualPct));
  const [savingAcc, setSavingAcc] = useState(false);
  const [accError, setAccError] = useState('');

  // Edição inline rápida da % da Poupança / Investimento ou Caixinha
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

  const getAccountAnnualYieldRate = useCallback(
    (acc: BankAccount): number => {
      if (typeof acc.annualYieldRate === 'number' && Number.isFinite(acc.annualYieldRate)) {
        return acc.annualYieldRate;
      }
      return acc.type === 'Poupança' ? indicators.poupancaAnnualPct / 100 : indicators.cdiAnnualPct / 100;
    },
    [indicators.cdiAnnualPct, indicators.poupancaAnnualPct]
  );

  const summary = useMemo(() => {
    let totalSavedGoals = 0;
    let totalMonthly = 0;
    let totalProjected12 = 0;
    let totalYield12 = 0;
    for (const g of goals) {
      const p = computeGoalProjection(g, undefined, indicators);
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
  }, [goals, investmentAccounts, indicators, getAccountAnnualYieldRate]);

  // Cálculos do Simulador de Juros Compostos
  const parsedSimParams = useMemo(() => {
    const initialAmountVal = Math.max(0, Number(simInitial.replace(',', '.')) || 0);
    const monthlyContributionVal = Math.max(0, Number(simMonthly.replace(',', '.')) || 0);
    const extraOneTimeAmountVal = Math.max(0, Number(simExtraAmount.replace(',', '.')) || 0);
    const extraOneTimeMonthVal = Math.max(1, Math.round(Number(simExtraMonth) || 1));
    const termMonthsVal = Math.max(1, Math.min(600, Math.round(Number(simTermMonths) || 12)));
    const durationDaysVal = Math.max(1, Math.min(29, Math.round(Number(simDurationDays) || 15)));
    const indicatorPctVal = Math.max(0, Number(simIndicatorPct.replace(',', '.')) || 100);
    const customRateVal = Math.max(0, Number(simCustomRatePct.replace(',', '.')) || 0);
    const custodyFeeVal = Math.max(0, Number(simCustodyFeePct.replace(',', '.')) || 0);
    return {
      initialAmountVal,
      monthlyContributionVal,
      extraOneTimeAmountVal,
      extraOneTimeMonthVal,
      termMonthsVal,
      durationDaysVal,
      indicatorPctVal,
      customRateVal,
      custodyFeeVal,
    };
  }, [
    simInitial,
    simMonthly,
    simExtraAmount,
    simExtraMonth,
    simTermMonths,
    simDurationDays,
    simIndicatorPct,
    simCustomRatePct,
    simCustodyFeePct,
  ]);

  const simulation = useMemo(
    () =>
      simulateInvestmentGrowth({
        initialAmount: parsedSimParams.initialAmountVal,
        monthlyContribution: parsedSimParams.monthlyContributionVal,
        extraOneTimeAmount: parsedSimParams.extraOneTimeAmountVal,
        extraOneTimeMonth: parsedSimParams.extraOneTimeMonthVal,
        periodMode: simPeriodMode,
        termMonths: parsedSimParams.termMonthsVal,
        durationDays: parsedSimParams.durationDaysVal,
        yieldType: simYieldType,
        yieldIndicatorPct: parsedSimParams.indicatorPctVal,
        customAnnualRatePct: parsedSimParams.customRateVal,
        custodyFeePct: parsedSimParams.custodyFeeVal,
        indicators,
      }),
    [parsedSimParams, simPeriodMode, simYieldType, indicators]
  );

  const modalityComparison = useMemo(
    () =>
      compareInvestmentModalities({
        initialAmount: parsedSimParams.initialAmountVal,
        monthlyContribution: parsedSimParams.monthlyContributionVal,
        extraOneTimeAmount: parsedSimParams.extraOneTimeAmountVal,
        extraOneTimeMonth: parsedSimParams.extraOneTimeMonthVal,
        periodMode: simPeriodMode,
        termMonths: parsedSimParams.termMonthsVal,
        durationDays: parsedSimParams.durationDaysVal,
        cdiIndicatorPct: simYieldType === 'cdi' ? parsedSimParams.indicatorPctVal : 100,
        selicIndicatorPct: simYieldType === 'selic' ? parsedSimParams.indicatorPctVal : 100,
        selicCustodyFeePct: simYieldType === 'selic' ? parsedSimParams.custodyFeeVal : 0.2,
        customAnnualRatePct: parsedSimParams.customRateVal,
        includeCustom: simYieldType === 'personalizado',
        indicators,
      }),
    [parsedSimParams, simPeriodMode, simYieldType, indicators]
  );

  // Prévia ao vivo dentro do modal de Caixinha
  const modalGoalPreview = useMemo(() => {
    const resolvedAnnual = resolveInvestmentAnnualRatePct({
      yieldType,
      yieldIndicatorPct: Number(yieldIndicatorPct.replace(',', '.')) || 100,
      customAnnualRatePct: Number(annualYieldPct.replace(',', '.')) || 0,
      indicators,
    });
    const curVal = Math.max(0, Number(currentAmount.replace(',', '.')) || 0);
    const mVal = Math.max(0, Number(monthlyContribution.replace(',', '.')) || 0);
    const tMonths = Math.max(1, Math.min(600, Math.round(Number(termMonths) || 12)));
    const feeVal = Math.max(0, Number(custodyFeePct.replace(',', '.')) || 0);
    const sim = simulateInvestmentGrowth({
      initialAmount: curVal,
      monthlyContribution: mVal,
      termMonths: tMonths,
      yieldType,
      yieldIndicatorPct: Number(yieldIndicatorPct.replace(',', '.')) || 100,
      customAnnualRatePct: resolvedAnnual,
      custodyFeePct: feeVal,
      indicators,
    });
    return {
      resolvedAnnual,
      tMonths,
      sim,
    };
  }, [yieldType, yieldIndicatorPct, annualYieldPct, currentAmount, monthlyContribution, termMonths, custodyFeePct, indicators]);

  const openNewGoal = () => {
    setEditingGoal(null);
    setName('');
    setObjective('');
    setInitialAmount('0');
    setTargetAmount('');
    setCurrentAmount('0');
    setMonthlyContribution('0');
    setTermMonths('12');
    setYieldType('cdi');
    setYieldIndicatorPct('100');
    setAnnualYieldPct(String(indicators.cdiAnnualPct));
    setCustodyFeePct('0');
    setNotes('');
    setGoalError('');
    setGoalModalOpen(true);
  };

  const openGoalFromSimulation = () => {
    setEditingGoal(null);
    setName('Nova caixinha simulada');
    setObjective(
      simPeriodMode === 'days'
        ? `Reserva de curto prazo (${parsedSimParams.durationDaysVal} dias)`
        : `Meta para ${parsedSimParams.termMonthsVal} meses`
    );
    setInitialAmount(String(parsedSimParams.initialAmountVal));
    setCurrentAmount(String(parsedSimParams.initialAmountVal));
    setMonthlyContribution(String(parsedSimParams.monthlyContributionVal));
    setTargetAmount(String(Math.max(100, Math.round(simulation.netBalance))));
    setTermMonths(String(simPeriodMode === 'days' ? 1 : parsedSimParams.termMonthsVal));
    setYieldType(simYieldType);
    setYieldIndicatorPct(String(parsedSimParams.indicatorPctVal));
    setAnnualYieldPct(simulation.grossAnnualRatePct.toFixed(2));
    setCustodyFeePct(String(parsedSimParams.custodyFeeVal));
    setNotes(`Base: ${simulation.yieldLabel}`);
    setGoalError('');
    setGoalModalOpen(true);
  };

  const openEditGoal = (g: Goal) => {
    const resolvedType: InvestmentYieldType = g.yieldType ?? 'personalizado';
    setEditingGoal(g);
    setName(g.name);
    setObjective(g.objective ?? '');
    setInitialAmount(String(g.initialAmount ?? g.currentAmount));
    setTargetAmount(String(g.targetAmount));
    setCurrentAmount(String(g.currentAmount));
    setMonthlyContribution(String(g.monthlyContribution));
    setTermMonths(String(g.termMonths ?? 12));
    setYieldType(resolvedType);
    setYieldIndicatorPct(String(g.yieldIndicatorPct ?? 100));
    setAnnualYieldPct((g.annualYieldRate * 100).toFixed(2));
    setCustodyFeePct(String(g.custodyFeePct ?? 0));
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
    const curAmt = Number(currentAmount.replace(',', '.')) || 0;
    const initAmt = editingGoal ? Number(initialAmount.replace(',', '.')) || 0 : curAmt;
    const indPct = Number(yieldIndicatorPct.replace(',', '.')) || 100;
    const customRate = Number(annualYieldPct.replace(',', '.')) || 0;
    const resolvedAnnualPct = resolveInvestmentAnnualRatePct({
      yieldType,
      yieldIndicatorPct: indPct,
      customAnnualRatePct: customRate,
      indicators,
    });

    setSavingGoal(true);
    try {
      await saveGoal(
        {
          name,
          objective: objective.trim(),
          initialAmount: Math.max(0, initAmt),
          targetAmount: t,
          currentAmount: Math.max(0, curAmt),
          monthlyContribution: Math.max(0, Number(monthlyContribution.replace(',', '.')) || 0),
          termMonths: Math.max(1, Math.min(600, Math.round(Number(termMonths) || 12))),
          yieldType,
          yieldIndicatorPct: indPct,
          custodyFeePct: Math.max(0, Number(custodyFeePct.replace(',', '.')) || 0),
          annualYieldRate: resolvedAnnualPct / 100,
          notes,
        },
        editingGoal?.id
      );
      setGoalModalOpen(false);
    } catch (err) {
      setGoalError(err instanceof Error ? err.message : 'Erro ao salvar caixinha.');
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
    setAccYieldPct(String(indicators.poupancaAnnualPct));
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
          objective: g.objective,
          initialAmount: g.initialAmount,
          targetAmount: g.targetAmount,
          currentAmount: g.currentAmount,
          monthlyContribution: g.monthlyContribution,
          termMonths: g.termMonths,
          yieldType: 'personalizado',
          yieldIndicatorPct: 100,
          custodyFeePct: g.custodyFeePct,
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

  const handleManualIndicatorChange = (field: 'cdiAnnualPct' | 'selicAnnualPct' | 'trAnnualPct', raw: string) => {
    const num = Math.max(0, Math.min(100, Number(raw.replace(',', '.')) || 0));
    setIndicators((prev) => {
      const nextSelic = field === 'selicAnnualPct' ? num : prev.selicAnnualPct;
      const nextTr = field === 'trAnnualPct' ? num : prev.trAnnualPct;
      return {
        cdiAnnualPct: field === 'cdiAnnualPct' ? num : prev.cdiAnnualPct,
        selicAnnualPct: nextSelic,
        trAnnualPct: nextTr,
        poupancaAnnualPct: computePoupancaAnnualPct(nextSelic, nextTr),
        updatedAt: new Date().toISOString(),
        source: 'manual',
      };
    });
  };

  if (!household) return null;
  const peopleOptions = getHouseholdPeople(household);

  const formattedIndicatorDate = indicators.updatedAt
    ? new Date(indicators.updatedAt).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Agora';

  const sourceLabel =
    indicators.source === 'bcb'
      ? 'Banco Central (SGS)'
      : indicators.source === 'manual'
        ? 'Ajuste manual'
        : 'Referência padrão';

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Investimentos e Caixinhas
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Caixinhas com rendimento por indicador (CDI, Poupança, Selic), simulador de juros compostos e patrimônio acumulado.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {activeTab === 'poupanca' ? (
            <button
              type="button"
              onClick={openNewAccount}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white text-xs font-semibold rounded-xl hover:bg-emerald-700 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" />
              Nova poupança / conta
            </button>
          ) : (
            <button
              type="button"
              onClick={openNewGoal}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-900 dark:bg-emerald-600 text-white text-xs font-semibold rounded-xl hover:bg-slate-800 dark:hover:bg-emerald-500 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" />
              Nova caixinha / reserva
            </button>
          )}
        </div>
      </div>

      {/* Faixa de Indicadores Econômicos */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
            <span className="font-semibold text-slate-900 dark:text-slate-100">Taxas de referência:</span>
            <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300">
              CDI <strong>{indicators.cdiAnnualPct.toFixed(2)}% a.a.</strong>
            </span>
            <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">·</span>
            <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300">
              Selic <strong>{indicators.selicAnnualPct.toFixed(2)}% a.a.</strong>
            </span>
            <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">·</span>
            <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300">
              Poupança <strong>{indicators.poupancaAnnualPct.toFixed(2)}% a.a.</strong>
            </span>
            <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">·</span>
            <span className="text-slate-500 dark:text-slate-400">
              {sourceLabel} · Atualizado em {formattedIndicatorDate}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowManualIndicators((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer whitespace-nowrap"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              {showManualIndicators ? 'Ocultar ajuste' : 'Ajustar taxas'}
            </button>
            <button
              type="button"
              disabled={loadingIndicators}
              onClick={() => void refreshIndicators()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 cursor-pointer whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingIndicators ? 'animate-spin' : ''}`} />
              {loadingIndicators ? 'Atualizando...' : 'Atualizar (BCB)'}
            </button>
          </div>
        </div>

        {indicatorNotice && (
          <p className="text-xs text-amber-700 dark:text-amber-400">{indicatorNotice}</p>
        )}

        {showManualIndicators && (
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
            <div>
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                CDI (% ao ano)
              </label>
              <input
                type="number"
                step="0.05"
                min="0"
                max="100"
                value={indicators.cdiAnnualPct}
                onChange={(e) => handleManualIndicatorChange('cdiAnnualPct', e.target.value)}
                className="w-full px-3 py-1.5 text-xs font-mono tabular-nums border border-slate-200 dark:border-slate-700 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                Selic (% ao ano)
              </label>
              <input
                type="number"
                step="0.05"
                min="0"
                max="100"
                value={indicators.selicAnnualPct}
                onChange={(e) => handleManualIndicatorChange('selicAnnualPct', e.target.value)}
                className="w-full px-3 py-1.5 text-xs font-mono tabular-nums border border-slate-200 dark:border-slate-700 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                TR anual (%) · Poupança = {indicators.poupancaAnnualPct.toFixed(2)}%
              </label>
              <input
                type="number"
                step="0.05"
                min="0"
                max="20"
                value={indicators.trAnnualPct}
                onChange={(e) => handleManualIndicatorChange('trAnnualPct', e.target.value)}
                className="w-full px-3 py-1.5 text-xs font-mono tabular-nums border border-slate-200 dark:border-slate-700 rounded-lg"
              />
            </div>
            <button
              type="button"
              onClick={() => void refreshIndicators()}
              className="px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-lg cursor-pointer"
            >
              Restaurar referência
            </button>
          </div>
        )}
      </section>

      {/* Navegação em Abas */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 p-1 bg-slate-100 dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800">
        {(
          [
            { id: 'cofrinho', label: 'Caixinhas & Metas', icon: PiggyBank },
            { id: 'simulador', label: 'Simulador de Juros', icon: Calculator },
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
              className={`min-h-[42px] px-2.5 py-2 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                active
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 shrink-0 ${active ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`} />
              <span className="truncate">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* KPIs Consolidados */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900 text-white rounded-xl p-5 space-y-1.5">
          <span className="text-xs font-medium text-slate-300">Patrimônio acumulado</span>
          <p className="text-2xl font-bold font-mono tabular-nums text-emerald-300">
            {formatBRL(summary.totalConsolidated)}
          </p>
          <p className="text-[11px] text-slate-300 font-mono tabular-nums">
            Caixinhas {formatBRL(summary.totalSavedGoals)} + Contas {formatBRL(summary.totalInInvestmentAccounts)}
          </p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-1.5">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Aporte mensal planejado</span>
          <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {formatBRL(summary.totalMonthly)}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">{goals.length} caixinha(s) cadastrada(s)</p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-1.5">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Saldo projetado (12 meses)</span>
          <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {formatBRL(summary.totalProjected12)}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">Estimativa bruta com aportes mensais</p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-1.5">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Rendimento bruto estimado (12m)</span>
          <p className="text-2xl font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
            {formatBRL(summary.totalYield12)}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">Caixinhas e contas remuneradas</p>
        </div>
      </section>

      {/* ABA 1: CAIXINHAS & METAS */}
      {activeTab === 'cofrinho' && (
        <div key="cofrinho" className="duofin-tab-enter space-y-4">
          {goals.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center space-y-3">
              <PiggyBank className="w-8 h-8 text-emerald-600 mx-auto" />
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                Nenhuma caixinha de investimento cadastrada ainda.
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                Crie caixinhas para reserva de emergência, viagens ou metas de longo prazo vinculando ao CDI, Poupança, Selic ou taxa personalizada.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={openNewGoal}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-900 dark:bg-emerald-600 text-white text-xs font-semibold rounded-xl hover:bg-slate-800 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Criar primeira caixinha
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('simulador')}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-xl hover:bg-slate-50 cursor-pointer"
                >
                  <Calculator className="w-3.5 h-3.5" />
                  Abrir simulador de juros
                </button>
              </div>
            </div>
          ) : (
            <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {goals.map((g) => {
                const proj = computeGoalProjection(g, undefined, indicators);
                const resolvedType: InvestmentYieldType = g.yieldType ?? 'personalizado';
                const indicatorText =
                  resolvedType === 'cdi' || resolvedType === 'selic'
                    ? `${(g.yieldIndicatorPct ?? 100).toFixed(0)}% ${getYieldTypeLabel(resolvedType)}`
                    : getYieldTypeLabel(resolvedType);

                return (
                  <div
                    key={g.id}
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {g.name}
                        </h3>
                        {g.objective && (
                          <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 truncate">{g.objective}</p>
                        )}
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1">
                          <span>Meta {formatBRL(g.targetAmount)}</span>
                          <span aria-hidden="true">·</span>
                          <span>Aporte {formatBRL(g.monthlyContribution)}/mês</span>
                          <span aria-hidden="true">·</span>
                          <span>{indicatorText}</span>
                          <span aria-hidden="true">·</span>
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
                                setInlineGoalRateValue((proj.effectiveAnnualYieldRate * 100).toFixed(2));
                              }}
                              title="Clique para editar manualmente a % de rendimento"
                              className="inline-flex items-center gap-1 font-semibold font-mono tabular-nums text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
                            >
                              {formatPct(proj.effectiveAnnualYieldRate, 2)} a.a.
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => openEditGoal(g)}
                          aria-label={`Editar ${g.name}`}
                          className="p-1.5 text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteGoal(g.id)}
                          aria-label={`Excluir ${g.name}`}
                          className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-baseline justify-between">
                        <span className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                          {formatBRL(g.currentAmount)}
                        </span>
                        <span className="text-sm font-semibold font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                          {proj.progressPct.toFixed(1).replace('.', ',')}%
                        </span>
                      </div>
                      <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-600 rounded-full transition-all"
                          style={{ width: `${Math.min(100, proj.progressPct)}%` }}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
                      <div>
                        <p className="text-slate-500 dark:text-slate-400">Prazo ({proj.termMonths}m)</p>
                        <p className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                          {formatBRL(proj.termNetBalance)}
                        </p>
                        <p className="text-[11px] text-slate-400 font-mono tabular-nums">
                          Bruto {formatBRL(proj.termGrossBalance)}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-500 dark:text-slate-400">Juros líq. ({proj.termMonths}m)</p>
                        <p className="font-mono tabular-nums font-semibold text-emerald-700 dark:text-emerald-400 mt-0.5">
                          +{formatBRL(proj.termNetYield)}
                        </p>
                        <p className="text-[11px] text-slate-400 font-mono tabular-nums">
                          {proj.termEstimatedTaxes > 0 ? `IR/taxas −${formatBRL(proj.termEstimatedTaxes)}` : 'Isento de IR'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-slate-500 dark:text-slate-400">Meta atingida em</p>
                        <p className="font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                          {proj.monthsToGoal === 0
                            ? 'Atingida'
                            : proj.completionMonthKey
                              ? `${formatMonthShort(proj.completionMonthKey)} (${proj.monthsToGoal}m)`
                              : 'Sem aporte'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => openMovement(g, 'Depósito')}
                        className="flex-1 min-h-[40px] inline-flex items-center justify-center gap-1.5 py-2 px-3 bg-emerald-600 text-white text-xs font-semibold rounded-xl hover:bg-emerald-700 cursor-pointer"
                      >
                        <ArrowDownLeft className="w-3.5 h-3.5" />
                        Depositar avulso
                      </button>
                      <button
                        type="button"
                        onClick={() => openMovement(g, 'Retirada')}
                        className="flex-1 min-h-[40px] inline-flex items-center justify-center gap-1.5 py-2 px-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-xl hover:bg-slate-50 cursor-pointer"
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

      {/* ABA 2: SIMULADOR DE JUROS COMPOSTOS & COMPARADOR */}
      {activeTab === 'simulador' && (
        <div key="simulador" className="duofin-tab-enter space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Painel de Parâmetros */}
            <section className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                <div>
                  <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    Parâmetros da simulação
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Juros compostos com cálculo bruto e líquido (IR / IOF / custódia).
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Valor inicial (R$)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="10"
                    value={simInitial}
                    onChange={(e) => setSimInitial(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Aporte mensal (R$)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="10"
                    value={simMonthly}
                    onChange={(e) => setSimMonthly(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Prazo do investimento</label>
                  <div className="inline-flex p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg">
                    <button
                      type="button"
                      onClick={() => setSimPeriodMode('months')}
                      className={`px-2.5 py-1 text-[11px] font-semibold rounded-md cursor-pointer ${
                        simPeriodMode === 'months'
                          ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-xs'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      Meses
                    </button>
                    <button
                      type="button"
                      onClick={() => setSimPeriodMode('days')}
                      className={`px-2.5 py-1 text-[11px] font-semibold rounded-md cursor-pointer ${
                        simPeriodMode === 'days'
                          ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-xs'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      Dias (&lt; 30d IOF)
                    </button>
                  </div>
                </div>

                {simPeriodMode === 'months' ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min="1"
                        max="240"
                        value={Math.min(240, parsedSimParams.termMonthsVal)}
                        onChange={(e) => setSimTermMonths(e.target.value)}
                        className="flex-1 accent-slate-900 dark:accent-emerald-500 cursor-pointer"
                      />
                      <input
                        type="number"
                        min="1"
                        max="600"
                        value={simTermMonths}
                        onChange={(e) => setSimTermMonths(e.target.value)}
                        className="w-20 px-2.5 py-1.5 text-sm font-mono tabular-nums border border-slate-200 dark:border-slate-700 rounded-lg text-right"
                      />
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { m: '6', label: '6m' },
                        { m: '12', label: '1 ano' },
                        { m: '24', label: '2 anos' },
                        { m: '36', label: '3 anos' },
                        { m: '60', label: '5 anos' },
                        { m: '120', label: '10 anos' },
                      ].map((p) => (
                        <button
                          key={p.m}
                          type="button"
                          onClick={() => setSimTermMonths(p.m)}
                          className={`px-2.5 py-1 text-[11px] font-semibold rounded-md border cursor-pointer ${
                            simTermMonths === p.m
                              ? 'bg-slate-900 text-white border-slate-900 dark:bg-emerald-600 dark:border-emerald-600'
                              : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min="1"
                        max="29"
                        value={parsedSimParams.durationDaysVal}
                        onChange={(e) => setSimDurationDays(e.target.value)}
                        className="flex-1 accent-slate-900 dark:accent-emerald-500 cursor-pointer"
                      />
                      <input
                        type="number"
                        min="1"
                        max="29"
                        value={simDurationDays}
                        onChange={(e) => setSimDurationDays(e.target.value)}
                        className="w-20 px-2.5 py-1.5 text-sm font-mono tabular-nums border border-slate-200 dark:border-slate-700 rounded-lg text-right"
                      />
                    </div>
                    <p className="text-[11px] text-amber-700 dark:text-amber-400">
                      Resgates abaixo de 30 dias sofrem IOF regressivo de até 96% sobre o rendimento (exceto Poupança, que só credita no aniversário de 30 dias).
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Tipo de rendimento
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {YIELD_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        setSimYieldType(opt.id);
                        if (opt.id === 'selic' && simCustodyFeePct === '0') {
                          setSimCustodyFeePct('0.20');
                        } else if (opt.id !== 'selic' && simCustodyFeePct === '0.20') {
                          setSimCustodyFeePct('0');
                        }
                      }}
                      className={`px-3 py-2 text-xs font-semibold rounded-lg border text-left cursor-pointer transition-colors ${
                        simYieldType === opt.id
                          ? 'bg-slate-900 dark:bg-emerald-600 text-white border-slate-900 dark:border-emerald-600'
                          : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {simYieldType === 'cdi' || simYieldType === 'selic' ? (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      % do {simYieldType === 'cdi' ? 'CDI' : 'Selic'}
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="500"
                      step="1"
                      value={simIndicatorPct}
                      onChange={(e) => setSimIndicatorPct(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 dark:border-slate-700 rounded-lg"
                    />
                  </div>
                ) : simYieldType === 'personalizado' ? (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Taxa bruta (% a.a.)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="200"
                      step="0.1"
                      value={simCustomRatePct}
                      onChange={(e) => setSimCustomRatePct(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 dark:border-slate-700 rounded-lg"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Poupança atual (% a.a.)
                    </label>
                    <input
                      type="text"
                      disabled
                      value={`${indicators.poupancaAnnualPct.toFixed(2)}%`}
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-600"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Taxa custódia / admin (% a.a.)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="20"
                    step="0.05"
                    value={simCustodyFeePct}
                    onChange={(e) => setSimCustodyFeePct(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                </div>
              </div>

              {simPeriodMode === 'months' && (
                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Aporte avulso opcional (R$)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="50"
                      value={simExtraAmount}
                      onChange={(e) => setSimExtraAmount(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 dark:border-slate-700 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      No mês nº
                    </label>
                    <input
                      type="number"
                      min="1"
                      max={parsedSimParams.termMonthsVal}
                      value={simExtraMonth}
                      onChange={(e) => setSimExtraMonth(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 dark:border-slate-700 rounded-lg"
                    />
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={openGoalFromSimulation}
                className="w-full min-h-[42px] inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 text-white text-xs font-semibold rounded-xl hover:bg-emerald-700 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Criar caixinha com esta simulação
              </button>
            </section>

            {/* Resultados e Gráfico */}
            <section className="lg:col-span-7 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-slate-900 text-white rounded-xl p-5 space-y-1.5">
                  <span className="text-xs font-medium text-slate-300">Saldo final estimado (Líquido)</span>
                  <p className="text-3xl font-bold font-mono tabular-nums text-emerald-300">
                    {formatBRL(simulation.netBalance)}
                  </p>
                  <p className="text-xs text-slate-300 font-mono tabular-nums">
                    Bruto: {formatBRL(simulation.grossBalance)}
                  </p>
                </div>

                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-1.5">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Total investido</span>
                  <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                    {formatBRL(simulation.totalInvested)}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {simPeriodMode === 'days'
                      ? `Período de ${simulation.durationDays} dia(s)`
                      : `Em ${simulation.termMonths} mês(es)`}
                  </p>
                </div>

                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-1.5">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Juros acumulados</span>
                  <p className="text-2xl font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                    +{formatBRL(simulation.netInterest)}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                    Bruto +{formatBRL(simulation.grossInterest)} · IR/IOF/Taxas −
                    {formatBRL(simulation.irTax + simulation.iofTax + simulation.custodyFeeTotal)}
                  </p>
                </div>

                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-1.5">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Rentabilidade estimada
                  </span>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs text-slate-500">Líquida</span>
                    <span className="text-sm font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                      {simulation.netMonthlyRatePct.toFixed(2)}% a.m. · {simulation.netAnnualRatePct.toFixed(2)}% a.a.
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs text-slate-500">Bruta</span>
                    <span className="text-xs font-semibold font-mono tabular-nums text-slate-700 dark:text-slate-300">
                      {simulation.grossMonthlyRatePct.toFixed(2)}% a.m. · {simulation.grossAnnualRatePct.toFixed(2)}% a.a.
                    </span>
                  </div>
                </div>
              </div>

              {/* Evolução do Patrimônio */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Evolução do patrimônio estimado
                  </h3>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    Total investido × Saldo líquido × Saldo bruto
                  </span>
                </div>
                <div className="h-64 min-w-0 w-full duofin-chart-enter">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={simulation.timeline} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridStroke} vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: chartTheme.axisTick }} axisLine={false} tickLine={false} />
                      <YAxis
                        width={64}
                        tick={{ fontSize: 10, fill: chartTheme.axisTick }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) => `R$${Math.round(Number(v))}`}
                      />
                      <Tooltip
                        formatter={(val: unknown) => formatBRL(Number(val))}
                        contentStyle={chartTheme.tooltipStyle}
                      />
                      <Legend wrapperStyle={chartTheme.legendStyle} />
                      <Area
                        {...CHART_ANIMATION}
                        type="monotone"
                        dataKey="grossBalance"
                        name="Saldo bruto"
                        stroke={SEMANTIC_COLORS.amber}
                        fill={SEMANTIC_COLORS.amber}
                        fillOpacity={0.08}
                        strokeWidth={1.8}
                      />
                      <Area
                        {...CHART_ANIMATION}
                        type="monotone"
                        dataKey="netBalance"
                        name="Saldo líquido"
                        stroke={SEMANTIC_COLORS.positive}
                        fill={SEMANTIC_COLORS.positive}
                        fillOpacity={0.18}
                        strokeWidth={2.2}
                      />
                      <Area
                        {...CHART_ANIMATION}
                        type="monotone"
                        dataKey="investedTotal"
                        name="Total investido"
                        stroke={chartTheme.axisTick}
                        fill={chartTheme.axisTick}
                        fillOpacity={0.08}
                        strokeWidth={1.6}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </section>
          </div>

          {/* Comparação CDI x Poupança x Tesouro Selic */}
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Comparativo entre modalidades: CDI × Poupança × Tesouro Selic
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Mesmo capital e prazo simulados lado a lado considerando IR, IOF e taxa de custódia.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">
              <div className="lg:col-span-7 overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                      <th className="py-2 pr-3 font-medium">Modalidade</th>
                      <th className="py-2 px-3 font-medium text-right">Taxa bruta</th>
                      <th className="py-2 px-3 font-medium text-right">Impostos/Taxas</th>
                      <th className="py-2 px-3 font-medium text-right">Juros líquidos</th>
                      <th className="py-2 pl-3 font-medium text-right">Saldo final líq.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {modalityComparison.map((row) => (
                      <tr key={row.yieldType} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50">
                        <td className="py-3 pr-3">
                          <p className="font-semibold text-slate-900 dark:text-slate-100">{row.label}</p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">{row.indicatorSummary}</p>
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                          {row.grossAnnualRatePct.toFixed(2)}% a.a.
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-red-600 dark:text-red-400">
                          {row.taxesAndFees > 0 ? `−${formatBRL(row.taxesAndFees)}` : 'Isento'}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums font-semibold text-emerald-700 dark:text-emerald-400">
                          +{formatBRL(row.netInterest)}
                        </td>
                        <td className="py-3 pl-3 text-right font-mono tabular-nums font-bold text-slate-900 dark:text-slate-100">
                          {formatBRL(row.netBalance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="lg:col-span-5 h-56 min-w-0 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={modalityComparison.map((r) => ({
                      name: r.label,
                      Investido: Math.round(r.totalInvested * 100) / 100,
                      'Juros líquidos': Math.round(r.netInterest * 100) / 100,
                    }))}
                    margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridStroke} vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: chartTheme.axisTick }} axisLine={false} tickLine={false} />
                    <YAxis
                      width={58}
                      tick={{ fontSize: 10, fill: chartTheme.axisTick }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => `R$${Math.round(Number(v))}`}
                    />
                    <Tooltip
                      formatter={(val: unknown) => formatBRL(Number(val))}
                      contentStyle={chartTheme.tooltipStyle}
                    />
                    <Legend wrapperStyle={chartTheme.legendStyle} />
                    <Bar {...CHART_ANIMATION} dataKey="Investido" stackId="a" fill={chartTheme.axisTick} radius={[0, 0, 0, 0]} />
                    <Bar {...CHART_ANIMATION} dataKey="Juros líquidos" stackId="a" fill={SEMANTIC_COLORS.positive} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>

          {/* Hipóteses e Aviso Legal */}
          <section className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2 text-xs text-slate-600 dark:text-slate-300">
            <p className="font-semibold text-slate-800 dark:text-slate-200">Hipóteses consideradas no cálculo:</p>
            <ul className="list-disc pl-5 space-y-1">
              {simulation.hypotheses.map((h, i) => (
                <li key={i}>{h}</li>
              ))}
            </ul>
            <p className="flex items-start gap-1.5 pt-2 border-t border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
              <span>{simulation.disclaimer}</span>
            </p>
          </section>
        </div>
      )}

      {/* ABA 3: POUPANÇA & CONTAS DE INVESTIMENTO */}
      {activeTab === 'poupanca' && (
        <section key="poupanca" className="duofin-tab-enter space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Contas de Poupança e Investimentos
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Saldos dedicados a reserva, CDB, Tesouro ou poupança com edição rápida da taxa anual (%).
              </p>
            </div>
            <button
              type="button"
              onClick={openNewAccount}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-slate-900 dark:bg-emerald-600 text-white text-xs font-semibold rounded-xl hover:bg-slate-800 cursor-pointer shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              Adicionar conta
            </button>
          </div>

          {investmentAccounts.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center space-y-3">
              <Landmark className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                Nenhuma conta de Poupança ou Investimento cadastrada ainda.
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Cadastre sua conta poupança, CDB ou corretora para compor o patrimônio total.
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
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
                          <Landmark className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                            {acc.name}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                            {acc.type} · {acc.institution}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-base font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                          {formatBRL(acc.balance)}
                        </span>
                        <div className="flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => openEditAccount(acc)}
                            aria-label={`Editar ${acc.name}`}
                            className="p-1.5 text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteBankAccount(acc.id)}
                            aria-label={`Excluir ${acc.name}`}
                            className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500 dark:text-slate-400">Rendimento:</span>
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
                            className="inline-flex items-center gap-1 font-semibold font-mono tabular-nums text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
                          >
                            {formatPct(rate, 2)} a.a. · Editar %
                          </button>
                        )}
                      </div>
                      <span className="text-slate-500 dark:text-slate-400 font-mono tabular-nums">
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

      {/* ABA 4: HISTÓRICO & RENDIMENTOS */}
      {activeTab === 'historico' && (
        <div key="historico" className="duofin-tab-enter space-y-5">
          {(goals.length > 0 || investmentAccounts.length > 0) && (
            <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Projeção estimada de rendimento (12 meses e prazo configurado)
                </h2>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {goals.map((g) => {
                  const p = computeGoalProjection(g, undefined, indicators);
                  return (
                    <div key={g.id} className="px-5 py-3.5 flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{g.name}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {getYieldTypeLabel(g.yieldType)} · Taxa {formatPct(p.effectiveAnnualYieldRate, 2)} a.a. ·
                          Em {p.termMonths}m: Líq.{' '}
                          <strong className="font-mono tabular-nums text-slate-800 dark:text-slate-200">
                            {formatBRL(p.termNetBalance)}
                          </strong>{' '}
                          / Bruto{' '}
                          <span className="font-mono tabular-nums">{formatBRL(p.termGrossBalance)}</span>
                        </p>
                      </div>
                      <span className="text-sm font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400 shrink-0">
                        +{formatBRL(p.termNetYield)} líq.
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
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{acc.name}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {acc.type} · Taxa {formatPct(rate, 2)} a.a. · Saldo estimado em 12m:{' '}
                          <strong className="font-mono tabular-nums text-slate-800 dark:text-slate-200">
                            {formatBRL(acc.balance + yield12)}
                          </strong>
                        </p>
                      </div>
                      <span className="text-sm font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400 shrink-0">
                        +{formatBRL(yield12)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Histórico de depósitos e retiradas
              </h2>
            </div>
            {goalMovements.length === 0 ? (
              <p className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                Nenhuma movimentação registrada nas caixinhas até agora.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {goalMovements.map((m) => (
                  <div key={m.id} className="px-5 py-3.5 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                        {m.type} · {m.goalName}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {formatDateBR(m.date)} · {m.person}
                        {m.notes ? ` · ${m.notes}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span
                        className={`text-sm font-semibold font-mono tabular-nums ${
                          m.type === 'Depósito'
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-red-600 dark:text-red-400'
                        }`}
                      >
                        {m.type === 'Depósito' ? '+' : '−'} {formatBRL(m.amount)}
                      </span>
                      <button
                        type="button"
                        onClick={() => deleteGoalMovement(m)}
                        title="Estornar e excluir movimentação"
                        className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer"
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

      {/* Modal Caixinha / Objetivo */}
      {goalModalOpen && (
        <ModalPortal>
          <div
            className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/45 backdrop-blur-[2px] pt-3 px-3 pb-6 sm:pt-8 sm:px-4 overflow-y-auto duofin-backdrop-enter"
            onClick={(e) => {
              if (e.target === e.currentTarget) setGoalModalOpen(false);
            }}
          >
            <div className="duofin-dialog-enter bg-white dark:bg-slate-900 w-full sm:max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 max-h-[88dvh] overflow-y-auto shadow-xl">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  {editingGoal ? 'Editar caixinha' : 'Nova caixinha de investimento'}
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Nome da caixinha
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={80}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Ex.: Reserva de emergência"
                      className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Objetivo
                    </label>
                    <input
                      type="text"
                      maxLength={160}
                      value={objective}
                      onChange={(e) => setObjective(e.target.value)}
                      placeholder="Ex.: 6 meses de custo fixo"
                      className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      {editingGoal ? 'Saldo atual (R$)' : 'Valor inicial (R$)'}
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={currentAmount}
                      onChange={(e) => {
                        setCurrentAmount(e.target.value);
                        if (!editingGoal) setInitialAmount(e.target.value);
                      }}
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 dark:border-slate-700 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Meta / objetivo (R$)
                    </label>
                    <input
                      type="number"
                      required
                      step="0.01"
                      min="0.01"
                      value={targetAmount}
                      onChange={(e) => setTargetAmount(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 dark:border-slate-700 rounded-lg"
                    />
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Aporte mensal (R$)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={monthlyContribution}
                      onChange={(e) => setMonthlyContribution(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 dark:border-slate-700 rounded-lg"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Tipo de rendimento
                    </label>
                    <select
                      value={yieldType}
                      onChange={(e) => setYieldType(e.target.value as InvestmentYieldType)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950"
                    >
                      {YIELD_OPTIONS.map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {yieldType === 'cdi' || yieldType === 'selic' ? (
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        % indicador
                      </label>
                      <input
                        type="number"
                        step="1"
                        min="0"
                        max="500"
                        value={yieldIndicatorPct}
                        onChange={(e) => setYieldIndicatorPct(e.target.value)}
                        className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 dark:border-slate-700 rounded-lg"
                      />
                    </div>
                  ) : yieldType === 'personalizado' ? (
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Taxa (% a.a.)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="500"
                        value={annualYieldPct}
                        onChange={(e) => setAnnualYieldPct(e.target.value)}
                        className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 dark:border-slate-700 rounded-lg"
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Taxa atual
                      </label>
                      <input
                        type="text"
                        disabled
                        value={`${indicators.poupancaAnnualPct.toFixed(2)}%`}
                        className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Prazo (meses)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="600"
                      value={termMonths}
                      onChange={(e) => setTermMonths(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 dark:border-slate-700 rounded-lg"
                    />
                  </div>
                </div>

                {/* Prévia do saldo futuro no prazo */}
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 dark:text-slate-300">
                      Estimativa em {modalGoalPreview.tMonths} meses ({modalGoalPreview.resolvedAnnual.toFixed(2)}% a.a. bruto):
                    </span>
                    <strong className="font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                      Líquido {formatBRL(modalGoalPreview.sim.netBalance)}
                    </strong>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                    Bruto: {formatBRL(modalGoalPreview.sim.grossBalance)} · Rendimento líquido estimado: +
                    {formatBRL(modalGoalPreview.sim.netInterest)}
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Observações</label>
                  <input
                    type="text"
                    maxLength={300}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setGoalModalOpen(false)}
                    className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400 cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={savingGoal}
                    className="px-5 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 disabled:opacity-60 cursor-pointer"
                  >
                    {savingGoal ? 'Salvando...' : 'Salvar caixinha'}
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
            <div className="duofin-dialog-enter bg-white dark:bg-slate-900 w-full sm:max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 max-h-[88dvh] overflow-y-auto shadow-xl">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
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
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Valor (R$)</label>
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
                        className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 dark:border-slate-700 rounded-lg"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Data</label>
                    <input
                      type="date"
                      required
                      value={movDate}
                      onChange={(e) => setMovDate(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg"
                    />
                  </div>
                </div>
                {peopleOptions.length > 1 && (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Responsável</label>
                    <select
                      value={movPerson}
                      onChange={(e) => setMovPerson(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950"
                    >
                      {peopleOptions.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Observações</label>
                  <input
                    type="text"
                    maxLength={300}
                    value={movNotes}
                    onChange={(e) => setMovNotes(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setMovModalGoal(null)}
                    className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400 cursor-pointer"
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
            <div className="duofin-dialog-enter bg-white dark:bg-slate-900 w-full sm:max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 max-h-[88dvh] overflow-y-auto shadow-xl">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
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
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Nome da aplicação / conta
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={80}
                    value={accName}
                    onChange={(e) => setAccName(e.target.value)}
                    placeholder="Ex.: Caixinha Nubank, CDB Itaú, Poupança"
                    className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Tipo</label>
                    <select
                      value={accType}
                      onChange={(e) => {
                        const next = e.target.value as BankAccountType;
                        setAccType(next);
                        if (!editingAcc) {
                          setAccYieldPct(
                            next === 'Poupança'
                              ? String(indicators.poupancaAnnualPct)
                              : String(indicators.cdiAnnualPct)
                          );
                        }
                      }}
                      className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950"
                    >
                      <option value="Poupança">Poupança</option>
                      <option value="Investimento">Investimento</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Saldo atual (R$)
                    </label>
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
                        className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 dark:border-slate-700 rounded-lg"
                      />
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Rendimento (% ao ano)
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      required
                      value={accYieldPct}
                      onChange={(e) => setAccYieldPct(e.target.value.replace(/[^0-9.,]/g, ''))}
                      placeholder="6,17"
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 dark:border-slate-700 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Instituição
                    </label>
                    <input
                      type="text"
                      maxLength={80}
                      value={accInstitution}
                      onChange={(e) => setAccInstitution(e.target.value)}
                      placeholder="Ex.: Nubank, Caixa, Inter"
                      className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setAccModalOpen(false)}
                    className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400 cursor-pointer"
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
