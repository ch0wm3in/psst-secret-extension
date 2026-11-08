import { browser } from 'wxt/browser';
import type { Expiry, RevealResponse } from '@/lib/api';
import { type Connection, connect } from '@/lib/connection';
import { type RevealedFile, parseEnvelope } from '@/lib/envelope';
import { type ViewLink, parseViewLink } from '@/lib/links';
import { defaultsItem, pendingItem } from '@/lib/settings';
import { $, copyFrom, errorText, fillDefaults, handleForm } from '@/lib/ui';
import { createRequest, decryptWhisper, fetchWhisper, needsPassword, sendText } from '@/lib/whisper';

type Tab = 'send' | 'request' | 'reveal';

let connection: Connection | null = null;

async function requireConnection(): Promise<Connection> {
  connection ??= await connect();
  return connection;
}

function selectTab(tab: Tab): void {
  document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((button) => {
    button.setAttribute('aria-selected', String(button.dataset.tab === tab));
  });
  document.querySelectorAll<HTMLElement>('[data-panel]').forEach((panel) => {
    panel.hidden = panel.dataset.panel !== tab;
  });
}

function options(prefix: 'send' | 'request') {
  return {
    expiry: $<HTMLSelectElement>(`${prefix}-expiry`).value as Expiry,
    maxViews: Number($<HTMLSelectElement>(`${prefix}-views`).value),
    password: $<HTMLInputElement>(`${prefix}-password`).value || undefined,
  };
}

// ---- Send ----

handleForm($<HTMLFormElement>('send-form'), async () => {
  const { client, info } = await requireConnection();
  const opts = options('send');
  const link = await sendText(client, info, $<HTMLTextAreaElement>('send-text').value, opts);
  $<HTMLTextAreaElement>('send-text').value = '';
  $<HTMLInputElement>('send-password').value = '';
  $<HTMLInputElement>('send-link').value = link;
  $('send-password-note').hidden = !opts.password;
  $('send-form').hidden = true;
  $('send-result').hidden = false;
});

// ---- Request ----

handleForm($<HTMLFormElement>('request-form'), async () => {
  const { client, info } = await requireConnection();
  const links = await createRequest(client, info, options('request'));
  $<HTMLInputElement>('request-password').value = '';
  $<HTMLInputElement>('request-submit-link').value = links.submitLink;
  $<HTMLInputElement>('request-view-link').value = links.viewLink;
  $('request-expires').textContent = `Expires ${new Date(links.expiresAt).toLocaleString()}`;
  $('request-form').hidden = true;
  $('request-result').hidden = false;
});

// ---- Reveal ----

let revealed: { payload: RevealResponse; link: ViewLink } | null = null;

function download(file: RevealedFile): void {
  const bytes = Uint8Array.from(atob(file.data), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: file.mimetype }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = file.filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function showRevealed(plaintext: string, payload: RevealResponse): void {
  const content = parseEnvelope(plaintext);
  if (content.kind === 'text') {
    $<HTMLTextAreaElement>('reveal-text').value = content.text;
    $('reveal-text-block').hidden = false;
  } else {
    $('reveal-files').replaceChildren(
      ...content.files.map((file) => {
        const item = document.createElement('li');
        const name = document.createElement('span');
        name.textContent = file.filename;
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = 'Download';
        button.addEventListener('click', () => download(file));
        item.append(name, button);
        return item;
      }),
    );
    $('reveal-files').hidden = false;
  }
  $('reveal-views').textContent =
    payload.max_views === 0
      ? 'This whisper can be viewed any number of times until it expires.'
      : payload.remaining_views === 0
        ? 'This whisper has now been destroyed on the server.'
        : `${payload.remaining_views} view(s) left.`;
  $('reveal-password-form').hidden = true;
  $('reveal-result').hidden = false;
  revealed = null;
}

handleForm($<HTMLFormElement>('reveal-form'), async () => {
  const { server, client, info } = await requireConnection();
  const link = parseViewLink($<HTMLInputElement>('reveal-link').value, server);
  const payload = await fetchWhisper(client, info, link);
  $<HTMLInputElement>('reveal-link').value = '';
  $('reveal-form').hidden = true;
  if (needsPassword(payload)) {
    revealed = { payload, link };
    $('reveal-password-form').hidden = false;
    $('reveal-password').focus();
    return;
  }
  showRevealed(await decryptWhisper(payload, link), payload);
});

handleForm($<HTMLFormElement>('reveal-password-form'), async () => {
  if (!revealed) return;
  const password = $<HTMLInputElement>('reveal-password');
  let plaintext: string;
  try {
    plaintext = await decryptWhisper(revealed.payload, revealed.link, password.value);
  } catch {
    password.select();
    throw new Error('Wrong password. Please try again.');
  }
  password.value = '';
  showRevealed(plaintext, revealed.payload);
});

// ---- Shared controls ----

document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((button) => {
  button.addEventListener('click', () => selectTab(button.dataset.tab as Tab));
});

document.querySelectorAll<HTMLButtonElement>('[data-copy]').forEach((button) => {
  button.addEventListener('click', () => copyFrom(button.dataset.copy!, button));
});

document.querySelectorAll<HTMLButtonElement>('[data-reset]').forEach((button) => {
  button.addEventListener('click', () => {
    const tab = button.dataset.reset as Tab;
    const panel = $(`tab-${tab}`);
    panel.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea').forEach((f) => (f.value = ''));
    panel.querySelectorAll<HTMLElement>('.panel').forEach((p) => (p.hidden = true));
    $(`${tab}-form`).hidden = false;
    $('reveal-text-block').hidden = true;
    $('reveal-files').hidden = true;
    revealed = null;
  });
});

$('open-settings').addEventListener('click', () => browser.runtime.openOptionsPage());

async function init(): Promise<void> {
  const pending = await pendingItem.getValue();
  if (pending) await pendingItem.removeValue();
  selectTab(pending?.kind ?? 'send');
  if (pending?.kind === 'send') $<HTMLTextAreaElement>('send-text').value = pending.text;
  if (pending?.kind === 'reveal') $<HTMLInputElement>('reveal-link').value = pending.link;

  const defaults = await defaultsItem.getValue();
  try {
    connection = await connect();
    $('account').textContent = connection.client.hasToken
      ? `Signed in to ${new URL(connection.server).host}`
      : new URL(connection.server).host;
    fillDefaults(connection.info, defaults);
  } catch (error) {
    fillDefaults(null, defaults);
    $('setup').textContent = errorText(error);
    $('setup').hidden = false;
  }
}

void init();
