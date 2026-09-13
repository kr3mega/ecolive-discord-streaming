'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  RemoteTrackPublication,
  LocalVideoTrack,
  Participant,
  ParticipantEvent,
  Track,
  VideoQuality,
} from 'livekit-client';

interface VideoPlayerProps {
  publication?: RemoteTrackPublication;
  participant?: Participant;
  localTrack?: LocalVideoTrack | null;
  participantIdentity: string;
  participantName?: string;
  isObs?: boolean;
  isLocal?: boolean;
  isWatching?: boolean;
  onToggleWatch?: (watching: boolean) => void;
  avatarUrl?: string;
}

interface StreamStats {
  resolution: string;
  fps: number;
  bitrate: number;
  rtt?: number;
  packetLoss?: number;
}

export function VideoPlayer({
  publication,
  participant,
  localTrack,
  participantIdentity,
  participantName,
  isObs = false,
  isLocal = false,
  isWatching: controlledWatching,
  onToggleWatch,
  avatarUrl,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Extrai avatar dos metadados do participante (LiveKit) ou da prop avatarUrl (Discord SDK)
  const effectiveAvatar = (() => {
    if (avatarUrl) return avatarUrl;
    if (participant?.metadata) {
      try {
        const parsed = JSON.parse(participant.metadata);
        if (parsed.avatar) return parsed.avatar as string;
      } catch {}
    }
    return undefined;
  })();

  // Estado sob demanda: Transmissão local é sempre ativa; transmissões remotas iniciam pausadas por padrão
  const [internalWatching, setInternalWatching] = useState<boolean>(isLocal);
  const activeWatching = isLocal ? true : (controlledWatching !== undefined ? controlledWatching : internalWatching);

  const handleToggleWatch = useCallback((targetState?: boolean) => {
    const nextState = targetState !== undefined ? targetState : !activeWatching;
    if (onToggleWatch) {
      onToggleWatch(nextState);
    } else {
      setInternalWatching(nextState);
    }
  }, [activeWatching, onToggleWatch]);

  const [stats, setStats] = useState<StreamStats>({ resolution: '0x0', fps: 0, bitrate: 0 });
  const [isPipActive, setIsPipActive] = useState(false);
  const [isMuted, setIsMuted] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const savedMuted = localStorage.getItem('ecolive_muted');
      if (savedMuted !== null) {
        return savedMuted === 'true';
      }
    }
    return false;
  });
  const [volume, setVolume] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('ecolive_volume');
      if (saved !== null) {
        const parsed = parseFloat(saved);
        if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) return parsed;
      }
    }
    return 1;
  });
  const lastVolumeRef = useRef<number>(volume > 0 ? volume : 1);
  const isMutedRef = useRef(isMuted);
  const volumeRef = useRef(volume);
  isMutedRef.current = isMuted;
  volumeRef.current = volume;
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Sincroniza o elemento de vídeo com o estado de áudio e persiste no localStorage
  useEffect(() => {
    const videoEl = videoRef.current;
    if (videoEl) {
      videoEl.muted = isMuted;
      videoEl.volume = volume;
    }
    if (typeof window !== 'undefined') {
      localStorage.setItem('ecolive_volume', volume.toString());
      localStorage.setItem('ecolive_muted', isMuted ? 'true' : 'false');
    }
  }, [isMuted, volume]);

  // Bloqueia rolagem do body quando em tela cheia imersiva
  useEffect(() => {
    if (isFullscreen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isFullscreen]);

  // 0. Sincroniza estado de recepção no LiveKit SFU (0 Mbps quando não assistindo)
  useEffect(() => {
    if (isLocal) return;

    if (publication) {
      publication.setEnabled(activeWatching);
    }

    if (participant) {
      participant.audioTrackPublications.forEach((pub) => {
        if (pub instanceof RemoteTrackPublication) {
          pub.setEnabled(activeWatching);
        }
      });
    }
  }, [activeWatching, publication, participant, isLocal]);

  // Se o usuário fechar a transmissão, encerra Fullscreen e PiP caso estejam ativos
  useEffect(() => {
    if (!activeWatching) {
      if (isFullscreen) setIsFullscreen(false);
      if (isPipActive) setIsPipActive(false);
    }
  }, [activeWatching, isFullscreen, isPipActive]);

  // 1. Anexa a trilha WebRTC do LiveKit ao elemento de vídeo somente se activeWatching
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;

    if (localTrack) {
      localTrack.attach(videoEl);
      return () => {
        localTrack.detach(videoEl);
      };
    }

    if (activeWatching && publication?.track) {
      publication.track.attach(videoEl);
      publication.setVideoQuality(VideoQuality.HIGH);

      return () => {
        if (publication.track && videoEl) {
          publication.track.detach(videoEl);
        }
      };
    } else if (publication?.track && videoEl) {
      publication.track.detach(videoEl);
    }
  }, [publication, localTrack, activeWatching]);

  // 1.1 Anexa trilhas de áudio do participante ao elemento de vídeo somente se activeWatching
  // OBS: Não depende de [isMuted, volume] para evitar detach/attach da trilha e piscamento preto ao arrastar o slider
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl || isLocal || !participant) return;

    if (!activeWatching) {
      // Se não está assistindo, desanexa qualquer trilha de áudio
      participant.audioTrackPublications.forEach((pub) => {
        if (pub.track && videoEl) {
          pub.track.detach(videoEl);
        }
      });
      return;
    }

    // Anexa trilhas existentes e garante sincronismo imediato de áudio
    participant.audioTrackPublications.forEach((pub) => {
      if (pub.track && videoEl) {
        pub.track.attach(videoEl);
        videoEl.muted = isMutedRef.current;
        videoEl.volume = volumeRef.current;
      }
    });

    // Escuta novas trilhas de áudio publicadas
    const handleTrackSubscribed = (track: Track) => {
      if (track.kind === Track.Kind.Audio && videoEl && activeWatching) {
        track.attach(videoEl);
        videoEl.muted = isMutedRef.current;
        videoEl.volume = volumeRef.current;
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
  }, [participant, isLocal, activeWatching]);

  // 2. Telemetria WebRTC (Resolução, FPS, Bitrate, RTT/Ping e Perda de Pacotes)
  useEffect(() => {
    if (!activeWatching) {
      setStats({
        resolution: '0x0',
        fps: 0,
        bitrate: 0,
        rtt: undefined,
        packetLoss: undefined,
      });
      return;
    }

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
          rtt: 0,
          packetLoss: 0,
        });
        return;
      }

      const track = publication?.videoTrack;
      if (!track) return;

      // Obtém estatísticas de recepção de RTP
      const report: RTCStatsReport | undefined = await track.getRTCStatsReport?.();
      
      let fps = 0;
      let bitrate = 0;
      let rtt: number | undefined = undefined;
      let packetLoss: number | undefined = undefined;

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

            const lost = stat.packetsLost || 0;
            const received = stat.packetsReceived || 0;
            const total = lost + received;
            if (total > 0 && lost >= 0) {
              packetLoss = Math.round((lost / total) * 100 * 10) / 10;
            }
          }

          if (stat.type === 'candidate-pair' && (stat.nominated || stat.state === 'succeeded')) {
            if (typeof stat.currentRoundTripTime === 'number') {
              rtt = Math.round(stat.currentRoundTripTime * 1000);
            }
          }
        });
      }

      setStats({
        resolution: `${currentWidth}x${currentHeight}`,
        fps: Math.round(fps),
        bitrate,
        rtt,
        packetLoss,
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [publication, localTrack, activeWatching]);

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

  const toggleFullscreen = useCallback(async () => {
    const container = containerRef.current;
    const video = videoRef.current;
    if (!container) return;

    interface DocumentVendorFs extends Document {
      webkitFullscreenElement?: Element;
      mozFullScreenElement?: Element;
      msFullscreenElement?: Element;
      webkitExitFullscreen?: () => Promise<void>;
    }
    const docVendor = document as DocumentVendorFs;

    const isNativeFs = !!(
      document.fullscreenElement ||
      docVendor.webkitFullscreenElement ||
      docVendor.mozFullScreenElement ||
      docVendor.msFullscreenElement
    );

    if (isFullscreen || isNativeFs) {
      // Sair do modo tela cheia
      if (isNativeFs) {
        try {
          if (document.exitFullscreen) {
            await document.exitFullscreen();
          } else if (docVendor.webkitExitFullscreen) {
            await docVendor.webkitExitFullscreen();
          }
        } catch {
          // Ignora caso o navegador já tenha saído
        }
      }
      setIsFullscreen(false);
    } else {
      // 1. Ativa imediatamente o Fullscreen Imersivo no viewport do Discord
      setIsFullscreen(true);

      // 2. Tenta acionar o Fullscreen de SO nativo se o iframe do Discord permitir
      try {
        interface ElementVendorFs extends HTMLDivElement {
          webkitRequestFullscreen?: () => Promise<void>;
        }
        interface VideoVendorFs extends HTMLVideoElement {
          webkitEnterFullscreen?: () => void;
        }
        const containerVendor = container as ElementVendorFs;
        const videoVendor = video as VideoVendorFs | null;

        if (container.requestFullscreen) {
          await container.requestFullscreen();
        } else if (containerVendor.webkitRequestFullscreen) {
          await containerVendor.webkitRequestFullscreen();
        } else if (videoVendor?.webkitEnterFullscreen) {
          videoVendor.webkitEnterFullscreen();
        }
      } catch (err) {
        // Iframe do Discord bloqueia requestFullscreen nativo via Permissions Policy,
        // mas nosso Fullscreen Imersivo CSS (fixed inset-0 z-50) já assumiu 100% da tela perfeitamente!
        console.warn('Fullscreen nativo bloqueado pelo iframe do Discord, operando em modo imersivo:', err);
      }
    }
  }, [isFullscreen]);

  // Listener para sincronizar saída de fullscreen via ESC ou eventos nativos
  useEffect(() => {
    const handleFsChange = () => {
      interface DocumentVendorFs extends Document {
        webkitFullscreenElement?: Element;
        mozFullScreenElement?: Element;
        msFullscreenElement?: Element;
      }
      const docVendor = document as DocumentVendorFs;
      const isNativeFs = !!(
        document.fullscreenElement ||
        docVendor.webkitFullscreenElement ||
        docVendor.mozFullScreenElement ||
        docVendor.msFullscreenElement
      );
      if (!isNativeFs && isFullscreen) {
        setIsFullscreen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        e.preventDefault();
        toggleFullscreen();
      }
    };

    document.addEventListener('fullscreenchange', handleFsChange);
    document.addEventListener('webkitfullscreenchange', handleFsChange);
    document.addEventListener('mozfullscreenchange', handleFsChange);
    document.addEventListener('MSFullscreenChange', handleFsChange);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
      document.removeEventListener('webkitfullscreenchange', handleFsChange);
      document.removeEventListener('mozfullscreenchange', handleFsChange);
      document.removeEventListener('MSFullscreenChange', handleFsChange);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFullscreen, toggleFullscreen]);

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
          {effectiveAvatar ? (
            <img
              src={effectiveAvatar}
              alt={participantName || participantIdentity}
              className="h-6 w-6 rounded-full object-cover border border-zinc-700/80 shrink-0 shadow-sm"
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
          ) : (
            <div className="h-6 w-6 rounded-full bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-[10px] font-bold text-white shrink-0 shadow-sm">
              {(participantName || participantIdentity).trim().charAt(0).toUpperCase()}
            </div>
          )}
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

        {/* Status da Transmissão e Botão Parar de Assistir */}
        <div className="flex items-center gap-2 shrink-0">
          {isLocal ? (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-950/40 border border-blue-500/30 text-blue-400 text-[11px] font-medium">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
              <span>Transmitindo</span>
            </div>
          ) : (
            <>
              {activeWatching ? (
                <>
                  <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-950/40 border border-emerald-500/30 text-emerald-400 text-[11px] font-medium">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span>AO VIVO</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggleWatch(false)}
                    className="px-2.5 py-1 rounded-lg bg-zinc-800/90 hover:bg-rose-900/60 border border-zinc-700/60 hover:border-rose-500/50 text-zinc-300 hover:text-rose-200 text-[11px] font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm active:scale-95"
                    title="Fechar transmissão para economizar internet e processador"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    <span>Parar de Assistir</span>
                  </button>
                </>
              ) : (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-900/90 border border-zinc-800 text-zinc-400 text-[11px] font-medium">
                  <span className="h-1.5 w-1.5 rounded-full bg-zinc-500" />
                  <span>Fechada (0 Mbps)</span>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Wrapper de Ancoragem para transferência segura no PiP */}
      <div ref={wrapperRef} className="relative w-full aspect-video bg-black flex items-center justify-center">
        {!activeWatching ? (
          /* ESTADO DISCORD: Transmissão Fechada / Aguardando Clique */
          <div className="relative w-full h-full bg-gradient-to-b from-zinc-900/95 via-zinc-950 to-black flex flex-col items-center justify-center p-6 text-center select-none overflow-hidden group/idle">
            {/* Efeito de luz ambiente de fundo */}
            <div className="absolute inset-0 bg-radial from-indigo-500/10 via-transparent to-transparent opacity-50 pointer-events-none" />

            {/* Avatar / Foto de Perfil do Streamer com anel estético */}
            <div className="relative mb-3.5 group/avatar">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-zinc-800/80 border border-zinc-700/60 shadow-2xl flex items-center justify-center text-2xl sm:text-3xl font-black text-white relative z-10 overflow-hidden">
                {effectiveAvatar ? (
                  <img
                    src={effectiveAvatar}
                    alt={participantName || participantIdentity}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-tr from-indigo-600 via-purple-600 to-emerald-600 text-white font-black text-2xl sm:text-3xl select-none">
                    {(participantName || participantIdentity).trim().charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="absolute -inset-1 rounded-2xl bg-gradient-to-tr from-indigo-500/40 via-purple-500/20 to-emerald-500/30 blur-sm animate-pulse" />
              
              {/* Badge indicando se a fonte é OBS (120 FPS) ou Navegador */}
              <div
                className={`absolute -bottom-1 -right-1 p-1 rounded-full border-2 border-zinc-950 shadow z-20 text-[10px] flex items-center justify-center ${
                  isObs ? 'bg-purple-600 text-white' : 'bg-emerald-500 text-zinc-950'
                }`}
                title={isObs ? 'OBS Studio (WHIP)' : 'PlayWeb Casual'}
              >
                <span>{isObs ? '🎥' : '🌐'}</span>
              </div>
            </div>

            {/* Nome do Streamer e Chamada */}
            <h4 className="text-sm sm:text-base font-bold text-zinc-100 truncate max-w-[85%] mb-1">
              {participantName || participantIdentity}
            </h4>
            <p className="text-[11px] sm:text-xs text-zinc-400 max-w-xs mb-4">
              {isObs ? 'Transmissão via OBS Studio (WHIP)' : 'Compartilhamento de Tela via Navegador'}
            </p>

            {/* BOTÃO BRANCO CENTRAL ESTILO DISCORD */}
            <button
              type="button"
              onClick={() => handleToggleWatch(true)}
              className="px-6 py-2.5 sm:py-3 bg-white hover:bg-zinc-100 active:scale-95 text-zinc-950 font-bold text-xs sm:text-sm rounded-xl shadow-2xl shadow-white/10 flex items-center gap-2.5 transition-all cursor-pointer hover:shadow-indigo-500/20 group-hover/idle:scale-105"
            >
              <svg className="w-4 h-4 text-zinc-950 fill-current" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
              <span>Assistir Transmissão</span>
            </button>
            <span className="text-[10px] text-zinc-500 mt-2.5">
              Clique para receber o fluxo de vídeo e áudio sem pesar sua rede
            </span>
          </div>
        ) : (
          /* Container do Vídeo + HUD */
          <div
            ref={containerRef}
            className={`${
              isFullscreen
                ? 'fixed inset-0 z-50 w-screen h-screen bg-black flex items-center justify-center group overflow-hidden'
                : 'relative w-full h-full bg-black flex items-center justify-center group overflow-hidden'
            }`}
          >
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={isMuted}
            onVolumeChange={(e) => {
              const el = e.currentTarget;
              if (el.muted !== isMutedRef.current) setIsMuted(el.muted);
              if (Math.abs(el.volume - volumeRef.current) > 0.01) setVolume(el.volume);
            }}
            className="w-full h-full object-contain"
          />

          {/* HUD de Telemetria Flutuante (Bitrate / FPS / Resolução / Ping RTT / Packet Loss) */}
          <div className="absolute top-2.5 sm:top-3 left-2.5 sm:left-3 bg-black/80 backdrop-blur-md px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl border border-white/10 flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-[11px] font-mono select-none z-20 pointer-events-none shadow-2xl flex-wrap max-w-[90%]">
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

            {/* Latência RTT / Ping em Tempo Real */}
            {typeof stats.rtt === 'number' && (
              <>
                <span className="text-zinc-600">·</span>
                <span className="flex items-center gap-1 text-emerald-400 font-medium" title="Latência de ida e volta (RTT / Ping)">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  {stats.rtt} ms
                </span>
              </>
            )}

            {/* Perda de Pacotes (Packet Loss %) */}
            {typeof stats.packetLoss === 'number' && stats.packetLoss > 0 && (
              <>
                <span className="text-zinc-600">·</span>
                <span className="text-rose-400 font-medium" title="Perda de Pacotes">
                  {stats.packetLoss}% loss
                </span>
              </>
            )}
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
        )}
      </div>
    </div>
  );
}