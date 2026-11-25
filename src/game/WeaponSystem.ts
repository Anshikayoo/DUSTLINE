import * as THREE from 'three';
import { UniformStyleId, WeaponId } from './types';
import { createGunmetalTexture, createUniformCamoTexture } from './ProceduralTextures';

/**
 * ============================================================================
 * SECTION: REALISTIC FIRST-PERSON WEAPON VIEWMODELS & ARTICULATED ARMS
 * ============================================================================
 * Builds multi-part procedural weapons (Knife, USP-S, MP9, Nova, M4A4, AWP)
 * with beveled receivers, cylinders, scopes, textured camo sleeves, gloved
 * hands, mag drop/insert reload animations, bolt/pump cycling, and shell
 * casing ejection anchors.
 */

function makeBeveledBlock(w: number, h: number, len: number, r = 0.005, bevel = 0.0025): THREE.ExtrudeGeometry {
  const hw = w / 2;
  const hh = h / 2;
  const cr = Math.min(r, hw * 0.6, hh * 0.6);
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
    depth: len,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 5,
  });
  geo.center();
  return geo;
}

export class WeaponViewmodelRig {
  public readonly root: THREE.Group;
  private models: Record<WeaponId, THREE.Group>;
  private muzzleAnchors: Record<WeaponId, THREE.Object3D>;
  private ejectAnchors: Record<WeaponId, THREE.Object3D>;
  private magGroups: Partial<Record<WeaponId, THREE.Object3D>> = {};
  private magBaseY: Partial<Record<WeaponId, number>> = {};

  private pistolSlide!: THREE.Mesh;
  private sniperBolt!: THREE.Group;
  private novaPump!: THREE.Group;

  private muzzleFlashGroup: THREE.Group;
  private muzzleLight: THREE.PointLight;
  private muzzleFlashTimer = 0;

  private sleeveMat: THREE.MeshStandardMaterial;
  private sleeveTex: THREE.Texture | null = null;
  private sleeveBump: THREE.Texture | null = null;
  private gloveMat: THREE.MeshStandardMaterial;

  private activeWeapon: WeaponId = 'usps';
  private recoilKickZ = 0;
  private recoilKickPitch = 0;
  private meleeSlashTimer = 0;
  private grenadeThrowTimer = 0;
  private swayX = 0;
  private swayY = 0;
  private bobPhase = 0;
  private idleTime = 0;
  private drawProgress = 1;
  private boltCycleTimer = 0;

  private geometries: THREE.BufferGeometry[] = [];
  private materials: THREE.Material[] = [];
  private textures: THREE.Texture[] = [];

