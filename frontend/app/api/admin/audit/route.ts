import { NextRequest, NextResponse } from 'next/server';
import { loadAuditDatabase, resetGuildAuditCycle } from '@/lib/guildAuditor';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const db = loadAuditDatabase();
    return NextResponse.json(db, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    });
  } catch (err) {
    return NextResponse.json({ error: 'Erro ao carregar auditoria de rede.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, guildId } = body;

    if (action === 'reset_cycle') {
      if (!guildId) {
        return NextResponse.json({ error: 'guildId é obrigatório.' }, { status: 400 });
      }

      const ok = resetGuildAuditCycle(guildId);
      if (!ok) {
        return NextResponse.json({ error: 'Servidor não encontrado na auditoria.' }, { status: 404 });
      }

      const updated = loadAuditDatabase();
      return NextResponse.json({ success: true, guildId, audit: updated });
    }

    return NextResponse.json({ error: 'Ação desconhecida.' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Erro ao processar requisição.' }, { status: 500 });
  }
}
