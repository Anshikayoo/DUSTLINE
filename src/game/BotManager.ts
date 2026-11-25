import * as THREE from 'three';
import {
  AABB,
  Difficulty,
  DIFFICULTY_CONFIGS,
  Gender,
  MapCallout,
  MinimapBlip,
  RampZone,
  ScoreboardRow,
  SurfaceType,
  TeamSide,
  UNIFORM_STYLES,
  UniformStyleId,
  WEAPON_SPECS,
  WeaponId,
} from './types';
import {
  animateCharacterRig,
  buildCharacterRig,
  BuiltCharacterRig,
  CharacterGeometryPool,
  createCharacterGeometryPool,
  createUniformMaterialSet,
  UniformMaterialSet,
} from './CharacterModel';
import { detectSurfaceBelow, resolveCylinderCollisions } from './CollisionSystem';
import { NavGrid, resolveCalloutName, SiteZone } from './MapBuilder';

/**
 * ============================================================================
 * SECTION: AI BOT MANAGER (UP TO 25v25 TEAMMATES + ENEMIES + RIG ANIMATION)
 * ============================================================================
 */

export type BotAIState = 'patrol' | 'engage' | 'cover' | 'plant' | 'defuse';

export interface BotInstance {
  id: string;
  name: string;
  team: TeamSide;
  gender: Gender;
  rig: BuiltCharacterRig;
  root: THREE.Group;
  bodyPivot: THREE.Group;
  torsoMesh: THREE.Mesh;
  headMesh: THREE.Mesh;
  muzzlePoint: THREE.Object3D;
  muzzleFlash: THREE.Mesh;
  hitMeshes: THREE.Mesh[];
  position: THREE.Vector3;
  yaw: number;
  headPitch: number;
  health: number;
  maxHealth: number;
  armor: number;
  hasHelmet: boolean;
  hasDefuseKit: boolean;
  hasBomb: boolean;
  weapon: WeaponId;
  money: number;
  kills: number;
  deaths: number;
  roundKills: number;
  alive: boolean;
  deathTimer: number;
  deathFallDir: number;
  hitFlashTimer: number;
  flinchTimer: number;
  muzzleTimer: number;
  flashBlindTimer: number;
  stridePhase: number;
  isCrouching: boolean;
  // AI & Nav
  state: BotAIState;
  stateTimer: number;
  goalPos: THREE.Vector3;
  path: THREE.Vector3[];
  pathIndex: number;
  pathCooldown: number;
  targetEnemyId: string | null; // 'player' or bot.id
  spottedTimer: number;
  reactionAccum: number;
  fireCooldown: number;
  burstRemaining: number;
  burstPauseTimer: number;
  strafeDir: number;
  strafeTimer: number;
  hasLOS: boolean;
  plantProgress: number;
  defuseProgress: number;
  targetSite: 'A' | 'B';
  radioCooldown: number;
}

export interface BotShotEvent {
  shooterId: string;
  shooterName: string;
  shooterTeam: TeamSide;
  weapon: WeaponId;
  origin: THREE.Vector3;
  endPoint: THREE.Vector3;
  hitPlayer: boolean;
  hitBotId: string | null;
  damage: number;
  headshot: boolean;
  distance: number;
}

export interface BotBombEvent {
  type: 'planted' | 'defused';
  site: 'A' | 'B';
  pos: THREE.Vector3;
  botId: string;
  botName: string;
}

export interface BotFootstepEvent {
  position: THREE.Vector3;
  surface: SurfaceType;
  distance: number;
}

export interface BotHitResult {
  botId: string;
  botName: string;
  botTeam: TeamSide;
  killed: boolean;
  headshot: boolean;
  damageApplied: number;
  droppedWeapon: WeaponId | null;
  dropPos: THREE.Vector3;
}

const CALLSIGNS = [
  'VIPER', 'JACKAL', 'NOMAD', 'STRIKER', 'GHOST', 'COBRA', 'FALCON', 'RAVEN',
  'KESTREL', 'ATLAS', 'TITAN', 'SPECTRE', 'ECHO', 'DELTA', 'ROOK', 'VORTEX',
  'ORION', 'PHOENIX', 'HAWK', 'WOLF', 'LYNX', 'FROST', 'BLAZE', 'SHADOW',
  'VALKYRIE', 'NOVA', 'APEX', 'SENTINEL', 'RANGER', 'STORM', 'VECTOR', 'CIPHER',
  'REAPER', 'BISHOP', 'KNIGHT', 'WARDEN', 'TRIDENT', 'DRIFT', 'KODIAK', 'TALON',
  'SPARK', 'PULSE', 'IRON', 'ZEPHYR', 'CREST', 'SABRE', 'GUARD', 'FLINT', 'AXIS',
];

const _dir = new THREE.Vector3();
const _eyeA = new THREE.Vector3();
const _eyeB = new THREE.Vector3();
const _shootOrigin = new THREE.Vector3();
const _shootDir = new THREE.Vector3();
const _right = new THREE.Vector3();
const _toTarget = new THREE.Vector3();
const _bestSpotPos = new THREE.Vector3();

export class BotManager {
  private scene: THREE.Scene;
  private contactShadowMat: THREE.MeshBasicMaterial;
  private isSoftwareGl: boolean;
  private geoPool: CharacterGeometryPool;
  private playerTeamMats: UniformMaterialSet | null = null;
  private enemyTeamMats: UniformMaterialSet | null = null;
  public bots: BotInstance[] = [];
  private raycaster = new THREE.Raycaster();
  private losCursor = 0;
  private roundTargetSite: 'A' | 'B' = 'A';

