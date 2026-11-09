// Main Application Bootstrap, Minimalist HUD Controller & Direct Canvas Manipulation

import { DEFAULT_CONFIG } from './config.js';
import { clamp } from './geometry.js';
import { CHAPTERS, createScenarioEngine } from './scenarios.js';
import { createRenderer } from './renderer.js';
import { renderCircuitDiagram } from './circuit.js';

const glCanvas = document.getElementById('glCanvas');
const overlayCanvas = document.getElementById('overlayCanvas');
const webglFailEl = document.getElementById('webglFail');

const fluidSeg = document.getElementById('fluidSeg');
const axisBadge = document.getElementById('axisBadge');
const axisIcon = document.getElementById('axisIcon');
const axisTitle = document.getElementById('axisTitle');
const axisSub = document.getElementById('axisSub');
const scaleLeftLabel = document.getElementById('scaleLeftLabel');
const scaleRightLabel = document.getElementById('scaleRightLabel');

const captionEl = document.getElementById('caption');
const controlsBar = document.getElementById('controlsBar');

const pickBtn = document.getElementById('pickBtn');
const pickerPanel = document.getElementById('pickerPanel');
const chapterList = document.getElementById('chapterList');
const closePickerBtn = document.getElementById('closePickerBtn');

const menuBtn = document.getElementById('menuBtn');
const optionsPanel = document.getElementById('optionsPanel');
const closeOptionsBtn = document.getElementById('closeOptionsBtn');
const themeToggleBtn = document.getElementById('themeToggleBtn');

const circuitPanel = document.getElementById('circuitPanel');
const circuitCanvas = document.getElementById('circuitCanvas');
const closeCircuitBtn = document.getElementById('closeCircuitBtn');

const engine = createScenarioEngine(DEFAULT_CONFIG);
let renderer;
try {
  renderer = createRenderer(glCanvas, overlayCanvas, DEFAULT_CONFIG);
} catch (err) {
  if (webglFailEl) {
    webglFailEl.hidden = false;
    webglFailEl.textContent = `Renderer initialization failed: ${err instanceof Error ? err.message : String(err)}`;
  }
  throw err;
}

let fluidMode = 'z'; // 'z' | 'energy'
let theme = localStorage.getItem('mf_theme') === 'light' ? 'light' : 'dark';
let showCircuit = false;

function applyTheme(nextTheme) {
  theme = nextTheme === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('mf_theme', theme);
  if (themeToggleBtn) {
    themeToggleBtn.textContent = theme === 'dark' ? 'Switch to Light Paper' : 'Switch to Dark Ink';
  }
}
applyTheme(theme);

function renderChapterPicker() {
  chapterList.innerHTML = '';
  for (const ch of CHAPTERS) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('aria-current', ch.id === engine.state.chapterId ? 'true' : 'false');
    btn.innerHTML = `
      <span class="chap-num">${ch.num}</span>
      <span>
        <span class="chap-title">${ch.title}</span>
        <span class="chap-sub">${ch.subtitle}</span>
      </span>
    `;
    btn.addEventListener('click', () => {
      selectChapter(ch.id, true);
      pickerPanel.hidden = true;
      pickBtn.setAttribute('aria-expanded', 'false');
    });
    li.appendChild(btn);
    chapterList.appendChild(li);
  }
}

function setFluidMode(mode) {
  fluidMode = mode === 'energy' ? 'energy' : 'z';
  fluidSeg.setAttribute('data-mode', fluidMode);
  axisBadge.setAttribute('data-mode', fluidMode);

  for (const btn of fluidSeg.querySelectorAll('button[data-fluid]')) {
    const on = btn.getAttribute('data-fluid') === fluidMode;
    btn.setAttribute('aria-checked', on ? 'true' : 'false');
  }

  if (fluidMode === 'z') {
    axisIcon.innerHTML = `<path d="M12 19V5M6 11l6-6 6 6"/>`;
    axisTitle.textContent = '+z Momentum Fluid';
    axisSub.textContent = 'Upward charge · fast compression flow';
    if (scaleLeftLabel) scaleLeftLabel.textContent = '−z glow';
    if (scaleRightLabel) scaleRightLabel.textContent = '+z glow';
  } else {
    axisIcon.innerHTML = `<path d="M13 3L5 14h6l-1 7 8-11h-6l1-7z"/>`;
    axisTitle.textContent = 'Energy & Heat';
    axisSub.textContent = 'Work flow (gold) · thermal loss (crimson)';
    if (scaleLeftLabel) scaleLeftLabel.textContent = '0 J';
    if (scaleRightLabel) scaleRightLabel.textContent = 'Stored E glow';
  }
}

