import { NextRequest, NextResponse } from 'next/server';
import { guildRegistry } from '@/lib/guildRegistry';
import { isAllowedOrigin } from '@/lib/originSecurity';

const SNOWFLAKE_REGEX = /^\d{17,20}$/;

function getSafeIp(req: NextRequest): string {
  const cfIp = req.headers.get('cf-connecting-ip');
  if (cfIp && cfIp.trim()) return cfIp.trim();
  const realIp = req.headers.get('x-real-ip');
  if (realIp && realIp.trim()) return realIp.trim();
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const ips = forwarded.split(',').map((ip) => ip.trim()).filter(Boolean);
    if (ips.length > 0) return ips[ips.length - 1];
  }
  return 'desconhecido';
}

export async function POST(req: NextRequest) {
  if (!isAllowedOrigin(req)) {
    return NextResponse.json(
      { error: 'Violação de segurança de origem (CSRF bloqueado).' },
      { status: 403 }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const rawGuildId = typeof body.guildId === 'string' ? body.guildId.trim() : '';
    const rawChannelId = typeof body.channelId === 'string' ? body.channelId.trim() : undefined;

    // Validação estrita de padrão Snowflake do Discord para prevenir injeção de ruído
    if (!rawGuildId || !SNOWFLAKE_REGEX.test(rawGuildId)) {
      return NextResponse.json({ error: 'guildId deve ser um Snowflake válido do Discord.' }, { status: 400 });
    }

    const channelId = rawChannelId && SNOWFLAKE_REGEX.test(rawChannelId) ? rawChannelId : undefined;
    const ip = getSafeIp(req);

    guildRegistry.recordBlockedAttempt(rawGuildId, channelId, ip);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
