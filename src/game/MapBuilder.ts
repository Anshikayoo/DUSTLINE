import * as THREE from 'three';
import {
  AABB,
  LocationTheme,
  MAP_SIZE_CONFIGS,
  MapCallout,
  MapSize,
  MinimapRect,
  RampZone,
  SurfaceType,
} from './types';
import { MaterialLibrary } from './ProceduralTextures';

/**
 * ============================================================================
 * SECTION: CS2-SCALE COMPETITIVE MAP BUILDER, INSTANCED PROPS & 72x72 NAVGRID
 * ============================================================================
 */

export interface SiteZone {
  id: 'A' | 'B';
  center: THREE.Vector3;
  halfW: number;
  halfD: number;
  yTop: number;
}

export interface MapData {
  group: THREE.Group;
  sunLight: THREE.DirectionalLight;
  colliders: AABB[];
  ramps: RampZone[];
  raycastMeshes: THREE.Object3D[];
  groundMeshes: THREE.Object3D[];
  defaultGroundSurface: SurfaceType;
  minimapRects: MinimapRect[];
  calloutZones: MapCallout[];
  mapHalfSize: number;
  ctSpawns: THREE.Vector3[];
  tSpawns: THREE.Vector3[];
  siteA: SiteZone;
  siteB: SiteZone;
  patrolWaypoints: THREE.Vector3[];
  coverSpots: THREE.Vector3[];
  navGrid: NavGrid;
  dispose: () => void;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Adaptive 72x72 2D Navigation Grid with pre-allocated typed arrays (zero GC).
 * Scales cleanly from 104m Compact up to 276m Large CS2-scale maps at 60 FPS.
 */
export class NavGrid {
  public readonly cols = 72;
  public readonly rows = 72;
  public readonly halfSize: number;
  public readonly cellSize: number;
  private blocked: Uint8Array;
  private gScore: Float32Array;
  private fScore: Float32Array;
  private parent: Int16Array;
  private closed: Uint8Array;
  private openList: Int16Array;

  constructor(colliders: AABB[], halfSize: number) {
    this.halfSize = halfSize;
    this.cellSize = (halfSize * 2) / this.cols;
    const total = this.cols * this.rows;
    this.blocked = new Uint8Array(total);
    this.gScore = new Float32Array(total);
    this.fScore = new Float32Array(total);
    this.parent = new Int16Array(total);
    this.closed = new Uint8Array(total);
    this.openList = new Int16Array(total);

    const pad = 0.55;
    for (let r = 0; r < this.rows; r++) {
      const wz = -this.halfSize + (r + 0.5) * this.cellSize;
      for (let c = 0; c < this.cols; c++) {
        const wx = -this.halfSize + (c + 0.5) * this.cellSize;
        for (let i = 0; i < colliders.length; i++) {
          const b = colliders[i];
          if (b.maxY <= 0.65 || b.minY >= 1.95) continue;
          if (
            wx >= b.minX - pad &&
            wx <= b.maxX + pad &&
            wz >= b.minZ - pad &&
            wz <= b.maxZ + pad
          ) {
            this.blocked[r * this.cols + c] = 1;
            break;
          }
        }
      }
    }
  }

  private worldToCell(x: number, z: number): [number, number] {
    const c = Math.max(0, Math.min(this.cols - 1, Math.floor((x + this.halfSize) / this.cellSize)));
    const r = Math.max(0, Math.min(this.rows - 1, Math.floor((z + this.halfSize) / this.cellSize)));
    return [c, r];
  }

  private cellToWorld(c: number, r: number): THREE.Vector3 {
    return new THREE.Vector3(
      -this.halfSize + (c + 0.5) * this.cellSize,
      0,
      -this.halfSize + (r + 0.5) * this.cellSize
    );
  }

  private findNearestOpenCell(c: number, r: number): number {
    const idx = r * this.cols + c;
    if (!this.blocked[idx]) return idx;
    for (let rad = 1; rad <= 5; rad++) {
      for (let dr = -rad; dr <= rad; dr++) {
        for (let dc = -rad; dc <= rad; dc++) {
          const nc = c + dc;
          const nr = r + dr;
          if (nc >= 0 && nc < this.cols && nr >= 0 && nr < this.rows) {
            const ni = nr * this.cols + nc;
            if (!this.blocked[ni]) return ni;
          }
        }
      }
    }
    return idx;
  }

