# Momentum Flow — Pending & Future Work (`TODO.md`)

Items intentionally deferred from v1 to keep the initial experience focused, pedagogical, and visually minimal:

## 1. Physics & Field Modes
- [ ] **`→ X-Momentum Fluid` Mode**: Add a third toggle segment (`→ x-momentum`) alongside `↑ z-momentum` and `⚡ energy`:
  - Visualize opposing horizontal compression/tension currents in the top and bottom fibers of the bent Class-1 lever beam.
  - Add horizontal scenarios (e.g., pushing a car horizontally against friction, tug-of-war, cantilever beam) where `x-momentum` is the primary story.
- [ ] **Closing the Gravitational Momentum Loop to Earth**:
  - Currently, gravitational `mg` drain is shown as uniform density-proportional volumetric dissipation inside massive objects.
  - Explore an optional view showing gravitational field tension lines carrying that drained `+z` momentum downward through space back into the Earth reservoir (closing global conservation `Earth → Support → Object → Gravity Field → Earth`).
- [ ] **Class-2 Lever Comparison**:
  - Chapter IV currently uses a **Class-1 Lever** (fulcrum in middle, human pushes *down*, fulcrum channels `I_car + I_human` funneled through its apex while the human's arms compress and feet decompress).
  - Add an optional toggle in Chapter IV to compare against a **Class-2 Lever** (fulcrum at far end, car in middle, human pulls *up* in parallel with the fulcrum so `I_car = I_fulcrum + I_human`).

## 2. Circuit Analogy Refinements
- [ ] **Autotransformer / Velocity–Voltage Coupling**:
  - Extend the high-level Series vs. Parallel circuit overlay into an optional "Detailed Mobility Circuit" view (`Current I = Force F`, `Voltage V = Velocity v`, `Capacitance C = Mass m`):
  - Explicitly draw the rigid lever as an **ideal autotransformer / DC–DC converter** (turns ratio `N : 1`) to illustrate *why* a grounded fulcrum (`V = v = 0`) can supply ~90% of the current in parallel without pinning the car's velocity (`V_car`) to zero, and why the human must move `N×` faster (`|V_human| = N * |V_car|`).

## 3. Additive Flow-Field Component Toggles in UI
- [ ] **Interactive Superposition Layer Switcher**:
  - The physics engine (`js/components.js` & `js/scenarios.js`) computes flows as separate additive `FlowComponent` objects (`payload_support`, `payload_inertia`, `human_weight_balance`, `human_self_weight`, etc.).
  - Design a minimal, non-intrusive "Superposition Components" drawer allowing curious users to toggle individual additive components on/off or inspect each component in isolation.
