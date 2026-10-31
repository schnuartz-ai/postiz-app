process.env.JWT_SECRET = 'test-secret';

// native module, not needed here
jest.mock('bcrypt', () => ({ hashSync: jest.fn(), compareSync: jest.fn() }));
jest.mock(
  '@gitroom/nestjs-libraries/dtos/webhooks/webhook.url.validator',
  () => ({
    isSafePublicHttpsUrl: jest.fn(async () => true),
  })
);
jest.mock(
  '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher',
  () => ({
    ssrfSafeDispatcher: {},
  })
);

import { AuthService } from '@gitroom/helpers/auth/auth.service';
import {
  configuredBlossomServers,
  effectiveBlossomServers,
  normalizeRelay,
  readNostrSettings,
  sanitizeNostrSettings,
  toNpub,
  writeNostrSettings,
} from './nostr.settings';

const encrypt = (details: object) =>
  AuthService.fixedEncryption(JSON.stringify(details));
const decrypt = (value: string) =>
  JSON.parse(AuthService.fixedDecryption(value));

describe('nostr settings', () => {
  afterEach(() => {
    delete process.env.NOSTR_BLOSSOM_DISABLED;
    delete process.env.NOSTR_BLOSSOM_SERVER_URL;
  });

  describe('sanitizeNostrSettings', () => {
    it('cleans up, removes duplicates and keeps the order', () => {
      expect(
        sanitizeNostrSettings({
          blossomServers: [
            ' blossom.einundzwanzig.space/ ',
            'https://blossom.primal.net',
            'https://blossom.einundzwanzig.space',
          ],
          relays: ['relay.example.org', 'wss://relay.example.org/'],
        })
      ).toEqual({
        blossomServers: [
          'https://blossom.einundzwanzig.space',
          'https://blossom.primal.net',
        ],
        relays: ['wss://relay.example.org'],
      });
    });

    it('tells which entry is wrong', () => {
      expect(() =>
        sanitizeNostrSettings({ blossomServers: ['http://insecure.example'] })
      ).toThrow('Invalid Blossom server: http://insecure.example');
      expect(() =>
        sanitizeNostrSettings({ relays: ['ws://plain.example'] })
      ).toThrow('Invalid relay: ws://plain.example');
    });

    it('limits the amount of entries', () => {
      const many = Array.from({ length: 9 }, (_, i) => `https://s${i}.example`);
      expect(() => sanitizeNostrSettings({ blossomServers: many })).toThrow(
        /At most 8/
      );
    });
  });

  describe('readNostrSettings', () => {
    it('is empty for channels that were never configured', () => {
      expect(readNostrSettings(undefined)).toEqual({
        blossomServers: undefined,
        relays: [],
      });
      expect(readNostrSettings('not encrypted garbage')).toEqual({
        blossomServers: undefined,
        relays: [],
      });
    });

    it('reads the single server of older channels', () => {
      expect(
        readNostrSettings(
          encrypt({ password: 'x', blossom: 'https://blossom.primal.net/' })
        ).blossomServers
      ).toEqual(['https://blossom.primal.net']);
    });

    it('drops invalid entries instead of failing a post', () => {
      expect(
        readNostrSettings(
          encrypt({
            blossomServers: ['https://ok.example', 'http://bad.example'],
            relays: ['wss://ok.example', 'ws://bad.example'],
          })
        )
      ).toEqual({
        blossomServers: ['https://ok.example'],
        relays: ['wss://ok.example'],
      });
    });
  });

  describe('writeNostrSettings', () => {
    it('keeps the private key and stays readable for older code', () => {
      const saved = writeNostrSettings(encrypt({ password: 'secret-key' }), {
        blossomServers: ['https://a.example', 'https://b.example'],
        relays: ['wss://r.example'],
      });

      expect(decrypt(saved)).toEqual({
        password: 'secret-key',
        blossom: 'https://a.example',
        blossomServers: ['https://a.example', 'https://b.example'],
        relays: ['wss://r.example'],
      });
      expect(readNostrSettings(saved)).toEqual({
        blossomServers: ['https://a.example', 'https://b.example'],
        relays: ['wss://r.example'],
      });
    });

    it('an empty list switches Blossom off for the channel', () => {
      const saved = writeNostrSettings(
        encrypt({ password: 'k', blossom: 'https://old.example' }),
        { blossomServers: [], relays: [] }
      );

      expect(decrypt(saved).blossom).toBeUndefined();
      expect(effectiveBlossomServers(readNostrSettings(saved))).toEqual([]);
    });
  });

  describe('defaults', () => {
    it('uses Primal until a channel is configured', () => {
      expect(configuredBlossomServers({ relays: [] })).toEqual([
        'https://blossom.primal.net',
      ]);
    });

    it('can use another instance default', () => {
      process.env.NOSTR_BLOSSOM_SERVER_URL = 'https://cdn.example.org/';
      expect(configuredBlossomServers({ relays: [] })).toEqual([
        'https://cdn.example.org',
      ]);
    });

    it('the instance can switch Blossom off', () => {
      process.env.NOSTR_BLOSSOM_DISABLED = 'true';
      expect(
        effectiveBlossomServers({
          blossomServers: ['https://a.example'],
          relays: [],
        })
      ).toEqual([]);
    });
  });

  it('normalizes relays and builds npubs', () => {
    expect(normalizeRelay('Relay.Example.org/')).toBe(
      'wss://relay.example.org'
    );
    expect(() => normalizeRelay('ws://relay.example.org')).toThrow();
    expect(toNpub('a'.repeat(64))).toMatch(/^npub1/);
    expect(toNpub('nope')).toBe('');
  });
});
