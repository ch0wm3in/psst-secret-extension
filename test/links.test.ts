import { describe, expect, test } from 'vitest';
import { parseEnvelope } from '@/lib/envelope';
import { parseViewLink } from '@/lib/links';

const SERVER = 'https://psst.example/';
const ID = '0b7c3c3e-8f4a-4a52-9a43-1f2d3e4f5a6b';
const TOKEN = 'ea08e29fe009bce1f1f759c1fd37f071802e8fff28d201e9180709e53c8afda8';
const KEY = 'wDBqzMt8+lAOxVIeB5bL6FLBKEl+Tj4KFY01ZOeZVb4=';
const FRAGMENT = `v=1&reveal=${TOKEN}&key=${encodeURIComponent(KEY)}`;

describe('parseViewLink', () => {
  test('parses a v1 link', () => {
    expect(parseViewLink(`${SERVER}whisper/${ID}#${FRAGMENT}`, SERVER)).toEqual({
      viewId: ID,
      version: 1,
      key: KEY,
      token: TOKEN,
    });
  });

  test('supports servers under a path', () => {
    const server = 'https://example.com/psst/';
    expect(parseViewLink(`${server}whisper/${ID}#${FRAGMENT}`, server).viewId).toBe(ID);
  });

  test('accepts legacy links with only a key', () => {
    expect(parseViewLink(`${SERVER}whisper/${ID}#${KEY}`, SERVER)).toMatchObject({ version: 0, key: KEY, token: '' });
  });

  test.each([
    ['another server', `https://evil.example/whisper/${ID}#${FRAGMENT}`, 'not a view link'],
    ['a lookalike host', `https://psst.example.evil.example/whisper/${ID}#${FRAGMENT}`, 'not a view link'],
    ['http instead of https', `http://psst.example/whisper/${ID}#${FRAGMENT}`, 'not a view link'],
    ['a submit link', `${SERVER}submit/${ID}#v=1&fp=abc`, 'not a view link'],
    ['a bad id', `${SERVER}whisper/not-a-uuid#${FRAGMENT}`, 'not a valid view link'],
    ['no fragment', `${SERVER}whisper/${ID}`, 'incomplete'],
    ['an unknown version', `${SERVER}whisper/${ID}#v=2&reveal=${TOKEN}`, 'unsupported format'],
    ['a missing token', `${SERVER}whisper/${ID}#v=1&key=abc`, 'authorization is missing'],
    ['a malformed token', `${SERVER}whisper/${ID}#v=1&reveal=xyz&key=abc`, 'authorization is invalid'],
    ['garbage', 'not a url', 'not a valid link'],
  ])('rejects %s', (_name, link, message) => {
    expect(() => parseViewLink(link, SERVER)).toThrow(message);
  });
});

describe('parseEnvelope', () => {
  test('text', () => {
    expect(parseEnvelope('{"type":"text","content":"hi","format":"markdown"}')).toEqual({
      kind: 'text',
      text: 'hi',
      format: 'markdown',
    });
  });

  test('files, with sanitized names', () => {
    const result = parseEnvelope(
      JSON.stringify({ type: 'files', files: [{ filename: '../../etc/passwd', mimetype: '', data: 'eA==' }] }),
    );
    expect(result.kind).toBe('files');
    if (result.kind !== 'files') return;
    expect(result.files).toHaveLength(1);
    expect(result.files[0]!.filename).not.toContain('/');
    expect(result.files[0]!.mimetype).toBe('application/octet-stream');
  });

  test('legacy single file', () => {
    const result = parseEnvelope(JSON.stringify({ type: 'file', filename: 'a.txt', mimetype: 'text/plain', data: 'eA==' }));
    expect(result).toEqual({ kind: 'files', files: [{ filename: 'a.txt', mimetype: 'text/plain', data: 'eA==' }] });
  });

  test.each(['Legacy plaintext', '{"unexpected": "envelope"}', '42', 'null'])('raw text %s', (plaintext) => {
    expect(parseEnvelope(plaintext)).toEqual({ kind: 'text', text: plaintext });
  });
});