  constructor(camera: THREE.PerspectiveCamera, uniformStyle: UniformStyleId) {
    this.root = new THREE.Group();
    camera.add(this.root);

    const gunTex = createGunmetalTexture(256);
    this.textures.push(gunTex);

    const camo = createUniformCamoTexture(uniformStyle, 256);
    this.sleeveTex = camo.map;
    this.sleeveBump = camo.bumpMap;

    const gunmetal = this.mat(
      new THREE.MeshStandardMaterial({
        color: 0x262c34,
        roughnessMap: gunTex,
        bumpMap: gunTex,
        bumpScale: 0.002,
        roughness: 0.36,
        metalness: 0.88,
      })
    );
    const darkSteel = this.mat(
      new THREE.MeshStandardMaterial({
        color: 0x15191f,
        roughnessMap: gunTex,
        roughness: 0.3,
        metalness: 0.92,
      })
    );
    const chromeSteel = this.mat(
      new THREE.MeshStandardMaterial({ color: 0xaab4c0, roughness: 0.2, metalness: 0.94 })
    );
    const polymer = this.mat(
      new THREE.MeshStandardMaterial({ color: 0x1e2126, roughness: 0.78, metalness: 0.08 })
    );
    const oliveStock = this.mat(
      new THREE.MeshStandardMaterial({ color: 0x4b5842, roughness: 0.7, metalness: 0.1 })
    );
    const tanRail = this.mat(
      new THREE.MeshStandardMaterial({ color: 0x8e7c61, roughness: 0.65, metalness: 0.16 })
    );
    this.sleeveMat = this.mat(
      new THREE.MeshStandardMaterial({
        map: this.sleeveTex,
        bumpMap: this.sleeveBump,
        bumpScale: 0.014,
        roughness: 0.84,
        metalness: 0.04,
      })
    );
    this.gloveMat = this.mat(
      new THREE.MeshStandardMaterial({ color: 0x1a1d22, roughness: 0.74, metalness: 0.12 })
    );
    const tritiumGlow = this.mat(new THREE.MeshBasicMaterial({ color: 0x5ef5a8 }));
    const redDotGlow = this.mat(new THREE.MeshBasicMaterial({ color: 0xff3b30 }));
    const lensMat = this.mat(
      new THREE.MeshStandardMaterial({ color: 0x1a4d78, roughness: 0.08, metalness: 0.95 })
    );

    const knife = this.buildKnife(chromeSteel, darkSteel, polymer);
    const usps = this.buildUsps(gunmetal, darkSteel, polymer, tritiumGlow);
    const mp9 = this.buildMp9(gunmetal, darkSteel, polymer, redDotGlow);
    const nova = this.buildNova(gunmetal, darkSteel, polymer);
    const m4a4 = this.buildM4a4(gunmetal, darkSteel, polymer, tanRail, redDotGlow);
    const awp = this.buildAwp(gunmetal, darkSteel, oliveStock, polymer, lensMat);

    this.models = {
      knife: knife.group,
      usps: usps.group,
      mp9: mp9.group,
      nova: nova.group,
      m4a4: m4a4.group,
      awp: awp.group,
    };

    this.muzzleAnchors = {
      knife: knife.muzzle,
      usps: usps.muzzle,
      mp9: mp9.muzzle,
      nova: nova.muzzle,
      m4a4: m4a4.muzzle,
      awp: awp.muzzle,
    };

    this.ejectAnchors = {
      knife: knife.eject,
      usps: usps.eject,
      mp9: mp9.eject,
      nova: nova.eject,
      m4a4: m4a4.eject,
      awp: awp.eject,
    };

    this.root.add(knife.group, usps.group, mp9.group, nova.group, m4a4.group, awp.group);

    // Muzzle flash burst
    this.muzzleFlashGroup = new THREE.Group();
    const flashMat = this.mat(
      new THREE.MeshBasicMaterial({
        color: 0xffdd7c,
        transparent: true,
        opacity: 0.92,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    const planeGeo = this.geo(new THREE.PlaneGeometry(0.18, 0.18));
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(planeGeo, flashMat);
      m.rotation.z = (i * Math.PI) / 3;
      this.muzzleFlashGroup.add(m);
    }
    this.muzzleFlashGroup.visible = false;
    this.root.add(this.muzzleFlashGroup);

    this.muzzleLight = new THREE.PointLight(0xffb85c, 0, 8, 2);
    this.root.add(this.muzzleLight);

    this.setWeapon('usps', false);
  }

  public setUniformStyle(styleId: UniformStyleId): void {
    const oldTex = this.sleeveTex;
    const oldBump = this.sleeveBump;
    const camo = createUniformCamoTexture(styleId, 256);
    this.sleeveTex = camo.map;
    this.sleeveBump = camo.bumpMap;
    this.sleeveMat.map = this.sleeveTex;
    this.sleeveMat.bumpMap = this.sleeveBump;
    this.sleeveMat.needsUpdate = true;
    oldTex?.dispose();
    oldBump?.dispose();
  }

  private geo<T extends THREE.BufferGeometry>(g: T): T {
    this.geometries.push(g);
    return g;
  }

  private mat<T extends THREE.Material>(m: T): T {
    this.materials.push(m);
    return m;
  }

  /** Builds a natural articulated first-person sleeve + forearm + gloved hand + fingers. */
  private makeArmAssembly(handX: number, handY: number, handZ: number, side: 'left' | 'right'): THREE.Group {
    const g = new THREE.Group();
    const startX = side === 'right' ? handX + 0.14 : handX - 0.19;
    const startY = handY - 0.14;
    const startZ = handZ + 0.34;

    const dir = new THREE.Vector3(handX - startX, handY - startY, handZ - startZ);
    const len = dir.length();
    const mid = new THREE.Vector3(
      (startX + handX) * 0.5,
      (startY + handY) * 0.5,
      (startZ + handZ) * 0.5
    );

    const sleeve = new THREE.Mesh(
      this.geo(new THREE.CylinderGeometry(0.036, 0.046, len, 10)),
      this.sleeveMat
    );
    sleeve.position.copy(mid);
    sleeve.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());

    const cuff = new THREE.Mesh(this.geo(new THREE.TorusGeometry(0.036, 0.008, 6, 12)), this.gloveMat);
    cuff.position.set(handX, handY - 0.01, handZ + 0.045);

    const palm = new THREE.Mesh(this.geo(makeBeveledBlock(0.056, 0.048, 0.072, 0.012, 0.004)), this.gloveMat);
    palm.position.set(handX, handY, handZ);

    const fingers = new THREE.Mesh(
      this.geo(new THREE.CapsuleGeometry(0.02, 0.035, 4, 8)),
      this.gloveMat
    );
    fingers.rotation.z = Math.PI / 2;
    fingers.position.set(handX + (side === 'right' ? -0.02 : 0.02), handY + 0.018, handZ - 0.024);

    g.add(sleeve, cuff, palm, fingers);
    return g;
  }

  private buildKnife(chromeSteel: THREE.Material, darkSteel: THREE.Material, polymer: THREE.Material) {
    const group = new THREE.Group();
    group.position.set(0.24, -0.22, -0.42);
    group.rotation.set(0.2, -0.35, 0.15);

    const handle = new THREE.Mesh(this.geo(new THREE.CylinderGeometry(0.018, 0.021, 0.13, 12)), polymer);
    const pommel = new THREE.Mesh(this.geo(new THREE.SphereGeometry(0.021, 10, 8)), darkSteel);
    pommel.position.y = -0.068;
    const guard = new THREE.Mesh(this.geo(makeBeveledBlock(0.018, 0.014, 0.058, 0.003)), darkSteel);
    guard.position.set(0, 0.068, 0);

    // Tapered tanto blade via ExtrudeGeometry
    const bladeShape = new THREE.Shape();
    bladeShape.moveTo(-0.014, 0);
    bladeShape.lineTo(0.016, 0);
    bladeShape.lineTo(0.014, 0.135);
    bladeShape.lineTo(-0.004, 0.185);
    bladeShape.lineTo(-0.015, 0.15);
    bladeShape.closePath();
    const bladeGeo = this.geo(
      new THREE.ExtrudeGeometry(bladeShape, { depth: 0.006, bevelEnabled: true, bevelSize: 0.002, bevelThickness: 0.002 })
    );
    bladeGeo.center();
    bladeGeo.rotateY(Math.PI / 2);
    const blade = new THREE.Mesh(bladeGeo, chromeSteel);
    blade.position.set(0, 0.165, -0.004);

    const arm = this.makeArmAssembly(0.006, -0.03, 0.02, 'right');
    group.add(handle, pommel, guard, blade, arm);

    const muzzle = new THREE.Object3D();
    muzzle.position.set(0, 0.22, -0.1);
    const eject = new THREE.Object3D();
    group.add(muzzle, eject);
    return { group, muzzle, eject };
  }

  private buildUsps(
    gunmetal: THREE.Material,
    darkSteel: THREE.Material,
    polymer: THREE.Material,
    tritiumGlow: THREE.Material
  ) {
    const group = new THREE.Group();
    group.position.set(0.22, -0.22, -0.44);

    const frame = new THREE.Mesh(this.geo(makeBeveledBlock(0.038, 0.03, 0.22, 0.004)), polymer);
    frame.position.set(0, 0, -0.02);

    this.pistolSlide = new THREE.Mesh(this.geo(makeBeveledBlock(0.04, 0.038, 0.23, 0.005)), gunmetal);
    this.pistolSlide.position.set(0, 0.034, -0.02);

    const barrel = new THREE.Mesh(this.geo(new THREE.CylinderGeometry(0.01, 0.01, 0.05, 10)), darkSteel);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.034, -0.145);

    const suppressor = new THREE.Mesh(this.geo(new THREE.CylinderGeometry(0.019, 0.019, 0.22, 16)), darkSteel);
    suppressor.rotation.x = Math.PI / 2;
    suppressor.position.set(0, 0.034, -0.25);

    const supRing = new THREE.Mesh(this.geo(new THREE.TorusGeometry(0.0195, 0.0025, 6, 16)), gunmetal);
    supRing.position.set(0, 0.034, -0.16);

    const grip = new THREE.Mesh(this.geo(makeBeveledBlock(0.038, 0.125, 0.062, 0.008)), polymer);
    grip.position.set(0, -0.072, 0.064);
    grip.rotation.x = 0.24;

    const triggerGuard = new THREE.Mesh(this.geo(new THREE.TorusGeometry(0.018, 0.004, 6, 12)), polymer);
    triggerGuard.rotation.y = Math.PI / 2;
    triggerGuard.position.set(0, -0.028, 0.015);

    const magGroup = new THREE.Group();
    const mag = new THREE.Mesh(this.geo(makeBeveledBlock(0.028, 0.11, 0.045, 0.004)), darkSteel);
    magGroup.add(mag);
    magGroup.position.set(0, -0.078, 0.066);
    magGroup.rotation.x = 0.24;
    this.magGroups.usps = magGroup;
    this.magBaseY.usps = -0.078;

    const sightF = new THREE.Mesh(this.geo(makeBeveledBlock(0.006, 0.01, 0.01, 0.001)), tritiumGlow);
    sightF.position.set(0, 0.058, -0.125);
    const sightR = new THREE.Mesh(this.geo(makeBeveledBlock(0.016, 0.009, 0.008, 0.001)), tritiumGlow);
    sightR.position.set(0, 0.057, 0.085);

    const rightArm = this.makeArmAssembly(0.008, -0.082, 0.078, 'right');
    const leftArm = this.makeArmAssembly(-0.022, -0.082, 0.058, 'left');

    group.add(
      frame,
      this.pistolSlide,
      barrel,
      suppressor,
      supRing,
      grip,
      triggerGuard,
      magGroup,
      sightF,
      sightR,
      rightArm,
      leftArm
    );

    const muzzle = new THREE.Object3D();
    muzzle.position.set(0, 0.035, -0.37);
    const eject = new THREE.Object3D();
    eject.position.set(0.024, 0.042, -0.01);
    group.add(muzzle, eject);
    return { group, muzzle, eject };
  }

