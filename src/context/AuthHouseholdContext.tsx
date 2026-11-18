import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import {
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromCache,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import type {
  AiChatMessage,
  BankAccount,
  CreditCard,
  Goal,
  GoalMovement,
  Household,
  Income,
  Installment,
  Invite,
  PlannedPurchase,
  RecurringFrequency,
  RecurringItem,
  Scenario,
  Transaction,
  TransactionStatus,
  UserProfile,
} from '../types/finance';
import { buildDateInMonth } from '../utils/financeCalculations';
import {
  clearFinanceOfflineCache,
  type FinanceCachedCollections,
  readFinanceOfflineCache,
  shouldPreserveCachedDataOnSnapshot,
  writeFinanceOfflineCache,
} from '../utils/offlineCache';
import {
  assertValidId,
  sanitizeMemberNames,
  sanitizePeriodStart,
  sanitizeStr,
  sanitizeStringArray,
  validateAiMessageInput,
  validateBankAccountInput,
  validateCardInput,
  validateGoalInput,
  validateGoalMovementInput,
  validateIncomeInput,
  validateInstallmentInput,
  validatePlannedPurchaseInput,
  validateRecurringItemInput,
  validateScenarioInput,
  validateTransactionInput,
} from '../utils/validation';

interface AuthHouseholdContextValue {
  user: User | null;
  authReady: boolean;
  userProfile: UserProfile | null;
  household: Household | null;
  householdLoading: boolean;
  dataLoading: boolean;
  hasPendingSync: boolean;
  isUsingCachedData: boolean;
  lastOfflineCacheAt: string | null;
  invites: Invite[];
  transactions: Transaction[];
  recurringItems: RecurringItem[];
  incomes: Income[];
  cards: CreditCard[];
  installments: Installment[];
  goals: Goal[];
  goalMovements: GoalMovement[];
  plannedPurchases: PlannedPurchase[];
  scenarios: Scenario[];
  aiMessages: AiChatMessage[];
  bankAccounts: BankAccount[];
  currentPartnerName: string;
  currentAuthorName: string;
  currentUsernameLabel: string;
  signInWithCredentials: (usernameOrEmail: string, password: string) => Promise<void>;
  registerWithCredentials: (usernameOrEmail: string, password: string, displayName: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  createHousehold: (input: {
    name: string;
    partner1Name: string;
    partner2Name: string;
    periodStart: string;
  }) => Promise<void>;
  joinHouseholdWithCode: (code: string, myPartnerName: string) => Promise<void>;
  updateHouseholdSettings: (input: {
    name: string;
    partner1Name: string;
    partner2Name: string;
    memberNames?: Record<string, string>;
    periodStart: string;
    categories: string[];
    paymentMethods: string[];
    rooms: string[];
    accounts: string[];
  }) => Promise<void>;
  addHouseholdCategory: (categoryName: string) => Promise<string>;
  createInviteCode: () => Promise<string>;
  deleteInviteCode: (code: string) => Promise<void>;
  removeMember: (memberUid: string) => Promise<void>;
  // Transactions
  saveTransaction: (
    input: Parameters<typeof validateTransactionInput>[0],
    existingId?: string
  ) => Promise<void>;
  saveTransactionWithRecurrence: (
    input: Parameters<typeof validateTransactionInput>[0],
    recurrence: { frequency: RecurringFrequency; endMonthKey?: string }
  ) => Promise<void>;
  toggleTransactionStatus: (tx: Transaction) => Promise<void>;
  setTransactionStatus: (tx: Transaction, nextStatus: TransactionStatus) => Promise<void>;
  setPaymentReminderStatus: (params: {
    status: TransactionStatus;
    tx?: Transaction;
    recurringItem?: RecurringItem;
    card?: CreditCard;
    monthKey: string;
    amount: number;
    dueDate: string;
  }) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>;
  // Recurring Items
  saveRecurringItem: (
    input: Parameters<typeof validateRecurringItemInput>[0],
    existingId?: string
  ) => Promise<void>;
  toggleRecurringItemActive: (item: RecurringItem) => Promise<void>;
  deleteRecurringItem: (id: string) => Promise<void>;
  settleRecurringItemForMonth: (
    item: RecurringItem,
    monthKey: string,
    overrideAmount?: number,
    status?: TransactionStatus
  ) => Promise<void>;
  // Incomes
  saveIncome: (input: Parameters<typeof validateIncomeInput>[0], existingId?: string) => Promise<void>;
  deleteIncome: (id: string) => Promise<void>;
  // Cards
  saveCard: (input: Parameters<typeof validateCardInput>[0], existingId?: string) => Promise<void>;
  deleteCard: (id: string) => Promise<void>;
  // Installments
  saveInstallment: (
    input: Parameters<typeof validateInstallmentInput>[0],
    existingId?: string
  ) => Promise<void>;
  deleteInstallment: (id: string) => Promise<void>;
  // Goals & Movements
  saveGoal: (input: Parameters<typeof validateGoalInput>[0], existingId?: string) => Promise<void>;
  deleteGoal: (id: string) => Promise<void>;
  addGoalMovement: (input: Parameters<typeof validateGoalMovementInput>[0]) => Promise<void>;
  deleteGoalMovement: (movement: GoalMovement) => Promise<void>;
  // Planned Purchases
  savePlannedPurchase: (
    input: Parameters<typeof validatePlannedPurchaseInput>[0],
    existingId?: string
  ) => Promise<void>;
  deletePlannedPurchase: (id: string) => Promise<void>;
  // Scenarios
  saveScenario: (input: Parameters<typeof validateScenarioInput>[0], existingId?: string) => Promise<void>;
  deleteScenario: (id: string) => Promise<void>;
  // AI Chat Messages
  addAiMessage: (input: Parameters<typeof validateAiMessageInput>[0]) => Promise<void>;
  clearAiMessages: () => Promise<void>;
  // Bank Accounts
  saveBankAccount: (input: Parameters<typeof validateBankAccountInput>[0], existingId?: string) => Promise<void>;
  deleteBankAccount: (id: string) => Promise<void>;
}

const AuthHouseholdContext = createContext<AuthHouseholdContextValue | null>(null);

const DEFAULT_CATEGORIES = [
  'Moradia',
  'Contas fixas',
  'Mercado',
  'Diárias',
  'Transporte',
  'Saúde',
  'Educação',
  'Lazer',
  'Compras da casa',
  'Assinaturas',
  'Outros',
];

const DEFAULT_PAYMENT_METHODS = ['Pix', 'Crédito', 'Débito', 'Dinheiro', 'Boleto', 'Transferência', 'Outro'];
const DEFAULT_ROOMS = ['Sala', 'Cozinha', 'Quarto', 'Banheiro', 'Lavanderia', 'Escritório', 'Área externa', 'Outros'];
const DEFAULT_ACCOUNTS = ['Conta corrente', 'Poupança', 'Carteira'];

function generateShortId(prefix: string, length = 8): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  const randomValues = new Uint32Array(length);
  crypto.getRandomValues(randomValues);
  for (let i = 0; i < length; i++) {
    out += chars[randomValues[i] % chars.length];
  }
  return `${prefix}-${out}`;
}

export function normalizeLoginIdentifier(rawInput: string): { email: string; username: string } {
  const trimmed = rawInput.trim().toLowerCase();
  if (!trimmed) {
    throw new Error('Informe seu nome de usuário.');
  }
  if (trimmed.includes('@')) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      throw new Error('Formato de e-mail inválido.');
    }
    return { email: trimmed, username: trimmed.split('@')[0] };
  }
  if (!/^[a-z0-9._-]{3,40}$/.test(trimmed)) {
    throw new Error('O usuário deve ter entre 3 e 40 caracteres (letras, números, ponto, traço ou _).');
  }
  return { email: `${trimmed}@duofin.local`, username: trimmed };
}

