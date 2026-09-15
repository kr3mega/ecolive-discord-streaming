import { IngressClient, RoomServiceClient } from 'livekit-server-sdk';

/**
 * Encerra imediatamente a transmissão do OBS vinculada a um usuário e sala específicos.
 * - Desconecta forçadamente o participante obs_${cleanId} da sala LiveKit para cessar o streaming no ar.
 * - Preserva a Chave Permanente: move o Ingress para sala 'offline-${cleanId}' para não poluir a chamada,
 *   garantindo que a chave salva no OBS continue sempre válida.
 * - Apenas deleta o Ingress se deleteIngress for explicitamente true (ex: 'Redefinir Chave').
 */
export async function terminateObsStream(roomName?: string, cleanId?: string, deleteIngress: boolean = false) {
  if (!cleanId) return;

  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const livekitUrl = process.env.LIVEKIT_URL || 'http://livekit:7880';

  if (!apiKey || !apiSecret) {
    console.warn('[Segurança EcoLive] Chaves de API do LiveKit não encontradas.');
    return;
  }

  const targetObsIdentity = `obs_${cleanId}`;
  const roomClient = new RoomServiceClient(livekitUrl, apiKey, apiSecret);

  // 1. Remove o participante OBS da sala no LiveKit Server (interrompe o feed imediatamente)
  try {
    if (roomName) {
      console.log(`[Segurança EcoLive] 🛑 Interrompendo transmissão de ${targetObsIdentity} na sala ${roomName}`);
      await roomClient.removeParticipant(roomName, targetObsIdentity).catch(() => {});
    } else {
      const rooms = await roomClient.listRooms().catch(() => []);
      for (const r of rooms) {
        await roomClient.removeParticipant(r.name, targetObsIdentity).catch(() => {});
      }
    }
  } catch (err) {
    console.warn(`[Segurança EcoLive] Falha ao desconectar participante ${targetObsIdentity}:`, err);
  }

  // 2. Apenas deleta o Ingress se for uma redefinição explícita de chave ("Redefinir Chave")
  if (deleteIngress) {
    try {
      const ingressClient = new IngressClient(livekitUrl, apiKey, apiSecret);
      const ingresses = await ingressClient.listIngress().catch(() => []);
      for (const ing of ingresses) {
        if (
          ing.participantIdentity === targetObsIdentity ||
          ing.name === `obs-${cleanId}` ||
          ing.participantIdentity === cleanId
        ) {
          if (ing.ingressId) {
            console.log(`[Segurança EcoLive] 🛑 Revogando e deletando Ingress ${ing.ingressId} de ${targetObsIdentity}`);
            await ingressClient.deleteIngress(ing.ingressId).catch(() => {});
          }
        }
      }
    } catch (err) {
      console.warn(`[Segurança EcoLive] Falha ao deletar Ingress para ${targetObsIdentity}:`, err);
    }
  } else {
    // Preserva a Chave Permanente: move o destino do Ingress para sala offline
    try {
      const ingressClient = new IngressClient(livekitUrl, apiKey, apiSecret);
      const ingresses = await ingressClient.listIngress().catch(() => []);
      for (const ing of ingresses) {
        if (
          (ing.participantIdentity === targetObsIdentity ||
            ing.name === `obs-${cleanId}` ||
            ing.participantIdentity === cleanId) &&
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
