// ============================================================================
// STAT SYSTEM - Define arbitrary properties that scale with volume
// ============================================================================

class Stat {
  constructor(name, description = '') {
    this.id = generateId('stat');
    this.name = name;
    this.description = description;
  }
}

// ============================================================================
// SUBSTANCE SYSTEM - Materials with density and stats
// ============================================================================

class Substance {
  constructor(name, densityGramsPerCm3, description = '') {
    this.id = generateId('substance');
    this.name = name;
    this.densityGramsPerCm3 = densityGramsPerCm3;
    this.description = description;
    this.statsPerCm3 = {};
  }

  addStat(stat, valuePerCm3) {
    this.statsPerCm3[stat.id] = valuePerCm3;
    return this;
  }

  getMassGrams(volumeCm3) {
    return volumeCm3 * this.densityGramsPerCm3;
  }
}

// ============================================================================
// MATERIAL SYSTEM - Batches of substances with junk
// ============================================================================

class Material {
  constructor(name = 'Material') {
    this.id = generateId('material');
    this.name = name;
    this.substances = {}; // substanceId => volumeCm3
    this.junk = {}; // substanceId => volumeCm3
  }

  addSubstance(substance, volumeCm3) {
    const key = substance.id;
    this.substances[key] = (this.substances[key] || 0) + volumeCm3;
    const pureName = getPureMaterialNameFromComposition(this);
    if (pureName) this.name = pureName;
    persistState();
    return this;
  }

  addJunk(substance, volumeCm3) {
    const key = substance.id;
    this.junk[key] = (this.junk[key] || 0) + volumeCm3;
    persistState();
    return this;
  }

  getUsableVolumeCm3() {
    return Object.values(this.substances).reduce((total, volume) => total + volume, 0);
  }

  getTotalVolumeCm3() {
    return this.getUsableVolumeCm3() + this.getJunkVolumeCm3();
  }

  getJunkVolumeCm3() {
    return Object.values(this.junk).reduce((a, b) => a + b, 0);
  }

  getTotalMassGrams(substanceMap) {
    let totalMass = 0;
    const allEntries = { ...this.substances, ...this.junk };
    Object.entries(allEntries).forEach(([substanceId, volumeCm3]) => {
      const substance = substanceMap[substanceId];
      if (substance) {
        totalMass += substance.getMassGrams(volumeCm3);
      }
    });
    return totalMass;
  }

  getCompositionEntries(substanceMap) {
    const entries = [];
    const seen = new Set();
    Object.entries(this.substances).forEach(([substanceId, volumeCm3]) => {
      const substance = substanceMap[substanceId];
      if (!substance) return;
      entries.push({ substanceId, substanceName: substance.name, volumeCm3, isJunk: false });
      seen.add(substanceId);
    });
    Object.entries(this.junk).forEach(([substanceId, volumeCm3]) => {
      const substance = substanceMap[substanceId];
      if (!substance) return;
      entries.push({ substanceId, substanceName: substance.name, volumeCm3, isJunk: true });
      seen.add(substanceId);
    });
    return entries.filter((entry) => !seen.has(entry.substanceId) || true);
  }

  resizeTo(totalVolumeCm3) {
    const currentVolume = this.getTotalVolumeCm3();
    if (!currentVolume || totalVolumeCm3 <= 0) return this;

    const scale = totalVolumeCm3 / currentVolume;
    Object.keys(this.substances).forEach((substanceId) => {
      this.substances[substanceId] = (this.substances[substanceId] || 0) * scale;
    });
    Object.keys(this.junk).forEach((substanceId) => {
      this.junk[substanceId] = (this.junk[substanceId] || 0) * scale;
    });
    const pureName = getPureMaterialNameFromComposition(this);
    if (pureName) this.name = pureName;
    persistState();
    return this;
  }

