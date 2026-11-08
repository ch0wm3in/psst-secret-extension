import { afterEach, describe, expect, test, vi } from 'vitest';
import { ApiError, PsstClient } from '@/lib/api';

function stubFetch(status: number, body: string) {
  const fetchMock = vi.fn(async () => new Response(status === 204 ? null : body, { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

test('sends JSON with the bearer token and without cookies', async () => {
  const fetchMock = stubFetch(200, '{"id":"x","url":"u"}');
  await new PsstClient('https://psst.example/sub/', 'psst_t').reveal('abc', 'tok');
  const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
  expect(String(url)).toBe('https://psst.example/sub/api/v1/whisper/abc/reveal');
  expect(init).toMatchObject({ method: 'POST', credentials: 'omit', redirect: 'error', body: '{"reveal_token":"tok"}' });
  expect(init.headers).toMatchObject({ Authorization: 'Bearer psst_t', 'Content-Type': 'application/json' });
});

test('omits Authorization without a token', async () => {
  const fetchMock = stubFetch(200, '{}');
  await new PsstClient('https://psst.example/').info();
  const [, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
  expect(init.headers).not.toHaveProperty('Authorization');
});

test('204 responses resolve to undefined', async () => {
  stubFetch(204, '');
  await expect(new PsstClient('https://psst.example/', 'psst_t').revokeToken()).resolves.toBeUndefined();
});

describe('errors', () => {
  test.each([
    [401, '{"detail":"x"}', 'Sign-in required'],
    [403, '{"error":"Access denied from your IP address"}', 'Access denied from your IP address'],
    [400, '{"max_views":["Ensure this value is less than or equal to 100."]}', 'max_views: Ensure'],
    [502, '<html>Bad gateway</html>', 'Server error (502)'],
  ])('%i %s', async (status, body, message) => {
    stubFetch(status, body);
    const error = await new PsstClient('https://psst.example/').info().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(status);
    expect((error as ApiError).message).toContain(message);
  });

  test('network failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    await expect(new PsstClient('https://psst.example/').info()).rejects.toThrow('Could not reach');
  });
});
