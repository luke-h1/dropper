import { closeSync, fstatSync, openSync, readSync } from "node:fs";
import { inflateRawSync } from "node:zlib";

export interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  size: number;
  offset: number;
}

const MAX_UINT32 = 0xffffffff;

/** Reads entries out of a zip (IPA/APK) without loading the whole file into memory. */
export class ZipReader {
  private fd: number;
  readonly fileSize: number;
  readonly entries: ZipEntry[];

  constructor(path: string) {
    this.fd = openSync(path, "r");
    this.fileSize = fstatSync(this.fd).size;
    try {
      this.entries = this.readCentralDirectory();
    } catch (error) {
      this.close();
      throw error;
    }
  }

  close() {
    closeSync(this.fd);
  }

  find(pattern: RegExp): ZipEntry | undefined {
    return this.entries.find((entry) => pattern.test(entry.name));
  }

  read(entry: ZipEntry): Buffer {
    const header = this.readAt(entry.offset, 30);
    if (header.readUInt32LE(0) !== 0x04034b50)
      throw new Error(`Bad local header for ${entry.name}`);
    const start = entry.offset + 30 + header.readUInt16LE(26) + header.readUInt16LE(28);
    const data = this.readAt(start, entry.compressedSize);
    if (entry.method === 0) return data;
    if (entry.method === 8) return inflateRawSync(data);
    throw new Error(`Unsupported compression method ${entry.method} for ${entry.name}`);
  }

  private readAt(position: number, length: number): Buffer {
    const buffer = Buffer.alloc(length);
    let read = 0;
    while (read < length) {
      const n = readSync(this.fd, buffer, read, length - read, position + read);
      if (n === 0) throw new Error("Unexpected end of zip file");
      read += n;
    }
    return buffer;
  }

  private readCentralDirectory(): ZipEntry[] {
    const tailLength = Math.min(this.fileSize, 22 + 0xffff);
    const tailStart = this.fileSize - tailLength;
    const tail = this.readAt(tailStart, tailLength);
    let eocd = -1;
    for (let i = tail.length - 22; i >= 0; i--) {
      if (tail.readUInt32LE(i) === 0x06054b50) {
        eocd = i;
        break;
      }
    }
    if (eocd === -1) throw new Error("Not a zip file");

    let count = tail.readUInt16LE(eocd + 10);
    let cdSize = tail.readUInt32LE(eocd + 12);
    let cdOffset = tail.readUInt32LE(eocd + 16);
    if (cdOffset === MAX_UINT32 || cdSize === MAX_UINT32 || count === 0xffff) {
      const locator = eocd - 20;
      if (locator < 0 || tail.readUInt32LE(locator) !== 0x07064b50) {
        throw new Error("Missing zip64 locator");
      }
      const zip64 = this.readAt(Number(tail.readBigUInt64LE(locator + 8)), 56);
      count = Number(zip64.readBigUInt64LE(32));
      cdSize = Number(zip64.readBigUInt64LE(40));
      cdOffset = Number(zip64.readBigUInt64LE(48));
    }

    const cd = this.readAt(cdOffset, cdSize);
    const entries: ZipEntry[] = [];
    let p = 0;
    for (let i = 0; i < count; i++) {
      if (cd.readUInt32LE(p) !== 0x02014b50) throw new Error("Bad central directory");
      const nameLength = cd.readUInt16LE(p + 28);
      const extraLength = cd.readUInt16LE(p + 30);
      const commentLength = cd.readUInt16LE(p + 32);
      const entry: ZipEntry = {
        name: cd.toString("utf8", p + 46, p + 46 + nameLength),
        method: cd.readUInt16LE(p + 10),
        compressedSize: cd.readUInt32LE(p + 20),
        size: cd.readUInt32LE(p + 24),
        offset: cd.readUInt32LE(p + 42),
      };
      applyZip64Extra(entry, cd.subarray(p + 46 + nameLength, p + 46 + nameLength + extraLength));
      entries.push(entry);
      p += 46 + nameLength + extraLength + commentLength;
    }
    return entries;
  }
}

function applyZip64Extra(entry: ZipEntry, extra: Buffer) {
  for (let p = 0; p + 4 <= extra.length;) {
    const id = extra.readUInt16LE(p);
    const length = extra.readUInt16LE(p + 2);
    if (id === 0x0001) {
      let q = p + 4;
      const next = () => {
        const value = Number(extra.readBigUInt64LE(q));
        q += 8;
        return value;
      };
      if (entry.size === MAX_UINT32) entry.size = next();
      if (entry.compressedSize === MAX_UINT32) entry.compressedSize = next();
      if (entry.offset === MAX_UINT32) entry.offset = next();
      return;
    }
    p += 4 + length;
  }
}
