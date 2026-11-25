import { useQuery, useQueryClient } from '@tanstack/react-query';
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
