'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Room,
  RoomEvent,
  RemoteTrackPublication,
  Track,
  VideoQuality,
  VideoPreset,
  LocalVideoTrack,
  Participant,
} from 'livekit-client';
import { patchUrlMappings } from '@discord/embedded-app-sdk';

// 🛡️ Contorna a CSP do Discord Activity Proxy mapeando chamadas externas do LiveKit
// ATENÇÃO: Só deve interceptar o fetch/WebSocket se estiver REALMENTE dentro do iframe do Discord (*.discordsays.com)
if (
  typeof window !== 'undefined' &&
  (window.location.hostname.includes('discordsays.com') ||
   window.location.hostname.includes('discord.com'))
) {
  try {
    patchUrlMappings([
      {
        prefix: '/livekit',
        target: 'seasonal-specialized-butterfly-jake.trycloudflare.com',
      },
    ]);
  } catch (err) {
    console.warn('patchUrlMappings inicializado fora do contexto de iframe do Discord:', err);
  }
}
// 🔬 Simulador de Amigo Externo (sem atalhos locais de LAN)
if (typeof window !== 'undefined') {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('simulate_external') === 'true' || urlParams.get('simular_externo') === 'true') {
    console.warn('🔬 [Simulador] Modo Amigo Externo ATIVADO. Bloqueando candidatos locais de LAN para simular conexão externa via operadora.');

    const rtcProto = window.RTCPeerConnection.prototype as any;
    const originalSetRemoteDescription = rtcProto.setRemoteDescription;
    rtcProto.setRemoteDescription = function (description: any, ...args: any[]) {
      if (description && description.sdp) {
        const filteredLines = description.sdp.split('\r\n').filter((line: string) => {
          if (line.startsWith('a=candidate:')) {
            if (
              line.includes(' 127.0.0.1 ') ||
              line.includes(' 192.168.') ||
              line.includes(' 172.19.') ||
              line.includes(' 172.30.') ||
              line.includes(' 172.25.') ||
              line.includes('.local ')
            ) {
              console.log('[Simulador Externo] Removido candidato de LAN do SDP:', line);
              return false;
            }
          }
          return true;
        });
        description = new RTCSessionDescription({
          type: description.type,
          sdp: filteredLines.join('\r\n'),
        });
      }
      return originalSetRemoteDescription.apply(this, [description, ...args]);
    };

    const originalAddIceCandidate = rtcProto.addIceCandidate;
    rtcProto.addIceCandidate = function (candidate?: any, ...args: any[]) {
      if (candidate) {
        const candStr = typeof candidate === 'string' ? candidate : (candidate.candidate || '');
        if (
          candStr.includes(' 127.0.0.1 ') ||
          candStr.includes(' 192.168.') ||
          candStr.includes(' 172.19.') ||
          candStr.includes(' 172.30.') ||
          candStr.includes(' 172.25.') ||
          candStr.includes('.local ')
        ) {
          console.log('[Simulador Externo] Bloqueado candidato de LAN:', candStr);
          return Promise.resolve();
        }
      }
      return originalAddIceCandidate.apply(this, [candidate, ...args]);
    };
  }
}


export interface StreamFeed {
  participantIdentity: string;
  participantName?: string;
  publication: RemoteTrackPublication;
  participant?: Participant;
  isObs: boolean;
}

// 🎮 Presets de Simulcast otimizados para jogos e telas fluidas
export const GAME_SIMULCAST_PRESETS: VideoPreset[] = [
  new VideoPreset(640, 360, 600_000, 30),     // 360p @ 30fps (economia máxima)
  new VideoPreset(1280, 720, 2_500_000, 60),  // 720p @ 60fps (equilibrado)
  new VideoPreset(1920, 1080, 6_000_000, 60), // 1080p @ 60fps (qualidade máxima)
];

