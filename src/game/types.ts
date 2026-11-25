/**
 * ============================================================================
 * SECTION: CONFIG, WEAPONS, LOCATIONS, UNIFORM STYLES, GRAPHICS & SHARED TYPES
 * ============================================================================
 */

export type WeaponId = 'knife' | 'usps' | 'mp9' | 'nova' | 'm4a4' | 'awp';
export type GrenadeId = 'smoke' | 'flash' | 'he';
export type TeamSide = 'CT' | 'T';
export type Gender = 'male' | 'female';
export type Difficulty = 'easy' | 'medium' | 'hard';
export type GameScreen = 'menu' | 'playing' | 'paused' | 'match_over';
export type RoundPhase = 'buy' | 'live' | 'round_end';
export type SurfaceType = 'gravel' | 'metal' | 'concrete';
export type MapSize = 'compact' | 'standard' | 'large';
export type GraphicsQuality = 'low' | 'medium' | 'high' | 'ultra';
export type FullMapMode = '3d' | '2d';
export type WeatherType = 'none' | 'dust' | 'snow' | 'ash' | 'rain' | 'spores';

export interface MapSizeConfig {
  id: MapSize;
  label: string;
  halfSize: number; // playable arena is [-halfSize, +halfSize]
  dimensionsLabel: string;
  sightRangeBonus: number;
  description: string;
}

export const MAP_SIZE_CONFIGS: Record<MapSize, MapSizeConfig> = {
  compact: {
    id: 'compact',
    label: 'Compact',
    halfSize: 52,
    dimensionsLabel: '104m × 104m',
    sightRangeBonus: 0,
    description: 'Fast-paced close-quarters arena ideal for 5v5 skirmishes',
  },
  standard: {
    id: 'standard',
    label: 'Standard',
    halfSize: 88,
    dimensionsLabel: '176m × 176m',
    sightRangeBonus: 18,
    description: 'Competitive CS2-scale compound with 3 lanes per site & catwalks',
  },
  large: {
    id: 'large',
    label: 'Large',
    halfSize: 138,
    dimensionsLabel: '276m × 276m',
    sightRangeBonus: 36,
    description: 'Massive battlefield with 130m+ A Long sniper corridor & 25v25 scale',
  },
};

export interface GraphicsSettings {
  quality: GraphicsQuality;
  shadows: boolean;
  postProcessing: boolean;
  bloodEffects: boolean;
  showFps: boolean;
  radarRotating: boolean;
  fullMapPauses: boolean;
  touchControls: 'auto' | 'on' | 'off';
}

export const GRAPHICS_PRESETS: Record<
  GraphicsQuality,
  {
    label: string;
    texRes: number;
    shadowMapSize: number;
    shadows: boolean;
    postProcessing: boolean;
    bloomStrength: number;
    pixelRatioCap: number;
    smaa: boolean;
    weatherCount: number;
  }
> = {
  low: {
    label: 'Low',
    texRes: 256,
    shadowMapSize: 1024,
    shadows: false,
    postProcessing: false,
    bloomStrength: 0,
    pixelRatioCap: 1.0,
    smaa: false,
    weatherCount: 0,
  },
  medium: {
    label: 'Medium',
    texRes: 512,
    shadowMapSize: 1024,
    shadows: true,
    postProcessing: false,
    bloomStrength: 0,
    pixelRatioCap: 1.35,
    smaa: false,
    weatherCount: 160,
  },
  high: {
    label: 'High',
    texRes: 512,
    shadowMapSize: 2048,
    shadows: true,
    postProcessing: true,
    bloomStrength: 0.34,
    pixelRatioCap: 1.75,
    smaa: false,
    weatherCount: 280,
  },
  ultra: {
    label: 'Ultra',
    texRes: 512,
    shadowMapSize: 2048,
    shadows: true,
    postProcessing: true,
    bloomStrength: 0.42,
    pixelRatioCap: 2.0,
    smaa: true,
    weatherCount: 400,
  },
};

export type UniformStyleId =
  | 'navy'
  | 'desert'
  | 'woodland'
  | 'arctic'
  | 'crimson'
  | 'stealth';

export interface UniformStyle {
  id: UniformStyleId;
  label: string;
  primaryHex: number;
  secondaryHex: number;
  helmetHex: number;
  vestHex: number;
  camoColors: [string, string, string];
  swatchCss: string;
  contrastEnemyId: UniformStyleId;
}

