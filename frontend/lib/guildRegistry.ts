// =========================================================================
// [REGISTRO DE GUILDAS & MAPEAMENTO DE SALAS ECOAPP]
// Centraliza os dados dos servidores Discord autorizados e telemetria de chamadas.
// =========================================================================

export interface AuthorizedGuild {
  id: string;
  name: string;
  owner: string;
  tag: string;
  badgeColor: 'indigo' | 'emerald';
}

export const AUTHORIZED_GUILDS: Record<string, AuthorizedGuild> = {
  '1506471002757140660': {
    id: '1506471002757140660',
    name: 'Amigos Amor',
    owner: 'Kayque Reis',
    tag: 'Servidor Matriz',
    badgeColor: 'indigo',
  },
  '1550327956231028817': {
    id: '1550327956231028817',
    name: '6WC2026 Server do Shikomi',
    owner: 'Boiaaa',
    tag: 'Servidor Parceiro',
    badgeColor: 'emerald',
  },
};

export interface ChannelMapping {
  channelId: string;
  channelName?: string;
  guildId: string;
  lastActive: number;
}

export interface BlockedAttempt {
  guildId: string;
  channelId?: string;
  timestamp: number;
  ip?: string;
}

// Registro em memória compartilhado dentro do processo Node.js
class GuildRegistry {
  private channelMap = new Map<string, ChannelMapping>();
  private blockedAttempts: BlockedAttempt[] = [];

  constructor() {
    this.channelMap.set('call-discord-alpha', {
      channelId: 'call-discord-alpha',
      channelName: 'Canal de Testes / Alpha',
      guildId: '1506471002757140660',
      lastActive: Date.now(),
    });
  }

  public registerChannel(channelId: string, guildId: string, channelName?: string) {
    if (!channelId || !guildId) return;
    this.channelMap.set(channelId, {
      channelId,
      guildId,
      channelName: channelName || this.channelMap.get(channelId)?.channelName,
      lastActive: Date.now(),
    });
  }

  public getGuildForChannel(channelId: string): string | undefined {
    return this.channelMap.get(channelId)?.guildId;
  }

  public getChannelInfo(channelId: string): ChannelMapping | undefined {
    return this.channelMap.get(channelId);
  }

  public recordBlockedAttempt(guildId: string, channelId?: string, ip?: string) {
    if (!guildId) return;
    const recent = this.blockedAttempts.find(
      (a) => a.guildId === guildId && Date.now() - a.timestamp < 30_000
    );
    if (!recent) {
      this.blockedAttempts.unshift({
        guildId,
        channelId,
        timestamp: Date.now(),
        ip,
      });
      if (this.blockedAttempts.length > 50) {
        this.blockedAttempts.pop();
      }
    }
  }

  public getBlockedAttempts(): BlockedAttempt[] {
    return this.blockedAttempts;
  }
}

const globalForRegistry = globalThis as unknown as { guildRegistry?: GuildRegistry };
export const guildRegistry = globalForRegistry.guildRegistry || new GuildRegistry();
if (process.env.NODE_ENV !== 'production') {
  globalForRegistry.guildRegistry = guildRegistry;
}
