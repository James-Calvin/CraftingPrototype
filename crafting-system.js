// Runtime-defined crafting model. Systems own schemas and labels; definitions own values.

const STORAGE_KEY = 'text-based-mmo-crafting-system-v5';
const LEGACY_STORAGE_KEYS = ['text-based-mmo-crafting-system-v1', 'text-based-mmo-crafting-system-v2', 'text-based-mmo-crafting-system-v3', 'text-based-mmo-crafting-system-v4'];
const SNAPSHOT_VERSION = 5;
const SYSTEM_TARGETS = ['substance', 'partType', 'partTemplate', 'itemTemplate'];
const FIELD_TYPES = ['number', 'text', 'boolean', 'choice'];

function generateId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

function copyData(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function persistState() {
  if (typeof localStorage === 'undefined' || state.__hydrating) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshotState()));
}

class SystemDefinition {
  constructor(name, description = '', processorId = 'flat') {
    this.id = generateId('system');
    this.name = name;
    this.description = description;
    this.processorId = processorId === 'volume' ? 'volume' : 'flat';
    this.showInCalculations = false;
    this.targets = { substance: false, partType: false, partTemplate: false, itemTemplate: false };
    this.behaviors = { inherit: true, addNumeric: false };
    this.capabilities = { typeConstraints: false };
    this.defaultCoveragePercent = 100;
    this.types = {};
    this.fields = {};
    this.labels = {};
  }

  addField(name, type = 'text', options = []) {
    const safeType = FIELD_TYPES.includes(type) ? type : 'text';
    const field = {
      id: generateId('field'),
      name,
      type: safeType,
      options: safeType === 'choice' ? options.map((label) => ({ id: generateId('option'), label })) : [],
    };
    this.fields[field.id] = field;
    persistState();
    return field;
  }

  addLabel(name, description = '') {
    const label = { id: generateId('label'), name, description };
    this.labels[label.id] = label;
    persistState();
    return label;
  }

  addType(name, description = '') {
    const type = { id: generateId('type'), name, description, allowedCompanionIds: [] };
    this.types[type.id] = type;
    persistState();
    return type;
  }
}

class Substance {
  constructor(name, densityGramsPerCm3, description = '') {
    this.id = generateId('substance');
    this.name = name;
    this.densityGramsPerCm3 = densityGramsPerCm3;
    this.description = description;
    this.systemData = {};
  }

  getMassGrams(volumeCm3) {
    return volumeCm3 * this.densityGramsPerCm3;
  }
}

class Material {
  constructor(name = 'Material') {
    this.id = generateId('material');
    this.name = name;
    this.substances = {};
    this.junk = {};
  }

  addSubstance(substance, volumeCm3) {
    const amount = Number(volumeCm3);
    if (!substance || !Number.isFinite(amount) || amount <= 0) return null;
    if (!canAddSubstanceToMaterial(this, substance, amount).valid) return null;
    this.substances[substance.id] = (this.substances[substance.id] || 0) + amount;
    delete this.junk[substance.id];
    persistState();
    return this;
  }

  addJunk(substance, volumeCm3) {
    const amount = Number(volumeCm3);
    if (!substance || !Number.isFinite(amount) || amount <= 0) return null;
    this.junk[substance.id] = (this.junk[substance.id] || 0) + amount;
    delete this.substances[substance.id];
    persistState();
    return this;
  }

  getUsableVolumeCm3() {
    return Object.values(this.substances).reduce((sum, value) => sum + value, 0);
  }

  getJunkVolumeCm3() {
    return Object.values(this.junk).reduce((sum, value) => sum + value, 0);
  }

  getTotalVolumeCm3() {
    return this.getUsableVolumeCm3() + this.getJunkVolumeCm3();
  }

  getTotalMassGrams(substanceMap) {
    return [...Object.entries(this.substances), ...Object.entries(this.junk)].reduce((sum, [id, volume]) => {
      return sum + (substanceMap[id]?.getMassGrams(volume) || 0);
    }, 0);
  }

  getComposition(substanceMap) {
    const composition = {};
    [...Object.entries(this.substances), ...Object.entries(this.junk)].forEach(([id, volume]) => {
      const substance = substanceMap[id];
      if (substance) composition[substance.name] = (composition[substance.name] || 0) + volume;
    });
    return composition;
  }

  getCompositionEntries(substanceMap) {
    return [
      ...Object.entries(this.substances).map(([substanceId, volumeCm3]) => ({ substanceId, substanceName: substanceMap[substanceId]?.name || 'Unknown', volumeCm3, isJunk: false })),
      ...Object.entries(this.junk).map(([substanceId, volumeCm3]) => ({ substanceId, substanceName: substanceMap[substanceId]?.name || 'Unknown', volumeCm3, isJunk: true })),
    ];
  }

  resizeTo(totalVolumeCm3) {
    const current = this.getTotalVolumeCm3();
    if (current <= 0 || totalVolumeCm3 <= 0) return this;
    const scale = totalVolumeCm3 / current;
    Object.keys(this.substances).forEach((id) => { this.substances[id] *= scale; });
    Object.keys(this.junk).forEach((id) => { this.junk[id] *= scale; });
    persistState();
    return this;
  }

  setSubstanceVolume(substanceId, volumeCm3, isJunk = false) {
    const target = isJunk ? this.junk : this.substances;
    const other = isJunk ? this.substances : this.junk;
    const value = Math.max(0, Number(volumeCm3) || 0);
    const previousUsable = Number(this.substances[substanceId] || 0);
    if (!isJunk && value > previousUsable) {
      const candidate = this.clone();
      if (value) candidate.substances[substanceId] = value; else delete candidate.substances[substanceId];
      if (value) delete candidate.junk[substanceId];
      if (!validateMaterialConstraints(candidate).valid) return null;
    }
    if (value) target[substanceId] = value;
    else delete target[substanceId];
    if (value) delete other[substanceId];
    persistState();
    return this;
  }

