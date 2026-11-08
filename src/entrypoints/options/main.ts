import { browser } from 'wxt/browser';
import { type ApiInfo, type Expiry, PsstClient } from '@/lib/api';
import { redirectUri, signIn } from '@/lib/auth';
import { hasServerAccess } from '@/lib/connection';
import { defaultsItem, normalizeServerUrl, originPattern, serverItem, tokenFor, tokenItem } from '@/lib/settings';
import { $, errorText, fillDefaults, handleForm } from '@/lib/ui';

async function showAccount(server: string, info: ApiInfo | null): Promise<void> {
  const token = await tokenFor(server);
  $('account-form').hidden = false;
  $('redirect-uri').textContent = redirectUri();
  $('sign-out').hidden = !token;
  $('sign-in').hidden = !!token;
  const tokensEnabled = info?.auth.loopback_pkce ?? false;
  const available = tokensEnabled && (info?.auth.extension_redirect ?? false);
  $<HTMLButtonElement>('sign-in').disabled = !available;
  if (token) {
    $('account-status').textContent = `Signed in until ${new Date(token.expiresAt).toLocaleString()}.`;
  } else if (!tokensEnabled) {
    $('account-status').textContent = 'This server does not offer sign-in for apps.';
  } else if (!available) {
    $('account-status').textContent =
      'This server does not allow browser extensions to sign in. Ask the administrator to allow the redirect URI below (psst-secret 1.5.4 or later).';
  } else {
    $('account-status').textContent = info?.auth.login_required
      ? 'This server requires sign-in to create whispers.'
      : 'Sign-in is optional on this server.';
  }
}

async function refresh(server: string): Promise<void> {
  const status = $('server-status');
  let info: ApiInfo | null = null;
  try {
    if (!(await hasServerAccess(server))) throw new Error('Access to the server has not been granted. Save again.');
    info = await new PsstClient(server).info();
    status.textContent = `Connected to psst-secret ${info.server_version}.`;
  } catch (error) {
    status.textContent = errorText(error);
  }
  status.hidden = false;
  fillDefaults(info, await defaultsItem.getValue());
  await showAccount(server, info);
}

handleForm($<HTMLFormElement>('server-form'), async () => {
  const server = normalizeServerUrl($<HTMLInputElement>('server').value);
  // Must run first, while the click still counts as a user gesture.
  const granted = await browser.permissions.request({ origins: [originPattern(server)] });
  if (!granted) throw new Error('The extension needs access to the server to work.');
  const previous = await serverItem.getValue();
  if (previous && previous !== server) {
    await tokenItem.removeValue();
    if (originPattern(previous) !== originPattern(server)) {
      await browser.permissions.remove({ origins: [originPattern(previous)] });
    }
  }
  await serverItem.setValue(server);
  $<HTMLInputElement>('server').value = server;
  await refresh(server);
});

handleForm($<HTMLFormElement>('account-form'), async () => {
  const server = await serverItem.getValue();
  if (!server) return;
  await tokenItem.setValue(await signIn(server));
  await refresh(server);
});

$('sign-out').addEventListener('click', async () => {
  const server = await serverItem.getValue();
  const token = await tokenFor(server);
  if (token) {
    try {
      await new PsstClient(server, token.accessToken).revokeToken();
    } catch {
      // The token is forgotten locally either way and expires on its own.
    }
  }
  await tokenItem.removeValue();
  await refresh(server);
});

handleForm($<HTMLFormElement>('defaults-form'), async () => {
  await defaultsItem.setValue({
    expiry: $<HTMLSelectElement>('default-expiry').value as Expiry,
    maxViews: Number($<HTMLSelectElement>('default-views').value),
  });
});

async function init(): Promise<void> {
  const server = await serverItem.getValue();
  fillDefaults(null, await defaultsItem.getValue());
  if (server) {
    $<HTMLInputElement>('server').value = server;
    await refresh(server);
  }
}

void init();
