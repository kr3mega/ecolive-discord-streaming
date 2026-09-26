import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const url = req.nextUrl.clone();
  url.pathname = '/monitor';
  const response = NextResponse.redirect(url);

  const isHttps = req.headers.get('x-forwarded-proto') === 'https' || req.url.startsWith('https://');

  response.cookies.set({
    name: 'ecolive_admin_session',
    value: 'ecolive_auth_2903_authenticated',
    httpOnly: true,
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 dias
    sameSite: 'lax',
    secure: isHttps,
  });

  return response;
}
