import { AccessToken } from 'livekit-server-sdk';
import { NextRequest, NextResponse } from 'next/server';
import { guildRegistry } from '@/lib/guildRegistry';
import { checkGuildAccess } from '@/lib/guildStorage';
import { getUserSession } from '@/lib/userSession';
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
      { error: 'Violação de segurança de origem (CSRF bloqueado).' },
      { status: 403 }
    );
  }

  const searchParams = req.nextUrl.searchParams;
  
  // Suporte a channelId (especificação) com fallback para room
  const channelId = searchParams.get('channelId') || searchParams.get('room');
  // Suporte a userId (especificação) com fallback para username
  const mode = searchParams.get('mode') || 'web'; // 'web' ou 'obs'
  const session = await getUserSession();
  const rawChannelName = searchParams.get('channelName');
  const channelName = rawChannelName
    ? rawChannelName.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim().substring(0, 64)
    : undefined;

  if (!channelId) {
    return NextResponse.json(
      { error: 'Parâmetro "channelId" (ou "room") é obrigatório.' },
      { status: 400 }
    );
  }

  // Blindagem de Segurança Obrigatória (Zero-Trust): Apenas sessões HMAC válidas recebem tokens WebRTC
  if (!session) {
    return NextResponse.json(
      { error: 'Acesso não autorizado. Sessão criptográfica do Discord obrigatória.' },
      { status: 401 }
    );
  }

  const guildId = session.guildId;
  const access = checkGuildAccess(guildId);
  if (!access.authorized) {
    return NextResponse.json(
      { error: 'Acesso negado para este servidor Discord.', reason: access.reason },
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
      { error: 'Violação de segurança de origem (CSRF bloqueado).' },
      { status: 403 }
    );
  }

  try {
    const session = await getUserSession();
    if (!session) {
      return NextResponse.json(
        { error: 'Acesso não autorizado. Sessão criptográfica do Discord obrigatória.' },
        { status: 401 }
      );
    }

    const body = await req.json();
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
        { error: 'Acesso negado para este servidor Discord.', reason: access.reason },
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