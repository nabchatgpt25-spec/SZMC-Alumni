import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SlidingRateLimiter } from './rateLimit.ts';

describe('server/lib/rateLimit', () => {
  it('allows requests within the window and blocks when limit exceeded', () => {
    const limiter = new SlidingRateLimiter();
    const baseTime = 1_000_000;
    assert.equal(limiter.check('1.2.3.4:/api/login', 2, 10_000, baseTime).allowed, true);
    assert.equal(limiter.check('1.2.3.4:/api/login', 2, 10_000, baseTime + 100).allowed, true);
    const blocked = limiter.check('1.2.3.4:/api/login', 2, 10_000, baseTime + 200);
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.remaining, 0);

    // Resets after window expiry
    const afterWindow = limiter.check('1.2.3.4:/api/login', 2, 10_000, baseTime + 11_000);
    assert.equal(afterWindow.allowed, true);
  });

  it('prunes expired buckets to avoid unbounded memory growth', () => {
    const limiter = new SlidingRateLimiter();
    limiter.check('10.0.0.1:/a', 5, 1_000, 10_000);
    limiter.check('10.0.0.2:/b', 5, 100_000, 10_000);
    assert.equal(limiter.size, 2);

    limiter.prune(20_000);
    assert.equal(limiter.size, 1);
  });
});