export const UNIFORM_STYLES: Record<UniformStyleId, UniformStyle> = {
  navy: {
    id: 'navy',
    label: 'Navy Tactical',
    primaryHex: 0x25466d,
    secondaryHex: 0x1b2f4a,
    helmetHex: 0x1c2b3d,
    vestHex: 0x1e242d,
    camoColors: ['#223e61', '#182b45', '#2e517d'],
    swatchCss: '#25466d',
    contrastEnemyId: 'crimson',
  },
  desert: {
    id: 'desert',
    label: 'Desert Tan',
    primaryHex: 0xb69568,
    secondaryHex: 0x856a46,
    helmetHex: 0x9b7e54,
    vestHex: 0x4b4232,
    camoColors: ['#bfa073', '#96784e', '#d1b78e'],
    swatchCss: '#b69568',
    contrastEnemyId: 'navy',
  },
  woodland: {
    id: 'woodland',
    label: 'Woodland Camo',
    primaryHex: 0x3b5d38,
    secondaryHex: 0x283e26,
    helmetHex: 0x314a2f,
    vestHex: 0x2b3026,
    camoColors: ['#3f613b', '#273b24', '#5c4b34'],
    swatchCss: '#3b5d38',
    contrastEnemyId: 'crimson',
  },
  arctic: {
    id: 'arctic',
    label: 'Arctic White',
    primaryHex: 0xdbe3ec,
    secondaryHex: 0x97a6b8,
    helmetHex: 0xe6edf5,
    vestHex: 0x465260,
    camoColors: ['#dbe3ec', '#b7c5d4', '#8697a8'],
    swatchCss: '#dbe3ec',
    contrastEnemyId: 'stealth',
  },
  crimson: {
    id: 'crimson',
    label: 'Crimson Spec',
    primaryHex: 0x9b2c2c,
    secondaryHex: 0x5c1b1b,
    helmetHex: 0x6b2121,
    vestHex: 0x251d1d,
    camoColors: ['#8c2828', '#521717', '#3a2323'],
    swatchCss: '#9b2c2c',
    contrastEnemyId: 'navy',
  },
  stealth: {
    id: 'stealth',
    label: 'Stealth Black',
    primaryHex: 0x23272e,
    secondaryHex: 0x14171c,
    helmetHex: 0x1a1d24,
    vestHex: 0x101216,
    camoColors: ['#252930', '#16191f', '#323741'],
    swatchCss: '#23272e',
    contrastEnemyId: 'desert',
  },
};

export type LocationId =
  | 'dust_canyon'
  | 'arctic_base'
  | 'jungle_ruins'
  | 'night_city'
  | 'harbor_docks'
  | 'volcano_outpost'
  | 'snow_village'
  | 'mars_colony'
  | 'neon_alley'
  | 'cairo_bazaar';

export interface LocationTheme {
  id: LocationId;
  name: string;
  subtitle: string;
  description: string;
  seed: number;
  skyTop: string;
  skyMid: string;
  skyHorizon: string;
  fogColor: number;
  fogNear: number;
  fogFar: number;
  sunColor: number;
  sunIntensity: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  groundColor: string;
  groundAccent: string;
  wallColor: string;
  buildingColorA: string;
  buildingColorB: string;
  crateColor: string;
  containerColorA: string;
  containerColorB: string;
  accentGlowColor: number | null;
  litWindows: boolean;
  nightMode: boolean;
  weatherType: WeatherType;
  waterBorder?: boolean;
  snowGround?: boolean;
}

