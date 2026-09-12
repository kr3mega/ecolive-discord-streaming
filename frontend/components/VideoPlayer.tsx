'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { RemoteTrackPublication, VideoQuality } from 'livekit-client';

interface VideoPlayerProps {
  publication: RemoteTrackPublication;
  participantIdentity: string;
  participantName?: string;
  isObs?: boolean;
  onSetQuality?: (quality: VideoQuality) => void;
}

interface StreamStats {
  resolution: string;
  fps: number;
  bitrate: number;
}

export function VideoPlayer({
  publication,
  participantIdentity,
  participantName,
  isObs = false,
  onSetQuality,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const [stats, setStats] = useState<StreamStats>({ resolution: '0x0', fps: 0, bitrate: 0 });
  const [selectedQuality, setSelectedQuality] = useState<VideoQuality>(VideoQuality.HIGH);
  const [isPipActive, setIsPipActive] = useState(false);
  const [isMuted, setIsMuted] = useState(true);


  // 1. Anexa a trilha WebRTC do LiveKit ao elemento de vídeo
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl || !publication.track) return;

    publication.track.attach(videoEl);

    return () => {
      if (publication.track && videoEl) {
        publication.track.detach(videoEl);
      }
    };
  }, [publication.track]);

  // 2. Telemetria WebRTC (Resolução, FPS e Bitrate real decodificado)
  useEffect(() => {
    let lastBytes = 0;
    let lastTimestamp = 0;

    const interval = setInterval(async () => {
      const videoEl = videoRef.current;
      if (!videoEl) return;

      const track = publication.videoTrack;
      if (!track) return;

      const currentWidth = videoEl.videoWidth || 0;
      const currentHeight = videoEl.videoHeight || 0;

      // Obtém estatísticas de recepção de RTP
      const report: RTCStatsReport | undefined = await track.getRTCStatsReport?.();
      
      let fps = 0;
      let bitrate = 0;

      if (report) {
        report.forEach((stat) => {
          if (stat.type === 'inbound-rtp' && stat.kind === 'video') {
            fps = stat.framesPerSecond || 0;

            const now = stat.timestamp;
            const bytes = stat.bytesReceived || 0;

            if (lastTimestamp > 0 && now > lastTimestamp) {
              const diffMs = now - lastTimestamp;
              const diffBits = (bytes - lastBytes) * 8;
              bitrate = Math.round((diffBits / diffMs) * 1000 / 1000); // kbps
            }

            lastBytes = bytes;
            lastTimestamp = now;
          }
        });
      }

      setStats({
        resolution: `${currentWidth}x${currentHeight}`,
        fps: Math.round(fps),
        bitrate,
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [publication]);

  // 3. Document Picture-in-Picture com fallback para Standard PiP
  const togglePictureInPicture = useCallback(async () => {
    const container = containerRef.current;
    const video = videoRef.current;
    if (!container || !video) return;

    // Interface para a API moderna de Document Picture-in-Picture
    interface CustomPipWindow extends Window {
      documentPictureInPicture?: {
        window?: Window;
        requestWindow(options?: { width?: number; height?: number }): Promise<Window>;
      };
    }
    const customWindow = window as unknown as CustomPipWindow;

    // Se já estiver em PiP, fecha
    if (isPipActive) {
      if (customWindow.documentPictureInPicture?.window) {
        customWindow.documentPictureInPicture.window.close();
      } else if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      }
      return;
    }

    // Suporte a Document PiP (Chrome 111+ / Edge)
    if (customWindow.documentPictureInPicture) {
      try {
        const pipWindow = await customWindow.documentPictureInPicture.requestWindow({
          width: container.clientWidth || 640,
          height: container.clientHeight || 360,
        });

        // Transfere todas as folhas de estilo do Tailwind para o novo documento PiP
        [...document.styleSheets].forEach((styleSheet) => {
          try {
            const cssRules = [...styleSheet.cssRules].map((rule) => rule.cssText).join('');
            const style = pipWindow.document.createElement('style');
            style.textContent = cssRules;
            pipWindow.document.head.appendChild(style);
          } catch {
            if (styleSheet.href) {
              const link = pipWindow.document.createElement('link');
              link.rel = 'stylesheet';
              link.href = styleSheet.href;
              pipWindow.document.head.appendChild(link);
            }
          }
        });

        // Configuração do body do PiP
        pipWindow.document.body.style.margin = '0';
        pipWindow.document.body.style.backgroundColor = '#000';
        pipWindow.document.body.style.display = 'flex';
        pipWindow.document.body.style.alignItems = 'center';
        pipWindow.document.body.style.justifyContent = 'center';

        // Move a árvore DOM (Vídeo + HUD) para dentro da janela PiP
        pipWindow.document.body.appendChild(container);
        setIsPipActive(true);

        // Restaura a árvore DOM no layout original quando o PiP for fechado
        pipWindow.addEventListener('pagehide', () => {
          wrapperRef.current?.appendChild(container);
          setIsPipActive(false);
        });

        return;
      } catch (err) {
        console.warn('Falha no Document PiP, tentando fallback tradicional:', err);
      }
    }

    // Fallback tradicional (sem HUD caso o navegador não suporte a nova API)
    if (document.pictureInPictureEnabled && !video.disablePictureInPicture) {
      try {
        await video.requestPictureInPicture();
        setIsPipActive(true);
        video.addEventListener('leavepictureinpicture', () => setIsPipActive(false), { once: true });
      } catch (err) {
        console.error('Falha ao abrir PiP nativo:', err);
      }
    }
  }, [isPipActive]);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(console.error);
    } else {
      document.exitFullscreen().catch(console.error);
    }
  };

  const handleQualityChange = (quality: VideoQuality) => {
    setSelectedQuality(quality);
    if (onSetQuality) onSetQuality(quality);
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setIsMuted(videoRef.current.muted);
    }
  };

  return (
    <div className="flex flex-col bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-2xl transition-all hover:border-zinc-700">
      {/* Barra de Controle Superior */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-zinc-950 border-b border-zinc-800">
        <div className="flex items-center gap-2 truncate">
          <span
            className={`px-2 py-0.5 text-[10px] font-bold rounded uppercase tracking-wider ${
              isObs
                ? 'bg-purple-900/60 text-purple-300 border border-purple-700/50'
                : 'bg-emerald-900/60 text-emerald-300 border border-emerald-700/50'
            }`}
          >
            {isObs ? 'OBS Ingestion' : 'PlayWeb Casual'}
          </span>
          <span className="text-xs font-semibold text-zinc-200 truncate">
            {participantName || participantIdentity}
          </span>
        </div>

        {/* Seletor de Resolução / Camadas do Simulcast */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => handleQualityChange(VideoQuality.LOW)}
            className={`px-2 py-0.5 text-[11px] font-semibold rounded transition ${
              selectedQuality === VideoQuality.LOW ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:bg-zinc-800'
            }`}
            title="360p (Economia máxima)"
          >
            360p
          </button>
          <button
            onClick={() => handleQualityChange(VideoQuality.MEDIUM)}
            className={`px-2 py-0.5 text-[11px] font-semibold rounded transition ${
              selectedQuality === VideoQuality.MEDIUM ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:bg-zinc-800'
            }`}
            title="720p (Modo equilibrado)"
          >
            720p
          </button>
          <button
            onClick={() => handleQualityChange(VideoQuality.HIGH)}
            className={`px-2 py-0.5 text-[11px] font-semibold rounded transition ${
              selectedQuality === VideoQuality.HIGH ? 'bg-emerald-600 text-white' : 'text-zinc-400 hover:bg-zinc-800'
            }`}
            title="1080p60 (Qualidade total)"
          >
            1080p60
          </button>
        </div>
      </div>

      {/* Wrapper de Ancoragem para transferência segura no PiP */}
      <div ref={wrapperRef} className="relative w-full aspect-video bg-black flex items-center justify-center">
        {/* Container do Vídeo + HUD */}
        <div ref={containerRef} className="relative w-full h-full bg-black flex items-center justify-center group overflow-hidden">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={isMuted}
            className="w-full h-full object-contain"
          />

          {/* HUD de Telemetria (Bitrate / FPS / Resolução) */}
          <div className="absolute top-3 left-3 bg-black/80 backdrop-blur-md px-3 py-1 rounded border border-white/10 flex items-center gap-2 text-xs font-mono select-none z-20 pointer-events-none">
            <span className="text-zinc-100 font-bold">{stats.resolution}</span>
            <span className="text-zinc-500">•</span>
            <span className={stats.fps >= 55 ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
              {stats.fps} FPS
            </span>
            <span className="text-zinc-500">•</span>
            <span className="text-zinc-200">{stats.bitrate} kbps</span>
          </div>

          {/* Controles de Janela (Áudio / PiP / Fullscreen) */}
          <div className="absolute bottom-3 right-3 flex items-center gap-2 z-20 opacity-90 group-hover:opacity-100 transition-opacity">
            <button
              onClick={toggleMute}
              className={`px-2.5 py-1.5 rounded border border-white/10 text-xs font-semibold backdrop-blur-md transition ${
                isMuted ? 'bg-amber-900/80 text-amber-200 hover:bg-amber-800' : 'bg-black/80 text-zinc-200 hover:bg-zinc-800'
              }`}
              title={isMuted ? 'Desmutar Áudio' : 'Mutar Áudio'}
            >
              {isMuted ? '🔇 Desmutar' : '🔊 Mutar'}
            </button>
            <button
              onClick={togglePictureInPicture}
              className="bg-black/80 hover:bg-zinc-800 text-zinc-200 px-2.5 py-1.5 rounded border border-white/10 text-xs font-semibold backdrop-blur-md transition"
              title="Picture-in-Picture com HUD"
            >
              PiP
            </button>
            <button
              onClick={toggleFullscreen}
              className="bg-black/80 hover:bg-zinc-800 text-zinc-200 px-2.5 py-1.5 rounded border border-white/10 text-xs font-semibold backdrop-blur-md transition"
              title="Tela Cheia"
            >
              [ ]
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}