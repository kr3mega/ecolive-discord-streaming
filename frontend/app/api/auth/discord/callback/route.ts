import { NextRequest, NextResponse } from 'next/server';
import { checkGuildAccess, ManagedGuild } from '@/lib/guildStorage';
import {
  UserSession,
  formatDiscordAvatarUrl,
  encodeSession,
  COOKIE_NAME,
  SESSION_DURATION_SECONDS,
} from '@/lib/userSession';
import { getSafeBaseUrl } from '@/lib/originSecurity';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const errorParam = req.nextUrl.searchParams.get('error');
  const stateParam = req.nextUrl.searchParams.get('state');
  const cookieState = req.cookies.get('ecolive_oauth_state')?.value;

  const baseUrl = getSafeBaseUrl(req);
  const redirectUri = `${baseUrl}/api/auth/discord/callback`;

  if (errorParam || !code) {
    const res = NextResponse.redirect(`${baseUrl}/?error=auth_denied`);
    res.cookies.delete('ecolive_oauth_state');
    return res;
  }

  // Validação estrita de State contra OAuth CSRF
  if (!stateParam || !cookieState || stateParam !== cookieState) {
    console.error('[OAuth2 Security Alert] Falha na validação do parâmetro state (CSRF detectado ou expirado).');
    const res = NextResponse.redirect(`${baseUrl}/?error=invalid_oauth_state`);
    res.cookies.delete('ecolive_oauth_state');
    return res;
  }

  const clientId = process.env.DISCORD_CLIENT_ID || '1548180499934085150';
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;

  if (!clientSecret) {
    console.error('[OAuth2 Callback] DISCORD_CLIENT_SECRET não configurado.');
    const res = NextResponse.redirect(`${baseUrl}/?error=server_configuration_error`);
    res.cookies.delete('ecolive_oauth_state');
    return res;
  }

  try {
    // 1. Troca o código de autorização por access_token
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error('[OAuth2 Token Exchange Failed]:', errText);
      return NextResponse.redirect(`${baseUrl}/?error=token_exchange_failed`);
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    // 2. Consulta perfil do usuário
    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!userRes.ok) {
      return NextResponse.redirect(`${baseUrl}/?error=fetch_user_failed`);
    }

    const userData = await userRes.json();

    // 3. Consulta servidores (guilds) do usuário
    const guildsRes = await fetch('https://discord.com/api/users/@me/guilds', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!guildsRes.ok) {
      return NextResponse.redirect(`${baseUrl}/?error=fetch_guilds_failed`);
    }

    const userGuilds: Array<{ id: string; name: string }> = await guildsRes.json();

    // 4. Validação na Whitelist: O usuário é membro de algum servidor ativo (ex: Amigos Amor)?
    let matchedGuild: ManagedGuild | undefined;
    if (Array.isArray(userGuilds)) {
      for (const ug of userGuilds) {
        const access = checkGuildAccess(ug.id);
        if (access.authorized && access.guild) {
          matchedGuild = access.guild;
          break;
        }
      }
    }

    if (!matchedGuild) {
      console.warn(`[OAuth2 Access Denied] Usuário "${userData.username}" (${userData.id}) não pertence a servidores autorizados.`);
      return NextResponse.redirect(`${baseUrl}/?error=unauthorized_guild`);
    }

    // 5. Emissão da Sessão Segura
    const sessionData: UserSession = {
      id: userData.id,
      username: userData.username,
      globalName: userData.global_name || userData.username,
      avatar: userData.avatar,
      avatarUrl: formatDiscordAvatarUrl(userData.id, userData.avatar),
      guildId: matchedGuild.id,
      guildName: matchedGuild.name,
      expiresAt: Date.now() + SESSION_DURATION_SECONDS * 1000,
    };

    const response = NextResponse.redirect(`${baseUrl}/`);
    response.cookies.set({
      name: COOKIE_NAME,
      value: encodeSession(sessionData),
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_DURATION_SECONDS,
    });
    response.cookies.delete('ecolive_oauth_state');

    return response;
  } catch (err) {
    console.error('[OAuth2 Callback Error]:', err);
    return NextResponse.redirect(`${baseUrl}/?error=internal_auth_error`);
  }
}
