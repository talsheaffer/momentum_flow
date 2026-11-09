// Physics, True-Contact Kinematics & Additive FlowComponent Generators for All 4 Chapters
//
// Chapters:
//   1. `gravity` : Falling & Resting — wide-interface ground support & signed density glow
//   2. `lift`    : Lifting & Lowering — ground supplies momentum; muscles supply/dissipate energy
//   3. `car`     : The Unliftable Car — tire decompression offloads onto series-limited human
//   4. `lever`   : The Class-1 Lever — fulcrum in middle channels momentum; human pushes down to supply energy

import { DEFAULT_CONFIG } from './config.js';
import { createFlowComponent, composeFlowField } from './components.js';
import {
  clamp,
  lerp,
  computeHumanPose,
  evaluateWheelGroundContact,
  evaluateStripGroundDepression,
} from './geometry.js';

export const CHAPTERS = [
  {
    id: 'gravity',
    num: 'I',
    title: 'Falling & Resting',
    subtitle: 'Volumetric gravity drain, wide-interface ground flow & signed momentum glow',
  },
  {
    id: 'lift',
    num: 'II',
    title: 'Lifting & Lowering',
    subtitle: 'Ground supplies momentum; muscles supply & dissipate energy',
  },
  {
    id: 'car',
    num: 'III',
    title: 'The Unliftable Car',
    subtitle: 'Tire decompression offloads momentum onto a series-limited human',
  },
  {
    id: 'lever',
    num: 'IV',
    title: 'The Class-1 Lever',
    subtitle: 'Fulcrum funnels momentum to a point; pushing down supplies the energy',
  },
];

/**
 * Solves coupled two-wheel true-contact equilibrium for a given chassis bottom height `chassisZ`
 * so ground depression and tire compression agree with zero floating/levitation artifacts.
 */
function solveTwoWheelContact(
  chassisZ,
  rearX,
  frontX,
  extraContacts,
  carCfg,
  visualCfg,
  physicsCfg
) {
  const kRear = carCfg.totalSuspensionStiffnessNpm * carCfg.rearWeightShare;
  const kFront = carCfg.totalSuspensionStiffnessNpm * (1.0 - carCfg.rearWeightShare);

  // Exact analytical self-compliance of a unit-force tire strip so series (tire + ground) never oscillates!
  const selfCompliance = -evaluateStripGroundDepression(
    0,
    [{ x: 0, width: carCfg.tireContactWidthM, forceZ: 1.0 }],
    carCfg.groundVisualCompliance,
    1.0,
    physicsCfg
  );
  const kRearEff = kRear / (1.0 + kRear * selfCompliance);
  const kFrontEff = kFront / (1.0 + kFront * selfCompliance);
  const freeBottomZ = chassisZ - carCfg.unloadedClearanceM;

  let rearForce = 0;
  let frontForce = 0;
  for (let iter = 0; iter < 2; iter++) {
    const depRearOther = evaluateStripGroundDepression(
      rearX,
      [...extraContacts, { x: frontX, width: carCfg.tireContactWidthM, forceZ: frontForce }],
      carCfg.groundVisualCompliance,
      visualCfg.maxGroundDepressionM,
      physicsCfg
    );
    rearForce = Math.max(0, kRearEff * (depRearOther - freeBottomZ));

    const depFrontOther = evaluateStripGroundDepression(
      frontX,
      [...extraContacts, { x: rearX, width: carCfg.tireContactWidthM, forceZ: rearForce }],
      carCfg.groundVisualCompliance,
      visualCfg.maxGroundDepressionM,
      physicsCfg
    );
    frontForce = Math.max(0, kFrontEff * (depFrontOther - freeBottomZ));
  }

  const allContacts = [
    ...extraContacts,
    { x: rearX, width: carCfg.tireContactWidthM, forceZ: rearForce },
    { x: frontX, width: carCfg.tireContactWidthM, forceZ: frontForce },
  ];
  const rearGroundZ = evaluateStripGroundDepression(
    rearX,
    allContacts,
    carCfg.groundVisualCompliance,
    visualCfg.maxGroundDepressionM,
    physicsCfg
  );
  const frontGroundZ = evaluateStripGroundDepression(
    frontX,
    allContacts,
    carCfg.groundVisualCompliance,
    visualCfg.maxGroundDepressionM,
    physicsCfg
  );

  const rearWheel = evaluateWheelGroundContact(chassisZ, carCfg.unloadedClearanceM, rearGroundZ, kRear);
  const frontWheel = evaluateWheelGroundContact(chassisZ, carCfg.unloadedClearanceM, frontGroundZ, kFront);

  return {
    rearWheel,
    frontWheel,
    rearGroundZ,
    frontGroundZ,
    totalTireForceZ: rearWheel.forceZ + frontWheel.forceZ,
  };
}

/**
 * Finds the exact resting `chassisBottomZ` where total tire contact force equals `targetTireForceZ`.
 */
