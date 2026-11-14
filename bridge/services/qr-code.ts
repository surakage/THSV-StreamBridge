// A small QR code maker (byte mode, error correction level M, versions 1 to 10), so the Wizard can show the phone
// address as a code to scan instead of typing it. Follows ISO/IEC 18004; no outside packages.

const EC_PER_BLOCK = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26] as const;
const BLOCKS = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5] as const;
const MAXIMUM_VERSION = 10;

/** Square grid of dark (true) and light (false) modules, without the quiet zone. */
export type QrMatrix = readonly (readonly boolean[])[];

export function qrMatrix(text: string): QrMatrix {
  const data = [...Buffer.from(text, 'utf8')];
  let version = 1;
  for (; version <= MAXIMUM_VERSION; version += 1) if (dataCapacity(version) * 8 >= 4 + (version < 10 ? 8 : 16) + data.length * 8) break;
  if (version > MAXIMUM_VERSION) throw new Error('Text is too long for a QR code.');

  // Data bits: byte mode, length, bytes, terminator, padding.
  const bits: number[] = [];
  const push = (value: number, length: number): void => { for (let bit = length - 1; bit >= 0; bit -= 1) bits.push((value >>> bit) & 1); };
  push(0b0100, 4); push(data.length, version < 10 ? 8 : 16);
  for (const byte of data) push(byte, 8);
  const capacityBits = dataCapacity(version) * 8;
  push(0, Math.min(4, capacityBits - bits.length));
  push(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < capacityBits; pad ^= 0xec ^ 0x11) push(pad, 8);
  const codewords: number[] = [];
  for (let index = 0; index < bits.length; index += 8) codewords.push(bits.slice(index, index + 8).reduce((sum, bit) => (sum << 1) | bit, 0));

  const matrix = new QrBuilder(version);
  matrix.placeData(interleave(version, codewords));
  return matrix.finish();
}

/** An SVG drawing of the code with a 4-module quiet zone; dark modules use currentColor on a white square. */
export function qrSvg(text: string): string {
  const matrix = qrMatrix(text);
  const size = matrix.length + 8;
  let path = '';
  matrix.forEach((row, y) => row.forEach((dark, x) => { if (dark) path += `M${String(x + 4)},${String(y + 4)}h1v1h-1z`; }));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${String(size)} ${String(size)}" shape-rendering="crispEdges" role="img"><rect width="${String(size)}" height="${String(size)}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}

function totalCodewords(version: number): number {
  // Raw data modules for the version, in whole codewords.
  let modules = (16 * version + 128) * version + 64;
  if (version >= 2) { const align = Math.floor(version / 7) + 2; modules -= (25 * align - 10) * align - 55; if (version >= 7) modules -= 36; }
  return Math.floor(modules / 8);
}

function dataCapacity(version: number): number { return totalCodewords(version) - (EC_PER_BLOCK[version] ?? 0) * (BLOCKS[version] ?? 1); }

function interleave(version: number, data: readonly number[]): number[] {
  const blockCount = BLOCKS[version] ?? 1; const ecLength = EC_PER_BLOCK[version] ?? 0;
  const total = totalCodewords(version);
  const shortBlocks = blockCount - (total % blockCount);
  const shortLength = Math.floor(total / blockCount);
  const divisor = reedSolomonDivisor(ecLength);
  const blocks: number[][] = [];
  for (let index = 0, offset = 0; index < blockCount; index += 1) {
    const length = shortLength - ecLength + (index < shortBlocks ? 0 : 1);
    const block = data.slice(offset, offset + length); offset += length;
    const ec = reedSolomonRemainder(block, divisor);
    if (index < shortBlocks) block.push(0);
    blocks.push([...block, ...ec]);
  }
  const result: number[] = [];
  for (let column = 0; column < (blocks[0]?.length ?? 0); column += 1) {
    blocks.forEach((block, index) => { if (column !== shortLength - ecLength || index >= shortBlocks) result.push(block[column] ?? 0); });
  }
  return result;
}

