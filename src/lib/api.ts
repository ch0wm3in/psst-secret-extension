export type Expiry = '5m' | '1h' | '1d' | '1w' | '1M';
export const EXPIRY_LABELS: Record<Expiry, string> = {
  '5m': '5 minutes',
  '1h': '1 hour',
  '1d': '1 day',
  '1w': '1 week',
  '1M': '1 month',
};

export interface ApiInfo {
  server_version: string;
  api_version: number;
  format_versions: number[];
  auth: {
    login_required: boolean;
    loopback_pkce: boolean;
    manual_code: boolean;
    // Added in psst-secret v1.5.4.
    extension_redirect?: boolean;
    scopes: string[];
  };
  features?: {
    email_notifications: boolean;
    receive_access: { enabled: boolean; default: boolean; required: boolean };
    receive_history: boolean;
    rich_text: boolean;
  };
  policies?: { view_requires_auth: boolean; submit_requires_auth: boolean };
  limits?: { max_upload_bytes: number; max_views: number; expiry_options: string[] };
}

interface CreateOptions {
  reveal_token_hash: string;
  max_views: number;
  expiry: Expiry;
}

export interface CreateWhisperBody extends CreateOptions {
  v: number;
  ciphertext: string;
  iv: string;
  salt: string;
}

export interface CreateRequestBody extends CreateOptions {
  v: number;
  public_key: string;
  salt: string;
  wrapped_key: string;
  wrapped_key_iv: string;
}

export interface RevealResponse {
  v: number;
  ciphertext: string;
  iv: string;
  salt: string;
  encapsulated_key: string;
  wrapped_key: string;
  wrapped_key_iv: string;
  view_count: number;
  max_views: number;
  remaining_views: number;
}

export interface WhisperStatus {
  status: 'pending' | 'submitted' | 'gone';
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  expires_at: string;
  scope: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function errorMessage(status: number, data: unknown): string {
  if (status === 401) return 'Sign-in required. Sign in from the extension settings.';
  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>;
    for (const key of ['error', 'detail']) {
      if (typeof record[key] === 'string') return record[key];
    }
    // DRF validation errors: {"field": ["message", ...]}
    for (const [field, value] of Object.entries(record)) {
      const first = Array.isArray(value) ? value[0] : value;
      if (typeof first === 'string') return `${field}: ${first}`;
    }
  }
  return `Server error (${status})`;
}

export class PsstClient {
  constructor(
    readonly server: string,
    private readonly token: string | null = null,
  ) {}

  get hasToken(): boolean {
    return this.token !== null;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    let response: Response;
    try {
      response = await fetch(new URL(`api/v1/${path}`, this.server), {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        // Never send session cookies; the API token is the only credential.
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'error',
      });
    } catch {
      throw new ApiError(0, `Could not reach ${this.server}`);
    }
    if (response.status === 204) return undefined as T;
    let data: unknown = null;
    try {
      data = await response.json();
    } catch {
      // Error pages from proxies are not JSON.
    }
    if (!response.ok) throw new ApiError(response.status, errorMessage(response.status, data));
    return data as T;
  }

  info(): Promise<ApiInfo> {
    return this.request('GET', 'info');
  }

  createWhisper(body: CreateWhisperBody): Promise<{ id: string; url: string }> {
    return this.request('POST', 'whisper', body);
  }

  createRequest(
    body: CreateRequestBody,
  ): Promise<{ id: string; submit_url: string; view_url: string; expires_at: string }> {
    return this.request('POST', 'whisper/request', body);
  }

  reveal(viewId: string, revealToken: string): Promise<RevealResponse> {
    return this.request('POST', `whisper/${viewId}/reveal`, { reveal_token: revealToken });
  }

  status(viewId: string): Promise<WhisperStatus> {
    return this.request('GET', `whisper/${viewId}/status`);
  }

  exchangeToken(body: { code: string; code_verifier: string; redirect_uri: string }): Promise<TokenResponse> {
    return this.request('POST', 'cli/token', body);
  }

  revokeToken(): Promise<void> {
    return this.request('POST', 'cli/revoke');
  }
}
