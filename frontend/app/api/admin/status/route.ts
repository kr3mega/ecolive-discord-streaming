import { NextResponse } from 'next/server';
import { RoomServiceClient } from 'livekit-server-sdk';
import { guildRegistry } from '@/lib/guildRegistry';
import { loadGuilds } from '@/lib/guildStorage';
import { getBandwidthStats } from '@/lib/bandwidthHelper';
import { auditGuildTraffic, GuildLivePresence } from '@/lib/guildAuditor';

export const dynamic = 'force-dynamic';

export async function GET() {
  const bandwidth = getBandwidthStats();

  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const livekitUrl = process.env.LIVEKIT_URL || 'http://livekit:7880';

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

  const guildReports: Record<string, GuildReport> = {};

  const managedGuilds = loadGuilds();
  for (const g of managedGuilds) {
    guildReports[g.id] = {
      ...g,
      isActive: false,
      activeRoomsCount: 0,
      totalConnectedUsers: 0,
      totalActiveStreams: 0,
      rooms: [],
    };
  }

  const unmappedRooms: RoomDetail[] = [];
  let totalLivekitRooms = 0;
  let totalLivekitParticipants = 0;
  let totalLivekitStreams = 0;

  if (apiKey && apiSecret) {
    try {
      const roomClient = new RoomServiceClient(livekitUrl, apiKey, apiSecret);
      const rooms = await roomClient.listRooms().catch(() => []);
      totalLivekitRooms = rooms.length;

      for (const room of rooms) {
        // Ignora salas internas 'offline-xxx' usadas apenas para estacionar Ingress permanente
        if (room.name.startsWith('offline-')) {
          continue;
        }

        const participants = await roomClient.listParticipants(room.name).catch(() => []);
        const participantSummaries: ParticipantSummary[] = [];
        const streamSummaries: StreamSummary[] = [];
        let detectedGuildId: string | undefined = guildRegistry.getGuildForChannel(room.name);
        let detectedChannelName: string = guildRegistry.getChannelInfo(room.name)?.channelName || room.name;

        for (const p of participants) {
          totalLivekitParticipants++;
          let avatar: string | undefined;

          if (p.metadata) {
            try {
              const meta = JSON.parse(p.metadata);
              if (meta.avatar) avatar = meta.avatar;
              if (meta.guildId && !detectedGuildId) {
                detectedGuildId = meta.guildId;
                guildRegistry.registerChannel(room.name, meta.guildId, meta.channelName);
              }
              if (meta.channelName && detectedChannelName === room.name) {
                detectedChannelName = meta.channelName;
              }
            } catch {}
          }

          const isObs = p.identity.startsWith('obs_');
          const cleanId = p.identity.replace(/^(user_|obs_)/, '');
          const tracks = p.tracks || [];
          const hasVideo = tracks.some((t: any) => t.type === 1 || t.type === 'VIDEO' || t.width > 0);
          const hasAudio = tracks.some((t: any) => t.type === 0 || t.type === 'AUDIO');
          const isPublisher = hasVideo || hasAudio || isObs;

          const pSummary: ParticipantSummary = {
            identity: p.identity,
            cleanId,
            name: p.name || p.identity,
            avatar,
            isObs,
            isPublisher,
            hasVideo,
            hasAudio,
            tracksCount: tracks.length,
            joinedAt: Number(p.joinedAt) * 1000 || Date.now(),
          };

          participantSummaries.push(pSummary);

          if (isPublisher && hasVideo) {
            totalLivekitStreams++;
            const videoTrack = tracks.find((t: any) => t.type === 1 || t.type === 'VIDEO' || t.width > 0);
            const resolution = videoTrack && videoTrack.width ? `${videoTrack.width}x${videoTrack.height}` : undefined;

            streamSummaries.push({
              streamerName: p.name || cleanId,
              identity: p.identity,
              cleanId,
              isObs,
              hasVideo,
              hasAudio,
              resolution,
            });
          }
        }

        const roomDetail: RoomDetail = {
          roomId: room.name,
          channelName: detectedChannelName,
          guildId: detectedGuildId,
          participantsCount: participantSummaries.length,
          participants: participantSummaries,
          streams: streamSummaries,
          createdAt: Number(room.creationTime) * 1000 || Date.now(),
        };

        if (detectedGuildId && guildReports[detectedGuildId]) {
          const report = guildReports[detectedGuildId];
          report.rooms.push(roomDetail);
          report.activeRoomsCount++;
          report.totalConnectedUsers += participantSummaries.length;
          report.totalActiveStreams += streamSummaries.length;
          report.isActive = true;
        } else {
          unmappedRooms.push(roomDetail);
        }
      }
    } catch (err) {
      console.warn('[Admin Status] Falha ao consultar LiveKit:', err);
    }
  }

  const blockedAttempts = guildRegistry.getBlockedAttempts();

  // Auditoria de tráfego por servidor
  const activePresences: GuildLivePresence[] = Object.values(guildReports).map((g) => ({
    guildId: g.id,
    streamsCount: g.totalActiveStreams,
    viewersCount: Math.max(0, g.totalConnectedUsers - g.totalActiveStreams),
  }));
  const audit = auditGuildTraffic(activePresences);

  return NextResponse.json(
    {
      timestamp: Date.now(),
      bandwidth,
      guilds: Object.values(guildReports),
      audit,
      unmappedRooms,
      blockedAttempts,
      summary: {
        totalRoomsActive: totalLivekitRooms,
        totalConnectedUsers: totalLivekitParticipants,
        totalActiveStreams: totalLivekitStreams,
        currentThroughputMbps: bandwidth.currentMbps,
        quotaUsedGB: bandwidth.totalUsedGB,
        quotaTotalTB: bandwidth.totalQuotaTB,
        quotaPercent: bandwidth.quotaPercent,
        remainingQuotaGB: bandwidth.remainingGB,
      },
    },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    }
  );
}
