import { cookies } from 'next/headers';
import crypto from 'crypto';

export interface UserSession {
  id: string;
  username: string;
  globalName?: string | null;
  avatar?: string | null;
  avatarUrl: string;
  guildId: string;
  guildName: string;
  expiresAt: number;
}

const COOKIE_NAME = 'ecolive_user_session';
const SESSION_DURATION_SECONDS = 24 * 60 * 60; // 24 horas (renovação diária estrita)

let ephemeralSessionSecret: string | null = null;
function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET || process.env.LIVEKIT_API_SECRET || process.env.DISCORD_CLIENT_SECRET;
  if (!ephemeralSessionSecret && !secret) {
    ephemeralSessionSecret = crypto.randomUUID() + '-' + crypto.randomUUID();
  }
  const rawKey = secret || ephemeralSessionSecret!;
  // Separação de Domínio Criptográfico Estrita (RFC 5869 / NIST SP 800-108)
  return crypto.createHmac('sha256', rawKey).update('EcoLive-ZeroTrust-UserSession-v2').digest('hex');
}

export function formatDiscordAvatarUrl(userId: string, avatarHash?: string | null): string {
  if (avatarHash) {
    const isAnimated = avatarHash.startsWith('a_');
    return `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.${isAnimated ? 'gif' : 'png'}?size=128`;
  }
  try {
    const index = Number((BigInt(userId) >> BigInt(22)) % BigInt(6));
    return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
  } catch {
    return `https://cdn.discordapp.com/embed/avatars/0.png`;
  }
}

export async function getUserSession(): Promise<UserSession | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(COOKIE_NAME);
  if (!sessionCookie || !sessionCookie.value) {
    return null;
  }

  try {
    const parts = sessionCookie.value.split('.');
    if (parts.length !== 2) {
      return null;
    }

    const [data, signature] = parts;
    const expectedSig = crypto
      .createHmac('sha256', getSessionSecret())
      .update(data)
      .digest('base64url');

    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      console.warn('[Security] Tentativa de adulteração detectada no cookie de sessão.');
      return null;
    }

    const raw = Buffer.from(data, 'base64url').toString('utf-8');
    const parsed: UserSession = JSON.parse(raw);
    if (!parsed.id || !parsed.expiresAt || !parsed.guildId) {
      return null;
    }
    if (Date.now() > parsed.expiresAt) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function encodeSession(session: UserSession): string {
  const raw = JSON.stringify(session);
  const data = Buffer.from(raw, 'utf-8').toString('base64url');
  const signature = crypto
    .createHmac('sha256', getSessionSecret())
    .update(data)
    .digest('base64url');
  return `${data}.${signature}`;
}

export { COOKIE_NAME, SESSION_DURATION_SECONDS };