  private buildMp9(
    gunmetal: THREE.Material,
    darkSteel: THREE.Material,
    polymer: THREE.Material,
    redDotGlow: THREE.Material
  ) {
    const group = new THREE.Group();
    group.position.set(0.22, -0.23, -0.42);

    const receiver = new THREE.Mesh(this.geo(makeBeveledBlock(0.052, 0.078, 0.28, 0.006)), polymer);
    const shroud = new THREE.Mesh(this.geo(new THREE.CylinderGeometry(0.024, 0.026, 0.16, 12)), gunmetal);
    shroud.rotation.x = Math.PI / 2;
    shroud.position.set(0, 0.016, -0.20);
    const barrel = new THREE.Mesh(this.geo(new THREE.CylinderGeometry(0.011, 0.012, 0.12, 10)), darkSteel);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.018, -0.30);

    const foregrip = new THREE.Mesh(this.geo(new THREE.CylinderGeometry(0.014, 0.016, 0.08, 10)), polymer);
    foregrip.position.set(0, -0.052, -0.18);

    const grip = new THREE.Mesh(this.geo(makeBeveledBlock(0.036, 0.105, 0.05, 0.007)), polymer);
    grip.position.set(0, -0.075, 0.05);
    grip.rotation.x = 0.2;

    const magGroup = new THREE.Group();
    const mag = new THREE.Mesh(this.geo(makeBeveledBlock(0.028, 0.18, 0.04, 0.004)), darkSteel);
    magGroup.add(mag);
    magGroup.position.set(0, -0.115, 0.048);
    magGroup.rotation.x = 0.12;
    this.magGroups.mp9 = magGroup;
    this.magBaseY.mp9 = -0.115;

