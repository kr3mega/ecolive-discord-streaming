import { NextRequest, NextResponse } from 'next/server';
import {
  verifyAdminPassword,
  createAdminSessionToken,
  ADMIN_COOKIE_NAME,
  ADMIN_SESSION_DURATION_SECONDS,
} from '@/lib/adminSession';
import { isAllowedOrigin } from '@/lib/originSecurity';

export const dynamic = 'force-dynamic';

interface RateLimitEntry {
  attempts: number;
  blockedUntil: number;
  lastAttempt: number;
}

const loginAttempts = new Map<string, RateLimitEntry>();
const MAX_ATTEMPTS = 5;
const BLOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutos
const MAX_RATE_LIMIT_ENTRIES = 5000;

function cleanupExpiredEntries(now: number) {
  for (const [ip, item] of loginAttempts.entries()) {
    if (item.blockedUntil > 0 && item.blockedUntil <= now) {
      loginAttempts.delete(ip);
    } else if (item.blockedUntil === 0 && now - item.lastAttempt > BLOCK_DURATION_MS) {
      loginAttempts.delete(ip);
    }
  }
  if (loginAttempts.size > MAX_RATE_LIMIT_ENTRIES) {
    const keys = Array.from(loginAttempts.keys()).slice(0, 1000);
    for (const k of keys) loginAttempts.delete(k);
  }
}

function getClientIp(req: NextRequest): string {
  // Cloudflare Tunnel injeta o IP original autenticado e imutável
  const cfIp = req.headers.get('cf-connecting-ip');
  if (cfIp && cfIp.trim()) {
    return cfIp.trim();
  }
  const realIp = req.headers.get('x-real-ip');
  if (realIp && realIp.trim()) {
    return realIp.trim();
  }
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const ips = forwarded.split(',').map((ip) => ip.trim()).filter(Boolean);
    if (ips.length > 0) {
      return ips[ips.length - 1];
    }
  }
  return '127.0.0.1';
}

export async function POST(req: NextRequest) {
  if (!isAllowedOrigin(req)) {
    return NextResponse.json(
      { error: 'Origem não autorizada.' },
      { status: 403 }
    );
  }

  const clientIp = getClientIp(req);
  const now = Date.now();
  cleanupExpiredEntries(now);
  const entry = loginAttempts.get(clientIp);

  if (entry && entry.blockedUntil > now) {
    const remainingSeconds = Math.ceil((entry.blockedUntil - now) / 1000);
    return NextResponse.json(
      { error: `Muitas tentativas. Tente novamente em ${remainingSeconds} segundos.` },
      { status: 429 }
    );
  }

  let password = '';
  try {
    const body = await req.json().catch(() => ({}));
    if (typeof body.password === 'string') {
      password = body.password;
    }
  } catch {}

  if (!password) {
    const currentAttempts = (entry ? entry.attempts : 0) + 1;
    const isBlocked = currentAttempts >= MAX_ATTEMPTS;
    loginAttempts.set(clientIp, {
      attempts: currentAttempts,
      blockedUntil: isBlocked ? now + BLOCK_DURATION_MS : 0,
      lastAttempt: now,
    });
    return NextResponse.json({ error: 'Credenciais inválidas.' }, { status: 400 });
  }

  await new Promise((resolve) => setTimeout(resolve, 600));

  try {
    const isValid = await verifyAdminPassword(password);
    if (!isValid) {
      const currentAttempts = (entry ? entry.attempts : 0) + 1;
      const isBlocked = currentAttempts >= MAX_ATTEMPTS;
      loginAttempts.set(clientIp, {
        attempts: currentAttempts,
        blockedUntil: isBlocked ? now + BLOCK_DURATION_MS : 0,
        lastAttempt: now,
      });

      if (isBlocked) {
        return NextResponse.json(
          { error: 'Muitas tentativas. Tente novamente mais tarde.' },
          { status: 429 }
        );
      }

      return NextResponse.json({ error: 'Credenciais inválidas.' }, { status: 401 });
    }

    // Sucesso: limpa tentativas do IP
    loginAttempts.delete(clientIp);

    const token = await createAdminSessionToken();
    const isHttps = req.headers.get('x-forwarded-proto') === 'https' || req.url.startsWith('https://');

    const res = NextResponse.json({ success: true, message: 'Autenticado com sucesso.' });
    res.cookies.set({
      name: ADMIN_COOKIE_NAME,
      value: token,
      httpOnly: true,
      path: '/',
      maxAge: ADMIN_SESSION_DURATION_SECONDS,
      sameSite: 'strict',
      secure: isHttps,
    });

    return res;
  } catch (err) {
    return NextResponse.json({ error: 'Erro no processamento da autenticação.' }, { status: 500 });
  }
}
