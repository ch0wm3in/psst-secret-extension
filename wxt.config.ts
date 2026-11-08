import { defineConfig } from 'wxt';

// The server is chosen by the user, so access to it is requested at runtime.
const SERVER_ORIGINS = ['https://*/*', 'http://127.0.0.1/*', 'http://localhost/*'];

// Public key only (private key discarded); pins the dev ID to iogcfjnmdmlmkdolmddoboenpbgnkhem.
const DEV_CHROME_KEY =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAwjQIW3whxnWlzAHMFI0euypMZVwoHNAeNPNdFVNWEh8HU9a95HCdp8M1Lpn+jlx/HqvqlglgKiPg83Jdh7dEqFQI2tTUz1hMudChM0meokBr2RouHkmyGxY2uOnMWfbqxZ+35McPXeoo/bUJmRvoyj/QOs5ih/scRrk2ekBuyn/CiZZJnMIobHgOqc1f8BYj8JlWQrlYm9pnxQPGg6ifyzGWTOVtR0ldtDuNHPs6/Jcr4aAoTbHUJMYU5hvz3SqA9qpGGpG+YLpVHoc7To2HijDlDK0ND1RFhLQJbelzTfkFNNG5Ua2gEnDn+4Vs8kTyV2deuLQDCY4YWUTy0epBewIDAQAB';

export default defineConfig({
  srcDir: 'src',
  imports: false,
  manifest: ({ browser, manifestVersion, command }) => ({
    name: 'psst-secret',
    description: 'Share and reveal end-to-end encrypted whispers on your psst-secret server.',
    // Store builds must not carry a key; the store assigns the published ID.
    ...(command === 'serve' && browser !== 'firefox' && { key: DEV_CHROME_KEY }),
    permissions: ['storage', 'contextMenus', 'activeTab', 'scripting', 'identity'],
    ...(manifestVersion === 3
      ? { optional_host_permissions: SERVER_ORIGINS }
      : { optional_permissions: SERVER_ORIGINS }),
    ...(browser === 'firefox' && {
      browser_specific_settings: {
        gecko: {
          id: 'psst-secret@ch0wm3in.github.io',
          strict_min_version: '115.0',
        },
      },
    }),
  }),
});
