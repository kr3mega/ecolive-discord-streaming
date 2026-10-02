import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { loadGuilds, upsertGuild, setGuildStatus, removeGuild } from '@/lib/guildStorage';
import { verifyAdminSessionToken, ADMIN_COOKIE_NAME } from '@/lib/adminSession';
import { isAllowedOrigin } from '@/lib/originSecurity';

export const dynamic = 'force-dynamic';

async function checkAdminAuth(): Promise<boolean> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
  return await verifyAdminSessionToken(sessionToken);
}

export async function GET() {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Acesso restrito.' }, { status: 401 });
  }

  const guilds = loadGuilds();
  return NextResponse.json({ guilds }, {
    headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
  });
}

export async function POST(req: NextRequest) {
  if (!isAllowedOrigin(req)) {
    return NextResponse.json({ error: 'Violação de segurança de origem (CSRF bloqueado).' }, { status: 403 });
  }

  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Acesso restrito.' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { id, name, owner, tag, badgeColor, status, monthlyPrice, paymentNotes } = body;

    const rawId = typeof id === 'string' ? id.trim() : '';
    if (!rawId || !/^\d{17,20}$/.test(rawId)) {
      return NextResponse.json(
        { error: 'ID da guilda deve ser um Snowflake válido do Discord (17 a 20 dígitos).' },
        { status: 400 }
      );
    }

    if (!name || typeof name !== 'string' || !owner || typeof owner !== 'string') {
      return NextResponse.json(
        { error: 'Campos name e owner são obrigatórios e devem ser texto.' },
        { status: 400 }
      );
    }

    const safeStatus = ['active', 'paused', 'inactive'].includes(status) ? status : 'active';
    const safeBadgeColor = ['indigo', 'emerald', 'amber'].includes(badgeColor) ? badgeColor : 'emerald';

    const saved = upsertGuild({
      id: rawId,
      name: name.trim().substring(0, 100),
      owner: owner.trim().substring(0, 100),
      tag: typeof tag === 'string' ? tag.trim().substring(0, 50) : undefined,
      badgeColor: safeBadgeColor,
      status: safeStatus,
      monthlyPrice: Number(monthlyPrice) || 0,
      paymentNotes: typeof paymentNotes === 'string' ? paymentNotes.trim().substring(0, 500) : '',
    });

    return NextResponse.json({ success: true, guild: saved });
  } catch {
    return NextResponse.json({ error: 'Erro ao processar requisição.' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  if (!isAllowedOrigin(req)) {
    return NextResponse.json({ error: 'Violação de segurança de origem (CSRF bloqueado).' }, { status: 403 });
  }

  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Acesso restrito.' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { id, status } = body;

    if (!id || !['active', 'paused', 'inactive'].includes(status)) {
      return NextResponse.json(
        { error: 'Campos id e status (active, paused, inactive) são obrigatórios.' },
        { status: 400 }
      );
    }

    // Proteção de Disponibilidade: O servidor matriz nunca pode ser inativado ou pausado
    if (id === '1506471002757140660' && status !== 'active') {
      return NextResponse.json(
        { error: 'O servidor matriz (Amigos Amor) deve permanecer ativo permanentemente.' },
        { status: 403 }
      );
    }

    const ok = setGuildStatus(id, status);
    if (!ok) {
      return NextResponse.json({ error: 'Servidor não encontrado.' }, { status: 404 });
    }

    return NextResponse.json({ success: true, id, status });
  } catch {
    return NextResponse.json({ error: 'Erro ao atualizar status.' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!isAllowedOrigin(req)) {
    return NextResponse.json({ error: 'Violação de segurança de origem (CSRF bloqueado).' }, { status: 403 });
  }

  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Acesso restrito.' }, { status: 401 });
  }

  const id = req.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'ID do servidor é obrigatório.' }, { status: 400 });
  }

  if (id === '1506471002757140660') {
    return NextResponse.json({ error: 'O servidor matriz (Amigos Amor) não pode ser removido.' }, { status: 403 });
  }

  const ok = removeGuild(id);
  if (!ok) {
    return NextResponse.json({ error: 'Servidor não encontrado.' }, { status: 404 });
  }

  return NextResponse.json({ success: true, id });
}
