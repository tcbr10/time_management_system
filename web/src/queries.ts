import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import {
  api,
  type CalendarDto,
  type CategoryDto,
  type HouseholdSettingsDto,
  type SessionDto,
  type SharesDto,
  type UserDto,
} from './api.ts';

export const useSession = () =>
  useQuery({ queryKey: ['session'], queryFn: () => api.get<SessionDto>('/api/session') });

export const useUsers = () =>
  useQuery({ queryKey: ['users'], queryFn: () => api.get<UserDto[]>('/api/users') });

export const useCategories = () =>
  useQuery({ queryKey: ['categories'], queryFn: () => api.get<CategoryDto[]>('/api/categories') });

export const useShares = () =>
  useQuery({ queryKey: ['shares'], queryFn: () => api.get<SharesDto>('/api/shares') });

export const useHouseholdSettings = () =>
  useQuery({ queryKey: ['settings'], queryFn: () => api.get<HouseholdSettingsDto>('/api/settings') });

export const useCalendar = (from: string, to: string) =>
  useQuery({
    queryKey: ['calendar', from, to],
    queryFn: () => api.get<CalendarDto>(`/api/calendar?from=${from}&to=${to}`),
    // Keep the previous range on screen while the next one loads.
    placeholderData: (previous) => previous,
  });

/** Refetches everything that depends on household data. */
export function useRefreshAll(): () => void {
  const client = useQueryClient();
  return () => {
    for (const key of ['calendar', 'categories', 'users', 'shares', 'settings', 'invites', 'entry']) {
      void client.invalidateQueries({ queryKey: [key] });
    }
  };
}

/**
 * Listens to the server's change stream and refetches when anyone in the household changes
 * something. EventSource reconnects by itself; a refetch on reconnect covers what was missed.
 */
export function useLiveUpdates(enabled: boolean): void {
  const refresh = useRefreshAll();
  useEffect(() => {
    if (!enabled || typeof EventSource === 'undefined') return;
    const source = new EventSource('/api/stream');
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(refresh, 150);
    };
    let opened = false;
    source.addEventListener('change', schedule);
    source.addEventListener('open', () => {
      if (opened) schedule();
      opened = true;
    });
    return () => {
      clearTimeout(timer);
      source.close();
    };
    // `refresh` is recreated every render but always does the same thing, so it is not a dependency.
  }, [enabled]);
}
