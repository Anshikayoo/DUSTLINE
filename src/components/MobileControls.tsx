import React, { useRef, useState } from 'react';
import {
  Crosshair,
  Map as MapIcon,
  Pause,
  RotateCw,
  ShoppingBag,
  Users,
} from 'lucide-react';
import { GrenadeId, HudSnapshot, WEAPON_SPECS } from '../game/types';

interface MobileControlsProps {
  hud: HudSnapshot;
  onVirtualMove: (x: number, y: number) => void;
  onTouchLook: (dx: number, dy: number) => void;
  onVirtualFire: (down: boolean) => void;
  onTriggerScope: () => void;
  onTriggerReload: () => void;
  onTriggerJump: () => void;
  onToggleCrouch: () => void;
  onVirtualInteract: (down: boolean) => void;
  onCycleWeapon: () => void;
  onThrowGrenade: (id: GrenadeId) => void;
  onToggleBuy: () => void;
  onToggleMap: () => void;
  onToggleScoreboard: (open: boolean) => void;
  onPause: () => void;
}

export const MobileControls: React.FC<MobileControlsProps> = ({
  hud,
  onVirtualMove,
  onTouchLook,
  onVirtualFire,
  onTriggerScope,
  onTriggerReload,
  onTriggerJump,
  onToggleCrouch,
  onVirtualInteract,
  onCycleWeapon,
  onThrowGrenade,
  onToggleBuy,
  onToggleMap,
  onToggleScoreboard,
  onPause,
}) => {
  const movePointerId = useRef<number | null>(null);
  const moveOrigin = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const [knobOffset, setKnobOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const lookPointerId = useRef<number | null>(null);
  const lookLast = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const activeWeaponId =
    hud.activeSlot === 1 && hud.primaryWeapon
      ? hud.primaryWeapon.id
      : hud.activeSlot === 2 && hud.secondaryWeapon
        ? hud.secondaryWeapon.id
        : 'knife';
  const activeSpec = WEAPON_SPECS[activeWeaponId];
  const stickMaxRadius = 46;

  const handleMoveDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (movePointerId.current !== null) return;
    movePointerId.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    moveOrigin.current = { x: cx, y: cy };
    updateStick(e.clientX, e.clientY);
  };

  const updateStick = (px: number, py: number) => {
    const dx = px - moveOrigin.current.x;
    const dy = py - moveOrigin.current.y;
    const dist = Math.hypot(dx, dy);
    const clamped = Math.min(stickMaxRadius, dist);
    const ang = Math.atan2(dy, dx);
    const kx = dist > 0 ? Math.cos(ang) * clamped : 0;
    const ky = dist > 0 ? Math.sin(ang) * clamped : 0;
    setKnobOffset({ x: kx, y: ky });
    onVirtualMove(kx / stickMaxRadius, -ky / stickMaxRadius);
  };

  const handleMoveMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== movePointerId.current) return;
    updateStick(e.clientX, e.clientY);
  };

  const handleMoveUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== movePointerId.current) return;
    movePointerId.current = null;
    setKnobOffset({ x: 0, y: 0 });
    onVirtualMove(0, 0);
  };

  const handleLookDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (lookPointerId.current !== null) return;
    lookPointerId.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    lookLast.current = { x: e.clientX, y: e.clientY };
  };

  const handleLookMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== lookPointerId.current) return;
    const dx = e.clientX - lookLast.current.x;
    const dy = e.clientY - lookLast.current.y;
    lookLast.current = { x: e.clientX, y: e.clientY };
    onTouchLook(dx, dy);
  };

  const handleLookUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== lookPointerId.current) return;
    lookPointerId.current = null;
  };

  return (
    <div className="fixed inset-0 z-20 pointer-events-none touch-surface safe-top safe-bottom safe-x">
      {/* Right-half touch aim surface (behind action buttons) */}
      <div
        onPointerDown={handleLookDown}
        onPointerMove={handleLookMove}
        onPointerUp={handleLookUp}
        onPointerCancel={handleLookUp}
        className="pointer-events-auto fixed top-14 right-0 bottom-0 left-[38%]"
      />

      {/* Top Quick Action Bar for Mobile (Buy / Map / Scoreboard / Pause) */}
      <div className="pointer-events-auto fixed top-3 right-3 safe-top flex items-center gap-2 z-30">
        {hud.roundPhase === 'buy' && (
          <button
            type="button"
            onClick={onToggleBuy}
            className="min-w-[44px] min-h-[44px] px-3 flex items-center gap-1.5 text-xs font-bold text-amber-200 border border-amber-400/55 active:scale-95"
            style={{ backgroundColor: 'rgba(32, 24, 10, 0.88)' }}
          >
            <ShoppingBag className="w-4 h-4" />
            <span>BUY</span>
          </button>
        )}
        <button
          type="button"
          onClick={onToggleMap}
          aria-label="Toggle Tactical Map"
          className="min-w-[44px] min-h-[44px] px-2.5 flex items-center justify-center text-slate-100 border border-white/20 active:scale-95"
          style={{ backgroundColor: 'rgba(11, 15, 22, 0.82)' }}
        >
          <MapIcon className="w-4 h-4" />
        </button>
        <button
          type="button"
          onPointerDown={() => onToggleScoreboard(true)}
          onPointerUp={() => onToggleScoreboard(false)}
          onPointerCancel={() => onToggleScoreboard(false)}
          aria-label="Hold for Scoreboard"
          className="min-w-[44px] min-h-[44px] px-2.5 flex items-center justify-center text-slate-100 border border-white/20 active:scale-95"
          style={{ backgroundColor: 'rgba(11, 15, 22, 0.82)' }}
        >
          <Users className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={onPause}
          aria-label="Pause Match"
          className="min-w-[44px] min-h-[44px] px-2.5 flex items-center justify-center text-slate-100 border border-white/20 active:scale-95"
          style={{ backgroundColor: 'rgba(11, 15, 22, 0.82)' }}
        >
          <Pause className="w-4 h-4" />
        </button>
      </div>

      {/* Left Virtual Movement Thumbstick */}
      {hud.playerAlive && (
        <div
          onPointerDown={handleMoveDown}
          onPointerMove={handleMoveMove}
          onPointerUp={handleMoveUp}
          onPointerCancel={handleMoveUp}
          className="pointer-events-auto fixed left-5 bottom-24 sm:bottom-28 w-28 h-28 rounded-full border border-white/25 flex items-center justify-center"
          style={{ backgroundColor: 'rgba(10, 14, 20, 0.48)' }}
        >
          <div className="w-16 h-16 rounded-full border border-white/10 pointer-events-none" />
          <div
            className="absolute w-12 h-12 rounded-full border-2 border-[#6cb8eb]/80 pointer-events-none"
            style={{
              backgroundColor: 'rgba(93, 168, 220, 0.34)',
              transform: `translate(${knobOffset.x}px, ${knobOffset.y}px)`,
            }}
          />
        </div>
      )}

      {/* Contextual Interact / Plant / Defuse / Pickup Button */}
      {(hud.interactPrompt || hud.actionLabel) && hud.playerAlive && (
        <button
          type="button"
          onPointerDown={() => onVirtualInteract(true)}
          onPointerUp={() => onVirtualInteract(false)}
          onPointerCancel={() => onVirtualInteract(false)}
          className="pointer-events-auto fixed bottom-36 left-1/2 -translate-x-1/2 min-h-[46px] px-5 py-2.5 border border-amber-400/75 text-xs font-display font-bold tracking-wider text-amber-200 active:scale-95"
          style={{ backgroundColor: 'rgba(26, 18, 8, 0.90)' }}
        >
          {hud.actionLabel ? 'HOLDING...' : hud.interactPrompt?.replace(/Hold E to |E: /i, 'HOLD / TAP: ')}
        </button>
      )}

      {/* Right Ergonomic Combat Cluster */}
      {hud.playerAlive ? (
        <div className="pointer-events-auto fixed right-4 bottom-24 sm:bottom-28 flex flex-col items-end gap-2.5 z-30">
          {/* Carried Grenade Quick Pills */}
          {(hud.grenades.smoke > 0 || hud.grenades.flash > 0 || hud.grenades.he > 0) && (
            <div className="flex items-center gap-2">
              {(['smoke', 'flash', 'he'] as GrenadeId[]).map((gid) =>
                hud.grenades[gid] > 0 ? (
                  <button
                    key={gid}
                    type="button"
                    onClick={() => onThrowGrenade(gid)}
                    className="min-w-[44px] min-h-[44px] px-2.5 text-[11px] font-bold uppercase text-white border border-amber-400/50 active:scale-95"
                    style={{ backgroundColor: 'rgba(18, 24, 34, 0.85)' }}
                  >
                    {gid}
                  </button>
                ) : null
              )}
            </div>
          )}

          {/* Secondary Action Row: Scope / Reload / Weapon Cycle */}
          <div className="flex items-center gap-2">
            {activeSpec.hasScope && (
              <button
                type="button"
                onClick={onTriggerScope}
                className={`min-w-[48px] min-h-[48px] px-3 flex items-center justify-center text-xs font-bold border active:scale-95 ${
                  hud.scopeLevel > 0
                    ? 'border-[#6cb8eb] text-[#6cb8eb]'
                    : 'border-white/25 text-white'
                }`}
                style={{ backgroundColor: 'rgba(11, 15, 22, 0.84)' }}
              >
                SCOPE
              </button>
            )}
            <button
              type="button"
              onClick={onTriggerReload}
              aria-label="Reload"
              className="min-w-[48px] min-h-[48px] px-3 flex items-center justify-center text-xs font-bold text-slate-100 border border-white/25 active:scale-95"
              style={{ backgroundColor: 'rgba(11, 15, 22, 0.84)' }}
            >
              <RotateCw className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onCycleWeapon}
              className="min-w-[54px] min-h-[48px] px-3 flex items-center justify-center text-xs font-display font-bold text-[#7cc4f5] border border-white/25 active:scale-95"
              style={{ backgroundColor: 'rgba(11, 15, 22, 0.84)' }}
            >
              {activeSpec.shortName}
            </button>
          </div>

          {/* Primary Combat Row: Crouch + Jump + Large Fire Trigger */}
          <div className="flex items-end gap-2.5">
            <button
              type="button"
              onClick={onToggleCrouch}
              className={`min-w-[48px] min-h-[48px] px-3 flex items-center justify-center text-[11px] font-bold border active:scale-95 ${
                hud.isCrouching
                  ? 'border-[#6cb8eb] bg-[#173049]/90 text-[#8fd0ff]'
                  : 'border-white/25 text-slate-200'
              }`}
              style={!hud.isCrouching ? { backgroundColor: 'rgba(11, 15, 22, 0.84)' } : undefined}
            >
              DUCK
            </button>
            <button
              type="button"
              onClick={onTriggerJump}
              className="min-w-[52px] min-h-[52px] px-3 flex items-center justify-center text-[11px] font-bold text-slate-100 border border-white/25 active:scale-95"
              style={{ backgroundColor: 'rgba(11, 15, 22, 0.84)' }}
            >
              JUMP
            </button>
            <button
              type="button"
              onPointerDown={(e) => {
                e.stopPropagation();
                onVirtualFire(true);
              }}
              onPointerUp={(e) => {
                e.stopPropagation();
                onVirtualFire(false);
              }}
              onPointerCancel={() => onVirtualFire(false)}
              aria-label="Fire Weapon"
              className="w-[74px] h-[74px] rounded-full border-2 border-[#ef4444]/85 flex items-center justify-center text-white shadow-lg active:scale-95"
              style={{ backgroundColor: 'rgba(205, 42, 42, 0.58)' }}
            >
              <Crosshair className="w-7 h-7" />
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => onVirtualFire(true)}
          className="pointer-events-auto fixed bottom-28 right-5 min-h-[48px] px-4 py-2 text-xs font-display font-bold tracking-wider text-amber-200 border border-amber-400/50"
          style={{ backgroundColor: 'rgba(14, 18, 25, 0.88)' }}
        >
          NEXT SPECTATE
        </button>
      )}
    </div>
  );
};
