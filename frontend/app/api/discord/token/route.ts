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
const MAX_EXCHANGE_ATTEMPTS = 60; // Suporta múltiplos usuários e recargas simultâneas no proxy compartilhado do Discord
const EXCHANGE_WINDOW_MS = 60 * 1000; // 1 minuto
const BLOCK_DURATION_MS = 30 * 1000; // 30 segundos de tolerância temporária (evita bloqueio prolongado de salas)

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

    // Validação do código OAuth para prevenir injeções
    if (!rawCode || rawCode.length < 4 || rawCode.length > 512 || !/^[a-zA-Z0-9_.-]+$/.test(rawCode)) {
      console.warn(`[Discord Token API] Código OAuth inválido rejeitado. Length: ${rawCode.length}, IP: ${clientIp}`);
      const currentAttempts = (entry ? entry.attempts : 0) + 1;
      const isBlocked = currentAttempts >= MAX_EXCHANGE_ATTEMPTS;
      tokenExchangeAttempts.set(clientIp, {
        attempts: currentAttempts,
        blockedUntil: isBlocked ? now + BLOCK_DURATION_MS : 0,
        lastAttempt: now,
      });
      return NextResponse.json({ error: 'Código de autorização inválido ou ausente.' }, { status: 400 });
    }

    console.log(`[Discord Token API] Iniciando troca de token. IP: ${clientIp}, guildId solicitada: ${requestedGuildId || 'nenhuma'}`);
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
      console.error(`[Discord Token API] Falha ao trocar código no Discord (Status ${tokenRes.status}):`, errText);
      return NextResponse.json(
        { error: 'Falha ao trocar código de autorização no Discord.' },
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
      console.error(`[Discord Token API] Falha ao consultar /users/@me (Status ${userRes.status})`);
      return NextResponse.json(
        { error: 'Falha ao consultar perfil do usuário no Discord.' },
        { status: userRes.status }
      );
    }

    const discordUser = await userRes.json();
    console.log(`[Discord Token API] Usuário identificado: "${discordUser.username}" (${discordUser.id})`);

    // 3. Regra Zero-Trust: Consulta as guildas reais do usuário para verificar pertencimento
    const guildsRes = await fetch('https://discord.com/api/users/@me/guilds', {
      headers: { Authorization: authHeader },
    });

    let matchedGuild: ManagedGuild | null = null;
    let userGuilds: Array<{ id: string; name: string }> = [];
    if (guildsRes.ok) {
      userGuilds = await guildsRes.json().catch(() => []);
      console.log(`[Discord Token API] Guildas retornadas para "${discordUser.username}": ${userGuilds.length}`);
      if (Array.isArray(userGuilds)) {
        if (requestedGuildId) {
          const isMember = userGuilds.some((g) => g.id === requestedGuildId);
          console.log(`[Discord Token API] Verificando guild solicitada "${requestedGuildId}": usuário é membro? ${isMember}`);
          if (isMember) {
            const access = checkGuildAccess(requestedGuildId);
            console.log(`[Discord Token API] Autorização da guilda "${requestedGuildId}":`, access);
            if (access.authorized && access.guild) {
              matchedGuild = access.guild;
            }
          }
        } else {
          for (const ug of userGuilds) {
            const access = checkGuildAccess(ug.id);
            if (access.authorized && access.guild) {
              matchedGuild = access.guild;
              console.log(`[Discord Token API] Fallback guilda autorizada encontrada: "${ug.name}" (${ug.id})`);
              break;
            }
          }
        }
      }
    } else {
      const errGuilds = await guildsRes.text().catch(() => '');
      console.error(`[Discord Token API] Falha na consulta /users/@me/guilds (Status ${guildsRes.status}):`, errGuilds);
    }

    if (!matchedGuild) {
      console.warn(`[Security Alert] Usuário "${discordUser.username}" (${discordUser.id}) tentou autenticar sem guilda autorizada. Solicitada: "${requestedGuildId || 'nenhuma'}". Guildas do usuário:`, userGuilds.map((g) => `${g.name} (${g.id})`));
      return NextResponse.json(
        { error: 'Acesso negado: Você não pertence a nenhum servidor autorizado pelo EcoLive.' },
        { status: 403 }
      );
    }

    console.log(`[Discord Token API] SUCESSO: Sessão autorizada para "${discordUser.username}" na guilda "${matchedGuild.name}" (${matchedGuild.id})`);

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
      sessionToken: signedSession,
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
      partitioned: true, // Padrão CHIPS (Cookies Having Independent Partitioned State) para iframes cross-site
    });

    return res;
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro interno ao autenticar no Discord' },
      { status: 500 }
    );
  }
}
