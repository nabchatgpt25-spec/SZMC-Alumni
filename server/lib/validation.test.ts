import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parsePositiveInt,
  clampBoundedInt,
  cleanText,
  normalizeOptionalEmail,
  normalizeSafeHttpUrl,
  normalizeBloodGroup,
} from './validation.ts';

describe('server/lib/validation', () => {
  it('validates positive integers and clamps bounded numbers', () => {
    assert.equal(parsePositiveInt('42'), 42);
    assert.equal(parsePositiveInt(0), null);
    assert.equal(parsePositiveInt(-5), null);
    assert.equal(parsePositiveInt('abc'), null);

    assert.equal(clampBoundedInt('500', 1, 100, 20), 100);
    assert.equal(clampBoundedInt('-10', 1, 100, 20), 1);
    assert.equal(clampBoundedInt('not-a-num', 1, 100, 20), 20);
  });

  it('sanitizes control characters and rejects unsafe URL schemes', () => {
    assert.equal(cleanText('  Dr.\x00 Bashir  ', 50), 'Dr. Bashir');
    assert.equal(normalizeOptionalEmail('User@SZMC.EDU '), 'user@szmc.edu');
    assert.equal(normalizeOptionalEmail('invalid-email'), null);
    assert.equal(normalizeSafeHttpUrl('javascript:alert(1)'), null);
    assert.equal(normalizeSafeHttpUrl('https://szmcalumni.net/feed'), 'https://szmcalumni.net/feed');
    assert.equal(normalizeBloodGroup(' ab+ '), 'AB+');
    assert.equal(normalizeBloodGroup('XYZ'), null);
  });
});
