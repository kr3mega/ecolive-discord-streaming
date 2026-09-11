'use client';

import { useState } from 'react';
import { useLiveKit } from '@/hooks/useLiveKit';
import { VideoPlayer } from '@/components/VideoPlayer';

export default function Home() {
  const [roomName, setRoomName] = useState('call-principal');
  const [username, setUsername] = useState('');
  const {
    isConnected,
    isScreenSharing,
    remoteFeeds,
    connect,
    disconnect,
    toggleScreenShare,
    setQuality,
  } = useLiveKit();

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;
    await connect(roomName, username);
  };

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 p-6 flex flex-col items-center">
      <header className="w-full max-w-5xl flex justify-between items-center pb-4 border-b border-zinc-800 mb-6">
        <div>
          <h1 className="text-lg font-bold">Discord Stream Engine (Local SFU)</h1>
          <p className="text-xs text-zinc-400">Validação de Simulcast e Baixa Latência</p>
        </div>
        {isConnected && (
          <div className="flex gap-2">
            <button
              onClick={toggleScreenShare}
              className={`px-3 py-1.5 rounded text-xs font-semibold transition ${
                isScreenSharing ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700'
              }`}
            >
              {isScreenSharing ? 'Parar Compartilhamento' : 'Transmitir Tela (1080p60)'}
            </button>
            <button
              onClick={disconnect}
              className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-xs font-medium rounded transition"
            >
              Desconectar
            </button>
          </div>
        )}
      </header>

      {!isConnected ? (
        <form onSubmit={handleJoin} className="bg-zinc-900 border border-zinc-800 p-6 rounded-lg w-full max-w-sm space-y-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-400 mb-1">Canal de Voz / Sala</label>
            <input
              type="text"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-400 mb-1">Seu Nickname</label>
            <input
              type="text"
              value={username}
              placeholder="ex: player1"
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none"
              required
            />
          </div>
          <button
            type="submit"
            className="w-full bg-indigo-600 hover:bg-indigo-700 font-semibold py-2 rounded text-sm transition"
          >
            Entrar
          </button>
        </form>
      ) : (
        <section className="w-full max-w-5xl">
          {remoteFeeds.length === 0 ? (
            <div className="text-center py-16 border border-dashed border-zinc-800 rounded-lg text-zinc-500 text-sm">
              Conectado como <strong className="text-zinc-300">{username}</strong>. Abra uma nova aba para transmitir ou assistir.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {remoteFeeds.map((feed) => (
                <VideoPlayer
                  key={feed.publication.trackSid}
                  publication={feed.publication}
                  identity={feed.participantIdentity}
                  onQualityChange={setQuality}
                />
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  );
}