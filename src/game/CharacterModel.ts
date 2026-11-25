import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Gender, TeamSide, UNIFORM_STYLES, UniformStyleId, WeaponId } from './types';
import { createGunmetalTexture, createSkinTexture, createUniformCamoTexture } from './ProceduralTextures';

/**
 * ============================================================================
 * SECTION: REALISTIC ORGANIC CHARACTER MODELS & HIERARCHICAL RIG ANIMATION
 * ============================================================================
 * Builds proportional (~7.5 heads tall) tactical operators from smooth organic
 * geometry (Capsule, tapered Cylinder, Lathe, scaled Sphere, beveled Extrude,
 * and Tube curves) — zero BoxGeometry body limbs. Static sub-parts are merged
 * per bone segment for 60 FPS even with 50 characters active simultaneously.
 */

function mergeSafe(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const prepped = parts.map((p) => {
    const g = p.index ? p.toNonIndexed() : p.clone();
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) {
      const count = g.attributes.position.count;
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
    }
    p.dispose();
    return g;
  });
  const merged = mergeGeometries(prepped, false);
  prepped.forEach((g) => g.dispose());
  merged.computeBoundingSphere();
  return merged;
}

function makeBeveledRoundedRect(w: number, h: number, r: number, depth: number, bevel = 0.008): THREE.ExtrudeGeometry {
  const hw = w / 2;
  const hh = h / 2;
  const cr = Math.min(r, hw * 0.8, hh * 0.8);
  const shape = new THREE.Shape();
  shape.moveTo(-hw + cr, -hh);
  shape.lineTo(hw - cr, -hh);
  shape.quadraticCurveTo(hw, -hh, hw, -hh + cr);
  shape.lineTo(hw, hh - cr);
  shape.quadraticCurveTo(hw, hh, hw - cr, hh);
  shape.lineTo(-hw + cr, hh);
  shape.quadraticCurveTo(-hw, hh, -hw, hh - cr);
  shape.lineTo(-hw, -hh + cr);
  shape.quadraticCurveTo(-hw, -hh, -hw + cr, -hh);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 6,
  });
  geo.center();
  return geo;
}

function buildHeadGeometry(isFemale: boolean): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // Cranium
  const cranium = new THREE.SphereGeometry(0.112, 16, 12);
  cranium.scale(isFemale ? 0.91 : 0.97, 1.08, isFemale ? 0.96 : 1.0);
  cranium.translate(0, 0.14, 0);
  parts.push(cranium);

  // Tapered jaw / chin
  const jaw = new THREE.CylinderGeometry(
    isFemale ? 0.082 : 0.092,
    isFemale ? 0.048 : 0.062,
    0.095,
    12
  );
  jaw.scale(0.92, 1.0, 1.05);
  jaw.translate(0, 0.068, 0.015);
  parts.push(jaw);

  // Nose bridge
  const nose = new THREE.CapsuleGeometry(0.014, 0.032, 4, 8);
  nose.rotateX(-0.22);
  nose.translate(0, 0.115, 0.106);
  parts.push(nose);

  // Neck
  const neck = new THREE.CylinderGeometry(isFemale ? 0.048 : 0.058, isFemale ? 0.056 : 0.068, 0.085, 10);
  neck.translate(0, 0.025, 0);
  parts.push(neck);

  return mergeSafe(parts);
}

function buildTorsoGeometry(isFemale: boolean): THREE.BufferGeometry {
  // Anatomical chest-to-waist profile via LatheGeometry
  const pts = isFemale
    ? [
        new THREE.Vector2(0.001, 0.0),
        new THREE.Vector2(0.125, 0.03),
        new THREE.Vector2(0.105, 0.16), // narrow waist
        new THREE.Vector2(0.145, 0.34), // chest contour
        new THREE.Vector2(0.14, 0.45),  // upper chest
        new THREE.Vector2(0.06, 0.51),  // collar base
        new THREE.Vector2(0.001, 0.52),
      ]
    : [
        new THREE.Vector2(0.001, 0.0),
        new THREE.Vector2(0.135, 0.03),
        new THREE.Vector2(0.138, 0.16),
        new THREE.Vector2(0.168, 0.34), // broad V-taper chest
        new THREE.Vector2(0.162, 0.45),
        new THREE.Vector2(0.072, 0.51),
        new THREE.Vector2(0.001, 0.52),
      ];

  const torso = new THREE.LatheGeometry(pts, 16);
  torso.scale(isFemale ? 1.05 : 1.16, 1.0, isFemale ? 0.78 : 0.8);

  // Collar
  const collar = new THREE.TorusGeometry(isFemale ? 0.068 : 0.078, 0.02, 8, 14);
  collar.rotateX(Math.PI / 2);
  collar.translate(0, 0.49, 0);

  return mergeSafe([torso, collar]);
}

