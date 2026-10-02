import { WebhookReceiver } from 'livekit-server-sdk';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;

  if (!apiKey || !apiSecret) {
    return NextResponse.json(
      { error: 'Chaves de API do LiveKit não configuradas no servidor.' },
      { status: 500 }
    );
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return NextResponse.json(
      { error: 'Cabeçalho Authorization ausente no webhook.' },
      { status: 401 }
    );
  }

  const MAX_WEBHOOK_BODY_SIZE = 256 * 1024; // 256 KB
  const contentLength = req.headers.get('content-length');
  if (contentLength && parseInt(contentLength, 10) > MAX_WEBHOOK_BODY_SIZE) {
    return NextResponse.json(
      { error: 'Corpo da requisição excede o tamanho máximo permitido.' },
      { status: 413 }
    );
  }

  try {
    const rawBody = await req.text();
    if (rawBody.length > MAX_WEBHOOK_BODY_SIZE) {
      return NextResponse.json(
        { error: 'Corpo da requisição excede o tamanho máximo permitido.' },
        { status: 413 }
      );
    }
    const receiver = new WebhookReceiver(apiKey, apiSecret);
    const event = await receiver.receive(rawBody, authHeader);

    console.log(`[Webhook LiveKit] Evento recebido: ${event.event} | Sala: ${event.room?.name}`);

    // Notificação de saída de participante (apenas telemetria; não derruba o OBS por oscilação de rede)
    if (event.event === 'participant_left' && event.participant) {
      console.log(`[Webhook LiveKit] Participante ${event.participant.identity} desconectou da sala ${event.room?.name}`);
    }

    if (event.event === 'participant_joined' && event.participant) {
      console.log(`[Webhook LiveKit] Participante ${event.participant.identity} entrou na sala ${event.room?.name}`);
    }

    // Se a sala inteira encerrou
    if (event.event === 'room_finished' && event.room) {
      console.log(`[Webhook LiveKit] Sala ${event.room.name} finalizada.`);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Webhook LiveKit] Erro ao processar evento:', error);
    return NextResponse.json(
      { error: 'Falha ao processar evento de webhook' },
      { status: 400 }
    );
  }
}