export const LOCATION_THEMES: Record<LocationId, LocationTheme> = {
  dust_canyon: {
    id: 'dust_canyon',
    name: 'Dust Canyon',
    subtitle: 'Sunlit sandstone compound',
    description: 'Arid sandstone fortress with exposed A Long corridor, elevated catwalk, and shaded bazaar tunnels.',
    seed: 104729,
    skyTop: '#235b96',
    skyMid: '#7ab0d9',
    skyHorizon: '#e5cfa7',
    fogColor: 0xe0cba5,
    fogNear: 85,
    fogFar: 320,
    sunColor: 0xfff0d1,
    sunIntensity: 2.35,
    hemiSky: 0xaad4f5,
    hemiGround: 0xa17e57,
    hemiIntensity: 0.78,
    groundColor: '#cbb289',
    groundAccent: '#a3855d',
    wallColor: '#cfb68e',
    buildingColorA: '#dbc8a8',
    buildingColorB: '#c9a47c',
    crateColor: '#9c7143',
    containerColorA: '#305470',
    containerColorB: '#7d3e2a',
    accentGlowColor: null,
    litWindows: false,
    nightMode: false,
    weatherType: 'dust',
  },
  arctic_base: {
    id: 'arctic_base',
    name: 'Arctic Base',
    subtitle: 'Frozen research outpost',
    description: 'Glacial military complex with icy catwalks, steel cargo containers, and drifting snowfall.',
    seed: 221941,
    skyTop: '#456a90',
    skyMid: '#96b3ce',
    skyHorizon: '#dde8f3',
    fogColor: 0xdce7f2,
    fogNear: 75,
    fogFar: 290,
    sunColor: 0xf4f9ff,
    sunIntensity: 2.1,
    hemiSky: 0xdbeeff,
    hemiGround: 0x8ba1b8,
    hemiIntensity: 0.88,
    groundColor: '#dfe8f2',
    groundAccent: '#b0c3d6',
    wallColor: '#96acc2',
    buildingColorA: '#c4d3e2',
    buildingColorB: '#859bb2',
    crateColor: '#4c6d8a',
    containerColorA: '#2a567a',
    containerColorB: '#c9582e',
    accentGlowColor: 0x7dd3fc,
    litWindows: true,
    nightMode: false,
    weatherType: 'snow',
    snowGround: true,
  },
  jungle_ruins: {
    id: 'jungle_ruins',
    name: 'Jungle Ruins',
    subtitle: 'Overgrown mossy temple',
    description: 'Ancient mossy stone courtyard shaded by towering jungle trees, timber bridges, and temple arches.',
    seed: 339817,
    skyTop: '#245e53',
    skyMid: '#649c80',
    skyHorizon: '#a5c2a2',
    fogColor: 0xa5c2a2,
    fogNear: 68,
    fogFar: 270,
    sunColor: 0xfff3c9,
    sunIntensity: 2.05,
    hemiSky: 0x9ad9b5,
    hemiGround: 0x364d2f,
    hemiIntensity: 0.82,
    groundColor: '#546b44',
    groundAccent: '#3c5230',
    wallColor: '#6d7762',
    buildingColorA: '#78846d',
    buildingColorB: '#596750',
    crateColor: '#7a5b37',
    containerColorA: '#3a5d40',
    containerColorB: '#665037',
    accentGlowColor: null,
    litWindows: false,
    nightMode: false,
    weatherType: 'spores',
  },
  night_city: {
    id: 'night_city',
    name: 'Night City',
    subtitle: 'Midnight downtown plaza',
    description: 'Wet midnight asphalt plaza lit by sodium streetlamps, illuminated high-rises, and dark alley flanks.',
    seed: 448293,
    skyTop: '#060a14',
    skyMid: '#101a2e',
    skyHorizon: '#1c2b47',
    fogColor: 0x182338,
    fogNear: 64,
    fogFar: 265,
    sunColor: 0x99bef2,
    sunIntensity: 1.45,
    hemiSky: 0x4b6896,
    hemiGround: 0x191f2a,
    hemiIntensity: 0.92,
    groundColor: '#2a303a',
    groundAccent: '#1c2028',
    wallColor: '#47505f',
    buildingColorA: '#2e3645',
    buildingColorB: '#3a4254',
    crateColor: '#6e563a',
    containerColorA: '#2a465e',
    containerColorB: '#5e382f',
    accentGlowColor: 0xffd27d,
    litWindows: true,
    nightMode: true,
    weatherType: 'rain',
  },
  harbor_docks: {
    id: 'harbor_docks',
    name: 'Harbor Docks',
    subtitle: 'Cargo yard & sea wall',
    description: 'Coastal freight terminal packed with corrugated shipping containers, crane gantries, and wet concrete piers.',
    seed: 551023,
    skyTop: '#286496',
    skyMid: '#70a4cc',
    skyHorizon: '#c2d8e8',
    fogColor: 0xc2d8e8,
    fogNear: 82,
    fogFar: 310,
    sunColor: 0xfff5e2,
    sunIntensity: 2.15,
    hemiSky: 0xb6dcf8,
    hemiGround: 0x495f70,
    hemiIntensity: 0.82,
    groundColor: '#767e87',
    groundAccent: '#555e68',
    wallColor: '#728191',
    buildingColorA: '#8b9aa8',
    buildingColorB: '#627587',
    crateColor: '#9c7143',
    containerColorA: '#1d5b82',
    containerColorB: '#9e402a',
    accentGlowColor: 0x38bdf8,
    litWindows: false,
    nightMode: false,
    weatherType: 'none',
    waterBorder: true,
  },
  volcano_outpost: {
    id: 'volcano_outpost',
    name: 'Volcano Outpost',
    subtitle: 'Basalt ridge & magma vents',
    description: 'Obsidian industrial refinery split by glowing magma fissures, reinforced bunkers, and rising embers.',
    seed: 662847,
    skyTop: '#180909',
    skyMid: '#421912',
    skyHorizon: '#7d2f18',
    fogColor: 0x572012,
    fogNear: 60,
    fogFar: 255,
    sunColor: 0xff9452,
    sunIntensity: 1.75,
    hemiSky: 0xdf6e39,
    hemiGround: 0x261511,
    hemiIntensity: 0.85,
    groundColor: '#342e2e',
    groundAccent: '#201a1a',
    wallColor: '#483f3d',
    buildingColorA: '#3a3436',
    buildingColorB: '#4f4039',
    crateColor: '#694b34',
    containerColorA: '#423838',
    containerColorB: '#8a351b',
    accentGlowColor: 0xff6a1a,
    litWindows: true,
    nightMode: true,
    weatherType: 'ash',
  },
  snow_village: {
    id: 'snow_village',
    name: 'Snow Village',
    subtitle: 'Alpine timber cabins',
    description: 'High-altitude timber village with warm cabin windows, pitched roofs, pine groves, and snowfall.',
    seed: 774109,
    skyTop: '#4e7191',
    skyMid: '#a3bdd4',
    skyHorizon: '#e5eef6',
    fogColor: 0xe2ebf2,
    fogNear: 72,
    fogFar: 280,
    sunColor: 0xfff9f0,
    sunIntensity: 2.0,
    hemiSky: 0xd6e8f7,
    hemiGround: 0x7e8e9c,
    hemiIntensity: 0.88,
    groundColor: '#e4ecf2',
    groundAccent: '#b4c4d4',
    wallColor: '#8c725a',
    buildingColorA: '#7d593c',
    buildingColorB: '#664830',
    crateColor: '#8c6239',
    containerColorA: '#4d6170',
    containerColorB: '#7a4534',
    accentGlowColor: 0xffcf70,
    litWindows: true,
    nightMode: false,
    weatherType: 'snow',
    snowGround: true,
  },
  mars_colony: {
    id: 'mars_colony',
    name: 'Mars Colony',
    subtitle: 'Red regolith habitat',
    description: 'Pressurized Martian frontier base with composite armor modules, hazard stripes, and red dust storms.',
    seed: 885311,
    skyTop: '#632c1d',
    skyMid: '#ab593b',
    skyHorizon: '#db916a',
    fogColor: 0xd48963,
    fogNear: 78,
    fogFar: 295,
    sunColor: 0xffe4cc,
    sunIntensity: 2.15,
    hemiSky: 0xf2a785,
    hemiGround: 0x6e2e1d,
    hemiIntensity: 0.76,
    groundColor: '#b55638',
    groundAccent: '#8a3b22',
    wallColor: '#8f8b88',
    buildingColorA: '#b8b5b0',
    buildingColorB: '#76797e',
    crateColor: '#c48342',
    containerColorA: '#99a3ad',
    containerColorB: '#b55031',
    accentGlowColor: 0x38bdf8,
    litWindows: true,
    nightMode: false,
    weatherType: 'dust',
  },
  neon_alley: {
    id: 'neon_alley',
    name: 'Neon Alley',
    subtitle: 'Cyber-district backstreets',
    description: 'Rain-slicked cyber corridor drenched in teal and magenta neon signage with multi-tier catwalks.',
    seed: 996427,
    skyTop: '#070412',
    skyMid: '#170f30',
    skyHorizon: '#2a154a',
    fogColor: 0x1a0f32,
    fogNear: 60,
    fogFar: 255,
    sunColor: 0xb794f4,
    sunIntensity: 1.4,
    hemiSky: 0x4fd1c5,
    hemiGround: 0x1e0e33,
    hemiIntensity: 0.92,
    groundColor: '#1d202b',
    groundAccent: '#12151f',
    wallColor: '#2f3447',
    buildingColorA: '#232738',
    buildingColorB: '#2d2442',
    crateColor: '#3d4459',
    containerColorA: '#1b4d59',
    containerColorB: '#5c2260',
    accentGlowColor: 0x2dd4bf,
    litWindows: true,
    nightMode: true,
    weatherType: 'rain',
  },
  cairo_bazaar: {
    id: 'cairo_bazaar',
    name: 'Cairo Bazaar',
    subtitle: 'Walled market & spice stalls',
    description: 'Sun-baked market labyrinth lined with woven awnings, spice stalls, limestone arches, and narrow chokepoints.',
    seed: 112233,
    skyTop: '#1f62a6',
    skyMid: '#78b3de',
    skyHorizon: '#edd3aa',
    fogColor: 0xebd2a9,
    fogNear: 82,
    fogFar: 315,
    sunColor: 0xfff0cc,
    sunIntensity: 2.35,
    hemiSky: 0xb8dcf7,
    hemiGround: 0xb08a58,
    hemiIntensity: 0.78,
    groundColor: '#d9be93',
    groundAccent: '#b89768',
    wallColor: '#d6ba8d',
    buildingColorA: '#e3cba1',
    buildingColorB: '#cc9f6e',
    crateColor: '#9e6b3b',
    containerColorA: '#a63e2b',
    containerColorB: '#2f6a7d',
    accentGlowColor: null,
    litWindows: false,
    nightMode: false,
    weatherType: 'dust',
  },
};