  merge(other) {
    const candidate = this.clone();
    Object.entries(other?.substances || {}).forEach(([id, volume]) => { if (state.substances[id]) candidate.substances[id] = (candidate.substances[id] || 0) + volume; });
    if (!validateMaterialConstraints(candidate).valid) return null;
    Object.entries(other?.substances || {}).forEach(([id, volume]) => { if (state.substances[id]) this.substances[id] = (this.substances[id] || 0) + volume; });
    Object.entries(other?.junk || {}).forEach(([id, volume]) => {
      if (state.substances[id]) this.addJunk(state.substances[id], volume);
    });
    persistState();
    return this;
  }

  consumeTemplate(template) {
    const available = this.getUsableVolumeCm3();
    if (!template || template.volumeCm3 <= 0 || template.volumeCm3 > available) return null;
    const ratio = template.volumeCm3 / available;
    const preview = new Material(`${this.name} preview`);
    preview.substances = Object.fromEntries(Object.entries(this.substances).map(([id, volume]) => [id, volume * ratio]));
    if (!validatePartConstraints(template, preview).valid) return null;
    const consumed = new Material(`${this.name} → ${template.name}`);
    Object.entries({ ...this.substances }).forEach(([id, volume]) => {
      const taken = volume * ratio;
      consumed.substances[id] = taken;
      this.substances[id] -= taken;
      if (this.substances[id] <= 1e-9) delete this.substances[id];
    });
    persistState();
    return consumed;
  }

  separateSelected(substanceIds, substanceMap, percent = 100) {
    const pct = Math.min(100, Math.max(0, percent)) / 100;
    const separated = new Material(`${this.name} separated`);
    substanceIds.forEach((id) => {
      const substance = substanceMap[id];
      if (!substance) return;
      ['substances', 'junk'].forEach((bucket) => {
        const volume = this[bucket][id] || 0;
        const removed = volume * pct;
        if (!removed) return;
        separated.substances[id] = (separated.substances[id] || 0) + removed;
        this[bucket][id] -= removed;
        if (this[bucket][id] <= 1e-9) delete this[bucket][id];
      });
    });
    if (!separated.getUsableVolumeCm3()) return null;
    state.materials[separated.id] = separated;
    persistState();
    return separated;
  }

  clone() {
    const copy = new Material(`${this.name} (Copy)`);
    copy.substances = { ...this.substances };
    copy.junk = { ...this.junk };
    return copy;
  }
}

class PartType {
  constructor(name, description = '') {
    this.id = generateId('partType');
    this.name = name;
    this.description = description;
    this.systemData = {};
  }
}

class PartTemplate {
  constructor(name, partType, volumeCm3, description = '') {
    this.id = generateId('partTemplate');
    this.name = name;
    this.partType = partType;
    this.volumeCm3 = volumeCm3;
    this.description = description;
    this.systemData = {};
  }
}

class Part {
  constructor(name, template, material) {
    this.id = generateId('part');
    this.name = name;
    this.template = template;
    this.material = material;
    this.usedInItemId = null;
  }

  getSystemResults() {
    return evaluateVisibleSystems(this);
  }
}

class ItemTemplate {
  constructor(name, description = '') {
    this.id = generateId('itemTemplate');
    this.name = name;
    this.description = description;
    this.requiredParts = [];
    this.electiveParts = [];
    this.systemData = {};
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
  }

  removeOptionalPart(partTypeId) {
    this.electiveParts = this.electiveParts.filter((entry) => entry.partType.id !== partTypeId);
    persistState();
  }
}

class Item {
  constructor(name, template) {
    this.id = generateId('item');
    this.name = name;
    this.template = template;
    this.parts = [];
  }

  getSystemResults() {
    return evaluateVisibleSystems(this);
  }
}

function createEmptyState() {
  return { systems: {}, substances: {}, materials: {}, partTypes: {}, partTemplates: {}, parts: {}, itemTemplates: {}, items: {} };
}

let state = createEmptyState();

function getTargetCollection(target) {
  return state[{ substance: 'substances', partType: 'partTypes', partTemplate: 'partTemplates', itemTemplate: 'itemTemplates' }[target]] || {};
}

function getEntityTarget(entity) {
  if (entity instanceof Substance) return 'substance';
  if (entity instanceof PartType) return 'partType';
  if (entity instanceof PartTemplate) return 'partTemplate';
  if (entity instanceof ItemTemplate) return 'itemTemplate';
  return null;
}

function normalizeFieldValue(field, value) {
  if (value === '' || value == null) return undefined;
  if (field.type === 'number') {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : undefined;
  }
  if (field.type === 'boolean') return value === true || value === 'true';
  if (field.type === 'choice') return field.options.some((option) => option.id === value) ? value : undefined;
  return String(value);
}

function createSystemDataEnvelope() {
  return { values: {}, typeMembership: { typeIds: [] }, allowRule: { enabled: false, allowedTypeIds: [], minimumCoveragePercent: null } };
}

function getSystemDataEnvelope(entity, systemId, create = false) {
  if (!entity?.systemData) return null;
  if (!entity.systemData[systemId] && create) entity.systemData[systemId] = createSystemDataEnvelope();
  return entity.systemData[systemId] || null;
}

function clampCoveragePercent(value, fallback = null) {
  if (value === '' || value == null) return fallback;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.min(100, Math.max(0, numeric)) : fallback;
}

function setSystemValue(entity, systemId, labelId, fieldId, value) {
  const system = state.systems[systemId];
  const field = system?.fields[fieldId];
  if (!entity?.systemData || !system || !system.labels[labelId] || !field) return false;
  const normalized = normalizeFieldValue(field, value);
  const envelope = getSystemDataEnvelope(entity, systemId, true);
  envelope.values[labelId] ||= {};
  if (normalized === undefined) delete envelope.values[labelId][fieldId];
  else envelope.values[labelId][fieldId] = normalized;
  if (!Object.keys(envelope.values[labelId]).length) delete envelope.values[labelId];
  persistState();
  return true;
}

