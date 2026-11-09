// Canonical Single Source of Truth (SSOT) Configuration Data-Model
//
// Defines all physical, geometric, kinematic, particle, camera, and palette constants
// in a nested, losslessly serializable hierarchy (`toDict`, `fromDict`, `toJSON`, `fromJSON`).

/**
 * @typedef {Object} MaterialSpec
 * @property {string} id
 * @property {string} label
 * @property {number} massKg
 * @property {number} densityNorm
 */

export class PhysicsConfig {
  /**
   * @param {Object} init
   */
  constructor(init) {
    this.gravityMps2 = init.gravityMps2;
    this.subSteps = init.subSteps;
    this.maxFrameDtSec = init.maxFrameDtSec;
    this.dragResponseHz = init.dragResponseHz;
    this.velocitySmoothingHz = init.velocitySmoothingHz;
    this.accelerationClampMps2 = init.accelerationClampMps2;
    this.settlePosToleranceM = init.settlePosToleranceM;
    this.settleVelToleranceMps = init.settleVelToleranceMps;
    this.stripQuadratureNodes = init.stripQuadratureNodes;
    this.stripQuadratureWeights = init.stripQuadratureWeights;
    this.flamantDepthFloorM = init.flamantDepthFloorM;
    this.flamantRegularizationScale = init.flamantRegularizationScale;
  }

  toDict() {
    return {
      gravityMps2: this.gravityMps2,
      subSteps: this.subSteps,
      maxFrameDtSec: this.maxFrameDtSec,
      dragResponseHz: this.dragResponseHz,
      velocitySmoothingHz: this.velocitySmoothingHz,
      accelerationClampMps2: this.accelerationClampMps2,
      settlePosToleranceM: this.settlePosToleranceM,
      settleVelToleranceMps: this.settleVelToleranceMps,
      stripQuadratureNodes: [...this.stripQuadratureNodes],
      stripQuadratureWeights: [...this.stripQuadratureWeights],
      flamantDepthFloorM: this.flamantDepthFloorM,
      flamantRegularizationScale: this.flamantRegularizationScale,
    };
  }

  static fromDict(d) {
    return new PhysicsConfig(d);
  }
}

export class HumanBodyConfig {
  /**
   * @param {Object} init
   */
  constructor(init) {
    this.massKg = init.massKg;
    this.densityNorm = init.densityNorm;
    this.maxUpwardPullN = init.maxUpwardPullN;
    this.maxDownwardPushN = init.maxDownwardPushN;
    this.footWidthM = init.footWidthM;
    this.ankleHeightM = init.ankleHeightM;
    this.shinLengthM = init.shinLengthM;
    this.thighLengthM = init.thighLengthM;
    this.torsoLengthM = init.torsoLengthM;
    this.upperArmLengthM = init.upperArmLengthM;
    this.forearmLengthM = init.forearmLengthM;
    this.headOffsetZ = init.headOffsetZ;
    this.concentricWasteFactor = init.concentricWasteFactor;
    this.eccentricBurnFactor = init.eccentricBurnFactor;
    this.baseIsometricHeatW = init.baseIsometricHeatW;
  }

  toDict() {
    return { ...this };
  }

  static fromDict(d) {
    return new HumanBodyConfig(d);
  }
}

export class GravityChapterConfig {
  /**
   * @param {Object} init
   */
  constructor(init) {
    this.worldSpanXM = init.worldSpanXM;
    this.blockWidthM = init.blockWidthM;
    this.blockHeightM = init.blockHeightM;
    this.dropReleaseHeightM = init.dropReleaseHeightM;
    this.maxDragHeightM = init.maxDragHeightM;
    this.groundStiffnessNpm = init.groundStiffnessNpm;
    this.groundDampingNsPm = init.groundDampingNsPm;
    this.groundVisualCompliance = init.groundVisualCompliance;
    this.impactHeatDecayHz = init.impactHeatDecayHz;
    this.referenceCurrentZN = init.referenceCurrentZN;
    this.referencePowerW = init.referencePowerW;
    this.signedMomentumVelScaleMps = init.signedMomentumVelScaleMps;
    /** @type {Record<string, MaterialSpec>} */
    this.materials = init.materials;
    this.defaultMaterialKey = init.defaultMaterialKey;
  }

