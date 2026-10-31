'use client';

import { useSyncExternalStore } from 'react';

// Must stay in sync with the `mobile` screen in tailwind.config.cjs.
export const MOBILE_QUERY = '(max-width: 1025px)';

/**
 * Subscribes to a CSS media query. Falls back to `serverValue` during SSR and
 * hydration, then re-renders with the real value (no hydration mismatch).
 */
export const useMediaQuery = (query: string, serverValue = false) => {
  return useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia(query);
      media.addEventListener('change', onChange);
      return () => media.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => serverValue
  );
};

/**
 * True on phones and tablets (<= 1025px). Use it to swap whole components;
 * prefer the `mobile:` Tailwind variant for pure styling changes.
 */
export const useIsMobile = () => useMediaQuery(MOBILE_QUERY);