function mapAuthError(err: unknown): Error {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: unknown }).code ?? '')
      : '';
  switch (code) {
    case 'auth/operation-not-allowed':
      return new Error(
        'Este método de login ainda não foi ativado no Firebase Authentication. Verifique os provedores no console do Firebase.'
      );
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return new Error('Login com Google cancelado antes de concluir.');
    case 'auth/popup-blocked':
      return new Error(
        'O navegador bloqueou a janela do Google. No iPhone/Safari libere os pop-ups ou entre com usuário e senha.'
      );
    case 'auth/operation-not-supported-in-this-environment':
    case 'auth/web-storage-unsupported':
      return new Error(
        'Este modo de tela inicial ou navegador restringiu o pop-up do Google. Abra no Safari normal ou entre com usuário e senha.'
      );
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return new Error('Usuário ou senha incorretos.');
    case 'auth/email-already-in-use':
      return new Error('Este nome de usuário já está em uso. Escolha outro ou faça login.');
    case 'auth/weak-password':
      return new Error('A senha precisa ter pelo menos 6 caracteres.');
    case 'auth/invalid-email':
      return new Error('Nome de usuário ou e-mail inválido.');
    case 'auth/too-many-requests':
      return new Error('Muitas tentativas seguidas. Aguarde alguns instantes e tente novamente.');
    case 'auth/network-request-failed':
      return new Error('Sem conexão para validar o login agora. Conecte-se à internet na primeira entrada.');
    default:
      return err instanceof Error ? err : new Error('Não foi possível autenticar.');
  }
}

async function commitOfflineSafe<T>(writePromise: Promise<T>): Promise<T | undefined> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    void writePromise.catch((err) => {
      console.warn('Erro ao sincronizar gravação offline quando reconectar:', err);
    });
    return undefined;
  }
  return await writePromise;
}

