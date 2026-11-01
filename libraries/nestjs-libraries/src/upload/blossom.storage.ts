import { Readable } from 'stream';
import { IUploadProvider, UploadedStream } from './upload.interface';
import { isSafePublicHttpsUrl } from '@gitroom/nestjs-libraries/dtos/webhooks/webhook.url.validator';
import { ssrfSafeDispatcher } from '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher';
import { parseDataUrl } from '@gitroom/nestjs-libraries/upload/data.url';
import {
  deleteFromBlossom,
  normalizeBlossomServer,
  parseNostrSecretKey,
  spoolStream,
  uploadToBlossom,
} from '@gitroom/nestjs-libraries/upload/blossom.client';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { fileTypeFromBuffer } = require('file-type');

const ALLOWED_MIME_TYPES = new Set<string>([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/avif',
  'image/bmp',
  'image/tiff',
  'video/mp4',
  'audio/mpeg',
  'audio/mp4',
  'audio/wav',
  'audio/ogg',
]);

/**
 * Stores every upload on a Blossom server (e.g. https://blossom.primal.net)
 * instead of the local disk / Cloudflare R2, so the instance itself stays
 * small. Files are signed with one instance wide Nostr key.
 *
 *   STORAGE_PROVIDER="blossom"
 *   BLOSSOM_SERVER_URL="https://blossom.primal.net"
 *   BLOSSOM_SECRET_KEY="<hex or nsec of a dedicated Nostr key>"
 */
export class BlossomStorage implements IUploadProvider {
  private readonly secretKey: Uint8Array;
  private readonly server: string;

  constructor(server: string | undefined, secretKey: string) {
    if (!secretKey) {
      throw new Error(
        'BLOSSOM_SECRET_KEY is required for STORAGE_PROVIDER=blossom'
      );
    }
    this.server = normalizeBlossomServer(server);
    this.secretKey = parseNostrSecretKey(secretKey);
  }

  async uploadSimple(path: string) {
    const dataUrl = path.startsWith('data:') ? parseDataUrl(path) : null;

    let body: Buffer;
    if (dataUrl) {
      body = dataUrl.buffer;
    } else {
      if (!(await isSafePublicHttpsUrl(path))) {
        throw new Error('Unsafe URL');
      }
      const load = await fetch(path, {
        // @ts-ignore — undici option, not in lib.dom fetch types
        dispatcher: ssrfSafeDispatcher,
      });
      body = Buffer.from(await load.arrayBuffer());
    }

    const detected = await fileTypeFromBuffer(body);
    if (!detected || !ALLOWED_MIME_TYPES.has(detected.mime)) {
      throw new Error('Unsupported file type.');
    }

    const { url } = await uploadToBlossom({
      server: this.server,
      secretKey: this.secretKey,
      data: body,
      mime: detected.mime,
    });

    return url;
  }

  async uploadFile(file: Express.Multer.File): Promise<any> {
    const detected = await fileTypeFromBuffer(file.buffer);
    if (!detected || !ALLOWED_MIME_TYPES.has(detected.mime)) {
      throw new Error('Unsupported file type.');
    }

    const descriptor = await uploadToBlossom({
      server: this.server,
      secretKey: this.secretKey,
      data: file.buffer,
      mime: detected.mime,
    });

    const filename = `${descriptor.sha256}.${detected.ext}`;
    return {
      filename,
      path: descriptor.url,
      mimetype: detected.mime,
      originalname: filename,
    };
  }

  /**
   * Uploads that arrive as a stream (the normal path for files from the
   * editor, up to 1 GB). Blossom needs the hash of the whole file before the
   * upload starts, so the stream is spooled to a temp file while it is hashed
   * and then sent from disk. Nothing big is kept in memory.
   */
  async uploadStream(
    stream: Readable,
    mimetype: string,
    ext: string
  ): Promise<UploadedStream> {
    if (!ALLOWED_MIME_TYPES.has(mimetype)) {
      throw new Error('Unsupported file type.');
    }

    const spooled = await spoolStream(stream);

    try {
      const descriptor = await uploadToBlossom({
        server: this.server,
        secretKey: this.secretKey,
        mime: mimetype,
        file: spooled,
      });

      const filename = `${spooled.sha256}.${ext}`;
      return {
        filename,
        path: descriptor.url,
        mimetype,
        originalname: filename,
      };
    } finally {
      await spooled.cleanup();
    }
  }

  async removeFile(filePath: string): Promise<void> {
    // Blossom blobs are content addressed and can be shared between users, so
    // this is best effort only and never throws.
    const sha256 = filePath.match(/[0-9a-f]{64}/i)?.[0]?.toLowerCase();
    if (!sha256) {
      return;
    }

    await deleteFromBlossom({
      server: this.server,
      secretKey: this.secretKey,
      sha256,
    });
  }
}