fluidSeg.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-fluid]');
  if (btn) setFluidMode(btn.getAttribute('data-fluid'));
});

function rebuildControlsBar() {
  const chId = engine.state.chapterId;
  const idx = CHAPTERS.findIndex((c) => c.id === chId);
  controlsBar.innerHTML = '';

  const addPrevNext = () => {
    const sep = document.createElement('span');
    sep.className = 'pill-sep';
    controlsBar.appendChild(sep);

    if (idx > 0) {
      const prev = document.createElement('button');
      prev.className = 'pill-btn';
      prev.title = `Previous: ${CHAPTERS[idx - 1].title}`;
      prev.textContent = '‹';
      prev.addEventListener('click', () => selectChapter(CHAPTERS[idx - 1].id, true));
      controlsBar.appendChild(prev);
    }
    if (idx < CHAPTERS.length - 1) {
      const next = document.createElement('button');
      next.className = 'pill-btn';
      next.title = `Next: ${CHAPTERS[idx + 1].title}`;
      next.textContent = idx === 0 ? 'Next Chapter ›' : '›';
      next.addEventListener('click', () => selectChapter(CHAPTERS[idx + 1].id, true));
      controlsBar.appendChild(next);
    }
  };

  if (chId === 'gravity') {
    const dropBtn = document.createElement('button');
    dropBtn.className = 'pill-btn active';
    dropBtn.textContent = 'Drop from Air';
    dropBtn.addEventListener('click', () => engine.dropBlockFromAir());
    controlsBar.appendChild(dropBtn);

    const sep = document.createElement('span');
    sep.className = 'pill-sep';
    controlsBar.appendChild(sep);

    const materials = engine.config.gravityChapter.materials;
    for (const key of Object.keys(materials)) {
      const mat = materials[key];
      const b = document.createElement('button');
      b.className = 'pill-btn';
      b.dataset.mat = key;
      b.setAttribute('aria-pressed', engine.state.ch1.materialKey === key ? 'true' : 'false');
      b.textContent = mat.label;
      b.addEventListener('click', () => {
        engine.setMaterial(key);
        for (const el of controlsBar.querySelectorAll('button[data-mat]')) {
          el.setAttribute('aria-pressed', el.dataset.mat === key ? 'true' : 'false');
        }
      });
      controlsBar.appendChild(b);
    }
    addPrevNext();
  } else if (chId === 'lift') {
    for (const [cmd, label] of [
      ['lift', 'Lift ↑'],
      ['hold', 'Hold'],
      ['lower', 'Lower ↓'],
    ]) {
      const b = document.createElement('button');
      b.className = 'pill-btn';
      b.dataset.phaseCmd = cmd;
      b.textContent = label;
      b.addEventListener('click', () => engine.setLiftCommand(cmd));
      controlsBar.appendChild(b);
    }
    addPrevNext();
  } else if (chId === 'car') {
    const wrap = document.createElement('label');
    wrap.className = 'slider-wrap';
    wrap.innerHTML = `
      <span>Pull Effort</span>
      <input id="effortSlider" type="range" min="0" max="100" value="${Math.round(engine.state.ch3.effort * 100)}" />
      <span id="effortVal" class="slider-val">${Math.round(engine.state.ch3.effort * 100)}%</span>
    `;
    const slider = wrap.querySelector('#effortSlider');
    const valEl = wrap.querySelector('#effortVal');
    slider.addEventListener('input', () => {
      const v = Number(slider.value) / 100;
      engine.state.ch3.effort = v;
      valEl.textContent = `${Math.round(v * 100)}%`;
    });
    controlsBar.appendChild(wrap);

    const sep = document.createElement('span');
    sep.className = 'pill-sep';
    controlsBar.appendChild(sep);

    const circBtn = document.createElement('button');
    circBtn.className = 'pill-btn';
    circBtn.id = 'circuitToggleBtn';
    circBtn.setAttribute('aria-pressed', showCircuit ? 'true' : 'false');
    circBtn.textContent = 'Circuit Analogy';
    circBtn.addEventListener('click', () => toggleCircuitPanel());
    controlsBar.appendChild(circBtn);

    addPrevNext();
  } else if (chId === 'lever') {
    for (const [cmd, label] of [
      ['lift', 'Lift ↑'],
      ['hold', 'Hold'],
      ['lower', 'Lower ↓'],
    ]) {
      const b = document.createElement('button');
      b.className = 'pill-btn';
      b.dataset.phaseCmd = cmd;
      b.textContent = label;
      b.addEventListener('click', () => engine.setLiftCommand(cmd));
      controlsBar.appendChild(b);
    }

    const sep1 = document.createElement('span');
    sep1.className = 'pill-sep';
    controlsBar.appendChild(sep1);

    const wrap = document.createElement('label');
    wrap.className = 'slider-wrap';
    wrap.innerHTML = `
      <span>Leverage</span>
      <input id="ratioSlider" type="range" min="40" max="130" value="${Math.round(engine.state.ch4.ratio * 10)}" />
      <span id="ratioVal" class="slider-val">${engine.state.ch4.ratio.toFixed(1)}×</span>
    `;
    const slider = wrap.querySelector('#ratioSlider');
    const valEl = wrap.querySelector('#ratioVal');
    slider.addEventListener('input', () => {
      const r = Number(slider.value) / 10;
      engine.setLeverRatio(r);
      valEl.textContent = `${engine.state.ch4.ratio.toFixed(1)}×`;
    });
    controlsBar.appendChild(wrap);

    const circBtn = document.createElement('button');
    circBtn.className = 'pill-btn';
    circBtn.id = 'circuitToggleBtn';
    circBtn.setAttribute('aria-pressed', showCircuit ? 'true' : 'false');
    circBtn.textContent = 'Circuit';
    circBtn.addEventListener('click', () => toggleCircuitPanel());
    controlsBar.appendChild(circBtn);

    addPrevNext();
  }
}

