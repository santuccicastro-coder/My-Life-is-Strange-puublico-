# Security Specification — DuoFin (Controle Financeiro do Casal)

## 1. Data Invariants
1. **PII Isolation**: `/users/{userId}` can ONLY be read (`get`) and modified (`create`, `update`) by the owning authenticated user (`request.auth.uid == userId`). `list` and `delete` are strictly denied.
2. **Household Membership Gate**: `/households/{householdId}` can contain at most 7 members (`memberUids.size() <= 7`). Only users in `memberUids` can read (`get`, `list`) the household.
3. **Invite Atomicity**: New members can only join `/households/{householdId}` when `memberUids.size() < 7` and in an atomic batch that marks `/invites/{inviteId}` as `used: true` with `usedByUid == request.auth.uid` (verified via `existsAfter` and `getAfter`).
4. **Master Gate on Subcollections**: Every subcollection under `/households/{householdId}/...` (`transactions`, `recurringItems`, `incomes`, `cards`, `installments`, `goals`, `goalMovements`, `plannedPurchases`, `scenarios`, `aiMessages`, `bankAccounts`) verifies membership against the parent `/households/{householdId}` document (`request.auth.uid in get(...).data.memberUids`).
5. **Identity & Temporal Integrity**: All writes require `isAuthenticatedUser()` (signed-in, non-anonymous user with `request.auth != null`). `createdByUid` must equal `request.auth.uid` on create and is immutable on update. `createdAt` must equal `request.time` on create and is immutable on update. `updatedAt` must equal `request.time` on create and update.
6. **Strict Schema & No Shadow Fields**: Every collection uses `isValid[Entity](incoming())` checking `keys().hasAll(...)`, `keys().hasOnly(...)`, data types, numeric bounds, enum values, and string `.size()` limits. Updates use action-based `affectedKeys().hasOnly(...)`. `installments` supports optional bounded `paidInstallmentNumbers` for individual installment settlement without breaking existing documents.
7. **Goal Movement Atomicity**: Creating a `goalMovement` requires atomically updating the parent `goal` document in the same batch (`getAfter` verifies `goals/{goalId}.updatedAt == request.time`).
8. **Backend API & WebSocket Protection**: All Express API routes (`/api/ai/chat`, `/api/ai/horizon-insight`, `/api/export-csv`) and the Gemini Live WebSocket (`/api/ai/live`) verify Firebase Auth ID tokens (rejecting anonymous users), enforce per-user/IP rate limits, validate payload dimensions, and sanitize CSV cells against formula injection.

## 2. The "Dirty Dozen" Attack Payloads
1. **Unauthenticated Read**: Read `/households/h1/transactions/t1` with `auth == null` -> `PERMISSION_DENIED`.
2. **Anonymous Auth Write**: Create transaction with anonymous provider (`sign_in_provider == 'anonymous'`) -> `PERMISSION_DENIED`.
3. **External Outsider Access**: User `uid3` (not in `memberUids`) reads `/households/h1/transactions/t1` -> `PERMISSION_DENIED`.
4. **PII Scraping**: User `uid2` attempts `list` on `/users` or `get` on `/users/uid1` -> `PERMISSION_DENIED`.
5. **Unauthorized Member Injection**: User `uid3` attempts to add themselves to `households/h1.memberUids` without a valid unused invite -> `PERMISSION_DENIED`.
6. **Shadow Field Injection**: Member `uid1` creates a transaction or recurringItem with an extra ghost field `{ isAdmin: true }` -> `PERMISSION_DENIED`.
7. **Identity Spoofing**: Member `uid1` creates a transaction with `createdByUid: "uid2"` -> `PERMISSION_DENIED`.
8. **Immutable Field Tampering**: Member `uid2` updates a transaction changing `createdByUid` or `createdAt` -> `PERMISSION_DENIED`.
9. **Client Timestamp Forgery**: Member `uid1` creates a transaction with client-supplied `createdAt: Timestamp(2020-01-01)` instead of `serverTimestamp()` (`request.time`) -> `PERMISSION_DENIED`.
10. **ID Poisoning**: Member `uid1` attempts to write to `/households/h1/transactions/bad$id` or >128 chars -> `PERMISSION_DENIED`.
11. **Value Poisoning / Exhaustion**: Member `uid1` creates a transaction with `description` of 5,000 characters or negative `actualAmount: -500` or invalid `type: "Hack"` -> `PERMISSION_DENIED`.
12. **Orphaned Goal Movement**: Member `uid1` creates a `goalMovements` entry without atomically updating the parent `goals/{goalId}` document -> `PERMISSION_DENIED`.
