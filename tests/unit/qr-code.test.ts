import { describe, expect, it } from 'vitest';
import { qrMatrix, qrSvg } from '../../bridge/services/qr-code.js';

// Checked against OpenCV's QR decoder when this was written: it reads back http://192.168.68.71:8788/.
const PHONE_ADDRESS_CODE: readonly string[] = ["1111111000111100001111111", "1000001000101111001000001", "1011101011011001001011101", "1011101010101100101011101", "1011101011000010001011101", "1000001010100111001000001", "1111111010101010101111111", "0000000011011010100000000", "1011111001000101101111100", "1110010001111010010000010", "0010001000101001001101011", "0011100100011010100010001", "0001001000111100001110111", "1111010001101110000001010", "1000011000100101010101011", "1011100010010001000001001", "1010101010011100111110100", "0000000011111110100011100", "1111111001001000101011111", "1000001010001001100011000", "1011101011110101111111100", "1011101010111011101110111", "1011101010101110010000101", "1000001000001010101111001", "1111111010110101011111111"];

const rows = (text: string): string[] => qrMatrix(text).map((row) => row.map((dark) => (dark ? '1' : '0')).join(''));

describe('QR code', () => {
  it('makes the same, decodable code for a phone address', () => {
    expect(rows('http://192.168.68.71:8788/')).toEqual(PHONE_ADDRESS_CODE);
  });

  it('grows with the text, keeps the three finder squares, and refuses text that is too long', () => {
    for (const [text, size] of [['A', 21], ['http://192.168.68.71:8788/', 25], ['x'.repeat(150), 49], ['x'.repeat(213), 57]] as const) {
      const grid = rows(text);
      expect(grid).toHaveLength(size);
      for (const [x, y] of [[0, 0], [size - 7, 0], [0, size - 7]] as const) {
        expect(grid[y]?.slice(x, x + 7)).toBe('1111111');
        expect(grid[y + 2]?.slice(x, x + 7)).toBe('1011101');
      }
    }
    expect(() => qrMatrix('x'.repeat(214))).toThrow('too long');
  });

  it('draws an SVG with a quiet zone', () => {
    const svg = qrSvg('http://192.168.68.71:8788/');
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 33 33"')).toBe(true);
    expect(svg).toContain('M4,4h1v1h-1z');
  });
});