function multiply(x: number, y: number): number {
  let product = 0;
  for (let bit = 7; bit >= 0; bit -= 1) { product = (product << 1) ^ ((product >>> 7) * 0x11d); product ^= ((y >>> bit) & 1) * x; }
  return product & 0xff;
}

function reedSolomonDivisor(degree: number): number[] {
  const result = new Array<number>(degree).fill(0); result[degree - 1] = 1;
  let root = 1;
  for (let step = 0; step < degree; step += 1) {
    for (let index = 0; index < degree; index += 1) { result[index] = multiply(result[index] ?? 0, root); if (index + 1 < degree) result[index] = (result[index] ?? 0) ^ (result[index + 1] ?? 0); }
    root = multiply(root, 0x02);
  }
  return result;
}

function reedSolomonRemainder(data: readonly number[], divisor: readonly number[]): number[] {
  const result = new Array<number>(divisor.length).fill(0);
  for (const byte of data) {
    const factor = byte ^ (result.shift() ?? 0); result.push(0);
    divisor.forEach((coefficient, index) => { result[index] = (result[index] ?? 0) ^ multiply(coefficient, factor); });
  }
  return result;
}

class QrBuilder {
  private readonly size: number;
  private readonly modules: boolean[][];
  private readonly reserved: boolean[][];

  public constructor(private readonly version: number) {
    this.size = version * 4 + 17;
    this.modules = Array.from({ length: this.size }, () => new Array<boolean>(this.size).fill(false));
    this.reserved = Array.from({ length: this.size }, () => new Array<boolean>(this.size).fill(false));
    this.drawFunctionPatterns();
  }

  public placeData(codewords: readonly number[]): void {
    let bitIndex = 0;
    for (let right = this.size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vertical = 0; vertical < this.size; vertical += 1) {
        for (let offset = 0; offset < 2; offset += 1) {
          const x = right - offset;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? this.size - 1 - vertical : vertical;
          if (this.reserved[y]?.[x] === true || bitIndex >= codewords.length * 8) continue;
          (this.modules[y] as boolean[])[x] = (((codewords[bitIndex >>> 3] ?? 0) >>> (7 - (bitIndex & 7))) & 1) === 1;
          bitIndex += 1;
        }
      }
    }
  }

  public finish(): QrMatrix {
    let best: boolean[][] = this.modules; let bestPenalty = Infinity;
    for (let mask = 0; mask < 8; mask += 1) {
      const candidate = this.modules.map((row) => [...row]);
      for (let y = 0; y < this.size; y += 1) for (let x = 0; x < this.size; x += 1) if (this.reserved[y]?.[x] !== true && maskBit(mask, x, y)) (candidate[y] as boolean[])[x] = !(candidate[y]?.[x] ?? false);
      this.drawFormatBits(candidate, mask);
      const score = penalty(candidate);
      if (score < bestPenalty) { best = candidate; bestPenalty = score; }
    }
    return best;
  }

  private set(x: number, y: number, dark: boolean): void { (this.modules[y] as boolean[])[x] = dark; (this.reserved[y] as boolean[])[x] = true; }

  private drawFunctionPatterns(): void {
    for (let index = 0; index < this.size; index += 1) { this.set(6, index, index % 2 === 0); this.set(index, 6, index % 2 === 0); }
    for (const [x, y] of [[3, 3], [this.size - 4, 3], [3, this.size - 4]] as const) {
      for (let dy = -4; dy <= 4; dy += 1) for (let dx = -4; dx <= 4; dx += 1) {
        const distance = Math.max(Math.abs(dx), Math.abs(dy));
        if (x + dx >= 0 && x + dx < this.size && y + dy >= 0 && y + dy < this.size) this.set(x + dx, y + dy, distance !== 2 && distance !== 4);
      }
    }
    const positions = alignmentPositions(this.version);
    positions.forEach((x, i) => positions.forEach((y, j) => {
      if ((i === 0 && j === 0) || (i === 0 && j === positions.length - 1) || (i === positions.length - 1 && j === 0)) return;
      for (let dy = -2; dy <= 2; dy += 1) for (let dx = -2; dx <= 2; dx += 1) this.set(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }));
    // Reserve the format areas (written per mask later) and the dark module.
    this.drawFormatBits(this.modules, 0);
    for (let i = 0; i < 9; i += 1) { (this.reserved[8] as boolean[])[i] = true; (this.reserved[i] as boolean[])[8] = true; }
    for (let i = 0; i < 8; i += 1) { (this.reserved[8] as boolean[])[this.size - 1 - i] = true; (this.reserved[this.size - 1 - i] as boolean[])[8] = true; }
    if (this.version >= 7) {
      let remainder = this.version;
      for (let i = 0; i < 12; i += 1) remainder = (remainder << 1) ^ ((remainder >>> 11) * 0x1f25);
      const bits = (this.version << 12) | remainder;
      for (let i = 0; i < 18; i += 1) {
        const dark = ((bits >>> i) & 1) === 1; const a = this.size - 11 + (i % 3); const b = Math.floor(i / 3);
        this.set(a, b, dark); this.set(b, a, dark);
      }
    }
  }

  private drawFormatBits(target: boolean[][], mask: number): void {
    const data = (0b00 << 3) | mask; // Level M.
    let remainder = data;
    for (let i = 0; i < 10; i += 1) remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537);
    const bits = ((data << 10) | remainder) ^ 0x5412;
    const bit = (i: number): boolean => ((bits >>> i) & 1) === 1;
    const put = (x: number, y: number, dark: boolean): void => { (target[y] as boolean[])[x] = dark; };
    for (let i = 0; i <= 5; i += 1) put(8, i, bit(i));
    put(8, 7, bit(6)); put(8, 8, bit(7)); put(7, 8, bit(8));
    for (let i = 9; i < 15; i += 1) put(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i += 1) put(this.size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i += 1) put(8, this.size - 15 + i, bit(i));
    put(8, this.size - 8, true);
  }
}