  toDict() {
    const materialsCopy = {};
    for (const [k, v] of Object.entries(this.materials)) {
      materialsCopy[k] = { ...v };
    }
    return { ...this, materials: materialsCopy };
  }

  static fromDict(d) {
    return new GravityChapterConfig(d);
  }
}

export class LiftChapterConfig {
  /**
   * @param {Object} init
   */
  constructor(init) {
    this.worldSpanXM = init.worldSpanXM;
    this.payloadMassKg = init.payloadMassKg;
    this.payloadDensityNorm = init.payloadDensityNorm;
    this.boxWidthM = init.boxWidthM;
    this.boxHeightM = init.boxHeightM;
    this.minLiftZM = init.minLiftZM;
    this.maxLiftZM = init.maxLiftZM;
    this.initialLiftZM = init.initialLiftZM;
    this.liftSpeedMps = init.liftSpeedMps;
    this.footXM = init.footXM;
    this.boxXM = init.boxXM;
    this.groundVisualCompliance = init.groundVisualCompliance;
    this.referenceCurrentZN = init.referenceCurrentZN;
    this.referencePowerW = init.referencePowerW;
    this.signedMomentumVelScaleMps = init.signedMomentumVelScaleMps;
  }

  toDict() {
    return { ...this };
  }

  static fromDict(d) {
    return new LiftChapterConfig(d);
  }
}

export class CarDirectChapterConfig {
  /**
   * @param {Object} init
   */
  constructor(init) {
    this.worldSpanXM = init.worldSpanXM;
    this.carMassKg = init.carMassKg;
    this.carDensityNorm = init.carDensityNorm;
    this.carWidthM = init.carWidthM;
    this.carHeightM = init.carHeightM;
    this.carCenterXM = init.carCenterXM;
    this.wheelHalfTrackM = init.wheelHalfTrackM;
    this.tireContactWidthM = init.tireContactWidthM;
    this.unloadedClearanceM = init.unloadedClearanceM;
    this.totalSuspensionStiffnessNpm = init.totalSuspensionStiffnessNpm;
    this.rearWeightShare = init.rearWeightShare;
    this.humanFootXM = init.humanFootXM;
    this.initialEffort = init.initialEffort;
    this.groundVisualCompliance = init.groundVisualCompliance;
    this.referenceCurrentZN = init.referenceCurrentZN;
    this.referencePowerW = init.referencePowerW;
    this.signedMomentumVelScaleMps = init.signedMomentumVelScaleMps;
  }

  toDict() {
    return { ...this };
  }

  static fromDict(d) {
    return new CarDirectChapterConfig(d);
  }
}

export class Class1LeverChapterConfig {
  /**
   * @param {Object} init
   */
  constructor(init) {
    this.worldSpanXM = init.worldSpanXM;
    this.carMassKg = init.carMassKg;
    this.carDensityNorm = init.carDensityNorm;
    this.carWidthM = init.carWidthM;
    this.carHeightM = init.carHeightM;
    this.carCenterXM = init.carCenterXM;
    this.carJackPadXM = init.carJackPadXM;
    this.wheelHalfTrackM = init.wheelHalfTrackM;
    this.tireContactWidthM = init.tireContactWidthM;
    this.unloadedClearanceM = init.unloadedClearanceM;
    this.totalSuspensionStiffnessNpm = init.totalSuspensionStiffnessNpm;
    this.rearWeightShare = init.rearWeightShare;
    this.handleXM = init.handleXM;
    this.humanFootXM = init.humanFootXM;
    this.fulcrumMinXM = init.fulcrumMinXM;
    this.fulcrumMaxXM = init.fulcrumMaxXM;
    this.defaultFulcrumXM = init.defaultFulcrumXM;
    this.fulcrumBaseWidthM = init.fulcrumBaseWidthM;
    this.fulcrumApexWidthM = init.fulcrumApexWidthM;
    this.fulcrumHeightM = init.fulcrumHeightM;
    this.beamThicknessM = init.beamThicknessM;
    this.handleMinPushDownM = init.handleMinPushDownM;
    this.handleMaxPushDownM = init.handleMaxPushDownM;
    this.initialHandlePushDownM = init.initialHandlePushDownM;
    this.handleSpeedMps = init.handleSpeedMps;
    this.leverMassKg = init.leverMassKg;
    this.groundVisualCompliance = init.groundVisualCompliance;
    this.referenceCurrentZN = init.referenceCurrentZN;
    this.referencePowerW = init.referencePowerW;
    this.signedMomentumVelScaleMps = init.signedMomentumVelScaleMps;
  }