export interface WeaponSpec {
  id: WeaponId;
  slot: 1 | 2 | 3; // 1 = Primary, 2 = Pistol, 3 = Knife
  name: string;
  shortName: string;
  category: string;
  price: number;
  damage: number;
  pellets: number; // 1 for standard, 8 for Nova shotgun
  headshotMultiplier: number;
  armorPenetration: number;
  penetrationPower: number; // 0..1 thin cover wall penetration
  falloffPer10m: number; // fraction damage lost per 10m
  fireRate: number;
  automatic: boolean;
  magSize: number;
  maxReserve: number;
  reloadTime: number;
  baseSpread: number;
  moveSpread: number;
  jumpSpread: number;
  crouchSpreadFactor: number;
  recoilPitch: number;
  recoilYaw: number;
  recoilSpreadGain: number;
  recoilRecoveryRate: number;
  sprayPattern: [number, number][]; // [pitchBias, yawBias]
  moveSpeedFactor: number;
  killReward: number;
  hasScope: boolean;
  isMelee?: boolean;
  range: number;
  stats: {
    damage: number;
    fireRate: number;
    accuracy: number;
    mobility: number;
  };
}

export const WEAPON_SPECS: Record<WeaponId, WeaponSpec> = {
  knife: {
    id: 'knife',
    slot: 3,
    name: 'Combat Knife',
    shortName: 'Knife',
    category: 'Melee',
    price: 0,
    damage: 55,
    pellets: 1,
    headshotMultiplier: 2.0,
    armorPenetration: 0.85,
    penetrationPower: 0,
    falloffPer10m: 0,
    fireRate: 0.42,
    automatic: false,
    magSize: 0,
    maxReserve: 0,
    reloadTime: 0,
    baseSpread: 0,
    moveSpread: 0,
    jumpSpread: 0,
    crouchSpreadFactor: 1,
    recoilPitch: 0.008,
    recoilYaw: 0.004,
    recoilSpreadGain: 0,
    recoilRecoveryRate: 14,
    sprayPattern: [[1, 0]],
    moveSpeedFactor: 1.12,
    killReward: 1500,
    hasScope: false,
    isMelee: true,
    range: 2.75,
    stats: { damage: 55, fireRate: 68, accuracy: 100, mobility: 100 },
  },
  usps: {
    id: 'usps',
    slot: 2,
    name: 'USP-S Tactical',
    shortName: 'USP-S',
    category: 'Pistol',
    price: 200,
    damage: 36,
    pellets: 1,
    headshotMultiplier: 3.5,
    armorPenetration: 0.54,
    penetrationPower: 0.35,
    falloffPer10m: 0.07,
    fireRate: 0.16,
    automatic: false,
    magSize: 12,
    maxReserve: 36,
    reloadTime: 1.45,
    baseSpread: 0.0038,
    moveSpread: 0.019,
    jumpSpread: 0.06,
    crouchSpreadFactor: 0.65,
    recoilPitch: 0.014,
    recoilYaw: 0.004,
    recoilSpreadGain: 0.0075,
    recoilRecoveryRate: 12,
    sprayPattern: [
      [1.0, 0.0],
      [1.05, 0.12],
      [1.1, -0.15],
      [1.0, 0.2],
    ],
    moveSpeedFactor: 1.0,
    killReward: 300,
    hasScope: false,
    range: 135,
    stats: { damage: 45, fireRate: 64, accuracy: 84, mobility: 96 },
  },
  mp9: {
    id: 'mp9',
    slot: 1,
    name: 'MP9 Tactical SMG',
    shortName: 'MP9',
    category: 'SMG',
    price: 1250,
    damage: 25,
    pellets: 1,
    headshotMultiplier: 3.5,
    armorPenetration: 0.6,
    penetrationPower: 0.32,
    falloffPer10m: 0.09,
    fireRate: 0.072,
    automatic: true,
    magSize: 30,
    maxReserve: 120,
    reloadTime: 1.85,
    baseSpread: 0.008,
    moveSpread: 0.018,
    jumpSpread: 0.052,
    crouchSpreadFactor: 0.65,
    recoilPitch: 0.01,
    recoilYaw: 0.007,
    recoilSpreadGain: 0.004,
    recoilRecoveryRate: 11,
    sprayPattern: [
      [0.8, 0.0],
      [0.9, -0.15],
      [1.0, 0.25],
      [1.05, 0.4],
      [0.9, 0.45],
      [0.8, 0.15],
      [0.7, -0.35],
      [0.65, -0.5],
      [0.6, -0.25],
      [0.55, 0.3],
    ],
    moveSpeedFactor: 0.96,
    killReward: 600,
    hasScope: false,
    range: 115,
    stats: { damage: 44, fireRate: 96, accuracy: 70, mobility: 92 },
  },
  nova: {
    id: 'nova',
    slot: 1,
    name: 'Nova Pump Shotgun',
    shortName: 'Nova',
    category: 'Shotgun',
    price: 1050,
    damage: 19, // x8 pellets = 152 close-range burst
    pellets: 8,
    headshotMultiplier: 3.5,
    armorPenetration: 0.52,
    penetrationPower: 0.2,
    falloffPer10m: 0.24,
    fireRate: 0.85,
    automatic: false,
    magSize: 8,
    maxReserve: 32,
    reloadTime: 2.35,
    baseSpread: 0.056,
    moveSpread: 0.016,
    jumpSpread: 0.045,
    crouchSpreadFactor: 0.8,
    recoilPitch: 0.036,
    recoilYaw: 0.01,
    recoilSpreadGain: 0.012,
    recoilRecoveryRate: 8,
    sprayPattern: [[1, 0]],
    moveSpeedFactor: 0.88,
    killReward: 900,
    hasScope: false,
    range: 52,
    stats: { damage: 90, fireRate: 30, accuracy: 48, mobility: 80 },
  },
  m4a4: {
    id: 'm4a4',
    slot: 1,
    name: 'M4A4 Carbine',
    shortName: 'M4A4',
    category: 'Rifle',
    price: 3100,
    damage: 34,
    pellets: 1,
    headshotMultiplier: 3.5,
    armorPenetration: 0.72,
    penetrationPower: 0.65,
    falloffPer10m: 0.035,
    fireRate: 0.092,
    automatic: true,
    magSize: 30,
    maxReserve: 90,
    reloadTime: 2.15,
    baseSpread: 0.0028,
    moveSpread: 0.034,
    jumpSpread: 0.088,
    crouchSpreadFactor: 0.56,
    recoilPitch: 0.014,
    recoilYaw: 0.006,
    recoilSpreadGain: 0.0055,
    recoilRecoveryRate: 9.5,
    // Iconic CS rifle T-shaped recoil climb
    sprayPattern: [
      [0.7, 0.0],
      [0.95, 0.06],
      [1.1, -0.08],
      [1.15, 0.14],
      [1.05, 0.28],
      [0.95, 0.36],
      [0.7, 0.48],
      [0.45, 0.55],
      [0.35, 0.1],
      [0.3, -0.45],
      [0.25, -0.62],
      [0.25, -0.4],
      [0.2, 0.2],
      [0.2, 0.52],
    ],
    moveSpeedFactor: 0.9,
    killReward: 300,
    hasScope: false,
    range: 190,
    stats: { damage: 72, fireRate: 88, accuracy: 88, mobility: 82 },
  },
  awp: {
    id: 'awp',
    slot: 1,
    name: 'AWP Magnum',
    shortName: 'AWP',
    category: 'Sniper',
    price: 4750,
    damage: 118,
    pellets: 1,
    headshotMultiplier: 3.5,
    armorPenetration: 0.96,
    penetrationPower: 0.88,
    falloffPer10m: 0.012,
    fireRate: 1.38,
    automatic: false,
    magSize: 5,
    maxReserve: 25,
    reloadTime: 2.85,
    baseSpread: 0.05,
    moveSpread: 0.075,
    jumpSpread: 0.14,
    crouchSpreadFactor: 0.7,
    recoilPitch: 0.052,
    recoilYaw: 0.01,
    recoilSpreadGain: 0.04,
    recoilRecoveryRate: 6,
    sprayPattern: [[1, 0]],
    moveSpeedFactor: 0.8,
    killReward: 100,
    hasScope: true,
    range: 320,
    stats: { damage: 100, fireRate: 22, accuracy: 99, mobility: 66 },
  },
};

