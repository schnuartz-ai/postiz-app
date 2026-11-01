// file-type is ESM only and jest runs CommonJS. The tests only need it to
// recognise the few formats they use.
const startsWith = (buffer: Uint8Array, bytes: number[], offset = 0) =>
  bytes.every((byte, index) => buffer[offset + index] === byte);

export const fileTypeFromBuffer = async (buffer: Uint8Array) => {
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47])) {
    return { mime: 'image/png', ext: 'png' };
  }
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) {
    return { mime: 'image/jpeg', ext: 'jpg' };
  }
  if (startsWith(buffer, [0x66, 0x74, 0x79, 0x70], 4)) {
    return { mime: 'video/mp4', ext: 'mp4' };
  }
  return undefined;
};
