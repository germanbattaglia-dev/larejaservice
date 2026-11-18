import crypto from 'crypto';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const ML_API = 'https://api.mercadolibre.com';
const ML_AUTH = 'https://auth.mercadolibre.com.ar/authorization';
const TOKEN_DOC = 'integrations/mercadolibre';

export type MLToken = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  userId?: number;
  scope?: string;
  tokenType?: string;
};

export function getMLClientId(): string {
  return process.env.ML_CLIENT_ID?.trim() || '';
}

export function getMLClientSecret(): string {
  return process.env.ML_CLIENT_SECRET?.trim() || '';
}

export function isMLConfigured(): boolean {
  return Boolean(getMLClientId() && getMLClientSecret());
}

function getEncryptionKey(): Buffer {
  const raw = process.env.ML_TOKEN_ENCRYPTION_KEY?.trim() || 'la-reja-ml-token-secret-encryption-key-2026';
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, 'hex');
  }
  // Derive deterministic 32-byte key
  return crypto.createHash('sha256').update(raw).digest();
}

function encrypt(value: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64url'), tag.toString('base64url'), encrypted.toString('base64url')].join('.');
}

function decrypt(value: string): string {
  const [ivRaw, tagRaw, dataRaw] = value.split('.');
  if (!ivRaw || !tagRaw || !dataRaw) throw new Error('Token almacenado inválido o corrupto');
  const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), Buffer.from(ivRaw, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(dataRaw, 'base64url')), decipher.final()]).toString('utf8');
}

export function getMLRedirectUri(): string {
  const custom = process.env.ML_REDIRECT_URI?.trim();
  if (custom) return custom;
  const appUrl = (process.env.APP_URL || 'https://larejaservice.com.ar').replace(/\/$/, '');
  return `${appUrl}/api/mercadolibre/oauth/callback`;
}

export function createOAuthState(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function getAuthorizationUrl(state: string): string {
  const clientId = getMLClientId();
  if (!clientId) {
    throw new Error('Falta configurar ML_CLIENT_ID en las variables de entorno');
  }
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: getMLRedirectUri(),
    state
  });
  return `${ML_AUTH}?${params.toString()}`;
}

export async function getStoredMLToken(db: any): Promise<MLToken | null> {
  try {
    const snap = await getDoc(doc(db, TOKEN_DOC));
    if (!snap.exists()) return null;
    const data = snap.data() as any;
    if (!data?.accessToken || !data?.refreshToken || !data?.expiresAt) return null;
    return {
      accessToken: decrypt(data.accessToken),
      refreshToken: decrypt(data.refreshToken),
      expiresAt: Number(data.expiresAt),
      userId: data.userId ? Number(data.userId) : undefined,
      scope: data.scope,
      tokenType: data.tokenType || 'Bearer'
    };
  } catch (err) {
    console.error('[Mercado Libre] Error reading stored token:', err);
    return null;
  }
}

export async function persistMLToken(db: any, token: MLToken): Promise<void> {
  await setDoc(doc(db, TOKEN_DOC), {
    accessToken: encrypt(token.accessToken),
    refreshToken: encrypt(token.refreshToken),
    expiresAt: token.expiresAt,
    userId: token.userId || null,
    scope: token.scope || null,
    tokenType: token.tokenType || 'Bearer',
    updatedAt: Date.now()
  }, { merge: true });
}

export async function exchangeCodeForToken(code: string): Promise<MLToken> {
  const clientId = getMLClientId();
  const clientSecret = getMLClientSecret();
  if (!clientId || !clientSecret) {
    throw new Error('Falta configurar ML_CLIENT_ID o ML_CLIENT_SECRET en las variables de entorno.');
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: getMLRedirectUri()
  });

  const response = await fetch(`${ML_API}/oauth/token`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/x-www-form-urlencoded'
    },
    body
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.message || data?.error_description || `Error de autorización de Mercado Libre (${response.status})`);
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + Number(data.expires_in || 21600) * 1000,
    userId: Number(data.user_id),
    scope: data.scope,
    tokenType: data.token_type || 'Bearer'
  };
}

export async function getValidMLAccessToken(db: any): Promise<string> {
  let token = await getStoredMLToken(db);
  if (!token) throw new Error('Mercado Libre no está conectado. Conecta tu cuenta desde el panel de administración.');

  // Check if token expires within 2 minutes
  if (token.expiresAt > Date.now() + 120000) {
    return token.accessToken;
  }

  console.log('[Mercado Libre] Access token expired or expiring soon, refreshing...');
  const clientId = getMLClientId();
  const clientSecret = getMLClientSecret();
  if (!clientId || !clientSecret) {
    throw new Error('Falta configurar ML_CLIENT_ID o ML_CLIENT_SECRET para renovar el token.');
  }

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: token.refreshToken
  });

  const response = await fetch(`${ML_API}/oauth/token`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/x-www-form-urlencoded'
    },
    body
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.message || data?.error_description || `Error al renovar token de Mercado Libre (${response.status})`);
  }

  token = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || token.refreshToken,
    expiresAt: Date.now() + Number(data.expires_in || 21600) * 1000,
    userId: Number(data.user_id || token.userId),
    scope: data.scope || token.scope,
    tokenType: data.token_type || 'Bearer'
  };

  await persistMLToken(db, token);
  return token.accessToken;
}

export async function mlRequest(db: any, resource: string, init: RequestInit = {}, options: { optionalAuth?: boolean } = {}): Promise<any> {
  const headers = new Headers(init.headers || {});
  headers.set('Accept', 'application/json');
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (options.optionalAuth) {
    try {
      const token = await getValidMLAccessToken(db);
      if (token) headers.set('Authorization', `Bearer ${token}`);
    } catch {
      // Proceed without token for public endpoints
    }
  } else {
    const token = await getValidMLAccessToken(db);
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${ML_API}${resource}`, { ...init, headers });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMsg = data?.message || data?.error || `Error en API de Mercado Libre (${response.status})`;
    const error = new Error(errorMsg);
    (error as any).status = response.status;
    (error as any).details = data;
    throw error;
  }

  return data;
}

export async function getMLStatus(db: any): Promise<any> {
  const configured = isMLConfigured();
  const redirectUri = getMLRedirectUri();
  const token = await getStoredMLToken(db);

  if (!token) {
    return {
      connected: false,
      configured,
      clientId: getMLClientId() ? `${getMLClientId().slice(0, 4)}...` : null,
      redirectUri
    };
  }

  return {
    connected: true,
    configured,
    userId: token.userId || null,
    expiresAt: token.expiresAt,
    expiresSoon: token.expiresAt <= Date.now() + 120000,
    redirectUri
  };
}

export async function clearMLToken(db: any): Promise<void> {
  await setDoc(doc(db, TOKEN_DOC), {
    disconnectedAt: Date.now(),
    accessToken: null,
    refreshToken: null,
    expiresAt: 0,
    userId: null
  }, { merge: true });
}
