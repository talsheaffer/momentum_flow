import assert from 'node:assert/strict';
import { AppConfig, DEFAULT_CONFIG } from '../js/config.js';
import {
  evaluateStripFlamantFlux,
  evaluateStripGroundDepression,
} from '../js/geometry.js';
import { createScenarioEngine } from '../js/scenarios.js';

// 1. Lossless SSOT Config Serialization Round-Trip
const json1 = DEFAULT_CONFIG.toJSON();
const restored = AppConfig.fromJSON(json1);
assert.equal(restored.toJSON(), json1, 'AppConfig JSON round-trip must be 100% lossless');

const engine = createScenarioEngine(DEFAULT_CONFIG);

// 2. Chapter 1: Gravity — Wide Interface Flow & Signed Glow
engine.setChapter('gravity');
engine.resetChapter('gravity');
let s1 = engine.step(0.016);
assert.equal(s1.field.groundContacts.length, 1);
assert.equal(s1.field.groundContacts[0].width, DEFAULT_CONFIG.gravityChapter.blockWidthM);
assert.equal(Math.abs(s1.bodies[0].signedDensityRatio) < 1e-4, true, 'Resting block must be neutral (0 glow)');
assert.equal(s1.bodies[0].energyGlowRatio < 1e-3, true, 'Resting block must have 0 energy glow');

// Verify wide flat interface upward flux across [-0.36, +0.36] (not pinched to x=0!)
const fluxCenter = evaluateStripFlamantFlux(0.0, s1.field.groundContacts[0].z - 0.08, s1.field.groundContacts, DEFAULT_CONFIG.physics);
const fluxEdge = evaluateStripFlamantFlux(0.35, s1.field.groundContacts[0].z - 0.08, s1.field.groundContacts, DEFAULT_CONFIG.physics);
assert.equal(fluxEdge.jz > fluxCenter.jz * 0.65, true, `Wide interface edge flux (${fluxEdge.jz}) should be comparable to center (${fluxCenter.jz})`);

// Drop from air -> free fall -> yellow (-z) glow & zero ground compression
engine.dropBlockFromAir();
for (let i = 0; i < 18; i++) s1 = engine.step(0.016);
assert.equal(s1.field.groundContacts.length, 0, 'Airborne falling block must have 0 ground contacts');
const depAirborne = evaluateStripGroundDepression(0, s1.field.groundContacts, s1.groundCompliance, DEFAULT_CONFIG.visual.maxGroundDepressionM, DEFAULT_CONFIG.physics);
assert.equal(depAirborne, 0, 'Ground depression under airborne block must be identically 0');
assert.equal(s1.bodies[0].signedDensityRatio < -0.4, true, `Falling block must have negative signedDensityRatio (got ${s1.bodies[0].signedDensityRatio})`);
assert.equal(s1.bodies[0].energyGlowRatio > 0.5, true, 'Elevated falling block must have bright golden energyGlowRatio');

// Drag upward -> cyan (+z) glow
engine.state.ch1.dragging = true;
engine.state.ch1.z = 0.3;
engine.state.ch1.dragTargetZ = 1.4;
s1 = engine.step(0.016);
assert.equal(s1.bodies[0].signedDensityRatio > 0.4, true, `Upward-moving block must have positive signedDensityRatio (got ${s1.bodies[0].signedDensityRatio})`);
engine.state.ch1.dragging = false;

// 3. Chapter 2: Lift / Hold / Lower
engine.setChapter('lift');
engine.resetChapter('lift');
engine.setLiftCommand('lift');
let s2 = null;
for (let i = 0; i < 12; i++) s2 = engine.step(0.016);
assert.equal(s2.bodies[0].signedDensityRatio > 0.3, true, 'Rising crate should glow cyan (+z)');
assert.equal(s2.metrics.mechPowerWatts > 50, true, 'Rising crate receives positive muscle work');

engine.setLiftCommand('lower');
for (let i = 0; i < 12; i++) s2 = engine.step(0.016);
assert.equal(s2.bodies[0].signedDensityRatio < -0.3, true, 'Descending crate should glow yellow (-z)');
assert.equal(s2.metrics.mechPowerWatts < -50, true, 'Descending crate returns energy to muscles');

