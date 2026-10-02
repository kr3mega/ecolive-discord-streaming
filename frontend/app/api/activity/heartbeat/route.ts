import { NextRequest, NextResponse } from 'next/server';
import { recordHeartbeat } from '@/lib/streamSecurity';
import { getUserSession } from '@/lib/userSession';
import { checkGuildAccess } from '@/lib/guildStorage';
import { isAllowedOrigin } from '@/lib/originSecurity';

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
        { error: 'Acesso não autorizado. Sessão obrigatória para heartbeat.' },
        { status: 401 }
      );
    }

    const access = checkGuildAccess(session.guildId);
    if (!access.authorized) {
      return NextResponse.json(
        { error: 'Acesso negado para este servidor Discord.', reason: access.reason },
        { status: 403 }
      );
    }

    let channelId = '';
    const contentType = req.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const body = await req.json().catch(() => ({}));
      channelId = body.channelId || body.room || '';
    }

    const safeChannelId = channelId.trim().replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 64);

    const cleanId = session.username
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9_-]/g, '')
      .substring(0, 32);

    recordHeartbeat(cleanId);

    return NextResponse.json(
      {
        success: true,
        cleanId,
        channelId: safeChannelId,
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
