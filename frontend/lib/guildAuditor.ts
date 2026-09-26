import fs from 'fs';
import path from 'path';
import { loadGuilds } from './guildStorage';
import { getBandwidthStats } from './bandwidthHelper';

export interface GuildAuditRecord {
  guildId: string;
  guildName: string;
  owner: string;
  tag: string;
  badgeColor: 'indigo' | 'emerald' | 'amber';
  totalBytes: number;
  totalGB: number;
  totalMB: number;
  quotaPercent: number; // Percentual da cota total da VPS (2TB)
  currentBitrateMbps: number;
  peakBitrateMbps: number;
  activeStreamsCount: number;
  activeViewersCount: number;
  totalStreamingSeconds: number;
  estimatedCostBRL: number; // Custo proporcional de rede da VPS
  monthlyFeeBRL: number; // Valor da mensalidade cobrada (ex: R$ 25,00)
  netMarginBRL: number; // Margem líquida (Mensalidade - Custo de rede)
  cycleStartDate: string;
  lastActiveTimestamp: number;
}

export interface AuditDatabase {
  version: string;
  lastUpdated: number;
  totalVpsQuotaTB: number;
  vpsCostBRL: number; // Custo base mensal da VPS (R$ 50,00)
  guilds: Record<string, GuildAuditRecord>;
}

const DEFAULT_AUDIT_DATA: AuditDatabase = {
  version: '1.0',
  lastUpdated: Date.now(),
  totalVpsQuotaTB: 2,
  vpsCostBRL: 50.0,
  guilds: {
    '1506471002757140660': {
      guildId: '1506471002757140660',
      guildName: 'Amigos Amor',
      owner: 'Kayque Reis',
      tag: 'Servidor Matriz',
      badgeColor: 'indigo',
      totalBytes: 85_899_345_920, // ~80 GB histórico inicial
      totalGB: 85.9,
      totalMB: 85899.3,
      quotaPercent: 4.3,
      currentBitrateMbps: 0,
      peakBitrateMbps: 18.5,
      activeStreamsCount: 0,
      activeViewersCount: 0,
      totalStreamingSeconds: 43200, // 12h
      estimatedCostBRL: 2.15,
      monthlyFeeBRL: 0.0,
      netMarginBRL: -2.15,
      cycleStartDate: '12/09/2026',
      lastActiveTimestamp: 1789900000000,
    },
    '1550327956231028817': {
      guildId: '1550327956231028817',
      guildName: '6WC2026 Server do Shikomi',
      owner: 'Boiaaa',
      tag: 'Servidor Parceiro',
      badgeColor: 'emerald',
      totalBytes: 26_843_545_600, // ~25 GB histórico inicial
      totalGB: 26.8,
      totalMB: 26843.5,
      quotaPercent: 1.3,
      currentBitrateMbps: 0,
      peakBitrateMbps: 12.0,
      activeStreamsCount: 0,
      activeViewersCount: 0,
      totalStreamingSeconds: 14400, // 4h
      estimatedCostBRL: 0.67,
      monthlyFeeBRL: 25.0,
      netMarginBRL: 24.33,
      cycleStartDate: '18/09/2026',
      lastActiveTimestamp: 1789900000000,
    },
  },
};

function getDataFilePath(): string {
  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    try {
      fs.mkdirSync(dataDir, { recursive: true });
    } catch {}
  }
  return path.join(dataDir, 'guild_auditing.json');
}

export function loadAuditDatabase(): AuditDatabase {
  const filePath = getDataFilePath();
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && parsed.guilds) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('[GuildAuditor] Falha ao ler guild_auditing.json:', err);
  }

  // Se não existir, sincroniza com os servidores cadastrados
  try {
    fs.writeFileSync(filePath, JSON.stringify(DEFAULT_AUDIT_DATA, null, 2), 'utf8');
  } catch {}

  return DEFAULT_AUDIT_DATA;
}

