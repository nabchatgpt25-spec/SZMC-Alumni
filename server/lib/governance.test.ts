import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateGovernanceTransition } from './governance.ts';

describe('server/lib/governance', () => {
  it('allows super_admin to promote or demote admins and non-admins', () => {
    assert.doesNotThrow(() =>
      validateGovernanceTransition({
        actorUid: 'uid-super',
        actorRole: 'super_admin',
        targetAuthUid: 'uid-member',
        targetCurrentRole: 'member',
        requestedRole: 'admin',
      })
    );

    assert.doesNotThrow(() =>
      validateGovernanceTransition({
        actorUid: 'uid-super',
        actorRole: 'super_admin',
        targetAuthUid: 'uid-admin',
        targetCurrentRole: 'admin',
        requestedRole: 'member',
      })
    );
  });

  it('blocks regular admin from assigning admin/super_admin or modifying super_admin', () => {
    assert.throws(
      () =>
        validateGovernanceTransition({
          actorUid: 'uid-admin',
          actorRole: 'admin',
          targetAuthUid: 'uid-member',
          targetCurrentRole: 'member',
          requestedRole: 'admin',
        }),
      /Super Administrators/
    );

    assert.throws(
      () =>
        validateGovernanceTransition({
          actorUid: 'uid-admin',
          actorRole: 'admin',
          targetAuthUid: 'uid-super',
          targetCurrentRole: 'super_admin',
          requestedVerificationStatus: 'verified',
        }),
      /Super Administrators/
    );
  });

  it('blocks self-demotion and self-verification while allowing updating non-privileged members', () => {
    assert.throws(
      () =>
        validateGovernanceTransition({
          actorUid: 'uid-admin',
          actorRole: 'admin',
          targetAuthUid: 'uid-admin',
          targetCurrentRole: 'admin',
          requestedVerificationStatus: 'verified',
        }),
      /own verification/
    );

    assert.throws(
      () =>
        validateGovernanceTransition({
          actorUid: 'uid-super',
          actorRole: 'super_admin',
          targetAuthUid: 'uid-super',
          targetCurrentRole: 'super_admin',
          requestedRole: 'member',
        }),
      /modify your own role/
    );

    assert.doesNotThrow(() =>
      validateGovernanceTransition({
        actorUid: 'uid-admin',
        actorRole: 'admin',
        targetAuthUid: 'uid-member',
        targetCurrentRole: 'member',
        requestedRole: 'batch_representative',
      })
    );
  });
});
