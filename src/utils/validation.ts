import type {
  BankAccountType,
  CardLimitRule,
  GoalMovementType,
  IncomeFrequency,
  InstallmentStatus,
  InvestmentYieldType,
  PlannedPurchaseKind,
  PlannedPurchaseStatus,
  RecurringFrequency,
  RecurringType,
  ScenarioMode,
  TransactionEntryKind,
  TransactionStatus,
  TransactionType,
} from '../types/finance';

export const DEFAULT_EXPENSE_CATEGORIES: string[] = [
  'Moradia',
  'Alimentação',
  'Transporte',
  'Saúde',
  'Educação',
  'Lazer',
  'Compras',
  'Assinaturas',
  'Contas domésticas',
  'Impostos',
  'Outros',
];

export const DEFAULT_INCOME_CATEGORIES: string[] = [
  'Trabalho CLT',
  'Trabalho autônomo',
  'Empresa',
  'Freelance',
  'Mesada',
  'Benefícios',
  'Rendimentos de investimentos',
  'Reembolsos',
  'Outras receitas',
];

export const DEFAULT_CATEGORY_ICONS: Record<string, string> = {
  Moradia: 'Home',
  'Alimentação': 'Utensils',
  Transporte: 'Car',
  'Saúde': 'HeartPulse',
  'Educação': 'GraduationCap',
  Lazer: 'Smile',
  Compras: 'ShoppingBag',
  Assinaturas: 'Repeat',
  'Contas domésticas': 'Receipt',
  Impostos: 'Landmark',
  Outros: 'Package',
  'Trabalho CLT': 'Briefcase',
  'Trabalho autônomo': 'UserCheck',
  Empresa: 'Building2',
  Freelance: 'Laptop',
  Mesada: 'Coins',
  'Benefícios': 'Gift',
  'Rendimentos de investimentos': 'TrendingUp',
  Reembolsos: 'RefreshCw',
  'Outras receitas': 'Wallet',
};

const ID_PATTERN = /^[a-zA-Z0-9_\-]+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_PATTERN = /^\d{4}-\d{2}$/;
const PERIOD_START_PATTERN = /^\d{4}-\d{2}-01$/;

export function sanitizeStr(val: unknown, maxLength: number, fallback = ''): string {
  const s = typeof val === 'string' ? val.trim() : fallback;
  return s.slice(0, maxLength);
}

export function sanitizeNum(val: unknown, min: number, max: number, fallback = 0): number {
  const n = typeof val === 'number' ? val : Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n * 100) / 100));
}

export function sanitizeInt(val: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(val));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function assertValidId(id: string, label = 'ID'): string {
  const clean = id.trim();
  if (!clean || clean.length > 128 || !ID_PATTERN.test(clean)) {
    throw new Error(`${label} inválido.`);
  }
  return clean;
}

export function sanitizeDate(val: unknown, required = true): string {
  const s = typeof val === 'string' ? val.trim() : '';
  if (!s && !required) return '';
  if (!DATE_PATTERN.test(s)) {
    throw new Error('Data inválida. Use o formato AAAA-MM-DD.');
  }
  return s;
}

export function sanitizeMonthKey(val: unknown, required = true): string {
  const s = typeof val === 'string' ? val.trim().slice(0, 7) : '';
  if (!s && !required) return '';
  if (!MONTH_PATTERN.test(s)) {
    throw new Error('Mês inválido. Use o formato AAAA-MM.');
  }
  return s;
}

export function sanitizePeriodStart(val: unknown): string {
  const s = typeof val === 'string' ? val.trim() : '';
  if (!PERIOD_START_PATTERN.test(s)) {
    throw new Error('Início do período deve ser o dia 1 do mês (AAAA-MM-01).');
  }
  return s;
}

export function sanitizeStringArray(arr: string[], maxItems: number, maxItemLen: number, fallbackItem: string): string[] {
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const item of arr) {
    const clean = sanitizeStr(item, maxItemLen);
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(clean);
    if (cleaned.length >= maxItems) break;
  }
  return cleaned.length > 0 ? cleaned : [fallbackItem];
}

