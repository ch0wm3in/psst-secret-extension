import { beforeEach, describe, expect, test } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { normalizeServerUrl, originPattern, tokenFor, tokenItem } from '@/lib/settings';

describe('normalizeServerUrl', () => {
  test.each([
    ['https://psst.example', 'https://psst.example/'],
    ['  https://psst.example/  ', 'https://psst.example/'],
    ['https://psst.example/sub?x=1#y', 'https://psst.example/sub/'],
    ['http://127.0.0.1:18000', 'http://127.0.0.1:18000/'],
    ['http://localhost:8000/', 'http://localhost:8000/'],
  ])('%s', (input, expected) => {
    expect(normalizeServerUrl(input)).toBe(expected);
  });

  test.each(['http://psst.example', 'ftp://psst.example', 'https://user:pw@psst.example', 'psst.example', ''])(
    'rejects %s',
    (input) => {
      expect(() => normalizeServerUrl(input)).toThrow();
    },
  );
});

test('originPattern', () => {
  expect(originPattern('http://127.0.0.1:18000/sub/')).toBe('http://127.0.0.1:18000/*');
});

describe('tokenFor', () => {
  beforeEach(() => fakeBrowser.reset());

  const token = (server: string, expiresIn: number) => ({
    server,
    accessToken: 'psst_x',
    expiresAt: new Date(Date.now() + expiresIn).toISOString(),
    scope: 'whisper:create',
  });

  test('returns the token for its own server only', async () => {
    await tokenItem.setValue(token('https://a.example/', 60_000));
    expect(await tokenFor('https://a.example/')).not.toBeNull();
    expect(await tokenFor('https://b.example/')).toBeNull();
  });

  test('ignores expired tokens', async () => {
    await tokenItem.setValue(token('https://a.example/', -1));
    expect(await tokenFor('https://a.example/')).toBeNull();
  });
});
