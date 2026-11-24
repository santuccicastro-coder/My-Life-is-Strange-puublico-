export type AppRoute =
  | 'inicio'
  | 'lancamentos'
  | 'lembretes'
  | 'horizonte'
  | 'fixos'
  | 'renda'
  | 'cartoes'
  | 'parcelamentos'
  | 'economias'
  | 'compras'
  | 'cenarios'
  | 'relatorios'
  | 'config';

export type CardsAccountsTab = 'cartoes' | 'contas' | 'fixos';
export type ReportsHubTab = 'resumo' | 'renda';
export type ProfileHubTab = 'lembretes' | 'notificacoes' | 'membros' | 'configuracoes' | 'dados';

export type TransactionType = 'Entrada' | 'Saída' | 'Economia' | 'Transferência';
export type TransactionStatus = 'Pago' | 'Pendente';
export type IncomeFrequency = 'Mensal' | 'Quinzenal' | 'Semanal' | 'Única' | 'Anual';
export type RecurringFrequency = 'Mensal' | 'Quinzenal' | 'Semanal' | 'Anual';
export type RecurringType = 'Entrada' | 'Saída';
export type GoalMovementType = 'Depósito' | 'Retirada';
export type PlannedPurchaseStatus = 'Pendente' | 'Pesquisando' | 'Comprado' | 'Cancelado';
export type PlannedPurchaseKind = 'compra' | 'projeto';
export type ScenarioMode = 'De uma vez' | 'Gradual em 12 meses';
export type SimulatedPurchaseMode = 'avista' | 'parcelado' | 'fixo';
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
  expenseCategories?: string[];
  incomeCategories?: string[];
  categoryIcons?: Record<string, string>;
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

export type TransactionEntryKind = 'padrao' | 'pagamento_fatura' | 'estorno';
export type CardLimitRule = 'total_parcelamento' | 'parcela_mensal';
export type CardInvoiceStatus = 'Aberta' | 'Fechada' | 'Vencida' | 'Parcialmente paga' | 'Paga';
export type InstallmentStatus = 'Ativo' | 'Quitado' | 'Cancelado';
export type HorizonScenarioType =
  | 'perda_renda'
  | 'aumento_renda'
  | 'nova_despesa'
  | 'compra_parcelada'
  | 'antecipacao_divida'
  | 'alteracao_data_recebimento';

export interface HorizonScenarioRule {
  id: string;
  type: HorizonScenarioType;
  title: string;
  enabled: boolean;
  amount: number;
  usePercentage?: boolean;
  startMonthKey: string; // YYYY-MM
  endMonthKey?: string; // YYYY-MM or ''
  dayOfMonth?: number; // 1..31
  installmentsCount?: number;
  cardId?: string;
  targetIncomeId?: string;
  newReceiptDay?: number;
  targetInstallmentId?: string;
  anticipateCount?: number;
  isRecurringExpense?: boolean;
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
  entryKind?: TransactionEntryKind;
  refundTargetId?: string;
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
  limitRule?: CardLimitRule;
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
  paidInstallmentNumbers?: number[];
  prepaidInstallmentNumbers?: number[];
  cancelledInstallmentNumbers?: number[];
  refundedAmount?: number;
  status?: InstallmentStatus;
  notes: string;
}

export type InvestmentYieldType = 'cdi' | 'poupanca' | 'selic' | 'personalizado';

export interface BenchmarkIndicators {
  cdiAnnualPct: number;
  selicAnnualPct: number;
  poupancaAnnualPct: number;
  trAnnualPct: number;
  updatedAt: string; // ISO date or timestamp
  source: 'bcb' | 'fallback' | 'manual';
}

export interface CompoundSimulationInput {
  initialAmount: number;
  monthlyContribution: number;
  extraOneTimeAmount?: number;
  extraOneTimeMonth?: number;
  periodMode?: 'months' | 'days';
  termMonths: number;
  durationDays?: number; // 1..29 when periodMode === 'days'
  yieldType: InvestmentYieldType;
  yieldIndicatorPct?: number; // e.g., 100 for 100% CDI/Selic
  customAnnualRatePct?: number; // used when yieldType === 'personalizado'
  custodyFeePct?: number; // e.g., 0.20% a.a.
  indicators?: BenchmarkIndicators;
}

export interface CompoundSimulationMonthPoint {
  month: number;
  label: string;
  investedTotal: number;
  grossBalance: number;
  netBalance: number;
  grossInterestAccumulated: number;
  netInterestAccumulated: number;
}

export interface CompoundSimulationResult {
  yieldType: InvestmentYieldType;
  yieldLabel: string;
  durationDays: number;
  termMonths: number;
  totalInvested: number;
  grossAnnualRatePct: number;
  grossMonthlyRatePct: number;
  netAnnualRatePct: number;
  netMonthlyRatePct: number;
  grossInterest: number;
  grossBalance: number;
  irRate: number;
  irTax: number;
  iofRate: number;
  iofTax: number;
  custodyFeeTotal: number;
  netInterest: number;
  netBalance: number;
  timeline: CompoundSimulationMonthPoint[];
  hypotheses: string[];
  disclaimer: string;
}

export interface InvestmentModalityComparisonRow {
  yieldType: InvestmentYieldType;
  label: string;
  indicatorSummary: string;
  grossAnnualRatePct: number;
  netAnnualRatePct: number;
  totalInvested: number;
  grossBalance: number;
  grossInterest: number;
  taxesAndFees: number;
  netInterest: number;
  netBalance: number;
  irExempt: boolean;
}

export interface Goal extends AuditFields {
  id: string;
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