  setSubstanceVolume(substanceId, volumeCm3, isJunk = false) {
    const safeVolume = Math.max(0, Number(volumeCm3) || 0);
    const target = isJunk ? this.junk : this.substances;
    if (safeVolume <= 0) {
      delete target[substanceId];
      const pureName = getPureMaterialNameFromComposition(this);
      if (pureName) this.name = pureName;
      persistState();
      return this;
    }

    target[substanceId] = safeVolume;
    if (!isJunk && this.junk[substanceId]) {
      delete this.junk[substanceId];
    }
    if (isJunk && this.substances[substanceId]) {
      delete this.substances[substanceId];
    }
    const pureName = getPureMaterialNameFromComposition(this);
    if (pureName) this.name = pureName;
    persistState();
    return this;
  }

  merge(otherMaterial) {
    if (!otherMaterial) return this;
    Object.entries(otherMaterial.substances || {}).forEach(([substanceId, volumeCm3]) => {
      const substance = state.substances[substanceId];
      if (substance) this.addSubstance(substance, volumeCm3);
    });
    Object.entries(otherMaterial.junk || {}).forEach(([substanceId, volumeCm3]) => {
      const substance = state.substances[substanceId];
      if (substance) this.addJunk(substance, volumeCm3);
    });
    persistState();
    return this;
  }

  consumeVolume(substanceId, volumeCm3) {
    if (!this.substances[substanceId]) return 0;
    const consumed = Math.min(volumeCm3, this.substances[substanceId]);
    this.substances[substanceId] -= consumed;
    if (this.substances[substanceId] <= 0) delete this.substances[substanceId];
    persistState();
    return consumed;
  }

  consumeTemplate(template, substanceMap) {
    const required = template.volumeCm3;
    const usableVolume = this.getUsableVolumeCm3();
    if (required <= 0 || required > usableVolume) return null;

    const ratio = required / usableVolume;
    const consumedMaterial = new Material(`${this.name} → ${template.name}`);

    Object.entries(this.substances).forEach(([substanceId, volumeCm3]) => {
      const substance = substanceMap[substanceId];
      if (!substance) return;
      const taken = volumeCm3 * ratio;
      if (taken > 0) {
        this.consumeVolume(substanceId, taken);
        consumedMaterial.addSubstance(substance, taken);
      }
    });

    persistState();
    return consumedMaterial;
  }

  separateJunk(substanceId, volumeCm3 = null) {
    if (!this.junk[substanceId]) return null;
    const removed = volumeCm3 ? Math.min(volumeCm3, this.junk[substanceId]) : this.junk[substanceId];
    this.junk[substanceId] -= removed;
    if (this.junk[substanceId] <= 0) delete this.junk[substanceId];

    const substance = state.substances[substanceId];
    if (!substance) return null;

    const separated = new Material(`${this.name} - ${substance.name}`);
    separated.addSubstance(substance, removed);
    state.materials[separated.id] = separated;
    return separated;
  }

  separateSelected(substanceIds, substanceMap, percent = 100) {
    const separated = new Material(`${this.name} separated`);
    const pct = Math.min(100, Math.max(0, percent)) / 100;

    substanceIds.forEach((substanceId) => {
      const substance = substanceMap[substanceId];
      if (!substance) return;

      const removableSources = [
        { bucket: 'substances', volume: this.substances[substanceId] || 0 },
        { bucket: 'junk', volume: this.junk[substanceId] || 0 },
      ];

      removableSources.forEach(({ bucket, volume }) => {
        if (!volume) return;
        const removedVolume = volume * pct;
        if (removedVolume <= 0) return;

        separated.addSubstance(substance, removedVolume);

        if (bucket === 'substances') {
          this.substances[substanceId] = Math.max(0, volume - removedVolume);
          if (this.substances[substanceId] <= 0) delete this.substances[substanceId];
        } else {
          this.junk[substanceId] = Math.max(0, volume - removedVolume);
          if (this.junk[substanceId] <= 0) delete this.junk[substanceId];
        }
      });
    });

    if (separated.getUsableVolumeCm3() > 0) {
      state.materials[separated.id] = separated;
      persistState();
      return separated;
    }

    persistState();
    return null;
  }

  removeJunk(substanceId, volumeCm3 = null) {
    return this.separateJunk(substanceId, volumeCm3);
  }

  separatePercentJunk(percent = 100) {
    const selectedIds = Object.keys(this.junk);
    return this.separateSelected(selectedIds, state.substances, percent);
  }

