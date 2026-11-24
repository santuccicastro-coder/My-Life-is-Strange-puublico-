import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_BENCHMARK_INDICATORS,
  compareInvestmentModalities,
  computeBalanceBreakdown,
  computeCardLimitUsage,
  computeFirstCreditInstallmentDate,
  computeFreeMoneyProjection,
  computeGoalProjection,
  computeHomeRealizedAndDailyMetrics,
  computeInstallmentSummary,
  computeMemberIncomeAndSpendingBreakdown,
  computeMonthCalendarData,
  computeMonthlyPanel,
  computeNegativeBalanceIncomeOffsets,
  computePaymentReminders,
  computePlannedPurchaseMetrics,
  computePoupancaAnnualPct,
  computeProjectsPortfolioSummary,
  computeQuickInterest,
  computeScenarioAnalysis,
  computeShortHorizon,
  computeSpendingHorizon,
  computeWeeklyRollupFromShortHorizon,
  formatDeviceBalanceTimestamp,
  getBrazilianIOFRate,
  getBrazilianIRRate,
  getCadenceOccurrencesInMonth,
  getCardInvoiceInMonth,
  getHouseholdPeople,
  getIncomeAmountInMonth,
  getIncomeOccurrenceDatesInMonth,
  getInstallmentAmountInMonth,
  getInstallmentSchedule,
  getMonthKeysFromStart,
  getMonthKeysRange,
  getRecurringItemAmountInMonth,
  getTotalFixedAndConfiguredIncomeInMonth,
  parseSignedDecimal,
  queryFreeMoneyAtDate,
  resolveInvestmentAnnualRatePct,
  resolveTransactionSignAndType,
  sanitizeSignedDecimalInput,
  simulateInvestmentGrowth,
} from './financeCalculations.ts';
import type {
  BankAccount,
  CreditCard,
  Goal,
  HorizonScenarioRule,
  Household,
  Income,
  Installment,
  PlannedPurchase,
  RecurringItem,
  SimulatedPurchase,
  Transaction,
} from '../types/finance.ts';
import {
  DEFAULT_CATEGORY_ICONS,
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_INCOME_CATEGORIES,
  classifyIncomeSourceToCategory,
  resolveHouseholdExpenseCategories,
  resolveHouseholdIncomeCategories,
  resolvePlannedPurchaseKind,
} from './validation.ts';

const audit = {
  createdByUid: 'u1',
  createdByName: 'Ana',
  updatedByUid: 'u1',
  updatedByName: 'Ana',
};

