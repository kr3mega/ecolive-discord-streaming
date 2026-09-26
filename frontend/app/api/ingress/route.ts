import { IngressClient, IngressInfo, IngressInput } from 'livekit-server-sdk';
import { NextRequest, NextResponse } from 'next/server';
import { terminateObsStream } from '@/lib/streamSecurity';
import { guildRegistry } from '@/lib/guildRegistry';
import { checkGuildAccess } from '@/lib/guildStorage';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const channelId = body.channelId || body.room;
    const rawUserId = body.userId || body.username;
    const displayName = body.name || rawUserId;
    const avatarUrl = body.avatar || body.avatarUrl;
    const forceNew = body.forceNew === true;
    const guildId = body.guildId || undefined;
    const channelName = body.channelName || undefined;

    if (!channelId || !rawUserId) {
      return NextResponse.json(
        { error: 'Campos "channelId" e "userId" são obrigatórios no JSON.' },
        { status: 400 }
      );
    }

    if (guildId) {
      const access = checkGuildAccess(guildId);
      if (!access.authorized) {
        return NextResponse.json(
          { error: 'Acesso negado para este servidor Discord.', reason: access.reason },
          { status: 403 }
        );
      }
      guildRegistry.registerChannel(channelId, guildId, channelName);
    }

    const cleanId = rawUserId.replace(/^(user_|obs_)/, '');
    const participantIdentity = `obs_${cleanId}`;

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
    const whipServerUrl = process.env.WHIP_PUBLIC_URL || 'https://124-198-128-214.sslip.io/w';

    // 🛡️ Busca se o usuário já possui um Ingress permanente configurado (em qualquer sala)
    const ingresses = await client.listIngress().catch(() => []);
    const baseCleanId = cleanId.split('_')[0].toLowerCase();
    const userIngresses = ingresses.filter((ing) => {
      if (!ing.streamKey) return false;
      const ingPart = (ing.participantIdentity || '').replace(/^obs_/, '').toLowerCase();
      const ingName = (ing.name || '').replace(/^obs-/, '').toLowerCase();
      return (
        ing.participantIdentity === participantIdentity ||
        ing.name === `obs-${cleanId}` ||
        ingPart === cleanId.toLowerCase() ||
        (baseCleanId.length >= 3 && (ingPart.startsWith(baseCleanId) || ingName.startsWith(baseCleanId)))
      );
    });

    let primaryIngress: IngressInfo | null = userIngresses[0] || null;

    // Se o usuário solicitou explicitamente uma nova chave ("Redefinir Chave")
    if (forceNew && primaryIngress) {
      console.log(`[API Ingress] 🔄 Redefinindo chave pessoal de ${participantIdentity}. Parando transmissão e deletando Ingress anterior ${primaryIngress.ingressId}...`);
      // Primeiro remove o participante OBS da sala para que o Ingress não fique travado em estado ACTIVE
      await terminateObsStream(undefined, cleanId, false);
      // Agora deleta todos os ingresses deste usuário
      for (const ing of userIngresses) {
        if (ing.ingressId) {
          await client.deleteIngress(ing.ingressId).catch((e) => {
            console.warn(`[API Ingress] Falha ao deletar ingress ${ing.ingressId}:`, e);
          });
        }
      }
      primaryIngress = null;
    } else if (userIngresses.length > 1) {
      // Limpeza de eventuais duplicatas anteriores mantendo apenas a primária
      for (const dupe of userIngresses.slice(1)) {
        if (dupe.ingressId) {
          await client.deleteIngress(dupe.ingressId).catch(() => {});
        }
      }
    }

    if (primaryIngress && primaryIngress.streamKey) {
      // Se a sala do Ingress for diferente do canal de voz atual, atualiza dinamicamente o destino
      if (primaryIngress.roomName !== channelId) {
        console.log(
          `[API Ingress] 🔀 Atualizando sala do Ingress permanente de ${participantIdentity}: "${primaryIngress.roomName}" ➔ "${channelId}" (chave preservada)`
        );
        const ingressMetaObj: Record<string, unknown> = {};
        if (avatarUrl) ingressMetaObj.avatar = avatarUrl;
        if (guildId) ingressMetaObj.guildId = guildId;
        if (channelName) ingressMetaObj.channelName = channelName;
        const ingressMetadataStr = Object.keys(ingressMetaObj).length > 0 ? JSON.stringify(ingressMetaObj) : undefined;

        try {
          await client.updateIngress(primaryIngress.ingressId!, {
            name: `obs-${cleanId}`,
            roomName: channelId,
            participantIdentity,
            participantName: displayName,
            participantMetadata: ingressMetadataStr,
            bypassTranscoding: true,
          });
        } catch (updateErr) {
          console.warn('[API Ingress] Falha ao atualizar sala do Ingress existente:', updateErr);
        }
      } else {
        console.log(`[API Ingress] ♻️ Reutilizando chave permanente (${primaryIngress.ingressId}) para ${participantIdentity} na sala "${channelId}"`);
      }

      return NextResponse.json(
        {
          serverUrl: whipServerUrl,
          streamKey: primaryIngress.streamKey,
          whipEndpoint: `${whipServerUrl}/${primaryIngress.streamKey}`,
          channelId,
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

    // Se não existir, cria a nova chave de transmissão pessoal e permanente para o usuário
    const info = await client.createIngress(IngressInput.WHIP_INPUT, {
      name: `obs-${cleanId}`,
      roomName: channelId,
      participantIdentity,
      participantName: displayName,
      participantMetadata: ingressMetadataStr,
      bypassTranscoding: true,
    });

    console.log(`[API Ingress] 🚀 Chave de transmissão permanente provisionada (${info.ingressId}) para ${participantIdentity}`);

    return NextResponse.json(
      {
        serverUrl: whipServerUrl,
        streamKey: info.streamKey,
        whipEndpoint: `${whipServerUrl}/${info.streamKey}`,
        channelId,
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

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const channelId = searchParams.get('channelId') || searchParams.get('room');
  const rawUserId = searchParams.get('userId') || searchParams.get('username');
  const displayName = searchParams.get('name') || rawUserId;
  const avatarUrl = searchParams.get('avatar');
  const forceNew = searchParams.get('forceNew') === 'true';

  if (!channelId || !rawUserId) {
    return NextResponse.json(
      { error: 'Parâmetros "channelId" e "userId" são obrigatórios.' },
      { status: 400 }
    );
  }

  const cleanId = rawUserId.replace(/^(user_|obs_)/, '');
  const participantIdentity = `obs_${cleanId}`;

  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const livekitInternalUrl = process.env.LIVEKIT_URL || 'http://livekit:7880';

  if (!apiKey || !apiSecret) {
    return NextResponse.json(
      { error: 'Credenciais do LiveKit não configuradas no servidor.' },
      { status: 500 }
    );
  }

  try {
    const client = new IngressClient(livekitInternalUrl, apiKey, apiSecret);
    const whipServerUrl = process.env.WHIP_PUBLIC_URL || 'https://124-198-128-214.sslip.io/w';

    // 🛡️ Busca se o usuário já possui um Ingress permanente configurado (em qualquer sala)
    const ingresses = await client.listIngress().catch(() => []);
    const userIngresses = ingresses.filter(
      (ing) =>
        (ing.participantIdentity === participantIdentity || ing.name === `obs-${cleanId}`) &&
        Boolean(ing.streamKey)
    );

    let primaryIngress: IngressInfo | null = userIngresses[0] || null;

    if (forceNew && primaryIngress) {
      console.log(`[API Ingress GET] 🔄 Redefinindo chave pessoal de ${participantIdentity}. Deletando Ingress anterior ${primaryIngress.ingressId}...`);
      for (const ing of userIngresses) {
        if (ing.ingressId) {
          await client.deleteIngress(ing.ingressId).catch(() => {});
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
      if (primaryIngress.roomName !== channelId) {
        console.log(
          `[API Ingress GET] 🔀 Atualizando sala do Ingress permanente de ${participantIdentity}: "${primaryIngress.roomName}" ➔ "${channelId}" (chave preservada)`
        );
        try {
          await client.updateIngress(primaryIngress.ingressId!, {
            name: `obs-${cleanId}`,
            roomName: channelId,
            participantIdentity,
            participantName: displayName || undefined,
            participantMetadata: avatarUrl ? JSON.stringify({ avatar: avatarUrl }) : undefined,
            bypassTranscoding: true,
          });
        } catch (updateErr) {
          console.warn('[API Ingress GET] Falha ao atualizar sala do Ingress existente:', updateErr);
        }
      } else {
        console.log(`[API Ingress GET] ♻️ Reutilizando chave permanente (${primaryIngress.ingressId}) para ${participantIdentity} na sala "${channelId}"`);
      }

      return NextResponse.json(
        {
          serverUrl: whipServerUrl,
          streamKey: primaryIngress.streamKey,
          whipEndpoint: `${whipServerUrl}/${primaryIngress.streamKey}`,
          channelId,
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

    const info = await client.createIngress(IngressInput.WHIP_INPUT, {
      name: `obs-${cleanId}`,
      roomName: channelId,
      participantIdentity,
      participantName: displayName || undefined,
      participantMetadata: avatarUrl ? JSON.stringify({ avatar: avatarUrl }) : undefined,
      bypassTranscoding: true,
    });

    console.log(`[API Ingress GET] 🚀 Chave de transmissão permanente provisionada (${info.ingressId}) para ${participantIdentity}`);

    return NextResponse.json(
      {
        serverUrl: whipServerUrl,
        streamKey: info.streamKey,
        whipEndpoint: `${whipServerUrl}/${info.streamKey}`,
        channelId,
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
    console.error('Erro ao gerar sessão Ingress WHIP (GET):', error);
    return NextResponse.json(
      { error: 'Falha ao provisionar endpoint WHIP para o OBS Studio.' },
      { status: 500 }
    );
  }
}
