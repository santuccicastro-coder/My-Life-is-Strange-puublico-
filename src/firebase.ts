import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  doc,
  getDocFromServer,
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  persistentSingleTabManager,
  type Firestore,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

const isBrowser = typeof window !== 'undefined';

function createFirestoreClient(): Firestore {
  const transportSettings = isBrowser ? { experimentalForceLongPolling: true } : {};

  try {
    return initializeFirestore(
      app,
      {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
        ...transportSettings,
      },
      firebaseConfig.firestoreDatabaseId
    );
  } catch {
    try {
      return initializeFirestore(
        app,
        {
          localCache: persistentLocalCache({
            tabManager: persistentSingleTabManager({ forceOwnership: false }),
          }),
          ...transportSettings,
        },
        firebaseConfig.firestoreDatabaseId
      );
    } catch {
      return getFirestore(app, firebaseConfig.firestoreDatabaseId);
    }
  }
}

export const db = createFirestoreClient();
export const auth = getAuth(app);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function isOfflineOrUnavailableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code =
    'code' in error && typeof (error as { code?: unknown }).code === 'string'
      ? (error as { code: string }).code.toLowerCase()
      : '';
  const message = error.message.toLowerCase();
  return (
    code === 'unavailable' ||
    message.includes('the client is offline') ||
    message.includes('could not reach cloud firestore backend') ||
    message.includes('network error')
  );
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid ?? null,
      email: auth.currentUser?.email ?? null,
      emailVerified: auth.currentUser?.emailVerified ?? null,
      isAnonymous: auth.currentUser?.isAnonymous ?? null,
      tenantId: auth.currentUser?.tenantId ?? null,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return;
  }

  const probe = () => getDocFromServer(doc(db, 'test', 'connection'));

  try {
    await probe();
  } catch (error) {
    if (!isOfflineOrUnavailableError(error)) {
      return;
    }

    // Aguarda a inicialização de rede/long-polling antes de concluir que o cliente está offline
    await new Promise((resolve) => setTimeout(resolve, 1500));
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return;
    }

    try {
      await probe();
    } catch (retryError) {
      if (isOfflineOrUnavailableError(retryError)) {
        console.warn('Firestore operando em modo offline temporário; dados locais permanecerão disponíveis.');
      }
    }
  }
}

void testConnection();