function setTypeMembership(entity, systemId, typeIds) {
  const system = state.systems[systemId];
  if (!(entity instanceof Substance) || !system?.capabilities.typeConstraints) return false;
  const envelope = getSystemDataEnvelope(entity, systemId, true);
  envelope.typeMembership.typeIds = [...new Set(typeIds || [])].filter((id) => system.types[id]);
  persistState();
  return true;
}

function setAllowRule(entity, systemId, { enabled, allowedTypeIds, minimumCoveragePercent }) {
  const system = state.systems[systemId];
  if (!(entity instanceof PartType) && !(entity instanceof PartTemplate)) return false;
  if (!system?.capabilities.typeConstraints) return false;
  const envelope = getSystemDataEnvelope(entity, systemId, true);
  envelope.allowRule = {
    enabled: enabled === true,
    allowedTypeIds: [...new Set(allowedTypeIds || [])].filter((id) => system.types[id]),
    minimumCoveragePercent: clampCoveragePercent(minimumCoveragePercent, null),
  };
  persistState();
  return true;
}

function setTypeCompanion(systemId, typeId, companionId, allowed) {
  const system = state.systems[systemId];
  const type = system?.types[typeId];
  const companion = system?.types[companionId];
  if (!type || !companion || typeId === companionId) return false;
  const update = (entry, otherId) => {
    const values = new Set(entry.allowedCompanionIds || []);
    if (allowed) values.add(otherId); else values.delete(otherId);
    entry.allowedCompanionIds = [...values];
  };
  update(type, companionId);
  update(companion, typeId);
  persistState();
  return true;
}

function deleteConstraintType(systemId, typeId) {
  const system = state.systems[systemId];
  if (!system?.types[typeId]) return false;
  delete system.types[typeId];
  Object.values(system.types).forEach((type) => { type.allowedCompanionIds = (type.allowedCompanionIds || []).filter((id) => id !== typeId); });
  SYSTEM_TARGETS.forEach((target) => Object.values(getTargetCollection(target)).forEach((entity) => {
    const envelope = getSystemDataEnvelope(entity, systemId);
    if (!envelope) return;
    envelope.typeMembership.typeIds = envelope.typeMembership.typeIds.filter((id) => id !== typeId);
    envelope.allowRule.allowedTypeIds = envelope.allowRule.allowedTypeIds.filter((id) => id !== typeId);
  }));
  persistState();
  return true;
}

function clearSystemDataReference(systemId, labelId = null, fieldId = null) {
  SYSTEM_TARGETS.forEach((target) => Object.values(getTargetCollection(target)).forEach((entity) => {
    const systemData = entity.systemData?.[systemId];
    if (!systemData) return;
    if (!labelId) delete entity.systemData[systemId];
    else if (!fieldId) delete systemData.values[labelId];
    else Object.values(systemData.values).forEach((fields) => { delete fields[fieldId]; });
  }));
}

function directRecords(entity, target, system, multiplier = 1) {
  if (!entity || !system.targets[target]) return [];
  const data = entity.systemData?.[system.id]?.values || {};
  return Object.entries(data).filter(([labelId]) => system.labels[labelId]).map(([labelId, rawFields]) => {
    const fields = {};
    Object.entries(rawFields).forEach(([fieldId, value]) => {
      const field = system.fields[fieldId];
      if (!field) return;
      const normalized = normalizeFieldValue(field, value);
      if (normalized === undefined) return;
      fields[fieldId] = system.processorId === 'volume' && field.type === 'number' ? normalized * multiplier : normalized;
    });
    return { labelId, fields, sourceType: target, sourceId: entity.id, multiplier };
  }).filter((record) => Object.keys(record.fields).length);
}

function collectSystemRecords(system, context) {
  const records = [];
  const collect = (value) => {
    if (!value) return;
    const target = getEntityTarget(value);
    if (target) {
      records.push(...directRecords(value, target, system));
      return;
    }
    if (value instanceof Material) {
      if (!system.behaviors.inherit) return;
      Object.entries(value.substances).forEach(([id, volume]) => {
        records.push(...directRecords(state.substances[id], 'substance', system, system.processorId === 'volume' ? volume : 1));
      });
      return;
    }
    if (value instanceof Part) {
      const partMultiplier = system.processorId === 'volume' ? getUsableVolume(value) : 1;
      records.push(...directRecords(value.template?.partType, 'partType', system, partMultiplier));
      records.push(...directRecords(value.template, 'partTemplate', system, partMultiplier));
      if (system.behaviors.inherit) collect(value.material);
      return;
    }
    if (value instanceof Item) {
      const itemMultiplier = system.processorId === 'volume' ? getUsableVolume(value) : 1;
      records.push(...directRecords(value.template, 'itemTemplate', system, itemMultiplier));
      if (system.behaviors.inherit) value.parts.forEach(collect);
    }
  };
  collect(context);
  return records;
}

const SYSTEM_PROCESSORS = {
  flat(system, context) { return collectSystemRecords(system, context); },
  volume(system, context) { return collectSystemRecords(system, context); },
};

function getUsableVolume(context) {
  if (context instanceof Material) return context.getUsableVolumeCm3();
  if (context instanceof Part) return context.material?.getUsableVolumeCm3() || 0;
  if (context instanceof Item) return context.parts.reduce((sum, part) => sum + getUsableVolume(part), 0);
  return 0;
}

function evaluateSystem(systemId, context) {
  const system = state.systems[systemId];
  if (!system) return { system: null, records: [], aggregates: null };
  const processor = SYSTEM_PROCESSORS[system.processorId] || SYSTEM_PROCESSORS.flat;
  const records = processor(system, context);
  let aggregates = null;
  if (system.behaviors.addNumeric) {
    aggregates = {};
    records.forEach((record) => {
      aggregates[record.labelId] ||= {};
      Object.entries(record.fields).forEach(([fieldId, value]) => {
        if (system.fields[fieldId]?.type === 'number') {
          aggregates[record.labelId][fieldId] = (aggregates[record.labelId][fieldId] || 0) + value;
        }
      });
    });
  }
  return { system, records, aggregates, processorId: system.processorId, contextVolumeCm3: getUsableVolume(context) };
}

