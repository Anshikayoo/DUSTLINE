import React from 'react';
import { HudSnapshot, LOCATION_THEMES, MAP_SIZE_CONFIGS } from '../game/types';

interface ScoreboardProps {
  hud: HudSnapshot;
}

export const Scoreboard: React.FC<ScoreboardProps> = ({ hud }) => {
  const ctRows = hud.scoreboardRows
    .filter((r) => r.team === 'CT')
    .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
  const tRows = hud.scoreboardRows
    .filter((r) => r.team === 'T')
    .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);

  const renderTeamTable = (title: string, colorClass: string, rows: typeof ctRows) => (
    <div className="flex-1 min-w-0">
      <div
        className={`font-display text-xs sm:text-sm font-bold tracking-wider pb-2 border-b border-white/15 flex justify-between ${colorClass}`}
      >
        <span>{title}</span>
        <span className="font-mono-num">{title.startsWith('COUNTER') ? hud.ctScore : hud.tScore}</span>
      </div>
      <div className="mt-2 max-h-[34dvh] md:max-h-[55dvh] overflow-y-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="text-slate-400 border-b border-white/10 text-left">
              <th className="py-1.5 font-medium">Player</th>
              <th className="py-1.5 font-medium text-center">Status</th>
              <th className="py-1.5 font-medium text-right">K</th>
              <th className="py-1.5 font-medium text-right">D</th>
              <th className="py-1.5 font-medium text-right">Money</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                className={`border-b border-white/5 ${
                  r.isPlayer
                    ? 'bg-[#5da8dc]/15 text-white font-semibold'
                    : r.alive
                      ? 'text-slate-200'
                      : 'text-slate-500'
                }`}
              >
                <td className="py-1.5 pr-2 truncate max-w-[125px]">
                  <span>{r.name}</span>
                  <span className="ml-1.5 text-[10px] text-slate-400">
                    {r.gender === 'female' ? 'F' : 'M'}
                  </span>
                  {r.hasBomb && (
                    <span className="ml-1.5 text-[10px] font-bold text-amber-400">C4</span>
                  )}
                </td>
                <td className="py-1.5 text-center">
                  <span className={r.alive ? 'text-emerald-400' : 'text-slate-500'}>
                    {r.alive ? 'Alive' : 'Dead'}
                  </span>
                </td>
                <td className="py-1.5 text-right font-mono-num">{r.kills}</td>
                <td className="py-1.5 text-right font-mono-num">{r.deaths}</td>
                <td className="py-1.5 text-right font-mono-num text-[#8be08b]">
                  ${r.money.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center p-3 sm:p-6 safe-top safe-bottom">
      <div
        className="w-full max-w-4xl border border-white/15 p-4 sm:p-5 text-slate-100 max-h-[88dvh] overflow-y-auto"
        style={{ backgroundColor: 'rgba(10, 14, 20, 0.95)' }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-white/10 text-xs text-slate-400">
          <span className="font-display text-sm sm:text-base font-bold text-white tracking-wider">
            {LOCATION_THEMES[hud.setup.location].name} · {MAP_SIZE_CONFIGS[hud.setup.mapSize].label} ·{' '}
            {hud.setup.teamSize}v{hud.setup.teamSize}
          </span>
          <span>Round {hud.roundNumber} · First to 8</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 mt-4">
          {renderTeamTable('COUNTER-TERRORISTS', 'text-[#6cb8eb]', ctRows)}
          {renderTeamTable('TERRORISTS', 'text-[#e59a3c]', tRows)}
        </div>
      </div>
    </div>
  );
};
