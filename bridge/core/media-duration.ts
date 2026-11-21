/**
 * Reads how long an MP4 or WebM file plays, straight from its header, so a variant alert can stay on
 * screen for exactly the length of its video. Returns undefined when the file does not say.
 */
export function readMediaDurationMs(bytes: Buffer, extension: string): number | undefined {
  try {
    const seconds = extension === 'mp4' ? mp4DurationSeconds(bytes) : extension === 'webm' ? webmDurationSeconds(bytes) : undefined;
    if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0 || seconds > 24 * 60 * 60) return undefined;
    return Math.round(seconds * 1_000);
  } catch {
    return undefined;
  }
}

/** MP4: the movie header (moov > mvhd) holds a timescale and a duration in that timescale. */
function mp4DurationSeconds(bytes: Buffer): number | undefined {
  const moov = findBox(bytes, 0, bytes.length, 'moov');
  if (moov === undefined) return undefined;
  const mvhd = findBox(bytes, moov.start, moov.end, 'mvhd');
  if (mvhd === undefined) return undefined;
  const version = bytes.readUInt8(mvhd.start);
  if (version === 1) {
    const timescale = bytes.readUInt32BE(mvhd.start + 20);
    const duration = Number(bytes.readBigUInt64BE(mvhd.start + 24));
    return timescale > 0 ? duration / timescale : undefined;
  }
  const timescale = bytes.readUInt32BE(mvhd.start + 12);
  const duration = bytes.readUInt32BE(mvhd.start + 16);
  return timescale > 0 && duration !== 0xffffffff ? duration / timescale : undefined;
}

function findBox(bytes: Buffer, from: number, to: number, type: string): { readonly start: number; readonly end: number } | undefined {
  let offset = from;
  while (offset + 8 <= to) {
    let size = bytes.readUInt32BE(offset);
    const boxType = bytes.toString('latin1', offset + 4, offset + 8);
    let header = 8;
    if (size === 1) {
      if (offset + 16 > to) return undefined;
      size = Number(bytes.readBigUInt64BE(offset + 8));
      header = 16;
    } else if (size === 0) size = to - offset;
    if (size < header || offset + size > to) return boxType === type ? { start: offset + header, end: to } : undefined;
    if (boxType === type) return { start: offset + header, end: offset + size };
    offset += size;
  }
  return undefined;
}

const EBML_SEGMENT = 0x18538067;
const EBML_INFO = 0x1549a966;
const EBML_TIMECODE_SCALE = 0x2ad7b1;
const EBML_DURATION = 0x4489;

/** WebM: Segment > Info holds Duration (a float, in TimecodeScale units of nanoseconds). */
function webmDurationSeconds(bytes: Buffer): number | undefined {
  let offset = 0;
  // Skip the EBML header element, then walk to the Segment.
  while (offset < bytes.length) {
    const id = readElementId(bytes, offset); if (id === undefined) return undefined;
    const size = readVint(bytes, offset + id.length); if (size === undefined) return undefined;
    const dataStart = offset + id.length + size.length;
    if (id.value === EBML_SEGMENT) return webmSegmentDuration(bytes, dataStart, size.unknown ? bytes.length : Math.min(bytes.length, dataStart + size.value));
    if (size.unknown) return undefined;
    offset = dataStart + size.value;
  }
  return undefined;
}

function webmSegmentDuration(bytes: Buffer, from: number, to: number): number | undefined {
  let offset = from;
  while (offset < to) {
    const id = readElementId(bytes, offset); if (id === undefined) return undefined;
    const size = readVint(bytes, offset + id.length); if (size === undefined || size.unknown) return undefined;
    const dataStart = offset + id.length + size.length;
    if (id.value === EBML_INFO) return webmInfoDuration(bytes, dataStart, Math.min(to, dataStart + size.value));
    offset = dataStart + size.value;
  }
  return undefined;
}

function webmInfoDuration(bytes: Buffer, from: number, to: number): number | undefined {
  let timecodeScale = 1_000_000;
  let duration: number | undefined;
  let offset = from;
  while (offset < to) {
    const id = readElementId(bytes, offset); if (id === undefined) break;
    const size = readVint(bytes, offset + id.length); if (size === undefined || size.unknown) break;
    const dataStart = offset + id.length + size.length;
    if (id.value === EBML_TIMECODE_SCALE && size.value > 0 && size.value <= 8) timecodeScale = bytes.readUIntBE(dataStart, Math.min(6, size.value));
    if (id.value === EBML_DURATION) duration = size.value === 4 ? bytes.readFloatBE(dataStart) : size.value === 8 ? bytes.readDoubleBE(dataStart) : undefined;
    offset = dataStart + size.value;
  }
  return duration === undefined ? undefined : duration * timecodeScale / 1e9;
}

function readElementId(bytes: Buffer, offset: number): { readonly value: number; readonly length: number } | undefined {
  if (offset >= bytes.length) return undefined;
  const first = bytes.readUInt8(offset);
  const length = first >= 0x80 ? 1 : first >= 0x40 ? 2 : first >= 0x20 ? 3 : first >= 0x10 ? 4 : 0;
  if (length === 0 || offset + length > bytes.length) return undefined;
  return { value: bytes.readUIntBE(offset, length), length };
}

function readVint(bytes: Buffer, offset: number): { readonly value: number; readonly length: number; readonly unknown: boolean } | undefined {
  if (offset >= bytes.length) return undefined;
  const first = bytes.readUInt8(offset);
  let length = 1;
  while (length <= 8 && (first & (0x80 >> (length - 1))) === 0) length += 1;
  if (length > 8 || offset + length > bytes.length) return undefined;
  let value = first & (0xff >> length);
  let allOnes = value === (0xff >> length);
  for (let index = 1; index < length; index += 1) {
    const byte = bytes.readUInt8(offset + index);
    value = value * 256 + byte;
    if (byte !== 0xff) allOnes = false;
  }
  return { value, length, unknown: allOnes };
}
