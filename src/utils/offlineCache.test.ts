import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildOfflineSnapshot,
  sanitizeForOfflineCache,
  shouldPreserveCachedDataOnSnapshot,
} from './offlineCache.ts';

test('sanitizeForOfflineCache converts Firestore Timestamps, Dates and strips FieldValue sentinels', () => {
  const input = {
    id: 'tx-1',
    amount: 120.5,
    createdAt: { toDate: () => new Date('2026-11-17T10:30:00.000Z') },
    updatedAt: { seconds: 1794911400, nanoseconds: 0 },
    pendingServerTs: { _methodName: 'serverTimestamp' },
    ignoredFn: () => 'skip',
    localDate: new Date('2026-11-17T12:00:00.000Z'),
    nested: [
      {
        when: { toDate: () => new Date('2026-11-16T08:00:00.000Z') },
        optional: undefined,
      },
    ],
  };

  const sanitized = sanitizeForOfflineCache(input) as Record<string, unknown>;

  assert.equal(sanitized.id, 'tx-1');
  assert.equal(sanitized.amount, 120.5);
  assert.equal(sanitized.createdAt, '2026-11-17T10:30:00.000Z');
  assert.equal(typeof sanitized.updatedAt, 'string');
  assert.equal(sanitized.pendingServerTs, null);
  assert.equal('ignoredFn' in sanitized, false);
  assert.equal(sanitized.localDate, '2026-11-17T12:00:00.000Z');
  assert.deepEqual(sanitized.nested, [{ when: '2026-11-16T08:00:00.000Z' }]);
});

test('buildOfflineSnapshot stores uid, cachedAt and all financial collections cleanly', () => {
  const snapshot = buildOfflineSnapshot(
    'user-123',
    {
      userProfile: {
        uid: 'user-123',
        email: 'teste@duofin.local',
        displayName: 'Vinicius',
        photoURL: '',
        activeHouseholdId: 'hh-1',
        updatedAt: { toDate: () => new Date('2026-11-17T09:00:00.000Z') },
      },
      household: {
        id: 'hh-1',
        name: 'Casa',
        ownerUid: 'user-123',
        memberUids: ['user-123'],
        partner1Uid: 'user-123',
        partner2Uid: '',
        partner1Name: 'Vinicius',
        partner2Name: 'Parceiro',
        periodStart: '2026-11-01',
        categories: ['Mercado'],
        paymentMethods: ['Pix'],
        rooms: ['Cozinha'],
        accounts: ['Conta corrente'],
        lastInviteCode: '',
      },
      bankAccounts: [
        {
          id: 'acc-1',
          name: 'Nubank',
          institution: 'Nubank',
          type: 'Corrente',
          balance: 2450.75,
          currency: 'BRL',
          lastSyncedAt: '2026-11-17T09:00:00.000Z',
          active: true,
          createdByUid: 'user-123',
          createdByName: 'Vinicius',
          updatedByUid: 'user-123',
          updatedByName: 'Vinicius',
        },
      ],
      transactions: [
        {
          id: 'tx-1',
          type: 'Saída',
          description: 'Supermercado',
          plannedAmount: 200,
          actualAmount: 185.4,
          category: 'Mercado',
          person: 'Vinicius',
          date: '2026-11-17',
          monthKey: '2026-11',
          paymentMethod: 'Pix',
          accountOrCard: 'Nubank',
          cardId: '',
          status: 'Pago',
          dueDate: '',
          notes: '',
          createdByUid: 'user-123',
          createdByName: 'Vinicius',
          updatedByUid: 'user-123',
          updatedByName: 'Vinicius',
        },
      ],
      recurringItems: [],
      incomes: [],
      cards: [],
      installments: [],
      goals: [],
      goalMovements: [],
      plannedPurchases: [],
      scenarios: [],
      aiMessages: [],
    },
    '2026-11-17T10:00:00.000Z'
  );

  assert.equal(snapshot.uid, 'user-123');
  assert.equal(snapshot.cachedAt, '2026-11-17T10:00:00.000Z');
  assert.equal(snapshot.bankAccounts.length, 1);
  assert.equal(snapshot.bankAccounts[0].balance, 2450.75);
  assert.equal(snapshot.transactions.length, 1);
  assert.equal(snapshot.transactions[0].actualAmount, 185.4);
  assert.equal(snapshot.userProfile?.updatedAt, '2026-11-17T09:00:00.000Z');
});

test('shouldPreserveCachedDataOnSnapshot protects hydrated offline balances from empty cache snapshots', () => {
  assert.equal(
    shouldPreserveCachedDataOnSnapshot({
      isOffline: true,
      fromCache: true,
      snapshotEmpty: true,
      hasHydratedCache: true,
    }),
    true
  );

  // When online or receiving non-empty snapshot, Firestore remains authoritative
  assert.equal(
    shouldPreserveCachedDataOnSnapshot({
      isOffline: false,
      fromCache: false,
      snapshotEmpty: true,
      hasHydratedCache: true,
    }),
    false
  );
  assert.equal(
    shouldPreserveCachedDataOnSnapshot({
      isOffline: true,
      fromCache: true,
      snapshotEmpty: false,
      hasHydratedCache: true,
    }),
    false
  );
});
