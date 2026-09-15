import { NextRequest, NextResponse } from 'next/server';
import { recordHeartbeat } from '@/lib/streamSecurity';

export async function POST(req: NextRequest) {
  try {
    let rawUserId = '';
    let channelId = '';

    const contentType = req.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const body = await req.json().catch(() => ({}));
      rawUserId = body.userId || body.username || body.identity || '';
      channelId = body.channelId || body.room || '';
    } else {
      const text = await req.text().catch(() => '');
      try {
        const body = JSON.parse(text);
        rawUserId = body.userId || body.username || body.identity || '';
        channelId = body.channelId || body.room || '';
      } catch {
        const params = new URLSearchParams(text);
        rawUserId = params.get('userId') || params.get('username') || params.get('identity') || '';
        channelId = params.get('channelId') || params.get('room') || '';
      }
    }

    if (!rawUserId) {
      return NextResponse.json(
        { error: 'Identificador "userId" é obrigatório no heartbeat.' },
        { status: 400 }
      );
    }

    const cleanId = rawUserId.replace(/^(user_|obs_)/, '');
    recordHeartbeat(cleanId);

    return NextResponse.json(
      {
        success: true,
        cleanId,
        channelId,
        timestamp: Date.now(),
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      }
    );
  } catch (error) {
    console.error('[API Heartbeat] Erro ao registrar heartbeat:', error);
    return NextResponse.json(
      { error: 'Falha ao registrar heartbeat da atividade.' },
      { status: 500 }
    );
  }
}