export function AuthHouseholdProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [household, setHousehold] = useState<Household | null>(null);
  const [householdLoading, setHouseholdLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const [hasPendingSync, setHasPendingSync] = useState(false);
  const [isUsingCachedData, setIsUsingCachedData] = useState(false);
  const [lastOfflineCacheAt, setLastOfflineCacheAt] = useState<string | null>(null);
  const [asyncError, setAsyncError] = useState<Error | null>(null);
  const pendingSyncCollectionsRef = useRef<Set<string>>(new Set());
  const activeUidRef = useRef<string | null>(null);
  const liveServerHouseholdUidRef = useRef<string | null>(null);
  const hydratedCacheInfoRef = useRef<{
    uid: string;
    householdId: string;
    nonEmptyKeys: Set<string>;
    hasLiveServerHousehold: boolean;
  } | null>(null);
  const latestCachePayloadRef = useRef<{ uid: string; data: FinanceCachedCollections } | null>(null);
  const cacheFlushTimerRef = useRef<number | null>(null);

  const [invites, setInvites] = useState<Invite[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [recurringItems, setRecurringItems] = useState<RecurringItem[]>([]);
  const [incomes, setIncomes] = useState<Income[]>([]);
  const [cards, setCards] = useState<CreditCard[]>([]);
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [goalMovements, setGoalMovements] = useState<GoalMovement[]>([]);
  const [plannedPurchases, setPlannedPurchases] = useState<PlannedPurchase[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [aiMessages, setAiMessages] = useState<AiChatMessage[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);

  if (asyncError) {
    throw asyncError;
  }

  // 1. Auth listener & UserProfile sync (com hidratação imediata via IndexedDB offline)
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      activeUidRef.current = nextUser?.uid ?? null;
      setUser(nextUser);
      setAuthReady(true);

      if (!nextUser) {
        if (cacheFlushTimerRef.current !== null) {
          window.clearTimeout(cacheFlushTimerRef.current);
          cacheFlushTimerRef.current = null;
        }
        latestCachePayloadRef.current = null;
        hydratedCacheInfoRef.current = null;
        liveServerHouseholdUidRef.current = null;
        setUserProfile(null);
        setHousehold(null);
        setIsUsingCachedData(false);
        setLastOfflineCacheAt(null);
        setHouseholdLoading(false);
        return;
      }

      hydratedCacheInfoRef.current = null;
      liveServerHouseholdUidRef.current = null;
      setHouseholdLoading(true);

      // Hidratação instantânea do último snapshot salvo em IndexedDB (saldos, lançamentos, contas)
      void (async () => {
        const cached = await readFinanceOfflineCache(nextUser.uid);
        if (activeUidRef.current !== nextUser.uid || !cached) return;

        setLastOfflineCacheAt(cached.cachedAt);
        if (
          liveServerHouseholdUidRef.current === nextUser.uid ||
          hydratedCacheInfoRef.current?.hasLiveServerHousehold
        ) {
          return;
        }

        const nonEmptyKeys = new Set<string>();
        if (cached.bankAccounts?.length) nonEmptyKeys.add('bankAccounts');
        if (cached.transactions?.length) nonEmptyKeys.add('transactions');
        if (cached.recurringItems?.length) nonEmptyKeys.add('recurringItems');
        if (cached.incomes?.length) nonEmptyKeys.add('incomes');
        if (cached.cards?.length) nonEmptyKeys.add('cards');
        if (cached.installments?.length) nonEmptyKeys.add('installments');
        if (cached.goals?.length) nonEmptyKeys.add('goals');
        if (cached.goalMovements?.length) nonEmptyKeys.add('goalMovements');
        if (cached.plannedPurchases?.length) nonEmptyKeys.add('plannedPurchases');
        if (cached.scenarios?.length) nonEmptyKeys.add('scenarios');
        if (cached.aiMessages?.length) nonEmptyKeys.add('aiMessages');

        hydratedCacheInfoRef.current = {
          uid: nextUser.uid,
          householdId: cached.household?.id ?? '',
          nonEmptyKeys,
          hasLiveServerHousehold: false,
        };

        if (cached.userProfile) {
          setUserProfile((prev) => prev ?? cached.userProfile);
        }
        if (cached.household) {
          setHousehold((prev) => prev ?? cached.household);
          setHouseholdLoading(false);
          setDataLoading(false);
        }
        if (cached.bankAccounts?.length) {
          setBankAccounts((prev) => (prev.length ? prev : cached.bankAccounts));
        }
        if (cached.transactions?.length) {
          setTransactions((prev) => (prev.length ? prev : cached.transactions));
        }
        if (cached.recurringItems?.length) {
          setRecurringItems((prev) => (prev.length ? prev : cached.recurringItems));
        }
        if (cached.incomes?.length) {
          setIncomes((prev) => (prev.length ? prev : cached.incomes));
        }
        if (cached.cards?.length) {
          setCards((prev) => (prev.length ? prev : cached.cards));
        }
        if (cached.installments?.length) {
          setInstallments((prev) => (prev.length ? prev : cached.installments));
        }
        if (cached.goals?.length) {
          setGoals((prev) => (prev.length ? prev : cached.goals));
        }
        if (cached.goalMovements?.length) {
          setGoalMovements((prev) => (prev.length ? prev : cached.goalMovements));
        }
        if (cached.plannedPurchases?.length) {
          setPlannedPurchases((prev) => (prev.length ? prev : cached.plannedPurchases));
        }
        if (cached.scenarios?.length) {
          setScenarios((prev) => (prev.length ? prev : cached.scenarios));
        }
        if (cached.aiMessages?.length) {
          setAiMessages((prev) => (prev.length ? prev : cached.aiMessages));
        }

        setIsUsingCachedData(true);
      })();

      const userRef = doc(db, 'users', nextUser.uid);
      const safeName = sanitizeStr(
        nextUser.displayName || nextUser.email?.split('@')[0] || 'Usuário',
        80,
        'Usuário'
      );
      const safeEmail = sanitizeStr(nextUser.email || 'user@duofin.local', 160, 'user@duofin.local');
      const safePhoto = sanitizeStr(nextUser.photoURL || '', 500, '');

      try {
        let snap = null;
        try {
          snap = await getDoc(userRef);
        } catch (getErr) {
          const msg = getErr instanceof Error ? getErr.message.toLowerCase() : '';
          const offlineError =
            (typeof navigator !== 'undefined' && !navigator.onLine) ||
            msg.includes('offline') ||
            msg.includes('unavailable');
          if (!offlineError) throw getErr;
          snap = await getDocFromCache(userRef).catch(() => null);
        }

        if (!snap) {
          setUserProfile((prev) =>
            prev && prev.uid === nextUser.uid
              ? prev
              : {
                  uid: nextUser.uid,
                  email: safeEmail,
                  displayName: safeName,
                  photoURL: safePhoto,
                  activeHouseholdId: '',
                }
          );
          return;
        }

        if (!snap.exists()) {
          const newProfile: UserProfile = {
            uid: nextUser.uid,
            email: safeEmail,
            displayName: safeName,
            photoURL: safePhoto,
            activeHouseholdId: '',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };
          await commitOfflineSafe(setDoc(userRef, newProfile));
          setUserProfile(newProfile);
        } else {
          const existing = snap.data() as UserProfile;
          setUserProfile(existing);
        }
      } catch (err) {
        try {
          handleFirestoreError(err, OperationType.GET, `users/${nextUser.uid}`);
        } catch (wrapped) {
          setAsyncError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
        }
      }
    });
    return () => unsub();
  }, []);

  // 2. Household listener
  useEffect(() => {
    if (!authReady || !user) {
      setHousehold(null);
      setHouseholdLoading(false);
      return;
    }

    const q = query(collection(db, 'households'), where('memberUids', 'array-contains', user.uid));
    const unsub = onSnapshot(
      q,
      { includeMetadataChanges: true },
      (snap) => {
        const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
        const hasHydratedHousehold = Boolean(
          hydratedCacheInfoRef.current?.uid === user.uid && hydratedCacheInfoRef.current.householdId
        );

        if (
          shouldPreserveCachedDataOnSnapshot({
            isOffline,
            fromCache: snap.metadata.fromCache,
            snapshotEmpty: snap.empty,
            hasHydratedCache: hasHydratedHousehold,
          })
        ) {
          setHouseholdLoading(false);
          return;
        }

        if (snap.empty) {
          setHousehold(null);
          if (!snap.metadata.fromCache) {
            liveServerHouseholdUidRef.current = user.uid;
            setIsUsingCachedData(false);
          }
        } else {
          const docSnap = snap.docs[0];
          setHousehold({ id: docSnap.id, ...(docSnap.data() as Omit<Household, 'id'>) });
          if (!snap.metadata.fromCache) {
            liveServerHouseholdUidRef.current = user.uid;
            if (hydratedCacheInfoRef.current?.uid === user.uid) {
              hydratedCacheInfoRef.current.hasLiveServerHousehold = true;
            }
            setIsUsingCachedData(false);
          }
        }
        if (snap.metadata.hasPendingWrites) {
          pendingSyncCollectionsRef.current.add('household');
        } else {
          pendingSyncCollectionsRef.current.delete('household');
        }
        setHasPendingSync(pendingSyncCollectionsRef.current.size > 0);
        setHouseholdLoading(false);
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.LIST, 'households');
        } catch (wrapped) {
          setAsyncError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
        }
      }
    );

    return () => unsub();
  }, [authReady, user]);

  // 3. Invites listener for current user
  useEffect(() => {
    if (!authReady || !user || !household) {
      setInvites([]);
      return;
    }
    const q = query(collection(db, 'invites'), where('createdByUid', '==', user.uid));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Invite, 'id'>) }));
        setInvites(list.filter((i) => i.householdId === household.id && !i.used));
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.LIST, 'invites');
        } catch (wrapped) {
          setAsyncError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
        }
      }
    );
    return () => unsub();
  }, [authReady, user, household]);

  // 4. Shared subcollections listeners + protection against empty offline cache overwrites
  useEffect(() => {
    if (!authReady || !user || !household) {
      setTransactions([]);
      setRecurringItems([]);
      setIncomes([]);
      setCards([]);
      setInstallments([]);
      setGoals([]);
      setGoalMovements([]);
      setPlannedPurchases([]);
      setScenarios([]);
      setAiMessages([]);
      setBankAccounts([]);
      setDataLoading(false);
      return;
    }

    const hasHydratedForHousehold =
      hydratedCacheInfoRef.current?.uid === user.uid &&
      hydratedCacheInfoRef.current?.householdId === household.id;

    if (!hasHydratedForHousehold) {
      setDataLoading(true);
    }
    pendingSyncCollectionsRef.current.clear();
    setHasPendingSync(false);
    const hid = household.id;
    let pendingInitial = 11;
    const markLoaded = () => {
      pendingInitial = Math.max(0, pendingInitial - 1);
      if (pendingInitial === 0) setDataLoading(false);
    };
    const updatePendingSync = (colKey: string, hasPending: boolean) => {
      if (hasPending) {
        pendingSyncCollectionsRef.current.add(colKey);
      } else {
        pendingSyncCollectionsRef.current.delete(colKey);
      }
      setHasPendingSync(pendingSyncCollectionsRef.current.size > 0);
    };
    const applyCollectionSnapshot = <T,>(
      colKey: string,
      snap: {
        empty: boolean;
        metadata: { fromCache: boolean; hasPendingWrites: boolean };
        docs: Array<{ id: string; data: () => unknown }>;
      },
      setter: React.Dispatch<React.SetStateAction<T[]>>,
      trackPending = true
    ) => {
      const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
      const hasHydratedKey = Boolean(hydratedCacheInfoRef.current?.nonEmptyKeys.has(colKey));
      if (
        !shouldPreserveCachedDataOnSnapshot({
          isOffline,
          fromCache: snap.metadata.fromCache,
          snapshotEmpty: snap.empty,
          hasHydratedCache: hasHydratedKey,
        })
      ) {
        setter(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<T, 'id'>) }) as T));
        if (!snap.metadata.fromCache) {
          hydratedCacheInfoRef.current?.nonEmptyKeys.delete(colKey);
          setIsUsingCachedData(false);
        }
      }
      if (trackPending) {
        updatePendingSync(colKey, snap.metadata.hasPendingWrites);
      }
      markLoaded();
    };
    const offlineFallbackTimer =
      typeof navigator !== 'undefined' && !navigator.onLine
        ? window.setTimeout(() => setDataLoading(false), 1200)
        : null;

    const unsubs = [
      onSnapshot(
        query(collection(db, `households/${hid}/transactions`), orderBy('date', 'desc')),
        { includeMetadataChanges: true },
        (snap) => applyCollectionSnapshot('transactions', snap, setTransactions),
        (err) => {
          try {
            handleFirestoreError(err, OperationType.LIST, `households/${hid}/transactions`);
          } catch (wrapped) {
            setAsyncError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
          }
        }
      ),
      onSnapshot(
        collection(db, `households/${hid}/recurringItems`),
        { includeMetadataChanges: true },
        (snap) => applyCollectionSnapshot('recurringItems', snap, setRecurringItems),
        (err) => {
          try {
            handleFirestoreError(err, OperationType.LIST, `households/${hid}/recurringItems`);
          } catch (wrapped) {
            setAsyncError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
          }
        }
      ),
      onSnapshot(
        collection(db, `households/${hid}/incomes`),
        { includeMetadataChanges: true },
        (snap) => applyCollectionSnapshot('incomes', snap, setIncomes),
        (err) => {
          try {
            handleFirestoreError(err, OperationType.LIST, `households/${hid}/incomes`);
          } catch (wrapped) {
            setAsyncError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
          }
        }
      ),
      onSnapshot(
        collection(db, `households/${hid}/cards`),
        { includeMetadataChanges: true },
        (snap) => applyCollectionSnapshot('cards', snap, setCards),
        (err) => {
          try {
            handleFirestoreError(err, OperationType.LIST, `households/${hid}/cards`);
          } catch (wrapped) {
            setAsyncError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
          }
        }
      ),
      onSnapshot(
        collection(db, `households/${hid}/installments`),
        { includeMetadataChanges: true },
        (snap) => applyCollectionSnapshot('installments', snap, setInstallments),
        (err) => {
          try {
            handleFirestoreError(err, OperationType.LIST, `households/${hid}/installments`);
          } catch (wrapped) {
            setAsyncError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
          }
        }
      ),
      onSnapshot(
        collection(db, `households/${hid}/goals`),
        { includeMetadataChanges: true },
        (snap) => applyCollectionSnapshot('goals', snap, setGoals),
        (err) => {
          try {
            handleFirestoreError(err, OperationType.LIST, `households/${hid}/goals`);
          } catch (wrapped) {
            setAsyncError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
          }
        }
      ),
      onSnapshot(
        query(collection(db, `households/${hid}/goalMovements`), orderBy('date', 'desc')),
        { includeMetadataChanges: true },
        (snap) => applyCollectionSnapshot('goalMovements', snap, setGoalMovements),
        (err) => {
          try {
            handleFirestoreError(err, OperationType.LIST, `households/${hid}/goalMovements`);
          } catch (wrapped) {
            setAsyncError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
          }
        }
      ),
      onSnapshot(
        collection(db, `households/${hid}/plannedPurchases`),
        { includeMetadataChanges: true },
        (snap) => applyCollectionSnapshot('plannedPurchases', snap, setPlannedPurchases),
        (err) => {
          try {
            handleFirestoreError(err, OperationType.LIST, `households/${hid}/plannedPurchases`);
          } catch (wrapped) {
            setAsyncError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
          }
        }
      ),
      onSnapshot(
        collection(db, `households/${hid}/scenarios`),
        { includeMetadataChanges: true },
        (snap) => applyCollectionSnapshot('scenarios', snap, setScenarios),
        (err) => {
          try {
            handleFirestoreError(err, OperationType.LIST, `households/${hid}/scenarios`);
          } catch (wrapped) {
            setAsyncError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
          }
        }
      ),
      onSnapshot(
        query(collection(db, `households/${hid}/aiMessages`), orderBy('createdAt', 'asc')),
        { includeMetadataChanges: true },
        (snap) => applyCollectionSnapshot('aiMessages', snap, setAiMessages, false),
        (err) => {
          try {
            handleFirestoreError(err, OperationType.LIST, `households/${hid}/aiMessages`);
          } catch (wrapped) {
            setAsyncError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
          }
        }
      ),
      onSnapshot(
        collection(db, `households/${hid}/bankAccounts`),
        { includeMetadataChanges: true },
        (snap) => applyCollectionSnapshot('bankAccounts', snap, setBankAccounts),
        (err) => {
          try {
            handleFirestoreError(err, OperationType.LIST, `households/${hid}/bankAccounts`);
          } catch (wrapped) {
            setAsyncError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
          }
        }
      ),
    ];

    return () => {
      if (offlineFallbackTimer !== null) window.clearTimeout(offlineFallbackTimer);
      unsubs.forEach((u) => u());
    };
  }, [authReady, user, household]);

  // 5. Persistência contínua em IndexedDB dos últimos saldos, contas e lançamentos carregados
  useEffect(() => {
    if (!authReady || !user || !household || householdLoading || dataLoading) return;

    const payload: FinanceCachedCollections = {
      userProfile,
      household,
      bankAccounts,
      transactions,
      recurringItems,
      incomes,
      cards,
      installments,
      goals,
      goalMovements,
      plannedPurchases,
      scenarios,
      aiMessages,
    };

    const uid = user.uid;
    latestCachePayloadRef.current = { uid, data: payload };

    if (cacheFlushTimerRef.current !== null) {
      window.clearTimeout(cacheFlushTimerRef.current);
    }
    cacheFlushTimerRef.current = window.setTimeout(() => {
      cacheFlushTimerRef.current = null;
      void writeFinanceOfflineCache(uid, payload).then((cachedAt) => {
        if (cachedAt && activeUidRef.current === uid) {
          setLastOfflineCacheAt(cachedAt);
        }
      });
    }, 350);

    return () => {
      if (cacheFlushTimerRef.current !== null) {
        window.clearTimeout(cacheFlushTimerRef.current);
        cacheFlushTimerRef.current = null;
      }
    };
  }, [
    authReady,
    user,
    userProfile,
    household,
    householdLoading,
    dataLoading,
    bankAccounts,
    transactions,
    recurringItems,
    incomes,
    cards,
    installments,
    goals,
    goalMovements,
    plannedPurchases,
    scenarios,
    aiMessages,
  ]);

  // Flush imediato em pagehide / segundo plano (especialmente útil em PWA iOS/Android)
  useEffect(() => {
    const flushNow = () => {
      const pending = latestCachePayloadRef.current;
      if (!pending) return;
      void writeFinanceOfflineCache(pending.uid, pending.data);
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        flushNow();
      }
    };
    window.addEventListener('pagehide', flushNow);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('pagehide', flushNow);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  const currentAuthorName = useMemo(() => {
    if (!user) return 'Usuário';
    return sanitizeStr(
      userProfile?.displayName || user.displayName || user.email?.split('@')[0] || 'Usuário',
      80,
      'Usuário'
    );
  }, [user, userProfile]);

  const currentUsernameLabel = useMemo(() => {
    const email = user?.email ?? '';
    if (!email) return currentAuthorName;
    if (email.endsWith('@duofin.local')) return email.replace('@duofin.local', '');
    return email;
  }, [user, currentAuthorName]);

  const currentPartnerName = useMemo(() => {
    if (!household || !user) return 'Pessoa 1';
    const mapped = household.memberNames?.[user.uid]?.trim();
    if (mapped) return mapped;
    if (household.partner2Uid === user.uid) return household.partner2Name;
    return household.partner1Name;
  }, [household, user]);

  const signInWithCredentials = async (usernameOrEmail: string, password: string) => {
    const { email } = normalizeLoginIdentifier(usernameOrEmail);
    if (!password || password.length < 6) {
      throw new Error('Informe a senha (mínimo 6 caracteres).');
    }
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      throw mapAuthError(err);
    }
  };

  const registerWithCredentials = async (usernameOrEmail: string, password: string, displayName: string) => {
    const { email, username } = normalizeLoginIdentifier(usernameOrEmail);
    if (!password || password.length < 6) {
      throw new Error('Crie uma senha com pelo menos 6 caracteres.');
    }
    const cleanDisplayName = sanitizeStr(displayName || username, 80, username) || username;
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName: cleanDisplayName });
      const userRef = doc(db, 'users', cred.user.uid);
      const snap = await getDoc(userRef);
      if (snap.exists()) {
        await updateDoc(userRef, {
          displayName: cleanDisplayName,
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(userRef, {
          uid: cred.user.uid,
          email,
          displayName: cleanDisplayName,
          photoURL: '',
          activeHouseholdId: '',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      setUserProfile((prev) =>
        prev
          ? { ...prev, displayName: cleanDisplayName }
          : {
              uid: cred.user.uid,
              email,
              displayName: cleanDisplayName,
              photoURL: '',
              activeHouseholdId: '',
            }
      );
    } catch (err) {
      throw mapAuthError(err);
    }
  };

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      await signInWithPopup(auth, provider);
    } catch (err) {
      throw mapAuthError(err);
    }
  };

  const logout = async () => {
    const uidToClear = user?.uid;
    if (cacheFlushTimerRef.current !== null) {
      window.clearTimeout(cacheFlushTimerRef.current);
      cacheFlushTimerRef.current = null;
    }
    latestCachePayloadRef.current = null;
    hydratedCacheInfoRef.current = null;
    setIsUsingCachedData(false);
    setLastOfflineCacheAt(null);
    await clearFinanceOfflineCache(uidToClear);
    await signOut(auth);
  };

  const requireContext = () => {
    if (!user || !household) {
      throw new Error('Sessão ou espaço compartilhado não encontrado.');
    }
    return { user, hid: household.id };
  };

  const createHousehold = async (input: {
    name: string;
    partner1Name: string;
    partner2Name: string;
    periodStart: string;
  }) => {
    if (!user) throw new Error('Faça login para criar um espaço.');
    const hid = doc(collection(db, 'households')).id;
    const p1 = sanitizeStr(input.partner1Name, 50, 'Pessoa 1') || 'Pessoa 1';
    const p2 = sanitizeStr(input.partner2Name, 50, 'Pessoa 2') || 'Pessoa 2';
    const payload = {
      name: sanitizeStr(input.name, 80, 'Finanças Compartilhadas') || 'Finanças Compartilhadas',
      ownerUid: user.uid,
      memberUids: [user.uid],
      memberNames: { [user.uid]: p1 },
      partner1Uid: user.uid,
      partner2Uid: '',
      partner1Name: p1,
      partner2Name: p2,
      periodStart: sanitizePeriodStart(input.periodStart),
      categories: DEFAULT_CATEGORIES,
      paymentMethods: DEFAULT_PAYMENT_METHODS,
      rooms: DEFAULT_ROOMS,
      accounts: DEFAULT_ACCOUNTS,
      lastInviteCode: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    try {
      const batch = writeBatch(db);
      batch.set(doc(db, 'households', hid), payload);
      batch.update(doc(db, 'users', user.uid), {
        activeHouseholdId: hid,
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `households/${hid}`);
    }
  };

  const joinHouseholdWithCode = async (rawCode: string, myPartnerName: string) => {
    if (!user) throw new Error('Faça login para entrar com um convite.');
    const code = assertValidId(rawCode.toUpperCase(), 'Código de convite');
    const inviteRef = doc(db, 'invites', code);
    let inviteData: Invite;
    try {
      const snap = await getDoc(inviteRef);
      if (!snap.exists()) {
        throw new Error('Código de convite não encontrado. Verifique com quem criou o código.');
      }
      inviteData = { id: snap.id, ...(snap.data() as Omit<Invite, 'id'>) };
    } catch (err) {
      if (err instanceof Error && err.message.includes('Código de convite não encontrado')) throw err;
      handleFirestoreError(err, OperationType.GET, `invites/${code}`);
    }

    if (inviteData.used) {
      throw new Error('Este código de convite já foi utilizado.');
    }
    if (inviteData.createdByUid === user.uid) {
      throw new Error('Você não pode usar seu próprio código de convite.');
    }

    const cleanName = sanitizeStr(myPartnerName, 50, currentAuthorName) || currentAuthorName;

    try {
      const batch = writeBatch(db);
      batch.update(inviteRef, {
        used: true,
        usedByUid: user.uid,
        usedAt: serverTimestamp(),
      });
      batch.update(doc(db, 'households', inviteData.householdId), {
        memberUids: arrayUnion(user.uid),
        [`memberNames.${user.uid}`]: cleanName,
        lastInviteCode: code,
        updatedAt: serverTimestamp(),
      });
      batch.update(doc(db, 'users', user.uid), {
        activeHouseholdId: inviteData.householdId,
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `households/${inviteData.householdId}`);
    }
  };

  const updateHouseholdSettings = async (input: {
    name: string;
    partner1Name: string;
    partner2Name: string;
    memberNames?: Record<string, string>;
    periodStart: string;
    categories: string[];
    paymentMethods: string[];
    rooms: string[];
    accounts: string[];
  }) => {
    const { hid } = requireContext();
    const p1 = sanitizeStr(input.partner1Name, 50, 'Pessoa 1') || 'Pessoa 1';
    const p2 = sanitizeStr(input.partner2Name, 50, 'Pessoa 2') || 'Pessoa 2';
    const mergedNames = sanitizeMemberNames(
      {
        ...(household?.memberNames ?? {}),
        ...(input.memberNames ?? {}),
        ...(household ? { [household.partner1Uid]: input.memberNames?.[household.partner1Uid] ?? p1 } : {}),
      },
      household?.memberUids
    );

    const payload = {
      name: sanitizeStr(input.name, 80, 'Finanças Compartilhadas') || 'Finanças Compartilhadas',
      partner1Name: mergedNames[household?.partner1Uid ?? ''] || p1,
      partner2Name: p2,
      memberNames: mergedNames,
      periodStart: sanitizePeriodStart(input.periodStart),
      categories: sanitizeStringArray(input.categories, 30, 60, 'Outros'),
      paymentMethods: sanitizeStringArray(input.paymentMethods, 20, 40, 'Pix'),
      rooms: sanitizeStringArray(input.rooms, 25, 50, 'Outros'),
      accounts: sanitizeStringArray(input.accounts, 25, 60, 'Conta corrente'),
      updatedAt: serverTimestamp(),
    };
    try {
      await commitOfflineSafe(updateDoc(doc(db, 'households', hid), payload));
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `households/${hid}`);
    }
  };

  const addHouseholdCategory = async (rawName: string): Promise<string> => {
    const { hid } = requireContext();
    if (!household) throw new Error('Espaço não encontrado.');
    const cleanName = sanitizeStr(rawName, 60);
    if (!cleanName) {
      throw new Error('Informe o nome da nova categoria.');
    }
    const existing = household.categories.find((c) => c.toLowerCase() === cleanName.toLowerCase());
    if (existing) return existing;
    if (household.categories.length >= 30) {
      throw new Error('Limite máximo de 30 categorias atingido.');
    }
    const nextCategories = [...household.categories, cleanName];
    try {
      await commitOfflineSafe(
        updateDoc(doc(db, 'households', hid), {
          categories: nextCategories,
          updatedAt: serverTimestamp(),
        })
      );
      return cleanName;
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `households/${hid}`);
    }
  };

  const createInviteCode = async (): Promise<string> => {
    const { user: u, hid } = requireContext();
    if (!household) throw new Error('Espaço não encontrado.');
    if (household.memberUids.length >= 7) {
      throw new Error('Este espaço já atingiu o limite de 7 pessoas conectadas.');
    }
    const code = generateShortId('DUO', 6);
    try {
      await setDoc(doc(db, 'invites', code), {
        householdId: hid,
        householdName: sanitizeStr(household.name, 80, 'Finanças Compartilhadas'),
        createdByUid: u.uid,
        createdByName: currentAuthorName,
        used: false,
        usedByUid: '',
        createdAt: serverTimestamp(),
      });
      return code;
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `invites/${code}`);
    }
  };

  const deleteInviteCode = async (code: string) => {
    assertValidId(code, 'Código');
    try {
      await deleteDoc(doc(db, 'invites', code));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `invites/${code}`);
    }
  };

  const removeMember = async (targetUid: string) => {
    const { hid } = requireContext();
    if (!household) return;
    if (targetUid === household.ownerUid) {
      throw new Error('O proprietário do espaço não pode ser removido.');
    }
    if (!household.memberUids.includes(targetUid)) return;

    const nextMemberUids = household.memberUids.filter((uid) => uid !== targetUid);
    const nextNames = { ...(household.memberNames ?? {}) };
    delete nextNames[targetUid];

    try {
      await updateDoc(doc(db, 'households', hid), {
        memberUids: nextMemberUids,
        memberNames: nextNames,
        partner2Uid: household.partner2Uid === targetUid ? '' : household.partner2Uid,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `households/${hid}`);
    }
  };

  // =========================================================================
  // CRUD HELPERS FOR SUBCOLLECTIONS
  // =========================================================================
  const saveTransaction = async (
    input: Parameters<typeof validateTransactionInput>[0],
    existingId?: string
  ) => {
    const { user: u, hid } = requireContext();
    const clean = validateTransactionInput(input);
    const colPath = `households/${hid}/transactions`;

    try {
      if (existingId) {
        const id = assertValidId(existingId);
        await commitOfflineSafe(
          updateDoc(doc(db, colPath, id), {
            ...clean,
            updatedByUid: u.uid,
            updatedByName: currentAuthorName,
            updatedAt: serverTimestamp(),
          })
        );
      } else {
        const newRef = doc(collection(db, colPath));
        await commitOfflineSafe(
          setDoc(newRef, {
            ...clean,
            createdByUid: u.uid,
            createdByName: currentAuthorName,
            updatedByUid: u.uid,
            updatedByName: currentAuthorName,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        );
      }
    } catch (err) {
      handleFirestoreError(err, existingId ? OperationType.UPDATE : OperationType.CREATE, colPath);
    }
  };

  const saveTransactionWithRecurrence = async (
    input: Parameters<typeof validateTransactionInput>[0],
    recurrence: { frequency: RecurringFrequency; endMonthKey?: string }
  ) => {
    const { user: u, hid } = requireContext();
    if (input.type !== 'Entrada' && input.type !== 'Saída') {
      throw new Error('Apenas Receitas e Despesas podem ser marcadas como fixas.');
    }
    const cleanTx = validateTransactionInput(input);
    const dayOfMonth = Number(cleanTx.date.slice(8, 10)) || 5;
    const cleanRec = validateRecurringItemInput({
      type: input.type,
      description: cleanTx.description,
      amount: cleanTx.actualAmount,
      category: cleanTx.category,
      person: cleanTx.person,
      frequency: recurrence.frequency,
      dayOfMonth,
      startMonthKey: cleanTx.monthKey,
      endMonthKey: recurrence.endMonthKey ?? '',
      paymentMethod: cleanTx.paymentMethod,
      accountOrCard: cleanTx.accountOrCard,
      cardId: cleanTx.cardId,
      active: true,
      notes: cleanTx.notes,
    });

    const recRef = doc(collection(db, `households/${hid}/recurringItems`));
    try {
      const batch = writeBatch(db);
      batch.set(recRef, {
        ...cleanRec,
        createdByUid: u.uid,
        createdByName: currentAuthorName,
        updatedByUid: u.uid,
        updatedByName: currentAuthorName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // If marked as Pago already in this starting month, create the concrete Transaction linked to recurringId
      // so this month isn't double-counted and future months still project automatically.
      if (cleanTx.status === 'Pago') {
        const txRef = doc(collection(db, `households/${hid}/transactions`));
        batch.set(txRef, {
          ...cleanTx,
          recurringId: recRef.id,
          recurringMonthKey: cleanTx.monthKey,
          createdByUid: u.uid,
          createdByName: currentAuthorName,
          updatedByUid: u.uid,
          updatedByName: currentAuthorName,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      await commitOfflineSafe(batch.commit());
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `households/${hid}/recurringItems`);
    }
  };

  const setTransactionStatus = async (tx: Transaction, nextStatus: TransactionStatus) => {
    if (tx.status === nextStatus) return;
    const { user: u, hid } = requireContext();
    const colPath = `households/${hid}/transactions`;
    try {
      await commitOfflineSafe(
        updateDoc(doc(db, colPath, tx.id), {
          status: nextStatus,
          updatedByUid: u.uid,
          updatedByName: currentAuthorName,
          updatedAt: serverTimestamp(),
        })
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `${colPath}/${tx.id}`);
    }
  };

  const toggleTransactionStatus = async (tx: Transaction) => {
    const nextStatus: TransactionStatus = tx.status === 'Pago' ? 'Pendente' : 'Pago';
    await setTransactionStatus(tx, nextStatus);
  };

  const deleteTransaction = async (id: string) => {
    const { hid } = requireContext();
    const colPath = `households/${hid}/transactions`;
    try {
      await commitOfflineSafe(deleteDoc(doc(db, colPath, assertValidId(id))));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `${colPath}/${id}`);
    }
  };

  // Recurring Items CRUD
  const saveRecurringItem = async (
    input: Parameters<typeof validateRecurringItemInput>[0],
    existingId?: string
  ) => {
    const { user: u, hid } = requireContext();
    const clean = validateRecurringItemInput(input);
    const colPath = `households/${hid}/recurringItems`;
    try {
      if (existingId) {
        const id = assertValidId(existingId);
        await commitOfflineSafe(
          updateDoc(doc(db, colPath, id), {
            ...clean,
            updatedByUid: u.uid,
            updatedByName: currentAuthorName,
            updatedAt: serverTimestamp(),
          })
        );
      } else {
        const newRef = doc(collection(db, colPath));
        await commitOfflineSafe(
          setDoc(newRef, {
            ...clean,
            createdByUid: u.uid,
            createdByName: currentAuthorName,
            updatedByUid: u.uid,
            updatedByName: currentAuthorName,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        );
      }
    } catch (err) {
      handleFirestoreError(err, existingId ? OperationType.UPDATE : OperationType.CREATE, colPath);
    }
  };

  const toggleRecurringItemActive = async (item: RecurringItem) => {
    const { user: u, hid } = requireContext();
    const colPath = `households/${hid}/recurringItems`;
    try {
      await commitOfflineSafe(
        updateDoc(doc(db, colPath, item.id), {
          active: !item.active,
          updatedByUid: u.uid,
          updatedByName: currentAuthorName,
          updatedAt: serverTimestamp(),
        })
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `${colPath}/${item.id}`);
    }
  };

  const deleteRecurringItem = async (id: string) => {
    const { hid } = requireContext();
    const colPath = `households/${hid}/recurringItems`;
    try {
      await commitOfflineSafe(deleteDoc(doc(db, colPath, assertValidId(id))));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `${colPath}/${id}`);
    }
  };

  const settleRecurringItemForMonth = async (
    item: RecurringItem,
    monthKey: string,
    overrideAmount?: number,
    status: TransactionStatus = 'Pago'
  ) => {
    const amount = overrideAmount !== undefined ? overrideAmount : item.amount;
    const date = buildDateInMonth(monthKey, item.dayOfMonth);
    await saveTransaction({
      type: item.type,
      description: item.description,
      plannedAmount: item.amount,
      actualAmount: amount,
      category: item.category,
      person: item.person,
      date,
      paymentMethod: item.paymentMethod,
      accountOrCard: item.accountOrCard,
      cardId: item.cardId,
      status,
      dueDate: status === 'Pendente' ? date : '',
      notes: item.notes,
      recurringId: item.id,
      recurringMonthKey: monthKey,
    });
  };

  const setPaymentReminderStatus = async (params: {
    status: TransactionStatus;
    tx?: Transaction;
    recurringItem?: RecurringItem;
    card?: CreditCard;
    monthKey: string;
    amount: number;
    dueDate: string;
  }) => {
    const { status, tx, recurringItem, card, monthKey, amount, dueDate } = params;
    if (tx) {
      await setTransactionStatus(tx, status);
      return;
    }

    if (recurringItem) {
      const existing = transactions.find(
        (t) => t.recurringId === recurringItem.id && t.recurringMonthKey === monthKey
      );
      if (existing) {
        await setTransactionStatus(existing, status);
        return;
      }
      if (status === 'Pago') {
        await settleRecurringItemForMonth(recurringItem, monthKey, amount, 'Pago');
      } else {
        await settleRecurringItemForMonth(recurringItem, monthKey, amount, 'Pendente');
      }
      return;
    }

    if (card) {
      const markerId = `card-invoice-${card.id}`;
      const existingMarker = transactions.find(
        (t) => t.recurringId === markerId && t.recurringMonthKey === monthKey
      );
      if (existingMarker) {
        await setTransactionStatus(existingMarker, status);
        return;
      }
      await saveTransaction({
        type: 'Transferência',
        description: `Pagamento fatura ${card.name}`,
        plannedAmount: amount,
        actualAmount: amount,
        category: 'Cartão',
        person: card.holder || currentPartnerName,
        date: dueDate,
        paymentMethod: 'Pix',
        accountOrCard: card.name,
        cardId: card.id,
        status,
        dueDate,
        notes: `Referência fatura ${monthKey}`,
        recurringId: markerId,
        recurringMonthKey: monthKey,
      });
    }
  };

  const saveIncome = async (input: Parameters<typeof validateIncomeInput>[0], existingId?: string) => {
    const { user: u, hid } = requireContext();
    const clean = validateIncomeInput(input);
    const colPath = `households/${hid}/incomes`;
    try {
      if (existingId) {
        const id = assertValidId(existingId);
        await commitOfflineSafe(
          updateDoc(doc(db, colPath, id), {
            ...clean,
            updatedByUid: u.uid,
            updatedByName: currentAuthorName,
            updatedAt: serverTimestamp(),
          })
        );
      } else {
        const newRef = doc(collection(db, colPath));
        await commitOfflineSafe(
          setDoc(newRef, {
            ...clean,
            createdByUid: u.uid,
            createdByName: currentAuthorName,
            updatedByUid: u.uid,
            updatedByName: currentAuthorName,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        );
      }
    } catch (err) {
      handleFirestoreError(err, existingId ? OperationType.UPDATE : OperationType.CREATE, colPath);
    }
  };

  const deleteIncome = async (id: string) => {
    const { hid } = requireContext();
    const colPath = `households/${hid}/incomes`;
    try {
      await commitOfflineSafe(deleteDoc(doc(db, colPath, assertValidId(id))));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `${colPath}/${id}`);
    }
  };

  const saveCard = async (input: Parameters<typeof validateCardInput>[0], existingId?: string) => {
    const { user: u, hid } = requireContext();
    const clean = validateCardInput(input);
    const colPath = `households/${hid}/cards`;
    try {
      if (existingId) {
        const id = assertValidId(existingId);
        await commitOfflineSafe(
          updateDoc(doc(db, colPath, id), {
            ...clean,
            updatedByUid: u.uid,
            updatedByName: currentAuthorName,
            updatedAt: serverTimestamp(),
          })
        );
      } else {
        const newRef = doc(collection(db, colPath));
        await commitOfflineSafe(
          setDoc(newRef, {
            ...clean,
            createdByUid: u.uid,
            createdByName: currentAuthorName,
            updatedByUid: u.uid,
            updatedByName: currentAuthorName,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        );
      }
    } catch (err) {
      handleFirestoreError(err, existingId ? OperationType.UPDATE : OperationType.CREATE, colPath);
    }
  };

  const deleteCard = async (id: string) => {
    const { hid } = requireContext();
    const colPath = `households/${hid}/cards`;
    try {
      await commitOfflineSafe(deleteDoc(doc(db, colPath, assertValidId(id))));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `${colPath}/${id}`);
    }
  };

  const saveInstallment = async (
    input: Parameters<typeof validateInstallmentInput>[0],
    existingId?: string
  ) => {
    const { user: u, hid } = requireContext();
    const clean = validateInstallmentInput(input);
    const colPath = `households/${hid}/installments`;
    try {
      if (existingId) {
        const id = assertValidId(existingId);
        await commitOfflineSafe(
          updateDoc(doc(db, colPath, id), {
            ...clean,
            updatedByUid: u.uid,
            updatedByName: currentAuthorName,
            updatedAt: serverTimestamp(),
          })
        );
      } else {
        const newRef = doc(collection(db, colPath));
        await commitOfflineSafe(
          setDoc(newRef, {
            ...clean,
            createdByUid: u.uid,
            createdByName: currentAuthorName,
            updatedByUid: u.uid,
            updatedByName: currentAuthorName,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        );
      }
    } catch (err) {
      handleFirestoreError(err, existingId ? OperationType.UPDATE : OperationType.CREATE, colPath);
    }
  };

  const deleteInstallment = async (id: string) => {
    const { hid } = requireContext();
    const colPath = `households/${hid}/installments`;
    try {
      await commitOfflineSafe(deleteDoc(doc(db, colPath, assertValidId(id))));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `${colPath}/${id}`);
    }
  };

  const saveGoal = async (input: Parameters<typeof validateGoalInput>[0], existingId?: string) => {
    const { user: u, hid } = requireContext();
    const clean = validateGoalInput(input);
    const colPath = `households/${hid}/goals`;
    try {
      if (existingId) {
        const id = assertValidId(existingId);
        await commitOfflineSafe(
          updateDoc(doc(db, colPath, id), {
            ...clean,
            updatedByUid: u.uid,
            updatedByName: currentAuthorName,
            updatedAt: serverTimestamp(),
          })
        );
      } else {
        const newRef = doc(collection(db, colPath));
        await commitOfflineSafe(
          setDoc(newRef, {
            ...clean,
            createdByUid: u.uid,
            createdByName: currentAuthorName,
            updatedByUid: u.uid,
            updatedByName: currentAuthorName,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        );
      }
    } catch (err) {
      handleFirestoreError(err, existingId ? OperationType.UPDATE : OperationType.CREATE, colPath);
    }
  };

  const deleteGoal = async (id: string) => {
    const { hid } = requireContext();
    const colPath = `households/${hid}/goals`;
    try {
      await commitOfflineSafe(deleteDoc(doc(db, colPath, assertValidId(id))));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `${colPath}/${id}`);
    }
  };

  const addGoalMovement = async (input: Parameters<typeof validateGoalMovementInput>[0]) => {
    const { user: u, hid } = requireContext();
    const clean = validateGoalMovementInput(input);
    const goal = goals.find((g) => g.id === clean.goalId);
    if (!goal) throw new Error('Objetivo não encontrado.');

    const nextAmount =
      clean.type === 'Depósito'
        ? Math.min(100000000, Math.round((goal.currentAmount + clean.amount) * 100) / 100)
        : Math.max(0, Math.round((goal.currentAmount - clean.amount) * 100) / 100);

    const movRef = doc(collection(db, `households/${hid}/goalMovements`));
    const goalRef = doc(db, `households/${hid}/goals`, clean.goalId);

    try {
      const batch = writeBatch(db);
      batch.set(movRef, {
        ...clean,
        createdByUid: u.uid,
        createdByName: currentAuthorName,
        createdAt: serverTimestamp(),
      });
      batch.update(goalRef, {
        currentAmount: nextAmount,
        updatedByUid: u.uid,
        updatedByName: currentAuthorName,
        updatedAt: serverTimestamp(),
      });
      await commitOfflineSafe(batch.commit());
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `households/${hid}/goalMovements`);
    }
  };

  const deleteGoalMovement = async (movement: GoalMovement) => {
    const { user: u, hid } = requireContext();
    const goal = goals.find((g) => g.id === movement.goalId);
    const movRef = doc(db, `households/${hid}/goalMovements`, assertValidId(movement.id));

    try {
      const batch = writeBatch(db);
      batch.delete(movRef);
      if (goal) {
        const delta = movement.type === 'Depósito' ? -movement.amount : movement.amount;
        const nextAmount = Math.max(0, Math.round((goal.currentAmount + delta) * 100) / 100);
        batch.update(doc(db, `households/${hid}/goals`, goal.id), {
          currentAmount: nextAmount,
          updatedByUid: u.uid,
          updatedByName: currentAuthorName,
          updatedAt: serverTimestamp(),
        });
      }
      await commitOfflineSafe(batch.commit());
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `households/${hid}/goalMovements/${movement.id}`);
    }
  };

  const savePlannedPurchase = async (
    input: Parameters<typeof validatePlannedPurchaseInput>[0],
    existingId?: string
  ) => {
    const { user: u, hid } = requireContext();
    const clean = validatePlannedPurchaseInput(input);
    const colPath = `households/${hid}/plannedPurchases`;
    try {
      if (existingId) {
        const id = assertValidId(existingId);
        await commitOfflineSafe(
          updateDoc(doc(db, colPath, id), {
            ...clean,
            updatedByUid: u.uid,
            updatedByName: currentAuthorName,
            updatedAt: serverTimestamp(),
          })
        );
      } else {
        const newRef = doc(collection(db, colPath));
        await commitOfflineSafe(
          setDoc(newRef, {
            ...clean,
            createdByUid: u.uid,
            createdByName: currentAuthorName,
            updatedByUid: u.uid,
            updatedByName: currentAuthorName,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        );
      }
    } catch (err) {
      handleFirestoreError(err, existingId ? OperationType.UPDATE : OperationType.CREATE, colPath);
    }
  };

  const deletePlannedPurchase = async (id: string) => {
    const { hid } = requireContext();
    const colPath = `households/${hid}/plannedPurchases`;
    try {
      await commitOfflineSafe(deleteDoc(doc(db, colPath, assertValidId(id))));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `${colPath}/${id}`);
    }
  };

  const saveScenario = async (input: Parameters<typeof validateScenarioInput>[0], existingId?: string) => {
    const { user: u, hid } = requireContext();
    const clean = validateScenarioInput(input);
    const colPath = `households/${hid}/scenarios`;
    try {
      if (existingId) {
        const id = assertValidId(existingId);
        await commitOfflineSafe(
          updateDoc(doc(db, colPath, id), {
            ...clean,
            updatedByUid: u.uid,
            updatedByName: currentAuthorName,
            updatedAt: serverTimestamp(),
          })
        );
      } else {
        const newRef = doc(collection(db, colPath));
        await commitOfflineSafe(
          setDoc(newRef, {
            ...clean,
            createdByUid: u.uid,
            createdByName: currentAuthorName,
            updatedByUid: u.uid,
            updatedByName: currentAuthorName,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        );
      }
    } catch (err) {
      handleFirestoreError(err, existingId ? OperationType.UPDATE : OperationType.CREATE, colPath);
    }
  };

  const deleteScenario = async (id: string) => {
    const { hid } = requireContext();
    const colPath = `households/${hid}/scenarios`;
    try {
      await commitOfflineSafe(deleteDoc(doc(db, colPath, assertValidId(id))));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `${colPath}/${id}`);
    }
  };

  const addAiMessage = async (input: Parameters<typeof validateAiMessageInput>[0]) => {
    const { user: u, hid } = requireContext();
    const clean = validateAiMessageInput(input);
    const colPath = `households/${hid}/aiMessages`;
    try {
      const newRef = doc(collection(db, colPath));
      await commitOfflineSafe(
        setDoc(newRef, {
          ...clean,
          createdByUid: u.uid,
          createdByName: currentAuthorName,
          createdAt: serverTimestamp(),
        })
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, colPath);
    }
  };

  const clearAiMessages = async () => {
    const { hid } = requireContext();
    const colPath = `households/${hid}/aiMessages`;
    try {
      const batch = writeBatch(db);
      for (const msg of aiMessages) {
        batch.delete(doc(db, colPath, assertValidId(msg.id)));
      }
      await commitOfflineSafe(batch.commit());
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, colPath);
    }
  };

  // Bank Accounts
  const saveBankAccount = async (input: Parameters<typeof validateBankAccountInput>[0], existingId?: string) => {
    const { user: u, hid } = requireContext();
    const clean = validateBankAccountInput(input);
    const colPath = `households/${hid}/bankAccounts`;
    try {
      if (existingId) {
        const id = assertValidId(existingId);
        await commitOfflineSafe(
          updateDoc(doc(db, colPath, id), {
            ...clean,
            updatedByUid: u.uid,
            updatedByName: currentAuthorName,
            updatedAt: serverTimestamp(),
          })
        );
      } else {
        const newRef = doc(collection(db, colPath));
        await commitOfflineSafe(
          setDoc(newRef, {
            ...clean,
            createdByUid: u.uid,
            createdByName: currentAuthorName,
            updatedByUid: u.uid,
            updatedByName: currentAuthorName,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        );
      }
    } catch (err) {
      handleFirestoreError(err, existingId ? OperationType.UPDATE : OperationType.CREATE, colPath);
    }
  };

  const deleteBankAccount = async (id: string) => {
    const { hid } = requireContext();
    const colPath = `households/${hid}/bankAccounts`;
    try {
      await commitOfflineSafe(deleteDoc(doc(db, colPath, assertValidId(id))));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `${colPath}/${id}`);
    }
  };

  const value: AuthHouseholdContextValue = {
    user,
    authReady,
    userProfile,
    household,
    householdLoading,
    dataLoading,
    hasPendingSync,
    isUsingCachedData,
    lastOfflineCacheAt,
    invites,
    transactions,
    recurringItems,
    incomes,
    cards,
    installments,
    goals,
    goalMovements,
    plannedPurchases,
    scenarios,
    aiMessages,
    bankAccounts,
    currentPartnerName,
    currentAuthorName,
    currentUsernameLabel,
    signInWithCredentials,
    registerWithCredentials,
    signInWithGoogle,
    logout,
    createHousehold,
    joinHouseholdWithCode,
    updateHouseholdSettings,
    addHouseholdCategory,
    createInviteCode,
    deleteInviteCode,
    removeMember,
    saveTransaction,
    saveTransactionWithRecurrence,
    toggleTransactionStatus,
    setTransactionStatus,
    setPaymentReminderStatus,
    deleteTransaction,
    saveRecurringItem,
    toggleRecurringItemActive,
    deleteRecurringItem,
    settleRecurringItemForMonth,
    saveIncome,
    deleteIncome,
    saveCard,
    deleteCard,
    saveInstallment,
    deleteInstallment,
    saveGoal,
    deleteGoal,
    addGoalMovement,
    deleteGoalMovement,
    savePlannedPurchase,
    deletePlannedPurchase,
    saveScenario,
    deleteScenario,
    addAiMessage,
    clearAiMessages,
    saveBankAccount,
    deleteBankAccount,
  };

  return <AuthHouseholdContext.Provider value={value}>{children}</AuthHouseholdContext.Provider>;
}

export function useFinance() {
  const ctx = useContext(AuthHouseholdContext);
  if (!ctx) throw new Error('useFinance deve ser usado dentro de AuthHouseholdProvider.');
  return ctx;
}