function toggleCircuitPanel(forceValue) {
  showCircuit = typeof forceValue === 'boolean' ? forceValue : !showCircuit;
  const hasCircuit = engine.state.chapterId === 'car' || engine.state.chapterId === 'lever';
  circuitPanel.hidden = !(showCircuit && hasCircuit);
  const btn = document.getElementById('circuitToggleBtn');
  if (btn) btn.setAttribute('aria-pressed', showCircuit ? 'true' : 'false');
}

function selectChapter(id, updateHash = true) {
  const targetId = CHAPTERS.some((c) => c.id === id) ? id : 'gravity';
  engine.setChapter(targetId);
  if (updateHash && location.hash !== `#${targetId}`) {
    history.replaceState(null, '', `#${targetId}`);
  }
  const hasCircuit = targetId === 'car' || targetId === 'lever';
  circuitPanel.hidden = !(showCircuit && hasCircuit);
  renderChapterPicker();
  rebuildControlsBar();
}

// Corner Popovers
pickBtn.addEventListener('click', () => {
  const open = pickerPanel.hidden;
  pickerPanel.hidden = !open;
  optionsPanel.hidden = true;
  pickBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
});
closePickerBtn.addEventListener('click', () => {
  pickerPanel.hidden = true;
  pickBtn.setAttribute('aria-expanded', 'false');
});

menuBtn.addEventListener('click', () => {
  const open = optionsPanel.hidden;
  optionsPanel.hidden = !open;
  pickerPanel.hidden = true;
  menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
});
closeOptionsBtn.addEventListener('click', () => {
  optionsPanel.hidden = true;
  menuBtn.setAttribute('aria-expanded', 'false');
});
closeCircuitBtn.addEventListener('click', () => toggleCircuitPanel(false));

themeToggleBtn.addEventListener('click', () => {
  applyTheme(theme === 'dark' ? 'light' : 'dark');
});

overlayCanvas.addEventListener('pointerdown', () => {
  if (!pickerPanel.hidden) pickerPanel.hidden = true;
  if (!optionsPanel.hidden) optionsPanel.hidden = true;
});

// -----------------------------------------------------------------------------
// Direct Canvas Manipulation (Drag objects, Class-1 lever handle, car, or fulcrum!)
// -----------------------------------------------------------------------------
let activeDrag = null; // 'block' | 'lift_box' | 'car_effort' | 'lever_handle' | 'lever_car' | 'fulcrum'
let dragStartPointerZ = 0;
let dragStartPushDown = 0;