  constructor(
    scene: THREE.Scene,
    contactShadowMat: THREE.MeshBasicMaterial,
    isSoftwareGl: boolean
  ) {
    this.scene = scene;
    this.contactShadowMat = contactShadowMat;
    this.isSoftwareGl = isSoftwareGl;
    this.geoPool = createCharacterGeometryPool();
  }

  public initMatchRoster(
    teamSize: number,
    playerSide: TeamSide,
    playerUniform: UniformStyleId,
    playerGender: Gender,
    shadowsEnabled = true
  ): void {
    this.clearBots();
    const enemyUniform = UNIFORM_STYLES[playerUniform].contrastEnemyId;
    this.playerTeamMats = createUniformMaterialSet(playerUniform);
    this.enemyTeamMats = createUniformMaterialSet(enemyUniform);

    const enemySide: TeamSide = playerSide === 'CT' ? 'T' : 'CT';
    const castShadows = shadowsEnabled && !this.isSoftwareGl && teamSize <= 12;
    let nameIdx = 0;

    for (let i = 0; i < teamSize - 1; i++) {
      this.createBotEntity(
        `ally_${i}`,
        CALLSIGNS[nameIdx++ % CALLSIGNS.length],
        playerSide,
        playerGender,
        this.playerTeamMats,
        castShadows
      );
    }

    for (let i = 0; i < teamSize; i++) {
      const eGender: Gender = i % 3 === 0 ? 'female' : 'male';
      this.createBotEntity(
        `enemy_${i}`,
        CALLSIGNS[nameIdx++ % CALLSIGNS.length],
        enemySide,
        eGender,
        this.enemyTeamMats,
        castShadows
      );
    }
  }

  private createBotEntity(
    id: string,
    name: string,
    team: TeamSide,
    gender: Gender,
    mats: UniformMaterialSet,
    castShadows: boolean
  ): void {
    const rig = buildCharacterRig(
      this.geoPool,
      mats,
      gender,
      this.contactShadowMat,
      castShadows,
      id,
      team
    );
    this.scene.add(rig.root);

    this.bots.push({
      id,
      name,
      team,
      gender,
      rig,
      root: rig.root,
      bodyPivot: rig.bodyPivot,
      torsoMesh: rig.torsoMesh,
      headMesh: rig.headMesh,
      muzzlePoint: rig.muzzlePoint,
      muzzleFlash: rig.muzzleFlash,
      hitMeshes: rig.hitMeshes,
      position: new THREE.Vector3(),
      yaw: team === 'CT' ? Math.PI : 0,
      headPitch: 0,
      health: 100,
      maxHealth: 100,
      armor: 0,
      hasHelmet: false,
      hasDefuseKit: false,
      hasBomb: false,
      weapon: 'usps',
      money: 800,
      kills: 0,
      deaths: 0,
      roundKills: 0,
      alive: true,
      deathTimer: 0,
      deathFallDir: Math.random() > 0.5 ? 1 : -1,
      hitFlashTimer: 0,
      flinchTimer: 0,
      muzzleTimer: 0,
      flashBlindTimer: 0,
      stridePhase: Math.random() * Math.PI * 2,
      isCrouching: false,
      state: 'patrol',
      stateTimer: 1,
      goalPos: new THREE.Vector3(),
      path: [],
      pathIndex: 0,
      pathCooldown: Math.random() * 0.5,
      targetEnemyId: null,
      spottedTimer: 0,
      reactionAccum: 0,
      fireCooldown: 0.2,
      burstRemaining: 4,
      burstPauseTimer: 0,
      strafeDir: Math.random() > 0.5 ? 1 : -1,
      strafeTimer: 1.2,
      hasLOS: false,
      plantProgress: 0,
      defuseProgress: 0,
      targetSite: 'A',
      radioCooldown: 0,
    });
  }

