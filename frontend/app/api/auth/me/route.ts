import { NextRequest, NextResponse } from 'next/server';
import { getUserSession } from '@/lib/userSession';
import { checkGuildAccess } from '@/lib/guildStorage';
import { isAllowedOrigin } from '@/lib/originSecurity';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!isAllowedOrigin(req)) {
    return NextResponse.json(
      { authenticated: false, error: 'Violação de segurança de origem (CSRF bloqueado).' },
      {
        status: 403,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, private',
          'Pragma': 'no-cache',
        },
      }
    );
  }

  const session = await getUserSession();
  if (!session) {
    return NextResponse.json(
      { authenticated: false },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, private',
          'Pragma': 'no-cache',
        },
      }
    );
  }

  const access = checkGuildAccess(session.guildId);
  return NextResponse.json(
    {
      authenticated: true,
      authorized: access.authorized,
      status: access.status,
      reason: access.reason,
      user: {
        id: session.id,
        username: session.username,
        displayName: session.globalName || session.username,
        avatarUrl: session.avatarUrl,
        guildId: session.guildId,
        guildName: session.guildName,
      },
    },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        'Pragma': 'no-cache',
      },
    }
  );
}
