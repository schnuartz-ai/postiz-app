process.env.JWT_SECRET = 'test-secret';
process.env.NOSTR_BLOSSOM_DISABLED = 'true';

import {
  Event,
  finalizeEvent,
  getPublicKey,
  nip19,
  SimplePool,
  verifyEvent,
} from 'nostr-tools';

const mockReadOrFetch = jest.fn();
jest.mock('@gitroom/helpers/utils/read.or.fetch', () => ({
  readOrFetch: (...args: any[]) => mockReadOrFetch(...args),
}));
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

import { NostrProvider } from './nostr.provider';
import { AuthService } from '@gitroom/helpers/auth/auth.service';

const SK_HEX = 'b'.repeat(63) + '2';
const SK = Uint8Array.from(SK_HEX.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
const PK = getPublicKey(SK);
const FRIEND_PK = getPublicKey(Uint8Array.from(Array(32).fill(7)));
const FRIEND_NPUB = nip19.npubEncode(FRIEND_PK);

const token = AuthService.signJWT({ password: SK_HEX });

describe('NostrProvider', () => {
  let provider: NostrProvider;
  let published: Event[];

  beforeEach(() => {
    provider = new NostrProvider();
    published = [];

    jest.spyOn(SimplePool.prototype, 'publish').mockImplementation(((
      relays: string[],
      event: Event
    ) => {
      published.push(event);
      return relays.map(() => Promise.resolve('ok'));
    }) as any);
    // no NIP-65 relay list, no search results
    jest.spyOn(SimplePool.prototype, 'get').mockResolvedValue(null);
    jest.spyOn(SimplePool.prototype, 'querySync').mockResolvedValue([]);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('mentions', () => {
    it('formats mentions as NIP-27 references', () => {
      expect(provider.mentionFormat(FRIEND_NPUB, 'Friend')).toBe(
        `nostr:${FRIEND_NPUB}`
      );
      expect(provider.mentionFormat(FRIEND_PK, 'Friend')).toBe(
        `nostr:${FRIEND_NPUB}`
      );
      // the orchestrator passes the method around without `this`
      const detached = provider.mentionFormat;
      expect(detached(FRIEND_NPUB, 'x')).toBe(`nostr:${FRIEND_NPUB}`);
    });

    it('turns mentions and hashtags in the note into tags', async () => {
      const [res] = await provider.post(
        PK,
        token,
        [
          {
            id: 'db-id',
            message: `hi nostr:${FRIEND_NPUB} and nostr:${FRIEND_NPUB} #Bitcoin https://x.com/a#frag`,
            settings: {},
          },
        ],
        {} as any
      );

      const event = published[0];
      expect(event.tags).toContainEqual(['p', FRIEND_PK]);
      expect(event.tags.filter((t) => t[0] === 'p')).toHaveLength(1);
      expect(event.tags).toContainEqual(['t', 'bitcoin']);
      expect(event.tags.filter((t) => t[0] === 't')).toHaveLength(1);
      expect(verifyEvent(event)).toBe(true);
      expect(res.postId).toBe(event.id);
    });

    it('resolves a pasted npub to a profile', async () => {
      jest.spyOn(SimplePool.prototype, 'get').mockResolvedValue(
        finalizeEvent(
          {
            kind: 0,
            created_at: 1,
            tags: [],
            content: JSON.stringify({
              display_name: 'Friend',
              picture: 'https://example.com/a.png',
            }),
          },
          Uint8Array.from(Array(32).fill(7))
        )
      );

      const list = (await provider.mention(
        '',
        { query: FRIEND_NPUB },
        PK,
        {} as any
      )) as any[];
      expect(list).toEqual([
        {
          id: FRIEND_NPUB,
          label: 'Friend',
          image: 'https://example.com/a.png',
        },
      ]);
    });

    it('does not search for very short input', async () => {
      expect(await provider.mention('', { query: 'a' }, PK, {} as any)).toEqual(
        []
      );
    });
  });

  describe('publishing', () => {
    it('returns the id of the event it signed, not an older note', async () => {
      const [res] = await provider.post(
        PK,
        token,
        [{ id: 'db-id', message: 'hello', settings: {} }],
        {} as any
      );

      expect(published).toHaveLength(1);
      expect(published[0].kind).toBe(1);
      expect(published[0].pubkey).toBe(PK);
      expect(res.postId).toBe(published[0].id);
      expect(res.releaseURL).toContain('https://primal.net/e/nevent1');
    });

    it('fails when no relay accepted the note', async () => {
      jest
        .spyOn(SimplePool.prototype, 'publish')
        .mockImplementation(((relays: string[]) =>
          relays.map(() => Promise.reject(new Error('blocked')))) as any);

      await expect(
        provider.post(
          PK,
          token,
          [{ id: 'db-id', message: 'hello', settings: {} }],
          {} as any
        )
      ).rejects.toThrow(/Could not publish/);
    });

    it('threads comments with root and reply markers (NIP-10)', async () => {
      const root = 'c'.repeat(64);
      const parent = 'd'.repeat(64);

      await provider.comment(
        PK,
        root,
        undefined,
        token,
        [{ id: 'c1', message: 'first', settings: {} }],
        {} as any
      );
      await provider.comment(
        PK,
        root,
        parent,
        token,
        [{ id: 'c2', message: 'second', settings: {} }],
        {} as any
      );

      expect(published[0].tags).toContainEqual(['e', root, '', 'root', PK]);
      expect(published[0].tags.some((t) => t[3] === 'reply')).toBe(false);
      expect(published[1].tags).toContainEqual(['e', root, '', 'root', PK]);
      expect(published[1].tags).toContainEqual(['e', parent, '', 'reply', PK]);
    });

    it('keeps the media url when Blossom is disabled', async () => {
      await provider.post(
        PK,
        token,
        [
          {
            id: 'db-id',
            message: 'pic',
            settings: {},
            media: [{ type: 'image', path: 'https://cdn.example/a.png' }],
          },
        ],
        {} as any
      );

      expect(published[0].content).toBe('pic\n\nhttps://cdn.example/a.png');
      expect(published[0].tags.some((t) => t[0] === 'imeta')).toBe(false);
    });
  });

  describe('Blossom media hosting', () => {
    const PNG = Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489',
      'hex'
    );
    const realFetch = global.fetch;
    let uploads: string[];

    beforeEach(() => {
      process.env.NOSTR_BLOSSOM_DISABLED = 'false';
      uploads = [];
      mockReadOrFetch.mockResolvedValue(PNG);
      global.fetch = jest.fn(async (url: any, init: any) => {
        uploads.push(String(url));
        const sha256 = init.headers['X-SHA-256'];
        return new Response(
          JSON.stringify({
            url: `${new URL(String(url)).origin}/${sha256}.png`,
            sha256,
            size: PNG.length,
            type: 'image/png',
          }),
          { status: 200 }
        );
      }) as any;
    });

    afterEach(() => {
      process.env.NOSTR_BLOSSOM_DISABLED = 'true';
      global.fetch = realFetch;
    });

    const mediaPost = [
      {
        id: 'db-id',
        message: 'pic',
        settings: {},
        media: [
          {
            type: 'image' as const,
            path: 'https://my.server/a.png',
            alt: 'cat',
          },
        ],
      },
    ];

    it('uploads to Primal by default and writes NIP-92 imeta', async () => {
      await provider.post(PK, token, mediaPost, {} as any);

      expect(uploads).toEqual(['https://blossom.primal.net/upload']);
      const event = published[0];
      const url = event.content.split('\n\n')[1];
      expect(url).toMatch(
        /^https:\/\/blossom\.primal\.net\/[0-9a-f]{64}\.png$/
      );
      const imeta = event.tags.find((t) => t[0] === 'imeta')!;
      expect(imeta).toContain(`url ${url}`);
      expect(imeta).toContain('m image/png');
      expect(imeta).toContain('alt cat');
    });

    it('uses the custom server configured on the channel', async () => {
      const integration = {
        customInstanceDetails: AuthService.fixedEncryption(
          JSON.stringify({
            password: SK_HEX,
            blossom: 'https://blossom.einundzwanzig.space',
          })
        ),
      } as any;

      await provider.post(PK, token, mediaPost, integration);

      expect(uploads).toEqual(['https://blossom.einundzwanzig.space/upload']);
      expect(published[0].content).toContain(
        'https://blossom.einundzwanzig.space/'
      );
    });

    it('does not re-upload media that already lives on the server', async () => {
      await provider.post(
        PK,
        token,
        [
          {
            ...mediaPost[0],
            media: [
              {
                type: 'image' as const,
                path: 'https://blossom.primal.net/abc.png',
              },
            ],
          },
        ],
        {} as any
      );

      expect(uploads).toEqual([]);
      expect(published[0].content).toContain(
        'https://blossom.primal.net/abc.png'
      );
    });

    it('still posts with the original url when the upload fails', async () => {
      global.fetch = jest.fn(
        async () => new Response('', { status: 500 })
      ) as any;
      jest.spyOn(console, 'warn').mockImplementation(() => undefined);

      const [res] = await provider.post(PK, token, mediaPost, {} as any);

      expect(res.status).toBe('completed');
      expect(published[0].content).toBe('pic\n\nhttps://my.server/a.png');
    });
  });

  describe('auto repost by other channels', () => {
    it('is registered as a post plug for nostr channels', () => {
      const plugs = Reflect.getMetadata(
        'custom:internal_plug',
        NostrProvider.prototype
      );
      expect(plugs).toEqual([
        expect.objectContaining({
          identifier: 'nostr-repost-post-users',
          pickIntegration: ['nostr'],
          methodName: 'repostPostUsers',
        }),
      ]);
    });

    it('publishes a kind 6 repost (NIP-18) of the original note', async () => {
      const authorSk = Uint8Array.from(Array(32).fill(9));
      const original = finalizeEvent(
        { kind: 1, created_at: 100, tags: [], content: 'original' },
        authorSk
      );
      jest
        .spyOn(SimplePool.prototype, 'get')
        .mockImplementation((async (_relays: string[], filter: any) =>
          filter.ids ? original : null) as any);

      await provider.repostPostUsers(
        { token, internalId: PK } as any,
        { internalId: original.pubkey } as any,
        original.id,
        {}
      );

      const repost = published[0];
      expect(repost.kind).toBe(6);
      expect(repost.pubkey).toBe(PK);
      expect(repost.tags[0][0]).toBe('e');
      expect(repost.tags[0][1]).toBe(original.id);
      expect(repost.tags).toContainEqual(['p', original.pubkey]);
      expect(JSON.parse(repost.content).id).toBe(original.id);
      expect(verifyEvent(repost)).toBe(true);
    });
  });

  describe('auto repost after X likes', () => {
    const noteSk = Uint8Array.from(Array(32).fill(9));
    const note = finalizeEvent(
      { kind: 1, created_at: 100, tags: [], content: 'my note' },
      noteSk
    );
    // the channel that owns the plug is the author of the note
    const channel = { token, internalId: note.pubkey } as any;
    const fields = { likesAmount: '3' };

    const reaction = (
      seed: number,
      content = '+',
      tags: string[][] = [['e', note.id]]
    ) =>
      finalizeEvent(
        { kind: 7, created_at: 200, tags, content },
        Uint8Array.from(Array(32).fill(seed))
      );

    const mockRelays = (reactions: Event[], existingReposts: Event[] = []) => {
      jest
        .spyOn(SimplePool.prototype, 'querySync')
        .mockImplementation((async (_relays: string[], filter: any) =>
          filter.kinds?.includes(7) ? reactions : existingReposts) as any);
      jest
        .spyOn(SimplePool.prototype, 'get')
        .mockImplementation((async (_relays: string[], filter: any) =>
          filter.ids ? note : null) as any);
    };

    it('is registered as a plug with a likes threshold', () => {
      const plugs = Reflect.getMetadata('custom:plug', NostrProvider.prototype);
      expect(plugs).toEqual([
        expect.objectContaining({
          identifier: 'nostr-autoRepostPost',
          methodName: 'autoRepostPost',
          fields: [expect.objectContaining({ name: 'likesAmount' })],
        }),
      ]);
    });

    it('waits for the next run while there are not enough likes', async () => {
      mockRelays([reaction(1), reaction(2)]);

      expect(await provider.autoRepostPost(channel, note.id, fields)).toBe(
        false
      );
      expect(published).toHaveLength(0);
    });

    it('published once the threshold is reached', async () => {
      mockRelays([reaction(1), reaction(2, '🔥'), reaction(3, '')]);

      expect(await provider.autoRepostPost(channel, note.id, fields)).toBe(
        true
      );
      expect(published).toHaveLength(1);
      expect(published[0].kind).toBe(6);
      expect(published[0].tags[0]).toEqual(['e', note.id, expect.any(String)]);
      expect(verifyEvent(published[0])).toBe(true);
    });

    it('only counts real likes from other accounts', async () => {
      mockRelays([
        reaction(1),
        reaction(1), // same account twice
        reaction(2, '-'), // dislike
        reaction(3, '+', [['e', 'f'.repeat(64)]]), // reaction to another note
        finalizeEvent(
          { kind: 7, created_at: 200, tags: [['e', note.id]], content: '+' },
          noteSk // like by the author itself
        ),
      ]);

      expect(await provider.autoRepostPost(channel, note.id, fields)).toBe(
        false
      );
      expect(published).toHaveLength(0);
    });

    it('does not repost twice when a run is retried', async () => {
      const mine = finalizeEvent(
        { kind: 6, created_at: 300, tags: [['e', note.id]], content: '' },
        noteSk
      );
      mockRelays([reaction(1), reaction(2), reaction(3)], [mine]);

      expect(await provider.autoRepostPost(channel, note.id, fields)).toBe(
        true
      );
      expect(published).toHaveLength(0);
    });
  });
});