export function sanitizeCategoryIcons(raw: Record<string, unknown> | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!raw || typeof raw !== 'object') return result;
  for (const [k, v] of Object.entries(raw)) {
    const key = sanitizeStr(k, 60);
    const val = sanitizeStr(v, 40);
    if (key && val) {
      result[key] = val;
    }
    if (Object.keys(result).length >= 70) break;
  }
  return result;
}

const LEGACY_INCOME_ALIASES = new Set([
  'salário',
  'salario',
  'salários',
  'salarios',
  'renda',
  'rendas',
  'receita',
  'receitas',
  'proventos',
  'rendimentos',
  'dividendos',
  'bônus',
  'bonus',
  'pró-labore',
  'pro-labore',
]);

export function resolveHouseholdExpenseCategories(
  household?: { expenseCategories?: string[]; categories?: string[]; incomeCategories?: string[] } | null
): string[] {
  if (household?.expenseCategories && household.expenseCategories.length > 0) {
    return sanitizeStringArray(household.expenseCategories, 35, 60, 'Outros');
  }
  const incomeSet = new Set([
    ...(household?.incomeCategories ?? DEFAULT_INCOME_CATEGORIES).map((c) => c.toLowerCase().trim()),
    ...LEGACY_INCOME_ALIASES,
  ]);
  const legacy = (household?.categories ?? []).filter((c) => !incomeSet.has(c.toLowerCase().trim()));
  if (legacy.length === 0) return [...DEFAULT_EXPENSE_CATEGORIES];
  return sanitizeStringArray([...DEFAULT_EXPENSE_CATEGORIES, ...legacy], 35, 60, 'Outros');
}

export function resolveHouseholdIncomeCategories(
  household?: { incomeCategories?: string[] } | null
): string[] {
  if (household?.incomeCategories && household.incomeCategories.length > 0) {
    return sanitizeStringArray(household.incomeCategories, 35, 60, 'Outras receitas');
  }
  return [...DEFAULT_INCOME_CATEGORIES];
}

export function resolvePlannedPurchaseKind(item: {
  itemKind?: PlannedPurchaseKind;
  projectCategory?: string;
  room?: string;
  iconName?: string;
}): PlannedPurchaseKind {
  if (item.itemKind === 'compra' || item.itemKind === 'projeto') {
    return item.itemKind;
  }
  const hay = `${item.projectCategory ?? ''} ${item.room ?? ''} ${item.iconName ?? ''}`.toLowerCase();
  const purchaseKeywords = [
    'celular',
    'computador',
    'videogame',
    'eletro',
    'móveis',
    'moveis',
    'smartphone',
    'laptop',
    'gamepad2',
    'refrigerator',
    'sofa',
    'cozinha',
    'sala',
    'quarto',
    'banheiro',
    'lavanderia',
    'eletrônicos',
    'eletronicos',
    'camera',
  ];
  return purchaseKeywords.some((kw) => hay.includes(kw)) ? 'compra' : 'projeto';
}

export function classifyIncomeSourceToCategory(
  source: string,
  availableIncomeCategories: string[] = DEFAULT_INCOME_CATEGORIES
): string {
  const s = (source || '').toLowerCase().trim();
  const findAvailable = (target: string) =>
    availableIncomeCategories.find((c) => c.toLowerCase().trim() === target.toLowerCase().trim()) ?? target;

  if (/clt|sal[aá]rio|holerite|f[eé]rias|13[ºo]|d[eé]cimo/.test(s)) {
    return findAvailable('Trabalho CLT');
  }
  if (/aut[oô]nomo|mei\b|di[aá]ria|servi[cç]o/.test(s)) {
    return findAvailable('Trabalho autônomo');
  }
  if (/empresa|pr[oó]-?labore|cnpj|s[oó]cio|lucro/.test(s)) {
    return findAvailable('Empresa');
  }
  if (/freela|bico|consultoria|projeto/.test(s)) {
    return findAvailable('Freelance');
  }
  if (/mesada|pens[aã]o|ajuda/.test(s)) {
    return findAvailable('Mesada');
  }
  if (/benef[ií]c|vr\b|va\b|vt\b|vale|aux[ií]lio|plena|flash|caju/.test(s)) {
    return findAvailable('Benefícios');
  }
  if (/rendiment|dividendo|juros|cdi|selic|fii|a[cç][õo]es|caixinha|poupan[cç]a|invest/.test(s)) {
    return findAvailable('Rendimentos de investimentos');
  }
  if (/reembols|estorno|devolu[cç][aã]o|restitui[cç][aã]o/.test(s)) {
    return findAvailable('Reembolsos');
  }
  return availableIncomeCategories.find((c) => c.toLowerCase().includes('outras')) ?? findAvailable('Outras receitas');
}

