import { AccessToken } from 'livekit-server-sdk';
import { NextRequest, NextResponse } from 'next/server';

function resolveServerUrl(req: NextRequest): string {
  // Se configurado no .env.local, prioriza a URL direta
  if (process.env.LIVEKIT_URL) {
    return process.env.LIVEKIT_URL;
  }

  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || '127.0.0.1';
  const hostname = host.split(':')[0];

  return `ws://${hostname}:7880`;
}

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  
  // Suporte a channelId (especificação) com fallback para room
  const channelId = searchParams.get('channelId') || searchParams.get('room');
  // Suporte a userId (especificação) com fallback para username
  const rawUserId = searchParams.get('userId') || searchParams.get('username');
  const mode = searchParams.get('mode') || 'web'; // 'web' (PlayWeb Casual) ou 'obs'
  const displayName = searchParams.get('name') || rawUserId;

  if (!channelId || !rawUserId) {
    return NextResponse.json(
      { error: 'Parâmetros "channelId" (ou "room") e "userId" (ou "username") são obrigatórios.' },
      { status: 400 }
    );
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
    const at = new AccessToken(apiKey, apiSecret, {
      identity: participantIdentity,
      name: displayName || undefined,
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

    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;

    if (!apiKey || !apiSecret) {
      return NextResponse.json(
        { error: 'Credenciais do LiveKit não configuradas no servidor.' },
        { status: 500 }
      );
    }

    const at = new AccessToken(apiKey, apiSecret, {
      identity: participantIdentity,
      name: displayName || undefined,
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