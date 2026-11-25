import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { groupFacebookNotifications } from './facebookNotifications.ts';
import type { NotificationItem } from '../types/notification.types.ts';

describe('src/utils/facebookNotifications', () => {
  it('groups multiple likes on the same post within 24 hours', () => {
    const nowIso = new Date().toISOString();
    const items: NotificationItem[] = [
      {
        id: 1,
        type: 'post_like',
        title: 'Like',
        message: 'Dr. A liked your post',
        actorId: 10,
        actorName: 'Dr. A',
        postId: 50,
        unread: true,
        timeAgo: 'Just now',
        createdAt: nowIso,
      },
      {
        id: 2,
        type: 'like',
        title: 'Like',
        message: 'Dr. B liked your post',
        actorId: 11,
        actorName: 'Dr. B',
        postId: 50,
        unread: false,
        timeAgo: 'Just now',
        createdAt: nowIso,
      },
    ];

    const grouped = groupFacebookNotifications(items);
    assert.equal(grouped.length, 1);
    assert.equal(grouped[0].actors.length, 2);
    assert.equal(grouped[0].unread, true);
    assert.equal(grouped[0].bucket, 'new');
    assert.deepEqual(grouped[0].itemIds.sort(), [1, 2]);
  });
});
