import { NextRequest, NextResponse } from 'next/server';
import { checkGuildAccess } from '@/lib/guildStorage';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const guildId = req.nextUrl.searchParams.get('guildId');

  if (!guildId) {
    return NextResponse.json(
      { authorized: false, status: 'missing_id', reason: 'guildId não fornecido' },
      { status: 400 }
    );
  }

  const access = checkGuildAccess(guildId);

  return NextResponse.json(
    {
      authorized: access.authorized,
      status: access.status,
      guildName: access.guild?.name,
      reason: access.reason,
    },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    }
  );
}