export function validateTransactionInput(input: {
  type: TransactionType;
  description: string;
  plannedAmount: number;
  actualAmount: number;
  category: string;
  person: string;
  date: string;
  paymentMethod: string;
  accountOrCard: string;
  cardId: string;
  status: TransactionStatus;
  dueDate: string;
  notes: string;
  recurringId?: string;
  recurringMonthKey?: string;
  entryKind?: TransactionEntryKind;
  refundTargetId?: string;
}) {
  const description = sanitizeStr(input.description, 120);
  if (!description) throw new Error('Informe uma descrição para o lançamento.');
  const date = sanitizeDate(input.date, true);
  const monthKey = date.slice(0, 7);
  if (!MONTH_PATTERN.test(monthKey)) throw new Error('Mês de referência inválido.');
  const dueDate = sanitizeDate(input.dueDate, false);
  const category = sanitizeStr(input.category, 60);
  if (!category) throw new Error('Selecione uma categoria.');
  const person = sanitizeStr(input.person, 50);
  if (!person) throw new Error('Selecione a pessoa responsável.');
  const paymentMethod = sanitizeStr(input.paymentMethod, 40);
  if (!paymentMethod) throw new Error('Selecione a forma de pagamento.');
  const accountOrCard = sanitizeStr(input.accountOrCard, 60);
  if (!accountOrCard) throw new Error('Selecione a conta ou cartão.');

  const recurringId = sanitizeStr(input.recurringId ?? '', 128);
  const recurringMonthKey = sanitizeMonthKey(input.recurringMonthKey ?? '', false);
  const allowedEntryKinds: TransactionEntryKind[] = ['padrao', 'pagamento_fatura', 'estorno'];
  const entryKind =
    input.entryKind && allowedEntryKinds.includes(input.entryKind) ? input.entryKind : undefined;
  const refundTargetId = input.refundTargetId !== undefined ? sanitizeStr(input.refundTargetId, 128) : undefined;

  return {
    type: input.type,
    description,
    plannedAmount: sanitizeNum(input.plannedAmount, 0, 100000000, 0),
    actualAmount: sanitizeNum(input.actualAmount, 0, 100000000, 0),
    category,
    person,
    date,
    monthKey,
    paymentMethod,
    accountOrCard,
    cardId: sanitizeStr(input.cardId, 128),
    status: input.status,
    dueDate,
    notes: sanitizeStr(input.notes, 300),
    ...(recurringId ? { recurringId } : { recurringId: '' }),
    ...(recurringMonthKey ? { recurringMonthKey } : { recurringMonthKey: '' }),
    ...(entryKind !== undefined ? { entryKind } : {}),
    ...(refundTargetId !== undefined ? { refundTargetId } : {}),
  };
}

