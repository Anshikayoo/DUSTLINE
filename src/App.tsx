/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState } from 'react';
import { GameEngine } from './game/GameEngine';
import {
  GraphicsSettings,
  HudSnapshot,
  MATCH_CONSTANTS,
  MinimapRect,
  PlayerSetupConfig,
  WEAPON_SPECS,
} from './game/types';
import { GameHUD } from './components/GameHUD';
import { BuyMenu } from './components/BuyMenu';
import { Scoreboard } from './components/Scoreboard';
import { FullMapOverlay } from './components/FullMapOverlay';
import { MobileControls } from './components/MobileControls';
import { OfflineIndicator } from './components/PWAComponents';
import { MatchOverScreen, PauseMenu, TitleScreen } from './components/Overlays';

const INITIAL_HUD: HudSnapshot = {
  screen: 'menu',
  pointerLocked: false,
  setup: {
    name: 'Player',
    uniform: 'navy',
    gender: 'male',
    location: 'dust_canyon',
    mapSize: 'standard',
    teamSize: 5,
    side: 'CT',
    difficulty: 'medium',
  },
  setupMapPreview: false,
  loadingProgress: 1,
  loadingLabel: '',
  roundNumber: 1,
  roundPhase: 'buy',
  roundTimer: MATCH_CONSTANTS.ROUND_DURATION,
  buyTimer: MATCH_CONSTANTS.BUY_PHASE_DURATION,
  ctScore: 0,
  tScore: 0,
  ctAlive: 5,
  tAlive: 5,
  health: 100,
  armor: 0,
  hasHelmet: false,
  hasDefuseKit: false,
  hasBomb: false,
  money: MATCH_CONSTANTS.START_MONEY,
  activeSlot: 2,
  primaryWeapon: null,
  secondaryWeapon: {
    id: 'usps',
    ammo: WEAPON_SPECS.usps.magSize,
    reserve: WEAPON_SPECS.usps.maxReserve,
  },
  grenades: { smoke: 0, flash: 0, he: 0 },
  isReloading: false,
  reloadProgress: 0,
  scopeLevel: 0,
  crosshairSpread: 6,
  isCrouching: false,
  isWalking: false,
  playerAlive: true,
  spectatingName: null,
  buyMenuOpen: false,
  scoreboardOpen: false,
  fullMapOpen: false,
  fullMapMode: '3d',
  fullMapTilt: true,
  fullMapZoom: 1.0,
  fullMapPanX: 0,
  fullMapPanZ: 0,
  radarZoom: 1.0,
  currentCallout: 'CT Spawn',
  calloutLabels: [],
  droppedWeaponBlips: [],
  buyHintMessage: null,
  interactPrompt: null,
  actionProgress: null,
  actionLabel: null,
  bombState: 'carried',
  bombSite: null,
  bombTimer: MATCH_CONSTANTS.BOMB_FUSE_DURATION,
  bombPosX: 0,
  bombPosZ: 0,
  hitMarkerType: 'none',
  hitMarkerAlpha: 0,
  damageIndicatorAngle: 0,
  damageIndicatorAlpha: 0,
  damageFlashAlpha: 0,
  flashBlindAlpha: 0,
  lowHealthAlpha: 0,
  bannerTitle: null,
  bannerSubtitle: null,
  bannerAccent: 'neutral',
  mvpText: null,
  killFeed: [],
  radioCallouts: [],
  scoreboardRows: [],
  playerX: 0,
  playerZ: 52,
  playerYaw: 0,
  minimapBlips: [],
  matchWinner: null,
  stats: {
    kills: 0,
    deaths: 0,
    headshots: 0,
    shotsFired: 0,
    shotsHit: 0,
    damageDealt: 0,
    roundsPlayed: 0,
    plants: 0,
    defuses: 0,
  },
  muted: false,
  volume: 0.72,
  sensitivity: 1.0,
  fov: 75,
  graphics: {
    quality: 'high',
    shadows: true,
    postProcessing: true,
    bloodEffects: true,
    showFps: false,
    radarRotating: true,
    fullMapPauses: false,
    touchControls: 'auto',
  },
  fps: 60,
  fpsWarning: null,
  isSoftwareGl: false,
  isTouchDevice: false,
};