export function useLiveKit() {
  const [isConnected, setIsConnected] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [remoteFeeds, setRemoteFeeds] = useState<StreamFeed[]>([]);
  const [currentIdentity, setCurrentIdentity] = useState<string>('');
  const [currentRoom, setCurrentRoom] = useState<string>('');
  const [localScreenTrack, setLocalScreenTrack] = useState<LocalVideoTrack | null>(null);

  const roomRef = useRef<Room | null>(null);
  const connectingRef = useRef(false);

  // Conectar ao canal do Discord via LiveKit
  const connect = useCallback(async (channelId: string, userId: string, mode: 'web' | 'obs' = 'web', displayName?: string, avatarUrl?: string) => {
    if (connectingRef.current || roomRef.current) return;
    connectingRef.current = true;

    try {
      const queryParams = new URLSearchParams({
        channelId,
        userId,
        mode,
        ...(displayName ? { name: displayName } : {}),
        ...(avatarUrl ? { avatar: avatarUrl } : {}),
      });

      const res = await fetch(`/api/token?${queryParams.toString()}`);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Falha ao obter token de acesso');
      }

      const { token, identity, room: roomName, serverUrl } = await res.json();
      setCurrentIdentity(identity);
      setCurrentRoom(roomName);

      // Instanciação da sala com STUN/TURN de alta compatibilidade para furar barreiras de operadora
      const defaultIceServers: RTCIceServer[] = [
        {
          urls: [
            'stun:stun.l.google.com:19302',
            'stun:stun1.l.google.com:19302',
            'stun:openrelay.metered.ca:80',
          ],
        },
        {
          urls: [
            'turn:openrelay.metered.ca:80',
            'turn:openrelay.metered.ca:443',
            'turn:openrelay.metered.ca:443?transport=tcp',
          ],
          username: 'openrelayproject',
          credential: 'openrelayproject',
        },
      ];

      const room = new Room({
        adaptiveStream: false,
        dynacast: true,
      });

      // Trilha remota inscrita
      room.on(RoomEvent.TrackSubscribed, (track, publication, participant: Participant) => {
        if (track.kind === Track.Kind.Audio) {
          // Pausa downstream de áudio no SFU até o usuário decidir assistir
          (publication as RemoteTrackPublication).setEnabled(false);
        }

        if (track.kind === Track.Kind.Video) {
          const remotePub = publication as RemoteTrackPublication;
          // Pausa downstream de vídeo no SFU imediatamente (0 Mbps) até o usuário clicar em Assistir
          remotePub.setEnabled(false);

          const isObs = participant.identity.startsWith('obs_');
          setRemoteFeeds((prev) => [
            ...prev.filter((f) => f.publication.trackSid !== publication.trackSid),
            {
              participantIdentity: participant.identity,
              participantName: participant.name,
              publication: remotePub,
              participant,
              isObs,
            },
          ]);
        }
      });

      // Trilha desinscrita
      room.on(RoomEvent.TrackUnsubscribed, (_, publication) => {
        setRemoteFeeds((prev) => prev.filter((f) => f.publication.trackSid !== publication.trackSid));
      });

      // Trilha despublicada pelo streamer
      room.on(RoomEvent.TrackUnpublished, (publication) => {
        setRemoteFeeds((prev) => prev.filter((f) => f.publication.trackSid !== publication.trackSid));
      });

      // Participante desconectado -> remove feeds do participante
      room.on(RoomEvent.ParticipantDisconnected, (participant) => {
        setRemoteFeeds((prev) => prev.filter((f) => f.participantIdentity !== participant.identity));
      });

      // Desconexão da sala
      room.on(RoomEvent.Disconnected, () => {
        setIsConnected(false);
        setIsScreenSharing(false);
        setLocalScreenTrack(null);
        setRemoteFeeds([]);
      });

      // Se estiver rodando dentro do iframe do Discord (*.discordsays.com),
      // direcionamos a conexão para o proxy mapeado /livekit na mesma origem para contornar a CSP
      let targetUrl = serverUrl || 'ws://127.0.0.1:7880';
      if (
        typeof window !== 'undefined' &&
        (window.location.hostname.includes('discordsays.com') ||
         window.location.hostname.includes('discord.com'))
      ) {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        targetUrl = `${protocol}//${window.location.host}/livekit`;
      }

      await room.connect(targetUrl, token, {
        rtcConfig: {
          iceServers: defaultIceServers,
        },
      });
      roomRef.current = room;
      setIsConnected(true);
    } finally {
      connectingRef.current = false;
    }
  }, []);

  const disconnect = useCallback(() => {
    if (roomRef.current) {
      roomRef.current.disconnect();
      roomRef.current = null;
    }
    setIsConnected(false);
    setIsScreenSharing(false);
    setLocalScreenTrack(null);
    setRemoteFeeds([]);
  }, []);

  // Modalidade 1: PlayWeb Casual (Nativo no Iframe via navigator.mediaDevices.getDisplayMedia)
  const toggleScreenShare = useCallback(async () => {
    if (!roomRef.current) return;

    if (isScreenSharing) {
      try {
        await roomRef.current.localParticipant.setScreenShareEnabled(false);
      } finally {
        setIsScreenSharing(false);
        setLocalScreenTrack(null);
      }
    } else {
      try {
        const pub = await roomRef.current.localParticipant.setScreenShareEnabled(
          true,
          {
            audio: true,
            systemAudio: 'include',
            contentHint: 'motion',
            selfBrowserSurface: 'exclude',
            video: {
              displaySurface: 'monitor',
            },
            resolution: {
              width: 1920,
              height: 1080,
              frameRate: 60,
            },
          },
          {
            simulcast: true,
            videoCodec: 'vp8',
            videoEncoding: {
              maxBitrate: 6_000_000,
              maxFramerate: 60,
              // @ts-expect-error - flag avançada do Chromium para priorizar FPS sobre resolução em gargalos
              degradationPreference: 'maintain-framerate',
            },
            videoSimulcastLayers: GAME_SIMULCAST_PRESETS,
          }
        );

        if (pub && pub.track instanceof LocalVideoTrack) {
          const mediaTrack = pub.track.mediaStreamTrack;
          // Forçar prioridade de movimento (evita que o Chromium limite a 15fps)
          mediaTrack.contentHint = 'motion';

          try {
            await mediaTrack.applyConstraints({
              frameRate: { ideal: 60, min: 30, max: 60 },
            });
          } catch (err) {
            console.warn('applyConstraints para 60fps não suportado nativamente, mantendo padrão:', err);
          }

          // Injetar preferências no RTCRtpSender para o Chromium do Discord/Chrome não descartar frames
          try {
            const sender = pub.track.sender;
            if (sender) {
              const params = sender.getParameters();
              if (params && params.encodings) {
                params.encodings.forEach((enc) => {
                  enc.maxFramerate = 60;
                });
                params.degradationPreference = 'maintain-framerate';
                await sender.setParameters(params);
              }
            }
          } catch (err) {
            console.warn('Ajuste de parâmetros do sender ignorado:', err);
          }

          setLocalScreenTrack(pub.track);

          // Tratar quando o usuário para o compartilhamento pela barra nativa do navegador
          pub.track.mediaStreamTrack.onended = () => {
            setIsScreenSharing(false);
            setLocalScreenTrack(null);
          };
        }

        setIsScreenSharing(true);
      } catch (error) {
        console.error('Erro ao iniciar compartilhamento de tela:', error);
        setIsScreenSharing(false);
        setLocalScreenTrack(null);
      }
    }
  }, [isScreenSharing]);

  const setQuality = useCallback((publication: RemoteTrackPublication, quality: VideoQuality) => {
    publication.setVideoQuality(quality);
  }, []);

  useEffect(() => {
    return () => {
      if (roomRef.current) {
        roomRef.current.disconnect();
      }
    };
  }, []);

  return {
    isConnected,
    isScreenSharing,
    remoteFeeds,
    currentIdentity,
    currentRoom,
    localScreenTrack,
    connect,
    disconnect,
    toggleScreenShare,
    setQuality,
  };
}