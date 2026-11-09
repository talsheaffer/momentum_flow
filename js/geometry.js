// Upstream Domain Primitives: Kinematics, True-Contact Mechanics, Strip-Load Elasticity & Polylines

/**
 * @param {number} v
 * @param {number} lo
 * @param {number} hi
 * @returns {number}
 */
export function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * @param {number} a
 * @param {number} b
 * @param {number} t
 * @returns {number}
 */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Analytical 2-bone inverse kinematics in (x, z) world plane (+z upward).
 */
export function solveTwoBoneIK(ax, az, bx, bz, L1, L2, bendDir) {
  const dx = bx - ax;
  const dz = bz - az;
  const maxReach = (L1 + L2) * 0.992;
  const minReach = Math.abs(L1 - L2) + 0.035;
  let dist = Math.hypot(dx, dz);
  let tx = bx;
  let tz = bz;

  if (dist > maxReach) {
    const s = maxReach / dist;
    tx = ax + dx * s;
    tz = az + dz * s;
    dist = maxReach;
  } else if (dist < minReach) {
    const s = minReach / Math.max(1e-4, dist);
    tx = ax + dx * s;
    tz = az + dz * s;
    dist = minReach;
  }

  const cosA = clamp((L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist), -1, 1);
  const baseAngle = Math.atan2(tz - az, tx - ax);
  const jointAngle = baseAngle + Math.acos(cosA) * bendDir;

  return {
    jx: ax + Math.cos(jointAngle) * L1,
    jz: az + Math.sin(jointAngle) * L1,
    endX: tx,
    endZ: tz,
  };
}

/**
 * Computes articulated human pose for either upward lifting (`actionMode = 'pull_up'`)
 * or downward pressing onto a Class-1 prybar (`actionMode = 'push_down'`).
 */
export function computeHumanPose(footX, footZ, handX, handZ, facing, strain, actionMode, humanCfg) {
  const ankleX = footX;
  const ankleZ = footZ + humanCfg.ankleHeightM;

  let hipX;
  let hipZ;
  let shoulderX;
  let shoulderZ;
  let elbowBendDir;

  if (actionMode === 'push_down') {
    // Leaning forward over the Class-1 prybar handle to press body weight downward!
    const lowFactor = clamp((1.05 - (handZ - footZ)) / 0.85, 0, 1);
    const kneeFlex = lowFactor * 0.24 + strain * 0.04;
    hipX = footX - facing * 0.06;
    hipZ = footZ + (humanCfg.shinLengthM + humanCfg.thighLengthM - 0.03) - kneeFlex;
    // Lean shoulders forward toward the bar handle so arms press downward in compression
    shoulderX = lerp(hipX, handX, 0.56);
    const maxTorsoDz = Math.sqrt(
      Math.max(0.04, humanCfg.torsoLengthM * humanCfg.torsoLengthM - Math.pow(shoulderX - hipX, 2))
    );
    shoulderZ = Math.max(handZ + 0.24, hipZ + maxTorsoDz * 0.92);
    // Elbows bow slightly outward/up-back behind the downward push line
    elbowBendDir = facing;
  } else {
    // Upward lift / deadlift posture
    const liftRel = clamp((handZ - (footZ + 0.58)) / 0.85, 0, 1);
    const squat = (1 - liftRel) * 0.28 + strain * 0.05;
    hipX = footX - facing * (0.13 + (1 - liftRel) * 0.10);
    hipZ = footZ + (humanCfg.shinLengthM + humanCfg.thighLengthM - 0.02) - squat;
    shoulderX = hipX + facing * (0.08 + (1 - liftRel) * 0.13);
    shoulderZ = hipZ + humanCfg.torsoLengthM - (1 - liftRel) * 0.07;
    elbowBendDir = -facing;
  }

  const legIK = solveTwoBoneIK(
    ankleX,
    ankleZ,
    hipX,
    hipZ,
    humanCfg.shinLengthM,
    humanCfg.thighLengthM,
    -facing
  );

  const armIK = solveTwoBoneIK(
    shoulderX,
    shoulderZ,
    handX,
    handZ,
    humanCfg.upperArmLengthM,
    humanCfg.forearmLengthM,
    elbowBendDir
  );

  const headX = shoulderX + facing * 0.04;
  const headZ = shoulderZ + humanCfg.headOffsetZ;

  return {
    facing,
    actionMode,
    strain: clamp(strain, 0, 1),
    foot: { x: footX, z: footZ },
    ankle: { x: ankleX, z: ankleZ },
    knee: { x: legIK.jx, z: legIK.jz },
    hip: { x: hipX, z: hipZ },
    shoulder: { x: shoulderX, z: shoulderZ },
    elbow: { x: armIK.jx, z: armIK.jz },
    hand: { x: armIK.endX, z: armIK.endZ },
    head: { x: headX, z: headZ },
    legToTorsoPath: [
      { x: footX, z: footZ, width: 0.16 },
      { x: legIK.jx, z: legIK.jz, width: 0.11 },
      { x: hipX, z: hipZ, width: 0.13 },
      { x: shoulderX, z: shoulderZ, width: 0.13 },
    ],
    armToTorsoPath: [
      { x: armIK.endX, z: armIK.endZ, width: 0.085 },
      { x: armIK.jx, z: armIK.jz, width: 0.09 },
      { x: shoulderX, z: shoulderZ, width: 0.12 },
      { x: lerp(shoulderX, hipX, 0.45), z: lerp(shoulderZ, hipZ, 0.45), width: 0.14 },
    ],
    fullGroundToHandPath: [
      { x: footX, z: footZ, width: 0.16 },
      { x: legIK.jx, z: legIK.jz, width: 0.11 },
      { x: hipX, z: hipZ, width: 0.13 },
      { x: shoulderX, z: shoulderZ, width: 0.12 },
      { x: armIK.jx, z: armIK.jz, width: 0.09 },
      { x: armIK.endX, z: armIK.endZ, width: 0.085 },
    ],
  };
}