function buildVestAndGearGeometry(isFemale: boolean): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const scaleX = isFemale ? 0.86 : 1.0;

  // Front & Back armored plate carrier panels
  const frontPlate = makeBeveledRoundedRect(0.28 * scaleX, 0.31, 0.03, 0.04, 0.012);
  frontPlate.translate(0, 0.30, 0.118);
  parts.push(frontPlate);

  const backPlate = makeBeveledRoundedRect(0.27 * scaleX, 0.32, 0.03, 0.04, 0.012);
  backPlate.translate(0, 0.30, -0.115);
  parts.push(backPlate);

  // Shoulder straps
  for (const sx of [-1, 1]) {
    const strap = new THREE.CapsuleGeometry(0.024, 0.14, 4, 8);
    strap.rotateX(Math.PI / 2);
    strap.translate(sx * 0.095 * scaleX, 0.465, 0);
    parts.push(strap);
  }

  // 3 Triple Magazine Pouches on chest
  for (let i = -1; i <= 1; i++) {
    const pouch = makeBeveledRoundedRect(0.062, 0.11, 0.01, 0.036, 0.006);
    pouch.translate(i * 0.072 * scaleX, 0.21, 0.15);
    parts.push(pouch);
  }

  // Tactical utility belt around waist
  const belt = new THREE.CylinderGeometry(0.145 * scaleX, 0.148 * scaleX, 0.055, 16);
  belt.scale(1.12, 1.0, 0.82);
  belt.translate(0, 0.08, 0);
  parts.push(belt);

  // Rear hydration/field pack
  const pack = makeBeveledRoundedRect(0.21 * scaleX, 0.26, 0.03, 0.09, 0.014);
  pack.translate(0, 0.30, -0.175);
  parts.push(pack);

  return mergeSafe(parts);
}

function buildPelvisGeometry(isFemale: boolean): THREE.BufferGeometry {
  const pelvis = new THREE.SphereGeometry(isFemale ? 0.145 : 0.15, 14, 10);
  pelvis.scale(isFemale ? 1.12 : 1.06, 0.72, 0.84);
  pelvis.translate(0, 0.03, 0);
  return mergeSafe([pelvis]);
}

function buildUpperArmGeometry(isFemale: boolean): THREE.BufferGeometry {
  const rTop = isFemale ? 0.048 : 0.058;
  const rBot = isFemale ? 0.04 : 0.048;
  const shoulder = new THREE.SphereGeometry(rTop * 1.08, 10, 8);
  const arm = new THREE.CylinderGeometry(rTop, rBot, 0.25, 10);
  arm.translate(0, -0.13, 0);
  return mergeSafe([shoulder, arm]);
}

function buildForearmGeometry(isFemale: boolean): THREE.BufferGeometry {
  const rTop = isFemale ? 0.04 : 0.048;
  const rBot = isFemale ? 0.032 : 0.038;
  const elbow = new THREE.SphereGeometry(rTop * 0.96, 10, 8);
  const forearm = new THREE.CylinderGeometry(rTop, rBot, 0.23, 10);
  forearm.translate(0, -0.115, 0);
  return mergeSafe([elbow, forearm]);
}

function buildHandGeometry(): THREE.BufferGeometry {
  const palm = makeBeveledRoundedRect(0.062, 0.072, 0.014, 0.036, 0.006);
  palm.translate(0, -0.036, 0);
  const thumb = new THREE.CapsuleGeometry(0.012, 0.03, 4, 6);
  thumb.rotateZ(0.5);
  thumb.translate(0.032, -0.025, 0.016);
  const fingers = new THREE.CapsuleGeometry(0.024, 0.036, 4, 8);
  fingers.scale(1.1, 1.0, 0.65);
  fingers.translate(0, -0.082, 0.006);
  return mergeSafe([palm, thumb, fingers]);
}

function buildThighGeometry(isFemale: boolean): THREE.BufferGeometry {
  const rTop = isFemale ? 0.076 : 0.084;
  const rBot = isFemale ? 0.058 : 0.064;
  const hip = new THREE.SphereGeometry(rTop * 0.95, 10, 8);
  const thigh = new THREE.CylinderGeometry(rTop, rBot, 0.40, 12);
  thigh.translate(0, -0.20, 0);
  return mergeSafe([hip, thigh]);
}

function buildCalfAndBootGeometry(isFemale: boolean): { calf: THREE.BufferGeometry; boot: THREE.BufferGeometry; kneePad: THREE.BufferGeometry } {
  const rTop = isFemale ? 0.056 : 0.062;
  const rBot = isFemale ? 0.042 : 0.046;
  const knee = new THREE.SphereGeometry(rTop * 0.95, 10, 8);
  const calf = new THREE.CylinderGeometry(rTop, rBot, 0.34, 12);
  calf.translate(0, -0.17, 0);

  const kneePad = makeBeveledRoundedRect(0.095, 0.09, 0.022, 0.025, 0.008);
  kneePad.translate(0, -0.01, 0.052);

  // Boot ankle + rounded toe + treaded sole
  const ankle = new THREE.CylinderGeometry(0.05, 0.054, 0.10, 10);
  ankle.translate(0, -0.35, 0);
  const foot = new THREE.CapsuleGeometry(0.052, 0.13, 6, 10);
  foot.rotateX(Math.PI / 2);
  foot.scale(0.95, 0.72, 1.0);
  foot.translate(0, -0.40, 0.048);
  const sole = makeBeveledRoundedRect(0.105, 0.026, 0.022, 0.23, 0.004);
  sole.translate(0, -0.425, 0.048);

  return {
    calf: mergeSafe([knee, calf]),
    boot: mergeSafe([ankle, foot, sole]),
    kneePad,
  };
}

