// Hybrid WebGL 2 Continuum/Particle Fluid Renderer + High-DPI Canvas 2D Overlay
//
// Aesthetic inspiration: `erezu1.github.io/watercolor` — serene editorial minimalism,
// tactile warm dark & vellum light palettes, smooth GPU signed-density glow,
// wide-interface vs. point-funneling streamlines, and fast solid-state propagation.

import { DEFAULT_CONFIG } from './config.js';
import {
  clamp,
  evaluateStripFlamantFlux,
  evaluateStripGroundDepression,
  polylineLength,
  samplePolyline,
  isInsideCarSilhouette,
} from './geometry.js';

const CONTINUUM_VS = `#version 300 es
precision highp float;
const vec2 POS[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
out vec2 vUv;
void main() {
  vec2 p = POS[gl_VertexID];
  vUv = p * 0.5 + 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}
`;

const CONTINUUM_FS = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform vec2 uResolution;
uniform vec2 uCamOrigin;   // screen px of world (0, 0)
uniform float uPpm;        // pixels per meter
uniform int uFluidMode;    // 0 = z-momentum, 1 = energy
uniform int uDark;         // 1 = dark theme, 0 = light vellum theme
uniform float uRefForce;
uniform int uContactCount;
uniform vec4 uContacts[6]; // (x, surfaceZ, halfWidth, forceZ)
uniform vec4 uMuscleGlow;  // (x, z, radius, normalizedIntensity)
uniform vec4 uBodyBounds;  // (centerX, bottomZ, width, height)
uniform vec4 uBodyState;   // (signedDensityRatio, energyGlowRatio, isCar, active)

uniform vec3 uColCyanPos;
uniform vec3 uColYellowNeg;
uniform vec3 uColEnergyGold;

const float PI_VAL = 3.14159265;

float bodyGlowMask(float wx, float wz, vec4 b, bool isCar) {
  float halfW = max(0.05, b.z * 0.5);
  float h = max(0.05, b.w);
  float lx = (wx - b.x) / b.z;        // [-0.5, +0.5] inside
  float lz = (wz - b.y) / h;          // [0.0, 1.0] inside

  if (!isCar) {
    vec2 q = abs(vec2(wx - b.x, wz - (b.y + h * 0.5))) - vec2(halfW, h * 0.5);
    float outsideDist = length(max(q, 0.0));
    float insideDist = min(max(q.x, q.y), 0.0);
    float halo = exp(-outsideDist * outsideDist / 0.020);
    float core = smoothstep(0.0, 0.16, -insideDist / min(halfW, h * 0.5));
    return clamp(halo * 0.55 + core * 0.65, 0.0, 1.0);
  } else {
    float clz = clamp(lz, 0.0, 1.0);
    float cabinW = max(0.20, 0.36 - max(0.0, clz - 0.48) * 0.22);
    float effHalfW = mix(0.47, cabinW, smoothstep(0.44, 0.56, clz));
    float dx = max(0.0, (abs(lx) - effHalfW) * b.z);
    float dz = max(0.0, max(0.05 - lz, lz - 0.95) * h);
    float outsideDist = length(vec2(dx, dz));
    float halo = exp(-outsideDist * outsideDist / 0.015);
    bool inside = (dx <= 0.001 && dz <= 0.001);
    float centerWeight = inside ? (0.45 + 0.55 * (1.0 - abs(lx) / effHalfW)) : 0.0;
    return clamp(halo * 0.44 + centerWeight * 0.58, 0.0, 1.0);
  }
}

void main() {
  vec2 fragPx = vec2(vUv.x * uResolution.x, (1.0 - vUv.y) * uResolution.y);
  float wx = (fragPx.x - uCamOrigin.x) / uPpm;
  float wz = (uCamOrigin.y - fragPx.y) / uPpm;

  vec3 accumCol = vec3(0.0);
  float accumAlpha = 0.0;

  if (uFluidMode == 0) {
    // 1. Exact Closed-Form Michell/Flamant Strip-Load Underground Compression Glow
    //    Wide & uniform right across flat block/tire interfaces; deep bulb under fulcrum; strictly 0 when airborne!
    float compSum = 0.0;
    for (int i = 0; i < 6; i++) {
      if (i >= uContactCount) break;
      vec4 c = uContacts[i];
      if (wz <= c.y + 0.006 && c.w > 0.5) {
        float d = max(0.022, c.y - wz);
        float hw = max(0.025, c.z);
        float pLoad = c.w / (2.0 * hw);
        float xi1 = (c.x - hw) - wx;
        float xi2 = (c.x + hw) - wx;
        float r1Sq = xi1 * xi1 + d * d;
        float r2Sq = xi2 * xi2 + d * d;
        float thetaTerm = atan(xi2, d) - atan(xi1, d);
        float sinCosTerm = (xi2 * d) / r2Sq - (xi1 * d) / r1Sq;
        float sigmaZZ = (pLoad / PI_VAL) * (thetaTerm + sinCosTerm);
        // Attenuate gently with depth so glow reads as an elastic compression cushion
        float depthFade = exp(-d * 1.15);
        compSum += (sigmaZZ / max(1.0, uRefForce)) * 0.42 * depthFade;
      }
    }
    float ugGlow = 1.0 - exp(-compSum * 0.85);
    if (ugGlow > 0.002) {
      float aUg = ugGlow * (uDark == 1 ? 0.48 : 0.30);
      accumCol += uColCyanPos * aUg;
      accumAlpha += aUg;
    }

    // 2. Smooth Signed z-Momentum Density Glow (Cyan = +z surplus, 0 = neutral, Yellow = -z deficit)
    if (uBodyState.w > 0.5) {
      float signedP = clamp(uBodyState.x, -1.0, 1.0);
      float magP = abs(signedP);
      if (magP > 0.015) {
        float mask = bodyGlowMask(wx, wz, uBodyBounds, uBodyState.z > 0.5);
        vec3 pCol = signedP >= 0.0 ? uColCyanPos : uColYellowNeg;
        float aBody = mask * magP * (uDark == 1 ? 0.46 : 0.34);
        accumCol += pCol * aBody;
        accumAlpha += aBody * (uDark == 1 ? 0.55 : 0.85);
      }
    }
  } else {
    // ENERGY FLUID MODE:
    // 1. Warm chemical source aura inside active muscles
    if (uMuscleGlow.w > 0.01) {
      vec2 dm = vec2(wx - uMuscleGlow.x, wz - uMuscleGlow.y);
      float dist2 = dot(dm, dm);
      float r2 = uMuscleGlow.z * uMuscleGlow.z * 2.4;
      float mGlow = uMuscleGlow.w * exp(-dist2 / max(0.01, r2));
      vec3 mCol = uDark == 1 ? vec3(0.98, 0.60, 0.18) : vec3(0.88, 0.45, 0.10);
      float aM = mGlow * (uDark == 1 ? 0.42 : 0.28);
      accumCol += mCol * aM;
      accumAlpha += aM * 0.7;
    }

    // 2. Stationary Bright Golden Glow inside elevated/moving body (mgh + KE)
    if (uBodyState.w > 0.5 && uBodyState.y > 0.008) {
      float eFrac = clamp(uBodyState.y, 0.0, 1.0);
      float mask = bodyGlowMask(wx, wz, uBodyBounds, uBodyState.z > 0.5);
      float aE = mask * pow(eFrac, 0.82) * (uDark == 1 ? 0.54 : 0.36);
      accumCol += uColEnergyGold * aE;
      accumAlpha += aE * (uDark == 1 ? 0.52 : 0.85);
    }
  }

  fragColor = vec4(accumCol, clamp(accumAlpha, 0.0, 0.85));
}
`;

const PARTICLE_VS = `#version 300 es
precision highp float;
const vec2 QUAD[6] = vec2[6](
  vec2(-1.0, -1.0), vec2(1.0, -1.0), vec2(1.0,  1.0),
  vec2(-1.0, -1.0), vec2(1.0,  1.0), vec2(-1.0, 1.0)
);

