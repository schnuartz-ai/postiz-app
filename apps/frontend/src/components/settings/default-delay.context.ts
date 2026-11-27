'use client';

import { createContext, useContext } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { DEFAULT_SCHEDULED_DELAY } from '@gitroom/helpers/utils/scheduled.delay';

export const DefaultDelayContext = createContext(DEFAULT_SCHEDULED_DELAY as number);
export const useDefaultDelay = () => useContext(DefaultDelayContext);

export function useDefaultDelayPreference(active = true) {
  const fetch = useFetch();
  const user = useUser();
  const orgId = user?.orgId;
  // The standalone editor may mount before its authenticated user has loaded.
  const enabled = active && user !== undefined;
  const result = useSWR<{ defaultDelay: number }>(
    enabled && orgId ? ['default-delay', orgId] : null,
    async () => {
      const response = await fetch('/settings/default-delay');
      if (!response.ok) throw new Error('Could not load default delay');
      return response.json();
    },
    { revalidateOnFocus: false }
  );
  return { ...result, enabled };
}
