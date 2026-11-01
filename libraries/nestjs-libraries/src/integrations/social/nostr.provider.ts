import {
  AuthTokenDetails,
  MediaContent,
  PostDetails,
  PostResponse,
  SocialProvider,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { makeSecureId } from '@gitroom/nestjs-libraries/services/make.secure.id';
import dayjs from 'dayjs';
import { SocialAbstract } from '@gitroom/nestjs-libraries/integrations/social.abstract';
import {
  Event as NostrEvent,
  finalizeEvent,
  getPublicKey,
  nip18,
  nip19,
  SimplePool,
  verifyEvent,
} from 'nostr-tools';

import WebSocket from 'ws';
import { AuthService } from '@gitroom/helpers/auth/auth.service';
import { Integration } from '@prisma/client';
import { PostPlug } from '@gitroom/helpers/decorators/post.plug';
import { DashboardFunction } from '@gitroom/nestjs-libraries/integrations/dashboard.function.decorator';
import { Plug } from '@gitroom/helpers/decorators/plug.decorator';
import { isSafePublicHttpsUrl } from '@gitroom/nestjs-libraries/dtos/webhooks/webhook.url.validator';
import { ssrfSafeDispatcher } from '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher';
import {
  BlossomDescriptor,
  checkBlossomUpload,
  DEFAULT_BLOSSOM_SERVER,
  mirrorToBlossom,
  normalizeBlossomServer,
  parseNostrSecretKey,
  spoolStream,
  uploadToBlossom,
} from '@gitroom/nestjs-libraries/upload/blossom.client';
import {
  effectiveBlossomServers,
  readNostrSettings,
} from '@gitroom/nestjs-libraries/integrations/social/nostr.settings';

// @ts-ignore
global.WebSocket = WebSocket;

const csv = (value: string | undefined, fallback: string[]) => {
  const list = (value || '')
    .split(',')
    .map((p) => p.trim())
    .filter((p) => /^wss:\/\//i.test(p));
  return list.length ? list : fallback;
};

// Relays every note is published to (on top of the NIP-65 write relays of the
// account). relay.primal.net is what Primal reads from.
const DEFAULT_RELAYS = [
  'wss://relay.primal.net',
  'wss://nos.lol',
  'wss://relay.damus.io',
  'wss://relay.snort.social',
  'wss://temp.iris.to',
  'wss://vault.iris.to',
];

// NIP-50 capable relays, used for the @mention autocomplete.
const DEFAULT_SEARCH_RELAYS = [
  'wss://search.nos.today',
  'wss://relay.nostr.band',
];

// Primal's own caching service, it has by far the best user search.
const DEFAULT_PRIMAL_CACHE = 'wss://cache2.primal.net/v1';

const pool = new SimplePool();

const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> => {
  let timer: NodeJS.Timeout;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('timeout')), ms);
    }),
  ]).finally(() => clearTimeout(timer)) as Promise<T>;
};

// Up to this size a file is read into memory, bigger ones (videos) are
// streamed to a temp file so a 1 GB video never sits in memory.
const LARGE_MEDIA_BYTES = 25 * 1024 * 1024;

type MediaSource = {
  data?: Buffer;
  file?: { path: string; sha256: string; size: number };
  mime?: string;
  cleanup?: () => Promise<void>;
};

type HostedMedia = {
  url: string;
  mime?: string;
  sha256?: string;
  size?: number;
  alt?: string;
};

type ProfileResult = {
  id: string;
  label: string;
  image: string;
};

const BECH32 = '[023456789acdefghjklmnpqrstuvwxyz]';
const NIP27_REFERENCE = new RegExp(
  `nostr:((?:npub|nprofile|note|nevent)1${BECH32}+)`,
  'g'
);
const NIP05_REGEX = /^(?:([\w.+-]+)@)?([a-z0-9-]+(?:\.[a-z0-9-]+)+)$/i;

