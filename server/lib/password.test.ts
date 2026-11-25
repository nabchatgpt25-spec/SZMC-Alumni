import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { hashPasswordServer, verifyPasswordServer } from './password.ts';

describe('server/lib/password', () => {
  it('hashes passwords with unique per-user scrypt salts', () => {
    const h1 = hashPasswordServer('SecretPass123!');
    const h2 = hashPasswordServer('SecretPass123!');
    assert.ok(h1.startsWith('scrypt:'));
    assert.ok(h2.startsWith('scrypt:'));
    assert.notEqual(h1, h2);
    assert.equal(verifyPasswordServer(h1, 'SecretPass123!'), true);
    assert.equal(verifyPasswordServer(h1, 'WrongPass'), false);
  });

  it('rejects null, undefined, or empty stored hashes instead of bypassing auth', () => {
    assert.equal(verifyPasswordServer(null, 'anything'), false);
    assert.equal(verifyPasswordServer(undefined, 'anything'), false);
    assert.equal(verifyPasswordServer('', 'anything'), false);
    assert.equal(verifyPasswordServer('   ', ''), false);
  });

  it('remains backward-compatible with legacy sha256: hashes', () => {
    const legacyHex = crypto
      .createHash('sha256')
      .update('ndc_dhaka_1949_salt_v1:' + 'LegacyPass99')
      .digest('hex');
    const legacyStored = `sha256:${legacyHex}`;
    assert.equal(verifyPasswordServer(legacyStored, 'LegacyPass99'), true);
    assert.equal(verifyPasswordServer(legacyStored, 'WrongPass'), false);
  });
});
