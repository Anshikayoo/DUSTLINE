import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import {
  BombState,
  Difficulty,
  FullMapMode,
  GameScreen,
  Gender,
  GRAPHICS_PRESETS,
  GraphicsSettings,
  GrenadeId,
  GrenadeInventory,
  HudSnapshot,
  KillFeedEntry,
  LOCATION_THEMES,
  LocationId,
  MAP_SIZE_CONFIGS,
  MapSize,
  MATCH_CONSTANTS,
  MatchStats,
  MinimapRect,
  PlayerSetupConfig,
  RadioCallout,
  RoundPhase,
  ScoreboardRow,
  TeamSide,
  UNIFORM_STYLES,
  UniformStyleId,
  WEAPON_SPECS,
  WeaponId,
  WeaponSlotState,
} from './types';
import { createMaterialLibrary, MaterialLibrary } from './ProceduralTextures';
import { buildLocationMap, MapData, resolveCalloutName, SiteZone } from './MapBuilder';
import {
  animateCharacterRig,
  buildCharacterRig,
  BuiltCharacterRig,
  createCharacterGeometryPool,
  createUniformMaterialSet,
  UniformMaterialSet,
} from './CharacterModel';
import { WeaponViewmodelRig } from './WeaponSystem';
import { BotManager } from './BotManager';
import { ActiveGrenade, DroppedWeapon, EffectsSystem } from './EffectsSystem';
import { AudioEngine } from './AudioEngine';
import { detectSurfaceBelow, resolveCylinderCollisions } from './CollisionSystem';

/**
 * ============================================================================
 * SECTION: MAIN GAME ENGINE (SIMULATION, POST-FX, BALLISTICS, TOUCH & MAC)
 * ============================================================================
 */

const PLAYER_RADIUS = 0.42;
const STAND_EYE_HEIGHT = 1.66;
const CROUCH_EYE_HEIGHT = 1.08;
const STAND_COLLIDER_HEIGHT = 1.78;
const CROUCH_COLLIDER_HEIGHT = 1.2;
const GRAVITY = 22.0;
const JUMP_SPEED = 7.4;
const BASE_RUN_SPEED = 6.2;
const WALK_SPEED_MULT = 0.54;
const CROUCH_SPEED_MULT = 0.48;

const VignetteColorGradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uVignette: { value: 0.28 },
    uContrast: { value: 1.04 },
    uTime: { value: 0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uVignette;
    uniform float uContrast;
    uniform float uTime;
    varying vec2 vUv;
    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }
    void main() {
      vec4 tex = texture2D(tDiffuse, vUv);
      vec3 col = tex.rgb;
      col = (col - 0.5) * uContrast + 0.5;
      float d = distance(vUv, vec2(0.5));
      col *= smoothstep(0.95, 0.25, d * uVignette * 2.0);
      float grain = (hash(vUv * 512.0 + uTime) - 0.5) * 0.016;
      col = clamp(col + grain, 0.0, 1.0);
      gl_FragColor = vec4(col, tex.a);
    }
  `,
};

// Pre-allocated scratch helpers (zero GC inside game loop)
const _rayOrigin = new THREE.Vector3();
const _rayDir = new THREE.Vector3();
const _camRight = new THREE.Vector3();
const _camUp = new THREE.Vector3();
const _muzzlePos = new THREE.Vector3();
const _ejectPos = new THREE.Vector3();
const _hitNormal = new THREE.Vector3();
const _normalMat = new THREE.Matrix3();
const _toBotVec = new THREE.Vector3();
const _camRightXZ = new THREE.Vector3();
const _fwdVec = new THREE.Vector3();
const _penOrigin = new THREE.Vector3();
const _whizzPoint = new THREE.Vector3();

function detectSoftwareWebGL(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

function detectTouchCapability(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(pointer: coarse)')?.matches ||
    (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0)
  );
}

export class GameEngine {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private colorPass: ShaderPass | null = null;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private mapOrthoCam: THREE.OrthographicCamera;
  private isSoftwareGl: boolean;
  private isTouchDevice: boolean;
  private contextLost = false;
  private materials: MaterialLibrary;
  private map: MapData;
  private weaponRig: WeaponViewmodelRig;
  private botManager: BotManager;
  private effects: EffectsSystem;
  public readonly audio: AudioEngine;

  // Live 3D Setup Preview Character & Free-Fly Map Preview
  private previewRig: BuiltCharacterRig | null = null;
  private previewMats: UniformMaterialSet | null = null;
  private previewGeoPool = createCharacterGeometryPool();
  private previewOrbitAngle = 0.35;
  private setupMapPreview = false;
  private flyPos = new THREE.Vector3(0, 18, 42);
  private flyYaw = 0;
  private flyPitch = -0.35;
  private flyDragging = false;
  private loadingProgress = 1;
  private loadingLabel = '';

  private onHudUpdate: (snapshot: HudSnapshot) => void;
  private rafId = 0;
  private disposed = false;
  private lastTimestamp = 0;
  private hudEmitTimer = 0;

  // FPS monitor
  private fpsSamples = 0;
  private fpsAccum = 0;
  private currentFps = 60;
  private lowFpsDuration = 0;
  private fpsWarning: string | null = null;

  // Player Setup Config
  private setup: PlayerSetupConfig = {
    name: 'Player',
    uniform: 'navy',
    gender: 'male',
    location: 'dust_canyon',
    mapSize: 'standard',
    teamSize: 5,
    side: 'CT',
    difficulty: 'medium',
  };

  // Graphics & Map Controls
  private graphics: GraphicsSettings;
  private fullMapOpen = false;
  private fullMapMode: FullMapMode = '3d';
  private fullMapTilt = true;
  private fullMapZoom = 1.0;
  private fullMapPanX = 0;
  private fullMapPanZ = 0;
  private radarZoom = 1.0;

  // Match & Round State
  private screen: GameScreen = 'menu';
  private pointerLocked = false;
  private buyMenuOpen = false;
  private scoreboardOpen = false;
  private buyHintMessage: string | null = null;
  private buyHintTimer = 0;

  private roundNumber = 1;
  private roundPhase: RoundPhase = 'buy';
  private roundTimer = MATCH_CONSTANTS.ROUND_DURATION;
  private buyTimer = MATCH_CONSTANTS.BUY_PHASE_DURATION;
  private roundEndTimer = 0;
  private ctScore = 0;
  private tScore = 0;
  private lossStreak = 0;
  private matchWinner: TeamSide | null = null;

  // Bomb State
  private bombState: BombState = 'carried';
  private bombSite: 'A' | 'B' | null = null;
  private bombTimer = MATCH_CONSTANTS.BOMB_FUSE_DURATION;
  private plantedBombPos: THREE.Vector3 | null = null;
  private bombBeepAccum = 0;
  private bombLedOn = true;
  private playerHasBomb = false;
  private actionProgress = 0;
  private actionLabel: string | null = null;
  private interactPrompt: string | null = null;

  // Player Physics & Health
  private playerPos = new THREE.Vector3(0, 0, 52);
  private playerVelY = 0;
  private grounded = true;
  private coyoteTimer = 0;
  private currentEyeHeight = STAND_EYE_HEIGHT;
  private landingDip = 0;
  private yaw = 0;
  private pitch = 0;
  private health = 100;
  private armor = 0;
  private hasHelmet = false;
  private hasDefuseKit = false;
  private money = MATCH_CONSTANTS.START_MONEY;
  private playerAlive = true;
  private playerRoundKills = 0;
  private roundMvpHero: { name: string; reason: string } | null = null;
  private spectateBotId: string | null = null;
  private heartbeatTimer = 0;

  // Loadout (Slot 1: Primary, Slot 2: Pistol, Slot 3: Knife)
  private activeSlot: 1 | 2 | 3 = 2;
  private primaryWeapon: WeaponSlotState | null = null;
  private secondaryWeapon: WeaponSlotState | null = {
    id: 'usps',
    ammo: WEAPON_SPECS.usps.magSize,
    reserve: WEAPON_SPECS.usps.maxReserve,
  };
  private grenades: GrenadeInventory = { smoke: 0, flash: 0, he: 0 };

  private fireCooldown = 0;
  private isReloading = false;
  private reloadTimer = 0;
  private scopeLevel: 0 | 1 | 2 = 0;
  private baseFov = 75;
  private currentFov = 75;
  private recoilBloom = 0;
  private sprayShotCount = 0;
  private sprayResetTimer = 0;
  private cameraShake = 0;
  private hitstopTimer = 0;
  private footstepAccum = 0;

  // Visual Overlays & Feeds
  private hitMarkerType: 'none' | 'body' | 'head' | 'kill' = 'none';
  private hitMarkerAlpha = 0;
  private damageIndicatorAngle = 0;
  private damageIndicatorAlpha = 0;
  private damageFlashAlpha = 0;
  private flashBlindAlpha = 0;
  private bannerTitle: string | null = null;
  private bannerSubtitle: string | null = null;
  private bannerAccent: 'ct' | 't' | 'neutral' = 'neutral';
  private bannerTimer = 0;
  private mvpText: string | null = null;
  private killFeed: KillFeedEntry[] = [];
  private radioCallouts: RadioCallout[] = [];
  private nextKillFeedId = 1;
  private nextRadioId = 1;

  // Settings & Stats
  private sensitivity = 1.0;
  private stats: MatchStats = this.emptyStats();

  // Desktop + Mac + Mobile Touch Inputs
  private keys = new Set<string>();
  private mouseDownLeft = false;
  private dragAiming = false;
  private semiAutoReleased = true;
  private wheelAccum = 0;
  private wheelCooldown = 0;
  private virtualMove = { x: 0, y: 0 };
  private virtualFire = false;
  private virtualCrouch = false;
  private virtualInteract = false;
  private raycaster = new THREE.Raycaster();

  constructor(container: HTMLElement, onHudUpdate: (snapshot: HudSnapshot) => void) {
    this.container = container;
    this.onHudUpdate = onHudUpdate;
    this.isSoftwareGl = detectSoftwareWebGL();
    this.isTouchDevice = detectTouchCapability();
    this.audio = new AudioEngine();

    const defaultQuality = this.isSoftwareGl ? 'low' : this.isTouchDevice ? 'medium' : 'high';
    const preset = GRAPHICS_PRESETS[defaultQuality];
    this.graphics = {
      quality: defaultQuality,
      shadows: preset.shadows && !this.isSoftwareGl,
      postProcessing: preset.postProcessing && !this.isSoftwareGl,
      bloodEffects: true,
      showFps: false,
      radarRotating: true,
      fullMapPauses: false,
      touchControls: 'auto',
    };

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, preset.pixelRatioCap)
    );
    this.renderer.shadowMap.enabled = this.graphics.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setSize(
      container.clientWidth || window.innerWidth,
      container.clientHeight || window.innerHeight
    );
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.touchAction = 'none';
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    const aspect =
      (container.clientWidth || window.innerWidth) /
      Math.max(1, container.clientHeight || window.innerHeight);
    this.camera = new THREE.PerspectiveCamera(this.baseFov, aspect, 0.08, 460);
    this.scene.add(this.camera);

    const halfOrtho = 90;
    this.mapOrthoCam = new THREE.OrthographicCamera(
      -halfOrtho * aspect,
      halfOrtho * aspect,
      halfOrtho,
      -halfOrtho,
      1,
      400
    );

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    const theme = LOCATION_THEMES[this.setup.location];
    const groundRepeat = Math.round(MAP_SIZE_CONFIGS[this.setup.mapSize].halfSize * 0.42);
    this.materials = createMaterialLibrary(this.renderer, theme, preset.texRes, groundRepeat);
    this.map = buildLocationMap(
      this.scene,
      theme,
      this.setup.mapSize,
      this.materials,
      this.graphics.shadows,
      preset.shadowMapSize
    );

    this.weaponRig = new WeaponViewmodelRig(this.camera, this.setup.uniform);
    this.weaponRig.root.visible = false;

    this.botManager = new BotManager(this.scene, this.materials.contactShadow, this.isSoftwareGl);
    this.effects = new EffectsSystem(this.scene);
    this.effects.configureWeather(
      theme.weatherType,
      this.isSoftwareGl ? 0 : preset.weatherCount,
      this.map.mapHalfSize
    );
    this.audio.setAmbientLocation(theme.id);

    this.rebuildPreviewCharacter();
    this.rebuildComposer();

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.bindEvents();
    this.emitHud();
    this.lastTimestamp = performance.now();
    this.scheduleNextFrame();
  }

  private emptyStats(): MatchStats {
    return {
      kills: 0,
      deaths: 0,
      headshots: 0,
      shotsFired: 0,
      shotsHit: 0,
      damageDealt: 0,
      roundsPlayed: 0,
      plants: 0,
      defuses: 0,
    };
  }

  private rebuildComposer(): void {
    this.composer?.dispose();
    this.composer = null;
    this.bloomPass = null;
    this.colorPass = null;

    if (!this.graphics.postProcessing || this.isSoftwareGl) return;

    const w = this.container.clientWidth || window.innerWidth;
    const h = Math.max(1, this.container.clientHeight || window.innerHeight);
    const preset = GRAPHICS_PRESETS[this.graphics.quality];

    const composer = new EffectComposer(this.renderer);
    composer.addPass(new RenderPass(this.scene, this.camera));

    if (preset.bloomStrength > 0) {
      const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), preset.bloomStrength, 0.35, 0.9);
      composer.addPass(bloom);
      this.bloomPass = bloom;
    }

    const colorPass = new ShaderPass(VignetteColorGradeShader);
    composer.addPass(colorPass);
    this.colorPass = colorPass;

    if (preset.smaa) {
      composer.addPass(new SMAAPass());
    }

    composer.addPass(new OutputPass());
    this.composer = composer;
  }

  public isTouchModeActive(): boolean {
    if (this.graphics.touchControls === 'on') return true;
    if (this.graphics.touchControls === 'off') return false;
    return this.isTouchDevice;
  }

  public getMinimapGeometry(): { rects: MinimapRect[]; halfSize: number } {
    return { rects: this.map.minimapRects, halfSize: this.map.mapHalfSize };
  }

  // =========================================================================
  // SETUP SCREEN, LIVE 3D CHARACTER & FREE-FLY MAP PREVIEW
  // =========================================================================

  public updateSetup(partial: Partial<PlayerSetupConfig>): void {
    const prevLoc = this.setup.location;
    const prevSize = this.setup.mapSize;
    const prevUniform = this.setup.uniform;
    const prevGender = this.setup.gender;

    this.setup = {
      ...this.setup,
      ...partial,
      name: (partial.name !== undefined ? partial.name : this.setup.name).slice(0, 14),
      teamSize: Math.max(5, Math.min(25, partial.teamSize ?? this.setup.teamSize)),
    };

    if ((partial.location && partial.location !== prevLoc) || (partial.mapSize && partial.mapSize !== prevSize)) {
      this.rebuildMapForSetup(this.setup.location, this.setup.mapSize);
    }

    if (partial.uniform && partial.uniform !== prevUniform) {
      this.weaponRig.setUniformStyle(partial.uniform);
    }

    if (
      (partial.uniform && partial.uniform !== prevUniform) ||
      (partial.gender && partial.gender !== prevGender)
    ) {
      this.rebuildPreviewCharacter();
    }

    this.emitHud();
  }

  public toggleSetupMapPreview(enabled?: boolean): void {
    this.setupMapPreview = enabled !== undefined ? enabled : !this.setupMapPreview;
    if (this.previewRig) {
      this.previewRig.root.visible = this.screen === 'menu' && !this.setupMapPreview;
    }
    if (this.setupMapPreview) {
      const H = this.map.mapHalfSize;
      this.flyPos.set(0, Math.max(14, H * 0.25), H * 0.55);
      this.flyYaw = 0;
      this.flyPitch = -0.32;
    } else {
      this.flyDragging = false;
    }
    this.emitHud();
  }

  public setGraphics(partial: Partial<GraphicsSettings>): void {
    const prevQuality = this.graphics.quality;
    const prevShadows = this.graphics.shadows;
    const prevPost = this.graphics.postProcessing;

    if (partial.quality && partial.quality !== prevQuality) {
      const preset = GRAPHICS_PRESETS[partial.quality];
      this.graphics = {
        ...this.graphics,
        ...partial,
        shadows: partial.shadows ?? (preset.shadows && !this.isSoftwareGl),
        postProcessing: partial.postProcessing ?? (preset.postProcessing && !this.isSoftwareGl),
      };
    } else {
      this.graphics = { ...this.graphics, ...partial };
    }

    const preset = GRAPHICS_PRESETS[this.graphics.quality];
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, preset.pixelRatioCap)
    );
    this.renderer.shadowMap.enabled = this.graphics.shadows && !this.isSoftwareGl;
    this.fpsWarning = null;

    if (this.graphics.quality !== prevQuality || this.graphics.shadows !== prevShadows) {
      this.rebuildMapForSetup(this.setup.location, this.setup.mapSize);
    }
    if (this.graphics.postProcessing !== prevPost || this.graphics.quality !== prevQuality) {
      this.rebuildComposer();
    }
    this.emitHud();
  }

  private rebuildMapForSetup(locId: LocationId, mapSize: MapSize): void {
    this.loadingProgress = 0.25;
    this.loadingLabel = `Generating ${LOCATION_THEMES[locId].name} (${MAP_SIZE_CONFIGS[mapSize].label})...`;
    this.emitHud();

    this.map.dispose();
    this.materials.dispose();
    const theme = LOCATION_THEMES[locId];
    const preset = GRAPHICS_PRESETS[this.graphics.quality];
    const groundRepeat = Math.round(MAP_SIZE_CONFIGS[mapSize].halfSize * 0.42);
    this.materials = createMaterialLibrary(this.renderer, theme, preset.texRes, groundRepeat);
    this.map = buildLocationMap(
      this.scene,
      theme,
      mapSize,
      this.materials,
      this.graphics.shadows && !this.isSoftwareGl,
      preset.shadowMapSize
    );
    this.effects.configureWeather(
      theme.weatherType,
      this.isSoftwareGl ? 0 : preset.weatherCount,
      this.map.mapHalfSize
    );
    this.audio.setAmbientLocation(theme.id);
    this.rebuildPreviewCharacter();

    this.loadingProgress = 1;
    this.loadingLabel = '';
    this.emitHud();
  }

  private rebuildPreviewCharacter(): void {
    if (this.previewRig) {
      this.scene.remove(this.previewRig.root);
      this.previewRig = null;
    }
    this.previewMats?.dispose();
    this.previewMats = createUniformMaterialSet(this.setup.uniform);

    const rig = buildCharacterRig(
      this.previewGeoPool,
      this.previewMats,
      this.setup.gender,
      this.materials.contactShadow,
      this.graphics.shadows && !this.isSoftwareGl
    );
    rig.setWeaponVisual('m4a4');
    // Stage preview character in an open Mid spot facing the camera
    rig.root.position.set(0, 0, Math.min(18, this.map.mapHalfSize * 0.22));
    rig.root.scale.setScalar(1.32);
    this.previewRig = rig;
    this.previewRig.root.visible = this.screen === 'menu' && !this.setupMapPreview;
    this.scene.add(this.previewRig.root);
  }

  // =========================================================================
  // MATCH & ROUND LIFECYCLE
  // =========================================================================

  public startNewMatch(): void {
    this.audio.unlock();
    if (!this.setup.name.trim()) {
      this.setup.name = 'Player';
    }
    this.setupMapPreview = false;
    this.fullMapOpen = false;
    if (this.previewRig) this.previewRig.root.visible = false;

    this.ctScore = 0;
    this.tScore = 0;
    this.roundNumber = 1;
    this.lossStreak = 0;
    this.matchWinner = null;
    this.money = MATCH_CONSTANTS.START_MONEY;
    this.stats = this.emptyStats();
    this.killFeed = [];
    this.radioCallouts = [];
    this.armor = 0;
    this.hasHelmet = false;
    this.hasDefuseKit = false;
    this.grenades = { smoke: 0, flash: 0, he: 0 };
    this.resetLoadoutToDefault();

    this.botManager.initMatchRoster(
      this.setup.teamSize,
      this.setup.side,
      this.setup.uniform,
      this.setup.gender,
      this.graphics.shadows
    );

    this.screen = 'playing';
    this.buyMenuOpen = false;
    this.scoreboardOpen = false;
    this.virtualMove = { x: 0, y: 0 };
    this.virtualFire = false;
    this.virtualCrouch = false;
    this.virtualInteract = false;
    this.startRound(false);
    if (!this.isTouchModeActive()) {
      this.requestPointerLock();
    }
    this.emitHud();
  }

  public resumeGame(): void {
    if (this.screen !== 'paused' && !this.buyMenuOpen && !this.fullMapOpen) return;
    this.audio.unlock();
    this.screen = 'playing';
    this.buyMenuOpen = false;
    this.fullMapOpen = false;
    if (!this.isTouchModeActive()) {
      this.requestPointerLock();
    }
    this.emitHud();
  }

  public togglePause(): void {
    if (this.screen === 'playing') {
      this.screen = 'paused';
      this.buyMenuOpen = false;
      this.fullMapOpen = false;
      this.virtualFire = false;
      this.mouseDownLeft = false;
      this.exitPointerLock();
      this.emitHud();
    } else if (this.screen === 'paused') {
      this.resumeGame();
    }
  }

  public toggleBuyMenu(): void {
    if (this.screen !== 'playing') return;
    if (this.buyMenuOpen) {
      this.closeBuyMenu();
    } else if (this.roundPhase === 'buy') {
      this.buyMenuOpen = true;
      this.fullMapOpen = false;
      this.keys.clear();
      this.mouseDownLeft = false;
      this.virtualFire = false;
      this.exitPointerLock();
      this.emitHud();
    } else {
      this.showBuyHint('Armory only open during the 10s Buy Phase.');
    }
  }

  public setScoreboardOpen(open: boolean): void {
    if (this.screen !== 'playing' || this.buyMenuOpen) return;
    this.scoreboardOpen = open;
    this.emitHud();
  }

  public returnToMenu(): void {
    this.exitPointerLock();
    this.screen = 'menu';
    this.buyMenuOpen = false;
    this.scoreboardOpen = false;
    this.fullMapOpen = false;
    this.setupMapPreview = false;
    this.scopeLevel = 0;
    this.currentFov = this.baseFov;
    this.camera.fov = this.baseFov;
    this.camera.updateProjectionMatrix();
    this.weaponRig.root.visible = false;
    this.effects.clearRoundEffects();
    this.botManager.clearBots();
    if (this.previewRig) this.previewRig.root.visible = true;
    this.keys.clear();
    this.mouseDownLeft = false;
    this.virtualFire = false;
    this.virtualCrouch = false;
    this.virtualInteract = false;
    this.virtualMove = { x: 0, y: 0 };
    this.emitHud();
  }

  public closeBuyMenu(): void {
    if (!this.buyMenuOpen) return;
    this.buyMenuOpen = false;
    if (this.screen === 'playing' && !this.isTouchModeActive()) {
      this.requestPointerLock();
    }
    this.emitHud();
  }

  // =========================================================================
  // MOBILE / TOUCH & ACCESSIBLE CONTROLS API
  // =========================================================================

  public setVirtualMove(x: number, y: number): void {
    this.virtualMove.x = THREE.MathUtils.clamp(x, -1, 1);
    this.virtualMove.y = THREE.MathUtils.clamp(y, -1, 1);
  }

  public addTouchLookDelta(dx: number, dy: number): void {
    if (this.screen !== 'playing' || this.buyMenuOpen || this.fullMapOpen || !this.playerAlive) return;
    this.audio.unlock();
    const scopeSensMult = this.scopeLevel === 2 ? 0.24 : this.scopeLevel === 1 ? 0.45 : 1.0;
    const rate = 0.0034 * this.sensitivity * scopeSensMult;
    this.yaw -= dx * rate;
    this.pitch = THREE.MathUtils.clamp(
      this.pitch - dy * rate,
      -Math.PI / 2 + 0.04,
      Math.PI / 2 - 0.04
    );
    this.weaponRig.addLookSway(dx * 0.85, dy * 0.85);
  }

  public setVirtualFire(down: boolean): void {
    if (down) {
      this.audio.unlock();
      if (!this.playerAlive) {
        this.cycleSpectatorTarget();
        return;
      }
      this.virtualFire = true;
      this.semiAutoReleased = true;
    } else {
      this.virtualFire = false;
      this.semiAutoReleased = true;
    }
  }

  public toggleVirtualCrouch(): void {
    this.virtualCrouch = !this.virtualCrouch;
    this.emitHud();
  }

  public triggerJump(): void {
    if (!this.playerAlive || this.roundPhase === 'buy' || this.buyMenuOpen) return;
    this.audio.unlock();
    if (this.coyoteTimer > 0 || this.grounded) {
      this.playerVelY = JUMP_SPEED;
      this.grounded = false;
      this.coyoteTimer = 0;
    }
  }

  public triggerReload(): void {
    this.audio.unlock();
    this.startReload();
  }

  public triggerScope(): void {
    this.audio.unlock();
    this.toggleSniperScope();
  }

  public setVirtualInteract(down: boolean): void {
    if (down) {
      this.audio.unlock();
      const pickup = this.findNearestPickup();
      if (pickup && !this.actionLabel) {
        this.pickupWeapon(pickup);
      }
    }
    this.virtualInteract = down;
  }

  public cycleWeaponSlot(): void {
    const slots: (1 | 2 | 3)[] = [];
    if (this.primaryWeapon) slots.push(1);
    if (this.secondaryWeapon) slots.push(2);
    slots.push(3);
    const idx = slots.indexOf(this.activeSlot);
    const next = slots[(idx + 1) % slots.length];
    this.switchSlot(next);
  }

  public triggerDropWeapon(): void {
    this.dropCurrentWeapon();
  }

  // =========================================================================
  // FULL TACTICAL MAP & RADAR CONTROLS
  // =========================================================================

  public toggleFullMap(force?: boolean): void {
    if (this.screen !== 'playing' || this.buyMenuOpen) return;
    this.fullMapOpen = force !== undefined ? force : !this.fullMapOpen;
    if (this.fullMapOpen) {
      this.keys.clear();
      this.mouseDownLeft = false;
      this.virtualFire = false;
      this.exitPointerLock();
    } else if (!this.isTouchModeActive()) {
      this.requestPointerLock();
    }
    this.emitHud();
  }

  public setFullMapMode(mode: FullMapMode): void {
    this.fullMapMode = mode;
    this.emitHud();
  }

  public setFullMapTilt(tilt: boolean): void {
    this.fullMapTilt = tilt;
    this.emitHud();
  }

  public zoomFullMap(delta: number): void {
    this.fullMapZoom = THREE.MathUtils.clamp(this.fullMapZoom + delta, 0.55, 3.2);
    this.emitHud();
  }

  public panFullMap(dxWorld: number, dzWorld: number): void {
    const lim = this.map.mapHalfSize * 0.9;
    this.fullMapPanX = THREE.MathUtils.clamp(this.fullMapPanX + dxWorld, -lim, lim);
    this.fullMapPanZ = THREE.MathUtils.clamp(this.fullMapPanZ + dzWorld, -lim, lim);
    this.emitHud();
  }

  public resetFullMapView(): void {
    this.fullMapZoom = 1.0;
    this.fullMapPanX = 0;
    this.fullMapPanZ = 0;
    this.emitHud();
  }

  public zoomRadar(delta: number): void {
    this.radarZoom = THREE.MathUtils.clamp(this.radarZoom + delta, 0.7, 2.2);
    this.emitHud();
  }

  private resetLoadoutToDefault(): void {
    this.primaryWeapon = null;
    this.secondaryWeapon = {
      id: 'usps',
      ammo: WEAPON_SPECS.usps.magSize,
      reserve: WEAPON_SPECS.usps.maxReserve,
    };
    this.activeSlot = 2;
    this.weaponRig.setWeapon('usps', false);
  }

  private getActiveWeaponId(): WeaponId {
    if (this.activeSlot === 1 && this.primaryWeapon) return this.primaryWeapon.id;
    if (this.activeSlot === 2 && this.secondaryWeapon) return this.secondaryWeapon.id;
    return 'knife';
  }

  private getActiveWeaponState(): WeaponSlotState | null {
    if (this.activeSlot === 1) return this.primaryWeapon;
    if (this.activeSlot === 2) return this.secondaryWeapon;
    return null;
  }

  private startRound(survivedPrevious: boolean): void {
    this.roundPhase = 'buy';
    this.buyTimer = MATCH_CONSTANTS.BUY_PHASE_DURATION;
    this.roundTimer = MATCH_CONSTANTS.ROUND_DURATION;
    this.roundEndTimer = 0;
    this.bombState = 'carried';
    this.bombSite = null;
    this.bombTimer = MATCH_CONSTANTS.BOMB_FUSE_DURATION;
    this.plantedBombPos = null;
    this.bombBeepAccum = 0;
    this.actionProgress = 0;
    this.actionLabel = null;
    this.interactPrompt = null;
    this.playerRoundKills = 0;
    this.roundMvpHero = null;
    this.mvpText = null;
    this.spectateBotId = null;

    const spawn = this.setup.side === 'CT' ? this.map.ctSpawns[0] : this.map.tSpawns[0];
    this.playerPos.copy(spawn);
    this.playerVelY = 0;
    this.grounded = true;
    this.landingDip = 0;
    this.currentEyeHeight = STAND_EYE_HEIGHT;
    this.yaw = this.setup.side === 'CT' ? 0 : Math.PI;
    this.pitch = 0;
    this.health = 100;
    this.playerAlive = true;
    this.isReloading = false;
    this.reloadTimer = 0;
    this.scopeLevel = 0;
    this.currentFov = this.baseFov;
    this.camera.fov = this.baseFov;
    this.camera.updateProjectionMatrix();
    this.recoilBloom = 0;
    this.sprayShotCount = 0;
    this.fireCooldown = 0;
    this.damageFlashAlpha = 0;
    this.damageIndicatorAlpha = 0;
    this.flashBlindAlpha = 0;

    if (!survivedPrevious) {
      this.resetLoadoutToDefault();
      this.armor = 0;
      this.hasHelmet = false;
      this.hasDefuseKit = false;
      this.grenades = { smoke: 0, flash: 0, he: 0 };
    } else {
      if (this.primaryWeapon) {
        const s = WEAPON_SPECS[this.primaryWeapon.id];
        this.primaryWeapon.ammo = s.magSize;
        this.primaryWeapon.reserve = s.maxReserve;
      }
      if (this.secondaryWeapon) {
        const s = WEAPON_SPECS[this.secondaryWeapon.id];
        this.secondaryWeapon.ammo = s.magSize;
        this.secondaryWeapon.reserve = s.maxReserve;
      }
      this.weaponRig.setWeapon(this.getActiveWeaponId(), true);
    }

    this.playerHasBomb = this.setup.side === 'T';
    this.weaponRig.root.visible = true;
    this.weaponRig.setScopedHidden(false);
    this.effects.clearRoundEffects();

    this.botManager.setupRound(
      this.roundNumber,
      this.setup.side,
      this.playerHasBomb,
      this.map.ctSpawns,
      this.map.tSpawns,
      this.map.siteA,
      this.map.siteB,
      this.setup.difficulty
    );

    this.audio.playRoundCue('start');
    this.showBanner(
      `ROUND ${this.roundNumber}`,
      '10s Buy Phase · Open Armory [B] · Movement frozen',
      'neutral',
      3.5
    );
    this.pushRadio(
      'HQ',
      this.setup.side,
      this.setup.side === 'CT'
        ? 'Defend Sites A and B. Eliminate hostiles.'
        : 'Plant the C4 at Site A or B.'
    );
    this.emitHud();
  }

  private finishRound(winner: TeamSide, reason: string): void {
    if (this.roundPhase === 'round_end') return;
    this.roundPhase = 'round_end';
    this.roundEndTimer = MATCH_CONSTANTS.ROUND_END_DELAY;
    this.buyMenuOpen = false;
    this.actionProgress = 0;
    this.actionLabel = null;
    this.stats.roundsPlayed++;

    if (winner === 'CT') this.ctScore++;
    else this.tScore++;

    const playerWon = winner === this.setup.side;
    const lossReward = Math.min(
      MATCH_CONSTANTS.MAX_LOSS_REWARD,
      MATCH_CONSTANTS.LOSS_BASE_REWARD + this.lossStreak * MATCH_CONSTANTS.LOSS_STREAK_BONUS
    );

    if (playerWon) {
      this.lossStreak = 0;
      this.money = Math.min(MATCH_CONSTANTS.MAX_MONEY, this.money + MATCH_CONSTANTS.WIN_REWARD);
      this.audio.playRoundCue('win');
    } else {
      this.lossStreak++;
      this.money = Math.min(MATCH_CONSTANTS.MAX_MONEY, this.money + lossReward);
      this.audio.playRoundCue('loss');
    }

    this.botManager.grantRoundEndMoney(
      winner,
      MATCH_CONSTANTS.WIN_REWARD,
      MATCH_CONSTANTS.LOSS_BASE_REWARD
    );

    let mvpName = this.roundMvpHero?.name ?? null;
    let mvpReason = this.roundMvpHero?.reason ?? '';
    if (!mvpName) {
      let bestKills = this.playerRoundKills;
      mvpName = this.playerRoundKills > 0 ? this.setup.name : null;
      mvpReason = `${bestKills} elimination${bestKills === 1 ? '' : 's'}`;
      for (const b of this.botManager.bots) {
        if (b.team === winner && b.roundKills > bestKills) {
          bestKills = b.roundKills;
          mvpName = b.name;
          mvpReason = `${bestKills} elimination${bestKills === 1 ? '' : 's'}`;
        }
      }
    }
    this.mvpText = mvpName ? `MVP: ${mvpName} (${mvpReason})` : null;

    const rewardShown = playerWon ? MATCH_CONSTANTS.WIN_REWARD : lossReward;
    this.showBanner(
      winner === 'CT' ? 'COUNTER-TERRORISTS WIN' : 'TERRORISTS WIN',
      `${reason} · +$${rewardShown.toLocaleString()}`,
      winner === 'CT' ? 'ct' : 't',
      3.6
    );

    if (this.ctScore >= MATCH_CONSTANTS.ROUNDS_TO_WIN || this.tScore >= MATCH_CONSTANTS.ROUNDS_TO_WIN) {
      this.matchWinner = this.ctScore >= MATCH_CONSTANTS.ROUNDS_TO_WIN ? 'CT' : 'T';
    }
    this.emitHud();
  }

  // =========================================================================
  // ARMORY PURCHASES
  // =========================================================================

  public buyItem(
    item:
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
      | 'he'
  ): boolean {
    if (this.screen !== 'playing' || this.roundPhase !== 'buy') {
      this.showBuyHint('Armory only open during the 10s Buy Phase.');
      return false;
    }

    if (item === 'usps') {
      const spec = WEAPON_SPECS.usps;
      if (this.secondaryWeapon?.id === 'usps') {
        this.secondaryWeapon.ammo = spec.magSize;
        this.secondaryWeapon.reserve = spec.maxReserve;
        this.showBuyHint('USP-S magazine topped off.');
        return true;
      }
      if (this.money < spec.price) {
        this.showBuyHint(`Need $${spec.price} for USP-S.`);
        return false;
      }
      this.money -= spec.price;
      this.secondaryWeapon = { id: 'usps', ammo: spec.magSize, reserve: spec.maxReserve };
      this.switchSlot(2);
      this.audio.playBuyItem();
      this.showBuyHint('Purchased USP-S Tactical');
      this.emitHud();
      return true;
    }

    if (item === 'mp9' || item === 'nova' || item === 'm4a4' || item === 'awp') {
      const spec = WEAPON_SPECS[item];
      if (this.primaryWeapon?.id === item) {
        this.switchSlot(1);
        this.showBuyHint(`${spec.shortName} already equipped.`);
        return false;
      }
      if (this.money < spec.price) {
        this.showBuyHint(`Need $${spec.price.toLocaleString()} for ${spec.shortName}.`);
        return false;
      }
      if (this.primaryWeapon) {
        this.effects.spawnDroppedWeapon(
          this.primaryWeapon.id,
          this.primaryWeapon.ammo,
          this.primaryWeapon.reserve,
          this.playerPos,
          this.getFlatForward()
        );
      }
      this.money -= spec.price;
      this.primaryWeapon = { id: item, ammo: spec.magSize, reserve: spec.maxReserve };
      this.switchSlot(1);
      this.audio.playBuyItem();
      this.showBuyHint(`Purchased ${spec.name}`);
      this.emitHud();
      return true;
    }

    if (item === 'armor') {
      if (this.armor >= 100) {
        this.showBuyHint('Kevlar Vest already at 100%.');
        return false;
      }
      if (this.money < MATCH_CONSTANTS.ARMOR_PRICE) {
        this.showBuyHint(`Need $${MATCH_CONSTANTS.ARMOR_PRICE} for Kevlar.`);
        return false;
      }
      this.money -= MATCH_CONSTANTS.ARMOR_PRICE;
      this.armor = 100;
      this.audio.playBuyItem();
      this.showBuyHint('Equipped Kevlar Vest');
      this.emitHud();
      return true;
    }

    if (item === 'helmet') {
      if (this.armor >= 100 && this.hasHelmet) {
        this.showBuyHint('Kevlar + Helmet already equipped.');
        return false;
      }
      const cost = this.armor >= 100 ? 350 : MATCH_CONSTANTS.HELMET_PRICE;
      if (this.money < cost) {
        this.showBuyHint(`Need $${cost} for Kevlar + Helmet.`);
        return false;
      }
      this.money -= cost;
      this.armor = 100;
      this.hasHelmet = true;
      this.audio.playBuyItem();
      this.showBuyHint('Equipped Kevlar + Helmet');
      this.emitHud();
      return true;
    }

    if (item === 'kit') {
      if (this.setup.side !== 'CT') {
        this.showBuyHint('Defuse Kit is Counter-Terrorist gear only.');
        return false;
      }
      if (this.hasDefuseKit) {
        this.showBuyHint('Defuse Kit already equipped.');
        return false;
      }
      if (this.money < MATCH_CONSTANTS.DEFUSE_KIT_PRICE) {
        this.showBuyHint(`Need $${MATCH_CONSTANTS.DEFUSE_KIT_PRICE} for Defuse Kit.`);
        return false;
      }
      this.money -= MATCH_CONSTANTS.DEFUSE_KIT_PRICE;
      this.hasDefuseKit = true;
      this.audio.playBuyItem();
      this.showBuyHint('Equipped Defuse Kit (3s defuse)');
      this.emitHud();
      return true;
    }

    const gPrice = item === 'flash' ? 200 : 300;
    if (this.grenades[item] >= 1) {
      this.showBuyHint(`Already carrying ${item.toUpperCase()} grenade.`);
      return false;
    }
    if (this.money < gPrice) {
      this.showBuyHint(`Need $${gPrice} for ${item.toUpperCase()}.`);
      return false;
    }
    this.money -= gPrice;
    this.grenades[item] = 1;
    this.audio.playBuyItem();
    this.showBuyHint(`Purchased ${item.toUpperCase()} Grenade`);
    this.emitHud();
    return true;
  }

  // =========================================================================
  // WEAPONS, RELOADING & GRENADES
  // =========================================================================

  public switchSlot(slot: 1 | 2 | 3): void {
    if (slot === 1 && !this.primaryWeapon) {
      this.showBuyHint('No Primary weapon equipped.');
      return;
    }
    if (slot === 2 && !this.secondaryWeapon) {
      this.showBuyHint('No Pistol equipped.');
      return;
    }
    if (slot === this.activeSlot) return;

    this.activeSlot = slot;
    this.isReloading = false;
    this.reloadTimer = 0;
    this.scopeLevel = 0;
    this.sprayShotCount = 0;
    this.weaponRig.setScopedHidden(false);
    this.weaponRig.setWeapon(this.getActiveWeaponId(), true);
    this.fireCooldown = 0.22;
    this.audio.playWeaponSwitch();
    this.emitHud();
  }

  private dropCurrentWeapon(): void {
    if (!this.playerAlive || this.roundPhase === 'round_end') return;
    if (this.activeSlot === 3) {
      this.showBuyHint('Cannot drop Combat Knife.');
      return;
    }

    const fwd = this.getFlatForward();
    if (this.activeSlot === 1 && this.primaryWeapon) {
      const w = this.primaryWeapon;
      this.primaryWeapon = null;
      this.effects.spawnDroppedWeapon(w.id, w.ammo, w.reserve, this.playerPos, fwd);
      this.audio.playWeaponSwitch();
      if (this.secondaryWeapon) this.switchSlot(2);
      else this.switchSlot(3);
    } else if (this.activeSlot === 2 && this.secondaryWeapon) {
      const w = this.secondaryWeapon;
      this.secondaryWeapon = null;
      this.effects.spawnDroppedWeapon(w.id, w.ammo, w.reserve, this.playerPos, fwd);
      this.audio.playWeaponSwitch();
      if (this.primaryWeapon) this.switchSlot(1);
      else this.switchSlot(3);
    }
    this.emitHud();
  }

  private findNearestPickup(): DroppedWeapon | null {
    let best: DroppedWeapon | null = null;
    let bestDistSq = 2.6 * 2.6;
    for (const dw of this.effects.droppedWeapons) {
      const dSq =
        (dw.position.x - this.playerPos.x) ** 2 + (dw.position.z - this.playerPos.z) ** 2;
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        best = dw;
      }
    }
    return best;
  }

  private pickupWeapon(dw: DroppedWeapon): void {
    const spec = WEAPON_SPECS[dw.weaponId];
    const fwd = this.getFlatForward();

    if (spec.slot === 1) {
      if (this.primaryWeapon) {
        this.effects.spawnDroppedWeapon(
          this.primaryWeapon.id,
          this.primaryWeapon.ammo,
          this.primaryWeapon.reserve,
          this.playerPos,
          fwd
        );
      }
      this.primaryWeapon = { id: dw.weaponId, ammo: dw.ammo, reserve: dw.reserve };
      this.effects.removeDroppedWeapon(dw.uid);
      this.activeSlot = 1;
    } else if (spec.slot === 2) {
      if (this.secondaryWeapon) {
        this.effects.spawnDroppedWeapon(
          this.secondaryWeapon.id,
          this.secondaryWeapon.ammo,
          this.secondaryWeapon.reserve,
          this.playerPos,
          fwd
        );
      }
      this.secondaryWeapon = { id: dw.weaponId, ammo: dw.ammo, reserve: dw.reserve };
      this.effects.removeDroppedWeapon(dw.uid);
      this.activeSlot = 2;
    }

    this.isReloading = false;
    this.scopeLevel = 0;
    this.sprayShotCount = 0;
    this.weaponRig.setScopedHidden(false);
    this.weaponRig.setWeapon(this.getActiveWeaponId(), true);
    this.audio.playPickup();
    this.showBuyHint(`Picked up ${spec.shortName}`);
    this.emitHud();
  }

  public throwGrenade(id: GrenadeId): void {
    if (!this.playerAlive || this.roundPhase !== 'live' || this.buyMenuOpen || this.fullMapOpen) return;
    if (this.grenades[id] <= 0) {
      this.showBuyHint(`No ${id.toUpperCase()} grenade — buy in Armory [B].`);
      return;
    }
    this.grenades[id]--;
    this.camera.getWorldPosition(_rayOrigin);
    this.camera.getWorldDirection(_rayDir);
    const origin = _rayOrigin.clone().addScaledVector(_rayDir, 0.65);
    const vel = _rayDir.clone().multiplyScalar(18.5);
    vel.y += 3.8;

    this.effects.spawnThrownGrenade(id, origin, vel, true);
    this.weaponRig.triggerThrowAnimation();
    this.audio.playWeaponSwitch();
    this.emitHud();
  }

  private startReload(): void {
    if (!this.playerAlive || this.isReloading) return;
    const wid = this.getActiveWeaponId();
    const spec = WEAPON_SPECS[wid];
    if (spec.isMelee) return;
    const state = this.getActiveWeaponState();
    if (!state || state.ammo >= spec.magSize || state.reserve <= 0) return;

    this.isReloading = true;
    this.reloadTimer = spec.reloadTime;
    this.scopeLevel = 0;
    this.sprayShotCount = 0;
    this.weaponRig.setScopedHidden(false);
    this.audio.playReload(spec.reloadTime);
    this.emitHud();
  }

  private toggleSniperScope(): void {
    if (!this.playerAlive || this.isReloading) return;
    const spec = WEAPON_SPECS[this.getActiveWeaponId()];
    if (!spec.hasScope) return;
    this.scopeLevel = ((this.scopeLevel + 1) % 3) as 0 | 1 | 2;
    this.weaponRig.setScopedHidden(this.scopeLevel > 0);
    this.audio.playScopeToggle(this.scopeLevel > 0);
    this.emitHud();
  }

  // =========================================================================
  // BALLISTICS (DISTANCE FALLOFF, WALL PENETRATION, SPRAY PATTERNS, SHELLS)
  // =========================================================================

  private computeCurrentSpread(isMoving: boolean, isWalking: boolean, isCrouching: boolean): number {
    const wid = this.getActiveWeaponId();
    const spec = WEAPON_SPECS[wid];
    if (spec.isMelee) return 0;

    let spread = spec.baseSpread;
    if (spec.hasScope && this.scopeLevel > 0) spread = 0.0004;

    if (!this.grounded) spread += spec.jumpSpread;
    else if (isMoving) spread += isWalking ? spec.moveSpread * 0.28 : spec.moveSpread;

    if (isCrouching && this.grounded) spread *= spec.crouchSpreadFactor;
    return spread + this.recoilBloom;
  }

  private attemptFire(isMoving: boolean, isWalking: boolean, isCrouching: boolean): void {
    if (!this.playerAlive || this.isReloading || this.fireCooldown > 0) return;
    if (this.roundPhase === 'buy') return;

    const wid = this.getActiveWeaponId();
    const spec = WEAPON_SPECS[wid];
    const state = this.getActiveWeaponState();

    if (!spec.automatic && !this.semiAutoReleased) return;

    if (!spec.isMelee && state && state.ammo <= 0) {
      this.semiAutoReleased = false;
      this.audio.playDryFire();
      if (state.reserve > 0) this.startReload();
      return;
    }

    if (state) state.ammo--;
    this.semiAutoReleased = false;
    this.fireCooldown = spec.fireRate;
    this.stats.shotsFired++;

    const totalSpread = this.computeCurrentSpread(isMoving, isWalking, isCrouching);
    this.camera.getWorldPosition(_rayOrigin);
    this.camera.getWorldDirection(_rayDir);
    _camRight.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
    _camUp.set(0, 1, 0).applyQuaternion(this.camera.quaternion);

    const enemySide: TeamSide = this.setup.side === 'CT' ? 'T' : 'CT';
    const botTargets = this.botManager.getRaycastTargets(enemySide);
    const theme = LOCATION_THEMES[this.setup.location];

    this.weaponRig.getMuzzleWorldPosition(_muzzlePos);
    if (this.scopeLevel > 0) {
      _muzzlePos.copy(_rayOrigin).addScaledVector(_camUp, -0.14);
    }

    if (!spec.isMelee && !this.isSoftwareGl) {
      this.weaponRig.getEjectWorldPosition(_ejectPos);
      this.effects.spawnShellCasing(_ejectPos, _camRight, _camUp);
    }

    let anyHit = false;
    let bestHitType: 'body' | 'head' | 'kill' = 'body';

    const pelletCount = spec.pellets;
    for (let p = 0; p < pelletCount; p++) {
      const pelletDir = _rayDir.clone();
      if (totalSpread > 0) {
        const ang = Math.random() * Math.PI * 2;
        const rad = Math.sqrt(Math.random()) * totalSpread;
        pelletDir
          .addScaledVector(_camRight, Math.cos(ang) * rad)
          .addScaledVector(_camUp, Math.sin(ang) * rad)
          .normalize();
      }

      this.raycaster.set(_rayOrigin, pelletDir);
      this.raycaster.far = spec.range;

      const wallHits = this.raycaster.intersectObjects(this.map.raycastMeshes, false);
      const wallHit = wallHits.length > 0 ? wallHits[0] : null;
      const wallDist = wallHit ? wallHit.distance : spec.range;

      const botHits = this.raycaster.intersectObjects(botTargets, false);
      let botHit = botHits.length > 0 && botHits[0].distance < wallDist ? botHits[0] : null;
      let damageMult = 1.0;

      // Thin cover wall penetration ("wall-bang")
      if (!botHit && wallHit && !spec.isMelee && spec.penetrationPower >= 0.45) {
        const isPenetrable = wallHit.object.userData?.penetrable === true;
        if (isPenetrable && wallDist + 1.4 < spec.range) {
          _penOrigin.copy(wallHit.point).addScaledVector(pelletDir, 1.35);
          this.raycaster.set(_penOrigin, pelletDir);
          this.raycaster.far = spec.range - wallDist - 1.35;
          const penBotHits = this.raycaster.intersectObjects(botTargets, false);
          if (penBotHits.length > 0) {
            botHit = penBotHits[0];
            damageMult = spec.penetrationPower * 0.72;
          }
        }
      }

      if (botHit) {
        const { botId, hitbox } = botHit.object.userData as {
          botId: string;
          hitbox: 'head' | 'body';
        };
        const isHead = hitbox === 'head';
        const hitDist = botHit.distance;
        const falloffFactor = Math.max(0.42, 1 - (hitDist / 10) * spec.falloffPer10m);
        const dmg =
          (isHead ? spec.damage * spec.headshotMultiplier : spec.damage) * falloffFactor * damageMult;

        const res = this.botManager.applyDamage(
          botId,
          dmg,
          isHead,
          this.setup.side,
          this.playerPos,
          this.map.coverSpots,
          this.setup.difficulty,
          this.setup.side,
          (newCarrier) => {
            this.pushRadio('TACTICAL', 'T', `Bomb carrier down — C4 transferred to ${newCarrier}`);
          }
        );

        if (!spec.isMelee) {
          this.effects.spawnTracer(_muzzlePos, botHit.point, false);
        }
        if (this.graphics.bloodEffects) {
          this.effects.spawnBloodImpact(botHit.point, pelletDir.clone().negate(), isHead);
        }

        if (res) {
          anyHit = true;
          this.stats.shotsHit++;
          this.stats.damageDealt += res.damageApplied;
          if (res.killed) {
            bestHitType = 'kill';
            this.stats.kills++;
            this.playerRoundKills++;
            if (res.headshot) this.stats.headshots++;
            const reward = spec.killReward + (res.headshot ? MATCH_CONSTANTS.HEADSHOT_BONUS : 0);
            this.money = Math.min(MATCH_CONSTANTS.MAX_MONEY, this.money + reward);
            this.pushKillFeed(
              this.setup.name,
              this.setup.side,
              res.botName,
              res.botTeam,
              spec.shortName,
              res.headshot
            );
            if (res.droppedWeapon) {
              const ds = WEAPON_SPECS[res.droppedWeapon];
              this.effects.spawnDroppedWeapon(res.droppedWeapon, ds.magSize, ds.maxReserve, res.dropPos);
            }
            if (res.headshot || wid === 'awp') this.hitstopTimer = 0.03;
            this.checkEliminationRoundEnd();
          } else if (res.headshot && bestHitType !== 'kill') {
            bestHitType = 'head';
          }
        }
      } else if (wallHit && !spec.isMelee) {
        this.effects.spawnTracer(_muzzlePos, wallHit.point, false);
        if (p % 2 === 0 && wallHit.face) {
          _normalMat.getNormalMatrix(wallHit.object.matrixWorld);
          _hitNormal.copy(wallHit.face.normal).applyMatrix3(_normalMat).normalize();
          const surf = wallHit.object.userData?.surface || this.map.defaultGroundSurface;
          this.effects.spawnWallImpact(wallHit.point, _hitNormal, surf, Boolean(theme.snowGround));
        }
      } else if (!spec.isMelee && p === 0) {
        this.effects.spawnTracer(
          _muzzlePos,
          _rayOrigin.clone().addScaledVector(pelletDir, spec.range * 0.7),
          false
        );
      }
    }

    if (anyHit) {
      this.hitMarkerType = bestHitType;
      this.hitMarkerAlpha = 1.0;
      this.audio.playHitConfirm(bestHitType === 'head' || bestHitType === 'kill', bestHitType === 'kill');
    }

    // Deterministic spray pattern + mild random jitter
    const patIdx = Math.min(this.sprayShotCount, spec.sprayPattern.length - 1);
    const [pitchBias, yawBias] = spec.sprayPattern[patIdx] || [1, 0];
    this.sprayShotCount++;
    this.sprayResetTimer = 0.38;

    const crouchRecoil = isCrouching ? 0.72 : 1.0;
    this.pitch = THREE.MathUtils.clamp(
      this.pitch + spec.recoilPitch * pitchBias * crouchRecoil,
      -Math.PI / 2 + 0.05,
      Math.PI / 2 - 0.05
    );
    this.yaw += (yawBias * spec.recoilYaw * 1.45 + (Math.random() - 0.5) * spec.recoilYaw) * crouchRecoil;
    this.recoilBloom = Math.min(0.095, this.recoilBloom + spec.recoilSpreadGain);
    this.cameraShake = Math.min(
      0.036,
      this.cameraShake + (wid === 'awp' || wid === 'nova' ? 0.025 : 0.007)
    );

    this.weaponRig.triggerFire(wid);
    this.audio.playGunshot(wid);

    if (wid !== 'usps' && wid !== 'knife') {
      this.botManager.alertSoundAt(this.playerPos, this.setup.side, wid === 'awp' ? 58 : 42);
    }

    if (wid === 'awp' && this.scopeLevel > 0) {
      this.scopeLevel = 0;
      this.weaponRig.setScopedHidden(false);
    }

    if (state && state.ammo === 0 && state.reserve > 0 && wid !== 'awp') {
      this.startReload();
    }
    this.emitHud();
  }

  private applyPlayerDamage(
    rawDamage: number,
    headshot: boolean,
    attackerOrigin: THREE.Vector3,
    attackerName: string,
    attackerTeam: TeamSide,
    weaponLabel: string
  ): void {
    if (!this.playerAlive || this.roundPhase === 'round_end') return;

    let dmg = rawDamage;
    const armored = this.armor > 0 && (!headshot || this.hasHelmet);
    if (armored) {
      const absorbed = Math.min(this.armor, Math.round(dmg * (headshot ? 0.42 : 0.46)));
      this.armor = Math.max(0, this.armor - absorbed);
      dmg = Math.max(2, dmg - absorbed);
    }

    this.health = Math.max(0, Math.round(this.health - dmg));
    this.damageFlashAlpha = Math.min(0.85, this.damageFlashAlpha + 0.45);
    this.cameraShake = Math.min(0.045, this.cameraShake + 0.022);

    const dx = attackerOrigin.x - this.playerPos.x;
    const dz = attackerOrigin.z - this.playerPos.z;
    this.damageIndicatorAngle = Math.atan2(dx, -dz) + this.yaw;
    this.damageIndicatorAlpha = 1.0;

    if (this.health <= 0) {
      this.playerAlive = false;
      this.scopeLevel = 0;
      this.virtualFire = false;
      this.weaponRig.setScopedHidden(false);
      this.weaponRig.root.visible = false;
      this.stats.deaths++;
      this.audio.playPlayerDeath(this.setup.gender);
      this.pushKillFeed(attackerName, attackerTeam, this.setup.name, this.setup.side, weaponLabel, headshot);

      if (this.playerHasBomb) {
        this.playerHasBomb = false;
        const aliveT = this.botManager.getAliveTeamBots('T');
        if (aliveT.length > 0) {
          aliveT[0].hasBomb = true;
          this.pushRadio('TACTICAL', 'T', `Bomb carrier down — C4 transferred to ${aliveT[0].name}`);
        }
      }

      this.cycleSpectatorTarget();
      this.checkEliminationRoundEnd();
    } else {
      this.audio.playPlayerHurt(armored, this.setup.gender);
    }
    this.emitHud();
  }

  public cycleSpectatorTarget(): void {
    const aliveAllies = this.botManager.getAliveTeamBots(this.setup.side);
    if (aliveAllies.length === 0) {
      this.spectateBotId = null;
      return;
    }
    const curIdx = aliveAllies.findIndex((b) => b.id === this.spectateBotId);
    const next = aliveAllies[(curIdx + 1) % aliveAllies.length];
    this.spectateBotId = next.id;
  }

  private checkEliminationRoundEnd(): void {
    if (this.roundPhase === 'round_end') return;
    const ctAlive =
      this.botManager.getAliveCount('CT') + (this.setup.side === 'CT' && this.playerAlive ? 1 : 0);
    const tAlive =
      this.botManager.getAliveCount('T') + (this.setup.side === 'T' && this.playerAlive ? 1 : 0);

    if (ctAlive === 0) {
      this.finishRound('T', 'All Counter-Terrorists eliminated');
    } else if (tAlive === 0 && this.bombState !== 'planted') {
      this.finishRound('CT', 'All Terrorists eliminated');
    }
  }

  // =========================================================================
  // BOMB PLANT / DEFUSE & GRENADES
  // =========================================================================

  private isInsideSite(pos: THREE.Vector3, site: SiteZone): boolean {
    return (
      Math.abs(pos.x - site.center.x) <= site.halfW &&
      Math.abs(pos.z - site.center.z) <= site.halfD
    );
  }

  private completeBombPlant(siteId: 'A' | 'B', pos: THREE.Vector3, planterName: string, isPlayer: boolean): void {
    this.bombState = 'planted';
    this.bombSite = siteId;
    this.bombTimer = MATCH_CONSTANTS.BOMB_FUSE_DURATION;
    this.plantedBombPos = pos.clone();
    this.plantedBombPos.y = siteId === 'A' ? this.map.siteA.yTop : this.map.siteB.yTop;
    this.bombBeepAccum = 0;
    this.bombLedOn = true;
    this.effects.setPlantedC4(this.plantedBombPos, true);

    if (isPlayer) {
      this.playerHasBomb = false;
      this.stats.plants++;
      this.money = Math.min(MATCH_CONSTANTS.MAX_MONEY, this.money + MATCH_CONSTANTS.BOMB_PLANT_REWARD);
    }
    this.roundMvpHero = { name: planterName, reason: 'Planted C4' };

    this.audio.playRoundCue('plant');
    this.showBanner('BOMB PLANTED', `C4 armed at Bomb Site ${siteId} · 40s to detonation`, 't', 3.0);
    this.pushRadio(planterName, 'T', `Bomb planted at Site ${siteId}!`);
    this.emitHud();
  }

  private completeBombDefuse(defuserName: string, isPlayer: boolean): void {
    if (this.bombState !== 'planted' || this.roundPhase === 'round_end') return;
    this.bombState = 'defused';
    this.effects.setPlantedC4(null, false);
    if (isPlayer) {
      this.stats.defuses++;
      this.money = Math.min(MATCH_CONSTANTS.MAX_MONEY, this.money + MATCH_CONSTANTS.BOMB_DEFUSE_REWARD);
    }
    this.roundMvpHero = { name: defuserName, reason: 'Defused C4' };
    this.audio.playRoundCue('defuse');
    this.pushRadio(defuserName, 'CT', `Bomb at Site ${this.bombSite} has been defused!`);
    this.finishRound('CT', 'Bomb defused');
  }

  private handleGrenadeDetonation(g: ActiveGrenade): void {
    const pos = g.mesh.position;
    const distToPlayer = pos.distanceTo(this.playerPos);
    this.audio.playGrenadeExplode(g.id, distToPlayer);

    if (g.id === 'smoke') {
      this.effects.spawnSmokeCloud(pos);
      return;
    }

    if (g.id === 'flash') {
      this.effects.spawnExplosionEffect(pos, false);
      this.botManager.applyFlashAt(pos, 16);
      if (this.playerAlive && distToPlayer < 18) {
        const dirToBlast = pos.clone().sub(this.camera.position).normalize();
        this.camera.getWorldDirection(_rayDir);
        const dot = _rayDir.dot(dirToBlast);
        if (dot > 0.15) {
          const intensity = Math.min(1, (1 - distToPlayer / 18) * 1.18);
          this.flashBlindAlpha = intensity;
          this.audio.playTinnitus(intensity * 0.75);
        }
      }
      return;
    }

    this.effects.spawnExplosionEffect(pos, false);
    const maxRadius = 8.5;
    if (distToPlayer < maxRadius && this.playerAlive) {
      const dmg = Math.round(86 * (1 - distToPlayer / maxRadius));
      if (dmg > 2) {
        this.applyPlayerDamage(dmg, false, pos, 'HE Grenade', this.setup.side === 'CT' ? 'T' : 'CT', 'HE');
      }
    }

    for (const bot of this.botManager.bots) {
      if (!bot.alive) continue;
      const d = pos.distanceTo(bot.position);
      if (d < maxRadius) {
        const dmg = Math.round(92 * (1 - d / maxRadius));
        if (dmg > 2) {
          const res = this.botManager.applyDamage(
            bot.id,
            dmg,
            false,
            g.ownerIsPlayer ? this.setup.side : bot.team === 'CT' ? 'T' : 'CT',
            pos,
            this.map.coverSpots,
            this.setup.difficulty,
            this.setup.side,
            (newCarrier) => this.pushRadio('TACTICAL', 'T', `C4 transferred to ${newCarrier}`)
          );
          if (res?.killed && g.ownerIsPlayer) {
            this.stats.kills++;
            this.playerRoundKills++;
            this.money = Math.min(MATCH_CONSTANTS.MAX_MONEY, this.money + 300);
            this.pushKillFeed(this.setup.name, this.setup.side, res.botName, res.botTeam, 'HE', false);
            this.checkEliminationRoundEnd();
          }
        }
      }
    }
  }

  // =========================================================================
  // MAIN SIMULATION LOOP (SOFTWARE-WEBGL PACED + FULL MAP ORTHO RENDER)
  // =========================================================================

  private scheduleNextFrame(): void {
    if (this.disposed) return;
    if (this.isSoftwareGl) {
      const gl = this.renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (this.disposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          this.rafId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          this.rafId = window.setTimeout(this.tick, 80);
        }
      };
      this.rafId = window.setTimeout(poll, 5);
    } else {
      this.rafId = requestAnimationFrame(this.tick);
    }
  }

  private tick = (): void => {
    if (this.disposed || this.contextLost) return;
    const now = performance.now();
    const rawDt = (now - this.lastTimestamp) / 1000;
    this.lastTimestamp = now;
    const dt = Math.min(Math.max(rawDt, 0.001), 0.05);

    // FPS tracking
    this.fpsSamples++;
    this.fpsAccum += rawDt;
    if (this.fpsAccum >= 0.75) {
      this.currentFps = Math.round(this.fpsSamples / this.fpsAccum);
      this.fpsSamples = 0;
      this.fpsAccum = 0;

      if (
        this.screen === 'playing' &&
        !this.isSoftwareGl &&
        this.currentFps < 28 &&
        this.graphics.quality !== 'low'
      ) {
        this.lowFpsDuration += 0.75;
        if (this.lowFpsDuration >= 3.0) {
          this.fpsWarning = `Low FPS (${this.currentFps}) — consider lowering Graphics Quality in Pause menu.`;
        }
      } else {
        this.lowFpsDuration = 0;
      }
    }

    this.updateSimulation(dt, now);

    // Render either Full Tactical Map (3D Orthographic Camera) or standard 1st-person/menu view
    if (this.screen === 'playing' && this.fullMapOpen && this.fullMapMode === '3d') {
      const aspect =
        (this.container.clientWidth || window.innerWidth) /
        Math.max(1, this.container.clientHeight || window.innerHeight);
      const baseHalf = this.map.mapHalfSize * 1.12;
      const half = baseHalf / this.fullMapZoom;
      this.mapOrthoCam.left = -half * aspect;
      this.mapOrthoCam.right = half * aspect;
      this.mapOrthoCam.top = half;
      this.mapOrthoCam.bottom = -half;
      this.mapOrthoCam.updateProjectionMatrix();

      const tiltOffset = this.fullMapTilt ? 64 : 0.01;
      this.mapOrthoCam.position.set(this.fullMapPanX, 160, this.fullMapPanZ + tiltOffset);
      this.mapOrthoCam.lookAt(this.fullMapPanX, 0, this.fullMapPanZ);

      const prevVis = this.weaponRig.root.visible;
      this.weaponRig.root.visible = false;
      this.renderer.render(this.scene, this.mapOrthoCam);
      this.weaponRig.root.visible = prevVis;
    } else if (this.composer && this.graphics.postProcessing && !this.isSoftwareGl) {
      if (this.colorPass) {
        this.colorPass.uniforms.uTime.value = (now * 0.001) % 100;
      }
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }

    this.scheduleNextFrame();
  };

  private updateSimulation(dt: number, nowMs: number): void {
    const timeSec = nowMs * 0.001;

    // Title Setup Screen: live character turntable OR Free-Fly Map Preview
    if (this.screen === 'menu') {
      if (this.setupMapPreview) {
        const speed = (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ? 34 : 18) * dt;
        const sinY = Math.sin(this.flyYaw);
        const cosY = Math.cos(this.flyYaw);
        let fwd = 0;
        let right = 0;
        let up = 0;
        if (this.keys.has('KeyW')) fwd += 1;
        if (this.keys.has('KeyS')) fwd -= 1;
        if (this.keys.has('KeyD')) right += 1;
        if (this.keys.has('KeyA')) right -= 1;
        if (this.keys.has('Space')) up += 1;
        if (this.keys.has('KeyC') || this.keys.has('ControlLeft')) up -= 1;
        this.flyPos.x += (-sinY * fwd + cosY * right) * speed;
        this.flyPos.z += (-cosY * fwd - sinY * right) * speed;
        this.flyPos.y = THREE.MathUtils.clamp(this.flyPos.y + up * speed, 2.2, 110);
        const lim = this.map.mapHalfSize * 1.1;
        this.flyPos.x = THREE.MathUtils.clamp(this.flyPos.x, -lim, lim);
        this.flyPos.z = THREE.MathUtils.clamp(this.flyPos.z, -lim, lim);

        this.camera.position.copy(this.flyPos);
        this.camera.rotation.order = 'YXZ';
        this.camera.rotation.y = this.flyYaw;
        this.camera.rotation.x = this.flyPitch;
        this.camera.rotation.z = 0;
      } else {
        this.previewOrbitAngle += dt * 0.45;
        if (this.previewRig) {
          this.previewRig.root.rotation.y = this.previewOrbitAngle;
          animateCharacterRig(this.previewRig, {
            dt,
            timeSec,
            stridePhase: 0,
            moveRatio: 0,
            isAiming: false,
            isCrouching: false,
            isReloading: false,
            isPlantOrDefuse: false,
            flinchAlpha: 0,
            headPitch: 0,
            alive: true,
            deathTimer: 0,
            deathFallDir: 1,
          });
          const pz = this.previewRig.root.position.z;
          this.camera.position.set(-1.7, 1.82, pz + 4.9);
          this.camera.lookAt(-1.15, 1.32, pz);
        }
      }
      this.effects.updateWeatherOnly(dt);
      return;
    }

    if (this.screen === 'match_over') {
      this.previewOrbitAngle += dt * 0.14;
      const orbitR = Math.min(48, this.map.mapHalfSize * 0.45);
      this.camera.position.set(
        Math.cos(this.previewOrbitAngle) * orbitR,
        16,
        Math.sin(this.previewOrbitAngle) * orbitR
      );
      this.camera.lookAt(0, 2.2, 0);
      this.effects.updateWeatherOnly(dt);
      return;
    }

    if (this.screen === 'paused') return;
    if (this.fullMapOpen && this.graphics.fullMapPauses) return;

    if (this.hitstopTimer > 0) {
      this.hitstopTimer -= dt;
      return;
    }

    // Expire feed entries
    if (this.killFeed.length > 0 && nowMs - this.killFeed[this.killFeed.length - 1].timestamp > 5500) {
      this.killFeed = this.killFeed.filter((k) => nowMs - k.timestamp <= 5500);
    }
    if (this.radioCallouts.length > 0 && nowMs - this.radioCallouts[this.radioCallouts.length - 1].timestamp > 6000) {
      this.radioCallouts = this.radioCallouts.filter((r) => nowMs - r.timestamp <= 6000);
    }

    if (this.wheelCooldown > 0) this.wheelCooldown = Math.max(0, this.wheelCooldown - dt);

    // Decay HUD effects
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) {
        this.bannerTitle = null;
        this.bannerSubtitle = null;
      }
    }
    if (this.buyHintTimer > 0) {
      this.buyHintTimer -= dt;
      if (this.buyHintTimer <= 0) this.buyHintMessage = null;
    }
    if (this.hitMarkerAlpha > 0) this.hitMarkerAlpha = Math.max(0, this.hitMarkerAlpha - dt * 5.2);
    if (this.damageIndicatorAlpha > 0) this.damageIndicatorAlpha = Math.max(0, this.damageIndicatorAlpha - dt * 1.35);
    if (this.damageFlashAlpha > 0) this.damageFlashAlpha = Math.max(0, this.damageFlashAlpha - dt * 2.4);
    if (this.flashBlindAlpha > 0) this.flashBlindAlpha = Math.max(0, this.flashBlindAlpha - dt * 0.42);
    this.cameraShake = THREE.MathUtils.damp(this.cameraShake, 0, 14, dt);
    this.landingDip = THREE.MathUtils.damp(this.landingDip, 0, 16, dt);

    if (this.sprayResetTimer > 0) {
      this.sprayResetTimer -= dt;
      if (this.sprayResetTimer <= 0) this.sprayShotCount = 0;
    }

    // Low-health heartbeat pulse
    if (this.playerAlive && this.health <= 28) {
      this.heartbeatTimer -= dt;
      if (this.heartbeatTimer <= 0) {
        this.heartbeatTimer = this.health <= 15 ? 0.65 : 0.92;
        this.audio.playHeartbeat();
      }
    }

    // Round phase timers
    if (this.roundPhase === 'buy') {
      this.buyTimer -= dt;
      if (this.buyTimer <= 0) {
        this.buyTimer = 0;
        this.roundPhase = 'live';
        if (this.buyMenuOpen) {
          this.buyMenuOpen = false;
          if (!this.isTouchModeActive()) this.requestPointerLock();
        }
        this.showBanner('LIVE', 'Round active — execute tactical plan', 'neutral', 2.0);
      }
    } else if (this.roundPhase === 'live') {
      if (this.bombState === 'planted') {
        this.bombTimer -= dt;
        const interval = this.bombTimer <= 3 ? 0.16 : this.bombTimer <= 10 ? 0.35 : 0.85;
        this.bombBeepAccum += dt;
        if (this.bombBeepAccum >= interval) {
          this.bombBeepAccum = 0;
          this.bombLedOn = !this.bombLedOn;
          this.effects.setPlantedC4(this.plantedBombPos, this.bombLedOn);
          this.audio.playBombBeep(this.bombTimer <= 10);
        }
        if (this.bombTimer <= 0) {
          this.bombState = 'exploded';
          if (this.plantedBombPos) this.effects.spawnExplosionEffect(this.plantedBombPos, true);
          this.effects.setPlantedC4(null, false);
          this.audio.playBombExplosion();
          this.finishRound('T', 'Bomb detonated');
        }
      } else {
        this.roundTimer -= dt;
        if (this.roundTimer <= 0) {
          this.roundTimer = 0;
          this.finishRound('CT', 'Round time expired');
        }
      }
    } else if (this.roundPhase === 'round_end') {
      this.roundEndTimer -= dt;
      if (this.roundEndTimer <= 0) {
        if (this.matchWinner) {
          this.screen = 'match_over';
          this.exitPointerLock();
          this.weaponRig.root.visible = false;
          this.emitHud();
          return;
        } else {
          this.roundNumber++;
          this.startRound(this.playerAlive);
        }
      }
    }

    // Player Movement (Keyboard WASD + Mobile Virtual Thumbstick)
    const isCrouching =
      this.playerAlive &&
      this.roundPhase !== 'buy' &&
      !this.buyMenuOpen &&
      !this.fullMapOpen &&
      (this.keys.has('ControlLeft') ||
        this.keys.has('ControlRight') ||
        this.keys.has('KeyC') ||
        this.virtualCrouch);
    const isWalking =
      this.playerAlive &&
      this.roundPhase !== 'buy' &&
      !this.buyMenuOpen &&
      !this.fullMapOpen &&
      (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'));

    let moveSpeedRatio = 0;
    let isMoving = false;
    const theme = LOCATION_THEMES[this.setup.location];

    if (this.playerAlive && this.roundPhase !== 'buy' && !this.buyMenuOpen && !this.fullMapOpen) {
      let inputFwd = this.virtualMove.y;
      let inputRight = this.virtualMove.x;
      if (this.keys.has('KeyW')) inputFwd += 1;
      if (this.keys.has('KeyS')) inputFwd -= 1;
      if (this.keys.has('KeyD')) inputRight += 1;
      if (this.keys.has('KeyA')) inputRight -= 1;

      const inputLen = Math.hypot(inputFwd, inputRight);
      if (inputLen > 0.04) {
        if (inputLen > 1) {
          inputFwd /= inputLen;
          inputRight /= inputLen;
        }
        isMoving = true;
      } else {
        inputFwd = 0;
        inputRight = 0;
      }

      const spec = WEAPON_SPECS[this.getActiveWeaponId()];
      let maxSpeed = BASE_RUN_SPEED * spec.moveSpeedFactor;
      if (isCrouching) maxSpeed *= CROUCH_SPEED_MULT;
      else if (isWalking) maxSpeed *= WALK_SPEED_MULT;
      if (this.scopeLevel > 0) maxSpeed *= 0.56;

      const sinY = Math.sin(this.yaw);
      const cosY = Math.cos(this.yaw);
      this.playerPos.x += (-sinY * inputFwd + cosY * inputRight) * maxSpeed * dt;
      this.playerPos.z += (-cosY * inputFwd - sinY * inputRight) * maxSpeed * dt;

      if (this.grounded) this.coyoteTimer = 0.1;
      else this.coyoteTimer = Math.max(0, this.coyoteTimer - dt);

      if (this.keys.has('Space') && this.coyoteTimer > 0) {
        this.playerVelY = JUMP_SPEED;
        this.grounded = false;
        this.coyoteTimer = 0;
      }

      const wasGrounded = this.grounded;
      const preImpactVel = this.playerVelY;
      this.playerVelY -= GRAVITY * dt;
      this.playerPos.y += this.playerVelY * dt;

      const col = resolveCylinderCollisions(
        this.playerPos,
        PLAYER_RADIUS,
        isCrouching ? CROUCH_COLLIDER_HEIGHT : STAND_COLLIDER_HEIGHT,
        this.map.colliders,
        0.58,
        this.map.ramps
      );
      if (col.hitCeiling && this.playerVelY > 0) this.playerVelY = 0;

      if (this.playerPos.y <= col.groundY + 0.02) {
        if (!wasGrounded && preImpactVel < -4.2) {
          this.landingDip = Math.min(0.18, Math.abs(preImpactVel) * 0.015);
          const surface = detectSurfaceBelow(
            this.playerPos,
            this.map.groundMeshes,
            this.raycaster,
            this.map.defaultGroundSurface
          );
          this.audio.playFootstep(surface, true);
          this.effects.spawnFootstepDust(this.playerPos, surface, Boolean(theme.snowGround));
        }
        this.playerPos.y = col.groundY;
        this.playerVelY = 0;
        this.grounded = true;
      } else {
        this.grounded = false;
      }

      const mag = Math.min(1, inputLen);
      moveSpeedRatio = isMoving ? (maxSpeed * mag) / BASE_RUN_SPEED : 0;
      if (this.grounded && isMoving && !isWalking && !isCrouching && mag > 0.35) {
        this.footstepAccum += dt * maxSpeed * mag;
        if (this.footstepAccum >= 2.35) {
          this.footstepAccum = 0;
          const surface = detectSurfaceBelow(
            this.playerPos,
            this.map.groundMeshes,
            this.raycaster,
            this.map.defaultGroundSurface
          );
          this.audio.playFootstep(surface, false);
          this.effects.spawnFootstepDust(this.playerPos, surface, Boolean(theme.snowGround));
        }
      }
    }

    this.updateInteractPromptAndProgress(dt);

    // Camera Positioning & Spatial Listener Sync
    if (this.playerAlive) {
      const targetEye = (isCrouching ? CROUCH_EYE_HEIGHT : STAND_EYE_HEIGHT) - this.landingDip;
      this.currentEyeHeight = THREE.MathUtils.damp(this.currentEyeHeight, targetEye, 15, dt);

      const targetFov = this.scopeLevel === 2 ? 12 : this.scopeLevel === 1 ? 24 : this.baseFov;
      if (Math.abs(this.currentFov - targetFov) > 0.05) {
        this.currentFov = THREE.MathUtils.damp(this.currentFov, targetFov, 18, dt);
        this.camera.fov = this.currentFov;
        this.camera.updateProjectionMatrix();
      }

      const sx = (Math.random() - 0.5) * this.cameraShake;
      const sy = (Math.random() - 0.5) * this.cameraShake;
      this.camera.position.set(
        this.playerPos.x + sx,
        this.playerPos.y + this.currentEyeHeight + sy,
        this.playerPos.z
      );
      this.camera.rotation.order = 'YXZ';
      this.camera.rotation.y = this.yaw;
      this.camera.rotation.x = this.pitch;
      this.camera.rotation.z = 0;

      // Texel-snapped directional sun shadow frustum tracking player
      const sun = this.map.sunLight;
      const texelSnap = 2.0;
      const snapX = Math.round(this.playerPos.x / texelSnap) * texelSnap;
      const snapZ = Math.round(this.playerPos.z / texelSnap) * texelSnap;
      sun.target.position.set(snapX, 0, snapZ);
      sun.position.set(snapX + 38, 66, snapZ + 28);
      sun.target.updateMatrixWorld();

      this.camera.getWorldDirection(_rayDir);
      this.audio.updateListener(
        this.camera.position.x,
        this.camera.position.y,
        this.camera.position.z,
        _rayDir.x,
        _rayDir.y,
        _rayDir.z
      );
    } else {
      const specBot = this.botManager.bots.find((b) => b.id === this.spectateBotId && b.alive);
      if (specBot) {
        const lim = this.map.mapHalfSize - 2;
        const backX = -Math.sin(specBot.yaw) * 3.1;
        const backZ = -Math.cos(specBot.yaw) * 3.1;
        this.camera.position.set(
          THREE.MathUtils.clamp(specBot.position.x + backX, -lim, lim),
          specBot.position.y + 2.35,
          THREE.MathUtils.clamp(specBot.position.z + backZ, -lim, lim)
        );
        this.camera.lookAt(specBot.position.x, specBot.position.y + 1.45, specBot.position.z);
      }
    }

    // Weapon Cooldowns, Reload & Firing (supports Pointer Lock OR Mobile Virtual Fire OR fallback drag-aim)
    const activeSpec = WEAPON_SPECS[this.getActiveWeaponId()];
    if (this.fireCooldown > 0) this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    this.recoilBloom = THREE.MathUtils.damp(this.recoilBloom, 0, activeSpec.recoilRecoveryRate, dt);

    if (this.isReloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        this.isReloading = false;
        const st = this.getActiveWeaponState();
        if (st) {
          const need = activeSpec.magSize - st.ammo;
          const load = Math.min(need, st.reserve);
          st.ammo += load;
          st.reserve -= load;
        }
        this.emitHud();
      }
    }

    const firingActive =
      ((this.mouseDownLeft && this.pointerLocked) || this.virtualFire) &&
      !this.buyMenuOpen &&
      !this.fullMapOpen &&
      this.playerAlive;
    if (firingActive) {
      this.attemptFire(isMoving, isWalking, isCrouching);
    }

    const reloadProgress =
      this.isReloading && activeSpec.reloadTime > 0
        ? 1 - Math.max(0, this.reloadTimer) / activeSpec.reloadTime
        : 0;
    this.weaponRig.update(dt, moveSpeedRatio, this.grounded, isCrouching, this.isReloading, reloadProgress);

    // Update Bots (Teammates + Enemies)
    const sightRangeBonus = MAP_SIZE_CONFIGS[this.setup.mapSize].sightRangeBonus;
    this.botManager.update(
      dt,
      this.roundPhase === 'buy',
      this.setup.side,
      this.playerPos,
      this.playerPos.y + this.currentEyeHeight,
      this.playerAlive,
      this.bombState === 'planted',
      this.plantedBombPos,
      this.bombSite,
      this.map.siteA,
      this.map.siteB,
      this.setup.difficulty,
      this.map.colliders,
      this.map.ramps,
      this.map.raycastMeshes,
      this.map.groundMeshes,
      this.map.defaultGroundSurface,
      this.map.navGrid,
      this.map.patrolWaypoints,
      this.map.coverSpots,
      this.map.calloutZones,
      sightRangeBonus,
      (a, b) => this.effects.isBlockedBySmoke(a, b),
      (ev) => {
        if (ev.distance < 85) {
          _toBotVec.subVectors(ev.origin, this.playerPos).normalize();
          _camRightXZ.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
          const pan = _toBotVec.dot(_camRightXZ);

          // Check wall occlusion between shooter and player
          let occluded = false;
          if (ev.distance > 4) {
            _rayDir.subVectors(this.camera.position, ev.origin).normalize();
            this.raycaster.set(ev.origin, _rayDir);
            this.raycaster.far = ev.distance - 0.5;
            occluded = this.raycaster.intersectObjects(this.map.raycastMeshes, false).length > 0;
          }
          this.audio.playBotGunshot(ev.distance, pan, ev.origin, occluded);

          // Supersonic bullet whizz if tracer passes close by player
          if (!ev.hitPlayer && ev.shooterTeam !== this.setup.side) {
            _rayDir.subVectors(ev.endPoint, ev.origin);
            const segLen = _rayDir.length();
            if (segLen > 1) {
              _rayDir.divideScalar(segLen);
              _toBotVec.subVectors(this.camera.position, ev.origin);
              const proj = THREE.MathUtils.clamp(_toBotVec.dot(_rayDir), 0, segLen);
              _whizzPoint.copy(ev.origin).addScaledVector(_rayDir, proj);
              if (_whizzPoint.distanceTo(this.camera.position) < 2.2) {
                this.audio.playBulletWhizz(pan);
              }
            }
          }
        }
        this.effects.spawnTracer(ev.origin, ev.endPoint, ev.shooterTeam === 'T');

        if (ev.hitPlayer) {
          this.applyPlayerDamage(
            ev.damage,
            ev.headshot,
            ev.origin,
            ev.shooterName,
            ev.shooterTeam,
            WEAPON_SPECS[ev.weapon].shortName
          );
        } else if (ev.hitBotId) {
          const res = this.botManager.applyDamage(
            ev.hitBotId,
            ev.damage,
            ev.headshot,
            ev.shooterTeam,
            ev.origin,
            this.map.coverSpots,
            this.setup.difficulty,
            this.setup.side,
            (newCarrier) =>
              this.pushRadio('TACTICAL', 'T', `Bomb carrier down — C4 transferred to ${newCarrier}`)
          );
          if (res?.killed) {
            const shooter = this.botManager.bots.find((b) => b.id === ev.shooterId);
            if (shooter) {
              shooter.kills++;
              shooter.roundKills++;
              shooter.money = Math.min(16000, shooter.money + 300);
            }
            this.pushKillFeed(
              ev.shooterName,
              ev.shooterTeam,
              res.botName,
              res.botTeam,
              WEAPON_SPECS[ev.weapon].shortName,
              res.headshot
            );
            this.checkEliminationRoundEnd();
          }
        }
      },
      (bombEv) => {
        if (bombEv.type === 'planted' && this.bombState === 'carried') {
          this.completeBombPlant(bombEv.site, bombEv.pos, bombEv.botName, false);
        } else if (bombEv.type === 'defused' && this.bombState === 'planted') {
          this.completeBombDefuse(bombEv.botName, false);
        }
      },
      (sender, team, msg) => {
        this.pushRadio(sender, team, msg);
      },
      (stepEv) => {
        _toBotVec.subVectors(stepEv.position, this.playerPos).normalize();
        _camRightXZ.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
        this.audio.playBotFootstep(stepEv.surface, stepEv.distance, _toBotVec.dot(_camRightXZ));
        this.effects.spawnFootstepDust(stepEv.position, stepEv.surface, Boolean(theme.snowGround));
      }
    );

    this.effects.update(
      dt,
      this.map.colliders,
      () => this.audio.playGrenadeBounce(),
      (g) => this.handleGrenadeDetonation(g),
      (pos) => {
        if (pos.distanceTo(this.playerPos) < 4) {
          this.audio.playShellBounce(0.42);
        }
      }
    );

    this.hudEmitTimer += dt;
    if (this.hudEmitTimer >= 0.033) {
      this.hudEmitTimer = 0;
      this.emitHud();
    }
  }

  private updateInteractPromptAndProgress(dt: number): void {
    this.interactPrompt = null;
    if (!this.playerAlive || this.roundPhase !== 'live' || this.buyMenuOpen || this.fullMapOpen) {
      this.actionProgress = 0;
      this.actionLabel = null;
      return;
    }

    const holdingE = this.keys.has('KeyE') || this.virtualInteract;

    if (this.setup.side === 'T' && this.playerHasBomb && this.bombState === 'carried') {
      const inA = this.isInsideSite(this.playerPos, this.map.siteA);
      const inB = this.isInsideSite(this.playerPos, this.map.siteB);
      if (inA || inB) {
        const siteId: 'A' | 'B' = inA ? 'A' : 'B';
        this.interactPrompt = `Hold E to plant C4 at Site ${siteId}`;
        if (holdingE) {
          this.actionLabel = `PLANTING C4 AT SITE ${siteId}`;
          this.actionProgress += dt / MATCH_CONSTANTS.BOMB_PLANT_DURATION;
          if (this.actionProgress >= 1) {
            this.actionProgress = 0;
            this.actionLabel = null;
            this.completeBombPlant(siteId, this.playerPos.clone(), this.setup.name, true);
          }
          return;
        }
      }
    }

    if (this.setup.side === 'CT' && this.bombState === 'planted' && this.plantedBombPos) {
      const dist = Math.hypot(
        this.playerPos.x - this.plantedBombPos.x,
        this.playerPos.z - this.plantedBombPos.z
      );
      if (dist <= 3.0) {
        const dur = this.hasDefuseKit
          ? MATCH_CONSTANTS.BOMB_DEFUSE_KIT_DURATION
          : MATCH_CONSTANTS.BOMB_DEFUSE_DURATION;
        this.interactPrompt = this.hasDefuseKit
          ? 'Hold E to defuse C4 (Kit: 3s)'
          : 'Hold E to defuse C4 (5s)';
        if (holdingE) {
          this.actionLabel = 'DEFUSING C4';
          this.actionProgress += dt / dur;
          if (this.actionProgress >= 1) {
            this.actionProgress = 0;
            this.actionLabel = null;
            this.completeBombDefuse(this.setup.name, true);
          }
          return;
        }
      }
    }

    this.actionProgress = 0;
    this.actionLabel = null;

    const nearby = this.findNearestPickup();
    if (nearby) {
      this.interactPrompt = `E: Pick up ${WEAPON_SPECS[nearby.weaponId].name}`;
    }
  }

  // =========================================================================
  // HUD SNAPSHOT & HELPERS
  // =========================================================================

  private getFlatForward(): THREE.Vector3 {
    _fwdVec.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).normalize();
    return _fwdVec;
  }

  private showBanner(title: string, subtitle: string, accent: 'ct' | 't' | 'neutral', dur: number): void {
    this.bannerTitle = title;
    this.bannerSubtitle = subtitle;
    this.bannerAccent = accent;
    this.bannerTimer = dur;
  }

  private showBuyHint(msg: string): void {
    this.buyHintMessage = msg;
    this.buyHintTimer = 2.2;
    this.emitHud();
  }

  private pushKillFeed(
    killer: string,
    killerTeam: TeamSide,
    victim: string,
    victimTeam: TeamSide,
    weapon: string,
    headshot: boolean
  ): void {
    this.killFeed.unshift({
      id: this.nextKillFeedId++,
      killer,
      killerTeam,
      victim,
      victimTeam,
      weapon,
      headshot,
      timestamp: performance.now(),
    });
    if (this.killFeed.length > 6) this.killFeed.pop();
  }

  private pushRadio(sender: string, team: TeamSide, message: string): void {
    this.radioCallouts.unshift({
      id: this.nextRadioId++,
      sender,
      team,
      message,
      timestamp: performance.now(),
    });
    if (this.radioCallouts.length > 4) this.radioCallouts.pop();
  }

  private emitHud(): void {
    const isCrouching =
      this.keys.has('ControlLeft') ||
      this.keys.has('ControlRight') ||
      this.keys.has('KeyC') ||
      this.virtualCrouch;
    const isWalking = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    const isMoving =
      this.keys.has('KeyW') ||
      this.keys.has('KeyA') ||
      this.keys.has('KeyS') ||
      this.keys.has('KeyD') ||
      Math.hypot(this.virtualMove.x, this.virtualMove.y) > 0.08;
    const spreadRad = this.computeCurrentSpread(isMoving, isWalking, isCrouching);
    const crosshairSpread = Math.round(THREE.MathUtils.clamp(4 + spreadRad * 460, 4, 42));

    const ctAlive =
      this.botManager.getAliveCount('CT') + (this.setup.side === 'CT' && this.playerAlive ? 1 : 0);
    const tAlive =
      this.botManager.getAliveCount('T') + (this.setup.side === 'T' && this.playerAlive ? 1 : 0);

    const specBot = !this.playerAlive
      ? this.botManager.bots.find((b) => b.id === this.spectateBotId && b.alive)
      : null;

    const rows: ScoreboardRow[] = [
      {
        id: 'player',
        name: this.setup.name || 'Player',
        team: this.setup.side,
        gender: this.setup.gender,
        isPlayer: true,
        alive: this.playerAlive,
        kills: this.stats.kills,
        deaths: this.stats.deaths,
        money: this.money,
        hasBomb: this.playerHasBomb,
      },
      ...this.botManager.getScoreboardRows(),
    ];

    const lowHealthAlpha =
      this.playerAlive && this.health <= 32 ? THREE.MathUtils.clamp((32 - this.health) / 32, 0, 1) : 0;

    this.onHudUpdate({
      screen: this.screen,
      pointerLocked: this.pointerLocked,
      setup: { ...this.setup },
      setupMapPreview: this.setupMapPreview,
      loadingProgress: this.loadingProgress,
      loadingLabel: this.loadingLabel,
      roundNumber: this.roundNumber,
      roundPhase: this.roundPhase,
      roundTimer: Math.max(0, this.roundTimer),
      buyTimer: Math.max(0, this.buyTimer),
      ctScore: this.ctScore,
      tScore: this.tScore,
      ctAlive,
      tAlive,
      health: this.health,
      armor: this.armor,
      hasHelmet: this.hasHelmet,
      hasDefuseKit: this.hasDefuseKit,
      hasBomb: this.playerHasBomb,
      money: this.money,
      activeSlot: this.activeSlot,
      primaryWeapon: this.primaryWeapon ? { ...this.primaryWeapon } : null,
      secondaryWeapon: this.secondaryWeapon ? { ...this.secondaryWeapon } : null,
      grenades: { ...this.grenades },
      isReloading: this.isReloading,
      reloadProgress:
        this.isReloading && WEAPON_SPECS[this.getActiveWeaponId()].reloadTime > 0
          ? 1 - Math.max(0, this.reloadTimer) / WEAPON_SPECS[this.getActiveWeaponId()].reloadTime
          : 0,
      scopeLevel: this.scopeLevel,
      crosshairSpread,
      isCrouching,
      isWalking,
      playerAlive: this.playerAlive,
      spectatingName: specBot ? specBot.name : null,
      buyMenuOpen: this.buyMenuOpen,
      scoreboardOpen: this.scoreboardOpen,
      fullMapOpen: this.fullMapOpen,
      fullMapMode: this.fullMapMode,
      fullMapTilt: this.fullMapTilt,
      fullMapZoom: this.fullMapZoom,
      fullMapPanX: this.fullMapPanX,
      fullMapPanZ: this.fullMapPanZ,
      radarZoom: this.radarZoom,
      currentCallout: resolveCalloutName(this.playerPos.x, this.playerPos.z, this.map.calloutZones),
      calloutLabels: this.map.calloutZones,
      droppedWeaponBlips: this.effects.droppedWeapons.map((dw) => ({
        uid: dw.uid,
        weaponName: WEAPON_SPECS[dw.weaponId].shortName,
        x: dw.position.x,
        z: dw.position.z,
      })),
      buyHintMessage: this.buyHintMessage,
      interactPrompt: this.interactPrompt,
      actionProgress: this.actionLabel ? Math.min(1, this.actionProgress) : null,
      actionLabel: this.actionLabel,
      bombState: this.bombState,
      bombSite: this.bombSite,
      bombTimer: Math.max(0, this.bombTimer),
      bombPosX: this.plantedBombPos?.x ?? 0,
      bombPosZ: this.plantedBombPos?.z ?? 0,
      hitMarkerType: this.hitMarkerType,
      hitMarkerAlpha: this.hitMarkerAlpha,
      damageIndicatorAngle: this.damageIndicatorAngle,
      damageIndicatorAlpha: this.damageIndicatorAlpha,
      damageFlashAlpha: this.damageFlashAlpha,
      flashBlindAlpha: this.flashBlindAlpha,
      lowHealthAlpha,
      bannerTitle: this.bannerTitle,
      bannerSubtitle: this.bannerSubtitle,
      bannerAccent: this.bannerAccent,
      mvpText: this.mvpText,
      killFeed: [...this.killFeed],
      radioCallouts: [...this.radioCallouts],
      scoreboardRows: rows,
      playerX: this.playerPos.x,
      playerZ: this.playerPos.z,
      playerYaw: this.yaw,
      minimapBlips: this.botManager.getMinimapBlips(this.setup.side),
      matchWinner: this.matchWinner,
      stats: { ...this.stats },
      muted: this.audio.isMuted(),
      volume: this.audio.getVolume(),
      sensitivity: this.sensitivity,
      fov: this.baseFov,
      graphics: { ...this.graphics },
      fps: this.currentFps,
      fpsWarning: this.fpsWarning,
      isSoftwareGl: this.isSoftwareGl,
      isTouchDevice: this.isTouchDevice,
    });
  }

  // =========================================================================
  // SETTINGS & POINTER LOCK
  // =========================================================================

  public setMuted(muted: boolean): void {
    this.audio.setMuted(muted);
    this.emitHud();
  }

  public setVolume(vol: number): void {
    this.audio.setVolume(vol);
    this.emitHud();
  }

  public setSensitivity(sens: number): void {
    this.sensitivity = Math.max(0.25, Math.min(2.5, sens));
    this.emitHud();
  }

  public setFov(fov: number): void {
    this.baseFov = Math.max(60, Math.min(105, fov));
    if (this.scopeLevel === 0) {
      this.currentFov = this.baseFov;
      this.camera.fov = this.baseFov;
      this.camera.updateProjectionMatrix();
    }
    this.emitHud();
  }

  public requestPointerLock(): void {
    try {
      const el = this.renderer.domElement;
      if (document.pointerLockElement !== el && el.requestPointerLock) {
        const res = el.requestPointerLock() as unknown as Promise<void> | undefined;
        if (res && typeof res.catch === 'function') res.catch(() => {});
      }
    } catch {
      // ignore on touch/unsupported browsers
    }
  }

  private exitPointerLock(): void {
    if (document.pointerLockElement && document.exitPointerLock) {
      document.exitPointerLock();
    }
  }

  // =========================================================================
  // DOM EVENT BINDINGS (DESKTOP, MAC TRACKPAD/CMD GUARDS & WEBGL CONTEXT)
  // =========================================================================

  private bindEvents(): void {
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
    window.addEventListener('mousemove', this.handleMouseMove);
    window.addEventListener('mousedown', this.handleMouseDown);
    window.addEventListener('mouseup', this.handleMouseUp);
    window.addEventListener('wheel', this.handleWheel, { passive: true });
    window.addEventListener('contextmenu', this.handleContextMenu);
    document.addEventListener('pointerlockchange', this.handlePointerLockChange);
    this.renderer.domElement.addEventListener('webglcontextlost', this.handleContextLost);
    this.renderer.domElement.addEventListener('webglcontextrestored', this.handleContextRestored);
  }

  private handleContextLost = (e: Event): void => {
    e.preventDefault();
    this.contextLost = true;
  };

  private handleContextRestored = (): void => {
    this.contextLost = false;
    this.rebuildComposer();
    this.lastTimestamp = performance.now();
  };

  private handleResize = (): void => {
    const w = this.container.clientWidth || window.innerWidth;
    const h = Math.max(1, this.container.clientHeight || window.innerHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    if (this.composer) {
      this.composer.setSize(w, h);
    }
  };

  private handlePointerLockChange = (): void => {
    const locked = document.pointerLockElement === this.renderer.domElement;
    this.pointerLocked = locked;
    if (!locked) {
      this.mouseDownLeft = false;
      this.keys.clear();
      this.scoreboardOpen = false;
      if (this.screen === 'playing' && !this.buyMenuOpen && !this.fullMapOpen && !this.isTouchModeActive()) {
        this.screen = 'paused';
      }
    }
    this.emitHud();
  };

  private handleBlur = (): void => {
    this.keys.clear();
    this.mouseDownLeft = false;
    this.dragAiming = false;
    this.flyDragging = false;
    this.scoreboardOpen = false;
  };

  private handleContextMenu = (e: MouseEvent): void => {
    if (this.screen === 'playing') e.preventDefault();
  };

  private handleKeyDown = (e: KeyboardEvent): void => {
    // Mac Cmd (metaKey) guard: allow Cmd+R / Cmd+W / Cmd+Tab without triggering game actions
    if (e.metaKey) return;

    if (this.screen === 'menu') {
      if (this.setupMapPreview) {
        this.keys.add(e.code);
        if (e.code === 'Escape') this.toggleSetupMapPreview(false);
      }
      return;
    }

    if (this.screen === 'match_over') return;

    if (e.code === 'Tab' && this.screen === 'playing') {
      e.preventDefault();
      if (!this.scoreboardOpen) {
        this.scoreboardOpen = true;
        this.emitHud();
      }
      return;
    }

    if (
      [
        'Space',
        'KeyB',
        'KeyM',
        'KeyR',
        'KeyG',
        'KeyV',
        'Digit1',
        'Digit2',
        'Digit3',
        'Digit4',
        'Digit5',
        'Digit6',
      ].includes(e.code) &&
      this.screen === 'playing'
    ) {
      e.preventDefault();
    }

    if (e.repeat) return;

    if (e.code === 'KeyM' && this.screen === 'playing' && !this.buyMenuOpen) {
      this.toggleFullMap();
      return;
    }

    if (this.fullMapOpen && e.code === 'Escape') {
      this.toggleFullMap(false);
      return;
    }

    if (e.code === 'KeyB' && this.screen === 'playing') {
      this.toggleBuyMenu();
      return;
    }

    if (this.buyMenuOpen && this.screen === 'playing') {
      if (e.code === 'Escape') this.closeBuyMenu();
      return;
    }

    if (e.code === 'KeyP' || (e.code === 'Escape' && !this.pointerLocked)) {
      this.togglePause();
      return;
    }

    if (this.screen !== 'playing' || this.fullMapOpen) return;
    this.keys.add(e.code);

    if (!this.playerAlive) {
      if (e.code === 'Space') this.cycleSpectatorTarget();
      return;
    }

    if (e.code === 'Digit1') this.switchSlot(1);
    else if (e.code === 'Digit2') this.switchSlot(2);
    else if (e.code === 'Digit3') this.switchSlot(3);
    else if (e.code === 'Digit4') this.throwGrenade('smoke');
    else if (e.code === 'Digit5') this.throwGrenade('flash');
    else if (e.code === 'Digit6') this.throwGrenade('he');
    else if (e.code === 'KeyR') this.startReload();
    else if (e.code === 'KeyG') this.dropCurrentWeapon();
    else if (e.code === 'KeyV') this.toggleSniperScope(); // Mac trackpad-friendly scope toggle
    else if (e.code === 'Equal' || e.code === 'NumpadAdd') this.zoomRadar(0.2);
    else if (e.code === 'Minus' || e.code === 'NumpadSubtract') this.zoomRadar(-0.2);
    else if (e.code === 'KeyE') {
      const pickup = this.findNearestPickup();
      if (pickup && !this.actionLabel) {
        this.pickupWeapon(pickup);
      }
    }
  };

  private handleKeyUp = (e: KeyboardEvent): void => {
    if (e.code === 'Tab') {
      this.scoreboardOpen = false;
      this.emitHud();
    }
    this.keys.delete(e.code);
  };

  private handleMouseMove = (e: MouseEvent): void => {
    if (this.screen === 'menu' && this.setupMapPreview && this.flyDragging) {
      this.flyYaw -= e.movementX * 0.003;
      this.flyPitch = THREE.MathUtils.clamp(
        this.flyPitch - e.movementY * 0.003,
        -Math.PI / 2 + 0.05,
        Math.PI / 2 - 0.05
      );
      return;
    }

    if (this.screen !== 'playing' || this.buyMenuOpen || this.fullMapOpen || !this.playerAlive) {
      return;
    }

    if (this.pointerLocked || this.dragAiming) {
      const scopeSensMult = this.scopeLevel === 2 ? 0.22 : this.scopeLevel === 1 ? 0.42 : 1.0;
      const baseRate = 0.0021 * this.sensitivity * scopeSensMult;
      this.yaw -= e.movementX * baseRate;
      this.pitch = THREE.MathUtils.clamp(
        this.pitch - e.movementY * baseRate,
        -Math.PI / 2 + 0.04,
        Math.PI / 2 - 0.04
      );
      this.weaponRig.addLookSway(e.movementX, e.movementY);
    }
  };

  private handleMouseDown = (e: MouseEvent): void => {
    if (this.screen === 'menu' && this.setupMapPreview && e.target === this.renderer.domElement) {
      this.flyDragging = true;
      return;
    }

    if (this.screen !== 'playing' || this.buyMenuOpen || this.fullMapOpen) return;

    if (!this.pointerLocked && !this.isTouchModeActive()) {
      if (e.target === this.renderer.domElement) {
        this.audio.unlock();
        this.requestPointerLock();
        if (e.button === 0) this.dragAiming = true;
      }
      return;
    }

    if (!this.playerAlive) {
      if (e.button === 0) this.cycleSpectatorTarget();
      return;
    }

    if (e.button === 0) {
      this.mouseDownLeft = true;
      this.semiAutoReleased = true;
    } else if (e.button === 2) {
      this.toggleSniperScope();
    }
  };

  private handleMouseUp = (e: MouseEvent): void => {
    this.flyDragging = false;
    this.dragAiming = false;
    if (e.button === 0) {
      this.mouseDownLeft = false;
      this.semiAutoReleased = true;
    }
  };

  private handleWheel = (e: WheelEvent): void => {
    if (this.screen !== 'playing' || this.buyMenuOpen || !this.playerAlive) return;
    if (this.fullMapOpen) return;
    if (!this.pointerLocked) return;

    // Mac trackpad smoothing: accumulate fine deltaY events before switching slot
    if (this.wheelCooldown > 0) return;
    this.wheelAccum += e.deltaY;
    if (Math.abs(this.wheelAccum) < 42) return;

    const dir = this.wheelAccum > 0 ? 1 : -1;
    this.wheelAccum = 0;
    this.wheelCooldown = 0.12;

    const slots: (1 | 2 | 3)[] = [];
    if (this.primaryWeapon) slots.push(1);
    if (this.secondaryWeapon) slots.push(2);
    slots.push(3);
    const idx = slots.indexOf(this.activeSlot);
    const next = slots[(idx + dir + slots.length) % slots.length];
    this.switchSlot(next);
  };

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.rafId);
    clearTimeout(this.rafId);

    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleBlur);
    window.removeEventListener('mousemove', this.handleMouseMove);
    window.removeEventListener('mousedown', this.handleMouseDown);
    window.removeEventListener('mouseup', this.handleMouseUp);
    window.removeEventListener('wheel', this.handleWheel);
    window.removeEventListener('contextmenu', this.handleContextMenu);
    document.removeEventListener('pointerlockchange', this.handlePointerLockChange);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.handleContextLost);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.handleContextRestored);

    this.exitPointerLock();
    if (this.previewRig) this.scene.remove(this.previewRig.root);
    this.previewMats?.dispose();
    this.previewGeoPool.dispose();
    this.botManager.dispose();
    this.weaponRig.dispose();
    this.effects.dispose();
    this.map.dispose();
    this.materials.dispose();
    this.audio.dispose();

    this.composer?.dispose();
    if (this.scene.environment) this.scene.environment.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