overlayCanvas.addEventListener('pointerdown', (e) => {
  const rect = overlayCanvas.getBoundingClientRect();
  const px = e.clientX - rect.left;
  const py = e.clientY - rect.top;
  const w = renderer.screenToWorld(px, py);
  const ch = engine.state.chapterId;

  if (ch === 'gravity') {
    const gCfg = engine.config.gravityChapter;
    const b = engine.state.ch1;
    if (
      Math.abs(w.x) < gCfg.blockWidthM * 0.72 &&
      w.z > -0.15 &&
      w.z < b.z + gCfg.blockHeightM + 0.45
    ) {
      activeDrag = 'block';
      b.dragging = true;
      b.dragTargetZ = clamp(w.z - gCfg.blockHeightM * 0.5, 0.04, gCfg.maxDragHeightM);
      overlayCanvas.setPointerCapture(e.pointerId);
    }
  } else if (ch === 'lift') {
    const lCfg = engine.config.liftChapter;
    if (w.z > 0.25 && Math.abs(w.x - 0.1) < 1.1) {
      activeDrag = 'lift_box';
      engine.state.ch2.mode = 'drag';
      engine.state.ch2.targetZ = clamp(
        w.z - lCfg.boxHeightM * 0.5,
        lCfg.minLiftZM,
        lCfg.maxLiftZM
      );
      overlayCanvas.setPointerCapture(e.pointerId);
    }
  } else if (ch === 'car') {
    if (w.z > -0.1 && Math.abs(w.x - 0.25) < 1.6) {
      activeDrag = 'car_effort';
      updateCarEffortFromPointer(w.z);
      overlayCanvas.setPointerCapture(e.pointerId);
    }
  } else if (ch === 'lever') {
    const s = engine.state.ch4;
    if (Math.hypot(w.x - s.fulcrumX, w.z - 0.18) < 0.44) {
      activeDrag = 'fulcrum';
      engine.setFulcrumX(w.x);
      syncRatioSlider();
      overlayCanvas.setPointerCapture(e.pointerId);
    } else if (w.x > s.fulcrumX + 0.22 && w.z > -0.15 && w.z < 1.95) {
      activeDrag = 'lever_handle';
      s.mode = 'drag';
      dragStartPointerZ = w.z;
      dragStartPushDown = s.handlePushDown;
      overlayCanvas.setPointerCapture(e.pointerId);
    } else if (w.x < s.fulcrumX - 0.15 && w.z > -0.05 && w.z < 1.35) {
      activeDrag = 'lever_car';
      s.mode = 'drag';
      dragStartPointerZ = w.z;
      dragStartPushDown = s.handlePushDown;
      overlayCanvas.setPointerCapture(e.pointerId);
    }
  }

  if (activeDrag) {
    overlayCanvas.style.cursor = 'grabbing';
  }
});

overlayCanvas.addEventListener('pointermove', (e) => {
  const rect = overlayCanvas.getBoundingClientRect();
  const px = e.clientX - rect.left;
  const py = e.clientY - rect.top;
  const w = renderer.screenToWorld(px, py);

  if (!activeDrag) {
    let hover = false;
    const ch = engine.state.chapterId;
    if (ch === 'gravity') {
      const gCfg = engine.config.gravityChapter;
      hover =
        Math.abs(w.x) < gCfg.blockWidthM * 0.72 &&
        w.z > -0.08 &&
        w.z < engine.state.ch1.z + gCfg.blockHeightM + 0.2;
    } else if (ch === 'lift') {
      hover = w.z > 0.35 && Math.abs(w.x - 0.15) < 0.9;
    } else if (ch === 'car') {
      hover = w.z > 0.0 && Math.abs(w.x - 0.3) < 1.3;
    } else if (ch === 'lever') {
      const s = engine.state.ch4;
      hover =
        Math.hypot(w.x - s.fulcrumX, w.z - 0.18) < 0.44 ||
        (w.x > s.fulcrumX + 0.22 && w.z > 0.0 && w.z < 1.9) ||
        (w.x < s.fulcrumX - 0.15 && w.z > 0.0 && w.z < 1.25);
    }
    overlayCanvas.style.cursor = hover ? 'grab' : 'default';
    return;
  }

  if (activeDrag === 'block') {
    const gCfg = engine.config.gravityChapter;
    engine.state.ch1.dragTargetZ = clamp(
      w.z - gCfg.blockHeightM * 0.5,
      0.04,
      gCfg.maxDragHeightM
    );
  } else if (activeDrag === 'lift_box') {
    const lCfg = engine.config.liftChapter;
    engine.state.ch2.targetZ = clamp(
      w.z - lCfg.boxHeightM * 0.5,
      lCfg.minLiftZM,
      lCfg.maxLiftZM
    );
  } else if (activeDrag === 'car_effort') {
    updateCarEffortFromPointer(w.z);
  } else if (activeDrag === 'fulcrum') {
    engine.setFulcrumX(w.x);
    syncRatioSlider();
  } else if (activeDrag === 'lever_handle') {
    const lvCfg = engine.config.leverChapter;
    const dz = w.z - dragStartPointerZ; // dragging DOWN (dz < 0) pushes handle down!
    engine.state.ch4.targetHandlePushDown = clamp(
      dragStartPushDown - dz,
      lvCfg.handleMinPushDownM,
      lvCfg.handleMaxPushDownM
    );
  } else if (activeDrag === 'lever_car') {
    const lvCfg = engine.config.leverChapter;
    const dz = w.z - dragStartPointerZ; // dragging car UP (dz > 0) pivots handle down!
    engine.state.ch4.targetHandlePushDown = clamp(
      dragStartPushDown + dz * engine.state.ch4.ratio,
      lvCfg.handleMinPushDownM,
      lvCfg.handleMaxPushDownM
    );
  }
});

