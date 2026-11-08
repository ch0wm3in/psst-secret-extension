import { sanitizeFilename } from '@psst-secret/crypto';

export interface RevealedFile {
  filename: string;
  mimetype: string;
  /** Base64 file contents. */
  data: string;
}

export type Revealed =
  | { kind: 'text'; text: string; format?: string }
  | { kind: 'files'; files: RevealedFile[] };

function toFile(entry: unknown): RevealedFile | null {
  if (!entry || typeof entry !== 'object') return null;
  const { filename, mimetype, data } = entry as Record<string, unknown>;
  if (typeof data !== 'string') return null;
  return {
    filename: sanitizeFilename(filename),
    // Saved as a download either way; an unexpected type is not trusted.
    mimetype: typeof mimetype === 'string' && mimetype ? mimetype : 'application/octet-stream',
    data,
  };
}

/** Interpret decrypted plaintext like the web app: text and files envelopes, or raw legacy text. */
export function parseEnvelope(plaintext: string): Revealed {
  let envelope: unknown;
  try {
    envelope = JSON.parse(plaintext);
  } catch {
    return { kind: 'text', text: plaintext };
  }
  if (!envelope || typeof envelope !== 'object') return { kind: 'text', text: plaintext };
  const e = envelope as Record<string, unknown>;
  if (e.type === 'files' && Array.isArray(e.files)) {
    return { kind: 'files', files: e.files.map(toFile).filter((f) => f !== null) };
  }
  if (e.type === 'file') {
    // Legacy single-file envelope.
    const file = toFile(e);
    return { kind: 'files', files: file ? [file] : [] };
  }
  if (e.type === 'text' && typeof e.content === 'string') {
    return {
      kind: 'text',
      text: e.content,
      ...(typeof e.format === 'string' ? { format: e.format } : {}),
    };
  }
  return { kind: 'text', text: plaintext };
}
