import React, { useEffect, useRef } from 'react';
import { Layers, Minus, Plus, RotateCcw, X } from 'lucide-react';
import {
  FullMapMode,
  HudSnapshot,
  LOCATION_THEMES,
  MAP_SIZE_CONFIGS,
  MinimapRect,
} from '../game/types';

interface FullMapOverlayProps {
  hud: HudSnapshot;
  rects: MinimapRect[];
  halfSize: number;
  onSetMode: (mode: FullMapMode) => void;
  onSetTilt: (tilt: boolean) => void;
  onZoom: (delta: number) => void;
  onPan: (dxWorld: number, dzWorld: number) => void;
  onReset: () => void;
  onClose: () => void;
}

export const FullMapOverlay: React.FC<FullMapOverlayProps> = ({
  hud,
  rects,
  halfSize,
  onSetMode,
  onSetTilt,
  onZoom,
  onPan,
  onReset,
  onClose,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragging = useRef(false);
  const lastPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  useEffect(() => {
    if (hud.fullMapMode !== '2d') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = Math.min(window.innerWidth - 32, window.innerHeight - 140, 680);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const viewHalf = halfSize / hud.fullMapZoom;
    const toPxX = (wx: number) => ((wx - hud.fullMapPanX + viewHalf) / (viewHalf * 2)) * size;
    const toPxZ = (wz: number) => ((wz - hud.fullMapPanZ + viewHalf) / (viewHalf * 2)) * size;
    const scale = size / (viewHalf * 2);

    ctx.fillStyle = 'rgba(10, 14, 20, 0.96)';
    ctx.fillRect(0, 0, size, size);

    // Grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    const step = size / 8;
    for (let i = 1; i < 8; i++) {
      ctx.beginPath();
      ctx.moveTo(step * i, 0);
      ctx.lineTo(step * i, size);
      ctx.moveTo(0, step * i);
      ctx.lineTo(size, step * i);
      ctx.stroke();
    }

    // Bomb Sites
    for (const r of rects) {
      if (r.kind !== 'siteA' && r.kind !== 'siteB') continue;
      const rx = toPxX(r.x - r.w / 2);
      const rz = toPxZ(r.z - r.d / 2);
      ctx.fillStyle = r.kind === 'siteA' ? 'rgba(214, 72, 42, 0.25)' : 'rgba(218, 138, 38, 0.25)';
      ctx.fillRect(rx, rz, r.w * scale, r.d * scale);
      ctx.strokeStyle = r.kind === 'siteA' ? '#f28b6e' : '#f4bd64';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(rx, rz, r.w * scale, r.d * scale);
    }

    // Structures & Elevated Catwalk Platforms
    for (const r of rects) {
      if (r.kind === 'siteA' || r.kind === 'siteB') continue;
      const rx = toPxX(r.x - r.w / 2);
      const rz = toPxZ(r.z - r.d / 2);
      if (r.kind === 'platform') ctx.fillStyle = 'rgba(93, 168, 220, 0.26)';
      else if (r.kind === 'building') ctx.fillStyle = 'rgba(138, 148, 162, 0.5)';
      else if (r.kind === 'wall') ctx.fillStyle = 'rgba(186, 174, 152, 0.72)';
      else if (r.kind === 'container') ctx.fillStyle = 'rgba(92, 132, 164, 0.8)';
      else ctx.fillStyle = 'rgba(172, 132, 86, 0.78)';
      ctx.fillRect(rx, rz, Math.max(2, r.w * scale), Math.max(2, r.d * scale));
    }

    // Dropped Weapons
    for (const dw of hud.droppedWeaponBlips) {
      const dx = toPxX(dw.x);
      const dz = toPxZ(dw.z);
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(dx - 3, dz - 1.5, 6, 3);
    }

    // Callout Zone Labels
    ctx.font = '700 10px "Chakra Petch", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const c of hud.calloutLabels) {
      const cx = toPxX(c.x);
      const cz = toPxZ(c.z);
      ctx.fillStyle =
        c.kind === 'site'
          ? '#fbbf24'
          : c.kind === 'spawn'
            ? '#7cc4f5'
            : 'rgba(226, 232, 240, 0.72)';
      ctx.fillText(c.name.toUpperCase(), cx, cz);
    }

    // Allies & Spotted Enemies
    for (const b of hud.minimapBlips) {
      if (!b.alive) continue;
      const isAlly = b.team === hud.setup.side;
      if (!isAlly && !b.spotted) continue;
      const bx = toPxX(b.x);
      const bz = toPxZ(b.z);
      ctx.fillStyle = isAlly ? '#5da8dc' : '#ef4444';
      ctx.beginPath();
      ctx.arc(bx, bz, isAlly ? 4.2 : 5, 0, Math.PI * 2);
      ctx.fill();
      if (b.hasBomb) {
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    // Planted Bomb
    if (hud.bombState === 'planted') {
      const bx = toPxX(hud.bombPosX);
      const bz = toPxZ(hud.bombPosZ);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(bx - 5, bz - 5, 10, 10);
      ctx.strokeStyle = '#fef08a';
      ctx.lineWidth = 2;
      ctx.strokeRect(bx - 6, bz - 6, 12, 12);
    }

    // Player Marker
    if (hud.playerAlive) {
      const px = toPxX(hud.playerX);
      const pz = toPxZ(hud.playerZ);
      const dirAngle = -Math.PI / 2 - hud.playerYaw;
      ctx.save();
      ctx.translate(px, pz);
      ctx.fillStyle = 'rgba(110, 231, 183, 0.22)';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, 28, dirAngle - 0.45, dirAngle + 0.45);
      ctx.closePath();
      ctx.fill();
      ctx.rotate(dirAngle);
      ctx.fillStyle = '#6ee7b7';
      ctx.beginPath();
      ctx.moveTo(8, 0);
      ctx.lineTo(-5, -5);
      ctx.lineTo(-2.5, 0);
      ctx.lineTo(-5, 5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }, [hud, rects, halfSize]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    lastPos.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    const dx = e.clientX - lastPos.current.x;
    const dy = e.clientY - lastPos.current.y;
    lastPos.current = { x: e.clientX, y: e.clientY };
    const panScale = (halfSize * 2) / (560 * hud.fullMapZoom);
    onPan(-dx * panScale, -dy * panScale);
  };

  const handlePointerUp = () => {
    dragging.current = false;
  };

  return (
    <div
      className="fixed inset-0 z-30 flex flex-col justify-between p-3 sm:p-5 safe-top safe-bottom touch-surface"
      style={{
        backgroundColor:
          hud.fullMapMode === '3d' ? 'rgba(6, 9, 14, 0.14)' : 'rgba(6, 9, 14, 0.86)',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onWheel={(e) => onZoom(e.deltaY > 0 ? -0.18 : 0.18)}
    >
      {/* Top Toolbar */}
      <div
        onPointerDown={(e) => e.stopPropagation()}
        className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 border border-white/15"
        style={{ backgroundColor: 'rgba(11, 15, 22, 0.92)' }}
      >
        <div>
          <div className="font-display text-sm sm:text-base font-bold tracking-wider text-white">
            TACTICAL OVERVIEW — {LOCATION_THEMES[hud.setup.location].name.toUpperCase()}
          </div>
          <div className="text-[11px] text-slate-400">
            {MAP_SIZE_CONFIGS[hud.setup.mapSize].dimensionsLabel} · Zone: {hud.currentCallout} · Drag to pan, Pinch/Buttons to zoom
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => onSetMode(hud.fullMapMode === '3d' ? '2d' : '3d')}
            className="min-h-[38px] px-3 flex items-center gap-1.5 text-xs font-semibold text-[#7cc4f5] border border-[#5da8dc]/45 bg-[#122030] cursor-pointer"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>{hud.fullMapMode === '3d' ? '3D Ortho' : '2D Radar'}</span>
          </button>

          {hud.fullMapMode === '3d' && (
            <button
              type="button"
              onClick={() => onSetTilt(!hud.fullMapTilt)}
              className={`min-h-[38px] px-3 text-xs font-semibold border cursor-pointer ${
                hud.fullMapTilt
                  ? 'border-[#5da8dc] text-white bg-[#172b40]'
                  : 'border-white/15 text-slate-300 bg-black/30'
              }`}
            >
              {hud.fullMapTilt ? 'Tilted' : 'Flat Top'}
            </button>
          )}

          <button
            type="button"
            onClick={() => onZoom(-0.25)}
            aria-label="Zoom out map"
            className="min-w-[38px] min-h-[38px] flex items-center justify-center border border-white/15 text-slate-200 hover:bg-white/10 cursor-pointer"
          >
            <Minus className="w-4 h-4" />
          </button>
          <span className="font-mono-num text-xs text-slate-300 px-1.5">
            {hud.fullMapZoom.toFixed(1)}×
          </span>
          <button
            type="button"
            onClick={() => onZoom(0.25)}
            aria-label="Zoom in map"
            className="min-w-[38px] min-h-[38px] flex items-center justify-center border border-white/15 text-slate-200 hover:bg-white/10 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onReset}
            aria-label="Reset map view"
            className="min-w-[38px] min-h-[38px] flex items-center justify-center border border-white/15 text-slate-200 hover:bg-white/10 cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[38px] px-3 flex items-center gap-1.5 text-xs font-bold text-white border border-white/25 bg-white/10 hover:bg-white/20 cursor-pointer"
          >
            <X className="w-4 h-4" />
            <span>Close [M]</span>
          </button>
        </div>
      </div>

      {/* 2D Radar Canvas Centerpiece */}
      {hud.fullMapMode === '2d' && (
        <div className="my-auto flex items-center justify-center">
          <div className="border border-white/20 shadow-2xl">
            <canvas ref={canvasRef} className="block" />
          </div>
        </div>
      )}

      {/* Bottom Legend */}
      <div
        onPointerDown={(e) => e.stopPropagation()}
        className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 text-[11px] text-slate-300 border border-white/12"
        style={{ backgroundColor: 'rgba(11, 15, 22, 0.90)' }}
      >
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 bg-[#6ee7b7] inline-block" /> You
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#5da8dc] inline-block" /> Allies
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#ef4444] inline-block" /> Spotted Hostiles
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 bg-[#fbbf24] inline-block" /> Bomb / Sites A & B
          </span>
        </div>
        <span className="font-mono-num text-slate-400">
          {hud.bombState === 'planted'
            ? `C4 ARMED AT SITE ${hud.bombSite} (${Math.ceil(hud.bombTimer)}s)`
            : `ROUND ${hud.roundNumber} · CT ${hud.ctAlive} vs ${hud.tAlive} T`}
        </span>
      </div>
    </div>
  );
};
