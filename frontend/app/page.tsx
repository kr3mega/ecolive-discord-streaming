'use client';

import { useState } from 'react';
import { useLiveKit } from '@/hooks/useLiveKit';
import { VideoPlayer } from '@/components/VideoPlayer';

interface WhipCredentials {
  serverUrl: string;
  streamKey: string;
  whipEndpoint: string;
  channelId: string;
  participantIdentity: string;
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<'playweb' | 'obs'>('playweb');
  const [channelId, setChannelId] = useState('call-discord-alpha');
  const [userId, setUserId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  // Estados do OBS WHIP
  const [isGeneratingWhip, setIsGeneratingWhip] = useState(false);
  const [whipCredentials, setWhipCredentials] = useState<WhipCredentials | null>(null);
  const [whipError, setWhipError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [isObsModalOpen, setIsObsModalOpen] = useState(false);

  const {
    isConnected,
    isScreenSharing,
    remoteFeeds,
    currentIdentity,
    currentRoom,
    connect,
    disconnect,
    toggleScreenShare,
    setQuality,
  } = useLiveKit();

  const handleJoin = async (e?: React.SyntheticEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!channelId.trim() || !userId.trim()) {
      setJoinError('Por favor, informe o Canal de Voz e o ID do Usuário.');
      return;
    }

    setIsJoining(true);
    setJoinError(null);
    try {
      await connect(channelId.trim(), userId.trim(), 'web', displayName.trim() || undefined);
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : 'Falha ao conectar à sala.');
    } finally {
      setIsJoining(false);
    }
  };

  const handleGenerateWhip = async (e?: React.SyntheticEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!channelId.trim() || !userId.trim()) {
      setWhipError('Por favor, informe o Canal de Voz e o ID do Usuário.');
      return;
    }

