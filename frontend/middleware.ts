import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyAdminSessionToken, ADMIN_COOKIE_NAME } from '@/lib/adminSession';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const normalizedPath = pathname.toLowerCase();

  const authCookie = request.cookies.get(ADMIN_COOKIE_NAME)?.value;
  const isAuthValid = await verifyAdminSessionToken(authCookie);

  // 1. Rota de Login Administrativo (/admin)
  if (normalizedPath === '/admin' || normalizedPath === '/admin/') {
    // Se já estiver validado criptograficamente, vai direto para o monitor
    if (isAuthValid) {
      const url = request.nextUrl.clone();
      url.pathname = '/monitor';
      return NextResponse.redirect(url);
    }
    const response = NextResponse.next();
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('Content-Security-Policy', "frame-ancestors 'none';");
    response.headers.set('X-Content-Type-Options', 'nosniff');
    return response;
  }

  // 2. Proteção do Painel de Monitoramento (/monitor)
  if (normalizedPath === '/monitor' || normalizedPath.startsWith('/monitor/')) {
    if (!isAuthValid) {
      const url = request.nextUrl.clone();
      url.pathname = '/admin';
      return NextResponse.redirect(url);
    }
    const response = NextResponse.next();
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('Content-Security-Policy', "frame-ancestors 'none';");
    response.headers.set('X-Content-Type-Options', 'nosniff');
    return response;
  }

  // 3. Proteção das APIs Administrativas (/api/admin/*)
  if (normalizedPath.startsWith('/api/admin/')) {
    // Permitir endpoints públicos/irrestritos de login e reporte de bloqueio
    if (normalizedPath === '/api/admin/login' || normalizedPath === '/api/admin/report-blocked') {
      const response = NextResponse.next();
      response.headers.set('X-Content-Type-Options', 'nosniff');
      return response;
    }

    if (!isAuthValid) {
      console.warn(`[Security Alert] Tentativa de acesso não autorizado à rota administrativa: ${pathname} a partir de ${request.headers.get('x-forwarded-for') || 'desconhecido'}`);
      return NextResponse.json(
        { error: 'Acesso não autorizado. Autenticação criptográfica de administrador obrigatória.' },
        { status: 401 }
      );
    }
    const response = NextResponse.next();
    response.headers.set('X-Content-Type-Options', 'nosniff');
    return response;
  }

  const response = NextResponse.next();
  response.headers.set('X-Content-Type-Options', 'nosniff');
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
