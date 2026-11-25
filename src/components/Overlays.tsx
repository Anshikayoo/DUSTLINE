import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Compass, Sliders, Volume2, VolumeX } from 'lucide-react';
import {
  Difficulty,
  DIFFICULTY_CONFIGS,
  Gender,
  GRAPHICS_PRESETS,
  GraphicsQuality,
  GraphicsSettings,
  HudSnapshot,
  LOCATION_THEMES,
  LocationId,
  MAP_SIZE_CONFIGS,
  MapSize,
  MATCH_CONSTANTS,
  PlayerSetupConfig,
  TeamSide,
  UNIFORM_STYLES,
  UniformStyleId,
} from '../game/types';
import { PWAInstallButton } from './PWAComponents';

interface SetupScreenProps {
  hud: HudSnapshot;
  onUpdateSetup: (partial: Partial<PlayerSetupConfig>) => void;
  onUpdateGraphics: (partial: Partial<GraphicsSettings>) => void;
  onToggleMapPreview: () => void;
  onStart: () => void;
  onToggleMute: () => void;
}

export const TitleScreen: React.FC<SetupScreenProps> = ({
  hud,
  onUpdateSetup,
  onUpdateGraphics,
  onToggleMapPreview,
  onStart,
  onToggleMute,
}) => {
  const { setup } = hud;
  const enemyUniform = UNIFORM_STYLES[setup.uniform].contrastEnemyId;
  const [showAdvanced, setShowAdvanced] = useState(false);

  const isMac =
    typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);

  if (hud.setupMapPreview) {
    return (
      <div className="pointer-events-none fixed inset-0 z-20 flex flex-col justify-between p-4 sm:p-6 safe-top safe-bottom">
        <div
          className="pointer-events-auto flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 border border-white/15 self-stretch"
          style={{ backgroundColor: 'rgba(11, 15, 22, 0.88)' }}
        >
          <div>
            <div className="font-display text-sm sm:text-base font-bold tracking-wider text-white">
              MAP FLY-THROUGH — {LOCATION_THEMES[setup.location].name.toUpperCase()} ({MAP_SIZE_CONFIGS[setup.mapSize].dimensionsLabel})
            </div>
            <div className="text-[11px] text-slate-400">
              Hold Mouse Drag to Look · WASD / Space / C to Fly · Shift to Boost · Esc to Exit
            </div>
          </div>
          <button
            type="button"
            onClick={onToggleMapPreview}
            className="min-h-[42px] px-4 py-2 bg-[#5da8dc] hover:bg-[#74bce9] text-[#081018] font-display text-xs font-bold tracking-wider cursor-pointer"
          >
            RETURN TO SETUP
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-20 flex flex-col justify-between safe-top safe-bottom safe-x">
      {/* Directional left-side scrim so the right-side 3D character preview & location shine */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            'linear-gradient(95deg, rgba(9, 13, 19, 0.94) 0%, rgba(11, 15, 22, 0.84) 50%, rgba(11, 15, 22, 0.14) 100%)',
        }}
      />

      {/* Top Bar */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-2 px-4 sm:px-8 pt-3 sm:pt-5">
        <div className="flex items-center gap-2.5 sm:gap-3">
          <svg width="34" height="34" viewBox="0 0 44 44" fill="none" aria-hidden="true">
            <rect x="2" y="2" width="40" height="40" stroke="#6cb8eb" strokeWidth="1.5" strokeOpacity="0.65" />
            <path d="M22 7V15M22 29V37M7 22H15M29 22H37" stroke="#f1f5f9" strokeWidth="2" />
            <path d="M16 17L22 12L28 17" stroke="#e59a3c" strokeWidth="2" />
            <circle cx="22" cy="22" r="3" fill="#6cb8eb" />
          </svg>
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-[0.16em] text-white leading-none">
              DUSTLINE
            </h1>
            <p className="text-[10px] sm:text-[11px] tracking-[0.16em] text-slate-400 mt-1">
              TACTICAL 3D FIRST-PERSON SHOOTER
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <PWAInstallButton compact />
          <button
            type="button"
            onClick={onToggleMapPreview}
            className="flex items-center gap-1.5 px-3 min-h-[40px] text-xs font-medium text-slate-200 border border-white/15 hover:bg-white/10 transition-colors cursor-pointer"
            style={{ backgroundColor: 'rgba(11, 15, 22, 0.8)' }}
          >
            <Compass className="w-4 h-4 text-[#6cb8eb]" />
            <span>View Map</span>
          </button>
          <button
            type="button"
            onClick={onToggleMute}
            className="flex items-center gap-1.5 px-3 min-h-[40px] text-xs font-medium text-slate-200 border border-white/15 hover:bg-white/10 transition-colors cursor-pointer"
            style={{ backgroundColor: 'rgba(11, 15, 22, 0.8)' }}
          >
            {hud.muted ? (
              <VolumeX className="w-4 h-4 text-slate-400" />
            ) : (
              <Volume2 className="w-4 h-4 text-[#6cb8eb]" />
            )}
            <span className="hidden sm:inline">{hud.muted ? 'Muted' : 'Audio On'}</span>
          </button>
        </div>
      </div>

      {/* Left-Side Player & Match Setup Form (Scrollable cleanly on mobile) */}
      <div className="relative z-10 px-4 sm:px-8 max-w-xl w-full my-auto py-2 overflow-y-auto max-h-[calc(100dvh-132px)]">
        <div className="flex flex-col gap-3">
          {/* Row 1: Name + Gender */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Operator Name
              </label>
              <input
                type="text"
                maxLength={14}
                value={setup.name}
                onChange={(e) => onUpdateSetup({ name: e.target.value })}
                placeholder="Player"
                className="w-full min-h-[42px] px-3 py-2 text-sm text-white bg-[#0d131c] border border-white/20 focus:border-[#5da8dc] outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Character Model
              </label>
              <div className="grid grid-cols-2 border border-white/20 bg-[#0d131c] p-0.5 min-h-[42px]">
                {(['male', 'female'] as Gender[]).map((g) => (
                  <button
                    type="button"
                    key={g}
                    onClick={() => onUpdateSetup({ gender: g })}
                    className={`py-1.5 text-xs font-semibold capitalize transition-colors cursor-pointer ${
                      setup.gender === g
                        ? 'bg-[#5da8dc] text-[#081018]'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Row 2: Uniform Style (6 options) */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="font-medium text-slate-300">Team Uniform Style</span>
              <span className="text-slate-400">
                Enemies: {UNIFORM_STYLES[enemyUniform].label.split(' ')[0]}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {(Object.keys(UNIFORM_STYLES) as UniformStyleId[]).map((uid) => {
                const st = UNIFORM_STYLES[uid];
                const active = setup.uniform === uid;
                return (
                  <button
                    type="button"
                    key={uid}
                    onClick={() => onUpdateSetup({ uniform: uid })}
                    className={`min-h-[40px] flex items-center gap-2 px-2.5 py-1.5 text-xs border transition-colors cursor-pointer ${
                      active
                        ? 'border-[#5da8dc] bg-[#16273b] text-white font-semibold'
                        : 'border-white/12 bg-[#0d131c] text-slate-300 hover:border-white/30'
                    }`}
                  >
                    <span
                      className="w-3.5 h-3.5 shrink-0 border border-white/30"
                      style={{ backgroundColor: st.swatchCss }}
                    />
                    <span className="truncate">{st.label.split(' ')[0]}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Row 3: Location + Map Size */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
            <div className="sm:col-span-7">
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Operation Location
              </label>
              <select
                value={setup.location}
                onChange={(e) => onUpdateSetup({ location: e.target.value as LocationId })}
                className="w-full min-h-[42px] px-3 py-2 text-sm text-white bg-[#0d131c] border border-white/20 focus:border-[#5da8dc] outline-none cursor-pointer"
              >
                {(Object.keys(LOCATION_THEMES) as LocationId[]).map((lid) => {
                  const loc = LOCATION_THEMES[lid];
                  return (
                    <option key={lid} value={lid}>
                      {loc.name} — {loc.subtitle}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="sm:col-span-5">
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Arena Scale
              </label>
              <div className="grid grid-cols-3 border border-white/20 bg-[#0d131c] p-0.5 min-h-[42px]">
                {(['compact', 'standard', 'large'] as MapSize[]).map((ms) => (
                  <button
                    type="button"
                    key={ms}
                    onClick={() => onUpdateSetup({ mapSize: ms })}
                    className={`py-1.5 text-[11px] font-semibold transition-colors cursor-pointer ${
                      setup.mapSize === ms
                        ? 'bg-[#5da8dc] text-[#081018]'
                        : 'text-slate-300 hover:text-white'
                    }`}
                    title={MAP_SIZE_CONFIGS[ms].description}
                  >
                    {MAP_SIZE_CONFIGS[ms].label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Row 4: Team Size Slider (5 to 25 per side) */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="font-medium text-slate-300">Match Scale (Per Team)</span>
              <span className="font-mono-num font-bold text-[#7cc4f5]">
                {setup.teamSize}v{setup.teamSize} ({setup.teamSize * 2} Players)
              </span>
            </div>
            <input
              type="range"
              min={5}
              max={25}
              step={1}
              value={setup.teamSize}
              onChange={(e) => onUpdateSetup({ teamSize: parseInt(e.target.value, 10) })}
              className="w-full tactical-range"
            />
          </div>

          {/* Row 5: Side & Difficulty */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Side</label>
              <div className="grid grid-cols-2 border border-white/20 bg-[#0d131c] p-0.5 min-h-[40px]">
                {(['CT', 'T'] as TeamSide[]).map((s) => (
                  <button
                    type="button"
                    key={s}
                    onClick={() => onUpdateSetup({ side: s })}
                    className={`py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                      setup.side === s
                        ? s === 'CT'
                          ? 'bg-[#5da8dc] text-[#081018]'
                          : 'bg-[#e59a3c] text-[#140d04]'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    {s === 'CT' ? 'CT (Defuse)' : 'T (Plant)'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Bot Difficulty</label>
              <div className="grid grid-cols-3 border border-white/20 bg-[#0d131c] p-0.5 min-h-[40px]">
                {(['easy', 'medium', 'hard'] as Difficulty[]).map((d) => (
                  <button
                    type="button"
                    key={d}
                    onClick={() => onUpdateSetup({ difficulty: d })}
                    className={`py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                      setup.difficulty === d
                        ? 'bg-[#5da8dc] text-[#081018]'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    {DIFFICULTY_CONFIGS[d].label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Collapsible Graphics & Touch Controls Drawer */}
          <div className="border border-white/12 bg-[#0d131c]/90">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full min-h-[40px] px-3 py-2 flex items-center justify-between text-xs font-medium text-slate-300 hover:text-white cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <Sliders className="w-3.5 h-3.5 text-[#6cb8eb]" />
                <span>
                  Graphics ({GRAPHICS_PRESETS[hud.graphics.quality].label}) · Touch Controls ({hud.graphics.touchControls.toUpperCase()})
                </span>
              </span>
              {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {showAdvanced && (
              <div className="px-3 pb-3 pt-1 border-t border-white/10 flex flex-col gap-2.5 text-xs">
                <div>
                  <div className="text-[11px] text-slate-400 mb-1">Graphics Preset</div>
                  <div className="grid grid-cols-4 border border-white/15 bg-[#090e15] p-0.5">
                    {(['low', 'medium', 'high', 'ultra'] as GraphicsQuality[]).map((q) => (
                      <button
                        type="button"
                        key={q}
                        onClick={() => onUpdateGraphics({ quality: q })}
                        className={`py-1.5 text-[11px] font-semibold cursor-pointer ${
                          hud.graphics.quality === q
                            ? 'bg-[#5da8dc] text-[#081018]'
                            : 'text-slate-300 hover:text-white'
                        }`}
                      >
                        {GRAPHICS_PRESETS[q].label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-[11px] text-slate-400 mb-1">On-Screen Touch Controls</div>
                  <div className="grid grid-cols-3 border border-white/15 bg-[#090e15] p-0.5">
                    {(['auto', 'on', 'off'] as const).map((mode) => (
                      <button
                        type="button"
                        key={mode}
                        onClick={() => onUpdateGraphics({ touchControls: mode })}
                        className={`py-1.5 text-[11px] font-semibold uppercase cursor-pointer ${
                          hud.graphics.touchControls === mode
                            ? 'bg-[#5da8dc] text-[#081018]'
                            : 'text-slate-300 hover:text-white'
                        }`}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap gap-3 text-[11px] text-slate-300">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hud.graphics.radarRotating}
                      onChange={(e) => onUpdateGraphics({ radarRotating: e.target.checked })}
                    />
                    Rotating Radar
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hud.graphics.showFps}
                      onChange={(e) => onUpdateGraphics({ showFps: e.target.checked })}
                    />
                    Show FPS
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* Start Match CTA */}
          <div className="pt-1 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onStart}
              className="min-h-[48px] px-8 py-3 bg-[#5da8dc] hover:bg-[#74bce9] text-[#081018] font-display text-base font-bold tracking-widest transition-colors cursor-pointer whitespace-nowrap"
            >
              START MATCH
            </button>
            <span className="text-xs text-slate-400">
              First to {MATCH_CONSTANTS.ROUNDS_TO_WIN} rounds · {MAP_SIZE_CONFIGS[setup.mapSize].dimensionsLabel}
            </span>
          </div>

          {hud.loadingProgress < 1 && (
            <div className="mt-1">
              <div className="text-[11px] text-[#7cc4f5] mb-1">{hud.loadingLabel}</div>
              <div className="w-full h-1.5 bg-white/10 overflow-hidden">
                <div
                  className="h-full bg-[#5da8dc]"
                  style={{ width: `${Math.round(hud.loadingProgress * 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Adaptive Control Legend */}
      <div
        className="relative z-10 px-4 sm:px-8 py-2.5 border-t border-white/10 text-[11px] text-slate-300 flex flex-wrap items-center gap-x-2.5 gap-y-1"
        style={{ backgroundColor: 'rgba(9, 13, 19, 0.86)' }}
      >
        {hud.isTouchDevice ? (
          <>
            <span>Left Stick Move</span>
            <span aria-hidden="true" className="text-slate-600">·</span>
            <span>Right Drag Aim</span>
            <span aria-hidden="true" className="text-slate-600">·</span>
            <span>Tap Fire / Scope / Reload</span>
            <span aria-hidden="true" className="text-slate-600">·</span>
            <span>Hold Plant/Defuse</span>
          </>
        ) : (
          <>
            <span>WASD Move</span>
            <span aria-hidden="true" className="text-slate-600">·</span>
            <span>{isMac ? 'C Crouch' : 'Ctrl/C Crouch'}</span>
            <span aria-hidden="true" className="text-slate-600">·</span>
            <span>LMB Shoot</span>
            <span aria-hidden="true" className="text-slate-600">·</span>
            <span>{isMac ? 'RMB / V Scope' : 'RMB Scope'}</span>
            <span aria-hidden="true" className="text-slate-600">·</span>
            <span>1-3 Weapons · 4-6 Grenades</span>
            <span aria-hidden="true" className="text-slate-600">·</span>
            <span>B Armory · M Map · E Use · Tab Scoreboard</span>
          </>
        )}
      </div>
    </div>
  );
};

interface PauseMenuProps {
  hud: HudSnapshot;
  onResume: () => void;
  onRestart: () => void;
  onMainMenu: () => void;
  onSensitivityChange: (v: number) => void;
  onVolumeChange: (v: number) => void;
  onFovChange: (v: number) => void;
  onToggleMute: () => void;
  onUpdateGraphics: (partial: Partial<GraphicsSettings>) => void;
}

export const PauseMenu: React.FC<PauseMenuProps> = ({
  hud,
  onResume,
  onRestart,
  onMainMenu,
  onSensitivityChange,
  onVolumeChange,
  onFovChange,
  onToggleMute,
  onUpdateGraphics,
}) => {
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-3 sm:p-6 safe-top safe-bottom"
      style={{ backgroundColor: 'rgba(6, 9, 14, 0.78)' }}
    >
      <div
        className="w-full max-w-lg border border-white/15 p-4 sm:p-6 text-slate-100 max-h-[90dvh] overflow-y-auto"
        style={{ backgroundColor: 'rgba(13, 18, 26, 0.97)' }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-white/10">
          <div>
            <h2 className="font-display text-xl sm:text-2xl font-bold tracking-wider text-white">
              Match Paused
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {LOCATION_THEMES[hud.setup.location].name} · Round {hud.roundNumber} · CT {hud.ctScore} — {hud.tScore} T
            </p>
          </div>
          <button
            type="button"
            onClick={onResume}
            className="min-h-[44px] px-5 py-2.5 bg-[#5da8dc] hover:bg-[#74bce9] text-[#081018] font-display text-sm font-bold tracking-wider transition-colors cursor-pointer"
          >
            RESUME
          </button>
        </div>

        <div className="mt-4 flex flex-col gap-3.5">
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-slate-300">Aim Sensitivity</span>
              <span className="font-mono-num text-[#7cc4f5] font-semibold">
                {hud.sensitivity.toFixed(2)}×
              </span>
            </div>
            <input
              type="range"
              min="0.25"
              max="2.5"
              step="0.05"
              value={hud.sensitivity}
              onChange={(e) => onSensitivityChange(parseFloat(e.target.value))}
              className="w-full tactical-range"
            />
          </div>

          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-slate-300">Field of View (FOV)</span>
              <span className="font-mono-num text-[#7cc4f5] font-semibold">{hud.fov}°</span>
            </div>
            <input
              type="range"
              min="60"
              max="105"
              step="1"
              value={hud.fov}
              onChange={(e) => onFovChange(parseInt(e.target.value, 10))}
              className="w-full tactical-range"
            />
          </div>

          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-slate-300">Master Audio Volume</span>
              <div className="flex items-center gap-3">
                <span className="font-mono-num text-[#7cc4f5] font-semibold">
                  {hud.muted ? '0%' : `${Math.round(hud.volume * 100)}%`}
                </span>
                <button
                  type="button"
                  onClick={onToggleMute}
                  className="text-xs text-slate-300 hover:text-white underline cursor-pointer"
                >
                  {hud.muted ? 'Unmute' : 'Mute'}
                </button>
              </div>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={hud.muted ? 0 : hud.volume}
              onChange={(e) => {
                if (hud.muted) onToggleMute();
                onVolumeChange(parseFloat(e.target.value));
              }}
              className="w-full tactical-range"
            />
          </div>

          {/* Graphics & Touch Settings */}
          <div className="pt-2 border-t border-white/10">
            <div className="text-xs font-semibold text-slate-300 mb-1.5">Graphics Preset</div>
            <div className="grid grid-cols-4 border border-white/15 bg-[#090e15] p-0.5">
              {(['low', 'medium', 'high', 'ultra'] as GraphicsQuality[]).map((q) => (
                <button
                  type="button"
                  key={q}
                  onClick={() => onUpdateGraphics({ quality: q })}
                  className={`py-1.5 text-xs font-semibold cursor-pointer ${
                    hud.graphics.quality === q
                      ? 'bg-[#5da8dc] text-[#081018]'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {GRAPHICS_PRESETS[q].label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs text-slate-300">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={hud.graphics.shadows}
                onChange={(e) => onUpdateGraphics({ shadows: e.target.checked })}
              />
              Dynamic Shadows
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={hud.graphics.postProcessing}
                onChange={(e) => onUpdateGraphics({ postProcessing: e.target.checked })}
              />
              Bloom &amp; Color Grade
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={hud.graphics.radarRotating}
                onChange={(e) => onUpdateGraphics({ radarRotating: e.target.checked })}
              />
              Rotating Radar
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={hud.graphics.showFps}
                onChange={(e) => onUpdateGraphics({ showFps: e.target.checked })}
              />
              FPS Counter
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={hud.graphics.bloodEffects}
                onChange={(e) => onUpdateGraphics({ bloodEffects: e.target.checked })}
              />
              Blood Particles
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={hud.graphics.fullMapPauses}
                onChange={(e) => onUpdateGraphics({ fullMapPauses: e.target.checked })}
              />
              Map Pauses Match
            </label>
          </div>

          <div>
            <div className="text-xs font-semibold text-slate-300 mb-1.5">Touch Controls</div>
            <div className="grid grid-cols-3 border border-white/15 bg-[#090e15] p-0.5">
              {(['auto', 'on', 'off'] as const).map((mode) => (
                <button
                  type="button"
                  key={mode}
                  onClick={() => onUpdateGraphics({ touchControls: mode })}
                  className={`py-1.5 text-xs font-semibold uppercase cursor-pointer ${
                    hud.graphics.touchControls === mode
                      ? 'bg-[#5da8dc] text-[#081018]'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-5 pt-4 border-t border-white/10 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={onMainMenu}
            className="min-h-[42px] px-4 py-2 text-xs font-medium text-slate-300 border border-white/15 hover:bg-white/10 transition-colors cursor-pointer"
          >
            Main Menu
          </button>
          <div className="flex items-center gap-2">
            <PWAInstallButton compact />
            <button
              type="button"
              onClick={onRestart}
              className="min-h-[42px] px-4 py-2 text-xs font-medium text-amber-300 border border-amber-400/35 hover:bg-amber-400/10 transition-colors cursor-pointer"
            >
              Restart Match
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

interface MatchOverProps {
  hud: HudSnapshot;
  onPlayAgain: () => void;
  onMainMenu: () => void;
}

export const MatchOverScreen: React.FC<MatchOverProps> = ({ hud, onPlayAgain, onMainMenu }) => {
  const playerWon = hud.matchWinner === hud.setup.side;
  const accuracy =
    hud.stats.shotsFired > 0
      ? Math.round((hud.stats.shotsHit / hud.stats.shotsFired) * 100)
      : 0;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4 sm:p-6 safe-top safe-bottom"
      style={{ backgroundColor: 'rgba(6, 9, 14, 0.80)' }}
    >
      <div
        className="w-full max-w-xl border border-white/15 p-5 sm:p-7 text-slate-100 max-h-[92dvh] overflow-y-auto"
        style={{ backgroundColor: 'rgba(13, 18, 26, 0.96)' }}
      >
        <div className="text-center pb-5 border-b border-white/10">
          <div
            className={`font-display text-3xl sm:text-4xl font-bold tracking-widest ${
              playerWon ? 'text-[#6cb8eb]' : 'text-[#e59a3c]'
            }`}
          >
            {playerWon ? 'VICTORY' : 'DEFEAT'}
          </div>
          <p className="text-xs text-slate-400 mt-1">
            {hud.setup.name} ({hud.setup.side}) · {LOCATION_THEMES[hud.setup.location].name}
          </p>

          <div className="mt-4 inline-flex items-center gap-5 sm:gap-6 px-5 sm:px-6 py-2.5 border border-white/10 bg-black/30">
            <div className="text-right">
              <div className="text-[10px] sm:text-[11px] font-semibold text-[#6cb8eb]">
                COUNTER-TERRORISTS
              </div>
              <div className="font-mono-num text-2xl sm:text-3xl font-bold text-white">
                {hud.ctScore}
              </div>
            </div>
            <div className="text-slate-500 font-display text-lg">—</div>
            <div className="text-left">
              <div className="text-[10px] sm:text-[11px] font-semibold text-[#e59a3c]">
                TERRORISTS
              </div>
              <div className="font-mono-num text-2xl sm:text-3xl font-bold text-white">
                {hud.tScore}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3 mt-5">
          {[
            ['Kills', String(hud.stats.kills)],
            ['Deaths', String(hud.stats.deaths)],
            ['Headshots', String(hud.stats.headshots)],
            ['Accuracy', `${accuracy}%`],
            ['Plants / Defuses', `${hud.stats.plants} / ${hud.stats.defuses}`],
            ['Scale', `${hud.setup.teamSize}v${hud.setup.teamSize}`],
          ].map(([label, val]) => (
            <div key={label} className="p-3 border border-white/10 bg-white/[0.02]">
              <div className="text-[11px] text-slate-400">{label}</div>
              <div className="font-mono-num text-lg font-bold text-white mt-0.5">{val}</div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            onClick={onMainMenu}
            className="min-h-[44px] px-5 py-2.5 text-xs font-semibold text-slate-300 border border-white/15 hover:bg-white/10 transition-colors cursor-pointer"
          >
            Main Menu
          </button>
          <button
            type="button"
            onClick={onPlayAgain}
            className="min-h-[44px] px-6 py-2.5 bg-[#5da8dc] hover:bg-[#74bce9] text-[#081018] font-display text-sm font-bold tracking-wider transition-colors cursor-pointer"
          >
            PLAY AGAIN
          </button>
        </div>
      </div>
    </div>
  );
};