export function validateRecurringItemInput(input: {
  type: RecurringType;
  description: string;
  amount: number;
  category: string;
  person: string;
  frequency: RecurringFrequency;
  dayOfMonth: number;
  startMonthKey: string;
  endMonthKey: string;
  paymentMethod: string;
  accountOrCard: string;
  cardId: string;
  active: boolean;
  notes: string;
}) {
  const description = sanitizeStr(input.description, 120);
  if (!description) throw new Error('Informe uma descrição para o item fixo.');
  const amount = sanitizeNum(input.amount, 0.01, 100000000, 0);
  if (amount <= 0) throw new Error('O valor deve ser maior que zero.');
  const category = sanitizeStr(input.category, 60);
  if (!category) throw new Error('Selecione uma categoria.');
  const person = sanitizeStr(input.person, 50);
  if (!person) throw new Error('Selecione a pessoa responsável.');
  const startMonthKey = sanitizeMonthKey(input.startMonthKey, true);
  const endMonthKey = sanitizeMonthKey(input.endMonthKey, false);
  if (endMonthKey && endMonthKey < startMonthKey) {
    throw new Error('O mês de término não pode ser anterior ao mês inicial.');
  }
  const paymentMethod = sanitizeStr(input.paymentMethod, 40);
  if (!paymentMethod) throw new Error('Selecione a forma de pagamento.');
  const accountOrCard = sanitizeStr(input.accountOrCard, 60);
  if (!accountOrCard) throw new Error('Selecione a conta ou cartão.');

  return {
    type: input.type,
    description,
    amount,
    category,
    person,
    frequency: input.frequency,
    dayOfMonth: sanitizeInt(input.dayOfMonth, 1, 31, 5),
    startMonthKey,
    endMonthKey,
    paymentMethod,
    accountOrCard,
    cardId: sanitizeStr(input.cardId, 128),
    active: Boolean(input.active),
    notes: sanitizeStr(input.notes, 300),
  };
}

export function validateIncomeInput(input: {
  person: string;
  source: string;
  amount: number;
  frequency: IncomeFrequency;
  receiptDay: number;
  receiptDate: string;
  active: boolean;
  notes: string;
}) {
  const person = sanitizeStr(input.person, 50);
  if (!person) throw new Error('Selecione quem recebe a renda.');
  const source = sanitizeStr(input.source, 100);
  if (!source) throw new Error('Informe a fonte de renda.');
  const amount = sanitizeNum(input.amount, 0.01, 100000000, 0);
  if (amount <= 0) throw new Error('O valor da renda deve ser maior que zero.');

  return {
    person,
    source,
    amount,
    frequency: input.frequency,
    receiptDay: sanitizeInt(input.receiptDay, 1, 31, 5),
    receiptDate: sanitizeDate(input.receiptDate, false),
    active: Boolean(input.active),
    notes: sanitizeStr(input.notes, 300),
  };
}

export function validateCardInput(input: {
  name: string;
  holder: string;
  limit: number;
  closingDay: number;
  dueDay: number;
  color: string;
  active: boolean;
  limitRule?: CardLimitRule;
}) {
  const name = sanitizeStr(input.name, 60);
  if (!name) throw new Error('Informe o nome do cartão.');
  const holder = sanitizeStr(input.holder, 50);
  if (!holder) throw new Error('Informe o titular do cartão.');
  const color = sanitizeStr(input.color, 20) || '#1E293B';
  const limitRule: CardLimitRule | undefined =
    input.limitRule === 'parcela_mensal' || input.limitRule === 'total_parcelamento'
      ? input.limitRule
      : undefined;

  return {
    name,
    holder,
    limit: sanitizeNum(input.limit, 0, 100000000, 0),
    closingDay: sanitizeInt(input.closingDay, 1, 31, 10),
    dueDay: sanitizeInt(input.dueDay, 1, 31, 17),
    color: color.length >= 4 ? color : '#1E293B',
    active: Boolean(input.active),
    ...(limitRule !== undefined ? { limitRule } : {}),
  };
}

export function sanitizePaidInstallmentNumbers(
  raw: unknown,
  installmentsCount: number
): number[] {
  if (!Array.isArray(raw)) return [];
  const maxCount = Math.max(1, Math.min(120, Math.round(installmentsCount)));
  const unique = new Set<number>();
  for (const item of raw) {
    const num = Math.round(Number(item));
    if (Number.isInteger(num) && num >= 1 && num <= maxCount) {
      unique.add(num);
    }
    if (unique.size >= 120) break;
  }
  return Array.from(unique).sort((a, b) => a - b);
}