function buildHelmetWithStrapGeometry(): { helmet: THREE.BufferGeometry; goggles: THREE.BufferGeometry; strap: THREE.BufferGeometry } {
  // Curved tactical combat helmet shell
  const dome = new THREE.SphereGeometry(0.128, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.58);
  dome.scale(1.0, 0.95, 1.08);
  dome.translate(0, 0.165, -0.005);

  const brim = new THREE.CylinderGeometry(0.13, 0.134, 0.03, 16, 1, true);
  brim.scale(1.0, 1.0, 1.08);
  brim.translate(0, 0.148, -0.005);

  // NVG shroud mount on front
  const mount = makeBeveledRoundedRect(0.036, 0.042, 0.006, 0.02, 0.003);
  mount.translate(0, 0.195, 0.134);

  const helmet = mergeSafe([dome, brim, mount]);

  // Curved tactical goggles across forehead/eyes
  const goggles = makeBeveledRoundedRect(0.165, 0.052, 0.015, 0.035, 0.006);
  goggles.translate(0, 0.145, 0.106);

  // Chin strap via TubeGeometry
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.112, 0.145, 0.01),
    new THREE.Vector3(-0.088, 0.082, 0.045),
    new THREE.Vector3(0, 0.048, 0.062),
    new THREE.Vector3(0.088, 0.082, 0.045),
    new THREE.Vector3(0.112, 0.145, 0.01),
  ]);
  const strap = new THREE.TubeGeometry(curve, 14, 0.008, 6, false);

  return { helmet, goggles, strap };
}

function buildBalaclavaAndCapGeometry(): { balaclava: THREE.BufferGeometry; cap: THREE.BufferGeometry } {
  // Lower-face tactical mask / shemagh
  const mask = new THREE.CylinderGeometry(0.102, 0.072, 0.11, 14);
  mask.scale(0.95, 1.0, 1.06);
  mask.translate(0, 0.078, 0.012);

  // Tactical cap / beanie crown + brim
  const crown = new THREE.SphereGeometry(0.12, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.56);
  crown.scale(0.98, 0.92, 1.04);
  crown.translate(0, 0.165, -0.005);
  const visor = new THREE.CylinderGeometry(0.11, 0.115, 0.014, 12, 1, false, -Math.PI * 0.35, Math.PI * 0.7);
  visor.translate(0, 0.158, 0.055);

  return {
    balaclava: mask,
    cap: mergeSafe([crown, visor]),
  };
}

function buildPonytailGeometry(): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.14, -0.115),
    new THREE.Vector3(0, 0.10, -0.175),
    new THREE.Vector3(0, 0.01, -0.20),
    new THREE.Vector3(0, -0.10, -0.19),
  ]);
  const tube = new THREE.TubeGeometry(curve, 12, 0.028, 8, false);
  const tie = new THREE.TorusGeometry(0.032, 0.009, 6, 10);
  tie.rotateX(Math.PI / 4);
  tie.translate(0, 0.135, -0.12);
  return mergeSafe([tube, tie]);
}

function buildThirdPersonWeapons(): Record<WeaponId, THREE.BufferGeometry> {
  // Detailed composite 3P weapons (no single-box guns)
  const makeRifle = (barrelLen: number, hasScope: boolean, hasSup: boolean, isSmg: boolean) => {
    const parts: THREE.BufferGeometry[] = [];
    const rec = makeBeveledRoundedRect(0.044, 0.072, 0.008, isSmg ? 0.24 : 0.32, 0.004);
    rec.translate(0, 0, 0.02);
    parts.push(rec);

    const barrel = new THREE.CylinderGeometry(0.011, 0.014, barrelLen, 8);
    barrel.rotateX(Math.PI / 2);
    barrel.translate(0, 0.012, (isSmg ? 0.12 : 0.16) + barrelLen / 2);
    parts.push(barrel);

    const shroud = new THREE.CylinderGeometry(0.022, 0.024, barrelLen * 0.55, 8);
    shroud.rotateX(Math.PI / 2);
    shroud.translate(0, 0.01, (isSmg ? 0.12 : 0.16) + barrelLen * 0.28);
    parts.push(shroud);

    const grip = makeBeveledRoundedRect(0.032, 0.10, 0.006, 0.042, 0.003);
    grip.rotateX(-0.28);
    grip.translate(0, -0.065, -0.06);
    parts.push(grip);

    const mag = makeBeveledRoundedRect(0.03, 0.14, 0.005, 0.055, 0.003);
    mag.rotateX(0.2);
    mag.translate(0, -0.088, 0.08);
    parts.push(mag);

    const stock = makeBeveledRoundedRect(0.038, 0.085, 0.01, 0.22, 0.004);
    stock.translate(0, -0.01, -0.22);
    parts.push(stock);

    if (hasScope) {
      const scope = new THREE.CylinderGeometry(0.018, 0.022, 0.24, 10);
      scope.rotateX(Math.PI / 2);
      scope.translate(0, 0.062, 0.04);
      parts.push(scope);
    }
    if (hasSup) {
      const sup = new THREE.CylinderGeometry(0.017, 0.017, 0.16, 10);
      sup.rotateX(Math.PI / 2);
      sup.translate(0, 0.012, 0.24);
      parts.push(sup);
    }
    return mergeSafe(parts);
  };

  // Knife
  const kHandle = new THREE.CylinderGeometry(0.014, 0.016, 0.11, 8);
  kHandle.rotateX(Math.PI / 2);
  const kBlade = makeBeveledRoundedRect(0.008, 0.028, 0.002, 0.15, 0.002);
  kBlade.translate(0, 0.005, 0.13);
  const knife = mergeSafe([kHandle, kBlade]);

  // USP-S
  const pSlide = makeBeveledRoundedRect(0.032, 0.042, 0.006, 0.18, 0.003);
  const pGrip = makeBeveledRoundedRect(0.028, 0.095, 0.006, 0.042, 0.003);
  pGrip.rotateX(-0.22);
  pGrip.translate(0, -0.058, -0.04);
  const pSup = new THREE.CylinderGeometry(0.014, 0.014, 0.15, 8);
  pSup.rotateX(Math.PI / 2);
  pSup.translate(0, 0.006, 0.165);
  const usps = mergeSafe([pSlide, pGrip, pSup]);

  return {
    knife,
    usps,
    mp9: makeRifle(0.2, false, false, true),
    nova: makeRifle(0.42, false, false, false),
    m4a4: makeRifle(0.38, false, false, false),
    awp: makeRifle(0.58, true, false, false),
  };
}