function evaluateVisibleSystems(context) {
  return Object.values(state.systems).filter((system) => system.showInCalculations).map((system) => evaluateSystem(system.id, context));
}

function getConstraintSystems() {
  return Object.values(state.systems).filter((system) => system.capabilities.typeConstraints);
}

function getSubstanceTypeIds(system, substance) {
  if (!system?.targets.substance || !substance) return [];
  return (getSystemDataEnvelope(substance, system.id)?.typeMembership.typeIds || []).filter((id) => system.types[id]);
}

function getDerivedTypeSummary(context) {
  const materials = context instanceof Material ? [context]
    : context instanceof Part ? [context.material]
      : context instanceof Item ? context.parts.map((part) => part.material) : [];
  return getConstraintSystems().map((system) => {
    const typeIds = new Set();
    materials.forEach((material) => Object.keys(material?.substances || {}).forEach((substanceId) => {
      getSubstanceTypeIds(system, state.substances[substanceId]).forEach((id) => typeIds.add(id));
    }));
    return { system, typeIds: [...typeIds], types: [...typeIds].map((id) => system.types[id]).filter(Boolean) };
  });
}

function typePairIsCompatible(system, leftTypeIds, rightTypeIds) {
  return leftTypeIds.some((leftId) => rightTypeIds.some((rightId) => {
    return leftId === rightId || system.types[leftId]?.allowedCompanionIds?.includes(rightId);
  }));
}

function validateMaterialConstraints(material) {
  const violations = [];
  const results = [];
  getConstraintSystems().forEach((system) => {
    if (!system.targets.substance) return;
    const constituents = Object.entries(material?.substances || {}).filter(([, volume]) => Number(volume) > 0).map(([substanceId, volumeCm3]) => ({
      substance: state.substances[substanceId], volumeCm3: Number(volumeCm3),
    })).filter((entry) => entry.substance);
    const systemViolations = [];
    for (let leftIndex = 0; leftIndex < constituents.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < constituents.length; rightIndex += 1) {
        const left = constituents[leftIndex];
        const right = constituents[rightIndex];
        const leftTypes = getSubstanceTypeIds(system, left.substance);
        const rightTypes = getSubstanceTypeIds(system, right.substance);
        if (!leftTypes.length || !rightTypes.length || typePairIsCompatible(system, leftTypes, rightTypes)) continue;
        systemViolations.push({
          kind: 'incompatible-substances', systemId: system.id, substanceIds: [left.substance.id, right.substance.id],
          message: `${left.substance.name} and ${right.substance.name} have no allowed companion types in ${system.name}.`,
        });
      }
    }
    violations.push(...systemViolations);
    results.push({ systemId: system.id, valid: !systemViolations.length, violations: systemViolations });
  });
  return { valid: !violations.length, violations, results };
}

function getAllowRule(system, entity, target) {
  if (!system.targets[target]) return null;
  const rule = getSystemDataEnvelope(entity, system.id)?.allowRule;
  return rule?.enabled ? rule : null;
}

function evaluateAllowRule(system, entity, target, material) {
  const rule = getAllowRule(system, entity, target);
  if (!rule) return null;
  const totalVolumeCm3 = material?.getUsableVolumeCm3() || 0;
  const allowed = new Set(rule.allowedTypeIds.filter((id) => system.types[id]));
  const allowedVolumeCm3 = Object.entries(material?.substances || {}).reduce((sum, [substanceId, volume]) => {
    const typeIds = getSubstanceTypeIds(system, state.substances[substanceId]);
    return sum + (typeIds.some((id) => allowed.has(id)) ? Number(volume) : 0);
  }, 0);
  const coveragePercent = totalVolumeCm3 > 0 ? (allowedVolumeCm3 / totalVolumeCm3) * 100 : 0;
  const requiredPercent = clampCoveragePercent(rule.minimumCoveragePercent, clampCoveragePercent(system.defaultCoveragePercent, 100));
  return { systemId: system.id, target, entityId: entity.id, allowedTypeIds: [...allowed], totalVolumeCm3, allowedVolumeCm3, coveragePercent, requiredPercent, passed: coveragePercent + 1e-9 >= requiredPercent };
}

function validatePartConstraints(template, material) {
  const materialValidation = validateMaterialConstraints(material);
  const violations = [...materialValidation.violations];
  const results = [];
  getConstraintSystems().forEach((system) => {
    const rules = [
      evaluateAllowRule(system, template?.partType, 'partType', material),
      evaluateAllowRule(system, template, 'partTemplate', material),
    ].filter(Boolean);
    if (!rules.length) return;
    const passed = rules.some((rule) => rule.passed);
    results.push({ systemId: system.id, passed, rules });
    if (!passed) {
      const best = [...rules].sort((left, right) => right.coveragePercent - left.coveragePercent)[0];
      violations.push({
        kind: 'insufficient-type-coverage', systemId: system.id, templateId: template.id, rules,
        message: `${template.name} needs ${best.requiredPercent.toFixed(1)}% allowed ${system.name} volume; this material provides ${best.coveragePercent.toFixed(1)}%.`,
      });
    }
  });
  return { valid: !violations.length, violations, materialValidation, results };
}

function canAddSubstanceToMaterial(material, substance, volumeCm3) {
  const candidate = material.clone();
  candidate.substances[substance.id] = (candidate.substances[substance.id] || 0) + Number(volumeCm3 || 0);
  delete candidate.junk[substance.id];
  return validateMaterialConstraints(candidate);
}

function createSystemDefinition(name, description, processorId = 'flat') {
  const system = new SystemDefinition(name, description, processorId);
  state.systems[system.id] = system;
  persistState();
  return system;
}

function deleteSystemDefinition(systemId) {
  if (!state.systems[systemId]) return false;
  clearSystemDataReference(systemId);
  delete state.systems[systemId];
  persistState();
  return true;
}