  getComposition(substanceMap) {
    const composition = {};
    Object.entries(this.substances).forEach(([substanceId, volumeCm3]) => {
      const substance = substanceMap[substanceId];
      if (substance) {
        composition[substance.name] = (composition[substance.name] || 0) + volumeCm3;
      }
    });
    Object.entries(this.junk).forEach(([substanceId, volumeCm3]) => {
      const substance = substanceMap[substanceId];
      if (substance) {
        composition[substance.name] = (composition[substance.name] || 0) + volumeCm3;
      }
    });
    return composition;
  }

  clone() {
    const cloned = new Material(this.name + ' (Copy)');
    cloned.substances = { ...this.substances };
    cloned.junk = { ...this.junk };
    return cloned;
  }
}

// ============================================================================
// PART TEMPLATE & SYSTEM
// ============================================================================

class PartType {
  constructor(name, description = '') {
    this.id = generateId('partType');
    this.name = name;
    this.description = description;
  }
}

class PartTemplate {
  constructor(name, partType, volumeCm3, description = '') {
    this.id = generateId('partTemplate');
    this.name = name;
    this.partType = partType;
    this.volumeCm3 = volumeCm3;
    this.description = description;
    this.components = {}; // system => component data
  }

  addComponent(system, data) {
    this.components[system] = data;
    return this;
  }
}

class Part {
  constructor(name, template, material) {
    this.id = generateId('part');
    this.name = name;
    this.template = template;
    this.material = material;
    this.components = {}; // system => component data
  }

  addComponent(system, data) {
    this.components[system] = data;
    return this;
  }

  getStats(substanceMap, statMap) {
    const stats = {};
    Object.values(statMap).forEach((stat) => {
      stats[stat.id] = 0;
    });

    const partVolume = this.material.getUsableVolumeCm3();
    if (partVolume <= 0) return stats;

    Object.entries(this.material.substances).forEach(([substanceId, volumeCm3]) => {
      const substance = substanceMap[substanceId];
      if (!substance) return;

      Object.values(statMap).forEach((stat) => {
        const statPerCm3 = substance.statsPerCm3[stat.id] || 0;
        stats[stat.id] += statPerCm3 * volumeCm3;
      });
    });

    return stats;
  }
}

// ============================================================================
// ITEM TEMPLATE & SYSTEM
// ============================================================================

class ItemTemplate {
  constructor(name, description = '') {
    this.id = generateId('itemTemplate');
    this.name = name;
    this.description = description;
    this.requiredParts = []; // { partType, count }
    this.electiveParts = []; // { partType, count }
    this.components = {};
  }

  requirePart(partType, count = 1) {
    this.requiredParts.push({ partType, count });
    persistState();
    return this;
  }

  electivePart(partType, count = 1) {
    this.electiveParts.push({ partType, count });
    persistState();
    return this;
  }

  removeRequiredPart(partTypeId) {
    this.requiredParts = this.requiredParts.filter((entry) => entry.partType.id !== partTypeId);
    persistState();
    return this;
  }

  removeOptionalPart(partTypeId) {
    this.electiveParts = this.electiveParts.filter((entry) => entry.partType.id !== partTypeId);
    persistState();
    return this;
  }

  addComponent(system, data) {
    this.components[system] = data;
    return this;
  }
}

class Item {
  constructor(name, template) {
    this.id = generateId('item');
    this.name = name;
    this.template = template;
    this.parts = []; // Part[]
    this.components = {};
  }

  addPart(part) {
    this.parts.push(part);
    return this;
  }

  addComponent(system, data) {
    this.components[system] = data;
    return this;
  }

  getStats(substanceMap, statMap) {
    const stats = {};
    Object.values(statMap).forEach((stat) => {
      stats[stat.id] = 0;
    });

    this.parts.forEach((part) => {
      const partStats = part.getStats(substanceMap, statMap);
      Object.entries(partStats).forEach(([statId, value]) => {
        stats[statId] += value;
      });
    });

    return stats;
  }
}

// ============================================================================
// COMPONENT SYSTEM - Extensible effects/skills/systems
// ============================================================================

