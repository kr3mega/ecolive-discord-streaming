import { WebhookReceiver } from 'livekit-server-sdk';
import { NextRequest, NextResponse } from 'next/server';
import { terminateObsStream } from '@/lib/streamSecurity';

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

  try {
    const rawBody = await req.text();
    const receiver = new WebhookReceiver(apiKey, apiSecret);
    const event = await receiver.receive(rawBody, authHeader);

    console.log(`[Webhook LiveKit] Evento recebido: ${event.event} | Sala: ${event.room?.name}`);

    // Se o usuário (participante do canal) saiu da sala, encerra imediatamente o Ingress do OBS dele
    if (event.event === 'participant_left' && event.participant) {
      const identity = event.participant.identity;
      console.log(`[Webhook LiveKit] Participante ${identity} saiu da sala ${event.room?.name}`);
      if (identity && identity.startsWith('user_')) {
        const cleanId = identity.replace(/^user_/, '');
        console.log(`[Webhook LiveKit] 🛑 Usuário ${cleanId} saiu da call! Encerrando transmissão OBS vinculada...`);
        await terminateObsStream(event.room?.name, cleanId, true).catch((err) => {
          console.warn(`[Webhook LiveKit] Erro ao encerrar Ingress de ${cleanId}:`, err);
        });
      }
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
