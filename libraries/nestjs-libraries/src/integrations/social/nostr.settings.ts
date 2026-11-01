import { nip19 } from 'nostr-tools';
import { AuthService } from '@gitroom/helpers/auth/auth.service';
import { normalizeBlossomServer } from '@gitroom/nestjs-libraries/upload/blossom.client';

/**
 * Per channel Nostr settings. They live in the encrypted
 * `customInstanceDetails` of the channel, next to the private key, so no
 * database migration is needed and existing channels keep working.
 */
export type NostrSettings = {
  /**
   * Ordered list. The first server is the primary upload target, all others
   * get a mirror copy. `undefined` = never configured (use the default),
   * an empty list = do not use Blossom, link to the file on this instance.
   */
  blossomServers?: string[];
  /** Extra relays to publish to, on top of the defaults and the NIP-65 list. */
  relays: string[];
};

export const MAX_BLOSSOM_SERVERS = 8;
export const MAX_RELAYS = 20;

export const normalizeRelay = (input: string): string => {
  const value = (input || '').trim();
  const url = new URL(/^wss?:\/\//i.test(value) ? value : `wss://${value}`);

  if (url.protocol !== 'wss:') {
    throw new Error('Relays must use wss://');
  }

  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
};

const unique = (list: string[]) => Array.from(new Set(list));

/** Strict, used when the user saves. Throws a readable message. */
export const sanitizeNostrSettings = (input: {
  blossomServers?: string[];
  relays?: string[];
}): { blossomServers: string[]; relays: string[] } => {
  const blossomServers = unique(
    (input.blossomServers || []).map((server) => {
      try {
        return normalizeBlossomServer(server);
      } catch {
        throw new Error(`Invalid Blossom server: ${server}`);
      }
    })
  );

  const relays = unique(
    (input.relays || []).map((relay) => {
      try {
        return normalizeRelay(relay);
      } catch {
        throw new Error(`Invalid relay: ${relay}`);
      }
    })
  );

  if (blossomServers.length > MAX_BLOSSOM_SERVERS) {
    throw new Error(`At most ${MAX_BLOSSOM_SERVERS} Blossom servers`);
  }

  if (relays.length > MAX_RELAYS) {
    throw new Error(`At most ${MAX_RELAYS} relays`);
  }

  return { blossomServers, relays };
};

const parseDetails = (customInstanceDetails?: string | null): any => {
  if (!customInstanceDetails) {
    return {};
  }

  try {
    return JSON.parse(AuthService.fixedDecryption(customInstanceDetails));
  } catch {
    return {};
  }
};

/** Lenient, used when posting. Never throws, drops what is not valid. */
export const readNostrSettings = (
  customInstanceDetails?: string | null
): NostrSettings => {
  const details = parseDetails(customInstanceDetails);

  const keep = <T>(list: unknown, normalize: (v: string) => T): T[] =>
    (Array.isArray(list) ? list : []).flatMap((value) => {
      try {
        return [normalize(String(value))];
      } catch {
        return [];
      }
    });

  let blossomServers: string[] | undefined;
  if (Array.isArray(details.blossomServers)) {
    blossomServers = unique(
      keep(details.blossomServers, normalizeBlossomServer)
    );
  } else if (details.blossom) {
    // channels connected before the settings existed
    blossomServers = keep([details.blossom], normalizeBlossomServer);
  }

  return {
    blossomServers,
    relays: unique(keep(details.relays, normalizeRelay)),
  };
};

/** What the channel uses: the saved list, or the instance default if never configured. */
export const configuredBlossomServers = (settings: NostrSettings): string[] => {
  if (settings.blossomServers) {
    return settings.blossomServers;
  }

  return [
    normalizeBlossomServer(
      process.env.NOSTR_BLOSSOM_SERVER_URL || process.env.BLOSSOM_SERVER_URL
    ),
  ];
};

/** The servers a post is really sent to, the instance can switch Blossom off. */
export const effectiveBlossomServers = (settings: NostrSettings): string[] =>
  process.env.NOSTR_BLOSSOM_DISABLED === 'true'
    ? []
    : configuredBlossomServers(settings);

export const toNpub = (pubkey: string): string => {
  try {
    return nip19.npubEncode(pubkey);
  } catch {
    return '';
  }
};

/** Returns the new encrypted `customInstanceDetails`, the private key is kept. */
export const writeNostrSettings = (
  customInstanceDetails: string,
  settings: { blossomServers: string[]; relays: string[] }
): string => {
  const details = parseDetails(customInstanceDetails);

  const next = {
    ...details,
    blossomServers: settings.blossomServers,
    relays: settings.relays,
  };

  // keep the field older code reads in sync
  if (settings.blossomServers.length) {
    next.blossom = settings.blossomServers[0];
  } else {
    delete next.blossom;
  }

  return AuthService.fixedEncryption(JSON.stringify(next));
};