  /** Resets all bots into their organized 5x5 spawn grid with round weapon/armor purchases. */
  public setupRound(
    roundNumber: number,
    playerSide: TeamSide,
    playerHasBomb: boolean,
    ctSpawns: THREE.Vector3[],
    tSpawns: THREE.Vector3[],
    siteA: SiteZone,
    siteB: SiteZone,
    difficulty: Difficulty
  ): void {
    this.roundTargetSite = Math.random() > 0.5 ? 'A' : 'B';
    const cfg = DIFFICULTY_CONFIGS[difficulty];
    let ctIdx = playerSide === 'CT' ? 1 : 0;
    let tIdx = playerSide === 'T' ? 1 : 0;
    let bombAssigned = playerHasBomb;

    for (const bot of this.bots) {
      const spawn =
        bot.team === 'CT'
          ? ctSpawns[ctIdx++ % ctSpawns.length]
          : tSpawns[tIdx++ % tSpawns.length];

      bot.position.copy(spawn);
      bot.yaw = bot.team === 'CT' ? Math.PI : 0;
      bot.headPitch = 0;
      bot.root.position.copy(bot.position);
      bot.root.rotation.y = bot.yaw;
      bot.muzzleFlash.visible = false;

      const mats = bot.team === playerSide ? this.playerTeamMats! : this.enemyTeamMats!;
      bot.torsoMesh.material = mats.uniform;
      bot.headMesh.material = mats.skin;

      bot.alive = true;
      bot.health = 100;
      bot.maxHealth = 100;
      bot.deathTimer = 0;
      bot.hitFlashTimer = 0;
      bot.flinchTimer = 0;
      bot.flashBlindTimer = 0;
      bot.isCrouching = false;
      bot.roundKills = 0;
      bot.spottedTimer = 0;
      bot.reactionAccum = 0;
      bot.burstRemaining = cfg.burstLength;
      bot.burstPauseTimer = 0;
      bot.hasLOS = false;
      bot.targetEnemyId = null;
      bot.plantProgress = 0;
      bot.defuseProgress = 0;
      bot.hasBomb = false;
      bot.path = [];
      bot.pathIndex = 0;
      bot.pathCooldown = Math.random() * 0.6;
      bot.targetSite = this.roundTargetSite;

      if (roundNumber === 1) {
        bot.money = 800;
        bot.weapon = 'usps';
        if (Math.random() < 0.45) {
          bot.armor = 100;
          bot.money -= 650;
        } else {
          bot.armor = 0;
        }
        bot.hasHelmet = false;
        bot.hasDefuseKit = false;
      } else {
        if (bot.money >= 1000) {
          bot.armor = 100;
          bot.hasHelmet = true;
          bot.money -= 1000;
        } else if (bot.money >= 650) {
          bot.armor = 100;
          bot.money -= 650;
        }
        if (bot.team === 'CT' && !bot.hasDefuseKit && bot.money >= 400 && Math.random() < 0.35) {
          bot.hasDefuseKit = true;
          bot.money -= 400;
        }
        const roll = Math.random();
        if (bot.money >= 4750 && roll < 0.14) {
          bot.weapon = 'awp';
          bot.money -= 4750;
        } else if (bot.money >= 3100 && roll < 0.62) {
          bot.weapon = 'm4a4';
          bot.money -= 3100;
        } else if (bot.money >= 1250 && roll < 0.84) {
          bot.weapon = 'mp9';
          bot.money -= 1250;
        } else if (bot.money >= 1050) {
          bot.weapon = 'nova';
          bot.money -= 1050;
        } else {
          bot.weapon = 'usps';
        }
      }

      bot.rig.setWeaponVisual(bot.weapon);

      if (bot.team === 'T' && !bombAssigned) {
        bot.hasBomb = true;
        bombAssigned = true;
      }

      const site = bot.targetSite === 'A' ? siteA : siteB;
      if (bot.team === 'T') {
        bot.goalPos.copy(site.center);
      } else {
        const defendSite = Math.random() > 0.5 ? siteA : siteB;
        bot.goalPos.copy(defendSite.center);
      }
      bot.state = 'patrol';

      animateCharacterRig(bot.rig, {
        dt: 0.016,
        timeSec: 0,
        stridePhase: bot.stridePhase,
        moveRatio: 0,
        isAiming: false,
        isCrouching: false,
        isReloading: false,
        isPlantOrDefuse: false,
        flinchAlpha: 0,
        headPitch: 0,
        alive: true,
        deathTimer: 0,
        deathFallDir: bot.deathFallDir,
      });
    }
  }

  public grantRoundEndMoney(winningTeam: TeamSide, rewardWin: number, rewardLoss: number): void {
    for (const bot of this.bots) {
      const add = bot.team === winningTeam ? rewardWin : rewardLoss;
      bot.money = Math.min(16000, bot.money + add);
    }
  }

  public getRaycastTargets(opposingTeamOnly?: TeamSide): THREE.Object3D[] {
    const out: THREE.Object3D[] = [];
    for (let i = 0; i < this.bots.length; i++) {
      const b = this.bots[i];
      if (!b.alive) continue;
      if (opposingTeamOnly && b.team !== opposingTeamOnly) continue;
      for (let m = 0; m < b.hitMeshes.length; m++) out.push(b.hitMeshes[m]);
    }
    return out;
  }

  public getAliveCount(team: TeamSide): number {
    let c = 0;
    for (const b of this.bots) if (b.alive && b.team === team) c++;
    return c;
  }

  public getAliveTeamBots(team: TeamSide): BotInstance[] {
    return this.bots.filter((b) => b.alive && b.team === team);
  }

  public getMinimapBlips(playerSide: TeamSide): MinimapBlip[] {
    return this.bots.map((b) => ({
      id: b.id,
      x: b.position.x,
      z: b.position.z,
      team: b.team,
      alive: b.alive,
      spotted: b.alive && (b.team === playerSide || b.spottedTimer > 0),
      hasBomb: b.alive && b.hasBomb && b.team === playerSide,
    }));
  }

  public getScoreboardRows(): ScoreboardRow[] {
    return this.bots.map((b) => ({
      id: b.id,
      name: b.name,
      team: b.team,
      gender: b.gender,
      isPlayer: false,
      alive: b.alive,
      kills: b.kills,
      deaths: b.deaths,
      money: b.money,
      hasBomb: b.hasBomb,
    }));
  }

  public alertSoundAt(pos: THREE.Vector3, sourceTeam: TeamSide, radius: number): void {
    const rSq = radius * radius;
    for (const b of this.bots) {
      if (!b.alive || b.team === sourceTeam) continue;
      if (b.position.distanceToSquared(pos) <= rSq && b.state === 'patrol') {
        b.goalPos.copy(pos);
        b.path = [];
      }
    }
  }

