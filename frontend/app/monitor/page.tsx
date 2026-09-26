'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

interface ParticipantSummary {
  identity: string;
  cleanId: string;
  name: string;
  avatar?: string;
  isObs: boolean;
  isPublisher: boolean;
  hasVideo: boolean;
  hasAudio: boolean;
  tracksCount: number;
  joinedAt: number;
}

interface StreamSummary {
  streamerName: string;
  identity: string;
  cleanId: string;
  isObs: boolean;
  hasVideo: boolean;
  hasAudio: boolean;
  resolution?: string;
}

interface RoomDetail {
  roomId: string;
  channelName: string;
  guildId?: string;
  participantsCount: number;
  participants: ParticipantSummary[];
  streams: StreamSummary[];
  createdAt: number;
}

interface GuildReport {
  id: string;
  name: string;
  owner: string;
  tag: string;
  badgeColor: 'indigo' | 'emerald' | 'amber';
  status: 'active' | 'paused' | 'inactive';
  monthlyPrice: number;
  paymentNotes?: string;
  isActive: boolean;
  activeRoomsCount: number;
  totalConnectedUsers: number;
  totalActiveStreams: number;
  rooms: RoomDetail[];
}

interface BandwidthStats {
  currentMbps: number;
  rxMbps: number;
  txMbps: number;
  maxMbps: number;
  percent: number;
  totalUsedGB: number;
  totalQuotaTB: number;
  quotaPercent: number;
  remainingGB: number;
  remainingPercent: number;
  interface: string;
}

interface BlockedAttempt {
  guildId: string;
  channelId?: string;
  timestamp: number;
  ip?: string;
}

interface GuildAuditRecord {
  guildId: string;
  guildName: string;
  owner: string;
  tag: string;
  badgeColor: 'indigo' | 'emerald' | 'amber';
  totalBytes: number;
  totalGB: number;
  totalMB: number;
  quotaPercent: number;
  currentBitrateMbps: number;
  peakBitrateMbps: number;
  activeStreamsCount: number;
  activeViewersCount: number;
  totalStreamingSeconds: number;
  estimatedCostBRL: number;
  monthlyFeeBRL: number;
  netMarginBRL: number;
  cycleStartDate: string;
  lastActiveTimestamp: number;
}

interface AuditDatabase {
  version: string;
  lastUpdated: number;
  totalVpsQuotaTB: number;
  vpsCostBRL: number;
  guilds: Record<string, GuildAuditRecord>;
}

interface MonitorData {
  timestamp: number;
  bandwidth: BandwidthStats;
  guilds: GuildReport[];
  audit?: AuditDatabase;
  unmappedRooms: RoomDetail[];
  blockedAttempts: BlockedAttempt[];
  summary: {
    totalRoomsActive: number;
    totalConnectedUsers: number;
    totalActiveStreams: number;
    currentThroughputMbps: number;
    quotaUsedGB: number;
    quotaTotalTB: number;
    quotaPercent: number;
    remainingQuotaGB: number;
  };
}

