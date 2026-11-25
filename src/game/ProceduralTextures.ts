import * as THREE from 'three';
import { LocationTheme, SurfaceType, UNIFORM_STYLES, UniformStyleId } from './types';

/**
 * ============================================================================
 * SECTION: PROCEDURAL HIGH-RES PBR CANVAS TEXTURES (ALBEDO + NORMAL + ROUGHNESS)
 * ============================================================================
 * Generates crisp 256-512px procedural albedo, tangent-space normal maps (from
 * height fields), roughness maps, camo fabric patterns, skin tones, brushed
 * gunmetal, and alpha-cutout foliage clusters with zero external dependencies.
 */

export interface MaterialLibrary {
  ground: THREE.MeshStandardMaterial;
  outerGround: THREE.MeshStandardMaterial;
  wall: THREE.MeshStandardMaterial;
  buildingA: THREE.MeshStandardMaterial;
  buildingB: THREE.MeshStandardMaterial;
  concrete: THREE.MeshStandardMaterial;
  concreteDark: THREE.MeshStandardMaterial;
  crate: THREE.MeshStandardMaterial;
  containerA: THREE.MeshStandardMaterial;
  containerB: THREE.MeshStandardMaterial;
  roofMetal: THREE.MeshStandardMaterial;
  metalDeck: THREE.MeshStandardMaterial;
  gravelBed: THREE.MeshStandardMaterial;
  trimAccent: THREE.MeshStandardMaterial;
  cliffRock: THREE.MeshStandardMaterial;
  treeBark: THREE.MeshStandardMaterial;
  foliage: THREE.MeshStandardMaterial;
  fabricAwningA: THREE.MeshStandardMaterial;
  fabricAwningB: THREE.MeshStandardMaterial;
  lavaGlow: THREE.MeshStandardMaterial;
  siteADecal: THREE.MeshBasicMaterial;
  siteBDecal: THREE.MeshBasicMaterial;
  contactShadow: THREE.MeshBasicMaterial;
  defaultGroundSurface: SurfaceType;
  dispose: () => void;
}

function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function makeCanvas(size = 512): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  return [canvas, ctx];
}

function configureTexture(
  canvas: HTMLCanvasElement,
  repeatX: number,
  repeatY: number,
  maxAniso: number,
  isColor = true
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = maxAniso;
  tex.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Converts a grayscale height canvas into a seamless Sobel tangent-space Normal Map
 * and an inverted/scaled Roughness Map.
 */
function buildNormalAndRoughnessFromHeight(
  heightCanvas: HTMLCanvasElement,
  repeatX: number,
  repeatY: number,
  maxAniso: number,
  strength: number,
  roughBase: number,
  roughVariance: number
): { normalMap: THREE.CanvasTexture; roughnessMap: THREE.CanvasTexture } {
  const w = heightCanvas.width;
  const h = heightCanvas.height;
  const hCtx = heightCanvas.getContext('2d')!;
  const src = hCtx.getImageData(0, 0, w, h).data;

  const [nCanvas, nCtx] = makeCanvas(w);
  const nImg = nCtx.createImageData(w, h);
  const nd = nImg.data;

  const [rCanvas, rCtx] = makeCanvas(w);
  const rImg = rCtx.createImageData(w, h);
  const rd = rImg.data;

  const sampleH = (x: number, y: number) => {
    const cx = ((x % w) + w) % w;
    const cy = ((y % h) + h) % h;
    return src[(cy * w + cx) * 4] / 255;
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const hL = sampleH(x - 1, y);
      const hR = sampleH(x + 1, y);
      const hU = sampleH(x, y - 1);
      const hD = sampleH(x, y + 1);

      const dx = (hL - hR) * strength;
      const dy = (hU - hD) * strength;
      const dz = 1.0;
      const len = Math.hypot(dx, dy, dz);

      nd[idx] = Math.round(((dx / len) * 0.5 + 0.5) * 255);
      nd[idx + 1] = Math.round(((dy / len) * 0.5 + 0.5) * 255);
      nd[idx + 2] = Math.round(((dz / len) * 0.5 + 0.5) * 255);
      nd[idx + 3] = 255;

      const hVal = src[idx] / 255;
      const rough = THREE.MathUtils.clamp(roughBase + (1 - hVal - 0.5) * roughVariance, 0.15, 0.98);
      const rByte = Math.round(rough * 255);
      rd[idx] = rByte;
      rd[idx + 1] = rByte;
      rd[idx + 2] = rByte;
      rd[idx + 3] = 255;
    }
  }

  nCtx.putImageData(nImg, 0, 0);
  rCtx.putImageData(rImg, 0, 0);

  return {
    normalMap: configureTexture(nCanvas, repeatX, repeatY, maxAniso, false),
    roughnessMap: configureTexture(rCanvas, repeatX, repeatY, maxAniso, false),
  };
}

