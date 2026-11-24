import type {
  BankAccount,
  CreditCard,
  Goal,
  GoalMovement,
  Household,
  Income,
  Installment,
  PlannedPurchase,
  RecurringItem,
  Scenario,
  Transaction,
  UserProfile,
} from '../types/finance';

export interface FinanceCachedCollections {
  userProfile: UserProfile | null;
  household: Household | null;
  bankAccounts: BankAccount[];
  transactions: Transaction[];
  recurringItems: RecurringItem[];
  incomes: Income[];
  cards: CreditCard[];
  installments: Installment[];
  goals: Goal[];
  goalMovements: GoalMovement[];
  plannedPurchases: PlannedPurchase[];
  scenarios: Scenario[];
}

export interface FinanceOfflineSnapshot extends FinanceCachedCollections {
  uid: string;
  cachedAt: string;
}

const DB_NAME = 'duofin-offline-cache';
const DB_VERSION = 1;
const STORE_NAME = 'financeSnapshots';
const LOCAL_STORAGE_PREFIX = 'duofin_offline_cache_v1:';

function isTimestampLike(value: unknown): value is { toDate: () => Date } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'toDate' in value &&
    typeof (value as { toDate?: unknown }).toDate === 'function'
  );
}

function isPlainSecondsTimestamp(value: unknown): value is { seconds: number; nanoseconds?: number } {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.seconds === 'number' && Number.isFinite(record.seconds);
}

/**
 * Converte instâncias do Firestore (Timestamp, FieldValue) e Date em valores
 * planos compatíveis com structuredClone (IndexedDB, inclusive Safari/WebKit) e JSON.
 */
export function sanitizeForOfflineCache<T>(value: T): T {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (value instanceof Date) {
    return (Number.isNaN(value.getTime()) ? null : value.toISOString()) as unknown as T;
  }

  if (isTimestampLike(value)) {
    try {
      const converted = value.toDate();
      return (converted instanceof Date && !Number.isNaN(converted.getTime())
        ? converted.toISOString()
        : null) as unknown as T;
    } catch {
      return null as unknown as T;
    }
  }

  if (isPlainSecondsTimestamp(value)) {
    const ms = value.seconds * 1000 + Math.floor((value.nanoseconds ?? 0) / 1_000_000);
    const d = new Date(ms);
    return (Number.isNaN(d.getTime()) ? null : d.toISOString()) as unknown as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForOfflineCache(item)) as unknown as T;
  }

  if (typeof value === 'object') {
    // Firestore FieldValue sentinels (ex: serverTimestamp()) não devem ser clonados crus
    const record = value as Record<string, unknown>;
    if (typeof record._methodName === 'string') {
      return null as unknown as T;
    }

    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(record)) {
      if (entry === undefined || typeof entry === 'function' || typeof entry === 'symbol') {
        continue;
      }
      out[key] = sanitizeForOfflineCache(entry);
    }
    return out as T;
  }

  return null as unknown as T;
}

export function buildOfflineSnapshot(
  uid: string,
  collections: FinanceCachedCollections,
  cachedAt: string = new Date().toISOString()
): FinanceOfflineSnapshot {
  return {
    uid,
    cachedAt,
    userProfile: sanitizeForOfflineCache(collections.userProfile),
    household: sanitizeForOfflineCache(collections.household),
    bankAccounts: sanitizeForOfflineCache(collections.bankAccounts),
    transactions: sanitizeForOfflineCache(collections.transactions),
    recurringItems: sanitizeForOfflineCache(collections.recurringItems),
    incomes: sanitizeForOfflineCache(collections.incomes),
    cards: sanitizeForOfflineCache(collections.cards),
    installments: sanitizeForOfflineCache(collections.installments),
    goals: sanitizeForOfflineCache(collections.goals),
    goalMovements: sanitizeForOfflineCache(collections.goalMovements),
    plannedPurchases: sanitizeForOfflineCache(collections.plannedPurchases),
    scenarios: sanitizeForOfflineCache(collections.scenarios),
  };
}

/**
 * Evita apagar os últimos saldos e lançamentos hidratados do IndexedDB quando o dispositivo
 * inicia offline e o Firestore ainda retorna snapshot local vazio.
 */
export function shouldPreserveCachedDataOnSnapshot(params: {
  isOffline: boolean;
  fromCache: boolean;
  snapshotEmpty: boolean;
  hasHydratedCache: boolean;
}): boolean {
  return params.isOffline && params.fromCache && params.snapshotEmpty && params.hasHydratedCache;
}

function getLocalStorageKey(uid: string): string {
  return `${LOCAL_STORAGE_PREFIX}${uid}`;
}

function readFromLocalStorageFallback(uid: string): FinanceOfflineSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(getLocalStorageKey(uid));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FinanceOfflineSnapshot;
    if (!parsed || parsed.uid !== uid) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeToLocalStorageFallback(snapshot: FinanceOfflineSnapshot): boolean {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(getLocalStorageKey(snapshot.uid), JSON.stringify(snapshot));
    return true;
  } catch {
    return false;
  }
}

function removeFromLocalStorageFallback(uid?: string): void {
  if (typeof window === 'undefined') return;
  try {
    if (uid) {
      window.localStorage.removeItem(getLocalStorageKey(uid));
      return;
    }
    const keysToRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(LOCAL_STORAGE_PREFIX)) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    // Ignore storage errors
  }
}

function openOfflineCacheDB(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || typeof window.indexedDB === 'undefined') {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'uid' });
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        resolve(null);
      };

      request.onblocked = () => {
        resolve(null);
      };
    } catch {
      resolve(null);
    }
  });
}

export async function readFinanceOfflineCache(uid: string): Promise<FinanceOfflineSnapshot | null> {
  if (!uid) return null;

  const db = await openOfflineCacheDB();
  if (db) {
    try {
      const result = await new Promise<FinanceOfflineSnapshot | null>((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(uid);

        req.onsuccess = () => {
          const val = req.result as FinanceOfflineSnapshot | undefined;
          resolve(val && val.uid === uid ? val : null);
        };
        req.onerror = () => resolve(null);
        tx.onabort = () => resolve(null);
      });
      db.close();
      if (result) return result;
    } catch {
      try {
        db.close();
      } catch {
        // Ignore close error
      }
    }
  }

  return readFromLocalStorageFallback(uid);
}

export async function writeFinanceOfflineCache(
  uid: string,
  collections: FinanceCachedCollections
): Promise<string | null> {
  if (!uid) return null;

  const snapshot = buildOfflineSnapshot(uid, collections);
  const db = await openOfflineCacheDB();

  if (db) {
    try {
      const ok = await new Promise<boolean>((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.put(snapshot);

        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
        tx.onabort = () => resolve(false);
      });
      db.close();
      if (ok) {
        return snapshot.cachedAt;
      }
    } catch {
      try {
        db.close();
      } catch {
        // Ignore close error
      }
    }
  }

  return writeToLocalStorageFallback(snapshot) ? snapshot.cachedAt : null;
}

export async function clearFinanceOfflineCache(uid?: string): Promise<void> {
  removeFromLocalStorageFallback(uid);

  const db = await openOfflineCacheDB();
  if (!db) return;

  try {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      if (uid) {
        store.delete(uid);
      } else {
        store.clear();
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } catch {
    // Ignore IDB clear errors
  } finally {
    try {
      db.close();
    } catch {
      // Ignore close error
    }
  }
}