class ComponentSystem {
  constructor(name, description = '') {
    this.id = generateId('system');
    this.name = name;
    this.description = description;
    this.components = {}; // id => Component
  }

  defineComponent(id, schema) {
    this.components[id] = { id, schema };
    return this;
  }

  getComponentSchema(id) {
    return this.components[id]?.schema || {};
  }
}

// ============================================================================
// GLOBAL STATE
// ============================================================================

const STORAGE_KEY = 'text-based-mmo-crafting-system-v1';

let state = {
  stats: {}, // id => Stat
  substances: {}, // id => Substance
  materials: {}, // id => Material
  partTypes: {}, // id => PartType
  partTemplates: {}, // id => PartTemplate
  parts: {}, // id => Part
  itemTemplates: {}, // id => ItemTemplate
  items: {}, // id => Item
  systems: {}, // id => ComponentSystem
};

function generateId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function getPureMaterialNameFromComposition(material) {
  if (!material) return null;
  const substanceIds = Object.keys(material.substances || {});
  const junkIds = Object.keys(material.junk || {});
  if (substanceIds.length !== 1 || junkIds.length > 0) return null;

  const substance = state.substances[substanceIds[0]];
  return substance ? `Pure ${substance.name}` : null;
}

function getMaterialCompositionSignature(material) {
  if (!material) return '';
  const composition = {};
  Object.entries(material.substances || {}).forEach(([substanceId, volumeCm3]) => {
    composition[substanceId] = { volume: volumeCm3, isJunk: false };
  });
  Object.entries(material.junk || {}).forEach(([substanceId, volumeCm3]) => {
    composition[substanceId] = { volume: volumeCm3, isJunk: true };
  });

  return JSON.stringify(
    Object.entries(composition)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([substanceId, value]) => [substanceId, value.volume, value.isJunk])
  );
}

function findMatchingMaterialBatch(material) {
  if (!material) return null;
  const signature = getMaterialCompositionSignature(material);
  return Object.values(state.materials || {}).find((candidate) => {
    if (candidate.id === material.id) return false;
    return getMaterialCompositionSignature(candidate) === signature;
  }) || null;
}

function snapshotState() {
  const safeStats = Object.values(state.stats || {});
  const safeSubstances = Object.values(state.substances || {});
  const safeMaterials = Object.values(state.materials || {});
  const safePartTypes = Object.values(state.partTypes || {});
  const safePartTemplates = Object.values(state.partTemplates || {});
  const safeParts = Object.values(state.parts || {});
  const safeItemTemplates = Object.values(state.itemTemplates || {});
  const safeItems = Object.values(state.items || {});
  const safeSystems = Object.values(state.systems || {});

  return {
    stats: Object.fromEntries(safeStats.map((stat) => [stat.id, { id: stat.id, name: stat.name, description: stat.description }])),
    substances: Object.fromEntries(safeSubstances.map((substance) => [substance.id, {
      id: substance.id,
      name: substance.name,
      densityGramsPerCm3: substance.densityGramsPerCm3,
      description: substance.description,
      statsPerCm3: { ...(substance.statsPerCm3 || {}) },
    }])),
    materials: Object.fromEntries(safeMaterials.map((material) => [material.id, {
      id: material.id,
      name: material.name,
      substances: { ...(material.substances || {}) },
      junk: { ...(material.junk || {}) },
    }])),
    partTypes: Object.fromEntries(safePartTypes.map((partType) => [partType.id, { id: partType.id, name: partType.name, description: partType.description }])),
    partTemplates: Object.fromEntries(safePartTemplates.map((template) => [template.id, {
      id: template.id,
      name: template.name,
      partTypeId: template.partType?.id || null,
      volumeCm3: template.volumeCm3,
      description: template.description,
    }])),
    parts: Object.fromEntries(safeParts.map((part) => [part.id, {
      id: part.id,
      name: part.name,
      templateId: part.template?.id || null,
      material: part.material ? {
        id: part.material.id,
        name: part.material.name,
        substances: { ...(part.material.substances || {}) },
        junk: { ...(part.material.junk || {}) },
      } : null,
      components: { ...(part.components || {}) },
    }])),
    itemTemplates: Object.fromEntries(safeItemTemplates.map((template) => [template.id, {
      id: template.id,
      name: template.name,
      description: template.description,
      requiredParts: (template.requiredParts || []).map((entry) => entry.partType?.id || null).filter(Boolean),
      electiveParts: (template.electiveParts || []).map((entry) => entry.partType?.id || null).filter(Boolean),
    }])),
    items: Object.fromEntries(safeItems.map((item) => [item.id, {
      id: item.id,
      name: item.name,
      templateId: item.template?.id || null,
      partIds: (item.parts || []).map((part) => part.id),
      components: { ...(item.components || {}) },
    }])),
    systems: Object.fromEntries(safeSystems.map((system) => [system.id, {
      id: system.id,
      name: system.name,
      description: system.description,
      components: { ...(system.components || {}) },
    }]))
  };
}

