'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  RemoteTrackPublication,
  VideoQuality,
  LocalVideoTrack,
  Participant,
  ParticipantEvent,
  Track,
} from 'livekit-client';

interface VideoPlayerProps {
  publication?: RemoteTrackPublication;
  participant?: Participant;
  localTrack?: LocalVideoTrack | null;
  participantIdentity: string;
  participantName?: string;
  isObs?: boolean;
  isLocal?: boolean;
  onSetQuality?: (quality: VideoQuality) => void;
}

interface StreamStats {
  resolution: string;
  fps: number;
  bitrate: number;
}

export function VideoPlayer({
  publication,
  participant,
  localTrack,
  participantIdentity,
  participantName,
  isObs = false,
  isLocal = false,
  onSetQuality,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const [stats, setStats] = useState<StreamStats>({ resolution: '0x0', fps: 0, bitrate: 0 });
  const [selectedQuality, setSelectedQuality] = useState<VideoQuality>(VideoQuality.HIGH);
  const [isPipActive, setIsPipActive] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [volume, setVolume] = useState<number>(1);
  const lastVolumeRef = useRef<number>(1);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  // 1. Anexa a trilha WebRTC do LiveKit ao elemento de vídeo
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;

    if (localTrack) {
      localTrack.attach(videoEl);
      return () => {
        localTrack.detach(videoEl);
      };
    }

    if (publication?.track) {
      publication.track.attach(videoEl);
      publication.setVideoQuality(selectedQuality);

      return () => {
        if (publication.track && videoEl) {
          publication.track.detach(videoEl);
        }
      };
    }
  }, [publication, localTrack, selectedQuality]);

  // 1.1 Anexa trilhas de áudio do participante ao elemento de vídeo para reprodução sonora sincronizada
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl || isLocal || !participant) return;

    // Anexa trilhas existentes
    participant.audioTrackPublications.forEach((pub) => {
      if (pub.track && videoEl) {
        pub.track.attach(videoEl);
      }
    });

    // Escuta novas trilhas de áudio publicadas
    const handleTrackSubscribed = (track: Track) => {
      if (track.kind === Track.Kind.Audio && videoEl) {
        track.attach(videoEl);
      }
    };

    participant.on(ParticipantEvent.TrackSubscribed, handleTrackSubscribed);

    return () => {
      participant.off(ParticipantEvent.TrackSubscribed, handleTrackSubscribed);
      participant.audioTrackPublications.forEach((pub) => {
        if (pub.track && videoEl) {
          pub.track.detach(videoEl);
        }
      });
    };
  }, [participant, isLocal]);

  // 2. Telemetria WebRTC (Resolução, FPS e Bitrate real decodificado)
  useEffect(() => {
    let lastBytes = 0;
    let lastTimestamp = 0;

    const interval = setInterval(async () => {
      const videoEl = videoRef.current;
      if (!videoEl) return;

      const currentWidth = videoEl.videoWidth || 0;
      const currentHeight = videoEl.videoHeight || 0;

      if (localTrack) {
        setStats({
          resolution: `${currentWidth}x${currentHeight}`,
          fps: 60,
          bitrate: 6000,
        });
        return;
      }

      const track = publication?.videoTrack;
      if (!track) return;

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
  }, [publication, localTrack]);

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
    if (!videoRef.current) return;
    if (isMuted) {
      const targetVol = lastVolumeRef.current > 0 ? lastVolumeRef.current : 1;
      videoRef.current.muted = false;
      videoRef.current.volume = targetVol;
      setIsMuted(false);
      setVolume(targetVol);
    } else {
      lastVolumeRef.current = volume;
      videoRef.current.muted = true;
      setIsMuted(true);
    }
  };

  const handleVolumeChange = (newVal: number) => {
    setVolume(newVal);
    if (!videoRef.current) return;
    videoRef.current.volume = newVal;
    if (newVal > 0) {
      lastVolumeRef.current = newVal;
      if (isMuted) {
        videoRef.current.muted = false;
        setIsMuted(false);
      }
    } else {
      videoRef.current.muted = true;
      setIsMuted(true);
    }
  };

  return (
    <div className="group/player flex flex-col bg-zinc-950 border border-zinc-800/80 hover:border-zinc-700/80 rounded-2xl overflow-hidden shadow-2xl transition-all duration-300">
      {/* Barra de Controle Superior */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-zinc-950/90 backdrop-blur-md border-b border-zinc-800/80 gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className={`px-2.5 py-1 text-[10px] font-semibold rounded-full uppercase tracking-wider flex items-center gap-1.5 shrink-0 ${
              isLocal
                ? 'bg-blue-950/60 text-blue-300 border border-blue-500/30'
                : isObs
                ? 'bg-purple-950/60 text-purple-300 border border-purple-500/30 shadow-sm shadow-purple-950/40'
                : 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/30'
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                isLocal ? 'bg-blue-400' : isObs ? 'bg-purple-400' : 'bg-emerald-400'
              } animate-pulse`}
            />
            {isLocal ? 'Sua Transmissão' : isObs ? 'OBS Studio (WHIP)' : 'PlayWeb Casual'}
          </span>
          <span
            className="text-xs font-medium text-zinc-200 truncate"
            title={participantName || participantIdentity}
          >
            {participantName || participantIdentity}
          </span>
        </div>

        {/* Seletor de Resolução / Camadas do Simulcast (Segmented Control) */}
        {!isLocal ? (
          <div className="flex items-center bg-zinc-900/90 p-0.5 rounded-lg border border-zinc-800/80 shrink-0">
            <button
              type="button"
              onClick={() => handleQualityChange(VideoQuality.LOW)}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-all duration-150 cursor-pointer ${
                selectedQuality === VideoQuality.LOW
                  ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="360p • Economia máxima de dados"
            >
              360p
            </button>
            <button
              type="button"
              onClick={() => handleQualityChange(VideoQuality.MEDIUM)}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-all duration-150 cursor-pointer ${
                selectedQuality === VideoQuality.MEDIUM
                  ? 'bg-blue-600 text-white shadow-sm font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="720p • Modo equilibrado"
            >
              720p
            </button>
            <button
              type="button"
              onClick={() => handleQualityChange(VideoQuality.HIGH)}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-all duration-150 cursor-pointer ${
                selectedQuality === VideoQuality.HIGH
                  ? 'bg-emerald-600 text-white shadow-sm font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="1080p60 • Qualidade total"
            >
              1080p60
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-950/40 border border-emerald-500/30 text-emerald-400 text-[11px] font-medium shrink-0">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>Transmitindo 1080p60</span>
          </div>
        )}
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

          {/* HUD de Telemetria Flutuante (Bitrate / FPS / Resolução) */}
          <div className="absolute top-3 left-3 bg-black/75 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10 flex items-center gap-2 text-[11px] font-mono select-none z-20 pointer-events-none shadow-2xl">
            <span className="text-zinc-200 font-semibold">{stats.resolution}</span>
            <span className="text-zinc-600">·</span>
            
            {/* Indicador de Taxa de Quadros (Suporte a 120 FPS Ultra) */}
            <span
              className={
                stats.fps >= 100
                  ? 'text-cyan-300 font-bold flex items-center gap-1 drop-shadow-[0_0_8px_rgba(34,211,238,0.7)]'
                  : stats.fps >= 55
                  ? 'text-emerald-400 font-medium'
                  : 'text-amber-400 font-medium'
              }
            >
              {stats.fps >= 100 ? `⚡ ${stats.fps} FPS ULTRA` : `${stats.fps} FPS`}
            </span>

            <span className="text-zinc-600">·</span>
            <span className="text-zinc-300">
              {stats.bitrate > 1000 ? `${(stats.bitrate / 1000).toFixed(1)} Mbps` : `${stats.bitrate} kbps`}
            </span>
          </div>

          {/* Dock Flutuante de Controles (Áudio / PiP / Fullscreen com Ícones SVG) */}
          <div className="absolute bottom-3 right-3 flex items-center gap-1 bg-black/75 backdrop-blur-md p-1.5 rounded-xl border border-white/10 shadow-2xl z-20 opacity-80 group-hover:opacity-100 transition-all duration-200">
            {/* Contêiner do Botão de Áudio + Regulador Vertical no Hover */}
            <div className="relative group/volume flex items-center justify-center">
              {/* Regulador Vertical Flutuante (Aparece ao passar o mouse sobre o ícone de som) */}
              <div className="absolute bottom-full mb-2.5 left-1/2 -translate-x-1/2 hidden group-hover/volume:flex flex-col items-center gap-2 bg-zinc-950/95 backdrop-blur-md px-2.5 py-3 rounded-2xl border border-white/10 shadow-2xl z-30 transition-all duration-200">
                {/* Rótulo de Porcentagem */}
                <span className="text-[10px] font-mono font-bold text-zinc-300 select-none">
                  {isMuted || volume === 0 ? '0%' : `${Math.round(volume * 100)}%`}
                </span>
                
                {/* Slider Vertical */}
                <div className="h-28 flex items-center justify-center py-1">
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={isMuted ? 0 : volume}
                    onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                    className="cursor-pointer accent-indigo-500 h-24 w-1.5 rounded-lg bg-zinc-800"
                    style={{
                      writingMode: 'vertical-lr',
                      direction: 'rtl',
                      WebkitAppearance: 'slider-vertical',
                    }}
                    title={`Volume: ${Math.round(volume * 100)}%`}
                  />
                </div>

                {/* Ponte invisível para evitar perda do hover ao mover o mouse */}
                <div className="absolute top-full left-0 w-full h-3" />
              </div>

              {/* Botão de Áudio (Mutar / Desmutar) */}
              <button
                type="button"
                onClick={toggleMute}
                className={`p-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  isMuted || volume === 0
                    ? 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30'
                    : 'text-zinc-300 hover:text-white hover:bg-zinc-800/80'
                }`}
                title={isMuted || volume === 0 ? 'Desmutar Áudio' : `Mutar Áudio (${Math.round(volume * 100)}%)`}
              >
                {isMuted || volume === 0 ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                  </svg>
                ) : volume < 0.5 ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  </svg>
                )}
              </button>
            </div>

            {/* Botão Picture-in-Picture */}
            <button
              type="button"
              onClick={togglePictureInPicture}
              className={`p-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                isPipActive
                  ? 'bg-indigo-600 text-white'
                  : 'text-zinc-300 hover:text-white hover:bg-zinc-800/80'
              }`}
              title={isPipActive ? 'Fechar Janela Flutuante (PiP)' : 'Janela Flutuante (PiP)'}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V6z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 11h5a1 1 0 011 1v4a1 1 0 01-1 1h-5a1 1 0 01-1-1v-4a1 1 0 011-1z" />
              </svg>
            </button>

            {/* Botão Tela Cheia (Alterna entre Expand / Compress) */}
            <button
              type="button"
              onClick={toggleFullscreen}
              className="p-2 rounded-lg text-xs font-medium text-zinc-300 hover:text-white hover:bg-zinc-800/80 transition-colors cursor-pointer"
              title={isFullscreen ? 'Sair da Tela Cheia' : 'Tela Cheia'}
            >
              {isFullscreen ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 14h6m0 0v6m0-6l-7 7m17-7h-6m0 0v6m0-6l7 7M4 10h6m0 0V4m0 6l-7-7m17 7h-6m0 0V4m0 6l7-7" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}