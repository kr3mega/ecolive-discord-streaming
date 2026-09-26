import fs from 'fs';

interface NetSample {
  rxBytes: number;
  txBytes: number;
  timestamp: number;
}

export interface BandwidthStats {
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

let lastSample: NetSample | null = null;
let cachedResult: BandwidthStats = {
  currentMbps: 0,
  rxMbps: 0,
  txMbps: 0,
  maxMbps: 1000,
  percent: 0,
  totalUsedGB: 0,
  totalQuotaTB: 2,
  quotaPercent: 0,
  remainingGB: 2000,
  remainingPercent: 100,
  interface: 'eth0',
};

function readHostNetBytes(): { rx: number; tx: number; iface: string } | null {
  try {
    const candidatePaths = ['/proc/1/net/dev', '/proc/net/dev'];
    let content = '';
    for (const p of candidatePaths) {
      if (fs.existsSync(/*turbopackIgnore: true*/ p)) {
        content = fs.readFileSync(/*turbopackIgnore: true*/ p, 'utf8');
        break;
      }
    }

    if (!content) return null;

    const lines = content.split('\n');
    let chosenLine = lines.find((l) => l.trim().startsWith('eth0:'));
    let ifaceName = 'eth0';

    if (!chosenLine) {
      chosenLine = lines.find(
        (l) =>
          !l.includes('lo:') &&
          !l.includes('docker') &&
          !l.includes('br-') &&
          !l.includes('veth') &&
          l.includes(':')
      );
      if (chosenLine) {
        ifaceName = chosenLine.split(':')[0].trim();
      }
    }

    if (!chosenLine) return null;

    const parts = chosenLine.split(':')[1].trim().split(/\s+/);
    const rx = parseInt(parts[0], 10);
    const tx = parseInt(parts[8], 10);

    if (isNaN(rx) || isNaN(tx)) return null;

    return { rx, tx, iface: ifaceName };
  } catch {
    return null;
  }
}

export function getBandwidthStats(): BandwidthStats {
  const internalLimitMbps = 990;
  const maxMbps = Number(process.env.SERVER_MAX_BANDWIDTH_MBPS) || 1000;
  const totalQuotaTB = Number(process.env.SERVER_TOTAL_QUOTA_TB) || 2;
  const currentNet = readHostNetBytes();

  if (!currentNet) {
    return {
      ...cachedResult,
      maxMbps,
      totalQuotaTB,
    };
  }

  const now = Date.now();
  const totalBytes = currentNet.rx + currentNet.tx;
  const quotaBytes = totalQuotaTB * 1_000_000_000_000;
  const totalUsedGB = Math.round((totalBytes / 1_000_000_000) * 10) / 10;
  const quotaPercent = Math.min(100, Math.round(((totalBytes / quotaBytes) * 100) * 10) / 10);
  const remainingGB = Math.max(0, Math.round((totalQuotaTB * 1000 - totalUsedGB) * 10) / 10);
  const remainingPercent = Math.max(0, Math.round((100 - quotaPercent) * 10) / 10);

  if (lastSample) {
    const dt = (now - lastSample.timestamp) / 1000;
    if (dt >= 0.5) {
      const deltaRx = Math.max(0, currentNet.rx - lastSample.rxBytes);
      const deltaTx = Math.max(0, currentNet.tx - lastSample.txBytes);

      let rxMbps = Math.round(((deltaRx * 8) / (dt * 1_000_000)) * 100) / 100;
      let txMbps = Math.round(((deltaTx * 8) / (dt * 1_000_000)) * 100) / 100;
      let currentMbps = Math.round((rxMbps + txMbps) * 100) / 100;

      if (currentMbps < 0.2) {
        currentMbps = 0;
        rxMbps = 0;
        txMbps = 0;
      }

      const percent = Math.min(100, Math.round((currentMbps / internalLimitMbps) * 1000) / 10);

      cachedResult = {
        currentMbps,
        rxMbps,
        txMbps,
        maxMbps,
        percent,
        totalUsedGB,
        totalQuotaTB,
        quotaPercent,
        remainingGB,
        remainingPercent,
        interface: currentNet.iface,
      };

      lastSample = {
        rxBytes: currentNet.rx,
        txBytes: currentNet.tx,
        timestamp: now,
      };
    } else {
      cachedResult.totalUsedGB = totalUsedGB;
      cachedResult.quotaPercent = quotaPercent;
      cachedResult.remainingGB = remainingGB;
      cachedResult.remainingPercent = remainingPercent;
    }
  } else {
    cachedResult = {
      currentMbps: 0,
      rxMbps: 0,
      txMbps: 0,
      maxMbps,
      percent: 0,
      totalUsedGB,
      totalQuotaTB,
      quotaPercent,
      remainingGB,
      remainingPercent,
      interface: currentNet.iface,
    };
    lastSample = {
      rxBytes: currentNet.rx,
      txBytes: currentNet.tx,
      timestamp: now,
    };
  }

  return cachedResult;
}