export class NostrProvider extends SocialAbstract implements SocialProvider {
  override maxConcurrentJob = 5;
  identifier = 'nostr';
  name = 'Nostr';
  isBetweenSteps = false;
  scopes = [] as string[];
  editor = 'normal' as const;
  toolTip =
    'Use your Nostr private key as HEX or nsec. Media is uploaded to the Blossom server you choose (default: Primal).';

  maxLength() {
    return 100000;
  }

  async customFields() {
    return [
      {
        key: 'password',
        label: 'Nostr private key (hex or nsec)',
        validation: `/^(nsec1[0-9a-z]{50,}|[0-9a-fA-F]{64})$/`,
        type: 'password' as const,
      },
      {
        key: 'blossom',
        label: 'Blossom media server',
        defaultValue: DEFAULT_BLOSSOM_SERVER,
        validation: `/^https:\\/\\/[^\\s]+$/`,
        type: 'text' as const,
      },
    ];
  }

  async refreshToken(refresh_token: string): Promise<AuthTokenDetails> {
    return {
      refreshToken: '',
      expiresIn: 0,
      accessToken: '',
      id: '',
      name: '',
      picture: '',
      username: '',
    };
  }

  async generateAuthUrl() {
    const state = makeSecureId(17);
    return {
      url: state,
      codeVerifier: makeSecureId(10),
      state,
    };
  }

  // ---------------------------------------------------------------------------
  // helpers
  // ---------------------------------------------------------------------------

  private relays() {
    return csv(process.env.NOSTR_RELAYS, DEFAULT_RELAYS);
  }

  private async findRelayInformation(pubkey: string) {
    // This queries ALL relays in parallel and resolves with
    // the first matching event from ANY relay.
    const evt = await pool.get(
      this.relays(),
      {
        kinds: [0],
        authors: [pubkey],
        limit: 1,
      },
      { maxWait: 6000 }
    );

    if (!evt) return {};

    let content: any = {};
    try {
      content = JSON.parse(evt.content || '{}');
    } catch {
      return {};
    }

    if (content.name || content.displayName || content.display_name) {
      return content;
    }

    return {};
  }

  /**
   * Default relays + the relays configured for the channel + the write relays
   * the account announced with NIP-65, so a note shows up wherever the
   * account's followers actually read from.
   */
  private async getPublishRelays(
    pubkey: string,
    configured: string[] = []
  ): Promise<string[]> {
    const base = this.relays();

    // never connect to internal addresses just because somebody typed them in
    const onlyPublic = async (relays: string[], max: number) => {
      const safe: string[] = [];
      for (const relay of relays.slice(0, max)) {
        if (await isSafePublicHttpsUrl(relay.replace(/^wss:/i, 'https:'))) {
          safe.push(relay);
        }
      }
      return safe;
    };

    try {
      const own = await onlyPublic(configured, 20);

      const evt = await pool.get(
        base,
        { kinds: [10002], authors: [pubkey], limit: 1 },
        { maxWait: 4000 }
      );

      const announced = (evt?.tags || [])
        .filter(
          (t) =>
            t[0] === 'r' &&
            /^wss:\/\//i.test(t[1] || '') &&
            (!t[2] || t[2] === 'write')
        )
        .map((t) => t[1].replace(/\/+$/, ''));

      return Array.from(
        new Set([...base, ...own, ...(await onlyPublic(announced, 8))])
      );
    } catch {
      return base;
    }
  }

  /** Same as getPublishRelays, with the relays saved in the channel settings. */
  private relaysFor(integration?: Integration, pubkey?: string) {
    return this.getPublishRelays(
      (pubkey || integration?.internalId) as string,
      readNostrSettings(integration?.customInstanceDetails).relays
    );
  }

