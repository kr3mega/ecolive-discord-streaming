import { IngressClient, RoomServiceClient } from 'livekit-server-sdk';

/**
 * Encerra imediatamente a transmissão do OBS vinculada a um usuário e sala específicos.
 * - Desconecta forçadamente o participante obs_${cleanId} da sala LiveKit para cessar o streaming no ar.
 * - Preserva a Chave Permanente: move o Ingress para sala 'offline-${cleanId}' para não poluir a chamada,
 *   garantindo que a chave salva no OBS continue sempre válida.
 * - Apenas deleta o Ingress se deleteIngress for explicitamente true (ex: 'Redefinir Chave').
 */
export async function terminateObsStream(
  roomName?: string,
  rawCleanId?: string,
  deleteIngress: boolean = false,
  userId?: string
) {
  if (!rawCleanId && !userId) return;

  const cleanId = (rawCleanId || '').replace(/^(user_|obs_)/, '');
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const livekitUrl = process.env.LIVEKIT_URL || 'http://livekit:7880';

  if (!apiKey || !apiSecret) {
    console.warn('[EcoLive] Chaves de API do LiveKit não encontradas.');
    return;
  }

  const legacyCleanId = cleanId.substring(0, 16);
  const targetIds = new Set<string>();
  if (cleanId) {
    targetIds.add(`obs_${cleanId}`);
    targetIds.add(`user_${cleanId}`);
    targetIds.add(`obs_${legacyCleanId}`);
    targetIds.add(`user_${legacyCleanId}`);
  }
  if (userId) {
    targetIds.add(`obs_${userId}`);
    targetIds.add(`user_${userId}`);
    targetIds.add(userId);
  }

  const roomClient = new RoomServiceClient(livekitUrl, apiKey, apiSecret);

  // 1. Remove os participantes (tanto OBS quanto Web, incluindo identidades legadas e snowflake ID) da sala
  try {
    if (roomName) {
      console.log(`[EcoLive] Interrompendo conexões de ${Array.from(targetIds).join(', ')} na sala ${roomName}`);
      await Promise.allSettled(
        Array.from(targetIds).map((id) => roomClient.removeParticipant(roomName, id))
      );
    } else {
      // Para mitigar amplificação de DoS e sobrecarga no daemon Twirp do LiveKit,
      // inspeciona apenas salas ativas com participantes conectados (máximo 10)
      const rooms = await roomClient.listRooms().catch(() => []);
      const activeRooms = rooms.filter((r) => r.numParticipants > 0).slice(0, 10);
      for (const r of activeRooms) {
        await Promise.allSettled(
          Array.from(targetIds).map((id) => roomClient.removeParticipant(r.name, id))
        );
      }
    }
  } catch (err) {
    console.warn(`[EcoLive] Falha ao desconectar participantes:`, err);
  }

  const matchesIngress = (ing: any) => {
    const part = (ing.participantIdentity || '').toLowerCase();
    const name = (ing.name || '').toLowerCase();
    for (const tid of targetIds) {
      const lowTid = tid.toLowerCase();
      const rawTid = lowTid.replace(/^(user_|obs_|-)/, '');
      if (
        part === lowTid ||
        part === `obs_${rawTid}` ||
        part === rawTid ||
        name === lowTid ||
        name === `obs-${rawTid}` ||
        name === rawTid
      ) {
        return true;
      }
    }
    return false;
  };

  // 2. Apenas deleta o Ingress se for uma redefinição explícita de chave ("Redefinir Chave")
  if (deleteIngress) {
    try {
      const ingressClient = new IngressClient(livekitUrl, apiKey, apiSecret);
      const ingresses = await ingressClient.listIngress().catch(() => []);
      for (const ing of ingresses) {
        if (matchesIngress(ing) && ing.ingressId) {
          console.log(`[EcoLive] Revogando e deletando Ingress ${ing.ingressId} de ${ing.participantIdentity}`);
          await ingressClient.deleteIngress(ing.ingressId).catch(() => {});
        }
      }
    } catch (err) {
      console.warn(`[EcoLive] Falha ao deletar Ingress:`, err);
    }
  } else {
    // Preserva a Chave Permanente: move o destino do Ingress para sala offline
    try {
      const ingressClient = new IngressClient(livekitUrl, apiKey, apiSecret);
      const ingresses = await ingressClient.listIngress().catch(() => []);
      for (const ing of ingresses) {
        if (matchesIngress(ing) && ing.ingressId) {
          const offlineRoom = `offline-${cleanId || userId}`;
          const currentObsId = ing.participantIdentity || `obs_${cleanId || userId}`;
          await ingressClient.updateIngress(ing.ingressId, {
            name: `obs-${cleanId || userId}`,
            roomName: offlineRoom,
            participantIdentity: currentObsId,
          }).catch(() => {});
        }
      }
    } catch (err) {
      console.warn(`[EcoLive] Falha ao mover Ingress para offline:`, err);
    }
  }
}

// Registro simples de presença para telemetria sem desconexão forçada
export function recordHeartbeat(cleanId: string) {
  // Mantido para compatibilidade com rotas existentes
}

export function markUserAbsent(cleanId: string) {
  // A transmissão agora pertence exclusivamente à call do Discord, não à aba do navegador.
}

export function cancelUserAbsence(cleanId: string) {
  // A transmissão agora pertence exclusivamente à call do Discord.
}

export async function checkOrphanStreams() {
  // Watchdog antigo desativado: sob a nova regra, a transmissão NUNCA é encerrada por temporizadores.
}
