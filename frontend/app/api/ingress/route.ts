import { IngressClient, IngressInfo, IngressInput } from 'livekit-server-sdk';
import { NextRequest, NextResponse } from 'next/server';
import { terminateObsStream } from '@/lib/streamSecurity';
import { guildRegistry } from '@/lib/guildRegistry';
import { checkGuildAccess } from '@/lib/guildStorage';
import { getUserSession } from '@/lib/userSession';
import { isAllowedOrigin, getSafeBaseUrl } from '@/lib/originSecurity';

export async function POST(req: NextRequest) {
  if (!isAllowedOrigin(req)) {
    return NextResponse.json(
      { error: 'Violação de segurança de origem (CSRF bloqueado).' },
      { status: 403 }
    );
  }

  try {
    const session = await getUserSession();
    if (!session) {
      console.warn(`[Security Alert] Tentativa de acesso não autenticado a /api/ingress a partir de ${req.headers.get('x-forwarded-for') || 'desconhecido'}`);
      return NextResponse.json(
        { error: 'Acesso não autorizado. Sessão criptográfica do Discord obrigatória.' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const channelId = body.channelId || body.room;
    const rawUserId = body.userId || body.username;
    const displayName = session.globalName || session.username;
    const avatarUrl = session.avatarUrl;
    const forceNew = body.forceNew === true;
    const rawChannelName = typeof body.channelName === 'string' ? body.channelName : undefined;
    const channelName = rawChannelName
      ? rawChannelName.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim().substring(0, 64)
      : undefined;

    if (!channelId) {
      return NextResponse.json(
        { error: 'Campo "channelId" é obrigatório no JSON.' },
        { status: 400 }
      );
    }

    const access = checkGuildAccess(session.guildId);
    if (!access.authorized) {
      return NextResponse.json(
        { error: 'Acesso negado para este servidor Discord.', reason: access.reason },
        { status: 403 }
      );
    }
    const guildId = session.guildId;
    const safeChannelId = channelId.trim().replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 64);
    if (!safeChannelId) {
      return NextResponse.json(
        { error: 'Parâmetro channelId inválido.' },
        { status: 400 }
      );
    }

    const existingGuild = guildRegistry.getGuildForChannel(safeChannelId);
    if (existingGuild && existingGuild !== guildId) {
      return NextResponse.json(
        { error: 'Acesso negado: Este canal de transmissão pertence a outra guilda.' },
        { status: 403 }
      );
    }

    const livekitRoom = safeChannelId.startsWith(`${guildId}_`) ? safeChannelId : `${guildId}_${safeChannelId}`;

    guildRegistry.registerChannel(safeChannelId, guildId, channelName);
    guildRegistry.registerChannel(livekitRoom, guildId, channelName);

    // Regra RLS Estrita: A identidade é OBRIGATORIAMENTE extraída da sessão criptografada
    const fullCleanId = session.username
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9_-]/g, '')
      .substring(0, 32);

    const legacyCleanId = fullCleanId.substring(0, 16);
    const cleanId = fullCleanId;
    const participantIdentity = `obs_${cleanId}`;

    const requestedCleanId = (rawUserId || '').replace(/^(user_|obs_)/, '').toLowerCase();
    if (
      requestedCleanId &&
      requestedCleanId !== cleanId &&
      requestedCleanId !== legacyCleanId &&
      !requestedCleanId.startsWith(cleanId) &&
      !requestedCleanId.startsWith(legacyCleanId)
    ) {
      console.error(`[Security Breach Blocked] Usuário "${session.username}" tentou obter chave de "${requestedCleanId}".`);
      return NextResponse.json(
        { error: 'Violação de segurança RLS: Acesso não autorizado aos dados de outro usuário.' },
        { status: 403 }
      );
    }

    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const livekitInternalUrl = process.env.LIVEKIT_URL || 'http://livekit:7880';

    if (!apiKey || !apiSecret) {
      return NextResponse.json(
        { error: 'Credenciais do LiveKit não configuradas no servidor.' },
        { status: 500 }
      );
    }

    const client = new IngressClient(livekitInternalUrl, apiKey, apiSecret);
    const baseUrl = getSafeBaseUrl(req);
    const whipServerUrl = process.env.WHIP_PUBLIC_URL || `${baseUrl}/w`;

    // Busca se o usuário já possui um Ingress permanente configurado (em qualquer sala)
    // Validação estrita por identidade exata e compatibilidade com chaves legadas de 16 caracteres
    const ingresses = await client.listIngress().catch(() => []);
    const userIngresses = ingresses.filter((ing) => {
      if (!ing.streamKey) return false;
      const ingPart = (ing.participantIdentity || '').replace(/^obs_/, '').toLowerCase();
      const ingName = (ing.name || '').replace(/^obs-/, '').toLowerCase();
      return (
        ing.participantIdentity === participantIdentity ||
        ing.participantIdentity === `obs_${legacyCleanId}` ||
        ing.name === `obs-${cleanId}` ||
        ing.name === `obs-${legacyCleanId}` ||
        ingPart === cleanId.toLowerCase() ||
        ingPart === legacyCleanId.toLowerCase() ||
        ingName === cleanId.toLowerCase() ||
        ingName === legacyCleanId.toLowerCase()
      );
    });

    let primaryIngress: IngressInfo | null = userIngresses[0] || null;

    // Se o usuário solicitou explicitamente uma nova chave ("Redefinir Chave")
    if (forceNew && primaryIngress) {
      console.log(`[API Ingress] Redefinindo chave pessoal de ${participantIdentity}. Parando transmissão e deletando Ingress anterior ${primaryIngress.ingressId}...`);
      await terminateObsStream(undefined, cleanId, false);
      for (const ing of userIngresses) {
        if (ing.ingressId) {
          await client.deleteIngress(ing.ingressId).catch((e) => {
            console.warn(`[API Ingress] Falha ao deletar ingress ${ing.ingressId}:`, e);
          });
        }
      }
      primaryIngress = null;
    } else if (userIngresses.length > 1) {
      for (const dupe of userIngresses.slice(1)) {
        if (dupe.ingressId) {
          await client.deleteIngress(dupe.ingressId).catch(() => {});
        }
      }
    }

    if (primaryIngress && primaryIngress.streamKey) {
      if (primaryIngress.roomName !== livekitRoom) {
        console.log(
          `[API Ingress] Atualizando sala do Ingress permanente de ${participantIdentity}: "${primaryIngress.roomName}" -> "${livekitRoom}" (chave preservada)`
        );
        const ingressMetaObj: Record<string, unknown> = {};
        if (avatarUrl) ingressMetaObj.avatar = avatarUrl;
        if (guildId) ingressMetaObj.guildId = guildId;
        if (channelName) ingressMetaObj.channelName = channelName;
        const ingressMetadataStr = Object.keys(ingressMetaObj).length > 0 ? JSON.stringify(ingressMetaObj) : undefined;

        try {
          await client.updateIngress(primaryIngress.ingressId!, {
            name: `obs-${cleanId}`,
            roomName: livekitRoom,
            participantIdentity,
            participantName: displayName,
            participantMetadata: ingressMetadataStr,
            bypassTranscoding: true,
          });
        } catch (updateErr) {
          console.warn('[API Ingress] Falha ao atualizar sala do Ingress existente:', updateErr);
        }
      } else {
        console.log(`[API Ingress] Reutilizando chave permanente (${primaryIngress.ingressId}) para ${participantIdentity} na sala "${livekitRoom}"`);
      }

      return NextResponse.json(
        {
          serverUrl: whipServerUrl,
          streamKey: primaryIngress.streamKey,
          whipEndpoint: `${whipServerUrl}/${primaryIngress.streamKey}`,
          channelId: safeChannelId,
          room: livekitRoom,
          participantIdentity,
          reused: true,
        },
        {
          headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate, private',
            'Pragma': 'no-cache',
          },
        }
      );
    }

    const ingressMetaObj: Record<string, unknown> = {};
    if (avatarUrl) ingressMetaObj.avatar = avatarUrl;
    if (guildId) ingressMetaObj.guildId = guildId;
    if (channelName) ingressMetaObj.channelName = channelName;
    const ingressMetadataStr = Object.keys(ingressMetaObj).length > 0 ? JSON.stringify(ingressMetaObj) : undefined;

    const info = await client.createIngress(IngressInput.WHIP_INPUT, {
      name: `obs-${cleanId}`,
      roomName: livekitRoom,
      participantIdentity,
      participantName: displayName,
      participantMetadata: ingressMetadataStr,
      bypassTranscoding: true,
    });

    console.log(`[API Ingress] Chave de transmissão permanente provisionada (${info.ingressId}) para ${participantIdentity}`);

    return NextResponse.json(
      {
        serverUrl: whipServerUrl,
        streamKey: info.streamKey,
        whipEndpoint: `${whipServerUrl}/${info.streamKey}`,
        channelId: safeChannelId,
        room: livekitRoom,
        participantIdentity,
        reused: false,
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, private',
          'Pragma': 'no-cache',
        },
      }
    );
  } catch (error) {
    console.error('Erro ao gerar sessão Ingress WHIP:', error);
    return NextResponse.json(
      { error: 'Falha ao provisionar endpoint WHIP para o OBS Studio.' },
      { status: 500 }
    );
  }
}