export function saveAuditDatabase(db: AuditDatabase): boolean {
  const filePath = getDataFilePath();
  try {
    db.lastUpdated = Date.now();
    fs.writeFileSync(filePath, JSON.stringify(db, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('[GuildAuditor] Erro ao gravar guild_auditing.json:', err);
    return false;
  }
}

let lastAuditTimestamp = Date.now();
let lastVpsTotalBytes = 0;

export interface GuildLivePresence {
  guildId: string;
  streamsCount: number;
  viewersCount: number;
}

/**
 * Atualiza o consumo de rede de cada guilda correlacionando o delta real da interface eth0
 * com as streams e espectadores ativos no LiveKit.
 */
export function auditGuildTraffic(activePresences: GuildLivePresence[]): AuditDatabase {
  const db = loadAuditDatabase();
  const managedGuilds = loadGuilds();
  const bwStats = getBandwidthStats();

  const now = Date.now();
  const dtSeconds = Math.max(1, (now - lastAuditTimestamp) / 1000);
  lastAuditTimestamp = now;

  // Garante que todas as guildas cadastradas existam na base de auditoria
  for (const g of managedGuilds) {
    if (!db.guilds[g.id]) {
      db.guilds[g.id] = {
        guildId: g.id,
        guildName: g.name,
        owner: g.owner,
        tag: g.tag,
        badgeColor: g.badgeColor,
        totalBytes: 0,
        totalGB: 0,
        totalMB: 0,
        quotaPercent: 0,
        currentBitrateMbps: 0,
        peakBitrateMbps: 0,
        activeStreamsCount: 0,
        activeViewersCount: 0,
        totalStreamingSeconds: 0,
        estimatedCostBRL: 0,
        monthlyFeeBRL: g.monthlyPrice || 0,
        netMarginBRL: g.monthlyPrice || 0,
        cycleStartDate: new Date().toLocaleDateString('pt-BR'),
        lastActiveTimestamp: now,
      };
    } else {
      // Atualiza metadados sincronizados com guildStorage
      db.guilds[g.id].guildName = g.name;
      db.guilds[g.id].owner = g.owner;
      db.guilds[g.id].tag = g.tag;
      db.guilds[g.id].badgeColor = g.badgeColor;
      db.guilds[g.id].monthlyFeeBRL = g.monthlyPrice || 0;
    }
  }

  // Calcula pesos de carga das guildas ativas
  // Cada stream ativa consome ~4.5 Mbps de entrada + ~4.5 Mbps por espectador conectado
  const guildWeights: Record<string, number> = {};
  let totalWeight = 0;

  for (const presence of activePresences) {
    if (presence.streamsCount > 0 || presence.viewersCount > 0) {
      // Carga = Ingress (1 para cada stream) + Egress (streams * espectadores)
      const load = presence.streamsCount * 1.0 + presence.streamsCount * presence.viewersCount * 0.9 + (presence.viewersCount > 0 && presence.streamsCount === 0 ? 0.2 : 0);
      guildWeights[presence.guildId] = load;
      totalWeight += load;
    }
  }

  // Delta de bytes físicos transferidos na VPS
  const currentTotalBytes = bwStats.totalUsedGB * 1_000_000_000;
  let deltaVpsBytes = 0;
  if (lastVpsTotalBytes > 0 && currentTotalBytes >= lastVpsTotalBytes) {
    deltaVpsBytes = currentTotalBytes - lastVpsTotalBytes;
  } else if (bwStats.currentMbps > 0) {
    // Estimativa instantânea via Mbps se o contador acumulado não variou no snapshot
    deltaVpsBytes = ((bwStats.currentMbps * 1_000_000) / 8) * dtSeconds;
  }
  lastVpsTotalBytes = currentTotalBytes;

  const totalQuotaBytes = (db.totalVpsQuotaTB || 2) * 1_000_000_000_000;
  const costPerGB = (db.vpsCostBRL || 50.0) / ((db.totalVpsQuotaTB || 2) * 1000); // R$ 0,025 por GB

  // Atualiza cada guilda
  for (const gId of Object.keys(db.guilds)) {
    const record = db.guilds[gId];
    const presence = activePresences.find((p) => p.guildId === gId);
    const streams = presence?.streamsCount || 0;
    const viewers = presence?.viewersCount || 0;

    record.activeStreamsCount = streams;
    record.activeViewersCount = viewers;

    if (streams > 0 || viewers > 0) {
      record.lastActiveTimestamp = now;
      record.totalStreamingSeconds += Math.round(dtSeconds);

      // Bitrate instantâneo da guilda
      let guildShare = totalWeight > 0 ? (guildWeights[gId] || 0) / totalWeight : 1;
      const guildMbps = Math.round(bwStats.currentMbps * guildShare * 100) / 100;
      record.currentBitrateMbps = guildMbps;

      if (guildMbps > record.peakBitrateMbps) {
        record.peakBitrateMbps = guildMbps;
      }

      // Adiciona bytes consumidos ponderados
      if (deltaVpsBytes > 0 && totalWeight > 0) {
        const attributedBytes = Math.round(deltaVpsBytes * guildShare);
        record.totalBytes += attributedBytes;
      }
    } else {
      record.currentBitrateMbps = 0;
    }

    // Recalcula totais
    record.totalMB = Math.round((record.totalBytes / 1_000_000) * 10) / 10;
    record.totalGB = Math.round((record.totalBytes / 1_000_000_000) * 100) / 100;
    record.quotaPercent = Math.min(100, Math.round((record.totalBytes / totalQuotaBytes) * 1000) / 10);
    record.estimatedCostBRL = Math.round(record.totalGB * costPerGB * 100) / 100;
    record.netMarginBRL = Math.round((record.monthlyFeeBRL - record.estimatedCostBRL) * 100) / 100;
  }

  saveAuditDatabase(db);
  return db;
}

/**
 * Zera os contadores de um servidor para iniciar um novo ciclo mensal.
 */
export function resetGuildAuditCycle(guildId: string): boolean {
  const db = loadAuditDatabase();
  const record = db.guilds[guildId];
  if (!record) return false;

  record.totalBytes = 0;
  record.totalGB = 0;
  record.totalMB = 0;
  record.quotaPercent = 0;
  record.currentBitrateMbps = 0;
  record.peakBitrateMbps = 0;
  record.totalStreamingSeconds = 0;
  record.estimatedCostBRL = 0;
  record.netMarginBRL = record.monthlyFeeBRL;
  record.cycleStartDate = new Date().toLocaleDateString('pt-BR');

  return saveAuditDatabase(db);
}
