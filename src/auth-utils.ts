const STORAGE_KEY_VERIFIER = 'oauth_pkce_verifier';
const STORAGE_KEY_STATE = 'oauth_state';
const STORAGE_KEY_PENDING_CODE = 'oauth_pending_code';
const STORAGE_KEY_EXCHANGE_IN_PROGRESS = 'oauth_exchange_in_progress';

/**
 * Generates a random string for PKCE code verifier
 */
function generateRandomString(length: number): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return base64UrlEncode(array);
}

/**
 * Creates a SHA-256 hash and base64url encodes it for PKCE code challenge
 */
async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(new Uint8Array(hash));
}

/**
 * Base64 URL encode (RFC 4648)
 */
function base64UrlEncode(buffer: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...buffer));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

interface SignInOptions {
  lang?: string;
}

/**
 * Redirects to Cognito Hosted UI with optional lang parameter
 */
export async function signInWithLang(options: SignInOptions = {}): Promise<void> {
  const domain = import.meta.env.VITE_COGNITO_DOMAIN;
  const clientId = import.meta.env.VITE_COGNITO_USER_POOL_CLIENT_ID;
  const redirectUri = import.meta.env.VITE_REDIRECT_SIGN_IN;
  const scopes = ['openid', 'email', 'profile', 'aws.cognito.signin.user.admin'];

  const codeVerifier = generateRandomString(32);
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const state = generateRandomString(32);

  // Store PKCE verifier and state for token exchange
  sessionStorage.setItem(STORAGE_KEY_VERIFIER, codeVerifier);
  sessionStorage.setItem(STORAGE_KEY_STATE, state);

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    scope: scopes.join(' '),
    redirect_uri: redirectUri,
    state: state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  if (options.lang) {
    params.set('lang', options.lang);
  }

  const authUrl = `https://${domain}/oauth2/authorize?${params.toString()}`;
  window.location.href = authUrl;
}

interface TokenResponse {
  access_token: string;
  id_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

/**
 * Exchanges authorization code for tokens
 */
export async function exchangeCodeForTokens(code: string): Promise<TokenResponse> {
  const domain = import.meta.env.VITE_COGNITO_DOMAIN;
  const clientId = import.meta.env.VITE_COGNITO_USER_POOL_CLIENT_ID;
  const redirectUri = import.meta.env.VITE_REDIRECT_SIGN_IN;

  const codeVerifier = sessionStorage.getItem(STORAGE_KEY_VERIFIER);
  if (!codeVerifier) {
    throw new Error('No code verifier found');
  }

  const response = await fetch(`https://${domain}/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      code: code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${error}`);
  }

  // Clean up stored values
  sessionStorage.removeItem(STORAGE_KEY_VERIFIER);
  sessionStorage.removeItem(STORAGE_KEY_STATE);

  return response.json();
}

/**
 * Validates the OAuth state parameter
 */
export function validateState(returnedState: string): boolean {
  const storedState = sessionStorage.getItem(STORAGE_KEY_STATE);
  return storedState === returnedState;
}

/**
 * Checks if there's an authorization code (in URL or sessionStorage)
 */
export function getAuthorizationCode(): { code: string; state: string } | null {
  // First check URL
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const state = params.get('state');

  if (code && state) {
    // Store in sessionStorage in case of React StrictMode double-mount
    sessionStorage.setItem(STORAGE_KEY_PENDING_CODE, JSON.stringify({ code, state }));

    // Clear URL immediately
    const url = new URL(window.location.href);
    url.searchParams.delete('code');
    url.searchParams.delete('state');
    window.history.replaceState({}, '', url.toString());

    return { code, state };
  }

  // Check sessionStorage for pending code (React StrictMode second mount)
  const pending = sessionStorage.getItem(STORAGE_KEY_PENDING_CODE);
  if (pending) {
    return JSON.parse(pending);
  }

  return null;
}

/**
 * Clears the pending authorization code from sessionStorage
 */
export function clearAuthorizationCode(): void {
  sessionStorage.removeItem(STORAGE_KEY_PENDING_CODE);
  sessionStorage.removeItem(STORAGE_KEY_EXCHANGE_IN_PROGRESS);
}

/**
 * Marks that a token exchange is in progress
 */
export function markExchangeInProgress(): void {
  sessionStorage.setItem(STORAGE_KEY_EXCHANGE_IN_PROGRESS, 'true');
}

/**
 * Checks if a token exchange is currently in progress
 */
export function isExchangeInProgress(): boolean {
  return sessionStorage.getItem(STORAGE_KEY_EXCHANGE_IN_PROGRESS) === 'true';
}