function deleteSystemLabel(systemId, labelId) {
  const system = state.systems[systemId];
  if (!system?.labels[labelId]) return false;
  clearSystemDataReference(systemId, labelId);
  delete system.labels[labelId];
  persistState();
  return true;
}

function deleteSystemField(systemId, fieldId) {
  const system = state.systems[systemId];
  if (!system?.fields[fieldId]) return false;
  clearSystemDataReference(systemId, '__all__', fieldId);
  delete system.fields[fieldId];
  persistState();
  return true;
}

function changeSystemFieldType(systemId, fieldId, type, options = []) {
  const system = state.systems[systemId];
  const field = system?.fields[fieldId];
  if (!field || !FIELD_TYPES.includes(type)) return false;
  clearSystemDataReference(systemId, '__all__', fieldId);
  field.type = type;
  field.options = type === 'choice' ? options.map((label) => ({ id: generateId('option'), label })) : [];
  persistState();
  return true;
}

function deleteChoiceOption(systemId, fieldId, optionId) {
  const field = state.systems[systemId]?.fields[fieldId];
  if (!field) return false;
  SYSTEM_TARGETS.forEach((target) => Object.values(getTargetCollection(target)).forEach((entity) => {
    Object.values(entity.systemData?.[systemId]?.values || {}).forEach((values) => {
      if (values[fieldId] === optionId) delete values[fieldId];
    });
  }));
  field.options = field.options.filter((option) => option.id !== optionId);
  persistState();
  return true;
}

function createSubstance(name, density, description) { const value = new Substance(name, density, description); state.substances[value.id] = value; persistState(); return value; }
function createMaterial(name) { const value = new Material((name || '').trim() || 'Unnamed Material'); state.materials[value.id] = value; persistState(); return value; }
function createPartType(name, description) { const value = new PartType(name, description); state.partTypes[value.id] = value; persistState(); return value; }
function createPartTemplate(name, partType, volume, description) { const value = new PartTemplate(name, partType, volume, description); state.partTemplates[value.id] = value; persistState(); return value; }
function createItemTemplate(name, description) { const value = new ItemTemplate(name, description); state.itemTemplates[value.id] = value; persistState(); return value; }

function createRandomMaterialBatch(name, totalVolumeCm3 = 100) {
  const batch = createMaterial(name || 'Random Material');
  const candidates = Object.values(state.substances).filter((substance) => substance.name.toLowerCase() !== 'junk');
  let remaining = Math.max(0, totalVolumeCm3);
  while (remaining > 0 && candidates.length) {
    const amount = Math.min(10, remaining);
    const eligible = candidates.filter((substance) => canAddSubstanceToMaterial(batch, substance, amount).valid);
    if (!eligible.length) break;
    const weight = eligible.reduce((sum, substance) => sum + 1 / Math.max(substance.densityGramsPerCm3, 0.1), 0);
    let threshold = Math.random() * weight;
    let selected = eligible[0];
    for (const candidate of eligible) {
      threshold -= 1 / Math.max(candidate.densityGramsPerCm3, 0.1);
      if (threshold <= 0) { selected = candidate; break; }
    }
    batch.addSubstance(selected, amount);
    remaining -= amount;
  }
  return batch;
}

function createPart(name, template, material) {
  const available = material?.getUsableVolumeCm3() || 0;
  if (!template || template.volumeCm3 <= 0 || template.volumeCm3 > available) return null;
  const ratio = template.volumeCm3 / available;
  const previewMaterial = new Material(`${material.name} preview`);
  previewMaterial.substances = Object.fromEntries(Object.entries(material.substances).map(([id, volume]) => [id, volume * ratio]));
  if (!validatePartConstraints(template, previewMaterial).valid) return null;
  const consumed = material?.consumeTemplate(template);
  if (!consumed) return null;
  const part = new Part(name, template, consumed);
  state.parts[part.id] = part;
  persistState();
  return part;
}

function validateItemParts(template, parts, currentItemId = null) {
  if (!template) return { valid: false, message: 'Select an item template.' };
  if (new Set(parts.map((part) => part.id)).size !== parts.length) return { valid: false, message: 'Each part can only fill one slot.' };
  if (parts.some((part) => part.usedInItemId && part.usedInItemId !== currentItemId)) return { valid: false, message: 'A selected part is already assembled.' };
  const invalidPart = parts.find((part) => !validatePartConstraints(part.template, part.material).valid);
  if (invalidPart) {
    const violation = validatePartConstraints(invalidPart.template, invalidPart.material).violations[0];
    return { valid: false, message: `${invalidPart.name} is no longer valid: ${violation?.message || 'its material violates a type constraint.'}` };
  }
  for (const required of template.requiredParts) {
    const count = parts.filter((part) => part.template.partType.id === required.partType.id).length;
    if (count < required.count) return { valid: false, message: `Missing required ${required.partType.name} part.` };
  }
  const allowed = {};
  [...template.requiredParts, ...template.electiveParts].forEach((entry) => { allowed[entry.partType.id] = (allowed[entry.partType.id] || 0) + entry.count; });
  if (parts.some((part) => !allowed[part.template.partType.id])) return { valid: false, message: 'A part does not fit this template.' };
  if (Object.entries(allowed).some(([id, count]) => parts.filter((part) => part.template.partType.id === id).length > count)) return { valid: false, message: 'Too many parts were selected for a slot type.' };
  return { valid: true };
}

function assembleItem(name, template, parts) {
  const validation = validateItemParts(template, parts);
  if (!validation.valid) return validation;
  const item = new Item(name, template);
  item.parts = [...parts];
  parts.forEach((part) => { part.usedInItemId = item.id; });
  state.items[item.id] = item;
  persistState();
  return { valid: true, item };
}

