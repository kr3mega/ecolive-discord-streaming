import { AccessToken } from 'livekit-server-sdk';
import { NextRequest, NextResponse } from 'next/server';

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
  // PlayWeb Casual assume: user_[Discord_User_ID]
  // Modos OBS assumem: obs_[Discord_User_ID]
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
    });

    // Sala isolada por ID do Canal de Voz do Discord (channel_id)
    at.addGrant({
      room: channelId,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
    });

    const token = await at.toJwt();

    return NextResponse.json({
      token,
      identity: participantIdentity,
      room: channelId,
      serverUrl: process.env.NEXT_PUBLIC_LIVEKIT_URL || 'ws://127.0.0.1:7880',
    });
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
    });

    at.addGrant({
      room: channelId,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
    });

    const token = await at.toJwt();

    return NextResponse.json({
      token,
      identity: participantIdentity,
      room: channelId,
      serverUrl: process.env.NEXT_PUBLIC_LIVEKIT_URL || 'ws://127.0.0.1:7880',
    });
  } catch {
    return NextResponse.json(
      { error: 'Payload JSON inválido.' },
      { status: 400 }
    );
  }
}