    setIsGeneratingWhip(true);
    setWhipError(null);
    try {
      const res = await fetch('/api/ingress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelId: channelId.trim(),
          userId: userId.trim(),
          name: displayName.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Falha ao gerar credenciais WHIP.');
      }

      const data: WhipCredentials = await res.json();
      setWhipCredentials(data);
    } catch (err) {
      setWhipError(err instanceof Error ? err.message : 'Falha ao contatar serviço Ingress WHIP.');
    } finally {
      setIsGeneratingWhip(false);
    }
  };

  const copyToClipboard = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2500);
  };

  return (
    <main className="min-h-screen bg-[#0d0e12] text-zinc-100 flex flex-col items-center selection:bg-indigo-600/40">
      {/* Barra de Navegação Superior */}
      <header className="w-full border-b border-zinc-800/80 bg-zinc-950/70 backdrop-blur-md sticky top-0 z-30 px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-emerald-500 to-indigo-600 flex items-center justify-center font-black text-sm text-white shadow-lg shadow-emerald-500/20">
            🍃
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold tracking-tight text-zinc-100">EcoLive</h1>
              <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
                v0.3.0 • OBS 120 FPS
              </span>
            </div>
            <p className="text-[11px] text-zinc-400">WebRTC SFU Descentralizado • Latência Ultra-Baixa & WHIP Ingest</p>
          </div>
        </div>

        {isConnected && (
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 text-xs bg-zinc-900 border border-zinc-800 px-3 py-1.5 rounded-lg">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-zinc-400">Canal:</span>
              <strong className="text-zinc-200 font-mono text-[11px]">{currentRoom}</strong>
              <span className="text-zinc-600">|</span>
              <span className="text-zinc-400">ID:</span>
              <strong className="text-zinc-200 font-mono text-[11px]">{currentIdentity}</strong>
            </div>

            {/* Ação: Abrir modal de credenciais OBS quando já conectado */}
            <button
              onClick={() => setIsObsModalOpen(true)}
              className="px-3 py-1.5 bg-purple-950/60 hover:bg-purple-900/60 text-purple-300 border border-purple-700/40 text-xs font-semibold rounded-lg transition flex items-center gap-1.5 shadow-sm"
              title="Obter credenciais para transmitir via OBS Studio nesta sala"
            >
              <span>🎥 Transmitir via OBS</span>
            </button>

            {/* Ação Primária: Compartilhamento de Tela Casual no Navegador */}
            <button
              onClick={toggleScreenShare}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition shadow-md ${
                isScreenSharing
                  ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-900/30'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-900/30'
              }`}
            >
              {isScreenSharing ? (
                <>
                  <span className="h-2 w-2 rounded-full bg-white animate-ping" />
                  Parar Transmissão
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  Transmitir Navegador (60fps)
                </>
              )}
            </button>

            <button
              onClick={disconnect}
              className="px-3 py-1.5 bg-zinc-800/80 hover:bg-zinc-700 text-xs font-medium text-zinc-300 hover:text-white rounded-lg transition"
            >
              Sair da Sala
            </button>
          </div>
        )}
      </header>

      {/* Conteúdo Central */}
      <div className="w-full max-w-7xl px-6 py-8 flex-1 flex flex-col">
        {!isConnected ? (
          /* Hub de Acesso: Alternador entre PlayWeb Casual e OBS Studio 120 FPS */
          <div className="max-w-xl w-full mx-auto my-auto flex flex-col gap-5">
            {/* Tabs de Seleção de Modalidade */}
            <div className="grid grid-cols-2 gap-2 bg-zinc-900/90 border border-zinc-800 p-1.5 rounded-xl">
              <button
                type="button"
                onClick={() => setActiveTab('playweb')}
                className={`py-2 px-3 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-2 cursor-pointer ${
                  activeTab === 'playweb'
                    ? 'bg-zinc-800 text-emerald-400 shadow-md'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <span>🌐 PlayWeb Casual</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-zinc-700 text-zinc-300">60 FPS</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('obs')}
                className={`py-2 px-3 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-2 cursor-pointer ${
                  activeTab === 'obs'
                    ? 'bg-purple-950/80 border border-purple-600/40 text-purple-300 shadow-md shadow-purple-950/40'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <span>🎥 OBS Studio WHIP</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-purple-500/20 text-cyan-300 font-mono">120 FPS ⚡</span>
              </button>
            </div>

            {/* Painel da Modalidade 1: PlayWeb Casual */}
            {activeTab === 'playweb' && (
              <div className="bg-zinc-900/90 border border-zinc-800 p-6 rounded-2xl shadow-2xl backdrop-blur-sm">
                <div className="mb-5">
                  <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider">Modalidade 1 • Direto pelo Navegador</span>
                  <h2 className="text-xl font-bold text-zinc-100 mt-1">Conectar ao Canal de Transmissão</h2>
                  <p className="text-xs text-zinc-400 mt-1">
                    Zero instalações. Compartilhe sua tela e áudio nativamente com aceleração de hardware e Simulcast dinâmico (360p, 720p60, 1080p60).
                  </p>
                </div>

                {joinError && (
                  <div className="mb-4 p-3 rounded-lg bg-rose-950/60 border border-rose-800/50 text-xs text-rose-300">
                    {joinError}
                  </div>
                )}

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleJoin(e);
                  }}
                  className="space-y-4"
                >
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                      ID do Canal de Voz (Discord channel_id)
                    </label>
                    <input
                      type="text"
                      value={channelId}
                      onChange={(e) => setChannelId(e.target.value)}
                      placeholder="ex: call-jogos-01"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3.5 py-2.5 text-sm text-zinc-100 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition font-mono"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                      ID do Usuário Discord (Discord User ID)
                    </label>
                    <input
                      type="text"
                      value={userId}
                      onChange={(e) => setUserId(e.target.value)}
                      placeholder="ex: 394829103849 ou seu nick"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3.5 py-2.5 text-sm text-zinc-100 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition font-mono"
                      required
                    />
                    <span className="text-[11px] text-zinc-500 mt-1 block">
                      Identificador de sessão: <code className="text-zinc-400">user_{userId || '[ID]'}</code>
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                      Nome de Exibição (Opcional)
                    </label>
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="ex: Kayque (Streamer)"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3.5 py-2.5 text-sm text-zinc-100 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleJoin(e);
                    }}
                    disabled={isJoining}
                    className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 font-semibold py-2.5 rounded-lg text-sm transition shadow-lg shadow-indigo-600/20 mt-2 cursor-pointer"
                  >
                    {isJoining ? 'Conectando ao SFU...' : 'Conectar à Sala'}
                  </button>
                </form>
              </div>
            )}

            {/* Painel da Modalidade 2 e 3: OBS Studio 120 FPS WHIP */}
            {activeTab === 'obs' && (
              <div className="bg-zinc-900/90 border border-purple-900/30 p-6 rounded-2xl shadow-2xl backdrop-blur-sm flex flex-col gap-5">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-purple-400 uppercase tracking-wider">
                      Modalidades 2 & 3 • Ingestão Nativa WHIP
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 border border-cyan-800/60 text-cyan-300 font-bold">
                      ⚡ NVENC 120 FPS UNLOCKED
                    </span>
                  </div>
                  <h2 className="text-xl font-bold text-zinc-100 mt-1">Transmitir via OBS Studio</h2>
                  <p className="text-xs text-zinc-400 mt-1">
                    Gere suas credenciais WHIP para transmitir jogos e telas a <strong>120 FPS reais</strong> usando o chip Turing NVENC da sua GTX 1660 Ti sem pesar na CPU.
                  </p>
                </div>

                {whipError && (
                  <div className="p-3 rounded-lg bg-rose-950/60 border border-rose-800/50 text-xs text-rose-300">
                    {whipError}
                  </div>
                )}

                {/* Formulário para Iniciar Sessão WHIP */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleGenerateWhip(e);
                  }}
                  className="space-y-4"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                        Canal de Voz (Room)
                      </label>
                      <input
                        type="text"
                        value={channelId}
                        onChange={(e) => setChannelId(e.target.value)}
                        placeholder="ex: call-jogos-01"
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-purple-500 font-mono"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                        Seu ID Discord / Nick
                      </label>
                      <input
                        type="text"
                        value={userId}
                        onChange={(e) => setUserId(e.target.value)}
                        placeholder="ex: streamer_kayque"
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-purple-500 font-mono"
                        required
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleGenerateWhip(e);
                    }}
                    disabled={isGeneratingWhip}
                    className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg text-sm transition shadow-lg shadow-purple-900/30 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {isGeneratingWhip ? (
                      'Provisionando Ingress WHIP...'
                    ) : (
                      <>
                        <span>⚡ Gerar Credenciais WHIP para OBS</span>
                      </>
                    )}
                  </button>
                </form>

                {/* Bloco de Credenciais Geradas */}
                {whipCredentials && (
                  <div className="mt-2 bg-zinc-950/80 border border-purple-800/40 rounded-xl p-4 space-y-3.5">
                    <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
                      <span className="text-xs font-bold text-purple-300 flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                        Credenciais Prontas para o OBS Studio
                      </span>
                      <span className="text-[11px] font-mono text-zinc-400">
                        {whipCredentials.participantIdentity}
                      </span>
                    </div>

                    {/* URL do Servidor */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[11px] font-semibold text-zinc-300">
                          1. Servidor WHIP (URL)
                        </label>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(whipCredentials.serverUrl, 'url')}
                          className="text-[11px] text-purple-400 hover:text-purple-300 transition flex items-center gap-1 cursor-pointer"
                        >
                          {copiedField === 'url' ? '✓ Copiado!' : '📋 Copiar Servidor'}
                        </button>
                      </div>
                      <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 font-mono text-xs text-zinc-200 justify-between">
                        <span className="select-all truncate">{whipCredentials.serverUrl}</span>
                      </div>
                    </div>

                    {/* Bearer Token / Chave */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[11px] font-semibold text-zinc-300">
                          2. Chave de Transmissão / Bearer Token
                        </label>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setShowKey(!showKey)}
                            className="text-[11px] text-zinc-400 hover:text-zinc-200 transition cursor-pointer"
                          >
                            {showKey ? '🙈 Ocultar' : '👁️ Revelar'}
                          </button>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(whipCredentials.streamKey, 'key')}
                            className="text-[11px] text-purple-400 hover:text-purple-300 transition flex items-center gap-1 cursor-pointer"
                          >
                            {copiedField === 'key' ? '✓ Copiado!' : '📋 Copiar Chave'}
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 font-mono text-xs text-zinc-200 justify-between">
                        <span className="select-all truncate">
                          {showKey ? whipCredentials.streamKey : '••••••••••••••••••••••••'}
                        </span>
                      </div>
                    </div>

                    {/* Botão de Atalho para Assistir na mesma aba */}
                    <div className="pt-2 border-t border-zinc-800 flex items-center justify-between">
                      <span className="text-[11px] text-zinc-400">
                        Após iniciar no OBS, entre na sala para monitorar seu stream:
                      </span>
                      <button
                        type="button"
                        onClick={handleJoin}
                        className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 shadow-md shadow-emerald-900/20"
                      >
                        <span>Entrar e Assistir Stream</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Guia Rápido de Configuração do OBS */}
                <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-xl p-4 text-xs space-y-2 text-zinc-300">
                  <div className="font-semibold text-zinc-200 flex items-center gap-1.5 text-xs">
                    <span>⚙️</span> Passo a Passo no OBS Studio (30.0+):
                  </div>
                  <ol className="list-decimal list-inside space-y-1.5 text-[11px] text-zinc-400">
                    <li>
                      Abra o OBS ➔ <strong>Configurações</strong> ➔ <strong>Transmissão</strong>. Em <span className="text-zinc-200 font-semibold">Serviço</span>, selecione <strong className="text-purple-300">WHIP</strong>.
                    </li>
                    <li>
                      Cole o <span className="text-zinc-200 font-semibold">Servidor</span> e a <span className="text-zinc-200 font-semibold">Chave/Bearer Token</span> gerados acima.
                    </li>
                    <li>
                      Para desbloquear <strong className="text-cyan-300">120 FPS</strong>: Vá em <strong>Vídeo</strong> ➔ mude FPS para <span className="text-zinc-200 font-semibold">Valores Inteiros de FPS</span> e digite <strong className="text-cyan-300">120</strong>.
                    </li>
                    <li>
                      Em <strong>Saída</strong>: selecione codificador <strong className="text-emerald-300">NVIDIA NVENC H.264</strong> e perfil <span className="text-zinc-200 font-semibold">Ultra Baixa Latência</span>.
                    </li>
                    <li>Clique em <strong className="text-white">Iniciar Transmissão</strong> no OBS!</li>
                  </ol>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Grid Multi Stream: Concorrência e Mosaico de Transmissões */
          <div className="flex flex-col gap-6 flex-1">
            {/* Notificação de Transmissão Ativa Local */}
            {isScreenSharing && (
              <div className="bg-emerald-950/40 border border-emerald-800/50 rounded-xl p-4 flex items-center justify-between text-xs">
                <div className="flex items-center gap-3">
                  <span className="h-3 w-3 rounded-full bg-emerald-400 animate-ping" />
                  <div>
                    <span className="font-semibold text-emerald-200">Você está transmitindo pelo navegador</span>
                    <p className="text-zinc-400 text-[11px]">
                      Simulcast ativo com 3 camadas (360p, 720p60, 1080p60). Os espectadores recebem a resolução otimizada via Dynacast.
                    </p>
                  </div>
                </div>
                <button
                  onClick={toggleScreenShare}
                  className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-medium rounded-lg transition cursor-pointer"
                >
                  Parar
                </button>
              </div>
            )}

            {/* Grid Mosaico Dinâmico */}
            {remoteFeeds.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-12 border-2 border-dashed border-zinc-800/80 rounded-2xl text-center bg-zinc-900/20">
                <div className="h-12 w-12 rounded-full bg-zinc-800/80 flex items-center justify-center text-xl mb-3">
                  📺
                </div>
                <h3 className="text-sm font-semibold text-zinc-200">Aguardando transmissões na sala</h3>
                <p className="text-xs text-zinc-400 max-w-sm mt-1 mb-4">
                  Conectado no canal <strong className="text-zinc-300 font-mono">{currentRoom}</strong> como <strong className="text-zinc-300 font-mono">{currentIdentity}</strong>.
                </p>

                <div className="flex items-center gap-3">
                  {!isScreenSharing && (
                    <button
                      onClick={toggleScreenShare}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg shadow-lg shadow-indigo-600/20 transition flex items-center gap-2 cursor-pointer"
                    >
                      <span>Transmitir Tela pelo Navegador</span>
                    </button>
                  )}

                  <button
                    onClick={() => setIsObsModalOpen(true)}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold rounded-lg shadow-lg shadow-purple-900/30 transition flex items-center gap-2 cursor-pointer"
                  >
                    <span>Transmitir via OBS (120 FPS)</span>
                  </button>
                </div>

                <span className="text-[11px] text-zinc-500 mt-4 max-w-md leading-relaxed">
                  Inicie uma transmissão no OBS Studio usando o protocolo WHIP ou transmita a tela do seu navegador. O stream aparecerá automaticamente em alta fidelidade.
                </span>
              </div>
            ) : (
              <div
                className={`grid gap-4 w-full ${
                  remoteFeeds.length === 1
                    ? 'grid-cols-1 max-w-5xl mx-auto'
                    : remoteFeeds.length === 2
                    ? 'grid-cols-1 lg:grid-cols-2'
                    : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3'
                }`}
              >
                {remoteFeeds.map((feed) => (
                  <VideoPlayer
                    key={feed.publication.trackSid}
                    publication={feed.publication}
                    participantIdentity={feed.participantIdentity}
                    participantName={feed.participantName}
                    isObs={feed.isObs}
                    onSetQuality={(q) => setQuality(feed.publication, q)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal de Credenciais OBS quando o usuário já está na sala */}
      {isObsModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-purple-800/50 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">🎥</span>
                <h3 className="text-base font-bold text-zinc-100">Transmitir com OBS Studio (WHIP)</h3>
              </div>
              <button
                onClick={() => setIsObsModalOpen(false)}
                className="text-zinc-400 hover:text-white text-sm p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed">
              Você está na sala <strong className="text-zinc-100 font-mono">{currentRoom || channelId}</strong>. Gere as credenciais WHIP para injetar seu jogo ou tela a <strong className="text-cyan-300">120 FPS</strong> diretamente pelo OBS.
            </p>

            <button
              type="button"
              onClick={handleGenerateWhip}
              disabled={isGeneratingWhip}
              className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg text-xs transition shadow-lg shadow-purple-900/30 cursor-pointer"
            >
              {isGeneratingWhip ? 'Gerando Credenciais...' : '⚡ Gerar Novas Credenciais WHIP'}
            </button>

            {whipCredentials && (
              <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3.5 space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-1 text-[11px]">
                    <span className="text-zinc-400 font-semibold">Servidor WHIP</span>
                    <button
                      onClick={() => copyToClipboard(whipCredentials.serverUrl, 'modal_url')}
                      className="text-purple-400 hover:text-purple-300"
                    >
                      {copiedField === 'modal_url' ? '✓ Copiado!' : 'Copiar'}
                    </button>
                  </div>
                  <div className="bg-zinc-900 px-3 py-1.5 rounded font-mono text-xs text-zinc-200">
                    {whipCredentials.serverUrl}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1 text-[11px]">
                    <span className="text-zinc-400 font-semibold">Chave de Transmissão / Bearer Token</span>
                    <button
                      onClick={() => copyToClipboard(whipCredentials.streamKey, 'modal_key')}
                      className="text-purple-400 hover:text-purple-300"
                    >
                      {copiedField === 'modal_key' ? '✓ Copiado!' : 'Copiar'}
                    </button>
                  </div>
                  <div className="bg-zinc-900 px-3 py-1.5 rounded font-mono text-xs text-zinc-200 select-all">
                    {whipCredentials.streamKey}
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setIsObsModalOpen(false)}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold rounded-lg text-zinc-200 cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}