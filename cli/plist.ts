export type PlistValue =
  | string
  | number
  | boolean
  | Date
  | Buffer
  | null
  | PlistValue[]
  | { [key: string]: PlistValue };

export function parsePlist(buffer: Buffer): PlistValue {
  if (buffer.toString('ascii', 0, 8) === 'bplist00') {
    return parseBinaryPlist(buffer);
  }

  return parseXmlPlist(buffer.toString('utf8'));
}

// Format reference: https://opensource.apple.com/source/CF/CF-550/CFBinaryPList.c
export function parseBinaryPlist(buffer: Buffer): PlistValue {
  const trailer = buffer.subarray(buffer.length - 32);
  const offsetSize = trailer.readUInt8(6);
  const refSize = trailer.readUInt8(7);
  const objectCount = Number(trailer.readBigUInt64BE(8));
  const topObject = Number(trailer.readBigUInt64BE(16));
  const offsetTable = Number(trailer.readBigUInt64BE(24));

  const readUInt = (position: number, size: number) => {
    let value = 0;

    for (let i = 0; i < size; i++) {
      value = value * 256 + buffer[position + i]!;
    }

    return value;
  };

  const offsetOf = (ref: number) => {
    if (ref >= objectCount) {
      throw new Error('Invalid binary plist reference');
    }

    return readUInt(offsetTable + ref * offsetSize, offsetSize);
  };

  const parse = (ref: number, depth: number): PlistValue => {
    if (depth > 64) {
      throw new Error('Binary plist nested too deeply');
    }

    const offset = offsetOf(ref);
    const marker = buffer[offset]!;
    const type = marker >> 4;
    const info = marker & 0x0f;

    const lengthAndStart = (): [number, number] => {
      if (info !== 0x0f) {
        return [info, offset + 1];
      }

      const intSize = 1 << (buffer[offset + 1]! & 0x0f);

      return [readUInt(offset + 2, intSize), offset + 2 + intSize];
    };

    switch (type) {
      case 0x0:
        if (info === 0x8) {
          return false;
        }

        if (info === 0x9) {
          return true;
        }

        return null;
      case 0x1: {
        const size = 1 << info;

        if (size === 8) {
          return Number(buffer.readBigInt64BE(offset + 1));
        }

        return readUInt(offset + 1, size);
      }

      case 0x2:
        return info === 2
          ? buffer.readFloatBE(offset + 1)
          : buffer.readDoubleBE(offset + 1);
      case 0x3:
        return new Date(
          Date.UTC(2001, 0, 1) + buffer.readDoubleBE(offset + 1) * 1000,
        );
      case 0x4: {
        const [length, start] = lengthAndStart();

        return Buffer.from(buffer.subarray(start, start + length));
      }

      case 0x5: {
        const [length, start] = lengthAndStart();

        return buffer.toString('latin1', start, start + length);
      }

      case 0x6: {
        const [length, start] = lengthAndStart();
        const utf16 = Buffer.from(buffer.subarray(start, start + length * 2));

        return utf16.swap16().toString('utf16le');
      }

      case 0x8:
        return readUInt(offset + 1, info + 1);
      case 0xa: {
        const [length, start] = lengthAndStart();

        return Array.from({ length }, (_, i) =>
          parse(readUInt(start + i * refSize, refSize), depth + 1),
        );
      }

      case 0xd: {
        const [length, start] = lengthAndStart();
        const result: Record<string, PlistValue> = {};

        for (let i = 0; i < length; i++) {
          const key = parse(readUInt(start + i * refSize, refSize), depth + 1);

          const value = parse(
            readUInt(start + (length + i) * refSize, refSize),
            depth + 1,
          );

          result[String(key)] = value;
        }

        return result;
      }

      default:
        throw new Error(`Unsupported binary plist type 0x${type.toString(16)}`);
    }
  };

  return parse(topObject, 0);
}

const ENTITIES = new Map([
  ['lt', '<'],
  ['gt', '>'],
  ['amp', '&'],
  ['quot', '"'],
  ['apos', "'"],
]);

function decodeEntities(value: string) {
  return value.replace(
    /&(#x[0-9a-f]+|#\d+|\w+);/gi,
    (match, entity: string) => {
      if (entity[0] === '#') {
        const code =
          entity[1] === 'x'
            ? parseInt(entity.slice(2), 16)
            : parseInt(entity.slice(1), 10);

        return String.fromCodePoint(code);
      }

      return ENTITIES.get(entity) ?? match;
    },
  );
}

export function parseXmlPlist(xml: string): PlistValue {
  // Skip <?xml ...?> and <!DOCTYPE ...>
  const start = xml.indexOf('<plist');

  if (start === -1) {
    throw new Error('Not a plist');
  }

  const tokens = [
    ...xml.slice(start).matchAll(/<(\/?)([a-zA-Z]+)[^>]*?(\/?)>|([^<]+)/g),
  ].filter(m => m[2] || m[4]!.trim() !== '');

  let i = 0;

  const textUntilClose = (tag: string) => {
    let text = '';

    while (
      i < tokens.length &&
      !(tokens[i]![1] === '/' && tokens[i]![2] === tag)
    ) {
      text += tokens[i]![4] ?? '';
      i++;
    }

    i++;

    return decodeEntities(text.trim());
  };

  const parseValue = (): PlistValue => {
    const token = tokens[i++];

    if (!token || !token[2]) {
      throw new Error('Malformed XML plist');
    }

    const tag = token[2];
    const selfClosing = token[3] === '/';

    switch (tag) {
      case 'plist':
        return parseValue();
      case 'dict': {
        const result: Record<string, PlistValue> = {};

        if (selfClosing) {
          return result;
        }

        while (!(tokens[i]?.[1] === '/' && tokens[i]?.[2] === 'dict')) {
          if (tokens[i++]?.[2] !== 'key') {
            throw new Error('Expected <key> in XML plist');
          }

          const key = textUntilClose('key');
          result[key] = parseValue();
        }

        i++;

        return result;
      }

      case 'array': {
        const result: PlistValue[] = [];

        if (selfClosing) {
          return result;
        }

        while (!(tokens[i]?.[1] === '/' && tokens[i]?.[2] === 'array')) {
          result.push(parseValue());
        }

        i++;

        return result;
      }

      case 'true':
        return true;
      case 'false':
        return false;
      case 'string':
        return selfClosing ? '' : textUntilClose('string');
      case 'integer':
      case 'real':
        return Number(textUntilClose(tag));
      case 'date':
        return new Date(textUntilClose('date'));
      case 'data':
        return Buffer.from(
          textUntilClose('data').replace(/\s+/g, ''),
          'base64',
        );
      default:
        throw new Error(`Unsupported XML plist tag <${tag}>`);
    }
  };

  return parseValue();
}