function createGroundMaps(theme: LocationTheme, res: number, repeat: number, maxAniso: number) {
  const [canvas, ctx] = makeCanvas(res);
  const [hCanvas, hCtx] = makeCanvas(res);
  const rand = seededRandom(theme.seed + 11);

  ctx.fillStyle = theme.groundColor;
  ctx.fillRect(0, 0, res, res);
  hCtx.fillStyle = '#808080';
  hCtx.fillRect(0, 0, res, res);

  // Organic soil / moisture patches
  for (let i = 0; i < 65; i++) {
    const px = rand() * res;
    const py = rand() * res;
    const r = (14 + rand() * 44) * (res / 512);
    ctx.fillStyle = theme.groundAccent;
    ctx.globalAlpha = 0.12 + rand() * 0.16;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();

    hCtx.fillStyle = rand() > 0.5 ? 'rgba(220,220,220,0.12)' : 'rgba(40,40,40,0.12)';
    hCtx.beginPath();
    hCtx.arc(px, py, r, 0, Math.PI * 2);
    hCtx.fill();
  }
  ctx.globalAlpha = 1;

  // Stone pavers / wet asphalt joints / ice seams
  const step = res / 8;
  ctx.strokeStyle = theme.nightMode
    ? 'rgba(120, 175, 255, 0.14)'
    : theme.snowGround
      ? 'rgba(110, 140, 170, 0.22)'
      : 'rgba(26, 22, 16, 0.24)';
  ctx.lineWidth = Math.max(1.5, res / 256);
  hCtx.strokeStyle = '#303030';
  hCtx.lineWidth = Math.max(2, res / 180);

  for (let y = 0; y < res; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(res, y);
    ctx.stroke();
    hCtx.beginPath();
    hCtx.moveTo(0, y);
    hCtx.lineTo(res, y);
    hCtx.stroke();

    const off = Math.round(y / step) % 2 === 0 ? 0 : step / 2;
    for (let x = off; x < res; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + step);
      ctx.stroke();
      hCtx.beginPath();
      hCtx.moveTo(x, y);
      hCtx.lineTo(x, y + step);
      hCtx.stroke();
    }
  }

  // Micro grit & cracks
  const speckCount = Math.round(2800 * (res / 512));
  for (let i = 0; i < speckCount; i++) {
    const x = rand() * res;
    const y = rand() * res;
    const sz = 1 + rand() * 2;
    const light = rand() > 0.5;
    ctx.fillStyle = light ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.11)';
    ctx.fillRect(x, y, sz, sz);
    hCtx.fillStyle = light ? '#9a9a9a' : '#656565';
    hCtx.fillRect(x, y, sz, sz);
  }

  // Wet sheen puddles on night/harbor urban floors
  const isWetUrban = theme.id === 'night_city' || theme.id === 'harbor_docks' || theme.id === 'neon_alley';
  if (isWetUrban) {
    for (let i = 0; i < 6; i++) {
      const px = rand() * res;
      const py = rand() * res;
      const rx = (22 + rand() * 48) * (res / 512);
      const ry = (16 + rand() * 34) * (res / 512);
      ctx.fillStyle = 'rgba(10, 16, 24, 0.25)';
      ctx.beginPath();
      ctx.ellipse(px, py, rx, ry, rand() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
      hCtx.fillStyle = '#ffffff'; // higher height -> smoother wet spot in roughness
      hCtx.beginPath();
      hCtx.ellipse(px, py, rx, ry, 0, 0, Math.PI * 2);
      hCtx.fill();
    }
  }

  const map = configureTexture(canvas, repeat, repeat, maxAniso, true);
  const { normalMap, roughnessMap } = buildNormalAndRoughnessFromHeight(
    hCanvas,
    repeat,
    repeat,
    maxAniso,
    1.8,
    isWetUrban ? 0.68 : theme.snowGround ? 0.78 : 0.9,
    isWetUrban ? 0.65 : 0.22
  );
  return { map, normalMap, roughnessMap };
}