type BuyItemId =
  | 'usps'
  | 'mp9'
  | 'nova'
  | 'm4a4'
  | 'awp'
  | 'armor'
  | 'helmet'
  | 'kit'
  | 'smoke'
  | 'flash'
  | 'he';

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);
  const [minimapData, setMinimapData] = useState<{ rects: MinimapRect[]; halfSize: number }>({
    rects: [],
    halfSize: 88,
  });

  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;

    const engine = new GameEngine(mount, (snapshot) => {
      setHud(snapshot);
    });
    engineRef.current = engine;
    setMinimapData(engine.getMinimapGeometry());

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  const touchActive =
    hud.graphics.touchControls === 'on' ||
    (hud.graphics.touchControls === 'auto' && hud.isTouchDevice);

  const handleUpdateSetup = (partial: Partial<PlayerSetupConfig>) => {
    engineRef.current?.updateSetup(partial);
    if ((partial.location || partial.mapSize) && engineRef.current) {
      setMinimapData(engineRef.current.getMinimapGeometry());
    }
  };

  const handleUpdateGraphics = (partial: Partial<GraphicsSettings>) => {
    engineRef.current?.setGraphics(partial);
    if (engineRef.current) {
      setMinimapData(engineRef.current.getMinimapGeometry());
    }
  };

  return (
    <div className="relative w-screen h-[100dvh] overflow-hidden bg-[#0b0f15] touch-surface">
      {/* Isolated WebGL Viewport Container */}
      <div ref={canvasMountRef} className="fixed inset-0 w-full h-full" />

      {/* Offline Status Banner */}
      <OfflineIndicator />

      {/* Player Setup & Location Preview Screen */}
      {hud.screen === 'menu' && (
        <TitleScreen
          hud={hud}
          onUpdateSetup={handleUpdateSetup}
          onUpdateGraphics={handleUpdateGraphics}
          onToggleMapPreview={() => engineRef.current?.toggleSetupMapPreview()}
          onStart={() => engineRef.current?.startNewMatch()}
          onToggleMute={() => {
            if (!engineRef.current) return;
            engineRef.current.setMuted(!engineRef.current.audio.isMuted());
          }}
        />
      )}

      {/* Active Gameplay HUD */}
      {(hud.screen === 'playing' || hud.screen === 'paused') && (
        <GameHUD
          hud={hud}
          minimapRects={minimapData.rects}
          mapHalfSize={minimapData.halfSize}
          touchActive={touchActive}
          onOpenFullMap={() => engineRef.current?.toggleFullMap(true)}
        />
      )}

      {/* Full Tactical Map Overlay (M / Tap Minimap) */}
      {hud.screen === 'playing' && hud.fullMapOpen && !hud.buyMenuOpen && (
        <FullMapOverlay
          hud={hud}
          rects={minimapData.rects}
          halfSize={minimapData.halfSize}
          onSetMode={(m) => engineRef.current?.setFullMapMode(m)}
          onSetTilt={(t) => engineRef.current?.setFullMapTilt(t)}
          onZoom={(d) => engineRef.current?.zoomFullMap(d)}
          onPan={(dx, dz) => engineRef.current?.panFullMap(dx, dz)}
          onReset={() => engineRef.current?.resetFullMapView()}
          onClose={() => engineRef.current?.toggleFullMap(false)}
        />
      )}

      {/* Mobile / Touch Dual-Stick Controls */}
      {hud.screen === 'playing' && touchActive && !hud.buyMenuOpen && !hud.fullMapOpen && (
        <MobileControls
          hud={hud}
          onVirtualMove={(x, y) => engineRef.current?.setVirtualMove(x, y)}
          onTouchLook={(dx, dy) => engineRef.current?.addTouchLookDelta(dx, dy)}
          onVirtualFire={(down) => engineRef.current?.setVirtualFire(down)}
          onTriggerScope={() => engineRef.current?.triggerScope()}
          onTriggerReload={() => engineRef.current?.triggerReload()}
          onTriggerJump={() => engineRef.current?.triggerJump()}
          onToggleCrouch={() => engineRef.current?.toggleVirtualCrouch()}
          onVirtualInteract={(down) => engineRef.current?.setVirtualInteract(down)}
          onCycleWeapon={() => engineRef.current?.cycleWeaponSlot()}
          onThrowGrenade={(gid) => engineRef.current?.throwGrenade(gid)}
          onToggleBuy={() => engineRef.current?.toggleBuyMenu()}
          onToggleMap={() => engineRef.current?.toggleFullMap()}
          onToggleScoreboard={(open) => engineRef.current?.setScoreboardOpen(open)}
          onPause={() => engineRef.current?.togglePause()}
        />
      )}

      {/* Tab Scoreboard */}
      {hud.screen === 'playing' && hud.scoreboardOpen && !hud.buyMenuOpen && (
        <Scoreboard hud={hud} />
      )}

      {/* Desktop/Mac Click-to-aim prompt when Pointer Lock is disengaged */}
      {hud.screen === 'playing' &&
        !touchActive &&
        !hud.pointerLocked &&
        !hud.buyMenuOpen &&
        !hud.fullMapOpen && (
          <div
            onClick={() => engineRef.current?.requestPointerLock()}
            className="fixed inset-0 z-20 flex items-center justify-center cursor-pointer"
            style={{ backgroundColor: 'rgba(8, 12, 18, 0.35)' }}
          >
            <div
              className="px-6 py-3 border border-[#6cb8eb]/50 text-center"
              style={{ backgroundColor: 'rgba(11, 15, 22, 0.90)' }}
            >
              <div className="font-display text-sm font-bold tracking-wider text-white">
                CLICK TO LOCK MOUSE AIM
              </div>
              <div className="text-xs text-slate-400 mt-1">
                Press B during Buy Phase for Armory · M for Tactical Map · Esc to pause
              </div>
            </div>
          </div>
        )}

      {/* Armory Buy Menu Overlay */}
      {hud.screen === 'playing' && hud.buyMenuOpen && (
        <BuyMenu
          hud={hud}
          onBuy={(item: BuyItemId) => engineRef.current?.buyItem(item)}
          onClose={() => engineRef.current?.closeBuyMenu()}
        />
      )}

      {/* Pause Menu Overlay */}
      {hud.screen === 'paused' && (
        <PauseMenu
          hud={hud}
          onResume={() => engineRef.current?.resumeGame()}
          onRestart={() => engineRef.current?.startNewMatch()}
          onMainMenu={() => engineRef.current?.returnToMenu()}
          onSensitivityChange={(v) => engineRef.current?.setSensitivity(v)}
          onVolumeChange={(v) => engineRef.current?.setVolume(v)}
          onFovChange={(v) => engineRef.current?.setFov(v)}
          onToggleMute={() => {
            if (!engineRef.current) return;
            engineRef.current.setMuted(!engineRef.current.audio.isMuted());
          }}
          onUpdateGraphics={handleUpdateGraphics}
        />
      )}

      {/* End-of-Match Victory / Defeat Screen */}
      {hud.screen === 'match_over' && (
        <MatchOverScreen
          hud={hud}
          onPlayAgain={() => engineRef.current?.startNewMatch()}
          onMainMenu={() => engineRef.current?.returnToMenu()}
        />
      )}
    </div>
  );
}
