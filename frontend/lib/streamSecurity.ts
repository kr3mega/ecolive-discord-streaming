import { IngressClient, RoomServiceClient } from 'livekit-server-sdk';

/**
 * Encerra imediatamente a transmissão do OBS vinculada a um usuário e sala específicos.
 * - Desconecta forçadamente o participante obs_${cleanId} da sala LiveKit para cessar o streaming no ar.
 * - Preserva a Chave Permanente: move o Ingress para sala 'offline-${cleanId}' para não poluir a chamada,
 *   garantindo que a chave salva no OBS continue sempre válida.
 * - Apenas deleta o Ingress se deleteIngress for explicitamente true (ex: 'Redefinir Chave').
 */
export async function terminateObsStream(roomName?: string, rawCleanId?: string, deleteIngress: boolean = false) {
  if (!rawCleanId) return;

  const cleanId = rawCleanId.replace(/^(user_|obs_)/, '');
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const livekitUrl = process.env.LIVEKIT_URL || 'http://livekit:7880';

  if (!apiKey || !apiSecret) {
    console.warn('[Segurança EcoLive] Chaves de API do LiveKit não encontradas.');
    return;
  }

  const legacyCleanId = cleanId.substring(0, 16);
  const targetObsIdentity = `obs_${cleanId}`;
  const targetUserIdentity = `user_${cleanId}`;
  const targetObsLegacy = `obs_${legacyCleanId}`;
  const targetUserLegacy = `user_${legacyCleanId}`;
  const roomClient = new RoomServiceClient(livekitUrl, apiKey, apiSecret);

  // 1. Remove os participantes (tanto OBS quanto Web, incluindo identidades legadas) da sala no LiveKit Server
  try {
    if (roomName) {
      console.log(`[Segurança EcoLive] Interrompendo conexões de ${targetObsIdentity} e ${targetUserIdentity} na sala ${roomName}`);
      await Promise.allSettled([
        roomClient.removeParticipant(roomName, targetObsIdentity),
        roomClient.removeParticipant(roomName, targetUserIdentity),
        roomClient.removeParticipant(roomName, targetObsLegacy),
        roomClient.removeParticipant(roomName, targetUserLegacy),
      ]);
    } else {
      // Para mitigar amplificação de DoS e sobrecarga no daemon Twirp do LiveKit,
      // inspeciona apenas salas ativas com participantes conectados (máximo 10)
      const rooms = await roomClient.listRooms().catch(() => []);
      const activeRooms = rooms.filter((r) => r.numParticipants > 0).slice(0, 10);
      for (const r of activeRooms) {
        await Promise.allSettled([
          roomClient.removeParticipant(r.name, targetObsIdentity),
          roomClient.removeParticipant(r.name, targetUserIdentity),
          roomClient.removeParticipant(r.name, targetObsLegacy),
          roomClient.removeParticipant(r.name, targetUserLegacy),
        ]);
      }
    }
  } catch (err) {
    console.warn(`[Segurança EcoLive] Falha ao desconectar participantes:`, err);
  }

  // 2. Apenas deleta o Ingress se for uma redefinição explícita de chave ("Redefinir Chave")
  if (deleteIngress) {
    const legacyCleanId = cleanId.substring(0, 16);
    try {
      const ingressClient = new IngressClient(livekitUrl, apiKey, apiSecret);
      const ingresses = await ingressClient.listIngress().catch(() => []);
      for (const ing of ingresses) {
        if (
          ing.participantIdentity === targetObsIdentity ||
          ing.participantIdentity === `obs_${legacyCleanId}` ||
          ing.name === `obs-${cleanId}` ||
          ing.name === `obs-${legacyCleanId}` ||
          ing.participantIdentity === cleanId ||
          ing.participantIdentity === legacyCleanId
        ) {
          if (ing.ingressId) {
            console.log(`[Segurança EcoLive] Revogando e deletando Ingress ${ing.ingressId} de ${targetObsIdentity}`);
            await ingressClient.deleteIngress(ing.ingressId).catch(() => {});
          }
        }
      }
    } catch (err) {
      console.warn(`[Segurança EcoLive] Falha ao deletar Ingress para ${targetObsIdentity}:`, err);
    }
  } else {
    // Preserva a Chave Permanente: move o destino do Ingress para sala offline
    const legacyCleanId = cleanId.substring(0, 16);
    try {
      const ingressClient = new IngressClient(livekitUrl, apiKey, apiSecret);
      const ingresses = await ingressClient.listIngress().catch(() => []);
      for (const ing of ingresses) {
        if (
          (ing.participantIdentity === targetObsIdentity ||
            ing.participantIdentity === `obs_${legacyCleanId}` ||
            ing.name === `obs-${cleanId}` ||
            ing.name === `obs-${legacyCleanId}` ||
            ing.participantIdentity === cleanId ||
            ing.participantIdentity === legacyCleanId) &&
          ing.ingressId
        ) {
          await ingressClient.updateIngress(ing.ingressId, {
            name: `obs-${cleanId}`,
            roomName: `offline-${cleanId}`,
            participantIdentity: targetObsIdentity,
          }).catch(() => {});
        }
      }
    } catch (err) {
      console.warn(`[Segurança EcoLive] Falha ao mover Ingress de ${targetObsIdentity} para offline:`, err);
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
