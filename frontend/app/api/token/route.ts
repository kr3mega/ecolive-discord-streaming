import { AccessToken } from 'livekit-server-sdk';
import { NextRequest, NextResponse } from 'next/server';
import { guildRegistry } from '@/lib/guildRegistry';
import { checkGuildAccess } from '@/lib/guildStorage';
import { getUserSession, decodeSession, COOKIE_NAME } from '@/lib/userSession';
import { isAllowedOrigin, getSafeHost } from '@/lib/originSecurity';

function resolveServerUrl(req: NextRequest): string {
  const host = getSafeHost(req);
  const isLocalhost = host.includes('localhost') || host.includes('127.0.0.1');

  // 1. Se a requisição veio do próprio PC local (desenvolvimento/testes)
  if (isLocalhost) {
    return process.env.LIVEKIT_URL || 'ws://127.0.0.1:7880';
  }

  // 2. Se for acesso externo (celular via Cloudflare Tunnel ou Iframe do Discord)
  if (process.env.LIVEKIT_PUBLIC_URL) {
    return process.env.LIVEKIT_PUBLIC_URL;
  }

  return process.env.LIVEKIT_URL || 'ws://127.0.0.1:7880';
}

export async function GET(req: NextRequest) {
  if (!isAllowedOrigin(req)) {
    return NextResponse.json(
      { error: 'Origem não autorizada.' },
      { status: 403 }
    );
  }

  const searchParams = req.nextUrl.searchParams;
  
  // Suporte a channelId com fallback para room
  const channelId = searchParams.get('channelId') || searchParams.get('room');
  const mode = searchParams.get('mode') || 'web'; // 'web' ou 'obs'
  
  // Resolução resiliente da sessão: Cookie seguro HttpOnly prioritário com fallback para Bearer/Query
  const authHeader = req.headers.get('authorization');
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7).trim() : undefined;
  const queryToken = searchParams.get('authToken') || searchParams.get('token') || undefined;
  const fallbackToken = bearerToken || queryToken;
  const session = (await getUserSession()) || (fallbackToken ? decodeSession(fallbackToken) : null);
  
  const rawChannelName = searchParams.get('channelName');
  const channelName = rawChannelName
    ? rawChannelName.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim().substring(0, 64)
    : undefined;

  if (!channelId) {
    return NextResponse.json(
      { error: 'Parâmetro "channelId" é obrigatório.' },
      { status: 400 }
    );
  }

  if (!session) {
    console.warn(`[LiveKit Token API] REJEITADO (401): Nenhuma sessão encontrada. IP: ${req.headers.get('x-forwarded-for') || 'local'}, Bearer: ${Boolean(bearerToken)}, QueryToken: ${Boolean(queryToken)}, Cookie: ${Boolean(await getUserSession())}`);
    const res = NextResponse.json(
      { error: 'Acesso não autorizado.' },
      { status: 401 }
    );
    res.cookies.set({
      name: COOKIE_NAME,
      value: '',
      path: '/',
      maxAge: 0,
      sameSite: 'none',
      secure: true,
      partitioned: true,
    });
    return res;
  }

  console.log(`[LiveKit Token API] Sessão validada para usuário "${session.username}" (${session.id}), guilda "${session.guildName}" (${session.guildId})`);

  const guildId = session.guildId;
  const access = checkGuildAccess(guildId);
  if (!access.authorized) {
    return NextResponse.json(
      { error: 'Acesso restrito para esta guilda.' },
      { status: 403 }
    );
  }

  const safeChannelId = channelId.trim().replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 64);
  if (!safeChannelId) {
    return NextResponse.json(
      { error: 'Parâmetro "channelId" (ou "room") é inválido.' },
      { status: 400 }
    );
  }
  const livekitRoom = safeChannelId.startsWith(`${guildId}_`) ? safeChannelId : `${guildId}_${safeChannelId}`;
  guildRegistry.registerChannel(livekitRoom, guildId, channelName);

  // Regra RLS Estrita: A identidade é extraída exclusivamente da sessão autenticada (até 32 caracteres)
  const cleanId = session.username
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]/g, '')
    .substring(0, 32);

  const participantIdentity = mode === 'obs' ? `obs_${cleanId}` : `user_${cleanId}`;
  const displayName = session.globalName || session.username;
  const avatarUrl = session.avatarUrl;

  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;

  if (!apiKey || !apiSecret) {
    return NextResponse.json(
      { error: 'Credenciais do LiveKit não configuradas no servidor.' },
      { status: 500 }
    );
  }

  try {
    const metaPayload: Record<string, unknown> = {};
    if (avatarUrl) metaPayload.avatar = avatarUrl;
    if (guildId) metaPayload.guildId = guildId;
    if (channelName) metaPayload.channelName = channelName;

    const at = new AccessToken(apiKey, apiSecret, {
      identity: participantIdentity,
      name: displayName || undefined,
      metadata: Object.keys(metaPayload).length > 0 ? JSON.stringify(metaPayload) : undefined,
      ttl: '4h', // TTL curto de 4 horas para máxima segurança
    });

    // Sala isolada determinística por Guilda e Canal (${guildId}_${channelId})
    at.addGrant({
      room: livekitRoom,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
    });

    const token = await at.toJwt();
    const livekitUrl = resolveServerUrl(req);

    return NextResponse.json(
      {
        token,
        identity: participantIdentity,
        room: livekitRoom,
        channelId: safeChannelId,
        serverUrl: livekitUrl,
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, private',
          'Pragma': 'no-cache',
        },
      }
    );
  } catch (error) {
    console.error('Erro ao gerar AccessToken do LiveKit:', error);
    return NextResponse.json(
      { error: 'Falha interna ao gerar token de acesso.' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  if (!isAllowedOrigin(req)) {
    return NextResponse.json(
      { error: 'Origem não autorizada.' },
      { status: 403 }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    
    // Resolução resiliente da sessão: Cookie seguro HttpOnly prioritário com fallback para Bearer/Body
    const authHeader = req.headers.get('authorization');
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7).trim() : undefined;
    const bodyToken = typeof body.authToken === 'string' ? body.authToken.trim() : undefined;
    const fallbackToken = bearerToken || bodyToken;
    const session = (await getUserSession()) || (fallbackToken ? decodeSession(fallbackToken) : null);

    if (!session) {
      return NextResponse.json(
        { error: 'Acesso não autorizado.' },
        { status: 401 }
      );
    }

    const channelId = body.channelId || body.room;
    const mode = body.mode || 'web';
    const rawChannelName = typeof body.channelName === 'string' ? body.channelName : undefined;
    const channelName = rawChannelName
      ? rawChannelName.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim().substring(0, 64)
      : undefined;

    if (!channelId) {
      return NextResponse.json(
        { error: 'Campo "channelId" é obrigatório no JSON.' },
        { status: 400 }
      );
    }

    const guildId = session.guildId;
    const access = checkGuildAccess(guildId);
    if (!access.authorized) {
      return NextResponse.json(
        { error: 'Acesso restrito para esta guilda.' },
        { status: 403 }
      );
    }
    const safeChannelId = channelId.trim().replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 64);
    if (!safeChannelId) {
      return NextResponse.json(
        { error: 'Campo "channelId" inválido no JSON.' },
        { status: 400 }
      );
    }
    const livekitRoom = safeChannelId.startsWith(`${guildId}_`) ? safeChannelId : `${guildId}_${safeChannelId}`;
    guildRegistry.registerChannel(livekitRoom, guildId, channelName);

    const verifiedCleanId = session.username
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9_-]/g, '')
      .substring(0, 32);

    const participantIdentity = mode === 'obs' ? `obs_${verifiedCleanId}` : `user_${verifiedCleanId}`;
    const displayName = session.globalName || session.username;
    const avatarUrl = session.avatarUrl;

    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;

    if (!apiKey || !apiSecret) {
      return NextResponse.json(
        { error: 'Credenciais do LiveKit não configuradas no servidor.' },
        { status: 500 }
      );
    }

    const metaPayload: Record<string, unknown> = {};
    if (avatarUrl) metaPayload.avatar = avatarUrl;
    if (guildId) metaPayload.guildId = guildId;
    if (channelName) metaPayload.channelName = channelName;

    const at = new AccessToken(apiKey, apiSecret, {
      identity: participantIdentity,
      name: displayName || undefined,
      metadata: Object.keys(metaPayload).length > 0 ? JSON.stringify(metaPayload) : undefined,
      ttl: '4h', // TTL curto de 4 horas para máxima segurança
    });

    at.addGrant({
      room: livekitRoom,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
    });

    const token = await at.toJwt();
    const livekitUrl = resolveServerUrl(req);

    return NextResponse.json(
      {
        token,
        identity: participantIdentity,
        room: livekitRoom,
        channelId: safeChannelId,
        serverUrl: livekitUrl,
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, private',
          'Pragma': 'no-cache',
        },
      }
    );
  } catch {
    return NextResponse.json(
      { error: 'Payload JSON inválido.' },
      { status: 400 }
    );
  }
}