  public applyFlashAt(blastPos: THREE.Vector3, maxRadius: number): void {
    const rSq = maxRadius * maxRadius;
    for (const b of this.bots) {
      if (!b.alive) continue;
      const dSq = b.position.distanceToSquared(blastPos);
      if (dSq <= rSq) {
        b.flashBlindTimer = Math.max(b.flashBlindTimer, 2.8 * (1 - Math.sqrt(dSq) / maxRadius));
      }
    }
  }

  public applyDamage(
    botId: string,
    rawDamage: number,
    headshot: boolean,
    attackerTeam: TeamSide,
    attackerPos: THREE.Vector3,
    coverSpots: THREE.Vector3[],
    difficulty: Difficulty,
    playerSide: TeamSide,
    onBombTransferred: (newCarrierName: string) => void
  ): BotHitResult | null {
    const bot = this.bots.find((b) => b.id === botId);
    if (!bot || !bot.alive || bot.team === attackerTeam) return null;

    let dmg = rawDamage;
    const armored = bot.armor > 0 && (!headshot || bot.hasHelmet);
    if (armored) {
      const absorb = Math.min(bot.armor, Math.round(dmg * 0.42));
      bot.armor = Math.max(0, bot.armor - absorb);
      dmg = Math.max(2, dmg - absorb);
    }

    const actualDamage = Math.round(dmg);
    bot.health = Math.max(0, bot.health - actualDamage);

    const mats = bot.team === playerSide ? this.playerTeamMats! : this.enemyTeamMats!;
    bot.torsoMesh.material = mats.hitFlash;
    bot.headMesh.material = mats.hitFlash;
    bot.hitFlashTimer = 0.09;
    bot.flinchTimer = 0.22;
    bot.spottedTimer = 3.5;

    const killed = bot.health <= 0;
    let droppedWeapon: WeaponId | null = null;

    if (killed) {
      bot.alive = false;
      bot.deaths++;
      bot.deathTimer = 0;
      bot.muzzleFlash.visible = false;
      bot.plantProgress = 0;
      bot.defuseProgress = 0;
      if (bot.weapon !== 'usps' && bot.weapon !== 'knife') {
        droppedWeapon = bot.weapon;
      }
      if (bot.hasBomb) {
        bot.hasBomb = false;
        const aliveT = this.bots.filter((other) => other.alive && other.team === 'T');
        if (aliveT.length > 0) {
          aliveT[0].hasBomb = true;
          onBombTransferred(aliveT[0].name);
        }
      }
    } else {
      const cfg = DIFFICULTY_CONFIGS[difficulty];
      if (bot.health < 62 && Math.random() < cfg.coverPreference) {
        const cov = this.findNearestCover(bot.position, attackerPos, coverSpots);
        if (cov) {
          bot.state = 'cover';
          bot.goalPos.copy(cov);
          bot.path = [];
          bot.stateTimer = 2.5;
        }
      }
    }

    return {
      botId: bot.id,
      botName: bot.name,
      botTeam: bot.team,
      killed,
      headshot,
      damageApplied: actualDamage,
      droppedWeapon,
      dropPos: bot.position.clone(),
    };
  }

  private findNearestCover(
    botPos: THREE.Vector3,
    threatPos: THREE.Vector3,
    coverSpots: THREE.Vector3[]
  ): THREE.Vector3 | null {
    let best: THREE.Vector3 | null = null;
    let bestScore = Infinity;
    for (const c of coverSpots) {
      const db = botPos.distanceTo(c);
      if (db < 1.5 || db > 24) continue;
      const dt = threatPos.distanceTo(c);
      const score = db - dt * 0.25;
      if (score < bestScore) {
        bestScore = score;
        best = c;
      }
    }
    return best;
  }

