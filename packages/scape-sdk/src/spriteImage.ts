/** Bounded, static PNG data for sprite layers; never a URL or executable format. */
export function spriteImageError(value: unknown): string | null {
  if (
    typeof value !== 'string' ||
    value.length > 12000 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
  ) {
    return 'Sprite images require at most 12000 characters of PNG base64.';
  }
  const bytes = Uint8Array.from(atob(value), character => character.charCodeAt(0));
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 57 || signature.some((byte, index) => bytes[index] !== byte)) {
    return 'Sprite images must be PNG.';
  }
  const data = new DataView(bytes.buffer);
  let offset = 8;
  let hasData = false;
  while (offset + 12 <= bytes.length) {
    const length = data.getUint32(offset);
    const end = offset + length + 12;
    if (end > bytes.length) return 'Truncated sprite PNG.';
    const kind = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    if (offset === 8) {
      if (kind !== 'IHDR' || length !== 13) return 'Missing sprite PNG header.';
      const width = data.getUint32(offset + 8);
      const height = data.getUint32(offset + 12);
      if (
        width < 1 ||
        width > 256 ||
        height < 1 ||
        height > 256 ||
        bytes[offset + 16] !== 8 ||
        ![2, 6].includes(bytes[offset + 17]) ||
        bytes[offset + 18] !== 0 ||
        bytes[offset + 19] !== 0 ||
        bytes[offset + 20] !== 0
      ) {
        return 'Sprite PNGs require 1–256 pixels per side, 8-bit RGB/RGBA, without interlacing.';
      }
    } else if (kind === 'IDAT') {
      hasData = true;
    } else if (kind === 'IEND') {
      return length === 0 && hasData && end === bytes.length ? null : 'Invalid sprite PNG end.';
    } else {
      // Exclude animation and metadata, including compressed ancillary payloads.
      return 'Sprite PNGs support only IHDR, IDAT and IEND chunks.';
    }
    offset = end;
  }
  return 'Incomplete sprite PNG.';
}
