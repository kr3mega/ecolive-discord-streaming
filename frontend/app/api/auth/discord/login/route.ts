import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getSafeBaseUrl } from '@/lib/originSecurity';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const clientId = process.env.DISCORD_CLIENT_ID || '1548180499934085150';
  
  // Resolução de URL canônica com validação rigorosa de host
  const baseUrl = getSafeBaseUrl(req);

  const redirectUri = `${baseUrl}/api/auth/discord/callback`;

  // Geração de token criptográfico State para proteção contra OAuth CSRF
  const state = crypto.randomBytes(24).toString('hex');
  const scope = encodeURIComponent('identify guilds');
  const encodedRedirect = encodeURIComponent(redirectUri);

  const discordAuthUrl = `https://discord.com/oauth2/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodedRedirect}&scope=${scope}&state=${state}&prompt=consent`;

  const res = NextResponse.redirect(discordAuthUrl);
  res.cookies.set({
    name: 'ecolive_oauth_state',
    value: state,
    httpOnly: true,
    secure: baseUrl.startsWith('https://'),
    sameSite: 'lax',
    path: '/',
    maxAge: 600, // 10 minutos
  });

  return res;
}