/**
 * Enforces strict true-contact wheel/ground mechanics:
 * - Zero force and zero ground compression whenever `wheelFreeBottomZ >= groundSurfaceZ`.
 * - Flush wheel-bottom contact (`wheelBottomZ === groundSurfaceZ`) whenever `forceZ > 0`.
 */
export function evaluateWheelGroundContact(chassisBottomZ, unloadedClearanceM, groundSurfaceZ, wheelStiffnessNpm) {
  const wheelFreeBottomZ = chassisBottomZ - unloadedClearanceM;
  const penetrationM = groundSurfaceZ - wheelFreeBottomZ;
  if (penetrationM <= 0) {
    return {
      inContact: false,
      wheelBottomZ: wheelFreeBottomZ,
      penetrationM: 0,
      forceZ: 0,
    };
  }
  return {
    inContact: true,
    wheelBottomZ: groundSurfaceZ,
    penetrationM,
    forceZ: wheelStiffnessNpm * penetrationM,
  };
}

/**
 * Exact closed-form Michell/Flamant 2D elastic half-space upward +z momentum flux J_{p_z}(x, z)
 * integrated analytically over each extended flat strip `[c.x - width/2, c.x + width/2]`.
 *
 * Produces a completely smooth, uniform upward flux sheet `F / width` across wide flat interfaces
 * (blocks, tire treads) while converging cleanly from depth without discrete quadrature ribbing!
 */
export function evaluateStripFlamantFlux(x, z, groundContacts, physicsCfg) {
  let jx = 0;
  let jz = 0;

  for (let i = 0; i < groundContacts.length; i++) {
    const c = groundContacts[i];
    if (c.forceZ <= 0.5) continue;
    const surfaceZ = c.z;
    if (z > surfaceZ + 0.02) continue;

    const d = Math.max(physicsCfg.flamantDepthFloorM, surfaceZ - z);
    const halfW = Math.max(0.025, c.width * 0.5);
    const pLoad = c.forceZ / (2.0 * halfW);

    const xi1 = c.x - halfW - x;
    const xi2 = c.x + halfW - x;
    const r1Sq = xi1 * xi1 + d * d;
    const r2Sq = xi2 * xi2 + d * d;

    const thetaTerm = Math.atan2(xi2, d) - Math.atan2(xi1, d);
    const sinCosTerm = (xi2 * d) / r2Sq - (xi1 * d) / r1Sq;

    jz += (pLoad / Math.PI) * (thetaTerm + sinCosTerm);
    jx += ((pLoad * d * d) / Math.PI) * (1.0 / r1Sq - 1.0 / r2Sq);
  }

  return { jx, jz };
}

