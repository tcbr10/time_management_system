// Types and constants shared by the server and the web client.
// The client imports this file directly, so it must stay free of Node-only code.

export const APP_NAME = 'סדר יום';

export const KINDS = ['routine', 'task'] as const;
export type Kind = (typeof KINDS)[number];

export const SHARE_LEVELS = ['none', 'busy', 'view', 'edit'] as const;
export type ShareLevel = (typeof SHARE_LEVELS)[number];

export const COLOR_KEYS = [
  'orange', 'cyan', 'violet', 'green', 'lime', 'slate',
  'pink', 'brown', 'gold', 'coral', 'blue', 'teal',
] as const;
export type ColorKey = (typeof COLOR_KEYS)[number];

export const MINUTES_PER_DAY = 1440;

export interface UserDto {
  id: number;
  username: string;
  displayName: string;
  role: 'admin' | 'member';
}

export interface SessionDto {
  /** True until the first (admin) account is created. */
  setupRequired: boolean;
  user: UserDto | null;
}

export interface CategoryDto {
  id: number;
  kind: Kind;
  name: string;
  color: ColorKey;
  /** Counted in the household-chores balance of the cross view. */
  isChore: boolean;
  sort: number;
  archived: boolean;
}

export interface CategoryInput {
  kind: Kind;
  name: string;
  color: ColorKey;
  isChore: boolean;
}

/** Times are minutes from midnight. An entry is either one-off (`date`) or a weekly series. */
export interface EntryInput {
  kind: Kind;
  categoryId: number;
  title: string;
  notes: string;
  start: number;
  end: number;
  date: string | null;
  /** Bit 0 = Sunday … bit 6 = Saturday. */
  daysMask: number;
  intervalWeeks: number;
  startDate: string | null;
  endDate: string | null;
  isPrivate: boolean;
  participantIds: number[];
}

export interface EntryDto extends EntryInput {
  id: number;
  ownerId: number;
}

export interface OccurrenceDto {
  /** `${entryId}@${date}` */
  key: string;
  entryId: number;
  date: string;
  start: number;
  end: number;
  participantIds: number[];
  /** Private or busy-only for the viewer: no title, category, kind or notes. */
  busy: boolean;
  canEdit: boolean;
  kind: Kind | null;
  categoryId: number | null;
  title: string | null;
  notes: string | null;
  isPrivate: boolean;
  recurring: boolean;
  /** This occurrence was moved away from the series' usual time. */
  moved: boolean;
  done: boolean;
}

export interface ConflictDto {
  userId: number;
  date: string;
  a: string;
  b: string;
}

export interface FreeWindowDto {
  date: string;
  start: number;
  end: number;
}

export interface CrossDto {
  conflicts: ConflictDto[];
  free: FreeWindowDto[];
  /** Minutes of chore-category entries per user id. */
  load: Record<number, number>;
}

export interface CalendarDto {
  occurrences: OccurrenceDto[];
  cross: CrossDto;
}

export interface SharesDto {
  /** What I let each other user see of my calendar. */
  granted: Record<number, ShareLevel>;
  /** What each other user lets me see of theirs. */
  received: Record<number, ShareLevel>;
}

export interface HouseholdSettingsDto {
  /** Window in which shared free time is looked for, minutes from midnight. */
  activeFrom: number;
  activeTo: number;
}

export interface InviteDto {
  token: string;
  expiresAt: number;
}

export interface BackupDto {
  name: string;
  size: number;
  createdAt: number;
}

export type OccurrenceAction =
  | { action: 'skip' }
  | { action: 'restore' }
  | { action: 'move'; start: number; end: number };

export type EditScope = 'all' | 'following';
