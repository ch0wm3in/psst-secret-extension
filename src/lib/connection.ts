import { browser } from 'wxt/browser';
import { type ApiInfo, PsstClient } from './api';
import { originPattern, serverItem, tokenFor } from './settings';

export interface Connection {
  server: string;
  client: PsstClient;
  info: ApiInfo;
}

export class NotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotConfiguredError';
  }
}

export async function hasServerAccess(server: string): Promise<boolean> {
  return browser.permissions.contains({ origins: [originPattern(server)] });
}

/** Connect to the configured server with the saved token, if any. */
export async function connect(): Promise<Connection> {
  const server = await serverItem.getValue();
  if (!server) throw new NotConfiguredError('Choose your psst-secret server in the settings.');
  if (!(await hasServerAccess(server))) {
    throw new NotConfiguredError(`Allow access to ${new URL(server).host} in the settings.`);
  }
  const token = await tokenFor(server);
  const client = new PsstClient(server, token?.accessToken ?? null);
  return { server, client, info: await client.info() };
}