  public update(
    dt: number,
    frozenBuyPhase: boolean,
    playerSide: TeamSide,
    playerPos: THREE.Vector3,
    playerEyeY: number,
    playerAlive: boolean,
    bombPlanted: boolean,
    plantedBombPos: THREE.Vector3 | null,
    plantedSite: 'A' | 'B' | null,
    siteA: SiteZone,
    siteB: SiteZone,
    difficulty: Difficulty,
    colliders: AABB[],
    ramps: RampZone[],
    raycastMeshes: THREE.Object3D[],
    groundMeshes: THREE.Object3D[],
    defaultGroundSurface: SurfaceType,
    navGrid: NavGrid,
    patrolWaypoints: THREE.Vector3[],
    coverSpots: THREE.Vector3[],
    calloutZones: MapCallout[],
    sightRangeBonus: number,
    isBlockedBySmoke: (a: THREE.Vector3, b: THREE.Vector3) => boolean,
    onBotShot: (ev: BotShotEvent) => void,
    onBotBombEvent: (ev: BotBombEvent) => void,
    onRadioCallout: (sender: string, team: TeamSide, msg: string) => void,
    onBotFootstep: (ev: BotFootstepEvent) => void
  ): void {
    const cfg = DIFFICULTY_CONFIGS[difficulty];
    const total = this.bots.length;
    if (total === 0) return;

    const timeSec = performance.now() * 0.001;
    const effectiveSight = cfg.sightRange + sightRangeBonus;

    const losBudget = Math.min(total, 8);
    const losSet = new Set<number>();
    for (let k = 0; k < losBudget; k++) {
      losSet.add((this.losCursor + k) % total);
    }
    this.losCursor = (this.losCursor + losBudget) % total;

    for (let i = 0; i < total; i++) {
      const bot = this.bots[i];

      if (bot.hitFlashTimer > 0) {
        bot.hitFlashTimer -= dt;
        if (bot.hitFlashTimer <= 0) {
          const mats = bot.team === playerSide ? this.playerTeamMats! : this.enemyTeamMats!;
          bot.torsoMesh.material = mats.uniform;
          bot.headMesh.material = mats.skin;
        }
      }
      if (bot.flinchTimer > 0) {
        bot.flinchTimer = Math.max(0, bot.flinchTimer - dt);
      }

      if (bot.muzzleTimer > 0) {
        bot.muzzleTimer -= dt;
        if (bot.muzzleTimer <= 0) bot.muzzleFlash.visible = false;
      }

      // Death collapse & ragdoll settle
      if (!bot.alive) {
        if (bot.deathTimer < 1) {
          bot.deathTimer = Math.min(1, bot.deathTimer + dt * 2.5);
          animateCharacterRig(bot.rig, {
            dt,
            timeSec,
            stridePhase: bot.stridePhase,
            moveRatio: 0,
            isAiming: false,
            isCrouching: false,
            isReloading: false,
            isPlantOrDefuse: false,
            flinchAlpha: 0,
            headPitch: 0,
            alive: false,
            deathTimer: bot.deathTimer,
            deathFallDir: bot.deathFallDir,
          });
        }
        continue;
      }

      // Frozen during 10-second Buy Phase (subtle idle breathing & look around)
      if (frozenBuyPhase) {
        bot.root.rotation.y = bot.yaw + Math.sin(timeSec * 0.9 + i) * 0.14;
        animateCharacterRig(bot.rig, {
          dt,
          timeSec: timeSec + i * 0.7,
          stridePhase: bot.stridePhase,
          moveRatio: 0,
          isAiming: false,
          isCrouching: false,
          isReloading: false,
          isPlantOrDefuse: false,
          flinchAlpha: 0,
          headPitch: 0,
          alive: true,
          deathTimer: 0,
          deathFallDir: bot.deathFallDir,
        });
        continue;
      }

      if (bot.spottedTimer > 0) bot.spottedTimer = Math.max(0, bot.spottedTimer - dt);
      if (bot.flashBlindTimer > 0) bot.flashBlindTimer = Math.max(0, bot.flashBlindTimer - dt);
      if (bot.radioCooldown > 0) bot.radioCooldown = Math.max(0, bot.radioCooldown - dt);

      if (losSet.has(i)) {
        this.acquireTarget(
          bot,
          playerSide,
          playerPos,
          playerEyeY,
          playerAlive,
          effectiveSight,
          raycastMeshes,
          calloutZones,
          isBlockedBySmoke,
          onRadioCallout
        );
      }

      let enemyPos: THREE.Vector3 | null = null;
      let enemyEyeY = 1.5;
      if (bot.targetEnemyId === 'player' && playerAlive) {
        enemyPos = playerPos;
        enemyEyeY = playerEyeY;
      } else if (bot.targetEnemyId) {
        const eb = this.bots.find((b) => b.id === bot.targetEnemyId);
        if (eb && eb.alive) {
          enemyPos = eb.position;
          enemyEyeY = eb.position.y + 1.48;
        } else {
          bot.hasLOS = false;
          bot.targetEnemyId = null;
        }
      }

      const site = bot.targetSite === 'A' ? siteA : siteB;
      const isBombCarrier = bot.team === 'T' && bot.hasBomb && !bombPlanted;

      if (isBombCarrier && !bot.hasLOS) {
        const insideSite =
          Math.abs(bot.position.x - site.center.x) <= site.halfW - 0.8 &&
          Math.abs(bot.position.z - site.center.z) <= site.halfD - 0.8;
        if (insideSite) {
          bot.state = 'plant';
          bot.plantProgress += dt;
          animateCharacterRig(bot.rig, {
            dt,
            timeSec: timeSec + i,
            stridePhase: bot.stridePhase,
            moveRatio: 0,
            isAiming: false,
            isCrouching: true,
            isReloading: false,
            isPlantOrDefuse: true,
            flinchAlpha: bot.flinchTimer / 0.22,
            headPitch: 0.2,
            alive: true,
            deathTimer: 0,
            deathFallDir: bot.deathFallDir,
          });
          if (bot.plantProgress >= 3.0) {
            bot.hasBomb = false;
            bot.plantProgress = 0;
            bot.state = 'patrol';
            onBotBombEvent({
              type: 'planted',
              site: site.id,
              pos: bot.position.clone(),
              botId: bot.id,
              botName: bot.name,
            });
          }
          continue;
        }
      } else {
        bot.plantProgress = 0;
      }

      if (bot.team === 'CT' && bombPlanted && plantedBombPos && !bot.hasLOS) {
        const distBomb = Math.hypot(
          bot.position.x - plantedBombPos.x,
          bot.position.z - plantedBombPos.z
        );
        if (distBomb < 2.3) {
          bot.state = 'defuse';
          const reqTime = bot.hasDefuseKit ? 3.0 : 5.0;
          bot.defuseProgress += dt;
          animateCharacterRig(bot.rig, {
            dt,
            timeSec: timeSec + i,
            stridePhase: bot.stridePhase,
            moveRatio: 0,
            isAiming: false,
            isCrouching: true,
            isReloading: false,
            isPlantOrDefuse: true,
            flinchAlpha: bot.flinchTimer / 0.22,
            headPitch: 0.2,
            alive: true,
            deathTimer: 0,
            deathFallDir: bot.deathFallDir,
          });
          if (bot.defuseProgress >= reqTime) {
            bot.defuseProgress = 0;
            onBotBombEvent({
              type: 'defused',
              site: plantedSite ?? 'A',
              pos: plantedBombPos.clone(),
              botId: bot.id,
              botName: bot.name,
            });
          }
          continue;
        }
      } else {
        bot.defuseProgress = 0;
      }

      let moveVecX = 0;
      let moveVecZ = 0;
      let moveSpeed = cfg.moveSpeed;
      let desiredYaw = bot.yaw;
      let desiredHeadPitch = 0;

      if (bot.hasLOS && enemyPos && bot.flashBlindTimer <= 0) {
        bot.state = 'engage';
        bot.reactionAccum += dt;
        desiredYaw = Math.atan2(enemyPos.x - bot.position.x, enemyPos.z - bot.position.z);
        const flatDist = Math.max(0.5, Math.hypot(enemyPos.x - bot.position.x, enemyPos.z - bot.position.z));
        desiredHeadPitch = Math.atan2((bot.position.y + 1.5) - enemyEyeY, flatDist);

        bot.isCrouching = bot.weapon === 'awp' || (difficulty !== 'easy' && flatDist > 26 && bot.burstPauseTimer <= 0);

        bot.strafeTimer -= dt;
        if (bot.strafeTimer <= 0) {
          bot.strafeDir *= -1;
          bot.strafeTimer = 0.8 + Math.random() * 1.1;
        }
        const fx = Math.sin(desiredYaw);
        const fz = Math.cos(desiredYaw);
        const sx = fz * bot.strafeDir;
        const sz = -fx * bot.strafeDir;

        if (!bot.isCrouching) {
          if (flatDist > 20) {
            moveVecX = fx * 0.6 + sx * 0.5;
            moveVecZ = fz * 0.6 + sz * 0.5;
          } else if (flatDist < 7) {
            moveVecX = -fx * 0.4 + sx * 0.7;
            moveVecZ = -fz * 0.4 + sz * 0.7;
          } else {
            moveVecX = sx * 0.65;
            moveVecZ = sz * 0.65;
          }
        }
        moveSpeed *= bot.isCrouching ? 0.3 : 0.68;

        if (bot.reactionAccum >= cfg.reactionTime) {
          if (bot.burstPauseTimer > 0) {
            bot.burstPauseTimer -= dt;
            if (bot.burstPauseTimer <= 0) bot.burstRemaining = cfg.burstLength;
          } else {
            bot.fireCooldown -= dt;
            if (bot.fireCooldown <= 0 && bot.burstRemaining > 0) {
              this.fireBotWeapon(
                bot,
                enemyPos,
                enemyEyeY,
                cfg,
                raycastMeshes,
                playerSide,
                effectiveSight,
                onBotShot
              );
              bot.burstRemaining--;
              const wSpec = WEAPON_SPECS[bot.weapon];
              bot.fireCooldown = Math.max(0.12, wSpec.fireRate * cfg.fireCooldownMult);
              if (bot.burstRemaining <= 0) {
                bot.burstPauseTimer = cfg.burstPause;
                if (Math.random() < cfg.coverPreference * 0.4) {
                  const cov = this.findNearestCover(bot.position, enemyPos, coverSpots);
                  if (cov) {
                    bot.state = 'cover';
                    bot.goalPos.copy(cov);
                    bot.path = [];
                    bot.stateTimer = 2.0;
                  }
                }
              }
            }
          }
        }
      } else {
        bot.isCrouching = false;
        bot.reactionAccum = Math.max(0, bot.reactionAccum - dt * 1.4);
        bot.stateTimer -= dt;
        bot.pathCooldown -= dt;

        if (bot.team === 'CT' && bombPlanted && plantedBombPos) {
          bot.goalPos.copy(plantedBombPos);
        } else if (isBombCarrier) {
          bot.goalPos.copy(site.center);
        } else if (bot.state === 'cover' && bot.stateTimer <= 0) {
          bot.state = 'patrol';
        }

        const distGoal = Math.hypot(bot.goalPos.x - bot.position.x, bot.goalPos.z - bot.position.z);
        if (distGoal < 2.2 || bot.stateTimer <= 0) {
          if (bot.team === 'T' && !bombPlanted) {
            bot.goalPos.set(
              site.center.x + (Math.random() - 0.5) * 8,
              0,
              site.center.z + (Math.random() - 0.5) * 8
            );
          } else {
            const wp = patrolWaypoints[Math.floor(Math.random() * patrolWaypoints.length)];
            bot.goalPos.copy(wp);
          }
          bot.stateTimer = 6 + Math.random() * 6;
          bot.path = [];
        }

        if ((bot.path.length === 0 || bot.pathIndex >= bot.path.length) && bot.pathCooldown <= 0) {
          bot.path = navGrid.findPath(bot.position, bot.goalPos);
          bot.pathIndex = 0;
          bot.pathCooldown = 0.9 + Math.random() * 0.7;
        }

        const wp = bot.path[bot.pathIndex] ?? bot.goalPos;
        const wx = wp.x - bot.position.x;
        const wz = wp.z - bot.position.z;
        const distWp = Math.hypot(wx, wz);

        if (distWp < 1.3 && bot.pathIndex < bot.path.length - 1) {
          bot.pathIndex++;
        } else if (distWp > 0.15) {
          moveVecX = wx / distWp;
          moveVecZ = wz / distWp;
          desiredYaw = Math.atan2(moveVecX, moveVecZ);
        }
      }

      // Soft separation
      for (let j = 0; j < total; j++) {
        if (i === j || !this.bots[j].alive) continue;
        const sx = bot.position.x - this.bots[j].position.x;
        const sz = bot.position.z - this.bots[j].position.z;
        const dSq = sx * sx + sz * sz;
        if (dSq > 0.001 && dSq < 1.7) {
          const d = Math.sqrt(dSq);
          moveVecX += (sx / d) * 0.85;
          moveVecZ += (sz / d) * 0.85;
        }
      }

      const mag = Math.hypot(moveVecX, moveVecZ);
      if (mag > 0.01) {
        bot.position.x += (moveVecX / mag) * moveSpeed * dt;
        bot.position.z += (moveVecZ / mag) * moveSpeed * dt;
      }

      const col = resolveCylinderCollisions(bot.position, 0.42, 1.75, colliders, 0.58, ramps);
      bot.position.y = col.groundY;

      let yawDiff = desiredYaw - bot.yaw;
      while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
      while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
      bot.yaw += yawDiff * Math.min(1, dt * cfg.turnSpeed);
      bot.headPitch = THREE.MathUtils.damp(bot.headPitch, desiredHeadPitch, 10, dt);

      bot.root.position.copy(bot.position);
      bot.root.rotation.y = bot.yaw;

      const moving = Math.min(1, mag);
      if (moving > 0.1) {
        const prevPhase = bot.stridePhase;
        bot.stridePhase += dt * moveSpeed * 2.15;

        if (
          moving > 0.25 &&
          !bot.isCrouching &&
          Math.floor(prevPhase / Math.PI) !== Math.floor(bot.stridePhase / Math.PI)
        ) {
          const distSq = bot.position.distanceToSquared(playerPos);
          if (distSq > 0.25 && distSq <= 30 * 30) {
            const surface = detectSurfaceBelow(
              bot.position,
              groundMeshes,
              this.raycaster,
              defaultGroundSurface
            );
            onBotFootstep({
              position: bot.position,
              surface,
              distance: Math.sqrt(distSq),
            });
          }
        }
      }

      animateCharacterRig(bot.rig, {
        dt,
        timeSec: timeSec + i * 0.41,
        stridePhase: bot.stridePhase,
        moveRatio: moving,
        isAiming: bot.hasLOS && bot.flashBlindTimer <= 0,
        isCrouching: bot.isCrouching,
        isReloading: bot.hasLOS && bot.burstPauseTimer > 0.2,
        isPlantOrDefuse: false,
        flinchAlpha: bot.flinchTimer / 0.22,
        headPitch: bot.headPitch,
        alive: true,
        deathTimer: 0,
        deathFallDir: bot.deathFallDir,
      });
    }
  }

