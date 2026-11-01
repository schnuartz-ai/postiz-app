'use client';

import { useCallback } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';

export type NostrSettings = {
  pubkey: string;
  npub: string;
  /** first = primary upload server, all others get a backup copy */
  blossomServers: string[];
  relays: string[];
  blossomDisabledByInstance: boolean;
};

export const useNostrSettings = (integrationId: string) => {
  const fetch = useFetch();

  const load = useCallback(async (): Promise<NostrSettings> => {
    return (
      await fetch(`/integrations/${integrationId}/nostr-settings`)
    ).json();
  }, [integrationId]);

  return useSWR<NostrSettings>(`nostr-settings-${integrationId}`, load, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
  });
};
