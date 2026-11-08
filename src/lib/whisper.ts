import {
  FORMAT_VERSION,
  decryptContent,
  encryptContent,
  generateKey,
  generateRequestKeyPair,
  generateRevealAuthorization,
  isReadableFormat,
  openFromSender,
  revealFragment,
  submitFragment,
  textEnvelope,
  unwrapPrivateKey,
  wrapPrivateKey,
} from '@psst-secret/crypto';
import { ApiError, type ApiInfo, type Expiry, type PsstClient, type RevealResponse } from './api';
import type { ViewLink } from './links';

export class SignInRequiredError extends Error {
  constructor(action: string) {
    super(`This server requires sign-in to ${action}. Sign in from the extension settings.`);
    this.name = 'SignInRequiredError';
  }
}

export interface WhisperOptions {
  expiry: Expiry;
  maxViews: number;
  password?: string;
}

export interface RequestLinks {
  submitLink: string;
  viewLink: string;
  expiresAt: string;
}

/** Reject options the server does not offer before encrypting or sending anything. */
export function checkCreateOptions(info: ApiInfo, options: WhisperOptions, signedIn: boolean): void {
  if (info.api_version !== 1 || !info.format_versions.includes(FORMAT_VERSION)) {
    throw new Error('This server does not support this version of the extension.');
  }
  if (info.auth.login_required && !signedIn) throw new SignInRequiredError('create whispers');
  if (!Number.isInteger(options.maxViews) || options.maxViews < 0) {
    throw new Error('Max views must be 0 (unlimited) or more');
  }
  if (info.limits) {
    if (options.maxViews > info.limits.max_views) {
      throw new Error(`Max views is limited to ${info.limits.max_views} on this server`);
    }
    if (!info.limits.expiry_options.includes(options.expiry)) {
      throw new Error(`Expiry ${options.expiry} is not offered by this server`);
    }
  }
}

function checkBodySize(info: ApiInfo, body: unknown): void {
  const size = new TextEncoder().encode(JSON.stringify(body)).length;
  if (info.limits && size > info.limits.max_upload_bytes) {
    throw new Error('The whisper is larger than this server accepts');
  }
}

/** Encrypt text locally, upload only the ciphertext, and return the share link. */
export async function sendText(
  client: PsstClient,
  info: ApiInfo,
  text: string,
  options: WhisperOptions,
): Promise<string> {
  if (!text.trim()) throw new Error('Enter something to share');
  checkCreateOptions(info, options, client.hasToken);
  const { password } = options;
  const key = password ? '' : await generateKey();
  const encrypted = password
    ? await encryptContent(textEnvelope(text), null, password)
    : await encryptContent(textEnvelope(text), key);
  const authorization = await generateRevealAuthorization();
  const body = {
    v: FORMAT_VERSION,
    ...encrypted,
    reveal_token_hash: authorization.tokenHash,
    max_views: options.maxViews,
    expiry: options.expiry,
  };
  checkBodySize(info, body);
  const created = await client.createWhisper(body);
  return created.url + revealFragment(key, authorization.token);
}

/** Create a receive request; the view link holds the private key seed unless password-protected. */
export async function createRequest(
  client: PsstClient,
  info: ApiInfo,
  options: WhisperOptions,
): Promise<RequestLinks> {
  checkCreateOptions(info, options, client.hasToken);
  const { seedB64, publicKeyB64, fingerprintB64 } = await generateRequestKeyPair();
  const authorization = await generateRevealAuthorization();
  const wrapped = options.password
    ? await wrapPrivateKey(seedB64, options.password)
    : { wrappedKey: '', wrappedKeyIv: '', salt: '' };
  const created = await client.createRequest({
    v: FORMAT_VERSION,
    public_key: publicKeyB64,
    reveal_token_hash: authorization.tokenHash,
    salt: wrapped.salt,
    wrapped_key: wrapped.wrappedKey,
    wrapped_key_iv: wrapped.wrappedKeyIv,
    max_views: options.maxViews,
    expiry: options.expiry,
  });
  return {
    submitLink: created.submit_url + submitFragment(fingerprintB64),
    viewLink: created.view_url + revealFragment(options.password ? '' : seedB64, authorization.token),
    expiresAt: created.expires_at,
  };
}

/** Fetch a whisper's ciphertext. This uses up a view on the server. */
export async function fetchWhisper(client: PsstClient, info: ApiInfo, link: ViewLink): Promise<RevealResponse> {
  if (info.policies?.view_requires_auth && !client.hasToken) throw new SignInRequiredError('reveal whispers');
  try {
    // Receive requests can be checked without using a view; send-mode whispers report "gone".
    const { status } = await client.status(link.viewId);
    if (status === 'pending') throw new Error('Nothing has been submitted to this request yet');
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
  }
  const payload = await client.reveal(link.viewId, link.token);
  if (!isReadableFormat(payload.v)) {
    throw new Error('This whisper uses an unsupported format version');
  }
  return payload;
}

export function needsPassword(payload: RevealResponse): boolean {
  return payload.encapsulated_key ? !!payload.wrapped_key : !!payload.salt;
}

/** Decrypt a fetched whisper. Can be retried with another password without fetching again. */
export async function decryptWhisper(payload: RevealResponse, link: ViewLink, password?: string): Promise<string> {
  const passwordProtected = needsPassword(payload);
  if (passwordProtected && !password) throw new Error('This whisper is password-protected');
  if (!passwordProtected && !link.key) {
    throw new Error('No decryption key found in the link. The link may be incomplete.');
  }
  if (payload.encapsulated_key) {
    const seed = passwordProtected
      ? await unwrapPrivateKey(payload.wrapped_key, payload.wrapped_key_iv, password!, payload.salt)
      : link.key;
    return openFromSender(payload, seed);
  }
  return passwordProtected
    ? decryptContent(payload.ciphertext, payload.iv, null, password, payload.salt)
    : decryptContent(payload.ciphertext, payload.iv, link.key);
}
