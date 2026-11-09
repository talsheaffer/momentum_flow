// Additive Flow-Field Superposition Model
//
// Separates physical flow contributions (`payload_support`, `payload_inertia`,
// `human_self_weight`, `lever_self_weight`, `muscle_energy`) into independent
// additive `FlowComponent` instances summed linearly by `composeFlowField`.

/**
 * @typedef {Object} GroundContactContribution
 * @property {string} contactId
 * @property {number} x
 * @property {number} z
 * @property {number} width
 * @property {number} forceZ
 */

/**
 * @typedef {Object} ZConduitContribution
 * @property {string} conduitId
 * @property {string} pathId
 * @property {number} currentZ
 * @property {boolean} activeContact
 */

/**
 * @typedef {Object} ZVolumeSinkContribution
 * @property {string} bodyId
 * @property {number} drainRateZ
 * @property {number} densityNorm
 * @property {number} signedDensityRatio
 */

/**
 * @typedef {Object} EnergySourceContribution
 * @property {string} sourceId
 * @property {number} x
 * @property {number} z
 * @property {number} radius
 * @property {number} powerWatts
 */

/**
 * @typedef {Object} EnergyConduitContribution
 * @property {string} conduitId
 * @property {string} pathId
 * @property {number} powerWatts
 * @property {boolean} activeContact
 */

/**
 * @typedef {Object} StoredEnergyContribution
 * @property {string} bodyId
 * @property {number} totalJoules
 * @property {number} referenceMaxJoules
 */

/**
 * @typedef {Object} HeatPlumeContribution
 * @property {string} plumeId
 * @property {number} x
 * @property {number} z
 * @property {number} spreadX
 * @property {number} watts
 */

export function createFlowComponent({
  id,
  label,
  enabled,
  groundContacts = [],
  zConduits = [],
  zVolumeSinks = [],
  energySources = [],
  energyConduits = [],
  storedEnergy = [],
  heatPlumes = [],
}) {
  if (!id || typeof enabled !== 'boolean') {
    throw new Error(`FlowComponent requires explicit id and boolean enabled flag (got id=${id})`);
  }
  return {
    id,
    label,
    enabled,
    groundContacts,
    zConduits,
    zVolumeSinks,
    energySources,
    energyConduits,
    storedEnergy,
    heatPlumes,
  };
}

/**
 * Linearly sums all enabled FlowComponents into a single superposed field snapshot.
 */
export function composeFlowField(components) {
  const active = components.filter((c) => c.enabled);

  const contactMap = new Map();
  const zConduitMap = new Map();
  const zSinkMap = new Map();
  const eSourceMap = new Map();
  const eConduitMap = new Map();
  const storedMap = new Map();
  const plumeMap = new Map();

  for (const comp of active) {
    for (const gc of comp.groundContacts) {
      const prev = contactMap.get(gc.contactId);
      if (prev) {
        prev.forceZ += gc.forceZ;
      } else {
        contactMap.set(gc.contactId, { ...gc });
      }
    }

    for (const zc of comp.zConduits) {
      const prev = zConduitMap.get(zc.conduitId);
      if (prev) {
        prev.currentZ += zc.currentZ;
        prev.activeContact = prev.activeContact || zc.activeContact;
      } else {
        zConduitMap.set(zc.conduitId, { ...zc });
      }
    }

    for (const zs of comp.zVolumeSinks) {
      const prev = zSinkMap.get(zs.bodyId);
      if (prev) {
        const totalDrain = prev.drainRateZ + zs.drainRateZ;
        prev.signedDensityRatio =
          totalDrain > 0
            ? (prev.signedDensityRatio * prev.drainRateZ + zs.signedDensityRatio * zs.drainRateZ) / totalDrain
            : prev.signedDensityRatio + zs.signedDensityRatio;
        prev.drainRateZ = totalDrain;
        prev.densityNorm = Math.max(prev.densityNorm, zs.densityNorm);
      } else {
        zSinkMap.set(zs.bodyId, { ...zs });
      }
    }

    for (const es of comp.energySources) {
      const prev = eSourceMap.get(es.sourceId);
      if (prev) {
        prev.powerWatts += es.powerWatts;
      } else {
        eSourceMap.set(es.sourceId, { ...es });
      }
    }

    for (const ec of comp.energyConduits) {
      const prev = eConduitMap.get(ec.conduitId);
      if (prev) {
        prev.powerWatts += ec.powerWatts;
        prev.activeContact = prev.activeContact || ec.activeContact;
      } else {
        eConduitMap.set(ec.conduitId, { ...ec });
      }
    }

    for (const se of comp.storedEnergy) {
      const prev = storedMap.get(se.bodyId);
      if (prev) {
        prev.totalJoules += se.totalJoules;
        prev.referenceMaxJoules = Math.max(prev.referenceMaxJoules, se.referenceMaxJoules);
      } else {
        storedMap.set(se.bodyId, { ...se });
      }
    }

    for (const hp of comp.heatPlumes) {
      const prev = plumeMap.get(hp.plumeId);
      if (prev) {
        prev.watts += hp.watts;
      } else {
        plumeMap.set(hp.plumeId, { ...hp });
      }
    }
  }

  return {
    activeComponentIds: active.map((c) => c.id),
    groundContacts: Array.from(contactMap.values()),
    zConduits: Array.from(zConduitMap.values()),
    zVolumeSinks: Array.from(zSinkMap.values()),
    energySources: Array.from(eSourceMap.values()),
    energyConduits: Array.from(eConduitMap.values()),
    storedEnergy: Array.from(storedMap.values()),
    heatPlumes: Array.from(plumeMap.values()),
  };
}