  /**
   * Publishes to all relays and succeeds when at least one relay accepted the
   * event. Always returns the real id of the event we signed.
   */
  private async publishEvent(relays: string[], event: NostrEvent) {
    const results = await Promise.allSettled(
      pool.publish(relays, event).map((p) => withTimeout(p, 10000))
    );

    if (!results.some((r) => r.status === 'fulfilled')) {
      throw new Error(
        `Could not publish to any Nostr relay: ${results
          .map((r) => (r.status === 'rejected' ? String(r.reason) : ''))
          .filter(Boolean)
          .slice(0, 3)
          .join(' | ')}`
      );
    }

    return event.id;
  }

  private getSecretKey(accessToken: string) {
    const { password } = AuthService.verifyJWT(accessToken) as any;
    return parseNostrSecretKey(password);
  }

  /** Blossom servers of the channel (first = primary), or the instance default. */
  private getBlossomServers(integration?: Integration): string[] {
    return effectiveBlossomServers(
      readNostrSettings(integration?.customInstanceDetails)
    );
  }

  /**
   * Moves the media of a post to Blossom so our own storage is not needed for
   * what ends up inside the note. The first server that takes the file is the
   * one the note links to, the servers after it get a mirror copy as backup.
   * If no server works we keep the original URL, a Blossom outage must never
   * block a post.
   */
  private async hostMedia(
    media: MediaContent[] | undefined,
    secretKey: Uint8Array,
    servers: string[]
  ): Promise<HostedMedia[]> {
    const hosted: HostedMedia[] = [];

    for (const m of media || []) {
      const publicUrl: string = (m as any).url || m.path;
      if (!m.path && !publicUrl) {
        continue;
      }

      const fallback: HostedMedia = { url: publicUrl, alt: m.alt };

      if (!servers.length) {
        hosted.push(fallback);
        continue;
      }

      const onPrimary = this.sameHost(publicUrl, servers[0]);
      const hashInUrl = publicUrl.match(/[0-9a-f]{64}/i)?.[0]?.toLowerCase();

      if (onPrimary && hashInUrl) {
        // already there (e.g. STORAGE_PROVIDER=blossom), only the backups are left
        await Promise.allSettled(
          servers
            .slice(1)
            .map((server) =>
              this.mirror(server, secretKey, publicUrl, hashInUrl)
            )
        );
        hosted.push({ url: publicUrl, sha256: hashInUrl, alt: m.alt });
        continue;
      }

      if (onPrimary) {
        hosted.push(fallback);
        continue;
      }

      let source: MediaSource | undefined;
      try {
        source = await this.loadMedia(m.path || publicUrl);
        hosted.push(
          (await this.uploadEverywhere(source, secretKey, servers, m.alt)) ||
            fallback
        );
      } catch (err) {
        console.warn(
          `Nostr: could not move media to Blossom, keeping original url (${
            (err as Error)?.message
          })`
        );
        hosted.push(fallback);
      } finally {
        await source?.cleanup?.();
      }
    }

    return hosted;
  }

  /** Small files are read into memory, big ones go through a temp file. */
  private async loadMedia(path: string): Promise<MediaSource> {
    const size = await this.mediaSize(path).catch(() => 0);

    if (size > LARGE_MEDIA_BYTES) {
      const spooled = await spoolStream(await this.mediaStream(path));
      return { file: spooled, mime: spooled.mime, cleanup: spooled.cleanup };
    }

    return { data: await this.readOrFetch(path) };
  }

  private uploadSource(
    server: string,
    secretKey: Uint8Array,
    source: MediaSource
  ) {
    return uploadToBlossom({
      server,
      secretKey,
      data: source.data,
      file: source.file,
      mime: source.mime,
    });
  }