export interface GrenadeSpec {
  id: GrenadeId;
  key: '4' | '5' | '6';
  name: string;
  price: number;
  description: string;
}

export const GRENADE_SPECS: Record<GrenadeId, GrenadeSpec> = {
  smoke: {
    id: 'smoke',
    key: '4',
    name: 'Smoke Grenade',
    price: 300,
    description: 'Creates dense volumetric smoke cloud blocking sightlines for 13s',
  },
  flash: {
    id: 'flash',
    key: '5',
    name: 'Flashbang',
    price: 200,
    description: 'Blinds & disorients players looking toward the blast with ear-ringing',
  },
  he: {
    id: 'he',
    key: '6',
    name: 'HE Grenade',
    price: 300,
    description: 'High-explosive fragmentation charge (up to 92 splash dmg)',
  },
};

export interface DifficultyConfig {
  id: Difficulty;
  label: string;
  reactionTime: number;
  aimSpread: number;
  turnSpeed: number;
  fireCooldownMult: number;
  burstLength: number;
  burstPause: number;
  damageMult: number;
  headshotChance: number;
  moveSpeed: number;
  sightRange: number;
  coverPreference: number;
}

export const DIFFICULTY_CONFIGS: Record<Difficulty, DifficultyConfig> = {
  easy: {
    id: 'easy',
    label: 'Easy',
    reactionTime: 0.62,
    aimSpread: 0.09,
    turnSpeed: 6.5,
    fireCooldownMult: 1.3,
    burstLength: 3,
    burstPause: 0.95,
    damageMult: 0.72,
    headshotChance: 0.04,
    moveSpeed: 3.9,
    sightRange: 64,
    coverPreference: 0.45,
  },
  medium: {
    id: 'medium',
    label: 'Medium',
    reactionTime: 0.36,
    aimSpread: 0.052,
    turnSpeed: 9.5,
    fireCooldownMult: 1.0,
    burstLength: 4,
    burstPause: 0.68,
    damageMult: 0.95,
    headshotChance: 0.1,
    moveSpeed: 4.55,
    sightRange: 80,
    coverPreference: 0.7,
  },
  hard: {
    id: 'hard',
    label: 'Hard',
    reactionTime: 0.2,
    aimSpread: 0.028,
    turnSpeed: 13.5,
    fireCooldownMult: 0.82,
    burstLength: 5,
    burstPause: 0.46,
    damageMult: 1.12,
    headshotChance: 0.18,
    moveSpeed: 5.05,
    sightRange: 98,
    coverPreference: 0.85,
  },
};