    const optic = new THREE.Mesh(this.geo(new THREE.CylinderGeometry(0.019, 0.019, 0.068, 12)), darkSteel);
    optic.rotation.x = Math.PI / 2;
    optic.position.set(0, 0.06, -0.02);
    const dot = new THREE.Mesh(this.geo(new THREE.SphereGeometry(0.0035, 6, 6)), redDotGlow);
    dot.position.set(0, 0.06, -0.02);

    const rightArm = this.makeArmAssembly(0.01, -0.08, 0.065, 'right');
    const leftArm = this.makeArmAssembly(-0.018, -0.045, -0.18, 'left');

    group.add(receiver, shroud, barrel, foregrip, grip, magGroup, optic, dot, rightArm, leftArm);

    const muzzle = new THREE.Object3D();
    muzzle.position.set(0, 0.018, -0.37);
    const eject = new THREE.Object3D();
    eject.position.set(0.032, 0.02, -0.04);
    group.add(muzzle, eject);
    return { group, muzzle, eject };
  }

  private buildNova(gunmetal: THREE.Material, darkSteel: THREE.Material, polymer: THREE.Material) {
    const group = new THREE.Group();
    group.position.set(0.24, -0.25, -0.45);

    const receiver = new THREE.Mesh(this.geo(makeBeveledBlock(0.056, 0.074, 0.27, 0.008)), gunmetal);
    const barrel = new THREE.Mesh(this.geo(new THREE.CylinderGeometry(0.016, 0.018, 0.54, 12)), darkSteel);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.024, -0.38);

    const tube = new THREE.Mesh(this.geo(new THREE.CylinderGeometry(0.013, 0.013, 0.44, 12)), gunmetal);
    tube.rotation.x = Math.PI / 2;
    tube.position.set(0, -0.01, -0.34);

    this.novaPump = new THREE.Group();
    const pumpBody = new THREE.Mesh(this.geo(new THREE.CylinderGeometry(0.025, 0.025, 0.19, 12)), polymer);
    pumpBody.rotation.x = Math.PI / 2;
    this.novaPump.add(pumpBody);
    this.novaPump.position.set(0, -0.012, -0.30);

    const stock = new THREE.Mesh(this.geo(makeBeveledBlock(0.048, 0.095, 0.28, 0.01)), polymer);
    stock.position.set(0, -0.03, 0.25);
    stock.rotation.x = 0.14;

    const rightArm = this.makeArmAssembly(0.012, -0.048, 0.11, 'right');
    const leftArm = this.makeArmAssembly(-0.018, -0.034, -0.30, 'left');

    group.add(receiver, barrel, tube, this.novaPump, stock, rightArm, leftArm);

    const muzzle = new THREE.Object3D();
    muzzle.position.set(0, 0.024, -0.66);
    const eject = new THREE.Object3D();
    eject.position.set(0.035, 0.018, -0.04);
    group.add(muzzle, eject);
    return { group, muzzle, eject };
  }

  private buildM4a4(
    gunmetal: THREE.Material,
    darkSteel: THREE.Material,
    polymer: THREE.Material,
    tanRail: THREE.Material,
    redDotGlow: THREE.Material
  ) {
    const group = new THREE.Group();
    group.position.set(0.24, -0.24, -0.48);

    const receiver = new THREE.Mesh(this.geo(makeBeveledBlock(0.056, 0.082, 0.34, 0.006)), gunmetal);
    receiver.position.set(0, 0.01, -0.02);

    const handguard = new THREE.Mesh(this.geo(makeBeveledBlock(0.052, 0.058, 0.32, 0.01)), tanRail);
    handguard.position.set(0, 0.018, -0.33);

    const rail = new THREE.Mesh(this.geo(makeBeveledBlock(0.024, 0.014, 0.56, 0.002)), darkSteel);
    rail.position.set(0, 0.058, -0.18);

    const barrel = new THREE.Mesh(this.geo(new THREE.CylinderGeometry(0.011, 0.013, 0.25, 12)), darkSteel);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.02, -0.58);

    const flashHider = new THREE.Mesh(this.geo(new THREE.CylinderGeometry(0.016, 0.014, 0.05, 10)), gunmetal);
    flashHider.rotation.x = Math.PI / 2;
    flashHider.position.set(0, 0.02, -0.71);

    const grip = new THREE.Mesh(this.geo(makeBeveledBlock(0.034, 0.11, 0.052, 0.007)), polymer);
    grip.position.set(0, -0.068, 0.06);
    grip.rotation.x = 0.28;

    const magGroup = new THREE.Group();
    const mag = new THREE.Mesh(this.geo(makeBeveledBlock(0.032, 0.165, 0.066, 0.005)), polymer);
    magGroup.add(mag);
    magGroup.position.set(0, -0.105, -0.11);
    magGroup.rotation.x = -0.18;
    this.magGroups.m4a4 = magGroup;
    this.magBaseY.m4a4 = -0.105;

    const stock = new THREE.Mesh(this.geo(makeBeveledBlock(0.046, 0.09, 0.22, 0.008)), polymer);
    stock.position.set(0, -0.005, 0.24);

    // Holographic Optic Housing
    const opticRing = new THREE.Mesh(this.geo(new THREE.CylinderGeometry(0.022, 0.022, 0.068, 12, 1, true)), darkSteel);
    opticRing.rotation.x = Math.PI / 2;
    opticRing.position.set(0, 0.095, -0.02);
    const opticBase = new THREE.Mesh(this.geo(makeBeveledBlock(0.04, 0.02, 0.08, 0.003)), darkSteel);
    opticBase.position.set(0, 0.07, -0.02);
    const dot = new THREE.Mesh(this.geo(new THREE.SphereGeometry(0.0038, 6, 6)), redDotGlow);
    dot.position.set(0, 0.095, -0.02);

    const rightArm = this.makeArmAssembly(0.01, -0.072, 0.068, 'right');
    const leftArm = this.makeArmAssembly(-0.02, -0.032, -0.32, 'left');

    group.add(
      receiver,
      handguard,
      rail,
      barrel,
      flashHider,
      grip,
      magGroup,
      stock,
      opticRing,
      opticBase,
      dot,
      rightArm,
      leftArm
    );

    const muzzle = new THREE.Object3D();
    muzzle.position.set(0, 0.02, -0.74);
    const eject = new THREE.Object3D();
    eject.position.set(0.034, 0.024, -0.03);
    group.add(muzzle, eject);
    return { group, muzzle, eject };
  }

  private buildAwp(
    gunmetal: THREE.Material,
    darkSteel: THREE.Material,
    oliveStock: THREE.Material,
    polymer: THREE.Material,
    lensMat: THREE.Material
  ) {
    const group = new THREE.Group();
    group.position.set(0.24, -0.25, -0.46);

    const chassis = new THREE.Mesh(this.geo(makeBeveledBlock(0.056, 0.07, 0.62, 0.009)), oliveStock);
    chassis.position.set(0, -0.005, -0.1);
    const butt = new THREE.Mesh(this.geo(makeBeveledBlock(0.05, 0.105, 0.24, 0.01)), oliveStock);
    butt.position.set(0, -0.025, 0.28);
    const receiver = new THREE.Mesh(this.geo(makeBeveledBlock(0.048, 0.046, 0.28, 0.006)), darkSteel);
    receiver.position.set(0, 0.044, -0.04);

    const barrel = new THREE.Mesh(this.geo(new THREE.CylinderGeometry(0.014, 0.017, 0.56, 14)), gunmetal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.04, -0.58);
    const brake = new THREE.Mesh(this.geo(makeBeveledBlock(0.036, 0.03, 0.075, 0.004)), darkSteel);
    brake.position.set(0, 0.04, -0.88);

    this.sniperBolt = new THREE.Group();
    this.sniperBolt.position.set(0.028, 0.048, 0.04);
    const boltStem = new THREE.Mesh(this.geo(new THREE.CylinderGeometry(0.006, 0.006, 0.05, 8)), gunmetal);
    boltStem.rotation.z = Math.PI / 2;
    boltStem.position.x = 0.022;
    const boltKnob = new THREE.Mesh(this.geo(new THREE.SphereGeometry(0.013, 10, 10)), darkSteel);
    boltKnob.position.x = 0.048;
    this.sniperBolt.add(boltStem, boltKnob);

    const magGroup = new THREE.Group();
    const mag = new THREE.Mesh(this.geo(makeBeveledBlock(0.036, 0.09, 0.084, 0.005)), polymer);
    magGroup.add(mag);
    magGroup.position.set(0, -0.076, -0.08);
    this.magGroups.awp = magGroup;
    this.magBaseY.awp = -0.076;

    const scopeTube = new THREE.Mesh(this.geo(new THREE.CylinderGeometry(0.02, 0.02, 0.34, 16)), darkSteel);
    scopeTube.rotation.x = Math.PI / 2;
    scopeTube.position.set(0, 0.106, -0.06);
    const scopeBell = new THREE.Mesh(this.geo(new THREE.CylinderGeometry(0.03, 0.022, 0.09, 16)), darkSteel);
    scopeBell.rotation.x = Math.PI / 2;
    scopeBell.position.set(0, 0.106, -0.26);
    const rearLens = new THREE.Mesh(this.geo(new THREE.CircleGeometry(0.018, 14)), lensMat);
    rearLens.position.set(0, 0.106, 0.111);

    const rightArm = this.makeArmAssembly(0.012, -0.065, 0.09, 'right');
    const leftArm = this.makeArmAssembly(-0.02, -0.042, -0.34, 'left');

    group.add(
      chassis,
      butt,
      receiver,
      barrel,
      brake,
      this.sniperBolt,
      magGroup,
      scopeTube,
      scopeBell,
      rearLens,
      rightArm,
      leftArm
    );

    const muzzle = new THREE.Object3D();
    muzzle.position.set(0, 0.04, -0.93);
    const eject = new THREE.Object3D();
    eject.position.set(0.032, 0.048, -0.02);
    group.add(muzzle, eject);
    return { group, muzzle, eject };
  }

  public setWeapon(id: WeaponId, animateDraw = true): void {
    this.activeWeapon = id;
    (Object.keys(this.models) as WeaponId[]).forEach((k) => {
      this.models[k].visible = k === id;
    });
    if (animateDraw) this.drawProgress = 0;
    this.recoilKickZ = 0;
    this.recoilKickPitch = 0;
  }

  public setScopedHidden(hidden: boolean): void {
    this.root.visible = !hidden;
  }

  public triggerThrowAnimation(): void {
    this.grenadeThrowTimer = 0.28;
  }

  public triggerFire(weapon: WeaponId): void {
    if (weapon === 'knife') {
      this.meleeSlashTimer = 0.28;
      return;
    }

    if (weapon === 'usps') {
      this.recoilKickZ = 0.05;
      this.recoilKickPitch = 0.12;
    } else if (weapon === 'mp9') {
      this.recoilKickZ = 0.036;
      this.recoilKickPitch = 0.068;
    } else if (weapon === 'nova') {
      this.recoilKickZ = 0.115;
      this.recoilKickPitch = 0.22;
      this.boltCycleTimer = 0.6;
    } else if (weapon === 'm4a4') {
      this.recoilKickZ = 0.048;
      this.recoilKickPitch = 0.085;
    } else {
      this.recoilKickZ = 0.135;
      this.recoilKickPitch = 0.24;
      this.boltCycleTimer = 0.9;
    }

    const anchor = this.muzzleAnchors[weapon];
    const model = this.models[weapon];
    this.muzzleFlashGroup.position.copy(model.position).add(anchor.position);
    this.muzzleFlashGroup.rotation.z = Math.random() * Math.PI * 2;
    const scale = weapon === 'usps' ? 0.32 : weapon === 'awp' ? 1.45 : weapon === 'nova' ? 1.3 : 1.0;
    this.muzzleFlashGroup.scale.setScalar(scale);
    this.muzzleFlashGroup.visible = true;

    this.muzzleLight.position.copy(this.muzzleFlashGroup.position);
    this.muzzleLight.intensity = weapon === 'usps' ? 1.5 : weapon === 'awp' ? 5.8 : 3.8;
    this.muzzleFlashTimer = 0.045;
  }

  public addLookSway(dx: number, dy: number): void {
    this.swayX = THREE.MathUtils.clamp(this.swayX - dx * 0.00018, -0.032, 0.032);
    this.swayY = THREE.MathUtils.clamp(this.swayY + dy * 0.00018, -0.026, 0.026);
  }

  public getMuzzleWorldPosition(target: THREE.Vector3): THREE.Vector3 {
    this.muzzleAnchors[this.activeWeapon].getWorldPosition(target);
    return target;
  }

  public getEjectWorldPosition(target: THREE.Vector3): THREE.Vector3 {
    this.ejectAnchors[this.activeWeapon].getWorldPosition(target);
    return target;
  }

  public update(
    dt: number,
    moveSpeedRatio: number,
    grounded: boolean,
    isCrouching: boolean,
    isReloading: boolean,
    reloadProgress: number
  ): void {
    this.idleTime += dt;
    this.recoilKickZ = THREE.MathUtils.damp(this.recoilKickZ, 0, 16, dt);
    this.recoilKickPitch = THREE.MathUtils.damp(this.recoilKickPitch, 0, 15, dt);
    this.swayX = THREE.MathUtils.damp(this.swayX, 0, 10, dt);
    this.swayY = THREE.MathUtils.damp(this.swayY, 0, 10, dt);

    if (this.drawProgress < 1) {
      this.drawProgress = Math.min(1, this.drawProgress + dt * 5.2);
    }

    if (grounded && moveSpeedRatio > 0.08) {
      this.bobPhase += dt * (7.4 + moveSpeedRatio * 4.5);
    }
    const bobAmp = grounded ? moveSpeedRatio * (isCrouching ? 0.005 : 0.012) : 0;
    const idleBreathY = Math.sin(this.idleTime * 1.9) * 0.0022;
    const bobX = Math.cos(this.bobPhase) * bobAmp;
    const bobY = Math.abs(Math.sin(this.bobPhase)) * bobAmp;

    const reloadArc = isReloading ? Math.sin(reloadProgress * Math.PI) : 0;
    const drawOffset = (1 - this.drawProgress) * (1 - this.drawProgress);

    let slashPitch = 0;
    let slashYaw = 0;
    let slashFwd = 0;
    if (this.meleeSlashTimer > 0) {
      this.meleeSlashTimer = Math.max(0, this.meleeSlashTimer - dt);
      const t = Math.sin((1 - this.meleeSlashTimer / 0.28) * Math.PI);
      slashPitch = -t * 0.55;
      slashYaw = t * 0.45;
      slashFwd = -t * 0.18;
    }

    let throwDip = 0;
    if (this.grenadeThrowTimer > 0) {
      this.grenadeThrowTimer = Math.max(0, this.grenadeThrowTimer - dt);
      throwDip = Math.sin((this.grenadeThrowTimer / 0.28) * Math.PI) * 0.16;
    }

    this.root.position.set(
      this.swayX + bobX,
      this.swayY + idleBreathY - bobY - reloadArc * 0.11 - drawOffset * 0.22 - throwDip,
      this.recoilKickZ + slashFwd
    );
    this.root.rotation.set(
      this.recoilKickPitch - reloadArc * 0.36 - drawOffset * 0.45 + slashPitch,
      -this.swayX * 1.4 + slashYaw,
      reloadArc * 0.42
    );

    // Magazine drop-out and re-insert animation during reload
    const magGrp = this.magGroups[this.activeWeapon];
    const baseY = this.magBaseY[this.activeWeapon];
    if (magGrp && baseY !== undefined) {
      if (isReloading) {
        const dropPhase = Math.sin(Math.min(1, reloadProgress / 0.78) * Math.PI);
        magGrp.position.y = baseY - dropPhase * 0.16;
      } else {
        magGrp.position.y = baseY;
      }
    }

    if (this.activeWeapon === 'usps') {
      this.pistolSlide.position.z = -0.02 + this.recoilKickZ * 0.75;
    }

    if (this.boltCycleTimer > 0) {
      this.boltCycleTimer = Math.max(0, this.boltCycleTimer - dt);
      if (this.activeWeapon === 'awp') {
        const t = 1 - this.boltCycleTimer / 0.9;
        if (t > 0.25 && t < 0.85) {
          const pull = Math.sin(((t - 0.25) / 0.6) * Math.PI);
          this.sniperBolt.rotation.z = pull * 0.95;
          this.sniperBolt.position.z = 0.04 + pull * 0.075;
        } else {
          this.sniperBolt.rotation.z = 0;
          this.sniperBolt.position.z = 0.04;
        }
      } else if (this.activeWeapon === 'nova') {
        const t = 1 - this.boltCycleTimer / 0.6;
        const pump = Math.sin(t * Math.PI) * 0.085;
        this.novaPump.position.z = -0.3 + pump;
      }
    }

    if (this.muzzleFlashTimer > 0) {
      this.muzzleFlashTimer -= dt;
      if (this.muzzleFlashTimer <= 0) {
        this.muzzleFlashGroup.visible = false;
        this.muzzleLight.intensity = 0;
      }
    }
  }

  public dispose(): void {
    this.geometries.forEach((g) => g.dispose());
    this.materials.forEach((m) => m.dispose());
    this.textures.forEach((t) => t.dispose());
    this.sleeveTex?.dispose();
    this.sleeveBump?.dispose();
  }
}