  /** First server that works is linked, the ones after it get a backup. */
  private async uploadEverywhere(
    source: MediaSource,
    secretKey: Uint8Array,
    servers: string[],
    alt?: string
  ): Promise<HostedMedia | undefined> {
    for (const [index, server] of servers.entries()) {
      let uploaded: BlossomDescriptor;
      try {
        uploaded = await this.uploadSource(server, secretKey, source);
      } catch (err) {
        console.warn(
          `Nostr: Blossom upload failed (${(err as Error)?.message})`
        );
        continue;
      }

      // servers before this one already failed, they are not asked again
      await Promise.allSettled(
        servers
          .slice(index + 1)
          .map((backup) =>
            this.mirror(
              backup,
              secretKey,
              uploaded.url,
              uploaded.sha256,
              source
            )
          )
      );

      return {
        url: uploaded.url,
        mime: uploaded.type,
        sha256: uploaded.sha256,
        size: uploaded.size,
        alt,
      };
    }

    return undefined;
  }

  private sameHost(url: string, server: string) {
    try {
      return new URL(url).host === new URL(server).host;
    } catch {
      return false;
    }
  }

  /** Backup copy: ask the server to fetch the file (BUD-04), else send it. */
  private async mirror(
    server: string,
    secretKey: Uint8Array,
    sourceUrl: string,
    sha256: string,
    source?: MediaSource
  ) {
    const result = await mirrorToBlossom({
      server,
      secretKey,
      sourceUrl,
      sha256,
    });

    if (result.ok) {
      return;
    }

    // 403/413/415/429 would fail for a direct upload as well
    const retryable =
      !result.status || [400, 404, 405, 501, 502].includes(result.status);

    if (source && retryable) {
      try {
        await this.uploadSource(server, secretKey, source);
        return;
      } catch (err) {
        console.warn(
          `Nostr: backup upload to ${server} failed (${
            (err as Error)?.message
          })`
        );
        return;
      }
    }

    console.warn(
      `Nostr: backup copy on ${server} failed (${
        result.reason || result.status
      })`
    );
  }