// 4. Chapter 3: Direct Car Pull — True Contact & Decompression Offload
engine.setChapter('car');
engine.resetChapter('car');
engine.state.ch3.effort = 0;
let s3Zero = null;
for (let i = 0; i < 30; i++) s3Zero = engine.step(0.016);
engine.state.ch3.effort = 1.0;
let s3Max = null;
for (let i = 0; i < 30; i++) s3Max = engine.step(0.016);
assert.equal(s3Max.metrics.tireForceN < s3Zero.metrics.tireForceN - 1500, true, 'Pulling upward must decompress tires');
assert.equal(s3Max.car.rearTire.inContact && s3Max.car.frontTire.inContact, true, 'Direct pull cannot lift car clear');
assert.equal(Math.abs(s3Max.car.rearTire.wheelBottomZ - s3Max.car.rearTire.groundZ) < 1e-9, true, 'Wheel bottom must match ground surface when in contact');

// 5. Chapter 4: Class-1 Lever — Liftoff, Zero Phantom Compression, Collinear Bar & Energy Direction
engine.setChapter('lever');
engine.resetChapter('lever');
let s4 = engine.step(0.016);
assert.equal(s4.car.liftedOff, true, 'Default 10.7x Class-1 lever must lift car clear of ground');
assert.equal(s4.car.rearTire.inContact, false);
assert.equal(s4.car.frontTire.inContact, false);
assert.equal(s4.car.rearTire.forceZ, 0);
assert.equal(s4.car.frontTire.forceZ, 0);

const depUnderRearWheel = evaluateStripGroundDepression(
  s4.car.rearTire.x,
  s4.field.groundContacts,
  s4.groundCompliance,
  DEFAULT_CONFIG.visual.maxGroundDepressionM,
  DEFAULT_CONFIG.physics
);
assert.equal(Math.abs(depUnderRearWheel) < 1e-6, true, `Ground under airborne rear wheel must be flat (got ${depUnderRearWheel})`);

// Check rigid collinearity of Class-1 lever points: (tipX, tipCenterZ), (pivotX, pivotCenterZ), (handleX, handleCenterZ)
const lv = s4.lever;
const slopeLeft = (lv.pivotCenterZ - lv.tipCenterZ) / (lv.pivotX - lv.tipX);
const slopeRight = (lv.handleCenterZ - lv.pivotCenterZ) / (lv.handleX - lv.pivotX);
assert.equal(Math.abs(slopeLeft - slopeRight) < 1e-9, true, 'Class-1 lever beam must be strictly collinear');
assert.equal(lv.handleCenterZ > 0.30 && lv.handleCenterZ < 1.80, true, `Handle height must stay ergonomic above ground (got ${lv.handleCenterZ})`);
assert.equal(s4.human.actionMode, 'push_down', 'Human on Class-1 lever must use push_down posture');

// Check lifting motion on Class-1 lever: handle pushes DOWN (handleVz < 0), car rises, energy flows human -> car (> 0)!
engine.state.ch4.handlePushDown = 0.25;
engine.setLiftCommand('lift');
for (let i = 0; i < 15; i++) s4 = engine.step(0.016);
assert.equal(s4.metrics.handleVz < -0.1, true, 'Class-1 lift pushes handle downward');
assert.equal(s4.car.signedDensityRatio > 0.2, true, 'Rising car on Class-1 lever glows cyan (+z)');
assert.equal(s4.field.energyConduits[0].powerWatts > 50, true, 'Positive mechanical power flows from downward-pushing human into rising car');

// Check low leverage (4.5x): stalls without liftoff, wheels remain in exact true ground contact (zero levitation!)
engine.setLeverRatio(4.5);
for (let i = 0; i < 40; i++) s4 = engine.step(0.016);
assert.equal(s4.metrics.canLiftoff, false);
assert.equal(s4.car.liftedOff, false);
assert.equal(s4.car.rearTire.inContact, true);
assert.equal(Math.abs(s4.car.rearTire.wheelBottomZ - s4.car.rearTire.groundZ) < 1e-9, true, 'Stalled lever car wheels must touch ground with zero levitation');

console.log('ALL PHYSICS, TRUE-CONTACT & CLASS-1 LEVER INVARIANTS PASSED!');
