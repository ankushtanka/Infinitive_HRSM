/**
 * File Validation & Magic-Byte Signature Verification Utility
 * Protects against MIME spoofing, extension renaming, and malicious file uploads.
 */

export interface ValidationOptions {
  allowedExtensions?: string[];
  allowedMimeTypes?: string[];
  maxSizeBytes?: number;
}

export interface FileValidationResult {
  valid: boolean;
  error?: string;
  detectedType?: string;
}

/**
 * Checks if a buffer matches known magic-byte signatures
 */
export function validateFileMagicBytes(buffer: Buffer, originalFileName: string): FileValidationResult {
  if (!buffer || buffer.length === 0) {
    return { valid: false, error: 'Empty file payload.' };
  }

  const ext = originalFileName.slice(originalFileName.lastIndexOf('.')).toLowerCase();

  // Reject dangerous executable and script extensions
  const DANGEROUS_EXTENSIONS = [
    '.exe', '.dll', '.so', '.dylib', '.bat', '.cmd', '.sh', '.ps1', '.vbs',
    '.js', '.mjs', '.cjs', '.html', '.htm', '.php', '.py', '.pl', '.asp',
    '.aspx', '.jsp', '.cgi', '.jar', '.war', '.svg', '.xhtml', '.phtml',
  ];

  if (DANGEROUS_EXTENSIONS.includes(ext)) {
    return { valid: false, error: `File type "${ext}" is not permitted for upload.` };
  }

  // Check dangerous magic byte signatures (Executable headers, scripts, etc.)
  if (buffer.length >= 2 && buffer[0] === 0x4d && buffer[1] === 0x5a) {
    return { valid: false, error: 'Executable binary files are strictly prohibited.' };
  }
  if (buffer.length >= 4 && buffer[0] === 0x7f && buffer[1] === 0x45 && buffer[2] === 0x4c && buffer[3] === 0x46) {
    return { valid: false, error: 'Linux ELF binary files are strictly prohibited.' };
  }
  if (buffer.length >= 2 && buffer[0] === 0x23 && buffer[1] === 0x21) {
    return { valid: false, error: 'Script files are strictly prohibited.' };
  }

  // Check valid signatures for allowed extensions
  const isPdf = buffer.length >= 4 && buffer.toString('utf-8', 0, 4) === '%PDF';
  const isJpeg = buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isPng = buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  const isWebp = buffer.length >= 12 && buffer.toString('utf-8', 0, 4) === 'RIFF' && buffer.toString('utf-8', 8, 12) === 'WEBP';
  const isGif = buffer.length >= 6 && (buffer.toString('utf-8', 0, 6) === 'GIF87a' || buffer.toString('utf-8', 0, 6) === 'GIF89a');
  const isZipOffice = buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04;
  const isLegacyOffice = buffer.length >= 8 && buffer[0] === 0xd0 && buffer[1] === 0xcf && buffer[2] === 0x11 && buffer[3] === 0xe0;

  let detected = 'UNKNOWN';
  if (isPdf) detected = 'PDF';
  else if (isJpeg) detected = 'JPEG';
  else if (isPng) detected = 'PNG';
  else if (isWebp) detected = 'WEBP';
  else if (isGif) detected = 'GIF';
  else if (isZipOffice) detected = 'DOCX/XLSX/ZIP';
  else if (isLegacyOffice) detected = 'DOC/XLS';

  // Signature matching against declared extension
  if (['.pdf'].includes(ext) && !isPdf) {
    return { valid: false, error: 'File magic bytes do not match declared PDF format.' };
  }
  if (['.jpg', '.jpeg'].includes(ext) && !isJpeg) {
    return { valid: false, error: 'File magic bytes do not match declared JPEG image format.' };
  }
  if (['.png'].includes(ext) && !isPng) {
    return { valid: false, error: 'File magic bytes do not match declared PNG image format.' };
  }
  if (['.webp'].includes(ext) && !isWebp) {
    return { valid: false, error: 'File magic bytes do not match declared WEBP image format.' };
  }
  if (['.docx', '.xlsx', '.pptx'].includes(ext) && !isZipOffice) {
    return { valid: false, error: 'File magic bytes do not match declared Office document format.' };
  }
  if (['.doc', '.xls', '.ppt'].includes(ext) && !isLegacyOffice && !isZipOffice) {
    return { valid: false, error: 'File magic bytes do not match declared legacy Office format.' };
  }

  return { valid: true, detectedType: detected };
}
