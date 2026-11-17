import zlib from 'zlib';

export interface ZipEntryInput {
  name: string; // e.g., 'csv/Patients.csv' or 'manifest.json'
  content: string | Buffer;
}

/**
 * Pure Node.js PKZIP archive generator using built-in zlib (deflateRawSync + crc32).
 * Zero external npm dependencies required.
 */
export function createZipArchive(entries: ZipEntryInput[]): Buffer {
  const localFileHeaders: Buffer[] = [];
  const centralDirectoryHeaders: Buffer[] = [];
  let currentOffset = 0;

  const now = new Date();
  const dosTime =
    ((now.getHours() & 0x1f) << 11) |
    ((now.getMinutes() & 0x3f) << 5) |
    ((now.getSeconds() >> 1) & 0x1f);
  const dosDate =
    (((now.getFullYear() - 1980) & 0x7f) << 9) |
    (((now.getMonth() + 1) & 0x0f) << 5) |
    (now.getDate() & 0x1f);

  for (const entry of entries) {
    const fileNameBuffer = Buffer.from(entry.name.replace(/^\/+/, ''), 'utf8');
    const uncompressedData = Buffer.isBuffer(entry.content)
      ? entry.content
      : Buffer.from(entry.content, 'utf8');

    const crc = zlib.crc32(uncompressedData) >>> 0;
    const compressedData = zlib.deflateRawSync(uncompressedData);

    const uncompressedSize = uncompressedData.length;
    const compressedSize = compressedData.length;

    // Local file header (30 bytes + filename length)
    const localHeader = Buffer.alloc(30 + fileNameBuffer.length);
    localHeader.writeUInt32LE(0x04034b50, 0); // Local file header signature
    localHeader.writeUInt16LE(20, 4); // Version needed to extract (2.0)
    localHeader.writeUInt16LE(0x0800, 6); // General purpose bit flag (UTF-8 filename)
    localHeader.writeUInt16LE(8, 8); // Compression method: 8 = Deflate
    localHeader.writeUInt16LE(dosTime, 10); // File last modification time
    localHeader.writeUInt16LE(dosDate, 12); // File last modification date
    localHeader.writeUInt32LE(crc, 14); // CRC-32
    localHeader.writeUInt32LE(compressedSize, 18); // Compressed size
    localHeader.writeUInt32LE(uncompressedSize, 22); // Uncompressed size
    localHeader.writeUInt16LE(fileNameBuffer.length, 26); // File name length
    localHeader.writeUInt16LE(0, 28); // Extra field length
    fileNameBuffer.copy(localHeader, 30);

    localFileHeaders.push(localHeader, compressedData);

    // Central directory file header (46 bytes + filename length)
    const centralHeader = Buffer.alloc(46 + fileNameBuffer.length);
    centralHeader.writeUInt32LE(0x02014b50, 0); // Central directory signature
    centralHeader.writeUInt16LE(20, 4); // Version made by
    centralHeader.writeUInt16LE(20, 6); // Version needed to extract
    centralHeader.writeUInt16LE(0x0800, 8); // General purpose bit flag (UTF-8)
    centralHeader.writeUInt16LE(8, 10); // Compression method (Deflate)
    centralHeader.writeUInt16LE(dosTime, 12); // Last mod time
    centralHeader.writeUInt16LE(dosDate, 14); // Last mod date
    centralHeader.writeUInt32LE(crc, 16); // CRC-32
    centralHeader.writeUInt32LE(compressedSize, 20); // Compressed size
    centralHeader.writeUInt32LE(uncompressedSize, 24); // Uncompressed size
    centralHeader.writeUInt16LE(fileNameBuffer.length, 28); // File name length
    centralHeader.writeUInt16LE(0, 30); // Extra field length
    centralHeader.writeUInt16LE(0, 32); // File comment length
    centralHeader.writeUInt16LE(0, 34); // Disk number start
    centralHeader.writeUInt16LE(0, 36); // Internal file attributes
    centralHeader.writeUInt32LE(0, 38); // External file attributes
    centralHeader.writeUInt32LE(currentOffset, 42); // Relative offset of local header
    fileNameBuffer.copy(centralHeader, 46);

    centralDirectoryHeaders.push(centralHeader);
    currentOffset += localHeader.length + compressedData.length;
  }

  const centralDirectoryBuffer = Buffer.concat(centralDirectoryHeaders);
  const centralDirectorySize = centralDirectoryBuffer.length;
  const centralDirectoryOffset = currentOffset;

  // End of central directory record (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // EOCD signature
  eocd.writeUInt16LE(0, 4); // Number of this disk
  eocd.writeUInt16LE(0, 6); // Disk where central directory starts
  eocd.writeUInt16LE(entries.length, 8); // Number of central directory records on this disk
  eocd.writeUInt16LE(entries.length, 10); // Total number of central directory records
  eocd.writeUInt32LE(centralDirectorySize, 12); // Size of central directory
  eocd.writeUInt32LE(centralDirectoryOffset, 16); // Offset of start of central directory
  eocd.writeUInt16LE(0, 20); // Comment length

  return Buffer.concat([...localFileHeaders, centralDirectoryBuffer, eocd]);
}
