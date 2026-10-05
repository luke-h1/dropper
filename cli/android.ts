const RES_STRING_POOL_TYPE = 0x0001;

const RES_TABLE_TYPE = 0x0002;

const RES_XML_TYPE = 0x0003;

const RES_XML_START_ELEMENT_TYPE = 0x0102;

const RES_XML_RESOURCE_MAP_TYPE = 0x0180;

const RES_TABLE_PACKAGE_TYPE = 0x0200;

const RES_TABLE_TYPE_TYPE = 0x0201;

const TYPE_REFERENCE = 0x01;

const TYPE_STRING = 0x03;

const TYPE_INT_DEC = 0x10;

const TYPE_INT_HEX = 0x11;

const TYPE_INT_BOOLEAN = 0x12;

const NO_ENTRY = 0xffffffff;

const ANDROID_ATTRS = new Map([
  [0x01010001, 'label'],
  [0x0101021b, 'versionCode'],
  [0x0101021c, 'versionName'],
]);

export type ResValue = string | number | boolean | { ref: number };

export function isRef(value: ResValue | undefined): value is { ref: number } {
  return typeof value === 'object';
}

function isString(value: ResValue | undefined): value is string {
  return typeof value === 'string';
}

function readStringPool(buf: Buffer, start: number): string[] {
  const headerSize = buf.readUInt16LE(start + 2);
  const count = buf.readUInt32LE(start + 8);
  const utf8 = (buf.readUInt32LE(start + 16) & (1 << 8)) !== 0;
  const stringsStart = start + buf.readUInt32LE(start + 20);
  const strings: string[] = [];

  for (let i = 0; i < count; i++) {
    let p = stringsStart + buf.readUInt32LE(start + headerSize + i * 4);

    if (utf8) {
      p += buf[p]! & 0x80 ? 2 : 1;
      let length = buf[p]!;

      if (length & 0x80) {
        length = ((length & 0x7f) << 8) | buf[p + 1]!;
        p += 2;
      } else {
        p += 1;
      }

      strings.push(buf.toString('utf8', p, p + length));
    } else {
      let length = buf.readUInt16LE(p);

      if (length & 0x8000) {
        length = ((length & 0x7fff) << 16) | buf.readUInt16LE(p + 2);
        p += 4;
      } else {
        p += 2;
      }

      strings.push(buf.toString('utf16le', p, p + length * 2));
    }
  }

  return strings;
}

function typedValue(
  dataType: number,
  data: number,
  strings: string[],
): ResValue | undefined {
  switch (dataType) {
    case TYPE_STRING:
      return strings[data];
    case TYPE_REFERENCE:
      return { ref: data };
    case TYPE_INT_DEC:
    case TYPE_INT_HEX:
      return data | 0;
    case TYPE_INT_BOOLEAN:
      return data !== 0;
    default:
      return undefined;
  }
}

export interface ManifestInfo {
  package?: string;
  versionCode?: ResValue;
  versionName?: ResValue;
  label?: ResValue;
}

export function parseManifest(buf: Buffer): ManifestInfo {
  if (buf.readUInt16LE(0) !== RES_XML_TYPE) {
    throw new Error('Not a binary Android XML file');
  }

  let strings: string[] = [];
  let resourceMap: number[] = [];
  const info: ManifestInfo = {};

  for (let p = buf.readUInt16LE(2); p < buf.length;) {
    const type = buf.readUInt16LE(p);
    const size = buf.readUInt32LE(p + 4);

    if (type === RES_STRING_POOL_TYPE) {
      strings = readStringPool(buf, p);
    } else if (type === RES_XML_RESOURCE_MAP_TYPE) {
      const headerSize = buf.readUInt16LE(p + 2);
      resourceMap = [];

      for (let q = p + headerSize; q < p + size; q += 4) {
        resourceMap.push(buf.readUInt32LE(q));
      }
    } else if (type === RES_XML_START_ELEMENT_TYPE) {
      const ext = p + buf.readUInt16LE(p + 2);
      const element = strings[buf.readUInt32LE(ext + 4)];

      if (element === 'manifest' || element === 'application') {
        const attrStart = ext + buf.readUInt16LE(ext + 8);
        const attrSize = buf.readUInt16LE(ext + 10);
        const attrCount = buf.readUInt16LE(ext + 12);

        for (let i = 0; i < attrCount; i++) {
          const a = attrStart + i * attrSize;
          const nameIndex = buf.readUInt32LE(a + 4);

          // Obfuscated APKs may blank attribute names, so fall back to the resource id.
          const name =
            ANDROID_ATTRS.get(resourceMap[nameIndex] ?? -1) ??
            strings[nameIndex];

          const raw = buf.readUInt32LE(a + 8);

          const value =
            raw !== NO_ENTRY
              ? strings[raw]
              : typedValue(buf[a + 15]!, buf.readUInt32LE(a + 16), strings);

          if (element === 'manifest' && name === 'package' && isString(value)) {
            info.package = value;
          } else if (
            element === 'manifest' &&
            (name === 'versionCode' || name === 'versionName')
          ) {
            info[name] = value;
          } else if (element === 'application' && name === 'label') {
            info.label = value;
          }
        }

        if (element === 'application') {
          break;
        }
      }
    }

    if (size === 0) {
      break;
    }

    p += size;
  }

  return info;
}

