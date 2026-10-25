import React from 'react';
import { Cpu, HardDrive, Clock, MessageSquareText, TrendingUp, CheckCircle, Ban, Copy } from 'lucide-react';
import { ServerMetrics, BotStats } from '../types.ts';

interface StatsCardsProps {
  server: ServerMetrics;
  stats: BotStats;
}

function formatUptime(seconds?: number): string {
  if (!seconds || seconds <= 0) return '0 דקות';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  const parts = [];
  if (days > 0) parts.push(`${days} ימים`);
  if (hours > 0) parts.push(`${hours} שעות`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes} דקות`);
  return parts.join(', ');
}

export const StatsCards: React.FC<StatsCardsProps> = ({ server, stats }) => {
  const cpuVal = parseFloat(server.cpuLoad || '0');
  const cpuPercent = Math.min(100, Math.max(4, Math.round(cpuVal * 40)));

  const ramPercent = Math.min(100, Math.max(4, server.ramPercentage || 0));

  const totalScanned = stats.scanned || 0;
  const sentPercent = totalScanned > 0 ? ((stats.sent / totalScanned) * 100).toFixed(0) : '0';
  const rejectedPercent = totalScanned > 0 ? ((stats.rejected / totalScanned) * 100).toFixed(0) : '0';
  const dupsPercent = totalScanned > 0 ? ((stats.duplicates / totalScanned) * 100).toFixed(0) : '0';

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* CPU Card */}
      <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-b from-[#121822] to-[#0d131c] border border-[#1e2a3b] shadow-lg relative overflow-hidden group hover:border-[#2e405a] transition-all">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-slate-400">מעבד · עומס דקה</span>
          <div className="p-1.5 rounded-lg bg-teal-500/10 text-teal-400 border border-teal-500/20">
            <Cpu className="w-4 h-4" />
          </div>
        </div>
        <div className="flex items-baseline gap-2 my-1">
          <div className="text-2xl sm:text-3xl font-extrabold font-mono text-white tracking-tight">
            {server.cpuLoad || '—'}
          </div>
          <span className="text-xs text-teal-400 font-mono">
            {cpuVal < 1.0 ? 'תקין' : 'עמוס'}
          </span>
        </div>
        {/* Progress bar */}
        <div className="w-full h-1.5 bg-[#172230] rounded-full overflow-hidden my-2.5">
          <div
            className={`h-full transition-all duration-500 ${
              cpuVal < 1.0 ? 'bg-gradient-to-r from-teal-400 to-emerald-400' : 'bg-gradient-to-r from-amber-400 to-rose-400'
            }`}
            style={{ width: `${cpuPercent}%` }}
          />
        </div>
        <div className="text-[11px] text-slate-400 flex items-center justify-between">
          <span>ממוצע עומסים:</span>
          <span className="font-mono text-slate-300">
            {server.loadAvg && server.loadAvg.length > 0 ? server.loadAvg.join(', ') : '—'}
          </span>
        </div>
      </div>

      {/* RAM Card */}
      <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-b from-[#121822] to-[#0d131c] border border-[#1e2a3b] shadow-lg relative overflow-hidden group hover:border-[#2e405a] transition-all">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-slate-400">זיכרון RAM בוט</span>
          <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <HardDrive className="w-4 h-4" />
          </div>
        </div>
        <div className="flex items-baseline gap-2 my-1">
          <div className="text-2xl sm:text-3xl font-extrabold font-mono text-white tracking-tight">
            {server.ramUsageMB ? `${server.ramUsageMB} MB` : '—'}
          </div>
          <span className="text-xs text-blue-400 font-mono">
            {server.ramPercentage ? `${server.ramPercentage}% כללי` : ''}
          </span>
        </div>
        {/* Progress bar */}
        <div className="w-full h-1.5 bg-[#172230] rounded-full overflow-hidden my-2.5">
          <div
            className="h-full bg-gradient-to-r from-blue-400 to-indigo-400 transition-all duration-500"
            style={{ width: `${ramPercent}%` }}
          />
        </div>
        <div className="text-[11px] text-slate-400 flex items-center justify-between">
          <span>שימוש שרת כללי:</span>
          <span className="font-mono text-slate-300">
            {server.ramUsedMB && server.ramTotalMB
              ? `${server.ramUsedMB} / ${server.ramTotalMB} MB`
              : '—'}
          </span>
        </div>
      </div>

      {/* Uptime Card */}
      <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-b from-[#121822] to-[#0d131c] border border-[#1e2a3b] shadow-lg relative overflow-hidden group hover:border-[#2e405a] transition-all">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-slate-400">זמן ריצה רציף</span>
          <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Clock className="w-4 h-4" />
          </div>
        </div>
        <div className="my-1">
          <div className="text-lg sm:text-xl font-bold text-white tracking-tight truncate">
            {formatUptime(server.uptime)}
          </div>
        </div>
        <div className="w-full h-1.5 bg-[#172230] rounded-full overflow-hidden my-2.5">
          <div className="h-full bg-gradient-to-r from-amber-400 to-yellow-300 w-full animate-pulse" />
        </div>
        <div className="text-[11px] text-slate-400 flex items-center justify-between font-mono">
          <span>מנוע PM2:</span>
          <span className="text-amber-300/90 truncate max-w-[140px]">
            {server.pm2 || 'wa-bot'} · {server.node || 'Node'}
          </span>
        </div>
      </div>

      {/* Scanned Messages Card */}
      <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-b from-[#121822] to-[#0d131c] border border-[#1e2a3b] shadow-lg relative overflow-hidden group hover:border-[#2e405a] transition-all">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-slate-400">הודעות שנסרקו היום</span>
          <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <MessageSquareText className="w-4 h-4" />
          </div>
        </div>
        <div className="flex items-baseline gap-2 my-1">
          <div className="text-2xl sm:text-3xl font-extrabold font-mono text-white tracking-tight">
            {totalScanned.toLocaleString()}
          </div>
          <span className="text-xs text-emerald-400 flex items-center gap-0.5">
            <TrendingUp className="w-3 h-3" />
            פעיל
          </span>
        </div>
        {/* Multi-segment bar */}
        <div className="w-full h-1.5 bg-[#172230] rounded-full overflow-hidden my-2.5 flex">
          <div className="bg-emerald-400 h-full" style={{ width: `${sentPercent}%` }} title={`נשלחו: ${sentPercent}%`} />
          <div className="bg-rose-400 h-full" style={{ width: `${rejectedPercent}%` }} title={`נדחו: ${rejectedPercent}%`} />
          <div className="bg-amber-400 h-full" style={{ width: `${dupsPercent}%` }} title={`כפילויות: ${dupsPercent}%`} />
        </div>
        <div className="text-[11px] text-slate-300 flex items-center justify-between">
          <span className="text-emerald-400 font-medium">✓ {stats.sent} נשלחו</span>
          <span className="text-rose-400/90 font-medium">✕ {stats.rejected} נדחו</span>
          <span className="text-amber-400/90 font-medium">⧉ {stats.duplicates} כפול</span>
        </div>
      </div>
    </div>
  );
};
