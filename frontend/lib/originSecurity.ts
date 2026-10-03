import { NextRequest } from 'next/server';

const ALLOWED_ORIGIN_PATTERNS = [
  /^https:\/\/[a-z0-9-]+\.discordsays\.com$/,
  /^https:\/\/(.*\.)?discord\.com$/,
  /^https:\/\/([a-z0-9-]+\.)?trycloudflare\.com$/,
  /^https:\/\/([a-z0-9-]+\.)?ngrok-free\.(dev|app)$/,
  /^https:\/\/([a-z0-9-]+\.)?ngrok\.app$/,
  /^https:\/\/stream\.ecolive\.com\.br$/,
  /^https:\/\/([a-z0-9-]+\.)?sslip\.io$/,
  /^http:\/\/localhost(:\d+)?$/,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/,
];

const ALLOWED_HOST_PATTERNS = [
  /^[a-z0-9-]+\.discordsays\.com(:\d+)?$/,
  /^([a-z0-9-]+\.)?discord\.com(:\d+)?$/,
  /^([a-z0-9-]+\.)?trycloudflare\.com(:\d+)?$/,
  /^([a-z0-9-]+\.)?ngrok-free\.(dev|app)(:\d+)?$/,
  /^([a-z0-9-]+\.)?ngrok\.app(:\d+)?$/,
  /^stream\.ecolive\.com\.br(:\d+)?$/,
  /^([a-z0-9-]+\.)?sslip\.io(:\d+)?$/,
  /^localhost(:\d+)?$/,
  /^127\.0\.0\.1(:\d+)?$/,
];

/**
 * Validação de origem da requisição.
 */
export function isAllowedOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  const secFetchSite = req.headers.get('sec-fetch-site');
  const referer = req.headers.get('referer');
  const safeHost = getSafeHost(req);

  // Requisições na mesma origem/site são seguras por definição
  if (secFetchSite === 'same-origin' || secFetchSite === 'same-site') {
    return true;
  }


  let candidateOrigin = origin;
  if (!candidateOrigin && referer) {
    try {
      candidateOrigin = new URL(referer).origin;
    } catch {}
  }

  if (candidateOrigin) {
    // 1. Validação com o domínio canônico configurado em ambiente
    const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
    if (appUrl) {
      try {
        const appOrigin = new URL(appUrl).origin;
        if (candidateOrigin === appOrigin) return true;
      } catch {}
    }

    // 2. Validação estrita contra o host seguro previamente verificado contra whitelist
    if (safeHost && (candidateOrigin === `https://${safeHost}` || candidateOrigin === `http://${safeHost}`)) {
      return true;
    }

    // 3. Validação contra padrões autorizados conhecidos
    return ALLOWED_ORIGIN_PATTERNS.some((pattern) => pattern.test(candidateOrigin!));
  }

  // Fail-closed em produção se não há nenhuma informação de origem ou referer rastreável
  const isAllowed = process.env.NODE_ENV !== 'production';
  if (!isAllowed) {
    console.warn(`[OriginSecurity Alert] Rejeitado por ausência de origem/referer autorizados. Path: ${req.nextUrl.pathname}, Origin: ${origin}, Referer: ${referer}, sec-fetch-site: ${secFetchSite}, SafeHost: ${safeHost}`);
  }
  return isAllowed;
}

/**
 * Resolve o host seguro da aplicação de forma canônica, prevenindo Host Header Injection / X-Forwarded-Host Spoofing.
 */
export function getSafeHost(req: NextRequest): string {
  const configuredUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (configuredUrl) {
    try {
      return new URL(configuredUrl).host;
    } catch {}
  }

  const rawForwarded = req.headers.get('x-forwarded-host');
  if (rawForwarded) {
    const candidate = rawForwarded.split(',')[0].trim().toLowerCase();
    if (ALLOWED_HOST_PATTERNS.some((pat) => pat.test(candidate))) {
      return candidate;
    }
  }

  const host = req.headers.get('host');
  if (host) {
    const candidate = host.trim().toLowerCase();
    if (ALLOWED_HOST_PATTERNS.some((pat) => pat.test(candidate))) {
      return candidate;
    }
  }

  return '127.0.0.1:3000';
}

/**
 * Resolve a URL base segura da aplicação (ex: https://dominio.com), protegida contra Host Poisoning.
 */
export function getSafeBaseUrl(req: NextRequest): string {
  const configuredUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (configuredUrl) {
    return configuredUrl.replace(/\/$/, '');
  }

  const host = getSafeHost(req);
  const protoHeader = req.headers.get('x-forwarded-proto');
  const isHttps = protoHeader === 'https' || (!host.includes('localhost') && !host.includes('127.0.0.1'));
  const proto = isHttps ? 'https' : 'http';

  return `${proto}://${host}`;
}
