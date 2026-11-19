import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildOfflineSnapshot,
  sanitizeForOfflineCache,
  shouldPreserveCachedDataOnSnapshot,
} from './offlineCache.ts';

describe('Offline-First Workbox & IndexedDB Cache Strategy', () => {
  const viteConfig = fs.readFileSync('vite.config.ts', 'utf8');
  const firebaseClient = fs.readFileSync('src/firebase.ts', 'utf8');

  it('configures Workbox Offline-First caching, SPA navigateFallback, and Firestore/API NetworkOnly bypass in vite.config.ts', () => {
    assert.match(viteConfig, /cleanupOutdatedCaches:\s*true/);
    assert.match(viteConfig, /skipWaiting:\s*true/);
    assert.match(viteConfig, /clientsClaim:\s*true/);
    assert.match(viteConfig, /navigateFallback:\s*'index\.html'/);
    assert.match(viteConfig, /handler:\s*'CacheFirst'/);
    assert.match(viteConfig, /duofin-google-fonts-stylesheets/);
    assert.match(viteConfig, /duofin-google-fonts-webfonts/);
    assert.match(viteConfig, /duofin-static-assets/);
    assert.match(viteConfig, /duofin-media-cache/);
    assert.match(viteConfig, /firestore\|identitytoolkit\|securetoken\|firebaseinstallations/);
    assert.match(viteConfig, /handler:\s*'NetworkOnly'/);
    assert.match(viteConfig, /devOptions:\s*\{[\s\S]*enabled:\s*true/);
  });

  it('configures Firestore IndexedDB persistentLocalCache with multi-tab and single-tab fallback', () => {
    assert.match(firebaseClient, /persistentLocalCache/);
    assert.match(firebaseClient, /persistentMultipleTabManager/);
    assert.match(firebaseClient, /persistentSingleTabManager/);
    assert.match(firebaseClient, /firebaseConfig\.firestoreDatabaseId/);
  });

  it('sanitizes Firestore Timestamp and serverTimestamp sentinels cleanly for IndexedDB snapshot caching', () => {
    const fakeTimestamp = { toDate: () => new Date('2026-11-19T09:00:00.000Z') };
    const fakeSentinel = { _methodName: 'serverTimestamp' };
    const clean = sanitizeForOfflineCache({
      amount: 120.5,
      createdAt: fakeTimestamp,
      pendingAt: fakeSentinel,
      nested: [{ seconds: 1700000000, nanoseconds: 0 }],
    });

    assert.equal(clean.amount, 120.5);
    assert.equal(clean.createdAt, '2026-11-19T09:00:00.000Z');
    assert.equal(clean.pendingAt, null);
    assert.equal(typeof (clean.nested as unknown[])[0], 'string');

    const snapshot = buildOfflineSnapshot('user-1', {
      userProfile: null,
      household: null,
      bankAccounts: [],
      transactions: [],
      recurringItems: [],
      incomes: [],
      cards: [],
      installments: [],
      goals: [],
      goalMovements: [],
      plannedPurchases: [],
      scenarios: [],
      aiMessages: [],
    });
    assert.equal(snapshot.uid, 'user-1');
    assert.ok(snapshot.cachedAt.length > 10);
  });

  it('preserves previously synced IndexedDB collections when offline snapshot starts empty', () => {
    assert.equal(
      shouldPreserveCachedDataOnSnapshot({
        isOffline: true,
        fromCache: true,
        snapshotEmpty: true,
        hasHydratedCache: true,
      }),
      true
    );
    assert.equal(
      shouldPreserveCachedDataOnSnapshot({
        isOffline: false,
        fromCache: false,
        snapshotEmpty: true,
        hasHydratedCache: true,
      }),
      false
    );
  });
});
