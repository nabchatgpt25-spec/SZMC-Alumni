export const SUPPORTED_GOVERNANCE_ROLES = [
  'member',
  'batch_representative',
  'moderator',
  'admin',
  'super_admin',
] as const;

export interface GovernanceTransitionInput {
  actorUid: string;
  actorRole: string;
  targetAuthUid: string | null | undefined;
  targetCurrentRole: string;
  requestedRole?: string;
  requestedVerificationStatus?: string;
}

export function validateGovernanceTransition(input: GovernanceTransitionInput): void {
  const isActorSuperAdmin = input.actorRole === 'super_admin';
  const isActorAdminOrSuper = input.actorRole === 'admin' || isActorSuperAdmin;
  const targetRole = String(input.targetCurrentRole || 'member');

  if (input.requestedRole !== undefined) {
    if (
      !isActorAdminOrSuper ||
      !(SUPPORTED_GOVERNANCE_ROLES as readonly string[]).includes(input.requestedRole)
    ) {
      throw new Error('Forbidden: Only administrators may assign supported database roles.');
    }
    if (
      (input.requestedRole === 'admin' || input.requestedRole === 'super_admin') &&
      !isActorSuperAdmin
    ) {
      throw new Error(
        'Forbidden: Only Super Administrators can assign admin or super_admin roles.'
      );
    }
  }

  if (targetRole === 'super_admin' && !isActorSuperAdmin) {
    throw new Error(
      'Forbidden: Only Super Administrators may modify a Super Administrator profile.'
    );
  }
  if (targetRole === 'admin' && !isActorAdminOrSuper) {
    throw new Error('Forbidden: Only administrators may modify an administrator profile.');
  }
  if (
    targetRole === 'admin' &&
    input.requestedRole !== undefined &&
    input.requestedRole !== targetRole &&
    !isActorSuperAdmin
  ) {
    throw new Error('Forbidden: Only Super Administrators can modify an administrator role.');
  }

  if (input.targetAuthUid && input.targetAuthUid === input.actorUid) {
    if (input.requestedVerificationStatus !== undefined) {
      throw new Error('Administrators cannot change their own verification status.');
    }
    if (input.requestedRole !== undefined && input.requestedRole !== targetRole) {
      throw new Error('Forbidden: You cannot modify your own role.');
    }
  }
}
