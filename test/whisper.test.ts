import { describe, expect, test, vi } from 'vitest';
import { type ApiInfo, ApiError, PsstClient, type RevealResponse } from '@/lib/api';
import { parseViewLink } from '@/lib/links';
import {
  SignInRequiredError,
  type WhisperOptions,
  checkCreateOptions,
  decryptWhisper,
  fetchWhisper,
  sendText,
} from '@/lib/whisper';

const SERVER = 'https://psst.example/';
const ID = '0b7c3c3e-8f4a-4a52-9a43-1f2d3e4f5a6b';

const INFO: ApiInfo = {
  server_version: 'v1.5.3',
  api_version: 1,
  format_versions: [1],
  auth: { login_required: false, loopback_pkce: true, manual_code: false, extension_redirect: true, scopes: [] },
  features: {
    email_notifications: false,
    receive_access: { enabled: false, default: false, required: false },
    receive_history: false,
    rich_text: true,
  },
  policies: { view_requires_auth: false, submit_requires_auth: false },
  limits: { max_upload_bytes: 10_000, max_views: 10, expiry_options: ['1h', '1d'] },
};

describe('checkCreateOptions', () => {
  const ok: WhisperOptions = { expiry: '1d', maxViews: 1 };

  test('accepts offered options', () => {
    expect(() => checkCreateOptions(INFO, ok, false)).not.toThrow();
    expect(() => checkCreateOptions(INFO, { ...ok, maxViews: 0 }, false)).not.toThrow();
  });

  test.each<[string, ApiInfo, WhisperOptions, string]>([
    ['too many views', INFO, { ...ok, maxViews: 11 }, 'limited to 10'],
    ['expiry not offered', INFO, { ...ok, expiry: '1w' }, 'not offered'],
    ['negative views', INFO, { ...ok, maxViews: -1 }, 'Max views'],
    ['unsupported format', { ...INFO, format_versions: [2] }, ok, 'does not support'],
  ])('rejects %s', (_name, info, options, message) => {
    expect(() => checkCreateOptions(info, options, false)).toThrow(message);
  });

  test('requires sign-in when the server does', () => {
    const info = { ...INFO, auth: { ...INFO.auth, login_required: true } };
    expect(() => checkCreateOptions(info, ok, false)).toThrow(SignInRequiredError);
    expect(() => checkCreateOptions(info, ok, true)).not.toThrow();
  });
});

describe('sendText', () => {
  function fakeClient() {
    const client = new PsstClient(SERVER);
    const create = vi
      .spyOn(client, 'createWhisper')
      .mockResolvedValue({ id: ID, url: `${SERVER}whisper/${ID}` });
    return { client, create };
  }

  test('uploads only ciphertext and puts the key in the fragment', async () => {
    const { client, create } = fakeClient();
    const link = await sendText(client, INFO, 'top secret', { expiry: '1h', maxViews: 2 });
    const body = create.mock.calls[0]![0];
    expect(body).toMatchObject({ v: 1, salt: '', expiry: '1h', max_views: 2 });
    expect(JSON.stringify(body)).not.toContain('top secret');

    const parsed = parseViewLink(link, SERVER);
    expect(JSON.stringify(body)).not.toContain(parsed.key);
    expect(JSON.stringify(body)).not.toContain(parsed.token);
    const payload = { ...body, encapsulated_key: '', wrapped_key: '', wrapped_key_iv: '' } as unknown as RevealResponse;
    expect(JSON.parse(await decryptWhisper(payload, parsed))).toEqual({ type: 'text', content: 'top secret' });
  });

  test('password-protected links carry no key', async () => {
    const { client, create } = fakeClient();
    const link = await sendText(client, INFO, 'top secret', { expiry: '1d', maxViews: 1, password: 'pw 🔑' });
    const parsed = parseViewLink(link, SERVER);
    expect(parsed.key).toBe('');
    const body = create.mock.calls[0]![0];
    expect(body.salt).not.toBe('');
    const payload = { ...body, encapsulated_key: '', wrapped_key: '', wrapped_key_iv: '' } as unknown as RevealResponse;
    expect(JSON.parse(await decryptWhisper(payload, parsed, 'pw 🔑')).content).toBe('top secret');
  });

  test('rejects empty text and oversized whispers before uploading', async () => {
    const { client, create } = fakeClient();
    await expect(sendText(client, INFO, '   ', { expiry: '1d', maxViews: 1 })).rejects.toThrow('Enter something');
    await expect(sendText(client, INFO, 'x'.repeat(20_000), { expiry: '1d', maxViews: 1 })).rejects.toThrow('larger');
    expect(create).not.toHaveBeenCalled();
  });
});

describe('fetchWhisper', () => {
  const link = { viewId: ID, version: 1, key: 'k', token: 'a'.repeat(64) };

  test('does not use a view while a request is pending', async () => {
    const client = new PsstClient(SERVER);
    vi.spyOn(client, 'status').mockResolvedValue({ status: 'pending' });
    const reveal = vi.spyOn(client, 'reveal');
    await expect(fetchWhisper(client, INFO, link)).rejects.toThrow('Nothing has been submitted');
    expect(reveal).not.toHaveBeenCalled();
  });

  test('reveals send-mode whispers, whose status is gone', async () => {
    const client = new PsstClient(SERVER);
    vi.spyOn(client, 'status').mockRejectedValue(new ApiError(404, 'gone'));
    vi.spyOn(client, 'reveal').mockResolvedValue({ v: 1 } as RevealResponse);
    await expect(fetchWhisper(client, INFO, link)).resolves.toMatchObject({ v: 1 });
  });

  test('rejects unsupported versions', async () => {
    const client = new PsstClient(SERVER);
    vi.spyOn(client, 'status').mockRejectedValue(new ApiError(404, 'gone'));
    vi.spyOn(client, 'reveal').mockResolvedValue({ v: 2 } as RevealResponse);
    await expect(fetchWhisper(client, INFO, link)).rejects.toThrow('unsupported format');
  });

  test('requires sign-in before using a view when the server does', async () => {
    const client = new PsstClient(SERVER);
    const reveal = vi.spyOn(client, 'reveal');
    const info = { ...INFO, policies: { view_requires_auth: true, submit_requires_auth: false } };
    await expect(fetchWhisper(client, info, link)).rejects.toThrow(SignInRequiredError);
    expect(reveal).not.toHaveBeenCalled();
  });
});
