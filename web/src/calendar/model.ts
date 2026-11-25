import type { CSSProperties } from 'react';
import type { CategoryDto, OccurrenceDto, UserDto } from '../api.ts';
import { BUSY_STYLE, PALETTE } from '../palette.ts';

export type View = 'day' | 'week' | 'month';

export type CategoryMap = ReadonlyMap<number, CategoryDto>;

/** Routines are filled blocks, tasks are outlined, busy-only entries are hatched. */
export function blockStyle(occurrence: OccurrenceDto, categories: CategoryMap): CSSProperties {
  const category = occurrence.categoryId === null ? undefined : categories.get(occurrence.categoryId);
  if (occurrence.busy || !category) return BUSY_STYLE;
  const swatch = PALETTE[category.color];
  return occurrence.kind === 'task'
    ? { background: '#FFFFFF', border: `1.5px solid ${swatch.bd}`, color: swatch.fg }
    : { background: swatch.bg, border: `1px solid ${swatch.bd}`, color: swatch.fg };
}

export function occurrenceTitle(occurrence: OccurrenceDto): string {
  return occurrence.title ?? 'תפוס';
}

export function participantNames(occurrence: OccurrenceDto, users: readonly UserDto[]): string {
  return occurrence.participantIds
    .map((id) => users.find((user) => user.id === id)?.displayName)
    .filter(Boolean)
    .join(' + ');
}

export interface Placed {
  occurrence: OccurrenceDto;
  /** Percent of the day column, from the inline start. */
  left: number;
  width: number;
  /** Stacking order: later-starting overlapping entries sit on top. */
  layer: number;
}

/**
 * Lays out one day's occurrences. Each visible user gets a lane; an entry shared by several
 * visible users spans their lanes. Overlapping entries of one user (a conflict) are stacked
 * with an indent rather than split, so a long block is not squeezed all day by a short overlap.
 */
export function layoutDay(occurrences: readonly OccurrenceDto[], laneUserIds: readonly number[]): Placed[] {
  const laneCount = laneUserIds.length;
  if (laneCount === 0) return [];
  const laneWidth = 100 / laneCount;
  const placed: Placed[] = [];
  const perLane: OccurrenceDto[][] = laneUserIds.map(() => []);

  for (const occurrence of occurrences) {
    const lanes = occurrence.participantIds.map((id) => laneUserIds.indexOf(id)).filter((i) => i >= 0);
    if (lanes.length === 0) continue;
    if (lanes.length === 1) {
      perLane[lanes[0]!]!.push(occurrence);
      continue;
    }
    const first = Math.min(...lanes);
    const last = Math.max(...lanes);
    placed.push({ occurrence, left: first * laneWidth, width: (last - first + 1) * laneWidth, layer: 1 });
  }

  perLane.forEach((items, lane) => {
    const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);
    let columns: number[] = [];
    let cluster: { occurrence: OccurrenceDto; column: number }[] = [];
    let clusterEnd = -1;
    const flush = () => {
      // Each further column starts a bit further in; together the indents take at most 45% of the lane.
      const indent = columns.length > 1 ? (laneWidth * 0.45) / (columns.length - 1) : 0;
      for (const item of cluster) {
        placed.push({
          occurrence: item.occurrence,
          left: lane * laneWidth + item.column * indent,
          width: laneWidth - item.column * indent,
          layer: 2 + item.column,
        });
      }
      columns = [];
      cluster = [];
      clusterEnd = -1;
    };
    for (const occurrence of sorted) {
      if (cluster.length > 0 && occurrence.start >= clusterEnd) flush();
      let column = 0;
      while (column < columns.length && columns[column]! > occurrence.start) column++;
      columns[column] = occurrence.end;
      cluster.push({ occurrence, column });
      clusterEnd = Math.max(clusterEnd, occurrence.end);
    }
    if (cluster.length > 0) flush();
  });

  return placed;
}
