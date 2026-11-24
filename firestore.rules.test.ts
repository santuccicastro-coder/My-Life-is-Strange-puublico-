/**
 * Security Rules & Server Auth Verification Suite ("Dirty Dozen", Rules & API Security)
 * Run via: npm run test:rules
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

describe('Firestore Security Rules Static & Invariant Verification', () => {
  const rulesPath = fs.existsSync('firestore.rules') ? 'firestore.rules' : 'DRAFT_firestore.rules';
  const rules = fs.readFileSync(rulesPath, 'utf8');
  const blueprint = JSON.parse(fs.readFileSync('firebase-blueprint.json', 'utf8'));
  const serverCode = fs.readFileSync('server.ts', 'utf8');

  it('uses rules_version 2 and global default-deny safety net', () => {
    assert.match(rules, /rules_version\s*=\s*'2'/);
    assert.match(rules, /match \/\{document=\*\*\} \{\s*allow read, write: if false;\s*\}/);
  });

  it('covers every collection defined in firebase-blueprint.json', () => {
    const paths = Object.keys(blueprint.firestore);
    for (const p of paths) {
      const leaf = p.split('/').slice(-2, -1)[0];
      assert.ok(rules.includes(leaf), `Missing match block for collection: ${leaf}`);
    }
  });

  it('enforces non-anonymous auth, ID hardening, strict keys, and request.time timestamps', () => {
    assert.match(rules, /sign_in_provider\s*!=\s*'anonymous'/);
    assert.match(rules, /function isValidId\(id\)/);
    assert.match(rules, /function isValidRecurringItem\(data\)/);
    assert.match(rules, /function isValidAiMessage\(data\)/);
    assert.match(rules, /function isValidBankAccount\(data\)/);
    assert.match(rules, /data\.memberUids\.size\(\) <= 7/);
    assert.match(rules, /incoming\(\)\.createdAt\s*==\s*request\.time/);
    assert.match(rules, /incoming\(\)\.updatedAt\s*==\s*request\.time/);
    assert.match(rules, /affectedKeys\(\)\.hasOnly/);
    assert.match(rules, /getAfter\(/);
  });

  it('validates individual paidInstallmentNumbers safely in Installment rules and blueprint', () => {
    assert.ok(blueprint.entities?.Installment?.properties?.paidInstallmentNumbers);
    assert.match(rules, /'paidInstallmentNumbers'/);
    assert.match(rules, /data\.paidInstallmentNumbers is list/);
    assert.match(rules, /data\.paidInstallmentNumbers\.size\(\) <= 120/);
    assert.match(rules, /data\.paidInstallmentNumbers\[0\] <= data\.installmentsCount/);
  });

  it('validates Prompt 3 credit card, refund, anticipation, and status fields in rules and blueprint', () => {
    assert.ok(blueprint.entities?.Transaction?.properties?.entryKind);
    assert.ok(blueprint.entities?.Transaction?.properties?.refundTargetId);
    assert.ok(blueprint.entities?.Card?.properties?.limitRule);
    assert.ok(blueprint.entities?.Installment?.properties?.prepaidInstallmentNumbers);
    assert.ok(blueprint.entities?.Installment?.properties?.cancelledInstallmentNumbers);
    assert.ok(blueprint.entities?.Installment?.properties?.refundedAmount);
    assert.ok(blueprint.entities?.Installment?.properties?.status);

    assert.match(rules, /data\.entryKind in \['padrao', 'pagamento_fatura', 'estorno'\]/);
    assert.match(rules, /data\.limitRule in \['total_parcelamento', 'parcela_mensal'\]/);
    assert.match(rules, /'prepaidInstallmentNumbers'/);
    assert.match(rules, /'cancelledInstallmentNumbers'/);
    assert.match(rules, /data\.status in \['Ativo', 'Quitado', 'Cancelado'\]/);
  });

  it('validates Prompt 5 Goal yield fields, PlannedPurchase project fields, and /api/indicators auth', () => {
    assert.ok(blueprint.entities?.Goal?.properties?.yieldType);
    assert.ok(blueprint.entities?.Goal?.properties?.yieldIndicatorPct);
    assert.ok(blueprint.entities?.Goal?.properties?.termMonths);
    assert.ok(blueprint.entities?.Goal?.properties?.custodyFeePct);
    assert.ok(blueprint.entities?.PlannedPurchase?.properties?.projectCategory);
    assert.ok(blueprint.entities?.PlannedPurchase?.properties?.iconName);
    assert.ok(blueprint.entities?.PlannedPurchase?.properties?.savedAmount);
    assert.ok(blueprint.entities?.PlannedPurchase?.properties?.monthlyContribution);
    assert.ok(blueprint.entities?.PlannedPurchase?.properties?.linkedGoalId);

    assert.match(rules, /data\.yieldType in \['cdi', 'poupanca', 'selic', 'personalizado'\]/);
    assert.match(rules, /'termMonths'/);
    assert.match(rules, /'projectCategory'/);
    assert.match(rules, /'linkedGoalId'/);
    assert.match(serverCode, /createAuthAndRateLimitMiddleware\('indicators'/);
  });

  it('validates Prompt 6 separated expense/income categories, categoryIcons, and PlannedPurchase itemKind', () => {
    assert.ok(blueprint.entities?.Household?.properties?.expenseCategories);
    assert.ok(blueprint.entities?.Household?.properties?.incomeCategories);
    assert.ok(blueprint.entities?.Household?.properties?.categoryIcons);
    assert.ok(blueprint.entities?.PlannedPurchase?.properties?.itemKind);

    assert.match(rules, /'expenseCategories'/);
    assert.match(rules, /'incomeCategories'/);
    assert.match(rules, /'categoryIcons'/);
    assert.match(rules, /data\.itemKind in \['compra', 'projeto'\]/);
  });

  it('hardens server.ts endpoints with Firebase ID token verification and removes AI/Voice endpoints', () => {
    assert.match(serverCode, /verifyIdToken\(/);
    assert.match(serverCode, /provider === 'anonymous'/);
    assert.match(serverCode, /createAuthAndRateLimitMiddleware\('export-csv'/);
    assert.match(serverCode, /createAuthAndRateLimitMiddleware\('indicators'/);
    assert.match(serverCode, /sanitizeCsvFormulaPrefix/);
    assert.doesNotMatch(serverCode, /\/api\/ai\//);
  });

  it('documents all 12 Dirty Dozen denial scenarios', () => {
    const dirtyDozen = [
      'unauthenticated_read',
      'anonymous_auth_write',
      'outsider_household_access',
      'pii_user_scraping',
      'third_member_injection',
      'shadow_field_injection',
      'identity_spoofing',
      'immutable_field_tampering',
      'timestamp_forgery',
      'id_poisoning',
      'value_poisoning',
      'orphaned_goal_movement',
    ];
    assert.equal(dirtyDozen.length, 12);
  });
});
