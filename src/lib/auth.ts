import { bufToBase64 } from '@psst-secret/crypto';
import { browser } from 'wxt/browser';
import { PsstClient } from './api';
import type { StoredToken } from './settings';

export const CLIENT_NAME = 'psst browser extension';
export const SCOPES = ['whisper:create', 'whisper:read', 'request:manage'];

function base64Url(bytes: Uint8Array): string {
  return bufToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomString(): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(32)));
}

/** PKCE verifier and its S256 challenge (RFC 7636). */
export async function pkcePair(): Promise<{ verifier: string; challenge: string }> {
  const verifier = randomString();
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { verifier, challenge: base64Url(new Uint8Array(digest)) };
}

export function authorizeUrl(
  server: string,
  params: { redirectUri: string; challenge: string; state: string },
): string {
  const query = new URLSearchParams({
    redirect_uri: params.redirectUri,
    code_challenge: params.challenge,
    code_challenge_method: 'S256',
    state: params.state,
    client_name: CLIENT_NAME,
    scope: SCOPES.join(' '),
  });
  return `${server}cli/authorize?${query}`;
}

/** Extract the authorization code from the redirect, checking where it came back and its state. */
export function parseCallback(callbackUrl: string, redirectUri: string, state: string): string {
  const url = new URL(callbackUrl);
  if (`${url.origin}${url.pathname}` !== redirectUri) throw new Error('Sign-in returned to an unexpected address');
  if (url.searchParams.get('state') !== state) throw new Error('Sign-in failed: the state did not match');
  const error = url.searchParams.get('error');
  if (error === 'access_denied') throw new Error('Sign-in was denied');
  if (error) throw new Error(`Sign-in failed: ${error}`);
  const code = url.searchParams.get('code');
  if (!code) throw new Error('Sign-in failed: no code was returned');
  return code;
}

/** The redirect URI the server must allow for this extension. */
export function redirectUri(): string {
  return browser.identity.getRedirectURL('callback');
}

/** Sign in through the server's web login in a browser window and get an API token. */
export async function signIn(server: string): Promise<StoredToken> {
  const redirect = redirectUri();
  const { verifier, challenge } = await pkcePair();
  const state = randomString();
  const callback = await browser.identity.launchWebAuthFlow({
    url: authorizeUrl(server, { redirectUri: redirect, challenge, state }),
    interactive: true,
  });
  if (!callback) throw new Error('Sign-in was cancelled');
  const code = parseCallback(callback, redirect, state);
  const token = await new PsstClient(server).exchangeToken({
    code,
    code_verifier: verifier,
    redirect_uri: redirect,
  });
  return {
    server,
    accessToken: token.access_token,
    expiresAt: token.expires_at,
    scope: token.scope,
  };
}
