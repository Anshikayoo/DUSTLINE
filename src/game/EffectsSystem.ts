import * as THREE from 'three';
import { AABB, GrenadeId, SurfaceType, WeaponId, WeatherType } from './types';

/**
 * ============================================================================
 * SECTION: POOLED VFX, SHELL CASINGS, SURFACE IMPACTS, WEATHER & DROPPED GUNS
 * ============================================================================
 */

interface ParticleItem {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  gravity: number;
}

interface ShellCasingItem {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  rotVel: THREE.Vector3;
  life: number;
  bounced: boolean;
}

interface TracerItem {
  line: THREE.Line;
  positions: Float32Array;
  life: number;
  maxLife: number;
  mat: THREE.LineBasicMaterial;
}

interface DecalItem {
  mesh: THREE.Mesh;
  age: number;
}

interface ShockwaveItem {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  life: number;
  maxLife: number;
  maxScale: number;
}

export interface SmokeCloud {
  group: THREE.Group;
  center: THREE.Vector3;
  radius: number;
  life: number;
  maxLife: number;
}

export interface ActiveGrenade {
  id: GrenadeId;
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  fuse: number;
  ownerIsPlayer: boolean;
}

export interface DroppedWeapon {
  uid: number;
  weaponId: WeaponId;
  ammo: number;
  reserve: number;
  group: THREE.Group;
  position: THREE.Vector3;
  age: number;
}

const _up = new THREE.Vector3(0, 0, 1);
const _quat = new THREE.Quaternion();
const _offset = new THREE.Vector3();
const _segDir = new THREE.Vector3();
const _toCenter = new THREE.Vector3();
const _weatherDummy = new THREE.Object3D();

export class EffectsSystem {
  private scene: THREE.Scene;
  private particles: ParticleItem[] = [];
  private shells: ShellCasingItem[] = [];
  private tracers: TracerItem[] = [];
  private decals: DecalItem[] = [];
  private shockwaves: ShockwaveItem[] = [];
  private nextDecalIdx = 0;

  public activeSmokes: SmokeCloud[] = [];
  public activeGrenades: ActiveGrenade[] = [];
  public droppedWeapons: DroppedWeapon[] = [];
  private nextDropUid = 1;

  // Weather InstancedMesh
  private weatherInst: THREE.InstancedMesh | null = null;
  private weatherType: WeatherType = 'none';
  private weatherCount = 0;
  private weatherHalfSize = 88;
  private weatherPositions: Float32Array = new Float32Array(0);
  private weatherSpeeds: Float32Array = new Float32Array(0);

  // Planted C4 Bomb 3D Model
  public c4Group: THREE.Group;
  private c4LedMat: THREE.MeshBasicMaterial;
  private c4LedMesh: THREE.Mesh;

  private particleGeo: THREE.BoxGeometry;
  private shellGeo: THREE.CylinderGeometry;
  private decalGeo: THREE.CircleGeometry;
  private smokeGeo: THREE.SphereGeometry;
  private grenadeGeo: THREE.CylinderGeometry;
  private shockwaveGeo: THREE.SphereGeometry;
  private pickupBodyGeo: THREE.BoxGeometry;
  private pickupBarrelGeo: THREE.CylinderGeometry;
  private pickupRingGeo: THREE.RingGeometry;
  private weatherGeo: THREE.BoxGeometry;

  private decalMat: THREE.MeshBasicMaterial;
  private sparkMat: THREE.MeshBasicMaterial;
  private dustMat: THREE.MeshStandardMaterial;
  private snowMat: THREE.MeshStandardMaterial;
  private woodChipMat: THREE.MeshStandardMaterial;
  private bloodMat: THREE.MeshStandardMaterial;
  private fireMat: THREE.MeshBasicMaterial;
  private smokeMat: THREE.MeshStandardMaterial;
  private brassMat: THREE.MeshStandardMaterial;
  private weatherMat: THREE.MeshBasicMaterial;
  private grenadeMats: Record<GrenadeId, THREE.MeshStandardMaterial>;
  private pickupGunMat: THREE.MeshStandardMaterial;
  private pickupRingMat: THREE.MeshBasicMaterial;
  private c4Mats: THREE.Material[] = [];
  private c4Geos: THREE.BufferGeometry[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.particleGeo = new THREE.BoxGeometry(0.075, 0.075, 0.075);
    this.shellGeo = new THREE.CylinderGeometry(0.008, 0.009, 0.036, 6);
    this.decalGeo = new THREE.CircleGeometry(0.075, 10);
    this.smokeGeo = new THREE.SphereGeometry(1.0, 14, 10);
    this.grenadeGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.18, 10);
    this.shockwaveGeo = new THREE.SphereGeometry(1.0, 16, 12);
    this.pickupBodyGeo = new THREE.BoxGeometry(0.09, 0.11, 0.42);
    this.pickupBarrelGeo = new THREE.CylinderGeometry(0.022, 0.025, 0.34, 8);
    this.pickupBarrelGeo.rotateX(Math.PI / 2);
    this.pickupRingGeo = new THREE.RingGeometry(0.34, 0.44, 18);
    this.weatherGeo = new THREE.BoxGeometry(0.06, 0.06, 0.06);

