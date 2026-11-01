import { createHash } from 'crypto';
import { nip19, verifyEvent } from 'nostr-tools';

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

import {
  DEFAULT_BLOSSOM_SERVER,
  deleteFromBlossom,
  normalizeBlossomServer,
  parseNostrSecretKey,
  uploadToBlossom,
} from './blossom.client';

const HEX = 'a'.repeat(63) + '1';
const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489',
  'hex'
);
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

const decodeAuth = (header: string) => {
  const token = header.replace(/^Nostr /, '');
  return JSON.parse(Buffer.from(token, 'base64').toString());
};

describe('parseNostrSecretKey', () => {
  it('accepts hex and nsec', () => {
    const fromHex = parseNostrSecretKey(HEX);
    expect(fromHex).toHaveLength(32);
    expect(parseNostrSecretKey(nip19.nsecEncode(fromHex))).toEqual(fromHex);
  });

  it('rejects garbage', () => {
    expect(() => parseNostrSecretKey('hello')).toThrow();
    expect(() => parseNostrSecretKey('')).toThrow();
  });
});

describe('normalizeBlossomServer', () => {
  it('defaults to primal', () => {
    expect(normalizeBlossomServer()).toBe(DEFAULT_BLOSSOM_SERVER);
    expect(DEFAULT_BLOSSOM_SERVER).toBe('https://blossom.primal.net');
  });

  it('cleans up user input', () => {
    expect(normalizeBlossomServer(' blossom.einundzwanzig.space/ ')).toBe(
      'https://blossom.einundzwanzig.space'
    );
    expect(normalizeBlossomServer('https://example.com/blossom//')).toBe(
      'https://example.com/blossom'
    );
  });

  it('refuses plain http', () => {
    expect(() => normalizeBlossomServer('http://example.com')).toThrow();
  });
});

describe('uploadToBlossom', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('sends a valid BUD-02 / BUD-11 request', async () => {
    const calls: any[] = [];
    global.fetch = jest.fn(async (url: any, init: any) => {
      calls.push({ url, init });
      return new Response(
        JSON.stringify({
          url: `https://cdn.example/${sha(PNG)}.png`,
          sha256: sha(PNG),
          size: PNG.length,
          type: 'image/png',
          uploaded: 1,
        }),
        { status: 201 }
      );
    }) as any;

    const result = await uploadToBlossom({
      server: 'https://blossom.primal.net/',
      secretKey: parseNostrSecretKey(HEX),
      data: PNG,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://blossom.primal.net/upload');
    expect(calls[0].init.method).toBe('PUT');
    expect(calls[0].init.headers['X-SHA-256']).toBe(sha(PNG));
    expect(calls[0].init.headers['Content-Type']).toBe('image/png');

    const auth = decodeAuth(calls[0].init.headers.Authorization);
    expect(auth.kind).toBe(24242);
    expect(verifyEvent(auth)).toBe(true);
    const tag = (name: string) =>
      auth.tags.find((t: string[]) => t[0] === name);
    expect(tag('t')[1]).toBe('upload');
    expect(tag('x')[1]).toBe(sha(PNG));
    expect(Number(tag('expiration')[1])).toBeGreaterThan(
      Math.floor(Date.now() / 1000)
    );
    expect(auth.created_at).toBeLessThanOrEqual(Math.floor(Date.now() / 1000));

    expect(result.url).toBe(`https://cdn.example/${sha(PNG)}.png`);
  });

  it('retries with base64url when the server answers 401', async () => {
    let n = 0;
    global.fetch = jest.fn(async () => {
      n++;
      return n === 1
        ? new Response('', { status: 401 })
        : new Response(JSON.stringify({ sha256: sha(PNG) }), { status: 200 });
    }) as any;

    const result = await uploadToBlossom({
      server: 'https://blossom.primal.net',
      secretKey: parseNostrSecretKey(HEX),
      data: PNG,
    });

    expect(n).toBe(2);
    // server did not send a url, we rebuild it from the hash
    expect(result.url).toBe(`https://blossom.primal.net/${sha(PNG)}.png`);
  });

  it('rejects a descriptor with a different hash', async () => {
    global.fetch = jest.fn(
      async () =>
        new Response(JSON.stringify({ sha256: 'f'.repeat(64) }), {
          status: 200,
        })
    ) as any;

    await expect(
      uploadToBlossom({
        server: 'https://blossom.primal.net',
        secretKey: parseNostrSecretKey(HEX),
        data: PNG,
      })
    ).rejects.toThrow(/different hash/);
  });

  it('surfaces X-Reason on errors', async () => {
    global.fetch = jest.fn(
      async () =>
        new Response('', { status: 413, headers: { 'X-Reason': 'too big' } })
    ) as any;

    await expect(
      uploadToBlossom({
        server: 'https://blossom.primal.net',
        secretKey: parseNostrSecretKey(HEX),
        data: PNG,
      })
    ).rejects.toThrow(/too big/);
  });
});

describe('deleteFromBlossom', () => {
  it('never throws', async () => {
    const realFetch = global.fetch;
    global.fetch = jest.fn(async () => {
      throw new Error('network down');
    }) as any;

    await expect(
      deleteFromBlossom({
        server: 'https://blossom.primal.net',
        secretKey: parseNostrSecretKey(HEX),
        sha256: sha(PNG),
      })
    ).resolves.toBe(false);

    global.fetch = realFetch;
  });
});