  private acquireTarget(
    bot: BotInstance,
    playerSide: TeamSide,
    playerPos: THREE.Vector3,
    playerEyeY: number,
    playerAlive: boolean,
    sightRange: number,
    raycastMeshes: THREE.Object3D[],
    calloutZones: MapCallout[],
    isBlockedBySmoke: (a: THREE.Vector3, b: THREE.Vector3) => boolean,
    onRadioCallout: (sender: string, team: TeamSide, msg: string) => void
  ): void {
    if (bot.flashBlindTimer > 0) {
      bot.hasLOS = false;
      return;
    }

    _eyeA.set(bot.position.x, bot.position.y + 1.5, bot.position.z);
    const maxSq = sightRange * sightRange;

    let bestId: string | null = null;
    let bestDistSq = maxSq;

    if (playerAlive && bot.team !== playerSide) {
      const dSq = bot.position.distanceToSquared(playerPos);
      if (dSq < bestDistSq) {
        _eyeB.set(playerPos.x, playerEyeY - 0.15, playerPos.z);
        if (this.hasCleanLOS(_eyeA, _eyeB, raycastMeshes, isBlockedBySmoke)) {
          bestDistSq = dSq;
          bestId = 'player';
          _bestSpotPos.copy(_eyeB);
        }
      }
    }

    const candidates: { id: string; pos: THREE.Vector3; dSq: number }[] = [];
    for (let j = 0; j < this.bots.length; j++) {
      const other = this.bots[j];
      if (!other.alive || other.team === bot.team) continue;
      const dSq = bot.position.distanceToSquared(other.position);
      if (dSq < bestDistSq) {
        candidates.push({ id: other.id, pos: other.position, dSq });
      }
    }
    candidates.sort((a, b) => a.dSq - b.dSq);
    const limit = Math.min(candidates.length, 3);
    for (let k = 0; k < limit; k++) {
      const c = candidates[k];
      _eyeB.set(c.pos.x, c.pos.y + 1.48, c.pos.z);
      if (this.hasCleanLOS(_eyeA, _eyeB, raycastMeshes, isBlockedBySmoke)) {
        bestId = c.id;
        bestDistSq = c.dSq;
        _bestSpotPos.copy(_eyeB);
        break;
      }
    }

    if (bestId) {
      const wasEngaged = bot.hasLOS;
      bot.hasLOS = true;
      bot.targetEnemyId = bestId;
      bot.spottedTimer = 2.6;
      if (!wasEngaged && bot.radioCooldown <= 0 && Math.random() < 0.18) {
        bot.radioCooldown = 14;
        const zone = resolveCalloutName(_bestSpotPos.x, _bestSpotPos.z, calloutZones);
        onRadioCallout(bot.name, bot.team, `Enemy spotted near ${zone}!`);
      }
    } else {
      bot.hasLOS = false;
      bot.targetEnemyId = null;
    }
  }