export interface CharacterGeometryPool {
  headMaleGeo: THREE.BufferGeometry;
  headFemaleGeo: THREE.BufferGeometry;
  torsoMaleGeo: THREE.BufferGeometry;
  torsoFemaleGeo: THREE.BufferGeometry;
  vestMaleGeo: THREE.BufferGeometry;
  vestFemaleGeo: THREE.BufferGeometry;
  pelvisMaleGeo: THREE.BufferGeometry;
  pelvisFemaleGeo: THREE.BufferGeometry;
  upperArmMaleGeo: THREE.BufferGeometry;
  upperArmFemaleGeo: THREE.BufferGeometry;
  forearmMaleGeo: THREE.BufferGeometry;
  forearmFemaleGeo: THREE.BufferGeometry;
  handGeo: THREE.BufferGeometry;
  thighMaleGeo: THREE.BufferGeometry;
  thighFemaleGeo: THREE.BufferGeometry;
  calfMaleGeo: THREE.BufferGeometry;
  calfFemaleGeo: THREE.BufferGeometry;
  bootGeo: THREE.BufferGeometry;
  kneePadGeo: THREE.BufferGeometry;
  helmetGeo: THREE.BufferGeometry;
  gogglesGeo: THREE.BufferGeometry;
  strapGeo: THREE.BufferGeometry;
  balaclavaGeo: THREE.BufferGeometry;
  capGeo: THREE.BufferGeometry;
  ponytailGeo: THREE.BufferGeometry;
  weaponGeos: Record<WeaponId, THREE.BufferGeometry>;
  flashGeo: THREE.OctahedronGeometry;
  shadowGeo: THREE.PlaneGeometry;
  dispose: () => void;
}

export function createCharacterGeometryPool(): CharacterGeometryPool {
  const headMaleGeo = buildHeadGeometry(false);
  const headFemaleGeo = buildHeadGeometry(true);
  const torsoMaleGeo = buildTorsoGeometry(false);
  const torsoFemaleGeo = buildTorsoGeometry(true);
  const vestMaleGeo = buildVestAndGearGeometry(false);
  const vestFemaleGeo = buildVestAndGearGeometry(true);
  const pelvisMaleGeo = buildPelvisGeometry(false);
  const pelvisFemaleGeo = buildPelvisGeometry(true);
  const upperArmMaleGeo = buildUpperArmGeometry(false);
  const upperArmFemaleGeo = buildUpperArmGeometry(true);
  const forearmMaleGeo = buildForearmGeometry(false);
  const forearmFemaleGeo = buildForearmGeometry(true);
  const handGeo = buildHandGeometry();
  const thighMaleGeo = buildThighGeometry(false);
  const thighFemaleGeo = buildThighGeometry(true);
  const calfMaleData = buildCalfAndBootGeometry(false);
  const calfFemaleData = buildCalfAndBootGeometry(true);
  const helmetData = buildHelmetWithStrapGeometry();
  const balaData = buildBalaclavaAndCapGeometry();
  const ponytailGeo = buildPonytailGeometry();
  const weaponGeos = buildThirdPersonWeapons();
  const flashGeo = new THREE.OctahedronGeometry(0.13, 0);
  const shadowGeo = new THREE.PlaneGeometry(1.1, 1.1);

  const all: THREE.BufferGeometry[] = [
    headMaleGeo,
    headFemaleGeo,
    torsoMaleGeo,
    torsoFemaleGeo,
    vestMaleGeo,
    vestFemaleGeo,
    pelvisMaleGeo,
    pelvisFemaleGeo,
    upperArmMaleGeo,
    upperArmFemaleGeo,
    forearmMaleGeo,
    forearmFemaleGeo,
    handGeo,
    thighMaleGeo,
    thighFemaleGeo,
    calfMaleData.calf,
    calfFemaleData.calf,
    calfMaleData.boot,
    calfFemaleData.boot,
    calfMaleData.kneePad,
    calfFemaleData.kneePad,
    helmetData.helmet,
    helmetData.goggles,
    helmetData.strap,
    balaData.balaclava,
    balaData.cap,
    ponytailGeo,
    flashGeo,
    shadowGeo,
    ...Object.values(weaponGeos),
  ];

  return {
    headMaleGeo,
    headFemaleGeo,
    torsoMaleGeo,
    torsoFemaleGeo,
    vestMaleGeo,
    vestFemaleGeo,
    pelvisMaleGeo,
    pelvisFemaleGeo,
    upperArmMaleGeo,
    upperArmFemaleGeo,
    forearmMaleGeo,
    forearmFemaleGeo,
    handGeo,
    thighMaleGeo,
    thighFemaleGeo,
    calfMaleGeo: calfMaleData.calf,
    calfFemaleGeo: calfFemaleData.calf,
    bootGeo: calfMaleData.boot,
    kneePadGeo: calfMaleData.kneePad,
    helmetGeo: helmetData.helmet,
    gogglesGeo: helmetData.goggles,
    strapGeo: helmetData.strap,
    balaclavaGeo: balaData.balaclava,
    capGeo: balaData.cap,
    ponytailGeo,
    weaponGeos,
    flashGeo,
    shadowGeo,
    dispose: () => all.forEach((g) => g.dispose()),
  };
}