  /** p tags for @mentions, q tags for quoted notes (NIP-27) and t tags. */
  private referenceTags(content: string): string[][] {
    const tags: string[][] = [];
    const seen = new Set<string>();
    const add = (tag: string[]) => {
      const key = tag.slice(0, 2).join(':');
      if (!seen.has(key)) {
        seen.add(key);
        tags.push(tag);
      }
    };

    for (const match of content.matchAll(NIP27_REFERENCE)) {
      try {
        const decoded = nip19.decode(String(match[1]));
        switch (decoded.type) {
          case 'npub':
            add(['p', decoded.data]);
            break;
          case 'nprofile':
            add([
              'p',
              decoded.data.pubkey,
              ...(decoded.data.relays?.[0] ? [decoded.data.relays[0]] : []),
            ]);
            break;
          case 'note':
            add(['q', decoded.data]);
            break;
          case 'nevent':
            add([
              'q',
              decoded.data.id,
              ...(decoded.data.relays?.[0] ? [decoded.data.relays[0]] : []),
            ]);
            break;
        }
      } catch {
        /** not a valid reference, leave it as plain text **/
      }
    }

    for (const match of content.matchAll(/(?:^|\s)#([\p{L}\p{N}_]{1,64})/gu)) {
      add(['t', match[1].toLowerCase()]);
    }

    return tags;
  }

  private buildNote(message: string, hosted: HostedMedia[]) {
    const mediaContent = hosted.map((m) => m.url).join('\n\n');
    const content = mediaContent ? `${message}\n\n${mediaContent}` : message;

    // NIP-92 media metadata, clients use it for placeholders and alt text
    const imeta = hosted
      .filter((m) => m.mime || m.sha256)
      .map((m) => [
        'imeta',
        `url ${m.url}`,
        ...(m.mime ? [`m ${m.mime}`] : []),
        ...(m.sha256 ? [`x ${m.sha256}`] : []),
        ...(m.size ? [`size ${m.size}`] : []),
        ...(m.alt ? [`alt ${m.alt}`] : []),
      ]);

    return { content, tags: [...imeta, ...this.referenceTags(content)] };
  }

  /** Link for a note that was connected by hand (SocialProvider.releaseUrl). */
  async releaseUrl(
    accessToken: string,
    releaseId: string,
    integration: Integration
  ): Promise<string | undefined> {
    try {
      return this.noteUrl(
        releaseId.trim().toLowerCase(),
        integration.internalId
      );
    } catch {
      return undefined;
    }
  }

  private noteUrl(eventId: string, pubkey: string, relay?: string) {
    return `https://primal.net/e/${nip19.neventEncode({
      id: eventId,
      author: pubkey,
      ...(relay ? { relays: [relay] } : {}),
    })}`;
  }

  // ---------------------------------------------------------------------------
  // auth
  // ---------------------------------------------------------------------------

  async authenticate(params: {
    code: string;
    codeVerifier: string;
    refresh?: string;
  }) {
    try {
      const body = JSON.parse(Buffer.from(params.code, 'base64').toString());

      // accepts hex and nsec, always stored as hex
      const secretKey = parseNostrSecretKey(body.password);
      const hexKey = Buffer.from(secretKey).toString('hex');
      const pubkey = getPublicKey(secretKey);

      const user = await this.findRelayInformation(pubkey);

      return {
        id: pubkey,
        name: user.display_name || user.displayName || user.name || 'No Name',
        accessToken: AuthService.signJWT({ password: hexKey }),
        refreshToken: '',
        expiresIn: dayjs().add(200, 'year').unix() - dayjs().unix(),
        picture: user?.picture || '',
        username: user.name || 'nousername',
      };
    } catch (e) {
      console.log(e);
      return 'Invalid credentials';
    }
  }

  // ---------------------------------------------------------------------------
  // posting
  // ---------------------------------------------------------------------------

  async post(
    id: string,
    accessToken: string,
    postDetails: PostDetails[],
    integration: Integration
  ): Promise<PostResponse[]> {
    const secretKey = this.getSecretKey(accessToken);
    const [firstPost] = postDetails;

    const hosted = await this.hostMedia(
      firstPost.media,
      secretKey,
      this.getBlossomServers(integration)
    );
    const { content, tags } = this.buildNote(firstPost.message, hosted);

    const event = finalizeEvent(
      {
        kind: 1, // Text note
        content,
        tags,
        created_at: Math.floor(Date.now() / 1000),
      },
      secretKey
    );

    const relays = await this.relaysFor(integration, id);
    const eventId = await this.publishEvent(relays, event);

    return [
      {
        id: firstPost.id,
        postId: eventId,
        releaseURL: this.noteUrl(eventId, id, relays[0]),
        status: 'completed',
      },
    ];
  }

  async comment(
    id: string,
    postId: string,
    lastCommentId: string | undefined,
    accessToken: string,
    postDetails: PostDetails[],
    integration: Integration
  ): Promise<PostResponse[]> {
    const secretKey = this.getSecretKey(accessToken);
    const [commentPost] = postDetails;

    const hosted = await this.hostMedia(
      commentPost.media,
      secretKey,
      this.getBlossomServers(integration)
    );
    const { content, tags } = this.buildNote(commentPost.message, hosted);

    // NIP-10: the first post is the root, the previous comment is the parent
    const threadTags = lastCommentId
      ? [
          ['e', postId, '', 'root', id],
          ['e', lastCommentId, '', 'reply', id],
        ]
      : [['e', postId, '', 'root', id]];

    const event = finalizeEvent(
      {
        kind: 1, // Text note
        content,
        tags: [...threadTags, ['p', id], ...tags],
        created_at: Math.floor(Date.now() / 1000),
      },
      secretKey
    );

    const relays = await this.relaysFor(integration, id);
    const eventId = await this.publishEvent(relays, event);

    return [
      {
        id: commentPost.id,
        postId: eventId,
        releaseURL: this.noteUrl(eventId, id, relays[0]),
        status: 'completed',
      },
    ];
  }

  // ---------------------------------------------------------------------------
  // Blossom server settings (called from the "Nostr settings" dialog through
  // /integrations/function, they must not throw)
  // ---------------------------------------------------------------------------

  /** "Test" button: would this server take an upload from the channel's key? */
  @DashboardFunction()
  async testBlossomServer(
    token: string,
    data: { server: string },
    id: string,
    integration: Integration
  ) {
    let server: string;
    try {
      server = normalizeBlossomServer(data?.server);
    } catch {
      return {
        server: data?.server,
        state: 'unreachable',
        reason: 'Invalid URL',
      };
    }

    return {
      server,
      ...(await checkBlossomUpload({
        server,
        secretKey: this.getSecretKey(token),
      })),
    };
  }

  /**
   * "Publish server list" button: writes the saved servers as the account's
   * kind 10063 list (BUD-03), so other apps find the backup copies when a link
   * to the first server stops working.
   */
  @DashboardFunction()
  async publishBlossomServerList(
    token: string,
    data: unknown,
    id: string,
    integration: Integration
  ) {
    const servers = this.getBlossomServers(integration);
    if (!servers.length) {
      return { ok: false, reason: 'No Blossom server configured' };
    }

    try {
      const event = finalizeEvent(
        {
          kind: 10063,
          created_at: Math.floor(Date.now() / 1000),
          content: '',
          tags: servers.map((server) => ['server', server]),
        },
        this.getSecretKey(token)
      );

      await this.publishEvent(await this.relaysFor(integration, id), event);
      return { ok: true, servers };
    } catch (err) {
      return { ok: false, reason: (err as Error)?.message };
    }
  }

  // ---------------------------------------------------------------------------
  // reposts by the other Nostr channels of the organization
  // ---------------------------------------------------------------------------

  @PostPlug({
    identifier: 'nostr-repost-post-users',
    title: 'Add Re-posters',
    description: 'Add accounts to repost your post',
    pickIntegration: ['nostr'],
    fields: [],
  })
  async repostPostUsers(
    integration: Integration,
    originalIntegration: Integration,
    postId: string,
    information: any
  ) {
    // the original note was just published, give the relays a moment
    const lookupRelays = Array.from(
      new Set([
        ...(await this.relaysFor(originalIntegration)),
        ...(await this.relaysFor(integration)),
      ])
    );

    await this.repostNote(integration, postId, lookupRelays, 3);
  }

  @Plug({
    identifier: 'nostr-autoRepostPost',
    title: 'Auto Repost Posts',
    description:
      'When a post reached a certain number of likes, repost it to increase engagement (checked every 6 hours, 3 times)',
    runEveryMilliseconds: 21600000,
    totalRuns: 3,
    fields: [
      {
        name: 'likesAmount',
        type: 'number',
        placeholder: 'Amount of likes',
        description: 'The amount of likes to trigger the repost',
        validation: /^\d+$/,
      },
    ],
  })
  async autoRepostPost(
    integration: Integration,
    id: string,
    fields: { likesAmount: string }
  ) {
    const relays = await this.relaysFor(integration);
    const needed = Math.max(1, Number(fields?.likesAmount) || 1);

    if ((await this.countLikes(id, integration.internalId, relays)) < needed) {
      // try again on the next run
      return false;
    }

    // a retried run must never repost twice
    if (!(await this.alreadyReposted(id, integration.internalId, relays))) {
      await this.repostNote(integration, id, relays, 1);
    }

    return true;
  }

  /**
   * Distinct accounts that liked the note (NIP-25). Dislikes ("-"), likes by
   * the author and reactions that point to another note are ignored. Reactions
   * are spread over many relays, so this is a lower bound.
   */
  private async countLikes(
    eventId: string,
    author: string,
    relays: string[]
  ): Promise<number> {
    const reactions = await pool.querySync(
      relays,
      { kinds: [7], '#e': [eventId], limit: 1000 },
      { maxWait: 8000 }
    );

    const likers = new Set<string>();
    for (const reaction of reactions) {
      if (reaction.pubkey === author || reaction.content === '-') {
        continue;
      }

      // NIP-25: the last e tag is the note that was reacted to
      const reactedTo = [...reaction.tags].reverse().find((t) => t[0] === 'e');
      if (reactedTo?.[1] === eventId) {
        likers.add(reaction.pubkey);
      }
    }

    return likers.size;
  }

  private async alreadyReposted(
    eventId: string,
    pubkey: string,
    relays: string[]
  ): Promise<boolean> {
    try {
      const existing = await pool.querySync(
        relays,
        { kinds: [6, 16], authors: [pubkey], '#e': [eventId], limit: 1 },
        { maxWait: 5000 }
      );
      return existing.length > 0;
    } catch {
      return false;
    }
  }

  /** Looks the note up on the relays and publishes a NIP-18 repost for the channel. */
  private async repostNote(
    integration: Integration,
    eventId: string,
    lookupRelays: string[],
    attempts: number
  ) {
    const secretKey = this.getSecretKey(integration.token);

    let original: NostrEvent | null = null;
    for (let attempt = 0; attempt < attempts && !original; attempt++) {
      original = await pool.get(
        lookupRelays,
        { ids: [eventId] },
        { maxWait: 5000 }
      );
      if (!original && attempt < attempts - 1) {
        await new Promise((res) => setTimeout(res, 2000));
      }
    }

    if (!original) {
      throw new Error('Original Nostr note not found on the relays');
    }

    // NIP-18: kind 6 for text notes, kind 16 for everything else
    const repost = nip18.finishRepostEvent(
      { created_at: Math.floor(Date.now() / 1000) },
      original,
      lookupRelays[0],
      secretKey
    );

    await this.publishEvent(await this.relaysFor(integration), repost);
  }

  // ---------------------------------------------------------------------------
  // @mentions
  // ---------------------------------------------------------------------------

  private toResult(pubkey: string, metadata: any): ProfileResult | undefined {
    const name =
      metadata?.display_name ||
      metadata?.displayName ||
      metadata?.name ||
      metadata?.nip05;

    if (!name) {
      return undefined;
    }

    const picture = String(metadata?.picture || '');
    return {
      id: nip19.npubEncode(pubkey),
      label: String(name).slice(0, 80),
      image: /^https:\/\//i.test(picture) ? picture : '',
    };
  }

  private fromProfileEvents(events: NostrEvent[]): ProfileResult[] {
    const newest = new Map<string, NostrEvent>();
    for (const evt of events) {
      const current = newest.get(evt.pubkey);
      if (!current || current.created_at < evt.created_at) {
        newest.set(evt.pubkey, evt);
      }
    }

    return Array.from(newest.values())
      .map((evt) => {
        try {
          return this.toResult(evt.pubkey, JSON.parse(evt.content || '{}'));
        } catch {
          return undefined;
        }
      })
      .filter((p): p is ProfileResult => !!p);
  }

  private async profileByPubkey(pubkey: string): Promise<ProfileResult[]> {
    const evt = await pool.get(
      this.relays(),
      { kinds: [0], authors: [pubkey], limit: 1 },
      { maxWait: 4000 }
    );
    return evt ? this.fromProfileEvents([evt]) : [];
  }

  /** Resolves name@domain.com (or just domain.com) without trusting redirects. */
  private async profileByNip05(query: string): Promise<ProfileResult[]> {
    const match = query.match(NIP05_REGEX);
    if (!match) {
      return [];
    }

    const name = (match[1] || '_').toLowerCase();
    const domain = match[2].toLowerCase();
    if (!(await isSafePublicHttpsUrl(`https://${domain}`))) {
      return [];
    }

    try {
      const res = await fetch(
        `https://${domain}/.well-known/nostr.json?name=${encodeURIComponent(
          name
        )}`,
        {
          redirect: 'error',
          signal: AbortSignal.timeout(4000),
          // @ts-ignore — undici option, not in lib.dom fetch types
          dispatcher: ssrfSafeDispatcher,
        }
      );
      const pubkey = (await res.json())?.names?.[name];
      return /^[0-9a-f]{64}$/i.test(pubkey || '')
        ? await this.profileByPubkey(pubkey.toLowerCase())
        : [];
    } catch {
      return [];
    }
  }

  /** Same user search the Primal apps use. Fails silently. */
  private searchPrimal(query: string): Promise<NostrEvent[]> {
    return new Promise((resolve) => {
      const events: NostrEvent[] = [];
      let done = false;
      let ws: WebSocket | undefined;

      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        try {
          ws?.close();
        } catch {
          /** nothing **/
        }
        resolve(events);
      };

      const timer = setTimeout(finish, 4000);

      try {
        const url = csv(process.env.NOSTR_PRIMAL_CACHE_URL, [
          DEFAULT_PRIMAL_CACHE,
        ])[0];
        ws = new WebSocket(url);
        const subscription = makeSecureId(10);

        ws.on('open', () =>
          ws!.send(
            JSON.stringify([
              'REQ',
              subscription,
              { cache: ['user_search', { query, limit: 10 }] },
            ])
          )
        );
        ws.on('message', (raw) => {
          try {
            const msg = JSON.parse(raw.toString());
            if (
              msg[0] === 'EVENT' &&
              msg[2]?.kind === 0 &&
              verifyEvent(msg[2])
            ) {
              events.push(msg[2]);
            }
            if (msg[0] === 'EOSE' || msg[0] === 'CLOSED') {
              finish();
            }
          } catch {
            /** ignore unknown frames **/
          }
        });
        ws.on('error', finish);
        ws.on('close', finish);
      } catch {
        finish();
      }
    });
  }

