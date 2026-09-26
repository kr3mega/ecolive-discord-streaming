import { NextRequest, NextResponse } from 'next/server';
import { loadGuilds, upsertGuild, setGuildStatus, removeGuild } from '@/lib/guildStorage';

export const dynamic = 'force-dynamic';

export async function GET() {
  const guilds = loadGuilds();
  return NextResponse.json({ guilds }, {
    headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, name, owner, tag, badgeColor, status, monthlyPrice, paymentNotes } = body;

    if (!id || !name || !owner) {
      return NextResponse.json(
        { error: 'Campos id, name e owner são obrigatórios.' },
        { status: 400 }
      );
    }

    const saved = upsertGuild({
      id,
      name,
      owner,
      tag,
      badgeColor,
      status,
      monthlyPrice: Number(monthlyPrice) || 0,
      paymentNotes,
    });

    return NextResponse.json({ success: true, guild: saved });
  } catch (err) {
    return NextResponse.json({ error: 'Erro ao processar requisição.' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, status } = body;

    if (!id || !['active', 'paused', 'inactive'].includes(status)) {
      return NextResponse.json(
        { error: 'Campos id e status (active, paused, inactive) são obrigatórios.' },
        { status: 400 }
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
  const id = req.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'ID do servidor é obrigatório.' }, { status: 400 });
  }

  // Proteção: não permitir remover o servidor matriz principal
  if (id === '1506471002757140660') {
    return NextResponse.json({ error: 'O servidor matriz (Amigos Amor) não pode ser removido.' }, { status: 403 });
  }

  const ok = removeGuild(id);
  if (!ok) {
    return NextResponse.json({ error: 'Servidor não encontrado.' }, { status: 404 });
  }

  return NextResponse.json({ success: true, id });
}