export const MATCH_CONSTANTS = {
  ROUNDS_TO_WIN: 8,
  ROUND_DURATION: 135, // 2m 15s for larger CS2-scale tactical maps
  BUY_PHASE_DURATION: 10, // 10 seconds
  BOMB_FUSE_DURATION: 40, // 40 seconds after plant
  BOMB_PLANT_DURATION: 3.0,
  BOMB_DEFUSE_DURATION: 5.0,
  BOMB_DEFUSE_KIT_DURATION: 3.0,
  ROUND_END_DELAY: 3.8,
  START_MONEY: 800,
  MAX_MONEY: 16000,
  WIN_REWARD: 3250,
  LOSS_BASE_REWARD: 1400,
  LOSS_STREAK_BONUS: 500,
  MAX_LOSS_REWARD: 3400,
  ARMOR_PRICE: 650,
  HELMET_PRICE: 1000,
  DEFUSE_KIT_PRICE: 400,
  HEADSHOT_BONUS: 150,
  BOMB_PLANT_REWARD: 300,
  BOMB_DEFUSE_REWARD: 300,
};

export interface PlayerSetupConfig {
  name: string;
  uniform: UniformStyleId;
  gender: Gender;
  location: LocationId;
  mapSize: MapSize;
  teamSize: number; // 5..25 per team (total players = teamSize * 2)
  side: TeamSide;
  difficulty: Difficulty;
}