export function validateInstallmentInput(input: {
  description: string;
  cardId: string;
  cardName: string;
  person: string;
  category: string;
  totalAmount: number;
  installmentsCount: number;
  firstChargeDate: string;
  paidInstallmentNumbers?: number[];
  prepaidInstallmentNumbers?: number[];
  cancelledInstallmentNumbers?: number[];
  refundedAmount?: number;
  status?: InstallmentStatus;
  notes: string;
}) {
  const description = sanitizeStr(input.description, 120);
  if (!description) throw new Error('Informe a descrição da compra parcelada.');
  const cardName = sanitizeStr(input.cardName, 60);
  if (!cardName) throw new Error('Selecione o cartão utilizado.');
  const person = sanitizeStr(input.person, 50);
  if (!person) throw new Error('Selecione quem realizou a compra.');
  const category = sanitizeStr(input.category, 60) || 'Compras da casa';
  const totalAmount = sanitizeNum(input.totalAmount, 0.01, 100000000, 0);
  if (totalAmount <= 0) throw new Error('O valor total deve ser maior que zero.');
  const installmentsCount = sanitizeInt(input.installmentsCount, 1, 120, 1);
  const firstChargeDate = sanitizeDate(input.firstChargeDate, true);
  const paidInstallmentNumbers =
    input.paidInstallmentNumbers !== undefined
      ? sanitizePaidInstallmentNumbers(input.paidInstallmentNumbers, installmentsCount)
      : undefined;
  const prepaidInstallmentNumbers =
    input.prepaidInstallmentNumbers !== undefined
      ? sanitizePaidInstallmentNumbers(input.prepaidInstallmentNumbers, installmentsCount)
      : undefined;
  const cancelledInstallmentNumbers =
    input.cancelledInstallmentNumbers !== undefined
      ? sanitizePaidInstallmentNumbers(input.cancelledInstallmentNumbers, installmentsCount)
      : undefined;
  const refundedAmount =
    input.refundedAmount !== undefined ? sanitizeNum(input.refundedAmount, 0, 100000000, 0) : undefined;
  const allowedStatuses: InstallmentStatus[] = ['Ativo', 'Quitado', 'Cancelado'];
  const status =
    input.status && allowedStatuses.includes(input.status) ? input.status : undefined;

  return {
    description,
    cardId: sanitizeStr(input.cardId, 128),
    cardName,
    person,
    category,
    totalAmount,
    installmentsCount,
    firstChargeDate,
    ...(paidInstallmentNumbers !== undefined ? { paidInstallmentNumbers } : {}),
    ...(prepaidInstallmentNumbers !== undefined ? { prepaidInstallmentNumbers } : {}),
    ...(cancelledInstallmentNumbers !== undefined ? { cancelledInstallmentNumbers } : {}),
    ...(refundedAmount !== undefined ? { refundedAmount } : {}),
    ...(status !== undefined ? { status } : {}),
    notes: sanitizeStr(input.notes, 300),
  };
}