function hydrateState(snapshot) {
  const restored = {
    stats: {},
    substances: {},
    materials: {},
    partTypes: {},
    partTemplates: {},
    parts: {},
    itemTemplates: {},
    items: {},
    systems: {},
  };

  Object.values(snapshot.stats || {}).forEach((entry) => {
    const stat = new Stat(entry.name, entry.description);
    stat.id = entry.id;
    restored.stats[stat.id] = stat;
  });

  Object.values(snapshot.partTypes || {}).forEach((entry) => {
    const partType = new PartType(entry.name, entry.description);
    partType.id = entry.id;
    restored.partTypes[partType.id] = partType;
  });

  Object.values(snapshot.substances || {}).forEach((entry) => {
    const substance = new Substance(entry.name, entry.densityGramsPerCm3, entry.description);
    substance.id = entry.id;
    Object.entries(entry.statsPerCm3 || {}).forEach(([statId, value]) => {
      if (restored.stats[statId]) {
        substance.addStat(restored.stats[statId], value);
      }
    });
    restored.substances[substance.id] = substance;
  });

  Object.values(snapshot.materials || {}).forEach((entry) => {
    const material = new Material(entry.name);
    material.id = entry.id;
    Object.entries(entry.substances || {}).forEach(([substanceId, volumeCm3]) => {
      const substance = restored.substances[substanceId];
      if (substance) material.addSubstance(substance, volumeCm3);
    });
    Object.entries(entry.junk || {}).forEach(([substanceId, volumeCm3]) => {
      const substance = restored.substances[substanceId];
      if (substance) material.addJunk(substance, volumeCm3);
    });
    restored.materials[material.id] = material;
  });

  Object.values(snapshot.partTemplates || {}).forEach((entry) => {
    const partType = restored.partTypes[entry.partTypeId];
    if (!partType) return;
    const template = new PartTemplate(entry.name, partType, entry.volumeCm3, entry.description);
    template.id = entry.id;
    restored.partTemplates[template.id] = template;
  });

  Object.values(snapshot.parts || {}).forEach((entry) => {
    const template = restored.partTemplates[entry.templateId];
    const material = restored.materials[entry.material.id] || new Material(entry.material.name);
    if (!template) return;
    const part = new Part(entry.name, template, material);
    part.id = entry.id;
    part.material = material;
    restored.parts[part.id] = part;
  });

  Object.values(snapshot.itemTemplates || {}).forEach((entry) => {
    const template = new ItemTemplate(entry.name, entry.description);
    template.id = entry.id;
    (entry.requiredParts || []).forEach((partTypeId) => {
      const partType = restored.partTypes[partTypeId];
      if (partType) template.requirePart(partType);
    });
    (entry.electiveParts || []).forEach((partTypeId) => {
      const partType = restored.partTypes[partTypeId];
      if (partType) template.electivePart(partType);
    });
    restored.itemTemplates[template.id] = template;
  });

  Object.values(snapshot.items || {}).forEach((entry) => {
    const template = restored.itemTemplates[entry.templateId];
    if (!template) return;
    const item = new Item(entry.name, template);
    item.id = entry.id;
    (entry.partIds || []).forEach((partId) => {
      const part = restored.parts[partId];
      if (part) item.addPart(part);
    });
    restored.items[item.id] = item;
  });

  Object.values(snapshot.systems || {}).forEach((entry) => {
    const system = new ComponentSystem(entry.name, entry.description);
    system.id = entry.id;
    restored.systems[system.id] = system;
  });

  return restored;
}

