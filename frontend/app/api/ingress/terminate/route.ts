import { NextRequest, NextResponse } from 'next/server';
import { terminateObsStream, markUserAbsent } from '@/lib/streamSecurity';

export async function POST(req: NextRequest) {
  try {
    let channelId = '';
    let rawUserId = '';
    let isImmediate = false;
    let deleteIngress = true;

    const contentType = req.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      const body = await req.json().catch(() => ({}));
      channelId = body.channelId || body.room;
      rawUserId = body.userId || body.username || body.identity;
      isImmediate = body.immediate === true;
      deleteIngress = body.deleteIngress !== false;
    } else {
      const text = await req.text().catch(() => '');
      try {
        const body = JSON.parse(text);
        channelId = body.channelId || body.room;
        rawUserId = body.userId || body.username || body.identity;
        isImmediate = body.immediate === true;
        deleteIngress = body.deleteIngress !== false;
      } catch {
        const params = new URLSearchParams(text);
        channelId = params.get('channelId') || params.get('room') || '';
        rawUserId = params.get('userId') || params.get('username') || params.get('identity') || '';
        isImmediate = params.get('immediate') === 'true';
        deleteIngress = params.get('deleteIngress') !== 'false';
      }
    }

    if (!rawUserId) {
      return NextResponse.json(
        { error: 'Identificador "userId" é obrigatório.' },
        { status: 400 }
      );
    }

    const cleanId = rawUserId.replace(/^(user_|obs_)/, '');

    console.log(`[API Terminate] Encerrando stream ativo do participante obs_${cleanId} (sala: ${channelId || 'todas'}, deletarIngress: ${deleteIngress})...`);
    await terminateObsStream(channelId || undefined, cleanId, deleteIngress);

    return NextResponse.json({ success: true, terminated: `obs_${cleanId}`, keyDeleted: deleteIngress });
  } catch (error) {
    console.error('[API Terminate] Erro ao encerrar transmissão:', error);
    return NextResponse.json(
      { error: 'Falha ao encerrar transmissão OBS.' },
      { status: 500 }
    );
  }
}