export function validateGoalInput(input: {
  name: string;
  objective?: string;
  initialAmount?: number;
  targetAmount: number;
  currentAmount: number;
  monthlyContribution: number;
  termMonths?: number;
  yieldType?: InvestmentYieldType;
  yieldIndicatorPct?: number;
  custodyFeePct?: number;
  annualYieldRate: number;
  notes: string;
}) {
  const name = sanitizeStr(input.name, 80);
  if (!name) throw new Error('Informe o nome do objetivo.');
  const targetAmount = sanitizeNum(input.targetAmount, 0.01, 100000000, 0);
  if (targetAmount <= 0) throw new Error('A meta deve ser maior que zero.');

  const objective = input.objective !== undefined ? sanitizeStr(input.objective, 160) : undefined;
  const initialAmount =
    input.initialAmount !== undefined && Number.isFinite(Number(input.initialAmount))
      ? sanitizeNum(input.initialAmount, 0, 100000000, 0)
      : undefined;
  const termMonths =
    input.termMonths !== undefined && Number.isFinite(Number(input.termMonths))
      ? sanitizeInt(input.termMonths, 1, 600, 12)
      : undefined;
  const allowedYieldTypes: InvestmentYieldType[] = ['cdi', 'poupanca', 'selic', 'personalizado'];
  const yieldType =
    input.yieldType && allowedYieldTypes.includes(input.yieldType) ? input.yieldType : undefined;
  const yieldIndicatorPct =
    input.yieldIndicatorPct !== undefined && Number.isFinite(Number(input.yieldIndicatorPct))
      ? sanitizeNum(input.yieldIndicatorPct, 0, 1000, 100)
      : undefined;
  const custodyFeePct =
    input.custodyFeePct !== undefined && Number.isFinite(Number(input.custodyFeePct))
      ? sanitizeNum(input.custodyFeePct, 0, 20, 0)
      : undefined;

  return {
    name,
    ...(objective !== undefined ? { objective } : {}),
    ...(initialAmount !== undefined ? { initialAmount } : {}),
    targetAmount,
    currentAmount: sanitizeNum(input.currentAmount, 0, 100000000, 0),
    monthlyContribution: sanitizeNum(input.monthlyContribution, 0, 100000000, 0),
    ...(termMonths !== undefined ? { termMonths } : {}),
    ...(yieldType !== undefined ? { yieldType } : {}),
    ...(yieldIndicatorPct !== undefined ? { yieldIndicatorPct } : {}),
    ...(custodyFeePct !== undefined ? { custodyFeePct } : {}),
    annualYieldRate: Math.min(5, Math.max(0, Number(input.annualYieldRate) || 0)),
    notes: sanitizeStr(input.notes, 300),
  };
}

export function validateGoalMovementInput(input: {
  goalId: string;
  goalName: string;
  type: GoalMovementType;
  amount: number;
  date: string;
  person: string;
  notes: string;
}) {
  const goalId = assertValidId(input.goalId, 'ID da meta');
  const goalName = sanitizeStr(input.goalName, 80);
  if (!goalName) throw new Error('Nome da meta inválido.');
  const amount = sanitizeNum(input.amount, 0.01, 100000000, 0);
  if (amount <= 0) throw new Error('O valor da movimentação deve ser maior que zero.');
  const date = sanitizeDate(input.date, true);
  const person = sanitizeStr(input.person, 50);
  if (!person) throw new Error('Selecione quem realizou a movimentação.');

  return {
    goalId,
    goalName,
    type: input.type,
    amount,
    date,
    person,
    notes: sanitizeStr(input.notes, 300),
  };
}

export function validatePlannedPurchaseInput(input: {
  priority: number;
  itemKind?: PlannedPurchaseKind;
  room: string;
  projectCategory?: string;
  iconName?: string;
  product: string;
  brandModel: string;
  specs: string;
  quantity: number;
  estimatedUnitPrice: number;
  actualUnitPrice: number;
  hasActualPrice: boolean;
  savedAmount?: number;
  monthlyContribution?: number;
  linkedGoalId?: string;
  targetDate: string;
  purchaseDate: string;
  paymentMethod: string;
  status: PlannedPurchaseStatus;
  notes: string;
}) {
  const product = sanitizeStr(input.product, 100);
  if (!product) throw new Error('Informe o nome do produto ou projeto.');
  const room = sanitizeStr(input.room, 50) || sanitizeStr(input.projectCategory, 50) || 'Outros';
  const itemKind: PlannedPurchaseKind | undefined =
    input.itemKind === 'compra' || input.itemKind === 'projeto' ? input.itemKind : undefined;

  const projectCategory =
    input.projectCategory !== undefined ? sanitizeStr(input.projectCategory, 50) : undefined;
  const iconName = input.iconName !== undefined ? sanitizeStr(input.iconName, 40) : undefined;
  const savedAmount =
    input.savedAmount !== undefined && Number.isFinite(Number(input.savedAmount))
      ? sanitizeNum(input.savedAmount, 0, 100000000, 0)
      : undefined;
  const monthlyContribution =
    input.monthlyContribution !== undefined && Number.isFinite(Number(input.monthlyContribution))
      ? sanitizeNum(input.monthlyContribution, 0, 100000000, 0)
      : undefined;
  const linkedGoalId =
    input.linkedGoalId !== undefined ? sanitizeStr(input.linkedGoalId, 128) : undefined;

  return {
    priority: sanitizeInt(input.priority, 0, 10, 5),
    ...(itemKind !== undefined ? { itemKind } : {}),
    room,
    ...(projectCategory !== undefined ? { projectCategory } : {}),
    ...(iconName !== undefined ? { iconName } : {}),
    product,
    brandModel: sanitizeStr(input.brandModel, 100),
    specs: sanitizeStr(input.specs, 200),
    quantity: sanitizeInt(input.quantity, 1, 1000, 1),
    estimatedUnitPrice: sanitizeNum(input.estimatedUnitPrice, 0, 100000000, 0),
    actualUnitPrice: input.hasActualPrice ? sanitizeNum(input.actualUnitPrice, 0, 100000000, 0) : 0,
    hasActualPrice: Boolean(input.hasActualPrice),
    ...(savedAmount !== undefined ? { savedAmount } : {}),
    ...(monthlyContribution !== undefined ? { monthlyContribution } : {}),
    ...(linkedGoalId !== undefined ? { linkedGoalId } : {}),
    targetDate: sanitizeDate(input.targetDate, false),
    purchaseDate: sanitizeDate(input.purchaseDate, false),
    paymentMethod: sanitizeStr(input.paymentMethod, 40),
    status: input.status,
    notes: sanitizeStr(input.notes, 300),
  };
}

