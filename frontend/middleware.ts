import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export const ADMIN_SECRET_PATH = '/admin2903';
export const ADMIN_COOKIE_NAME = 'ecolive_admin_session';
export const ADMIN_COOKIE_VALUE = 'ecolive_auth_2903_authenticated';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Rota secreta de autenticacao: /admin2903
  // O admin acessa essa rota (salva em seus favoritos). Ela grava o cookie de 30 dias
  // e redireciona para /monitor, exibindo /monitor na barra de enderecos.
  if (pathname === ADMIN_SECRET_PATH || pathname === '/admin2903/') {
    const url = request.nextUrl.clone();
    url.pathname = '/monitor';
    const response = NextResponse.redirect(url);

    const isHttps = request.headers.get('x-forwarded-proto') === 'https' || request.url.startsWith('https://');

    response.cookies.set({
      name: ADMIN_COOKIE_NAME,
      value: ADMIN_COOKIE_VALUE,
      httpOnly: true,
      path: '/',
      maxAge: 60 * 60 * 24 * 30, // 30 dias de sessao
      sameSite: 'lax',
      secure: isHttps,
    });

    return response;
  }

  // 2. Protecao de acesso direto a /monitor:
  // Se alguem tentar acessar /monitor diretamente sem o cookie gravado por /admin2903,
  // sera imediatamente redirecionado para a pagina inicial (/), impedindo que qualquer
  // pessoa que veja a URL em live consiga abri-la.
  if (pathname === '/monitor' || pathname.startsWith('/monitor/')) {
    const authCookie = request.cookies.get(ADMIN_COOKIE_NAME)?.value;
    if (authCookie !== ADMIN_COOKIE_VALUE) {
      const url = request.nextUrl.clone();
      url.pathname = '/';
      return NextResponse.redirect(url);
    }
  }

  // 3. Protecao das APIs administrativas (/api/admin/*)
  // Apenas /api/admin/report-blocked e /api/admin/logout sao liberadas publicamente
  if (pathname.startsWith('/api/admin/')) {
    if (pathname !== '/api/admin/report-blocked' && pathname !== '/api/admin/logout') {
      const authCookie = request.cookies.get(ADMIN_COOKIE_NAME)?.value;
      if (authCookie !== ADMIN_COOKIE_VALUE) {
        return NextResponse.json({ error: 'Acesso restrito.' }, { status: 401 });
      }
    }
  }

  // 4. Rota legada /admin: redireciona para / para nao expor informacoes
  if (pathname === '/admin' || pathname === '/admin/') {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin2903', '/admin2903/', '/monitor', '/monitor/:path*', '/admin', '/admin/', '/api/admin/:path*'],
};