  toDict() {
    return { ...this };
  }

  static fromDict(d) {
    return new Class1LeverChapterConfig(d);
  }
}

export class VisualConfig {
  /**
   * @param {Object} init
   */
  constructor(init) {
    this.maxDpr = init.maxDpr;
    this.cameraSpanZM = init.cameraSpanZM;
    this.cameraViewportMarginX = init.cameraViewportMarginX;
    this.cameraViewportMarginZ = init.cameraViewportMarginZ;
    this.groundHorizonScreenFracY = init.groundHorizonScreenFracY;
    this.minPixelsPerMeter = init.minPixelsPerMeter;
    this.maxGroundDepressionM = init.maxGroundDepressionM;
    this.groundStrataDepthsM = init.groundStrataDepthsM;
    this.groundStrataAttenuationPerM = init.groundStrataAttenuationPerM;

    this.maxParticles = init.maxParticles;
    this.preWarmSteps = init.preWarmSteps;
    this.preWarmDtSec = init.preWarmDtSec;

    // Fast acoustic-inspired propagation through solid conduits!
    this.solidPropagationBaseMps = init.solidPropagationBaseMps;
    this.solidPropagationCurrentBoostMps = init.solidPropagationCurrentBoostMps;
    this.undergroundPropagationBaseMps = init.undergroundPropagationBaseMps;
    this.undergroundPropagationBoostMps = init.undergroundPropagationBoostMps;
    this.conduitLaneFillFraction = init.conduitLaneFillFraction;
    this.streakStretchFactor = init.streakStretchFactor;
    this.maxStreakStretch = init.maxStreakStretch;

    this.groundSpawnRateScale = init.groundSpawnRateScale;
    this.conduitZSpawnRateScale = init.conduitZSpawnRateScale;
    this.conduitESpawnRateScale = init.conduitESpawnRateScale;
    this.volumeSinkSpawnPerM2 = init.volumeSinkSpawnPerM2;
    this.heatPlumeSpawnRateScale = init.heatPlumeSpawnRateScale;

    // Signed momentum glow & stationary energy glow RGB colors
    this.darkColors = init.darkColors;
    this.lightColors = init.lightColors;
  }

  toDict() {
    return {
      ...this,
      groundStrataDepthsM: [...this.groundStrataDepthsM],
      darkColors: { ...this.darkColors },
      lightColors: { ...this.lightColors },
    };
  }

  static fromDict(d) {
    return new VisualConfig(d);
  }
}

export class AppConfig {
  /**
   * @param {Object} init
   */
  constructor(init) {
    this.physics = init.physics instanceof PhysicsConfig ? init.physics : PhysicsConfig.fromDict(init.physics);
    this.human = init.human instanceof HumanBodyConfig ? init.human : HumanBodyConfig.fromDict(init.human);
    this.gravityChapter =
      init.gravityChapter instanceof GravityChapterConfig
        ? init.gravityChapter
        : GravityChapterConfig.fromDict(init.gravityChapter);
    this.liftChapter =
      init.liftChapter instanceof LiftChapterConfig
        ? init.liftChapter
        : LiftChapterConfig.fromDict(init.liftChapter);
    this.carChapter =
      init.carChapter instanceof CarDirectChapterConfig
        ? init.carChapter
        : CarDirectChapterConfig.fromDict(init.carChapter);
    this.leverChapter =
      init.leverChapter instanceof Class1LeverChapterConfig
        ? init.leverChapter
        : Class1LeverChapterConfig.fromDict(init.leverChapter);
    this.visual = init.visual instanceof VisualConfig ? init.visual : VisualConfig.fromDict(init.visual);
  }