export function validateScenarioInput(input: {
  name: string;
  expenseChangePct: number;
  incomeChangePct: number;
  mode: ScenarioMode;
  customBaseExpense: number;
  useCustomBaseExpense: boolean;
}) {
  const name = sanitizeStr(input.name, 80);
  if (!name) throw new Error('Informe o nome do cenário.');

  return {
    name,
    expenseChangePct: Math.min(10, Math.max(-1, Number(input.expenseChangePct) || 0)),
    incomeChangePct: Math.min(10, Math.max(-1, Number(input.incomeChangePct) || 0)),
    mode: input.mode,
    customBaseExpense: sanitizeNum(input.customBaseExpense, 0, 100000000, 0),
    useCustomBaseExpense: Boolean(input.useCustomBaseExpense),
  };
}

export function sanitizeMemberNames(
  raw: Record<string, unknown> | undefined,
  allowedUids?: string[]
): Record<string, string> {
  const result: Record<string, string> = {};
  if (!raw || typeof raw !== 'object') return result;
  const entries = Object.entries(raw);
  for (const [uid, val] of entries) {
    if (!ID_PATTERN.test(uid)) continue;
    if (allowedUids && !allowedUids.includes(uid)) continue;
    const clean = sanitizeStr(val, 50);
    if (clean) {
      result[uid] = clean;
    }
    if (Object.keys(result).length >= 7) break;
  }
  return result;
}

export function validateBankAccountInput(input: {
  name: string;
  institution: string;
  type: BankAccountType;
  balance: number;
  annualYieldRate?: number;
  currency?: string;
  lastSyncedAt?: string;
  active: boolean;
}) {
  const name = sanitizeStr(input.name, 80);
  if (!name) throw new Error('Informe o nome da conta.');
  const institution = sanitizeStr(input.institution, 80) || 'Manual';
  const allowedTypes: BankAccountType[] = ['Corrente', 'Poupança', 'Carteira', 'Investimento', 'Outro'];
  const type: BankAccountType = allowedTypes.includes(input.type) ? input.type : 'Corrente';
  const rawRate = input.annualYieldRate;
  const parsedRate =
    rawRate !== undefined && Number.isFinite(Number(rawRate))
      ? Math.round(Math.min(5, Math.max(0, Number(rawRate))) * 10000) / 10000
      : undefined;
  return {
    name,
    institution,
    type,
    balance: sanitizeNum(input.balance, -100000000, 100000000, 0),
    ...(parsedRate !== undefined ? { annualYieldRate: parsedRate } : {}),
    currency: sanitizeStr(input.currency ?? 'BRL', 10) || 'BRL',
    lastSyncedAt: sanitizeStr(input.lastSyncedAt ?? '', 40),
    active: Boolean(input.active),
  };
}

