import { NextResponse } from 'next/server';
import { checkOrphanStreams } from '@/lib/streamSecurity';
import { getBandwidthStats } from '@/lib/bandwidthHelper';

export async function GET() {
  checkOrphanStreams().catch(() => {});
  const stats = getBandwidthStats();

  return NextResponse.json(stats, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}