  toDict() {
    return {
      physics: this.physics.toDict(),
      human: this.human.toDict(),
      gravityChapter: this.gravityChapter.toDict(),
      liftChapter: this.liftChapter.toDict(),
      carChapter: this.carChapter.toDict(),
      leverChapter: this.leverChapter.toDict(),
      visual: this.visual.toDict(),
    };
  }

  static fromDict(d) {
    return new AppConfig(d);
  }

  toJSON() {
    return JSON.stringify(this.toDict(), null, 2);
  }

  static fromJSON(jsonStr) {
    return AppConfig.fromDict(JSON.parse(jsonStr));
  }
}

export const DEFAULT_CONFIG = new AppConfig({
  physics: {
    gravityMps2: 9.81,
    subSteps: 6,
    maxFrameDtSec: 0.033,
    dragResponseHz: 18.0,
    velocitySmoothingHz: 12.0,
    accelerationClampMps2: 24.0,
    settlePosToleranceM: 0.0006,
    settleVelToleranceMps: 0.006,
    // 5-point Gauss-Legendre quadrature on [-1, +1] for extended strip contact interfaces
    stripQuadratureNodes: [-0.90617985, -0.53846931, 0.0, 0.53846931, 0.90617985],
    stripQuadratureWeights: [0.23692689, 0.47862867, 0.56888889, 0.47862867, 0.23692689],
    flamantDepthFloorM: 0.025,
    flamantRegularizationScale: 0.22,
  },
  human: {
    massKg: 92, // ~902 N body weight available for pressing down on a Class-1 prybar
    densityNorm: 0.85,
    maxUpwardPullN: 1900,
    maxDownwardPushN: 900,
    footWidthM: 0.32,
    ankleHeightM: 0.06,
    shinLengthM: 0.44,
    thighLengthM: 0.45,
    torsoLengthM: 0.52,
    upperArmLengthM: 0.36,
    forearmLengthM: 0.35,
    headOffsetZ: 0.20,
    concentricWasteFactor: 2.2,
    eccentricBurnFactor: 0.34,
    baseIsometricHeatW: 90,
  },
  gravityChapter: {
    worldSpanXM: 4.8,
    blockWidthM: 0.92, // Wide flat contact interface to showcase extended-interface flow!
    blockHeightM: 0.62,
    dropReleaseHeightM: 1.48,
    maxDragHeightM: 1.68,
    groundStiffnessNpm: 18000,
    groundDampingNsPm: 980,
    groundVisualCompliance: 0.000068,
    impactHeatDecayHz: 4.2,
    referenceCurrentZN: 950,
    referencePowerW: 900,
    signedMomentumVelScaleMps: 3.4,
    defaultMaterialKey: 'stone',
    materials: {
      wood: { id: 'wood', label: 'Wood', massKg: 36, densityNorm: 0.42 },
      stone: { id: 'stone', label: 'Stone', massKg: 88, densityNorm: 1.08 },
      lead: { id: 'lead', label: 'Lead', massKg: 168, densityNorm: 2.18 },
    },
  },
  liftChapter: {
    worldSpanXM: 4.8,
    payloadMassKg: 48,
    payloadDensityNorm: 1.15,
    boxWidthM: 0.50,
    boxHeightM: 0.42,
    minLiftZM: 0.58,
    maxLiftZM: 1.38,
    initialLiftZM: 0.90,
    liftSpeedMps: 0.46,
    footXM: -0.34,
    boxXM: 0.34,
    groundVisualCompliance: 0.000052,
    referenceCurrentZN: 540,
    referencePowerW: 480,
    signedMomentumVelScaleMps: 0.65,
  },
  carChapter: {
    worldSpanXM: 5.3,
    carMassKg: 780, // ~7.7 kN compact car (consistent with Class-1 Lever chapter)
    carDensityNorm: 1.85,
    carWidthM: 1.50,
    carHeightM: 0.75,
    carCenterXM: -0.40,
    wheelHalfTrackM: 0.46,
    tireContactWidthM: 0.30,
    unloadedClearanceM: 0.31,
    totalSuspensionStiffnessNpm: 155000, // ~5 cm true suspension compression under full weight
    rearWeightShare: 0.46,
    humanFootXM: 0.76,
    initialEffort: 0.45,
    groundVisualCompliance: 0.000016,
    referenceCurrentZN: 4600,
    referencePowerW: 480,
    signedMomentumVelScaleMps: 0.25,
  },
  leverChapter: {
    worldSpanXM: 6.1,
    carMassKg: 780, // ~7,652 N compact car; liftoff at >= 8.5x leverage!
    carDensityNorm: 1.85,
    carWidthM: 1.28,
    carHeightM: 0.73,
    carCenterXM: -1.62,
    carJackPadXM: -1.04, // Right sill jack pad engaged flush by Class-1 prybar tip
    wheelHalfTrackM: 0.40,
    tireContactWidthM: 0.28,
    unloadedClearanceM: 0.255,
    totalSuspensionStiffnessNpm: 360000,
    rearWeightShare: 0.50,
    handleXM: 1.76,
    humanFootXM: 2.02,
    // Class-1 fulcrum sits BETWEEN car jack pad (-1.04) and human handle (+1.76), span = 2.80 m:
    fulcrumMinXM: -0.84, // d_load = 0.20 m, d_effort = 2.60 m -> R = 13.0x
    fulcrumMaxXM: -0.48, // d_load = 0.56 m, d_effort = 2.24 m -> R = 4.0x
    defaultFulcrumXM: -0.80, // d_load = 0.24 m, d_effort = 2.56 m -> R = 10.7x (clean liftoff!)
    fulcrumBaseWidthM: 0.42, // Wide ground base ([-1.01, -0.59] at default, clear of tire at -1.08!)
    fulcrumApexWidthM: 0.04, // Sharp apex -> funnels wide ground flow into one pivot point!
    fulcrumHeightM: 0.268,
    beamThicknessM: 0.075,
    handleMinPushDownM: 0.0,
    handleMaxPushDownM: 0.86,
    initialHandlePushDownM: 0.72,
    handleSpeedMps: 0.52,
    leverMassKg: 30,
    groundVisualCompliance: 0.0000062,
    referenceCurrentZN: 4800,
    referencePowerW: 540,
    signedMomentumVelScaleMps: 0.09,
  },
  visual: {
    maxDpr: 2,
    cameraSpanZM: 3.35,
    cameraViewportMarginX: 0.89,
    cameraViewportMarginZ: 0.78,
    groundHorizonScreenFracY: 0.665,
    minPixelsPerMeter: 56,
    maxGroundDepressionM: 0.16,
    groundStrataDepthsM: [0.14, 0.30, 0.50, 0.74, 1.02],
    groundStrataAttenuationPerM: 1.45,

    maxParticles: 4200,
    preWarmSteps: 40,
    preWarmDtSec: 0.03,

    // Fast propagation through materials (crosses 3m lever in ~0.45s; finite current via finite carrier density)
    solidPropagationBaseMps: 5.4,
    solidPropagationCurrentBoostMps: 2.6,
    undergroundPropagationBaseMps: 2.4,
    undergroundPropagationBoostMps: 1.8,
    conduitLaneFillFraction: 0.92, // Combined with particle radius margin -> wide on blocks, strictly inside thin bars!
    streakStretchFactor: 0.34,
    maxStreakStretch: 3.4,

    groundSpawnRateScale: 68,
    conduitZSpawnRateScale: 118,
    conduitESpawnRateScale: 124,
    volumeSinkSpawnPerM2: 52,
    heatPlumeSpawnRateScale: 42,

    darkColors: {
      cyanPositive: [0.22, 0.86, 0.98],
      yellowNegative: [0.96, 0.84, 0.24],
      energyGold: [1.0, 0.76, 0.22],
      heatOrange: [0.98, 0.52, 0.22],
      heatCrimson: [0.92, 0.25, 0.28],
    },
    lightColors: {
      cyanPositive: [0.03, 0.50, 0.68],
      yellowNegative: [0.84, 0.64, 0.04],
      energyGold: [0.84, 0.50, 0.04],
      heatOrange: [0.86, 0.36, 0.12],
      heatCrimson: [0.75, 0.18, 0.22],
    },
  },
});