// Per-instance attributes:
// aPosVel: (wx, wz, vx, vz)
// aMeta:   (perpRadiusMeters, alpha, kind, phase)
//   kind: 0 = cyan z-stream, 1 = cyan volumetric sink ring, 2 = gold work stream, 3 = crimson heat wisp
layout(location = 0) in vec4 aPosVel;
layout(location = 1) in vec4 aMeta;

uniform vec2 uResolution;
uniform vec2 uCamOrigin;
uniform float uPpm;
uniform float uStreakStretch;
uniform float uMaxStretch;

out vec2 vLocal;
out float vAlpha;
out float vKind;
out float vPhase;

void main() {
  vec2 q = QUAD[gl_VertexID];
  vLocal = q;
  vAlpha = aMeta.y;
  vKind = aMeta.z;
  vPhase = aMeta.w;

  vec2 centerPx = vec2(
    uCamOrigin.x + aPosVel.x * uPpm,
    uCamOrigin.y - aPosVel.y * uPpm
  );

  // Screen-space velocity direction (+z upward -> -y in screen px)
  vec2 velScreen = vec2(aPosVel.z, -aPosVel.w);
  float speed = length(velScreen);
  vec2 dir = speed > 1e-3 ? (velScreen / speed) : vec2(0.0, -1.0);
  vec2 perp = vec2(-dir.y, dir.x);

  float perpR = aMeta.x * uPpm;
  bool isStream = (aMeta.z < 0.5 || (aMeta.z > 1.5 && aMeta.z < 2.5));
  float stretch = isStream ? clamp(1.0 + speed * uStreakStretch, 1.15, uMaxStretch) : 1.0;
  // Keep transverse radius strictly bounded inside thin beams, while elongating smoothly along flow direction!
  float longR = isStream ? max(perpR, min(0.022 * uPpm, perpR * 2.2)) * stretch : perpR;

  vec2 offsetPx = dir * (q.x * longR) + perp * (q.y * perpR);
  vec2 finalPx = centerPx + offsetPx;

  vec2 clip = vec2(
    (finalPx.x / uResolution.x) * 2.0 - 1.0,
    1.0 - (finalPx.y / uResolution.y) * 2.0
  );
  gl_Position = vec4(clip, 0.0, 1.0);
}
`;

const PARTICLE_FS = `#version 300 es
precision highp float;
in vec2 vLocal;
in float vAlpha;
in float vKind;
in float vPhase;
out vec4 fragColor;

uniform int uDark;
uniform vec3 uColCyanPos;
uniform vec3 uColEnergyGold;
uniform vec3 uColHeatOrange;
uniform vec3 uColHeatCrimson;