describe('Finance Calculations Engine', () => {
  it('computes installment distribution across months accurately', () => {
    const inst: Installment = {
      id: 'i1',
      description: 'Notebook',
      cardId: 'c1',
      cardName: 'Cartão A',
      person: 'Ana',
      category: 'Educação',
      totalAmount: 3600,
      installmentsCount: 12,
      firstChargeDate: '2026-09-10',
      notes: '',
      ...audit,
    };

    // Sem baixas manuais registradas, parcelas vencidas (set e out frente a 2026-11) NÃO são marcadas pagas automaticamente
    const summaryUnpaid = computeInstallmentSummary(inst, '2026-11');
    assert.equal(summaryUnpaid.installmentValue, 300);
    assert.equal(summaryUnpaid.paidInstallments, 0);
    assert.equal(summaryUnpaid.overdueInstallments, 2);
    assert.equal(summaryUnpaid.overdueAmount, 600);
    assert.equal(summaryUnpaid.remainingInstallments, 12);
    assert.equal(summaryUnpaid.remainingAmount, 3600);

    // Com controle individual pago explicitamente nas parcelas 1, 2 e 3
    const summaryPaid = computeInstallmentSummary(
      { ...inst, paidInstallmentNumbers: [1, 2, 3] },
      '2026-11'
    );
    assert.equal(summaryPaid.paidInstallments, 3);
    assert.equal(summaryPaid.overdueInstallments, 0);
    assert.equal(summaryPaid.remainingInstallments, 9);
    assert.equal(summaryPaid.remainingAmount, 2700);

    const schedule = getInstallmentSchedule({ ...inst, paidInstallmentNumbers: [1] }, '2026-11');
    assert.equal(schedule[0].isPaid, true);
    assert.equal(schedule[0].isOverdue, false);
    assert.equal(schedule[1].isPaid, false);
    assert.equal(schedule[1].isOverdue, true);
    assert.equal(schedule[2].isPaid, false);
    assert.equal(schedule[2].isCurrent, true);

    assert.equal(getInstallmentAmountInMonth(inst, '2026-08'), 0);
    assert.equal(getInstallmentAmountInMonth(inst, '2026-09'), 300);
    assert.equal(getInstallmentAmountInMonth(inst, '2027-08'), 300);
    assert.equal(getInstallmentAmountInMonth(inst, '2027-09'), 0);
  });

  it('routes credit card purchases past closingDay to next month invoice', () => {
    const card: CreditCard = {
      id: 'c1',
      name: 'Nubank',
      holder: 'Ana',
      limit: 5000,
      closingDay: 10,
      dueDay: 17,
      color: '#0F172A',
      active: true,
      ...audit,
    };

    const txBeforeClose: Transaction = {
      id: 't1',
      type: 'Saída',
      description: 'Mercado',
      plannedAmount: 200,
      actualAmount: 200,
      category: 'Mercado',
      person: 'Ana',
      date: '2026-11-05',
      monthKey: '2026-11',
      paymentMethod: 'Crédito',
      accountOrCard: 'Nubank',
      cardId: 'c1',
      status: 'Pago',
      dueDate: '',
      notes: '',
      ...audit,
    };

    const txAfterClose: Transaction = {
      ...txBeforeClose,
      id: 't2',
      description: 'Jantar',
      actualAmount: 150,
      plannedAmount: 150,
      date: '2026-11-12',
    };

    const invNov = getCardInvoiceInMonth(card, '2026-11', [txBeforeClose, txAfterClose], []);
    const invDec = getCardInvoiceInMonth(card, '2026-12', [txBeforeClose, txAfterClose], []);

    assert.equal(invNov.total, 200);
    assert.equal(invDec.total, 150);
  });

  it('projects fixed recurring expenses and gains across future months without double counting settled months', () => {
    const recurring: RecurringItem[] = [
      {
        id: 'rec-exp-1',
        type: 'Saída',
        description: 'Aluguel',
        amount: 2200,
        category: 'Moradia',
        person: 'Casal',
        frequency: 'Mensal',
        dayOfMonth: 5,
        startMonthKey: '2026-10',
        endMonthKey: '',
        paymentMethod: 'Pix',
        accountOrCard: 'Conta corrente',
        cardId: '',
        active: true,
        notes: '',
        ...audit,
      },
      {
        id: 'rec-inc-1',
        type: 'Entrada',
        description: 'Salário Fixo',
        amount: 6000,
        category: 'Outros',
        person: 'Ana',
        frequency: 'Mensal',
        dayOfMonth: 5,
        startMonthKey: '2026-10',
        endMonthKey: '',
        paymentMethod: 'Transferência',
        accountOrCard: 'Conta corrente',
        cardId: '',
        active: true,
        notes: '',
        ...audit,
      },
      {
        id: 'rec-card-1',
        type: 'Saída',
        description: 'Internet Fibra',
        amount: 120,
        category: 'Assinaturas',
        person: 'Casal',
        frequency: 'Mensal',
        dayOfMonth: 15,
        startMonthKey: '2026-11',
        endMonthKey: '',
        paymentMethod: 'Crédito',
        accountOrCard: 'Nubank',
        cardId: 'c1',
        active: true,
        notes: '',
        ...audit,
      },
    ];

    const settledOctRent: Transaction = {
      id: 'tx-oct-rent',
      type: 'Saída',
      description: 'Aluguel',
      plannedAmount: 2200,
      actualAmount: 2250, // actual amount adjusted in October
      category: 'Moradia',
      person: 'Casal',
      date: '2026-10-05',
      monthKey: '2026-10',
      paymentMethod: 'Pix',
      accountOrCard: 'Conta corrente',
      cardId: '',
      status: 'Pago',
      dueDate: '',
      notes: '',
      recurringId: 'rec-exp-1',
      recurringMonthKey: '2026-10',
      ...audit,
    };

    // Settled in October -> template yields 0, concrete tx provides 2250
    assert.equal(getRecurringItemAmountInMonth(recurring[0], '2026-10', [settledOctRent]), 0);
    assert.equal(getRecurringItemAmountInMonth(recurring[0], '2026-11', [settledOctRent]), 2200);
    assert.equal(getRecurringItemAmountInMonth(recurring[0], '2026-09', [settledOctRent]), 0);

    const monthKeys = ['2026-09', '2026-10', '2026-11', '2026-12'];
    const panel = computeMonthlyPanel(monthKeys, [], [settledOctRent], [], recurring);
    assert.equal(panel[0].totalEntries, 0);
    assert.equal(panel[0].totalExpenses, 0);

    assert.equal(panel[1].totalEntries, 6000);
    assert.equal(panel[1].launchedExpenses, 2250);
    assert.equal(panel[1].recurringExpenses, 0);
    assert.equal(panel[1].totalExpenses, 2250);

    assert.equal(panel[2].totalEntries, 6000);
    assert.equal(panel[2].recurringExpenses, 2320); // 2200 + 120
    assert.equal(panel[2].totalExpenses, 2320);

    // Card invoice shifts dayOfMonth 15 past closingDay 10 into Dec invoice
    const card: CreditCard = {
      id: 'c1',
      name: 'Nubank',
      holder: 'Ana',
      limit: 5000,
      closingDay: 10,
      dueDay: 17,
      color: '#0F172A',
      active: true,
      ...audit,
    };
    const invNov = getCardInvoiceInMonth(card, '2026-11', [settledOctRent], [], recurring);
    const invDec = getCardInvoiceInMonth(card, '2026-12', [settledOctRent], [], recurring);
    assert.equal(invNov.total, 0);
    assert.equal(invDec.total, 120);
  });

  it('computes goal FV and months-to-goal accurately', () => {
    const goal: Goal = {
      id: 'g1',
      name: 'Reserva',
      targetAmount: 12000,
      currentAmount: 2000,
      monthlyContribution: 1000,
      annualYieldRate: 0,
      notes: '',
      ...audit,
    };

    const proj = computeGoalProjection(goal, '2026-11');
    assert.equal(proj.monthsToGoal, 10);
    assert.equal(proj.balanceIn12Months, 14000);
    assert.equal(proj.completionMonthKey, '2027-09');
  });

  it('computes planned purchase price comparison correctly', () => {
    const item: PlannedPurchase = {
      id: 'p1',
      priority: 9,
      room: 'Cozinha',
      product: 'Geladeira',
      brandModel: '',
      specs: '',
      quantity: 2,
      estimatedUnitPrice: 1000,
      actualUnitPrice: 900,
      hasActualPrice: true,
      targetDate: '',
      purchaseDate: '2026-11-01',
      paymentMethod: 'Pix',
      status: 'Comprado',
      notes: '',
      ...audit,
    };
    const m = computePlannedPurchaseMetrics(item);
    assert.equal(m.totalEstimated, 2000);
    assert.equal(m.totalPaid, 1800);
    assert.equal(m.difference, 200);
    assert.equal(m.comparison, 'Abaixo do planejado');
  });

  it('computes monthly panel and 12-month scenario projection accurately', () => {
    const incomes: Income[] = [
      {
        id: 'inc1',
        person: 'Ana',
        source: 'Salário',
        amount: 5000,
        frequency: 'Mensal',
        receiptDay: 5,
        receiptDate: '',
        active: true,
        notes: '',
        ...audit,
      },
    ];
    const txs: Transaction[] = [
      {
        id: 't1',
        type: 'Saída',
        description: 'Aluguel',
        plannedAmount: 2000,
        actualAmount: 2000,
        category: 'Moradia',
        person: 'Ana',
        date: '2026-11-05',
        monthKey: '2026-11',
        paymentMethod: 'Pix',
        accountOrCard: 'Conta corrente',
        cardId: '',
        status: 'Pago',
        dueDate: '',
        notes: '',
        ...audit,
      },
    ];

    const monthKeys = getMonthKeysFromStart('2026-01-01', 12);
    const panel = computeMonthlyPanel(monthKeys, incomes, txs, []);
    const nov = panel.find((r) => r.monthKey === '2026-11');
    assert.ok(nov);
    assert.equal(nov.totalEntries, 5000);
    assert.equal(nov.totalExpenses, 2000);
    assert.equal(nov.monthlySurplus, 3000);

    const scenario = computeScenarioAnalysis({
      panelRows: panel,
      incomes,
      goals: [],
      expenseChangePct: 0.2,
      incomeChangePct: 0,
      mode: 'De uma vez',
      useCustomBaseExpense: false,
      customBaseExpense: 0,
      refMonthKey: '2026-11',
    });
    assert.equal(scenario.todayExpense, 2000);
    assert.equal(scenario.scenarioExpense, 2400);
    assert.equal(scenario.scenarioSurplus, 2600);
  });

  it('computes Horizonte de Gastos across free multi-year range (Dec/2026+) and purchase simulations', () => {
    const keys = getMonthKeysRange('2026-12', '2029-11'); // 36 months
    assert.equal(keys.length, 36);
    assert.equal(keys[0], '2026-12');
    assert.equal(keys[35], '2029-11');

    const incomes: Income[] = [
      {
        id: 'inc1',
        person: 'Ana',
        source: 'Salário',
        amount: 8000,
        frequency: 'Mensal',
        receiptDay: 5,
        receiptDate: '',
        active: true,
        notes: '',
        ...audit,
      },
    ];

    const recurring: RecurringItem[] = [
      {
        id: 'rec1',
        type: 'Saída',
        description: 'Aluguel',
        amount: 2500,
        category: 'Moradia',
        person: 'Casal',
        frequency: 'Mensal',
        dayOfMonth: 5,
        startMonthKey: '2026-01',
        endMonthKey: '',
        paymentMethod: 'Pix',
        accountOrCard: 'Conta corrente',
        cardId: '',
        active: true,
        notes: '',
        ...audit,
      },
    ];

    const card: CreditCard = {
      id: 'c1',
      name: 'Nubank',
      holder: 'Ana',
      limit: 10000,
      closingDay: 10,
      dueDay: 17,
      color: '#0F172A',
      active: true,
      ...audit,
    };

    // Simulated 6x purchase bought on day 15 of 2026-12 -> closingDay 10 shifts 1st charge to 2027-01
    const sims: SimulatedPurchase[] = [
      {
        id: 's1',
        description: 'Geladeira',
        totalAmount: 3600,
        mode: 'parcelado',
        installmentsCount: 6,
        startMonthKey: '2026-12',
        endMonthKey: '',
        purchaseDay: 15,
        cardId: 'c1',
        enabled: true,
      },
      {
        id: 's2',
        description: 'Academia Fixa',
        totalAmount: 300,
        mode: 'fixo',
        installmentsCount: 1,
        startMonthKey: '2027-01',
        endMonthKey: '',
        purchaseDay: 5,
        cardId: '',
        enabled: true,
      },
    ];

    const horizon = computeSpendingHorizon({
      monthKeys: keys,
      incomes,
      transactions: [],
      installments: [],
      recurringItems: recurring,
      cards: [card],
      simulatedPurchases: sims,
    });

    assert.equal(horizon.rows[0].monthKey, '2026-12');
    assert.equal(horizon.rows[0].simulatedPurchaseImpact, 0);
    assert.equal(horizon.rows[1].monthKey, '2027-01');
    assert.equal(horizon.rows[1].simulatedPurchaseImpact, 900); // 600 parcela + 300 fixo
    assert.equal(horizon.rows[6].monthKey, '2027-06');
    assert.equal(horizon.rows[6].simulatedPurchaseImpact, 900);
    assert.equal(horizon.rows[7].monthKey, '2027-07');
    assert.equal(horizon.rows[7].simulatedPurchaseImpact, 300); // parcela terminou!
    assert.equal(horizon.summary.lastInstallmentMonth, '2027-06');
    // Equilíbrio ao infinito = 8000 - (2500 + 300) = 5200
    assert.equal(horizon.summary.perpetualMonthlySurplus, 5200);
  });

  it('computes Home account balances, realized vs pending flows, and daily safe spend', () => {
    const bankAccounts: BankAccount[] = [
      {
        id: 'ba1',
        name: 'Nubank Conta',
        institution: 'Nubank',
        type: 'Corrente',
        balance: 3200,
        currency: 'BRL',
        lastSyncedAt: '',
        active: true,
        ...audit,
      },
      {
        id: 'ba2',
        name: 'Reserva',
        institution: 'Inter',
        type: 'Poupança',
        balance: 1800,
        currency: 'BRL',
        lastSyncedAt: '',
        active: true,
        ...audit,
      },
      {
        id: 'ba-inactive',
        name: 'Encerrada',
        institution: 'Outro',
        type: 'Corrente',
        balance: 9999,
        currency: 'BRL',
        lastSyncedAt: '',
        active: false,
        ...audit,
      },
    ];

    const incomes: Income[] = [
      {
        id: 'inc1',
        person: 'Ana',
        source: 'Salário',
        amount: 6000,
        frequency: 'Mensal',
        receiptDay: 5,
        receiptDate: '',
        active: true,
        notes: '',
        ...audit,
      },
    ];

    const transactions: Transaction[] = [
      {
        id: 'tx-in-paid',
        type: 'Entrada',
        description: 'Freela recebido',
        plannedAmount: 1000,
        actualAmount: 1000,
        category: 'Outros',
        person: 'Ana',
        date: '2026-11-05',
        monthKey: '2026-11',
        paymentMethod: 'Pix',
        accountOrCard: 'Nubank Conta',
        cardId: '',
        status: 'Pago',
        dueDate: '',
        notes: '',
        ...audit,
      },
      {
        id: 'tx-out-paid',
        type: 'Saída',
        description: 'Mercado pago',
        plannedAmount: 1500,
        actualAmount: 1500,
        category: 'Mercado',
        person: 'Casal',
        date: '2026-11-10',
        monthKey: '2026-11',
        paymentMethod: 'Débito',
        accountOrCard: 'Nubank Conta',
        cardId: '',
        status: 'Pago',
        dueDate: '',
        notes: '',
        ...audit,
      },
      {
        id: 'tx-out-pending',
        type: 'Saída',
        description: 'Energia pendente',
        plannedAmount: 500,
        actualAmount: 500,
        category: 'Contas da casa',
        person: 'Casal',
        date: '2026-11-25',
        monthKey: '2026-11',
        paymentMethod: 'Boleto',
        accountOrCard: 'Nubank Conta',
        cardId: '',
        status: 'Pendente',
        dueDate: '2026-11-25',
        notes: '',
        ...audit,
      },
    ];

    // Nov/2026 has 30 days; today = 2026-11-21 -> 10 days remaining (21..30)
    const metrics = computeHomeRealizedAndDailyMetrics({
      monthKey: '2026-11',
      todayISO: '2026-11-21',
      bankAccounts,
      incomes,
      transactions,
      installments: [],
      recurringItems: [],
    });

    assert.equal(metrics.totalAccountsBalance, 5000);
    assert.equal(metrics.activeAccountsCount, 2);
    assert.equal(metrics.realizedEntries, 1000);
    assert.equal(metrics.expectedEntriesTotal, 7000); // 6000 income + 1000 tx
    assert.equal(metrics.pendingEntries, 6000);
    assert.equal(metrics.realizedExpenses, 1500);
    assert.equal(metrics.expectedExpensesTotal, 2000); // 1500 + 500
    assert.equal(metrics.pendingExpenses, 500);
    assert.equal(metrics.monthlySurplus, 5000);
    assert.equal(metrics.daysRemainingInMonth, 10);
    assert.equal(metrics.dailyBudgetSource, 'orcamento');
    assert.equal(metrics.dailySafeSpend, 500); // 5000 / 10 dias

    // Fallback to bank accounts balance minus pending expenses when no income/entries exist
    const balanceOnly = computeHomeRealizedAndDailyMetrics({
      monthKey: '2026-11',
      todayISO: '2026-11-21',
      bankAccounts,
      incomes: [],
      transactions: [transactions[2]], // 500 pending
      installments: [],
      recurringItems: [],
    });
    assert.equal(balanceOnly.dailyBudgetSource, 'saldo_contas');
    assert.equal(balanceOnly.dailyBudgetBase, 4500); // 5000 - 500
    assert.equal(balanceOnly.dailySafeSpend, 450);
  });

  it('computes Short Horizon for 7 dias, 1 mês (30 dias), and Trimestre (3 meses)', () => {
    const trimestreKeys = getMonthKeysFromStart('2026-12-01', 3);
    assert.deepEqual(trimestreKeys, ['2026-12', '2027-01', '2027-02']);

    const bankAccounts: BankAccount[] = [
      {
        id: 'ba1',
        name: 'Conta Principal',
        institution: 'Itaú',
        type: 'Corrente',
        balance: 2000,
        currency: 'BRL',
        lastSyncedAt: '',
        active: true,
        ...audit,
      },
    ];

    const incomes: Income[] = [
      {
        id: 'inc1',
        person: 'Ana',
        source: 'Salário',
        amount: 3000,
        frequency: 'Mensal',
        receiptDay: 5,
        receiptDate: '',
        active: true,
        notes: '',
        ...audit,
      },
    ];

    const card: CreditCard = {
      id: 'c1',
      name: 'Nubank',
      holder: 'Ana',
      limit: 5000,
      closingDay: 10,
      dueDay: 20,
      color: '#0F172A',
      active: true,
      ...audit,
    };

    const cardTx: Transaction = {
      id: 't-card',
      type: 'Saída',
      description: 'Supermercado',
      plannedAmount: 800,
      actualAmount: 800,
      category: 'Mercado',
      person: 'Casal',
      date: '2026-12-05',
      monthKey: '2026-12',
      paymentMethod: 'Crédito',
      accountOrCard: 'Nubank',
      cardId: 'c1',
      status: 'Pendente',
      dueDate: '',
      notes: '',
      ...audit,
    };

    const pendingPix: Transaction = {
      id: 't-pix',
      type: 'Saída',
      description: 'Internet',
      plannedAmount: 2500,
      actualAmount: 2500,
      category: 'Contas da casa',
      person: 'Casal',
      date: '2026-12-03',
      monthKey: '2026-12',
      paymentMethod: 'Pix',
      accountOrCard: 'Conta Principal',
      cardId: '',
      status: 'Pendente',
      dueDate: '2026-12-03',
      notes: '',
      ...audit,
    };

    const sevenDays = computeShortHorizon({
      daysCount: 7,
      startDateISO: '2026-12-01',
      bankAccounts,
      incomes,
      transactions: [cardTx, pendingPix],
      installments: [],
      recurringItems: [],
      cards: [card],
      simulatedPurchases: [],
    });

    assert.equal(sevenDays.rows.length, 7);
    assert.equal(sevenDays.startDateISO, '2026-12-01');
    assert.equal(sevenDays.endDateISO, '2026-12-07');
    assert.equal(sevenDays.summary.startBalance, 2000);
    // Day 2026-12-03: 2000 - 2500 = -500 (firstNegativeDay)
    assert.equal(sevenDays.summary.firstNegativeDay?.dateISO, '2026-12-03');
    assert.equal(sevenDays.summary.firstNegativeDay?.projectedBalance, -500);
    // Day 2026-12-05: -500 + 3000 = 2500
    assert.equal(sevenDays.summary.endBalance, 2500);

    const thirtyDays = computeShortHorizon({
      daysCount: 30,
      startDateISO: '2026-12-01',
      bankAccounts,
      incomes,
      transactions: [cardTx, pendingPix],
      installments: [],
      recurringItems: [],
      cards: [card],
      simulatedPurchases: [],
    });

    assert.equal(thirtyDays.rows.length, 30);
    // On 2026-12-20 (card dueDay = 20), invoice of 800 is subtracted: 2500 - 800 = 1700
    const dueRow = thirtyDays.rows.find((r) => r.dateISO === '2026-12-20');
    assert.ok(dueRow);
    assert.equal(dueRow.cardInvoicesTotal, 800);
    assert.equal(thirtyDays.summary.endBalance, 1700);
  });

  it('computes first charge date for credit installments respecting card closingDay', () => {
    // Before closingDay (day 5 < 10) -> stays in 2026-11
    assert.equal(computeFirstCreditInstallmentDate('2026-11-05', 10), '2026-11-05');
    // On or after closingDay (day 15 >= 10) -> shifts to 2026-12
    assert.equal(computeFirstCreditInstallmentDate('2026-11-15', 10), '2026-12-15');
    // Day 31 shifting into February clamps cleanly to Feb 28
    assert.equal(computeFirstCreditInstallmentDate('2027-01-31', 25), '2027-02-28');
    // Without card closingDay -> keeps same month
    assert.equal(computeFirstCreditInstallmentDate('2026-11-20', undefined), '2026-11-20');
  });

  it('supports up to 7 household members and computes contribution % and individual spending accurately', () => {
    const household: Household = {
      id: 'h1',
      name: 'Família Silva',
      ownerUid: 'u1',
      memberUids: ['u1', 'u2', 'u3', 'u4'],
      memberNames: {
        u1: 'Ana',
        u2: 'Bruno',
        u3: 'Carla',
        u4: 'Diego',
      },
      partner1Uid: 'u1',
      partner2Uid: 'u2',
      partner1Name: 'Ana',
      partner2Name: 'Bruno',
      periodStart: '2026-01-01',
      categories: ['Moradia'],
      paymentMethods: ['Pix'],
      rooms: ['Sala'],
      accounts: ['Conta corrente'],
      lastInviteCode: '',
    };

    const people = getHouseholdPeople(household);
    assert.deepEqual(people, ['Ana', 'Bruno', 'Carla', 'Diego', 'Grupo']);

    const incomes: Income[] = [
      {
        id: 'i1',
        person: 'Ana',
        source: 'Salário Ana',
        amount: 6000,
        frequency: 'Mensal',
        receiptDay: 5,
        receiptDate: '',
        active: true,
        notes: '',
        ...audit,
      },
      {
        id: 'i2',
        person: 'Bruno',
        source: 'Salário Bruno',
        amount: 3000,
        frequency: 'Mensal',
        receiptDay: 5,
        receiptDate: '',
        active: true,
        notes: '',
        ...audit,
      },
      {
        id: 'i3',
        person: 'Carla',
        source: 'Bolsa Carla',
        amount: 1000,
        frequency: 'Mensal',
        receiptDay: 10,
        receiptDate: '',
        active: true,
        notes: '',
        ...audit,
      },
    ];

    const transactions: Transaction[] = [
      {
        id: 't1',
        type: 'Saída',
        description: 'Mercado Ana',
        plannedAmount: 1200,
        actualAmount: 1200,
        category: 'Mercado',
        person: 'Ana',
        date: '2026-11-08',
        monthKey: '2026-11',
        paymentMethod: 'Pix',
        accountOrCard: 'Conta',
        cardId: '',
        status: 'Pago',
        dueDate: '',
        notes: '',
        ...audit,
      },
      {
        id: 't2',
        type: 'Saída',
        description: 'Curso Carla',
        plannedAmount: 1500,
        actualAmount: 1500,
        category: 'Educação',
        person: 'Carla',
        date: '2026-11-12',
        monthKey: '2026-11',
        paymentMethod: 'Pix',
        accountOrCard: 'Conta',
        cardId: '',
        status: 'Pago',
        dueDate: '',
        notes: '',
        ...audit,
      },
    ];

    const breakdown = computeMemberIncomeAndSpendingBreakdown({
      monthKey: '2026-11',
      household,
      incomes,
      transactions,
      installments: [],
      recurringItems: [],
    });

    assert.equal(breakdown.totalIncome, 10000);
    assert.equal(breakdown.totalSpending, 2700);
    assert.equal(breakdown.totalBalance, 7300);

    const ana = breakdown.rows.find((r) => r.person === 'Ana');
    const bruno = breakdown.rows.find((r) => r.person === 'Bruno');
    const carla = breakdown.rows.find((r) => r.person === 'Carla');
    const diego = breakdown.rows.find((r) => r.person === 'Diego');
    assert.ok(ana && bruno && carla && diego);
    assert.equal(ana.incomeSharePct, 0.6);
    assert.equal(ana.individualSpending, 1200);
    assert.equal(ana.individualBalance, 4800);
    assert.equal(bruno.incomeSharePct, 0.3);
    assert.equal(bruno.individualSpending, 0);
    assert.equal(carla.incomeSharePct, 0.1);
    assert.equal(carla.individualBalance, -500);
    assert.equal(diego.monthlyIncome, 0);
  });

  it('rolls up 28-day short horizon into 4 weekly buckets cleanly', () => {
    const shortRes = computeShortHorizon({
      daysCount: 28,
      startDateISO: '2026-12-01',
      bankAccounts: [],
      incomes: [],
      transactions: [],
      installments: [],
      recurringItems: [],
      cards: [],
      simulatedPurchases: [],
    });
    const weeks = computeWeeklyRollupFromShortHorizon(shortRes);
    assert.equal(weeks.length, 4);
    assert.equal(weeks[0].label, 'Sem 1');
    assert.equal(weeks[3].label, 'Sem 4');
  });

  it('computes simple and compound interest accurately for quick economic calculator', () => {
    const compound = computeQuickInterest({
      principal: 1000,
      ratePct: 10,
      rateUnit: 'mensal',
      months: 2,
      regime: 'composto',
    });
    assert.ok(Math.abs(compound.totalAmount - 1210) < 1e-6);
    assert.ok(Math.abs(compound.totalInterest - 210) < 1e-6);
    assert.ok(Math.abs(compound.increasePct - 21) < 1e-6);

    const simple = computeQuickInterest({
      principal: 1000,
      ratePct: 10,
      rateUnit: 'mensal',
      months: 2,
      regime: 'simples',
    });
    assert.ok(Math.abs(simple.totalAmount - 1200) < 1e-6);
    assert.ok(Math.abs(simple.totalInterest - 200) < 1e-6);

    const annualCompound = computeQuickInterest({
      principal: 2000,
      ratePct: 12,
      rateUnit: 'anual',
      months: 12,
      regime: 'composto',
    });
    assert.ok(Math.abs(annualCompound.totalAmount - 2240) < 1e-4);
  });

  it('builds month calendar data with semantic day tones, agenda groups, and next-month preview', () => {
    const incomes: Income[] = [
      {
        id: 'inc-cal',
        person: 'Ana',
        source: 'Salário',
        amount: 5000,
        frequency: 'Mensal',
        receiptDay: 5,
        receiptDate: '',
        active: true,
        notes: '',
        ...audit,
      },
    ];
    const cards: CreditCard[] = [
      {
        id: 'c-cal',
        name: 'Inter',
        holder: 'Ana',
        limit: 4000,
        closingDay: 10,
        dueDay: 18,
        color: '#0F172A',
        active: true,
        ...audit,
      },
    ];
    const txs: Transaction[] = [
      {
        id: 'tx-pending-exp',
        type: 'Saída',
        description: 'Luz',
        plannedAmount: 250,
        actualAmount: 250,
        category: 'Contas da casa',
        person: 'Casal',
        date: '2026-11-12',
        monthKey: '2026-11',
        paymentMethod: 'Boleto',
        accountOrCard: 'Conta',
        cardId: '',
        status: 'Pendente',
        dueDate: '2026-11-12',
        notes: '',
        ...audit,
      },
      {
        id: 'tx-card-exp',
        type: 'Saída',
        description: 'Supermercado',
        plannedAmount: 400,
        actualAmount: 400,
        category: 'Mercado',
        person: 'Casal',
        date: '2026-11-08',
        monthKey: '2026-11',
        paymentMethod: 'Crédito',
        accountOrCard: 'Inter',
        cardId: 'c-cal',
        status: 'Pago',
        dueDate: '',
        notes: '',
        ...audit,
      },
    ];

    const cal = computeMonthCalendarData({
      monthKey: '2026-11',
      transactions: txs,
      recurringItems: [],
      incomes,
      cards,
      installments: [],
    });

    assert.equal(cal.daysInMonth, 30);
    // 2026-11-01 is Sunday -> leadingEmptyDays = 0
    assert.equal(cal.leadingEmptyDays, 0);
    assert.equal(cal.daySummaries['2026-11-05']?.tone, 'positive');
    assert.equal(cal.daySummaries['2026-11-12']?.tone, 'negative');
    assert.equal(cal.daySummaries['2026-11-18']?.tone, 'warning');
    assert.equal(cal.daySummaries['2026-11-10']?.events[0]?.kind, 'card_close');
    assert.equal(cal.nextMonthPreview.monthKey, '2026-12');
    assert.equal(cal.nextMonthPreview.dayTones[5], 'positive');
  });

  it('formats device system date, time, and author name for Home balance consultation', () => {
    const sampleDate = new Date(2026, 10, 11, 9, 5, 0); // 11/11 09:05 local device time
    assert.equal(
      formatDeviceBalanceTimestamp(sampleDate, 'Vinicius'),
      'Última atualização 09:05 11/11 Vinicius'
    );
    assert.equal(
      formatDeviceBalanceTimestamp(sampleDate, ''),
      'Última atualização 09:05 11/11'
    );
  });

  it('sanitizes negative numbers and auto-switches transaction type to Saída', () => {
    assert.equal(sanitizeSignedDecimalInput('-125,50'), '-125,50');
    assert.equal(sanitizeSignedDecimalInput('-abc42.987'), '-42.98');
    assert.equal(parseSignedDecimal('-125,50'), -125.5);
    assert.ok(Number.isNaN(parseSignedDecimal('-')));

    const negRes = resolveTransactionSignAndType('-89,90', 'Entrada');
    assert.equal(negRes.isNegative, true);
    assert.equal(negRes.nextType, 'Saída');
    assert.equal(negRes.magnitude, 89.9);

    const posRes = resolveTransactionSignAndType('250,00', 'Entrada');
    assert.equal(posRes.isNegative, false);
    assert.equal(posRes.nextType, 'Entrada');
    assert.equal(posRes.magnitude, 250);
  });

  it('projects positive fixed recurring items as income across future months', () => {
    const incomes: Income[] = [
      {
        id: 'inc-sal',
        person: 'Ana',
        source: 'Salário',
        amount: 4000,
        frequency: 'Mensal',
        receiptDay: 5,
        receiptDate: '',
        active: true,
        notes: '',
        ...audit,
      },
    ];
    const positiveFixed: RecurringItem[] = [
      {
        id: 'rec-aluguel',
        type: 'Entrada',
        description: 'Aluguel recebido',
        amount: 1200,
        category: 'Renda',
        person: 'Casal',
        frequency: 'Mensal',
        dayOfMonth: 10,
        startMonthKey: '2026-11',
        endMonthKey: '',
        paymentMethod: 'Pix',
        accountOrCard: 'Conta corrente',
        cardId: '',
        active: true,
        notes: '',
        ...audit,
      },
    ];

    assert.equal(
      getTotalFixedAndConfiguredIncomeInMonth(incomes, positiveFixed, '2026-12'),
      5200
    );

    const rows = computeMonthlyPanel(
      ['2026-11', '2026-12', '2027-01'],
      incomes,
      [],
      [],
      positiveFixed
    );
    assert.equal(rows[0].recurringIncome, 5200);
    assert.equal(rows[1].recurringIncome, 5200);
    assert.equal(rows[2].recurringIncome, 5200);
  });

  it('discounts negative current bank balance from the next fixed income occurrence without double-counting short horizon', () => {
    const accounts: BankAccount[] = [
      {
        id: 'acc-neg',
        name: 'Conta Principal',
        institution: 'Banco',
        type: 'Corrente',
        balance: -800,
        currency: 'BRL',
        lastSyncedAt: '2026-11-18T10:00:00Z',
        active: true,
        ...audit,
      },
    ];
    const incomes: Income[] = [
      {
        id: 'inc-fix',
        person: 'Vinicius',
        source: 'Salário Fixo',
        amount: 3000,
        frequency: 'Mensal',
        receiptDay: 5,
        receiptDate: '',
        active: true,
        notes: '',
        ...audit,
      },
    ];

    // Today is 2026-11-18: Nov 5 already passed -> next fixed income is Dec 5 (2026-12)
    const offsetsNextMonth = computeNegativeBalanceIncomeOffsets({
      bankAccounts: accounts,
      incomes,
      recurringItems: [],
      transactions: [],
      todayISO: '2026-11-18',
    });
    assert.equal(offsetsNextMonth.negativeBalanceDebt, 800);
    assert.equal(offsetsNextMonth.deductionsByMonth['2026-11'] ?? 0, 0);
    assert.equal(offsetsNextMonth.deductionsByMonth['2026-12'], 800);
    assert.equal(offsetsNextMonth.firstImpactedEvent?.dateISO, '2026-12-05');
    assert.equal(offsetsNextMonth.firstImpactedEvent?.netAmountAfterDiscount, 2200);

    const panel = computeMonthlyPanel(
      ['2026-11', '2026-12', '2027-01'],
      incomes,
      [],
      [],
      [],
      accounts,
      '2026-11-18'
    );
    assert.equal(panel[0].negativeBalanceDiscount, 0);
    assert.equal(panel[0].recurringIncome, 3000);
    assert.equal(panel[1].negativeBalanceDiscount, 800);
    assert.equal(panel[1].recurringIncome, 2200);
    assert.equal(panel[2].negativeBalanceDiscount, 0);
    assert.equal(panel[2].recurringIncome, 3000);

    // Home daily metrics in 2026-11 deducts unabsorbed 800 from Nov daily budget base
    const homeMetrics = computeHomeRealizedAndDailyMetrics({
      monthKey: '2026-11',
      todayISO: '2026-11-18',
      bankAccounts: accounts,
      incomes,
      transactions: [],
      installments: [],
      recurringItems: [],
    });
    assert.equal(homeMetrics.negativeBalanceDebt, 800);
    assert.equal(homeMetrics.dailyBudgetBase, 2200);

    // Short horizon starting 2026-11-18 for 30 days: starts at -800, Dec 5 receives 3000 -> +2200 (no double deduction)
    const shortRes = computeShortHorizon({
      daysCount: 30,
      startDateISO: '2026-11-18',
      bankAccounts: accounts,
      incomes,
      transactions: [],
      installments: [],
      recurringItems: [],
      cards: [],
      simulatedPurchases: [],
    });
    assert.equal(shortRes.summary.startBalance, -800);
    assert.equal(shortRes.summary.endBalance, 2200);
    assert.equal(shortRes.summary.negativeBalanceDebt, 800);

    // Multi-month spillover when debt exceeds one monthly paycheck
    const bigDebtAccounts: BankAccount[] = [{ ...accounts[0], balance: -4500 }];
    const spilloverPanel = computeMonthlyPanel(
      ['2026-12', '2027-01', '2027-02'],
      incomes,
      [],
      [],
      [],
      bigDebtAccounts,
      '2026-11-18'
    );
    assert.equal(spilloverPanel[0].negativeBalanceDiscount, 3000);
    assert.equal(spilloverPanel[0].recurringIncome, 0);
    assert.equal(spilloverPanel[1].negativeBalanceDiscount, 1500);
    assert.equal(spilloverPanel[1].recurringIncome, 1500);
    assert.equal(spilloverPanel[2].negativeBalanceDiscount, 0);
    assert.equal(spilloverPanel[2].recurringIncome, 3000);
  });

  it('computes future-month balance always as (salário/ganhos fixos + ganhos previstos) - Faturas/Despesas', () => {
    const accounts: BankAccount[] = [
      {
        id: 'ba-now',
        name: 'Conta Corrente',
        institution: 'Banco',
        type: 'Corrente',
        balance: 1500,
        currency: 'BRL',
        lastSyncedAt: '',
        active: true,
        ...audit,
      },
    ];
    const incomes: Income[] = [
      {
        id: 'inc-sal',
        person: 'Vinicius',
        source: 'Salário',
        amount: 5000,
        frequency: 'Mensal',
        receiptDay: 5,
        receiptDate: '',
        active: true,
        notes: '',
        ...audit,
      },
    ];
    const recurringItems: RecurringItem[] = [
      {
        id: 'rec-plus',
        type: 'Entrada',
        description: 'Freela fixo',
        amount: 1000,
        category: 'Renda',
        person: 'Vinicius',
        frequency: 'Mensal',
        dayOfMonth: 15,
        startMonthKey: '2026-11',
        endMonthKey: '',
        paymentMethod: 'Pix',
        accountOrCard: 'Conta Corrente',
        cardId: '',
        active: true,
        notes: '',
        ...audit,
      },
      {
        id: 'rec-rent',
        type: 'Saída',
        description: 'Aluguel',
        amount: 2000,
        category: 'Moradia',
        person: 'Casal',
        frequency: 'Mensal',
        dayOfMonth: 5,
        startMonthKey: '2026-11',
        endMonthKey: '',
        paymentMethod: 'Pix',
        accountOrCard: 'Conta Corrente',
        cardId: '',
        active: true,
        notes: '',
        ...audit,
      },
    ];
    const card: CreditCard = {
      id: 'c-1',
      name: 'Nubank',
      holder: 'Vinicius',
      limit: 8000,
      closingDay: 10,
      dueDay: 17,
      color: '#0F172A',
      active: true,
      ...audit,
    };
    const transactions: Transaction[] = [
      {
        id: 'tx-future-in',
        type: 'Entrada',
        description: '13º previsto',
        plannedAmount: 2500,
        actualAmount: 2500,
        category: 'Renda',
        person: 'Vinicius',
        date: '2026-12-20',
        monthKey: '2026-12',
        paymentMethod: 'Pix',
        accountOrCard: 'Conta Corrente',
        cardId: '',
        status: 'Pendente',
        dueDate: '2026-12-20',
        notes: '',
        ...audit,
      },
      {
        // Compra no cartão dia 18/11 (após fechamento dia 10) -> entra na fatura de 2026-12!
        id: 'tx-card-late-nov',
        type: 'Saída',
        description: 'Supermercado cartão',
        plannedAmount: 700,
        actualAmount: 700,
        category: 'Mercado',
        person: 'Casal',
        date: '2026-11-18',
        monthKey: '2026-11',
        paymentMethod: 'Crédito',
        accountOrCard: 'Nubank',
        cardId: 'c-1',
        status: 'Pago',
        dueDate: '',
        notes: '',
        ...audit,
      },
    ];
    const installments: Installment[] = [
      {
        id: 'inst-dec',
        description: 'Notebook',
        cardId: 'c-1',
        cardName: 'Nubank',
        person: 'Vinicius',
        category: 'Educação',
        totalAmount: 3000,
        installmentsCount: 10,
        firstChargeDate: '2026-12-05',
        notes: '',
        ...audit,
      },
    ];

    // Mês atual (2026-11): heroBalance mostra o saldo atual das contas (1500)
    const novMetrics = computeHomeRealizedAndDailyMetrics({
      monthKey: '2026-11',
      todayISO: '2026-11-20',
      bankAccounts: accounts,
      incomes,
      transactions,
      installments,
      recurringItems,
      cards: [card],
    });
    assert.equal(novMetrics.isFutureMonth, false);
    assert.equal(novMetrics.heroBalance, 1500);

    // Próximo mês (2026-12): (salário 5000 + ganho fixo 1000 + previsto 2500) - (Fatura cartão 700+300 + Aluguel 2000)
    // = 8500 - 3000 = 5500 (independentemente do saldo bancário estático de 1500)
    const decMetrics = computeHomeRealizedAndDailyMetrics({
      monthKey: '2026-12',
      todayISO: '2026-11-20',
      bankAccounts: accounts,
      incomes,
      transactions,
      installments,
      recurringItems,
      cards: [card],
    });
    assert.equal(decMetrics.isFutureMonth, true);
    assert.equal(decMetrics.expectedEntriesTotal, 8500);
    assert.equal(decMetrics.expectedExpensesTotal, 3000);
    assert.equal(decMetrics.projectedMonthBalance, 5500);
    assert.equal(decMetrics.heroBalance, 5500);
  });

  it('computes payment reminders for transactions, recurring bills, and card invoices with urgency and paid markers', () => {
    const card: CreditCard = {
      id: 'card-1',
      name: 'Nubank',
      holder: 'Ana',
      limit: 5000,
      closingDay: 10,
      dueDay: 18,
      color: '#7C3AED',
      active: true,
      ...audit,
    };

    const recurringItems: RecurringItem[] = [
      {
        id: 'rec-internet',
        type: 'Saída',
        description: 'Internet Fibra',
        amount: 120,
        category: 'Contas Fixas',
        person: 'Casal',
        paymentMethod: 'Boleto',
        accountOrCard: 'Conta',
        cardId: '',
        dayOfMonth: 20, // vence em 2 dias (hoje = 18/11) -> soon
        frequency: 'Mensal',
        startMonthKey: '2026-01',
        endMonthKey: '',
        active: true,
        notes: '',
        ...audit,
      },
      {
        id: 'rec-agua',
        type: 'Saída',
        description: 'Água',
        amount: 95,
        category: 'Contas Fixas',
        person: 'Casal',
        paymentMethod: 'Débito',
        accountOrCard: 'Conta',
        cardId: '',
        dayOfMonth: 15,
        frequency: 'Mensal',
        startMonthKey: '2026-01',
        endMonthKey: '',
        active: true,
        notes: '',
        ...audit,
      },
      {
        id: 'rec-card-sub',
        type: 'Saída',
        description: 'Streaming',
        amount: 50,
        category: 'Lazer',
        person: 'Ana',
        paymentMethod: 'Crédito',
        accountOrCard: 'Nubank',
        cardId: 'card-1',
        dayOfMonth: 5, // entra na fatura de 2026-11
        frequency: 'Mensal',
        startMonthKey: '2026-01',
        endMonthKey: '',
        active: true,
        notes: '',
        ...audit,
      },
    ];

    const transactions: Transaction[] = [
      {
        id: 'tx-overdue',
        type: 'Saída',
        description: 'IPTU atrasado',
        plannedAmount: 300,
        actualAmount: 300,
        category: 'Contas Fixas',
        person: 'Casal',
        date: '2026-10-25',
        monthKey: '2026-10',
        paymentMethod: 'Boleto',
        accountOrCard: 'Conta',
        cardId: '',
        status: 'Pendente',
        dueDate: '2026-10-28',
        notes: '',
        ...audit,
      },
      {
        // Concretização paga da conta fixa rec-agua -> não deve duplicar
        id: 'tx-agua-paid',
        type: 'Saída',
        description: 'Água',
        plannedAmount: 95,
        actualAmount: 95,
        category: 'Contas Fixas',
        person: 'Casal',
        date: '2026-11-15',
        monthKey: '2026-11',
        paymentMethod: 'Débito',
        accountOrCard: 'Conta',
        cardId: '',
        status: 'Pago',
        dueDate: '2026-11-15',
        recurringId: 'rec-agua',
        recurringMonthKey: '2026-11',
        notes: '',
        ...audit,
      },
      {
        // Compra à vista no crédito dentro do ciclo da fatura de Nov (dia 05 < fechamento 10)
        id: 'tx-card-nov',
        type: 'Saída',
        description: 'Mercado no crédito',
        plannedAmount: 450,
        actualAmount: 450,
        category: 'Mercado',
        person: 'Ana',
        date: '2026-11-05',
        monthKey: '2026-11',
        paymentMethod: 'Crédito',
        accountOrCard: 'Nubank',
        cardId: 'card-1',
        status: 'Pago',
        dueDate: '',
        notes: '',
        ...audit,
      },
    ];

    const resPending = computePaymentReminders({
      monthKey: '2026-11',
      todayISO: '2026-11-18',
      transactions,
      recurringItems,
      cards: [card],
      installments: [],
    });

    // Esperados 4 itens: IPTU atrasado (overdue), Fatura Nubank 500 (today), Internet 120 (soon), Água 95 (paid)
    assert.equal(resPending.items.length, 4);
    assert.equal(resPending.summary.overdueCount, 1);
    assert.equal(resPending.summary.dueTodayCount, 1);
    assert.equal(resPending.summary.dueSoonCount, 1);
    assert.equal(resPending.summary.paidCount, 1);
    assert.equal(resPending.summary.pendingCount, 3);
    assert.equal(resPending.summary.urgentCount, 3);
    assert.equal(resPending.summary.pendingAmount, 300 + 500 + 120);

    const invoiceReminder = resPending.items.find((i) => i.sourceKind === 'card_invoice');
    assert.ok(invoiceReminder);
    assert.equal(invoiceReminder.amount, 500);
    assert.equal(invoiceReminder.urgency, 'today');
    assert.equal(invoiceReminder.status, 'Pendente');

    // Agora marca a fatura do cartão como Paga via marcador Transferência
    const resPaid = computePaymentReminders({
      monthKey: '2026-11',
      todayISO: '2026-11-18',
      transactions: [
        ...transactions,
        {
          id: 'tx-invoice-paid',
          type: 'Transferência',
          description: 'Fatura Nubank',
          plannedAmount: 500,
          actualAmount: 500,
          category: 'Cartão',
          person: 'Ana',
          date: '2026-11-18',
          monthKey: '2026-11',
          paymentMethod: 'Pix',
          accountOrCard: 'Nubank',
          cardId: 'card-1',
          status: 'Pago',
          dueDate: '2026-11-18',
          recurringId: 'card-invoice-card-1',
          recurringMonthKey: '2026-11',
          notes: '',
          ...audit,
        },
      ],
      recurringItems,
      cards: [card],
      installments: [],
    });

    assert.equal(resPaid.summary.dueTodayCount, 0);
    assert.equal(resPaid.summary.paidCount, 2);
    assert.equal(resPaid.summary.urgentCount, 2);
  });

  it('flags future months in orange (hasPastMonthImpact) when impacted by past-month card invoices or installments', () => {
    const card: CreditCard = {
      id: 'card-1',
      name: 'Nubank',
      holder: 'Ana',
      limit: 5000,
      closingDay: 10,
      dueDay: 18,
      color: '#7C3AED',
      active: true,
      ...audit,
    };

    const incomes: Income[] = [
      {
        id: 'inc-1',
        source: 'Salário',
        person: 'Ana',
        amount: 5000,
        frequency: 'Mensal',
        receiptDay: 5,
        receiptDate: '',
        active: true,
        notes: '',
        ...audit,
      },
    ];

    const transactions: Transaction[] = [
      {
        // Compra em 18/11 (após fechamento dia 10) -> impacta fatura de 2026-12!
        id: 'tx-nov-after-close',
        type: 'Saída',
        description: 'Compra pós-fechamento',
        plannedAmount: 700,
        actualAmount: 700,
        category: 'Mercado',
        person: 'Ana',
        date: '2026-11-18',
        monthKey: '2026-11',
        paymentMethod: 'Crédito',
        accountOrCard: 'Nubank',
        cardId: 'card-1',
        status: 'Pago',
        dueDate: '',
        notes: '',
        ...audit,
      },
    ];

    const installments: Installment[] = [
      {
        // Parcelamento em 2x iniciando em 2026-12 -> impacta 2026-12 e 2027-01 (por ser parcela de mês anterior em Jan), mas NÃO 2027-02
        id: 'inst-1',
        description: 'Fone',
        cardId: 'card-1',
        cardName: 'Nubank',
        person: 'Ana',
        category: 'Lazer',
        totalAmount: 600,
        installmentsCount: 2,
        firstChargeDate: '2026-12-05',
        notes: '',
        ...audit,
      },
    ];

    const panel = computeMonthlyPanel(
      ['2026-11', '2026-12', '2027-01', '2027-02'],
      incomes,
      transactions,
      installments,
      [],
      [],
      '2026-11-20',
      [card]
    );

    const [nov, dec, jan, feb] = panel;
    assert.equal(nov.hasPastMonthImpact, false);
    assert.equal(dec.hasPastMonthImpact, true);
    assert.equal(dec.pastMonthInvoiceImpact, 700);
    assert.equal(jan.hasPastMonthImpact, true);
    assert.equal(jan.pastMonthInvoiceImpact, 300);
    assert.equal(feb.hasPastMonthImpact, false);

    // Também testa simulação parcelada iniciada em 2026-12 impactando 2027-02 no Horizonte
    const horizon = computeSpendingHorizon({
      monthKeys: ['2026-12', '2027-01', '2027-02'],
      incomes,
      transactions: [],
      installments: [],
      recurringItems: [],
      cards: [card],
      simulatedPurchases: [
        {
          id: 'sim-1',
          description: 'TV simulada',
          totalAmount: 1500,
          mode: 'parcelado',
          installmentsCount: 3,
          startMonthKey: '2026-12',
          endMonthKey: '',
          purchaseDay: 5,
          cardId: 'card-1',
          enabled: true,
        },
        {
          // Fixo sem cartão NÃO deve marcar impacto de fatura passada
          id: 'sim-fix',
          description: 'Academia fixa',
          totalAmount: 120,
          mode: 'fixo',
          installmentsCount: 1,
          startMonthKey: '2026-12',
          endMonthKey: '',
          purchaseDay: 5,
          cardId: '',
          enabled: true,
        },
      ],
      bankAccounts: [],
      todayISO: '2026-11-20',
    });

    assert.equal(horizon.rows[0].hasPastMonthImpact, false); // 2026-12 (início da simulação)
    assert.equal(horizon.rows[1].hasPastMonthImpact, true);  // 2027-01 (parcela simulada vinda de 2026-12)
    assert.equal(horizon.rows[2].hasPastMonthImpact, true);  // 2027-02 (parcela simulada vinda de 2026-12)
    assert.equal(horizon.rows[2].pastMonthInvoiceImpact, 500);
  });

  it('computes next-month balance as (salary + fixed/extra gains) minus expenses instead of repeating positive current balance', () => {
    const positiveAccounts: BankAccount[] = [
      {
        id: 'acc-1',
        name: 'Conta Principal',
        institution: 'Banco Teste',
        type: 'Corrente',
        balance: 950,
        currency: 'BRL',
        active: true,
        lastSyncedAt: '2026-11-18T00:00:00.000Z',
        ...audit,
      },
    ];

    const incomes: Income[] = [
      {
        id: 'inc-sal',
        person: 'Ana',
        source: 'Salário',
        amount: 5000,
        frequency: 'Mensal',
        receiptDay: 5,
        receiptDate: '',
        active: true,
        notes: '',
        ...audit,
      },
    ];

    const recurringItems: RecurringItem[] = [
      {
        id: 'rec-extra',
        type: 'Entrada',
        description: 'Vale',
        amount: 600,
        category: 'Outros',
        person: 'Ana',
        frequency: 'Mensal',
        dayOfMonth: 10,
        startMonthKey: '2026-11',
        endMonthKey: '',
        paymentMethod: 'Pix',
        accountOrCard: 'Conta Principal',
        cardId: '',
        active: true,
        notes: '',
        ...audit,
      },
      {
        id: 'rec-rent',
        type: 'Saída',
        description: 'Aluguel',
        amount: 2100,
        category: 'Moradia',
        person: 'Ana',
        frequency: 'Mensal',
        dayOfMonth: 10,
        startMonthKey: '2026-11',
        endMonthKey: '',
        paymentMethod: 'Pix',
        accountOrCard: 'Conta Principal',
        cardId: '',
        active: true,
        notes: '',
        ...audit,
      },
    ];

    const decMetrics = computeHomeRealizedAndDailyMetrics({
      monthKey: '2026-12',
      todayISO: '2026-11-18',
      bankAccounts: positiveAccounts,
      incomes,
      transactions: [],
      installments: [],
      recurringItems,
      cards: [],
    });

    assert.equal(decMetrics.isFutureMonth, true);
    assert.equal(decMetrics.totalAccountsBalance, 950);
    assert.equal(decMetrics.expectedEntriesTotal, 5600);
    assert.equal(decMetrics.expectedExpensesTotal, 2100);
    assert.equal(decMetrics.projectedMonthBalance, 3500);
    assert.equal(decMetrics.heroBalance, 3500);

    const horizon = computeSpendingHorizon({
      monthKeys: getMonthKeysFromStart('2026-12', 6),
      incomes,
      transactions: [],
      installments: [],
      recurringItems,
      cards: [],
      simulatedPurchases: [],
      bankAccounts: positiveAccounts,
      todayISO: '2026-11-18',
    });

    assert.equal(horizon.rows[0].monthKey, '2026-12');
    assert.equal(horizon.rows[0].simulatedSurplus, 3500);
  });

  it('computes Semanal and Quinzenal incomes strictly by effective receipt dates across months, calendar, and horizon', () => {
    // 2026-10-02 é sexta-feira. A cada 14 dias em outubro: 02, 16 e 30 (3 recebimentos em out/2026!)
    // Em novembro (a cada 14 dias): 13 e 27 (2 recebimentos em nov/2026!)
    const biweeklyInc: Income = {
      id: 'inc-bi',
      person: 'Ana',
      source: 'Freela Quinzenal',
      amount: 1000,
      frequency: 'Quinzenal',
      receiptDay: 2,
      receiptDate: '2026-10-02',
      active: true,
      notes: '',
      ...audit,
    };

    const octDates = getIncomeOccurrenceDatesInMonth(biweeklyInc, '2026-10');
    const novDates = getIncomeOccurrenceDatesInMonth(biweeklyInc, '2026-11');
    assert.deepEqual(octDates, ['2026-10-02', '2026-10-16', '2026-10-30']);
    assert.deepEqual(novDates, ['2026-11-13', '2026-11-27']);
    assert.equal(getIncomeAmountInMonth(biweeklyInc, '2026-10'), 3000);
    assert.equal(getIncomeAmountInMonth(biweeklyInc, '2026-11'), 2000);

    // Semanal ancorado em 2026-11-02 (segunda-feira): 02, 09, 16, 23, 30 -> 5 ocorrências!
    const weeklyDatesNov = getCadenceOccurrencesInMonth({
      monthKey: '2026-11',
      frequency: 'Semanal',
      dayOfMonth: 2,
      anchorDateISO: '2026-11-02',
    });
    assert.deepEqual(weeklyDatesNov, [
      '2026-11-02',
      '2026-11-09',
      '2026-11-16',
      '2026-11-23',
      '2026-11-30',
    ]);

    const weeklyInc: Income = {
      id: 'inc-wk',
      person: 'Bruno',
      source: 'Diárias Semanais',
      amount: 500,
      frequency: 'Semanal',
      receiptDay: 2,
      receiptDate: '2026-11-02',
      active: true,
      notes: '',
      ...audit,
    };

    const panel = computeMonthlyPanel(['2026-10', '2026-11'], [biweeklyInc, weeklyInc], [], []);
    assert.equal(panel[0].totalEntries, 3000); // out: apenas quinzenal (semanal inicia em 2026-11-02)
    assert.equal(panel[1].totalEntries, 2000 + 2500); // nov: 2*1000 + 5*500 = 4500

    const cal = computeMonthCalendarData({
      monthKey: '2026-11',
      transactions: [],
      recurringItems: [],
      incomes: [weeklyInc],
      cards: [],
      installments: [],
    });
    assert.equal(cal.daySummaries['2026-11-30']?.entriesTotal, 500);
  });

  it('avoids double counting credit card purchases and paid invoice markers while tracking open card limit accurately', () => {
    const card: CreditCard = {
      id: 'card-1',
      name: 'Nubank',
      holder: 'Ana',
      limit: 5000,
      closingDay: 10,
      dueDay: 18,
      color: '#7C3AED',
      active: true,
      ...audit,
    };

    const txCardNov: Transaction = {
      id: 'tx-c-1',
      type: 'Saída',
      description: 'Farmácia',
      plannedAmount: 200,
      actualAmount: 200,
      category: 'Saúde',
      person: 'Ana',
      date: '2026-11-04',
      monthKey: '2026-11',
      paymentMethod: 'Crédito',
      accountOrCard: 'Nubank',
      cardId: 'card-1',
      status: 'Pago',
      dueDate: '',
      notes: '',
      ...audit,
    };

    const inst: Installment = {
      id: 'inst-c-1',
      description: 'Celular',
      cardId: 'card-1',
      cardName: 'Nubank',
      person: 'Ana',
      category: 'Outros',
      totalAmount: 1200,
      installmentsCount: 3, // 400 em 2026-11, 400 em 2026-12, 400 em 2027-01
      firstChargeDate: '2026-11-05',
      paidInstallmentNumbers: [],
      notes: '',
      ...audit,
    };

    // Caso 1: Fatura de 2026-11 ainda não foi paga (total = 200 + 400 = 600)
    const usageOpen = computeCardLimitUsage({
      card,
      refMonthKey: '2026-11',
      transactions: [txCardNov],
      installments: [inst],
      recurringItems: [],
    });
    assert.equal(usageOpen.isSelectedInvoicePaid, false);
    assert.equal(usageOpen.usedLimit, 1400); // 1200 parcelas abertas + 200 compra crédito
    assert.equal(usageOpen.availableLimit, 3600);

    // Caso 2: Fatura de 2026-11 paga via marcador (não pode duplicar no painel nem nos gastos realizados)
    const invoicePaidTx: Transaction = {
      id: 'tx-inv-nov',
      type: 'Saída', // Mesmo que salvo como Saída manualmente, recurringId card-invoice- não duplica!
      description: 'Fatura Nubank',
      plannedAmount: 600,
      actualAmount: 600,
      category: 'Cartão',
      person: 'Ana',
      date: '2026-11-18',
      monthKey: '2026-11',
      paymentMethod: 'Pix',
      accountOrCard: 'Conta Corrente',
      cardId: 'card-1',
      status: 'Pago',
      dueDate: '2026-11-18',
      recurringId: 'card-invoice-card-1',
      recurringMonthKey: '2026-11',
      notes: '',
      ...audit,
    };

    const [panelNov] = computeMonthlyPanel(
      ['2026-11'],
      [],
      [txCardNov, invoicePaidTx],
      [inst],
      [],
      [],
      '2026-11-18',
      [card]
    );
    assert.equal(panelNov.totalExpenses, 600); // 200 compra + 400 parcela (sem somar 600 do marcador de novo)

    const usagePaid = computeCardLimitUsage({
      card,
      refMonthKey: '2026-11',
      transactions: [txCardNov, invoicePaidTx],
      installments: [inst],
      recurringItems: [],
    });
    assert.equal(usagePaid.isSelectedInvoicePaid, true);
    // Fatura de nov paga liberou a compra à vista (200) e a parcela 1 (400), restando 800 das parcelas 2 e 3
    assert.equal(usagePaid.usedLimit, 800);
    assert.equal(usagePaid.availableLimit, 4200);

    const shortRes = computeShortHorizon({
      daysCount: 30,
      startDateISO: '2026-11-01',
      bankAccounts: [
        {
          id: 'ba-1',
          name: 'Conta Corrente',
          institution: 'Banco',
          type: 'Corrente',
          balance: 2000,
          currency: 'BRL',
          lastSyncedAt: '',
          active: true,
          ...audit,
        },
      ],
      incomes: [],
      transactions: [txCardNov, invoicePaidTx],
      installments: [inst],
      recurringItems: [],
      cards: [card],
      simulatedPurchases: [],
    });
    // Como a fatura de nov já está paga no startBalance, não é subtraída de novo no vencimento dia 18
    assert.equal(shortRes.summary.endBalance, 2000);
  });

  it('differentiates saldoBancario, saldoComprometido, saldoLivre, and saldoPrevisto accurately', () => {
    const bankAccounts: BankAccount[] = [
      {
        id: 'ba1',
        name: 'Conta Corrente',
        institution: 'Banco',
        type: 'Corrente',
        balance: 3000,
        currency: 'BRL',
        lastSyncedAt: '',
        active: true,
        ...audit,
      },
    ];
    const incomes: Income[] = [
      {
        id: 'inc1',
        person: 'Ana',
        source: 'Salário',
        amount: 5000,
        frequency: 'Mensal',
        receiptDay: 5,
        receiptDate: '',
        active: true,
        notes: '',
        ...audit,
      },
    ];
    const card: CreditCard = {
      id: 'c1',
      name: 'Visa',
      holder: 'Ana',
      limit: 4000,
      closingDay: 10,
      dueDay: 18,
      color: '#0F172A',
      active: true,
      ...audit,
    };
    const transactions: Transaction[] = [
      {
        id: 'tx-in-paid',
        type: 'Entrada',
        description: 'Salário já recebido',
        plannedAmount: 5000,
        actualAmount: 5000,
        category: 'Renda',
        person: 'Ana',
        date: '2026-11-05',
        monthKey: '2026-11',
        paymentMethod: 'Pix',
        accountOrCard: 'Conta Corrente',
        cardId: '',
        status: 'Pago',
        dueDate: '',
        notes: '',
        ...audit,
      },
      {
        id: 'tx-pending-bill',
        type: 'Saída',
        description: 'Condomínio pendente',
        plannedAmount: 700,
        actualAmount: 700,
        category: 'Moradia',
        person: 'Ana',
        date: '2026-11-22',
        monthKey: '2026-11',
        paymentMethod: 'Boleto',
        accountOrCard: 'Conta Corrente',
        cardId: '',
        status: 'Pendente',
        dueDate: '2026-11-22',
        notes: '',
        ...audit,
      },
      {
        id: 'tx-card-open',
        type: 'Saída',
        description: 'Restaurante',
        plannedAmount: 300,
        actualAmount: 300,
        category: 'Alimentação',
        person: 'Ana',
        date: '2026-11-06',
        monthKey: '2026-11',
        paymentMethod: 'Crédito',
        accountOrCard: 'Visa',
        cardId: 'c1',
        status: 'Pago',
        dueDate: '',
        notes: '',
        ...audit,
      },
    ];
    const recurringItems: RecurringItem[] = [
      {
        id: 'rec-luz',
        type: 'Saída',
        description: 'Luz',
        amount: 200,
        category: 'Moradia',
        person: 'Ana',
        frequency: 'Mensal',
        dayOfMonth: 25,
        startMonthKey: '2026-01',
        endMonthKey: '',
        paymentMethod: 'Pix',
        accountOrCard: 'Conta Corrente',
        cardId: '',
        active: true,
        notes: '',
        ...audit,
      },
    ];

    const breakdown = computeBalanceBreakdown({
      monthKey: '2026-11',
      todayISO: '2026-11-15',
      bankAccounts,
      incomes,
      transactions,
      installments: [],
      recurringItems,
      cards: [card],
    });

    // Saldo bancário = 3000
    assert.equal(breakdown.saldoBancario, 3000);
    // Comprometido = 700 condomínio pendente + 200 luz fixa + 300 fatura aberta = 1200
    assert.equal(breakdown.saldoComprometido, 1200);
    // Livre = 3000 - 1200 = 1800
    assert.equal(breakdown.saldoLivre, 1800);
    // Entradas previstas = 5000 (renda) + 5000 (tx) -> pendentes = 5000; previsto = 3000 + 5000 - 1200 = 6800
    assert.equal(breakdown.entradasPendentes, 5000);
    assert.equal(breakdown.saldoPrevisto, 6800);
  });
});