export interface AABB {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  tag?: 'wall' | 'building' | 'crate' | 'container' | 'barrier' | 'platform';
  penetrable?: boolean;
  thickness?: number;
}

export interface RampZone {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  yStart: number;
  yEnd: number;
  axis: 'x' | 'z'; // direction of ascent from min -> max
}

export interface MapCallout {
  id: string;
  name: string;
  x: number;
  z: number;
  kind: 'site' | 'spawn' | 'lane' | 'mid';
}

export interface MinimapRect {
  x: number;
  z: number;
  w: number;
  d: number;
  kind: 'building' | 'wall' | 'crate' | 'container' | 'siteA' | 'siteB' | 'platform';
}

export interface MinimapBlip {
  id: string;
  x: number;
  z: number;
  team: TeamSide;
  alive: boolean;
  spotted: boolean;
  hasBomb?: boolean;
}

export interface DroppedWeaponBlip {
  uid: number;
  weaponName: string;
  x: number;
  z: number;
}

export interface KillFeedEntry {
  id: number;
  killer: string;
  killerTeam: TeamSide;
  victim: string;
  victimTeam: TeamSide;
  weapon: string;
  headshot: boolean;
  timestamp: number;
}

export interface RadioCallout {
  id: number;
  sender: string;
  team: TeamSide;
  message: string;
  timestamp: number;
}

