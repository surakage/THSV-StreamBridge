declare module 'snappyjs' {
  export function uncompress(input: Uint8Array, maximumLength: number): Uint8Array | ArrayBuffer;
}
