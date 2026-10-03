import { NextRequest, NextResponse } from 'next/server';
import { terminateObsStream } from '@/lib/streamSecurity';
import { getUserSession, decodeSession } from '@/lib/userSession';
import { checkGuildAccess } from '@/lib/guildStorage';
import { isAllowedOrigin } from '@/lib/originSecurity';

export const dynamic = 'force-dynamic';

interface TerminateRateLimit {
  attempts: number;
  lastAttempt: number;
}

const terminateAttempts = new Map<string, TerminateRateLimit>();
const MAX_TERMINATE_ATTEMPTS = 5;
const TERMINATE_WINDOW_MS = 30 * 1000; // 30 segundos

function getClientIp(req: NextRequest): string {
  const cfIp = req.headers.get('cf-connecting-ip');
  if (cfIp && cfIp.trim()) return cfIp.trim();
  const realIp = req.headers.get('x-real-ip');
  if (realIp && realIp.trim()) return realIp.trim();
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const ips = forwarded.split(',').map((ip) => ip.trim()).filter(Boolean);
    if (ips.length > 0) return ips[ips.length - 1];
  }
  return '127.0.0.1';
}

export async function POST(req: NextRequest) {
  if (!isAllowedOrigin(req)) {
    return NextResponse.json(
      { error: 'Origem não autorizada.' },
      { status: 403 }
    );
  }

  const clientIp = getClientIp(req);
  const now = Date.now();
  const rateKey = `${clientIp}`;
  const rate = terminateAttempts.get(rateKey);

  if (rate) {
    if (now - rate.lastAttempt < TERMINATE_WINDOW_MS) {
      if (rate.attempts >= MAX_TERMINATE_ATTEMPTS) {
        return NextResponse.json(
          { error: 'Muitas requisições. Aguarde alguns segundos.' },
          { status: 429 }
        );
      }
      rate.attempts++;
      rate.lastAttempt = now;
    } else {
      terminateAttempts.set(rateKey, { attempts: 1, lastAttempt: now });
    }
  } else {
    terminateAttempts.set(rateKey, { attempts: 1, lastAttempt: now });
  }

  try {
    const authHeader = req.headers.get('authorization');
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7).trim() : undefined;
    const session = (await getUserSession()) || (bearerToken ? decodeSession(bearerToken) : null);
    if (!session) {
      return NextResponse.json(
        { error: 'Acesso não autorizado.' },
        { status: 401 }
      );
    }

    const access = checkGuildAccess(session.guildId);
    if (!access.authorized) {
      return NextResponse.json(
        { error: 'Acesso restrito para esta guilda.' },
        { status: 403 }
      );
    }

    let channelId = '';
    let isImmediate = false;
    let deleteIngress = false;

    const contentType = req.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      const body = await req.json().catch(() => ({}));
      channelId = body.channelId || body.room || '';
      isImmediate = body.immediate === true;
      deleteIngress = body.deleteIngress === true || body.resetKey === true;
    } else {
      const text = await req.text().catch(() => '');
      try {
        const body = JSON.parse(text);
        channelId = body.channelId || body.room || '';
        isImmediate = body.immediate === true;
        deleteIngress = body.deleteIngress === true || body.resetKey === true;
      } catch {
        const params = new URLSearchParams(text);
        channelId = params.get('channelId') || params.get('room') || '';
        isImmediate = params.get('immediate') === 'true';
        deleteIngress = params.get('deleteIngress') === 'true' || params.get('resetKey') === 'true';
      }
    }

    const safeChannelId = channelId.trim().replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 64);
    if (!safeChannelId) {
      return NextResponse.json(
        { error: 'Parâmetro "channelId" é obrigatório para encerrar a transmissão.' },
        { status: 400 }
      );
    }

    // Regra RLS Estrita: Apenas o próprio usuário autenticado pode encerrar a sua transmissão
    const cleanId = session.username
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9_-]/g, '')
      .substring(0, 32);

    const livekitRoom = safeChannelId.startsWith(`${session.guildId}_`)
      ? safeChannelId
      : `${session.guildId}_${safeChannelId}`;

    console.log(`[API Terminate] Encerrando stream do participante autorizado obs_${cleanId} / ${session.id} (sala: ${livekitRoom}, resetKey: ${deleteIngress})...`);
    await terminateObsStream(livekitRoom, cleanId, deleteIngress, session.id);

    return NextResponse.json({ success: true, terminated: `obs_${cleanId}`, keyDeleted: deleteIngress });
  } catch (error) {
    console.error('[API Terminate] Erro ao encerrar transmissão:', error);
    return NextResponse.json(
      { error: 'Falha ao encerrar transmissão OBS.' },
      { status: 500 }
    );
  }
}
