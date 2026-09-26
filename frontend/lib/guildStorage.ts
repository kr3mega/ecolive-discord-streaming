import fs from 'fs';
import path from 'path';

export interface ManagedGuild {
  id: string;
  name: string;
  owner: string;
  tag: string;
  badgeColor: 'indigo' | 'emerald' | 'amber';
  status: 'active' | 'paused' | 'inactive';
  monthlyPrice: number;
  paymentNotes?: string;
  createdAt: number;
  updatedAt?: number;
}

const DEFAULT_GUILDS: ManagedGuild[] = [
  {
    id: '1506471002757140660',
    name: 'Amigos Amor',
    owner: 'Kayque Reis',
    tag: 'Servidor Matriz',
    badgeColor: 'indigo',
    status: 'active',
    monthlyPrice: 0,
    paymentNotes: 'Servidor próprio / infraestrutura principal',
    createdAt: 1789900000000,
  },
  {
    id: '1550327956231028817',
    name: '6WC2026 Server do Shikomi',
    owner: 'Boiaaa',
    tag: 'Servidor Parceiro',
    badgeColor: 'emerald',
    status: 'active',
    monthlyPrice: 25.0,
    paymentNotes: 'Acordo Pix de R$ 25,00 / mensalidade infraestrutura',
    createdAt: 1789900000000,
  },
];

function getDataFilePath(): string {
  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    try {
      fs.mkdirSync(dataDir, { recursive: true });
    } catch {}
  }
  return path.join(dataDir, 'guilds.json');
}

export function loadGuilds(): ManagedGuild[] {
  const filePath = getDataFilePath();
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('[GuildStorage] Falha ao ler guilds.json, usando padrão:', err);
  }

  // Se não existir, grava o padrão inicial
  try {
    fs.writeFileSync(filePath, JSON.stringify(DEFAULT_GUILDS, null, 2), 'utf8');
  } catch (saveErr) {
    console.warn('[GuildStorage] Falha ao gravar padrão inicial:', saveErr);
  }

  return DEFAULT_GUILDS;
}

export function saveGuilds(guilds: ManagedGuild[]): boolean {
  const filePath = getDataFilePath();
  try {
    fs.writeFileSync(filePath, JSON.stringify(guilds, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('[GuildStorage] Erro ao gravar guilds.json:', err);
    return false;
  }
}

export function getGuildById(id: string): ManagedGuild | undefined {
  const guilds = loadGuilds();
  return guilds.find((g) => g.id === id);
}

export function checkGuildAccess(id: string): { authorized: boolean; status: string; guild?: ManagedGuild; reason?: string } {
  const guild = getGuildById(id);
  if (!guild) {
    return { authorized: false, status: 'unregistered', reason: 'Servidor não cadastrado na whitelist' };
  }
  if (guild.status === 'paused') {
    return { authorized: false, status: 'paused', guild, reason: 'Servidor temporariamente pausado / pendência financeira' };
  }
  if (guild.status === 'inactive') {
    return { authorized: false, status: 'inactive', guild, reason: 'Servidor desativado' };
  }
  return { authorized: true, status: 'active', guild };
}

export function upsertGuild(guildData: Partial<ManagedGuild> & { id: string; name: string; owner: string }): ManagedGuild {
  const guilds = loadGuilds();
  const index = guilds.findIndex((g) => g.id === guildData.id);

  const newGuild: ManagedGuild = {
    id: guildData.id.trim(),
    name: guildData.name.trim(),
    owner: guildData.owner.trim(),
    tag: guildData.tag?.trim() || 'Servidor Parceiro',
    badgeColor: guildData.badgeColor || 'emerald',
    status: guildData.status || 'active',
    monthlyPrice: typeof guildData.monthlyPrice === 'number' ? guildData.monthlyPrice : 25.0,
    paymentNotes: guildData.paymentNotes?.trim() || '',
    createdAt: index >= 0 ? guilds[index].createdAt : Date.now(),
    updatedAt: Date.now(),
  };

  if (index >= 0) {
    guilds[index] = newGuild;
  } else {
    guilds.push(newGuild);
  }

  saveGuilds(guilds);
  return newGuild;
}

export function setGuildStatus(id: string, status: 'active' | 'paused' | 'inactive'): boolean {
  const guilds = loadGuilds();
  const guild = guilds.find((g) => g.id === id);
  if (!guild) return false;
  guild.status = status;
  guild.updatedAt = Date.now();
  return saveGuilds(guilds);
}

export function removeGuild(id: string): boolean {
  const guilds = loadGuilds();
  const filtered = guilds.filter((g) => g.id !== id);
  if (filtered.length === guilds.length) return false;
  return saveGuilds(filtered);
}