function endDrag() {
  if (!activeDrag) return;
  if (activeDrag === 'block') {
    engine.state.ch1.dragging = false;
  } else if (activeDrag === 'lift_box') {
    engine.state.ch2.mode = 'hold';
  } else if (activeDrag === 'lever_handle' || activeDrag === 'lever_car') {
    engine.state.ch4.mode = 'hold';
  }
  activeDrag = null;
  overlayCanvas.style.cursor = 'default';
}

overlayCanvas.addEventListener('pointerup', endDrag);
overlayCanvas.addEventListener('pointercancel', endDrag);

function updateCarEffortFromPointer(wz) {
  const eff = clamp((wz - 0.35) / 0.85, 0, 1);
  engine.state.ch3.effort = eff;
  const slider = document.getElementById('effortSlider');
  const valEl = document.getElementById('effortVal');
  if (slider) slider.value = String(Math.round(eff * 100));
  if (valEl) valEl.textContent = `${Math.round(eff * 100)}%`;
}

function syncRatioSlider() {
  const r = engine.state.ch4.ratio;
  const slider = document.getElementById('ratioSlider');
  const valEl = document.getElementById('ratioVal');
  if (slider) slider.value = String(Math.round(r * 10));
  if (valEl) valEl.textContent = `${r.toFixed(1)}×`;
}

// Keyboard Shortcuts
window.addEventListener('keydown', (e) => {
  if (e.target && ['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
  if (e.key === 'Tab' || e.key.toLowerCase() === 'f') {
    e.preventDefault();
    setFluidMode(fluidMode === 'z' ? 'energy' : 'z');
  } else if (e.key >= '1' && e.key <= '4') {
    selectChapter(CHAPTERS[Number(e.key) - 1].id, true);
  }
});

window.addEventListener('hashchange', () => {
  const hashId = location.hash.replace(/^#/, '').trim();
  if (hashId && CHAPTERS.some((c) => c.id === hashId)) {
    selectChapter(hashId, false);
  }
});

window.addEventListener('resize', () => renderer.resize());

// Initialize Chapter from URL hash & support optional URL query overrides for visual verification (`?fluid=energy`, `?drop=1`)
const urlParams = new URLSearchParams(location.search);
const initialHash = location.hash.replace(/^#/, '').trim();
selectChapter(CHAPTERS.some((c) => c.id === initialHash) ? initialHash : 'gravity', false);

if (urlParams.get('fluid') === 'energy') {
  setFluidMode('energy');
} else {
  setFluidMode('z');
}
if (urlParams.get('drop') === '1' && engine.state.chapterId === 'gravity') {
  engine.dropBlockFromAir();
}
if (urlParams.get('phase') && ['lift', 'hold', 'lower'].includes(urlParams.get('phase'))) {
  engine.setLiftCommand(urlParams.get('phase'));
}
if (urlParams.get('circuit') === '1') {
  toggleCircuitPanel(true);
}

// Main Animation Loop
let prevTime = performance.now();

function frame(now) {
  const dt = Math.min(0.05, Math.max(0.001, (now - prevTime) / 1000));
  prevTime = now;

  const scene = engine.step(dt);
  renderer.render(dt, scene, fluidMode, theme);

  const targetCaption = fluidMode === 'energy' ? scene.captions.energy : scene.captions.z;
  if (captionEl.textContent !== targetCaption) {
    captionEl.textContent = targetCaption;
  }

  if (scene.metrics && scene.metrics.phase) {
    for (const btn of controlsBar.querySelectorAll('button[data-phase-cmd]')) {
      btn.setAttribute('aria-pressed', btn.dataset.phaseCmd === scene.metrics.phase ? 'true' : 'false');
    }
  }

  if (!circuitPanel.hidden && scene.circuit) {
    renderCircuitDiagram(circuitCanvas, scene.circuit, fluidMode, theme, engine.state.time);
  }

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