function deleteSubstance(id) {
  if (!state.substances[id]) return false;
  Object.values(state.materials).forEach((material) => { delete material.substances[id]; delete material.junk[id]; });
  Object.values(state.parts).forEach((part) => { delete part.material.substances[id]; delete part.material.junk[id]; });
  delete state.substances[id]; persistState(); return true;
}
function deleteMaterial(id) { if (!state.materials[id]) return false; delete state.materials[id]; persistState(); return true; }
function deleteItem(id) { const item = state.items[id]; if (!item) return false; item.parts.forEach((part) => { if (part.usedInItemId === id) part.usedInItemId = null; }); delete state.items[id]; persistState(); return true; }
function deletePart(id) { const part = state.parts[id]; if (!part) return false; Object.values(state.items).filter((item) => item.parts.some((entry) => entry.id === id)).forEach((item) => deleteItem(item.id)); delete state.parts[id]; persistState(); return true; }
function deletePartTemplate(id) { if (!state.partTemplates[id]) return false; Object.values(state.parts).filter((part) => part.template.id === id).forEach((part) => deletePart(part.id)); delete state.partTemplates[id]; persistState(); return true; }
function deletePartType(id) { if (!state.partTypes[id]) return false; Object.values(state.partTemplates).filter((template) => template.partType.id === id).forEach((template) => deletePartTemplate(template.id)); Object.values(state.itemTemplates).forEach((template) => { template.requiredParts = template.requiredParts.filter((entry) => entry.partType.id !== id); template.electiveParts = template.electiveParts.filter((entry) => entry.partType.id !== id); }); delete state.partTypes[id]; persistState(); return true; }
function deleteItemTemplate(id) { if (!state.itemTemplates[id]) return false; Object.values(state.items).filter((item) => item.template.id === id).forEach((item) => deleteItem(item.id)); delete state.itemTemplates[id]; persistState(); return true; }

function serializeMaterial(material) { return { id: material.id, name: material.name, substances: { ...material.substances }, junk: { ...material.junk } }; }
function serializeDefinition(value, extra = {}) { return { id: value.id, name: value.name, description: value.description, systemData: copyData(value.systemData), ...extra }; }

function snapshotState() {
  return {
    version: SNAPSHOT_VERSION,
    systems: copyData(state.systems),
    substances: Object.fromEntries(Object.values(state.substances).map((value) => [value.id, serializeDefinition(value, { densityGramsPerCm3: value.densityGramsPerCm3 })])),
    materials: Object.fromEntries(Object.values(state.materials).map((value) => [value.id, serializeMaterial(value)])),
    partTypes: Object.fromEntries(Object.values(state.partTypes).map((value) => [value.id, serializeDefinition(value)])),
    partTemplates: Object.fromEntries(Object.values(state.partTemplates).map((value) => [value.id, serializeDefinition(value, { partTypeId: value.partType.id, volumeCm3: value.volumeCm3 })])),
    parts: Object.fromEntries(Object.values(state.parts).map((value) => [value.id, { id: value.id, name: value.name, templateId: value.template.id, material: serializeMaterial(value.material), usedInItemId: value.usedInItemId }])),
    itemTemplates: Object.fromEntries(Object.values(state.itemTemplates).map((value) => [value.id, serializeDefinition(value, { requiredParts: value.requiredParts.map((entry) => ({ partTypeId: entry.partType.id, count: entry.count })), electiveParts: value.electiveParts.map((entry) => ({ partTypeId: entry.partType.id, count: entry.count })) })])),
    items: Object.fromEntries(Object.values(state.items).map((value) => [value.id, { id: value.id, name: value.name, templateId: value.template.id, partIds: value.parts.map((part) => part.id) }])),
  };
}

function exportCraftingData() {
  return JSON.stringify(snapshotState(), null, 2);
}

function importCraftingData(serializedData) {
  const previousSnapshot = snapshotState();
  try {
    const importedSnapshot = typeof serializedData === 'string' ? JSON.parse(serializedData) : serializedData;
    if (!importedSnapshot || typeof importedSnapshot !== 'object' || Array.isArray(importedSnapshot)) throw new Error('The imported file must contain a crafting workspace object.');
    if (![4, SNAPSHOT_VERSION].includes(importedSnapshot.version)) throw new Error(`Only version 4 or ${SNAPSHOT_VERSION} crafting exports can be imported.`);
    if (importedSnapshot.version === 4) {
      hydrateState(migrateV4Snapshot(importedSnapshot));
      installBaselineTypesSystem();
    } else hydrateState(importedSnapshot);
    persistState();
    return state;
  } catch (error) {
    hydrateState(previousSnapshot);
    throw error;
  }
}

function hydrateSystemData(raw) {
  const result = {};
  Object.entries(raw || {}).forEach(([systemId, rawEnvelope]) => {
    const system = state.systems[systemId];
    if (!system) return;
    const envelope = createSystemDataEnvelope();
    const labels = rawEnvelope?.values || {};
    Object.entries(labels || {}).forEach(([labelId, fields]) => {
      if (!system.labels[labelId]) return;
      Object.entries(fields || {}).forEach(([fieldId, value]) => {
        const field = system.fields[fieldId];
        const normalized = field ? normalizeFieldValue(field, value) : undefined;
        if (normalized === undefined) return;
        envelope.values[labelId] ||= {};
        envelope.values[labelId][fieldId] = normalized;
      });
    });
    envelope.typeMembership.typeIds = [...new Set(rawEnvelope?.typeMembership?.typeIds || [])].filter((id) => system.types[id]);
    envelope.allowRule = {
      enabled: rawEnvelope?.allowRule?.enabled === true,
      allowedTypeIds: [...new Set(rawEnvelope?.allowRule?.allowedTypeIds || [])].filter((id) => system.types[id]),
      minimumCoveragePercent: clampCoveragePercent(rawEnvelope?.allowRule?.minimumCoveragePercent, null),
    };
    if (Object.keys(envelope.values).length || envelope.typeMembership.typeIds.length || envelope.allowRule.enabled || envelope.allowRule.allowedTypeIds.length || envelope.allowRule.minimumCoveragePercent !== null) result[systemId] = envelope;
  });
  return result;
}

