# Momentum & Energy Flow (`momentum_flow`)

An interactive web visualizer for mechanics built around the **continuum substance / fluid analogy**:
- **Force ($\vec{F}$) as Momentum Current ($I_p$)** — treating momentum in a given axis (here $+z$ upward) as mobile positive charge carriers propagating rapidly through compressed solids, with signed $z$-momentum density rendered as a smooth interior glow (**cyan** for $+z$ surplus, neutral at $0$, **yellow** for $-z$ deficit).
- **Work / Power ($P = \vec{F}\cdot\vec{v}$) as Energy Current ($I_E$)** — distinguishing passive momentum channeling (zero energy cost) from active muscular work, stationary golden stored-energy glow, and thermal dissipation.

---

## Chapters & Concepts Illustrated

1. **I. Falling & Resting (`#gravity`)**
   - Vertical $+z$ momentum continuously leaks/dissipates out of every object uniformly across its volume in proportion to mass density ($\rho g$).
   - In free fall, unreplenished drain drives the object below neutral ($p_z < 0$), glowing **yellow** as downward speed grows; dragging upward glows **cyan** ($p_z > 0$).
   - Resting on a flat surface compresses the Earth across the **entire contact width**, establishing a wide upward $+z$ momentum sheet while consuming **zero** energy.
2. **II. Lifting & Lowering (`#lift`)**
   - Whether lifting, holding steady, or lowering, upward $+z$ momentum is always supplied from the **ground** and channeled rapidly through the **compressed** human body.
   - Muscles supply the **energy**: during lifting, chemical energy splits into a stationary golden potential-energy glow ($mgh$) in the object plus metabolic heat; during holding ($v=0$), zero energy reaches the object while muscles still shed heat; during lowering, **all** returning potential energy dissipates in the muscles as heat.
3. **III. The Unliftable Car (`#car`)**
   - Pulling upward on a heavy car slightly decompresses its tires/ground, shifting a fraction of the $Mg$ momentum stream onto the human.
   - Full liftoff would open the tire branch completely, putting the human **in series** with 100% of the car's $Mg$ current—exceeding biological strength/compression limits.
4. **IV. The Class-1 Lever (`#lever`)**
   - Fulcrum in the middle, car on the left, human pressing *down* on the right:
   - The fulcrum's wide ground base **funnels** a massive upward $+z$ momentum current ($I_{\text{fulcrum}} = I_{\text{car}} + I_{\text{human}}$) into a single pivot point at **zero energy cost** ($v = 0 \implies 0\text{ W}$), while the human's downward push supplies **100% of the mechanical energy** streaming past the passive fulcrum into the rising car.

---

## Architecture

- **Zero-Build Static ES Modules + WebGL 2**: Runs directly on GitHub Pages (`talsheaffer.github.io`) with a hybrid `WebGL 2` 5-node strip-Flamant & signed-glow shader + instanced fluid particle engine layered over a crisp high-DPI `Canvas 2D` scene.
- **Canonical Serializable Configuration (`js/config.js`)**: Hierarchical `AppConfig` (`PhysicsConfig`, `HumanBodyConfig`, chapter configs, `VisualConfig`) with lossless `toDict`/`fromDict`/`toJSON`/`fromJSON` round-tripping and zero scattered magic numbers.
- **Upstream Kinematics & True-Contact Mechanics (`js/geometry.js`)**: Analytical 2-bone IK (`pull_up` & `push_down`), strict true-contact wheel/ground solver (`evaluateWheelGroundContact`), and 5-point Gauss–Legendre strip-load Flamant elasticity.
- **Additive Flow-Field Superposition (`js/components.js`)**: Independent `FlowComponent` contributions summed linearly by `composeFlowField()`.
- See [TODO.md](./TODO.md) for planned extensions (`x-momentum` mode, autotransformer circuit detail, gravitational Earth-return loop, Class-2 lever comparison, and UI component toggles).

---

## Local Development

```bash
python3 -m http.server 8765
# Open http://localhost:8765
```