function alignmentPositions(version: number): number[] {
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2;
  const size = version * 4 + 17;
  const step = Math.ceil((size - 13) / (count * 2 - 2)) * 2;
  const result = [6];
  for (let position = size - 7; result.length < count; position -= step) result.splice(1, 0, position);
  return result;
}

function maskBit(mask: number, x: number, y: number): boolean {
  switch (mask) {
    case 0: return (x + y) % 2 === 0;
    case 1: return y % 2 === 0;
    case 2: return x % 3 === 0;
    case 3: return (x + y) % 3 === 0;
    case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
    case 5: return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6: return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    default: return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
  }
}

function penalty(grid: readonly (readonly boolean[])[]): number {
  const size = grid.length; let score = 0;
  const at = (x: number, y: number): boolean => grid[y]?.[x] ?? false;
  const lines = (horizontal: boolean): boolean[][] => Array.from({ length: size }, (_, a) => Array.from({ length: size }, (_unused, b) => (horizontal ? at(b, a) : at(a, b))));
  for (const line of [...lines(true), ...lines(false)]) {
    let run = 1;
    for (let i = 1; i <= size; i += 1) {
      if (i < size && line[i] === line[i - 1]) run += 1;
      else { if (run >= 5) score += run - 2; run = 1; }
    }
    const text = line.map((dark) => (dark ? '1' : '0')).join('');
    for (const pattern of ['10111010000', '00001011101']) for (let i = text.indexOf(pattern); i !== -1; i = text.indexOf(pattern, i + 1)) score += 40;
  }
  for (let y = 0; y < size - 1; y += 1) for (let x = 0; x < size - 1; x += 1) { const c = at(x, y); if (c === at(x + 1, y) && c === at(x, y + 1) && c === at(x + 1, y + 1)) score += 3; }
  const dark = grid.reduce((sum, row) => sum + row.filter(Boolean).length, 0);
  score += Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
  return score;
}