  private hasCleanLOS(
    a: THREE.Vector3,
    b: THREE.Vector3,
    raycastMeshes: THREE.Object3D[],
    isBlockedBySmoke: (a: THREE.Vector3, b: THREE.Vector3) => boolean
  ): boolean {
    if (isBlockedBySmoke(a, b)) return false;
    _dir.subVectors(b, a);
    const dist = _dir.length();
    if (dist < 0.4) return true;
    _dir.divideScalar(dist);
    this.raycaster.set(a, _dir);
    this.raycaster.far = dist - 0.25;
    const hits = this.raycaster.intersectObjects(raycastMeshes, false);
    return hits.length === 0;
  }

  private fireBotWeapon(
    bot: BotInstance,
    targetPos: THREE.Vector3,
    targetEyeY: number,
    cfg: (typeof DIFFICULTY_CONFIGS)[Difficulty],
    raycastMeshes: THREE.Object3D[],
    playerSide: TeamSide,
    maxRange: number,
    onBotShot: (ev: BotShotEvent) => void
  ): void {
    bot.muzzlePoint.getWorldPosition(_shootOrigin);
    bot.muzzleFlash.visible = true;
    bot.muzzleFlash.rotation.z = Math.random() * Math.PI * 2;
    bot.muzzleTimer = 0.055;
    bot.spottedTimer = 3.2;

    const aimY = targetEyeY - 0.22;
    _shootDir.set(targetPos.x - _shootOrigin.x, aimY - _shootOrigin.y, targetPos.z - _shootOrigin.z);
    const dist = _shootDir.length();
    _shootDir.divideScalar(Math.max(0.001, dist));

    const spreadMult = bot.isCrouching ? 0.65 : 1.0;
    const spreadX = (Math.random() - 0.5) * 2 * cfg.aimSpread * spreadMult;
    const spreadY = (Math.random() - 0.5) * 2 * cfg.aimSpread * spreadMult;
    _right.set(_shootDir.z, 0, -_shootDir.x).normalize();
    _shootDir.addScaledVector(_right, spreadX);
    _shootDir.y += spreadY;
    _shootDir.normalize();

    const castDist = Math.max(95, maxRange + 20);
    this.raycaster.set(_shootOrigin, _shootDir);
    this.raycaster.far = castDist;
    const wallHits = this.raycaster.intersectObjects(raycastMeshes, false);
    const wallDist = wallHits.length > 0 ? wallHits[0].distance : castDist;

    let hitPlayer = false;
    let hitBotId: string | null = null;
    let endDist = wallDist;

    if (bot.targetEnemyId === 'player' && bot.team !== playerSide && dist < wallDist) {
      _toTarget.set(targetPos.x - _shootOrigin.x, aimY - _shootOrigin.y, targetPos.z - _shootOrigin.z);
      const proj = _toTarget.dot(_shootDir);
      if (proj > 0 && proj < wallDist) {
        const px = _shootOrigin.x + _shootDir.x * proj;
        const py = _shootOrigin.y + _shootDir.y * proj;
        const pz = _shootOrigin.z + _shootDir.z * proj;
        if (Math.hypot(px - targetPos.x, pz - targetPos.z) < 0.42 && Math.abs(py - aimY) < 0.72) {
          hitPlayer = true;
          endDist = dist;
        }
      }
    } else if (bot.targetEnemyId && dist < wallDist) {
      _toTarget.set(targetPos.x - _shootOrigin.x, aimY - _shootOrigin.y, targetPos.z - _shootOrigin.z);
      const proj = _toTarget.dot(_shootDir);
      if (proj > 0 && proj < wallDist) {
        const px = _shootOrigin.x + _shootDir.x * proj;
        const py = _shootOrigin.y + _shootDir.y * proj;
        const pz = _shootOrigin.z + _shootDir.z * proj;
        if (Math.hypot(px - targetPos.x, pz - targetPos.z) < 0.45 && Math.abs(py - aimY) < 0.75) {
          hitBotId = bot.targetEnemyId;
          endDist = dist;
        }
      }
    }

    const wSpec = WEAPON_SPECS[bot.weapon];
    const isHeadshot = (hitPlayer || hitBotId !== null) && Math.random() < cfg.headshotChance;
    const baseDmg = wSpec.id === 'awp' ? 42 : wSpec.id === 'nova' ? 28 : 16;
    const dmg = Math.round(baseDmg * cfg.damageMult * (isHeadshot ? 1.7 : 1.0));

    onBotShot({
      shooterId: bot.id,
      shooterName: bot.name,
      shooterTeam: bot.team,
      weapon: bot.weapon,
      origin: _shootOrigin.clone(),
      endPoint: _shootOrigin.clone().addScaledVector(_shootDir, endDist),
      hitPlayer,
      hitBotId,
      damage: dmg,
      headshot: isHeadshot,
      distance: dist,
    });
  }

  public clearBots(): void {
    for (const bot of this.bots) {
      this.scene.remove(bot.root);
    }
    this.bots = [];
    this.playerTeamMats?.dispose();
    this.enemyTeamMats?.dispose();
    this.playerTeamMats = null;
    this.enemyTeamMats = null;
  }

  public dispose(): void {
    this.clearBots();
    this.geoPool.dispose();
  }
}
