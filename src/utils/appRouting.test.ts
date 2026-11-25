import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveRouteFromPushDeepLink } from './appRouting.ts';

describe('src/utils/appRouting', () => {
  it('resolves album, gallery, hash, and empty deep links cleanly', () => {
    assert.deepEqual(resolveRouteFromPushDeepLink('#album-12'), {
      nextRoute: 'gallery',
      albumId: 12,
    });
    assert.deepEqual(resolveRouteFromPushDeepLink('gallery:7'), {
      nextRoute: 'gallery',
      albumId: 7,
    });
    assert.deepEqual(resolveRouteFromPushDeepLink('#post-99'), {
      nextRoute: 'post-99',
    });
    assert.deepEqual(resolveRouteFromPushDeepLink(''), {
      nextRoute: 'feed',
    });
  });
});
