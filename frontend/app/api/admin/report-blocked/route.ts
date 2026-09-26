import { NextRequest, NextResponse } from 'next/server';
import { guildRegistry } from '@/lib/guildRegistry';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const guildId = body.guildId || '';
    const channelId = body.channelId || undefined;
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || req.headers.get('x-real-ip') || 'desconhecido';

    if (guildId) {
      guildRegistry.recordBlockedAttempt(guildId, channelId, ip);
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
