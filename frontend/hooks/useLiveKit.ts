'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Room,
  RoomEvent,
  RemoteTrackPublication,
  Track,
  VideoQuality,
  LocalVideoTrack,
} from 'livekit-client';

export interface RemoteFeed {
  participantIdentity: string;
  publication: RemoteTrackPublication;
}

export function useLiveKit() {
  const [isConnected, setIsConnected] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [remoteFeeds, setRemoteFeeds] = useState<RemoteFeed[]>([]);
  const roomRef = useRef<Room | null>(null);
  const connectingRef = useRef(false);

  const connect = useCallback(async (roomName: string, username: string) => {
    if (connectingRef.current || roomRef.current) return;
    connectingRef.current = true;

    try {
      const res = await fetch(`/api/token?room=${encodeURIComponent(roomName)}&username=${encodeURIComponent(username)}`);
      if (!res.ok) throw new Error('Falha ao obter token');
      const { token } = await res.json();

      const livekitUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL || 'ws://127.0.0.1:7880';

      const room = new Room({
        adaptiveStream: false,
        dynacast: true,
      });

      room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
        if (track.kind === Track.Kind.Video) {
          setRemoteFeeds((prev) => [
            ...prev.filter((f) => f.publication.trackSid !== publication.trackSid),
            {
              participantIdentity: participant.identity,
              publication: publication as RemoteTrackPublication,
            },
          ]);
        }
      });

      room.on(RoomEvent.TrackUnsubscribed, (_, publication) => {
        setRemoteFeeds((prev) => prev.filter((f) => f.publication.trackSid !== publication.trackSid));
      });

      await room.connect(livekitUrl, token);
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
    setRemoteFeeds([]);
  }, []);

  const toggleScreenShare = useCallback(async () => {
    if (!roomRef.current) return;

    if (isScreenSharing) {
      await roomRef.current.localParticipant.setScreenShareEnabled(false);
      setIsScreenSharing(false);
    } else {
      const pub = await roomRef.current.localParticipant.setScreenShareEnabled(
        true,
        {
          audio: true,
          systemAudio: 'include',
          resolution: {
            width: 1920,
            height: 1080,
            frameRate: 60,
          },
        },
        {
          simulcast: true,
        }
      );

      // Prioriza taxa de quadros (60 FPS) sobre nitidez estática
      if (pub && pub.track instanceof LocalVideoTrack) {
        pub.track.mediaStreamTrack.contentHint = 'motion';
      }

      setIsScreenSharing(true);
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
    connect,
    disconnect,
    toggleScreenShare,
    setQuality,
  };
}