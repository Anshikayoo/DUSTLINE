import * as THREE from 'three';
import { AABB, RampZone, SurfaceType } from './types';

const _downOrigin = new THREE.Vector3();
const _downDir = new THREE.Vector3(0, -1, 0);

/**
 * Casts a short downward ray from just above foot height against ground/walkable meshes
 * and returns the surface material type ('gravel' | 'metal' | 'concrete').
 */
export function detectSurfaceBelow(
  pos: THREE.Vector3,
  groundMeshes: THREE.Object3D[],
  raycaster: THREE.Raycaster,
  fallback: SurfaceType = 'concrete'
): SurfaceType {
  _downOrigin.set(pos.x, pos.y + 0.55, pos.z);
  raycaster.set(_downOrigin, _downDir);
  raycaster.far = 1.6;
  const hits = raycaster.intersectObjects(groundMeshes, false);
  if (hits.length > 0) {
    const mesh = hits[0].object as THREE.Mesh;
    const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    const surf = mat?.userData?.surfaceType ?? mesh.userData?.surfaceType;
    if (surf === 'gravel' || surf === 'metal' || surf === 'concrete') {
      return surf;
    }
  }
  return fallback;
}

/**
 * Computes highest walkable ramp elevation beneath (x, z) if within a RampZone.
 */
export function sampleRampHeight(x: number, z: number, currentY: number, ramps: RampZone[]): number {
  let bestY = 0;
  for (let i = 0; i < ramps.length; i++) {
    const r = ramps[i];
    if (x >= r.minX - 0.15 && x <= r.maxX + 0.15 && z >= r.minZ - 0.15 && z <= r.maxZ + 0.15) {
      const t =
        r.axis === 'x'
          ? (x - r.minX) / Math.max(0.01, r.maxX - r.minX)
          : (z - r.minZ) / Math.max(0.01, r.maxZ - r.minZ);
      const clampedT = Math.max(0, Math.min(1, t));
      const ry = r.yStart + (r.yEnd - r.yStart) * clampedT;
      // Only snap onto ramp if player feet are within step-up reach
      if (ry <= currentY + 0.85 && ry > bestY) {
        bestY = ry;
      }
    }
  }
  return bestY;
}

/**
 * Shared cylinder-vs-AABB + RampZone collision resolver for both the player and AI bots.
 * Supports smooth wall sliding, jumping onto crates/platforms, stepping up low curbs,
 * and walking seamlessly up elevated ramps and catwalks.
 */
export function resolveCylinderCollisions(
  position: THREE.Vector3,
  radius: number,
  height: number,
  colliders: AABB[],
  stepUpHeight = 0.56,
  ramps: RampZone[] = []
): { groundedOnTop: boolean; hitWall: boolean; groundY: number; hitCeiling: boolean } {
  let groundY = sampleRampHeight(position.x, position.z, position.y, ramps);
  let groundedOnTop = groundY > 0.01;
  let hitWall = false;
  let hitCeiling = false;

  const feetY = position.y;
  const headY = position.y + height;

  // Two passes stabilize corner collisions where two walls meet at 90 degrees
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < colliders.length; i++) {
      const box = colliders[i];

      // Check XZ overlap using closest point on AABB to cylinder center
      const closestX = Math.max(box.minX, Math.min(position.x, box.maxX));
      const closestZ = Math.max(box.minZ, Math.min(position.z, box.maxZ));
      const dx = position.x - closestX;
      const dz = position.z - closestZ;
      const distSq = dx * dx + dz * dz;

      if (distSq >= radius * radius) continue;

      // Vertical overlap check
      if (headY <= box.minY + 0.02 || feetY >= box.maxY + 0.02) {
        // Check if standing right on top of this box
        if (feetY >= box.maxY - 0.16 && feetY <= box.maxY + 0.14) {
          if (box.maxY > groundY) {
            groundY = box.maxY;
            groundedOnTop = true;
          }
        }
        continue;
      }

      // If the top of the box is low enough to step onto (e.g. Site A / B platform or ramp crest)
      if (box.maxY - feetY <= stepUpHeight && box.maxY - feetY > -0.05) {
        if (box.maxY > groundY) {
          groundY = box.maxY;
          groundedOnTop = true;
        }
        continue;
      }

      // If player jumped upward and bumped underside of an overhang / window lintel
      if (headY > box.minY && feetY < box.minY && headY - box.minY < 0.3) {
        position.y = box.minY - height;
        hitCeiling = true;
        continue;
      }

      // Horizontal push-out (smooth wall sliding)
      hitWall = true;
      if (distSq > 0.000001) {
        const dist = Math.sqrt(distSq);
        const push = radius - dist;
        position.x += (dx / dist) * push;
        position.z += (dz / dist) * push;
      } else {
        const penLeft = Math.abs(position.x - box.minX);
        const penRight = Math.abs(box.maxX - position.x);
        const penFront = Math.abs(position.z - box.minZ);
        const penBack = Math.abs(box.maxZ - position.z);
        const minPen = Math.min(penLeft, penRight, penFront, penBack);
        if (minPen === penLeft) position.x = box.minX - radius;
        else if (minPen === penRight) position.x = box.maxX + radius;
        else if (minPen === penFront) position.z = box.minZ - radius;
        else position.z = box.maxZ + radius;
      }
    }
  }

  return { groundedOnTop, hitWall, groundY, hitCeiling };
}

/**
 * Checks whether a point (x, z) is clear of all full-height solid colliders.
 */
export function isPointBlockedXZ(x: number, z: number, radius: number, colliders: AABB[]): boolean {
  for (let i = 0; i < colliders.length; i++) {
    const b = colliders[i];
    if (b.maxY <= 0.65 || b.minY >= 1.95) continue; // walkable platforms & elevated lintels don't block ground paths
    const cx = Math.max(b.minX, Math.min(x, b.maxX));
    const cz = Math.max(b.minZ, Math.min(z, b.maxZ));
    const dx = x - cx;
    const dz = z - cz;
    if (dx * dx + dz * dz < radius * radius) return true;
  }
  return false;
}
