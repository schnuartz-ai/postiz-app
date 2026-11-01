import { createHash } from 'crypto';
import { readdirSync } from 'fs';
import { tmpdir } from 'os';
import { Readable } from 'stream';
import { verifyEvent } from 'nostr-tools';

jest.mock(
  '@gitroom/nestjs-libraries/dtos/webhooks/webhook.url.validator',
  () => ({ isSafePublicHttpsUrl: jest.fn(async () => true) })
);
jest.mock(
  '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher',
  () => ({ ssrfSafeDispatcher: {} })
);

import { BlossomStorage } from './blossom.storage';
import { UploadFactory } from './upload.factory';

const KEY = 'a'.repeat(63) + '1';
const PNG = Buffer.concat([
  Buffer.from('89504e470d0a1a0a', 'hex'),
  Buffer.alloc(5000, 7),
]);
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const leftovers = () =>
  readdirSync(tmpdir()).filter((name) => name.startsWith('blossom-'));

describe('BlossomStorage', () => {
  const realFetch = global.fetch;
  let requests: { url: string; init: any; body: Buffer }[];

  beforeEach(() => {
    requests = [];
    global.fetch = jest.fn(async (url: any, init: any) => {
      // the body is either a Buffer or a file backed Blob
      const body = Buffer.from(
        init.body instanceof Blob ? await init.body.arrayBuffer() : init.body
      );
      requests.push({ url: String(url), init, body });
      return new Response(
        JSON.stringify({
          url: `https://blossom.primal.net/${init.headers['X-SHA-256']}.png`,
          sha256: init.headers['X-SHA-256'],
          size: body.length,
          type: 'image/png',
        }),
        { status: 200 }
      );
    }) as any;
  });

  afterEach(() => {
    global.fetch = realFetch;
  });

  const storage = () => new BlossomStorage(undefined, KEY);

  it('streams an upload from a temp file, signed and hashed', async () => {
    const before = leftovers();

    const result = await storage().uploadStream(
      Readable.from([PNG.subarray(0, 100), PNG.subarray(100)]),
      'image/png',
      'png'
    );

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe('https://blossom.primal.net/upload');
    // exactly the bytes of the stream arrived
    expect(requests[0].body.equals(PNG)).toBe(true);
    expect(requests[0].init.headers['X-SHA-256']).toBe(sha(PNG));
    expect(requests[0].init.headers['Content-Type']).toBe('image/png');

    const auth = JSON.parse(
      Buffer.from(
        requests[0].init.headers.Authorization.replace('Nostr ', ''),
        'base64'
      ).toString()
    );
    expect(verifyEvent(auth)).toBe(true);
    expect(auth.tags).toContainEqual(['x', sha(PNG)]);

    expect(result).toEqual({
      filename: `${sha(PNG)}.png`,
      originalname: `${sha(PNG)}.png`,
      mimetype: 'image/png',
      path: `https://blossom.primal.net/${sha(PNG)}.png`,
    });
    // the temp file is gone
    expect(leftovers()).toEqual(before);
  });

  it('cleans up the temp file when the server refuses', async () => {
    global.fetch = jest.fn(
      async () => new Response('', { status: 403 })
    ) as any;
    const before = leftovers();

    await expect(
      storage().uploadStream(Readable.from([PNG]), 'image/png', 'png')
    ).rejects.toThrow(/failed/);
    expect(leftovers()).toEqual(before);
  });

  it('refuses types that are not allowed', async () => {
    await expect(
      storage().uploadStream(
        Readable.from([Buffer.from('<svg/>')]),
        'image/svg+xml',
        'svg'
      )
    ).rejects.toThrow('Unsupported file type.');
    expect(requests).toHaveLength(0);
  });

  it('still takes buffers (images made by the app)', async () => {
    const result = await storage().uploadFile({ buffer: PNG } as any);

    expect(requests[0].body.equals(PNG)).toBe(true);
    expect(result.path).toBe(`https://blossom.primal.net/${sha(PNG)}.png`);
    expect(result.mimetype).toBe('image/png');
  });

  it('needs a key', () => {
    expect(() => new BlossomStorage(undefined, '')).toThrow(
      /BLOSSOM_SECRET_KEY/
    );
  });

  it('is what STORAGE_PROVIDER=blossom creates', () => {
    process.env.STORAGE_PROVIDER = 'blossom';
    process.env.BLOSSOM_SECRET_KEY = KEY;
    try {
      expect(UploadFactory.createStorage()).toBeInstanceOf(BlossomStorage);
      // the media processors of the clipping workflow stay cloud only
      expect(UploadFactory.processorEnabled()).toBe(false);
      expect(UploadFactory.clippingEnabled()).toBe(false);
    } finally {
      delete process.env.STORAGE_PROVIDER;
      delete process.env.BLOSSOM_SECRET_KEY;
    }
  });
});