  private async searchRelays(query: string): Promise<NostrEvent[]> {
    try {
      return await pool.querySync(
        csv(process.env.NOSTR_SEARCH_RELAYS, DEFAULT_SEARCH_RELAYS),
        { kinds: [0], search: query, limit: 10 },
        { maxWait: 4000 }
      );
    } catch {
      return [];
    }
  }

  override async mention(
    token: string,
    d: { query: string },
    id: string,
    integration: Integration
  ) {
    const query = (d?.query || '').trim().replace(/^@/, '');
    if (query.length < 2) {
      return [];
    }

    // pasted npub / nprofile / hex pubkey
    if (/^(npub1|nprofile1)/i.test(query) || /^[0-9a-f]{64}$/i.test(query)) {
      try {
        let pubkey = query.toLowerCase();
        if (!/^[0-9a-f]{64}$/.test(pubkey)) {
          const decoded = nip19.decode(pubkey);
          pubkey =
            decoded.type === 'npub'
              ? decoded.data
              : decoded.type === 'nprofile'
              ? decoded.data.pubkey
              : '';
        }
        const profile = await this.profileByPubkey(pubkey);
        return profile.length
          ? profile
          : [
              {
                id: nip19.npubEncode(pubkey),
                label: query.slice(0, 16),
                image: '',
              },
            ];
      } catch {
        return [];
      }
    }

    const [nip05, primal, relays] = await Promise.all([
      this.profileByNip05(query),
      this.searchPrimal(query).then((e) => this.fromProfileEvents(e)),
      this.searchRelays(query).then((e) => this.fromProfileEvents(e)),
    ]);

    // Primal first (best ranking), then the NIP-50 relays, de-duplicated
    const seen = new Set<string>();
    return [...nip05, ...primal, ...relays]
      .filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)))
      .slice(0, 15);
  }

  mentionFormat(idOrHandle: string, name: string) {
    // NIP-27. Must not use `this`, the orchestrator passes this as a plain function.
    if (/^[0-9a-f]{64}$/i.test(idOrHandle)) {
      return `nostr:${nip19.npubEncode(idOrHandle.toLowerCase())}`;
    }
    return `nostr:${idOrHandle.replace(/^nostr:/, '').replace(/^@/, '')}`;
  }
}
