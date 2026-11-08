import { describe, expect, test } from 'vitest';
import { SCOPES, authorizeUrl, parseCallback, pkcePair } from '@/lib/auth';

const REDIRECT = 'https://abcdefghijklmnop.chromiumapp.org/callback';

test('pkcePair returns an S256 challenge for a valid verifier', async () => {
  const { verifier, challenge } = await pkcePair();
  expect(verifier).toMatch(/^[A-Za-z0-9._~-]{43,128}$/);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  expect(challenge).toBe(Buffer.from(digest).toString('base64url'));
});

test('authorizeUrl', () => {
  const url = new URL(authorizeUrl('https://psst.example/sub/', { redirectUri: REDIRECT, challenge: 'c', state: 's' }));
  expect(url.origin + url.pathname).toBe('https://psst.example/sub/cli/authorize');
  expect(Object.fromEntries(url.searchParams)).toEqual({
    redirect_uri: REDIRECT,
    code_challenge: 'c',
    code_challenge_method: 'S256',
    state: 's',
    client_name: 'psst browser extension',
    scope: SCOPES.join(' '),
  });
});

describe('parseCallback', () => {
  test('returns the code', () => {
    expect(parseCallback(`${REDIRECT}?code=psstc_abc&state=s`, REDIRECT, 's')).toBe('psstc_abc');
  });

  test.each([
    ['wrong state', `${REDIRECT}?code=psstc_abc&state=other`, 'state did not match'],
    ['denied', `${REDIRECT}?error=access_denied&state=s`, 'denied'],
    ['no code', `${REDIRECT}?state=s`, 'no code'],
    ['another address', `https://evil.example/callback?code=psstc_abc&state=s`, 'unexpected address'],
  ])('rejects %s', (_name, url, message) => {
    expect(() => parseCallback(url, REDIRECT, 's')).toThrow(message);
  });
});