  public findPath(start: THREE.Vector3, goal: THREE.Vector3): THREE.Vector3[] {
    const [sc, sr] = this.worldToCell(start.x, start.z);
    const [gc, gr] = this.worldToCell(goal.x, goal.z);
    const startIdx = this.findNearestOpenCell(sc, sr);
    const goalIdx = this.findNearestOpenCell(gc, gr);

    if (startIdx === goalIdx) return [goal.clone()];

    this.gScore.fill(1e9);
    this.fScore.fill(1e9);
    this.parent.fill(-1);
    this.closed.fill(0);

    this.gScore[startIdx] = 0;
    const sc0 = startIdx % this.cols;
    const sr0 = (startIdx / this.cols) | 0;
    const gc0 = goalIdx % this.cols;
    const gr0 = (goalIdx / this.cols) | 0;
    this.fScore[startIdx] = Math.hypot(gc0 - sc0, gr0 - sr0);

    let openCount = 1;
    this.openList[0] = startIdx;
    let iterations = 0;
    let found = false;

    const dirs = [
      [1, 0, 1],
      [-1, 0, 1],
      [0, 1, 1],
      [0, -1, 1],
      [1, 1, 1.414],
      [-1, 1, 1.414],
      [1, -1, 1.414],
      [-1, -1, 1.414],
    ];

    while (openCount > 0 && iterations < 2200) {
      iterations++;
      let bestPos = 0;
      let bestF = this.fScore[this.openList[0]];
      for (let i = 1; i < openCount; i++) {
        const f = this.fScore[this.openList[i]];
        if (f < bestF) {
          bestF = f;
          bestPos = i;
        }
      }

      const curr = this.openList[bestPos];
      this.openList[bestPos] = this.openList[--openCount];

      if (curr === goalIdx) {
        found = true;
        break;
      }

      this.closed[curr] = 1;
      const cc = curr % this.cols;
      const cr = (curr / this.cols) | 0;

      for (let d = 0; d < 8; d++) {
        const dc = dirs[d][0];
        const dr = dirs[d][1];
        const cost = dirs[d][2];
        const nc = cc + dc;
        const nr = cr + dr;
        if (nc < 0 || nc >= this.cols || nr < 0 || nr >= this.rows) continue;
        const nIdx = nr * this.cols + nc;
        if (this.closed[nIdx] || this.blocked[nIdx]) continue;
        if (dc !== 0 && dr !== 0) {
          if (this.blocked[cr * this.cols + nc] || this.blocked[nr * this.cols + cc]) continue;
        }

        const tentativeG = this.gScore[curr] + cost;
        if (tentativeG < this.gScore[nIdx]) {
          this.parent[nIdx] = curr;
          this.gScore[nIdx] = tentativeG;
          this.fScore[nIdx] = tentativeG + Math.hypot(gc0 - nc, gr0 - nr);

          let inOpen = false;
          for (let k = 0; k < openCount; k++) {
            if (this.openList[k] === nIdx) {
              inOpen = true;
              break;
            }
          }
          if (!inOpen && openCount < this.openList.length) {
            this.openList[openCount++] = nIdx;
          }
        }
      }
    }

    if (!found) {
      return [goal.clone()];
    }

    const raw: number[] = [];
    let cur = goalIdx;
    while (cur !== -1 && cur !== startIdx) {
      raw.push(cur);
      cur = this.parent[cur];
    }
    raw.reverse();

    const result: THREE.Vector3[] = [];
    for (let i = 0; i < raw.length; i++) {
      if (i === raw.length - 1 || i % 2 === 1) {
        const idx = raw[i];
        result.push(this.cellToWorld(idx % this.cols, (idx / this.cols) | 0));
      }
    }
    if (result.length > 0) {
      result[result.length - 1].copy(goal);
    } else {
      result.push(goal.clone());
    }
    return result;
  }
}

/** Finds nearest named callout for any world coordinate (used by Minimap, Full Map & Bot Radio). */
export function resolveCalloutName(x: number, z: number, callouts: MapCallout[]): string {
  if (callouts.length === 0) return 'Combat Zone';
  let best = callouts[0].name;
  let bestSq = Infinity;
  for (let i = 0; i < callouts.length; i++) {
    const c = callouts[i];
    const dx = x - c.x;
    const dz = z - c.z;
    const dSq = dx * dx + dz * dz;
    if (dSq < bestSq) {
      bestSq = dSq;
      best = c.name;
    }
  }
  return best;
}

function buildSpawnGrid(centerX: number, centerZ: number, zDir: number): THREE.Vector3[] {
  const spawns: THREE.Vector3[] = [];
  const cols = 5;
  const rows = 5;
  const spacingX = 2.75;
  const spacingZ = 2.4;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = centerX + (c - (cols - 1) / 2) * spacingX;
      const z = centerZ + r * zDir * spacingZ;
      spawns.push(new THREE.Vector3(x, 0, z));
    }
  }
  return spawns;
}

