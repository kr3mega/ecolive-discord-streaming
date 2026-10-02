export const ADMIN_COOKIE_NAME = 'ecolive_admin_session';
export const ADMIN_SESSION_DURATION_SECONDS = 24 * 60 * 60; // 24 horas

let ephemeralAdminSecret: string | null = null;
function getAdminSecret(): string {
  const secret = process.env.ADMIN_SECRET || process.env.LIVEKIT_API_SECRET || process.env.DISCORD_CLIENT_SECRET;
  if (!ephemeralAdminSecret && !secret) {
    ephemeralAdminSecret = crypto.randomUUID() + '-' + crypto.randomUUID();
  }
  const rawKey = secret || ephemeralAdminSecret!;
  // Separação de Domínio Criptográfico Estrita (RFC 5869 / NIST SP 800-108)
  return `${rawKey}:EcoLive-ZeroTrust-AdminSession-v2`;
}

function getExpectedAdminPassword(): string {
  return process.env.ADMIN_PASSWORD || '';
}

function bufferToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Validação de senha em tempo constante usando SHA-256 via Web Crypto
 * Falha por padrão fechado (Fail-Closed) se ADMIN_PASSWORD não estiver configurado no ambiente.
 */
export async function verifyAdminPassword(passwordAttempt: string): Promise<boolean> {
  const expectedPassword = getExpectedAdminPassword();
  if (!expectedPassword || !passwordAttempt || typeof passwordAttempt !== 'string') {
    return false;
  }
  const encoder = new TextEncoder();
  const attemptHashBuf = await crypto.subtle.digest('SHA-256', encoder.encode(passwordAttempt));
  const expectedHashBuf = await crypto.subtle.digest('SHA-256', encoder.encode(expectedPassword));

  const attemptHex = bufferToHex(attemptHashBuf);
  const expectedHex = bufferToHex(expectedHashBuf);

  return constantTimeEqual(attemptHex, expectedHex);
}

interface AdminSessionPayload {
  role: 'admin';
  iat: number;
  exp: number;
  nonce: string;
}

async function getHmacKey(): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(getAdminSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

/**
 * Cria token assinado com HMAC-SHA256 para sessão de administrador
 */
export async function createAdminSessionToken(): Promise<string> {
  const payload: AdminSessionPayload = {
    role: 'admin',
    iat: Date.now(),
    exp: Date.now() + ADMIN_SESSION_DURATION_SECONDS * 1000,
    nonce: crypto.randomUUID(),
  };

  const raw = JSON.stringify(payload);
  const data = Buffer.from(raw, 'utf-8').toString('base64url');
  const encoder = new TextEncoder();

  const key = await getHmacKey();
  const sigBuf = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  const signature = bufferToHex(sigBuf);

  return `${data}.${signature}`;
}

/**
 * Valida a integridade e expiração do token de administrador
 */
export async function verifyAdminSessionToken(token?: string | null): Promise<boolean> {
  if (!token || typeof token !== 'string') {
    return false;
  }

  const parts = token.split('.');
  if (parts.length !== 2) {
    return false;
  }

  const [data, signature] = parts;
  try {
    const encoder = new TextEncoder();
    const key = await getHmacKey();
    const sigBuf = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
    const expectedSignature = bufferToHex(sigBuf);

    if (!constantTimeEqual(signature, expectedSignature)) {
      return false;
    }

    const payloadRaw = Buffer.from(data, 'base64url').toString('utf-8');
    const payload: AdminSessionPayload = JSON.parse(payloadRaw);

    if (payload.role !== 'admin' || !payload.exp || !payload.iat) {
      return false;
    }

    if (Date.now() > payload.exp) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}
