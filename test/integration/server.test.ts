// End-to-end tests against a live server, e.g. the ghcr.io/ch0wm3in/psst-secret image.
import { FORMAT_VERSION, parseSubmitFragment, sealForRecipient, textEnvelope } from '@psst-secret/crypto';
import { describe, expect, test } from 'vitest';
import { ApiError, PsstClient } from '@/lib/api';
import { parseEnvelope } from '@/lib/envelope';
import { parseViewLink } from '@/lib/links';
import { normalizeServerUrl } from '@/lib/settings';
import { createRequest, decryptWhisper, fetchWhisper, sendText } from '@/lib/whisper';

const SERVER = process.env.PSST_TEST_SERVER ? normalizeServerUrl(process.env.PSST_TEST_SERVER) : '';
const SECRET = 'Æble, čaj, 🔐\nsecond line';

// The extension does not submit to requests; this stands in for the other person.
async function submit(submitLink: string, text: string): Promise<void> {
  const url = new URL(submitLink);
  const requestId = url.pathname.split('/').pop()!;
  const { fingerprint } = parseSubmitFragment(url.hash);
  const endpoint = new URL(`api/v1/whisper/submit/${requestId}`, SERVER);
  const { public_key: publicKey } = await (await fetch(endpoint)).json();
  const sealed = await sealForRecipient(textEnvelope(text), publicKey, fingerprint);
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ v: FORMAT_VERSION, ...sealed }),
  });
  expect(response.status).toBe(200);
}

async function reveal(client: PsstClient, link: string, password?: string): Promise<string> {
  const info = await client.info();
  const parsed = parseViewLink(link, SERVER);
  const payload = await fetchWhisper(client, info, parsed);
  const revealed = parseEnvelope(await decryptWhisper(payload, parsed, password));
  if (revealed.kind !== 'text') throw new Error('Expected text');
  return revealed.text;
}

describe.skipIf(!SERVER)('psst-secret server', () => {
  const client = new PsstClient(SERVER);

  test('info', async () => {
    const info = await client.info();
    expect(info.api_version).toBe(1);
    expect(info.format_versions).toContain(FORMAT_VERSION);
    expect(info.auth.extension_redirect).toBe(false);
  });

  test('send and reveal burns the whisper', async () => {
    const link = await sendText(client, await client.info(), SECRET, { expiry: '1h', maxViews: 1 });
    expect(await reveal(client, link)).toBe(SECRET);
    await expect(reveal(client, link)).rejects.toBeInstanceOf(ApiError);
  });

  test('send with a password', async () => {
    const link = await sendText(client, await client.info(), SECRET, {
      expiry: '1h',
      maxViews: 2,
      password: 'hunter2 🔑',
    });
    expect(parseViewLink(link, SERVER).key).toBe('');
    expect(await reveal(client, link, 'hunter2 🔑')).toBe(SECRET);
  });

  test.each([undefined, 'request password'])('receive request (password: %s)', async (password) => {
    const links = await createRequest(client, await client.info(), { expiry: '1h', maxViews: 1, password });
    await expect(reveal(client, links.viewLink, password)).rejects.toThrow('Nothing has been submitted');
    await submit(links.submitLink, SECRET);
    expect(await reveal(client, links.viewLink, password)).toBe(SECRET);
  });
});
