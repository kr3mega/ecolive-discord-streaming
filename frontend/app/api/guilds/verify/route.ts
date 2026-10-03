import { NextRequest, NextResponse } from 'next/server';
import { checkGuildAccess } from '@/lib/guildStorage';
import { isAllowedOrigin } from '@/lib/originSecurity';

export const dynamic = 'force-dynamic';

const SNOWFLAKE_REGEX = /^\d{17,20}$/;

export async function GET(req: NextRequest) {
  if (!isAllowedOrigin(req)) {
    return NextResponse.json(
      { authorized: false, status: 'forbidden', reason: 'Violação de segurança de origem (CSRF bloqueado).' },
      { status: 403 }
    );
  }

  const rawGuildId = req.nextUrl.searchParams.get('guildId');

  if (!rawGuildId || !SNOWFLAKE_REGEX.test(rawGuildId.trim())) {
    return NextResponse.json(
      { authorized: false, status: 'invalid_id', reason: 'guildId deve ser um Snowflake válido do Discord.' },
      { status: 400 }
    );
  }

  const guildId = rawGuildId.trim();

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