export interface UniformMaterialSet {
  uniform: THREE.MeshStandardMaterial;
  pants: THREE.MeshStandardMaterial;
  vest: THREE.MeshStandardMaterial;
  helmet: THREE.MeshStandardMaterial;
  skin: THREE.MeshStandardMaterial;
  hair: THREE.MeshStandardMaterial;
  boot: THREE.MeshStandardMaterial;
  visor: THREE.MeshStandardMaterial;
  glove: THREE.MeshStandardMaterial;
  balaclava: THREE.MeshStandardMaterial;
  gun: THREE.MeshStandardMaterial;
  flash: THREE.MeshBasicMaterial;
  hitFlash: THREE.MeshStandardMaterial;
  dispose: () => void;
}

export function createUniformMaterialSet(styleId: UniformStyleId): UniformMaterialSet {
  const s = UNIFORM_STYLES[styleId];
  const camo = createUniformCamoTexture(styleId, 256);
  const skinTex = createSkinTexture(styleId.charCodeAt(0) * 19 + 7);
  const gunTex = createGunmetalTexture(128);

  const uniform = new THREE.MeshStandardMaterial({
    map: camo.map,
    bumpMap: camo.bumpMap,
    bumpScale: 0.015,
    roughness: 0.8,
    metalness: 0.05,
  });
  const pants = new THREE.MeshStandardMaterial({
    color: s.secondaryHex,
    map: camo.map,
    bumpMap: camo.bumpMap,
    bumpScale: 0.015,
    roughness: 0.86,
    metalness: 0.04,
  });
  const vest = new THREE.MeshStandardMaterial({
    color: s.vestHex,
    bumpMap: camo.bumpMap,
    bumpScale: 0.012,
    roughness: 0.72,
    metalness: 0.16,
  });
  const helmet = new THREE.MeshStandardMaterial({
    color: s.helmetHex,
    roughness: 0.52,
    metalness: 0.28,
  });
  const skin = new THREE.MeshStandardMaterial({
    map: skinTex,
    roughness: 0.68,
    metalness: 0.02,
  });
  const hair = new THREE.MeshStandardMaterial({
    color: 0x261a14,
    roughness: 0.78,
  });
  const boot = new THREE.MeshStandardMaterial({
    color: 0x17191d,
    roughness: 0.82,
    metalness: 0.08,
  });
  const visor = new THREE.MeshStandardMaterial({
    color: 0x101d2b,
    roughness: 0.15,
    metalness: 0.88,
  });
  const glove = new THREE.MeshStandardMaterial({
    color: 0x1c1f24,
    roughness: 0.76,
    metalness: 0.1,
  });
  const balaclava = new THREE.MeshStandardMaterial({
    color: 0x22252b,
    roughness: 0.88,
  });
  const gun = new THREE.MeshStandardMaterial({
    color: 0x242930,
    roughnessMap: gunTex,
    roughness: 0.42,
    metalness: 0.88,
  });
  const flash = new THREE.MeshBasicMaterial({ color: 0xffd066 });
  const hitFlash = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xcc3518,
    emissiveIntensity: 0.9,
    roughness: 0.6,
  });

  const allMats = [uniform, pants, vest, helmet, skin, hair, boot, visor, glove, balaclava, gun, flash, hitFlash];
  const allTex = [camo.map, camo.bumpMap, skinTex, gunTex];

  return {
    uniform,
    pants,
    vest,
    helmet,
    skin,
    hair,
    boot,
    visor,
    glove,
    balaclava,
    gun,
    flash,
    hitFlash,
    dispose: () => {
      allMats.forEach((m) => m.dispose());
      allTex.forEach((t) => t.dispose());
    },
  };
}