export default function MonitorPage() {
  const [data, setData] = useState<MonitorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Estados do Modal de Cadastro / Edição de Servidor
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingGuild, setEditingGuild] = useState<GuildReport | null>(null);
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    owner: '',
    tag: 'Servidor Parceiro',
    badgeColor: 'emerald' as 'indigo' | 'emerald' | 'amber',
    status: 'active' as 'active' | 'paused' | 'inactive',
    monthlyPrice: '25.00',
    paymentNotes: '',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const handleLockSession = async () => {
    try {
      await fetch('/api/admin/logout', { method: 'POST' });
    } catch {}
    window.location.href = '/';
  };

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/status');
      if (res.status === 401) {
        window.location.href = '/';
        return;
      }
      if (res.ok) {
        const json = await res.json();
        setData(json);
        setLastUpdated(new Date());
      }
    } catch (err) {
      console.warn('Falha ao obter telemetria:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    if (!autoRefresh) return;
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchData]);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const showNotification = (text: string, type: 'success' | 'error' = 'success') => {
    setActionMessage({ text, type });
    setTimeout(() => setActionMessage(null), 3500);
  };

  // Zerar contadores de consumo de rede de um servidor
  const handleResetAuditCycle = async (guildId: string, guildName: string) => {
    if (!window.confirm(`Deseja zerar os contadores de consumo de rede do servidor "${guildName}" para o início do novo ciclo mensal?`)) {
      return;
    }

    try {
      const res = await fetch('/api/admin/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset_cycle', guildId }),
      });

      if (res.ok) {
        showNotification(`Ciclo de rede do servidor "${guildName}" zerado com sucesso!`);
        fetchData();
      } else {
        showNotification('Falha ao zerar ciclo.', 'error');
      }
    } catch {
      showNotification('Erro de comunicação ao zerar ciclo.', 'error');
    }
  };

  // Alternar rapidamente status do servidor (Pausar / Ativar)
  const handleToggleStatus = async (guild: GuildReport) => {
    const newStatus = guild.status === 'active' ? 'paused' : 'active';
    try {
      const res = await fetch('/api/admin/guilds', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: guild.id, status: newStatus }),
      });
      if (res.ok) {
        showNotification(
          newStatus === 'paused'
            ? `Servidor "${guild.name}" pausado com sucesso!`
            : `Acesso liberado para "${guild.name}"!`
        );
        fetchData();
      } else {
        showNotification('Falha ao alterar status do servidor.', 'error');
      }
    } catch {
      showNotification('Erro de rede ao alterar status.', 'error');
    }
  };

  // Abrir modal para novo servidor
  const handleOpenNewModal = () => {
    setEditingGuild(null);
    setFormData({
      id: '',
      name: '',
      owner: '',
      tag: 'Servidor Parceiro',
      badgeColor: 'emerald',
      status: 'active',
      monthlyPrice: '25.00',
      paymentNotes: '',
    });
    setIsModalOpen(true);
  };

  // Abrir modal para editar servidor existente
  const handleOpenEditModal = (guild: GuildReport) => {
    setEditingGuild(guild);
    setFormData({
      id: guild.id,
      name: guild.name,
      owner: guild.owner,
      tag: guild.tag,
      badgeColor: guild.badgeColor,
      status: guild.status,
      monthlyPrice: String(guild.monthlyPrice || '25.00'),
      paymentNotes: guild.paymentNotes || '',
    });
    setIsModalOpen(true);
  };

  // Salvar servidor (novo ou editado)
  const handleSaveGuild = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.id.trim() || !formData.name.trim() || !formData.owner.trim()) {
      showNotification('Preencha os campos obrigatórios (Guild ID, Nome e Responsável).', 'error');
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch('/api/admin/guilds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: formData.id.trim(),
          name: formData.name.trim(),
          owner: formData.owner.trim(),
          tag: formData.tag.trim(),
          badgeColor: formData.badgeColor,
          status: formData.status,
          monthlyPrice: parseFloat(formData.monthlyPrice) || 0,
          paymentNotes: formData.paymentNotes.trim(),
        }),
      });

      if (res.ok) {
        showNotification(editingGuild ? 'Servidor atualizado com sucesso!' : 'Novo servidor cadastrado e liberado!');
        setIsModalOpen(false);
        fetchData();
      } else {
        const err = await res.json().catch(() => ({}));
        showNotification(err.error || 'Erro ao salvar servidor.', 'error');
      }
    } catch {
      showNotification('Erro de rede ao salvar servidor.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Remover servidor da whitelist
  const handleDeleteGuild = async (guild: GuildReport) => {
    if (guild.id === '1506471002757140660') {
      showNotification('O servidor matriz (Amigos Amor) não pode ser removido.', 'error');
      return;
    }

    const confirmed = window.confirm(`Tem certeza que deseja remover o servidor "${guild.name}" da whitelist? Usuários deste servidor perderão o acesso imediatamente.`);
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/admin/guilds?id=${encodeURIComponent(guild.id)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        showNotification(`Servidor "${guild.name}" removido da whitelist.`);
        fetchData();
      } else {
        showNotification('Falha ao remover servidor.', 'error');
      }
    } catch {
      showNotification('Erro de rede ao remover servidor.', 'error');
    }
  };

  const formatTimeAgo = (timestamp: number) => {
    const diffSec = Math.floor((Date.now() - timestamp) / 1000);
    if (diffSec < 60) return `${diffSec}s atrás`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m atrás`;
    const diffHours = Math.floor(diffMin / 60);
    return `${diffHours}h atrás`;
  };

  const bandwidth = data?.bandwidth;
  const isCloseToQuotaLimit = (bandwidth?.quotaPercent || 0) >= 80;
  const isMediumQuota = (bandwidth?.quotaPercent || 0) >= 65;

  return (
    <main className="min-h-screen bg-[#090a0d] text-zinc-100 flex flex-col selection:bg-indigo-600/40">
      {/* Top Navbar */}
      <header className="border-b border-zinc-800/80 bg-[#0c0d12]/90 sticky top-0 z-40 px-4 sm:px-8 py-3.5 flex flex-wrap items-center justify-between gap-3 shadow-lg backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-600/20">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm sm:text-base font-bold text-zinc-100 tracking-tight">Console de Monitoramento</h1>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700/80">
                Admin Privado
              </span>
            </div>
            <p className="text-[11px] text-zinc-400">Gestão de Servidores, Cobrança Pix e Cota de VPS</p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleOpenNewModal}
            className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-xs font-semibold text-white shadow-lg shadow-indigo-600/20 transition flex items-center gap-1.5 cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span>Adicionar Servidor</span>
          </button>

          <button
            type="button"
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition flex items-center gap-1.5 ${
              autoRefresh
                ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500/40 hover:bg-indigo-600/30'
                : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200'
            }`}
            title="Atualizar automaticamente a cada 3 segundos"
          >
            <span className={`h-1.5 w-1.5 rounded-full ${autoRefresh ? 'bg-indigo-400 animate-ping' : 'bg-zinc-500'}`} />
            <span>Auto (3s)</span>
          </button>

          <button
            type="button"
            onClick={fetchData}
            className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 active:scale-95 text-xs font-semibold text-zinc-200 border border-zinc-700/80 transition flex items-center gap-1.5 cursor-pointer"
          >
            <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span>Atualizar</span>
          </button>

          <Link
            href="/"
            className="px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-xs font-medium text-zinc-400 hover:text-zinc-200 border border-zinc-800 transition"
          >
            Voltar ao App
          </Link>

          <button
            type="button"
            onClick={handleLockSession}
            title="Trancar painel e encerrar sessão"
            className="px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-red-950/40 text-xs font-medium text-zinc-400 hover:text-red-300 border border-zinc-800 hover:border-red-900/60 transition flex items-center gap-1.5 cursor-pointer"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <span>Trancar</span>
          </button>
        </div>
      </header>

      {/* Toast de Notificação */}
      {actionMessage && (
        <div className={`fixed bottom-5 right-5 z-50 px-4 py-3 rounded-2xl shadow-2xl border text-xs font-semibold flex items-center gap-2 animate-in fade-in slide-in-from-bottom-3 ${
          actionMessage.type === 'success'
            ? 'bg-emerald-950/90 text-emerald-200 border-emerald-700/80'
            : 'bg-rose-950/90 text-rose-200 border-rose-700/80'
        }`}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{actionMessage.text}</span>
        </div>
      )}

      <div className="max-w-7xl w-full mx-auto p-4 sm:p-8 space-y-6 flex-1">
        {/* Banner de Aviso para Migração KronicHost */}
        {isCloseToQuotaLimit ? (
          <div className="p-4 rounded-2xl bg-rose-950/40 border border-rose-800/80 flex items-center gap-3 text-rose-300 shadow-xl">
            <div className="p-2 rounded-xl bg-rose-900/60 text-rose-200 shrink-0">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="flex-1">
              <h4 className="text-sm font-bold text-rose-200">Cota Crítica: Prepare a Migração para a KronicHost!</h4>
              <p className="text-xs text-rose-300/90 mt-0.5">
                O consumo do link já ultrapassou {bandwidth?.quotaPercent}%. A cota restante é de apenas {bandwidth?.remainingGB} GB antes da renovação.
              </p>
            </div>
          </div>
        ) : isMediumQuota ? (
          <div className="p-4 rounded-2xl bg-amber-950/30 border border-amber-800/60 flex items-center gap-3 text-amber-300 shadow-lg">
            <div className="p-2 rounded-xl bg-amber-900/60 text-amber-200 shrink-0">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="flex-1">
              <h4 className="text-sm font-bold text-amber-200">Atenção ao Consumo de Cota</h4>
              <p className="text-xs text-amber-300/90 mt-0.5">
                Você consumiu {bandwidth?.totalUsedGB} GB de 2.0 TB ({bandwidth?.quotaPercent}%). Restam {bandwidth?.remainingGB} GB disponíveis nesta VPS.
              </p>
            </div>
          </div>
        ) : null}

        {/* 4 Cards de Métricas Gerais de Infraestrutura */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 1. Tráfego Atual */}
          <div className="bg-zinc-900/80 border border-zinc-800/80 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
            <div className="flex items-center justify-between text-zinc-400 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Tráfego Atual</span>
              <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                Link 1 Gbps
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-zinc-100 font-mono tracking-tight">
                {bandwidth ? bandwidth.currentMbps.toFixed(1) : '0.0'}
              </span>
              <span className="text-sm font-semibold text-zinc-400 font-mono">Mbps</span>
            </div>
            <div className="mt-3 pt-3 border-t border-zinc-800/80 flex items-center justify-between text-xs text-zinc-400 font-mono">
              <span>Down: {bandwidth?.rxMbps || 0} Mbps</span>
              <span className="text-zinc-600">|</span>
              <span>Up: {bandwidth?.txMbps || 0} Mbps</span>
            </div>
          </div>

          {/* 2. Cota Total da VPS (2 TB) */}
          <div className="bg-zinc-900/80 border border-zinc-800/80 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
            <div className="flex items-center justify-between text-zinc-400 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Cota de Tráfego</span>
              <span className="text-[11px] font-mono text-zinc-400">Total: 2.0 TB</span>
            </div>
            <div>
              <div className="flex items-baseline justify-between mb-1.5">
                <span className="text-2xl font-black text-zinc-100 font-mono">
                  {bandwidth?.totalUsedGB || 0} GB
                </span>
                <span className={`text-xs font-bold font-mono ${
                  isCloseToQuotaLimit ? 'text-rose-400' : isMediumQuota ? 'text-amber-400' : 'text-emerald-400'
                }`}>
                  {bandwidth?.quotaPercent || 0}%
                </span>
              </div>
              <div className="w-full h-2 bg-zinc-950 rounded-full overflow-hidden border border-zinc-800">
                <div
                  className={`h-full transition-all duration-500 rounded-full ${
                    isCloseToQuotaLimit
                      ? 'bg-gradient-to-r from-amber-500 to-rose-500'
                      : 'bg-gradient-to-r from-emerald-500 to-indigo-500'
                  }`}
                  style={{ width: `${Math.min(100, bandwidth?.quotaPercent || 0)}%` }}
                />
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-zinc-800/80 flex items-center justify-between text-xs text-zinc-400 font-mono">
              <span>Restante:</span>
              <strong className="text-zinc-200">{bandwidth?.remainingGB || 2000} GB ({bandwidth?.remainingPercent || 100}%)</strong>
            </div>
          </div>

          {/* 3. Servidores Ativos */}
          <div className="bg-zinc-900/80 border border-zinc-800/80 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
            <div className="flex items-center justify-between text-zinc-400 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Servidores na Whitelist</span>
              <span className="text-[11px] font-mono text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                {data?.guilds.length || 0} cadastrados
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-zinc-100 font-mono">
                {data?.guilds.filter((g) => g.isActive).length || 0}
              </span>
              <span className="text-sm text-zinc-400 font-mono">/ {data?.guilds.filter((g) => g.status === 'active').length || 0} liberados</span>
            </div>
            <div className="mt-3 pt-3 border-t border-zinc-800/80 text-xs text-zinc-400 truncate">
              {data?.guilds.filter((g) => g.status === 'paused').length || 0} pausados por pagamento
            </div>
          </div>

          {/* 4. Mídias & Conexões no Ar */}
          <div className="bg-zinc-900/80 border border-zinc-800/80 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
            <div className="flex items-center justify-between text-zinc-400 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Mídias no Ar</span>
              <span className="text-[11px] font-mono text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                LiveKit SFU
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-zinc-100 font-mono">
                {data?.summary.totalActiveStreams || 0}
              </span>
              <span className="text-sm text-zinc-400 font-mono">streams ativas</span>
            </div>
            <div className="mt-3 pt-3 border-t border-zinc-800/80 flex items-center justify-between text-xs text-zinc-400 font-mono">
              <span>Total Usuários:</span>
              <strong className="text-zinc-200">{data?.summary.totalConnectedUsers || 0} conectados</strong>
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* SEÇÃO: AUDITORIA DE CONSUMO DE REDE POR SERVIDOR (FINOPS) */}
        {/* ========================================================================= */}
        <div className="bg-zinc-900/80 border border-zinc-800/80 rounded-3xl p-6 sm:p-7 shadow-2xl space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-zinc-800/80">
            <div>
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-600/20 text-emerald-400 border border-emerald-500/30">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-zinc-100 tracking-tight">
                    Auditoria de Consumo de Rede por Servidor
                  </h2>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Tráfego acumulado no ciclo, impacto na cota de 2 TB da VPS e viabilidade financeira (custo vs mensalidade).
                  </p>
                </div>
              </div>
            </div>

            <div className="text-right shrink-0">
              <span className="text-xs text-zinc-400">Cota Total do Nó: </span>
              <strong className="text-zinc-200 text-xs font-mono">2.0 TB (2000 GB)</strong>
            </div>
          </div>

          {/* Barra Comparativa de Uso da Cota */}
          {data?.audit && (
            <div className="space-y-2.5 p-4 rounded-2xl bg-zinc-950/60 border border-zinc-800/70">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-zinc-300">Distribuição da Cota de Rede (2 TB)</span>
                <span className="text-zinc-400 font-mono">
                  {data.bandwidth.totalUsedGB} GB usados ({data.bandwidth.quotaPercent}%) • {data.bandwidth.remainingGB} GB livres
                </span>
              </div>

              {/* Stacked Progress Bar */}
              <div className="w-full h-3 rounded-full bg-zinc-800/80 overflow-hidden flex">
                {Object.values(data.audit.guilds).map((g) => {
                  const percent = g.quotaPercent || 0;
                  const color = g.badgeColor === 'emerald' ? 'bg-emerald-500' : 'bg-indigo-500';
                  return percent > 0 ? (
                    <div
                      key={`bar-${g.guildId}`}
                      className={`${color} h-full transition-all duration-500 relative`}
                      style={{ width: `${Math.max(1, percent)}%` }}
                      title={`${g.guildName}: ${g.totalGB} GB (${g.quotaPercent}%)`}
                    />
                  ) : null;
                })}
              </div>

              {/* Legenda da Barra */}
              <div className="flex flex-wrap items-center gap-4 text-[11px] pt-1 text-zinc-400">
                {Object.values(data.audit.guilds).map((g) => (
                  <div key={`legend-${g.guildId}`} className="flex items-center gap-1.5">
                    <span className={`w-2.5 h-2.5 rounded-full ${g.badgeColor === 'emerald' ? 'bg-emerald-500' : 'bg-indigo-500'}`} />
                    <span className="text-zinc-300 font-medium">{g.guildName}:</span>
                    <strong className="text-zinc-100 font-mono">{g.totalGB} GB ({g.quotaPercent}%)</strong>
                  </div>
                ))}
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
                  <span className="text-zinc-400">Overhead / Sistema:</span>
                  <strong className="text-zinc-300 font-mono">
                    {Math.max(0, Math.round((data.bandwidth.totalUsedGB - Object.values(data.audit.guilds).reduce((acc, cur) => acc + cur.totalGB, 0)) * 10) / 10)} GB
                  </strong>
                </div>
              </div>
            </div>
          )}

          {/* Grid de Cards de Auditoria por Guilda */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {data?.audit && Object.values(data.audit.guilds).map((record) => {
              const isMatriz = record.guildId === '1506471002757140660';
              const isPositiveMargin = record.netMarginBRL >= 0;
              const hours = Math.floor(record.totalStreamingSeconds / 3600);
              const mins = Math.floor((record.totalStreamingSeconds % 3600) / 60);

              return (
                <div
                  key={`audit-card-${record.guildId}`}
                  className={`bg-zinc-950/70 border rounded-2xl p-5 shadow-xl transition space-y-4 ${
                    record.currentBitrateMbps > 0
                      ? 'border-emerald-500/40 ring-1 ring-emerald-500/20'
                      : 'border-zinc-800/80 hover:border-zinc-700/80'
                  }`}
                >
                  {/* Cabeçalho do Card */}
                  <div className="flex items-start justify-between gap-3 pb-3 border-b border-zinc-800/70">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 rounded-full ${record.currentBitrateMbps > 0 ? 'bg-emerald-400 animate-ping' : 'bg-zinc-600'}`} />
                        <h3 className="text-base font-bold text-zinc-100 tracking-tight">{record.guildName}</h3>
                      </div>
                      <p className="text-xs text-zinc-400 mt-0.5">
                        Responsável: <strong className="text-zinc-200">{record.owner}</strong> • {record.tag}
                      </p>
                    </div>

                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded border uppercase tracking-wider font-semibold ${
                      record.currentBitrateMbps > 0
                        ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                        : 'bg-zinc-900 text-zinc-400 border-zinc-800'
                    }`}>
                      {record.currentBitrateMbps > 0 ? `${record.currentBitrateMbps.toFixed(1)} Mbps ativo` : 'Inativo no momento'}
                    </span>
                  </div>

                  {/* Estatísticas de Consumo */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center">
                    <div className="p-2.5 rounded-xl bg-zinc-900/80 border border-zinc-800/70">
                      <span className="text-[10px] text-zinc-400 uppercase tracking-wider block">Tráfego no Ciclo</span>
                      <strong className="text-sm font-bold text-zinc-100 font-mono mt-0.5 block">
                        {record.totalGB} GB
                      </strong>
                    </div>

                    <div className="p-2.5 rounded-xl bg-zinc-900/80 border border-zinc-800/70">
                      <span className="text-[10px] text-zinc-400 uppercase tracking-wider block">Impacto na Cota</span>
                      <strong className="text-sm font-bold text-indigo-400 font-mono mt-0.5 block">
                        {record.quotaPercent}%
                      </strong>
                    </div>

                    <div className="p-2.5 rounded-xl bg-zinc-900/80 border border-zinc-800/70">
                      <span className="text-[10px] text-zinc-400 uppercase tracking-wider block">Pico Registrado</span>
                      <strong className="text-sm font-bold text-purple-400 font-mono mt-0.5 block">
                        {record.peakBitrateMbps.toFixed(1)} Mbps
                      </strong>
                    </div>

                    <div className="p-2.5 rounded-xl bg-zinc-900/80 border border-zinc-800/70">
                      <span className="text-[10px] text-zinc-400 uppercase tracking-wider block">Tempo em Live</span>
                      <strong className="text-sm font-bold text-zinc-200 font-mono mt-0.5 block">
                        {hours}h {mins}m
                      </strong>
                    </div>
                  </div>

                  {/* Barra de Progresso da Cota Individual */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] text-zinc-400">
                      <span>Cota consumida pelo servidor:</span>
                      <span className="font-mono text-zinc-300">{record.totalGB} GB de 2000 GB ({record.quotaPercent}%)</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-zinc-800/80 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${record.badgeColor === 'emerald' ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                        style={{ width: `${Math.min(100, Math.max(1, record.quotaPercent * 2))}%` }}
                      />
                    </div>
                  </div>

                  {/* Quadro FinOps / Viabilidade Financeira */}
                  <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800/70 space-y-1.5 text-xs">
                    <div className="flex justify-between text-zinc-400">
                      <span>Mensalidade Acordada:</span>
                      <strong className="text-zinc-200 font-mono">
                        {isMatriz ? 'Isento (Servidor Próprio)' : `R$ ${record.monthlyFeeBRL.toFixed(2).replace('.', ',')}`}
                      </strong>
                    </div>

                    <div className="flex justify-between text-zinc-400">
                      <span>Custo Proporcional de Infraestrutura:</span>
                      <span className="text-zinc-300 font-mono">
                        R$ {record.estimatedCostBRL.toFixed(2).replace('.', ',')}
                      </span>
                    </div>

                    {!isMatriz && (
                      <div className="pt-1.5 border-t border-zinc-800/70 flex justify-between items-center">
                        <span className="font-semibold text-zinc-300">Margem Líquida do Servidor:</span>
                        <strong className={`font-mono text-xs ${isPositiveMargin ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {isPositiveMargin ? '+' : ''} R$ {record.netMarginBRL.toFixed(2).replace('.', ',')}
                          <span className="text-[10px] font-normal text-zinc-400 ml-1">
                            ({isPositiveMargin ? 'Lucro' : 'Déficit'})
                          </span>
                        </strong>
                      </div>
                    )}
                  </div>

                  {/* Rodapé do Card com Ações */}
                  <div className="flex items-center justify-between pt-2 border-t border-zinc-800/70 text-[11px] text-zinc-500">
                    <span>Ciclo iniciado em: <strong className="text-zinc-400 font-mono">{record.cycleStartDate}</strong></span>

                    <button
                      type="button"
                      onClick={() => handleResetAuditCycle(record.guildId, record.guildName)}
                      className="px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-800 transition cursor-pointer flex items-center gap-1"
                      title="Zerar contadores de tráfego deste servidor para o início de um novo mês"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      <span>Zerar Ciclo</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* SEÇÃO 1: GESTÃO DINÂMICA DE SERVIDORES & ASSINATURAS PIX */}
        {/* ========================================================================= */}
        <div className="bg-zinc-900/80 border border-zinc-800/80 rounded-3xl p-6 sm:p-7 shadow-2xl space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-zinc-800/80">
            <div>
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                </div>
                <h2 className="text-base sm:text-lg font-bold text-zinc-100 tracking-tight">Gestão de Servidores & Assinaturas</h2>
              </div>
              <p className="text-xs text-zinc-400 mt-1">
                Adicione novos servidores parceiros, edite mensalidades ou pause o acesso instantaneamente caso o Pix não tenha sido pago.
              </p>
            </div>

            <button
              type="button"
              onClick={handleOpenNewModal}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 active:scale-[0.98] text-xs font-semibold text-white shadow-lg shadow-indigo-600/25 transition flex items-center gap-2 shrink-0 cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span>Novo Servidor</span>
            </button>
          </div>

          {/* Grid de Servidores Cadastrados */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {data?.guilds.map((guild) => {
              const isPaused = guild.status === 'paused';
              const isInactive = guild.status === 'inactive';
              const isMatriz = guild.id === '1506471002757140660';

              return (
                <div
                  key={guild.id}
                  className={`bg-zinc-950/70 border rounded-2xl p-5 shadow-lg flex flex-col justify-between transition-all ${
                    isPaused
                      ? 'border-amber-500/50 bg-amber-950/10 ring-1 ring-amber-500/20'
                      : isInactive
                      ? 'border-zinc-800 opacity-60'
                      : 'border-zinc-800/90 hover:border-zinc-700'
                  }`}
                >
                  <div className="space-y-3.5">
                    {/* Top row */}
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`h-2.5 w-2.5 rounded-full ${
                            isPaused ? 'bg-amber-400' : isInactive ? 'bg-zinc-600' : 'bg-emerald-400 animate-pulse'
                          }`} />
                          <h3 className="text-sm sm:text-base font-bold text-zinc-100 tracking-tight">{guild.name}</h3>
                          <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-zinc-900 border border-zinc-700/80 text-zinc-300">
                            {guild.tag}
                          </span>
                        </div>
                        <p className="text-xs text-zinc-400 mt-1">
                          Responsável: <strong className="text-zinc-200">{guild.owner}</strong>
                        </p>
                      </div>

                      {/* Status Badge */}
                      <span className={`text-[11px] font-bold px-2.5 py-1 rounded-xl border ${
                        isPaused
                          ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                          : isInactive
                          ? 'bg-zinc-800 text-zinc-400 border-zinc-700'
                          : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                      }`}>
                        {isPaused ? 'PAUSADO (PENDENTE)' : isInactive ? 'DESATIVADO' : 'LIBERADO (ATIVO)'}
                      </span>
                    </div>

                    {/* ID e Valor Mensal */}
                    <div className="grid grid-cols-2 gap-3 py-2.5 px-3 rounded-xl bg-zinc-900/60 border border-zinc-800/80 text-xs font-mono">
                      <div>
                        <span className="text-[10px] uppercase text-zinc-500 block">Guild ID:</span>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-zinc-300 truncate select-all">{guild.id}</span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(guild.id, `g-${guild.id}`)}
                            className="text-[10px] text-zinc-500 hover:text-zinc-200"
                            title="Copiar ID"
                          >
                            {copiedId === `g-${guild.id}` ? '✓' : 'Copiar'}
                          </button>
                        </div>
                      </div>

                      <div>
                        <span className="text-[10px] uppercase text-zinc-500 block">Mensalidade:</span>
                        <span className="text-zinc-200 font-bold mt-0.5 block">
                          {guild.monthlyPrice > 0 ? `R$ ${guild.monthlyPrice.toFixed(2)} / mês` : 'Isento (Matriz)'}
                        </span>
                      </div>
                    </div>

                    {/* Notas de Pagamento / Cobrança */}
                    {guild.paymentNotes && (
                      <div className="text-[11px] text-zinc-400 p-2.5 rounded-xl bg-zinc-900/40 border border-zinc-800/60 flex items-start gap-2">
                        <svg className="w-3.5 h-3.5 text-zinc-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                        </svg>
                        <span className="italic">{guild.paymentNotes}</span>
                      </div>
                    )}

                    {/* Aviso se estiver pausado */}
                    {isPaused && (
                      <div className="text-[11px] text-amber-300/90 p-2 rounded-xl bg-amber-950/30 border border-amber-800/50 flex items-center gap-1.5">
                        <svg className="w-3.5 h-3.5 text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <span>Acesso suspenso: Usuários deste servidor verão a tela silenciosa de erro 503.</span>
                      </div>
                    )}
                  </div>

                  {/* Barra de Ações Rápidas */}
                  <div className="mt-4 pt-3 border-t border-zinc-800/80 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(guild)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer flex items-center gap-1.5 ${
                          isPaused
                            ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500/50 shadow-md shadow-emerald-600/20'
                            : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border-amber-500/30'
                        }`}
                        title={isPaused ? 'Reativar e liberar acesso ao servidor' : 'Pausar temporariamente o servidor'}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          {isPaused ? (
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                          ) : (
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          )}
                        </svg>
                        <span>{isPaused ? 'Liberar Acesso' : 'Pausar Acesso'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleOpenEditModal(guild)}
                        className="px-3 py-1.5 rounded-xl text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700/80 transition cursor-pointer"
                      >
                        Editar
                      </button>
                    </div>

                    {!isMatriz && (
                      <button
                        type="button"
                        onClick={() => handleDeleteGuild(guild)}
                        className="px-2.5 py-1.5 rounded-xl text-xs text-zinc-500 hover:text-rose-400 hover:bg-rose-950/20 transition cursor-pointer"
                        title="Remover servidor da whitelist"
                      >
                        Remover
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* SEÇÃO 2: MONITORAMENTO EM TEMPO REAL DE SALAS E PARTICIPANTES */}
        {/* ========================================================================= */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-zinc-100">Atividade em Tempo Real por Servidor</h2>
              <p className="text-xs text-zinc-400">Canais de voz em uso, transmissões ativas e lista de participantes</p>
            </div>
            {lastUpdated && (
              <span className="text-[11px] font-mono text-zinc-500">
                Atualizado: {lastUpdated.toLocaleTimeString()}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {data?.guilds.map((guild) => (
              <div
                key={`activity-${guild.id}`}
                className={`bg-zinc-900/80 border rounded-2xl p-6 shadow-xl transition-all ${
                  guild.isActive ? 'border-indigo-500/40 ring-1 ring-indigo-500/20' : 'border-zinc-800/80'
                }`}
              >
                <div className="flex items-start justify-between gap-4 pb-4 border-b border-zinc-800/80">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`h-2.5 w-2.5 rounded-full ${guild.isActive ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'}`} />
                      <h3 className="text-base font-bold text-zinc-100">{guild.name}</h3>
                    </div>
                    <p className="text-xs text-zinc-400">Responsável: <strong className="text-zinc-200">{guild.owner}</strong></p>
                  </div>

                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-xl border ${
                    guild.isActive
                      ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                      : 'bg-zinc-800 text-zinc-400 border-zinc-700/80'
                  }`}>
                    {guild.isActive ? 'EM CHAMADA' : 'SEM ATIVIDADE'}
                  </span>
                </div>

                <div className="pt-4 space-y-4">
                  {guild.rooms.length === 0 ? (
                    <div className="py-8 text-center text-zinc-500 text-xs bg-zinc-950/40 rounded-xl border border-zinc-800/50">
                      Nenhuma chamada ativa no momento.
                    </div>
                  ) : (
                    guild.rooms.map((room) => (
                      <div key={room.roomId} className="bg-zinc-950/70 border border-zinc-800/90 rounded-xl p-4 space-y-3">
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <div className="p-1.5 rounded-lg bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 100-6 3 3 0 000 6z" />
                              </svg>
                            </div>
                            <div>
                              <strong className="text-zinc-200 font-semibold">Canal: {room.channelName}</strong>
                              <p className="text-[10px] text-zinc-500 font-mono">ID: {room.roomId}</p>
                            </div>
                          </div>
                          <span className="text-[11px] font-mono text-zinc-400 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
                            {room.participantsCount} {room.participantsCount === 1 ? 'usuário' : 'usuários'}
                          </span>
                        </div>

                        {room.streams.length > 0 && (
                          <div className="bg-indigo-950/20 border border-indigo-500/20 rounded-lg p-2.5 text-xs space-y-1.5">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">
                              Transmissões em Andamento ({room.streams.length}):
                            </span>
                            {room.streams.map((stream) => (
                              <div key={stream.identity} className="flex items-center justify-between text-zinc-300 text-[11px]">
                                <div className="flex items-center gap-2">
                                  <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse" />
                                  <span>{stream.streamerName}</span>
                                  <span className="text-[9px] uppercase px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 font-mono">
                                    {stream.isObs ? 'Software Externo' : 'Navegador'}
                                  </span>
                                </div>
                                {stream.resolution && (
                                  <span className="text-zinc-400 font-mono text-[10px]">{stream.resolution}</span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="space-y-1.5 pt-1">
                          <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
                            Participantes Conectados:
                          </span>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {room.participants.map((p) => (
                              <div key={p.identity} className="flex items-center gap-2 p-2 rounded-lg bg-zinc-900/60 border border-zinc-800/60 text-xs">
                                {p.avatar ? (
                                  <img src={p.avatar} alt={p.name} className="w-5 h-5 rounded-full object-cover border border-zinc-700/80 shrink-0" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                                ) : (
                                  <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-[9px] font-bold text-white shrink-0">
                                    {p.name.charAt(0).toUpperCase()}
                                  </div>
                                )}
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5 truncate">
                                    <span className="text-zinc-200 font-medium truncate">{p.name}</span>
                                    {p.isObs && (
                                      <span className="text-[9px] px-1 rounded bg-purple-500/20 text-purple-300 font-mono">
                                        Streamer
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Auditoria de Segurança: Tentativas Bloqueadas */}
        <div className="bg-zinc-900/80 border border-zinc-800/80 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-zinc-100 flex items-center gap-2">
                <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <span>Auditoria de Segurança: Tentativas Bloqueadas</span>
              </h3>
              <p className="text-xs text-zinc-400">Servidores não autorizados ou pausados que caíram na tela neutra de erro 503</p>
            </div>
            <span className="text-xs font-mono text-zinc-500">
              Total: {data?.blockedAttempts.length || 0} registros
            </span>
          </div>

          {(!data?.blockedAttempts || data.blockedAttempts.length === 0) ? (
            <p className="text-xs text-zinc-500 py-4 text-center">
              Nenhuma tentativa de acesso não autorizada registrada recentemente.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-zinc-300 font-mono">
                <thead className="text-[11px] uppercase bg-zinc-950/80 text-zinc-500 border-b border-zinc-800">
                  <tr>
                    <th className="p-2.5">Guild ID</th>
                    <th className="p-2.5">Canal ID</th>
                    <th className="p-2.5">Horário</th>
                    <th className="p-2.5">Resultado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {data.blockedAttempts.map((attempt, idx) => (
                    <tr key={idx} className="hover:bg-zinc-800/40 transition">
                      <td className="p-2.5 text-zinc-200 font-semibold select-all">{attempt.guildId}</td>
                      <td className="p-2.5 text-zinc-400">{attempt.channelId || '-'}</td>
                      <td className="p-2.5 text-zinc-500">{formatTimeAgo(attempt.timestamp)}</td>
                      <td className="p-2.5">
                        <span className="px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700/60 text-[10px]">
                          Bloqueado Silencioso (503)
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODAL DE CADASTRO / EDIÇÃO DE SERVIDOR */}
      {/* ========================================================================= */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-zinc-900 border border-zinc-800 max-w-md w-full rounded-3xl p-6 sm:p-7 shadow-2xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                <h3 className="text-base font-bold text-zinc-100">
                  {editingGuild ? 'Editar Servidor' : 'Adicionar Novo Servidor'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-zinc-500 hover:text-zinc-200 p-1 rounded-lg transition cursor-pointer"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSaveGuild} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                  Guild ID do Discord <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  disabled={!!editingGuild}
                  placeholder="Ex: 1550327956231028817"
                  value={formData.id}
                  onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                  className="w-full bg-zinc-950 border border-zinc-800 disabled:opacity-50 px-3.5 py-2.5 rounded-xl text-xs font-mono text-zinc-200 focus:outline-none focus:border-indigo-500/50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                  Nome do Servidor <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: 6WC2026 Server do Shikomi"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-zinc-950 border border-zinc-800 px-3.5 py-2.5 rounded-xl text-xs text-zinc-200 focus:outline-none focus:border-indigo-500/50"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                    Responsável (Pix) <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Boiaaa"
                    value={formData.owner}
                    onChange={(e) => setFormData({ ...formData, owner: e.target.value })}
                    className="w-full bg-zinc-950 border border-zinc-800 px-3.5 py-2.5 rounded-xl text-xs text-zinc-200 focus:outline-none focus:border-indigo-500/50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                    Valor Mensal (R$)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="25.00"
                    value={formData.monthlyPrice}
                    onChange={(e) => setFormData({ ...formData, monthlyPrice: e.target.value })}
                    className="w-full bg-zinc-950 border border-zinc-800 px-3.5 py-2.5 rounded-xl text-xs font-mono text-zinc-200 focus:outline-none focus:border-indigo-500/50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                    Classificação / Tag
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Servidor Parceiro"
                    value={formData.tag}
                    onChange={(e) => setFormData({ ...formData, tag: e.target.value })}
                    className="w-full bg-zinc-950 border border-zinc-800 px-3.5 py-2.5 rounded-xl text-xs text-zinc-200 focus:outline-none focus:border-indigo-500/50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                    Status de Acesso
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                    className="w-full bg-zinc-950 border border-zinc-800 px-3 py-2.5 rounded-xl text-xs text-zinc-200 focus:outline-none focus:border-indigo-500/50 cursor-pointer"
                  >
                    <option value="active">Liberado (Ativo)</option>
                    <option value="paused">Pausado (Pendente Pix)</option>
                    <option value="inactive">Desativado</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                  Notas de Cobrança / Acordo
                </label>
                <textarea
                  rows={2}
                  placeholder="Ex: Pix de R$ 25,00 mensal. Aguardando confirmação de transferência."
                  value={formData.paymentNotes}
                  onChange={(e) => setFormData({ ...formData, paymentNotes: e.target.value })}
                  className="w-full bg-zinc-950 border border-zinc-800 px-3.5 py-2.5 rounded-xl text-xs text-zinc-200 focus:outline-none focus:border-indigo-500/50"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-300 transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-xs font-semibold text-white shadow-lg shadow-indigo-600/20 transition cursor-pointer disabled:opacity-50"
                >
                  {isSaving ? 'Salvando...' : editingGuild ? 'Salvar Alterações' : 'Cadastrar Servidor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