function createWallMaps(theme: LocationTheme, res: number, maxAniso: number) {
  const [canvas, ctx] = makeCanvas(res);
  const [hCanvas, hCtx] = makeCanvas(res);
  const rand = seededRandom(theme.seed + 23);

  ctx.fillStyle = theme.wallColor;
  ctx.fillRect(0, 0, res, res);
  hCtx.fillStyle = '#8a8a8a';
  hCtx.fillRect(0, 0, res, res);

  const rows = 8;
  const rowH = res / rows;
  for (let r = 0; r < rows; r++) {
    const cols = 4;
    const colW = res / cols;
    const off = r % 2 === 0 ? 0 : colW / 2;
    for (let c = -1; c <= cols; c++) {
      const bx = c * colW + off;
      const by = r * rowH;
      const shade = rand() > 0.5 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.09)';
      ctx.fillStyle = shade;
      ctx.fillRect(bx + 2, by + 2, colW - 4, rowH - 4);
      ctx.strokeStyle = 'rgba(0,0,0,0.28)';
      ctx.lineWidth = Math.max(1.5, res / 220);
      ctx.strokeRect(bx + 1, by + 1, colW - 2, rowH - 2);

      const hShade = Math.round(125 + rand() * 45);
      hCtx.fillStyle = `rgb(${hShade},${hShade},${hShade})`;
      hCtx.fillRect(bx + 3, by + 3, colW - 6, rowH - 6);
      hCtx.strokeStyle = '#383838';
      hCtx.lineWidth = Math.max(2, res / 170);
      hCtx.strokeRect(bx + 1, by + 1, colW - 2, rowH - 2);
    }
  }

  // Weathering dirt gradient at wall base
  const dirt = ctx.createLinearGradient(0, res * 0.72, 0, res);
  dirt.addColorStop(0, 'rgba(0,0,0,0)');
  dirt.addColorStop(1, 'rgba(18,14,10,0.34)');
  ctx.fillStyle = dirt;
  ctx.fillRect(0, res * 0.72, res, res * 0.28);

  if (theme.accentGlowColor !== null) {
    const hex = `#${theme.accentGlowColor.toString(16).padStart(6, '0')}`;
    ctx.fillStyle = hex;
    ctx.globalAlpha = theme.nightMode ? 0.72 : 0.35;
    ctx.fillRect(0, res * 0.1, res, res * 0.02);
    ctx.globalAlpha = 1;
  }

  const map = configureTexture(canvas, 2, 1, maxAniso, true);
  const { normalMap, roughnessMap } = buildNormalAndRoughnessFromHeight(
    hCanvas,
    2,
    1,
    maxAniso,
    2.4,
    0.86,
    0.2
  );
  return { map, normalMap, roughnessMap };
}

function createBuildingMaps(baseColor: string, theme: LocationTheme, seedOffset: number, res: number, maxAniso: number) {
  const [canvas, ctx] = makeCanvas(res);
  const [hCanvas, hCtx] = makeCanvas(res);
  const rand = seededRandom(theme.seed + seedOffset);

  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, res, res);
  hCtx.fillStyle = '#909090';
  hCtx.fillRect(0, 0, res, res);

  // Plaster / cladding panels + weathering streaks
  for (let i = 0; i < 80; i++) {
    const x = rand() * res;
    const y = rand() * res;
    const w = (18 + rand() * 64) * (res / 512);
    const h = (14 + rand() * 48) * (res / 512);
    ctx.fillStyle = rand() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.07)';
    ctx.fillRect(x, y, w, h);
    hCtx.fillStyle = rand() > 0.5 ? '#9c9c9c' : '#808080';
    hCtx.fillRect(x, y, w, h);
  }

  // Concrete structural floor bands
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fillRect(0, res * 0.9, res, res * 0.1);
  ctx.fillRect(0, 0, res, res * 0.04);
  hCtx.fillStyle = '#b4b4b4';
  hCtx.fillRect(0, res * 0.9, res, res * 0.1);

  if (theme.litWindows) {
    const glowHex =
      theme.accentGlowColor !== null
        ? `#${theme.accentGlowColor.toString(16).padStart(6, '0')}`
        : '#ffd98e';
    const stepY = res / 4;
    const stepX = res / 4;
    for (let wy = stepY * 0.45; wy < res * 0.82; wy += stepY) {
      for (let wx = stepX * 0.24; wx < res * 0.88; wx += stepX) {
        const lit = rand() > 0.34;
        const ww = stepX * 0.48;
        const wh = stepY * 0.55;
        ctx.fillStyle = '#11161f';
        ctx.fillRect(wx - 3, wy - 3, ww + 6, wh + 6);
        ctx.fillStyle = lit ? glowHex : '#1b2434';
        ctx.globalAlpha = lit ? 0.9 : 1;
        ctx.fillRect(wx, wy, ww, wh);
        ctx.globalAlpha = 1;
        hCtx.fillStyle = '#404040';
        hCtx.fillRect(wx, wy, ww, wh);
      }
    }
  }

  const map = configureTexture(canvas, 2, 2, maxAniso, true);
  const { normalMap, roughnessMap } = buildNormalAndRoughnessFromHeight(
    hCanvas,
    2,
    2,
    maxAniso,
    1.9,
    0.82,
    0.26
  );
  return { map, normalMap, roughnessMap };
}

