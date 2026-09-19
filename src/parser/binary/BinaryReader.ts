/**
 * High-performance, memory-safe Little-Endian Binary Reader.
 * Includes bounds-checking and string/GUID/compression decoders.
 */

export class BinaryReader {
  private view: DataView;
  private offset = 0;
  private length: number;
  private buffer: ArrayBuffer;
  private bytes: Uint8Array;

  constructor(buffer: ArrayBuffer | Uint8Array, byteOffset = 0, byteLength?: number) {
    if (buffer instanceof Uint8Array) {
      this.buffer = buffer.buffer as ArrayBuffer;
      const start = buffer.byteOffset + byteOffset;
      this.length = byteLength ?? buffer.byteLength - byteOffset;
      this.view = new DataView(this.buffer, start, this.length);
      this.bytes = new Uint8Array(this.buffer, start, this.length);
    } else {
      this.buffer = buffer;
      this.length = byteLength ?? buffer.byteLength - byteOffset;
      this.view = new DataView(this.buffer, byteOffset, this.length);
      this.bytes = new Uint8Array(this.buffer, byteOffset, this.length);
    }
  }

  public get position(): number {
    return this.offset;
  }

  public set position(pos: number) {
    if (pos < 0 || pos > this.length) {
      throw new RangeError(`Invalid reader offset ${pos} (buffer length: ${this.length})`);
    }
    this.offset = pos;
  }

  public get remaining(): number {
    return this.length - this.offset;
  }

  public get remainingBytes(): number {
    return this.length - this.offset;
  }

  public get totalLength(): number {
    return this.length;
  }

  public hasBytes(count: number): boolean {
    return this.offset + count <= this.length;
  }

  public ensureBytes(count: number): void {
    if (this.offset + count > this.length) {
      throw new RangeError(
        `Unexpected EOF: attempted to read ${count} bytes at offset ${this.offset} (total length: ${this.length})`
      );
    }
  }

  public readUint8(): number {
    this.ensureBytes(1);
    const val = this.view.getUint8(this.offset);
    this.offset += 1;
    return val;
  }

  public readInt8(): number {
    this.ensureBytes(1);
    const val = this.view.getInt8(this.offset);
    this.offset += 1;
    return val;
  }

  public readUint16(): number {
    this.ensureBytes(2);
    const val = this.view.getUint16(this.offset, true);
    this.offset += 2;
    return val;
  }

  public readInt16(): number {
    this.ensureBytes(2);
    const val = this.view.getInt16(this.offset, true);
    this.offset += 2;
    return val;
  }

  public readUint32(): number {
    this.ensureBytes(4);
    const val = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return val;
  }

  public readInt32(): number {
    this.ensureBytes(4);
    const val = this.view.getInt32(this.offset, true);
    this.offset += 4;
    return val;
  }

  public readFloat32(): number {
    this.ensureBytes(4);
    const val = this.view.getFloat32(this.offset, true);
    this.offset += 4;
    return val;
  }

  public readFloat64(): number {
    this.ensureBytes(8);
    const val = this.view.getFloat64(this.offset, true);
    this.offset += 8;
    return val;
  }

  public readUint64(): bigint {
    this.ensureBytes(8);
    const val = this.view.getBigUint64(this.offset, true);
    this.offset += 8;
    return val;
  }

  public readBytes(count: number): Uint8Array {
    this.ensureBytes(count);
    const slice = this.bytes.subarray(this.offset, this.offset + count);
    this.offset += count;
    return slice;
  }

  public peekBytes(count: number): Uint8Array {
    this.ensureBytes(count);
    return this.bytes.subarray(this.offset, this.offset + count);
  }

  public readGuid(): string {
    this.ensureBytes(16);
    const data1 = this.readUint32().toString(16).padStart(8, "0");
    const data2 = this.readUint16().toString(16).padStart(4, "0");
    const data3 = this.readUint16().toString(16).padStart(4, "0");
    const data4_1 = Array.from(this.readBytes(2))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const data4_2 = Array.from(this.readBytes(6))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    return `{${data1}-${data2}-${data3}-${data4_1}-${data4_2}}`.toUpperCase();
  }

  public readUtf16String(byteLength: number): string {
    this.ensureBytes(byteLength);
    const slice = this.bytes.subarray(this.offset, this.offset + byteLength);
    let effectiveLen = byteLength;
    for (let i = 0; i < byteLength - 1; i += 2) {
      if (slice[i] === 0 && slice[i + 1] === 0) {
        effectiveLen = i;
        break;
      }
    }
    const decoder = new TextDecoder("utf-16le");
    const str = decoder.decode(slice.subarray(0, effectiveLen));
    this.offset += byteLength;
    return str;
  }

  public readAsciiString(length: number): string {
    this.ensureBytes(length);
    const slice = this.bytes.subarray(this.offset, this.offset + length);
    let effectiveLen = length;
    for (let i = 0; i < length; i++) {
      if (slice[i] === 0) {
        effectiveLen = i;
        break;
      }
    }
    const decoder = new TextDecoder("windows-1252");
    const str = decoder.decode(slice.subarray(0, effectiveLen));
    this.offset += length;
    return str;
  }

  public slice(byteOffset: number, byteLength?: number): BinaryReader {
    return new BinaryReader(this.bytes, byteOffset, byteLength);
  }
}
