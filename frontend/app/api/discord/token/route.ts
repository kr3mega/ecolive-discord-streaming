import { NextRequest, NextResponse } from 'next/server';
import {
  UserSession,
  encodeSession,
  formatDiscordAvatarUrl,
  COOKIE_NAME,
  SESSION_DURATION_SECONDS,
} from '@/lib/userSession';
import { checkGuildAccess, ManagedGuild } from '@/lib/guildStorage';
import { isAllowedOrigin } from '@/lib/originSecurity';

export const dynamic = 'force-dynamic';

interface OAuthRateLimitEntry {
  attempts: number;
  blockedUntil: number;
  lastAttempt: number;
}

const tokenExchangeAttempts = new Map<string, OAuthRateLimitEntry>();
const MAX_EXCHANGE_ATTEMPTS = 5;
const EXCHANGE_WINDOW_MS = 60 * 1000; // 1 minuto
const BLOCK_DURATION_MS = 5 * 60 * 1000; // 5 minutos de bloqueio

function cleanupExpiredEntries(now: number) {
  for (const [ip, item] of tokenExchangeAttempts.entries()) {
    if (item.blockedUntil > 0 && item.blockedUntil <= now) {
      tokenExchangeAttempts.delete(ip);
    } else if (item.blockedUntil === 0 && now - item.lastAttempt > EXCHANGE_WINDOW_MS) {
      tokenExchangeAttempts.delete(ip);
    }
  }
  if (tokenExchangeAttempts.size > 5000) {
    const keys = Array.from(tokenExchangeAttempts.keys()).slice(0, 1000);
    for (const k of keys) tokenExchangeAttempts.delete(k);
  }
}

function getClientIp(req: NextRequest): string {
  const cfIp = req.headers.get('cf-connecting-ip');
  if (cfIp && cfIp.trim()) return cfIp.trim();
  const realIp = req.headers.get('x-real-ip');
  if (realIp && realIp.trim()) return realIp.trim();
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const ips = forwarded.split(',').map((ip) => ip.trim()).filter(Boolean);
    if (ips.length > 0) return ips[ips.length - 1];
  }
  return '127.0.0.1';
}