function createCrateMaps(theme: LocationTheme, res: number, maxAniso: number) {
  const [canvas, ctx] = makeCanvas(res);
  const [hCanvas, hCtx] = makeCanvas(res);
  const rand = seededRandom(theme.seed + 55);

  ctx.fillStyle = theme.crateColor;
  ctx.fillRect(0, 0, res, res);
  hCtx.fillStyle = '#909090';
  hCtx.fillRect(0, 0, res, res);

  const planks = 6;
  const ph = res / planks;
  for (let p = 0; p < planks; p++) {
    ctx.fillStyle = rand() > 0.5 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
    ctx.fillRect(0, p * ph + 2, res, ph - 4);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(0, p * ph, res, Math.max(2, res / 128));

    // Wood grain streaks
    for (let g = 0; g < 18; g++) {
      const gy = p * ph + rand() * ph;
      ctx.fillStyle = 'rgba(20,12,4,0.12)';
      ctx.fillRect(0, gy, res, 1.5);
      hCtx.fillStyle = '#7c7c7c';
      hCtx.fillRect(0, gy, res, 1.5);
    }
    hCtx.fillStyle = '#383838';
    hCtx.fillRect(0, p * ph, res, Math.max(3, res / 110));
  }

  // Raised outer wooden frame + diagonal brace
  const frameW = res * 0.08;
  ctx.strokeStyle = 'rgba(0,0,0,0.42)';
  ctx.lineWidth = frameW;
  ctx.strokeRect(frameW / 2, frameW / 2, res - frameW, res - frameW);
  hCtx.strokeStyle = '#c8c8c8';
  hCtx.lineWidth = frameW;
  hCtx.strokeRect(frameW / 2, frameW / 2, res - frameW, res - frameW);

  ctx.beginPath();
  ctx.moveTo(frameW, frameW);
  ctx.lineTo(res - frameW, res - frameW);
  ctx.stroke();
  hCtx.beginPath();
  hCtx.moveTo(frameW, frameW);
  hCtx.lineTo(res - frameW, res - frameW);
  hCtx.stroke();

  // Steel corner brackets
  ctx.fillStyle = '#252a30';
  const bLen = res * 0.14;
  const bThick = res * 0.045;
  for (const [cx, cy] of [
    [0, 0],
    [res - bLen, 0],
    [0, res - bThick],
    [res - bLen, res - bThick],
  ]) {
    ctx.fillRect(cx, cy, bLen, bThick);
  }
  for (const [cx, cy] of [
    [0, 0],
    [res - bThick, 0],
    [0, res - bLen],
    [res - bThick, res - bLen],
  ]) {
    ctx.fillRect(cx, cy, bThick, bLen);
  }

  const map = configureTexture(canvas, 1, 1, maxAniso, true);
  const { normalMap, roughnessMap } = buildNormalAndRoughnessFromHeight(
    hCanvas,
    1,
    1,
    maxAniso,
    2.6,
    0.78,
    0.22
  );
  return { map, normalMap, roughnessMap };
}

function createContainerMaps(baseColor: string, theme: LocationTheme, res: number, maxAniso: number) {
  const [canvas, ctx] = makeCanvas(res);
  const [hCanvas, hCtx] = makeCanvas(res);
  const rand = seededRandom(theme.seed + 71);

  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, res, res);
  hCtx.fillStyle = '#808080';
  hCtx.fillRect(0, 0, res, res);

  const step = Math.max(8, Math.round(res / 20));
  for (let x = 0; x < res; x += step) {
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(x, res * 0.05, step * 0.36, res * 0.9);
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(x + step * 0.36, res * 0.05, step * 0.22, res * 0.9);

    hCtx.fillStyle = '#404040';
    hCtx.fillRect(x, res * 0.05, step * 0.4, res * 0.9);
    hCtx.fillStyle = '#dadada';
    hCtx.fillRect(x + step * 0.4, res * 0.05, step * 0.4, res * 0.9);
  }

  // Rust / salt grime specks
  for (let i = 0; i < 45; i++) {
    ctx.fillStyle = 'rgba(92, 46, 24, 0.22)';
    ctx.fillRect(rand() * res, rand() * res, 4 + rand() * 14, 3 + rand() * 10);
  }

  ctx.fillStyle = 'rgba(0,0,0,0.36)';
  ctx.fillRect(0, 0, res, res * 0.05);
  ctx.fillRect(0, res * 0.95, res, res * 0.05);

  if (theme.accentGlowColor !== null && theme.nightMode) {
    ctx.fillStyle = `#${theme.accentGlowColor.toString(16).padStart(6, '0')}`;
    ctx.fillRect(0, res * 0.48, res, res * 0.025);
  }

  const map = configureTexture(canvas, 2, 1, maxAniso, true);
  const { normalMap, roughnessMap } = buildNormalAndRoughnessFromHeight(
    hCanvas,
    2,
    1,
    maxAniso,
    3.4,
    0.46,
    0.26
  );
  return { map, normalMap, roughnessMap };
}

