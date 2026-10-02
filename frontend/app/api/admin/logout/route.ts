import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE_NAME } from '@/lib/adminSession';
import { isAllowedOrigin } from '@/lib/originSecurity';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!isAllowedOrigin(req)) {
    return NextResponse.json(
      { error: 'Violação de segurança de origem (CSRF bloqueado).' },
      { status: 403 }
    );
  }

  const response = NextResponse.json({ success: true, message: 'Sessão administrativa encerrada com sucesso.' });
  const isHttps = req.headers.get('x-forwarded-proto') === 'https' || req.url.startsWith('https://');

  response.cookies.set({
    name: ADMIN_COOKIE_NAME,
    value: '',
    httpOnly: true,
    path: '/',
    maxAge: 0,
    sameSite: 'strict',
    secure: isHttps,
  });

  return response;
}