describe('Prompt 3 & Prompt 4 — Credit Hub & Free Money Projection Engine', () => {
  it('handles full invoice lifecycle (spot, post-closing, installment, partial/full payment, overdue, estorno, anticipation, limit rules)', () => {
    const cardTotalRule: CreditCard = {
      id: 'card-main',
      name: 'Nubank Principal',
      holder: 'Ana',
      limit: 5000,
      closingDay: 10,
      dueDay: 18,
      color: '#7C3AED',
      active: true,
      limitRule: 'total_parcelamento',
      ...audit,
    };

    const cardMonthlyRule: CreditCard = {
      ...cardTotalRule,
      id: 'card-monthly',
      limitRule: 'parcela_mensal',
    };

    // Compra antes do fechamento (cai na fatura de 2026-11) e compra após fechamento (dia 12 > closingDay 10 -> cai em 2026-12)
    const txSpotNov: Transaction = {
      id: 'tx-spot-1',
      type: 'Saída',
      description: 'Mercado Crédito',
      plannedAmount: 400,
      actualAmount: 400,
      category: 'Alimentação',
      person: 'Ana',
      date: '2026-11-05',
      monthKey: '2026-11',
      paymentMethod: 'Crédito',
      accountOrCard: 'Nubank Principal',
      cardId: 'card-main',
      status: 'Pago',
      dueDate: '',
      notes: '',
      ...audit,
    };

    const txAfterCloseNov: Transaction = {
      id: 'tx-after-close',
      type: 'Saída',
      description: 'Farmácia Pós-Fechamento',
      plannedAmount: 250,
      actualAmount: 250,
      category: 'Saúde',
      person: 'Ana',
      date: '2026-11-12',
      monthKey: '2026-12', // Roteada pela data de fechamento para dezembro
      paymentMethod: 'Crédito',
      accountOrCard: 'Nubank Principal',
      cardId: 'card-main',
      status: 'Pago',
      dueDate: '',
      notes: '',
      ...audit,
    };

    const estornoMercado: Transaction = {
      id: 'tx-refund-1',
      type: 'Entrada',
      description: 'Estorno Mercado Crédito',
      plannedAmount: 100,
      actualAmount: 100,
      category: 'Estorno',
      person: 'Ana',
      date: '2026-11-08',
      monthKey: '2026-11',
      paymentMethod: 'Crédito',
      accountOrCard: 'Nubank Principal',
      cardId: 'card-main',
      status: 'Pago',
      dueDate: '',
      entryKind: 'estorno',
      refundTargetId: 'tx-spot-1',
      notes: '',
      ...audit,
    };

    const instNotebook: Installment = {
      id: 'inst-note',
      description: 'Notebook',
      cardId: 'card-main',
      cardName: 'Nubank Principal',
      person: 'Ana',
      category: 'Eletrônicos',
      totalAmount: 1200,
      installmentsCount: 4, // 300 por mês em 2026-11, 2026-12, 2027-01, 2027-02
      firstChargeDate: '2026-11-05',
      paidInstallmentNumbers: [],
      prepaidInstallmentNumbers: [],
      cancelledInstallmentNumbers: [],
      refundedAmount: 0,
      status: 'Ativo',
      notes: '',
      ...audit,
    };

    // 1. Fatura aberta antes do fechamento (2026-11-09): 400 - 100 estorno + 300 parcela 1 = 600
    const invOpen = getCardInvoiceInMonth(
      cardTotalRule,
      '2026-11',
      [txSpotNov, txAfterCloseNov, estornoMercado],
      [instNotebook],
      [],
      '2026-11-09'
    );
    assert.equal(invOpen.grossTotal, 700);
    assert.equal(invOpen.refundsTotal, 100);
    assert.equal(invOpen.total, 600);
    assert.equal(invOpen.status, 'Aberta');

    // 2. Fatura fechada entre dia 10 e dia 18 (2026-11-14)
    const invClosed = getCardInvoiceInMonth(
      cardTotalRule,
      '2026-11',
      [txSpotNov, txAfterCloseNov, estornoMercado],
      [instNotebook],
      [],
      '2026-11-14'
    );
    assert.equal(invClosed.status, 'Fechada');

    // 3. Fatura vencida após dia 18 sem pagamento integral (2026-11-20)
    const invOverdue = getCardInvoiceInMonth(
      cardTotalRule,
      '2026-11',
      [txSpotNov, txAfterCloseNov, estornoMercado],
      [instNotebook],
      [],
      '2026-11-20'
    );
    assert.equal(invOverdue.status, 'Vencida');
    assert.equal(invOverdue.isOverdue, true);

    // 4. Pagamento parcial de R$ 200 -> reduz remainingAmount para 400 e marca 'Parcialmente paga'
    const partialPayTx: Transaction = {
      id: 'tx-pay-part',
      type: 'Saída',
      description: 'Pagamento parcial fatura Nubank',
      plannedAmount: 200,
      actualAmount: 200,
      category: 'Cartão',
      person: 'Ana',
      date: '2026-11-16',
      monthKey: '2026-11',
      paymentMethod: 'Pix',
      accountOrCard: 'Conta Principal',
      cardId: 'card-main',
      status: 'Pago',
      dueDate: '2026-11-18',
      recurringId: 'card-invoice-card-main',
      recurringMonthKey: '2026-11',
      entryKind: 'pagamento_fatura',
      notes: '',
      ...audit,
    };

    const invPartial = getCardInvoiceInMonth(
      cardTotalRule,
      '2026-11',
      [txSpotNov, txAfterCloseNov, estornoMercado, partialPayTx],
      [instNotebook],
      [],
      '2026-11-16'
    );
    assert.equal(invPartial.status, 'Parcialmente paga');
    assert.equal(invPartial.paidAmount, 200);
    assert.equal(invPartial.remainingAmount, 400);

    // Regra de limite total_parcelamento vs parcela_mensal com antecipação de 1 parcela (#4)
    const instWithAnticipation: Installment = {
      ...instNotebook,
      prepaidInstallmentNumbers: [4],
    };
    const instMonthlyCard: Installment = {
      ...instWithAnticipation,
      cardId: 'card-monthly',
    };
    const summaryAnt = computeInstallmentSummary(instWithAnticipation, '2026-11', [cardTotalRule]);
    assert.equal(summaryAnt.prepaidInstallments, 1);
    assert.equal(summaryAnt.remainingInstallments, 3); // 4 total - 1 antecipada = 3 restantes
    assert.equal(summaryAnt.remainingAmount, 900);
    assert.equal(getInstallmentAmountInMonth(instWithAnticipation, '2027-02'), 0); // parcela 4 zerada

    const usageTotalRule = computeCardLimitUsage({
      card: cardTotalRule,
      refMonthKey: '2026-11',
      transactions: [txSpotNov, txAfterCloseNov, estornoMercado, partialPayTx],
      installments: [instWithAnticipation],
      recurringItems: [],
      todayISO: '2026-11-16',
    });
    // Parcelamento compromisso total = 900 (3 restantes), avulsos não pagos = 300 (400-100) + 250 = 550, pagamento parcial já efetuado = -200 => 1250
    assert.equal(usageTotalRule.usedLimit, 1250);
    assert.equal(usageTotalRule.availableLimit, 3750);

    const usageMonthlyRule = computeCardLimitUsage({
      card: cardMonthlyRule,
      refMonthKey: '2026-11',
      transactions: [{ ...txSpotNov, cardId: 'card-monthly' }],
      installments: [instMonthlyCard],
      recurringItems: [],
      todayISO: '2026-11-16',
    });
    // Regra mensal conta fatura aberta do mês (400 + 300 = 700), sem comprometer parcelas futuras
    assert.equal(usageMonthlyRule.usedLimit, 700);
  });

  it('projects Free Money (10 dimensions), answers target date queries, and evaluates all 6 deterministic scenarios', () => {
    const bankAccounts: BankAccount[] = [
      {
        id: 'ba1',
        name: 'Conta Corrente',
        institution: 'Banco',
        type: 'Corrente',
        balance: 2000,
        currency: 'BRL',
        lastSyncedAt: '',
        active: true,
        ...audit,
      },
    ];
    const incomes: Income[] = [
      {
        id: 'inc-sal',
        person: 'Ana',
        source: 'Salário Ana',
        amount: 4000,
        frequency: 'Mensal',
        receiptDay: 5,
        receiptDate: '',
        active: true,
        notes: '',
        ...audit,
      },
    ];
    const recurringItems: RecurringItem[] = [
      {
        id: 'rec-alu',
        type: 'Saída',
        description: 'Aluguel',
        amount: 2500,
        category: 'Moradia',
        person: 'Ana',
        frequency: 'Mensal',
        dayOfMonth: 10,
        startMonthKey: '2026-01',
        endMonthKey: '',
        paymentMethod: 'Pix',
        accountOrCard: 'Conta Corrente',
        cardId: '',
        active: true,
        notes: '',
        ...audit,
      },
    ];
    const card: CreditCard = {
      id: 'c1',
      name: 'Visa',
      holder: 'Ana',
      limit: 5000,
      closingDay: 10,
      dueDay: 15,
      color: '#0F172A',
      active: true,
      ...audit,
    };
    const inst: Installment = {
      id: 'inst-tv',
      description: 'TV Sala',
      cardId: 'c1',
      cardName: 'Visa',
      person: 'Ana',
      category: 'Casa',
      totalAmount: 1200,
      installmentsCount: 3, // 400 em nov, dez, jan
      firstChargeDate: '2026-11-02',
      paidInstallmentNumbers: [],
      notes: '',
      ...audit,
    };
    const goals: Goal[] = [
      {
        id: 'g-emerg',
        name: 'Reserva Emergência',
        targetAmount: 20000,
        currentAmount: 5000,
        monthlyContribution: 500,
        annualYieldRate: 0.1,
        notes: '',
        ...audit,
      },
    ];

    // 1. Projeção de 30 dias a partir de 2026-11-01
    const proj30 = computeFreeMoneyProjection({
      mode: 'daily',
      count: 30,
      startDateISO: '2026-11-01',
      bankAccounts,
      incomes,
      transactions: [],
      installments: [inst],
      recurringItems,
      cards: [card],
      goals,
    });

    assert.equal(proj30.daysCount, 30);
    assert.equal(proj30.dimensions.saldoBancarioReal, 2000);
    assert.equal(proj30.dimensions.receitasPrevistas, 4000);
    assert.equal(proj30.dimensions.compromissosFuturos, 2900); // 2500 aluguel + 400 fatura TV
    assert.equal(proj30.dimensions.reservasPlanejadas, 500); // reserva meta nov
    // Identidade: 2000 + 4000 - 2900 - 500 = 2600
    assert.equal(proj30.dimensions.dinheiroLivreProjetado, 2600);

    // 2. Consulta para data alvo + projeção mensal de 12m/24m/36m
    const q12Nov = queryFreeMoneyAtDate({
      targetDateISO: '2026-11-12',
      startDateISO: '2026-11-01',
      bankAccounts,
      incomes,
      transactions: [],
      installments: [inst],
      recurringItems,
      cards: [card],
      goals,
    });
    // Até 12/11: 2000 + 4000 (dia 5) - 2500 (dia 10) = 3500 (fatura 400 é dia 15, reserva 500 é dia 30)
    assert.equal(q12Nov.dinheiroLivreProjetado, 3500);

    const proj36m = computeFreeMoneyProjection({
      mode: 'monthly',
      count: 36,
      startDateISO: '2026-11-01',
      bankAccounts,
      incomes,
      transactions: [],
      installments: [inst],
      recurringItems,
      cards: [card],
      goals,
    });
    assert.equal(proj36m.monthlyPoints.length, 36);
    assert.ok(proj36m.monthlyPoints[0].origins.incomes.length > 0);
    assert.ok(proj36m.monthlyPoints[0].origins.cardInvoices.length > 0);

    // 3. Testar todos os 6 cenários determinísticos
    const scenarios: HorizonScenarioRule[] = [
      {
        id: 'sc-delay',
        type: 'alteracao_data_recebimento',
        title: 'Salário atrasado para dia 20',
        enabled: true,
        amount: 0,
        startMonthKey: '2026-11',
        targetIncomeId: 'inc-sal',
        newReceiptDay: 20, // Aluguel dia 10 e fatura dia 15 caem ANTES do salário! 2000 - 2500 = -500 -> alerta negativo!
      },
      {
        id: 'sc-cut',
        type: 'perda_renda',
        title: 'Corte 25% no salário',
        enabled: true,
        amount: 25,
        usePercentage: true,
        startMonthKey: '2026-11',
        targetIncomeId: 'inc-sal',
      },
      {
        id: 'sc-boost',
        type: 'aumento_renda',
        title: 'Bônus extra',
        enabled: true,
        amount: 500,
        startMonthKey: '2026-11',
        endMonthKey: '2026-11',
        dayOfMonth: 25,
      },
      {
        id: 'sc-exp',
        type: 'nova_despesa',
        title: 'Seguro extra',
        enabled: true,
        amount: 200,
        isRecurringExpense: true,
        startMonthKey: '2026-11',
        dayOfMonth: 18,
      },
      {
        id: 'sc-parc',
        type: 'compra_parcelada',
        title: 'Bicicleta 2x',
        enabled: true,
        amount: 600,
        installmentsCount: 2,
        startMonthKey: '2026-11',
        dayOfMonth: 12,
      },
      {
        id: 'sc-ant',
        type: 'antecipacao_divida',
        title: 'Quitar TV com desconto',
        enabled: true,
        amount: 950,
        targetInstallmentId: 'inst-tv', // antecipa as 3 parcelas (1200) por 950 -> zera 400 na fatura de nov, dez, jan!
        startMonthKey: '2026-11',
        dayOfMonth: 2,
      },
    ];

    const projScenarios = computeFreeMoneyProjection({
      mode: 'daily',
      count: 30,
      startDateISO: '2026-11-01',
      bankAccounts,
      incomes,
      transactions: [],
      installments: [inst],
      recurringItems,
      cards: [card],
      goals,
      scenarioRules: scenarios,
    });

    // Como salário foi movido para dia 20 e houve antecipação dia 2 (950), o saldo entra em alerta negativo antes do dia 20!
    assert.ok(projScenarios.negativeAlerts.length > 0);
    // Receitas previstas: salário caiu 25% (4000 -> 3000) + 500 bônus = 3500
    assert.equal(projScenarios.dimensions.receitasPrevistas, 3500);
    // Faturas futuras da TV foram zeradas pela antecipação! (total faturas = 0)
    assert.equal(projScenarios.dimensions.faturasFuturas, 0);
    // Saldo final: 2000 + 3500 - (2500 aluguel + 200 seguro + 300 parc 1 bike + 950 antecipação) - 500 reserva = 1050
    assert.equal(projScenarios.dimensions.dinheiroLivreProjetado, 1050);
  });

  it('excludes Transferência transactions from revenues and expenses across panel, balance, horizon and breakdown', () => {
    const bankAccounts: BankAccount[] = [
      { id: 'b1', name: 'Conta Principal', institution: 'Banco', type: 'Corrente', balance: 5000, currency: 'BRL', lastSyncedAt: '2026-11-01', active: true, ...audit },
      { id: 'b2', name: 'Conta Reserva', institution: 'Banco', type: 'Poupança', balance: 1500, currency: 'BRL', lastSyncedAt: '2026-11-01', active: true, ...audit },
    ];
    const incomes: Income[] = [
      { id: 'inc1', source: 'Salário', person: 'Ana', amount: 4000, frequency: 'Mensal', receiptDay: 5, receiptDate: '', active: true, notes: '', ...audit },
    ];
    const transactions: Transaction[] = [
      {
        id: 'tx-transf-pago',
        date: '2026-11-10',
        monthKey: '2026-11',
        description: 'Transferência para reserva',
        plannedAmount: 1200,
        actualAmount: 1200,
        type: 'Transferência',
        category: 'Transferência',
        person: 'Ana',
        paymentMethod: 'Pix',
        accountOrCard: 'Conta Principal',
        cardId: '',
        status: 'Pago',
        dueDate: '',
        notes: '',
        ...audit,
      },
      {
        id: 'tx-transf-pend',
        date: '2026-11-14',
        monthKey: '2026-11',
        description: 'Transferência agendada entre contas',
        plannedAmount: 800,
        actualAmount: 800,
        type: 'Transferência',
        category: 'Transferência',
        person: 'Ana',
        paymentMethod: 'Pix',
        accountOrCard: 'Conta Principal',
        cardId: '',
        status: 'Pendente',
        dueDate: '',
        notes: '',
        ...audit,
      },
      {
        id: 'tx-exp',
        date: '2026-11-11',
        monthKey: '2026-11',
        description: 'Supermercado',
        plannedAmount: 350,
        actualAmount: 350,
        type: 'Saída',
        category: 'Alimentação',
        person: 'Ana',
        paymentMethod: 'Débito',
        accountOrCard: 'Conta Principal',
        cardId: '',
        status: 'Pendente',
        dueDate: '',
        notes: '',
        ...audit,
      },
      {
        id: 'tx-inc',
        date: '2026-11-12',
        monthKey: '2026-11',
        description: 'Reembolso',
        plannedAmount: 250,
        actualAmount: 250,
        type: 'Entrada',
        category: 'Outros',
        person: 'Ana',
        paymentMethod: 'Pix',
        accountOrCard: 'Conta Principal',
        cardId: '',
        status: 'Pendente',
        dueDate: '',
        notes: '',
        ...audit,
      },
    ];

    const panel = computeMonthlyPanel(
      ['2026-11'],
      incomes,
      transactions,
      [],
      [],
      bankAccounts,
      '2026-11-01',
      []
    )[0];

    assert.equal(panel.extraEntries, 250);
    assert.equal(panel.totalEntries, 4250);
    assert.equal(panel.launchedExpenses, 350);
    assert.equal(panel.totalExpenses, 350);

    const breakdown = computeBalanceBreakdown({
      monthKey: '2026-11',
      todayISO: '2026-11-01',
      bankAccounts,
      incomes,
      transactions,
      installments: [],
      recurringItems: [],
      cards: [],
    });
    assert.equal(breakdown.saldoBancario, 6500);
    assert.equal(breakdown.entradasPendentes, 4250);
    assert.equal(breakdown.saldoComprometido, 350);

    const horizon = computeShortHorizon({
      daysCount: 30,
      startDateISO: '2026-11-01',
      bankAccounts,
      incomes,
      transactions,
      installments: [],
      recurringItems: [],
      cards: [],
      simulatedPurchases: [],
    });
    // Transferências (1200 paga e 800 pendente) não entram como receita nem despesa no horizonte
    assert.equal(horizon.summary.totalEntries, 4250);
    assert.equal(horizon.summary.totalExpenses, 350);

    const freeMoney = computeFreeMoneyProjection({
      mode: 'daily',
      count: 30,
      startDateISO: '2026-11-01',
      bankAccounts,
      incomes,
      transactions,
      installments: [],
      recurringItems: [],
      cards: [],
      goals: [],
    });
    assert.equal(freeMoney.dimensions.receitasPrevistas, 4250);
    assert.equal(freeMoney.dimensions.despesasPagas, 0);
    assert.equal(freeMoney.dimensions.despesasPendentes, 350);

    const memberBreakdown = computeMemberIncomeAndSpendingBreakdown({
      household: {
        id: 'h1',
        name: 'Minhas Finanças',
        ownerUid: 'u1',
        memberUids: ['u1'],
        partner1Uid: 'u1',
        partner2Uid: '',
        partner1Name: 'Ana',
        partner2Name: 'Ana',
        periodStart: '2026-01-01',
        categories: ['Alimentação'],
        paymentMethods: ['Pix'],
        rooms: [],
        accounts: ['Conta Principal'],
        lastInviteCode: '',
      },
      incomes,
      transactions,
      installments: [],
      recurringItems: [],
      monthKey: '2026-11',
    });
    assert.equal(memberBreakdown.rows.length, 1);
    assert.equal(memberBreakdown.rows[0].person, 'Ana');
    assert.equal(memberBreakdown.rows[0].individualSpending, 350);
    assert.equal(memberBreakdown.totalIncome, 4250);
  });

  it('returns only the single owner in getHouseholdPeople when household is individual', () => {
    const individualHousehold: Household = {
      id: 'h-ind',
      name: 'Finanças Pessoais',
      ownerUid: 'u1',
      memberUids: ['u1'],
      partner1Uid: 'u1',
      partner2Uid: '',
      partner1Name: 'Carlos',
      partner2Name: 'Carlos',
      periodStart: '2026-01-01',
      categories: [],
      paymentMethods: [],
      rooms: [],
      accounts: [],
      lastInviteCode: '',
    };
    const people = getHouseholdPeople(individualHousehold);
    assert.deepEqual(people, ['Carlos']);
    assert.ok(!people.includes('Casal'));
  });

  it('computes compound interest, Brazilian IR brackets, IOF under 30 days, and Poupança rules accurately', () => {
    assert.equal(computePoupancaAnnualPct(11.25, 0.85), Number((((Math.pow(1.005, 12) - 1) * 100) + 0.85).toFixed(2)));
    assert.equal(computePoupancaAnnualPct(8.0, 0.5), 6.1);

    assert.equal(getBrazilianIRRate(90, 'cdi'), 0.225);
    assert.equal(getBrazilianIRRate(240, 'cdi'), 0.20);
    assert.equal(getBrazilianIRRate(540, 'cdi'), 0.175);
    assert.equal(getBrazilianIRRate(750, 'cdi'), 0.15);
    assert.equal(getBrazilianIRRate(90, 'poupanca'), 0);

    assert.equal(getBrazilianIOFRate(15, 'cdi'), 0.5);
    assert.equal(getBrazilianIOFRate(30, 'cdi'), 0);
    assert.equal(getBrazilianIOFRate(15, 'poupanca'), 0);

    const cdi15d = simulateInvestmentGrowth({
      initialAmount: 10000,
      monthlyContribution: 0,
      periodMode: 'days',
      termMonths: 1,
      durationDays: 15,
      yieldType: 'cdi',
      yieldIndicatorPct: 100,
      indicators: DEFAULT_BENCHMARK_INDICATORS,
    });
    assert.equal(cdi15d.iofRate, 0.5);
    assert.equal(cdi15d.irRate, 0.225);
    assert.ok(cdi15d.grossInterest > 0);
    assert.ok(cdi15d.iofTax > 0);
    assert.ok(cdi15d.irTax > 0);
    assert.ok(cdi15d.netBalance < cdi15d.grossBalance);

    const poup15d = simulateInvestmentGrowth({
      initialAmount: 10000,
      monthlyContribution: 0,
      periodMode: 'days',
      termMonths: 1,
      durationDays: 15,
      yieldType: 'poupanca',
      indicators: DEFAULT_BENCHMARK_INDICATORS,
    });
    assert.equal(poup15d.grossInterest, 0);
    assert.equal(poup15d.netInterest, 0);
    assert.equal(poup15d.iofTax, 0);
    assert.equal(poup15d.irTax, 0);

    const sim25m = simulateInvestmentGrowth({
      initialAmount: 5000,
      monthlyContribution: 500,
      extraOneTimeAmount: 2000,
      extraOneTimeMonth: 6,
      periodMode: 'months',
      termMonths: 25,
      yieldType: 'cdi',
      yieldIndicatorPct: 110,
      indicators: {
        ...DEFAULT_BENCHMARK_INDICATORS,
        cdiAnnualPct: 10,
      },
    });
    assert.equal(sim25m.totalInvested, 5000 + 25 * 500 + 2000);
    assert.equal(sim25m.irRate, 0.15);
    assert.equal(sim25m.iofTax, 0);
    assert.equal(sim25m.timeline.length, 26);
    assert.ok(sim25m.grossBalance > sim25m.totalInvested);
    assert.ok(sim25m.netBalance > sim25m.totalInvested && sim25m.netBalance < sim25m.grossBalance);
    assert.ok(sim25m.hypotheses.length >= 3);
    assert.ok(sim25m.disclaimer.includes('garantia'));

    const comparison = compareInvestmentModalities({
      initialAmount: 10000,
      monthlyContribution: 400,
      termMonths: 24,
      cdiIndicatorPct: 100,
      selicIndicatorPct: 100,
      selicCustodyFeePct: 0.2,
      indicators: DEFAULT_BENCHMARK_INDICATORS,
    });
    assert.equal(comparison.length, 3);
    const cdiRow = comparison.find((r) => r.yieldType === 'cdi')!;
    const poupRow = comparison.find((r) => r.yieldType === 'poupanca')!;
    const selicRow = comparison.find((r) => r.yieldType === 'selic')!;
    assert.equal(poupRow.irExempt, true);
    assert.equal(poupRow.taxesAndFees, 0);
    assert.equal(cdiRow.irExempt, false);
    assert.ok(cdiRow.taxesAndFees > 0);
    assert.ok(selicRow.taxesAndFees > 0);
    assert.ok(cdiRow.netBalance > poupRow.netBalance);
    assert.equal(
      Number(resolveInvestmentAnnualRatePct({ yieldType: 'cdi', yieldIndicatorPct: 120, indicators: { ...DEFAULT_BENCHMARK_INDICATORS, cdiAnnualPct: 10 } }).toFixed(2)),
      12
    );
  });

  it('computes Goal yield projections using yieldType, indicator percentage and termMonths', () => {
    const goal: Goal = {
      id: 'g-cdi',
      name: 'Reserva de Emergência',
      objective: '6 meses de custo de vida',
      initialAmount: 10000,
      targetAmount: 30000,
      currentAmount: 10000,
      monthlyContribution: 1000,
      annualYieldRate: 0.11,
      yieldType: 'cdi',
      yieldIndicatorPct: 110,
      termMonths: 24,
      custodyFeePct: 0,
      notes: '',
      ...audit,
    };

    const proj = computeGoalProjection(goal, '2026-11', {
      ...DEFAULT_BENCHMARK_INDICATORS,
      cdiAnnualPct: 10,
    });
    assert.equal(Number((proj.effectiveAnnualYieldRate * 100).toFixed(2)), 11);
    assert.equal(proj.termMonths, 24);
    assert.ok(proj.termGrossBalance > 10000 + 24 * 1000);
    assert.ok(proj.termNetBalance < proj.termGrossBalance);
    assert.ok(proj.termEstimatedTaxes > 0);
    assert.ok(proj.monthsToGoal !== null && proj.monthsToGoal > 0 && proj.monthsToGoal < 20);
  });

  it('computes PlannedPurchase deadlines, pace recommendations and portfolio summary without double-counting', () => {
    const linkedGoal: Goal = {
      id: 'g-car',
      name: 'Caixinha do Carro',
      targetAmount: 60000,
      currentAmount: 15000,
      monthlyContribution: 1500,
      annualYieldRate: 0.11,
      yieldType: 'cdi',
      yieldIndicatorPct: 100,
      termMonths: 24,
      notes: '',
      ...audit,
    };

    const carProject: PlannedPurchase = {
      id: 'p-car',
      priority: 1,
      room: 'Garagem',
      projectCategory: 'Carro',
      iconName: 'car',
      product: 'Carro seminovo',
      brandModel: 'Compacto',
      specs: '1.0 Turbo',
      quantity: 1,
      estimatedUnitPrice: 45000,
      hasActualPrice: false,
      actualUnitPrice: 0,
      status: 'Pendente',
      targetDate: '2027-11-01',
      purchaseDate: '',
      paymentMethod: 'Pix',
      notes: '',
      savedAmount: 5000, // ignorado quando há linkedGoal ativo (15000 prevalece)
      monthlyContribution: 2000,
      linkedGoalId: 'g-car',
      ...audit,
    };

    const phoneProject: PlannedPurchase = {
      id: 'p-phone',
      priority: 2,
      room: 'Pessoal',
      projectCategory: 'Celular',
      iconName: 'smartphone',
      product: 'Celular novo',
      brandModel: 'Modelo Pro',
      specs: '256GB',
      quantity: 1,
      estimatedUnitPrice: 6000,
      hasActualPrice: false,
      actualUnitPrice: 0,
      status: 'Pendente',
      targetDate: '2027-05-01',
      purchaseDate: '',
      paymentMethod: 'Pix',
      notes: '',
      savedAmount: 2000,
      monthlyContribution: 500,
      ...audit,
    };

    const metricsCar = computePlannedPurchaseMetrics(carProject, {
      linkedGoal,
      todayISO: '2026-11-01',
    });
    assert.equal(metricsCar.effectiveSavedAmount, 15000);
    assert.equal(metricsCar.remainingAmount, 30000);
    assert.equal(metricsCar.monthsToDeadline, 12);
    assert.equal(metricsCar.recommendedMonthlyContribution, 2500);
    assert.equal(metricsCar.projectedMonthsAtPlannedPace, 15);
    assert.equal(metricsCar.isOnTrackForDeadline, false);

    const metricsCarAccelerated = computePlannedPurchaseMetrics(carProject, {
      linkedGoal,
      todayISO: '2026-11-01',
      overrideMonthlyContribution: 3000,
    });
    assert.equal(metricsCarAccelerated.projectedMonthsAtPlannedPace, 10);
    assert.equal(metricsCarAccelerated.isOnTrackForDeadline, true);

    const bankAccounts: BankAccount[] = [
      { id: 'b1', name: 'Conta Corrente', institution: 'Banco', type: 'Corrente', balance: 5000, currency: 'BRL', lastSyncedAt: '2026-11-01', active: true, ...audit },
    ];
    const portfolio = computeProjectsPortfolioSummary({
      plannedPurchases: [carProject, phoneProject],
      goals: [linkedGoal],
      bankAccounts,
      todayISO: '2026-11-01',
    });
    assert.equal(portfolio.totalPatrimony, 20000);
    assert.equal(portfolio.totalProjectsBudget, 51000);
    assert.equal(portfolio.totalSavedForProjects, 17000);
    assert.equal(portfolio.totalRemainingForProjects, 34000);
    assert.equal(portfolio.totalMonthlyContributions, 2500);
    assert.equal(portfolio.activeProjectsCount, 2);
    assert.equal(portfolio.committedPatrimonyPct, 85);
  });

  it('separates expense vs income categories, classifies income sources, and distinguishes Compras from Projetos', () => {
    assert.ok(DEFAULT_EXPENSE_CATEGORIES.includes('Moradia'));
    assert.ok(DEFAULT_EXPENSE_CATEGORIES.includes('Impostos'));
    assert.ok(!DEFAULT_EXPENSE_CATEGORIES.includes('Trabalho CLT'));

    assert.ok(DEFAULT_INCOME_CATEGORIES.includes('Trabalho CLT'));
    assert.ok(DEFAULT_INCOME_CATEGORIES.includes('Rendimentos de investimentos'));
    assert.ok(!DEFAULT_INCOME_CATEGORIES.includes('Alimentação'));
    assert.equal(DEFAULT_CATEGORY_ICONS['Trabalho CLT'], 'Briefcase');

    const legacyHousehold: Household = {
      id: 'h-legacy',
      name: 'Casa',
      ownerUid: 'u1',
      partner1Uid: 'u1',
      partner2Uid: 'u1',
      partner1Name: 'Ana',
      partner2Name: 'Ana',
      memberUids: ['u1'],
      periodStart: '2026-01-01',
      categories: ['Moradia', 'Pet', 'Salário', 'Mesada'],
      paymentMethods: ['Pix'],
      rooms: ['Casa'],
      accounts: ['Banco'],
      lastInviteCode: '',
    };

    const resolvedExp = resolveHouseholdExpenseCategories(legacyHousehold);
    const resolvedInc = resolveHouseholdIncomeCategories(legacyHousehold);
    assert.ok(resolvedExp.includes('Pet'));
    assert.ok(!resolvedExp.includes('Salário'));
    assert.ok(!resolvedExp.includes('Mesada'));
    assert.ok(resolvedInc.includes('Trabalho CLT'));
    assert.ok(resolvedInc.includes('Mesada'));

    assert.equal(classifyIncomeSourceToCategory('Salário empresa CLT'), 'Trabalho CLT');
    assert.equal(classifyIncomeSourceToCategory('Freelance design'), 'Freelance');
    assert.equal(classifyIncomeSourceToCategory('Dividendos FIIs'), 'Rendimentos de investimentos');
    assert.equal(classifyIncomeSourceToCategory('Vale alimentação benefício'), 'Benefícios');
    assert.equal(classifyIncomeSourceToCategory('Reembolso viagem'), 'Reembolsos');
    assert.equal(classifyIncomeSourceToCategory('Mesada mensal'), 'Mesada');
    assert.equal(classifyIncomeSourceToCategory('Consultoria autônomo'), 'Trabalho autônomo');

    const inferredPurchase: PlannedPurchase = {
      id: 'pp-1',
      priority: 5,
      room: 'Eletrônicos',
      projectCategory: 'Celular',
      product: 'Smartphone',
      brandModel: '',
      specs: '',
      quantity: 1,
      estimatedUnitPrice: 3500,
      actualUnitPrice: 0,
      hasActualPrice: false,
      status: 'Pendente',
      targetDate: '',
      purchaseDate: '',
      paymentMethod: 'Pix',
      notes: '',
      ...audit,
    };
    const inferredProject: PlannedPurchase = {
      ...inferredPurchase,
      id: 'pp-2',
      room: 'Casa',
      projectCategory: 'Casa',
      product: 'Reforma da cozinha',
    };
    const explicitOverride: PlannedPurchase = {
      ...inferredProject,
      id: 'pp-3',
      itemKind: 'compra',
    };

    assert.equal(resolvePlannedPurchaseKind(inferredPurchase), 'compra');
    assert.equal(resolvePlannedPurchaseKind(inferredProject), 'projeto');
    assert.equal(resolvePlannedPurchaseKind(explicitOverride), 'compra');
  });
});

