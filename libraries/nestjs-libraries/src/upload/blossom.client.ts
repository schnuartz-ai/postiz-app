import { createHash } from 'crypto';
import { finalizeEvent, nip19 } from 'nostr-tools';
import { isSafePublicHttpsUrl } from '@gitroom/nestjs-libraries/dtos/webhooks/webhook.url.validator';
import { ssrfSafeDispatcher } from '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { fromBuffer } = require('file-type');

/**
 * Minimal Blossom (https://github.com/hzrd149/blossom) client.
 *
 * Implements only what we need:
 *  - BUD-02  PUT /upload                (upload a blob)
 *  - BUD-12  DELETE /<sha256>           (remove a blob, best effort)
 *  - BUD-11  kind 24242 authorization   (signed with a Nostr key)
 */

export const DEFAULT_BLOSSOM_SERVER = 'https://blossom.primal.net';

export type BlossomDescriptor = {
  url: string;
  sha256: string;
  size: number;
  type: string;
  uploaded?: number;
};

/** Accepts a 64 char hex private key or an `nsec1...` string. */
export const parseNostrSecretKey = (input: string): Uint8Array => {
  const value = (input || '').trim();

  if (value.startsWith('nsec1')) {
    const decoded = nip19.decode(value);
    if (decoded.type !== 'nsec') {
      throw new Error('Invalid nsec');
    }
    return decoded.data as Uint8Array;
  }

  if (!/^[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error('Nostr private key must be a 64 char hex or an nsec');
  }

  return Uint8Array.from(
    value.match(/.{1,2}/g)!.map((byte: string) => parseInt(byte, 16))
  );
};

/**
 * Turns user input into a clean `https://host[:port][/path]` origin without a
 * trailing slash. Returns the default server when nothing was provided and
 * throws if the value can not be used.
 */
export const normalizeBlossomServer = (input?: string): string => {
  const value = (input || '').trim();
  if (!value) {
    return DEFAULT_BLOSSOM_SERVER;
  }

  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  const url = new URL(withProtocol);

  if (url.protocol !== 'https:') {
    throw new Error('Blossom server must use https');
  }

  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
};

const sha256Hex = (data: Buffer) =>
  createHash('sha256').update(data).digest('hex');

const extensionFromMime = (mime: string) => {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/avif': 'avif',
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'video/webm': 'webm',
    'audio/mpeg': 'mp3',
  };
  return map[mime] || '';
};

const buildAuthorization = (
  secretKey: Uint8Array,
  verb: 'upload' | 'delete',
  sha256: string,
  label: string,
  encoding: 'base64' | 'base64url'
) => {
  const now = Math.floor(Date.now() / 1000);
  const event = finalizeEvent(
    {
      kind: 24242,
      created_at: now - 5,
      content: label,
      tags: [
        ['t', verb],
        ['x', sha256],
        ['expiration', String(now + 600)],
      ],
    },
    secretKey
  );

  return `Nostr ${Buffer.from(JSON.stringify(event)).toString(encoding)}`;
};

const request = async (
  server: string,
  path: string,
  init: RequestInit,
  timeoutMs: number
) => {
  return fetch(`${server}${path}`, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
    // @ts-ignore — undici option, not part of lib.dom fetch types.
    // Custom Blossom servers are user supplied, so never let them point to
    // internal addresses.
    dispatcher: ssrfSafeDispatcher,
  });
};

const reason = (res: Response) =>
  res.headers.get('x-reason') || `${res.status} ${res.statusText}`;

export const uploadToBlossom = async (params: {
  server?: string;
  secretKey: Uint8Array;
  data: Buffer;
  mime?: string;
}): Promise<BlossomDescriptor> => {
  const server = normalizeBlossomServer(params.server);
  if (!(await isSafePublicHttpsUrl(server))) {
    throw new Error('Unsafe Blossom server URL');
  }

  const detected = await fromBuffer(params.data);
  const mime = params.mime || detected?.mime || 'application/octet-stream';
  const sha256 = sha256Hex(params.data);

  // The spec says base64url, but many deployed servers/clients still use plain
  // base64. Try plain first (what most clients send), fall back to base64url.
  let res: Response | undefined;
  for (const encoding of ['base64', 'base64url'] as const) {
    res = await request(
      server,
      '/upload',
      {
        method: 'PUT',
        headers: {
          Authorization: buildAuthorization(
            params.secretKey,
            'upload',
            sha256,
            'Upload Blob',
            encoding
          ),
          'Content-Type': mime,
          'X-SHA-256': sha256,
        },
        body: params.data,
      },
      5 * 60 * 1000
    );

    if (res.status !== 401) {
      break;
    }
  }

  if (!res || !res.ok) {
    throw new Error(
      `Blossom upload to ${server} failed: ${res ? reason(res) : 'no response'}`
    );
  }

  let descriptor: Partial<BlossomDescriptor> = {};
  try {
    descriptor = await res.json();
  } catch {
    /** some servers answer with an empty body, we can rebuild the url below **/
  }

  if (descriptor.sha256 && descriptor.sha256 !== sha256) {
    throw new Error('Blossom server returned a different hash');
  }

  const extension = extensionFromMime(mime);
  const url =
    descriptor.url || `${server}/${sha256}${extension ? `.${extension}` : ''}`;

  if (!/^https:\/\//i.test(url)) {
    throw new Error('Blossom server returned an invalid url');
  }

  return {
    url,
    sha256,
    size: descriptor.size ?? params.data.length,
    type: descriptor.type || mime,
    uploaded: descriptor.uploaded,
  };
};

/** Best effort removal, never throws. */
export const deleteFromBlossom = async (params: {
  server?: string;
  secretKey: Uint8Array;
  sha256: string;
}): Promise<boolean> => {
  try {
    const server = normalizeBlossomServer(params.server);
    if (!(await isSafePublicHttpsUrl(server))) {
      return false;
    }

    for (const encoding of ['base64', 'base64url'] as const) {
      const res = await request(
        server,
        `/${params.sha256}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: buildAuthorization(
              params.secretKey,
              'delete',
              params.sha256,
              'Delete Blob',
              encoding
            ),
          },
        },
        30 * 1000
      );

      if (res.status !== 401) {
        return res.ok;
      }
    }
  } catch {
    /** nothing **/
  }

  return false;
};
