import { isReadableFormat, parseRevealFragment } from '@psst-secret/crypto';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN_RE = /^[0-9a-f]{64}$/;

export interface ViewLink {
  viewId: string;
  version: number;
  /** Decryption key or request key seed; empty for password-protected links. */
  key: string;
  /** Reveal token; empty only for legacy links that predate reveal tokens. */
  token: string;
}

/** Parse a view link for `server`. Links for other servers are rejected, so keys never leave it. */
export function parseViewLink(link: string, server: string): ViewLink {
  let url: URL;
  try {
    url = new URL(link.trim());
  } catch {
    throw new Error('This is not a valid link');
  }
  const base = new URL(server);
  const prefix = `${base.pathname}whisper/`;
  if (url.origin !== base.origin || !url.pathname.startsWith(prefix)) {
    throw new Error(`This is not a view link for ${server}`);
  }
  const viewId = url.pathname.slice(prefix.length);
  if (!UUID_RE.test(viewId)) throw new Error('This is not a valid view link');
  if (!url.hash) throw new Error('The link is incomplete: it has no fragment after #');

  const fragment = parseRevealFragment(url.hash, true);
  if (!isReadableFormat(fragment.version)) {
    throw new Error('This link uses an unsupported format version. Ask for a new link.');
  }
  if (fragment.token && !TOKEN_RE.test(fragment.token)) {
    throw new Error('The reveal authorization is invalid. Use the complete view link.');
  }
  if (fragment.version > 0 && !fragment.token) {
    throw new Error('The reveal authorization is missing. Use the complete view link.');
  }
  return { viewId: viewId.toLowerCase(), ...fragment };
}
