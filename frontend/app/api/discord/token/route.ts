import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const code = body.code;

    if (!code) {
      return NextResponse.json({ error: 'Código de autorização não fornecido.' }, { status: 400 });
    }

    const clientId = process.env.DISCORD_CLIENT_ID || '1548180499934085150';
    const clientSecret = process.env.DISCORD_CLIENT_SECRET;

    if (!clientSecret) {
      return NextResponse.json(
        { error: 'DISCORD_CLIENT_SECRET não configurado no servidor.' },
        { status: 400 }
      );
    }

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
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      return NextResponse.json(
        { error: `Falha ao trocar código no Discord: ${errText}` },
        { status: tokenRes.status }
      );
    }

    const data = await tokenRes.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro interno ao autenticar no Discord' },
      { status: 500 }
    );
  }
}