export async function POST(req: NextRequest) {
  if (!isAllowedOrigin(req)) {
    return NextResponse.json(
      { error: 'Violação de segurança de origem (CSRF bloqueado).' },
      { status: 403 }
    );
  }

  const clientIp = getClientIp(req);
  const now = Date.now();
  cleanupExpiredEntries(now);

  const entry = tokenExchangeAttempts.get(clientIp);
  if (entry && entry.blockedUntil > now) {
    const remainingSeconds = Math.ceil((entry.blockedUntil - now) / 1000);
    return NextResponse.json(
      { error: `Muitas tentativas de autenticação. Tente novamente em ${remainingSeconds} segundos.` },
      { status: 429 }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const rawCode = typeof body.code === 'string' ? body.code.trim() : '';
    const requestedGuildId = typeof body.guildId === 'string' ? body.guildId.trim() : undefined;

    // Validação estrita do código OAuth para prevenir injeções e chamadas desnecessárias à API do Discord
    if (!rawCode || rawCode.length < 10 || rawCode.length > 128 || !/^[a-zA-Z0-9_-]+$/.test(rawCode)) {
      const currentAttempts = (entry ? entry.attempts : 0) + 1;
      const isBlocked = currentAttempts >= MAX_EXCHANGE_ATTEMPTS;
      tokenExchangeAttempts.set(clientIp, {
        attempts: currentAttempts,
        blockedUntil: isBlocked ? now + BLOCK_DURATION_MS : 0,
        lastAttempt: now,
      });
      return NextResponse.json({ error: 'Código de autorização inválido ou ausente.' }, { status: 400 });
    }

    const code = rawCode;
    const clientId = process.env.DISCORD_CLIENT_ID || '1548180499934085150';
    const clientSecret = process.env.DISCORD_CLIENT_SECRET;

    if (!clientSecret) {
      return NextResponse.json(
        { error: 'DISCORD_CLIENT_SECRET não configurado no servidor.' },
        { status: 400 }
      );
    }

    // 1. Troca o código pelo token oficial com a API do Discord
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code,
      }),
    });

    if (!tokenRes.ok) {
      const currentAttempts = (entry ? entry.attempts : 0) + 1;
      const isBlocked = currentAttempts >= MAX_EXCHANGE_ATTEMPTS;
      tokenExchangeAttempts.set(clientIp, {
        attempts: currentAttempts,
        blockedUntil: isBlocked ? now + BLOCK_DURATION_MS : 0,
        lastAttempt: now,
      });

      const errText = await tokenRes.text();
      return NextResponse.json(
        { error: `Falha ao trocar código no Discord: ${errText}` },
        { status: tokenRes.status }
      );
    }

    // Sucesso na troca: limpa o contador do IP
    tokenExchangeAttempts.delete(clientIp);

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;
    const authHeader = `${tokenData.token_type || 'Bearer'} ${accessToken}`;

    // 2. Consulta o perfil real e imutável do usuário na API oficial do Discord
    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: authHeader },
    });

    if (!userRes.ok) {
      return NextResponse.json(
        { error: 'Falha ao consultar perfil do usuário no Discord.' },
        { status: userRes.status }
      );
    }

    const discordUser = await userRes.json();

    // 3. Regra Zero-Trust: Consulta as guildas reais do usuário para verificar pertencimento
    const guildsRes = await fetch('https://discord.com/api/users/@me/guilds', {
      headers: { Authorization: authHeader },
    });

    let matchedGuild: ManagedGuild | null = null;
    if (guildsRes.ok) {
      const userGuilds: Array<{ id: string; name: string }> = await guildsRes.json().catch(() => []);
      if (Array.isArray(userGuilds)) {
        if (requestedGuildId) {
          const isMember = userGuilds.some((g) => g.id === requestedGuildId);
          if (isMember) {
            const access = checkGuildAccess(requestedGuildId);
            if (access.authorized && access.guild) {
              matchedGuild = access.guild;
            }
          }
          // Regra Zero-Trust: Se uma guilda específica foi requisitada pela Activity,
          // NUNCA fazer fallback para outro servidor para evitar quebra de isolamento multi-inquilino
        } else {
          // Apenas se nenhuma guilda foi solicitada explicitamente, busca qualquer guilda autorizada do usuário
          for (const ug of userGuilds) {
            const access = checkGuildAccess(ug.id);
            if (access.authorized && access.guild) {
              matchedGuild = access.guild;
              break;
            }
          }
        }
      }
    }

    if (!matchedGuild) {
      console.warn(`[Security Alert] Usuário "${discordUser.username}" (${discordUser.id}) tentou autenticar sem pertencer a nenhuma guilda autorizada.`);
      return NextResponse.json(
        { error: 'Acesso negado: Você não pertence a nenhum servidor autorizado pelo EcoLive.' },
        { status: 403 }
      );
    }

    // 4. Emissão da Sessão Criptográfica Segura
    const userSession: UserSession = {
      id: discordUser.id,
      username: discordUser.username,
      globalName: discordUser.global_name || discordUser.username,
      avatar: discordUser.avatar,
      avatarUrl: formatDiscordAvatarUrl(discordUser.id, discordUser.avatar),
      guildId: matchedGuild.id,
      guildName: matchedGuild.name,
      expiresAt: Date.now() + SESSION_DURATION_SECONDS * 1000,
    };

    const signedSession = encodeSession(userSession);
    const safeTokenPayload = {
      access_token: tokenData.access_token,
      token_type: tokenData.token_type || 'Bearer',
      expires_in: tokenData.expires_in,
      scope: tokenData.scope,
    };
    const res = NextResponse.json(safeTokenPayload);

    res.cookies.set({
      name: COOKIE_NAME,
      value: signedSession,
      httpOnly: true,
      path: '/',
      maxAge: SESSION_DURATION_SECONDS,
      sameSite: 'none', // Necessário para iframe da Discord Activity
      secure: true,
    });

    return res;
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro interno ao autenticar no Discord' },
      { status: 500 }
    );
  }
}