function createMetalDeckMaps(theme: LocationTheme, res: number, maxAniso: number) {
  const [canvas, ctx] = makeCanvas(res);
  const [hCanvas, hCtx] = makeCanvas(res);

  ctx.fillStyle = theme.nightMode ? '#384252' : '#596473';
  ctx.fillRect(0, 0, res, res);
  hCtx.fillStyle = '#787878';
  hCtx.fillRect(0, 0, res, res);

  ctx.strokeStyle = 'rgba(15, 20, 28, 0.6)';
  ctx.lineWidth = Math.max(2, res / 80);
  ctx.strokeRect(2, 2, res - 4, res - 4);
  hCtx.strokeStyle = '#303030';
  hCtx.lineWidth = Math.max(3, res / 70);
  hCtx.strokeRect(2, 2, res - 4, res - 4);

  const step = res / 10;
  for (let y = step * 0.5; y < res; y += step) {
    for (let x = step * 0.5; x < res; x += step) {
      const rot = (Math.round(x / step) + Math.round(y / step)) % 2 === 0 ? Math.PI / 4 : -Math.PI / 4;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fillRect(-step * 0.22, -step * 0.08, step * 0.44, step * 0.16);
      ctx.restore();

      hCtx.save();
      hCtx.translate(x, y);
      hCtx.rotate(rot);
      hCtx.fillStyle = '#eaeaea';
      hCtx.fillRect(-step * 0.22, -step * 0.08, step * 0.44, step * 0.16);
      hCtx.restore();
    }
  }

  ctx.fillStyle = theme.accentGlowColor !== null ? '#38bdf8' : '#d99126';
  ctx.fillRect(0, 0, res, res * 0.035);
  ctx.fillRect(0, res * 0.965, res, res * 0.035);

  const map = configureTexture(canvas, 2, 2, maxAniso, true);
  const { normalMap, roughnessMap } = buildNormalAndRoughnessFromHeight(
    hCanvas,
    2,
    2,
    maxAniso,
    3.0,
    0.38,
    0.25
  );
  return { map, normalMap, roughnessMap };
}

function createGravelBedMaps(theme: LocationTheme, res: number, maxAniso: number) {
  const [canvas, ctx] = makeCanvas(res);
  const [hCanvas, hCtx] = makeCanvas(res);
  const rand = seededRandom(theme.seed + 89);

  ctx.fillStyle = theme.snowGround ? '#99a4b0' : '#706557';
  ctx.fillRect(0, 0, res, res);
  hCtx.fillStyle = '#555555';
  hCtx.fillRect(0, 0, res, res);

  const pebbles = Math.round(1400 * (res / 512));
  for (let i = 0; i < pebbles; i++) {
    const px = rand() * res;
    const py = rand() * res;
    const r = (1.6 + rand() * 4.2) * (res / 512);
    const shade = Math.floor(68 + rand() * 102);
    ctx.fillStyle = `rgb(${shade + 8}, ${shade + 2}, ${shade - 6})`;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();

    const hByte = Math.floor(110 + rand() * 140);
    hCtx.fillStyle = `rgb(${hByte},${hByte},${hByte})`;
    hCtx.beginPath();
    hCtx.arc(px, py, r, 0, Math.PI * 2);
    hCtx.fill();
  }

  const map = configureTexture(canvas, 3, 3, maxAniso, true);
  const { normalMap, roughnessMap } = buildNormalAndRoughnessFromHeight(
    hCanvas,
    3,
    3,
    maxAniso,
    3.2,
    0.94,
    0.1
  );
  return { map, normalMap, roughnessMap };
}

