import type {
  AiChatMode,
  BankAccountType,
  GoalMovementType,
  IncomeFrequency,
  PlannedPurchaseStatus,
  RecurringFrequency,
  RecurringType,
  ScenarioMode,
  TransactionStatus,
  TransactionType,
} from '../types/finance';

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
  const cleaned = arr
    .map((item) => sanitizeStr(item, maxItemLen))
    .filter((item) => item.length > 0)
    .slice(0, maxItems);
  return cleaned.length > 0 ? cleaned : [fallbackItem];
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
}) {
  const name = sanitizeStr(input.name, 60);
  if (!name) throw new Error('Informe o nome do cartão.');
  const holder = sanitizeStr(input.holder, 50);
  if (!holder) throw new Error('Informe o titular do cartão.');
  const color = sanitizeStr(input.color, 20) || '#1E293B';

  return {
    name,
    holder,
    limit: sanitizeNum(input.limit, 0, 100000000, 0),
    closingDay: sanitizeInt(input.closingDay, 1, 31, 10),
    dueDay: sanitizeInt(input.dueDay, 1, 31, 17),
    color: color.length >= 4 ? color : '#1E293B',
    active: Boolean(input.active),
  };
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

  return {
    description,
    cardId: sanitizeStr(input.cardId, 128),
    cardName,
    person,
    category,
    totalAmount,
    installmentsCount,
    firstChargeDate,
    notes: sanitizeStr(input.notes, 300),
  };
}

export function validateGoalInput(input: {
  name: string;
  targetAmount: number;
  currentAmount: number;
  monthlyContribution: number;
  annualYieldRate: number;
  notes: string;
}) {
  const name = sanitizeStr(input.name, 80);
  if (!name) throw new Error('Informe o nome do objetivo.');
  const targetAmount = sanitizeNum(input.targetAmount, 0.01, 100000000, 0);
  if (targetAmount <= 0) throw new Error('A meta deve ser maior que zero.');

  return {
    name,
    targetAmount,
    currentAmount: sanitizeNum(input.currentAmount, 0, 100000000, 0),
    monthlyContribution: sanitizeNum(input.monthlyContribution, 0, 100000000, 0),
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
  room: string;
  product: string;
  brandModel: string;
  specs: string;
  quantity: number;
  estimatedUnitPrice: number;
  actualUnitPrice: number;
  hasActualPrice: boolean;
  targetDate: string;
  purchaseDate: string;
  paymentMethod: string;
  status: PlannedPurchaseStatus;
  notes: string;
}) {
  const product = sanitizeStr(input.product, 100);
  if (!product) throw new Error('Informe o nome do produto.');
  const room = sanitizeStr(input.room, 50);
  if (!room) throw new Error('Selecione o ambiente/categoria.');

  return {
    priority: sanitizeInt(input.priority, 0, 10, 5),
    room,
    product,
    brandModel: sanitizeStr(input.brandModel, 100),
    specs: sanitizeStr(input.specs, 200),
    quantity: sanitizeInt(input.quantity, 1, 1000, 1),
    estimatedUnitPrice: sanitizeNum(input.estimatedUnitPrice, 0, 100000000, 0),
    actualUnitPrice: input.hasActualPrice ? sanitizeNum(input.actualUnitPrice, 0, 100000000, 0) : 0,
    hasActualPrice: Boolean(input.hasActualPrice),
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

export function validateAiMessageInput(input: {
  role: 'user' | 'model';
  text: string;
  mode: AiChatMode;
  modelUsed: string;
}) {
  const text = sanitizeStr(input.text, 8000);
  if (!text) throw new Error('Mensagem vazia.');
  const modelUsed = sanitizeStr(input.modelUsed, 64, 'gemini-3.1-flash-lite') || 'gemini-3.1-flash-lite';
  const mode: AiChatMode = input.mode === 'deep' ? 'deep' : 'fast';
  return {
    role: input.role === 'model' ? ('model' as const) : ('user' as const),
    text,
    mode,
    modelUsed,
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

