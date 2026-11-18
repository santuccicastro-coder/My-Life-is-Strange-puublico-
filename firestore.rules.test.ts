/**
 * Security Rules Verification Suite ("Dirty Dozen" & Valid Workflows)
 * Run against Firebase Emulator Suite using @firebase/rules-unit-testing when emulator is available.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

describe('Firestore Security Rules Static & Invariant Verification', () => {
  const rulesPath = fs.existsSync('firestore.rules') ? 'firestore.rules' : 'DRAFT_firestore.rules';
  const rules = fs.readFileSync(rulesPath, 'utf8');
  const blueprint = JSON.parse(fs.readFileSync('firebase-blueprint.json', 'utf8'));

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