function persistState() {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshotState()));
}

function loadState() {
  if (typeof localStorage === 'undefined') {
    return initializeDefaults();
  }

  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const defaults = initializeDefaults();
    persistState();
    return defaults;
  }

  try {
    const snapshot = JSON.parse(raw);
    if (snapshot && snapshot.stats) {
      return hydrateState(snapshot);
    }
  } catch (error) {
    console.warn('Failed to parse saved crafting state, resetting to defaults.', error);
  }

  const defaults = initializeDefaults();
  persistState();
  return defaults;
}

// ============================================================================
// API FUNCTIONS
// ============================================================================

function createStat(name, description) {
  const stat = new Stat(name, description);
  state.stats[stat.id] = stat;
  persistState();
  return stat;
}

function deleteStat(statId) {
  if (!state.stats[statId]) return false;
  delete state.stats[statId];
  Object.values(state.substances).forEach((substance) => {
    if (substance.statsPerCm3[statId]) delete substance.statsPerCm3[statId];
  });
  persistState();
  return true;
}

function createSubstance(name, densityGramsPerCm3, description) {
  const substance = new Substance(name, densityGramsPerCm3, description);
  state.substances[substance.id] = substance;
  persistState();
  return substance;
}

function createMaterial(name) {
  const baseName = (name || '').trim() || 'Unnamed Material';
  const material = new Material(baseName);
  const existingMatch = findMatchingMaterialBatch(material);
  if (existingMatch) {
    existingMatch.merge(material);
    delete state.materials[material.id];
    persistState();
    return existingMatch;
  }
  const pureName = getPureMaterialNameFromComposition(material);
  if (pureName) material.name = pureName;
  state.materials[material.id] = material;
  persistState();
  return material;
}

function createRandomMaterialBatch(name, totalVolumeCm3 = 100) {
  const batch = new Material(name || 'Random Material');
  const candidates = Object.values(state.substances).filter((substance) => substance.name !== 'Junk');

  if (candidates.length === 0) {
    state.materials[batch.id] = batch;
    return batch;
  }

  let remaining = Math.max(0, totalVolumeCm3);
  while (remaining > 0) {
    const step = Math.min(10, remaining);
    const weightTotal = candidates.reduce((sum, substance) => sum + (1 / Math.max(substance.densityGramsPerCm3, 0.1)), 0);
    let threshold = Math.random() * weightTotal;
    let selected = candidates[0];

    for (const substance of candidates) {
      threshold -= 1 / Math.max(substance.densityGramsPerCm3, 0.1);
      if (threshold <= 0) {
        selected = substance;
        break;
      }
    }

    batch.addSubstance(selected, step);
    remaining -= step;
  }

  const existingMatch = findMatchingMaterialBatch(batch);
  if (existingMatch) {
    existingMatch.merge(batch);
    delete state.materials[batch.id];
    persistState();
    return existingMatch;
  }

  state.materials[batch.id] = batch;
  persistState();
  return batch;
}

function createPartType(name, description) {
  const partType = new PartType(name, description);
  state.partTypes[partType.id] = partType;
  persistState();
  return partType;
}

function createPartTemplate(name, partType, volumeCm3, description) {
  const template = new PartTemplate(name, partType, volumeCm3, description);
  state.partTemplates[template.id] = template;
  persistState();
  return template;
}

function createPart(name, template, material) {
  if (!material || !template) return null;

  const consumedMaterial = material.consumeTemplate(template, state.substances);
  if (!consumedMaterial) {
    return null;
  }

  const part = new Part(name, template, consumedMaterial);
  state.parts[part.id] = part;
  persistState();
  return part;
}

function createItemTemplate(name, description) {
  const template = new ItemTemplate(name, description);
  state.itemTemplates[template.id] = template;
  persistState();
  return template;
}

