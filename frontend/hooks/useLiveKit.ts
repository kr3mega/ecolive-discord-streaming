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

export interface StreamFeed {
  participantIdentity: string;
  participantName?: string;
  publication: RemoteTrackPublication;
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
  const connect = useCallback(async (channelId: string, userId: string, mode: 'web' | 'obs' = 'web', displayName?: string) => {
    if (connectingRef.current || roomRef.current) return;
    connectingRef.current = true;

    try {
      const queryParams = new URLSearchParams({
        channelId,
        userId,
        mode,
        ...(displayName ? { name: displayName } : {}),
      });

      const res = await fetch(`/api/token?${queryParams.toString()}`);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Falha ao obter token de acesso');
      }

      const { token, identity, room: roomName, serverUrl } = await res.json();
      setCurrentIdentity(identity);
      setCurrentRoom(roomName);

      // Instanciação da sala com Dynacast habilitado (Economia de banda FinOps)
      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
      });

      // Trilha remota inscrita
      room.on(RoomEvent.TrackSubscribed, (track, publication, participant: Participant) => {
        if (track.kind === Track.Kind.Video) {
          const isObs = participant.identity.startsWith('obs_');
          setRemoteFeeds((prev) => [
            ...prev.filter((f) => f.publication.trackSid !== publication.trackSid),
            {
              participantIdentity: participant.identity,
              participantName: participant.name,
              publication: publication as RemoteTrackPublication,
              isObs,
            },
          ]);
        }
      });

      // Trilha desinscrita
      room.on(RoomEvent.TrackUnsubscribed, (_, publication) => {
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

      await room.connect(serverUrl || 'ws://127.0.0.1:7880', token);
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