export function buildLocationMap(
  scene: THREE.Scene,
  theme: LocationTheme,
  mapSize: MapSize,
  materials: MaterialLibrary,
  castShadows: boolean,
  shadowMapSize: number
): MapData {
  const rand = mulberry32(theme.seed + (mapSize === 'large' ? 19 : mapSize === 'standard' ? 7 : 0));
  const H = MAP_SIZE_CONFIGS[mapSize].halfSize; // 52 / 88 / 138
  const S = H / 48; // proportional multiplier (1.08 / 1.83 / 2.875)

  const group = new THREE.Group();
  const colliders: AABB[] = [];
  const ramps: RampZone[] = [];
  const raycastMeshes: THREE.Object3D[] = [];
  const groundMeshes: THREE.Object3D[] = [];
  const minimapRects: MinimapRect[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  const extraMaterials: THREE.Material[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    extraMaterials.push(m);
    return m;
  };

  // --- Sky Dome, Sun/Moon Disc, Clouds & Atmosphere Fog ---
  const fogFarScaled = Math.max(theme.fogFar, H * 2.45);
  const fogNearScaled = Math.max(theme.fogNear, H * 0.62);
  scene.background = new THREE.Color(theme.fogColor);
  scene.fog = new THREE.Fog(theme.fogColor, fogNearScaled, fogFarScaled);

  const skyGeo = trackGeo(new THREE.SphereGeometry(H * 3.8, 28, 18));
  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = 16;
  skyCanvas.height = 128;
  const sctx = skyCanvas.getContext('2d')!;
  const skyGrad = sctx.createLinearGradient(0, 0, 0, 128);
  skyGrad.addColorStop(0.0, theme.skyTop);
  skyGrad.addColorStop(0.38, theme.skyMid);
  skyGrad.addColorStop(0.54, theme.skyHorizon);
  skyGrad.addColorStop(1.0, theme.groundAccent);
  sctx.fillStyle = skyGrad;
  sctx.fillRect(0, 0, 16, 128);
  const skyTex = new THREE.CanvasTexture(skyCanvas);
  skyTex.colorSpace = THREE.SRGBColorSpace;
  const skyMat = trackMat(
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false })
  );
  group.add(new THREE.Mesh(skyGeo, skyMat));

  // Sun / Moon Disc in sky
  const sunDisc = new THREE.Mesh(
    trackGeo(new THREE.CircleGeometry(H * 0.14, 24)),
    trackMat(
      new THREE.MeshBasicMaterial({
        color: theme.nightMode ? 0xdbeafe : theme.sunColor,
        fog: false,
      })
    )
  );
  sunDisc.position.set(H * 1.4, H * 1.65, -H * 1.3);
  sunDisc.lookAt(0, 0, 0);
  group.add(sunDisc);

  // Soft stylized sky clouds (InstancedMesh)
  const cloudCount = 18;
  const cloudGeo = trackGeo(new THREE.SphereGeometry(1, 10, 8));
  const cloudMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: theme.nightMode ? 0x263248 : 0xf4f7fa,
      transparent: true,
      opacity: theme.nightMode ? 0.25 : 0.45,
      fog: false,
    })
  );
  const cloudInst = new THREE.InstancedMesh(cloudGeo, cloudMat, cloudCount);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < cloudCount; i++) {
    const ang = (i / cloudCount) * Math.PI * 2 + rand() * 0.3;
    const dist = H * (1.3 + rand() * 1.1);
    dummy.position.set(Math.cos(ang) * dist, H * (0.65 + rand() * 0.45), Math.sin(ang) * dist);
    dummy.scale.set(14 + rand() * 18, 3.2 + rand() * 2.5, 9 + rand() * 12);
    dummy.rotation.set(0, rand() * Math.PI, 0);
    dummy.updateMatrix();
    cloudInst.setMatrixAt(i, dummy.matrix);
  }
  cloudInst.instanceMatrix.needsUpdate = true;
  cloudInst.computeBoundingSphere();
  group.add(cloudInst);

  // --- Lighting Rig ---
  const hemiLight = new THREE.HemisphereLight(theme.hemiSky, theme.hemiGround, theme.hemiIntensity);
  hemiLight.position.set(0, 80, 0);
  group.add(hemiLight);

  const sunLight = new THREE.DirectionalLight(theme.sunColor, theme.sunIntensity);
  sunLight.position.set(55, 88, 42);
  sunLight.target.position.set(0, 0, 0);
  group.add(sunLight.target);
  if (castShadows) {
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = shadowMapSize;
    sunLight.shadow.mapSize.height = shadowMapSize;
    sunLight.shadow.camera.near = 10;
    sunLight.shadow.camera.far = 220;
    const d = 68;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    sunLight.shadow.bias = -0.0005;
    sunLight.shadow.normalBias = 0.035;
  }
  group.add(sunLight);

  const rimFill = new THREE.DirectionalLight(theme.hemiSky, 0.48);
  rimFill.position.set(-55, 36, -42);
  group.add(rimFill);

  // --- Ground Planes ---
  const outerPlane = new THREE.Mesh(
    trackGeo(new THREE.PlaneGeometry(H * 8, H * 8)),
    materials.outerGround
  );
  outerPlane.rotation.x = -Math.PI / 2;
  outerPlane.position.y = -0.08;
  group.add(outerPlane);

  const arenaFloor = new THREE.Mesh(
    trackGeo(new THREE.PlaneGeometry(H * 2 + 8, H * 2 + 8)),
    materials.ground
  );
  arenaFloor.rotation.x = -Math.PI / 2;
  arenaFloor.position.y = 0;
  arenaFloor.receiveShadow = castShadows;
  group.add(arenaFloor);
  raycastMeshes.push(arenaFloor);
  groundMeshes.push(arenaFloor);

  const addSolidBox = (
    x: number,
    yBottom: number,
    z: number,
    w: number,
    h: number,
    d: number,
    mat: THREE.Material,
    tag: AABB['tag'] = 'wall',
    minimapKind?: MinimapRect['kind'],
    penetrable = false
  ): THREE.Mesh => {
    const mesh = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(w, h, d)), mat);
    mesh.position.set(x, yBottom + h / 2, z);
    mesh.castShadow = castShadows;
    mesh.receiveShadow = castShadows;
    const thickness = Math.min(w, d);
    mesh.userData.penetrable = penetrable;
    mesh.userData.thickness = thickness;
    group.add(mesh);
    raycastMeshes.push(mesh);
    if (tag !== 'wall') {
      groundMeshes.push(mesh);
    }

    colliders.push({
      minX: x - w / 2,
      maxX: x + w / 2,
      minY: yBottom,
      maxY: yBottom + h,
      minZ: z - d / 2,
      maxZ: z + d / 2,
      tag,
      penetrable,
      thickness,
    });

    if (minimapKind) minimapRects.push({ x, z, w, d, kind: minimapKind });
    return mesh;
  };

  /** Builds a visual + collision walkable sloped ramp connecting ground/lower deck to upper deck. */
  const addWalkableRamp = (
    xCenter: number,
    zCenter: number,
    w: number,
    d: number,
    yStart: number,
    yEnd: number,
    axis: 'x' | 'z',
    mat: THREE.Material
  ) => {
    const len = axis === 'x' ? w : d;
    const dy = yEnd - yStart;
    const slopeLen = Math.hypot(len, dy);
    const angle = Math.atan2(dy, len);
    const mesh = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(axis === 'x' ? slopeLen : w, 0.22, axis === 'z' ? slopeLen : d)),
      mat
    );
    mesh.position.set(xCenter, (yStart + yEnd) * 0.5 - 0.1, zCenter);
    if (axis === 'x') mesh.rotation.z = angle;
    else mesh.rotation.x = -angle;
    mesh.castShadow = castShadows;
    mesh.receiveShadow = castShadows;
    group.add(mesh);
    raycastMeshes.push(mesh);
    groundMeshes.push(mesh);

    ramps.push({
      minX: xCenter - w / 2,
      maxX: xCenter + w / 2,
      minZ: zCenter - d / 2,
      maxZ: zCenter + d / 2,
      yStart,
      yEnd,
      axis,
    });
    minimapRects.push({ x: xCenter, z: zCenter, w, d, kind: 'platform' });
  };

  /** Builds a detailed multi-part building with roof cornice, HVAC unit & optional balcony/windows. */
  const addCompositeBuilding = (
    x: number,
    z: number,
    w: number,
    h: number,
    d: number,
    mat: THREE.Material,
    withWindowPassage = false
  ) => {
    if (withWindowPassage && w >= 7 && d >= 7) {
      // Hollow-front shoot-through window room (4 corner/side pillars + sill + lintel + roof)
      const wallT = 1.1;
      const winSillH = 1.1;
      const winTopY = 2.9;
      // Back wall
      addSolidBox(x, 0, z - d / 2 + wallT / 2, w, h, wallT, mat, 'building', 'building');
      // Left & Right side walls with doorway openings
      addSolidBox(x - w / 2 + wallT / 2, 0, z - d * 0.22, wallT, h, d * 0.55, mat, 'building', 'building');
      addSolidBox(x + w / 2 - wallT / 2, 0, z - d * 0.22, wallT, h, d * 0.55, mat, 'building', 'building');
      // Front wall with open shoot-through window
      addSolidBox(x, 0, z + d / 2 - wallT / 2, w, winSillH, wallT, mat, 'building', 'building', true);
      addSolidBox(x, winTopY, z + d / 2 - wallT / 2, w, h - winTopY, wallT, mat, 'building');
      addSolidBox(x - w * 0.34, winSillH, z + d / 2 - wallT / 2, w * 0.32, winTopY - winSillH, wallT, mat, 'building');
      addSolidBox(x + w * 0.34, winSillH, z + d / 2 - wallT / 2, w * 0.32, winTopY - winSillH, wallT, mat, 'building');
      // Elevated floor slab inside window room
      addSolidBox(x, 0, z, w - wallT * 1.8, 0.22, d - wallT * 1.8, materials.concreteDark, 'platform');
    } else {
      addSolidBox(x, 0, z, w, h, d, mat, 'building', 'building');
    }

    const cornice = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(w + 0.55, 0.34, d + 0.55)),
      materials.concrete
    );
    cornice.position.set(x, h + 0.17, z);
    group.add(cornice);

    const roofUnit = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(Math.min(3.2, w * 0.32), 1.05, Math.min(2.6, d * 0.32))),
      materials.roofMetal
    );
    roofUnit.position.set(x - w * 0.12, h + 0.85, z + d * 0.08);
    group.add(roofUnit);

    if (theme.accentGlowColor !== null) {
      const strip = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(w + 0.14, 0.22, d + 0.14)),
        materials.trimAccent
      );
      strip.position.set(x, h - 0.35, z);
      group.add(strip);
    }
  };

  const addCrate = (x: number, yBottom: number, z: number, size = 1.8) => {
    addSolidBox(x, yBottom, z, size, size, size, materials.crate, 'crate', 'crate', true);
  };

  const addContainer = (x: number, z: number, w: number, d: number, mat: THREE.Material) => {
    addSolidBox(x, 0, z, w, 3.0, d, mat, 'container', 'container', false);
  };

  const addBarrier = (x: number, z: number, w: number, d: number) => {
    addSolidBox(x, 0, z, w, 1.15, d, materials.concrete, 'barrier', 'wall', true);
  };

  // --- Perimeter Walls ---
  const wallThick = 2.0;
  const wallH = 6.8;
  addSolidBox(0, 0, -H, H * 2 + wallThick, wallH, wallThick, materials.wall, 'wall', 'wall');
  addSolidBox(0, 0, H, H * 2 + wallThick, wallH, wallThick, materials.wall, 'wall', 'wall');
  addSolidBox(-H, 0, 0, wallThick, wallH, H * 2 + wallThick, materials.wall, 'wall', 'wall');
  addSolidBox(H, 0, 0, wallThick, wallH, H * 2 + wallThick, materials.wall, 'wall', 'wall');

  // --- Distant Skyline / Mountain Ring outside playable compound ---
  for (let i = 0; i < 16; i++) {
    const angle = (i / 16) * Math.PI * 2 + rand() * 0.2;
    const dist = H * 1.48 + rand() * (H * 0.55);
    const bw = 24 + rand() * 34;
    const bh = 22 + rand() * 44;
    const bd = 22 + rand() * 32;
    const mesh = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(bw, bh, bd)),
      theme.nightMode ? materials.buildingB : materials.cliffRock
    );
    mesh.position.set(Math.cos(angle) * dist, bh / 2 - 1, Math.sin(angle) * dist);
    group.add(mesh);
  }

  // --- Bomb Sites A (East) & B (West) ---
  const siteX = H * 0.68;
  const siteACenter = new THREE.Vector3(siteX, 0.55, H * 0.08 + Math.round((rand() - 0.5) * 6));
  const siteBCenter = new THREE.Vector3(-siteX, 0.55, -H * 0.08 + Math.round((rand() - 0.5) * 6));

  const siteW = Math.max(12, 11 * Math.min(1.45, S * 0.82));
  addSolidBox(siteACenter.x, 0, siteACenter.z, siteW, 0.52, siteW, materials.concrete, 'platform');
  minimapRects.push({ x: siteACenter.x, z: siteACenter.z, w: siteW, d: siteW, kind: 'siteA' });
  const decalA = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(6.2, 6.2)), materials.siteADecal);
  decalA.rotation.x = -Math.PI / 2;
  decalA.position.set(siteACenter.x, 0.54, siteACenter.z);
  group.add(decalA);

  addSolidBox(siteBCenter.x, 0, siteBCenter.z, siteW, 0.52, siteW, materials.concreteDark, 'platform');
  minimapRects.push({ x: siteBCenter.x, z: siteBCenter.z, w: siteW, d: siteW, kind: 'siteB' });
  const decalB = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(6.2, 6.2)), materials.siteBDecal);
  decalB.rotation.x = -Math.PI / 2;
  decalB.position.set(siteBCenter.x, 0.54, siteBCenter.z);
  group.add(decalB);

  // Smooth metal step-ramps onto Sites A & B
  addWalkableRamp(siteACenter.x - siteW / 2 - 2.0, siteACenter.z, 4.0, 5.2, 0, 0.52, 'x', materials.metalDeck);
  addWalkableRamp(siteBCenter.x + siteW / 2 + 2.0, siteBCenter.z, 4.0, 5.2, 0, 0.52, 'x', materials.metalDeck);

  // --- Major Competitive Architecture (3 approaches per site + Mid + Elevated Catwalk) ---
  // Buildings defining Mid, A Long, A Short, B Tunnels, and Market Flank
  const majorBuildings: [number, number, number, number, number, boolean][] = [
    // East Mid / A-Long divider (with shoot-through sniper window overlook)
    [H * 0.34, -H * 0.28 + (rand() - 0.5) * 4, 11 * S * 0.65, 7.6 + rand() * 2.5, 14 * S * 0.65, true],
    // West Mid / B-Tunnels wall house
    [-H * 0.34, H * 0.28 + (rand() - 0.5) * 4, 11 * S * 0.65, 7.6 + rand() * 2.5, 14 * S * 0.65, true],
    // North-West B Apartments / Tunnels roofed structure
    [-H * 0.52, -H * 0.48, 13 * S * 0.65, 6.8 + rand() * 2, 11 * S * 0.65, false],
    // South-East CT-A Connector Building
    [H * 0.48, H * 0.48, 13 * S * 0.65, 6.8 + rand() * 2, 11 * S * 0.65, false],
    // Outer East A-Long Corner Building (frames 120m+ A Long sniper corridor)
    [H * 0.85, -H * 0.46 + (rand() - 0.5) * 5, 8.5 * S * 0.62, 9.0 + rand() * 3, 12 * S * 0.62, false],
    // Outer West B-Flank Tower
    [-H * 0.85, H * 0.46 + (rand() - 0.5) * 5, 8.5 * S * 0.62, 9.0 + rand() * 3, 12 * S * 0.62, false],
  ];

  majorBuildings.forEach(([bx, bz, bw, bh, bd, win], idx) => {
    addCompositeBuilding(bx, bz, bw, bh, bd, idx % 2 === 0 ? materials.buildingA : materials.buildingB, win);
  });

  // --- Elevated A Short / Catwalk (walkable up ramp from Mid, overlooks Site A!) ---
  const catY = 2.15;
  const catX = H * 0.24;
  const catZ = -H * 0.04;
  addSolidBox(catX, 0, catZ, 16 * S * 0.58, catY, 4.4, materials.metalDeck, 'platform');
  // Ramp ascending from Mid Courtyard up onto Catwalk
  addWalkableRamp(catX - 8 * S * 0.58 - 4.2, catZ, 8.4, 4.4, 0, catY, 'x', materials.metalDeck);
  // Ramp descending from Catwalk down toward A Short / Site A
  addWalkableRamp(catX + 8 * S * 0.58 + 3.8, catZ, 7.6, 4.4, catY, 0, 'x', materials.metalDeck);

  // --- Mid Courtyard Doors & Tactical Sniper Angle ---
  const midZ = (rand() - 0.5) * 4.5;
  addSolidBox(-H * 0.14, 0, midZ, H * 0.12, 4.2, 1.3, materials.wall, 'wall', 'wall');
  addSolidBox(H * 0.14, 0, midZ, H * 0.12, 4.2, 1.3, materials.wall, 'wall', 'wall');

  // --- Distinct Surface Pads (Metal catwalks, Gravel beds, Concrete plazas) ---
  addSolidBox(0, 0, midZ, 5.4, 0.08, 12, materials.metalDeck, 'platform');
  if (materials.defaultGroundSurface === 'concrete') {
    addSolidBox(H * 0.5, 0, -H * 0.06, 9, 0.05, 11, materials.gravelBed, 'platform');
    addSolidBox(-H * 0.5, 0, H * 0.06, 9, 0.05, 11, materials.gravelBed, 'platform');
    addSolidBox(0, 0, H * 0.44, 12, 0.05, 7, materials.gravelBed, 'platform');
  } else {
    addSolidBox(0, 0, H * 0.44, 12, 0.06, 7, materials.concrete, 'platform');
    addSolidBox(0, 0, -H * 0.44, 12, 0.06, 7, materials.concreteDark, 'platform');
  }

  // --- Volcano Magma Fissure River / Bazaar Fabric Awnings ---
  if (theme.id === 'volcano_outpost') {
    const lavaRiver = new THREE.Mesh(
      trackGeo(new THREE.PlaneGeometry(5.5, H * 1.95)),
      materials.lavaGlow
    );
    lavaRiver.rotation.x = -Math.PI / 2;
    lavaRiver.position.set(-H * 0.14, 0.02, 0);
    group.add(lavaRiver);
  } else if (theme.id === 'cairo_bazaar') {
    const awningPos: [number, number][] = [
      [-H * 0.36, -H * 0.15],
      [H * 0.36, H * 0.18],
      [-H * 0.18, H * 0.35],
      [H * 0.22, -H * 0.42],
    ];
    awningPos.forEach(([ax, az], idx) => {
      const awning = new THREE.Mesh(
        trackGeo(new THREE.PlaneGeometry(7.5, 4.2)),
        idx % 2 === 0 ? materials.fabricAwningA : materials.fabricAwningB
      );
      awning.position.set(ax, 3.6, az);
      awning.rotation.x = -Math.PI / 2 + 0.18;
      group.add(awning);
    });
  }

  // --- Site A & Site B Tactical Cover ---
  addContainer(siteACenter.x + siteW * 0.58, siteACenter.z + 3.8, 3.0, 6.8, materials.containerA);
  addCrate(siteACenter.x - 2.9, 0.52, siteACenter.z - 2.8, 1.75);
  addCrate(siteACenter.x - 2.9, 2.27, siteACenter.z - 2.8, 1.5);
  addBarrier(siteACenter.x - 2.4, siteACenter.z + 4.8, 4.6, 0.9);

  addContainer(siteBCenter.x - siteW * 0.58, siteBCenter.z - 3.8, 3.0, 6.8, materials.containerB);
  addCrate(siteBCenter.x + 2.9, 0.52, siteBCenter.z + 2.8, 1.75);
  addCrate(siteBCenter.x + 2.9, 2.27, siteBCenter.z + 2.8, 1.5);
  addBarrier(siteBCenter.x + 2.4, siteBCenter.z - 4.8, 4.6, 0.9);

  // --- Tactical Lane Cover Crates, Containers & Barriers across Lanes ---
  const laneCoverCandidates: [number, number, 'crate' | 'barrier' | 'container'][] = [
    [-H * 0.08, H * 0.22, 'crate'],
    [H * 0.09, H * 0.16, 'crate'],
    [-H * 0.10, -H * 0.26, 'crate'],
    [H * 0.10, -H * 0.30, 'barrier'],
    [0, H * 0.34, 'barrier'],
    [0, -H * 0.34, 'barrier'],
    [H * 0.62, -H * 0.25, 'crate'],
    [H * 0.72, -H * 0.38, 'barrier'],
    [H * 0.75, -H * 0.15, 'container'],
    [-H * 0.62, H * 0.25, 'crate'],
    [-H * 0.72, H * 0.38, 'barrier'],
    [-H * 0.75, H * 0.15, 'container'],
    [-H * 0.28, H * 0.56, 'barrier'],
    [H * 0.28, -H * 0.56, 'barrier'],
    [H * 0.54, H * 0.26, 'crate'],
    [-H * 0.54, -H * 0.26, 'crate'],
  ];

  const coverSpots: THREE.Vector3[] = [];
  for (const [cx, cz, kind] of laneCoverCandidates) {
    if (rand() < 0.12) continue;
    if (kind === 'crate') {
      addCrate(cx, 0, cz, 1.85);
      if (rand() > 0.5) addCrate(cx, 1.85, cz, 1.5);
    } else if (kind === 'container') {
      addContainer(cx, cz, 3.0, 6.5, rand() > 0.5 ? materials.containerA : materials.containerB);
    } else {
      addBarrier(cx, cz, 4.4, 0.9);
    }
    coverSpots.push(new THREE.Vector3(cx, 0, cz + (cz > 0 ? -2.4 : 2.4)));
  }

  coverSpots.push(
    new THREE.Vector3(siteACenter.x - 2.6, 0, siteACenter.z + 2.8),
    new THREE.Vector3(siteACenter.x + 2.6, 0, siteACenter.z - 2.8),
    new THREE.Vector3(siteBCenter.x + 2.6, 0, siteBCenter.z - 2.8),
    new THREE.Vector3(siteBCenter.x - 2.6, 0, siteBCenter.z + 2.8)
  );

  // --- Instanced Environmental Props (Barrels + Organic Trees/Foliage Clusters) ---
  const barrelPositions: [number, number][] = [
    [H * 0.58, -H * 0.14],
    [H * 0.60, -H * 0.16],
    [-H * 0.58, H * 0.14],
    [-H * 0.60, H * 0.16],
    [H * 0.18, H * 0.42],
    [-H * 0.18, -H * 0.42],
    [H * 0.42, -H * 0.62],
    [-H * 0.42, H * 0.62],
  ];
  const barrelGeo = trackGeo(new THREE.CylinderGeometry(0.46, 0.46, 1.18, 12));
  const barrelInst = new THREE.InstancedMesh(barrelGeo, materials.containerB, barrelPositions.length);
  barrelInst.castShadow = castShadows;
  barrelInst.receiveShadow = castShadows;
  barrelPositions.forEach(([bx, bz], idx) => {
    dummy.position.set(bx, 0.59, bz);
    dummy.scale.set(1, 1, 1);
    dummy.rotation.set(0, rand() * Math.PI, 0);
    dummy.updateMatrix();
    barrelInst.setMatrixAt(idx, dummy.matrix);
    colliders.push({
      minX: bx - 0.48,
      maxX: bx + 0.48,
      minY: 0,
      maxY: 1.18,
      minZ: bz - 0.48,
      maxZ: bz + 0.48,
      tag: 'crate',
    });
    raycastMeshes.push(barrelInst);
  });
  barrelInst.instanceMatrix.needsUpdate = true;
  barrelInst.computeBoundingSphere();
  group.add(barrelInst);

  // Organic crossing-plane alpha-cutout trees for Jungle, Snow Village, Arctic, Dust/Cairo
  if (
    theme.id === 'jungle_ruins' ||
    theme.id === 'snow_village' ||
    theme.id === 'dust_canyon' ||
    theme.id === 'cairo_bazaar'
  ) {
    const treeCoords: [number, number][] = [
      [-H * 0.88, -H * 0.82],
      [H * 0.88, -H * 0.82],
      [-H * 0.88, H * 0.82],
      [H * 0.88, H * 0.82],
      [-H * 0.45, -H * 0.86],
      [H * 0.45, H * 0.86],
      [H * 0.89, 0],
      [-H * 0.89, 0],
    ];
    const trunkGeo = trackGeo(new THREE.CylinderGeometry(0.24, 0.42, 5.2, 8));
    const trunkInst = new THREE.InstancedMesh(trunkGeo, materials.treeBark, treeCoords.length);
    const leafGeo = trackGeo(new THREE.PlaneGeometry(4.8, 4.8));
    const leafInst = new THREE.InstancedMesh(leafGeo, materials.foliage, treeCoords.length * 3);
    trunkInst.castShadow = castShadows;
    leafInst.castShadow = castShadows;

    treeCoords.forEach(([tx, tz], i) => {
      const sc = 0.85 + rand() * 0.45;
      dummy.position.set(tx, 2.6 * sc, tz);
      dummy.rotation.set(0, rand() * Math.PI, 0);
      dummy.scale.set(sc, sc, sc);
      dummy.updateMatrix();
      trunkInst.setMatrixAt(i, dummy.matrix);

      // 3 crossing foliage planes per tree canopy
      for (let p = 0; p < 3; p++) {
        dummy.position.set(tx, 5.2 * sc, tz);
        dummy.rotation.set(0, (p * Math.PI) / 3, 0);
        dummy.scale.set(sc, sc, sc);
        dummy.updateMatrix();
        leafInst.setMatrixAt(i * 3 + p, dummy.matrix);
      }
      colliders.push({
        minX: tx - 0.45,
        maxX: tx + 0.45,
        minY: 0,
        maxY: 4.5,
        minZ: tz - 0.45,
        maxZ: tz + 0.45,
        tag: 'wall',
      });
    });
    trunkInst.instanceMatrix.needsUpdate = true;
    leafInst.instanceMatrix.needsUpdate = true;
    trunkInst.computeBoundingSphere();
    leafInst.computeBoundingSphere();
    group.add(trunkInst, leafInst);
  }

  // --- Streetlamps / Neon Light Beacons ---
  if (theme.accentGlowColor !== null) {
    const glowGeo = trackGeo(new THREE.BoxGeometry(0.65, 0.28, 0.65));
    const poleGeo = trackGeo(new THREE.CylinderGeometry(0.08, 0.12, 5.6, 8));
    const glowPoints: [number, number][] = [
      [-H * 0.22, H * 0.62],
      [H * 0.22, H * 0.62],
      [H * 0.56, H * 0.4],
      [-H * 0.56, -H * 0.4],
      [H * 0.56, -H * 0.45],
      [-H * 0.22, -H * 0.62],
      [H * 0.22, -H * 0.62],
    ];
    for (const [lx, lz] of glowPoints) {
      const pole = new THREE.Mesh(poleGeo, materials.roofMetal);
      pole.position.set(lx, 2.8, lz);
      const lamp = new THREE.Mesh(glowGeo, materials.trimAccent);
      lamp.position.set(lx, 5.7, lz);
      group.add(pole, lamp);
    }
  }

  scene.add(group);

  // --- Spawn Grids (CT South + T North, completely clear of architecture) ---
  const ctSpawns = buildSpawnGrid(0, H * 0.72, 1);
  const tSpawns = buildSpawnGrid(0, -H * 0.72, -1);

  // --- Unified Named Tactical Callouts (used by Minimap, Full Map View & Bot Radio) ---
  const calloutZones: MapCallout[] = [
    { id: 'ct_spawn', name: 'CT Spawn', x: 0, z: H * 0.76, kind: 'spawn' },
    { id: 't_spawn', name: 'T Spawn', x: 0, z: -H * 0.76, kind: 'spawn' },
    { id: 'site_a', name: 'Bomb Site A', x: siteACenter.x, z: siteACenter.z, kind: 'site' },
    { id: 'site_b', name: 'Bomb Site B', x: siteBCenter.x, z: siteBCenter.z, kind: 'site' },
    { id: 'a_long', name: 'A Long', x: H * 0.72, z: -H * 0.28, kind: 'lane' },
    { id: 'a_catwalk', name: 'A Catwalk', x: catX, z: catZ, kind: 'lane' },
    { id: 'mid', name: 'Mid Courtyard', x: 0, z: midZ, kind: 'mid' },
    { id: 'b_tunnels', name: 'B Tunnels', x: -H * 0.68, z: -H * 0.44, kind: 'lane' },
    { id: 'b_market', name: 'B Market', x: -H * 0.56, z: H * 0.54, kind: 'lane' },
    { id: 'ct_a_conn', name: 'CT Connector', x: H * 0.48, z: H * 0.54, kind: 'lane' },
  ];

  const patrolWaypoints: THREE.Vector3[] = [
    new THREE.Vector3(0, 0, -H * 0.48),
    new THREE.Vector3(H * 0.68, 0, -H * 0.52),
    new THREE.Vector3(-H * 0.68, 0, -H * 0.52),
    new THREE.Vector3(0, 0, -H * 0.18),
    new THREE.Vector3(0, 0, H * 0.14),
    new THREE.Vector3(0, 0, H * 0.36),
    new THREE.Vector3(H * 0.24, 0, H * 0.16),
    new THREE.Vector3(-H * 0.24, 0, -H * 0.16),
    new THREE.Vector3(siteACenter.x, 0, siteACenter.z - 8),
    new THREE.Vector3(siteACenter.x, 0, siteACenter.z),
    new THREE.Vector3(siteACenter.x - 6, 0, siteACenter.z + 8),
    new THREE.Vector3(siteBCenter.x, 0, siteBCenter.z - 8),
    new THREE.Vector3(siteBCenter.x, 0, siteBCenter.z),
    new THREE.Vector3(siteBCenter.x + 6, 0, siteBCenter.z + 8),
    new THREE.Vector3(-H * 0.42, 0, H * 0.6),
    new THREE.Vector3(H * 0.42, 0, -H * 0.6),
  ];

  const navGrid = new NavGrid(colliders, H);

  return {
    group,
    sunLight,
    colliders,
    ramps,
    raycastMeshes,
    groundMeshes,
    defaultGroundSurface: materials.defaultGroundSurface,
    minimapRects,
    calloutZones,
    mapHalfSize: H,
    ctSpawns,
    tSpawns,
    siteA: { id: 'A', center: siteACenter, halfW: siteW * 0.5, halfD: siteW * 0.5, yTop: 0.52 },
    siteB: { id: 'B', center: siteBCenter, halfW: siteW * 0.5, halfD: siteW * 0.5, yTop: 0.52 },
    patrolWaypoints,
    coverSpots,
    navGrid,
    dispose: () => {
      scene.remove(group);
      geometries.forEach((g) => g.dispose());
      extraMaterials.forEach((m) => m.dispose());
      skyTex.dispose();
    },
  };
}
