# psst-secret-extension

Browser extension for [psst-secret](https://github.com/ch0wm3in/psst-secret). Encryption
happens in the extension; link fragments, keys, and passwords are never sent to the server.

Implements format version 1 as specified in psst-secret `v1.5.4` (`docs/format.md`), using
the shared [`@psst-secret/crypto`](https://www.npmjs.com/package/@psst-secret/crypto) package.

## Features

- **Send:** encrypt text in the popup and get a share link, with expiry, view limit, and
  an optional password.
- **Share selection:** right-click selected text and choose **Share selection as a whisper**.
- **Request:** create a receive request and get a submit link and a view link.
- **Reveal:** paste a view link in the popup, or right-click a link to your server and
  choose **Reveal whisper**. Password-protected whispers can be retried without using
  another view.
- **Sign-in:** for servers that require it, sign in through the server's normal web login
  (any configured provider) with PKCE. See [Sign-in](#sign-in).

## Setup

Open the extension's settings, enter your server URL (for example
`https://psst.example.com`), and save. The browser asks for access to that server only.

## Sign-in

The extension uses `identity.launchWebAuthFlow` with the server's `/cli/authorize` and
`/api/v1/cli/token` endpoints. Extensions cannot listen on a loopback port, so the server
must allow the extension's redirect URI, which the settings page shows:

| Browser | Redirect URI |
|---|---|
| Chrome, Edge | `https://<extension id>.chromiumapp.org/callback` |
| Firefox | `https://<hash>.extensions.allizom.org/callback` |

The server administrator adds it to `PSST_API_TOKEN_EXTENSION_REDIRECT_URIS`
(psst-secret 1.5.4 or later). The extension checks `auth.extension_redirect` in
`/api/v1/info` and only offers sign-in when the server allows extensions. Servers that
don't require sign-in work without it.

## Security

- **Permissions:**
  - `storage`: server URL, defaults, and the API token (`storage.local`); text handed
    from the context menu to the popup (`storage.session`, memory only).
  - `contextMenus`, `activeTab`, `scripting`: read the selected text, with line breaks, from
    the tab you right-clicked. No content scripts run otherwise.
  - `identity`: sign-in.
  - Host access is optional and requested at runtime for the configured server only.
    Changing the server removes access to the previous one.
- The extension sends API requests only to the configured server, with
  `credentials: 'omit'` (no session cookies) and the API token as the only credential.
  View links for other servers are rejected, so their keys never leave the extension.
- Selected text and context-menu links are passed through session storage, never URLs or
  history. Decrypted content is shown with `textContent`/form values only and is not stored.
- API tokens are stored only for the server that issued them and expire as configured on
  the server. **Sign out** revokes the token.

## Development

```sh
npm ci
npm run dev             # Chrome with hot reload; npm run dev:firefox for Firefox
npm run compile         # type check
npm test                # unit tests and spec vectors

docker compose -f test/integration/docker-compose.yml up -d
PSST_TEST_SERVER=http://127.0.0.1:18000 npm run test:integration
```

The test vectors in `test/vectors/v1/` are copied from `spec/vectors/v1/` at psst-secret
`v1.5.4`.

## Releasing

Publishing a GitHub release runs [CD](.github/workflows/cd.yml): it sets the version from
the tag (`v1.2.3` → `1.2.3`), builds the Chrome and Firefox packages and the Firefox
sources zip, and submits them for review with `wxt submit`. The `stores` environment needs:

| Name | Type | Value |
|---|---|---|
| `CHROME_EXTENSION_ID` | variable | Chrome Web Store item ID |
| `CHROME_PUBLISHER_ID` | variable | Chrome Web Store publisher ID |
| `CHROME_SERVICE_ACCOUNT_CLIENT_EMAIL` | secret | Service account with Chrome Web Store API access |
| `CHROME_SERVICE_ACCOUNT_PRIVATE_KEY` | secret | Its private key |
| `FIREFOX_JWT_ISSUER` | secret | addons.mozilla.org API key |
| `FIREFOX_JWT_SECRET` | secret | addons.mozilla.org API secret |

The first version must be uploaded by hand in each store's dashboard; the stores
assign the Chrome extension ID then.
