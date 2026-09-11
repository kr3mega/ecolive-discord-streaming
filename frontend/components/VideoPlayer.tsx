'use client';

import { useEffect, useRef, useState } from 'react';
import { RemoteTrackPublication, VideoQuality } from 'livekit-client';

interface VideoPlayerProps {
  publication: RemoteTrackPublication;
  identity: string;
  onQualityChange: (publication: RemoteTrackPublication, quality: VideoQuality) => void;
}

interface StreamStats {
  width: number;
  height: number;
  fps: number;
  bitrateKbps: number;
}

export function VideoPlayer({ publication, identity, onQualityChange }: VideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentQuality, setCurrentQuality] = useState<VideoQuality>(VideoQuality.HIGH);
  const [stats, setStats] = useState<StreamStats>({ width: 0, height: 0, fps: 0, bitrateKbps: 0 });

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !publication.track) return;

    publication.track.attach(el);

    return () => {
      publication.track?.detach(el);
    };
  }, [publication.track]);

  // Coleta de métricas WebRTC (FPS, Resolução real e Taxa de Bits)
  useEffect(() => {
    let lastBytesReceived = 0;
    let lastTimestamp = performance.now();

    const intervalId = setInterval(async () => {
      if (!publication.track || !videoRef.current) return;

      const currentWidth = videoRef.current.videoWidth || 0;
      const currentHeight = videoRef.current.videoHeight || 0;

      const report = await publication.track.getRTCStatsReport();
      let currentFps = 0;
      let currentBitrate = 0;

      if (report) {
        report.forEach((stat) => {
          if (stat.type === 'inbound-rtp' && stat.kind === 'video') {
            currentFps = stat.framesPerSecond || 0;

            const now = performance.now();
            const timeDiff = (now - lastTimestamp) / 1000;
            if (timeDiff > 0 && lastBytesReceived > 0) {
              const bytesDiff = stat.bytesReceived - lastBytesReceived;
              currentBitrate = Math.max(0, Math.round((bytesDiff * 8) / timeDiff / 1000));
            }
            lastBytesReceived = stat.bytesReceived;
            lastTimestamp = now;
          }
        });
      }

      setStats({
        width: currentWidth,
        height: currentHeight,
        fps: currentFps,
        bitrateKbps: currentBitrate,
      });
    }, 1000);

    return () => clearInterval(intervalId);
  }, [publication.track]);

  const handleSelectQuality = (quality: VideoQuality) => {
    setCurrentQuality(quality);
    onQualityChange(publication, quality);
  };

  const togglePiP = async () => {
    if (!videoRef.current) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await videoRef.current.requestPictureInPicture();
      }
    } catch (err) {
      console.error('Erro ao alternar Picture-in-Picture:', err);
    }
  };

  const toggleFullscreen = async () => {
    if (!containerRef.current) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await containerRef.current.requestFullscreen();
      }
    } catch (err) {
      console.error('Erro ao alternar tela cheia:', err);
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative flex flex-col bg-zinc-900 border border-zinc-800 rounded-lg p-3 gap-2"
    >
      <div className="flex justify-between items-center text-xs">
        <span className="font-semibold text-zinc-200">{identity}</span>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => handleSelectQuality(VideoQuality.LOW)}
            className={`px-2 py-1 rounded transition ${
              currentQuality === VideoQuality.LOW ? 'bg-amber-600 text-white' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
            }`}
          >
            360p
          </button>
          <button
            type="button"
            onClick={() => handleSelectQuality(VideoQuality.MEDIUM)}
            className={`px-2 py-1 rounded transition ${
              currentQuality === VideoQuality.MEDIUM ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
            }`}
          >
            720p
          </button>
          <button
            type="button"
            onClick={() => handleSelectQuality(VideoQuality.HIGH)}
            className={`px-2 py-1 rounded transition ${
              currentQuality === VideoQuality.HIGH ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
            }`}
          >
            1080p60
          </button>
        </div>
      </div>

      <div className="relative w-full aspect-video bg-black rounded overflow-hidden group">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className="w-full h-full object-contain"
        />

        {/* Overlay HUD de Telemetria WebRTC */}
        <div className="absolute top-2 left-2 bg-black/70 backdrop-blur px-2 py-1 rounded font-mono text-[11px] text-zinc-200 pointer-events-none space-x-2 border border-zinc-700/50">
          <span>{stats.width}x{stats.height}</span>
          <span>•</span>
          <span className={stats.fps >= 55 ? 'text-emerald-400' : 'text-amber-400'}>
            {stats.fps} FPS
          </span>
          <span>•</span>
          <span>{stats.bitrateKbps} kbps</span>
        </div>

        {/* Botões de Ação Rápida (PiP e Fullscreen) */}
        <div className="absolute bottom-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={togglePiP}
            title="Picture-in-Picture"
            className="bg-zinc-800/80 hover:bg-zinc-700 text-white p-1.5 rounded backdrop-blur text-xs"
          >
            PiP
          </button>
          <button
            type="button"
            onClick={toggleFullscreen}
            title="Tela Cheia"
            className="bg-zinc-800/80 hover:bg-zinc-700 text-white p-1.5 rounded backdrop-blur text-xs"
          >
            [⛶]
          </button>
        </div>
      </div>
    </div>
  );
}