interface TypeChunk {
  isDefaultConfig: boolean;
  buf: Buffer;
  start: number;
}

export class ResourceTable {
  private strings: string[] = [];
  private types = new Map<string, TypeChunk[]>();

  constructor(private buf: Buffer) {
    if (buf.readUInt16LE(0) !== RES_TABLE_TYPE) {
      throw new Error('Not a resources.arsc file');
    }

    for (let p = buf.readUInt16LE(2); p < buf.length;) {
      const type = buf.readUInt16LE(p);
      const size = buf.readUInt32LE(p + 4);

      if (type === RES_STRING_POOL_TYPE) {
        this.strings = readStringPool(buf, p);
      } else if (type === RES_TABLE_PACKAGE_TYPE) {
        this.readPackage(p, size);
      }

      if (size === 0) {
        break;
      }

      p += size;
    }
  }

  private readPackage(start: number, size: number) {
    const buf = this.buf;
    const packageId = buf.readUInt32LE(start + 8);

    for (let p = start + buf.readUInt16LE(start + 2); p < start + size;) {
      const type = buf.readUInt16LE(p);
      const chunkSize = buf.readUInt32LE(p + 4);

      if (type === RES_TABLE_TYPE_TYPE) {
        const typeId = buf[p + 8]!;
        const configStart = p + 20;
        const configSize = buf.readUInt32LE(configStart);

        const isDefaultConfig = buf
          .subarray(configStart + 4, configStart + configSize)
          .every(b => b === 0);

        const key = `${packageId}:${typeId}`;
        const list = this.types.get(key) ?? [];

        if (isDefaultConfig) {
          list.unshift({ isDefaultConfig, buf, start: p });
        } else {
          list.push({ isDefaultConfig, buf, start: p });
        }

        this.types.set(key, list);
      }

      if (chunkSize === 0) {
        break;
      }

      p += chunkSize;
    }
  }

  resolve(value: ResValue | undefined, depth = 0): ResValue | undefined {
    if (!isRef(value)) {
      return value;
    }

    if (depth > 8) {
      return undefined;
    }

    const id = value.ref;
    const packageId = id >>> 24;
    const typeId = (id >>> 16) & 0xff;
    const entryId = id & 0xffff;

    for (const chunk of this.types.get(`${packageId}:${typeId}`) ?? []) {
      const resolved = this.readEntry(chunk, entryId);

      if (resolved !== undefined) {
        return this.resolve(resolved, depth + 1);
      }
    }

    return undefined;
  }

  private readEntry(
    { buf, start }: TypeChunk,
    entryId: number,
  ): ResValue | undefined {
    const flags = buf[start + 9]!;
    const entryCount = buf.readUInt32LE(start + 12);
    const entriesStart = start + buf.readUInt32LE(start + 16);
    const offsets = start + buf.readUInt16LE(start + 2);

    let offset: number | undefined;

    if (flags & 0x01) {
      for (let i = 0; i < entryCount; i++) {
        if (buf.readUInt16LE(offsets + i * 4) === entryId) {
          offset = buf.readUInt16LE(offsets + i * 4 + 2) * 4;
          break;
        }
      }
    } else if (entryId < entryCount) {
      if (flags & 0x02) {
        const raw = buf.readUInt16LE(offsets + entryId * 2);
        offset = raw === 0xffff ? undefined : raw * 4;
      } else {
        const raw = buf.readUInt32LE(offsets + entryId * 4);
        offset = raw === NO_ENTRY ? undefined : raw;
      }
    }

    if (offset === undefined) {
      return undefined;
    }

    const entry = entriesStart + offset;
    const entryFlags = buf.readUInt16LE(entry + 2);

    if (entryFlags & 0x0008) {
      return typedValue(
        entryFlags >> 8,
        buf.readUInt32LE(entry + 4),
        this.strings,
      );
    }

    if (entryFlags & 0x0001) {
      return undefined;
    }

    const value = entry + buf.readUInt16LE(entry);

    return typedValue(
      buf[value + 3]!,
      buf.readUInt32LE(value + 4),
      this.strings,
    );
  }
}
