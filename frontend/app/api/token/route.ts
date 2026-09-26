import { AccessToken } from 'livekit-server-sdk';
import { NextRequest, NextResponse } from 'next/server';
import { guildRegistry } from '@/lib/guildRegistry';
import { checkGuildAccess } from '@/lib/guildStorage';

function resolveServerUrl(req: NextRequest): string {
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || '127.0.0.1';
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
  const searchParams = req.nextUrl.searchParams;
  
  // Suporte a channelId (especificação) com fallback para room
  const channelId = searchParams.get('channelId') || searchParams.get('room');
  // Suporte a userId (especificação) com fallback para username
  const rawUserId = searchParams.get('userId') || searchParams.get('username');
  const mode = searchParams.get('mode') || 'web'; // 'web' (PlayWeb Casual) ou 'obs'
  const displayName = searchParams.get('name') || rawUserId;
  const avatarUrl = searchParams.get('avatar');
  const guildId = searchParams.get('guildId') || undefined;
  const channelName = searchParams.get('channelName') || undefined;

  if (!channelId || !rawUserId) {
    return NextResponse.json(
      { error: 'Parâmetros "channelId" (ou "room") e "userId" (ou "username") são obrigatórios.' },
      { status: 400 }
    );
  }

  if (guildId) {
    const access = checkGuildAccess(guildId);
    if (!access.authorized) {
      return NextResponse.json(
        { error: 'Acesso negado para este servidor Discord.', reason: access.reason },
        { status: 403 }
      );
    }
    guildRegistry.registerChannel(channelId, guildId, channelName);
  }

  // 🛡️ Regra da Especificação: Identidade Única
  const cleanId = rawUserId.replace(/^(user_|obs_)/, '');
  const participantIdentity = mode === 'obs' ? `obs_${cleanId}` : `user_${cleanId}`;

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

    // Sala isolada por ID do Canal de Voz do Discord (channel_id)
    at.addGrant({
      room: channelId,
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
        room: channelId,
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
  try {
    const body = await req.json();
    const channelId = body.channelId || body.room;
    const rawUserId = body.userId || body.username;
    const mode = body.mode || 'web';
    const displayName = body.name || rawUserId;

    if (!channelId || !rawUserId) {
      return NextResponse.json(
        { error: 'Campos "channelId" e "userId" são obrigatórios no JSON.' },
        { status: 400 }
      );
    }

    const cleanId = rawUserId.replace(/^(user_|obs_)/, '');
    const participantIdentity = mode === 'obs' ? `obs_${cleanId}` : `user_${cleanId}`;
    const guildId = body.guildId || undefined;
    const channelName = body.channelName || undefined;
    const avatarUrl = body.avatar || body.avatarUrl || undefined;

    if (guildId) {
      const access = checkGuildAccess(guildId);
      if (!access.authorized) {
        return NextResponse.json(
          { error: 'Acesso negado para este servidor Discord.', reason: access.reason },
          { status: 403 }
        );
      }
      guildRegistry.registerChannel(channelId, guildId, channelName);
    }

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
      room: channelId,
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
        room: channelId,
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