export interface BuiltCharacterRig {
  root: THREE.Group;
  bodyPivot: THREE.Group; // outer fall/collapse pivot
  hipsPivot: THREE.Group;
  torsoPivot: THREE.Group;
  headPivot: THREE.Group;
  ponytailPivot: THREE.Group | null;
  leftShoulder: THREE.Group;
  leftElbow: THREE.Group;
  rightShoulder: THREE.Group;
  rightElbow: THREE.Group;
  leftHip: THREE.Group;
  leftKnee: THREE.Group;
  rightHip: THREE.Group;
  rightKnee: THREE.Group;
  weaponMesh: THREE.Mesh;
  torsoMesh: THREE.Mesh;
  headMesh: THREE.Mesh;
  muzzlePoint: THREE.Object3D;
  muzzleFlash: THREE.Mesh;
  hitMeshes: THREE.Mesh[];
  gender: Gender;
  setWeaponVisual: (id: WeaponId) => void;
}

export function buildCharacterRig(
  geos: CharacterGeometryPool,
  mats: UniformMaterialSet,
  gender: Gender,
  contactShadowMat: THREE.MeshBasicMaterial,
  castShadows: boolean,
  botId?: string,
  team: TeamSide = 'CT'
): BuiltCharacterRig {
  const isFemale = gender === 'female';
  const root = new THREE.Group();

  const shadow = new THREE.Mesh(geos.shadowGeo, contactShadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  root.add(shadow);

  const bodyPivot = new THREE.Group();
  root.add(bodyPivot);

  const hitMeshes: THREE.Mesh[] = [];
  const tag = (mesh: THREE.Mesh, hitbox: 'head' | 'body') => {
    if (botId) {
      mesh.userData = { botId, team, hitbox };
    }
    mesh.castShadow = castShadows;
    mesh.receiveShadow = castShadows;
    hitMeshes.push(mesh);
  };

  // --- HIPS PIVOT (y = 0.86m) ---
  const hipsPivot = new THREE.Group();
  hipsPivot.position.set(0, 0.86, 0);
  bodyPivot.add(hipsPivot);

  const pelvisMesh = new THREE.Mesh(isFemale ? geos.pelvisFemaleGeo : geos.pelvisMaleGeo, mats.pants);
  tag(pelvisMesh, 'body');
  hipsPivot.add(pelvisMesh);

  // --- LEGS (Left & Right Hip -> Knee -> Calf/Boot) ---
  const hipX = isFemale ? 0.105 : 0.118;
  const makeLeg = (side: -1 | 1) => {
    const hip = new THREE.Group();
    hip.position.set(side * hipX, 0, 0);
    const thigh = new THREE.Mesh(isFemale ? geos.thighFemaleGeo : geos.thighMaleGeo, mats.pants);
    tag(thigh, 'body');
    hip.add(thigh);

    const knee = new THREE.Group();
    knee.position.set(0, -0.41, 0);
    const calf = new THREE.Mesh(isFemale ? geos.calfFemaleGeo : geos.calfMaleGeo, mats.pants);
    const kneePad = new THREE.Mesh(geos.kneePadGeo, mats.vest);
    const boot = new THREE.Mesh(geos.bootGeo, mats.boot);
    tag(calf, 'body');
    tag(boot, 'body');
    knee.add(calf, kneePad, boot);
    hip.add(knee);
    hipsPivot.add(hip);
    return { hip, knee };
  };

  const leftLeg = makeLeg(-1);
  const rightLeg = makeLeg(1);

  // --- TORSO PIVOT (on top of pelvis) ---
  const torsoPivot = new THREE.Group();
  torsoPivot.position.set(0, 0.06, 0);
  hipsPivot.add(torsoPivot);

  const torsoMesh = new THREE.Mesh(isFemale ? geos.torsoFemaleGeo : geos.torsoMaleGeo, mats.uniform);
  tag(torsoMesh, 'body');
  const vestMesh = new THREE.Mesh(isFemale ? geos.vestFemaleGeo : geos.vestMaleGeo, mats.vest);
  tag(vestMesh, 'body');
  torsoPivot.add(torsoMesh, vestMesh);

  // --- HEAD PIVOT ---
  const headPivot = new THREE.Group();
  headPivot.position.set(0, 0.50, 0);
  torsoPivot.add(headPivot);

  const headMesh = new THREE.Mesh(isFemale ? geos.headFemaleGeo : geos.headMaleGeo, mats.skin);
  tag(headMesh, 'head');
  headPivot.add(headMesh);

  if (team === 'CT') {
    const helmetMesh = new THREE.Mesh(geos.helmetGeo, mats.helmet);
    const gogglesMesh = new THREE.Mesh(geos.gogglesGeo, mats.visor);
    const strapMesh = new THREE.Mesh(geos.strapGeo, mats.vest);
    tag(helmetMesh, 'head');
    headPivot.add(helmetMesh, gogglesMesh, strapMesh);
  } else {
    // Terrorists wear tactical balaclava + cap + goggles
    const maskMesh = new THREE.Mesh(geos.balaclavaGeo, mats.balaclava);
    const capMesh = new THREE.Mesh(geos.capGeo, mats.helmet);
    const gogglesMesh = new THREE.Mesh(geos.gogglesGeo, mats.visor);
    tag(maskMesh, 'head');
    tag(capMesh, 'head');
    headPivot.add(maskMesh, capMesh, gogglesMesh);
  }

  let ponytailPivot: THREE.Group | null = null;
  if (isFemale) {
    ponytailPivot = new THREE.Group();
    const hairMesh = new THREE.Mesh(geos.ponytailGeo, mats.hair);
    ponytailPivot.add(hairMesh);
    headPivot.add(ponytailPivot);
  }

  // --- ARMS (Left & Right Shoulder -> Elbow -> Forearm + Glove) ---
  const shoulderX = isFemale ? 0.195 : 0.235;
  const makeArm = (side: -1 | 1) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * shoulderX, 0.44, 0);
    const uArm = new THREE.Mesh(isFemale ? geos.upperArmFemaleGeo : geos.upperArmMaleGeo, mats.uniform);
    tag(uArm, 'body');
    shoulder.add(uArm);

    const elbow = new THREE.Group();
    elbow.position.set(0, -0.25, 0);
    const fArm = new THREE.Mesh(isFemale ? geos.forearmFemaleGeo : geos.forearmMaleGeo, mats.uniform);
    const hand = new THREE.Mesh(geos.handGeo, mats.glove);
    hand.position.set(0, -0.23, 0);
    tag(fArm, 'body');
    elbow.add(fArm, hand);
    shoulder.add(elbow);
    torsoPivot.add(shoulder);
    return { shoulder, elbow };
  };

  const leftArm = makeArm(-1);
  const rightArm = makeArm(1);

  // --- THIRD-PERSON WEAPON MOUNTED IN HANDS ---
  const weaponGroup = new THREE.Group();
  weaponGroup.position.set(-0.04, -0.25, 0.08);
  weaponGroup.rotation.set(Math.PI / 2, 0, 0);
  const weaponMesh = new THREE.Mesh(geos.weaponGeos.m4a4, mats.gun);
  weaponMesh.castShadow = castShadows;
  weaponGroup.add(weaponMesh);

  const muzzlePoint = new THREE.Object3D();
  muzzlePoint.position.set(0, 0.015, 0.52);
  weaponGroup.add(muzzlePoint);

  const muzzleFlash = new THREE.Mesh(geos.flashGeo, mats.flash);
  muzzleFlash.position.copy(muzzlePoint.position);
  muzzleFlash.visible = false;
  weaponGroup.add(muzzleFlash);

  rightArm.elbow.add(weaponGroup);

  const setWeaponVisual = (id: WeaponId) => {
    weaponMesh.geometry = geos.weaponGeos[id];
    const muzzleZ =
      id === 'awp' ? 0.72 : id === 'nova' ? 0.56 : id === 'm4a4' ? 0.54 : id === 'mp9' ? 0.34 : id === 'usps' ? 0.26 : 0.18;
    muzzlePoint.position.set(0, 0.015, muzzleZ);
    muzzleFlash.position.copy(muzzlePoint.position);
  };

  return {
    root,
    bodyPivot,
    hipsPivot,
    torsoPivot,
    headPivot,
    ponytailPivot,
    leftShoulder: leftArm.shoulder,
    leftElbow: leftArm.elbow,
    rightShoulder: rightArm.shoulder,
    rightElbow: rightArm.elbow,
    leftHip: leftLeg.hip,
    leftKnee: leftLeg.knee,
    rightHip: rightLeg.hip,
    rightKnee: rightLeg.knee,
    weaponMesh,
    torsoMesh,
    headMesh,
    muzzlePoint,
    muzzleFlash,
    hitMeshes,
    gender,
    setWeaponVisual,
  };
}

