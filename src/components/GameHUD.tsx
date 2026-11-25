import React from 'react';
import {
  HudSnapshot,
  MATCH_CONSTANTS,
  MinimapRect,
  WEAPON_SPECS,
} from '../game/types';
import { Minimap } from './Minimap';

interface GameHUDProps {
  hud: HudSnapshot;
  minimapRects: MinimapRect[];
  mapHalfSize: number;
  touchActive: boolean;
  onOpenFullMap?: () => void;
}

function formatClock(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${rem.toString().padStart(2, '0')}`;
}

export const GameHUD: React.FC<GameHUDProps> = ({
  hud,
  minimapRects,
  mapHalfSize,
  touchActive,
  onOpenFullMap,
}) => {
  if (hud.fullMapOpen) return null;

  const activeWeaponId =
    hud.activeSlot === 1 && hud.primaryWeapon
      ? hud.primaryWeapon.id
      : hud.activeSlot === 2 && hud.secondaryWeapon
        ? hud.secondaryWeapon.id
        : 'knife';
  const activeSpec = WEAPON_SPECS[activeWeaponId];
  const activeAmmo =
    hud.activeSlot === 1
      ? hud.primaryWeapon
      : hud.activeSlot === 2
        ? hud.secondaryWeapon
        : null;

  const lowHealth = hud.health <= 25;
  const lowAmmo = activeAmmo ? activeAmmo.ammo <= Math.ceil(activeSpec.magSize * 0.25) : false;
  const isScoped = hud.scopeLevel > 0;

  return (
    <div className="pointer-events-none fixed inset-0 z-10 overflow-hidden select-none safe-top safe-bottom safe-x">
      {/* Flashbang white blind overlay */}
      {hud.flashBlindAlpha > 0.01 && (
        <div
          className="fixed inset-0 bg-white"
          style={{ opacity: Math.min(0.95, hud.flashBlindAlpha) }}
        />
      )}

      {/* Low-health crimson edge vignette + hit damage flash */}
      {(hud.damageFlashAlpha > 0.01 || hud.lowHealthAlpha > 0.01) && (
        <div
          className="fixed inset-0"
          style={{
            opacity: Math.min(0.9, hud.damageFlashAlpha * 0.75 + hud.lowHealthAlpha * 0.55),
            boxShadow: 'inset 0 0 115px 38px rgba(215, 36, 36, 0.88)',
          }}
        />
      )}

      {/* AWP Sniper Scope Overlay */}
      {isScoped && hud.playerAlive && (
        <div className="fixed inset-0 flex items-center justify-center">
          <div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(circle at center, transparent 0%, transparent 34%, rgba(6, 9, 13, 0.96) 36%, rgba(4, 6, 9, 0.99) 100%)',
            }}
          />
          <svg className="relative w-full h-full" viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid slice">
            <line x1="0" y1="500" x2="1000" y2="500" stroke="#0d1117" strokeWidth="1.6" />
            <line x1="500" y1="0" x2="500" y2="1000" stroke="#0d1117" strokeWidth="1.6" />
            <line x1="0" y1="500" x2="355" y2="500" stroke="#0a0d12" strokeWidth="4.5" />
            <line x1="645" y1="500" x2="1000" y2="500" stroke="#0a0d12" strokeWidth="4.5" />
            <line x1="500" y1="645" x2="500" y2="1000" stroke="#0a0d12" strokeWidth="4.5" />
            <circle cx="500" cy="500" r="2.4" fill="#ef4444" />
          </svg>
          <div className="absolute bottom-[18%] font-mono-num text-xs tracking-widest text-slate-300/80">
            {hud.scopeLevel === 2 ? '8.0× OPTIC' : '4.0× OPTIC'}
          </div>
        </div>
      )}

      {/* TOP-LEFT: Tactical Minimap + Optional FPS */}
      <div className="fixed top-3 left-3 sm:top-4 sm:left-4 safe-top flex flex-col gap-1.5">
        <Minimap
          rects={minimapRects}
          halfSize={mapHalfSize}
          playerX={hud.playerX}
          playerZ={hud.playerZ}
          playerYaw={hud.playerYaw}
          playerSide={hud.setup.side}
          playerAlive={hud.playerAlive}
          blips={hud.minimapBlips}
          droppedWeapons={hud.droppedWeaponBlips}
          calloutLabels={hud.calloutLabels}
          currentCallout={hud.currentCallout}
          bombState={hud.bombState}
          bombPosX={hud.bombPosX}
          bombPosZ={hud.bombPosZ}
          rotating={hud.graphics.radarRotating}
          radarZoom={hud.radarZoom}
          compact={touchActive}
          onOpenFullMap={touchActive ? onOpenFullMap : undefined}
        />
        {(hud.graphics.showFps || hud.fpsWarning) && (
          <div className="flex flex-col gap-1">
            {hud.graphics.showFps && (
              <div
                className="px-2 py-0.5 text-[10px] font-mono-num text-emerald-300 border border-white/10 self-start"
                style={{ backgroundColor: 'rgba(10, 14, 20, 0.78)' }}
              >
                {hud.fps} FPS
              </div>
            )}
            {hud.fpsWarning && (
              <div
                className="px-2 py-1 text-[10px] text-amber-300 border border-amber-400/35 max-w-[180px]"
                style={{ backgroundColor: 'rgba(20, 14, 6, 0.88)' }}
              >
                {hud.fpsWarning}
              </div>
            )}
          </div>
        )}
      </div>

      {/* TOP-CENTER: Scoreboard, Round / Bomb Timer & Alive Counts */}
      <div className="fixed top-3 sm:top-4 left-1/2 -translate-x-1/2 safe-top flex flex-col items-center gap-1">
        <div
          className="flex items-stretch border border-white/15"
          style={{ backgroundColor: 'rgba(11, 15, 22, 0.84)' }}
        >
          <div className="flex items-center gap-2 px-2.5 sm:px-3.5 py-1 border-r border-white/10">
            <span className="font-display text-[11px] sm:text-xs font-semibold tracking-wider text-[#6cb8eb]">
              CT
            </span>
            <span className="font-mono-num text-base sm:text-xl font-bold text-white leading-none">
              {hud.ctScore}
            </span>
          </div>

          <div className="flex flex-col items-center justify-center px-3 sm:px-4 py-1 min-w-[82px] sm:min-w-[104px]">
            {hud.bombState === 'planted' ? (
              <>
                <span className="font-mono-num text-sm sm:text-lg font-bold leading-none text-red-400">
                  {formatClock(hud.bombTimer)}
                </span>
                <span className="text-[9px] sm:text-[10px] font-semibold tracking-wider text-red-300 mt-0.5">
                  C4 SITE {hud.bombSite}
                </span>
              </>
            ) : (
              <>
                <span
                  className={`font-mono-num text-sm sm:text-lg font-bold leading-none ${
                    hud.roundPhase === 'buy'
                      ? 'text-amber-400'
                      : hud.roundTimer <= 15
                        ? 'text-red-400'
                        : 'text-slate-100'
                  }`}
                >
                  {hud.roundPhase === 'buy' ? formatClock(hud.buyTimer) : formatClock(hud.roundTimer)}
                </span>
                <span className="text-[9px] sm:text-[10px] font-medium tracking-wider text-slate-400 mt-0.5">
                  {hud.roundPhase === 'buy'
                    ? 'BUY PHASE'
                    : hud.roundPhase === 'round_end'
                      ? 'ROUND OVER'
                      : `ROUND ${hud.roundNumber}`}
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2 px-2.5 sm:px-3.5 py-1 border-l border-white/10">
            <span className="font-mono-num text-base sm:text-xl font-bold text-white leading-none">
              {hud.tScore}
            </span>
            <span className="font-display text-[11px] sm:text-xs font-semibold tracking-wider text-[#e59a3c]">
              T
            </span>
          </div>
        </div>

        <div
          className="hidden sm:flex items-center gap-2.5 px-3 py-1 text-[11px] text-slate-300 border border-white/10"
          style={{ backgroundColor: 'rgba(11, 15, 22, 0.78)' }}
        >
          <span className="font-mono-num text-[#6cb8eb] font-semibold">CT {hud.ctAlive}</span>
          <span aria-hidden="true" className="text-slate-600">·</span>
          <span className="text-slate-400">First to {MATCH_CONSTANTS.ROUNDS_TO_WIN}</span>
          <span aria-hidden="true" className="text-slate-600">·</span>
          <span className="font-mono-num text-[#e59a3c] font-semibold">T {hud.tAlive}</span>
          <span aria-hidden="true" className="text-slate-600">·</span>
          <span className="text-slate-400">M Map · Tab Score</span>
        </div>
      </div>

      {/* TOP-RIGHT: Kill Feed (offset below quick bar on touch) */}
      <div
        className={`fixed right-3 sm:right-4 flex flex-col items-end gap-1 ${
          touchActive ? 'top-16' : 'top-4'
        }`}
      >
        {hud.killFeed.slice(0, touchActive ? 3 : 6).map((entry) => (
          <div
            key={entry.id}
            className="flex items-center gap-1.5 px-2 py-0.5 sm:px-2.5 sm:py-1 text-[11px] sm:text-xs border border-white/10"
            style={{ backgroundColor: 'rgba(11, 15, 22, 0.82)' }}
          >
            <span
              className={`font-semibold ${
                entry.killerTeam === 'CT' ? 'text-[#6cb8eb]' : 'text-[#e59a3c]'
              }`}
            >
              {entry.killer}
            </span>
            <span className="font-mono-num text-[10px] text-slate-400">[{entry.weapon}]</span>
            {entry.headshot && <span className="text-[10px] font-bold text-red-400">HS</span>}
            <span
              className={`font-semibold ${
                entry.victimTeam === 'CT' ? 'text-[#6cb8eb]' : 'text-[#e59a3c]'
              }`}
            >
              {entry.victim}
            </span>
          </div>
        ))}
      </div>

      {/* CENTER: Crosshair, Hitmarker, Damage Arc, Reload & Prompts */}
      <div className="fixed inset-0 flex items-center justify-center">
        {hud.damageIndicatorAlpha > 0.02 && (
          <div
            className="absolute w-44 h-44 flex items-start justify-center"
            style={{
              transform: `rotate(${hud.damageIndicatorAngle}rad)`,
              opacity: hud.damageIndicatorAlpha,
            }}
          >
            <svg width="72" height="24" viewBox="0 0 72 24" fill="none">
              <path d="M8 18 Q36 2 64 18" stroke="#ef4444" strokeWidth="5" strokeLinecap="round" />
            </svg>
          </div>
        )}

        {!isScoped && !hud.buyMenuOpen && hud.playerAlive && (
          <div className="relative">
            <div className="w-[2px] h-[2px] bg-[#6ff7b0] shadow-[0_0_2px_rgba(0,0,0,0.9)]" />
            <div
              className="absolute left-1/2 -translate-x-1/2 w-[2px] h-[9px] bg-[#6ff7b0]"
              style={{ bottom: `${hud.crosshairSpread}px` }}
            />
            <div
              className="absolute left-1/2 -translate-x-1/2 w-[2px] h-[9px] bg-[#6ff7b0]"
              style={{ top: `${hud.crosshairSpread}px` }}
            />
            <div
              className="absolute top-1/2 -translate-y-1/2 h-[2px] w-[9px] bg-[#6ff7b0]"
              style={{ right: `${hud.crosshairSpread}px` }}
            />
            <div
              className="absolute top-1/2 -translate-y-1/2 h-[2px] w-[9px] bg-[#6ff7b0]"
              style={{ left: `${hud.crosshairSpread}px` }}
            />
          </div>
        )}

        {hud.hitMarkerAlpha > 0.02 && (
          <svg className="absolute w-9 h-9" viewBox="0 0 36 36" style={{ opacity: hud.hitMarkerAlpha }}>
            <g
              stroke={hud.hitMarkerType === 'head' || hud.hitMarkerType === 'kill' ? '#ff4d3d' : '#f8fafc'}
              strokeWidth={hud.hitMarkerType === 'head' ? '2.6' : '2'}
              strokeLinecap="round"
            >
              <line x1="7" y1="7" x2="13" y2="13" />
              <line x1="29" y1="7" x2="23" y2="13" />
              <line x1="7" y1="29" x2="13" y2="23" />
              <line x1="29" y1="29" x2="23" y2="23" />
            </g>
          </svg>
        )}

        {hud.isReloading && (
          <div className="absolute top-[57%] flex flex-col items-center gap-1.5">
            <span className="font-display text-[11px] font-semibold tracking-widest text-amber-300">
              RELOADING
            </span>
            <div className="w-28 h-1.5 bg-black/60 border border-white/15 overflow-hidden">
              <div
                className="h-full bg-amber-400"
                style={{ width: `${Math.round(hud.reloadProgress * 100)}%` }}
              />
            </div>
          </div>
        )}

        {(hud.actionLabel || (!touchActive && hud.interactPrompt)) && hud.playerAlive && (
          <div className="absolute top-[63%] flex flex-col items-center gap-1.5">
            {hud.actionLabel ? (
              <div
                className="px-4 py-2 border border-amber-400/50 flex flex-col items-center gap-1.5"
                style={{ backgroundColor: 'rgba(11, 15, 22, 0.90)' }}
              >
                <span className="font-display text-xs font-bold tracking-wider text-amber-300">
                  {hud.actionLabel}
                </span>
                <div className="w-40 h-2 bg-black/70 border border-white/15 overflow-hidden">
                  <div
                    className="h-full bg-amber-400"
                    style={{ width: `${Math.round((hud.actionProgress ?? 0) * 100)}%` }}
                  />
                </div>
              </div>
            ) : (
              <div
                className="px-3.5 py-1.5 border border-white/20 text-xs font-medium text-white"
                style={{ backgroundColor: 'rgba(11, 15, 22, 0.85)' }}
              >
                {hud.interactPrompt}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Round Banner + MVP */}
      {hud.bannerTitle && !hud.buyMenuOpen && (
        <div className="fixed top-20 sm:top-24 left-1/2 -translate-x-1/2 flex flex-col items-center">
          <div
            className="px-4 sm:px-6 py-2 border text-center"
            style={{
              backgroundColor: 'rgba(11, 15, 22, 0.88)',
              borderColor:
                hud.bannerAccent === 'ct'
                  ? 'rgba(108, 184, 235, 0.5)'
                  : hud.bannerAccent === 't'
                    ? 'rgba(229, 154, 60, 0.5)'
                    : 'rgba(255, 255, 255, 0.16)',
            }}
          >
            <div
              className={`font-display text-sm sm:text-lg font-bold tracking-wider ${
                hud.bannerAccent === 'ct'
                  ? 'text-[#7cc4f5]'
                  : hud.bannerAccent === 't'
                    ? 'text-[#f0a74b]'
                    : 'text-white'
              }`}
            >
              {hud.bannerTitle}
            </div>
            {hud.bannerSubtitle && (
              <div className="text-[11px] sm:text-xs text-slate-300 mt-0.5">{hud.bannerSubtitle}</div>
            )}
            {hud.mvpText && (
              <div className="text-[11px] sm:text-xs font-semibold text-amber-300 mt-1">
                {hud.mvpText}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Spectator Mode Indicator */}
      {!hud.playerAlive && hud.roundPhase !== 'round_end' && (
        <div
          className="fixed bottom-24 left-1/2 -translate-x-1/2 px-4 py-2 border border-white/15 text-center"
          style={{ backgroundColor: 'rgba(11, 15, 22, 0.86)' }}
        >
          <div className="font-display text-xs font-bold tracking-wider text-amber-300">
            {hud.spectatingName ? `SPECTATING ${hud.spectatingName}` : 'ELIMINATED'}
          </div>
          {hud.spectatingName && !touchActive && (
            <div className="text-[11px] text-slate-400 mt-0.5">
              Click or Space to cycle teammate camera
            </div>
          )}
        </div>
      )}

      {/* Toast Hint */}
      {hud.buyHintMessage && (
        <div
          className="fixed bottom-28 left-1/2 -translate-x-1/2 px-4 py-1.5 text-xs font-medium text-amber-200 border border-amber-400/30 text-center"
          style={{ backgroundColor: 'rgba(14, 18, 25, 0.88)' }}
        >
          {hud.buyHintMessage}
        </div>
      )}

      {/* BOTTOM-LEFT: Radio Callouts + Buy Prompt + Health / Armor / Money */}
      <div className="fixed bottom-3 left-3 sm:bottom-4 sm:left-4 safe-bottom flex flex-col gap-1.5">
        {!touchActive && hud.radioCallouts.length > 0 && (
          <div className="flex flex-col gap-1 max-w-xs">
            {hud.radioCallouts.slice(0, 3).map((r) => (
              <div
                key={r.id}
                className="px-2.5 py-1 text-[11px] border border-white/10"
                style={{ backgroundColor: 'rgba(11, 15, 22, 0.78)' }}
              >
                <span className={r.team === 'CT' ? 'text-[#6cb8eb] font-semibold' : 'text-[#e59a3c] font-semibold'}>
                  {r.sender}:
                </span>{' '}
                <span className="text-slate-200">{r.message}</span>
              </div>
            ))}
          </div>
        )}

        {!touchActive && hud.roundPhase === 'buy' && !hud.buyMenuOpen && (
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-amber-300 border border-amber-400/35 self-start"
            style={{ backgroundColor: 'rgba(14, 18, 25, 0.86)' }}
          >
            <span className="font-mono-num font-bold text-amber-200">[B]</span>
            <span>Open Armory · Movement frozen ({Math.ceil(hud.buyTimer)}s)</span>
          </div>
        )}

        <div
          className="flex items-center gap-3 sm:gap-5 px-3 py-2 sm:px-4 sm:py-3 border border-white/12"
          style={{ backgroundColor: 'rgba(11, 15, 22, 0.84)' }}
        >
          <div className="flex flex-col gap-0.5 min-w-[54px] sm:min-w-[70px]">
            <div className="text-[10px] text-slate-400 truncate max-w-[84px]">{hud.setup.name}</div>
            <div className="flex items-center gap-1.5">
              <span
                className={`font-mono-num text-xl sm:text-2xl font-bold leading-none ${
                  lowHealth ? 'text-red-400' : 'text-white'
                }`}
              >
                {hud.health}
              </span>
              <span className="text-[10px] text-emerald-400 font-semibold">HP</span>
            </div>
            <div className="w-full h-1 bg-white/10">
              <div
                className={`h-full ${lowHealth ? 'bg-red-500' : 'bg-emerald-400'}`}
                style={{ width: `${hud.health}%` }}
              />
            </div>
          </div>

          <div className="flex flex-col gap-0.5 min-w-[52px] sm:min-w-[70px] pl-3 sm:pl-4 border-l border-white/10">
            <span className="text-[10px] text-slate-400">ARMOR</span>
            <div className="flex items-center gap-1">
              <span className="font-mono-num text-xl sm:text-2xl font-bold leading-none text-slate-100">
                {hud.armor}
              </span>
              {hud.hasHelmet && <span className="text-[10px] font-semibold text-[#7cc4f5]">+H</span>}
              {hud.hasDefuseKit && <span className="text-[10px] font-semibold text-emerald-300">K</span>}
            </div>
            <div className="w-full h-1 bg-white/10">
              <div className="h-full bg-[#6cb8eb]" style={{ width: `${hud.armor}%` }} />
            </div>
          </div>

          <div className="flex flex-col pl-3 sm:pl-4 border-l border-white/10">
            <span className="text-[10px] text-slate-400">FUNDS</span>
            <span className="font-mono-num text-base sm:text-xl font-bold text-[#8be08b] leading-tight">
              ${hud.money.toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* BOTTOM-RIGHT: Grenades, Loadout Slots (1/2/3), C4 Indicator & Ammo */}
      <div className="fixed bottom-3 right-3 sm:bottom-4 sm:right-4 safe-bottom flex flex-col items-end gap-1.5">
        {!touchActive && (
          <div className="flex items-center gap-1.5">
            {hud.hasBomb && (
              <div
                className="px-2.5 py-1 text-xs font-bold text-amber-300 border border-amber-400/50"
                style={{ backgroundColor: 'rgba(38, 28, 12, 0.88)' }}
              >
                C4 BOMB
              </div>
            )}
            {(['smoke', 'flash', 'he'] as const).map((gid, idx) => (
              <div
                key={gid}
                className={`px-2 py-1 text-[11px] border ${
                  hud.grenades[gid] > 0
                    ? 'border-white/25 text-slate-100'
                    : 'border-white/8 text-slate-500'
                }`}
                style={{ backgroundColor: 'rgba(11, 15, 22, 0.78)' }}
              >
                <span className="font-mono-num text-slate-400 mr-1">{idx + 4}</span>
                <span className="uppercase">{gid}</span>
              </div>
            ))}
          </div>
        )}

        {!touchActive && (
          <div className="flex items-center gap-1.5">
            {[
              { slot: 1 as const, label: hud.primaryWeapon ? WEAPON_SPECS[hud.primaryWeapon.id].shortName : 'Empty', owned: Boolean(hud.primaryWeapon) },
              { slot: 2 as const, label: hud.secondaryWeapon ? WEAPON_SPECS[hud.secondaryWeapon.id].shortName : 'Empty', owned: Boolean(hud.secondaryWeapon) },
              { slot: 3 as const, label: 'Knife', owned: true },
            ].map((item) => {
              const active = hud.activeSlot === item.slot;
              return (
                <div
                  key={item.slot}
                  className={`flex items-center gap-1.5 px-2.5 py-1 text-xs border ${
                    active
                      ? 'border-[#6cb8eb] text-white'
                      : item.owned
                        ? 'border-white/15 text-slate-300'
                        : 'border-white/8 text-slate-600'
                  }`}
                  style={{
                    backgroundColor: active ? 'rgba(32, 64, 92, 0.88)' : 'rgba(11, 15, 22, 0.76)',
                  }}
                >
                  <span className="font-mono-num text-[11px] font-bold text-slate-400">{item.slot}</span>
                  <span className="font-display font-semibold">{item.label}</span>
                </div>
              );
            })}
          </div>
        )}

        <div
          className="flex items-end justify-between gap-4 sm:gap-6 px-3 py-2 sm:px-4 sm:py-3 border border-white/12 min-w-[148px] sm:min-w-[220px]"
          style={{ backgroundColor: 'rgba(11, 15, 22, 0.84)' }}
        >
          <div className="flex flex-col">
            <span className="font-display text-xs font-semibold tracking-wider text-slate-300">
              {activeSpec.shortName}
            </span>
            {!touchActive && (
              <span className="text-[11px] text-slate-400 mt-0.5">
                {hud.isCrouching
                  ? 'Crouching'
                  : hud.isWalking
                    ? 'Walking'
                    : activeSpec.isMelee
                      ? 'Melee · G Drop'
                      : activeSpec.hasScope
                        ? 'RMB / V Scope · G Drop'
                        : 'G Drop · R Reload'}
              </span>
            )}
          </div>

          <div className="flex items-baseline gap-1">
            <span
              className={`font-mono-num text-2xl sm:text-3xl font-bold leading-none ${
                lowAmmo ? 'text-amber-400' : 'text-white'
              }`}
            >
              {activeAmmo ? activeAmmo.ammo : '—'}
            </span>
            {activeAmmo && (
              <span className="font-mono-num text-xs sm:text-sm text-slate-400">
                / {activeAmmo.reserve}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
