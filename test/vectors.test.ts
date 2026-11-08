// Shared psst-secret format vectors, copied from spec/vectors/v1 at psst-secret v1.5.4.
import { readFileSync } from 'node:fs';
import {
  FORMAT_VERSION,
  parseSubmitFragment,
  revealFragment,
  revealTokenHash,
  sealForRecipient,
  submitFragment,
} from '@psst-secret/crypto';
import { describe, expect, test } from 'vitest';
import type { RevealResponse } from '@/lib/api';
import { parseEnvelope } from '@/lib/envelope';
import { parseViewLink } from '@/lib/links';
import { decryptWhisper, needsPassword } from '@/lib/whisper';

const SERVER = 'https://psst.example/';
const VIEW_URL = `${SERVER}whisper/0b7c3c3e-8f4a-4a52-9a43-1f2d3e4f5a6b`;

type Case = Record<string, string>;

function cases(mode: 'send' | 'password' | 'receive'): Case[] {
  const data = JSON.parse(readFileSync(new URL(`./vectors/v1/${mode}.json`, import.meta.url), 'utf8'));
  expect(data.format_version).toBe(FORMAT_VERSION);
  expect(data.mode).toBe(mode);
  return data.cases;
}

function response(c: Case, extra: Partial<RevealResponse> = {}): RevealResponse {
  return {
    v: FORMAT_VERSION,
    ciphertext: c.ciphertext!,
    iv: c.iv!,
    salt: '',
    encapsulated_key: '',
    wrapped_key: '',
    wrapped_key_iv: '',
    view_count: 1,
    max_views: 1,
    remaining_views: 0,
    ...extra,
  };
}

async function checkCommon(c: Case, fragment: string): Promise<ReturnType<typeof parseViewLink>> {
  expect(await revealTokenHash(c.reveal_token!)).toBe(c.reveal_token_hash);
  const link = parseViewLink(`${VIEW_URL}#${fragment}`, SERVER);
  expect(link.version).toBe(FORMAT_VERSION);
  expect(link.token).toBe(c.reveal_token);
  return link;
}

describe('send vectors', () => {
  test.each(cases('send'))('$name', async (c) => {
    const link = await checkCommon(c, c.fragment!);
    expect(link.key).toBe(c.key);
    expect(revealFragment(c.key!, c.reveal_token!)).toBe(`#${c.fragment}`);
    const payload = response(c);
    expect(needsPassword(payload)).toBe(false);
    const plaintext = await decryptWhisper(payload, link);
    expect(plaintext).toBe(c.plaintext);
    expect(parseEnvelope(plaintext).kind).toBe(JSON.parse(c.plaintext!).type);
  });
});

describe('password vectors', () => {
  test.each(cases('password'))('$name', async (c) => {
    const link = await checkCommon(c, c.fragment!);
    expect(link.key).toBe('');
    const payload = response(c, { salt: c.salt! });
    expect(needsPassword(payload)).toBe(true);
    expect(await decryptWhisper(payload, link, c.password)).toBe(c.plaintext);
    await expect(decryptWhisper(payload, link, `${c.password}x`)).rejects.toThrow();
    await expect(decryptWhisper(payload, link)).rejects.toThrow('password-protected');
  });
});

describe('receive vectors', () => {
  test.each(cases('receive'))('$name', async (c) => {
    expect(submitFragment(c.fingerprint!)).toBe(`#${c.submit_fragment}`);
    expect(parseSubmitFragment(c.submit_fragment!).fingerprint).toBe(c.fingerprint);
    const wrongFingerprint = (c.fingerprint!.startsWith('A') ? 'B' : 'A') + c.fingerprint!.slice(1);
    await expect(sealForRecipient('x', c.public_key!, wrongFingerprint)).rejects.toMatchObject({
      code: 'fingerprint_mismatch',
    });

    const link = await checkCommon(c, c.view_fragment!);
    const extra: Partial<RevealResponse> = { encapsulated_key: c.encapsulated_key! };
    if (c.password) {
      expect(link.key).toBe('');
      Object.assign(extra, { salt: c.salt, wrapped_key: c.wrapped_key, wrapped_key_iv: c.wrapped_key_iv });
    } else {
      expect(link.key).toBe(c.seed);
    }
    const payload = response(c, extra);
    expect(needsPassword(payload)).toBe(!!c.password);
    expect(await decryptWhisper(payload, link, c.password)).toBe(c.plaintext);
  });
});