function createFoliageTexture(theme: LocationTheme, maxAniso: number): THREE.CanvasTexture {
  const res = 256;
  const [canvas, ctx] = makeCanvas(res);
  const rand = seededRandom(theme.seed + 411);
  ctx.clearRect(0, 0, res, res);

  const isSnow = Boolean(theme.snowGround);
  const colors = isSnow
    ? ['#35584a', '#48705e', '#d6e3ef']
    : ['#2c592f', '#3c733a', '#4e8a47'];

  // Organic layered leaf/pine needle cluster with crisp alpha mask
  for (let i = 0; i < 68; i++) {
    const ang = rand() * Math.PI * 2;
    const dist = Math.pow(rand(), 0.7) * (res * 0.37);
    const lx = res * 0.5 + Math.cos(ang) * dist;
    const ly = res * 0.52 + Math.sin(ang) * dist * 0.88;
    const rx = 12 + rand() * 18;
    const ry = 7 + rand() * 11;
    ctx.save();
    ctx.translate(lx, ly);
    ctx.rotate(ang + (rand() - 0.5) * 0.8);
    ctx.fillStyle = colors[Math.floor(rand() * colors.length)];
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  tex.needsUpdate = true;
  return tex;
}

function createLavaTexture(maxAniso: number): THREE.CanvasTexture {
  const res = 256;
  const [canvas, ctx] = makeCanvas(res);
  const rand = seededRandom(7771);
  ctx.fillStyle = '#220905';
  ctx.fillRect(0, 0, res, res);
  for (let i = 0; i < 32; i++) {
    ctx.strokeStyle = i % 2 === 0 ? '#ff6a1a' : '#ffbd42';
    ctx.lineWidth = 3 + rand() * 8;
    ctx.beginPath();
    let x = rand() * res;
    let y = rand() * res;
    ctx.moveTo(x, y);
    for (let s = 0; s < 5; s++) {
      x += (rand() - 0.5) * 80;
      y += (rand() - 0.5) * 80;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  return configureTexture(canvas, 4, 2, maxAniso, true);
}

function createSiteDecalMaterial(letter: 'A' | 'B', maxAniso: number): THREE.MeshBasicMaterial {
  const [canvas, ctx] = makeCanvas(256);
  ctx.clearRect(0, 0, 256, 256);

  const accent = letter === 'A' ? 'rgba(226, 74, 46, 0.9)' : 'rgba(228, 146, 40, 0.9)';
  ctx.strokeStyle = accent;
  ctx.lineWidth = 10;
  ctx.strokeRect(18, 18, 220, 220);

  ctx.fillStyle = accent;
  ctx.font = 'bold 142px "Chakra Petch", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, 128, 120);

  ctx.font = 'bold 24px "Chakra Petch", sans-serif';
  ctx.fillText(`SITE ${letter}`, 128, 212);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  tex.needsUpdate = true;

  return new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
}

function createContactShadowMaterial(): THREE.MeshBasicMaterial {
  const [canvas, ctx] = makeCanvas(128);
  const grad = ctx.createRadialGradient(64, 64, 6, 64, 64, 60);
  grad.addColorStop(0, 'rgba(8, 10, 14, 0.58)');
  grad.addColorStop(0.55, 'rgba(8, 10, 14, 0.24)');
  grad.addColorStop(1, 'rgba(8, 10, 14, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
}

/**
 * Generates procedural camouflage & ripstop tactical fabric texture for soldier uniforms & viewmodel sleeves.
 */
export function createUniformCamoTexture(styleId: UniformStyleId, res = 256): {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
} {
  const style = UNIFORM_STYLES[styleId];
  const [canvas, ctx] = makeCanvas(res);
  const [bCanvas, bCtx] = makeCanvas(res);
  const rand = seededRandom(styleId.charCodeAt(0) * 997 + styleId.length * 37);

  ctx.fillStyle = style.camoColors[0];
  ctx.fillRect(0, 0, res, res);

  // Organic camo patches
  for (let i = 0; i < 42; i++) {
    ctx.fillStyle = i % 2 === 0 ? style.camoColors[1] : style.camoColors[2];
    ctx.globalAlpha = 0.72;
    ctx.beginPath();
    const cx = rand() * res;
    const cy = rand() * res;
    ctx.ellipse(cx, cy, 12 + rand() * 28, 8 + rand() * 20, rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Ripstop tactical grid weave
  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, res, res);
  ctx.strokeStyle = 'rgba(0,0,0,0.09)';
  ctx.lineWidth = 1;
  bCtx.strokeStyle = '#a8a8a8';
  bCtx.lineWidth = 1;
  const step = 8;
  for (let i = 0; i < res; i += step) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, res);
    ctx.moveTo(0, i);
    ctx.lineTo(res, i);
    ctx.stroke();

    bCtx.beginPath();
    bCtx.moveTo(i, 0);
    bCtx.lineTo(i, res);
    bCtx.moveTo(0, i);
    bCtx.lineTo(res, i);
    bCtx.stroke();
  }

  return {
    map: configureTexture(canvas, 2, 2, 4, true),
    bumpMap: configureTexture(bCanvas, 2, 2, 4, false),
  };
}

/**
 * Generates procedural human skin tone texture with subtle micro-detail.
 */
export function createSkinTexture(seed = 101): THREE.CanvasTexture {
  const res = 128;
  const [canvas, ctx] = makeCanvas(res);
  const rand = seededRandom(seed);
  ctx.fillStyle = '#d3a281';
  ctx.fillRect(0, 0, res, res);
  for (let i = 0; i < 240; i++) {
    ctx.fillStyle = rand() > 0.5 ? 'rgba(255,220,200,0.08)' : 'rgba(130,75,55,0.07)';
    ctx.beginPath();
    ctx.arc(rand() * res, rand() * res, 1 + rand() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  return configureTexture(canvas, 1, 1, 2, true);
}

/**
 * Generates procedural brushed gunmetal normal/roughness detail for weapons.
 */
export function createGunmetalTexture(res = 256): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(res);
  const rand = seededRandom(4242);
  ctx.fillStyle = '#888888';
  ctx.fillRect(0, 0, res, res);
  for (let y = 0; y < res; y += 2) {
    const v = Math.floor(118 + rand() * 36);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(0, y, res, 1.5);
  }
  return configureTexture(canvas, 2, 2, 4, false);
}

export function createMaterialLibrary(
  renderer: THREE.WebGLRenderer,
  theme: LocationTheme,
  texRes = 512,
  groundRepeat = 36
): MaterialLibrary {
  const maxAniso = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
  const textures: THREE.Texture[] = [];
  const track = <T extends THREE.Texture>(t: T): T => {
    textures.push(t);
    return t;
  };

  const isUrbanPaved =
    theme.id === 'night_city' || theme.id === 'harbor_docks' || theme.id === 'neon_alley';
  const defaultGroundSurface: SurfaceType = isUrbanPaved ? 'concrete' : 'gravel';

  const gMaps = createGroundMaps(theme, texRes, groundRepeat, maxAniso);
  track(gMaps.map);
  track(gMaps.normalMap);
  track(gMaps.roughnessMap);

  const wMaps = createWallMaps(theme, texRes, maxAniso);
  track(wMaps.map);
  track(wMaps.normalMap);
  track(wMaps.roughnessMap);

  const bAMaps = createBuildingMaps(theme.buildingColorA, theme, 31, texRes, maxAniso);
  track(bAMaps.map);
  track(bAMaps.normalMap);
  track(bAMaps.roughnessMap);

  const bBMaps = createBuildingMaps(theme.buildingColorB, theme, 47, texRes, maxAniso);
  track(bBMaps.map);
  track(bBMaps.normalMap);
  track(bBMaps.roughnessMap);

  const crateMaps = createCrateMaps(theme, texRes, maxAniso);
  track(crateMaps.map);
  track(crateMaps.normalMap);
  track(crateMaps.roughnessMap);

  const contAMaps = createContainerMaps(theme.containerColorA, theme, texRes, maxAniso);
  track(contAMaps.map);
  track(contAMaps.normalMap);
  track(contAMaps.roughnessMap);

  const contBMaps = createContainerMaps(theme.containerColorB, theme, texRes, maxAniso);
  track(contBMaps.map);
  track(contBMaps.normalMap);
  track(contBMaps.roughnessMap);

  const deckMaps = createMetalDeckMaps(theme, texRes, maxAniso);
  track(deckMaps.map);
  track(deckMaps.normalMap);
  track(deckMaps.roughnessMap);

  const gravelMaps = createGravelBedMaps(theme, texRes, maxAniso);
  track(gravelMaps.map);
  track(gravelMaps.normalMap);
  track(gravelMaps.roughnessMap);

  const foliageTex = track(createFoliageTexture(theme, maxAniso));
  const lavaTex = track(createLavaTexture(maxAniso));

  const ground = new THREE.MeshStandardMaterial({
    map: gMaps.map,
    normalMap: gMaps.normalMap,
    normalScale: new THREE.Vector2(0.7, 0.7),
    roughnessMap: gMaps.roughnessMap,
    roughness: 1.0,
    metalness: isUrbanPaved ? 0.14 : 0.04,
  });
  ground.userData.surfaceType = defaultGroundSurface;

  const outerGround = new THREE.MeshStandardMaterial({
    color: theme.waterBorder ? 0x16466b : theme.groundAccent,
    roughness: theme.waterBorder ? 0.18 : 0.94,
    metalness: theme.waterBorder ? 0.45 : 0.02,
  });
  outerGround.userData.surfaceType = defaultGroundSurface;

  const wall = new THREE.MeshStandardMaterial({
    map: wMaps.map,
    normalMap: wMaps.normalMap,
    normalScale: new THREE.Vector2(0.8, 0.8),
    roughnessMap: wMaps.roughnessMap,
    roughness: 1.0,
    metalness: 0.05,
  });
  wall.userData.surfaceType = 'concrete';

  const buildingA = new THREE.MeshStandardMaterial({
    map: bAMaps.map,
    normalMap: bAMaps.normalMap,
    normalScale: new THREE.Vector2(0.7, 0.7),
    roughnessMap: bAMaps.roughnessMap,
    roughness: 1.0,
    metalness: 0.06,
  });
  buildingA.userData.surfaceType = 'concrete';

  const buildingB = new THREE.MeshStandardMaterial({
    map: bBMaps.map,
    normalMap: bBMaps.normalMap,
    normalScale: new THREE.Vector2(0.7, 0.7),
    roughnessMap: bBMaps.roughnessMap,
    roughness: 1.0,
    metalness: 0.06,
  });
  buildingB.userData.surfaceType = 'concrete';

  const concrete = new THREE.MeshStandardMaterial({
    color: theme.nightMode ? 0x4b5361 : 0x9ba2aa,
    normalMap: wMaps.normalMap,
    normalScale: new THREE.Vector2(0.35, 0.35),
    roughness: 0.82,
    metalness: 0.08,
  });
  concrete.userData.surfaceType = 'concrete';

  const concreteDark = new THREE.MeshStandardMaterial({
    color: theme.nightMode ? 0x2d333d : 0x626870,
    normalMap: wMaps.normalMap,
    normalScale: new THREE.Vector2(0.35, 0.35),
    roughness: 0.8,
    metalness: 0.1,
  });
  concreteDark.userData.surfaceType = 'concrete';

  const crate = new THREE.MeshStandardMaterial({
    map: crateMaps.map,
    normalMap: crateMaps.normalMap,
    normalScale: new THREE.Vector2(0.85, 0.85),
    roughnessMap: crateMaps.roughnessMap,
    roughness: 1.0,
    metalness: 0.08,
  });
  crate.userData.surfaceType = 'gravel';

  const containerA = new THREE.MeshStandardMaterial({
    map: contAMaps.map,
    normalMap: contAMaps.normalMap,
    normalScale: new THREE.Vector2(1.0, 1.0),
    roughnessMap: contAMaps.roughnessMap,
    roughness: 0.88,
    metalness: 0.62,
  });
  containerA.userData.surfaceType = 'metal';

  const containerB = new THREE.MeshStandardMaterial({
    map: contBMaps.map,
    normalMap: contBMaps.normalMap,
    normalScale: new THREE.Vector2(1.0, 1.0),
    roughnessMap: contBMaps.roughnessMap,
    roughness: 0.9,
    metalness: 0.56,
  });
  containerB.userData.surfaceType = 'metal';

  const roofMetal = new THREE.MeshStandardMaterial({
    color: theme.nightMode ? 0x2a313b : 0x5c646c,
    roughness: 0.42,
    metalness: 0.72,
  });
  roofMetal.userData.surfaceType = 'metal';

  const metalDeck = new THREE.MeshStandardMaterial({
    map: deckMaps.map,
    normalMap: deckMaps.normalMap,
    normalScale: new THREE.Vector2(0.95, 0.95),
    roughnessMap: deckMaps.roughnessMap,
    roughness: 0.85,
    metalness: 0.74,
  });
  metalDeck.userData.surfaceType = 'metal';

  const gravelBed = new THREE.MeshStandardMaterial({
    map: gravelMaps.map,
    normalMap: gravelMaps.normalMap,
    normalScale: new THREE.Vector2(0.9, 0.9),
    roughnessMap: gravelMaps.roughnessMap,
    roughness: 1.0,
    metalness: 0.02,
  });
  gravelBed.userData.surfaceType = 'gravel';

  const trimAccent = new THREE.MeshStandardMaterial({
    color: theme.accentGlowColor ?? 0x5c4128,
    emissive: theme.accentGlowColor ?? 0x000000,
    emissiveIntensity: theme.accentGlowColor !== null ? (theme.nightMode ? 1.25 : 0.45) : 0,
    roughness: 0.45,
    metalness: 0.25,
  });
  trimAccent.userData.surfaceType = 'metal';

  const cliffRock = new THREE.MeshStandardMaterial({
    color: theme.groundAccent,
    normalMap: gravelMaps.normalMap,
    normalScale: new THREE.Vector2(0.6, 0.6),
    roughness: 0.94,
    metalness: 0.02,
  });
  cliffRock.userData.surfaceType = 'gravel';

  const treeBark = new THREE.MeshStandardMaterial({
    color: 0x4b3828,
    normalMap: crateMaps.normalMap,
    roughness: 0.92,
    metalness: 0.02,
  });
  treeBark.userData.surfaceType = 'gravel';

  const foliage = new THREE.MeshStandardMaterial({
    map: foliageTex,
    alphaTest: 0.42,
    side: THREE.DoubleSide,
    roughness: 0.85,
    metalness: 0.02,
  });

  const fabricAwningA = new THREE.MeshStandardMaterial({
    color: theme.containerColorA,
    roughness: 0.9,
    metalness: 0.02,
    side: THREE.DoubleSide,
  });

  const fabricAwningB = new THREE.MeshStandardMaterial({
    color: theme.containerColorB,
    roughness: 0.9,
    metalness: 0.02,
    side: THREE.DoubleSide,
  });

  const lavaGlow = new THREE.MeshStandardMaterial({
    map: lavaTex,
    emissiveMap: lavaTex,
    emissive: new THREE.Color(0xff5a12),
    emissiveIntensity: 1.65,
    roughness: 0.6,
  });

  const siteADecal = createSiteDecalMaterial('A', maxAniso);
  const siteBDecal = createSiteDecalMaterial('B', maxAniso);
  const contactShadow = createContactShadowMaterial();

  const mats = [
    ground,
    outerGround,
    wall,
    buildingA,
    buildingB,
    concrete,
    concreteDark,
    crate,
    containerA,
    containerB,
    roofMetal,
    metalDeck,
    gravelBed,
    trimAccent,
    cliffRock,
    treeBark,
    foliage,
    fabricAwningA,
    fabricAwningB,
    lavaGlow,
    siteADecal,
    siteBDecal,
    contactShadow,
  ];

  return {
    ground,
    outerGround,
    wall,
    buildingA,
    buildingB,
    concrete,
    concreteDark,
    crate,
    containerA,
    containerB,
    roofMetal,
    metalDeck,
    gravelBed,
    trimAccent,
    cliffRock,
    treeBark,
    foliage,
    fabricAwningA,
    fabricAwningB,
    lavaGlow,
    siteADecal,
    siteBDecal,
    contactShadow,
    defaultGroundSurface,
    dispose: () => {
      mats.forEach((m) => {
        if ('map' in m && m.map) m.map.dispose();
        m.dispose();
      });
      textures.forEach((t) => t.dispose());
    },
  };
}