function createItem(name, template) {
  const item = new Item(name, template);
  state.items[item.id] = item;
  persistState();
  return item;
}

function createComponentSystem(name, description) {
  const system = new ComponentSystem(name, description);
  state.systems[system.id] = system;
  persistState();
  return system;
}

function getStat(statId) {
  return state.stats[statId];
}

function getSubstance(substanceId) {
  return state.substances[substanceId];
}

function getMaterial(materialId) {
  return state.materials[materialId];
}

function getPartTemplate(templateId) {
  return state.partTemplates[templateId];
}

function getPartType(typeId) {
  return state.partTypes[typeId];
}

function getPart(partId) {
  return state.parts[partId];
}

function getItemTemplate(templateId) {
  return state.itemTemplates[templateId];
}

function getItem(itemId) {
  return state.items[itemId];
}

// ============================================================================
// INITIALIZATION WITH DEFAULT DATA
// ============================================================================

function initializeDefaults() {
  // Create stats
  const statAction = createStat('Action', 'Sharpness and offensive capability');
  const statBase = createStat('Base', 'Fundamental durability');
  const statCrit = createStat('Crit', 'Critical strike chance');

  // Create substances
  const iron = createSubstance('Iron', 7.86, 'Common, sturdy metal');
  iron.addStat(statAction, 1);
  iron.addStat(statBase, 3);

  const aluminum = createSubstance('Aluminum', 2.7, 'Lightweight metal');
  aluminum.addStat(statAction, 3);

  const gold = createSubstance('Gold', 19.32, 'Rare precious metal');
  gold.addStat(statAction, 1);
  gold.addStat(statBase, 1);
  gold.addStat(statCrit, 5);

  const junk = createSubstance('Junk', 2.5, 'Silicates and impurities');

  const carbon = createSubstance('Carbon', 2.1, 'A brittle alloying element');
  carbon.addStat(statBase, 1);

  // Create part types
  const handleType = createPartType('Handle', 'Grip for the weapon');
  const bladeType = createPartType('Blade', 'Cutting surface');
  const pommelType = createPartType('Pommel', 'Weight counterbalance');

  // Create part templates
  const basicHandleTemplate = createPartTemplate('Basic Handle', handleType, 100, 'Simple wooden grip');
  const shortBladeTemplate = createPartTemplate('Short Blade', bladeType, 400, 'Quick, light blade');
  const basicPommelTemplate = createPartTemplate('Basic Pommel', pommelType, 20, 'Simple counterweight');

  // Create item template
  const daggerTemplate = createItemTemplate('Dagger', 'A short stabbing weapon');
  daggerTemplate.requirePart(handleType);
  daggerTemplate.requirePart(bladeType);
  daggerTemplate.electivePart(pommelType);

  // Create some initial materials (volumes in cm³)
  const pureIronBatch = createMaterial('');
  pureIronBatch.addSubstance(iron, 1000);
  pureIronBatch.addJunk(junk, 200);
  pureIronBatch.name = 'Pure Iron Harvest';

  const goldRichOre = createMaterial('Gold-Rich Ore');
  goldRichOre.addSubstance(iron, 150);
  goldRichOre.addSubstance(gold, 20);
  goldRichOre.addJunk(junk, 100);

  // Create a magic system component
  const magicSystem = createComponentSystem('Magic', 'Magical properties and enchantments');
  magicSystem.defineComponent('enchantment', {
    name: String,
    powerLevel: Number,
  });

  // Create a skill system component
  const skillSystem = createComponentSystem('Skills', 'Special skills granted by items');
  skillSystem.defineComponent('skill', {
    name: String,
    requirement: String,
  });

  return {
    stats: { statAction, statBase, statCrit },
    substances: { iron, aluminum, gold, junk, carbon },
    partTypes: { handleType, bladeType, pommelType },
    partTemplates: { basicHandleTemplate, shortBladeTemplate, basicPommelTemplate },
    itemTemplates: { daggerTemplate },
    materials: { pureIronBatch, goldRichOre },
    systems: { magicSystem, skillSystem },
  };
}

state = loadState();

// Initialize on load
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    window.craftingDefaults = state;
    persistState();
  });
}
