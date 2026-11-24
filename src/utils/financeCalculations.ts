import type {
  BankAccount,
  BenchmarkIndicators,
  CardInvoiceStatus,
  CardLimitRule,
  CompoundSimulationInput,
  CompoundSimulationMonthPoint,
  CompoundSimulationResult,
  CreditCard,
  Goal,
  HorizonScenarioRule,
  HorizonScenarioType,
  Household,
  Income,
  Installment,
  InstallmentStatus,
  InvestmentModalityComparisonRow,
  InvestmentYieldType,
  PlannedPurchase,
  RecurringItem,
  ScenarioMode,
  SimulatedPurchase,
  Transaction,
  TransactionStatus,
} from '../types/finance';

export const MAX_HORIZON_MONTHS = 600;

const MONTH_NAMES_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MONTH_NAMES_FULL = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

export function formatBRL(value: number): string {
  const n = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export function formatBRL0(value: number): string {
  const n = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

export function formatPct(ratio: number, decimals = 1): string {
  const n = Number.isFinite(ratio) ? ratio * 100 : 0;
  return `${n.toFixed(decimals).replace('.', ',')}%`;
}

export function getTodayISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getCurrentMonthKey(): string {
  return getTodayISO().slice(0, 7);
}

export function formatDateBR(iso: string): string {
  if (!iso || iso.length < 10) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

export function buildDateInMonth(monthKey: string, dayOfMonth: number): string {
  const [yStr, mStr] = monthKey.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  const maxDay = new Date(y, m, 0).getDate();
  const clamped = Math.min(maxDay, Math.max(1, Math.round(dayOfMonth)));
  return `${monthKey}-${String(clamped).padStart(2, '0')}`;
}

export function formatMonthShort(monthKey: string): string {
  if (!monthKey || monthKey.length < 7) return monthKey;
  const [y, m] = monthKey.split('-');
  const idx = Number(m) - 1;
  return `${MONTH_NAMES_SHORT[idx] ?? m}/${y.slice(2)}`;
}

export function getMonthAbbr(monthKey: string): string {
  if (!monthKey || monthKey.length < 7) return monthKey;
  const [, m] = monthKey.split('-');
  const idx = Number(m) - 1;
  const name = MONTH_NAMES_FULL[idx] ?? m;
  return idx === 4 ? 'Maio' : name.slice(0, 3);
}

export function formatShortDayMonth(iso: string): string {
  if (!iso || iso.length < 10) return '—';
  const mIdx = Number(iso.slice(5, 7)) - 1;
  const day = iso.slice(8, 10);
  return `${day}/${MONTH_NAMES_SHORT[mIdx] ?? iso.slice(5, 7)}`;
}

export function formatMonthFull(monthKey: string): string {
  if (!monthKey || monthKey.length < 7) return monthKey;
  const [y, m] = monthKey.split('-');
  const idx = Number(m) - 1;
  return `${MONTH_NAMES_FULL[idx] ?? m} de ${y}`;
}

export function addMonthsToKey(monthKey: string, offset: number): string {
  const [yStr, mStr] = monthKey.split('-');
  const totalMonths = Number(yStr) * 12 + (Number(mStr) - 1) + offset;
  const y = Math.floor(totalMonths / 12);
  const m = (totalMonths % 12) + 1;
  return `${y}-${String(m).padStart(2, '0')}`;
}

export function monthDiff(fromKey: string, toKey: string): number {
  const [fy, fm] = fromKey.split('-').map(Number);
  const [ty, tm] = toKey.split('-').map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

export function getMonthKeysFromStart(periodStart: string, count = 12): string[] {
  const startKey = periodStart && periodStart.length >= 7 ? periodStart.slice(0, 7) : getCurrentMonthKey();
  const safeCount = Math.min(MAX_HORIZON_MONTHS, Math.max(1, Math.round(count)));
  return Array.from({ length: safeCount }, (_, i) => addMonthsToKey(startKey, i));
}

export function getMonthKeysRange(startMonthKey: string, endMonthKey: string): string[] {
  const start = startMonthKey && startMonthKey.length >= 7 ? startMonthKey.slice(0, 7) : getCurrentMonthKey();
  const end = endMonthKey && endMonthKey.length >= 7 ? endMonthKey.slice(0, 7) : start;
  const diff = monthDiff(start, end);
  if (diff < 0) return [start];
  const count = Math.min(MAX_HORIZON_MONTHS, diff + 1);
  return Array.from({ length: count }, (_, i) => addMonthsToKey(start, i));
}

// ============================================================================
// ENTRADA NUMÉRICA COM SINAL (+/-) E CONVERSÃO AUTOMÁTICA PARA DESPESA
// ============================================================================
export function sanitizeSignedDecimalInput(raw: string, allowNegative = true): string {
  const trimmed = raw.trimStart();
  const hasLeadingMinus = allowNegative && trimmed.startsWith('-');
  const unsigned = raw.replace(/[^0-9.,]/g, '');
  const match = unsigned.match(/^(\d*)([.,]\d{0,2})?/);
  const numericPart = match ? `${match[1] ?? ''}${match[2] ?? ''}` : '';
  return hasLeadingMinus ? `-${numericPart}` : numericPart;
}

export function parseSignedDecimal(raw: string): number {
  const normalized = raw.trim().replace(',', '.');
  if (!normalized || normalized === '-' || normalized === '.' || normalized === '-.') {
    return NaN;
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : NaN;
}

export function resolveTransactionSignAndType<T extends string>(
  rawAmount: string,
  currentType: T
): { sanitized: string; isNegative: boolean; nextType: T; magnitude: number } {
  const sanitized = sanitizeSignedDecimalInput(rawAmount, true);
  const isNegative = sanitized.startsWith('-');
  const parsed = parseSignedDecimal(sanitized);
  const magnitude = Number.isFinite(parsed) ? Math.abs(parsed) : 0;
  const nextType = (isNegative ? 'Saída' : currentType) as T;
  return { sanitized, isNegative, nextType, magnitude };
}

// ============================================================================
// DATAS DE OCORRÊNCIA E RENDAS (SEMANAL / QUINZENAL POR DATA EFETIVA)
// ============================================================================
export function addDaysISO(baseISO: string, offsetDays: number): string {
  const [y, m, d] = baseISO.slice(0, 10).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + offsetDays));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function diffDaysUTC(fromISO: string, toISO: string): number {
  const [fy, fm, fd] = fromISO.slice(0, 10).split('-').map(Number);
  const [ty, tm, td] = toISO.slice(0, 10).split('-').map(Number);
  return Math.round(
    (Date.UTC(ty, (tm || 1) - 1, td || 1) - Date.UTC(fy, (fm || 1) - 1, fd || 1)) / 86400000
  );
}

function getDaysInYearMonth(monthKey: string): number {
  const [y, m] = monthKey.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

export function getCadenceOccurrencesInMonth(params: {
  monthKey: string;
  frequency: 'Mensal' | 'Quinzenal' | 'Semanal' | 'Única' | 'Anual';
  dayOfMonth: number;
  anchorDateISO?: string;
  startMonthKey?: string;
}): string[] {
  const { monthKey, frequency, dayOfMonth, anchorDateISO, startMonthKey } = params;
  if (!monthKey || monthKey.length < 7) return [];
  const maxDay = getDaysInYearMonth(monthKey);
  const clampedTarget = Math.min(maxDay, Math.max(1, Math.round(dayOfMonth || 1)));
  const cleanAnchor = anchorDateISO && anchorDateISO.length >= 10 ? anchorDateISO.slice(0, 10) : '';

  if (frequency === 'Única') {
    if (!cleanAnchor) return [];
    return cleanAnchor.slice(0, 7) === monthKey ? [cleanAnchor] : [];
  }

  if (frequency === 'Anual') {
    if (cleanAnchor) {
      if (cleanAnchor.slice(0, 7) > monthKey) return [];
      if (cleanAnchor.slice(5, 7) !== monthKey.slice(5, 7)) return [];
      const targetDay = Number(cleanAnchor.slice(8, 10)) || clampedTarget;
      return [buildDateInMonth(monthKey, targetDay)];
    }
    if (startMonthKey && startMonthKey.length >= 7) {
      if (monthKey < startMonthKey) return [];
      if (startMonthKey.slice(5, 7) !== monthKey.slice(5, 7)) return [];
      return [buildDateInMonth(monthKey, clampedTarget)];
    }
    return [];
  }

  if (frequency === 'Mensal') {
    if (cleanAnchor && cleanAnchor.slice(0, 7) > monthKey) return [];
    const targetDay = cleanAnchor ? Number(cleanAnchor.slice(8, 10)) || clampedTarget : clampedTarget;
    return [buildDateInMonth(monthKey, targetDay)];
  }

  if (frequency === 'Semanal' || frequency === 'Quinzenal') {
    const stepDays = frequency === 'Semanal' ? 7 : 14;
    if (cleanAnchor) {
      const monthEndISO = `${monthKey}-${String(maxDay).padStart(2, '0')}`;
      if (cleanAnchor > monthEndISO) return [];
      const monthStartISO = `${monthKey}-01`;
      const daysSinceAnchor = diffDaysUTC(cleanAnchor, monthStartISO);
      const firstStepIdx = daysSinceAnchor <= 0 ? 0 : Math.ceil(daysSinceAnchor / stepDays);
      let cursor = addDaysISO(cleanAnchor, firstStepIdx * stepDays);
      const out: string[] = [];
      while (cursor.slice(0, 7) === monthKey) {
        out.push(cursor);
        cursor = addDaysISO(cursor, stepDays);
      }
      return out;
    }

    if (frequency === 'Quinzenal') {
      const secondDay = clampedTarget <= 15 ? Math.min(maxDay, clampedTarget + 15) : Math.max(1, clampedTarget - 15);
      const days = Array.from(new Set([clampedTarget, secondDay])).sort((a, b) => a - b);
      return days.map((d) => buildDateInMonth(monthKey, d));
    }

    const out: string[] = [];
    for (let d = 1; d <= maxDay; d++) {
      if (((d - clampedTarget) % 7 + 7) % 7 === 0) {
        out.push(buildDateInMonth(monthKey, d));
      }
    }
    return out;
  }

  return [buildDateInMonth(monthKey, clampedTarget)];
}

export function getIncomeOccurrenceDatesInMonth(inc: Income, monthKey: string): string[] {
  if (!inc.active || inc.amount <= 0) return [];
  if (inc.frequency === 'Anual' && !inc.receiptDate) {
    // Renda anual sem data exata segue rateio mensal legado (sem data fixa única)
    return [];
  }
  return getCadenceOccurrencesInMonth({
    monthKey,
    frequency: inc.frequency,
    dayOfMonth: inc.receiptDay || 5,
    anchorDateISO: inc.receiptDate,
  });
}

export function getIncomeAmountInMonth(inc: Income, monthKey: string): number {
  if (!inc.active) return 0;
  if (inc.frequency === 'Anual' && !inc.receiptDate) {
    return inc.amount / 12;
  }
  const occurrences = getIncomeOccurrenceDatesInMonth(inc, monthKey);
  return occurrences.length * inc.amount;
}

export function getMonthlyCoupleIncome(incomes: Income[], monthKey: string): number {
  return incomes.reduce((sum, inc) => sum + getIncomeAmountInMonth(inc, monthKey), 0);
}

export function getTotalFixedAndConfiguredIncomeInMonth(
  incomes: Income[],
  recurringItems: RecurringItem[],
  monthKey: string,
  transactions: Transaction[] = [],
  ignoreSettlement = true
): number {
  const base = getMonthlyCoupleIncome(incomes, monthKey);
  const fixedRecurring = recurringItems
    .filter((item) => item.type === 'Entrada')
    .reduce((sum, item) => sum + getRecurringItemAmountInMonth(item, monthKey, transactions, ignoreSettlement), 0);
  return base + fixedRecurring;
}

// ============================================================================
// DESCONTO DE SALDO ATUAL NEGATIVO NA PRÓXIMA ENTRADA DE RENDA FIXA
// ============================================================================
export interface FixedIncomeDiscountEvent {
  dateISO: string;
  monthKey: string;
  title: string;
  originalAmount: number;
  deductedAmount: number;
  netAmountAfterDiscount: number;
}

export interface NegativeBalanceIncomeOffsets {
  totalAccountsBalance: number;
  negativeBalanceDebt: number;
  remainingUnabsorbedDebt: number;
  deductionsByMonth: Record<string, number>;
  impactedEvents: FixedIncomeDiscountEvent[];
  firstImpactedEvent: FixedIncomeDiscountEvent | null;
}

export function computeNegativeBalanceIncomeOffsets(params: {
  bankAccounts?: BankAccount[];
  incomes: Income[];
  recurringItems?: RecurringItem[];
  transactions?: Transaction[];
  todayISO?: string;
}): NegativeBalanceIncomeOffsets {
  const activeAccounts = (params.bankAccounts ?? []).filter((a) => a.active);
  const totalAccountsBalance = activeAccounts.reduce((s, a) => s + a.balance, 0);
  const negativeBalanceDebt = totalAccountsBalance < 0 ? Math.abs(totalAccountsBalance) : 0;

  if (negativeBalanceDebt <= 0.005) {
    return {
      totalAccountsBalance,
      negativeBalanceDebt: 0,
      remainingUnabsorbedDebt: 0,
      deductionsByMonth: {},
      impactedEvents: [],
      firstImpactedEvent: null,
    };
  }

  const todayISO = (params.todayISO ?? getTodayISO()).slice(0, 10);
  const recurringItems = params.recurringItems ?? [];
  const transactions = params.transactions ?? [];
  const deductionsByMonth: Record<string, number> = {};
  const impactedEvents: FixedIncomeDiscountEvent[] = [];
  let remainingDebt = negativeBalanceDebt;

  // Escaneia cronologicamente até 36 meses à frente a partir de hoje
  const maxDaysScan = 1095;
  for (let offset = 0; offset <= maxDaysScan && remainingDebt > 0.005; offset++) {
    const dateISO = addDaysISO(todayISO, offset);
    const monthKey = dateISO.slice(0, 7);

    const dayFixedIncomes: Array<{ title: string; amount: number }> = [];

    for (const inc of params.incomes) {
      if (!inc.active || inc.frequency === 'Única' || inc.amount <= 0) continue;
      if (getIncomeOccurrenceDatesInMonth(inc, monthKey).includes(dateISO)) {
        dayFixedIncomes.push({ title: inc.source, amount: inc.amount });
      }
    }

    for (const rec of recurringItems) {
      if (!rec.active || rec.type !== 'Entrada' || rec.amount <= 0) continue;
      if (isRecurringItemSettledInMonth(rec.id, monthKey, transactions)) continue;
      if (getRecurringItemOccurrenceDatesInMonth(rec, monthKey).includes(dateISO)) {
        dayFixedIncomes.push({ title: rec.description, amount: rec.amount });
      }
    }

    for (const occ of dayFixedIncomes) {
      if (remainingDebt <= 0.005) break;
      const deducted = Math.min(occ.amount, remainingDebt);
      deductionsByMonth[monthKey] = (deductionsByMonth[monthKey] ?? 0) + deducted;
      remainingDebt = Math.max(0, remainingDebt - deducted);
      impactedEvents.push({
        dateISO,
        monthKey,
        title: occ.title,
        originalAmount: occ.amount,
        deductedAmount: deducted,
        netAmountAfterDiscount: Math.max(0, occ.amount - deducted),
      });
    }
  }

  return {
    totalAccountsBalance,
    negativeBalanceDebt,
    remainingUnabsorbedDebt: remainingDebt,
    deductionsByMonth,
    impactedEvents,
    firstImpactedEvent: impactedEvents[0] ?? null,
  };
}

// ============================================================================
// PESSOAS DO ESPAÇO COMPARTILHADO (ATÉ 7 MEMBROS) & CONTRIBUIÇÃO / GASTOS
// ============================================================================
export interface HouseholdMemberEntry {
  uid: string;
  name: string;
  isOwner: boolean;
}

export function getHouseholdMembersList(household: Household | null | undefined): HouseholdMemberEntry[] {
  if (!household) return [];
  return household.memberUids.map((uid, idx) => {
    const mapped = household.memberNames?.[uid]?.trim();
    const fallback =
      uid === household.partner1Uid
        ? household.partner1Name
        : uid === household.partner2Uid
          ? household.partner2Name
          : idx === 0
            ? household.partner1Name
            : `Membro ${idx + 1}`;
    return {
      uid,
      name: mapped || fallback || `Membro ${idx + 1}`,
      isOwner: uid === household.ownerUid,
    };
  });
}

export function getHouseholdPeople(household: Household | null | undefined): string[] {
  if (!household) return ['Pessoal'];
  const connectedNames = getHouseholdMembersList(household).map((m) => m.name);
  if (household.memberUids.length <= 1) {
    const primary = connectedNames[0] || household.partner1Name || 'Pessoal';
    return [primary];
  }
  const base = [...connectedNames, household.partner1Name];
  const sharedLabel = household.memberUids.length > 2 ? 'Grupo' : 'Casal';
  return Array.from(new Set([...base.filter((n) => Boolean(n && n.trim())), sharedLabel]));
}

export interface MemberIncomeSpendingRow {
  person: string;
  isShared: boolean;
  monthlyIncome: number;
  incomeSharePct: number;
  individualSpending: number;
  spendingSharePct: number;
  individualCommittedPct: number;
  individualBalance: number;
}

export interface MemberIncomeSpendingBreakdown {
  monthKey: string;
  totalIncome: number;
  totalSpending: number;
  totalBalance: number;
  rows: MemberIncomeSpendingRow[];
}

export function computeMemberIncomeAndSpendingBreakdown(params: {
  monthKey: string;
  household?: Household | null;
  incomes: Income[];
  transactions: Transaction[];
  installments: Installment[];
  recurringItems: RecurringItem[];
}): MemberIncomeSpendingBreakdown {
  const { monthKey, household, incomes, transactions, installments, recurringItems } = params;
  const incomeByPerson = new Map<string, number>();
  const spendingByPerson = new Map<string, number>();

  const addIncome = (person: string, amt: number) => {
    if (!amt || amt <= 0) return;
    const key = person.trim() || 'Não informado';
    incomeByPerson.set(key, (incomeByPerson.get(key) ?? 0) + amt);
  };

  const addSpending = (person: string, amt: number) => {
    if (!amt || amt <= 0) return;
    const key = person.trim() || 'Não informado';
    spendingByPerson.set(key, (spendingByPerson.get(key) ?? 0) + amt);
  };

  for (const inc of incomes) {
    addIncome(inc.person, getIncomeAmountInMonth(inc, monthKey));
  }

  for (const rec of recurringItems) {
    const amt = getRecurringItemAmountInMonth(rec, monthKey, transactions);
    if (amt <= 0) continue;
    if (rec.type === 'Entrada') {
      addIncome(rec.person, amt);
    } else {
      addSpending(rec.person, amt);
    }
  }

  for (const tx of transactions) {
    if (tx.monthKey !== monthKey) continue;
    if (tx.recurringId?.startsWith('card-invoice-')) continue;
    if (tx.type === 'Entrada') {
      addIncome(tx.person, tx.actualAmount);
    } else if (tx.type === 'Saída') {
      addSpending(tx.person, tx.actualAmount);
    }
  }

  for (const inst of installments) {
    const amt = getInstallmentAmountInMonth(inst, monthKey);
    if (amt > 0) {
      addSpending(inst.person, amt);
    }
  }

  const basePeople = household ? getHouseholdPeople(household) : [];
  const allNames = Array.from(
    new Set([
      ...basePeople,
      ...Array.from(incomeByPerson.keys()),
      ...Array.from(spendingByPerson.keys()),
    ])
  );

  const totalIncome = Array.from(incomeByPerson.values()).reduce((s, v) => s + v, 0);
  const totalSpending = Array.from(spendingByPerson.values()).reduce((s, v) => s + v, 0);

  const rows: MemberIncomeSpendingRow[] = allNames
    .map((person) => {
      const isShared = person === 'Casal' || person === 'Grupo' || person === 'Compartilhado';
      const monthlyIncome = incomeByPerson.get(person) ?? 0;
      const individualSpending = spendingByPerson.get(person) ?? 0;
      const incomeSharePct = totalIncome > 0 ? monthlyIncome / totalIncome : 0;
      const spendingSharePct = totalSpending > 0 ? individualSpending / totalSpending : 0;
      const individualCommittedPct = monthlyIncome > 0 ? individualSpending / monthlyIncome : 0;
      const individualBalance = monthlyIncome - individualSpending;
      return {
        person,
        isShared,
        monthlyIncome,
        incomeSharePct,
        individualSpending,
        spendingSharePct,
        individualCommittedPct,
        individualBalance,
      };
    })
    .filter((r) => !r.isShared || r.monthlyIncome > 0 || r.individualSpending > 0);

  return {
    monthKey,
    totalIncome,
    totalSpending,
    totalBalance: totalIncome - totalSpending,
    rows,
  };
}

// ============================================================================
// GANHOS E DESPESAS FIXAS (PROJEÇÃO AUTOMÁTICA NOS MESES FUTUROS)
// ============================================================================
export function isRecurringItemSettledInMonth(
  itemId: string,
  monthKey: string,
  transactions: Transaction[]
): boolean {
  return transactions.some((tx) => tx.recurringId === itemId && tx.recurringMonthKey === monthKey);
}

export function getRecurringItemOccurrenceDatesInMonth(
  item: RecurringItem,
  monthKey: string
): string[] {
  if (!item.active || item.amount <= 0) return [];
  if (item.startMonthKey && monthKey < item.startMonthKey) return [];
  if (item.endMonthKey && monthKey > item.endMonthKey) return [];

  return getCadenceOccurrencesInMonth({
    monthKey,
    frequency: item.frequency,
    dayOfMonth: item.dayOfMonth || 5,
    startMonthKey: item.startMonthKey,
  });
}

export function getRecurringItemRawAmountInMonth(item: RecurringItem, monthKey: string): number {
  const occurrences = getRecurringItemOccurrenceDatesInMonth(item, monthKey);
  return occurrences.length * item.amount;
}

export function getRecurringItemAmountInMonth(
  item: RecurringItem,
  monthKey: string,
  transactions: Transaction[] = [],
  ignoreSettlement = false
): number {
  const raw = getRecurringItemRawAmountInMonth(item, monthKey);
  if (raw <= 0) return 0;
  if (!ignoreSettlement && isRecurringItemSettledInMonth(item.id, monthKey, transactions)) {
    return 0;
  }
  return raw;
}

// ============================================================================
// PARCELAMENTOS (CONTROLE INDIVIDUAL, ANTECIPAÇÃO, ESTORNO E VENCIMENTOS)
// ============================================================================
export interface InstallmentSummary {
  installmentValue: number;
  paidInstallments: number;
  prepaidInstallments: number;
  cancelledInstallments: number;
  paidAmount: number;
  remainingInstallments: number;
  remainingAmount: number;
  overdueInstallments: number;
  overdueAmount: number;
  refundedAmount: number;
  currentInstallmentNumber: number | null;
  nextDueDateISO: string | null;
  overallStatus: 'Em dia' | 'Com atraso' | 'Quitado' | 'Cancelado';
  firstMonthKey: string;
  lastMonthKey: string;
}

function sanitizeInstallmentNumList(rawList: unknown, maxCount: number): Set<number> {
  const out = new Set<number>();
  if (!Array.isArray(rawList)) return out;
  for (const raw of rawList) {
    const n = Math.round(Number(raw));
    if (Number.isInteger(n) && n >= 1 && n <= maxCount) {
      out.add(n);
    }
  }
  return out;
}

export function getRegularPaidInstallmentSet(inst: Installment): Set<number> {
  return sanitizeInstallmentNumList(inst.paidInstallmentNumbers, Math.max(1, inst.installmentsCount));
}

export function getPrepaidInstallmentSet(inst: Installment): Set<number> {
  return sanitizeInstallmentNumList(inst.prepaidInstallmentNumbers, Math.max(1, inst.installmentsCount));
}

export function getCancelledInstallmentSet(inst: Installment): Set<number> {
  const count = Math.max(1, inst.installmentsCount);
  const explicit = sanitizeInstallmentNumList(inst.cancelledInstallmentNumbers, count);
  if (explicit.size > 0) return explicit;
  if (inst.status === 'Cancelado') {
    const paid = getRegularPaidInstallmentSet(inst);
    const prepaid = getPrepaidInstallmentSet(inst);
    const allRemaining = new Set<number>();
    for (let n = 1; n <= count; n++) {
      if (!paid.has(n) && !prepaid.has(n)) allRemaining.add(n);
    }
    return allRemaining.size > 0 ? allRemaining : new Set(Array.from({ length: count }, (_, i) => i + 1));
  }
  return explicit;
}

export function getPaidInstallmentSet(inst: Installment): Set<number> {
  const regular = getRegularPaidInstallmentSet(inst);
  const prepaid = getPrepaidInstallmentSet(inst);
  const merged = new Set<number>(regular);
  for (const n of prepaid) merged.add(n);
  return merged;
}

export function getInstallmentDueDay(inst: Installment, cards: CreditCard[] = []): number {
  const card = cards.find((c) => matchesCard(c, inst.cardId, inst.cardName));
  if (card && card.dueDay >= 1 && card.dueDay <= 31) {
    return card.dueDay;
  }
  const day = Number(inst.firstChargeDate.slice(8, 10));
  return Number.isFinite(day) && day >= 1 && day <= 31 ? day : 10;
}

export function computeInstallmentSummary(
  inst: Installment,
  refMonthKey = getCurrentMonthKey(),
  cards: CreditCard[] = []
): InstallmentSummary {
  const count = Math.max(1, inst.installmentsCount);
  const installmentValue = inst.totalAmount / count;
  const firstMonthKey = inst.firstChargeDate.slice(0, 7);
  const regularPaidSet = getRegularPaidInstallmentSet(inst);
  const prepaidSet = getPrepaidInstallmentSet(inst);
  const cancelledSet = getCancelledInstallmentSet(inst);
  const dueDay = getInstallmentDueDay(inst, cards);

  let paidInstallments = 0;
  let prepaidInstallments = 0;
  let cancelledInstallments = 0;
  let overdueInstallments = 0;
  let remainingInstallments = 0;
  let nextDueDateISO: string | null = null;
  let firstUnpaidNum: number | null = null;

  for (let idx = 0; idx < count; idx++) {
    const num = idx + 1;
    const monthKey = addMonthsToKey(firstMonthKey, idx);
    if (cancelledSet.has(num)) {
      cancelledInstallments++;
      continue;
    }
    if (prepaidSet.has(num)) {
      paidInstallments++;
      prepaidInstallments++;
      continue;
    }
    if (regularPaidSet.has(num)) {
      paidInstallments++;
      continue;
    }

    remainingInstallments++;
    if (firstUnpaidNum === null) {
      firstUnpaidNum = num;
      nextDueDateISO = buildDateInMonth(monthKey, dueDay);
    }
    if (monthKey < refMonthKey) {
      overdueInstallments++;
    }
  }

  const paidAmount = installmentValue * paidInstallments;
  const remainingAmount = installmentValue * remainingInstallments;
  const overdueAmount = installmentValue * overdueInstallments;
  const refundedAmount =
    typeof inst.refundedAmount === 'number' && inst.refundedAmount > 0
      ? inst.refundedAmount
      : installmentValue * cancelledInstallments;
  const lastMonthKey = addMonthsToKey(firstMonthKey, count - 1);

  const diffNow = monthDiff(firstMonthKey, refMonthKey);
  let currentInstallmentNumber: number | null = null;
  if (diffNow >= 0 && diffNow < count && !cancelledSet.has(diffNow + 1)) {
    currentInstallmentNumber = diffNow + 1;
  } else if (firstUnpaidNum !== null) {
    currentInstallmentNumber = firstUnpaidNum;
  } else if (paidInstallments > 0) {
    currentInstallmentNumber = count;
  }

  let overallStatus: InstallmentSummary['overallStatus'] = 'Em dia';
  if (inst.status === 'Cancelado' || (cancelledInstallments > 0 && remainingInstallments === 0 && paidInstallments === 0)) {
    overallStatus = 'Cancelado';
  } else if (remainingInstallments === 0) {
    overallStatus = 'Quitado';
  } else if (overdueInstallments > 0) {
    overallStatus = 'Com atraso';
  }

  return {
    installmentValue,
    paidInstallments,
    prepaidInstallments,
    cancelledInstallments,
    paidAmount,
    remainingInstallments,
    remainingAmount,
    overdueInstallments,
    overdueAmount,
    refundedAmount,
    currentInstallmentNumber,
    nextDueDateISO,
    overallStatus,
    firstMonthKey,
    lastMonthKey,
  };
}

export function getInstallmentAmountInMonth(inst: Installment, monthKey: string): number {
  const count = Math.max(1, inst.installmentsCount);
  const firstMonthKey = inst.firstChargeDate.slice(0, 7);
  const diff = monthDiff(firstMonthKey, monthKey);
  if (diff >= 0 && diff < count) {
    const number = diff + 1;
    const prepaidSet = getPrepaidInstallmentSet(inst);
    const cancelledSet = getCancelledInstallmentSet(inst);
    // Parcelas canceladas ou antecipadas não são mais cobradas na fatura futura mensal
    if (cancelledSet.has(number) || prepaidSet.has(number)) {
      return 0;
    }
    return inst.totalAmount / count;
  }
  return 0;
}

export function getInstallmentSchedule(
  inst: Installment,
  refMonthKey = getCurrentMonthKey(),
  cards: CreditCard[] = []
) {
  const count = Math.max(1, inst.installmentsCount);
  const installmentValue = inst.totalAmount / count;
  const firstMonthKey = inst.firstChargeDate.slice(0, 7);
  const regularPaidSet = getRegularPaidInstallmentSet(inst);
  const prepaidSet = getPrepaidInstallmentSet(inst);
  const cancelledSet = getCancelledInstallmentSet(inst);
  const dueDay = getInstallmentDueDay(inst, cards);

  return Array.from({ length: count }, (_, idx) => {
    const number = idx + 1;
    const monthKey = addMonthsToKey(firstMonthKey, idx);
    const dueDateISO = buildDateInMonth(monthKey, dueDay);
    const isCancelled = cancelledSet.has(number);
    const isPrepaid = !isCancelled && prepaidSet.has(number);
    const isPaid = !isCancelled && (regularPaidSet.has(number) || isPrepaid);
    const isOverdue = !isCancelled && !isPaid && monthKey < refMonthKey;
    return {
      number,
      monthKey,
      dueDateISO,
      amount: isCancelled ? 0 : installmentValue,
      originalAmount: installmentValue,
      isPaid,
      isPrepaid,
      isCancelled,
      isOverdue,
      isCurrent: monthKey === refMonthKey,
    };
  });
}

export function computeFirstCreditInstallmentDate(purchaseDateISO: string, closingDay?: number): string {
  const safeISO = purchaseDateISO && purchaseDateISO.length >= 10 ? purchaseDateISO.slice(0, 10) : getTodayISO();
  const monthKey = safeISO.slice(0, 7);
  const day = Number(safeISO.slice(8, 10)) || 1;
  const firstMonthKey =
    typeof closingDay === 'number' && closingDay >= 1 && day >= closingDay
      ? addMonthsToKey(monthKey, 1)
      : monthKey;
  return buildDateInMonth(firstMonthKey, day);
}

// ============================================================================
// CARTÕES E FATURAS (5 ESTADOS, PAGAMENTO PARCIAL, ESTORNOS, REGRA DE LIMITE)
// ============================================================================
export function matchesCard(
  card: CreditCard,
  itemCardId?: string,
  itemAccountOrCard?: string
): boolean {
  const cleanId = itemCardId?.trim();
  if (cleanId) {
    return cleanId === card.id;
  }
  const left = (itemAccountOrCard ?? '').trim().toLowerCase();
  const right = card.name.trim().toLowerCase();
  return Boolean(left && right && left === right);
}

export function getCardInvoicePaymentTransactions(
  cardId: string,
  monthKey: string,
  transactions: Transaction[]
): Transaction[] {
  const markerId = `card-invoice-${cardId}`;
  return transactions.filter((tx) => tx.recurringId === markerId && tx.recurringMonthKey === monthKey);
}

export function getCardInvoiceClosingAndDueDates(
  card: CreditCard,
  monthKey: string
): { closingDateISO: string; dueDateISO: string } {
  const dueDateISO = buildDateInMonth(monthKey, card.dueDay);
  const closingMonthKey = card.closingDay < card.dueDay ? monthKey : addMonthsToKey(monthKey, -1);
  const closingDateISO = buildDateInMonth(closingMonthKey, card.closingDay);
  return { closingDateISO, dueDateISO };
}

export function getCardInvoicePaidAmount(
  cardId: string,
  monthKey: string,
  transactions: Transaction[]
): { paidAmount: number; hasZeroLegacyMarker: boolean; paymentTransactions: Transaction[] } {
  const paymentTransactions = getCardInvoicePaymentTransactions(cardId, monthKey, transactions).filter(
    (tx) => tx.status === 'Pago'
  );
  const paidAmount = paymentTransactions.reduce((sum, tx) => sum + Math.max(0, tx.actualAmount), 0);
  const hasZeroLegacyMarker =
    paymentTransactions.length > 0 &&
    paidAmount === 0 &&
    paymentTransactions.every((tx) => tx.plannedAmount === 0);
  return { paidAmount, hasZeroLegacyMarker, paymentTransactions };
}

export function isCardInvoicePaidInMonth(
  cardId: string,
  monthKey: string,
  transactions: Transaction[],
  invoiceTotal?: number
): boolean {
  const { paidAmount, hasZeroLegacyMarker, paymentTransactions } = getCardInvoicePaidAmount(
    cardId,
    monthKey,
    transactions
  );
  if (paymentTransactions.length === 0) return false;
  if (hasZeroLegacyMarker) return true;
  if (typeof invoiceTotal === 'number' && invoiceTotal > 0.005) {
    return paidAmount >= invoiceTotal - 0.009;
  }
  // Sem invoiceTotal informado: se há pagamento registrado >= plannedAmount (ou único marcador integral legado)
  return paymentTransactions.some(
    (tx) => tx.plannedAmount <= 0 || paidAmount >= tx.plannedAmount - 0.009
  );
}

export function getInvoiceMonthKeyForTransaction(tx: Transaction, cards: CreditCard[]): string {
  if (tx.paymentMethod !== 'Crédito') return tx.monthKey;
  const card = cards.find((c) => matchesCard(c, tx.cardId, tx.accountOrCard));
  if (!card) return tx.monthKey;
  const day = Number(tx.date.slice(8, 10));
  if (day >= card.closingDay) {
    return addMonthsToKey(tx.monthKey, 1);
  }
  return tx.monthKey;
}

export function getInvoiceMonthKeyForRecurringCharge(
  item: RecurringItem,
  occurrenceMonthKey: string,
  card: CreditCard
): string {
  if (item.dayOfMonth >= card.closingDay) {
    return addMonthsToKey(occurrenceMonthKey, 1);
  }
  return occurrenceMonthKey;
}

export function getCardInvoiceInMonth(
  card: CreditCard,
  monthKey: string,
  transactions: Transaction[],
  installments: Installment[],
  recurringItems: RecurringItem[] = [],
  todayISO: string = getTodayISO()
): {
  installmentsTotal: number;
  creditPurchasesTotal: number;
  grossCreditPurchasesTotal: number;
  recurringTotal: number;
  refundsTotal: number;
  grossTotal: number;
  total: number;
  paidAmount: number;
  remainingAmount: number;
  status: CardInvoiceStatus;
  isOverdue: boolean;
  closingDateISO: string;
  dueDateISO: string;
  matchingInstallments: Array<Installment & { monthAmount: number; installmentIndex: number }>;
  matchingTransactions: Transaction[];
  matchingRefunds: Transaction[];
  matchingRecurring: Array<RecurringItem & { monthAmount: number; occurrenceMonthKey: string }>;
  paymentTransactions: Transaction[];
} {
  const matchingInstallments: Array<Installment & { monthAmount: number; installmentIndex: number }> = [];
  let rawInstallmentsTotal = 0;

  for (const inst of installments) {
    if (matchesCard(card, inst.cardId, inst.cardName)) {
      const amt = getInstallmentAmountInMonth(inst, monthKey);
      if (amt > 0) {
        const idx = monthDiff(inst.firstChargeDate.slice(0, 7), monthKey) + 1;
        rawInstallmentsTotal += amt;
        matchingInstallments.push({ ...inst, monthAmount: amt, installmentIndex: idx });
      }
    }
  }

  const cardPeriodTxs = transactions.filter((tx) => {
    if (tx.recurringId?.startsWith('card-invoice-')) return false;
    if (!matchesCard(card, tx.cardId, tx.accountOrCard)) return false;
    const isEstorno = tx.entryKind === 'estorno';
    if (!isEstorno && (tx.type !== 'Saída' || tx.paymentMethod !== 'Crédito')) return false;
    if (isEstorno && tx.paymentMethod !== 'Crédito' && !tx.cardId) return false;
    const invMonth =
      tx.paymentMethod === 'Crédito'
        ? getInvoiceMonthKeyForTransaction(tx, [card])
        : getInvoiceMonthKeyForTransaction({ ...tx, paymentMethod: 'Crédito' }, [card]);
    return invMonth === monthKey;
  });

  const matchingTransactions = cardPeriodTxs.filter((tx) => tx.entryKind !== 'estorno');
  const matchingRefunds = cardPeriodTxs.filter((tx) => tx.entryKind === 'estorno');

  const grossCreditPurchasesTotal = matchingTransactions.reduce((s, tx) => s + tx.actualAmount, 0);
  const refundsTotal = matchingRefunds.reduce((s, tx) => s + tx.actualAmount, 0);

  const matchingRecurring: Array<RecurringItem & { monthAmount: number; occurrenceMonthKey: string }> = [];
  let rawRecurringTotal = 0;
  const candidateOccMonths = [monthKey, addMonthsToKey(monthKey, -1)];

  for (const item of recurringItems) {
    if (item.type !== 'Saída' || item.paymentMethod !== 'Crédito') continue;
    if (!matchesCard(card, item.cardId, item.accountOrCard)) continue;

    for (const occMk of candidateOccMonths) {
      if (getInvoiceMonthKeyForRecurringCharge(item, occMk, card) === monthKey) {
        const amt = getRecurringItemAmountInMonth(item, occMk, transactions);
        if (amt > 0) {
          rawRecurringTotal += amt;
          matchingRecurring.push({ ...item, monthAmount: amt, occurrenceMonthKey: occMk });
        }
      }
    }
  }

  // Aloca estornos primeiro sobre compras à vista, depois parcelas e recorrências para manter reconciliação exata
  let refundCarry = refundsTotal;
  const creditPurchasesTotal = Math.max(0, grossCreditPurchasesTotal - refundCarry);
  refundCarry = Math.max(0, refundCarry - grossCreditPurchasesTotal);

  const installmentsTotal = Math.max(0, rawInstallmentsTotal - refundCarry);
  refundCarry = Math.max(0, refundCarry - rawInstallmentsTotal);

  const recurringTotal = Math.max(0, rawRecurringTotal - refundCarry);

  const grossTotal = rawInstallmentsTotal + grossCreditPurchasesTotal + rawRecurringTotal;
  const total = Math.max(0, grossTotal - refundsTotal);

  const { paidAmount: rawPaidAmount, hasZeroLegacyMarker, paymentTransactions } = getCardInvoicePaidAmount(
    card.id,
    monthKey,
    transactions
  );
  const paidAmount = hasZeroLegacyMarker ? total : rawPaidAmount;
  const remainingAmount = hasZeroLegacyMarker ? 0 : Math.max(0, total - paidAmount);
  const { closingDateISO, dueDateISO } = getCardInvoiceClosingAndDueDates(card, monthKey);

  const isOverdue = remainingAmount > 0.005 && todayISO > dueDateISO;

  let status: CardInvoiceStatus;
  if (hasZeroLegacyMarker || (paidAmount >= total - 0.009 && (total > 0.005 || paidAmount > 0.005))) {
    status = 'Paga';
  } else if (paidAmount > 0.005 && remainingAmount > 0.005) {
    status = 'Parcialmente paga';
  } else if (isOverdue) {
    status = 'Vencida';
  } else if (todayISO >= closingDateISO) {
    status = 'Fechada';
  } else {
    status = 'Aberta';
  }

  return {
    installmentsTotal,
    creditPurchasesTotal,
    grossCreditPurchasesTotal,
    recurringTotal,
    refundsTotal,
    grossTotal,
    total,
    paidAmount,
    remainingAmount,
    status,
    isOverdue,
    closingDateISO,
    dueDateISO,
    matchingInstallments,
    matchingTransactions,
    matchingRefunds,
    matchingRecurring,
    paymentTransactions,
  };
}

export interface CardLimitUsage {
  limitRule: CardLimitRule;
  unpaidInstallmentsTotal: number;
  openCreditPurchasesTotal: number;
  openRecurringTotal: number;
  refundsCreditTotal: number;
  partialPaymentsCreditTotal: number;
  usedLimit: number;
  availableLimit: number;
  usedPct: number;
  isSelectedInvoicePaid: boolean;
  selectedInvoiceStatus: CardInvoiceStatus;
  selectedInvoiceRemaining: number;
  selectedInvoicePaidAmount: number;
}

export function computeCardLimitUsage(params: {
  card: CreditCard;
  refMonthKey: string;
  transactions: Transaction[];
  installments: Installment[];
  recurringItems?: RecurringItem[];
  todayISO?: string;
}): CardLimitUsage {
  const { card, refMonthKey, transactions, installments, recurringItems = [], todayISO = getTodayISO() } = params;
  const limitRule: CardLimitRule = card.limitRule === 'parcela_mensal' ? 'parcela_mensal' : 'total_parcelamento';

  const selectedInv = getCardInvoiceInMonth(card, refMonthKey, transactions, installments, recurringItems, todayISO);
  const isSelectedInvoicePaid = selectedInv.status === 'Paga';
  const nextMonthKey = addMonthsToKey(refMonthKey, 1);

  // Cache de status de faturas por mês para não recomputar desnecessariamente
  const invoiceStatusCache = new Map<string, ReturnType<typeof getCardInvoiceInMonth>>();
  const getInv = (mk: string) => {
    const cached = invoiceStatusCache.get(mk);
    if (cached) return cached;
    const computed =
      mk === refMonthKey
        ? selectedInv
        : getCardInvoiceInMonth(card, mk, transactions, installments, recurringItems, todayISO);
    invoiceStatusCache.set(mk, computed);
    return computed;
  };

  // Ciclo aberto para regra 'parcela_mensal': se a fatura atual já está paga, considera o próximo ciclo; caso contrário o atual
  const activeCycleMonthKey = isSelectedInvoicePaid ? nextMonthKey : refMonthKey;

  // 1. Parcelas em aberto (respeitando antecipação, cancelamento e regra do emissor)
  let unpaidInstallmentsTotal = 0;
  for (const inst of installments) {
    if (!matchesCard(card, inst.cardId, inst.cardName)) continue;
    const count = Math.max(1, inst.installmentsCount);
    const installmentValue = inst.totalAmount / count;
    const firstMonthKey = inst.firstChargeDate.slice(0, 7);
    const paidSet = getRegularPaidInstallmentSet(inst);
    const prepaidSet = getPrepaidInstallmentSet(inst);
    const cancelledSet = getCancelledInstallmentSet(inst);

    for (let idx = 0; idx < count; idx++) {
      const number = idx + 1;
      const mk = addMonthsToKey(firstMonthKey, idx);
      if (cancelledSet.has(number) || prepaidSet.has(number) || paidSet.has(number)) continue;
      if (limitRule === 'parcela_mensal' && mk > activeCycleMonthKey) continue;
      const inv = getInv(mk);
      if (inv.status !== 'Paga') {
        unpaidInstallmentsTotal += installmentValue;
      }
    }
  }

  // 2. Compras à vista no crédito do ciclo atual ou próximo ciclo cujo mês da fatura ainda não foi pago integralmente
  let openCreditPurchasesTotal = 0;
  let refundsCreditTotal = 0;
  const openInvoiceMonths = new Set<string>();

  for (const tx of transactions) {
    if (tx.recurringId?.startsWith('card-invoice-')) continue;
    if (!matchesCard(card, tx.cardId, tx.accountOrCard)) continue;
    const isEstorno = tx.entryKind === 'estorno';
    if (!isEstorno && (tx.type !== 'Saída' || tx.paymentMethod !== 'Crédito')) continue;
    if (isEstorno && tx.paymentMethod !== 'Crédito' && !tx.cardId) continue;

    const invMonthKey =
      tx.paymentMethod === 'Crédito'
        ? getInvoiceMonthKeyForTransaction(tx, [card])
        : getInvoiceMonthKeyForTransaction({ ...tx, paymentMethod: 'Crédito' }, [card]);
    if (invMonthKey < refMonthKey) continue;

    const inv = getInv(invMonthKey);
    if (inv.status === 'Paga') continue;

    openInvoiceMonths.add(invMonthKey);
    if (isEstorno) {
      refundsCreditTotal += tx.actualAmount;
    } else {
      openCreditPurchasesTotal += tx.actualAmount;
    }
  }

  // 3. Fixos no crédito dos ciclos em aberto
  let openRecurringTotal = 0;
  for (const item of recurringItems) {
    if (item.type !== 'Saída' || item.paymentMethod !== 'Crédito') continue;
    if (!matchesCard(card, item.cardId, item.accountOrCard)) continue;

    for (const targetInvMonth of [refMonthKey, nextMonthKey]) {
      const inv = getInv(targetInvMonth);
      if (inv.status === 'Paga') continue;
      const occCandidates =
        targetInvMonth === refMonthKey ? [refMonthKey, addMonthsToKey(refMonthKey, -1)] : [refMonthKey];
      for (const occMk of occCandidates) {
        if (getInvoiceMonthKeyForRecurringCharge(item, occMk, card) === targetInvMonth) {
          const amt = getRecurringItemAmountInMonth(item, occMk, transactions);
          if (amt > 0) {
            openRecurringTotal += amt;
            openInvoiceMonths.add(targetInvMonth);
          }
        }
      }
    }
  }

  // Inclui também pagamentos parciais efetuados nas faturas ainda não pagas integralmente
  let partialPaymentsCreditTotal = 0;
  const checkedPaymentMonths = new Set<string>([refMonthKey, nextMonthKey, ...openInvoiceMonths]);
  for (const mk of checkedPaymentMonths) {
    const inv = getInv(mk);
    if (inv.status === 'Parcialmente paga') {
      partialPaymentsCreditTotal += inv.paidAmount;
    }
  }

  const grossOpen = unpaidInstallmentsTotal + openCreditPurchasesTotal + openRecurringTotal;
  const usedLimit = Math.max(0, grossOpen - refundsCreditTotal - partialPaymentsCreditTotal);
  const availableLimit = Math.max(0, card.limit - usedLimit);
  const usedPct = card.limit > 0 ? Math.min(100, (usedLimit / card.limit) * 100) : 0;

  return {
    limitRule,
    unpaidInstallmentsTotal,
    openCreditPurchasesTotal,
    openRecurringTotal,
    refundsCreditTotal,
    partialPaymentsCreditTotal,
    usedLimit,
    availableLimit,
    usedPct,
    isSelectedInvoicePaid,
    selectedInvoiceStatus: selectedInv.status,
    selectedInvoiceRemaining: selectedInv.remainingAmount,
    selectedInvoicePaidAmount: selectedInv.paidAmount,
  };
}

// ============================================================================
// ECONOMIAS, CAIXINHAS, INDICADORES E SIMULADOR DE JUROS COMPOSTOS
// ============================================================================
export function computePoupancaAnnualPct(selicAnnualPct: number, trAnnualPct = 0.85): number {
  const safeSelic = Math.max(0, Number(selicAnnualPct) || 0);
  const safeTr = Math.max(0, Number(trAnnualPct) || 0);
  if (safeSelic > 8.5) {
    // Regra oficial: 0,5% ao mês + TR
    return Number((((Math.pow(1.005, 12) - 1) * 100) + safeTr).toFixed(2));
  }
  // Selic <= 8,5% a.a.: 70% da Selic + TR
  return Number((safeSelic * 0.7 + safeTr).toFixed(2));
}

export const DEFAULT_BENCHMARK_INDICATORS: BenchmarkIndicators = {
  cdiAnnualPct: 11.15,
  selicAnnualPct: 11.25,
  trAnnualPct: 0.85,
  poupancaAnnualPct: computePoupancaAnnualPct(11.25, 0.85),
  updatedAt: '2026-11-01T12:00:00.000Z',
  source: 'fallback',
};

const IOF_REGRESSIVE_RATES = [
  1, 0.96, 0.93, 0.90, 0.86, 0.83, 0.80, 0.76, 0.73, 0.70,
  0.66, 0.63, 0.60, 0.56, 0.53, 0.50, 0.46, 0.43, 0.40, 0.36,
  0.33, 0.30, 0.26, 0.23, 0.20, 0.16, 0.13, 0.10, 0.06, 0.03,
];

export function getBrazilianIOFRate(days: number, yieldType: InvestmentYieldType): number {
  if (yieldType === 'poupanca') return 0;
  const safeDays = Math.max(0, Math.floor(days));
  if (safeDays >= 30) return 0;
  return IOF_REGRESSIVE_RATES[safeDays] ?? 0;
}

export function getBrazilianIRRate(days: number, yieldType: InvestmentYieldType): number {
  if (yieldType === 'poupanca') return 0;
  const safeDays = Math.max(1, Math.floor(days));
  if (safeDays <= 180) return 0.225;
  if (safeDays <= 360) return 0.20;
  if (safeDays <= 720) return 0.175;
  return 0.15;
}

export function getYieldTypeLabel(yieldType?: InvestmentYieldType): string {
  switch (yieldType) {
    case 'cdi':
      return 'CDI';
    case 'poupanca':
      return 'Poupança';
    case 'selic':
      return 'Tesouro Selic';
    case 'personalizado':
    default:
      return 'Personalizado';
  }
}

export function resolveInvestmentAnnualRatePct(params: {
  yieldType?: InvestmentYieldType;
  yieldIndicatorPct?: number;
  customAnnualRatePct?: number;
  indicators?: BenchmarkIndicators;
}): number {
  const ind = params.indicators ?? DEFAULT_BENCHMARK_INDICATORS;
  const pctMultiplier = (params.yieldIndicatorPct ?? 100) / 100;
  const type = params.yieldType ?? 'personalizado';
  if (type === 'cdi') {
    return Math.max(0, ind.cdiAnnualPct * pctMultiplier);
  }
  if (type === 'selic') {
    return Math.max(0, ind.selicAnnualPct * pctMultiplier);
  }
  if (type === 'poupanca') {
    const poupBase =
      ind.poupancaAnnualPct > 0
        ? ind.poupancaAnnualPct
        : computePoupancaAnnualPct(ind.selicAnnualPct, ind.trAnnualPct);
    return Math.max(0, poupBase * (params.yieldIndicatorPct !== undefined ? pctMultiplier : 1));
  }
  return Math.max(0, params.customAnnualRatePct ?? 0);
}

export function simulateInvestmentGrowth(input: CompoundSimulationInput): CompoundSimulationResult {
  const indicators = input.indicators ?? DEFAULT_BENCHMARK_INDICATORS;
  const initialAmount = Math.max(0, Number(input.initialAmount) || 0);
  const monthlyContribution = Math.max(0, Number(input.monthlyContribution) || 0);
  const extraOneTimeAmount = Math.max(0, Number(input.extraOneTimeAmount) || 0);
  const extraOneTimeMonth = Math.max(1, Math.round(Number(input.extraOneTimeMonth) || 1));
  const periodMode = input.periodMode === 'days' ? 'days' : 'months';
  const termMonths = periodMode === 'days' ? 1 : Math.max(1, Math.min(600, Math.round(input.termMonths || 12)));
  const durationDays =
    periodMode === 'days'
      ? Math.max(1, Math.min(29, Math.round(input.durationDays || 15)))
      : termMonths * 30;

  const yieldType = input.yieldType;
  const yieldIndicatorPct = input.yieldIndicatorPct ?? 100;
  const custodyFeePct = Math.max(0, Number(input.custodyFeePct) || 0);
  const grossAnnualRatePct = resolveInvestmentAnnualRatePct({
    yieldType,
    yieldIndicatorPct,
    customAnnualRatePct: input.customAnnualRatePct,
    indicators,
  });

  const grossAnnualDecimal = grossAnnualRatePct / 100;
  const feeDecimal = custodyFeePct / 100;
  const grossMonthlyRate = grossAnnualDecimal > 0 ? Math.pow(1 + grossAnnualDecimal, 1 / 12) - 1 : 0;
  const monthlyFeeRate = feeDecimal > 0 ? Math.pow(1 + feeDecimal, 1 / 12) - 1 : 0;

  const computeNetAtHorizon = (invested: number, grossBal: number, feePaid: number, daysHeld: number) => {
    const grossGain = Math.max(0, grossBal - invested);
    const gainAfterFee = Math.max(0, grossGain - feePaid);
    const iofRate = getBrazilianIOFRate(daysHeld, yieldType);
    const iofTax = gainAfterFee * iofRate;
    const baseIr = Math.max(0, gainAfterFee - iofTax);
    const irRate = getBrazilianIRRate(daysHeld, yieldType);
    const irTax = baseIr * irRate;
    const netGain = Math.max(0, baseIr - irTax);
    return {
      grossInterest: grossGain,
      iofRate,
      iofTax,
      irRate,
      irTax,
      netInterest: netGain,
      netBalance: invested + netGain,
    };
  };

  const timeline: CompoundSimulationMonthPoint[] = [];
  let investedTotal = initialAmount;
  let grossBalance = initialAmount;
  let custodyFeeTotal = 0;

  if (periodMode === 'days') {
    // Sub-month horizon (< 30 days): Poupança só credita rendimento no aniversário mensal (dia 30)
    const periodFactor =
      yieldType === 'poupanca'
        ? 0
        : grossAnnualDecimal > 0
          ? Math.pow(1 + grossAnnualDecimal, durationDays / 365) - 1
          : 0;
    const periodFeeFactor = feeDecimal > 0 ? Math.pow(1 + feeDecimal, durationDays / 365) - 1 : 0;
    const extraNow = extraOneTimeAmount > 0 ? extraOneTimeAmount : 0;
    investedTotal = initialAmount + extraNow;
    const grossBeforeFee = investedTotal * (1 + periodFactor);
    custodyFeeTotal = investedTotal * periodFeeFactor;
    grossBalance = Math.max(investedTotal, grossBeforeFee - custodyFeeTotal);

    const dayCalc = computeNetAtHorizon(investedTotal, grossBeforeFee, custodyFeeTotal, durationDays);
    timeline.push({
      month: 0,
      label: 'Hoje',
      investedTotal,
      grossBalance: investedTotal,
      netBalance: investedTotal,
      grossInterestAccumulated: 0,
      netInterestAccumulated: 0,
    });
    timeline.push({
      month: 1,
      label: `${durationDays} dias`,
      investedTotal,
      grossBalance: grossBeforeFee,
      netBalance: dayCalc.netBalance,
      grossInterestAccumulated: dayCalc.grossInterest,
      netInterestAccumulated: dayCalc.netInterest,
    });

    const effectiveNetReturn = investedTotal > 0 ? dayCalc.netInterest / investedTotal : 0;
    const annualizationPow = durationDays > 0 ? 365 / durationDays : 12;
    const netAnnualRatePct =
      effectiveNetReturn > 0 ? (Math.pow(1 + effectiveNetReturn, annualizationPow) - 1) * 100 : 0;
    const netMonthlyRatePct =
      netAnnualRatePct > 0 ? (Math.pow(1 + netAnnualRatePct / 100, 1 / 12) - 1) * 100 : 0;

    return {
      yieldType,
      yieldLabel: getYieldTypeLabel(yieldType),
      durationDays,
      termMonths: 0,
      totalInvested: investedTotal,
      grossAnnualRatePct,
      grossMonthlyRatePct: grossMonthlyRate * 100,
      netAnnualRatePct,
      netMonthlyRatePct,
      grossInterest: dayCalc.grossInterest,
      grossBalance: grossBeforeFee,
      irRate: dayCalc.irRate,
      irTax: dayCalc.irTax,
      iofRate: dayCalc.iofRate,
      iofTax: dayCalc.iofTax,
      custodyFeeTotal,
      netInterest: dayCalc.netInterest,
      netBalance: dayCalc.netBalance,
      timeline,
      hypotheses: [
        `Indicadores base: CDI ${indicators.cdiAnnualPct.toFixed(2)}% a.a., Selic ${indicators.selicAnnualPct.toFixed(2)}% a.a., Poupança ${indicators.poupancaAnnualPct.toFixed(2)}% a.a.`,
        yieldType === 'poupanca'
          ? 'Poupança credita rendimento apenas na data de aniversário (30 dias); resgates antes disso não têm rendimento, sem IR/IOF.'
          : `Resgate simulado em ${durationDays} dias: IOF regressivo de ${(dayCalc.iofRate * 100).toFixed(0)}% e IR regressivo de ${(dayCalc.irRate * 100).toFixed(1)}% sobre os rendimentos.`,
        custodyFeePct > 0
          ? `Taxa de custódia/administração considerada: ${custodyFeePct.toFixed(2)}% ao ano.`
          : 'Sem taxa de custódia/administração adicional.',
      ],
      disclaimer:
        'Estimativa educacional baseada em juros compostos e regras tributárias vigentes. Não constitui garantia de rentabilidade.',
    };
  }

  timeline.push({
    month: 0,
    label: 'Início',
    investedTotal,
    grossBalance,
    netBalance: grossBalance,
    grossInterestAccumulated: 0,
    netInterestAccumulated: 0,
  });

  let grossBalanceWithoutFee = initialAmount;

  for (let m = 1; m <= termMonths; m++) {
    const grossInterestThisMonth = grossBalanceWithoutFee * grossMonthlyRate;
    const feeThisMonth = grossBalance * monthlyFeeRate;
    const extraThisMonth = extraOneTimeAmount > 0 && extraOneTimeMonth === m ? extraOneTimeAmount : 0;
    const contribution = monthlyContribution + extraThisMonth;

    grossBalanceWithoutFee = grossBalanceWithoutFee + grossInterestThisMonth + contribution;
    grossBalance = Math.max(0, grossBalance + grossInterestThisMonth - feeThisMonth + contribution);
    investedTotal += contribution;
    custodyFeeTotal += feeThisMonth;

    const pointCalc = computeNetAtHorizon(investedTotal, grossBalanceWithoutFee, custodyFeeTotal, m * 30);
    timeline.push({
      month: m,
      label: termMonths > 36 && m % 12 === 0 ? `${m / 12}a` : `M${m}`,
      investedTotal,
      grossBalance: grossBalanceWithoutFee,
      netBalance: pointCalc.netBalance,
      grossInterestAccumulated: pointCalc.grossInterest,
      netInterestAccumulated: pointCalc.netInterest,
    });
  }

  const finalCalc = computeNetAtHorizon(investedTotal, grossBalanceWithoutFee, custodyFeeTotal, durationDays);
  const effectiveTaxDragRatio =
    finalCalc.grossInterest > 0 ? finalCalc.netInterest / finalCalc.grossInterest : 1 - finalCalc.irRate;
  const netAnnualRatePct =
    grossAnnualRatePct > 0
      ? Math.max(0, (grossAnnualRatePct - custodyFeePct) * effectiveTaxDragRatio)
      : 0;
  const netMonthlyRatePct =
    netAnnualRatePct > 0 ? (Math.pow(1 + netAnnualRatePct / 100, 1 / 12) - 1) * 100 : 0;

  const hypotheses = [
    `Taxa bruta considerada: ${grossAnnualRatePct.toFixed(2)}% ao ano (${(grossMonthlyRate * 100).toFixed(3)}% ao mês em juros compostos).`,
    yieldType === 'poupanca'
      ? `Poupança calculada pela regra oficial (${indicators.selicAnnualPct > 8.5 ? 'Selic > 8,5% a.a.: 0,5% a.m. + TR' : 'Selic <= 8,5% a.a.: 70% da Selic + TR'}), isenta de IR e IOF para pessoa física.`
      : `Tributação regressiva para ${durationDays} dias: IR de ${(finalCalc.irRate * 100).toFixed(1).replace('.', ',')}% sobre os rendimentos e IOF isento após 30 dias.`,
    custodyFeePct > 0
      ? `Custo/taxa de custódia considerado: ${custodyFeePct.toFixed(2)}% a.a. (descontado proporcionalmente).`
      : 'Sem taxa administrativa ou custódia configurada.',
  ];

  return {
    yieldType,
    yieldLabel: getYieldTypeLabel(yieldType),
    durationDays,
    termMonths,
    totalInvested: investedTotal,
    grossAnnualRatePct,
    grossMonthlyRatePct: grossMonthlyRate * 100,
    netAnnualRatePct,
    netMonthlyRatePct,
    grossInterest: finalCalc.grossInterest,
    grossBalance: grossBalanceWithoutFee,
    irRate: finalCalc.irRate,
    irTax: finalCalc.irTax,
    iofRate: finalCalc.iofRate,
    iofTax: finalCalc.iofTax,
    custodyFeeTotal,
    netInterest: finalCalc.netInterest,
    netBalance: finalCalc.netBalance,
    timeline,
    hypotheses,
    disclaimer:
      'Estimativa baseada em juros compostos, indicadores informados e alíquotas atuais. Rentabilidade passada ou projetada não é garantia de retorno futuro.',
  };
}

export function compareInvestmentModalities(params: {
  initialAmount: number;
  monthlyContribution: number;
  extraOneTimeAmount?: number;
  extraOneTimeMonth?: number;
  periodMode?: 'months' | 'days';
  termMonths: number;
  durationDays?: number;
  cdiIndicatorPct?: number;
  selicIndicatorPct?: number;
  selicCustodyFeePct?: number;
  customAnnualRatePct?: number;
  includeCustom?: boolean;
  indicators?: BenchmarkIndicators;
}): InvestmentModalityComparisonRow[] {
  const ind = params.indicators ?? DEFAULT_BENCHMARK_INDICATORS;
  const cdiPct = params.cdiIndicatorPct ?? 100;
  const selicPct = params.selicIndicatorPct ?? 100;
  const selicFee = params.selicCustodyFeePct ?? 0.2;

  const baseSpecs: Array<{
    yieldType: InvestmentYieldType;
    label: string;
    indicatorSummary: string;
    yieldIndicatorPct: number;
    custodyFeePct: number;
    customAnnualRatePct?: number;
    irExempt: boolean;
  }> = [
    {
      yieldType: 'cdi',
      label: `CDI (${cdiPct}%)`,
      indicatorSummary: `${cdiPct}% de ${ind.cdiAnnualPct.toFixed(2)}% a.a.`,
      yieldIndicatorPct: cdiPct,
      custodyFeePct: 0,
      irExempt: false,
    },
    {
      yieldType: 'poupanca',
      label: 'Poupança',
      indicatorSummary: `${ind.poupancaAnnualPct.toFixed(2)}% a.a. (isenta de IR)`,
      yieldIndicatorPct: 100,
      custodyFeePct: 0,
      irExempt: true,
    },
    {
      yieldType: 'selic',
      label: `Tesouro Selic (${selicPct}%)`,
      indicatorSummary: `${selicPct}% Selic (${ind.selicAnnualPct.toFixed(2)}% a.a.) − ${selicFee.toFixed(2)}% custódia`,
      yieldIndicatorPct: selicPct,
      custodyFeePct: selicFee,
      irExempt: false,
    },
  ];

  if (params.includeCustom && (params.customAnnualRatePct ?? 0) > 0) {
    baseSpecs.push({
      yieldType: 'personalizado',
      label: 'Personalizado',
      indicatorSummary: `${Number(params.customAnnualRatePct).toFixed(2)}% a.a.`,
      yieldIndicatorPct: 100,
      custodyFeePct: 0,
      customAnnualRatePct: params.customAnnualRatePct,
      irExempt: false,
    });
  }

  return baseSpecs.map((spec) => {
    const sim = simulateInvestmentGrowth({
      initialAmount: params.initialAmount,
      monthlyContribution: params.monthlyContribution,
      extraOneTimeAmount: params.extraOneTimeAmount,
      extraOneTimeMonth: params.extraOneTimeMonth,
      periodMode: params.periodMode,
      termMonths: params.termMonths,
      durationDays: params.durationDays,
      yieldType: spec.yieldType,
      yieldIndicatorPct: spec.yieldIndicatorPct,
      customAnnualRatePct: spec.customAnnualRatePct,
      custodyFeePct: spec.custodyFeePct,
      indicators: ind,
    });
    return {
      yieldType: spec.yieldType,
      label: spec.label,
      indicatorSummary: spec.indicatorSummary,
      grossAnnualRatePct: sim.grossAnnualRatePct,
      netAnnualRatePct: sim.netAnnualRatePct,
      totalInvested: sim.totalInvested,
      grossBalance: sim.grossBalance,
      grossInterest: sim.grossInterest,
      taxesAndFees: sim.irTax + sim.iofTax + sim.custodyFeeTotal,
      netInterest: sim.netInterest,
      netBalance: sim.netBalance,
      irExempt: spec.irExempt,
    };
  });
}

export interface GoalProjection {
  progressPct: number;
  monthlyRate: number;
  effectiveAnnualYieldRate: number;
  balanceIn12Months: number;
  estimated12MonthYield: number;
  termMonths: number;
  termGrossBalance: number;
  termNetBalance: number;
  termGrossYield: number;
  termNetYield: number;
  termEstimatedTaxes: number;
  monthsToGoal: number | null;
  completionMonthKey: string | null;
}

export function computeGoalProjection(
  goal: Goal,
  refMonthKey = getCurrentMonthKey(),
  indicators: BenchmarkIndicators = DEFAULT_BENCHMARK_INDICATORS
): GoalProjection {
  const { targetAmount, currentAmount, monthlyContribution } = goal;
  const resolvedAnnualPct =
    goal.yieldType && goal.yieldType !== 'personalizado'
      ? resolveInvestmentAnnualRatePct({
          yieldType: goal.yieldType,
          yieldIndicatorPct: goal.yieldIndicatorPct ?? 100,
          indicators,
        })
      : goal.annualYieldRate * 100;
  const effectiveAnnualYieldRate = Math.max(0, resolvedAnnualPct / 100);
  const progressPct = targetAmount > 0 ? Math.min(100, (currentAmount / targetAmount) * 100) : 0;
  const monthlyRate = effectiveAnnualYieldRate > 0 ? Math.pow(1 + effectiveAnnualYieldRate, 1 / 12) - 1 : 0;

  let balanceIn12Months = currentAmount + monthlyContribution * 12;
  if (monthlyRate > 0) {
    const factor = Math.pow(1 + monthlyRate, 12);
    balanceIn12Months = currentAmount * factor + monthlyContribution * ((factor - 1) / monthlyRate);
  }
  const estimated12MonthYield = balanceIn12Months - currentAmount - 12 * monthlyContribution;

  const termMonths = Math.max(1, Math.min(600, Math.round(goal.termMonths ?? 12)));
  const termSim = simulateInvestmentGrowth({
    initialAmount: currentAmount,
    monthlyContribution,
    termMonths,
    yieldType: goal.yieldType ?? 'personalizado',
    yieldIndicatorPct: goal.yieldIndicatorPct ?? 100,
    customAnnualRatePct: effectiveAnnualYieldRate * 100,
    custodyFeePct: goal.custodyFeePct ?? 0,
    indicators,
  });

  let monthsToGoal: number | null = null;
  if (currentAmount >= targetAmount) {
    monthsToGoal = 0;
  } else if (monthlyRate === 0) {
    monthsToGoal = monthlyContribution > 0 ? Math.ceil((targetAmount - currentAmount) / monthlyContribution) : null;
  } else {
    const numerator = monthlyContribution + targetAmount * monthlyRate;
    const denominator = monthlyContribution + currentAmount * monthlyRate;
    if (denominator > 0 && numerator / denominator > 0) {
      monthsToGoal = Math.ceil(Math.log(numerator / denominator) / Math.log(1 + monthlyRate));
    }
  }

  const completionMonthKey = monthsToGoal !== null ? addMonthsToKey(refMonthKey, monthsToGoal) : null;

  return {
    progressPct,
    monthlyRate,
    effectiveAnnualYieldRate,
    balanceIn12Months,
    estimated12MonthYield,
    termMonths,
    termGrossBalance: termSim.grossBalance,
    termNetBalance: termSim.netBalance,
    termGrossYield: termSim.grossInterest,
    termNetYield: termSim.netInterest,
    termEstimatedTaxes: termSim.irTax + termSim.iofTax + termSim.custodyFeeTotal,
    monthsToGoal,
    completionMonthKey,
  };
}

// ============================================================================
// COMPRAS PLANEJADAS E PROJETOS
// ============================================================================
export type PriceComparison = 'Pendente' | 'Abaixo do planejado' | 'No planejado' | 'Acima do planejado';

export interface PlannedPurchaseMetrics {
  totalEstimated: number;
  totalPaid: number | null;
  difference: number | null;
  comparison: PriceComparison;
  effectiveTargetTotal: number;
  effectiveSavedAmount: number;
  remainingAmount: number;
  completionPct: number;
  plannedMonthlyContribution: number;
  monthsToDeadline: number | null;
  recommendedMonthlyContribution: number | null;
  projectedMonthsAtPlannedPace: number | null;
  projectedCompletionMonthKey: string | null;
  isOnTrackForDeadline: boolean | null;
}

export function computePlannedPurchaseMetrics(
  item: PlannedPurchase,
  options?: { linkedGoal?: Goal; todayISO?: string; overrideMonthlyContribution?: number }
): PlannedPurchaseMetrics {
  const totalEstimated = item.quantity * item.estimatedUnitPrice;
  const totalPaid = item.hasActualPrice ? item.quantity * item.actualUnitPrice : null;
  const difference = totalPaid !== null ? totalEstimated - totalPaid : null;
  let comparison: PriceComparison = 'Pendente';
  if (totalPaid !== null) {
    if (difference !== null && difference > 0.005) comparison = 'Abaixo do planejado';
    else if (difference !== null && difference < -0.005) comparison = 'Acima do planejado';
    else comparison = 'No planejado';
  }

  const todayISO = (options?.todayISO ?? getTodayISO()).slice(0, 10);
  const todayMonthKey = todayISO.slice(0, 7);
  const effectiveTargetTotal = totalPaid !== null && totalPaid > 0 ? totalPaid : totalEstimated;
  const effectiveSavedAmount = options?.linkedGoal
    ? Math.max(0, options.linkedGoal.currentAmount)
    : Math.max(0, item.savedAmount ?? 0);
  const remainingAmount =
    item.status === 'Comprado' || item.status === 'Cancelado'
      ? 0
      : Math.max(0, effectiveTargetTotal - effectiveSavedAmount);
  const completionPct =
    item.status === 'Comprado'
      ? 100
      : effectiveTargetTotal > 0
        ? Math.min(100, (effectiveSavedAmount / effectiveTargetTotal) * 100)
        : 0;

  const plannedMonthlyContribution = Math.max(
    0,
    options?.overrideMonthlyContribution !== undefined
      ? options.overrideMonthlyContribution
      : (item.monthlyContribution ?? 0)
  );

  let monthsToDeadline: number | null = null;
  if (item.targetDate && item.targetDate.length >= 7) {
    const targetMk = item.targetDate.slice(0, 7);
    const diff = monthDiff(todayMonthKey, targetMk);
    monthsToDeadline = Math.max(1, diff);
  }

  const recommendedMonthlyContribution =
    remainingAmount > 0 && monthsToDeadline !== null && monthsToDeadline > 0
      ? remainingAmount / monthsToDeadline
      : remainingAmount === 0
        ? 0
        : null;

  const projectedMonthsAtPlannedPace =
    item.status === 'Comprado' || remainingAmount <= 0
      ? 0
      : plannedMonthlyContribution > 0
        ? Math.ceil(remainingAmount / plannedMonthlyContribution)
        : null;

  const projectedCompletionMonthKey =
    projectedMonthsAtPlannedPace !== null ? addMonthsToKey(todayMonthKey, projectedMonthsAtPlannedPace) : null;

  const isOnTrackForDeadline =
    monthsToDeadline !== null && projectedMonthsAtPlannedPace !== null
      ? projectedMonthsAtPlannedPace <= monthsToDeadline
      : null;

  return {
    totalEstimated,
    totalPaid,
    difference,
    comparison,
    effectiveTargetTotal,
    effectiveSavedAmount,
    remainingAmount,
    completionPct,
    plannedMonthlyContribution,
    monthsToDeadline,
    recommendedMonthlyContribution,
    projectedMonthsAtPlannedPace,
    projectedCompletionMonthKey,
    isOnTrackForDeadline,
  };
}

export interface ProjectsPortfolioSummary {
  totalPatrimony: number;
  totalProjectsBudget: number;
  totalSavedForProjects: number;
  totalRemainingForProjects: number;
  committedPatrimonyPct: number;
  totalMonthlyContributions: number;
  activeProjectsCount: number;
  completedProjectsCount: number;
}

export function computeProjectsPortfolioSummary(params: {
  plannedPurchases: PlannedPurchase[];
  goals: Goal[];
  bankAccounts: BankAccount[];
  todayISO?: string;
}): ProjectsPortfolioSummary {
  const { plannedPurchases, goals, bankAccounts, todayISO } = params;
  const activeAccountsTotal = bankAccounts
    .filter((a) => a.active)
    .reduce((s, a) => s + a.balance, 0);
  const goalsTotal = goals.reduce((s, g) => s + g.currentAmount, 0);
  // Patrimônio total consolida apenas contas ativas + caixinhas (sem dupla contagem com savedAmount dos projetos)
  const totalPatrimony = Math.max(0, activeAccountsTotal + goalsTotal);

  const goalsById = new Map(goals.map((g) => [g.id, g]));
  let totalProjectsBudget = 0;
  let totalSavedForProjects = 0;
  let totalRemainingForProjects = 0;
  let totalMonthlyContributions = 0;
  let activeProjectsCount = 0;
  let completedProjectsCount = 0;
  const countedGoalIds = new Set<string>();

  for (const item of plannedPurchases) {
    if (item.status === 'Cancelado') continue;
    const linkedGoal = item.linkedGoalId ? goalsById.get(item.linkedGoalId) : undefined;
    const metrics = computePlannedPurchaseMetrics(item, { linkedGoal, todayISO });
    if (item.status === 'Comprado') {
      completedProjectsCount++;
      continue;
    }
    activeProjectsCount++;
    totalProjectsBudget += metrics.effectiveTargetTotal;
    totalRemainingForProjects += metrics.remainingAmount;
    totalMonthlyContributions += metrics.plannedMonthlyContribution;
    if (linkedGoal) {
      if (!countedGoalIds.has(linkedGoal.id)) {
        countedGoalIds.add(linkedGoal.id);
        totalSavedForProjects += Math.min(metrics.effectiveTargetTotal, linkedGoal.currentAmount);
      }
    } else {
      totalSavedForProjects += Math.min(metrics.effectiveTargetTotal, metrics.effectiveSavedAmount);
    }
  }

  const committedPatrimonyPct =
    totalPatrimony > 0 ? Math.min(100, (totalSavedForProjects / totalPatrimony) * 100) : 0;

  return {
    totalPatrimony,
    totalProjectsBudget,
    totalSavedForProjects,
    totalRemainingForProjects,
    committedPatrimonyPct,
    totalMonthlyContributions,
    activeProjectsCount,
    completedProjectsCount,
  };
}

// ============================================================================
// PAINEL MENSAL (regras exatas do script Python + ganhos/despesas fixas)
// ============================================================================
export interface MonthlyPanelRow {
  monthKey: string;
  label: string;
  recurringIncome: number;
  negativeBalanceDiscount: number;
  extraEntries: number;
  totalEntries: number;
  cardInvoicesTotal: number;
  launchedExpenses: number;
  recurringExpenses: number;
  installmentsTotal: number;
  totalExpenses: number;
  savingsTotal: number;
  monthlySurplus: number;
  cumulativeBalance: number;
  dailyExpenses: number;
  committedPct: number;
  hasPastMonthImpact: boolean;
  pastMonthInvoiceImpact: number;
  pastMonthCarryoverDebt: number;
  pastMonthImpactReasons: string[];
}

export function computeMonthlyPanel(
  monthKeys: string[],
  incomes: Income[],
  transactions: Transaction[],
  installments: Installment[],
  recurringItems: RecurringItem[] = [],
  bankAccounts: BankAccount[] = [],
  todayISO?: string,
  cards: CreditCard[] = []
): MonthlyPanelRow[] {
  let cumulativeBalance = 0;
  const activeCards = cards.filter((c) => c.active);
  const incomeOffsets = computeNegativeBalanceIncomeOffsets({
    bankAccounts,
    incomes,
    recurringItems,
    transactions,
    todayISO,
  });

  const isTxOnActiveCard = (tx: Transaction) =>
    activeCards.length > 0 &&
    tx.paymentMethod === 'Crédito' &&
    activeCards.some((c) => matchesCard(c, tx.cardId, tx.accountOrCard));

  const isRecOnActiveCard = (item: RecurringItem) =>
    activeCards.length > 0 &&
    item.paymentMethod === 'Crédito' &&
    activeCards.some((c) => matchesCard(c, item.cardId, item.accountOrCard));

  const isInstOnActiveCard = (inst: Installment) =>
    activeCards.length > 0 &&
    activeCards.some((c) => matchesCard(c, inst.cardId, inst.cardName));

  return monthKeys.map((monthKey) => {
    const baseIncomes = getMonthlyCoupleIncome(incomes, monthKey);
    const recurringFixedEntries = recurringItems
      .filter((item) => item.type === 'Entrada')
      .reduce((s, item) => s + getRecurringItemAmountInMonth(item, monthKey, transactions), 0);

    const grossRecurringIncome = baseIncomes + recurringFixedEntries;
    const rawDiscount = incomeOffsets.deductionsByMonth[monthKey] ?? 0;
    const negativeBalanceDiscount = Math.min(grossRecurringIncome, rawDiscount);
    const recurringIncome = Math.max(0, grossRecurringIncome - negativeBalanceDiscount);

    const monthTxs = transactions.filter((tx) => tx.monthKey === monthKey);

    const extraEntries = monthTxs
      .filter((tx) => tx.type === 'Entrada' && tx.entryKind !== 'estorno')
      .reduce((s, tx) => s + tx.actualAmount, 0);

    const totalEntries = recurringIncome + extraEntries;

    const cardInvoiceSummaries =
      activeCards.length > 0
        ? activeCards.map((c) => getCardInvoiceInMonth(c, monthKey, transactions, installments, recurringItems, todayISO))
        : [];
    const cardInvoicesTotal = cardInvoiceSummaries.reduce((s, inv) => s + inv.total, 0);
    const cardCreditPurchasesTotal = cardInvoiceSummaries.reduce((s, inv) => s + inv.creditPurchasesTotal, 0);
    const cardRecurringTotal = cardInvoiceSummaries.reduce((s, inv) => s + inv.recurringTotal, 0);
    const cardInstallmentsTotal = cardInvoiceSummaries.reduce((s, inv) => s + inv.installmentsTotal, 0);

    const nonCardLaunchedExpenses = monthTxs
      .filter(
        (tx) =>
          tx.type === 'Saída' &&
          tx.entryKind !== 'estorno' &&
          !tx.recurringId?.startsWith('card-invoice-') &&
          !isTxOnActiveCard(tx)
      )
      .reduce((s, tx) => s + tx.actualAmount, 0);

    const nonCardRecurringExpenses = recurringItems
      .filter((item) => item.type === 'Saída' && !isRecOnActiveCard(item))
      .reduce((s, item) => s + getRecurringItemAmountInMonth(item, monthKey, transactions), 0);

    const nonCardInstallmentsTotal = installments
      .filter((inst) => !isInstOnActiveCard(inst))
      .reduce((s, inst) => s + getInstallmentAmountInMonth(inst, monthKey), 0);

    // Detecta impacto financeiro vindo de meses anteriores (compras no cartão pós-fechamento, parcelas antigas, saldo negativo anterior)
    let pastClosedPurchasesTotal = 0;
    let pastRecurringCardTotal = 0;
    for (const inv of cardInvoiceSummaries) {
      for (const tx of inv.matchingTransactions) {
        if (tx.monthKey < monthKey) {
          pastClosedPurchasesTotal += tx.actualAmount;
        }
      }
      for (const rec of inv.matchingRecurring) {
        if (rec.occurrenceMonthKey < monthKey) {
          pastRecurringCardTotal += rec.monthAmount;
        }
      }
    }

    let pastInstallmentsTotal = 0;
    for (const inst of installments) {
      const firstMonth = inst.firstChargeDate.slice(0, 7);
      if (firstMonth < monthKey) {
        pastInstallmentsTotal += getInstallmentAmountInMonth(inst, monthKey);
      }
    }

    const pastMonthInvoiceImpact = pastClosedPurchasesTotal + pastRecurringCardTotal + pastInstallmentsTotal;
    const pastMonthCarryoverDebt = negativeBalanceDiscount;
    const pastMonthImpactReasons: string[] = [];
    if (pastClosedPurchasesTotal > 0.005) {
      pastMonthImpactReasons.push(`Fatura de compras de mês anterior: ${formatBRL(pastClosedPurchasesTotal)}`);
    }
    if (pastInstallmentsTotal > 0.005) {
      pastMonthImpactReasons.push(`Parcelas de meses passados: ${formatBRL(pastInstallmentsTotal)}`);
    }
    if (pastRecurringCardTotal > 0.005) {
      pastMonthImpactReasons.push(`Fixos no cartão do mês anterior: ${formatBRL(pastRecurringCardTotal)}`);
    }
    if (pastMonthCarryoverDebt > 0.005) {
      pastMonthImpactReasons.push(`Abate de saldo negativo anterior: ${formatBRL(pastMonthCarryoverDebt)}`);
    }
    const hasPastMonthImpact = pastMonthInvoiceImpact > 0.005 || pastMonthCarryoverDebt > 0.005;

    const launchedExpenses = nonCardLaunchedExpenses + cardCreditPurchasesTotal;
    const recurringExpenses = nonCardRecurringExpenses + cardRecurringTotal;
    const installmentsTotal = nonCardInstallmentsTotal + cardInstallmentsTotal;

    const totalExpenses = launchedExpenses + recurringExpenses + installmentsTotal;

    const savingsTotal = monthTxs
      .filter((tx) => tx.type === 'Economia')
      .reduce((s, tx) => s + tx.actualAmount, 0);

    const monthlySurplus = totalEntries - totalExpenses - savingsTotal;
    cumulativeBalance += monthlySurplus;

    const dailyExpenses =
      monthTxs
        .filter((tx) => tx.type === 'Saída' && tx.category === 'Diárias')
        .reduce((s, tx) => s + tx.actualAmount, 0) +
      recurringItems
        .filter((item) => item.type === 'Saída' && item.category === 'Diárias')
        .reduce((s, item) => s + getRecurringItemAmountInMonth(item, monthKey, transactions), 0);

    const committedPct = totalEntries > 0 ? totalExpenses / totalEntries : 0;

    return {
      monthKey,
      label: formatMonthShort(monthKey),
      recurringIncome,
      negativeBalanceDiscount,
      extraEntries,
      totalEntries,
      cardInvoicesTotal,
      launchedExpenses,
      recurringExpenses,
      installmentsTotal,
      totalExpenses,
      savingsTotal,
      monthlySurplus,
      cumulativeBalance,
      dailyExpenses,
      committedPct,
      hasPastMonthImpact,
      pastMonthInvoiceImpact,
      pastMonthCarryoverDebt,
      pastMonthImpactReasons,
    };
  });
}

// ============================================================================
// CENÁRIOS FINANCEIROS (regras exatas do script Python)
// ============================================================================
export interface ScenarioProjectionMonth {
  monthKey: string;
  label: string;
  todayIncome: number;
  todayExpense: number;
  todayCumulativeBalance: number;
  scenarioIncome: number;
  scenarioExpense: number;
  scenarioCumulativeBalance: number;
}

export function computeScenarioAnalysis(params: {
  panelRows: MonthlyPanelRow[];
  incomes: Income[];
  recurringItems?: RecurringItem[];
  goals: Goal[];
  expenseChangePct: number;
  incomeChangePct: number;
  mode: ScenarioMode;
  useCustomBaseExpense: boolean;
  customBaseExpense: number;
  refMonthKey?: string;
}) {
  const refMonthKey = params.refMonthKey ?? getCurrentMonthKey();
  const monthsWithSpend = params.panelRows.filter(
    (r) => r.launchedExpenses > 0 || r.recurringExpenses > 0 || r.installmentsTotal > 0
  );
  const autoBaseExpense =
    monthsWithSpend.length > 0
      ? monthsWithSpend.reduce((s, r) => s + r.totalExpenses, 0) / monthsWithSpend.length
      : 0;

  const baseExpense = params.useCustomBaseExpense ? params.customBaseExpense : autoBaseExpense;
  const fixedRecurringIncome = (params.recurringItems ?? [])
    .filter((item) => item.type === 'Entrada')
    .reduce((s, item) => s + getRecurringItemAmountInMonth(item, refMonthKey, [], true), 0);
  const baseIncome = getMonthlyCoupleIncome(params.incomes, refMonthKey) + fixedRecurringIncome;
  const currentReserve = params.goals.reduce((s, g) => s + g.currentAmount, 0);

  const todayIncome = baseIncome;
  const todayExpense = baseExpense;
  const todaySurplus = todayIncome - todayExpense;
  const todayCommittedPct = todayIncome > 0 ? todayExpense / todayIncome : 0;

  const scenarioIncome = baseIncome * (1 + params.incomeChangePct);
  const scenarioExpense = baseExpense * (1 + params.expenseChangePct);
  const scenarioSurplus = scenarioIncome - scenarioExpense;
  const scenarioCommittedPct = scenarioIncome > 0 ? scenarioExpense / scenarioIncome : 0;

  let prevToday = currentReserve;
  let prevScenario = currentReserve;

  const projection: ScenarioProjectionMonth[] = Array.from({ length: 12 }, (_, idx) => {
    const m = idx + 1;
    const monthKey = addMonthsToKey(refMonthKey, m);
    const factor = params.mode === 'De uma vez' ? 1 : m / 12;
    const scInc = baseIncome * (1 + params.incomeChangePct * factor);
    const scExp = baseExpense * (1 + params.expenseChangePct * factor);

    prevToday = prevToday + (todayIncome - todayExpense);
    prevScenario = prevScenario + (scInc - scExp);

    return {
      monthKey,
      label: formatMonthShort(monthKey),
      todayIncome,
      todayExpense,
      todayCumulativeBalance: prevToday,
      scenarioIncome: scInc,
      scenarioExpense: scExp,
      scenarioCumulativeBalance: prevScenario,
    };
  });

  const lastMonth = projection[projection.length - 1];
  const today12mSurplus = (lastMonth?.todayCumulativeBalance ?? currentReserve) - currentReserve;
  const scenario12mSurplus = (lastMonth?.scenarioCumulativeBalance ?? currentReserve) - currentReserve;

  const todayFinal12m = lastMonth?.todayCumulativeBalance ?? currentReserve;
  const scenarioFinal12m = lastMonth?.scenarioCumulativeBalance ?? currentReserve;

  const todayReserveDuration = todaySurplus < 0 ? currentReserve / -todaySurplus : null;
  const scenarioReserveDuration = scenarioSurplus < 0 ? currentReserve / -scenarioSurplus : null;

  let verdict: { level: 'neutral' | 'danger' | 'warning' | 'ok'; text: string };
  if (baseIncome === 0) {
    verdict = { level: 'neutral', text: 'Cadastre as rendas ou ganhos fixos para ver o impacto completo na sobra mensal.' };
  } else if (scenarioSurplus < 0) {
    verdict = {
      level: 'danger',
      text: 'ATENÇÃO: neste cenário os gastos superam a renda — a reserva financeira começa a ser consumida.',
    };
  } else if (todaySurplus > 0 && scenarioSurplus < todaySurplus * 0.5) {
    verdict = {
      level: 'warning',
      text: 'CUIDADO: a sobra mensal cai mais da metade, mas ainda permanece positiva.',
    };
  } else {
    verdict = {
      level: 'ok',
      text: 'OK: o cenário simulado cabe no seu orçamento com folga.',
    };
  }

  return {
    autoBaseExpense,
    baseIncome,
    baseExpense,
    currentReserve,
    todayIncome,
    todayExpense,
    todaySurplus,
    todayCommittedPct,
    today12mSurplus,
    todayFinal12m,
    todayReserveDuration,
    scenarioIncome,
    scenarioExpense,
    scenarioSurplus,
    scenarioCommittedPct,
    scenario12mSurplus,
    scenarioFinal12m,
    scenarioReserveDuration,
    projection,
    verdict,
  };
}

// ============================================================================
// HORIZONTE DE GASTOS (DE DEZ/2026 ATÉ O INFINITO + SIMULAÇÃO DE COMPRAS)
// ============================================================================
export interface HorizonMonthRow extends MonthlyPanelRow {
  simulatedPurchaseImpact: number;
  simulatedExpenses: number;
  simulatedSurplus: number;
  simulatedCumulativeBalance: number;
  simulatedCommittedPct: number;
}

export function getSimulatedPurchaseAmountInMonth(
  item: SimulatedPurchase,
  monthKey: string,
  cards: CreditCard[] = []
): number {
  if (!item.enabled || item.totalAmount <= 0) return 0;
  let effectiveStart = item.startMonthKey;

  if (item.cardId && item.mode !== 'fixo') {
    const card = cards.find((c) => c.id === item.cardId);
    if (card && item.purchaseDay >= card.closingDay) {
      effectiveStart = addMonthsToKey(item.startMonthKey, 1);
    }
  }

  if (monthKey < effectiveStart) return 0;

  if (item.mode === 'avista') {
    return monthKey === effectiveStart ? item.totalAmount : 0;
  }

  if (item.mode === 'parcelado') {
    const count = Math.max(1, Math.round(item.installmentsCount || 1));
    const diff = monthDiff(effectiveStart, monthKey);
    if (diff >= 0 && diff < count) {
      return item.totalAmount / count;
    }
    return 0;
  }

  // 'fixo' (recorrente mensal contínuo ou até endMonthKey)
  if (item.endMonthKey && monthKey > item.endMonthKey) return 0;
  return item.totalAmount;
}

export function computeSpendingHorizon(params: {
  monthKeys: string[];
  incomes: Income[];
  transactions: Transaction[];
  installments: Installment[];
  recurringItems: RecurringItem[];
  cards: CreditCard[];
  simulatedPurchases: SimulatedPurchase[];
  bankAccounts?: BankAccount[];
  todayISO?: string;
}) {
  const baseRows = computeMonthlyPanel(
    params.monthKeys,
    params.incomes,
    params.transactions,
    params.installments,
    params.recurringItems,
    params.bankAccounts ?? [],
    params.todayISO,
    params.cards
  );
  const negativeBalanceOffset = computeNegativeBalanceIncomeOffsets({
    bankAccounts: params.bankAccounts,
    incomes: params.incomes,
    recurringItems: params.recurringItems,
    transactions: params.transactions,
    todayISO: params.todayISO,
  });

  let simulatedCumulativeBalance = 0;
  const rows: HorizonMonthRow[] = baseRows.map((row) => {
    const simulatedPurchaseImpact = params.simulatedPurchases.reduce(
      (sum, sim) => sum + getSimulatedPurchaseAmountInMonth(sim, row.monthKey, params.cards),
      0
    );
    const pastSimulatedImpact = params.simulatedPurchases.reduce((sum, sim) => {
      if (!sim.enabled || sim.startMonthKey >= row.monthKey) return sum;
      if (sim.mode === 'fixo' && !sim.cardId) return sum;
      return sum + getSimulatedPurchaseAmountInMonth(sim, row.monthKey, params.cards);
    }, 0);
    const simulatedExpenses = row.totalExpenses + simulatedPurchaseImpact;
    const simulatedSurplus = row.monthlySurplus - simulatedPurchaseImpact;
    simulatedCumulativeBalance += simulatedSurplus;
    const simulatedCommittedPct = row.totalEntries > 0 ? simulatedExpenses / row.totalEntries : 0;

    const pastMonthInvoiceImpact = row.pastMonthInvoiceImpact + pastSimulatedImpact;
    const pastMonthImpactReasons =
      pastSimulatedImpact > 0.005
        ? [...row.pastMonthImpactReasons, `Fatura/parcela simulada anterior: ${formatBRL(pastSimulatedImpact)}`]
        : row.pastMonthImpactReasons;
    const hasPastMonthImpact = row.hasPastMonthImpact || pastSimulatedImpact > 0.005;

    return {
      ...row,
      hasPastMonthImpact,
      pastMonthInvoiceImpact,
      pastMonthImpactReasons,
      simulatedPurchaseImpact,
      simulatedExpenses,
      simulatedSurplus,
      simulatedCumulativeBalance,
      simulatedCommittedPct,
    };
  });

  const totalBaseEntries = rows.reduce((s, r) => s + r.totalEntries, 0);
  const totalBaseExpenses = rows.reduce((s, r) => s + r.totalExpenses, 0);
  const totalSimulatedAdded = rows.reduce((s, r) => s + r.simulatedPurchaseImpact, 0);
  const totalSimulatedExpenses = totalBaseExpenses + totalSimulatedAdded;
  const totalSimulatedSurplus = rows.reduce((s, r) => s + r.simulatedSurplus, 0);

  let peakExpenseRow: HorizonMonthRow | null = null;
  let lowestSurplusRow: HorizonMonthRow | null = null;
  let firstNegativeRow: HorizonMonthRow | null = null;

  for (const r of rows) {
    if (!peakExpenseRow || r.simulatedExpenses > peakExpenseRow.simulatedExpenses) {
      peakExpenseRow = r;
    }
    if (!lowestSurplusRow || r.simulatedSurplus < lowestSurplusRow.simulatedSurplus) {
      lowestSurplusRow = r;
    }
    if (!firstNegativeRow && r.simulatedSurplus < 0) {
      firstNegativeRow = r;
    }
  }

  // Último mês com parcela existente ou simulada ativa
  let lastInstallmentMonth: string | null = null;
  for (const inst of params.installments) {
    const lastMk = addMonthsToKey(inst.firstChargeDate.slice(0, 7), Math.max(1, inst.installmentsCount) - 1);
    if (!lastInstallmentMonth || lastMk > lastInstallmentMonth) {
      lastInstallmentMonth = lastMk;
    }
  }
  for (const sim of params.simulatedPurchases) {
    if (!sim.enabled) continue;
    if (sim.mode === 'parcelado') {
      const card = params.cards.find((c) => c.id === sim.cardId);
      const effStart =
        card && sim.purchaseDay >= card.closingDay ? addMonthsToKey(sim.startMonthKey, 1) : sim.startMonthKey;
      const lastMk = addMonthsToKey(effStart, Math.max(1, sim.installmentsCount) - 1);
      if (!lastInstallmentMonth || lastMk > lastInstallmentMonth) {
        lastInstallmentMonth = lastMk;
      }
    }
  }

  // Equilíbrio perpétuo ("ao infinito"): rendas mensais/quinzenais/semanais contínuas menos fixos sem término
  const perpetualIncome =
    params.incomes
      .filter((i) => i.active && (i.frequency === 'Mensal' || i.frequency === 'Quinzenal' || i.frequency === 'Semanal'))
      .reduce((s, i) => s + getIncomeAmountInMonth(i, params.monthKeys[0] ?? getCurrentMonthKey()), 0) +
    params.recurringItems
      .filter((r) => r.active && r.type === 'Entrada' && !r.endMonthKey && r.frequency !== 'Anual')
      .reduce((s, r) => s + getRecurringItemRawAmountInMonth(r, '2099-01'), 0);

  const perpetualFixedExpense =
    params.recurringItems
      .filter((r) => r.active && r.type === 'Saída' && !r.endMonthKey && r.frequency !== 'Anual')
      .reduce((s, r) => s + getRecurringItemRawAmountInMonth(r, '2099-01'), 0) +
    params.simulatedPurchases
      .filter((s) => s.enabled && s.mode === 'fixo' && !s.endMonthKey)
      .reduce((s, item) => s + item.totalAmount, 0);

  const perpetualMonthlySurplus = perpetualIncome - perpetualFixedExpense;

  return {
    rows,
    summary: {
      monthsCount: rows.length,
      horizonStart: params.monthKeys[0] ?? getCurrentMonthKey(),
      horizonEnd: params.monthKeys[params.monthKeys.length - 1] ?? getCurrentMonthKey(),
      totalBaseEntries,
      totalBaseExpenses,
      totalSimulatedAdded,
      totalSimulatedExpenses,
      totalSimulatedSurplus,
      peakExpenseRow,
      lowestSurplusRow,
      firstNegativeRow,
      lastInstallmentMonth,
      perpetualIncome,
      perpetualFixedExpense,
      perpetualMonthlySurplus,
      negativeBalanceOffset,
    },
  };
}

// ============================================================================
// RESUMO DIÁRIO, SALDOS EXPLÍCITOS (BANCÁRIO / PREVISTO / COMPROMETIDO / LIVRE)
// ============================================================================
export interface BalanceBreakdown {
  monthKey: string;
  isFutureMonth: boolean;
  saldoBancario: number;
  saldoPrevisto: number;
  saldoComprometido: number;
  saldoLivre: number;
  entradasPendentes: number;
  despesasPendentesNaoCartao: number;
  fixosPendentesNaoCartao: number;
  faturasEmAbertoMes: number;
  parcelasFuturasComprometidas: number;
}

export function computeBalanceBreakdown(params: {
  monthKey: string;
  todayISO?: string;
  bankAccounts: BankAccount[];
  incomes: Income[];
  transactions: Transaction[];
  installments: Installment[];
  recurringItems: RecurringItem[];
  cards?: CreditCard[];
  expectedEntriesTotal?: number;
  expectedExpensesTotal?: number;
  realizedEntries?: number;
}): BalanceBreakdown {
  const todayISO = params.todayISO ?? getTodayISO();
  const currentMonthKey = todayISO.slice(0, 7);
  const isFutureMonth = params.monthKey > currentMonthKey;
  const activeAccounts = params.bankAccounts.filter((a) => a.active);
  const saldoBancario = activeAccounts.reduce((s, a) => s + a.balance, 0);
  const activeCards = (params.cards ?? []).filter((c) => c.active);

  const [panelRow] =
    params.expectedEntriesTotal === undefined || params.expectedExpensesTotal === undefined
      ? computeMonthlyPanel(
          [params.monthKey],
          params.incomes,
          params.transactions,
          params.installments,
          params.recurringItems,
          params.bankAccounts,
          todayISO,
          params.cards ?? []
        )
      : [undefined];

  const expectedEntriesTotal = params.expectedEntriesTotal ?? panelRow?.totalEntries ?? 0;
  const expectedExpensesTotal = params.expectedExpensesTotal ?? panelRow?.totalExpenses ?? 0;

  const monthTxs = params.transactions.filter((tx) => tx.monthKey === params.monthKey);
  const realizedEntries =
    params.realizedEntries ??
    monthTxs
      .filter((tx) => tx.type === 'Entrada' && tx.status === 'Pago')
      .reduce((s, tx) => s + tx.actualAmount, 0);
  const entradasPendentes = Math.max(0, expectedEntriesTotal - realizedEntries);

  const isTxOnActiveCard = (tx: Transaction) =>
    activeCards.length > 0 &&
    tx.paymentMethod === 'Crédito' &&
    activeCards.some((c) => matchesCard(c, tx.cardId, tx.accountOrCard));

  const isRecOnActiveCard = (item: RecurringItem) =>
    activeCards.length > 0 &&
    item.paymentMethod === 'Crédito' &&
    activeCards.some((c) => matchesCard(c, item.cardId, item.accountOrCard));

  const despesasPendentesNaoCartao = monthTxs
    .filter(
      (tx) =>
        tx.type === 'Saída' &&
        tx.status === 'Pendente' &&
        !tx.recurringId?.startsWith('card-invoice-') &&
        !isTxOnActiveCard(tx)
    )
    .reduce((s, tx) => s + tx.actualAmount, 0);

  const fixosPendentesNaoCartao = params.recurringItems
    .filter((item) => item.type === 'Saída' && !isRecOnActiveCard(item))
    .reduce((s, item) => s + getRecurringItemAmountInMonth(item, params.monthKey, params.transactions), 0);

  const faturasEmAbertoMes = activeCards.reduce((sum, card) => {
    const inv = getCardInvoiceInMonth(
      card,
      params.monthKey,
      params.transactions,
      params.installments,
      params.recurringItems,
      todayISO
    );
    return sum + inv.remainingAmount;
  }, 0);

  const saldoComprometido = despesasPendentesNaoCartao + fixosPendentesNaoCartao + faturasEmAbertoMes;
  const projectedMonthBalance = expectedEntriesTotal - expectedExpensesTotal;

  const saldoPrevisto = isFutureMonth
    ? projectedMonthBalance
    : activeAccounts.length > 0
      ? saldoBancario + entradasPendentes - saldoComprometido
      : projectedMonthBalance;

  const saldoLivre = isFutureMonth ? projectedMonthBalance : saldoBancario - saldoComprometido;

  const parcelasFuturasComprometidas = params.installments.reduce(
    (sum, inst) => sum + computeInstallmentSummary(inst, params.monthKey).remainingAmount,
    0
  );

  return {
    monthKey: params.monthKey,
    isFutureMonth,
    saldoBancario,
    saldoPrevisto,
    saldoComprometido,
    saldoLivre,
    entradasPendentes,
    despesasPendentesNaoCartao,
    fixosPendentesNaoCartao,
    faturasEmAbertoMes,
    parcelasFuturasComprometidas,
  };
}

export interface HomeRealizedAndDailyMetrics {
  totalAccountsBalance: number;
  projectedMonthBalance: number;
  heroBalance: number;
  isFutureMonth: boolean;
  activeAccountsCount: number;
  realizedEntries: number;
  expectedEntriesTotal: number;
  pendingEntries: number;
  realizedExpenses: number;
  expectedExpensesTotal: number;
  pendingExpenses: number;
  savingsTotal: number;
  monthlySurplus: number;
  daysRemainingInMonth: number;
  dailySafeSpend: number;
  dailyBudgetBase: number;
  dailyBudgetSource: 'orcamento' | 'saldo_contas' | 'zerado';
  negativeBalanceDebt: number;
  monthNegativeBalanceDiscount: number;
  nextFixedIncomeDiscount: FixedIncomeDiscountEvent | null;
  balances: BalanceBreakdown;
}

export function computeHomeRealizedAndDailyMetrics(params: {
  monthKey: string;
  todayISO?: string;
  bankAccounts: BankAccount[];
  incomes: Income[];
  transactions: Transaction[];
  installments: Installment[];
  recurringItems: RecurringItem[];
  cards?: CreditCard[];
}): HomeRealizedAndDailyMetrics {
  const todayISO = params.todayISO ?? getTodayISO();
  const currentMonthKey = todayISO.slice(0, 7);
  const isFutureMonth = params.monthKey > currentMonthKey;
  const activeAccounts = params.bankAccounts.filter((a) => a.active);
  const totalAccountsBalance = activeAccounts.reduce((s, a) => s + a.balance, 0);
  const cards = params.cards ?? [];
  const activeCards = cards.filter((c) => c.active);

  const [panelRow] = computeMonthlyPanel(
    [params.monthKey],
    params.incomes,
    params.transactions,
    params.installments,
    params.recurringItems,
    params.bankAccounts,
    todayISO,
    cards
  );

  const incomeOffsets = computeNegativeBalanceIncomeOffsets({
    bankAccounts: params.bankAccounts,
    incomes: params.incomes,
    recurringItems: params.recurringItems,
    transactions: params.transactions,
    todayISO,
  });

  const monthTxs = params.transactions.filter((tx) => tx.monthKey === params.monthKey);
  const realizedEntries = monthTxs
    .filter((tx) => tx.type === 'Entrada' && tx.status === 'Pago')
    .reduce((s, tx) => s + tx.actualAmount, 0);

  const isTxOnActiveCard = (tx: Transaction) =>
    activeCards.length > 0 &&
    tx.paymentMethod === 'Crédito' &&
    activeCards.some((c) => matchesCard(c, tx.cardId, tx.accountOrCard));

  // Saídas efetivamente liquidadas no mês (exclui compras no crédito vinculadas a faturas de cartão ativo e soma faturas efetivamente pagas no mês, evitando duplicidade)
  const paidNonCardExpenses = monthTxs
    .filter(
      (tx) =>
        tx.type === 'Saída' &&
        tx.status === 'Pago' &&
        !tx.recurringId?.startsWith('card-invoice-') &&
        !isTxOnActiveCard(tx)
    )
    .reduce((s, tx) => s + tx.actualAmount, 0);

  const paidCardInvoices = activeCards.reduce((sum, card) => {
    const inv = getCardInvoiceInMonth(
      card,
      params.monthKey,
      params.transactions,
      params.installments,
      params.recurringItems,
      todayISO
    );
    if (inv.status === 'Paga') {
      return sum + Math.max(inv.total, inv.paidAmount);
    }
    return sum + inv.paidAmount;
  }, 0);

  const realizedExpenses = paidNonCardExpenses + paidCardInvoices;

  const expectedEntriesTotal = panelRow?.totalEntries ?? 0;
  const expectedExpensesTotal = panelRow?.totalExpenses ?? 0;
  const projectedMonthBalance = expectedEntriesTotal - expectedExpensesTotal;
  const heroBalance = isFutureMonth ? projectedMonthBalance : totalAccountsBalance;
  const savingsTotal = panelRow?.savingsTotal ?? 0;
  const monthlySurplus = panelRow?.monthlySurplus ?? 0;
  const monthNegativeBalanceDiscount = panelRow?.negativeBalanceDiscount ?? 0;

  const pendingEntries = Math.max(0, expectedEntriesTotal - realizedEntries);
  const pendingExpenses = Math.max(0, expectedExpensesTotal - realizedExpenses);

  const [yStr, mStr] = params.monthKey.split('-');
  const daysInMonth = new Date(Number(yStr), Number(mStr), 0).getDate();
  const isCurrentMonth = currentMonthKey === params.monthKey;
  const currentDay = isCurrentMonth ? Number(todayISO.slice(8, 10)) || 1 : 1;
  const daysRemainingInMonth = Math.max(1, daysInMonth - currentDay + 1);

  const absorbedUpToMonth = Object.entries(incomeOffsets.deductionsByMonth)
    .filter(([mk]) => mk <= params.monthKey)
    .reduce((sum, [, val]) => sum + val, 0);
  const unabsorbedCurrentDebt = Math.max(0, incomeOffsets.negativeBalanceDebt - absorbedUpToMonth);

  let dailyBudgetBase = 0;
  let dailyBudgetSource: 'orcamento' | 'saldo_contas' | 'zerado' = 'zerado';

  if (expectedEntriesTotal > 0) {
    dailyBudgetBase = Math.max(0, monthlySurplus - unabsorbedCurrentDebt);
    dailyBudgetSource = dailyBudgetBase > 0 ? 'orcamento' : 'zerado';
  } else if (!isFutureMonth && activeAccounts.length > 0 && totalAccountsBalance > 0) {
    dailyBudgetBase = Math.max(0, totalAccountsBalance - pendingExpenses);
    dailyBudgetSource = dailyBudgetBase > 0 ? 'saldo_contas' : 'zerado';
  }

  const dailySafeSpend = daysRemainingInMonth > 0 ? dailyBudgetBase / daysRemainingInMonth : 0;

  const balances = computeBalanceBreakdown({
    monthKey: params.monthKey,
    todayISO,
    bankAccounts: params.bankAccounts,
    incomes: params.incomes,
    transactions: params.transactions,
    installments: params.installments,
    recurringItems: params.recurringItems,
    cards,
    expectedEntriesTotal,
    expectedExpensesTotal,
    realizedEntries,
  });

  return {
    totalAccountsBalance,
    projectedMonthBalance,
    heroBalance,
    isFutureMonth,
    activeAccountsCount: activeAccounts.length,
    realizedEntries,
    expectedEntriesTotal,
    pendingEntries,
    realizedExpenses,
    expectedExpensesTotal,
    pendingExpenses,
    savingsTotal,
    monthlySurplus,
    daysRemainingInMonth,
    dailySafeSpend,
    dailyBudgetBase,
    dailyBudgetSource,
    negativeBalanceDebt: incomeOffsets.negativeBalanceDebt,
    monthNegativeBalanceDiscount,
    nextFixedIncomeDiscount: incomeOffsets.firstImpactedEvent,
    balances,
  };
}

// ============================================================================
// HORIZONTE CURTO (7 DIAS E 1 MÊS / 30 DIAS — PROJEÇÃO DIA A DIA)
// ============================================================================
export interface HorizonDayRow {
  dateISO: string;
  label: string;
  weekday: string;
  entries: number;
  expenses: number;
  cardInvoicesTotal: number;
  simulatedImpact: number;
  netDay: number;
  projectedBalance: number;
  events: string[];
}

export interface ShortHorizonResult {
  daysCount: number;
  startDateISO: string;
  endDateISO: string;
  hasAccountBalances: boolean;
  startBalance: number;
  rows: HorizonDayRow[];
  summary: {
    startBalance: number;
    endBalance: number;
    totalEntries: number;
    totalExpenses: number;
    totalSimulatedImpact: number;
    lowestBalance: number;
    lowestDay: HorizonDayRow | null;
    firstNegativeDay: HorizonDayRow | null;
    negativeBalanceDebt: number;
    firstIncomeDiscount: FixedIncomeDiscountEvent | null;
  };
}

const WEEKDAY_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export interface HorizonWeekRow {
  weekIndex: number;
  label: string;
  rangeLabel: string;
  entries: number;
  expenses: number;
  cardInvoicesTotal: number;
  simulatedImpact: number;
  netWeek: number;
  projectedBalance: number;
  events: string[];
}

export function computeWeeklyRollupFromShortHorizon(shortHorizon: ShortHorizonResult): HorizonWeekRow[] {
  const weeks: HorizonWeekRow[] = [];
  for (let i = 0; i < shortHorizon.rows.length; i += 7) {
    const chunk = shortHorizon.rows.slice(i, i + 7);
    if (chunk.length === 0) continue;
    const weekIndex = weeks.length + 1;
    const entries = chunk.reduce((s, r) => s + r.entries, 0);
    const expenses = chunk.reduce((s, r) => s + r.expenses, 0);
    const cardInvoicesTotal = chunk.reduce((s, r) => s + r.cardInvoicesTotal, 0);
    const simulatedImpact = chunk.reduce((s, r) => s + r.simulatedImpact, 0);
    const netWeek = entries - expenses;
    const projectedBalance = chunk[chunk.length - 1].projectedBalance;
    const events = chunk.flatMap((r) => r.events);
    weeks.push({
      weekIndex,
      label: `Sem ${weekIndex}`,
      rangeLabel: `${chunk[0].label}–${chunk[chunk.length - 1].label}`,
      entries,
      expenses,
      cardInvoicesTotal,
      simulatedImpact,
      netWeek,
      projectedBalance,
      events,
    });
  }
  return weeks;
}

export function computeShortHorizon(params: {
  daysCount: 7 | 28 | 30 | 90;
  startDateISO?: string;
  bankAccounts: BankAccount[];
  incomes: Income[];
  transactions: Transaction[];
  installments: Installment[];
  recurringItems: RecurringItem[];
  cards: CreditCard[];
  simulatedPurchases: SimulatedPurchase[];
}): ShortHorizonResult {
  const startDateISO = params.startDateISO ?? getTodayISO();
  const activeAccounts = params.bankAccounts.filter((a) => a.active);
  const hasAccountBalances = activeAccounts.length > 0;
  const startBalance = activeAccounts.reduce((s, a) => s + a.balance, 0);
  const incomeOffsets = computeNegativeBalanceIncomeOffsets({
    bankAccounts: params.bankAccounts,
    incomes: params.incomes,
    recurringItems: params.recurringItems,
    transactions: params.transactions,
    todayISO: startDateISO,
  });

  let runningBalance = startBalance;
  const rows: HorizonDayRow[] = [];

  for (let i = 0; i < params.daysCount; i++) {
    const dateISO = addDaysISO(startDateISO, i);
    const monthKey = dateISO.slice(0, 7);
    const dayOfMonth = Number(dateISO.slice(8, 10));
    const maxDay = getDaysInYearMonth(monthKey);
    const [yy, mm, dd] = dateISO.split('-').map(Number);
    const weekday = WEEKDAY_SHORT[new Date(Date.UTC(yy, mm - 1, dd)).getUTCDay()] ?? '';
    const label = `${String(dd).padStart(2, '0')}/${String(mm).padStart(2, '0')}`;

    let entries = 0;
    let expenses = 0;
    let cardInvoicesTotal = 0;
    let simulatedImpact = 0;
    const events: string[] = [];

    // 1. Pendente concrete transactions scheduled for this date (non-credit-card; credit card flows via card invoice on dueDay)
    for (const tx of params.transactions) {
      if (tx.recurringId?.startsWith('card-invoice-')) continue;
      if (tx.entryKind === 'estorno') continue;
      const effectiveDate = (tx.dueDate && tx.dueDate.length >= 10 ? tx.dueDate : tx.date).slice(0, 10);
      if (effectiveDate !== dateISO) continue;
      if (tx.paymentMethod === 'Crédito') continue;
      // If date is today and already Pago with bank balances present, it is already reflected in startBalance
      if (tx.status === 'Pago' && (hasAccountBalances || i === 0)) continue;
      if (tx.status === 'Pendente' || (!hasAccountBalances && i > 0)) {
        if (tx.type === 'Entrada') {
          entries += tx.actualAmount;
          events.push(`+ ${tx.description}`);
        } else if (tx.type === 'Saída') {
          expenses += tx.actualAmount;
          events.push(`- ${tx.description}`);
        }
      }
    }

    // 2. Active Incomes falling on this day
    for (const inc of params.incomes) {
      if (!inc.active || inc.amount <= 0) continue;
      if (getIncomeOccurrenceDatesInMonth(inc, monthKey).includes(dateISO)) {
        entries += inc.amount;
        events.push(`+ ${inc.source}`);
      }
    }

    // 3. Active non-card recurring items falling on this day (if not already settled in this month)
    for (const rec of params.recurringItems) {
      if (!rec.active) continue;
      if (rec.paymentMethod === 'Crédito') continue;
      if (isRecurringItemSettledInMonth(rec.id, monthKey, params.transactions)) continue;

      if (getRecurringItemOccurrenceDatesInMonth(rec, monthKey).includes(dateISO)) {
        if (rec.type === 'Entrada') {
          entries += rec.amount;
          events.push(`+ ${rec.description}`);
        } else {
          expenses += rec.amount;
          events.push(`- ${rec.description}`);
        }
      }
    }

    // 4. Credit Card Invoices due on this day (considera saldo restante após pagamentos parciais/integrais)
    for (const card of params.cards) {
      if (!card.active) continue;
      const clampedDue = Math.min(maxDay, Math.max(1, card.dueDay));
      if (dayOfMonth !== clampedDue) continue;

      const inv = getCardInvoiceInMonth(
        card,
        monthKey,
        params.transactions,
        params.installments,
        params.recurringItems,
        startDateISO
      );
      const remainingDue = inv.remainingAmount;
      const simCardAmount = params.simulatedPurchases
        .filter((s) => s.enabled && s.cardId === card.id)
        .reduce((sum, s) => sum + getSimulatedPurchaseAmountInMonth(s, monthKey, params.cards), 0);

      if (remainingDue > 0.005 || simCardAmount > 0) {
        cardInvoicesTotal += remainingDue;
        expenses += remainingDue + simCardAmount;
        simulatedImpact += simCardAmount;
        events.push(
          inv.paidAmount > 0 && remainingDue > 0
            ? `Fatura ${card.name} (restante)`
            : `Fatura ${card.name}`
        );
      }
    }

    // 5. Simulated non-card purchases (or without cardId) falling on their purchaseDay
    for (const sim of params.simulatedPurchases) {
      if (!sim.enabled || sim.cardId) continue;
      const clampedDay = Math.min(maxDay, Math.max(1, sim.purchaseDay || 1));
      if (dayOfMonth !== clampedDay) continue;
      const amt = getSimulatedPurchaseAmountInMonth(sim, monthKey, params.cards);
      if (amt > 0) {
        expenses += amt;
        simulatedImpact += amt;
        events.push(`Sim: ${sim.description}`);
      }
    }

    const dayOffsets = incomeOffsets.impactedEvents.filter((ev) => ev.dateISO === dateISO);
    for (const off of dayOffsets) {
      events.push(`Abate saldo negativo (${off.title}): −${formatBRL(off.deductedAmount)}`);
    }

    const netDay = entries - expenses;
    runningBalance += netDay;

    rows.push({
      dateISO,
      label,
      weekday,
      entries,
      expenses,
      cardInvoicesTotal,
      simulatedImpact,
      netDay,
      projectedBalance: runningBalance,
      events,
    });
  }

  let lowestDay: HorizonDayRow | null = null;
  let firstNegativeDay: HorizonDayRow | null = null;
  for (const r of rows) {
    if (!lowestDay || r.projectedBalance < lowestDay.projectedBalance) lowestDay = r;
    if (!firstNegativeDay && r.projectedBalance < 0) firstNegativeDay = r;
  }

  return {
    daysCount: params.daysCount,
    startDateISO,
    endDateISO: rows[rows.length - 1]?.dateISO ?? startDateISO,
    hasAccountBalances,
    startBalance,
    rows,
    summary: {
      startBalance,
      endBalance: rows[rows.length - 1]?.projectedBalance ?? startBalance,
      totalEntries: rows.reduce((s, r) => s + r.entries, 0),
      totalExpenses: rows.reduce((s, r) => s + r.expenses, 0),
      totalSimulatedImpact: rows.reduce((s, r) => s + r.simulatedImpact, 0),
      lowestBalance: lowestDay?.projectedBalance ?? startBalance,
      lowestDay,
      firstNegativeDay,
      negativeBalanceDebt: incomeOffsets.negativeBalanceDebt,
      firstIncomeDiscount: incomeOffsets.firstImpactedEvent,
    },
  };
}

// ============================================================================
// CALCULADORA ECONÔMICA RÁPIDA (JUROS SIMPLES / COMPOSTOS E PORCENTAGEM)
// ============================================================================
export interface QuickInterestInput {
  principal: number;
  ratePct: number;
  rateUnit: 'mensal' | 'anual';
  months: number;
  regime: 'composto' | 'simples';
}

export interface QuickInterestResult {
  totalAmount: number;
  totalInterest: number;
  monthlyRatePct: number;
  increasePct: number;
  monthlyEquivalent: number;
}

export function computeQuickInterest(input: QuickInterestInput): QuickInterestResult {
  const principal = Number.isFinite(input.principal) ? Math.max(0, input.principal) : 0;
  const ratePct = Number.isFinite(input.ratePct) ? Math.max(0, input.ratePct) : 0;
  const months = Number.isFinite(input.months) ? Math.max(1, Math.round(input.months)) : 1;

  const rawRate = ratePct / 100;
  const monthlyRate =
    input.rateUnit === 'mensal'
      ? rawRate
      : input.regime === 'composto'
        ? Math.pow(1 + rawRate, 1 / 12) - 1
        : rawRate / 12;

  const totalAmount =
    input.regime === 'composto'
      ? principal * Math.pow(1 + monthlyRate, months)
      : principal * (1 + monthlyRate * months);

  const totalInterest = Math.max(0, totalAmount - principal);
  const increasePct = principal > 0 ? (totalInterest / principal) * 100 : 0;
  const monthlyEquivalent = months > 0 ? totalAmount / months : totalAmount;

  return {
    totalAmount,
    totalInterest,
    monthlyRatePct: monthlyRate * 100,
    increasePct,
    monthlyEquivalent,
  };
}

// ============================================================================
// CALENDÁRIO VISUAL E AGENDA FINANCEIRA DO MÊS
// ============================================================================
export type CalendarEventTone = 'positive' | 'negative' | 'warning' | 'neutral';

export interface CalendarDayEvent {
  id: string;
  dateISO: string;
  title: string;
  subtitle: string;
  amount: number | null;
  tone: CalendarEventTone;
  isPrimary: boolean;
  kind: 'tx' | 'income' | 'recurring' | 'card_due' | 'card_close';
  tx?: Transaction;
  recurringItem?: RecurringItem;
  route?: 'cartoes' | 'fixos' | 'renda' | 'lancamentos';
}

export interface CalendarDaySummary {
  dateISO: string;
  day: number;
  weekdayShort: string;
  tone: CalendarEventTone | null;
  entriesTotal: number;
  expensesTotal: number;
  events: CalendarDayEvent[];
}

export interface MonthCalendarData {
  monthKey: string;
  daysInMonth: number;
  leadingEmptyDays: number;
  daySummaries: Record<string, CalendarDaySummary>;
  agendaGroups: CalendarDaySummary[];
  nextMonthPreview: {
    monthKey: string;
    daysInMonth: number;
    leadingEmptyDays: number;
    dayTones: Record<number, CalendarEventTone>;
  };
}

const WEEKDAY_LOWER = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

function resolveDayTone(events: CalendarDayEvent[]): CalendarEventTone | null {
  if (events.length === 0) return null;
  const hasCardDue = events.some((e) => e.kind === 'card_due');
  const hasNegativePrimary = events.some((e) => e.isPrimary && e.tone === 'negative');
  const hasPositivePrimary = events.some((e) => e.isPrimary && e.tone === 'positive');

  if (hasNegativePrimary && !hasCardDue && !hasPositivePrimary) return 'negative';
  if (hasCardDue || (hasNegativePrimary && hasPositivePrimary)) return 'warning';
  if (hasPositivePrimary) return 'positive';
  if (events.some((e) => e.tone === 'negative')) return 'negative';
  if (events.some((e) => e.tone === 'warning')) return 'warning';
  return 'neutral';
}

function buildEventsForMonth(params: {
  monthKey: string;
  transactions: Transaction[];
  recurringItems: RecurringItem[];
  incomes: Income[];
  cards: CreditCard[];
  installments: Installment[];
}): Record<number, CalendarDayEvent[]> {
  const { monthKey, transactions, recurringItems, incomes, cards, installments } = params;
  const maxDay = getDaysInYearMonth(monthKey);
  const byDay: Record<number, CalendarDayEvent[]> = {};
  const push = (day: number, ev: CalendarDayEvent) => {
    const clamped = Math.min(maxDay, Math.max(1, Math.round(day)));
    if (!byDay[clamped]) byDay[clamped] = [];
    byDay[clamped].push(ev);
  };

  // 1. Concretes / pending transactions falling in this month
  for (const tx of transactions) {
    const effectiveDate = (tx.dueDate && tx.dueDate.length >= 10 ? tx.dueDate : tx.date).slice(0, 10);
    if (effectiveDate.slice(0, 7) !== monthKey) continue;
    const day = Number(effectiveDate.slice(8, 10)) || 1;
    const isEntry = tx.type === 'Entrada';
    const isExpense = tx.type === 'Saída';
    const isPending = tx.status === 'Pendente';

    const tone: CalendarEventTone = isEntry
      ? 'positive'
      : isExpense
        ? isPending
          ? 'negative'
          : 'neutral'
        : 'neutral';

    push(day, {
      id: `tx-${tx.id}`,
      dateISO: effectiveDate,
      title: tx.description,
      subtitle: `${tx.category} · ${tx.paymentMethod}${isPending ? ' · Pendente' : ''}`,
      amount: tx.actualAmount,
      tone,
      isPrimary: isEntry || (isExpense && isPending),
      kind: 'tx',
      tx,
      route: 'lancamentos',
    });
  }

  // 2. Active Incomes falling in this month
  for (const inc of incomes) {
    if (!inc.active || inc.amount <= 0) continue;
    const occDates = getIncomeOccurrenceDatesInMonth(inc, monthKey);
    for (const dateISO of occDates) {
      const d = Number(dateISO.slice(8, 10)) || 1;
      push(d, {
        id: `inc-${inc.id}-${d}`,
        dateISO,
        title: inc.source,
        subtitle: `Renda · ${inc.person}`,
        amount: inc.amount,
        tone: 'positive',
        isPrimary: true,
        kind: 'income',
        route: 'renda',
      });
    }
  }

  // 3. Unsettled active recurring items (non-credit-card)
  for (const rec of recurringItems) {
    if (!rec.active) continue;
    if (rec.paymentMethod === 'Crédito') continue;
    if (isRecurringItemSettledInMonth(rec.id, monthKey, transactions)) continue;

    const occDates = getRecurringItemOccurrenceDatesInMonth(rec, monthKey);
    for (const dateISO of occDates) {
      const d = Number(dateISO.slice(8, 10)) || 1;
      const isEntry = rec.type === 'Entrada';
      push(d, {
        id: `rec-${rec.id}-${d}`,
        dateISO,
        title: rec.description,
        subtitle: `${rec.category} · Fixo (${rec.frequency})`,
        amount: rec.amount,
        tone: isEntry ? 'positive' : 'negative',
        isPrimary: true,
        kind: 'recurring',
        recurringItem: rec,
        route: 'fixos',
      });
    }
  }

  // 4. Active Credit Card due dates and closing dates
  for (const card of cards) {
    if (!card.active) continue;
    const dueDay = Math.min(maxDay, Math.max(1, card.dueDay));
    const inv = getCardInvoiceInMonth(card, monthKey, transactions, installments, recurringItems);
    if (inv.total > 0) {
      push(dueDay, {
        id: `card-due-${card.id}`,
        dateISO: buildDateInMonth(monthKey, dueDay),
        title: `Fatura ${card.name}`,
        subtitle: `Vencimento dia ${dueDay} · ${card.holder}`,
        amount: inv.total,
        tone: 'warning',
        isPrimary: true,
        kind: 'card_due',
        route: 'cartoes',
      });
    }

    const closingDay = Math.min(maxDay, Math.max(1, card.closingDay));
    push(closingDay, {
      id: `card-close-${card.id}`,
      dateISO: buildDateInMonth(monthKey, closingDay),
      title: `Fechamento ${card.name}`,
      subtitle: `Melhor dia de compra após fechamento`,
      amount: null,
      tone: 'neutral',
      isPrimary: false,
      kind: 'card_close',
      route: 'cartoes',
    });
  }

  return byDay;
}

export function computeMonthCalendarData(params: {
  monthKey: string;
  transactions: Transaction[];
  recurringItems: RecurringItem[];
  incomes: Income[];
  cards: CreditCard[];
  installments: Installment[];
}): MonthCalendarData {
  const { monthKey, transactions, recurringItems, incomes, cards, installments } = params;
  const [y, m] = monthKey.split('-').map(Number);
  const daysInMonth = getDaysInYearMonth(monthKey);
  const leadingEmptyDays = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();

  const eventsByDay = buildEventsForMonth({
    monthKey,
    transactions,
    recurringItems,
    incomes,
    cards,
    installments,
  });

  const daySummaries: Record<string, CalendarDaySummary> = {};
  const agendaGroups: CalendarDaySummary[] = [];

  for (let day = 1; day <= daysInMonth; day++) {
    const dateISO = buildDateInMonth(monthKey, day);
    const weekdayIdx = new Date(Date.UTC(y, m - 1, day)).getUTCDay();
    const rawEvents = eventsByDay[day] ?? [];
    const sortedEvents = [...rawEvents].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));

    const entriesTotal = sortedEvents
      .filter((e) => e.tone === 'positive' && e.amount !== null)
      .reduce((s, e) => s + (e.amount ?? 0), 0);

    const expensesTotal = sortedEvents
      .filter((e) => (e.tone === 'negative' || e.tone === 'warning' || (e.kind === 'tx' && e.tx?.type === 'Saída')) && e.amount !== null)
      .reduce((s, e) => s + (e.amount ?? 0), 0);

    const summary: CalendarDaySummary = {
      dateISO,
      day,
      weekdayShort: WEEKDAY_LOWER[weekdayIdx] ?? '',
      tone: resolveDayTone(sortedEvents),
      entriesTotal,
      expensesTotal,
      events: sortedEvents,
    };

    daySummaries[dateISO] = summary;
    if (sortedEvents.length > 0) {
      agendaGroups.push(summary);
    }
  }

  // Next month mini preview
  const nextMonthKey = addMonthsToKey(monthKey, 1);
  const [ny, nm] = nextMonthKey.split('-').map(Number);
  const nextDaysInMonth = getDaysInYearMonth(nextMonthKey);
  const nextLeadingEmptyDays = new Date(Date.UTC(ny, nm - 1, 1)).getUTCDay();
  const nextEventsByDay = buildEventsForMonth({
    monthKey: nextMonthKey,
    transactions,
    recurringItems,
    incomes,
    cards,
    installments,
  });

  const dayTones: Record<number, CalendarEventTone> = {};
  for (let d = 1; d <= nextDaysInMonth; d++) {
    const t = resolveDayTone(nextEventsByDay[d] ?? []);
    if (t) dayTones[d] = t;
  }

  return {
    monthKey,
    daysInMonth,
    leadingEmptyDays,
    daySummaries,
    agendaGroups,
    nextMonthPreview: {
      monthKey: nextMonthKey,
      daysInMonth: nextDaysInMonth,
      leadingEmptyDays: nextLeadingEmptyDays,
      dayTones,
    },
  };
}

export function formatDeviceBalanceTimestamp(date: Date = new Date(), authorName?: string): string {
  const validDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const hh = String(validDate.getHours()).padStart(2, '0');
  const mm = String(validDate.getMinutes()).padStart(2, '0');
  const dd = String(validDate.getDate()).padStart(2, '0');
  const mo = String(validDate.getMonth() + 1).padStart(2, '0');
  const cleanAuthor = authorName?.trim();
  return cleanAuthor
    ? `Última atualização ${hh}:${mm} ${dd}/${mo} ${cleanAuthor}`
    : `Última atualização ${hh}:${mm} ${dd}/${mo}`;
}

// ============================================================================
// LEMBRETES DE PAGAMENTO (NOTIFICAÇÕES E STATUS PAGO / NÃO PAGO)
// ============================================================================
export type PaymentReminderSource = 'transaction' | 'recurring' | 'card_invoice';
export type PaymentReminderUrgency = 'overdue' | 'today' | 'soon' | 'upcoming' | 'paid';

export interface PaymentReminderItem {
  id: string;
  sourceKind: PaymentReminderSource;
  title: string;
  category: string;
  person: string;
  paymentMethod: string;
  accountOrCard: string;
  dueDate: string; // YYYY-MM-DD
  amount: number;
  status: TransactionStatus;
  urgency: PaymentReminderUrgency;
  daysDelta: number; // <0 atrasado, 0 hoje, >0 faltando dias
  tx?: Transaction;
  recurringItem?: RecurringItem;
  card?: CreditCard;
}

export interface PaymentRemindersSummary {
  totalCount: number;
  pendingCount: number;
  pendingAmount: number;
  paidCount: number;
  paidAmount: number;
  overdueCount: number;
  overdueAmount: number;
  dueTodayCount: number;
  dueTodayAmount: number;
  dueSoonCount: number;
  dueSoonAmount: number;
  urgentCount: number;
}

export interface PaymentRemindersResult {
  monthKey: string;
  todayISO: string;
  items: PaymentReminderItem[];
  alertItems: PaymentReminderItem[];
  summary: PaymentRemindersSummary;
}

function diffDaysISO(fromISO: string, toISO: string): number {
  const [fy, fm, fd] = fromISO.slice(0, 10).split('-').map(Number);
  const [ty, tm, td] = toISO.slice(0, 10).split('-').map(Number);
  const a = Date.UTC(fy, (fm || 1) - 1, fd || 1);
  const b = Date.UTC(ty, (tm || 1) - 1, td || 1);
  return Math.round((b - a) / 86400000);
}

function resolveReminderUrgency(status: TransactionStatus, dueDate: string, todayISO: string): {
  urgency: PaymentReminderUrgency;
  daysDelta: number;
} {
  const daysDelta = diffDaysISO(todayISO, dueDate);
  if (status === 'Pago') {
    return { urgency: 'paid', daysDelta };
  }
  if (daysDelta < 0) return { urgency: 'overdue', daysDelta };
  if (daysDelta === 0) return { urgency: 'today', daysDelta };
  if (daysDelta <= 3) return { urgency: 'soon', daysDelta };
  return { urgency: 'upcoming', daysDelta };
}

export function computePaymentReminders(params: {
  monthKey?: string;
  todayISO?: string;
  transactions: Transaction[];
  recurringItems: RecurringItem[];
  cards: CreditCard[];
  installments: Installment[];
}): PaymentRemindersResult {
  const todayISO = (params.todayISO ?? getTodayISO()).slice(0, 10);
  const monthKey = params.monthKey ?? todayISO.slice(0, 7);
  const recurringById = new Map(params.recurringItems.map((r) => [r.id, r]));

  const items: PaymentReminderItem[] = [];
  const coveredRecurringIds = new Set<string>();

  // 1. Saídas concretas (inclui pendentes atrasadas de meses anteriores + despesas do mês + contas fixas já lançadas)
  for (const tx of params.transactions) {
    if (tx.type !== 'Saída') continue;
    if (tx.recurringId?.startsWith('card-invoice-')) continue;
    if (tx.paymentMethod === 'Crédito') continue;

    const effectiveDate = (tx.dueDate && tx.dueDate.length >= 10 ? tx.dueDate : tx.date).slice(0, 10);
    const effectiveMonth = effectiveDate.slice(0, 7);

    const belongsToMonth =
      tx.monthKey === monthKey || tx.recurringMonthKey === monthKey || effectiveMonth === monthKey;
    const isPastPending = tx.status === 'Pendente' && effectiveMonth < monthKey;

    if (!belongsToMonth && !isPastPending) continue;

    if (tx.recurringId && tx.recurringMonthKey === monthKey) {
      coveredRecurringIds.add(tx.recurringId);
    }

    const linkedRec = tx.recurringId ? recurringById.get(tx.recurringId) : undefined;
    const { urgency, daysDelta } = resolveReminderUrgency(tx.status, effectiveDate, todayISO);

    items.push({
      id: `tx-${tx.id}`,
      sourceKind: linkedRec ? 'recurring' : 'transaction',
      title: tx.description,
      category: tx.category,
      person: tx.person,
      paymentMethod: tx.paymentMethod,
      accountOrCard: tx.accountOrCard,
      dueDate: effectiveDate,
      amount: tx.actualAmount,
      status: tx.status,
      urgency,
      daysDelta,
      tx,
      recurringItem: linkedRec,
    });
  }

  // 2. Contas Fixas de Saída ainda não concretizadas no mês
  for (const item of params.recurringItems) {
    if (!item.active || item.type !== 'Saída' || item.paymentMethod === 'Crédito') continue;
    if (coveredRecurringIds.has(item.id)) continue;
    const rawAmount = getRecurringItemRawAmountInMonth(item, monthKey);
    if (rawAmount <= 0) continue;

    const dueDate = buildDateInMonth(monthKey, item.dayOfMonth);
    const { urgency, daysDelta } = resolveReminderUrgency('Pendente', dueDate, todayISO);

    items.push({
      id: `rec-${item.id}-${monthKey}`,
      sourceKind: 'recurring',
      title: item.description,
      category: item.category,
      person: item.person,
      paymentMethod: item.paymentMethod,
      accountOrCard: item.accountOrCard,
      dueDate,
      amount: rawAmount,
      status: 'Pendente',
      urgency,
      daysDelta,
      recurringItem: item,
    });
  }

  // 3. Faturas dos Cartões de Crédito com valor em aberto no mês (considera pagamento parcial/integral e estado)
  for (const card of params.cards) {
    if (!card.active) continue;
    const inv = getCardInvoiceInMonth(
      card,
      monthKey,
      params.transactions,
      params.installments,
      params.recurringItems,
      todayISO
    );
    if (inv.total <= 0.005) continue;

    const markerTx = inv.paymentTransactions[inv.paymentTransactions.length - 1];
    const status: TransactionStatus = inv.status === 'Paga' ? 'Pago' : 'Pendente';
    const dueDate = inv.dueDateISO;
    const { urgency, daysDelta } = resolveReminderUrgency(status, dueDate, todayISO);
    const amountShown = status === 'Pago' ? inv.total : inv.remainingAmount;

    items.push({
      id: `card-${card.id}-${monthKey}`,
      sourceKind: 'card_invoice',
      title:
        inv.status === 'Parcialmente paga'
          ? `Fatura ${card.name} (Restante)`
          : `Fatura ${card.name}`,
      category: 'Cartão',
      person: card.holder,
      paymentMethod: 'Fatura cartão',
      accountOrCard: card.name,
      dueDate,
      amount: amountShown,
      status,
      urgency,
      daysDelta,
      tx: markerTx,
      card,
    });
  }

  const urgencyWeight: Record<PaymentReminderUrgency, number> = {
    overdue: 0,
    today: 1,
    soon: 2,
    upcoming: 3,
    paid: 4,
  };

  items.sort((a, b) => {
    const wDiff = urgencyWeight[a.urgency] - urgencyWeight[b.urgency];
    if (wDiff !== 0) return wDiff;
    const dDiff = a.dueDate.localeCompare(b.dueDate);
    if (dDiff !== 0) return dDiff;
    return b.amount - a.amount;
  });

  const pendingItems = items.filter((i) => i.status === 'Pendente');
  const paidItems = items.filter((i) => i.status === 'Pago');
  const overdueItems = pendingItems.filter((i) => i.urgency === 'overdue');
  const dueTodayItems = pendingItems.filter((i) => i.urgency === 'today');
  const dueSoonItems = pendingItems.filter((i) => i.urgency === 'soon');
  const alertItems = pendingItems.filter(
    (i) => i.urgency === 'overdue' || i.urgency === 'today' || i.urgency === 'soon'
  );

  return {
    monthKey,
    todayISO,
    items,
    alertItems,
    summary: {
      totalCount: items.length,
      pendingCount: pendingItems.length,
      pendingAmount: pendingItems.reduce((s, i) => s + i.amount, 0),
      paidCount: paidItems.length,
      paidAmount: paidItems.reduce((s, i) => s + i.amount, 0),
      overdueCount: overdueItems.length,
      overdueAmount: overdueItems.reduce((s, i) => s + i.amount, 0),
      dueTodayCount: dueTodayItems.length,
      dueTodayAmount: dueTodayItems.reduce((s, i) => s + i.amount, 0),
      dueSoonCount: dueSoonItems.length,
      dueSoonAmount: dueSoonItems.reduce((s, i) => s + i.amount, 0),
      urgentCount: alertItems.length,
    },
  };
}

// ============================================================================
// PROMPT 4 — MOTOR DE PROJEÇÃO FINANCEIRA E DINHEIRO LIVRE
// ============================================================================
export interface FreeMoneyDimensions {
  saldoBancarioReal: number;
  receitasRecebidas: number;
  receitasPrevistas: number;
  despesasPagas: number;
  despesasPendentes: number;
  despesasRecorrentes: number;
  faturasFuturas: number;
  parcelamentos: number;
  reservasFinanceiras: number;
  reservasPlanejadas: number;
  compromissosFuturos: number;
  dinheiroLivreProjetado: number;
}

export interface HorizonMonthOrigins {
  incomes: Array<{ title: string; person: string; dateISO: string; amount: number; adjustedByScenario?: boolean }>;
  extraEntries: Array<{ title: string; dateISO: string; amount: number }>;
  recurringExpenses: Array<{ title: string; category: string; dateISO: string; amount: number; isCard: boolean }>;
  pendingExpenses: Array<{ title: string; dateISO: string; amount: number }>;
  cardInvoices: Array<{
    cardId: string;
    cardName: string;
    dueDateISO: string;
    status: CardInvoiceStatus;
    total: number;
    paidAmount: number;
    remainingAmount: number;
  }>;
  installments: Array<{
    id: string;
    description: string;
    installmentNumber: number;
    installmentsCount: number;
    cardName: string;
    dueDateISO: string;
    amount: number;
  }>;
  reserves: Array<{ goalId: string; goalName: string; dateISO: string; amount: number }>;
  scenarioImpacts: Array<{ ruleId: string; title: string; type: HorizonScenarioType; delta: number; note: string }>;
}

export interface FreeMoneyDailyPoint {
  dateISO: string;
  monthKey: string;
  label: string;
  weekday: string;
  entries: number;
  expenses: number;
  reserves: number;
  cardInvoices: number;
  scenarioDelta: number;
  netDay: number;
  projectedFreeMoney: number;
  events: Array<{
    title: string;
    kind: 'entrada' | 'despesa' | 'fatura' | 'reserva' | 'cenario';
    amount: number;
  }>;
}

export interface FreeMoneyMonthlyPoint {
  monthKey: string;
  label: string;
  isCurrentMonth: boolean;
  receitasPrevistas: number;
  despesasPendentes: number;
  despesasRecorrentesNaoCartao: number;
  faturasEmAberto: number;
  parcelamentosNoMes: number;
  reservasPlanejadas: number;
  compromissosTotais: number;
  scenarioDelta: number;
  netMonth: number;
  projectedFreeMoney: number;
  hasPastMonthImpact: boolean;
  isCritical: boolean;
  isNegative: boolean;
  criticalReasons: string[];
  origins: HorizonMonthOrigins;
}

export interface CommitmentTimelineItem {
  id: string;
  dateISO: string;
  monthKey: string;
  title: string;
  category: string;
  kind: 'entrada' | 'despesa_pendente' | 'fixo' | 'fatura' | 'parcela' | 'reserva' | 'cenario';
  amount: number;
  isOutflow: boolean;
  projectedBalanceAfter: number;
}

export interface FreeMoneyAlert {
  dateISO: string;
  monthKey: string;
  projectedFreeMoney: number;
  severity: 'negative' | 'critical';
  message: string;
}

export interface FreeMoneyProjectionParams {
  mode: 'daily' | 'monthly';
  count: number;
  startDateISO?: string;
  startMonthKey?: string;
  bankAccounts: BankAccount[];
  incomes: Income[];
  transactions: Transaction[];
  installments: Installment[];
  recurringItems: RecurringItem[];
  cards: CreditCard[];
  goals: Goal[];
  simulatedPurchases?: SimulatedPurchase[];
  scenarioRules?: HorizonScenarioRule[];
}

export interface FreeMoneyProjectionResult {
  mode: 'daily' | 'monthly';
  startDateISO: string;
  endDateISO: string;
  startMonthKey: string;
  monthsCount: number;
  daysCount: number;
  hasBankAccounts: boolean;
  dimensions: FreeMoneyDimensions;
  dailyPoints: FreeMoneyDailyPoint[];
  monthlyPoints: FreeMoneyMonthlyPoint[];
  commitmentsTimeline: CommitmentTimelineItem[];
  criticalMonths: FreeMoneyMonthlyPoint[];
  negativeAlerts: FreeMoneyAlert[];
  lowestPoint: {
    dateISO: string;
    label: string;
    projectedFreeMoney: number;
  };
}

export interface TargetDateFreeMoneyQueryResult {
  targetDateISO: string;
  daysAhead: number;
  saldoBancarioReal: number;
  dinheiroLivreProjetado: number;
  entradasPrevistasAteData: number;
  compromissosFuturosAteData: number;
  reservasPlanejadasAteData: number;
  eventsOnTargetDate: FreeMoneyDailyPoint['events'];
  upcomingCommitments: CommitmentTimelineItem[];
  minimumBeforeTargetDate: {
    dateISO: string;
    projectedFreeMoney: number;
  };
}

function isMonthInScenarioRange(monthKey: string, startMk: string, endMk?: string): boolean {
  if (monthKey < startMk) return false;
  if (endMk && endMk.length >= 7 && monthKey > endMk.slice(0, 7)) return false;
  return true;
}

export function computeFreeMoneyProjection(params: FreeMoneyProjectionParams): FreeMoneyProjectionResult {
  const startDateISO = (params.startDateISO ?? getTodayISO()).slice(0, 10);
  const currentMonthKey = startDateISO.slice(0, 7);
  const startMonthKey = (params.startMonthKey ?? currentMonthKey).slice(0, 7);

  const activeAccounts = params.bankAccounts.filter((a) => a.active);
  const hasBankAccounts = activeAccounts.length > 0;
  const saldoBancarioReal = activeAccounts.reduce((s, a) => s + a.balance, 0);
  const activeCards = params.cards.filter((c) => c.active);

  const monthsCount =
    params.mode === 'monthly'
      ? Math.max(1, Math.min(60, Math.round(params.count || 12)))
      : Math.max(1, Math.ceil((params.count || 30) / 28) + 1);

  const startOffsetFromToday = Math.max(0, monthDiff(currentMonthKey, startMonthKey));
  const simMonthKeys = getMonthKeysFromStart(currentMonthKey, startOffsetFromToday + monthsCount);
  const lastSimMonth = simMonthKeys[simMonthKeys.length - 1];
  const lastDayOfEndMonth = getDaysInYearMonth(lastSimMonth);
  const maxDailyTargetISO =
    params.mode === 'daily'
      ? addDaysISO(startDateISO, Math.max(1, Math.round(params.count || 30)) - 1)
      : `${lastSimMonth}-${String(lastDayOfEndMonth).padStart(2, '0')}`;

  const totalSimDays = Math.max(1, diffDaysISO(startDateISO, maxDailyTargetISO) + 1);
  const endDateISO = addDaysISO(startDateISO, totalSimDays - 1);

  const scenarioRules = (params.scenarioRules ?? []).filter((r) => r.enabled);
  const simulatedPurchases = (params.simulatedPurchases ?? []).filter((s) => s.enabled);

  // Pré-processa regras determinísticas de cenário
  const receiptDateShifts = new Map<string, { newDay: number; startMonthKey: string; endMonthKey?: string }>();
  const primaryActiveIncome = params.incomes.find((i) => i.active && i.amount > 0);

  for (const rule of scenarioRules) {
    if (rule.type === 'alteracao_data_recebimento') {
      const targetId = rule.targetIncomeId || primaryActiveIncome?.id;
      if (targetId) {
        receiptDateShifts.set(targetId, {
          newDay: Math.max(1, Math.min(31, Math.round(rule.newReceiptDay || rule.dayOfMonth || 20))),
          startMonthKey: rule.startMonthKey || currentMonthKey,
          endMonthKey: rule.endMonthKey,
        });
      }
    }
  }

  // Mapa de parcelas antecipadas por cenário 'antecipacao_divida' para abater automaticamente futuras faturas
  const scenarioPrepaidInstallments = new Map<string, Set<number>>();
  const anticipationLumpEvents: Array<{
    rule: HorizonScenarioRule;
    dateISO: string;
    monthKey: string;
    amount: number;
    note: string;
  }> = [];

  for (const rule of scenarioRules) {
    if (rule.type !== 'antecipacao_divida') continue;
    const execMonth = rule.startMonthKey || currentMonthKey;
    const execDateISO = buildDateInMonth(execMonth, rule.dayOfMonth || Number(startDateISO.slice(8, 10)) || 15);
    const effectiveExecDateISO = execDateISO < startDateISO && execMonth === currentMonthKey ? startDateISO : execDateISO;

    if (rule.targetInstallmentId) {
      const targetInst = params.installments.find((i) => i.id === rule.targetInstallmentId);
      if (targetInst) {
        const sched = getInstallmentSchedule(targetInst, currentMonthKey, params.cards);
        const candidates = sched.filter(
          (item) => !item.isPaid && !item.isCancelled && item.monthKey >= execMonth
        );
        const toTakeCount =
          rule.anticipateCount && rule.anticipateCount > 0
            ? Math.min(candidates.length, Math.round(rule.anticipateCount))
            : candidates.length;
        const chosen = candidates.slice(-toTakeCount);
        const set = scenarioPrepaidInstallments.get(targetInst.id) ?? new Set<number>();
        let nominalSum = 0;
        for (const item of chosen) {
          set.add(item.number);
          nominalSum += item.amount;
        }
        scenarioPrepaidInstallments.set(targetInst.id, set);
        const cashOut = rule.amount > 0 ? rule.amount : nominalSum;
        if (cashOut > 0) {
          anticipationLumpEvents.push({
            rule,
            dateISO: effectiveExecDateISO,
            monthKey: effectiveExecDateISO.slice(0, 7),
            amount: cashOut,
            note: `Antecipação de ${chosen.length} parcela(s) de ${targetInst.description} (economia de ${formatBRL(
              Math.max(0, nominalSum - cashOut)
            )})`,
          });
        }
        continue;
      }
    }

    if (rule.amount > 0) {
      anticipationLumpEvents.push({
        rule,
        dateISO: effectiveExecDateISO,
        monthKey: effectiveExecDateISO.slice(0, 7),
        amount: rule.amount,
        note: `Antecipação avulsa de dívida (${formatBRL(rule.amount)})`,
      });
    }
  }

  // Parcelamentos ajustados pelos cenários de antecipação
  const adjustedInstallments: Installment[] = params.installments.map((inst) => {
    const extraPrepaid = scenarioPrepaidInstallments.get(inst.id);
    if (!extraPrepaid || extraPrepaid.size === 0) return inst;
    const merged = Array.from(new Set([...(inst.prepaidInstallmentNumbers ?? []), ...Array.from(extraPrepaid)])).sort(
      (a, b) => a - b
    );
    return {
      ...inst,
      prepaidInstallmentNumbers: merged,
    };
  });

  // Inicializa origens e acumuladores por mês
  const monthOriginsMap = new Map<string, HorizonMonthOrigins>();
  const ensureOrigins = (mk: string): HorizonMonthOrigins => {
    let o = monthOriginsMap.get(mk);
    if (!o) {
      o = {
        incomes: [],
        extraEntries: [],
        recurringExpenses: [],
        pendingExpenses: [],
        cardInvoices: [],
        installments: [],
        reserves: [],
        scenarioImpacts: [],
      };
      monthOriginsMap.set(mk, o);
    }
    return o;
  };

  for (const mk of simMonthKeys) {
    ensureOrigins(mk);
  }

  // Pré-popula origens de parcelas por mês
  for (const inst of adjustedInstallments) {
    const sched = getInstallmentSchedule(inst, currentMonthKey, params.cards);
    for (const sItem of sched) {
      if (sItem.isCancelled || sItem.isPrepaid || sItem.amount <= 0) continue;
      if (!monthOriginsMap.has(sItem.monthKey)) continue;
      ensureOrigins(sItem.monthKey).installments.push({
        id: inst.id,
        description: inst.description,
        installmentNumber: sItem.number,
        installmentsCount: inst.installmentsCount,
        cardName: inst.cardName || 'Sem cartão',
        dueDateISO: sItem.dueDateISO,
        amount: sItem.amount,
      });
    }
  }

  // Mapeia eventos dia a dia de startDateISO até endDateISO
  type DayBucket = {
    entries: number;
    expenses: number;
    reserves: number;
    cardInvoices: number;
    scenarioDelta: number;
    events: FreeMoneyDailyPoint['events'];
    timelineItems: Array<Omit<CommitmentTimelineItem, 'projectedBalanceAfter'>>;
  };

  const dayBuckets = new Map<string, DayBucket>();
  const ensureDay = (dateISO: string): DayBucket => {
    let b = dayBuckets.get(dateISO);
    if (!b) {
      b = {
        entries: 0,
        expenses: 0,
        reserves: 0,
        cardInvoices: 0,
        scenarioDelta: 0,
        events: [],
        timelineItems: [],
      };
      dayBuckets.set(dateISO, b);
    }
    return b;
  };

  const clampEventDate = (rawISO: string): string => {
    if (rawISO < startDateISO) return startDateISO;
    return rawISO;
  };

  // Totais das 10 dimensões no horizonte selecionado
  let receitasRecebidas = 0;
  let despesasPagas = 0;
  let despesasPendentesTotal = 0;
  let despesasRecorrentesTotal = 0;
  let faturasFuturasTotal = 0;
  let parcelamentosTotal = 0;
  let receitasPrevistasTotal = 0;
  let reservasPlanejadasTotal = 0;

  // 1. Movimentos já realizados no mês atual (não somados de novo em entradas/saídas previstas pois já compõem saldoBancarioReal)
  for (const tx of params.transactions) {
    if (tx.monthKey === currentMonthKey && tx.status === 'Pago' && tx.entryKind !== 'estorno') {
      if (tx.type === 'Entrada') {
        receitasRecebidas += tx.actualAmount;
      } else if (
        tx.type === 'Saída' &&
        !tx.recurringId?.startsWith('card-invoice-') &&
        !(
          activeCards.length > 0 &&
          tx.paymentMethod === 'Crédito' &&
          activeCards.some((c) => matchesCard(c, tx.cardId, tx.accountOrCard))
        )
      ) {
        despesasPagas += tx.actualAmount;
      }
    }
  }
  for (const card of activeCards) {
    const curInv = getCardInvoiceInMonth(
      card,
      currentMonthKey,
      params.transactions,
      adjustedInstallments,
      params.recurringItems,
      startDateISO
    );
    despesasPagas += curInv.status === 'Paga' ? Math.max(curInv.total, curInv.paidAmount) : curInv.paidAmount;
  }

  // Conjunto de chaves já cobertas para não duplicar rendas/fixos já lançados como Pago no mês atual
  const settledCurrentIncomes = new Set<string>();
  const monthCurrentPaidTxs = params.transactions.filter(
    (tx) => tx.monthKey === currentMonthKey && tx.status === 'Pago' && tx.type === 'Entrada'
  );
  for (const inc of params.incomes) {
    const descNorm = inc.source.trim().toLowerCase();
    if (
      hasBankAccounts &&
      inc.frequency === 'Mensal' &&
      monthCurrentPaidTxs.some((tx) => tx.description.trim().toLowerCase().includes(descNorm))
    ) {
      settledCurrentIncomes.add(inc.id);
    }
  }

  // 2. Transações concretas pendentes (entradas & saídas não-cartão) dentro do intervalo
  for (const tx of params.transactions) {
    if (tx.recurringId?.startsWith('card-invoice-')) continue;
    if (tx.entryKind === 'estorno') continue;
    if (tx.paymentMethod === 'Crédito' && activeCards.some((c) => matchesCard(c, tx.cardId, tx.accountOrCard))) {
      continue;
    }

    const rawEff = (tx.dueDate && tx.dueDate.length >= 10 ? tx.dueDate : tx.date).slice(0, 10);
    if (tx.status === 'Pago' && (hasBankAccounts || rawEff <= startDateISO)) continue;
    if (rawEff > endDateISO) continue;

    // Transações pendentes vencidas (< startDateISO) continuam devidas no dia 0 (startDateISO)
    const targetDate = clampEventDate(rawEff);
    const targetMonth = targetDate.slice(0, 7);
    const bucket = ensureDay(targetDate);

    if (tx.type === 'Entrada') {
      bucket.entries += tx.actualAmount;
      bucket.events.push({ title: tx.description, kind: 'entrada', amount: tx.actualAmount });
      bucket.timelineItems.push({
        id: `tl-tx-${tx.id}`,
        dateISO: targetDate,
        monthKey: targetMonth,
        title: tx.description,
        category: tx.category,
        kind: 'entrada',
        amount: tx.actualAmount,
        isOutflow: false,
      });
      if (targetMonth >= startMonthKey) {
        receitasPrevistasTotal += tx.actualAmount;
        ensureOrigins(targetMonth).extraEntries.push({
          title: tx.description,
          dateISO: targetDate,
          amount: tx.actualAmount,
        });
      }
    } else if (tx.type === 'Saída') {
      bucket.expenses += tx.actualAmount;
      bucket.events.push({ title: tx.description, kind: 'despesa', amount: tx.actualAmount });
      bucket.timelineItems.push({
        id: `tl-tx-${tx.id}`,
        dateISO: targetDate,
        monthKey: targetMonth,
        title: rawEff < startDateISO ? `${tx.description} (Atrasado)` : tx.description,
        category: tx.category,
        kind: 'despesa_pendente',
        amount: tx.actualAmount,
        isOutflow: true,
      });
      if (targetMonth >= startMonthKey) {
        despesasPendentesTotal += tx.actualAmount;
        ensureOrigins(targetMonth).pendingExpenses.push({
          title: tx.description,
          dateISO: targetDate,
          amount: tx.actualAmount,
        });
      }
    }
  }

  // 3. Processamento mês a mês de Rendas, Despesas Fixas, Faturas de Cartão, Reservas e Cenários
  const activeGoals = params.goals.filter((g) => g.monthlyContribution > 0);
  const scenariosCardImpactByCardMonth = new Map<string, number>();

  // Pré-aloca cenários de compra parcelada ou nova despesa em cartão na devida fatura
  for (const rule of scenarioRules) {
    if (!rule.cardId) continue;
    const card = activeCards.find((c) => c.id === rule.cardId);
    if (!card) continue;

    if (rule.type === 'compra_parcelada') {
      const count = Math.max(1, Math.round(rule.installmentsCount || 1));
      const pDay = Math.max(1, Math.min(31, Math.round(rule.dayOfMonth || 15)));
      const baseStart = pDay >= card.closingDay ? addMonthsToKey(rule.startMonthKey, 1) : rule.startMonthKey;
      const piece = rule.amount / count;
      for (let i = 0; i < count; i++) {
        const mk = addMonthsToKey(baseStart, i);
        const key = `${card.id}::${mk}`;
        scenariosCardImpactByCardMonth.set(key, (scenariosCardImpactByCardMonth.get(key) ?? 0) + piece);
      }
    } else if (rule.type === 'nova_despesa') {
      const pDay = Math.max(1, Math.min(31, Math.round(rule.dayOfMonth || 15)));
      for (const mk of simMonthKeys) {
        if (!isMonthInScenarioRange(mk, rule.startMonthKey, rule.isRecurringExpense ? rule.endMonthKey : rule.startMonthKey)) {
          continue;
        }
        const targetInvMk = pDay >= card.closingDay ? addMonthsToKey(mk, 1) : mk;
        const key = `${card.id}::${targetInvMk}`;
        scenariosCardImpactByCardMonth.set(key, (scenariosCardImpactByCardMonth.get(key) ?? 0) + rule.amount);
      }
    }
  }

  for (const mk of simMonthKeys) {
    const origins = ensureOrigins(mk);
    const inTargetHorizon = mk >= startMonthKey;

    // 3a. Rendas ativas (com suporte a alteração de data de recebimento)
    let monthIncomeTotalBeforeLoss = 0;
    const monthIncomeSlots: Array<{ inc: Income; dateISO: string; amount: number; shifted: boolean }> = [];

    for (const inc of params.incomes) {
      if (!inc.active || inc.amount <= 0) continue;
      if (mk === currentMonthKey && settledCurrentIncomes.has(inc.id)) continue;

      const shift = receiptDateShifts.get(inc.id);
      const isShifted = Boolean(shift && isMonthInScenarioRange(mk, shift.startMonthKey, shift.endMonthKey));
      const occDates =
        inc.frequency === 'Anual' && !inc.receiptDate
          ? [buildDateInMonth(mk, isShifted && shift ? shift.newDay : inc.receiptDay || 5)]
          : getIncomeOccurrenceDatesInMonth(
              isShifted && shift ? { ...inc, receiptDay: shift.newDay, receiptDate: '' } : inc,
              mk
            );
      const pieceAmount = inc.frequency === 'Anual' && !inc.receiptDate ? inc.amount / 12 : inc.amount;

      for (const dISO of occDates) {
        if (mk === currentMonthKey && dISO < startDateISO) continue;
        if (dISO > endDateISO) continue;
        monthIncomeSlots.push({ inc, dateISO: dISO, amount: pieceAmount, shifted: isShifted });
        monthIncomeTotalBeforeLoss += pieceAmount;
      }
    }

    // Aplica perda de renda / aumento de renda
    let remainingFlatIncomeLoss = 0;
    let pctLossRatio = 0;

    for (const rule of scenarioRules) {
      if (!isMonthInScenarioRange(mk, rule.startMonthKey, rule.endMonthKey)) continue;
      if (rule.type === 'perda_renda') {
        if (rule.usePercentage) {
          const pct = Math.min(100, Math.max(0, rule.amount)) / 100;
          if (rule.targetIncomeId) {
            for (const slot of monthIncomeSlots) {
              if (slot.inc.id === rule.targetIncomeId) {
                const loss = slot.amount * pct;
                slot.amount = Math.max(0, slot.amount - loss);
                origins.scenarioImpacts.push({
                  ruleId: rule.id,
                  title: rule.title,
                  type: rule.type,
                  delta: -loss,
                  note: `Redução de ${rule.amount}% em ${slot.inc.source}`,
                });
              }
            }
          } else {
            pctLossRatio = Math.min(1, pctLossRatio + pct);
          }
        } else {
          remainingFlatIncomeLoss += Math.max(0, rule.amount);
          origins.scenarioImpacts.push({
            ruleId: rule.id,
            title: rule.title,
            type: rule.type,
            delta: -rule.amount,
            note: `Redução prevista de renda (-${formatBRL(rule.amount)})`,
          });
        }
      } else if (rule.type === 'aumento_renda') {
        const boost = rule.usePercentage
          ? monthIncomeTotalBeforeLoss * (Math.max(0, rule.amount) / 100)
          : Math.max(0, rule.amount);
        if (boost > 0) {
          const dISO = clampEventDate(buildDateInMonth(mk, rule.dayOfMonth || 5));
          if (dISO <= endDateISO) {
            const b = ensureDay(dISO);
            b.entries += boost;
            b.scenarioDelta += boost;
            b.events.push({ title: rule.title, kind: 'cenario', amount: boost });
            b.timelineItems.push({
              id: `tl-sc-${rule.id}-${mk}`,
              dateISO: dISO,
              monthKey: mk,
              title: rule.title,
              category: 'Cenário',
              kind: 'cenario',
              amount: boost,
              isOutflow: false,
            });
            origins.scenarioImpacts.push({
              ruleId: rule.id,
              title: rule.title,
              type: rule.type,
              delta: boost,
              note: `Aumento de renda em ${formatDateBR(dISO)}`,
            });
            if (inTargetHorizon) receitasPrevistasTotal += boost;
          }
        }
      }
    }

    if (pctLossRatio > 0) {
      const lossAmt = monthIncomeTotalBeforeLoss * pctLossRatio;
      for (const slot of monthIncomeSlots) {
        slot.amount = slot.amount * (1 - pctLossRatio);
      }
      if (lossAmt > 0) {
        origins.scenarioImpacts.push({
          ruleId: 'perda-pct',
          title: 'Redução percentual de renda',
          type: 'perda_renda',
          delta: -lossAmt,
          note: `Redução de ${(pctLossRatio * 100).toFixed(0)}% nas rendas do mês`,
        });
      }
    }

    for (const slot of monthIncomeSlots) {
      let netSlot = slot.amount;
      if (remainingFlatIncomeLoss > 0) {
        const deduct = Math.min(netSlot, remainingFlatIncomeLoss);
        netSlot -= deduct;
        remainingFlatIncomeLoss -= deduct;
      }
      if (netSlot > 0) {
        const b = ensureDay(slot.dateISO);
        b.entries += netSlot;
        b.events.push({ title: slot.inc.source, kind: 'entrada', amount: netSlot });
        b.timelineItems.push({
          id: `tl-inc-${slot.inc.id}-${slot.dateISO}`,
          dateISO: slot.dateISO,
          monthKey: mk,
          title: slot.shifted ? `${slot.inc.source} (Nova data)` : slot.inc.source,
          category: 'Renda fixa',
          kind: 'entrada',
          amount: netSlot,
          isOutflow: false,
        });
        origins.incomes.push({
          title: slot.inc.source,
          person: slot.inc.person,
          dateISO: slot.dateISO,
          amount: netSlot,
          adjustedByScenario: slot.shifted || netSlot < slot.inc.amount - 0.01,
        });
        if (inTargetHorizon) receitasPrevistasTotal += netSlot;
      }
    }

    // 3b. Itens Fixos / Recorrentes (entradas e saídas não-cartão; recorrências no cartão entram pela fatura)
    for (const rec of params.recurringItems) {
      if (!rec.active || rec.amount <= 0) continue;
      if (isRecurringItemSettledInMonth(rec.id, mk, params.transactions)) continue;

      const isCardExpense =
        rec.type === 'Saída' &&
        rec.paymentMethod === 'Crédito' &&
        activeCards.some((c) => matchesCard(c, rec.cardId, rec.accountOrCard));

      const occDates = getRecurringItemOccurrenceDatesInMonth(rec, mk);
      for (const dISO of occDates) {
        if (mk === currentMonthKey && dISO < startDateISO) continue;
        if (dISO > endDateISO) continue;

        if (rec.type === 'Entrada') {
          const b = ensureDay(dISO);
          b.entries += rec.amount;
          b.events.push({ title: rec.description, kind: 'entrada', amount: rec.amount });
          b.timelineItems.push({
            id: `tl-rec-${rec.id}-${dISO}`,
            dateISO: dISO,
            monthKey: mk,
            title: rec.description,
            category: rec.category,
            kind: 'entrada',
            amount: rec.amount,
            isOutflow: false,
          });
          origins.incomes.push({
            title: rec.description,
            person: rec.person,
            dateISO: dISO,
            amount: rec.amount,
          });
          if (inTargetHorizon) receitasPrevistasTotal += rec.amount;
        } else if (!isCardExpense) {
          const b = ensureDay(dISO);
          b.expenses += rec.amount;
          b.events.push({ title: rec.description, kind: 'despesa', amount: rec.amount });
          b.timelineItems.push({
            id: `tl-rec-${rec.id}-${dISO}`,
            dateISO: dISO,
            monthKey: mk,
            title: rec.description,
            category: rec.category,
            kind: 'fixo',
            amount: rec.amount,
            isOutflow: true,
          });
          origins.recurringExpenses.push({
            title: rec.description,
            category: rec.category,
            dateISO: dISO,
            amount: rec.amount,
            isCard: false,
          });
          if (inTargetHorizon) despesasRecorrentesTotal += rec.amount;
        } else {
          origins.recurringExpenses.push({
            title: rec.description,
            category: rec.category,
            dateISO: dISO,
            amount: rec.amount,
            isCard: true,
          });
          if (inTargetHorizon) despesasRecorrentesTotal += rec.amount;
        }
      }
    }

    // 3c. Faturas de Cartão (respeitando fechamento, vencimento, estornos, antecipação e pagamento parcial/integral)
    for (const card of activeCards) {
      const inv = getCardInvoiceInMonth(
        card,
        mk,
        params.transactions,
        adjustedInstallments,
        params.recurringItems,
        startDateISO
      );
      const simPurchaseOnCard = simulatedPurchases
        .filter((s) => s.cardId === card.id)
        .reduce((sum, s) => sum + getSimulatedPurchaseAmountInMonth(s, mk, params.cards), 0);
      const scenarioOnCard = scenariosCardImpactByCardMonth.get(`${card.id}::${mk}`) ?? 0;
      const totalRemainingInvoice = inv.remainingAmount + simPurchaseOnCard + scenarioOnCard;

      origins.cardInvoices.push({
        cardId: card.id,
        cardName: card.name,
        dueDateISO: inv.dueDateISO,
        status: inv.status,
        total: inv.total + simPurchaseOnCard + scenarioOnCard,
        paidAmount: inv.paidAmount,
        remainingAmount: totalRemainingInvoice,
      });

      if (totalRemainingInvoice > 0.005) {
        const effDueISO = clampEventDate(inv.dueDateISO);
        if (effDueISO <= endDateISO) {
          const b = ensureDay(effDueISO);
          b.expenses += totalRemainingInvoice;
          b.cardInvoices += totalRemainingInvoice;
          b.scenarioDelta -= scenarioOnCard;
          b.events.push({
            title: `Fatura ${card.name}`,
            kind: 'fatura',
            amount: totalRemainingInvoice,
          });
          b.timelineItems.push({
            id: `tl-inv-${card.id}-${mk}`,
            dateISO: effDueISO,
            monthKey: mk,
            title:
              inv.status === 'Parcialmente paga'
                ? `Fatura ${card.name} (Restante)`
                : inv.status === 'Vencida'
                  ? `Fatura ${card.name} (Vencida)`
                  : `Fatura ${card.name}`,
            category: 'Cartão',
            kind: 'fatura',
            amount: totalRemainingInvoice,
            isOutflow: true,
          });
          if (inTargetHorizon) {
            faturasFuturasTotal += totalRemainingInvoice;
          }
        }
      }
    }

    // Parcelamentos sem cartão ativo vinculado caem na data de cobrança do parcelamento
    for (const inst of adjustedInstallments) {
      const linkedActiveCard = activeCards.some((c) => matchesCard(c, inst.cardId, inst.cardName));
      if (linkedActiveCard) continue;
      const sched = getInstallmentSchedule(inst, currentMonthKey, params.cards);
      const match = sched.find((s) => s.monthKey === mk && !s.isCancelled && !s.isPrepaid && !s.isPaid && s.amount > 0);
      if (match) {
        const effISO = clampEventDate(match.dueDateISO);
        if (effISO <= endDateISO) {
          const b = ensureDay(effISO);
          b.expenses += match.amount;
          b.events.push({
            title: `${inst.description} (${match.number}/${inst.installmentsCount})`,
            kind: 'despesa',
            amount: match.amount,
          });
          b.timelineItems.push({
            id: `tl-inst-${inst.id}-${match.number}`,
            dateISO: effISO,
            monthKey: mk,
            title: `${inst.description} (${match.number}/${inst.installmentsCount})`,
            category: inst.category,
            kind: 'parcela',
            amount: match.amount,
            isOutflow: true,
          });
          if (inTargetHorizon) despesasPendentesTotal += match.amount;
        }
      }
    }

    // 3d. Compras simuladas sem cartão + cenários sem cartão
    for (const sim of simulatedPurchases) {
      if (sim.cardId && activeCards.some((c) => c.id === sim.cardId)) continue;
      const amt = getSimulatedPurchaseAmountInMonth(sim, mk, params.cards);
      if (amt > 0) {
        const dISO = clampEventDate(buildDateInMonth(mk, sim.purchaseDay || 15));
        if (dISO <= endDateISO) {
          const b = ensureDay(dISO);
          b.expenses += amt;
          b.scenarioDelta -= amt;
          b.events.push({ title: `Sim: ${sim.description}`, kind: 'cenario', amount: amt });
          b.timelineItems.push({
            id: `tl-sim-${sim.id}-${mk}`,
            dateISO: dISO,
            monthKey: mk,
            title: `Simulação: ${sim.description}`,
            category: 'Simulação',
            kind: 'cenario',
            amount: amt,
            isOutflow: true,
          });
          origins.scenarioImpacts.push({
            ruleId: sim.id,
            title: sim.description,
            type: sim.mode === 'parcelado' ? 'compra_parcelada' : 'nova_despesa',
            delta: -amt,
            note: `Compra simulada no mês (${formatBRL(amt)})`,
          });
        }
      }
    }

    for (const rule of scenarioRules) {
      if (rule.cardId && activeCards.some((c) => c.id === rule.cardId)) continue;
      if (rule.type === 'nova_despesa') {
        if (isMonthInScenarioRange(mk, rule.startMonthKey, rule.isRecurringExpense ? rule.endMonthKey : rule.startMonthKey)) {
          const dISO = clampEventDate(buildDateInMonth(mk, rule.dayOfMonth || 10));
          if (dISO <= endDateISO && rule.amount > 0) {
            const b = ensureDay(dISO);
            b.expenses += rule.amount;
            b.scenarioDelta -= rule.amount;
            b.events.push({ title: rule.title, kind: 'cenario', amount: rule.amount });
            b.timelineItems.push({
              id: `tl-sc-exp-${rule.id}-${mk}`,
              dateISO: dISO,
              monthKey: mk,
              title: rule.title,
              category: 'Cenário',
              kind: 'cenario',
              amount: rule.amount,
              isOutflow: true,
            });
            origins.scenarioImpacts.push({
              ruleId: rule.id,
              title: rule.title,
              type: rule.type,
              delta: -rule.amount,
              note: `Nova despesa em ${formatDateBR(dISO)}`,
            });
          }
        }
      } else if (rule.type === 'compra_parcelada') {
        const count = Math.max(1, Math.round(rule.installmentsCount || 1));
        const diff = monthDiff(rule.startMonthKey, mk);
        if (diff >= 0 && diff < count && rule.amount > 0) {
          const amt = rule.amount / count;
          const dISO = clampEventDate(buildDateInMonth(mk, rule.dayOfMonth || 15));
          if (dISO <= endDateISO) {
            const b = ensureDay(dISO);
            b.expenses += amt;
            b.scenarioDelta -= amt;
            b.events.push({ title: `${rule.title} (${diff + 1}/${count})`, kind: 'cenario', amount: amt });
            b.timelineItems.push({
              id: `tl-sc-parc-${rule.id}-${mk}`,
              dateISO: dISO,
              monthKey: mk,
              title: `${rule.title} (${diff + 1}/${count})`,
              category: 'Cenário',
              kind: 'cenario',
              amount: amt,
              isOutflow: true,
            });
            origins.scenarioImpacts.push({
              ruleId: rule.id,
              title: `${rule.title} (${diff + 1}/${count})`,
              type: rule.type,
              delta: -amt,
              note: `Parcela simulada (${diff + 1}/${count})`,
            });
          }
        }
      }
    }

    // 3e. Reservas financeiras planejadas (metas) — no mês atual desconta somente o que ainda não foi aportado como Economia
    const alreadySavedThisMonth =
      mk === currentMonthKey
        ? params.transactions
            .filter((t) => t.monthKey === currentMonthKey && t.type === 'Economia' && t.status === 'Pago')
            .reduce((s, t) => s + t.actualAmount, 0)
        : 0;

    let remainingReserveOffset = alreadySavedThisMonth;
    for (const goal of activeGoals) {
      let contribution = goal.monthlyContribution;
      if (remainingReserveOffset > 0) {
        const covered = Math.min(contribution, remainingReserveOffset);
        contribution -= covered;
        remainingReserveOffset -= covered;
      }
      if (contribution > 0.005) {
        const reserveDateISO = clampEventDate(
          mk === currentMonthKey
            ? `${mk}-${String(getDaysInYearMonth(mk)).padStart(2, '0')}`
            : buildDateInMonth(mk, 1)
        );
        if (reserveDateISO <= endDateISO) {
          const b = ensureDay(reserveDateISO);
          b.reserves += contribution;
          b.events.push({ title: `Reserva: ${goal.name}`, kind: 'reserva', amount: contribution });
          b.timelineItems.push({
            id: `tl-res-${goal.id}-${mk}`,
            dateISO: reserveDateISO,
            monthKey: mk,
            title: `Reserva planejada: ${goal.name}`,
            category: 'Reservas',
            kind: 'reserva',
            amount: contribution,
            isOutflow: true,
          });
          origins.reserves.push({
            goalId: goal.id,
            goalName: goal.name,
            dateISO: reserveDateISO,
            amount: contribution,
          });
          if (inTargetHorizon) reservasPlanejadasTotal += contribution;
        }
      }
    }

    if (inTargetHorizon) {
      parcelamentosTotal += origins.installments
        .filter((item) => item.dueDateISO <= endDateISO)
        .reduce((s, item) => s + item.amount, 0);
    }
  }

  // Adiciona eventos de antecipação de dívida no dia configurado
  for (const ant of anticipationLumpEvents) {
    if (ant.dateISO < startDateISO || ant.dateISO > endDateISO) continue;
    const b = ensureDay(ant.dateISO);
    b.expenses += ant.amount;
    b.scenarioDelta -= ant.amount;
    b.events.push({ title: ant.rule.title, kind: 'cenario', amount: ant.amount });
    b.timelineItems.push({
      id: `tl-ant-${ant.rule.id}`,
      dateISO: ant.dateISO,
      monthKey: ant.monthKey,
      title: ant.rule.title,
      category: 'Cenário',
      kind: 'cenario',
      amount: ant.amount,
      isOutflow: true,
    });
    ensureOrigins(ant.monthKey).scenarioImpacts.push({
      ruleId: ant.rule.id,
      title: ant.rule.title,
      type: 'antecipacao_divida',
      delta: -ant.amount,
      note: ant.note,
    });
  }

  // Varre cronologicamente dia a dia para construir série diária, linha do tempo e série mensal
  let runningFreeMoney = saldoBancarioReal;
  const dailyPoints: FreeMoneyDailyPoint[] = [];
  const commitmentsTimeline: CommitmentTimelineItem[] = [];
  const monthEndBalanceMap = new Map<string, number>();
  const monthFlowsMap = new Map<string, { entries: number; expenses: number; reserves: number; scenarioDelta: number }>();

  let lowestPoint = {
    dateISO: startDateISO,
    label: formatShortDayMonth(startDateISO),
    projectedFreeMoney: saldoBancarioReal,
  };

  for (let i = 0; i < totalSimDays; i++) {
    const dateISO = addDaysISO(startDateISO, i);
    const monthKey = dateISO.slice(0, 7);
    const [yy, mm, dd] = dateISO.split('-').map(Number);
    const weekday = WEEKDAY_SHORT[new Date(Date.UTC(yy, mm - 1, dd)).getUTCDay()] ?? '';
    const label = `${String(dd).padStart(2, '0')}/${String(mm).padStart(2, '0')}`;

    const bucket = dayBuckets.get(dateISO);
    const entries = bucket?.entries ?? 0;
    const expenses = bucket?.expenses ?? 0;
    const reserves = bucket?.reserves ?? 0;
    const cardInvoices = bucket?.cardInvoices ?? 0;
    const scenarioDelta = bucket?.scenarioDelta ?? 0;
    const netDay = entries - expenses - reserves;
    runningFreeMoney += netDay;

    if (runningFreeMoney < lowestPoint.projectedFreeMoney) {
      lowestPoint = { dateISO, label, projectedFreeMoney: runningFreeMoney };
    }

    const mf = monthFlowsMap.get(monthKey) ?? { entries: 0, expenses: 0, reserves: 0, scenarioDelta: 0 };
    mf.entries += entries;
    mf.expenses += expenses;
    mf.reserves += reserves;
    mf.scenarioDelta += scenarioDelta;
    monthFlowsMap.set(monthKey, mf);
    monthEndBalanceMap.set(monthKey, runningFreeMoney);

    if (bucket && bucket.timelineItems.length > 0) {
      for (const item of bucket.timelineItems) {
        commitmentsTimeline.push({
          ...item,
          projectedBalanceAfter: runningFreeMoney,
        });
      }
    }

    dailyPoints.push({
      dateISO,
      monthKey,
      label,
      weekday,
      entries,
      expenses,
      reserves,
      cardInvoices,
      scenarioDelta,
      netDay,
      projectedFreeMoney: runningFreeMoney,
      events: bucket?.events ?? [],
    });
  }

  const targetMonthKeys = getMonthKeysFromStart(startMonthKey, monthsCount);
  const monthlyPoints: FreeMoneyMonthlyPoint[] = targetMonthKeys.map((mk) => {
    const origins = ensureOrigins(mk);
    const flows = monthFlowsMap.get(mk) ?? { entries: 0, expenses: 0, reserves: 0, scenarioDelta: 0 };
    const projectedFreeMoney = monthEndBalanceMap.get(mk) ?? saldoBancarioReal;
    const faturasEmAberto = origins.cardInvoices.reduce((s, c) => s + c.remainingAmount, 0);
    const despesasRecorrentesNaoCartao = origins.recurringExpenses
      .filter((r) => !r.isCard)
      .reduce((s, r) => s + r.amount, 0);
    const despesasPendentes = origins.pendingExpenses.reduce((s, p) => s + p.amount, 0);
    const parcelamentosNoMes = origins.installments.reduce((s, item) => s + item.amount, 0);
    const netMonth = flows.entries - flows.expenses - flows.reserves;

    const pastInst = origins.installments.some((item) => {
      const instObj = adjustedInstallments.find((i) => i.id === item.id);
      return instObj ? instObj.firstChargeDate.slice(0, 7) < mk : false;
    });
    const isNegative = projectedFreeMoney < 0 || netMonth < 0;
    const committedRatio = flows.entries > 0 ? flows.expenses / flows.entries : flows.expenses > 0 ? 1 : 0;
    const isCritical = isNegative || committedRatio >= 0.85;

    const criticalReasons: string[] = [];
    if (projectedFreeMoney < 0) {
      criticalReasons.push(`Dinheiro livre negativo (${formatBRL(projectedFreeMoney)})`);
    }
    if (netMonth < 0) {
      criticalReasons.push(`Déficit mensal de ${formatBRL(Math.abs(netMonth))}`);
    }
    if (flows.entries > 0 && committedRatio >= 0.85) {
      criticalReasons.push(`${Math.round(committedRatio * 100)}% da renda comprometida`);
    }
    if (origins.cardInvoices.some((c) => c.status === 'Vencida')) {
      criticalReasons.push('Fatura vencida em aberto');
    }

    return {
      monthKey: mk,
      label: formatMonthShort(mk),
      isCurrentMonth: mk === currentMonthKey,
      receitasPrevistas: flows.entries,
      despesasPendentes,
      despesasRecorrentesNaoCartao,
      faturasEmAberto,
      parcelamentosNoMes,
      reservasPlanejadas: flows.reserves,
      compromissosTotais: flows.expenses,
      scenarioDelta: flows.scenarioDelta,
      netMonth,
      projectedFreeMoney,
      hasPastMonthImpact: pastInst || faturasEmAberto > 0.005,
      isCritical,
      isNegative,
      criticalReasons,
      origins,
    };
  });

  const criticalMonths = monthlyPoints.filter((m) => m.isCritical);

  const negativeAlerts: FreeMoneyAlert[] = [];
  const alertedMonths = new Set<string>();
  for (const dp of dailyPoints) {
    if (dp.projectedFreeMoney < 0 && !alertedMonths.has(dp.monthKey)) {
      alertedMonths.add(dp.monthKey);
      negativeAlerts.push({
        dateISO: dp.dateISO,
        monthKey: dp.monthKey,
        projectedFreeMoney: dp.projectedFreeMoney,
        severity: 'negative',
        message: `Saldo livre fica negativo em ${formatDateBR(dp.dateISO)} (${formatBRL(dp.projectedFreeMoney)}).`,
      });
    }
  }

  const totalCurrentGoalsReserve = params.goals.reduce((s, g) => s + g.currentAmount, 0);
  const finalProjectedFreeMoney = runningFreeMoney;

  const windowReceitasPrevistas = dailyPoints.reduce((s, d) => s + d.entries, 0);
  const windowCompromissos = dailyPoints.reduce((s, d) => s + d.expenses, 0);
  const windowReservasPlanejadas = dailyPoints.reduce((s, d) => s + d.reserves, 0);

  return {
    mode: params.mode,
    startDateISO,
    endDateISO,
    startMonthKey,
    monthsCount,
    daysCount: dailyPoints.length,
    hasBankAccounts,
    dimensions: {
      saldoBancarioReal,
      receitasRecebidas,
      receitasPrevistas: windowReceitasPrevistas,
      despesasPagas,
      despesasPendentes: despesasPendentesTotal,
      despesasRecorrentes: despesasRecorrentesTotal,
      faturasFuturas: faturasFuturasTotal,
      parcelamentos: parcelamentosTotal,
      reservasFinanceiras: totalCurrentGoalsReserve + windowReservasPlanejadas,
      reservasPlanejadas: windowReservasPlanejadas,
      compromissosFuturos: windowCompromissos,
      dinheiroLivreProjetado: finalProjectedFreeMoney,
    },
    dailyPoints,
    monthlyPoints,
    commitmentsTimeline,
    criticalMonths,
    negativeAlerts,
    lowestPoint,
  };
}

export function queryFreeMoneyAtDate(params: {
  targetDateISO: string;
  startDateISO?: string;
  bankAccounts: BankAccount[];
  incomes: Income[];
  transactions: Transaction[];
  installments: Installment[];
  recurringItems: RecurringItem[];
  cards: CreditCard[];
  goals: Goal[];
  simulatedPurchases?: SimulatedPurchase[];
  scenarioRules?: HorizonScenarioRule[];
}): TargetDateFreeMoneyQueryResult {
  const startDateISO = (params.startDateISO ?? getTodayISO()).slice(0, 10);
  const safeTargetISO =
    params.targetDateISO && params.targetDateISO.length >= 10 ? params.targetDateISO.slice(0, 10) : startDateISO;
  const effectiveTargetISO = safeTargetISO < startDateISO ? startDateISO : safeTargetISO;
  const daysAhead = Math.min(1096, Math.max(1, diffDaysISO(startDateISO, effectiveTargetISO) + 1));

  const proj = computeFreeMoneyProjection({
    mode: 'daily',
    count: daysAhead,
    startDateISO,
    bankAccounts: params.bankAccounts,
    incomes: params.incomes,
    transactions: params.transactions,
    installments: params.installments,
    recurringItems: params.recurringItems,
    cards: params.cards,
    goals: params.goals,
    simulatedPurchases: params.simulatedPurchases,
    scenarioRules: params.scenarioRules,
  });

  const lastPoint = proj.dailyPoints[proj.dailyPoints.length - 1];
  return {
    targetDateISO: lastPoint?.dateISO ?? effectiveTargetISO,
    daysAhead: Math.max(0, daysAhead - 1),
    saldoBancarioReal: proj.dimensions.saldoBancarioReal,
    dinheiroLivreProjetado: proj.dimensions.dinheiroLivreProjetado,
    entradasPrevistasAteData: proj.dimensions.receitasPrevistas,
    compromissosFuturosAteData: proj.dimensions.compromissosFuturos,
    reservasPlanejadasAteData: proj.dimensions.reservasPlanejadas,
    eventsOnTargetDate: lastPoint?.events ?? [],
    upcomingCommitments: proj.commitmentsTimeline.filter((item) => item.isOutflow).slice(0, 15),
    minimumBeforeTargetDate: {
      dateISO: proj.lowestPoint.dateISO,
      projectedFreeMoney: proj.lowestPoint.projectedFreeMoney,
    },
  };
}