void main() {
  float r = length(vLocal);
  if (r > 1.0) discard;

  vec3 col;
  float a = 0.0;

  if (vKind < 0.5) {
    // 0: Cyan +z momentum parcel (fast tapered acoustic/fluid filament)
    float taper = smoothstep(1.0, 0.0, r);
    float headBias = 0.76 + 0.24 * vLocal.x;
    a = taper * taper * headBias * vAlpha;
    col = uColCyanPos;
  } else if (vKind < 1.5) {
    // 1: Volumetric gravity sink pinpoint inside massive object (imploding ring -> pinpoint)
    float targetR = mix(0.82, 0.10, vPhase);
    float ring = exp(-pow((r - targetR) / 0.24, 2.0));
    float core = exp(-r * r * 6.0) * vPhase;
    a = (ring * 0.72 + core * 0.82) * (1.0 - r * r * 0.6) * vAlpha;
    col = uColCyanPos;
  } else if (vKind < 2.5) {
    // 2: Gold mechanical energy / work parcel
    float taper = smoothstep(1.0, 0.0, r);
    float headBias = 0.78 + 0.22 * vLocal.x;
    a = taper * taper * headBias * vAlpha;
    col = uColEnergyGold;
  } else {
    // 3: Thermal heat plume wisp
    float soft = pow(1.0 - r * r, 2.2);
    a = soft * vAlpha;
    col = mix(uColHeatOrange, uColHeatCrimson, vPhase);
  }

  if (uDark == 1) {
    fragColor = vec4(col * a, a * 0.52);
  } else {
    fragColor = vec4(col * a, a * 0.92);
  }
}
`;

function compileShader(gl, type, src) {
  const sh = gl.createShader(type);
  if (!sh) {
    throw new Error('Failed to allocate WebGL2 shader object');
  }
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(`WebGL2 shader compilation failed: ${info}`);
  }
  return sh;
}

function linkProgram(gl, vsSrc, fsSrc) {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
  const prog = gl.createProgram();
  if (!prog) {
    throw new Error('Failed to allocate WebGL2 program');
  }
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(prog);
    gl.deleteProgram(prog);
    throw new Error(`WebGL2 program link failed: ${info}`);
  }
  return prog;
}

function rgbCss(rgb, alpha = 1) {
  const r = Math.round(rgb[0] * 255);
  const g = Math.round(rgb[1] * 255);
  const b = Math.round(rgb[2] * 255);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function createRenderer(glCanvas, overlayCanvas, config = DEFAULT_CONFIG) {
  const vCfg = config.visual;
  const physCfg = config.physics;
  const maxParticles = vCfg.maxParticles;

  const ctx2d = overlayCanvas.getContext('2d');
  if (!ctx2d) {
    throw new Error('Failed to initialize 2D overlay canvas context.');
  }

  const gl = glCanvas.getContext('webgl2', {
    alpha: true,
    antialias: true,
    premultipliedAlpha: true,
  });
  if (!gl) {
    throw new Error(
      'WebGL 2 is required to render the continuum and particle fluid fields, but WebGL 2 is unavailable or disabled in this browser.'
    );
  }

  const contProg = linkProgram(gl, CONTINUUM_VS, CONTINUUM_FS);
  const partProg = linkProgram(gl, PARTICLE_VS, PARTICLE_FS);

  const emptyVao = gl.createVertexArray();
  const partVao = gl.createVertexArray();
  gl.bindVertexArray(partVao);

  const posVelBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, posVelBuf);
  gl.bufferData(gl.ARRAY_BUFFER, maxParticles * 4 * 4, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
  gl.vertexAttribDivisor(0, 1);

  const metaBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, metaBuf);
  gl.bufferData(gl.ARRAY_BUFFER, maxParticles * 4 * 4, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 0, 0);
  gl.vertexAttribDivisor(1, 1);

  gl.bindVertexArray(null);

  const glResources = {
    contProg,
    partProg,
    emptyVao,
    partVao,
    posVelBuf,
    metaBuf,
    posVelData: new Float32Array(maxParticles * 4),
    metaData: new Float32Array(maxParticles * 4),
    uCont: {
      uResolution: gl.getUniformLocation(contProg, 'uResolution'),
      uCamOrigin: gl.getUniformLocation(contProg, 'uCamOrigin'),
      uPpm: gl.getUniformLocation(contProg, 'uPpm'),
      uFluidMode: gl.getUniformLocation(contProg, 'uFluidMode'),
      uDark: gl.getUniformLocation(contProg, 'uDark'),
      uRefForce: gl.getUniformLocation(contProg, 'uRefForce'),
      uContactCount: gl.getUniformLocation(contProg, 'uContactCount'),
      uContacts: gl.getUniformLocation(contProg, 'uContacts[0]'),
      uMuscleGlow: gl.getUniformLocation(contProg, 'uMuscleGlow'),
      uBodyBounds: gl.getUniformLocation(contProg, 'uBodyBounds'),
      uBodyState: gl.getUniformLocation(contProg, 'uBodyState'),
      uColCyanPos: gl.getUniformLocation(contProg, 'uColCyanPos'),
      uColYellowNeg: gl.getUniformLocation(contProg, 'uColYellowNeg'),
      uColEnergyGold: gl.getUniformLocation(contProg, 'uColEnergyGold'),
    },
    uPart: {
      uResolution: gl.getUniformLocation(partProg, 'uResolution'),
      uCamOrigin: gl.getUniformLocation(partProg, 'uCamOrigin'),
      uPpm: gl.getUniformLocation(partProg, 'uPpm'),
      uStreakStretch: gl.getUniformLocation(partProg, 'uStreakStretch'),
      uMaxStretch: gl.getUniformLocation(partProg, 'uMaxStretch'),
      uDark: gl.getUniformLocation(partProg, 'uDark'),
      uColCyanPos: gl.getUniformLocation(partProg, 'uColCyanPos'),
      uColEnergyGold: gl.getUniformLocation(partProg, 'uColEnergyGold'),
      uColHeatOrange: gl.getUniformLocation(partProg, 'uColHeatOrange'),
      uColHeatCrimson: gl.getUniformLocation(partProg, 'uColHeatCrimson'),
    },
  };

  const cam = {
    cssW: 1000,
    cssH: 700,
    dpr: 1,
    originX: 500,
    originY: 470,
    ppm: 180,
  };

  const particles = [];
  const spawnCarry = {};
  let lastChapter = '';
  let lastFluidMode = '';

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, vCfg.maxDpr);
    const w = window.innerWidth;
    const h = window.innerHeight;
    cam.cssW = w;
    cam.cssH = h;
    cam.dpr = dpr;

    const pw = Math.round(w * dpr);
    const ph = Math.round(h * dpr);
    if (glCanvas.width !== pw || glCanvas.height !== ph) {
      glCanvas.width = pw;
      glCanvas.height = ph;
    }
    if (overlayCanvas.width !== pw || overlayCanvas.height !== ph) {
      overlayCanvas.width = pw;
      overlayCanvas.height = ph;
    }
  }

  function updateCamera(scene) {
    const spanX = scene.worldSpanX;
    const spanZ = vCfg.cameraSpanZM;
    const ppmX = (cam.cssW * vCfg.cameraViewportMarginX) / spanX;
    const ppmZ = (cam.cssH * vCfg.cameraViewportMarginZ) / spanZ;
    cam.ppm = Math.max(vCfg.minPixelsPerMeter, Math.min(ppmX, ppmZ));
    cam.originX = cam.cssW * 0.5;
    cam.originY = cam.cssH * vCfg.groundHorizonScreenFracY;
  }

  function worldToScreen(wx, wz) {
    return {
      x: cam.originX + wx * cam.ppm,
      y: cam.originY - wz * cam.ppm,
    };
  }

  function screenToWorld(px, py) {
    return {
      x: (px - cam.originX) / cam.ppm,
      z: (cam.originY - py) / cam.ppm,
    };
  }

  function emitParticle(p) {
    if (particles.length < maxParticles) {
      particles.push(p);
    }
  }

  function getBodyBounds(scene, bodyId) {
    for (const b of scene.bodies) {
      if (b.id === bodyId) {
        return { x: b.x, z: b.z, w: b.w, h: b.h, isCar: false };
      }
    }
    if (scene.car && scene.car.id === bodyId) {
      return { x: scene.car.x, z: scene.car.z, w: scene.car.w, h: scene.car.h, isCar: true };
    }
    return null;
  }

  function getPrimaryChargedBody(scene) {
    if (scene.car) {
      return {
        x: scene.car.x,
        z: scene.car.z,
        w: scene.car.w,
        h: scene.car.h,
        signedDensityRatio: scene.car.signedDensityRatio,
        energyGlowRatio: scene.car.energyGlowRatio,
        isCar: true,
      };
    }
    if (scene.bodies.length > 0) {
      const b = scene.bodies[0];
      return {
        x: b.x,
        z: b.z,
        w: b.w,
        h: b.h,
        signedDensityRatio: b.signedDensityRatio,
        energyGlowRatio: b.energyGlowRatio,
        isCar: false,
      };
    }
    return null;
  }

  function placeConduitParticle(p, pts) {
    const param = p.forward ? p.u : 1.0 - p.u;
    const s = samplePolyline(pts, param);
    const dirSign = p.forward ? 1 : -1;
    const perpX = -s.dz;
    const perpZ = s.dx;
    // Strictly keep particle edge inside physical conduit width while spanning wide flat interfaces!
    const perpRadiusM = Math.min(p.baseSize, s.width * 0.34);
    const halfSpan = Math.max(0, s.width * 0.5 * vCfg.conduitLaneFillFraction - perpRadiusM);
    const offset = p.lane * 2.0 * halfSpan;

    p.x = s.x + perpX * offset;
    p.z = s.z + perpZ * offset;
    p.renderSize = perpRadiusM;
    p.vx = s.dx * dirSign * p.worldSpeedMps;
    p.vz = s.dz * dirSign * p.worldSpeedMps;
  }

  function updateParticles(dt, scene, fluidMode) {
    if (scene.chapterId !== lastChapter || fluidMode !== lastFluidMode) {
      particles.length = 0;
      for (const k of Object.keys(spawnCarry)) {
        spawnCarry[k] = 0;
      }
      lastChapter = scene.chapterId;
      lastFluidMode = fluidMode;
      for (let w = 0; w < vCfg.preWarmSteps; w++) {
        stepParticleSystem(vCfg.preWarmDtSec, scene, fluidMode);
      }
      return;
    }
    stepParticleSystem(dt, scene, fluidMode);
  }

  function stepParticleSystem(dt, scene, fluidMode) {
    const field = scene.field;
    const refZ = Math.max(50, scene.referenceCurrentZ);
    const refP = Math.max(50, scene.referencePowerWatts);

    if (fluidMode === 'z') {
      // 1. Spawn underground strip-Flamant streamlines proportional to true contact forceZ
      for (const gc of field.groundContacts) {
        if (gc.forceZ <= 2) continue;
        const normF = gc.forceZ / refZ;
        const widthFactor = 0.7 + gc.width * 0.85;
        const rate = vCfg.groundSpawnRateScale * widthFactor * Math.pow(normF, 0.76);
        const key = `gc_${gc.contactId}`;
        spawnCarry[key] = (spawnCarry[key] || 0) + rate * dt;
        while (spawnCarry[key] >= 1) {
          spawnCarry[key] -= 1;
          const lateralSpan = gc.width * 1.28 + 0.38;
          const sx = gc.x + (Math.random() - 0.5) * lateralSpan;
          const sz = gc.z - (0.28 + Math.random() * 0.58);
          emitParticle({
            type: 'ground_z',
            contactId: gc.contactId,
            x: sx,
            z: sz,
            vx: 0,
            vz: vCfg.undergroundPropagationBaseMps,
            age: 0,
            life: 0.55 + Math.random() * 0.35,
            baseSize: 0.022 + Math.min(0.012, normF * 0.006),
            renderSize: 0.022 + Math.min(0.012, normF * 0.006),
            alphaBoost: clamp(0.46 + normF * 0.44, 0.36, 0.95),
          });
        }
      }

      // 2. Spawn fast-propagating solid-conduit z-momentum streamlines (I = c * v: fast v, finite density c!)
      for (const zc of field.zConduits) {
        const mag = Math.abs(zc.currentZ);
        if (!zc.activeContact || mag <= 2) continue;
        const pts = scene.conduitPaths[zc.pathId];
        if (!pts) continue;

        const normI = mag / refZ;
        const len = polylineLength(pts);
        const worldSpeedMps =
          vCfg.solidPropagationBaseMps +
          Math.min(vCfg.solidPropagationCurrentBoostMps, normI * vCfg.solidPropagationCurrentBoostMps * 0.85);
        const speedU = worldSpeedMps / len;
        const rate = vCfg.conduitZSpawnRateScale * (0.45 + len * 0.55) * Math.pow(normI, 0.72);
        const key = `zc_${zc.conduitId}`;
        spawnCarry[key] = (spawnCarry[key] || 0) + rate * dt;

        while (spawnCarry[key] >= 1) {
          spawnCarry[key] -= 1;
          const u0 = Math.random() * 0.05;
          const p = {
            type: 'conduit_z',
            conduitId: zc.conduitId,
            pathId: zc.pathId,
            u: u0,
            forward: zc.currentZ >= 0,
            speedU,
            worldSpeedMps,
            lane: Math.random() - 0.5,
            x: 0,
            z: 0,
            vx: 0,
            vz: 0,
            age: 0,
            life: (1.0 - u0) / speedU,
            baseSize: 0.022 + Math.min(0.012, normI * 0.007),
            renderSize: 0.022,
            alphaBoost: clamp(0.52 + normI * 0.42, 0.44, 0.96),
          };
          placeConduitParticle(p, pts);
          emitParticle(p);
        }
      }

      // 3. Volumetric gravity dissipation rings uniformly across massive bodies (rate ~ densityNorm * area)
      for (const sink of field.zVolumeSinks) {
        const bounds = getBodyBounds(scene, sink.bodyId);
        if (!bounds) continue;
        const area = bounds.w * bounds.h;
        const rate = area * sink.densityNorm * vCfg.volumeSinkSpawnPerM2;
        const key = `sink_${sink.bodyId}`;
        spawnCarry[key] = (spawnCarry[key] || 0) + rate * dt;
        while (spawnCarry[key] >= 1) {
          spawnCarry[key] -= 1;
          const lx = Math.random() - 0.5;
          const lz = 0.08 + Math.random() * 0.84;
          if (bounds.isCar && !isInsideCarSilhouette(lx, lz)) continue;
          emitParticle({
            type: 'sink_z',
            bodyId: sink.bodyId,
            relX: lx,
            relZ: lz,
            x: bounds.x + lx * bounds.w,
            z: bounds.z + lz * bounds.h,
            vx: 0,
            vz: 0,
            age: 0,
            life: 0.72 + Math.random() * 0.38,
            baseSize: 0.032,
            renderSize: 0.032,
            alphaBoost: clamp(0.40 + sink.densityNorm * 0.16, 0.38, 0.86),
          });
        }
      }
    } else {
      // ENERGY FLUID MODE (`fluidMode === 'energy'`)
      // 1. Fast mechanical work streamlines along arms / rigid Class-1 lever
      for (const ec of field.energyConduits) {
        const mag = Math.abs(ec.powerWatts);
        if (!ec.activeContact || mag <= 4) continue;
        const pts = scene.conduitPaths[ec.pathId];
        if (!pts) continue;

        const normP = mag / refP;
        const len = polylineLength(pts);
        const worldSpeedMps =
          vCfg.solidPropagationBaseMps +
          Math.min(vCfg.solidPropagationCurrentBoostMps, normP * vCfg.solidPropagationCurrentBoostMps * 0.85);
        const speedU = worldSpeedMps / len;
        const rate = vCfg.conduitESpawnRateScale * (0.48 + len * 0.56) * Math.pow(normP, 0.70);
        const key = `ec_${ec.conduitId}`;
        spawnCarry[key] = (spawnCarry[key] || 0) + rate * dt;

        while (spawnCarry[key] >= 1) {
          spawnCarry[key] -= 1;
          const u0 = Math.random() * 0.05;
          const p = {
            type: 'conduit_e',
            conduitId: ec.conduitId,
            pathId: ec.pathId,
            u: u0,
            forward: ec.powerWatts >= 0,
            speedU,
            worldSpeedMps,
            lane: Math.random() - 0.5,
            x: 0,
            z: 0,
            vx: 0,
            vz: 0,
            age: 0,
            life: (1.0 - u0) / speedU,
            baseSize: 0.025 + Math.min(0.012, normP * 0.007),
            renderSize: 0.025,
            alphaBoost: clamp(0.58 + normP * 0.40, 0.50, 0.98),
          };
          placeConduitParticle(p, pts);
          emitParticle(p);
        }
      }

      // 2. Outward-rising thermal heat plumes from muscles (or ground impact)
      for (const hp of field.heatPlumes) {
        if (hp.watts <= 5) continue;
        const normH = hp.watts / refP;
        const rate = vCfg.heatPlumeSpawnRateScale * Math.pow(normH, 0.75);
        const key = `hp_${hp.plumeId}`;
        spawnCarry[key] = (spawnCarry[key] || 0) + rate * dt;
        while (spawnCarry[key] >= 1) {
          spawnCarry[key] -= 1;
          const ox = (Math.random() - 0.5) * hp.spreadX;
          const oz = (Math.random() - 0.5) * 0.14;
          const sz = 0.042 + Math.random() * 0.032;
          emitParticle({
            type: 'heat_wisp',
            x: hp.x + ox,
            z: hp.z + oz,
            vx: ox * 1.15 + (Math.random() - 0.5) * 0.22,
            vz: 0.42 + Math.random() * 0.40 + Math.min(0.35, normH * 0.18),
            swirlSeed: Math.random() * Math.PI * 2,
            age: 0,
            life: 0.95 + Math.random() * 0.55,
            baseSize: sz,
            renderSize: sz,
            alphaBoost: clamp(0.36 + normH * 0.34, 0.30, 0.82),
          });
        }
      }
    }

    // Advance active particles in place with strict live-conduit & true-contact culling
    let writeIdx = 0;
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.age += dt;
      if (p.age >= p.life) continue;

      if (p.type === 'ground_z') {
        const liveContact = field.groundContacts.find((c) => c.contactId === p.contactId);
        if (!liveContact || liveContact.forceZ <= 2) continue;
        if (p.z >= liveContact.z - 0.012) continue;

        const flux = evaluateStripFlamantFlux(p.x, p.z, field.groundContacts, physCfg);
        const fMag = Math.hypot(flux.jx, flux.jz);
        if (fMag < 1e-3) continue;

        const speed =
          vCfg.undergroundPropagationBaseMps +
          Math.min(vCfg.undergroundPropagationBoostMps, (fMag / refZ) * 1.4);
        p.vx = (flux.jx / fMag) * speed;
        p.vz = (flux.jz / fMag) * speed;
        p.x += p.vx * dt;
        p.z += p.vz * dt;
        if (p.z >= liveContact.z - 0.010) continue;
      } else if (p.type === 'conduit_z' || p.type === 'conduit_e') {
        const pts = scene.conduitPaths[p.pathId];
        const list = p.type === 'conduit_z' ? field.zConduits : field.energyConduits;
        const live = list.find((c) => c.conduitId === p.conduitId);

        // Immediately cull if contact breaks (zero particles ever float in air!)
        if (!pts || !live || !live.activeContact) continue;

        const liveMag = p.type === 'conduit_z' ? Math.abs(live.currentZ) : Math.abs(live.powerWatts);
        if (liveMag <= 2) {
          // Rapidly fade out inside the moving solid conduit when motion pauses to hold
          p.age += dt * 5.5;
          if (p.age >= p.life) continue;
        }

        p.u += p.speedU * dt;
        if (p.u >= 1.0) continue;
        placeConduitParticle(p, pts);
      } else if (p.type === 'sink_z') {
        const bounds = getBodyBounds(scene, p.bodyId);
        if (!bounds) continue;
        p.x = bounds.x + p.relX * bounds.w;
        p.z = bounds.z + p.relZ * bounds.h;
      } else if (p.type === 'heat_wisp') {
        const swirl = Math.sin(p.age * 5.2 + p.swirlSeed) * 0.24;
        p.x += (p.vx + swirl) * dt;
        p.z += p.vz * dt;
        p.renderSize += 0.028 * dt;
      }

      particles[writeIdx++] = p;
    }
    particles.length = writeIdx;
  }

  function renderGL(scene, fluidMode, theme) {
    const isDark = theme === 'dark' ? 1 : 0;
    const cols = isDark ? vCfg.darkColors : vCfg.lightColors;
    const dpr = cam.dpr;

    gl.viewport(0, 0, glCanvas.width, glCanvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    // 1. Continuum shader pass (strip-load Flamant glow + signed momentum / stationary energy glow)
    const { contProg, uCont, emptyVao } = glResources;
    gl.useProgram(contProg);
    gl.uniform2f(uCont.uResolution, glCanvas.width, glCanvas.height);
    gl.uniform2f(uCont.uCamOrigin, cam.originX * dpr, cam.originY * dpr);
    gl.uniform1f(uCont.uPpm, cam.ppm * dpr);
    gl.uniform1i(uCont.uFluidMode, fluidMode === 'energy' ? 1 : 0);
    gl.uniform1i(uCont.uDark, isDark);
    gl.uniform1f(uCont.uRefForce, scene.referenceCurrentZ);
    gl.uniform3fv(uCont.uColCyanPos, cols.cyanPositive);
    gl.uniform3fv(uCont.uColYellowNeg, cols.yellowNegative);
    gl.uniform3fv(uCont.uColEnergyGold, cols.energyGold);

    const contacts = scene.field.groundContacts.slice(0, 6);
    const contactArr = new Float32Array(24);
    for (let i = 0; i < contacts.length; i++) {
      contactArr[i * 4 + 0] = contacts[i].x;
      contactArr[i * 4 + 1] = contacts[i].z;
      contactArr[i * 4 + 2] = contacts[i].width * 0.5;
      contactArr[i * 4 + 3] = Math.max(0, contacts[i].forceZ);
    }
    gl.uniform1i(uCont.uContactCount, contacts.length);
    gl.uniform4fv(uCont.uContacts, contactArr);

    const es = scene.field.energySources[0];
    if (es && es.powerWatts > 2) {
      const inten = clamp(es.powerWatts / (scene.referencePowerWatts * 1.6), 0, 1.15);
      gl.uniform4f(uCont.uMuscleGlow, es.x, es.z, es.radius, inten);
    } else {
      gl.uniform4f(uCont.uMuscleGlow, 0, 0, 0.2, 0);
    }

    const chargedBody = getPrimaryChargedBody(scene);
    if (chargedBody) {
      gl.uniform4f(uCont.uBodyBounds, chargedBody.x, chargedBody.z, chargedBody.w, chargedBody.h);
      gl.uniform4f(
        uCont.uBodyState,
        chargedBody.signedDensityRatio,
        chargedBody.energyGlowRatio,
        chargedBody.isCar ? 1.0 : 0.0,
        1.0
      );
    } else {
      gl.uniform4f(uCont.uBodyBounds, 0, 0, 1, 1);
      gl.uniform4f(uCont.uBodyState, 0, 0, 0, 0);
    }

    gl.bindVertexArray(emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // 2. Instanced particle pass
    const count = particles.length;
    if (count > 0) {
      const { partProg, uPart, partVao, posVelBuf, metaBuf, posVelData, metaData } = glResources;
      for (let i = 0; i < count; i++) {
        const p = particles[i];
        const t = clamp(p.age / p.life, 0, 1);
        const fadeIn = Math.min(1, t * 5.0);
        const fadeOut =
          p.type === 'sink_z'
            ? 1.0 - Math.pow(t, 1.8)
            : Math.sin(Math.min(1, 1 - t) * Math.PI * 0.5);
        // Taper smoothly at conduit entry/exit so fast streaks never poke past interface ends
        const conduitTaper =
          p.type === 'conduit_z' || p.type === 'conduit_e'
            ? Math.min(1, p.u * 8.0) * Math.min(1, (1.0 - p.u) * 8.0)
            : 1.0;
        const alpha = fadeIn * fadeOut * conduitTaper * p.alphaBoost;

        let kind = 0;
        if (p.type === 'sink_z') kind = 1;
        else if (p.type === 'conduit_e') kind = 2;
        else if (p.type === 'heat_wisp') kind = 3;

        posVelData[i * 4 + 0] = p.x;
        posVelData[i * 4 + 1] = p.z;
        posVelData[i * 4 + 2] = p.vx;
        posVelData[i * 4 + 3] = p.vz;

        metaData[i * 4 + 0] = p.renderSize;
        metaData[i * 4 + 1] = alpha;
        metaData[i * 4 + 2] = kind;
        metaData[i * 4 + 3] = t;
      }

      gl.useProgram(partProg);
      gl.uniform2f(uPart.uResolution, glCanvas.width, glCanvas.height);
      gl.uniform2f(uPart.uCamOrigin, cam.originX * dpr, cam.originY * dpr);
      gl.uniform1f(uPart.uPpm, cam.ppm * dpr);
      gl.uniform1f(uPart.uStreakStretch, vCfg.streakStretchFactor);
      gl.uniform1f(uPart.uMaxStretch, vCfg.maxStreakStretch);
      gl.uniform1i(uPart.uDark, isDark);
      gl.uniform3fv(uPart.uColCyanPos, cols.cyanPositive);
      gl.uniform3fv(uPart.uColEnergyGold, cols.energyGold);
      gl.uniform3fv(uPart.uColHeatOrange, cols.heatOrange);
      gl.uniform3fv(uPart.uColHeatCrimson, cols.heatCrimson);

      gl.bindVertexArray(partVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, posVelBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, posVelData.subarray(0, count * 4));
      gl.bindBuffer(gl.ARRAY_BUFFER, metaBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, metaData.subarray(0, count * 4));

      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, count);
      gl.bindVertexArray(null);
    }
  }

  // ---------------------------------------------------------------------------
  // CRISP 2D ARCHITECTURAL & PEDAGOGICAL OVERLAY
  // ---------------------------------------------------------------------------
  function renderOverlay2D(scene, fluidMode, theme) {
    const ctx = ctx2d;
    const dpr = cam.dpr;
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cam.cssW, cam.cssH);

    const isDark = theme === 'dark';
    const cols = isDark ? vCfg.darkColors : vCfg.lightColors;
    const pal = {
      ink: isDark ? '#efe8da' : '#2a2d38',
      inkSoft: isDark ? 'rgba(218, 208, 192, 0.68)' : 'rgba(72, 66, 56, 0.68)',
      inkFaint: isDark ? 'rgba(218, 208, 192, 0.18)' : 'rgba(72, 66, 56, 0.16)',
      groundFill: isDark ? 'rgba(18, 17, 16, 0.42)' : 'rgba(205, 195, 178, 0.34)',
      strata: isDark ? 'rgba(235, 225, 205, 0.13)' : 'rgba(70, 58, 42, 0.15)',
      cyan: rgbCss(cols.cyanPositive, 1),
      yellowNeg: rgbCss(cols.yellowNegative, 1),
      gold: rgbCss(cols.energyGold, 1),
      strainRed: isDark ? '#f26457' : '#c43428',
      bodyFill: isDark ? 'rgba(34, 32, 30, 0.76)' : 'rgba(248, 244, 235, 0.80)',
      bodyStroke: isDark ? 'rgba(239, 232, 218, 0.58)' : 'rgba(52, 48, 42, 0.56)',
      cols,
    };

    // 1. Elastic Ground Surface & Subterranean Strata (strictly zero compression without true contact!)
    drawElasticGround(ctx, scene, fluidMode, pal);

    // 2. Trapezoidal Fulcrum & Rigid Class-1 Lever Beam
    if (scene.fulcrum) {
      drawFulcrum(ctx, scene.fulcrum, fluidMode, pal, isDark);
    }
    if (scene.lever) {
      drawLeverBeam(ctx, scene.lever, scene.field, fluidMode, pal, isDark);
    }

    // 3. Payload Boxes (Chapters 1 & 2)
    for (const b of scene.bodies) {
      drawPayloadBox(ctx, b, fluidMode, pal, isDark);
    }

    // 4. Car (Chapters 3 & 4)
    if (scene.car) {
      drawCar(ctx, scene.car, scene.lever, fluidMode, pal, isDark);
    }

    // 5. Articulated Human (Chapters 2, 3, 4)
    if (scene.human) {
      drawHuman(ctx, scene.human, scene, fluidMode, pal);
    }

    // 6. Subtle quantitative share badges where helpful (Chapters 3 & 4)
    drawMinimalAnnotations(ctx, scene, fluidMode, pal);

    ctx.restore();
  }

  function drawElasticGround(ctx, scene, fluidMode, pal) {
    const contacts = scene.field.groundContacts;
    const comp = scene.groundCompliance;
    const maxDep = vCfg.maxGroundDepressionM;
    const minWX = screenToWorld(0, 0).x - 0.2;
    const maxWX = screenToWorld(cam.cssW, 0).x + 0.2;
    const steps = 112;

    ctx.save();
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const wx = minWX + ((maxWX - minWX) * i) / steps;
      const dz = evaluateStripGroundDepression(wx, contacts, comp, maxDep, physCfg);
      const p = worldToScreen(wx, dz);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.lineTo(cam.cssW + 10, cam.cssH + 10);
    ctx.lineTo(-10, cam.cssH + 10);
    ctx.closePath();
    ctx.fillStyle = pal.groundFill;
    ctx.fill();

    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const wx = minWX + ((maxWX - minWX) * i) / steps;
      const dz = evaluateStripGroundDepression(wx, contacts, comp, maxDep, physCfg);
      const p = worldToScreen(wx, dz);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.strokeStyle = pal.bodyStroke;
    ctx.lineWidth = 1.6;
    ctx.stroke();

    const depths = vCfg.groundStrataDepthsM;
    for (let dIdx = 0; dIdx < depths.length; dIdx++) {
      const depth = depths[dIdx];
      const atten = Math.exp(-depth * vCfg.groundStrataAttenuationPerM);
      ctx.beginPath();
      for (let i = 0; i <= steps; i++) {
        const wx = minWX + ((maxWX - minWX) * i) / steps;
        const dz = evaluateStripGroundDepression(wx, contacts, comp, maxDep, physCfg) * atten;
        const p = worldToScreen(wx, -depth + dz);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.strokeStyle = pal.strata;
      ctx.lineWidth = 1.0;
      ctx.stroke();
    }

    ctx.fillStyle = pal.inkSoft;
    ctx.globalAlpha = 0.46;
    ctx.font = 'italic 12.5px Lora, Georgia, serif';
    ctx.textAlign = 'left';
    ctx.fillText(
      fluidMode === 'z' ? 'Earth · +z momentum reservoir' : 'Earth (v = 0 · passive ground)',
      24,
      cam.originY + 26
    );
    ctx.restore();
  }

  /**
   * Smooth luminous interior glow (ZERO horizontal waterline!):
   * - In `z` mode: smooth signed density color-scale — Cyan glow for `+z` surplus (> 0),
   *   unlit neutral at 0, and Yellow glow for `-z` deficit (< 0).
   * - In `energy` mode: stationary bright Golden glow matching the energy fluid hue.
   */
  function fillBodyInterior(
    ctx,
    boundsPx,
    densityNorm,
    signedDensityRatio,
    energyGlowRatio,
    fluidMode,
    pal,
    isDark
  ) {
    const { x, y, w, h } = boundsPx;
    const cx = x + w * 0.5;
    const cy = y + h * 0.52;
    const outerR = Math.max(w, h) * 0.72;

    ctx.save();
    ctx.clip();

    // Neutral unlit base tint
    ctx.fillStyle = pal.bodyFill;
    ctx.fillRect(x - 2, y - 2, w + 4, h + 4);

    if (fluidMode === 'z') {
      const s = clamp(signedDensityRatio, -1, 1);
      const mag = Math.abs(s);

      if (mag > 0.012) {
        const rgb = s >= 0 ? pal.cols.cyanPositive : pal.cols.yellowNegative;
        const coreAlpha = clamp(mag * (isDark ? 0.58 : 0.44), 0, 0.65);
        const edgeAlpha = clamp(mag * (isDark ? 0.24 : 0.18), 0, 0.32);

        const grad = ctx.createRadialGradient(cx, cy, outerR * 0.06, cx, cy, outerR);
        grad.addColorStop(0, rgbCss(rgb, coreAlpha));
        grad.addColorStop(0.58, rgbCss(rgb, (coreAlpha + edgeAlpha) * 0.55));
        grad.addColorStop(1, rgbCss(rgb, edgeAlpha));
        ctx.fillStyle = grad;
        ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
      }

      // Subtle fixed background lattice dots scaling with mass density
      const stepPx = clamp(25 / Math.sqrt(Math.max(0.3, densityNorm)), 11, 28);
      ctx.fillStyle = isDark ? 'rgba(239, 232, 218, 0.16)' : 'rgba(42, 45, 56, 0.16)';
      for (let gx = x + stepPx * 0.55; gx < x + w - 4; gx += stepPx) {
        for (let gy = y + stepPx * 0.55; gy < y + h - 4; gy += stepPx) {
          ctx.fillRect(gx - 1.4, gy - 0.5, 2.8, 1.0);
        }
      }
    } else {
      // ENERGY MODE: Stationary bright golden glow (like the energy flow, unmoving!)
      const eFrac = clamp(energyGlowRatio, 0, 1);
      if (eFrac > 0.008) {
        const intensity = Math.pow(eFrac, 0.80);
        const rgb = pal.cols.energyGold;
        const coreAlpha = clamp(intensity * (isDark ? 0.68 : 0.48), 0, 0.72);
        const edgeAlpha = clamp(intensity * (isDark ? 0.28 : 0.20), 0, 0.34);

        const grad = ctx.createRadialGradient(cx, cy, outerR * 0.05, cx, cy, outerR);
        grad.addColorStop(
          0,
          isDark ? `rgba(255, 232, 148, ${coreAlpha})` : rgbCss(rgb, coreAlpha)
        );
        grad.addColorStop(0.52, rgbCss(rgb, (coreAlpha + edgeAlpha) * 0.6));
        grad.addColorStop(1, rgbCss(rgb, edgeAlpha));
        ctx.fillStyle = grad;
        ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
      }
    }

    ctx.restore();
  }

  function drawPayloadBox(ctx, b, fluidMode, pal, isDark) {
    const tl = worldToScreen(b.x - b.w * 0.5, b.z + b.h);
    const br = worldToScreen(b.x + b.w * 0.5, b.z);
    const rx = tl.x;
    const ry = tl.y;
    const rw = br.x - tl.x;
    const rh = br.y - tl.y;

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(rx, ry, rw, rh, 10);
    fillBodyInterior(
      ctx,
      { x: rx, y: ry, w: rw, h: rh },
      b.densityNorm,
      b.signedDensityRatio,
      b.energyGlowRatio,
      fluidMode,
      pal,
      isDark
    );

    const sRatio = clamp(b.signedDensityRatio, -1, 1);
    let borderCol = pal.bodyStroke;
    if (fluidMode === 'z' && Math.abs(sRatio) > 0.14) {
      borderCol = sRatio > 0 ? pal.cyan : pal.yellowNeg;
    } else if (fluidMode === 'energy' && b.energyGlowRatio > 0.12) {
      borderCol = pal.gold;
    }

    ctx.beginPath();
    ctx.roundRect(rx, ry, rw, rh, 10);
    ctx.strokeStyle = borderCol;
    ctx.lineWidth = 1.8;
    ctx.stroke();

    ctx.fillStyle = pal.inkSoft;
    ctx.font = '500 12px Inter, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(b.label, rx + rw * 0.5, ry - 9);
    ctx.restore();
  }

  function drawCar(ctx, car, lever, fluidMode, pal, isDark) {
    const tires = [car.rearTire, car.frontTire];

    for (const t of tires) {
      const tireW = t.width * cam.ppm;
      const compFrac = t.inContact ? clamp(t.forceZ / Math.max(1, t.maxForce), 0, 1) : 0;
      const squish = 1 - compFrac * 0.16;
      const tireH = 0.24 * cam.ppm * squish;

      // Exact true-contact wheel bottom (`t.wheelBottomZ === t.groundZ` iff `t.inContact`)
      const botPt = worldToScreen(t.x, t.wheelBottomZ);
      const chassisPt = worldToScreen(t.x, car.z + 0.05);

      ctx.save();
      const springTopY = chassisPt.y;
      const springBotY = botPt.y - tireH * 0.85;
      ctx.strokeStyle = fluidMode === 'z' && compFrac > 0.04 ? pal.cyan : pal.bodyStroke;
      ctx.globalAlpha = fluidMode === 'z' ? 0.32 + compFrac * 0.58 : 0.45;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      const zigCount = 4;
      for (let k = 0; k <= zigCount; k++) {
        const sy = springTopY + ((springBotY - springTopY) * k) / zigCount;
        const sx = botPt.x + (k === 0 || k === zigCount ? 0 : (k % 2 === 0 ? -1 : 1) * 5.5);
        if (k === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
      ctx.stroke();

      ctx.globalAlpha = 1;
      ctx.fillStyle = isDark ? 'rgba(24, 24, 26, 0.90)' : 'rgba(54, 52, 48, 0.86)';
      ctx.strokeStyle = fluidMode === 'z' && compFrac > 0.04 ? pal.cyan : pal.bodyStroke;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(botPt.x - tireW * 0.5, botPt.y - tireH, tireW, tireH, 6);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    const tl = worldToScreen(car.x - car.w * 0.5, car.z + car.h);
    const br = worldToScreen(car.x + car.w * 0.5, car.z);
    const x = tl.x;
    const y = tl.y;
    const w = br.x - tl.x;
    const h = br.y - tl.y;

    function traceCarPath() {
      ctx.beginPath();
      const beltY = y + h * 0.48;
      const botY = y + h;
      const r = 10;
      ctx.moveTo(x + r, botY);
      ctx.lineTo(x + w - r, botY);
      ctx.quadraticCurveTo(x + w, botY, x + w, botY - r);
      ctx.lineTo(x + w, beltY + 8);
      ctx.quadraticCurveTo(x + w, beltY, x + w * 0.86, beltY - 2);
      ctx.lineTo(x + w * 0.74, y + 6);
      ctx.quadraticCurveTo(x + w * 0.70, y, x + w * 0.62, y);
      ctx.lineTo(x + w * 0.38, y);
      ctx.quadraticCurveTo(x + w * 0.30, y, x + w * 0.26, y + 6);
      ctx.lineTo(x + w * 0.14, beltY - 2);
      ctx.quadraticCurveTo(x, beltY, x, beltY + 8);
      ctx.lineTo(x, botY - r);
      ctx.quadraticCurveTo(x, botY, x + r, botY);
      ctx.closePath();
    }

    ctx.save();
    traceCarPath();
    fillBodyInterior(
      ctx,
      { x, y, w, h },
      car.densityNorm,
      car.signedDensityRatio,
      car.energyGlowRatio,
      fluidMode,
      pal,
      isDark
    );

    const sRatio = clamp(car.signedDensityRatio, -1, 1);
    let borderCol = pal.bodyStroke;
    if (fluidMode === 'z' && Math.abs(sRatio) > 0.14) {
      borderCol = sRatio > 0 ? pal.cyan : pal.yellowNeg;
    } else if (fluidMode === 'energy' && car.energyGlowRatio > 0.12) {
      borderCol = pal.gold;
    }

    traceCarPath();
    ctx.strokeStyle = borderCol;
    ctx.lineWidth = 1.9;
    ctx.stroke();

    // Flush sill jack-pad bracket when Class-1 prybar engages the car
    if (lever) {
      const padPt = worldToScreen(lever.tipX, car.z);
      ctx.fillStyle = isDark ? 'rgba(235, 228, 212, 0.78)' : 'rgba(52, 48, 42, 0.78)';
      ctx.fillRect(padPt.x - 10, padPt.y - 3, 20, 6);
    }

    const beltY = y + h * 0.48;
    ctx.strokeStyle = pal.inkFaint;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.20, beltY - 1);
    ctx.lineTo(x + w * 0.80, beltY - 1);
    ctx.stroke();

    ctx.fillStyle = isDark ? 'rgba(245, 238, 220, 0.42)' : 'rgba(80, 75, 65, 0.24)';
    ctx.beginPath();
    ctx.roundRect(x + w * 0.08, beltY + h * 0.12, w * 0.15, h * 0.13, 4);
    ctx.roundRect(x + w * 0.77, beltY + h * 0.12, w * 0.15, h * 0.13, 4);
    ctx.fill();

    ctx.fillStyle = pal.inkSoft;
    ctx.font = '500 12px Inter, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(car.label, x + w * 0.5, y - 9);
    ctx.restore();
  }

  function drawFulcrum(ctx, f, fluidMode, pal, isDark) {
    const topL = worldToScreen(f.x - f.apexW * 0.5, f.pivotZ);
    const topR = worldToScreen(f.x + f.apexW * 0.5, f.pivotZ);
    const botL = worldToScreen(f.x - f.baseW * 0.5, f.groundZ);
    const botR = worldToScreen(f.x + f.baseW * 0.5, f.groundZ);

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(topL.x, topL.y);
    ctx.lineTo(topR.x, topR.y);
    ctx.lineTo(botR.x, botR.y);
    ctx.lineTo(botL.x, botL.y);
    ctx.closePath();

    const activeZ = fluidMode === 'z' && f.compressionRatio > 0.03;
    ctx.fillStyle = activeZ
      ? rgbCss(pal.cols.cyanPositive, isDark ? 0.10 + f.compressionRatio * 0.18 : 0.08 + f.compressionRatio * 0.14)
      : pal.bodyFill;
    ctx.fill();

    ctx.strokeStyle = activeZ ? pal.cyan : pal.bodyStroke;
    ctx.lineWidth = 1.85;
    ctx.stroke();

    // Converging guide lines inside fulcrum emphasizing wide-base -> point-apex funneling!
    if (activeZ) {
      ctx.strokeStyle = pal.cyan;
      ctx.globalAlpha = 0.22 + f.compressionRatio * 0.36;
      ctx.lineWidth = 1.05;
      for (const frac of [-0.62, -0.28, 0.28, 0.62]) {
        const bx = (botL.x + botR.x) * 0.5 + frac * (botR.x - botL.x) * 0.5;
        const tx = (topL.x + topR.x) * 0.5 + frac * (topR.x - topL.x) * 0.5;
        ctx.beginPath();
        ctx.moveTo(bx, botL.y - 1);
        ctx.lineTo(tx, topL.y + 1);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    ctx.fillStyle = pal.inkSoft;
    ctx.font = '500 10.5px Inter, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('↔ Fulcrum', (topL.x + topR.x) * 0.5, botL.y + 15);
    ctx.restore();
  }

  function drawLeverBeam(ctx, lv, field, fluidMode, pal, isDark) {
    const pTip = worldToScreen(lv.tipX, lv.tipCenterZ);
    const pPiv = worldToScreen(lv.pivotX, lv.pivotCenterZ);
    const pPin = worldToScreen(lv.pivotX, lv.pivotZ);
    const pHnd = worldToScreen(lv.handleX, lv.handleCenterZ);

    const dx = pHnd.x - pTip.x;
    const dy = pHnd.y - pTip.y;
    const len = Math.max(1, Math.hypot(dx, dy));
    const nx = -dy / len;
    const ny = dx / len;
    const halfThickPx = Math.max(4.5, lv.thicknessM * 0.5 * cam.ppm);

    let beamCurrent = 0;
    for (const zc of field.zConduits) {
      if (zc.conduitId.startsWith('lever_')) beamCurrent = Math.max(beamCurrent, Math.abs(zc.currentZ));
    }
    const beamActiveZ = fluidMode === 'z' && beamCurrent > 50;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(pTip.x + nx * halfThickPx, pTip.y + ny * halfThickPx);
    ctx.lineTo(pHnd.x + nx * halfThickPx, pHnd.y + ny * halfThickPx);
    ctx.lineTo(pHnd.x - nx * halfThickPx, pHnd.y - ny * halfThickPx);
    ctx.lineTo(pTip.x - nx * halfThickPx, pTip.y - ny * halfThickPx);
    ctx.closePath();

    ctx.fillStyle = isDark ? 'rgba(38, 36, 33, 0.72)' : 'rgba(236, 230, 218, 0.82)';
    ctx.fill();
    ctx.strokeStyle = beamActiveZ ? pal.cyan : pal.bodyStroke;
    ctx.lineWidth = 1.75;
    ctx.stroke();

    // Crisp pivot bearing pin right at the fulcrum apex
    ctx.fillStyle = pal.ink;
    ctx.beginPath();
    ctx.arc(pPin.x, pPin.y, 4.0, 0, Math.PI * 2);
    ctx.fill();

    // Subtle handle grip cap on right end
    ctx.strokeStyle = pal.inkSoft;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(pHnd.x - dx / len * 10, pHnd.y - dy / len * 10);
    ctx.lineTo(pHnd.x, pHnd.y);
    ctx.stroke();
    ctx.restore();
  }

  function drawHuman(ctx, h, scene, fluidMode, pal) {
    const pFoot = worldToScreen(h.foot.x, h.foot.z);
    const pAnkle = worldToScreen(h.ankle.x, h.ankle.z);
    const pKnee = worldToScreen(h.knee.x, h.knee.z);
    const pHip = worldToScreen(h.hip.x, h.hip.z);
    const pShoulder = worldToScreen(h.shoulder.x, h.shoulder.z);
    const pElbow = worldToScreen(h.elbow.x, h.elbow.z);
    const pHand = worldToScreen(h.hand.x, h.hand.z);
    const pHead = worldToScreen(h.head.x, h.head.z);

    let legCurrent = 0;
    let armCurrent = 0;
    for (const zc of scene.field.zConduits) {
      if (zc.conduitId === 'lever_right_human_push') {
        armCurrent += Math.abs(zc.currentZ);
      } else if (zc.conduitId.includes('human')) {
        legCurrent += Math.abs(zc.currentZ);
        if (h.actionMode !== 'push_down') armCurrent += Math.abs(zc.currentZ);
      }
    }

    const legComp = clamp(legCurrent / Math.max(1, scene.referenceCurrentZ * 0.55), 0, 1);
    const armComp = clamp(armCurrent / Math.max(1, scene.referenceCurrentZ * 0.25), 0, 1);
    const overStrained = h.strain > 0.90;

    const getStroke = (compVal) =>
      overStrained && fluidMode === 'z'
        ? pal.strainRed
        : fluidMode === 'z' && compVal > 0.04
        ? pal.cyan
        : fluidMode === 'energy' && h.strain > 0.14
        ? pal.gold
        : pal.bodyStroke;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const drawLimbTube = (a, b, widthPx, strokeCol) => {
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = strokeCol;
      ctx.globalAlpha = 0.72;
      ctx.lineWidth = widthPx + 2.2;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = pal.bodyFill;
      ctx.globalAlpha = 0.88;
      ctx.lineWidth = Math.max(2, widthPx - 1.2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    };

    const sScale = cam.ppm / 150;
    const legStroke = getStroke(legComp);
    const armStroke = getStroke(armComp);

    drawLimbTube(pAnkle, pKnee, 14.5 * sScale, legStroke);
    drawLimbTube(pKnee, pHip, 17.5 * sScale, legStroke);
    drawLimbTube(pHip, pShoulder, 21.0 * sScale, getStroke(Math.max(legComp, armComp)));
    drawLimbTube(pShoulder, pElbow, 12.0 * sScale, armStroke);
    drawLimbTube(pElbow, pHand, 10.5 * sScale, armStroke);

    if (fluidMode === 'z') {
      const drawCompTicks = (a, b, count, intensity) => {
        if (intensity <= 0.04) return;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const L = Math.max(1, Math.hypot(dx, dy));
        const nx = (-dy / L) * 6.0 * sScale;
        const ny = (dx / L) * 6.0 * sScale;
        ctx.strokeStyle = overStrained ? pal.strainRed : pal.cyan;
        ctx.globalAlpha = clamp(0.24 + intensity * 0.56, 0.22, 0.85);
        ctx.lineWidth = 1.2;
        for (let i = 1; i <= count; i++) {
          const u = i / (count + 1);
          const cx = a.x + dx * u;
          const cy = a.y + dy * u;
          ctx.beginPath();
          ctx.moveTo(cx - nx, cy - ny);
          ctx.lineTo(cx + nx, cy + ny);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      };

      const legTicks = legComp > 0.45 ? 4 : 3;
      drawCompTicks(pAnkle, pKnee, legTicks, legComp);
      drawCompTicks(pKnee, pHip, legTicks, legComp);

      if (h.actionMode === 'push_down') {
        // Class-1 prybar: arms compress as you press body weight down onto the handle!
        drawCompTicks(pShoulder, pElbow, 3, Math.max(armComp, h.strain));
        drawCompTicks(pElbow, pHand, 3, Math.max(armComp, h.strain));
      } else {
        drawCompTicks(pHip, pShoulder, legTicks + 1, Math.max(legComp, h.strain));
      }
    }

    // Shoe base on ground
    ctx.fillStyle = pal.bodyFill;
    ctx.strokeStyle = legStroke;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    const footFront = pFoot.x + h.facing * 16 * sScale;
    const footBack = pFoot.x - h.facing * 9 * sScale;
    ctx.moveTo(footBack, pFoot.y);
    ctx.lineTo(footFront, pFoot.y);
    ctx.lineTo(pAnkle.x + h.facing * 5 * sScale, pAnkle.y);
    ctx.lineTo(footBack, pAnkle.y + 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Head
    ctx.fillStyle = pal.bodyFill;
    ctx.strokeStyle = pal.bodyStroke;
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    ctx.arc(pHead.x, pHead.y, 12.5 * sScale, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  function drawMinimalAnnotations(ctx, scene, fluidMode, pal) {
    ctx.save();
    ctx.font = '500 11.5px Inter, -apple-system, sans-serif';
    ctx.textAlign = 'center';

    if (scene.chapterId === 'car' && scene.car && scene.human) {
      const m = scene.metrics;
      const pctHuman = Math.round((m.humanForceN / m.carWeightN) * 100);
      const pctTires = 100 - pctHuman;

      if (fluidMode === 'z') {
        const pCarBot = worldToScreen(scene.car.x, -0.22);
        ctx.fillStyle = pal.cyan;
        ctx.fillText(`Tires: ${pctTires}%`, pCarBot.x, pCarBot.y);

        if (pctHuman > 0) {
          const pHum = worldToScreen(scene.human.foot.x, -0.22);
          ctx.fillStyle = m.strain > 0.88 ? pal.strainRed : pal.cyan;
          ctx.fillText(
            m.strain > 0.88 ? `You: ${pctHuman}% (Max Limit!)` : `You: ${pctHuman}%`,
            pHum.x,
            pHum.y
          );
        }
      }
    } else if (scene.chapterId === 'lever' && scene.fulcrum && scene.human && scene.car) {
      const m = scene.metrics;
      const pCar = worldToScreen(scene.car.x, -0.20);
      const pFul = worldToScreen(scene.fulcrum.x, scene.fulcrum.groundZ);
      const pHum = worldToScreen(scene.human.foot.x, scene.human.foot.z);

      if (fluidMode === 'z') {
        ctx.fillStyle = m.liftedOff ? pal.inkSoft : pal.cyan;
        ctx.fillText(
          m.liftedOff ? 'Tires: 0% (no contact)' : `Tires: ${(m.tireForceN / 1000).toFixed(1)} kN`,
          pCar.x,
          pCar.y
        );

        if (m.fulcrumForceN > 20) {
          ctx.fillStyle = pal.cyan;
          ctx.fillText(`Fulcrum: ${(m.fulcrumForceN / 1000).toFixed(1)} kN`, pFul.x, pFul.y + 33);
        }

        if (m.humanForceN > 5) {
          ctx.fillStyle = !m.canLiftoff && scene.human.strain > 0.90 ? pal.strainRed : pal.cyan;
          ctx.fillText(
            !m.canLiftoff && scene.human.strain > 0.90
              ? `Push: ${(m.humanForceN / 1000).toFixed(2)} kN (Weight Limit!)`
              : `Down-push: ${(m.humanForceN / 1000).toFixed(2)} kN`,
            pHum.x,
            pHum.y + 22
          );
        }
      } else {
        ctx.fillStyle = pal.inkSoft;
        ctx.fillText('0 W (v = 0 · passive)', pFul.x, pFul.y + 33);
        ctx.fillStyle = pal.gold;
        ctx.fillText('100% Energy Source', pHum.x, pHum.y + 22);
      }
    }
    ctx.restore();
  }

  function render(dt, scene, fluidMode, theme) {
    updateCamera(scene);
    updateParticles(dt, scene, fluidMode);
    renderGL(scene, fluidMode, theme);
    renderOverlay2D(scene, fluidMode, theme);
  }

  resize();

  return {
    resize,
    render,
    worldToScreen,
    screenToWorld,
    cam,
  };
}