function solveChassisZForTireForce(
  targetTireForceZ,
  rearX,
  frontX,
  extraContacts,
  carCfg,
  visualCfg,
  physicsCfg
) {
  if (targetTireForceZ <= 0.5) {
    return carCfg.unloadedClearanceM;
  }
  let lo = -0.15;
  let hi = carCfg.unloadedClearanceM;
  for (let i = 0; i < 18; i++) {
    const mid = 0.5 * (lo + hi);
    const res = solveTwoWheelContact(mid, rearX, frontX, extraContacts, carCfg, visualCfg, physicsCfg);
    if (res.totalTireForceZ > targetTireForceZ) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return 0.5 * (lo + hi);
}

export function createScenarioEngine(config = DEFAULT_CONFIG) {
  const phys = config.physics;
  const G = phys.gravityMps2;

  const state = {
    chapterId: 'gravity',
    time: 0,
    enableHumanSelfWeightInPullScenes: false,
    enableLeverSelfWeight: false,

    ch1: {
      materialKey: config.gravityChapter.defaultMaterialKey,
      z: 0,
      vz: 0,
      az: 0,
      impactHeatWatts: 0,
      dragging: false,
      dragTargetZ: 0,
    },

    ch2: {
      z: config.liftChapter.initialLiftZM,
      vz: 0,
      az: 0,
      mode: 'hold',
      targetZ: config.liftChapter.initialLiftZM,
    },

    ch3: {
      effort: config.carChapter.initialEffort,
      smoothEffort: config.carChapter.initialEffort,
      chassisZ: 0.25,
      carVz: 0,
    },

    ch4: {
      fulcrumX: config.leverChapter.defaultFulcrumXM,
      ratio: 10.7,
      handlePushDown: config.leverChapter.initialHandlePushDownM,
      targetHandlePushDown: config.leverChapter.initialHandlePushDownM,
      handlePushRate: 0, // d(handlePushDown)/dt > 0 means pushing handle DOWN (lifting car UP!)
      handlePushAccel: 0,
      mode: 'hold',
    },
  };

  resetChapter('gravity');
  resetChapter('lift');
  resetChapter('car');
  resetChapter('lever');

  function computeClass1Ratio(fulcrumX) {
    const c = config.leverChapter;
    const dLoad = Math.max(0.12, fulcrumX - c.carJackPadXM);
    const dEffort = Math.max(0.4, c.handleXM - fulcrumX);
    return dEffort / dLoad;
  }

  function setLeverRatio(targetRatio) {
    const c = config.leverChapter;
    const minR = computeClass1Ratio(c.fulcrumMaxXM);
    const maxR = computeClass1Ratio(c.fulcrumMinXM);
    const r = clamp(targetRatio, minR, maxR);
    // R = (handleX - fX) / (fX - jackPadX) => fX = (handleX + R * jackPadX) / (1 + R)
    state.ch4.fulcrumX = (c.handleXM + r * c.carJackPadXM) / (1.0 + r);
    state.ch4.ratio = computeClass1Ratio(state.ch4.fulcrumX);
  }

  function setFulcrumX(x) {
    const c = config.leverChapter;
    state.ch4.fulcrumX = clamp(x, c.fulcrumMinXM, c.fulcrumMaxXM);
    state.ch4.ratio = computeClass1Ratio(state.ch4.fulcrumX);
  }

  function resetChapter(id) {
    if (id === 'gravity') {
      const gCfg = config.gravityChapter;
      const mat = gCfg.materials[state.ch1.materialKey];
      state.ch1.z = -(mat.massKg * G) / gCfg.groundStiffnessNpm;
      state.ch1.vz = 0;
      state.ch1.az = 0;
      state.ch1.impactHeatWatts = 0;
      state.ch1.dragging = false;
    } else if (id === 'lift') {
      const lCfg = config.liftChapter;
      state.ch2.z = lCfg.initialLiftZM;
      state.ch2.targetZ = lCfg.initialLiftZM;
      state.ch2.vz = 0;
      state.ch2.az = 0;
      state.ch2.mode = 'hold';
    } else if (id === 'car') {
      const cCfg = config.carChapter;
      state.ch3.effort = cCfg.initialEffort;
      state.ch3.smoothEffort = cCfg.initialEffort;
      state.ch3.carVz = 0;
    } else if (id === 'lever') {
      const lvCfg = config.leverChapter;
      setFulcrumX(lvCfg.defaultFulcrumXM);
      state.ch4.handlePushDown = lvCfg.initialHandlePushDownM;
      state.ch4.targetHandlePushDown = lvCfg.initialHandlePushDownM;
      state.ch4.handlePushRate = 0;
      state.ch4.handlePushAccel = 0;
      state.ch4.mode = 'hold';
    }
  }

  function dropBlockFromAir() {
    state.ch1.dragging = false;
    state.ch1.z = config.gravityChapter.dropReleaseHeightM;
    state.ch1.vz = 0;
    state.ch1.az = -G;
  }

  function setMaterial(key) {
    if (!config.gravityChapter.materials[key]) {
      throw new Error(`Unknown material key: ${key}`);
    }
    state.ch1.materialKey = key;
  }

  function setLiftCommand(cmd) {
    if (state.chapterId === 'lift') {
      const c = state.ch2;
      const lCfg = config.liftChapter;
      c.mode = cmd;
      if (cmd === 'lift') {
        if (c.z > lCfg.maxLiftZM - 0.06) c.z = lCfg.minLiftZM + 0.02;
        c.targetZ = lCfg.maxLiftZM;
      } else if (cmd === 'lower') {
        if (c.z < lCfg.minLiftZM + 0.06) c.z = lCfg.maxLiftZM - 0.02;
        c.targetZ = lCfg.minLiftZM;
      } else {
        c.targetZ = c.z;
      }
    } else if (state.chapterId === 'lever') {
      // In Class-1 lever: 'lift' (car up) = push handle DOWN; 'lower' (car down) = let handle UP!
      const c = state.ch4;
      const lvCfg = config.leverChapter;
      c.mode = cmd;
      if (cmd === 'lift') {
        if (c.handlePushDown > lvCfg.handleMaxPushDownM - 0.08) {
          c.handlePushDown = lvCfg.handleMinPushDownM + 0.02;
        }
        c.targetHandlePushDown = lvCfg.handleMaxPushDownM;
      } else if (cmd === 'lower') {
        if (c.handlePushDown < lvCfg.handleMinPushDownM + 0.08) {
          c.handlePushDown = lvCfg.handleMaxPushDownM - 0.02;
        }
        c.targetHandlePushDown = lvCfg.handleMinPushDownM;
      } else {
        c.targetHandlePushDown = c.handlePushDown;
      }
    }
  }

  function step(dt) {
    const safeDt = Math.min(dt, phys.maxFrameDtSec);
    state.time += safeDt;

    if (state.chapterId === 'gravity') return stepGravity(safeDt);
    if (state.chapterId === 'lift') return stepLift(safeDt);
    if (state.chapterId === 'car') return stepCarDirect(safeDt);
    return stepClass1Lever(safeDt);
  }

  // ---------------------------------------------------------------------------
  // CHAPTER 1: FALLING & RESTING (Wide-Interface Flow & Signed Momentum Glow)
  // ---------------------------------------------------------------------------
  function stepGravity(dt) {
    const gCfg = config.gravityChapter;
    const s = state.ch1;
    const mat = gCfg.materials[s.materialKey];
    const weight = mat.massKg * G;

    let groundForce = 0;

    if (s.dragging) {
      const prevVz = s.vz;
      const nextZ = lerp(
        s.z,
        clamp(s.dragTargetZ, 0.02, gCfg.maxDragHeightM),
        1 - Math.exp(-phys.dragResponseHz * dt)
      );
      s.vz = (nextZ - s.z) / Math.max(1e-4, dt);
      s.az = clamp((s.vz - prevVz) / Math.max(1e-4, dt), -phys.accelerationClampMps2, phys.accelerationClampMps2);
      s.z = nextZ;
      s.impactHeatWatts *= Math.exp(-gCfg.impactHeatDecayHz * 2 * dt);
    } else {
      const h = dt / phys.subSteps;
      let instantImpactHeat = 0;

      for (let i = 0; i < phys.subSteps; i++) {
        // Strict true contact: groundForce > 0 if and only if s.z < 0!
        let fGround = 0;
        if (s.z < 0) {
          const springF = -gCfg.groundStiffnessNpm * s.z;
          const dampF = -gCfg.groundDampingNsPm * s.vz;
          fGround = Math.max(0, springF + dampF);
          if (s.vz < 0) {
            instantImpactHeat += Math.max(0, dampF * (-s.vz)) / phys.subSteps;
          }
        }
        s.az = (fGround - weight) / mat.massKg;
        s.vz += s.az * h;
        s.z += s.vz * h;
        groundForce = fGround;
      }

      const eqZ = -weight / gCfg.groundStiffnessNpm;
      if (Math.abs(s.z - eqZ) < phys.settlePosToleranceM && Math.abs(s.vz) < phys.settleVelToleranceMps) {
        s.z = eqZ;
        s.vz = 0;
        s.az = 0;
        groundForce = weight;
      }
      s.impactHeatWatts = Math.max(instantImpactHeat, s.impactHeatWatts * Math.exp(-gCfg.impactHeatDecayHz * dt));
    }

    const inGroundContact = groundForce > 0.5 && !s.dragging;
    const contacts = inGroundContact
      ? [{ contactId: 'block_pad', x: 0, z: 0, width: gCfg.blockWidthM, forceZ: groundForce }]
      : [];

    const surfaceDep = evaluateStripGroundDepression(
      0,
      contacts,
      gCfg.groundVisualCompliance,
      config.visual.maxGroundDepressionM,
      phys
    );
    if (inGroundContact) {
      contacts[0].z = surfaceDep;
    }

    // Flush true-contact block placement: rests directly on surfaceDep when in contact, or above when airborne!
    const visualBlockBottom = inGroundContact ? surfaceDep : Math.max(surfaceDep + 0.002, s.z);

    const eqZ = -weight / gCfg.groundStiffnessNpm;
    const heightAboveRest = Math.max(0, s.z - eqZ);
    const peJoules = weight * heightAboveRest;
    const keJoules = 0.5 * mat.massKg * s.vz * s.vz;
    const maxJoules = weight * gCfg.dropReleaseHeightM;

    // Signed z-momentum density: +1 = strong upward (+z cyan glow), 0 = neutral, -1 = downward (-z yellow glow)
    const signedDensityRatio = clamp(
      (s.vz / gCfg.signedMomentumVelScaleMps) * Math.sqrt(mat.densityNorm),
      -1,
      1
    );

    const conduitPaths = {
      // Wide uniform sheet across the ENTIRE flat block-ground interface!
      block_wide_interface: [
        { x: 0, z: surfaceDep, width: gCfg.blockWidthM * 0.96 },
        { x: 0, z: visualBlockBottom + gCfg.blockHeightM * 0.55, width: gCfg.blockWidthM * 0.94 },
      ],
    };

    const bodyRect = {
      id: 'block',
      label: mat.label,
      x: 0,
      z: visualBlockBottom,
      w: gCfg.blockWidthM,
      h: gCfg.blockHeightM,
      densityNorm: mat.densityNorm,
      signedDensityRatio,
      energyGlowRatio: clamp((peJoules + keJoules) / Math.max(1, maxJoules), 0, 1),
    };

    const components = [
      createFlowComponent({
        id: 'payload_support',
        label: 'Wide-Interface Ground Support & Gravity Drain',
        enabled: true,
        groundContacts: contacts,
        zConduits: [
          {
            conduitId: 'ground_to_block_sheet',
            pathId: 'block_wide_interface',
            currentZ: inGroundContact ? groundForce : 0,
            activeContact: inGroundContact,
          },
        ],
        zVolumeSinks: [
          {
            bodyId: 'block',
            drainRateZ: weight,
            densityNorm: mat.densityNorm,
            signedDensityRatio,
          },
        ],
        storedEnergy: [
          {
            bodyId: 'block',
            totalJoules: peJoules + keJoules,
            referenceMaxJoules: maxJoules,
          },
        ],
        heatPlumes:
          s.impactHeatWatts > 6
            ? [
                {
                  plumeId: 'impact_heat',
                  x: 0,
                  z: surfaceDep + 0.03,
                  spreadX: gCfg.blockWidthM * 0.8,
                  watts: s.impactHeatWatts,
                },
              ]
            : [],
      }),
    ];

    const field = composeFlowField(components);

    const captionZ = s.dragging
      ? 'Drag upward and release to drop: moving up glows cyan (+z surplus); resting is neutral.'
      : !inGroundContact
      ? 'Free fall: unreplenished gravity drain drives +z momentum below neutral—glowing yellow (-z deficit) as downward speed grows.'
      : 'At rest: upward +z momentum enters across the entire wide contact interface from the compressed ground, holding the block neutral.';

    const captionE = s.dragging
      ? 'Raising the block fills it with a stationary golden glow of gravitational potential energy.'
      : !inGroundContact
      ? 'Falling: stored energy rides with the block until ground impact.'
      : s.impactHeatWatts > 20
      ? 'Impact! The block’s mechanical energy dissipates at the compressed interface as heat.'
      : 'At rest on the ground, energy glow and energy flow are zero—even while +z momentum streams upward continuously.';

    return {
      chapterId: 'gravity',
      worldSpanX: gCfg.worldSpanXM,
      groundCompliance: gCfg.groundVisualCompliance,
      referenceCurrentZ: gCfg.referenceCurrentZN,
      referencePowerWatts: gCfg.referencePowerW,
      conduitPaths,
      bodies: [bodyRect],
      human: null,
      car: null,
      lever: null,
      fulcrum: null,
      components,
      field,
      circuit: null,
      captions: { z: captionZ, energy: captionE },
      metrics: { weightN: weight, groundForceN: groundForce, velocity: s.vz },
    };
  }

  // ---------------------------------------------------------------------------
  // CHAPTER 2: HUMAN LIFTING, HOLDING & LOWERING
  // ---------------------------------------------------------------------------
  function stepLift(dt) {
    const lCfg = config.liftChapter;
    const hCfg = config.human;
    const s = state.ch2;
    const weight = lCfg.payloadMassKg * G;

    const prevVz = s.vz;
    if (s.mode === 'lift' || s.mode === 'lower') {
      const diff = s.targetZ - s.z;
      if (Math.abs(diff) < 0.007) {
        s.z = s.targetZ;
        s.vz = lerp(s.vz, 0, 1 - Math.exp(-phys.velocitySmoothingHz * 1.5 * dt));
        if (Math.abs(s.vz) < phys.settleVelToleranceMps) {
          s.vz = 0;
          s.mode = 'hold';
        }
      } else {
        const desiredVz = Math.sign(diff) * lCfg.liftSpeedMps * clamp(Math.abs(diff) / 0.14, 0.18, 1);
        s.vz = lerp(s.vz, desiredVz, 1 - Math.exp(-phys.velocitySmoothingHz * dt));
        s.z = clamp(s.z + s.vz * dt, lCfg.minLiftZM, lCfg.maxLiftZM);
      }
    } else if (s.mode === 'drag') {
      const nextZ = lerp(
        s.z,
        clamp(s.targetZ, lCfg.minLiftZM, lCfg.maxLiftZM),
        1 - Math.exp(-phys.dragResponseHz * dt)
      );
      s.vz = (nextZ - s.z) / Math.max(1e-4, dt);
      s.z = nextZ;
    } else {
      s.vz = lerp(s.vz, 0, 1 - Math.exp(-phys.velocitySmoothingHz * dt));
      if (Math.abs(s.vz) < 0.003) s.vz = 0;
    }
    s.az = clamp((s.vz - prevVz) / Math.max(1e-4, dt), -8, 8);

    const handForceZ = Math.max(0, weight + lCfg.payloadMassKg * s.az);
    const humanSelfWeight = hCfg.massKg * G;
    const totalFootForce =
      handForceZ + (state.enableHumanSelfWeightInPullScenes ? humanSelfWeight : 0);

    const footContacts = [{ contactId: 'human_feet', x: lCfg.footXM, z: 0, width: hCfg.footWidthM, forceZ: totalFootForce }];
    const footDep = evaluateStripGroundDepression(
      lCfg.footXM,
      footContacts,
      lCfg.groundVisualCompliance,
      config.visual.maxGroundDepressionM,
      phys
    );

    const handX = lCfg.boxXM - lCfg.boxWidthM * 0.42;
    const handZ = s.z + lCfg.boxHeightM * 0.34;
    const human = computeHumanPose(
      lCfg.footXM,
      footDep,
      handX,
      handZ,
      1,
      clamp(handForceZ / hCfg.maxUpwardPullN, 0, 1),
      'pull_up',
      hCfg
    );

    const mechPowerWatts = handForceZ * s.vz;
    const isometricHeat = hCfg.baseIsometricHeatW * (handForceZ / weight);
    let muscleChemGen = isometricHeat;
    let muscleHeatWatts = isometricHeat;

    if (mechPowerWatts > 4) {
      const waste = mechPowerWatts * hCfg.concentricWasteFactor;
      muscleChemGen += mechPowerWatts + waste;
      muscleHeatWatts += waste;
    } else if (mechPowerWatts < -4) {
      const returningPower = -mechPowerWatts;
      const eccentricBurn = returningPower * hCfg.eccentricBurnFactor;
      muscleChemGen += eccentricBurn;
      muscleHeatWatts += returningPower + eccentricBurn;
    }

    const peJoules = weight * (s.z - lCfg.minLiftZM);
    const maxJoules = weight * (lCfg.maxLiftZM - lCfg.minLiftZM);
    const signedDensityRatio = clamp(s.vz / lCfg.signedMomentumVelScaleMps, -1, 1);

    const muscleCenter = {
      x: lerp(human.hip.x, human.shoulder.x, 0.48),
      z: lerp(human.hip.z, human.shoulder.z, 0.48),
    };

    const conduitPaths = {
      human_to_crate: [
        ...human.fullGroundToHandPath,
        { x: lCfg.boxXM, z: s.z + lCfg.boxHeightM * 0.45, width: 0.16 },
      ],
      muscle_to_crate: [
        { x: muscleCenter.x, z: muscleCenter.z, width: 0.12 },
        { x: human.shoulder.x, z: human.shoulder.z, width: 0.11 },
        { x: human.elbow.x, z: human.elbow.z, width: 0.09 },
        { x: human.hand.x, z: human.hand.z, width: 0.085 },
        { x: lCfg.boxXM, z: s.z + lCfg.boxHeightM * 0.48, width: 0.15 },
      ],
      human_self_column: human.legToTorsoPath,
    };

    const boxBody = {
      id: 'crate',
      label: `${lCfg.payloadMassKg} kg Weight`,
      x: lCfg.boxXM,
      z: s.z,
      w: lCfg.boxWidthM,
      h: lCfg.boxHeightM,
      densityNorm: lCfg.payloadDensityNorm,
      signedDensityRatio,
      energyGlowRatio: clamp(peJoules / Math.max(1, maxJoules), 0, 1),
    };

    const components = [
      createFlowComponent({
        id: 'payload_support',
        label: 'Payload Gravitational Channel',
        enabled: true,
        groundContacts: [{ contactId: 'human_feet', x: lCfg.footXM, z: footDep, width: hCfg.footWidthM, forceZ: weight }],
        zConduits: [{ conduitId: 'human_to_load', pathId: 'human_to_crate', currentZ: weight, activeContact: true }],
        zVolumeSinks: [{ bodyId: 'crate', drainRateZ: weight, densityNorm: lCfg.payloadDensityNorm, signedDensityRatio }],
      }),
      createFlowComponent({
        id: 'payload_inertia',
        label: 'Payload Acceleration Surge',
        enabled: true,
        groundContacts: [
          { contactId: 'human_feet', x: lCfg.footXM, z: footDep, width: hCfg.footWidthM, forceZ: handForceZ - weight },
        ],
        zConduits: [
          { conduitId: 'human_to_load', pathId: 'human_to_crate', currentZ: handForceZ - weight, activeContact: true },
        ],
      }),
      createFlowComponent({
        id: 'payload_energy',
        label: 'Muscle Work & Thermal Dissipation',
        enabled: true,
        energySources: [{ sourceId: 'human_muscles', x: muscleCenter.x, z: muscleCenter.z, radius: 0.22, powerWatts: muscleChemGen }],
        energyConduits: [
          {
            conduitId: 'muscle_work_arm',
            pathId: 'muscle_to_crate',
            powerWatts: Math.abs(mechPowerWatts) > 3 ? mechPowerWatts : 0,
            activeContact: true,
          },
        ],
        storedEnergy: [{ bodyId: 'crate', totalJoules: peJoules, referenceMaxJoules: maxJoules }],
        heatPlumes: [{ plumeId: 'muscle_heat', x: muscleCenter.x, z: human.shoulder.z + 0.06, spreadX: 0.26, watts: muscleHeatWatts }],
      }),
      createFlowComponent({
        id: 'human_self_weight',
        label: 'Human Self-Weight',
        enabled: state.enableHumanSelfWeightInPullScenes,
        groundContacts: [{ contactId: 'human_feet', x: lCfg.footXM, z: footDep, width: hCfg.footWidthM, forceZ: humanSelfWeight }],
        zConduits: [{ conduitId: 'human_self', pathId: 'human_self_column', currentZ: humanSelfWeight, activeContact: true }],
      }),
    ];

    const field = composeFlowField(components);
    const isMovingUp = s.vz > 0.03;
    const isMovingDown = s.vz < -0.03;

    const captionZ = isMovingUp
      ? 'Lifting: +z momentum surges rapidly from the ground through your compressed body; the rising weight glows cyan (+z).'
      : isMovingDown
      ? 'Lowering: The descending weight glows yellow (-z momentum), while upward +z current from the ground brakes its fall.'
      : 'Holding steady: Weight is neutral (v = 0), while upward +z momentum channels continuously from the ground through you.';

    const captionE = isMovingUp
      ? 'Lifting: Energy generated in muscles streams into the weight’s stationary golden glow, while inefficiency escapes as heat.'
      : isMovingDown
      ? 'Lowering: Stored golden energy flows BACK out of the weight into your muscles—dissipating 100% as heat.'
      : 'Holding steady: Zero energy flows to the weight, while biological muscles shed heat just to stay compressed.';

    return {
      chapterId: 'lift',
      worldSpanX: lCfg.worldSpanXM,
      groundCompliance: lCfg.groundVisualCompliance,
      referenceCurrentZ: lCfg.referenceCurrentZN,
      referencePowerWatts: lCfg.referencePowerW,
      conduitPaths,
      bodies: [boxBody],
      human,
      car: null,
      lever: null,
      fulcrum: null,
      components,
      field,
      circuit: null,
      captions: { z: captionZ, energy: captionE },
      metrics: {
        phase: isMovingUp ? 'lift' : isMovingDown ? 'lower' : 'hold',
        handForceN: handForceZ,
        mechPowerWatts,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // CHAPTER 3: THE UNLIFTABLE CAR (True Tire Decompression & Series Limit)
  // ---------------------------------------------------------------------------
  function stepCarDirect(dt) {
    const cCfg = config.carChapter;
    const hCfg = config.human;
    const s = state.ch3;
    const carWeight = cCfg.carMassKg * G;

    s.smoothEffort = lerp(s.smoothEffort, clamp(s.effort, 0, 1), 1 - Math.exp(-9 * dt));
    const humanForce = s.smoothEffort * hCfg.maxUpwardPullN;
    const targetTireForce = Math.max(0, carWeight - humanForce);

    const rearX = cCfg.carCenterXM - cCfg.wheelHalfTrackM;
    const frontX = cCfg.carCenterXM + cCfg.wheelHalfTrackM;
    const humanExtraContacts =
      humanForce > 1 ? [{ x: cCfg.humanFootXM, width: hCfg.footWidthM, forceZ: humanForce }] : [];

    const prevChassisZ = s.chassisZ;
    s.chassisZ = solveChassisZForTireForce(
      targetTireForce,
      rearX,
      frontX,
      humanExtraContacts,
      cCfg,
      config.visual,
      phys
    );
    s.carVz = (s.chassisZ - prevChassisZ) / Math.max(1e-4, dt);

    const wheelState = solveTwoWheelContact(
      s.chassisZ,
      rearX,
      frontX,
      humanExtraContacts,
      cCfg,
      config.visual,
      phys
    );

    const restChassisZ = solveChassisZForTireForce(
      carWeight,
      rearX,
      frontX,
      [],
      cCfg,
      config.visual,
      phys
    );
    const carRise = Math.max(0, s.chassisZ - restChassisZ);

    const allContactsForFoot = [
      { x: rearX, width: cCfg.tireContactWidthM, forceZ: wheelState.rearWheel.forceZ },
      { x: frontX, width: cCfg.tireContactWidthM, forceZ: wheelState.frontWheel.forceZ },
      { x: cCfg.humanFootXM, width: hCfg.footWidthM, forceZ: humanForce },
    ];
    const footDep = evaluateStripGroundDepression(
      cCfg.humanFootXM,
      allContactsForFoot,
      cCfg.groundVisualCompliance,
      config.visual.maxGroundDepressionM,
      phys
    );

    const bumperX = cCfg.carCenterXM + cCfg.carWidthM * 0.5;
    const bumperZ = s.chassisZ + 0.18;
    const strain = clamp(humanForce / hCfg.maxUpwardPullN, 0, 1);
    const human = computeHumanPose(cCfg.humanFootXM, footDep, bumperX, bumperZ, -1, strain, 'pull_up', hCfg);

    const signedDensityRatio = clamp(s.carVz / cCfg.signedMomentumVelScaleMps, -1, 1);

    const carObj = {
      id: 'car',
      label: `${cCfg.carMassKg} kg Car (${(carWeight / 1000).toFixed(1)} kN)`,
      x: cCfg.carCenterXM,
      z: s.chassisZ,
      w: cCfg.carWidthM,
      h: cCfg.carHeightM,
      densityNorm: cCfg.carDensityNorm,
      signedDensityRatio,
      energyGlowRatio: clamp(carRise / 0.14, 0, 1),
      rearTire: {
        x: rearX,
        width: cCfg.tireContactWidthM,
        groundZ: wheelState.rearGroundZ,
        wheelBottomZ: wheelState.rearWheel.wheelBottomZ,
        inContact: wheelState.rearWheel.inContact,
        forceZ: wheelState.rearWheel.forceZ,
        maxForce: carWeight * 0.55,
      },
      frontTire: {
        x: frontX,
        width: cCfg.tireContactWidthM,
        groundZ: wheelState.frontGroundZ,
        wheelBottomZ: wheelState.frontWheel.wheelBottomZ,
        inContact: wheelState.frontWheel.inContact,
        forceZ: wheelState.frontWheel.forceZ,
        maxForce: carWeight * 0.6,
      },
    };

    const muscleCenter = {
      x: lerp(human.hip.x, human.shoulder.x, 0.5),
      z: lerp(human.hip.z, human.shoulder.z, 0.5),
    };

    const conduitPaths = {
      rear_tire_strut: [
        { x: rearX, z: wheelState.rearWheel.wheelBottomZ, width: cCfg.tireContactWidthM * 0.9 },
        { x: rearX, z: s.chassisZ + 0.22, width: cCfg.tireContactWidthM * 0.85 },
      ],
      front_tire_strut: [
        { x: frontX, z: wheelState.frontWheel.wheelBottomZ, width: cCfg.tireContactWidthM * 0.9 },
        { x: frontX, z: s.chassisZ + 0.22, width: cCfg.tireContactWidthM * 0.85 },
      ],
      human_to_bumper: [
        ...human.fullGroundToHandPath,
        { x: bumperX - 0.14, z: bumperZ + 0.06, width: 0.14 },
      ],
      muscle_to_bumper: [
        { x: muscleCenter.x, z: muscleCenter.z, width: 0.12 },
        { x: human.shoulder.x, z: human.shoulder.z, width: 0.11 },
        { x: human.elbow.x, z: human.elbow.z, width: 0.09 },
        { x: human.hand.x, z: human.hand.z, width: 0.085 },
        { x: bumperX - 0.16, z: bumperZ + 0.08, width: 0.14 },
      ],
    };

    const mechPower = humanForce * s.carVz;
    const isometricHeat = 420 * Math.pow(strain, 1.25);
    const totalHeat = isometricHeat + (mechPower < 0 ? -mechPower : Math.max(0, mechPower) * 1.8);
    const muscleGen = Math.max(0, mechPower) + totalHeat;

    const components = [
      createFlowComponent({
        id: 'car_tire_branch',
        label: 'Ground-to-Tire Wide Contact Branch',
        enabled: true,
        groundContacts: [
          {
            contactId: 'rear_tire',
            x: rearX,
            z: wheelState.rearGroundZ,
            width: cCfg.tireContactWidthM,
            forceZ: wheelState.rearWheel.forceZ,
          },
          {
            contactId: 'front_tire',
            x: frontX,
            z: wheelState.frontGroundZ,
            width: cCfg.tireContactWidthM,
            forceZ: wheelState.frontWheel.forceZ,
          },
        ],
        zConduits: [
          {
            conduitId: 'rear_tire_col',
            pathId: 'rear_tire_strut',
            currentZ: wheelState.rearWheel.forceZ,
            activeContact: wheelState.rearWheel.inContact,
          },
          {
            conduitId: 'front_tire_col',
            pathId: 'front_tire_strut',
            currentZ: wheelState.frontWheel.forceZ,
            activeContact: wheelState.frontWheel.inContact,
          },
        ],
      }),
      createFlowComponent({
        id: 'human_direct_branch',
        label: 'Human Direct Pull Branch',
        enabled: true,
        groundContacts:
          humanForce > 2
            ? [{ contactId: 'human_feet', x: cCfg.humanFootXM, z: footDep, width: hCfg.footWidthM, forceZ: humanForce }]
            : [],
        zConduits: [
          {
            conduitId: 'human_bumper_col',
            pathId: 'human_to_bumper',
            currentZ: humanForce,
            activeContact: humanForce > 2,
          },
        ],
      }),
      createFlowComponent({
        id: 'car_sink_and_energy',
        label: 'Car Gravity Drain & Strain Energy',
        enabled: true,
        zVolumeSinks: [
          {
            bodyId: 'car',
            drainRateZ: carWeight,
            densityNorm: cCfg.carDensityNorm,
            signedDensityRatio,
          },
        ],
        energySources:
          muscleGen > 5
            ? [{ sourceId: 'human_muscles', x: muscleCenter.x, z: muscleCenter.z, radius: 0.24, powerWatts: muscleGen }]
            : [],
        energyConduits: [
          {
            conduitId: 'human_car_work',
            pathId: 'muscle_to_bumper',
            powerWatts: Math.abs(mechPower) > 12 ? mechPower : 0,
            activeContact: humanForce > 2,
          },
        ],
        storedEnergy: [{ bodyId: 'car', totalJoules: carWeight * carRise, referenceMaxJoules: carWeight * 0.14 }],
        heatPlumes:
          totalHeat > 8
            ? [{ plumeId: 'strain_heat', x: muscleCenter.x, z: human.shoulder.z + 0.08, spreadX: 0.30, watts: totalHeat }]
            : [],
      }),
    ];

    const field = composeFlowField(components);
    const pctHuman = Math.round((humanForce / carWeight) * 100);
    const pctTires = 100 - pctHuman;
    const carKN = (carWeight / 1000).toFixed(1);

    const captionZ =
      s.smoothEffort < 0.06
        ? `All ${carKN} kN of upward momentum enters across the wide compressed tire treads.`
        : s.smoothEffort > 0.90
        ? `Stalled at max strength! Lifting the wheels clear would put you in series with all ${carKN} kN—${pctTires}% still flows through the tires.`
        : `As you pull upward, the tires decompress slightly—offloading ${pctHuman}% of the momentum stream onto your compressed body.`;

    const captionE =
      s.smoothEffort < 0.06
        ? 'The resting car channels huge upward momentum through its tires while consuming zero energy.'
        : 'Straining against an unliftable load produces nearly zero upward displacement—your muscle energy escapes as heat.';

    return {
      chapterId: 'car',
      worldSpanX: cCfg.worldSpanXM,
      groundCompliance: cCfg.groundVisualCompliance,
      referenceCurrentZ: cCfg.referenceCurrentZN,
      referencePowerWatts: cCfg.referencePowerW,
      conduitPaths,
      bodies: [],
      human,
      car: carObj,
      lever: null,
      fulcrum: null,
      components,
      field,
      circuit: {
        mode: 'direct',
        loadCurrent: carWeight,
        tireCurrent: wheelState.totalTireForceZ,
        humanCurrent: humanForce,
        humanMaxCurrent: hCfg.maxUpwardPullN,
        fulcrumCurrent: 0,
        liftedOff: false,
      },
      captions: { z: captionZ, energy: captionE },
      metrics: {
        carWeightN: carWeight,
        tireForceN: wheelState.totalTireForceZ,
        humanForceN: humanForce,
        strain,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // CHAPTER 4: THE CLASS-1 LEVER (Fulcrum in Middle, Human Presses Down!)
  // ---------------------------------------------------------------------------
  function stepClass1Lever(dt) {
    const lvCfg = config.leverChapter;
    const hCfg = config.human;
    const s = state.ch4;

    const carWeight = lvCfg.carMassKg * G;
    const humanWeight = hCfg.massKg * G;
    const ratio = computeClass1Ratio(s.fulcrumX);
    s.ratio = ratio;

    const rearX = lvCfg.carCenterXM - lvCfg.wheelHalfTrackM;
    const frontX = lvCfg.carCenterXM + lvCfg.wheelHalfTrackM;

    // 1. Resting chassis height when lever exerts zero upward force
    const restChassisZ = solveChassisZForTireForce(
      carWeight,
      rearX,
      frontX,
      [],
      lvCfg,
      config.visual,
      phys
    );

    // 2. Maximum upward jack force achievable before human's downward push hits body-weight limit
    const maxJackForce = hCfg.maxDownwardPushN * ratio;
    const canLiftoff = maxJackForce >= carWeight;

    // Chassis height at which tires just reach zero force (true liftoff threshold)
    const liftoffChassisZ = lvCfg.unloadedClearanceM;
    const maxCarRiseBeforeStall = canLiftoff
      ? lvCfg.handleMaxPushDownM / ratio
      : Math.max(0, solveChassisZForTireForce(carWeight - maxJackForce, rearX, frontX, [], lvCfg, config.visual, phys) - restChassisZ);
    const maxAchievablePushDown = Math.min(lvCfg.handleMaxPushDownM, maxCarRiseBeforeStall * ratio);

    // 3. Advance handle downward push displacement (`handlePushDown >= 0`)
    const clampedTarget = clamp(s.targetHandlePushDown, lvCfg.handleMinPushDownM, maxAchievablePushDown);
    const prevRate = s.handlePushRate;

    if (s.mode === 'lift' || s.mode === 'lower') {
      const diff = clampedTarget - s.handlePushDown;
      if (Math.abs(diff) < 0.007) {
        s.handlePushDown = clampedTarget;
        s.handlePushRate = lerp(s.handlePushRate, 0, 1 - Math.exp(-phys.velocitySmoothingHz * 1.4 * dt));
        if (Math.abs(s.handlePushRate) < phys.settleVelToleranceMps) {
          s.handlePushRate = 0;
          if (canLiftoff || s.mode === 'lower') s.mode = 'hold';
        }
      } else {
        const desiredRate = Math.sign(diff) * lvCfg.handleSpeedMps * clamp(Math.abs(diff) / 0.14, 0.18, 1);
        s.handlePushRate = lerp(s.handlePushRate, desiredRate, 1 - Math.exp(-phys.velocitySmoothingHz * dt));
        s.handlePushDown = clamp(s.handlePushDown + s.handlePushRate * dt, 0, maxAchievablePushDown);
      }
    } else if (s.mode === 'drag') {
      const nextP = lerp(s.handlePushDown, clampedTarget, 1 - Math.exp(-phys.dragResponseHz * dt));
      s.handlePushRate = (nextP - s.handlePushDown) / Math.max(1e-4, dt);
      s.handlePushDown = nextP;
    } else {
      if (s.handlePushDown > maxAchievablePushDown) {
        const nextP = lerp(s.handlePushDown, maxAchievablePushDown, 1 - Math.exp(-10 * dt));
        s.handlePushRate = (nextP - s.handlePushDown) / Math.max(1e-4, dt);
        s.handlePushDown = nextP;
      } else {
        s.handlePushRate = lerp(s.handlePushRate, 0, 1 - Math.exp(-phys.velocitySmoothingHz * dt));
        if (Math.abs(s.handlePushRate) < 0.003) s.handlePushRate = 0;
      }
    }
    s.handlePushAccel = clamp((s.handlePushRate - prevRate) / Math.max(1e-4, dt), -8, 8);

    // 4. Class-1 Lever Rigid Kinematics & True Contact Forces
    // Pushing handle DOWN by `handlePushDown` lifts jack pad UP by `carRise = handlePushDown / ratio`!
    const carRise = s.handlePushDown / ratio;
    const carVz = s.handlePushRate / ratio;
    const carAz = s.handlePushAccel / ratio;
    const chassisBottomZ = restChassisZ + carRise;
    const handleVz = -s.handlePushRate; // negative when pushing handle DOWN!

    // Coupled ground & wheel true-contact evaluation
    let fulcrumForce = 0;
    let humanDownPushForce = 0;
    let humanFootForce = humanWeight;
    let wheelState = solveTwoWheelContact(chassisBottomZ, rearX, frontX, [], lvCfg, config.visual, phys);

    for (let iter = 0; iter < 2; iter++) {
      const tireForce = wheelState.totalTireForceZ;
      const jackForce =
        s.handlePushDown <= 0.0004
          ? 0
          : clamp(carWeight - tireForce + lvCfg.carMassKg * carAz, 0, maxJackForce);
      humanDownPushForce = jackForce / ratio;
      // Class-1 fulcrum supports BOTH the upward car jack force AND the human's downward handle push!
      fulcrumForce = jackForce + humanDownPushForce;
      humanFootForce = Math.max(0, humanWeight - humanDownPushForce);

      const extraContacts = [
        { x: s.fulcrumX, width: lvCfg.fulcrumBaseWidthM, forceZ: fulcrumForce },
        { x: lvCfg.humanFootXM, width: hCfg.footWidthM, forceZ: humanFootForce },
      ];
      wheelState = solveTwoWheelContact(
        chassisBottomZ,
        rearX,
        frontX,
        extraContacts,
        lvCfg,
        config.visual,
        phys
      );
    }

    const tireForceTotal = wheelState.totalTireForceZ;
    const liftedOff = !wheelState.rearWheel.inContact && !wheelState.frontWheel.inContact;
    const jackForce = clamp(
      s.handlePushDown <= 0.0004 ? 0 : carWeight - tireForceTotal + lvCfg.carMassKg * carAz,
      0,
      maxJackForce
    );
    humanDownPushForce = jackForce / ratio;
    fulcrumForce = jackForce + humanDownPushForce;
    humanFootForce = Math.max(0, humanWeight - humanDownPushForce);

    const allContacts = [
      { x: s.fulcrumX, width: lvCfg.fulcrumBaseWidthM, forceZ: fulcrumForce },
      { x: rearX, width: lvCfg.tireContactWidthM, forceZ: wheelState.rearWheel.forceZ },
      { x: frontX, width: lvCfg.tireContactWidthM, forceZ: wheelState.frontWheel.forceZ },
      { x: lvCfg.humanFootXM, width: hCfg.footWidthM, forceZ: humanFootForce },
    ];
    const fulcrumDep = evaluateStripGroundDepression(
      s.fulcrumX,
      allContacts,
      lvCfg.groundVisualCompliance,
      config.visual.maxGroundDepressionM,
      phys
    );
    const footDep = evaluateStripGroundDepression(
      lvCfg.humanFootXM,
      allContacts,
      lvCfg.groundVisualCompliance,
      config.visual.maxGroundDepressionM,
      phys
    );

    // Exact collinear Class-1 beam geometry passing over fulcrum apex `(fulcrumX, pivotZ)`
    // Top of beam at `carJackPadXM` touches `chassisBottomZ` flush (`tipCenterZ = chassisBottomZ - beamThick/2`).
    // Bottom of beam at `fulcrumX` touches `pivotZ` flush (`pivotCenterZ = pivotZ + beamThick/2`).
    const halfBeam = lvCfg.beamThicknessM * 0.5;
    const pivotZ = fulcrumDep + lvCfg.fulcrumHeightM;
    const pivotCenterZ = pivotZ + halfBeam;
    const tipCenterZ = chassisBottomZ - halfBeam;

    const dLoad = s.fulcrumX - lvCfg.carJackPadXM;
    const dEffort = lvCfg.handleXM - s.fulcrumX;
    const beamSlope = (pivotCenterZ - tipCenterZ) / Math.max(0.1, dLoad);
    const handleCenterZ = pivotCenterZ + beamSlope * dEffort;
    const handleTopZ = handleCenterZ + halfBeam;

    const strain = clamp(
      !canLiftoff && s.targetHandlePushDown > maxAchievablePushDown + 0.02
        ? 1.0
        : humanDownPushForce / hCfg.maxDownwardPushN,
      0,
      1
    );

    const human = computeHumanPose(
      lvCfg.humanFootXM,
      footDep,
      lvCfg.handleXM,
      handleTopZ,
      -1,
      strain,
      'push_down',
      hCfg
    );

    const signedDensityRatio = clamp(carVz / lvCfg.signedMomentumVelScaleMps, -1, 1);

    const carObj = {
      id: 'car',
      label: `${lvCfg.carMassKg} kg Car (${(carWeight / 1000).toFixed(1)} kN)`,
      x: lvCfg.carCenterXM,
      z: chassisBottomZ,
      w: lvCfg.carWidthM,
      h: lvCfg.carHeightM,
      liftedOff,
      densityNorm: lvCfg.carDensityNorm,
      signedDensityRatio,
      energyGlowRatio: clamp(carRise / 0.10, 0, 1),
      rearTire: {
        x: rearX,
        width: lvCfg.tireContactWidthM,
        groundZ: wheelState.rearGroundZ,
        wheelBottomZ: wheelState.rearWheel.wheelBottomZ,
        inContact: wheelState.rearWheel.inContact,
        forceZ: wheelState.rearWheel.forceZ,
        maxForce: carWeight * 0.55,
      },
      frontTire: {
        x: frontX,
        width: lvCfg.tireContactWidthM,
        groundZ: wheelState.frontGroundZ,
        wheelBottomZ: wheelState.frontWheel.wheelBottomZ,
        inContact: wheelState.frontWheel.inContact,
        forceZ: wheelState.frontWheel.forceZ,
        maxForce: carWeight * 0.55,
      },
    };

    const fulcrumObj = {
      x: s.fulcrumX,
      groundZ: fulcrumDep,
      pivotZ,
      baseW: lvCfg.fulcrumBaseWidthM,
      apexW: lvCfg.fulcrumApexWidthM,
      forceZ: fulcrumForce,
      compressionRatio: clamp(fulcrumForce / (carWeight * 1.1), 0, 1),
    };

    const leverObj = {
      tipX: lvCfg.carJackPadXM,
      tipCenterZ,
      pivotX: s.fulcrumX,
      pivotZ,
      pivotCenterZ,
      handleX: lvCfg.handleXM,
      handleCenterZ,
      thicknessM: lvCfg.beamThicknessM,
      ratio,
      canLiftoff,
    };

    const torsoCore = {
      x: lerp(human.hip.x, human.shoulder.x, 0.52),
      z: lerp(human.hip.z, human.shoulder.z, 0.52),
    };

    // Live Moving Conduit Skeleton Paths — strictly collinear with the rigid Class-1 bar & limbs!
    const conduitPaths = {
      // Wide ground base funneling to sharp fulcrum apex!
      fulcrum_funnel: [
        { x: s.fulcrumX, z: fulcrumDep, width: lvCfg.fulcrumBaseWidthM * 0.92 },
        { x: s.fulcrumX, z: pivotZ, width: lvCfg.fulcrumApexWidthM },
      ],
      // Left lever arm: fulcrum pivot -> jack pad -> flush into car underbody!
      lever_pivot_to_car: [
        { x: s.fulcrumX, z: pivotCenterZ, width: lvCfg.beamThicknessM * 0.86 },
        { x: lvCfg.carJackPadXM, z: tipCenterZ, width: lvCfg.beamThicknessM * 0.86 },
        { x: lvCfg.carJackPadXM, z: chassisBottomZ + 0.14, width: 0.15 },
      ],
      // Right lever arm: fulcrum pivot -> handle -> up through human's compressed arms into torso!
      lever_pivot_to_human: [
        { x: s.fulcrumX, z: pivotCenterZ, width: lvCfg.beamThicknessM * 0.78 },
        { x: lvCfg.handleXM, z: handleCenterZ, width: lvCfg.beamThicknessM * 0.78 },
        ...human.armToTorsoPath,
      ],
      // Residual foot support into human torso
      human_feet_to_torso: human.legToTorsoPath,
      // Tire struts (strictly active only while inContact === true!)
      rear_tire_strut: [
        { x: rearX, z: wheelState.rearWheel.wheelBottomZ, width: lvCfg.tireContactWidthM * 0.9 },
        { x: rearX, z: chassisBottomZ + 0.20, width: lvCfg.tireContactWidthM * 0.85 },
      ],
      front_tire_strut: [
        { x: frontX, z: wheelState.frontWheel.wheelBottomZ, width: lvCfg.tireContactWidthM * 0.9 },
        { x: frontX, z: chassisBottomZ + 0.20, width: lvCfg.tireContactWidthM * 0.85 },
      ],
      // Energy path: Human muscles -> down arms -> straight along rigid Class-1 lever -> into Car!
      energy_human_across_lever_to_car: [
        { x: torsoCore.x, z: torsoCore.z, width: 0.12 },
        { x: human.shoulder.x, z: human.shoulder.z, width: 0.11 },
        { x: human.elbow.x, z: human.elbow.z, width: 0.09 },
        { x: human.hand.x, z: human.hand.z, width: 0.085 },
        { x: lvCfg.handleXM, z: handleCenterZ, width: lvCfg.beamThicknessM * 0.82 },
        { x: s.fulcrumX, z: pivotCenterZ, width: lvCfg.beamThicknessM * 0.82 },
        { x: lvCfg.carJackPadXM, z: tipCenterZ, width: lvCfg.beamThicknessM * 0.82 },
        { x: lvCfg.carJackPadXM, z: chassisBottomZ + 0.20, width: 0.16 },
      ],
    };

    // Mechanical Power: pushing DOWN (F_on_lever = -humanDownPushForce) with handle moving DOWN (handleVz < 0)
    // delivers POSITIVE power P = (-F_h) * (handleVz) = +humanDownPushForce * s.handlePushRate = jackForce * carVz!
    const mechPower = humanDownPushForce * s.handlePushRate;
    const isometricHeat = hCfg.baseIsometricHeatW * strain + (!canLiftoff && strain > 0.95 ? 240 : 0);
    let muscleGen = isometricHeat;
    let muscleHeat = isometricHeat;

    if (mechPower > 5) {
      const waste = mechPower * hCfg.concentricWasteFactor;
      muscleGen += mechPower + waste;
      muscleHeat += waste;
    } else if (mechPower < -5) {
      const returning = -mechPower;
      const eccentric = returning * hCfg.eccentricBurnFactor;
      muscleGen += eccentric;
      muscleHeat += returning + eccentric;
    }

    const peJoules = carWeight * carRise;
    const maxJoules = carWeight * 0.10;
    const leverEngaged = jackForce > 2;

    const components = [
      createFlowComponent({
        id: 'fulcrum_car_branch',
        label: 'Fulcrum Funnel & Car Support Branch',
        enabled: true,
        groundContacts: leverEngaged
          ? [{ contactId: 'fulcrum_base', x: s.fulcrumX, z: fulcrumDep, width: lvCfg.fulcrumBaseWidthM, forceZ: fulcrumForce }]
          : [],
        zConduits: [
          {
            conduitId: 'fulcrum_wedge_funnel',
            pathId: 'fulcrum_funnel',
            currentZ: fulcrumForce,
            activeContact: leverEngaged,
          },
          {
            conduitId: 'lever_left_car',
            pathId: 'lever_pivot_to_car',
            currentZ: jackForce,
            activeContact: leverEngaged,
          },
          {
            conduitId: 'lever_right_human_push',
            pathId: 'lever_pivot_to_human',
            currentZ: humanDownPushForce,
            activeContact: leverEngaged,
          },
        ],
      }),
      createFlowComponent({
        id: 'tire_true_contact_branch',
        label: 'True-Contact Tire Support Before Liftoff',
        enabled: true,
        groundContacts: [
          ...(wheelState.rearWheel.inContact
            ? [{ contactId: 'rear_tire', x: rearX, z: wheelState.rearGroundZ, width: lvCfg.tireContactWidthM, forceZ: wheelState.rearWheel.forceZ }]
            : []),
          ...(wheelState.frontWheel.inContact
            ? [{ contactId: 'front_tire', x: frontX, z: wheelState.frontGroundZ, width: lvCfg.tireContactWidthM, forceZ: wheelState.frontWheel.forceZ }]
            : []),
        ],
        zConduits: [
          {
            conduitId: 'rear_tire_col',
            pathId: 'rear_tire_strut',
            currentZ: wheelState.rearWheel.forceZ,
            activeContact: wheelState.rearWheel.inContact,
          },
          {
            conduitId: 'front_tire_col',
            pathId: 'front_tire_strut',
            currentZ: wheelState.frontWheel.forceZ,
            activeContact: wheelState.frontWheel.inContact,
          },
        ],
      }),
      createFlowComponent({
        id: 'human_weight_balance',
        label: 'Human Body-Weight Balance on Prybar',
        enabled: true,
        groundContacts:
          humanFootForce > 2
            ? [{ contactId: 'human_feet', x: lvCfg.humanFootXM, z: footDep, width: hCfg.footWidthM, forceZ: humanFootForce }]
            : [],
        zConduits: [
          {
            conduitId: 'human_feet_col',
            pathId: 'human_feet_to_torso',
            currentZ: humanFootForce,
            activeContact: humanFootForce > 2,
          },
        ],
      }),
      createFlowComponent({
        id: 'car_sink_and_lever_energy',
        label: 'Car Gravity Drain & Human-to-Car Energy Transfer',
        enabled: true,
        zVolumeSinks: [
          {
            bodyId: 'car',
            drainRateZ: carWeight,
            densityNorm: lvCfg.carDensityNorm,
            signedDensityRatio,
          },
        ],
        energySources:
          muscleGen > 5
            ? [{ sourceId: 'human_muscles', x: torsoCore.x, z: torsoCore.z, radius: 0.22, powerWatts: muscleGen }]
            : [],
        energyConduits: [
          {
            conduitId: 'human_beam_energy',
            pathId: 'energy_human_across_lever_to_car',
            powerWatts: Math.abs(mechPower) > 5 ? mechPower : 0,
            activeContact: leverEngaged,
          },
        ],
        storedEnergy: [{ bodyId: 'car', totalJoules: peJoules, referenceMaxJoules: maxJoules }],
        heatPlumes:
          muscleHeat > 6
            ? [{ plumeId: 'muscle_heat', x: torsoCore.x, z: human.shoulder.z + 0.08, spreadX: 0.28, watts: muscleHeat }]
            : [],
      }),
    ];

    const field = composeFlowField(components);
    const isLiftingCar = carVz > 0.004;
    const isLoweringCar = carVz < -0.004;

    const captionZ = !canLiftoff
      ? `At ${ratio.toFixed(1)}× leverage, even leaning your full body weight onto the bar isn’t enough—slide the fulcrum closer to the car.`
      : !liftedOff
      ? 'Press the handle down: the tires decompress to zero as the fulcrum takes over the entire +z momentum stream.'
      : `Liftoff! Wide ground flow funnels to a point at the fulcrum (${(fulcrumForce / 1000).toFixed(1)} kN), feeding the car while tires carry zero.`;

    const captionE = !liftedOff
      ? 'Flip between ↑ z-momentum and ⚡ energy while pressing the prybar down to compare what the fulcrum does.'
      : isLiftingCar
      ? 'Pushing down while moving down injects energy from your muscles—streaming straight past the dark (v = 0) fulcrum into the rising car.'
      : isLoweringCar
      ? 'Letting the car descend: all stored golden energy streams back across the lever into your braking muscles as heat.'
      : 'Held aloft: the fulcrum channels ~8.4 kN of momentum at zero energy cost, while only your muscles shed heat.';

    return {
      chapterId: 'lever',
      worldSpanX: lvCfg.worldSpanXM,
      groundCompliance: lvCfg.groundVisualCompliance,
      referenceCurrentZ: lvCfg.referenceCurrentZN,
      referencePowerWatts: lvCfg.referencePowerW,
      conduitPaths,
      bodies: [],
      human,
      car: carObj,
      lever: leverObj,
      fulcrum: fulcrumObj,
      components,
      field,
      circuit: {
        mode: 'lever',
        loadCurrent: carWeight,
        tireCurrent: tireForceTotal,
        humanCurrent: humanDownPushForce,
        humanMaxCurrent: hCfg.maxDownwardPushN,
        fulcrumCurrent: fulcrumForce,
        liftedOff,
        ratio,
      },
      captions: { z: captionZ, energy: captionE },
      metrics: {
        phase: isLiftingCar ? 'lift' : isLoweringCar ? 'lower' : 'hold',
        ratio,
        canLiftoff,
        liftedOff,
        fulcrumForceN: fulcrumForce,
        humanForceN: humanDownPushForce,
        tireForceN: tireForceTotal,
        handleVz,
      },
    };
  }

  return {
    config,
    state,
    setChapter(id) {
      if (!CHAPTERS.some((c) => c.id === id)) {
        throw new Error(`Unknown chapter id: ${id}`);
      }
      state.chapterId = id;
    },
    resetChapter,
    dropBlockFromAir,
    setMaterial,
    setLiftCommand,
    setLeverRatio,
    setFulcrumX,
    step,
  };
}