export interface CharacterAnimInput {
  dt: number;
  timeSec: number;
  stridePhase: number;
  moveRatio: number; // 0..1
  isAiming: boolean;
  isCrouching: boolean;
  isReloading: boolean;
  isPlantOrDefuse: boolean;
  flinchAlpha: number; // 0..1
  headPitch: number;
  alive: boolean;
  deathTimer: number; // 0..1
  deathFallDir: number;
}

/**
 * Animates the hierarchical skeletal joint pivots with zero allocations.
 */
export function animateCharacterRig(rig: BuiltCharacterRig, anim: CharacterAnimInput): void {
  const { dt } = anim;

  if (!anim.alive) {
    // Realistic two-stage collapse & ragdoll settle onto the ground
    const t = Math.min(1, anim.deathTimer);
    const ease = 1 - Math.pow(1 - t, 2.5);
    rig.bodyPivot.rotation.x = -ease * (Math.PI * 0.48);
    rig.bodyPivot.rotation.z = ease * 0.28 * anim.deathFallDir;
    rig.bodyPivot.position.y = ease * 0.14;
    rig.leftHip.rotation.x = ease * 0.35;
    rig.rightHip.rotation.x = ease * 0.18;
    rig.leftKnee.rotation.x = ease * 0.65;
    rig.rightKnee.rotation.x = ease * 0.35;
    rig.leftShoulder.rotation.set(-ease * 0.8, 0, -ease * 0.55);
    rig.rightShoulder.rotation.set(-ease * 0.5, 0, ease * 0.45);
    return;
  }

  rig.bodyPivot.rotation.set(0, 0, 0);
  rig.bodyPivot.position.set(0, 0, 0);

  const mv = THREE.MathUtils.clamp(anim.moveRatio, 0, 1);
  const breathe = Math.sin(anim.timeSec * 2.4) * 0.012;

  if (anim.isPlantOrDefuse) {
    // Kneeling tactical pose over C4
    rig.hipsPivot.position.y = 0.56;
    rig.leftHip.rotation.x = -1.15;
    rig.leftKnee.rotation.x = 1.65;
    rig.rightHip.rotation.x = -0.35;
    rig.rightKnee.rotation.x = 1.45;
    rig.torsoPivot.rotation.set(0.42, 0, 0);
    rig.headPivot.rotation.set(0.32, 0, 0);
    rig.rightShoulder.rotation.set(-0.95, 0.2, -0.15);
    rig.rightElbow.rotation.set(-0.6, 0, 0);
    rig.leftShoulder.rotation.set(-0.95, -0.25, 0.15);
    rig.leftElbow.rotation.set(-0.6, 0, 0);
    return;
  }

  // Crouch vs Walk/Run Bob
  const bob = mv > 0.08 ? Math.abs(Math.sin(anim.stridePhase)) * 0.042 * mv : 0;
  const targetHipsY = (anim.isCrouching ? 0.64 : 0.86) - bob + breathe * 0.4;
  rig.hipsPivot.position.y = THREE.MathUtils.damp(rig.hipsPivot.position.y, targetHipsY, 14, dt);

  // Leg Stride & Knee Bend
  if (mv > 0.06) {
    const s = Math.sin(anim.stridePhase);
    const c = Math.cos(anim.stridePhase);
    const amp = (anim.isCrouching ? 0.36 : 0.58) * mv;
    rig.leftHip.rotation.x = s * amp - (anim.isCrouching ? 0.48 : 0);
    rig.rightHip.rotation.x = -s * amp - (anim.isCrouching ? 0.48 : 0);
    rig.leftKnee.rotation.x = Math.max(0, -c * 0.68 * mv) + (anim.isCrouching ? 0.85 : 0.08);
    rig.rightKnee.rotation.x = Math.max(0, c * 0.68 * mv) + (anim.isCrouching ? 0.85 : 0.08);
  } else {
    const idleHip = anim.isCrouching ? -0.52 : 0;
    const idleKnee = anim.isCrouching ? 0.92 : 0.04;
    rig.leftHip.rotation.x = THREE.MathUtils.damp(rig.leftHip.rotation.x, idleHip, 12, dt);
    rig.rightHip.rotation.x = THREE.MathUtils.damp(rig.rightHip.rotation.x, idleHip, 12, dt);
    rig.leftKnee.rotation.x = THREE.MathUtils.damp(rig.leftKnee.rotation.x, idleKnee, 12, dt);
    rig.rightKnee.rotation.x = THREE.MathUtils.damp(rig.rightKnee.rotation.x, idleKnee, 12, dt);
  }

  // Torso Lean + Hit Flinch + Twist
  const leanX = (anim.isCrouching ? 0.16 : mv * 0.11) - anim.flinchAlpha * 0.24;
  const twistY = mv > 0.08 ? Math.sin(anim.stridePhase) * 0.06 * mv : 0;
  rig.torsoPivot.rotation.set(leanX + breathe, twistY, anim.flinchAlpha * 0.12);

  // Head tracking & Ponytail sway
  rig.headPivot.rotation.set(
    THREE.MathUtils.clamp(anim.headPitch, -0.55, 0.55) - anim.flinchAlpha * 0.18,
    -twistY * 0.5,
    0
  );
  if (rig.ponytailPivot) {
    rig.ponytailPivot.rotation.x = 0.08 + mv * 0.35 + Math.sin(anim.stridePhase * 2) * 0.08 * mv;
  }

  // Upper Body Arms & Weapon Ready Pose
  if (anim.isReloading) {
    rig.rightShoulder.rotation.set(-0.92, 0.25, -0.1);
    rig.rightElbow.rotation.set(-0.78, 0.2, 0);
    rig.leftShoulder.rotation.set(-0.85 + Math.sin(anim.timeSec * 8) * 0.15, -0.35, 0.2);
    rig.leftElbow.rotation.set(-0.85, 0, 0);
  } else if (anim.isAiming) {
    rig.rightShoulder.rotation.set(-1.32 + anim.headPitch * 0.5, 0.12, -0.04);
    rig.rightElbow.rotation.set(-0.32, 0.1, 0);
    rig.leftShoulder.rotation.set(-1.18 + anim.headPitch * 0.5, -0.45, 0.12);
    rig.leftElbow.rotation.set(-0.55, -0.15, 0);
  } else {
    const armSwing = mv > 0.08 ? Math.sin(anim.stridePhase) * 0.12 * mv : 0;
    rig.rightShoulder.rotation.set(-0.98 + armSwing, 0.15, -0.05);
    rig.rightElbow.rotation.set(-0.52, 0.1, 0);
    rig.leftShoulder.rotation.set(-0.92 - armSwing, -0.42, 0.14);
    rig.leftElbow.rotation.set(-0.62, -0.12, 0);
  }
}