function migrateV4Snapshot(snapshot) {
  const migrated = copyData(snapshot);
  migrated.version = SNAPSHOT_VERSION;
  Object.values(migrated.systems || {}).forEach((system) => {
    system.capabilities = { typeConstraints: false };
    system.defaultCoveragePercent = 100;
    system.types = {};
  });
  ['substances', 'partTypes', 'partTemplates', 'itemTemplates'].forEach((collectionName) => {
    Object.values(migrated[collectionName] || {}).forEach((entity) => {
      entity.systemData = Object.fromEntries(Object.entries(entity.systemData || {}).map(([systemId, values]) => [systemId, { ...createSystemDataEnvelope(), values }]));
    });
  });
  return migrated;
}

function hydrateMaterial(raw) { const value = new Material(raw.name); value.id = raw.id; value.substances = { ...(raw.substances || {}) }; value.junk = { ...(raw.junk || {}) }; return value; }

function hydrateState(snapshot) {
  state = createEmptyState();
  state.__hydrating = true;
  Object.values(snapshot.systems || {}).forEach((raw) => {
    // Early v4 snapshots could contain the retired `stats` processor ID.
    // It represented the same volume policy, so normalize it without reserving Stats itself.
    const requestedProcessor = ['volume', 'stats'].includes(raw.processorId) ? 'volume' : 'flat';
    const system = new SystemDefinition(String(raw.name || 'Unnamed System'), String(raw.description || ''), requestedProcessor);
    system.id = raw.id;
    system.showInCalculations = raw.showInCalculations === true;
    SYSTEM_TARGETS.forEach((target) => { system.targets[target] = raw.targets?.[target] === true; });
    system.behaviors = { inherit: raw.behaviors?.inherit === true, addNumeric: raw.behaviors?.addNumeric === true };
    system.capabilities = { typeConstraints: raw.capabilities?.typeConstraints === true };
    system.defaultCoveragePercent = clampCoveragePercent(raw.defaultCoveragePercent, 100);
    system.types = {};
    Object.values(raw.types || {}).forEach((entry) => {
      if (!entry?.id) return;
      system.types[entry.id] = { id: entry.id, name: String(entry.name || 'Unnamed Type'), description: String(entry.description || ''), allowedCompanionIds: [] };
    });
    Object.values(raw.types || {}).forEach((entry) => {
      if (!system.types[entry?.id]) return;
      system.types[entry.id].allowedCompanionIds = [...new Set(entry.allowedCompanionIds || [])].filter((id) => id !== entry.id && system.types[id]);
    });
    Object.values(system.types).forEach((type) => type.allowedCompanionIds.forEach((companionId) => {
      const companion = system.types[companionId];
      if (companion && !companion.allowedCompanionIds.includes(type.id)) companion.allowedCompanionIds.push(type.id);
    }));
    system.fields = {};
    Object.values(raw.fields || {}).forEach((entry) => {
      if (!entry?.id) return;
      const type = FIELD_TYPES.includes(entry.type) ? entry.type : 'text';
      system.fields[entry.id] = {
        id: entry.id,
        name: String(entry.name || 'Unnamed Field'),
        type,
        options: type === 'choice' && Array.isArray(entry.options)
          ? entry.options.filter((option) => option?.id).map((option) => ({ id: option.id, label: String(option.label || 'Option') }))
          : [],
      };
    });
    system.labels = {};
    Object.values(raw.labels || {}).forEach((entry) => {
      if (entry?.id) system.labels[entry.id] = { id: entry.id, name: String(entry.name || 'Unnamed Label'), description: String(entry.description || '') };
    });
    state.systems[system.id] = system;
  });
  Object.values(snapshot.substances || {}).forEach((raw) => { const value = new Substance(raw.name, raw.densityGramsPerCm3, raw.description); value.id = raw.id; value.systemData = hydrateSystemData(raw.systemData); state.substances[value.id] = value; });
  const removeUnknownComposition = (material) => {
    material.substances = Object.fromEntries(Object.entries(material.substances).filter(([id, volume]) => state.substances[id] && Number.isFinite(Number(volume)) && Number(volume) > 0).map(([id, volume]) => [id, Number(volume)]));
    material.junk = Object.fromEntries(Object.entries(material.junk).filter(([id, volume]) => state.substances[id] && Number.isFinite(Number(volume)) && Number(volume) > 0).map(([id, volume]) => [id, Number(volume)]));
    return material;
  };
  Object.values(snapshot.materials || {}).forEach((raw) => { const value = removeUnknownComposition(hydrateMaterial(raw)); state.materials[value.id] = value; });
  Object.values(snapshot.partTypes || {}).forEach((raw) => { const value = new PartType(raw.name, raw.description); value.id = raw.id; value.systemData = hydrateSystemData(raw.systemData); state.partTypes[value.id] = value; });
  Object.values(snapshot.partTemplates || {}).forEach((raw) => { const type = state.partTypes[raw.partTypeId]; if (!type) return; const value = new PartTemplate(raw.name, type, raw.volumeCm3, raw.description); value.id = raw.id; value.systemData = hydrateSystemData(raw.systemData); state.partTemplates[value.id] = value; });
  Object.values(snapshot.parts || {}).forEach((raw) => { const template = state.partTemplates[raw.templateId]; if (!template || !raw.material) return; const value = new Part(raw.name, template, removeUnknownComposition(hydrateMaterial(raw.material))); value.id = raw.id; value.usedInItemId = raw.usedInItemId || null; state.parts[value.id] = value; });
  Object.values(snapshot.itemTemplates || {}).forEach((raw) => { const value = new ItemTemplate(raw.name, raw.description); value.id = raw.id; value.systemData = hydrateSystemData(raw.systemData); value.requiredParts = (raw.requiredParts || []).filter((entry) => state.partTypes[entry.partTypeId]).map((entry) => ({ partType: state.partTypes[entry.partTypeId], count: Math.max(1, Number(entry.count) || 1) })); value.electiveParts = (raw.electiveParts || []).filter((entry) => state.partTypes[entry.partTypeId]).map((entry) => ({ partType: state.partTypes[entry.partTypeId], count: Math.max(1, Number(entry.count) || 1) })); state.itemTemplates[value.id] = value; });
  Object.values(snapshot.items || {}).forEach((raw) => { const template = state.itemTemplates[raw.templateId]; if (!template) return; const value = new Item(raw.name, template); value.id = raw.id; value.parts = (raw.partIds || []).map((id) => state.parts[id]).filter(Boolean); value.parts.forEach((part) => { part.usedInItemId = value.id; }); state.items[value.id] = value; });
  delete state.__hydrating;
  return state;
}

