export type AppRoute =
  | 'inicio'
  | 'lancamentos'
  | 'lembretes'
  | 'horizonte'
  | 'ia'
  | 'fixos'
  | 'renda'
  | 'cartoes'
  | 'parcelamentos'
  | 'economias'
  | 'compras'
  | 'cenarios'
  | 'relatorios'
  | 'config';

export type TransactionType = 'Entrada' | 'Saída' | 'Economia' | 'Transferência';
export type TransactionStatus = 'Pago' | 'Pendente';
export type IncomeFrequency = 'Mensal' | 'Quinzenal' | 'Semanal' | 'Única' | 'Anual';
export type RecurringFrequency = 'Mensal' | 'Quinzenal' | 'Semanal' | 'Anual';
export type RecurringType = 'Entrada' | 'Saída';
export type GoalMovementType = 'Depósito' | 'Retirada';
export type PlannedPurchaseStatus = 'Pendente' | 'Pesquisando' | 'Comprado' | 'Cancelado';
export type ScenarioMode = 'De uma vez' | 'Gradual em 12 meses';
export type SimulatedPurchaseMode = 'avista' | 'parcelado' | 'fixo';
export type AiChatMode = 'fast' | 'general' | 'deep';
export type BankAccountType = 'Corrente' | 'Poupança' | 'Carteira' | 'Investimento' | 'Outro';

export interface BankAccount extends AuditFields {
  id: string;
  name: string;
  institution: string;
  type: BankAccountType;
  balance: number;
  annualYieldRate?: number;
  currency: string;
  lastSyncedAt: string;
  active: boolean;
}

export interface SimulatedPurchase {
  id: string;
  description: string;
  totalAmount: number;
  mode: SimulatedPurchaseMode;
  installmentsCount: number;
  startMonthKey: string; // YYYY-MM
  endMonthKey: string; // YYYY-MM or ''
  purchaseDay: number;
  cardId: string;
  enabled: boolean;
}

export interface AiChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  mode: AiChatMode;
  modelUsed: string;
  createdByUid: string;
  createdByName: string;
  createdAt?: unknown;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  activeHouseholdId: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Household {
  id: string;
  name: string;
  ownerUid: string;
  memberUids: string[];
  memberNames?: Record<string, string>;
  partner1Uid: string;
  partner2Uid: string;
  partner1Name: string;
  partner2Name: string;
  periodStart: string; // YYYY-MM-01
  categories: string[];
  paymentMethods: string[];
  rooms: string[];
  accounts: string[];
  lastInviteCode: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Invite {
  id: string;
  householdId: string;
  householdName: string;
  createdByUid: string;
  createdByName: string;
  used: boolean;
  usedByUid: string;
  createdAt?: unknown;
  usedAt?: unknown;
}

export interface AuditFields {
  createdByUid: string;
  createdByName: string;
  updatedByUid: string;
  updatedByName: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Transaction extends AuditFields {
  id: string;
  type: TransactionType;
  description: string;
  plannedAmount: number;
  actualAmount: number;
  category: string;
  person: string;
  date: string; // YYYY-MM-DD
  monthKey: string; // YYYY-MM
  paymentMethod: string;
  accountOrCard: string;
  cardId: string;
  status: TransactionStatus;
  dueDate: string; // YYYY-MM-DD or ''
  notes: string;
  recurringId?: string;
  recurringMonthKey?: string;
}

export interface RecurringItem extends AuditFields {
  id: string;
  type: RecurringType;
  description: string;
  amount: number;
  category: string;
  person: string;
  frequency: RecurringFrequency;
  dayOfMonth: number; // 1..31
  startMonthKey: string; // YYYY-MM
  endMonthKey: string; // YYYY-MM or ''
  paymentMethod: string;
  accountOrCard: string;
  cardId: string;
  active: boolean;
  notes: string;
}

export interface Income extends AuditFields {
  id: string;
  person: string;
  source: string;
  amount: number;
  frequency: IncomeFrequency;
  receiptDay: number;
  receiptDate: string; // YYYY-MM-DD or ''
  active: boolean;
  notes: string;
}

export interface CreditCard extends AuditFields {
  id: string;
  name: string;
  holder: string;
  limit: number;
  closingDay: number;
  dueDay: number;
  color: string;
  active: boolean;
}

export interface Installment extends AuditFields {
  id: string;
  description: string;
  cardId: string;
  cardName: string;
  person: string;
  category: string;
  totalAmount: number;
  installmentsCount: number;
  firstChargeDate: string; // YYYY-MM-DD
  notes: string;
}

export interface Goal extends AuditFields {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  monthlyContribution: number;
  annualYieldRate: number; // e.g., 0.105 for 10.5%
  notes: string;
}

export interface GoalMovement {
  id: string;
  goalId: string;
  goalName: string;
  type: GoalMovementType;
  amount: number;
  date: string; // YYYY-MM-DD
  person: string;
  notes: string;
  createdByUid: string;
  createdByName: string;
  createdAt?: unknown;
}

export interface PlannedPurchase extends AuditFields {
  id: string;
  priority: number; // 0..10
  room: string;
  product: string;
  brandModel: string;
  specs: string;
  quantity: number;
  estimatedUnitPrice: number;
  actualUnitPrice: number;
  hasActualPrice: boolean;
  targetDate: string; // YYYY-MM-DD or ''
  purchaseDate: string; // YYYY-MM-DD or ''
  paymentMethod: string;
  status: PlannedPurchaseStatus;
  notes: string;
}

export interface Scenario extends AuditFields {
  id: string;
  name: string;
  expenseChangePct: number;
  incomeChangePct: number;
  mode: ScenarioMode;
  customBaseExpense: number;
  useCustomBaseExpense: boolean;
}
