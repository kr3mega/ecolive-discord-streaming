import { IngressClient, IngressInput } from 'livekit-server-sdk';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const channelId = body.channelId || body.room;
    const rawUserId = body.userId || body.username;
    const displayName = body.name || rawUserId;

    if (!channelId || !rawUserId) {
      return NextResponse.json(
        { error: 'Campos "channelId" e "userId" são obrigatórios no JSON.' },
        { status: 400 }
      );
    }

    const cleanId = rawUserId.replace(/^(user_|obs_)/, '');
    const participantIdentity = `obs_${cleanId}`;

    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const livekitInternalUrl = 'http://127.0.0.1:7880';

    if (!apiKey || !apiSecret) {
      return NextResponse.json(
        { error: 'Credenciais do LiveKit não configuradas no servidor.' },
        { status: 500 }
      );
    }

    // Inicializa o cliente oficial de Ingress do LiveKit
    const client = new IngressClient(livekitInternalUrl, apiKey, apiSecret);

    // Cria a sessão de ingestão WHIP com bypass de transcodificação (Passthrough 120 FPS)
    const info = await client.createIngress(IngressInput.WHIP_INPUT, {
      name: `obs-${cleanId}`,
      roomName: channelId,
      participantIdentity,
      participantName: displayName,
      bypassTranscoding: true, // ⚡ Modo Passthrough: zero transcodificação na CPU, preserva 120 FPS nativos da GPU
    });

    // Se estiver em ambiente local, a URL é a porta 8085
    const whipServerUrl = info.url || 'http://127.0.0.1:8085/w';

    return NextResponse.json(
      {
        serverUrl: whipServerUrl,
        streamKey: info.streamKey,
        whipEndpoint: `${whipServerUrl}/${info.streamKey}`,
        channelId,
        participantIdentity,
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, private',
          'Pragma': 'no-cache',
        },
      }
    );
  } catch (error) {
    console.error('Erro ao gerar sessão Ingress WHIP:', error);
    return NextResponse.json(
      { error: 'Falha ao provisionar endpoint WHIP para o OBS Studio.' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const channelId = searchParams.get('channelId') || searchParams.get('room');
  const rawUserId = searchParams.get('userId') || searchParams.get('username');
  const displayName = searchParams.get('name') || rawUserId;

  if (!channelId || !rawUserId) {
    return NextResponse.json(
      { error: 'Parâmetros "channelId" e "userId" são obrigatórios.' },
      { status: 400 }
    );
  }

  const cleanId = rawUserId.replace(/^(user_|obs_)/, '');
  const participantIdentity = `obs_${cleanId}`;

  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const livekitInternalUrl = 'http://127.0.0.1:7880';

  if (!apiKey || !apiSecret) {
    return NextResponse.json(
      { error: 'Credenciais do LiveKit não configuradas no servidor.' },
      { status: 500 }
    );
  }

  try {
    const client = new IngressClient(livekitInternalUrl, apiKey, apiSecret);
    const info = await client.createIngress(IngressInput.WHIP_INPUT, {
      name: `obs-${cleanId}`,
      roomName: channelId,
      participantIdentity,
      participantName: displayName || undefined,
      bypassTranscoding: true,
    });

    const whipServerUrl = info.url || 'http://127.0.0.1:8085/w';

    return NextResponse.json(
      {
        serverUrl: whipServerUrl,
        streamKey: info.streamKey,
        whipEndpoint: `${whipServerUrl}/${info.streamKey}`,
        channelId,
        participantIdentity,
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, private',
          'Pragma': 'no-cache',
        },
      }
    );
  } catch (error) {
    console.error('Erro ao gerar sessão Ingress WHIP (GET):', error);
    return NextResponse.json(
      { error: 'Falha ao provisionar endpoint WHIP para o OBS Studio.' },
      { status: 500 }
    );
  }
}
