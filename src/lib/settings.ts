import { storage } from 'wxt/utils/storage';
import type { Expiry } from './api';

export interface StoredToken {
  /** Normalized server URL the token was issued by; it is never sent anywhere else. */
  server: string;
  accessToken: string;
  expiresAt: string;
  scope: string;
}

export interface Defaults {
  expiry: Expiry;
  maxViews: number;
}

/** Work handed from the context menu to the popup page; kept in memory-only session storage. */
export type Pending = { kind: 'send'; text: string } | { kind: 'reveal'; link: string };

export const serverItem = storage.defineItem<string>('local:server', { fallback: '' });
export const tokenItem = storage.defineItem<StoredToken | null>('local:token', { fallback: null });
export const defaultsItem = storage.defineItem<Defaults>('local:defaults', {
  fallback: { expiry: '1d', maxViews: 1 },
});
export const pendingItem = storage.defineItem<Pending | null>('session:pending', { fallback: null });

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** Validate a server URL and return it with a trailing slash and no query or fragment. */
export function normalizeServerUrl(input: string): string {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error('Enter a full server URL, such as https://psst.example.com');
  }
  const loopback = LOOPBACK_HOSTS.has(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
    throw new Error('The server must use https://');
  }
  if (url.username || url.password) {
    throw new Error('The server URL must not contain a user name or password');
  }
  const path = url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`;
  return url.origin + path;
}

/** Host permission pattern covering the server. */
export function originPattern(server: string): string {
  return `${new URL(server).origin}/*`;
}

/** The saved token, if it belongs to `server` and has not expired. */
export async function tokenFor(server: string): Promise<StoredToken | null> {
  const token = await tokenItem.getValue();
  if (!token || token.server !== server) return null;
  if (Date.parse(token.expiresAt) <= Date.now()) return null;
  return token;
}