    this.decalMat = new THREE.MeshBasicMaterial({
      color: 0x151412,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.sparkMat = new THREE.MeshBasicMaterial({ color: 0xffda7b });
    this.dustMat = new THREE.MeshStandardMaterial({ color: 0xd6bfa0, roughness: 0.95 });
    this.snowMat = new THREE.MeshStandardMaterial({ color: 0xedf4fc, roughness: 0.9 });
    this.woodChipMat = new THREE.MeshStandardMaterial({ color: 0x9b6e3f, roughness: 0.9 });
    this.bloodMat = new THREE.MeshStandardMaterial({ color: 0x9e1616, roughness: 0.55 });
    this.fireMat = new THREE.MeshBasicMaterial({ color: 0xff6a1a });
    this.smokeMat = new THREE.MeshStandardMaterial({
      color: 0xcbd2d9,
      roughness: 0.98,
      transparent: true,
      opacity: 0.86,
      depthWrite: false,
    });
    this.brassMat = new THREE.MeshStandardMaterial({
      color: 0xd6ad4f,
      roughness: 0.25,
      metalness: 0.9,
    });
    this.weatherMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    this.grenadeMats = {
      smoke: new THREE.MeshStandardMaterial({ color: 0x4b6b58, roughness: 0.6 }),
      flash: new THREE.MeshStandardMaterial({ color: 0x9ca6b3, roughness: 0.4, metalness: 0.4 }),
      he: new THREE.MeshStandardMaterial({ color: 0x8f3a2e, roughness: 0.6 }),
    };
    this.pickupGunMat = new THREE.MeshStandardMaterial({
      color: 0x262b33,
      roughness: 0.35,
      metalness: 0.84,
    });
    this.pickupRingMat = new THREE.MeshBasicMaterial({
      color: 0x6cb8eb,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.74,
    });

    // Pools
    for (let i = 0; i < 48; i++) {
      const mesh = new THREE.Mesh(this.decalGeo, this.decalMat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.decals.push({ mesh, age: 0 });
    }

    for (let i = 0; i < 32; i++) {
      const positions = new Float32Array(6);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const mat = new THREE.LineBasicMaterial({ color: 0xffe29a, transparent: true, opacity: 0 });
      const line = new THREE.Line(geo, mat);
      line.visible = false;
      line.frustumCulled = false;
      this.scene.add(line);
      this.tracers.push({ line, positions, life: 0, maxLife: 0.09, mat });
    }

    for (let i = 0; i < 140; i++) {
      const mesh = new THREE.Mesh(this.particleGeo, this.dustMat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.particles.push({ mesh, vel: new THREE.Vector3(), life: 0, maxLife: 0.4, gravity: 14 });
    }

    for (let i = 0; i < 36; i++) {
      const mesh = new THREE.Mesh(this.shellGeo, this.brassMat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.shells.push({
        mesh,
        vel: new THREE.Vector3(),
        rotVel: new THREE.Vector3(),
        life: 0,
        bounced: false,
      });
    }

    for (let i = 0; i < 6; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xff8c38,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(this.shockwaveGeo, mat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.shockwaves.push({ mesh, mat, life: 0, maxLife: 0.35, maxScale: 6 });
    }

    // Build Composite C4 Explosive Package
    this.c4Group = new THREE.Group();
    const c4BodyGeo = new THREE.BoxGeometry(0.32, 0.11, 0.22);
    const c4PadGeo = new THREE.BoxGeometry(0.14, 0.04, 0.14);
    const c4LedGeo = new THREE.SphereGeometry(0.032, 8, 8);
    this.c4Geos.push(c4BodyGeo, c4PadGeo, c4LedGeo);

    const c4BodyMat = new THREE.MeshStandardMaterial({ color: 0x454e38, roughness: 0.78 });
    const c4PadMat = new THREE.MeshStandardMaterial({ color: 0x1b1e24, roughness: 0.5 });
    this.c4LedMat = new THREE.MeshBasicMaterial({ color: 0xff2b2b });
    this.c4Mats.push(c4BodyMat, c4PadMat, this.c4LedMat);

    const c4Body = new THREE.Mesh(c4BodyGeo, c4BodyMat);
    c4Body.position.y = 0.055;
    const c4Pad = new THREE.Mesh(c4PadGeo, c4PadMat);
    c4Pad.position.set(-0.04, 0.125, 0);
    this.c4LedMesh = new THREE.Mesh(c4LedGeo, this.c4LedMat);
    this.c4LedMesh.position.set(0.09, 0.125, 0);
    this.c4Group.add(c4Body, c4Pad, this.c4LedMesh);
    this.c4Group.visible = false;
    this.scene.add(this.c4Group);
  }

  public configureWeather(type: WeatherType, count: number, halfSize: number): void {
    if (this.weatherInst) {
      this.scene.remove(this.weatherInst);
      this.weatherInst.dispose();
      this.weatherInst = null;
    }
    this.weatherType = type;
    this.weatherCount = count;
    this.weatherHalfSize = halfSize;

    if (type === 'none' || count <= 0) return;

    this.weatherMat.color.setHex(
      type === 'snow'
        ? 0xf0f6ff
        : type === 'ash'
          ? 0xff7b29
          : type === 'rain'
            ? 0x94c5eb
            : type === 'spores'
              ? 0xaef59e
              : 0xdcc39b
    );
    this.weatherMat.opacity = type === 'rain' ? 0.42 : type === 'snow' ? 0.72 : 0.55;

    this.weatherInst = new THREE.InstancedMesh(this.weatherGeo, this.weatherMat, count);
    this.weatherInst.frustumCulled = false;
    this.weatherPositions = new Float32Array(count * 3);
    this.weatherSpeeds = new Float32Array(count * 3);

    const span = halfSize * 1.9;
    for (let i = 0; i < count; i++) {
      this.weatherPositions[i * 3] = (Math.random() - 0.5) * span;
      this.weatherPositions[i * 3 + 1] = Math.random() * 24;
      this.weatherPositions[i * 3 + 2] = (Math.random() - 0.5) * span;

      if (type === 'rain') {
        this.weatherSpeeds[i * 3] = 0.6;
        this.weatherSpeeds[i * 3 + 1] = -(16 + Math.random() * 6);
        this.weatherSpeeds[i * 3 + 2] = 0.4;
      } else if (type === 'snow') {
        this.weatherSpeeds[i * 3] = (Math.random() - 0.5) * 1.4;
        this.weatherSpeeds[i * 3 + 1] = -(1.8 + Math.random() * 1.6);
        this.weatherSpeeds[i * 3 + 2] = (Math.random() - 0.5) * 1.4;
      } else if (type === 'ash') {
        this.weatherSpeeds[i * 3] = (Math.random() - 0.5) * 2.2;
        this.weatherSpeeds[i * 3 + 1] = 1.4 + Math.random() * 2.2;
        this.weatherSpeeds[i * 3 + 2] = (Math.random() - 0.5) * 2.2;
      } else {
        this.weatherSpeeds[i * 3] = 1.8 + Math.random() * 1.6;
        this.weatherSpeeds[i * 3 + 1] = (Math.random() - 0.5) * 0.6;
        this.weatherSpeeds[i * 3 + 2] = (Math.random() - 0.5) * 1.2;
      }
    }
    this.scene.add(this.weatherInst);
  }

  public spawnShellCasing(origin: THREE.Vector3, rightDir: THREE.Vector3, upDir: THREE.Vector3): void {
    const slot = this.shells.find((s) => s.life <= 0) || this.shells[0];
    slot.mesh.position.copy(origin);
    slot.mesh.visible = true;
    slot.vel
      .copy(rightDir)
      .multiplyScalar(2.3 + Math.random() * 0.9)
      .addScaledVector(upDir, 1.4 + Math.random() * 0.7);
    slot.rotVel.set(12 + Math.random() * 10, 8 + Math.random() * 8, 15 + Math.random() * 10);
    slot.life = 1.4;
    slot.bounced = false;
  }

  public spawnTracer(start: THREE.Vector3, end: THREE.Vector3, isEnemy = false): void {
    const slot = this.tracers.find((t) => t.life <= 0) || this.tracers[0];
    slot.positions[0] = start.x;
    slot.positions[1] = start.y;
    slot.positions[2] = start.z;
    slot.positions[3] = end.x;
    slot.positions[4] = end.y;
    slot.positions[5] = end.z;
    slot.line.geometry.attributes.position.needsUpdate = true;
    slot.mat.color.setHex(isEnemy ? 0xff9b52 : 0xfff0b8);
    slot.mat.opacity = isEnemy ? 0.8 : 0.72;
    slot.maxLife = isEnemy ? 0.11 : 0.08;
    slot.life = slot.maxLife;
    slot.line.visible = true;
  }

  public spawnWallImpact(
    point: THREE.Vector3,
    normal: THREE.Vector3,
    surface: SurfaceType = 'concrete',
    isSnow = false
  ): void {
    const decal = this.decals[this.nextDecalIdx];
    this.nextDecalIdx = (this.nextDecalIdx + 1) % this.decals.length;

    _offset.copy(normal).multiplyScalar(0.015);
    decal.mesh.position.copy(point).add(_offset);
    _quat.setFromUnitVectors(_up, normal);
    decal.mesh.quaternion.copy(_quat);
    decal.mesh.scale.setScalar(0.8 + Math.random() * 0.5);
    decal.mesh.visible = true;
    decal.age = 0;

    const kind =
      surface === 'metal'
        ? 'metal'
        : isSnow
          ? 'snow'
          : surface === 'gravel'
            ? 'wood'
            : 'wall';
    this.spawnBurst(point, normal, 7, kind);
  }

  public spawnFootstepDust(pos: THREE.Vector3, surface: SurfaceType, isSnow = false): void {
    this.spawnBurst(
      new THREE.Vector3(pos.x, pos.y + 0.06, pos.z),
      new THREE.Vector3(0, 1, 0),
      3,
      isSnow ? 'snow' : surface === 'metal' ? 'metal' : 'wall'
    );
  }

  public spawnBloodImpact(
    point: THREE.Vector3,
    dir: THREE.Vector3,
    headshot: boolean,
    bloodEnabled = true
  ): void {
    if (!bloodEnabled) {
      this.spawnBurst(point, dir, 5, 'metal');
      return;
    }
    this.spawnBurst(point, dir, headshot ? 14 : 8, 'blood');
  }

  public spawnExplosionEffect(center: THREE.Vector3, isMassiveC4 = false): void {
    this.spawnBurst(center, new THREE.Vector3(0, 1, 0), isMassiveC4 ? 52 : 28, 'fire');
    const sw = this.shockwaves.find((s) => s.life <= 0) || this.shockwaves[0];
    sw.mesh.position.copy(center);
    sw.mesh.scale.setScalar(0.4);
    sw.maxScale = isMassiveC4 ? 18 : 6.5;
    sw.maxLife = isMassiveC4 ? 0.65 : 0.35;
    sw.life = sw.maxLife;
    sw.mat.opacity = 0.72;
    sw.mesh.visible = true;
  }

  public spawnSmokeCloud(center: THREE.Vector3): void {
    const group = new THREE.Group();
    group.position.set(center.x, Math.max(0.4, center.y), center.z);
    const puffs: [number, number, number, number][] = [
      [0, 1.15, 0, 2.65],
      [-1.4, 0.95, 0.85, 2.0],
      [1.4, 1.05, -0.75, 2.0],
      [0.65, 1.5, 1.3, 1.9],
      [-0.85, 1.35, -1.2, 1.95],
      [0, 2.0, 0, 1.75],
    ];
    for (const [px, py, pz, r] of puffs) {
      const m = new THREE.Mesh(this.smokeGeo, this.smokeMat);
      m.position.set(px, py, pz);
      m.scale.setScalar(r);
      group.add(m);
    }
    this.scene.add(group);
    this.activeSmokes.push({
      group,
      center: group.position.clone().add(new THREE.Vector3(0, 1.15, 0)),
      radius: 3.6,
      life: 13.0,
      maxLife: 13.0,
    });
  }

  public isBlockedBySmoke(a: THREE.Vector3, b: THREE.Vector3): boolean {
    if (this.activeSmokes.length === 0) return false;
    _segDir.subVectors(b, a);
    const segLen = _segDir.length();
    if (segLen < 0.01) return false;
    _segDir.divideScalar(segLen);

    for (let i = 0; i < this.activeSmokes.length; i++) {
      const s = this.activeSmokes[i];
      _toCenter.subVectors(s.center, a);
      const proj = THREE.MathUtils.clamp(_toCenter.dot(_segDir), 0, segLen);
      const cx = a.x + _segDir.x * proj - s.center.x;
      const cy = a.y + _segDir.y * proj - s.center.y;
      const cz = a.z + _segDir.z * proj - s.center.z;
      if (cx * cx + cy * cy + cz * cz <= s.radius * s.radius) {
        return true;
      }
    }
    return false;
  }

  public spawnThrownGrenade(
    id: GrenadeId,
    origin: THREE.Vector3,
    velocity: THREE.Vector3,
    ownerIsPlayer: boolean
  ): void {
    const mesh = new THREE.Mesh(this.grenadeGeo, this.grenadeMats[id]);
    mesh.position.copy(origin);
    this.scene.add(mesh);
    this.activeGrenades.push({
      id,
      mesh,
      vel: velocity.clone(),
      fuse: id === 'flash' ? 1.45 : 1.75,
      ownerIsPlayer,
    });
  }

  public spawnDroppedWeapon(
    weaponId: WeaponId,
    ammo: number,
    reserve: number,
    pos: THREE.Vector3,
    forwardDir?: THREE.Vector3,
    mapHalfSize = 88
  ): void {
    const group = new THREE.Group();
    const gunSubGroup = new THREE.Group();

    const body = new THREE.Mesh(this.pickupBodyGeo, this.pickupGunMat);
    const barrel = new THREE.Mesh(this.pickupBarrelGeo, this.pickupGunMat);
    barrel.position.set(0, 0.03, 0.28);
    gunSubGroup.add(body, barrel);
    gunSubGroup.position.y = 0.16;

    if (weaponId === 'awp') gunSubGroup.scale.set(1.1, 1.1, 1.45);
    else if (weaponId === 'usps') gunSubGroup.scale.set(0.75, 0.8, 0.65);
    else if (weaponId === 'mp9') gunSubGroup.scale.set(0.9, 0.95, 0.78);

    const ring = new THREE.Mesh(this.pickupRingGeo, this.pickupRingMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    group.add(gunSubGroup, ring);

    const dropPos = pos.clone();
    if (forwardDir) {
      dropPos.x += forwardDir.x * 1.15;
      dropPos.z += forwardDir.z * 1.15;
    }
    const clampLim = mapHalfSize - 2.5;
    dropPos.x = THREE.MathUtils.clamp(dropPos.x, -clampLim, clampLim);
    dropPos.z = THREE.MathUtils.clamp(dropPos.z, -clampLim, clampLim);
    dropPos.y = Math.max(0, pos.y);

    group.position.copy(dropPos);
    group.rotation.y = Math.random() * Math.PI * 2;
    this.scene.add(group);

    this.droppedWeapons.push({
      uid: this.nextDropUid++,
      weaponId,
      ammo,
      reserve,
      group,
      position: dropPos,
      age: 0,
    });
  }

  public removeDroppedWeapon(uid: number): void {
    const idx = this.droppedWeapons.findIndex((d) => d.uid === uid);
    if (idx === -1) return;
    this.scene.remove(this.droppedWeapons[idx].group);
    this.droppedWeapons.splice(idx, 1);
  }

  public setPlantedC4(pos: THREE.Vector3 | null, blinkOn: boolean): void {
    if (!pos) {
      this.c4Group.visible = false;
      return;
    }
    this.c4Group.visible = true;
    this.c4Group.position.copy(pos);
    this.c4LedMesh.visible = blinkOn;
  }

  private spawnBurst(
    origin: THREE.Vector3,
    normal: THREE.Vector3,
    count: number,
    kind: 'wall' | 'metal' | 'wood' | 'snow' | 'blood' | 'fire'
  ): void {
    let spawned = 0;
    for (let i = 0; i < this.particles.length && spawned < count; i++) {
      const p = this.particles[i];
      if (p.life > 0) continue;

      p.mesh.position.copy(origin);
      p.mesh.visible = true;

      if (kind === 'blood') {
        p.mesh.material = this.bloodMat;
        p.mesh.scale.setScalar(0.9 + Math.random() * 1.1);
        p.maxLife = 0.34 + Math.random() * 0.2;
        p.gravity = 13;
        p.vel.set(
          normal.x * 2 + (Math.random() - 0.5) * 4,
          1.2 + Math.random() * 2.5,
          normal.z * 2 + (Math.random() - 0.5) * 4
        );
      } else if (kind === 'fire') {
        p.mesh.material = spawned % 2 === 0 ? this.fireMat : this.sparkMat;
        p.mesh.scale.setScalar(2.4 + Math.random() * 3.0);
        p.maxLife = 0.45 + Math.random() * 0.4;
        p.gravity = 9;
        p.vel.set((Math.random() - 0.5) * 14, 3.0 + Math.random() * 9.0, (Math.random() - 0.5) * 14);
      } else if (kind === 'metal') {
        p.mesh.material = this.sparkMat;
        p.mesh.scale.setScalar(0.55 + Math.random() * 0.4);
        p.maxLife = 0.22 + Math.random() * 0.14;
        p.gravity = 19;
        p.vel.set(
          normal.x * (3.5 + Math.random() * 4) + (Math.random() - 0.5) * 4.5,
          normal.y * 2.5 + 1.5 + Math.random() * 2.5,
          normal.z * (3.5 + Math.random() * 4) + (Math.random() - 0.5) * 4.5
        );
      } else if (kind === 'snow') {
        p.mesh.material = this.snowMat;
        p.mesh.scale.setScalar(1.2 + Math.random() * 1.0);
        p.maxLife = 0.42;
        p.gravity = 7.5;
        p.vel.set(
          normal.x * 2 + (Math.random() - 0.5) * 2.6,
          1.5 + Math.random() * 2.2,
          normal.z * 2 + (Math.random() - 0.5) * 2.6
        );
      } else if (kind === 'wood') {
        p.mesh.material = spawned < 2 ? this.sparkMat : this.woodChipMat;
        p.mesh.scale.setScalar(0.9 + Math.random() * 0.8);
        p.maxLife = 0.35;
        p.gravity = 12;
        p.vel.set(
          normal.x * 2.8 + (Math.random() - 0.5) * 3.2,
          normal.y * 2.0 + 1.0 + Math.random() * 2.2,
          normal.z * 2.8 + (Math.random() - 0.5) * 3.2
        );
      } else {
        const isSpark = spawned < 2;
        p.mesh.material = isSpark ? this.sparkMat : this.dustMat;
        p.mesh.scale.setScalar(isSpark ? 0.55 : 1.0 + Math.random() * 0.9);
        p.maxLife = isSpark ? 0.18 : 0.36;
        p.gravity = isSpark ? 18 : 9;
        p.vel.set(
          normal.x * (2.5 + Math.random() * 3) + (Math.random() - 0.5) * 3,
          normal.y * 2.2 + 1 + Math.random() * 2.4,
          normal.z * (2.5 + Math.random() * 3) + (Math.random() - 0.5) * 3
        );
      }
      p.life = p.maxLife;
      spawned++;
    }
  }

  public clearRoundEffects(): void {
    for (const d of this.decals) d.mesh.visible = false;
    for (const s of this.shells) {
      s.life = 0;
      s.mesh.visible = false;
    }
    for (const s of this.activeSmokes) this.scene.remove(s.group);
    this.activeSmokes = [];
    for (const g of this.activeGrenades) this.scene.remove(g.mesh);
    this.activeGrenades = [];
    for (const dw of this.droppedWeapons) this.scene.remove(dw.group);
    this.droppedWeapons = [];
    this.c4Group.visible = false;
  }

  public updateWeatherOnly(dt: number): void {
    if (this.weatherInst && this.weatherCount > 0) {
      const span = this.weatherHalfSize * 1.9;
      const halfSpan = span * 0.5;
      const sy = this.weatherType === 'rain' ? 4.5 : this.weatherType === 'snow' ? 1.1 : 0.85;
      const sx = this.weatherType === 'rain' ? 0.28 : 1.0;

      for (let i = 0; i < this.weatherCount; i++) {
        const idx = i * 3;
        this.weatherPositions[idx] += this.weatherSpeeds[idx] * dt;
        this.weatherPositions[idx + 1] += this.weatherSpeeds[idx + 1] * dt;
        this.weatherPositions[idx + 2] += this.weatherSpeeds[idx + 2] * dt;

        if (this.weatherPositions[idx + 1] < 0) this.weatherPositions[idx + 1] = 24;
        else if (this.weatherPositions[idx + 1] > 24) this.weatherPositions[idx + 1] = 0.2;
        if (this.weatherPositions[idx] > halfSpan) this.weatherPositions[idx] -= span;
        else if (this.weatherPositions[idx] < -halfSpan) this.weatherPositions[idx] += span;
        if (this.weatherPositions[idx + 2] > halfSpan) this.weatherPositions[idx + 2] -= span;
        else if (this.weatherPositions[idx + 2] < -halfSpan) this.weatherPositions[idx + 2] += span;

        _weatherDummy.position.set(
          this.weatherPositions[idx],
          this.weatherPositions[idx + 1],
          this.weatherPositions[idx + 2]
        );
        _weatherDummy.scale.set(sx, sy, sx);
        _weatherDummy.updateMatrix();
        this.weatherInst.setMatrixAt(i, _weatherDummy.matrix);
      }
      this.weatherInst.instanceMatrix.needsUpdate = true;
    }
  }

  public update(
    dt: number,
    colliders: AABB[],
    onGrenadeBounce: () => void,
    onGrenadeDetonate: (g: ActiveGrenade) => void,
    onShellBounce?: (pos: THREE.Vector3) => void
  ): void {
    this.updateWeatherOnly(dt);

    // Shockwaves
    for (const sw of this.shockwaves) {
      if (sw.life > 0) {
        sw.life -= dt;
        if (sw.life <= 0) {
          sw.mesh.visible = false;
        } else {
          const p = 1 - sw.life / sw.maxLife;
          sw.mesh.scale.setScalar(0.5 + p * sw.maxScale);
          sw.mat.opacity = (1 - p) * 0.65;
        }
      }
    }

    // Brass shell casings
    for (const s of this.shells) {
      if (s.life > 0) {
        s.life -= dt;
        if (s.life <= 0) {
          s.mesh.visible = false;
        } else {
          s.vel.y -= 14 * dt;
          s.mesh.position.addScaledVector(s.vel, dt);
          s.mesh.rotation.x += s.rotVel.x * dt;
          s.mesh.rotation.y += s.rotVel.y * dt;
          s.mesh.rotation.z += s.rotVel.z * dt;
          if (s.mesh.position.y < 0.02) {
            s.mesh.position.y = 0.02;
            if (!s.bounced) {
              s.bounced = true;
              onShellBounce?.(s.mesh.position);
            }
            s.vel.y *= -0.35;
            s.vel.x *= 0.55;
            s.vel.z *= 0.55;
          }
        }
      }
    }

    // Tracers
    for (const t of this.tracers) {
      if (t.life > 0) {
        t.life -= dt;
        if (t.life <= 0) t.line.visible = false;
        else t.mat.opacity = (t.life / t.maxLife) * 0.8;
      }
    }

    // Particles
    for (const p of this.particles) {
      if (p.life > 0) {
        p.life -= dt;
        if (p.life <= 0) p.mesh.visible = false;
        else {
          p.vel.y -= p.gravity * dt;
          p.mesh.position.addScaledVector(p.vel, dt);
          if (p.mesh.position.y < 0.03) {
            p.mesh.position.y = 0.03;
            p.vel.y *= -0.25;
            p.vel.x *= 0.6;
            p.vel.z *= 0.6;
          }
        }
      }
    }

    // Gentle hover spin on dropped weapons
    for (const dw of this.droppedWeapons) {
      dw.age += dt;
      dw.group.children[0].rotation.y += dt * 1.1;
      dw.group.children[0].position.y = 0.16 + Math.sin(dw.age * 3) * 0.035;
    }

    // Smoke cloud fadeout
    for (let i = this.activeSmokes.length - 1; i >= 0; i--) {
      const s = this.activeSmokes[i];
      s.life -= dt;
      if (s.life <= 0) {
        this.scene.remove(s.group);
        this.activeSmokes.splice(i, 1);
      } else if (s.life < 2.2) {
        const sc = Math.max(0.1, s.life / 2.2);
        s.group.scale.setScalar(sc);
      }
    }

    // Active thrown grenades physics & fuse
    for (let i = this.activeGrenades.length - 1; i >= 0; i--) {
      const g = this.activeGrenades[i];
      g.fuse -= dt;
      g.vel.y -= 18 * dt;

      const nextX = g.mesh.position.x + g.vel.x * dt;
      const nextY = g.mesh.position.y + g.vel.y * dt;
      const nextZ = g.mesh.position.z + g.vel.z * dt;

      let bounced = false;
      if (nextY < 0.1) {
        g.mesh.position.y = 0.1;
        if (Math.abs(g.vel.y) > 1.8) bounced = true;
        g.vel.y = Math.abs(g.vel.y) * 0.42;
        g.vel.x *= 0.72;
        g.vel.z *= 0.72;
      } else {
        g.mesh.position.y = nextY;
      }

      let blockedX = false;
      let blockedZ = false;
      for (let c = 0; c < colliders.length; c++) {
        const b = colliders[c];
        if (g.mesh.position.y > b.maxY || g.mesh.position.y < b.minY) continue;
        if (nextX >= b.minX - 0.12 && nextX <= b.maxX + 0.12 && g.mesh.position.z >= b.minZ - 0.12 && g.mesh.position.z <= b.maxZ + 0.12) {
          blockedX = true;
        }
        if (g.mesh.position.x >= b.minX - 0.12 && g.mesh.position.x <= b.maxX + 0.12 && nextZ >= b.minZ - 0.12 && nextZ <= b.maxZ + 0.12) {
          blockedZ = true;
        }
      }

      if (blockedX) {
        g.vel.x *= -0.52;
        bounced = true;
      } else {
        g.mesh.position.x = nextX;
      }

      if (blockedZ) {
        g.vel.z *= -0.52;
        bounced = true;
      } else {
        g.mesh.position.z = nextZ;
      }

      g.mesh.rotation.x += dt * 7;
      g.mesh.rotation.z += dt * 5;
      if (bounced) onGrenadeBounce();

      if (g.fuse <= 0) {
        this.scene.remove(g.mesh);
        this.activeGrenades.splice(i, 1);
        onGrenadeDetonate(g);
      }
    }
  }

  public dispose(): void {
    this.clearRoundEffects();
    if (this.weatherInst) {
      this.scene.remove(this.weatherInst);
      this.weatherInst.dispose();
      this.weatherInst = null;
    }
    for (const d of this.decals) this.scene.remove(d.mesh);
    for (const s of this.shells) this.scene.remove(s.mesh);
    for (const sw of this.shockwaves) {
      this.scene.remove(sw.mesh);
      sw.mat.dispose();
    }
    for (const t of this.tracers) {
      this.scene.remove(t.line);
      t.line.geometry.dispose();
      t.mat.dispose();
    }
    for (const p of this.particles) this.scene.remove(p.mesh);
    this.scene.remove(this.c4Group);
    this.particleGeo.dispose();
    this.shellGeo.dispose();
    this.decalGeo.dispose();
    this.smokeGeo.dispose();
    this.grenadeGeo.dispose();
    this.shockwaveGeo.dispose();
    this.pickupBodyGeo.dispose();
    this.pickupBarrelGeo.dispose();
    this.pickupRingGeo.dispose();
    this.weatherGeo.dispose();
    this.decalMat.dispose();
    this.sparkMat.dispose();
    this.dustMat.dispose();
    this.snowMat.dispose();
    this.woodChipMat.dispose();
    this.bloodMat.dispose();
    this.fireMat.dispose();
    this.smokeMat.dispose();
    this.brassMat.dispose();
    this.weatherMat.dispose();
    Object.values(this.grenadeMats).forEach((m) => m.dispose());
    this.pickupGunMat.dispose();
    this.pickupRingMat.dispose();
    this.c4Geos.forEach((g) => g.dispose());
    this.c4Mats.forEach((m) => m.dispose());
  }
}
