import { NextRequest, NextResponse } from 'next/server';
import { COOKIE_NAME } from '@/lib/userSession';
import { isAllowedOrigin } from '@/lib/originSecurity';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!isAllowedOrigin(req)) {
    return NextResponse.json(
      { error: 'Violação de segurança de origem (CSRF bloqueado).' },
      { status: 403 }
    );
  }

  const response = NextResponse.json({ success: true, message: 'Sessão encerrada com sucesso.' });

  // Expurgo completo de cookie compatível com contextos Web e iframes de terceiros (Discord Activity)
  response.cookies.set({
    name: COOKIE_NAME,
    value: '',
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    path: '/',
    maxAge: 0,
  });

  return response;
}