function installBaselineTypesSystem() {
  let typesSystem = Object.values(state.systems).find((system) => system.name.trim().toLowerCase() === 'types');
  if (!typesSystem) typesSystem = createSystemDefinition('Types', 'Classifies usable substances and controls material eligibility.', 'flat');
  typesSystem.capabilities.typeConstraints = true;
  typesSystem.showInCalculations = false;
  typesSystem.defaultCoveragePercent = 100;
  typesSystem.targets.substance = true;
  typesSystem.targets.partType = true;
  typesSystem.targets.partTemplate = true;
  let metal = Object.values(typesSystem.types).find((type) => type.name.trim().toLowerCase() === 'metal');
  if (!metal) metal = typesSystem.addType('Metal', 'Material suitable for metalworking.');
  ['Iron', 'Aluminum', 'Gold'].forEach((name) => {
    const substance = Object.values(state.substances).find((entry) => entry.name === name);
    if (substance) setTypeMembership(substance, typesSystem.id, [...(getSystemDataEnvelope(substance, typesSystem.id)?.typeMembership.typeIds || []), metal.id]);
  });
  ['Handle', 'Blade', 'Pommel'].forEach((name) => {
    const partType = Object.values(state.partTypes).find((entry) => entry.name === name);
    if (partType) setAllowRule(partType, typesSystem.id, { enabled: true, allowedTypeIds: [metal.id], minimumCoveragePercent: null });
  });
  persistState();
  return typesSystem;
}

function initializeDefaults() {
  const stats = createSystemDefinition('Stats', 'Numeric properties that propagate through crafted objects.', 'volume');
  stats.showInCalculations = true;
  stats.targets.substance = true;
  stats.behaviors = { inherit: true, addNumeric: true };
  const valueField = stats.addField('Value', 'number');
  const action = stats.addLabel('Action', 'Sharpness and offensive capability');
  const base = stats.addLabel('Base', 'Fundamental durability');
  const crit = stats.addLabel('Crit', 'Critical strike chance');

  const iron = createSubstance('Iron', 7.86, 'Common, sturdy metal');
  const aluminum = createSubstance('Aluminum', 2.7, 'Lightweight metal');
  const gold = createSubstance('Gold', 19.32, 'Rare precious metal');
  const junk = createSubstance('Junk', 2.5, 'Silicates and impurities');
  const carbon = createSubstance('Carbon', 2.1, 'A brittle alloying element');
  setSystemValue(iron, stats.id, action.id, valueField.id, 1);
  setSystemValue(iron, stats.id, base.id, valueField.id, 3);
  setSystemValue(aluminum, stats.id, action.id, valueField.id, 3);
  setSystemValue(gold, stats.id, action.id, valueField.id, 1);
  setSystemValue(gold, stats.id, base.id, valueField.id, 1);
  setSystemValue(gold, stats.id, crit.id, valueField.id, 5);
  setSystemValue(carbon, stats.id, base.id, valueField.id, 1);

  const handle = createPartType('Handle', 'Grip for the weapon');
  const blade = createPartType('Blade', 'Cutting surface');
  const pommel = createPartType('Pommel', 'Weight counterbalance');
  createPartTemplate('Basic Handle', handle, 100, 'Simple grip');
  createPartTemplate('Short Blade', blade, 400, 'Quick, light blade');
  createPartTemplate('Basic Pommel', pommel, 20, 'Simple counterweight');
  const dagger = createItemTemplate('Dagger', 'A short stabbing weapon');
  dagger.requirePart(handle).requirePart(blade).electivePart(pommel);
  installBaselineTypesSystem();
  const ironBatch = createMaterial('Pure Iron Harvest'); ironBatch.addSubstance(iron, 1000); ironBatch.addJunk(junk, 200);
  const goldOre = createMaterial('Gold-Rich Ore'); goldOre.addSubstance(iron, 150); goldOre.addSubstance(gold, 20); goldOre.addJunk(junk, 100);
  return state;
}

function buildDefaultState() {
  state = createEmptyState(); state.__hydrating = true; initializeDefaults(); delete state.__hydrating; persistState(); return state;
}

function loadState() {
  if (typeof localStorage === 'undefined') return buildDefaultState();
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const snapshot = JSON.parse(raw);
      if (snapshot.version === SNAPSHOT_VERSION) return hydrateState(snapshot);
    } catch (error) { console.warn('Failed to load crafting state; restoring defaults.', error); }
    return buildDefaultState();
  }
  const v4Raw = localStorage.getItem('text-based-mmo-crafting-system-v4');
  if (v4Raw) {
    try {
      const snapshot = JSON.parse(v4Raw);
      if (snapshot.version === 4) {
        hydrateState(migrateV4Snapshot(snapshot));
        installBaselineTypesSystem();
        persistState();
        return state;
      }
    } catch (error) { console.warn('Failed to migrate crafting state; restoring defaults.', error); }
  }
  return buildDefaultState();
}

function resetCraftingData() {
  if (typeof localStorage !== 'undefined') {
    [STORAGE_KEY, ...LEGACY_STORAGE_KEYS].forEach((key) => localStorage.removeItem(key));
  }
  return buildDefaultState();
}

state = loadState();

if (typeof window !== 'undefined') window.addEventListener('DOMContentLoaded', () => persistState());
