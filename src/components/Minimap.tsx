import React, { useEffect, useRef } from 'react';
import {
  BombState,
  DroppedWeaponBlip,
  MapCallout,
  MinimapBlip,
  MinimapRect,
  TeamSide,
} from '../game/types';

interface MinimapProps {
  rects: MinimapRect[];
  halfSize: number;
  playerX: number;
  playerZ: number;
  playerYaw: number;
  playerSide: TeamSide;
  playerAlive: boolean;
  blips: MinimapBlip[];
  droppedWeapons: DroppedWeaponBlip[];
  calloutLabels: MapCallout[];
  currentCallout: string;
  bombState: BombState;
  bombPosX: number;
  bombPosZ: number;
  rotating: boolean;
  radarZoom: number;
  compact?: boolean;
  onOpenFullMap?: () => void;
}

export const Minimap: React.FC<MinimapProps> = ({
  rects,
  halfSize,
  playerX,
  playerZ,
  playerYaw,
  playerSide,
  playerAlive,
  blips,
  droppedWeapons,
  calloutLabels,
  currentCallout,
  bombState,
  bombPosX,
  bombPosZ,
  rotating,
  radarZoom,
  compact = false,
  onOpenFullMap,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const size = compact ? 112 : 168;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== size * dpr) {
      canvas.width = size * dpr;
      canvas.height = size * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = 'rgba(10, 14, 20, 0.86)';
    ctx.fillRect(0, 0, size, size);

    const viewSpan = (halfSize * 2) / radarZoom;
    const scale = (size - 12) / viewSpan;

    ctx.save();
    if (rotating && playerAlive) {
      ctx.translate(size / 2, size / 2);
      ctx.rotate(playerYaw);
      ctx.scale(scale, scale);
      ctx.translate(-playerX, -playerZ);
    } else {
      ctx.translate(size / 2, size / 2);
      ctx.scale(scale, scale);
    }

    // Subtle radar grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1 / scale;
    const step = halfSize / 2;
    for (let g = -halfSize; g <= halfSize; g += step) {
      ctx.beginPath();
      ctx.moveTo(g, -halfSize);
      ctx.lineTo(g, halfSize);
      ctx.moveTo(-halfSize, g);
      ctx.lineTo(halfSize, g);
      ctx.stroke();
    }

    // Bomb Sites
    for (const r of rects) {
      if (r.kind !== 'siteA' && r.kind !== 'siteB') continue;
      ctx.fillStyle = r.kind === 'siteA' ? 'rgba(214, 72, 42, 0.25)' : 'rgba(218, 138, 38, 0.25)';
      ctx.fillRect(r.x - r.w / 2, r.z - r.d / 2, r.w, r.d);
      ctx.strokeStyle = r.kind === 'siteA' ? 'rgba(235, 96, 62, 0.75)' : 'rgba(238, 162, 56, 0.75)';
      ctx.lineWidth = 1.1 / scale;
      ctx.strokeRect(r.x - r.w / 2, r.z - r.d / 2, r.w, r.d);
    }

    // Map geometry & elevated platforms
    for (const r of rects) {
      if (r.kind === 'siteA' || r.kind === 'siteB') continue;
      if (r.kind === 'platform') ctx.fillStyle = 'rgba(93, 168, 220, 0.28)';
      else if (r.kind === 'building') ctx.fillStyle = 'rgba(138, 148, 162, 0.44)';
      else if (r.kind === 'wall') ctx.fillStyle = 'rgba(186, 174, 152, 0.68)';
      else if (r.kind === 'container') ctx.fillStyle = 'rgba(92, 132, 164, 0.76)';
      else ctx.fillStyle = 'rgba(172, 132, 86, 0.72)';
      ctx.fillRect(r.x - r.w / 2, r.z - r.d / 2, Math.max(1.2 / scale, r.w), Math.max(1.2 / scale, r.d));
    }

    // Dropped weapons
    for (const dw of droppedWeapons) {
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(dw.x - 1.5 / scale, dw.z - 0.8 / scale, 3 / scale, 1.6 / scale);
    }

    // Site A & B labels
    for (const c of calloutLabels) {
      if (c.kind !== 'site') continue;
      const label = c.name.includes('A') ? 'A' : 'B';
      ctx.save();
      ctx.translate(c.x, c.z);
      if (rotating && playerAlive) ctx.rotate(-playerYaw);
      ctx.font = `700 ${Math.round(10 / scale)}px "Chakra Petch", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = label === 'A' ? '#f28b6e' : '#f4bd64';
      ctx.fillText(label, 0, 0);
      ctx.restore();
    }

    // Allies & Spotted Enemies
    for (const b of blips) {
      if (!b.alive) continue;
      const isAlly = b.team === playerSide;
      if (!isAlly && !b.spotted) continue;
      ctx.fillStyle = isAlly ? '#5da8dc' : '#ef4444';
      ctx.beginPath();
      ctx.arc(b.x, b.z, (isAlly ? 2.7 : 3.2) / scale, 0, Math.PI * 2);
      ctx.fill();
      if (b.hasBomb) {
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 1.4 / scale;
        ctx.stroke();
      }
    }

    // Planted Bomb
    if (bombState === 'planted') {
      const sz = 6.5 / scale;
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(bombPosX - sz / 2, bombPosZ - sz / 2, sz, sz);
      ctx.strokeStyle = '#fef08a';
      ctx.lineWidth = 1.3 / scale;
      ctx.strokeRect(bombPosX - sz * 0.65, bombPosZ - sz * 0.65, sz * 1.3, sz * 1.3);
    }

    // Player Marker & Vision Cone
    if (playerAlive) {
      const dirAngle = -Math.PI / 2 - playerYaw;
      ctx.save();
      ctx.translate(playerX, playerZ);
      ctx.fillStyle = 'rgba(110, 231, 183, 0.22)';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, 20 / scale, dirAngle - 0.48, dirAngle + 0.48);
      ctx.closePath();
      ctx.fill();

      ctx.rotate(dirAngle);
      ctx.fillStyle = '#6ee7b7';
      ctx.beginPath();
      ctx.moveTo(5.5 / scale, 0);
      ctx.lineTo(-3.5 / scale, -3.5 / scale);
      ctx.lineTo(-1.8 / scale, 0);
      ctx.lineTo(-3.5 / scale, 3.5 / scale);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();
  }, [
    rects,
    halfSize,
    playerX,
    playerZ,
    playerYaw,
    playerSide,
    playerAlive,
    blips,
    droppedWeapons,
    calloutLabels,
    bombState,
    bombPosX,
    bombPosZ,
    rotating,
    radarZoom,
    size,
  ]);

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={onOpenFullMap}
        disabled={!onOpenFullMap}
        className={`overflow-hidden border border-white/15 text-left ${
          onOpenFullMap ? 'pointer-events-auto cursor-pointer' : ''
        }`}
        style={{ width: size, height: size, backgroundColor: 'rgba(10, 14, 20, 0.86)' }}
        aria-label="Open full tactical map"
      >
        <canvas ref={canvasRef} style={{ width: size, height: size, display: 'block' }} />
      </button>
      <div
        className="flex items-center justify-between px-2 py-0.5 text-[10px] sm:text-[11px] font-medium tracking-wide text-slate-200 border border-white/10"
        style={{ width: size, backgroundColor: 'rgba(10, 14, 20, 0.80)' }}
      >
        <span className="truncate">{currentCallout}</span>
        <span className="text-slate-400 font-mono-num shrink-0 ml-1">
          {rotating ? 'ROT' : 'N↑'}
        </span>
      </div>
    </div>
  );
};