export interface ScoreboardRow {
  id: string;
  name: string;
  team: TeamSide;
  gender: Gender;
  isPlayer: boolean;
  alive: boolean;
  kills: number;
  deaths: number;
  money: number;
  hasBomb: boolean;
}

export interface WeaponSlotState {
  id: WeaponId;
  ammo: number;
  reserve: number;
}

export interface GrenadeInventory {
  smoke: number;
  flash: number;
  he: number;
}

export interface MatchStats {
  kills: number;
  deaths: number;
  headshots: number;
  shotsFired: number;
  shotsHit: number;
  damageDealt: number;
  roundsPlayed: number;
  plants: number;
  defuses: number;
}

export type BombState = 'carried' | 'planted' | 'defused' | 'exploded';

export interface HudSnapshot {
  screen: GameScreen;
  pointerLocked: boolean;
  setup: PlayerSetupConfig;
  setupMapPreview: boolean;
  loadingProgress: number; // 0..1 (<1 shows loading bar)
  loadingLabel: string;
  roundNumber: number;
  roundPhase: RoundPhase;
  roundTimer: number;
  buyTimer: number;
  ctScore: number;
  tScore: number;
  ctAlive: number;
  tAlive: number;
  health: number;
  armor: number;
  hasHelmet: boolean;
  hasDefuseKit: boolean;
  hasBomb: boolean;
  money: number;
  activeSlot: 1 | 2 | 3;
  primaryWeapon: WeaponSlotState | null;
  secondaryWeapon: WeaponSlotState | null;
  grenades: GrenadeInventory;
  isReloading: boolean;
  reloadProgress: number;
  scopeLevel: 0 | 1 | 2;
  crosshairSpread: number;
  isCrouching: boolean;
  isWalking: boolean;
  playerAlive: boolean;
  spectatingName: string | null;
  buyMenuOpen: boolean;
  scoreboardOpen: boolean;
  fullMapOpen: boolean;
  fullMapMode: FullMapMode;
  fullMapTilt: boolean;
  fullMapZoom: number;
  fullMapPanX: number;
  fullMapPanZ: number;
  radarZoom: number;
  currentCallout: string;
  calloutLabels: MapCallout[];
  droppedWeaponBlips: DroppedWeaponBlip[];
  buyHintMessage: string | null;
  interactPrompt: string | null;
  actionProgress: number | null;
  actionLabel: string | null;
  bombState: BombState;
  bombSite: 'A' | 'B' | null;
  bombTimer: number;
  bombPosX: number;
  bombPosZ: number;
  hitMarkerType: 'none' | 'body' | 'head' | 'kill';
  hitMarkerAlpha: number;
  damageIndicatorAngle: number;
  damageIndicatorAlpha: number;
  damageFlashAlpha: number;
  flashBlindAlpha: number;
  lowHealthAlpha: number;
  bannerTitle: string | null;
  bannerSubtitle: string | null;
  bannerAccent: 'ct' | 't' | 'neutral';
  mvpText: string | null;
  killFeed: KillFeedEntry[];
  radioCallouts: RadioCallout[];
  scoreboardRows: ScoreboardRow[];
  playerX: number;
  playerZ: number;
  playerYaw: number;
  minimapBlips: MinimapBlip[];
  matchWinner: TeamSide | null;
  stats: MatchStats;
  muted: boolean;
  volume: number;
  sensitivity: number;
  fov: number;
  graphics: GraphicsSettings;
  fps: number;
  fpsWarning: string | null;
  isSoftwareGl: boolean;
  isTouchDevice: boolean;
}