/**
 * Computes elastic ground surface depression at horizontal coordinate `x` integrated across
 * each active extended contact strip. Strictly zero when `forceZ <= 0` (no levitating compression!).
 */
export function evaluateStripGroundDepression(x, groundContacts, compliance, maxDepM, physicsCfg) {
  let dz = 0;
  const nodes = physicsCfg.stripQuadratureNodes;
  const weights = physicsCfg.stripQuadratureWeights;

  for (let i = 0; i < groundContacts.length; i++) {
    const c = groundContacts[i];
    if (c.forceZ <= 0.5) continue;
    const halfW = Math.max(0.04, c.width * 0.5);
    const kernelSigma = Math.max(0.11, halfW * 0.42);
    const inv2Sig2 = 1.0 / (2.0 * kernelSigma * kernelSigma);

    let stripSum = 0;
    for (let k = 0; k < nodes.length; k++) {
      const sx = c.x + nodes[k] * halfW;
      const dx = x - sx;
      stripSum += 0.5 * weights[k] * Math.exp(-dx * dx * inv2Sig2);
    }
    dz -= c.forceZ * compliance * stripSum;
  }

  return Math.max(-maxDepM, dz);
}

/**
 * Total arc length of a 2D polyline in meters.
 */
export function polylineLength(points) {
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    total += Math.hypot(points[i + 1].x - points[i].x, points[i + 1].z - points[i].z);
  }
  return Math.max(0.02, total);
}

/**
 * Samples position, unit tangent, and interpolated width along a polyline at `u in [0, 1]`.
 */
export function samplePolyline(points, u) {
  if (points.length === 1) {
    return { x: points[0].x, z: points[0].z, dx: 0, dz: 1, width: points[0].width };
  }
  let total = 0;
  const lens = [];
  for (let i = 0; i < points.length - 1; i++) {
    const L = Math.hypot(points[i + 1].x - points[i].x, points[i + 1].z - points[i].z);
    lens.push(L);
    total += L;
  }
  if (total < 1e-5) {
    return { x: points[0].x, z: points[0].z, dx: 0, dz: 1, width: points[0].width };
  }

  let target = clamp(u, 0, 1) * total;
  for (let i = 0; i < lens.length; i++) {
    if (target <= lens[i] || i === lens.length - 1) {
      const segL = Math.max(1e-5, lens[i]);
      const t = clamp(target / segL, 0, 1);
      const p0 = points[i];
      const p1 = points[i + 1];
      return {
        x: p0.x + (p1.x - p0.x) * t,
        z: p0.z + (p1.z - p0.z) * t,
        dx: (p1.x - p0.x) / segL,
        dz: (p1.z - p0.z) / segL,
        width: p0.width + (p1.width - p0.width) * t,
      };
    }
    target -= lens[i];
  }
  const last = points[points.length - 1];
  return { x: last.x, z: last.z, dx: 0, dz: 1, width: last.width };
}

/**
 * Tests whether normalized local coordinates `(lx in [-0.5, 0.5], lz in [0, 1])`
 * fall inside the tapered car greenhouse + lower body silhouette.
 */
export function isInsideCarSilhouette(lx, lz) {
  if (lz < 0.05 || lz > 0.95 || Math.abs(lx) > 0.47) return false;
  if (lz <= 0.48) return true;
  const cabinHalfW = 0.35 - (lz - 0.48) * 0.22;
  return Math.abs(lx) <= cabinHalfW;
}
