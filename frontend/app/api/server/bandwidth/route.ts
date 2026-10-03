import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminSessionToken, ADMIN_COOKIE_NAME } from '@/lib/adminSession';
import { getBandwidthStats } from '@/lib/bandwidthHelper';

export const dynamic = 'force-dynamic';

export async function GET() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
  const isAuthorized = await verifyAdminSessionToken(sessionToken);

  if (!isAuthorized) {
    return NextResponse.json({ error: 'Acesso restrito.' }, { status: 401 });
  }

  const stats = getBandwidthStats();

  return NextResponse.json(stats, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}
