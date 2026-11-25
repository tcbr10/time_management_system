import type { ShareLevel } from '../shared/types.js';

/** 'own' = the viewer is a participant. Otherwise the best level any participant grants them. */
export type Access = 'own' | ShareLevel;

const RANK: Record<ShareLevel, number> = { none: 0, busy: 1, view: 2, edit: 3 };

export type ShareLookup = (ownerId: number, granteeId: number) => ShareLevel;

/**
 * What `viewerId` may do with an entry. A private entry is never more than 'busy'
 * to someone who is not a participant, whatever they were granted.
 */
export function accessFor(
  viewerId: number,
  participantIds: readonly number[],
  isPrivate: boolean,
  share: ShareLookup,
): Access {
  if (participantIds.includes(viewerId)) return 'own';
  let best: ShareLevel = 'none';
  for (const participant of participantIds) {
    const level = share(participant, viewerId);
    if (RANK[level] > RANK[best]) best = level;
  }
  if (isPrivate && RANK[best] > RANK.busy) return 'busy';
  return best;
}

export function canSeeDetails(access: Access): boolean {
  return access === 'own' || access === 'view' || access === 'edit';
}

export function canEdit(access: Access): boolean {
  return access === 'own' || access === 'edit';
}
