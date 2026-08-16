// ============================================================================
// UI RENDERING AND INTERACTION LOGIC
// ============================================================================

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character]);
}

function promptText(label, currentValue) {
  const result = prompt(label, currentValue ?? '');
  return result === null ? null : result.trim();
}

function confirmDelete(label) {
  return confirm(`Delete ${label}? Dependent definitions and inventory records will also be updated.`);
}

function fieldInputHtml(entity, system, label, field) {
  const value = entity.systemData?.[system.id]?.[label.id]?.[field.id];
  const attrs = `class="system-value-input" data-entity-target="${getEntityTarget(entity)}" data-entity-id="${entity.id}" data-system-id="${system.id}" data-label-id="${label.id}" data-field-id="${field.id}"`;
  if (field.type === 'boolean') return `<input type="checkbox" ${attrs} ${value === true ? 'checked' : ''}>`;
  if (field.type === 'choice') {
    return `<select ${attrs}><option value="">Unset</option>${field.options.map((option) => `<option value="${option.id}" ${value === option.id ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}</select>`;
  }
  const type = field.type === 'number' ? 'number' : 'text';
  const step = field.type === 'number' ? 'step="any"' : '';
  return `<input type="${type}" ${step} value="${escapeHtml(value ?? '')}" ${attrs}>`;
}

function renderEntitySystemData(entity, target, onlySystemId = null) {
  const systems = Object.values(state.systems).filter((system) => system.targets[target] && (!onlySystemId || system.id === onlySystemId));
  if (!systems.length) return '<p class="empty">No systems target this definition type.</p>';
  return systems.map((system) => `
    <div class="attached-system-card">
      <h5>${escapeHtml(system.name)}</h5>
      ${Object.values(system.labels).map((label) => `
        <div class="attached-label-row">
          <strong>${escapeHtml(label.name)}</strong>
          ${Object.values(system.fields).map((field) => `<label>${escapeHtml(field.name)}${fieldInputHtml(entity, system, label, field)}</label>`).join('') || '<em>No fields defined</em>'}
        </div>
      `).join('') || '<p class="empty">No labels defined.</p>'}
    </div>
  `).join('');
}

function bindSystemDataInputs(container = document) {
  container.querySelectorAll('.system-value-input').forEach((input) => {
    input.addEventListener('change', () => {
      const entity = getTargetCollection(input.dataset.entityTarget)[input.dataset.entityId];
      const value = input.type === 'checkbox' ? input.checked : input.value;
      setSystemValue(entity, input.dataset.systemId, input.dataset.labelId, input.dataset.fieldId, value);
      renderAllTabs();
    });
  });
}

function displayFieldValue(field, value) {
  if (field.type === 'choice') return field.options.find((option) => option.id === value)?.label || 'Unknown option';
  if (field.type === 'boolean') return value ? 'True' : 'False';
  return String(value);
}

function evaluationHtml(evaluation, showMaterialRate = false) {
  const { system, records, aggregates, contextVolumeCm3 } = evaluation;
  const numericRows = [];
  if (aggregates) {
    Object.values(system.labels).forEach((label) => {
      Object.values(system.fields).filter((field) => field.type === 'number').forEach((field) => {
        const total = aggregates[label.id]?.[field.id] || 0;
        const suffix = Object.values(system.fields).filter((entry) => entry.type === 'number').length > 1 ? ` · ${field.name}` : '';
        const rate = showMaterialRate && system.processorId === 'volume' && contextVolumeCm3 > 0 ? `<small>${(total / contextVolumeCm3).toFixed(3)} / cm³</small>` : '';
        numericRows.push(`<div class="calculation-item"><span>${escapeHtml(label.name + suffix)}:</span><strong>${total.toFixed(3)} ${rate}</strong></div>`);
      });
    });
  }

  const recordRows = records.flatMap((record) => {
    const label = system.labels[record.labelId];
    return Object.entries(record.fields).filter(([fieldId]) => !aggregates || system.fields[fieldId]?.type !== 'number').map(([fieldId, value]) => {
      const field = system.fields[fieldId];
      if (!field) return '';
      const source = getTargetCollection(record.sourceType)[record.sourceId];
      return `<div class="system-record-row"><span>${escapeHtml(label?.name || 'Label')} · ${escapeHtml(field.name)}</span><strong>${escapeHtml(displayFieldValue(field, value))}</strong><small>${escapeHtml(source?.name || record.sourceType)}</small></div>`;
    });
  }).join('');

  return `<div class="calculated-system-card"><div class="calculated-system-header"><h5>${escapeHtml(system.name)}</h5><span class="type-badge">${system.processorId === 'volume' ? 'Volume-scaled' : 'Flat'}</span></div>${numericRows.join('')}${recordRows || (!numericRows.length ? '<p class="empty">No contributions.</p>' : '')}</div>`;
}

function visibleSystemsHtml(context, showMaterialRate = false) {
  const evaluations = evaluateVisibleSystems(context);
  return evaluations.length ? evaluations.map((evaluation) => evaluationHtml(evaluation, showMaterialRate)).join('') : '<p class="empty">No systems are opted into crafting calculations.</p>';
}

function renderAllTabs() {
  renderDesignTab();
  renderMaterialsTab();
  renderCraftingTab();
  renderInventoryTab();
  renderSystemsTab();
}

// ============================================================================
// TAB SWITCHING
// ============================================================================

document.querySelectorAll('.tab-button').forEach((button) => {
  button.addEventListener('click', (event) => {
    const tabName = event.target.dataset.tab;

    document.querySelectorAll('.tab-button').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));

    event.target.classList.add('active');
    document.getElementById(`${tabName}-tab`).classList.add('active');
  });
});

// ============================================================================
// DESIGN TAB - For game designers to define everything
// ============================================================================

function renderDesignTab() {
  renderSubstancesDefinitions();
  renderPartTypesDefinitions();
  renderPartTemplatesDefinitions();
  renderItemTemplatesDefinitions();
  updateDesignSelects();
}

function renderSubstancesDefinitions() {
  const container = document.getElementById('design-substances-list');
  const substances = Object.values(state.substances);

  if (substances.length === 0) {
    container.innerHTML = '<p class="empty">No substances defined yet.</p>';
    return;
  }

  container.innerHTML = substances.map((substance) => `
        <div class="definition-card">
          <h4>${escapeHtml(substance.name)}</h4>
          <div>Density: <strong>${substance.densityGramsPerCm3} g/cm³</strong></div>
          <div style="margin-top: 8px; font-size: 0.9em;">${escapeHtml(substance.description || 'No description')}</div>
          <div class="entity-system-data">${renderEntitySystemData(substance, 'substance')}</div>
          <button class="btn btn-secondary edit-substance-button" data-substance-id="${substance.id}">Edit</button>
          <button class="btn btn-danger delete-substance-button" data-substance-id="${substance.id}">Delete</button>
        </div>
      `).join('');

  container.querySelectorAll('.edit-substance-button').forEach((button) => button.addEventListener('click', () => {
    const substance = state.substances[button.dataset.substanceId];
    const name = promptText('Substance name', substance.name);
    if (name === null || !name) return;
    const density = Number(promptText('Density (g/cm³)', substance.densityGramsPerCm3));
    if (!Number.isFinite(density) || density <= 0) return alert('Density must be greater than zero.');
    const description = promptText('Substance description', substance.description);
    if (description === null) return;
    substance.name = name; substance.densityGramsPerCm3 = density; substance.description = description;
    persistState(); renderAllTabs();
  }));
  container.querySelectorAll('.delete-substance-button').forEach((button) => button.addEventListener('click', () => {
    const substance = state.substances[button.dataset.substanceId];
    if (confirmDelete(`substance “${substance.name}”`)) { deleteSubstance(substance.id); renderAllTabs(); }
  }));
  bindSystemDataInputs(container);
}

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    const btn = document.getElementById('design-create-substance-button');
    if (btn) {
      btn.addEventListener('click', () => {
        const name = document.getElementById('design-substance-name').value;
        const density = parseFloat(document.getElementById('design-substance-density').value);
        const description = document.getElementById('design-substance-description').value;

        if (!name || !density || density <= 0) {
          alert('Please enter substance name and valid density');
          return;
        }

        createSubstance(name, density, description);

        document.getElementById('design-substance-name').value = '';
        document.getElementById('design-substance-density').value = '';
        document.getElementById('design-substance-description').value = '';
        renderAllTabs();
      });
    }

    const randomBtn = document.getElementById('create-random-material-button');
    if (randomBtn) {
      randomBtn.addEventListener('click', () => {
        const name = document.getElementById('random-material-name').value || 'Random Material';
        const totalVolume = parseFloat(document.getElementById('random-material-volume').value) || 100;
        createRandomMaterialBatch(name, totalVolume);
        document.getElementById('random-material-name').value = '';
        document.getElementById('random-material-volume').value = '100';
        renderAllTabs();
      });
    }
  }, 100);
});

function updateDesignSelects() {
  const partTypeSelect = document.getElementById('design-template-parttype');
  if (partTypeSelect) {
    const currentValue = partTypeSelect.value;
    partTypeSelect.innerHTML = '<option value="">Select part type...</option>';
    Object.values(state.partTypes).forEach((partType) => {
      const option = document.createElement('option');
      option.value = partType.id;
      option.textContent = partType.name;
      partTypeSelect.appendChild(option);
    });
    partTypeSelect.value = currentValue;
  }
}

function renderPartTypesDefinitions() {
  const container = document.getElementById('design-parttypes-list');
  const types = Object.values(state.partTypes);

  if (types.length === 0) {
    container.innerHTML = '<p class="empty">No part types defined yet.</p>';
    return;
  }

  container.innerHTML = types
    .map((type) => `
      <div class="definition-card">
        <h4>${escapeHtml(type.name)}</h4>
        <p>${escapeHtml(type.description || 'No description')}</p>
        <div class="entity-system-data">${renderEntitySystemData(type, 'partType')}</div>
        <button class="btn btn-secondary edit-parttype-button" data-parttype-id="${type.id}">Edit</button>
        <button class="btn btn-danger delete-parttype-button" data-parttype-id="${type.id}">Delete</button>
      </div>
    `)
    .join('');

  container.querySelectorAll('.edit-parttype-button').forEach((button) => {
    button.addEventListener('click', () => {
      const partType = state.partTypes[button.dataset.parttypeId];
      const name = promptText('Part type name', partType.name);
      if (name === null || !name) return;
      const description = promptText('Part type description', partType.description);
      if (description === null) return;
      partType.name = name;
      partType.description = description;
      persistState();
      renderAllTabs();
    });
  });
  container.querySelectorAll('.delete-parttype-button').forEach((button) => {
    button.addEventListener('click', () => {
      const partType = state.partTypes[button.dataset.parttypeId];
      if (confirmDelete(`part type “${partType.name}”`)) {
        deletePartType(partType.id);
        renderAllTabs();
      }
    });
  });
  bindSystemDataInputs(container);
}

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    const btn = document.getElementById('design-create-parttype-button');
    if (btn) {
      btn.addEventListener('click', () => {
        const name = document.getElementById('design-parttype-name').value;
        const description = document.getElementById('design-parttype-description').value;

        if (!name) {
          alert('Please enter a part type name');
          return;
        }

        createPartType(name, description);
        document.getElementById('design-parttype-name').value = '';
        document.getElementById('design-parttype-description').value = '';
        renderAllTabs();
      });
    }
  }, 100);
});

function renderPartTemplatesDefinitions() {
  const container = document.getElementById('design-templates-list');
  const templates = Object.values(state.partTemplates);

  if (templates.length === 0) {
    container.innerHTML = '<p class="empty">No part templates defined yet.</p>';
    return;
  }

  container.innerHTML = templates
    .map((template) => `
      <div class="definition-card">
        <h4>${escapeHtml(template.name)}</h4>
        <div>Type: <strong>${escapeHtml(template.partType.name)}</strong></div>
        <div>Volume: <strong>${template.volumeCm3} cm³</strong></div>
        <p>${escapeHtml(template.description || 'No description')}</p>
        <div class="entity-system-data">${renderEntitySystemData(template, 'partTemplate')}</div>
        <button class="btn btn-secondary edit-parttemplate-button" data-template-id="${template.id}">Edit</button>
        <button class="btn btn-danger delete-parttemplate-button" data-template-id="${template.id}">Delete</button>
      </div>
    `)
    .join('');

  container.querySelectorAll('.edit-parttemplate-button').forEach((button) => {
    button.addEventListener('click', () => {
      const template = state.partTemplates[button.dataset.templateId];
      const name = promptText('Part template name', template.name);
      if (name === null || !name) return;
      const typeName = promptText(`Part type (${Object.values(state.partTypes).map((type) => type.name).join(', ')})`, template.partType.name);
      if (typeName === null) return;
      const partType = Object.values(state.partTypes).find((type) => type.name.toLowerCase() === typeName.toLowerCase());
      if (!partType) return alert('No part type has that name.');
      const volumeText = promptText('Required volume (cm³)', template.volumeCm3);
      if (volumeText === null) return;
      const volume = Number(volumeText);
      if (!Number.isFinite(volume) || volume <= 0) return alert('Volume must be greater than zero.');
      const description = promptText('Part template description', template.description);
      if (description === null) return;
      template.name = name;
      template.partType = partType;
      template.volumeCm3 = volume;
      template.description = description;
      persistState();
      renderAllTabs();
    });
  });
  container.querySelectorAll('.delete-parttemplate-button').forEach((button) => {
    button.addEventListener('click', () => {
      const template = state.partTemplates[button.dataset.templateId];
      if (confirmDelete(`part template “${template.name}”`)) {
        deletePartTemplate(template.id);
        renderAllTabs();
      }
    });
  });
  bindSystemDataInputs(container);
}

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    const btn = document.getElementById('design-create-template-button');
    if (btn) {
      btn.addEventListener('click', () => {
        const name = document.getElementById('design-template-name').value;
        const partTypeId = document.getElementById('design-template-parttype').value;
        const volume = parseFloat(document.getElementById('design-template-volume').value);
        const description = document.getElementById('design-template-description').value;

        if (!name || !partTypeId || !volume || volume <= 0) {
          alert('Please fill in all fields with valid values');
          return;
        }

        const partType = state.partTypes[partTypeId];
        createPartTemplate(name, partType, volume, description);
        document.getElementById('design-template-name').value = '';
        document.getElementById('design-template-volume').value = '';
        document.getElementById('design-template-description').value = '';
        renderAllTabs();
      });
    }
  }, 100);
});

function renderItemTemplatesDefinitions() {
  const container = document.getElementById('design-items-list');
  const templates = Object.values(state.itemTemplates);

  if (templates.length === 0) {
    container.innerHTML = '<p class="empty">No item templates defined yet.</p>';
  } else {
    container.innerHTML = templates
      .map((template) => {
        const requiredHtml = template.requiredParts.map((r) => `<li>${escapeHtml(r.partType.name)} × ${r.count || 1} (required) <button class="edit-part-count-button" data-template-id="${template.id}" data-role="required" data-parttype-id="${r.partType.id}">Edit count</button><button class="remove-part-button" data-template-id="${template.id}" data-role="required" data-parttype-id="${r.partType.id}">Remove</button></li>`).join('');
        const optionalHtml = template.electiveParts.map((o) => `<li>${escapeHtml(o.partType.name)} × ${o.count || 1} (optional) <button class="edit-part-count-button" data-template-id="${template.id}" data-role="optional" data-parttype-id="${o.partType.id}">Edit count</button><button class="remove-part-button" data-template-id="${template.id}" data-role="optional" data-parttype-id="${o.partType.id}">Remove</button></li>`).join('');

        return `
          <div class="definition-card">
            <h4>${escapeHtml(template.name)}</h4>
            <p>${escapeHtml(template.description || 'No description')}</p>
            <div style="margin-top: 8px;">
              <strong>Parts:</strong>
              <ul style="margin: 4px 0 0 20px;">${requiredHtml}${optionalHtml}</ul>
            </div>
            <div class="entity-system-data">${renderEntitySystemData(template, 'itemTemplate')}</div>
            <button class="btn btn-secondary edit-itemtemplate-button" data-template-id="${template.id}">Edit</button>
            <button class="btn btn-danger delete-itemtemplate-button" data-template-id="${template.id}">Delete</button>
          </div>
        `;
      })
      .join('');
  }

  document.querySelectorAll('.remove-part-button').forEach((button) => {
    button.addEventListener('click', () => {
      const template = state.itemTemplates[button.dataset.templateId];
      if (!template) return;
      if (button.dataset.role === 'required') {
        template.removeRequiredPart(button.dataset.parttypeId);
      } else {
        template.removeOptionalPart(button.dataset.parttypeId);
      }
      renderAllTabs();
    });
  });
  document.querySelectorAll('.edit-part-count-button').forEach((button) => {
    button.addEventListener('click', () => {
      const template = state.itemTemplates[button.dataset.templateId];
      const collection = button.dataset.role === 'required' ? template.requiredParts : template.electiveParts;
      const requirement = collection.find((entry) => entry.partType.id === button.dataset.parttypeId);
      const countText = promptText('Slot count', requirement.count || 1);
      if (countText === null) return;
      const count = Number(countText);
      if (!Number.isInteger(count) || count < 1) return alert('Count must be a positive whole number.');
      requirement.count = count;
      persistState();
      renderAllTabs();
    });
  });
  document.querySelectorAll('.edit-itemtemplate-button').forEach((button) => {
    button.addEventListener('click', () => {
      const template = state.itemTemplates[button.dataset.templateId];
      const name = promptText('Item template name', template.name);
      if (name === null || !name) return;
      const description = promptText('Item template description', template.description);
      if (description === null) return;
      template.name = name;
      template.description = description;
      persistState();
      renderAllTabs();
    });
  });
  document.querySelectorAll('.delete-itemtemplate-button').forEach((button) => {
    button.addEventListener('click', () => {
      const template = state.itemTemplates[button.dataset.templateId];
      if (confirmDelete(`item template “${template.name}”`)) {
        deleteItemTemplate(template.id);
        renderAllTabs();
      }
    });
  });

  const partContainer = document.getElementById('design-item-parts');
  if (partContainer) {
    const partTypes = Object.values(state.partTypes);
    partContainer.innerHTML = `
      <div class="item-part-group">
        <h3>Required Parts</h3>
        <div class="part-type-row">
          <select id="design-item-required-select">
            <option value="">Select required part type...</option>
            ${partTypes.map((partType) => `<option value="${partType.id}">${escapeHtml(partType.name)}</option>`).join('')}
          </select>
          <button id="design-add-required-button" class="btn btn-secondary">Add Required Part</button>
        </div>
      </div>
      <div class="item-part-group">
        <h3>Optional Parts</h3>
        <div class="part-type-row">
          <select id="design-item-optional-select">
            <option value="">Select optional part type...</option>
            ${partTypes.map((partType) => `<option value="${partType.id}">${escapeHtml(partType.name)}</option>`).join('')}
          </select>
          <button id="design-add-optional-button" class="btn btn-secondary">Add Optional Part</button>
        </div>
      </div>
    `;

    document.getElementById('design-add-required-button')?.addEventListener('click', () => {
      const templateName = document.getElementById('design-item-name').value;
      const partTypeId = document.getElementById('design-item-required-select').value;
      if (!templateName || !partTypeId) {
        alert('Enter an item template name and select a part type first');
        return;
      }
      let template = Object.values(state.itemTemplates).find((itemTemplate) => itemTemplate.name === templateName);
      if (!template) {
        template = createItemTemplate(templateName, document.getElementById('design-item-description').value || '');
      }
      const count = Number(promptText('How many required slots?', '1'));
      if (!Number.isInteger(count) || count < 1) return alert('Count must be a positive whole number.');
      template.requirePart(state.partTypes[partTypeId], count);
      document.getElementById('design-item-required-select').value = '';
      renderAllTabs();
    });

    document.getElementById('design-add-optional-button')?.addEventListener('click', () => {
      const templateName = document.getElementById('design-item-name').value;
      const partTypeId = document.getElementById('design-item-optional-select').value;
      if (!templateName || !partTypeId) {
        alert('Enter an item template name and select a part type first');
        return;
      }
      let template = Object.values(state.itemTemplates).find((itemTemplate) => itemTemplate.name === templateName);
      if (!template) {
        template = createItemTemplate(templateName, document.getElementById('design-item-description').value || '');
      }
      const count = Number(promptText('How many optional slots?', '1'));
      if (!Number.isInteger(count) || count < 1) return alert('Count must be a positive whole number.');
      template.electivePart(state.partTypes[partTypeId], count);
      document.getElementById('design-item-optional-select').value = '';
      renderAllTabs();
    });
  }
  bindSystemDataInputs(container);
}

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    const btn = document.getElementById('design-create-item-button');
    if (btn) {
      btn.addEventListener('click', () => {
        const name = document.getElementById('design-item-name').value;
        const description = document.getElementById('design-item-description').value;

        if (!name) {
          alert('Please enter an item name');
          return;
        }

        const existing = Object.values(state.itemTemplates).find((template) => template.name === name);
        if (existing) {
          existing.description = description;
          persistState();
        } else {
          createItemTemplate(name, description);
        }

        document.getElementById('design-item-name').value = '';
        document.getElementById('design-item-description').value = '';
        renderAllTabs();
      });
    }
  }, 100);
});

// ============================================================================
// MATERIALS TAB
// ============================================================================

function renderMaterialsTab() {
  renderMaterialsList();
  updateRefinePanel();
  updateSubstanceSelect();
}

function renderMaterialsList() {
  const container = document.getElementById('materials-list');
  const materials = Object.values(state.materials);

  if (materials.length === 0) {
    container.innerHTML = '<p class="empty">No materials yet. Create one below.</p>';
    return;
  }

  container.innerHTML = materials
    .map((material) => {
      const composition = material.getComposition(state.substances);
      const totalVolume = material.getTotalVolumeCm3();
      const totalMass = material.getTotalMassGrams(state.substances);
      const compositionEntries = material.getCompositionEntries(state.substances);

      const compositionHtml = Object.entries(composition)
        .map(([name, volume]) => `<div class="comp-item">${escapeHtml(name)}: ${volume.toFixed(1)} cm\u00b3</div>`)
        .join('');

      const volumeControls = compositionEntries
        .map((entry) => `
          <div class="material-volume-row">
            <span>${escapeHtml(entry.substanceName)}${entry.isJunk ? ' (Junk)' : ''}</span>
            <input type="number" min="0" step="0.1" value="${entry.volumeCm3.toFixed(1)}" data-material-id="${material.id}" data-substance-id="${entry.substanceId}" data-is-junk="${entry.isJunk}" class="material-substance-volume" />
          </div>
        `)
        .join('');

      return `
        <div class="material-card">
          <div class="material-header">
            <h4>${escapeHtml(material.name)}</h4>
            <span class="material-id">${material.id.substr(0, 12)}</span>
          </div>
          <div class="material-body">
            <div class="composition">
              <strong>Composition:</strong>
              ${compositionHtml || '<p>No substances</p>'}
            </div>
            <div class="totals">
              <div>Total Volume: <strong>${totalVolume.toFixed(1)} cm\u00b3</strong></div>
              <div>Total Mass: <strong>${totalMass.toFixed(0)}g</strong></div>
            </div>
            <div class="material-editor" style="margin-top: 12px;">
              <div class="material-volume-row">
                <span>Total Batch Volume</span>
                <input type="number" min="0" step="0.1" value="${totalVolume.toFixed(1)}" data-material-id="${material.id}" class="material-total-volume" />
              </div>
              ${volumeControls}
              <div style="display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap;">
                <button class="btn btn-secondary resize-material-button" data-material-id="${material.id}">Resize Batch</button>
                <button class="btn btn-secondary update-material-composition-button" data-material-id="${material.id}">Apply Substance Volumes</button>
                <button class="btn btn-secondary add-material-substance-button" data-material-id="${material.id}">Add Constituent</button>
                <button class="btn btn-secondary rename-material-button" data-material-id="${material.id}">Rename</button>
                <button class="btn btn-danger delete-material-button" data-material-id="${material.id}">Delete</button>
              </div>
            </div>
          </div>
        </div>
      `;
    })
    .join('');

  document.querySelectorAll('.resize-material-button').forEach((button) => {
    button.addEventListener('click', () => {
      const material = state.materials[button.dataset.materialId];
      const input = document.querySelector(`.material-total-volume[data-material-id="${material.id}"]`);
      if (!material || !input) return;
      const total = parseFloat(input.value);
      if (!Number.isFinite(total) || total <= 0) {
        alert('Please enter a valid total batch volume.');
        return;
      }
      material.resizeTo(total);
      renderAllTabs();
    });
  });

  document.querySelectorAll('.update-material-composition-button').forEach((button) => {
    button.addEventListener('click', () => {
      const material = state.materials[button.dataset.materialId];
      if (!material) return;
      document.querySelectorAll(`.material-substance-volume[data-material-id="${material.id}"]`).forEach((input) => {
        const substanceId = input.dataset.substanceId;
        const isJunk = input.dataset.isJunk === 'true';
        const value = parseFloat(input.value);
        if (Number.isFinite(value)) {
          material.setSubstanceVolume(substanceId, value, isJunk);
        }
      });
      renderAllTabs();
    });
  });
  document.querySelectorAll('.rename-material-button').forEach((button) => {
    button.addEventListener('click', () => {
      const material = state.materials[button.dataset.materialId];
      const name = promptText('Material batch name', material.name);
      if (name === null || !name) return;
      material.name = name;
      persistState();
      renderAllTabs();
    });
  });
  document.querySelectorAll('.add-material-substance-button').forEach((button) => {
    button.addEventListener('click', () => {
      const material = state.materials[button.dataset.materialId];
      const substanceName = promptText(`Substance (${Object.values(state.substances).map((substance) => substance.name).join(', ')})`, '');
      if (substanceName === null || !substanceName) return;
      const substance = Object.values(state.substances).find((entry) => entry.name.toLowerCase() === substanceName.toLowerCase());
      if (!substance) return alert('No substance has that name.');
      const volumeText = promptText('Volume to add (cm³)', '10');
      if (volumeText === null) return;
      const volume = Number(volumeText);
      if (!Number.isFinite(volume) || volume <= 0) return alert('Volume must be greater than zero.');
      const isJunk = confirm('Mark this constituent as junk?');
      if (isJunk) material.addJunk(substance, volume);
      else material.addSubstance(substance, volume);
      renderAllTabs();
    });
  });
  document.querySelectorAll('.delete-material-button').forEach((button) => {
    button.addEventListener('click', () => {
      const material = state.materials[button.dataset.materialId];
      if (confirmDelete(`material batch “${material.name}”`)) {
        deleteMaterial(material.id);
        renderAllTabs();
      }
    });
  });
}

function updateRefinePanel() {
  const select = document.getElementById('refine-material-select');
  select.innerHTML = '<option value="">Select material to refine...</option>';

  Object.entries(state.materials).forEach(([id, material]) => {
    const totalRemovable = material.getTotalVolumeCm3();
    if (totalRemovable > 0) {
      const option = document.createElement('option');
      option.value = id;
      option.textContent = `${material.name} (${totalRemovable.toFixed(1)} cm³ total)`;
      select.appendChild(option);
    }
  });

  select.onchange = (e) => {
    const materialId = e.target.value;
    const material = state.materials[materialId];

    const compositionDiv = document.getElementById('material-composition');
    if (!material) {
      compositionDiv.innerHTML = '';
      return;
    }

    const entries = [
      ...Object.entries(material.substances).map(([substanceId, volume]) => ({ substanceId, volume, isJunk: false })),
      ...Object.entries(material.junk).map(([substanceId, volume]) => ({ substanceId, volume, isJunk: true })),
    ];

    const listHtml = entries
      .map(({ substanceId, volume, isJunk }) => {
        const substance = state.substances[substanceId];
        return `
          <div class="junk-item">
            <label>
              <input type="checkbox" class="junk-checkbox" data-material-id="${materialId}" data-substance-id="${substanceId}" ${isJunk ? 'checked' : ''} />
              ${escapeHtml(substance ? substance.name : 'Unknown')}${isJunk ? ' (Junk)' : ''}: ${volume.toFixed(1)} cm\u00b3
            </label>
          </div>
        `;
      })
      .join('');

    compositionDiv.innerHTML = `<div class="junk-list">${listHtml || '<p class="empty">No removable material in this batch.</p>'}</div>`;
  };

  const refineButton = document.getElementById('refine-button');
  refineButton.onclick = () => {
    const materialId = select.value;
    if (!materialId) return;

    const material = state.materials[materialId];
    const percent = Math.min(100, Math.max(0, parseFloat(document.getElementById('refine-junk-percent').value) || 100));
    const checkboxes = document.querySelectorAll('.junk-checkbox:checked');
    const selectedSubstances = Array.from(checkboxes).map((checkbox) => checkbox.dataset.substanceId);

    if (!selectedSubstances.length) {
      document.getElementById('refine-output').innerHTML = '<p class="empty">Select at least one substance to separate.</p>';
      return;
    }

    const totalRemoved = selectedSubstances.reduce((sum, substanceId) => {
      const volume = (material.substances[substanceId] || 0) + (material.junk[substanceId] || 0);
      return sum + volume * (percent / 100);
    }, 0);

    const separatedBatch = material.separateSelected(selectedSubstances, state.substances, percent);

    const output = document.getElementById('refine-output');
    if (separatedBatch) {
      output.innerHTML = `<p class="success">Separated ${totalRemoved.toFixed(1)} cm\u00b3 from ${escapeHtml(material.name)} into ${escapeHtml(separatedBatch.name)}.</p>`;
    } else {
      output.innerHTML = '<p class="empty">No material was separated.</p>';
    }

    setTimeout(() => {
      renderAllTabs();
    }, 500);
  };
}

function updateSubstanceSelect() {
  const select = document.getElementById('substance-select');
  select.innerHTML = '<option value="">Select substance...</option>';

  Object.entries(state.substances).forEach(([id, substance]) => {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = `${substance.name} (${substance.densityGramsPerCm3} g/cm³)`;
    select.appendChild(option);
  });

  const mergeA = document.getElementById('merge-material-a-select');
  const mergeB = document.getElementById('merge-material-b-select');
  if (mergeA && mergeB) {
    const currentA = mergeA.value;
    const currentB = mergeB.value;
    mergeA.innerHTML = '<option value="">Select batch A...</option>';
    mergeB.innerHTML = '<option value="">Select batch B...</option>';
    Object.entries(state.materials).forEach(([id, material]) => {
      const optionA = document.createElement('option');
      optionA.value = id;
      optionA.textContent = material.name;
      mergeA.appendChild(optionA);

      const optionB = document.createElement('option');
      optionB.value = id;
      optionB.textContent = material.name;
      mergeB.appendChild(optionB);
    });
    if (currentA && state.materials[currentA]) mergeA.value = currentA;
    if (currentB && state.materials[currentB]) mergeB.value = currentB;
  }
}

let newMaterialBuffer = null;

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    const btn = document.getElementById('add-substance-button');
    if (btn) {
      btn.addEventListener('click', () => {
        const substanceId = document.getElementById('substance-select').value;
        const volume = parseFloat(document.getElementById('substance-volume').value);

        if (!substanceId || !volume || volume <= 0) {
          alert('Please select a substance and enter a valid volume');
          return;
        }

        if (!newMaterialBuffer) {
          const name = document.getElementById('new-material-name').value || 'Unnamed Material';
          newMaterialBuffer = new Material(name);
        }

        const substance = state.substances[substanceId];
        const isJunk = document.getElementById('substance-is-junk').checked;
        if (isJunk) newMaterialBuffer.addJunk(substance, volume);
        else newMaterialBuffer.addSubstance(substance, volume);

        document.getElementById('substance-volume').value = '';
        document.getElementById('substance-is-junk').checked = false;
        updateNewMaterialPreview();
      });
    }
  }, 100);
});

function updateNewMaterialPreview() {
  const preview = document.getElementById('new-material-preview');

  if (!newMaterialBuffer || newMaterialBuffer.getTotalVolumeCm3() === 0) {
    preview.innerHTML = '<p class="empty">No substances added yet</p>';
    return;
  }

  const composition = newMaterialBuffer.getComposition(state.substances);
  const totalVolume = newMaterialBuffer.getTotalVolumeCm3();
  const totalMass = newMaterialBuffer.getTotalMassGrams(state.substances);

  const compositionHtml = Object.entries(composition)
    .map(([name, volume]) => `<div>${escapeHtml(name)}: ${volume.toFixed(1)} cm\u00b3</div>`)
    .join('');

  preview.innerHTML = `
    <div class="preview-card">
      <strong>Preview:</strong>
      ${compositionHtml}
      <div style="margin-top: 8px; font-weight: bold;">Total Volume: ${totalVolume.toFixed(1)} cm\u00b3</div>
      <div style="font-weight: bold;">Total Mass: ${totalMass.toFixed(0)}g</div>
    </div>
  `;
}

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    const btn = document.getElementById('create-material-button');
    if (btn) {
      btn.addEventListener('click', () => {
        if (!newMaterialBuffer || newMaterialBuffer.getTotalVolumeCm3() === 0) {
          alert('Add at least one substance to create a material');
          return;
        }

        const name = document.getElementById('new-material-name').value || 'Unnamed Material';
        newMaterialBuffer.name = name;

        const existingMatch = findMatchingMaterialBatch(newMaterialBuffer);
        if (existingMatch) {
          existingMatch.merge(newMaterialBuffer);
        } else {
          state.materials[newMaterialBuffer.id] = newMaterialBuffer;
        }
        newMaterialBuffer = null;

        document.getElementById('new-material-name').value = '';
        document.getElementById('new-material-preview').innerHTML = '';
        renderAllTabs();
      });
    }

    const mergeBtn = document.getElementById('merge-materials-button');
    if (mergeBtn) {
      mergeBtn.addEventListener('click', () => {
        const firstId = document.getElementById('merge-material-a-select').value;
        const secondId = document.getElementById('merge-material-b-select').value;
        if (!firstId || !secondId || firstId === secondId) {
          alert('Select two different material batches to merge.');
          return;
        }

        const first = state.materials[firstId];
        const second = state.materials[secondId];
        if (!first || !second) return;

        const merged = new Material(`${first.name} + ${second.name}`);
        merged.merge(first);
        merged.merge(second);

        delete state.materials[firstId];
        delete state.materials[secondId];
        state.materials[merged.id] = merged;
        const pureName = getPureMaterialNameFromComposition(merged);
        if (pureName) merged.name = pureName;
        persistState();
        renderAllTabs();
      });
    }
  }, 100);
});

// ============================================================================
// CRAFTING TAB
// ============================================================================

function renderCraftingTab() {
  updateCraftMaterialSelect();
  updateCraftTemplateSelect();
  updateAssembleTemplateSelect();
  renderCraftingInventorySummaries();
}

function getPreviewPartSystems(materialId, templateId) {
  const material = state.materials[materialId];
  const template = state.partTemplates[templateId];
  if (!material || !template) return { consumed: 0, part: null };

  const availableVolume = material.getUsableVolumeCm3();
  const consumed = Math.min(template.volumeCm3, availableVolume);
  const ratio = availableVolume > 0 ? consumed / availableVolume : 0;
  const previewMaterial = new Material(`${material.name} preview`);
  previewMaterial.substances = Object.fromEntries(Object.entries(material.substances).map(([id, volume]) => [id, volume * ratio]));
  return { consumed, part: new Part('Preview', template, previewMaterial) };
}

function updateCraftMaterialSelect() {
  const select = document.getElementById('craft-material-select');
  const systemsDiv = document.getElementById('craft-material-systems');
  select.innerHTML = '<option value="">Select material for crafting...</option>';
  systemsDiv.innerHTML = '<p class="empty">Select a source material to inspect its composition and calculated systems.</p>';

  Object.entries(state.materials).forEach(([id, material]) => {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = `${material.name} (${material.getTotalVolumeCm3().toFixed(1)} cm\u00b3)`;
    select.appendChild(option);
  });

  select.onchange = (e) => {
    const materialId = e.target.value;
    const material = state.materials[materialId];
    if (!material) {
      systemsDiv.innerHTML = '<p class="empty">Select a source material to inspect its composition and calculated systems.</p>';
      return;
    }

    const systemsHtml = visibleSystemsHtml(material, true);

    const totalVolume = material.getTotalVolumeCm3();
    const usableVolume = material.getUsableVolumeCm3();
    const junkVolume = material.getJunkVolumeCm3();
    const compositionHtml = material.getCompositionEntries(state.substances)
      .map((entry) => {
        const percent = totalVolume > 0 ? (entry.volumeCm3 / totalVolume) * 100 : 0;
        return `<div class="source-composition-row"><span>${escapeHtml(entry.substanceName)}${entry.isJunk ? ' (Junk)' : ''}</span><strong>${entry.volumeCm3.toFixed(1)} cm³ · ${percent.toFixed(1)}%</strong></div>`;
      })
      .join('');

    systemsDiv.innerHTML = `
      <div class="source-material-card">
        <h4>${escapeHtml(material.name)}</h4>
        <div class="source-material-summary">
          <span>Total: <strong>${totalVolume.toFixed(1)} cm³</strong></span>
          <span>Usable: <strong>${usableVolume.toFixed(1)} cm³</strong></span>
          <span>Junk: <strong>${junkVolume.toFixed(1)} cm³</strong></span>
          <span>Mass: <strong>${material.getTotalMassGrams(state.substances).toFixed(1)}g</strong></span>
        </div>
        <div class="source-composition"><strong>Composition</strong>${compositionHtml || '<p class="empty">No constituents</p>'}</div>
        <div class="calculation-display">
          <h4>Calculated Systems</h4>
          ${systemsHtml}
        </div>
      </div>
    `;

    const templateId = document.getElementById('craft-template-select').value;
    if (templateId) {
      const preview = getPreviewPartSystems(materialId, templateId);
      const previewSystems = preview.part ? visibleSystemsHtml(preview.part) : '<p class="empty">No preview available.</p>';

      const infoDiv = document.getElementById('template-info');
      infoDiv.innerHTML = `
        <div class="template-card">
          <div><strong>${escapeHtml(state.partTemplates[templateId].name)}</strong></div>
          <div>Type: ${escapeHtml(state.partTemplates[templateId].partType.name)}</div>
          <div>Material consumed: ${preview.consumed.toFixed(1)} cm³</div>
          <div>Volume required: ${state.partTemplates[templateId].volumeCm3} cm³</div>
          <div style="font-size: 0.9em; color: #666; margin-top: 4px;">${escapeHtml(state.partTemplates[templateId].description)}</div>
          <div class="calculation-display" style="margin-top: 8px;">${previewSystems}</div>
        </div>
      `;
    }
  };
}

function updateCraftTemplateSelect() {
  const select = document.getElementById('craft-template-select');
  select.innerHTML = '<option value="">Select part template...</option>';

  Object.entries(state.partTemplates).forEach(([id, template]) => {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = `${template.name} (${template.volumeCm3} cm³)`;
    select.appendChild(option);
  });

  select.onchange = (e) => {
    const templateId = e.target.value;
    const template = state.partTemplates[templateId];
    const infoDiv = document.getElementById('template-info');
    const materialId = document.getElementById('craft-material-select').value;

    if (!template) {
      infoDiv.innerHTML = '';
      return;
    }

    if (materialId) {
      const preview = getPreviewPartSystems(materialId, templateId);
      const previewSystems = preview.part ? visibleSystemsHtml(preview.part) : '<p class="empty">No preview available.</p>';

      infoDiv.innerHTML = `
        <div class="template-card">
          <div><strong>${escapeHtml(template.name)}</strong></div>
          <div>Type: ${escapeHtml(template.partType.name)}</div>
          <div>Material consumed: ${preview.consumed.toFixed(1)} cm³</div>
          <div>Volume required: ${template.volumeCm3} cm\u00b3</div>
          <div style="font-size: 0.9em; color: #666; margin-top: 4px;">${escapeHtml(template.description)}</div>
          <div class="calculation-display" style="margin-top: 8px;">${previewSystems}</div>
        </div>
      `;
    } else {
      infoDiv.innerHTML = `
        <div class="template-card">
          <div><strong>${escapeHtml(template.name)}</strong></div>
          <div>Type: ${escapeHtml(template.partType.name)}</div>
          <div>Volume Required: ${template.volumeCm3} cm\u00b3</div>
          <div style="font-size: 0.9em; color: #666; margin-top: 4px;">${escapeHtml(template.description)}</div>
        </div>
      `;
    }
  };
}

function renderCraftingInventorySummaries() {
  const partsEl = document.getElementById('craft-parts-inventory');
  const itemsEl = document.getElementById('craft-item-inventory');
  const itemPartsEl = document.getElementById('craft-item-parts-inventory');

  if (partsEl) {
    const parts = Object.values(state.parts);
    partsEl.innerHTML = parts.length ? parts.map((part) => `<div class="mini-inventory-card">${escapeHtml(part.name)} (${escapeHtml(part.template.partType.name)})${part.usedInItemId ? ' — assembled' : ''}</div>`).join('') : '<p class="empty">No parts in inventory</p>';
  }

  if (itemsEl) {
    const items = Object.values(state.items);
    itemsEl.innerHTML = items.length ? items.map((item) => `<div class="mini-inventory-card">${escapeHtml(item.name)}</div>`).join('') : '<p class="empty">No items in inventory</p>';
  }

  if (itemPartsEl) {
    const parts = Object.values(state.parts).filter((part) => !part.usedInItemId);
    itemPartsEl.innerHTML = parts.length ? parts.map((part) => `<div class="mini-inventory-card">${escapeHtml(part.name)} • ${escapeHtml(part.template.name)}</div>`).join('') : '<p class="empty">No parts available for item assembly</p>';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    const btn = document.getElementById('create-part-button');
    if (btn) {
      btn.addEventListener('click', () => {
        const materialId = document.getElementById('craft-material-select').value;
        const templateId = document.getElementById('craft-template-select').value;
        const partName = document.getElementById('part-name').value;

        if (!materialId || !templateId) {
          alert('Please select a material and template before crafting a part.');
          return;
        }

        const material = state.materials[materialId];
        const template = state.partTemplates[templateId];
        const preview = getPreviewPartSystems(materialId, templateId);

        if (preview.consumed <= 0 || !material || material.getUsableVolumeCm3() < template.volumeCm3) {
          alert('Not enough usable material to craft that part.');
          return;
        }

        const resolvedPartName = (partName || '').trim() || `${material.name} ${template.name}`;
        const part = createPart(resolvedPartName, template, material);
        if (!part) {
          alert('Not enough material for this template.');
          return;
        }

        const output = document.getElementById('part-created-output');
        const partSystems = preview.part ? visibleSystemsHtml(preview.part) : '<p class="empty">No calculated system output.</p>';

        output.innerHTML = `
          <div class="success">
            <strong>✓ Part Created: ${escapeHtml(resolvedPartName)}</strong><br>
            Template: ${escapeHtml(template.name)}<br>
            Material consumed: ${preview.consumed.toFixed(1)} cm³<br>
            Type: ${escapeHtml(template.partType.name)}<br>
            <div class="calculation-display">${partSystems}</div>
          </div>
        `;

        document.getElementById('part-name').value = resolvedPartName;
        document.getElementById('craft-material-select').value = materialId;
        document.getElementById('craft-template-select').value = templateId;
        setTimeout(() => {
          renderAllTabs();
        }, 500);
      });
    }
  }, 100);
});

// ============================================================================
// ASSEMBLY
// ============================================================================

function updateAssembleTemplateSelect() {
  const select = document.getElementById('assemble-template-select');
  select.innerHTML = '<option value="">Select item template...</option>';

  Object.entries(state.itemTemplates).forEach(([id, template]) => {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = template.name;
    select.appendChild(option);
  });

  select.onchange = (e) => {
    const templateId = e.target.value;
    const template = state.itemTemplates[templateId];
    const infoDiv = document.getElementById('assemble-template-info');

    if (!template) {
      infoDiv.innerHTML = '';
      document.getElementById('part-slots').innerHTML = '';
      return;
    }

    const requiredHtml = template.requiredParts
      .map((req) => `<li>${escapeHtml(req.partType.name)} × ${req.count || 1} (required)</li>`)
      .join('');
    const electiveHtml = template.electiveParts.map((elec) => `<li>${escapeHtml(elec.partType.name)} × ${elec.count || 1} (optional)</li>`).join('');

    infoDiv.innerHTML = `
      <div class="template-card">
        <div><strong>${escapeHtml(template.name)}</strong></div>
        <div>${escapeHtml(template.description)}</div>
        <div style="margin-top: 8px;">
          <strong>Parts Required:</strong>
          <ul style="margin: 4px 0 0 20px;">${requiredHtml}${electiveHtml}</ul>
        </div>
      </div>
    `;

    renderPartSlots(template);
  };
}

function renderPartSlots(template) {
  const slotsDiv = document.getElementById('part-slots');
  const expandSlots = (entries, required) => entries.flatMap((entry) =>
    Array.from({ length: entry.count || 1 }, (_, index) => ({ ...entry, required, ordinal: index + 1 }))
  );
  const allSlots = [...expandSlots(template.requiredParts, true), ...expandSlots(template.electiveParts, false)];

  const slots = allSlots
    .map((slot, index) => {
      const compatibleParts = Object.values(state.parts).filter(
        (part) => part.template.partType.id === slot.partType.id && !part.usedInItemId
      );

      const optionsHtml = compatibleParts
        .map((part) => `<option value="${part.id}">${escapeHtml(part.name)}</option>`)
        .join('');

      return `
        <div class="slot">
          <label>${escapeHtml(slot.partType.name)} ${slot.ordinal}${slot.required ? ' (required)' : ' (optional)'}</label>
          <select class="part-slot-select" data-slot-index="${index}">
            <option value="">-- Select Part --</option>
            ${optionsHtml}
          </select>
        </div>
      `;
    })
    .join('');

  slotsDiv.innerHTML = slots;
}

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    const btn = document.getElementById('assemble-button');
    if (btn) {
      btn.addEventListener('click', () => {
        const templateId = document.getElementById('assemble-template-select').value;
        const itemName = document.getElementById('item-name').value;

        if (!templateId || !itemName) {
          alert('Please select template and enter item name');
          return;
        }

        const template = state.itemTemplates[templateId];
        const parts = Array.from(document.querySelectorAll('.part-slot-select'))
          .map((slot) => state.parts[slot.value])
          .filter(Boolean);
        const result = assembleItem(itemName, template, parts);
        if (!result.valid) {
          alert(result.message);
          return;
        }

        const output = document.getElementById('item-created-output');
        output.innerHTML = `
          <div class="success">
            <strong>\u2713 Item Created: ${escapeHtml(itemName)}</strong><br>
            Parts Used: ${parts.length}
          </div>
        `;

        document.getElementById('item-name').value = '';
        setTimeout(() => {
          renderAllTabs();
        }, 500);
      });
    }
  }, 100);
});

// ============================================================================
// INVENTORY TAB
// ============================================================================

function renderInventoryTab() {
  renderPartsList();
  renderItemsList();
}

function renderPartsList() {
  const container = document.getElementById('parts-list');
  const parts = Object.values(state.parts);

  if (parts.length === 0) {
    container.innerHTML = '<p class="empty">No parts created yet.</p>';
    return;
  }

  container.innerHTML = parts
    .map((part) => {
      const totalMass = part.material.getTotalMassGrams(state.substances);
      const systemsHtml = visibleSystemsHtml(part);

      return `
        <div class="inventory-card">
          <div class="card-header">
            <h4>${escapeHtml(part.name)}</h4>
            <span class="type-badge">${escapeHtml(part.template.partType.name)}</span>
          </div>
          <div class="card-body">
            <div>Template: ${escapeHtml(part.template.name)}</div>
            <div>Mass: ${totalMass.toFixed(0)}g</div>
            <div>Status: ${part.usedInItemId ? `Assembled into ${escapeHtml(state.items[part.usedInItemId]?.name || 'an item')}` : 'Available'}</div>
            <div class="calculation-display">${systemsHtml}</div>
            <button class="btn btn-secondary edit-part-button" data-part-id="${part.id}">Edit</button>
            <button class="btn btn-danger delete-part-button" data-part-id="${part.id}">Delete</button>
          </div>
        </div>
      `;
    })
    .join('');

  document.querySelectorAll('.edit-part-button').forEach((button) => {
    button.addEventListener('click', () => {
      const part = state.parts[button.dataset.partId];
      const name = promptText('Part name', part.name);
      if (name === null || !name) return;
      const templateName = promptText(`Part template (${Object.values(state.partTemplates).map((template) => template.name).join(', ')})`, part.template.name);
      if (templateName === null) return;
      const template = Object.values(state.partTemplates).find((entry) => entry.name.toLowerCase() === templateName.toLowerCase());
      if (!template) return alert('No part template has that name.');
      const previousTemplate = part.template;
      part.name = name;
      part.template = template;
      if (part.usedInItemId) {
        const owner = state.items[part.usedInItemId];
        const validation = validateItemParts(owner.template, owner.parts, owner.id);
        if (!validation.valid) {
          part.template = previousTemplate;
          return alert(`That template would invalidate ${owner.name}: ${validation.message}`);
        }
      }
      Object.values(state.substances).forEach((substance) => {
        const current = part.material.substances[substance.id] ?? '';
        const volumeText = promptText(`${substance.name} usable volume in this part (cm³; blank removes)`, current);
        if (volumeText === null) return;
        if (volumeText === '') delete part.material.substances[substance.id];
        else if (Number.isFinite(Number(volumeText)) && Number(volumeText) >= 0) part.material.substances[substance.id] = Number(volumeText);
      });
      persistState();
      renderAllTabs();
    });
  });
  document.querySelectorAll('.delete-part-button').forEach((button) => {
    button.addEventListener('click', () => {
      const part = state.parts[button.dataset.partId];
      if (confirmDelete(`part “${part.name}”`)) {
        deletePart(part.id);
        renderAllTabs();
      }
    });
  });
}

function renderItemsList() {
  const container = document.getElementById('items-list');
  const items = Object.values(state.items);

  if (items.length === 0) {
    container.innerHTML = '<p class="empty">No items assembled yet.</p>';
    return;
  }

  container.innerHTML = items
    .map((item) => {
      let totalMass = 0;
      item.parts.forEach((part) => {
        totalMass += part.material.getTotalMassGrams(state.substances);
      });

      const systemsHtml = visibleSystemsHtml(item);

      const partsList = item.parts.map((part) => `<li>${escapeHtml(part.name)}</li>`).join('');

      return `
        <div class="inventory-card">
          <div class="card-header">
            <h4>${escapeHtml(item.name)}</h4>
            <span class="type-badge">${escapeHtml(item.template.name)}</span>
          </div>
          <div class="card-body">
            <div>Total Mass: ${totalMass.toFixed(0)}g</div>
            <strong>Components:</strong>
            <ul style="margin: 4px 0 0 20px;">${partsList}</ul>
            <div class="calculation-display" style="margin-top: 12px;">${systemsHtml}</div>
            <button class="btn btn-secondary edit-item-button" data-item-id="${item.id}">Edit</button>
            <button class="btn btn-danger delete-item-button" data-item-id="${item.id}">Disassemble &amp; Delete</button>
          </div>
        </div>
      `;
    })
    .join('');

  document.querySelectorAll('.edit-item-button').forEach((button) => {
    button.addEventListener('click', () => {
      const item = state.items[button.dataset.itemId];
      const name = promptText('Item name', item.name);
      if (name === null || !name) return;
      const templateName = promptText(`Item template (${Object.values(state.itemTemplates).map((template) => template.name).join(', ')})`, item.template.name);
      if (templateName === null) return;
      const template = Object.values(state.itemTemplates).find((entry) => entry.name.toLowerCase() === templateName.toLowerCase());
      if (!template) return alert('No item template has that name.');
      const validation = validateItemParts(template, item.parts, item.id);
      if (!validation.valid) return alert(`The existing parts do not fit that template: ${validation.message}`);
      item.name = name;
      item.template = template;
      persistState();
      renderAllTabs();
    });
  });
  document.querySelectorAll('.delete-item-button').forEach((button) => {
    button.addEventListener('click', () => {
      const item = state.items[button.dataset.itemId];
      if (confirm(`Disassemble and delete “${item.name}”? Its parts will become available again.`)) {
        deleteItem(item.id);
        renderAllTabs();
      }
    });
  });
}

// ============================================================================
// SYSTEMS TAB
// ============================================================================

function renderSystemsTab() {
  renderSystemsList();
}

const TARGET_LABELS = { substance: 'Substances', partType: 'Part Types', partTemplate: 'Part Templates', itemTemplate: 'Item Templates' };

function renderCentralSystemData(system) {
  const sections = SYSTEM_TARGETS.filter((target) => system.targets[target]).map((target) => {
    const entities = Object.values(getTargetCollection(target));
    return `
      <div class="system-data-target">
        <h5>${TARGET_LABELS[target]}</h5>
        ${entities.map((entity) => `<div class="central-entity-data"><h6>${escapeHtml(entity.name)}</h6>${renderEntitySystemData(entity, target, system.id)}</div>`).join('') || '<p class="empty">No definitions of this type exist.</p>'}
      </div>`;
  });
  return sections.join('') || '<p class="empty">Select at least one attachment target to edit system data.</p>';
}

function renderSystemsList() {
  const container = document.getElementById('systems-list');
  const systems = Object.values(state.systems);

  if (!systems.length) {
    container.innerHTML = '<p class="empty">No systems registered. Create one below or reset to restore the defaults.</p>';
    return;
  }

  container.innerHTML = systems.map((system) => `
    <div class="system-editor" data-system-id="${system.id}">
      <div class="system-editor-header">
        <div><h3>${escapeHtml(system.name)}</h3><p>${escapeHtml(system.description || 'No description')}</p></div>
        <span class="type-badge">${system.processorId === 'volume' ? 'Volume-scaled' : 'Flat'}</span>
      </div>
      <div class="system-actions">
        <button class="btn btn-secondary edit-system-button">Edit System</button>
        <button class="btn btn-danger delete-system-button">Delete System</button>
      </div>

      <div class="system-config-grid">
        <div>
          <h4>Attachment Targets</h4>
          ${SYSTEM_TARGETS.map((target) => `<label class="system-toggle"><input class="system-target-toggle" type="checkbox" data-target="${target}" ${system.targets[target] ? 'checked' : ''}> ${TARGET_LABELS[target]}</label>`).join('')}
          <p class="field-help">Unchecked target data is preserved but hidden and ignored.</p>
        </div>
        <div>
          <h4>Rules</h4>
          <label class="system-toggle">Processor
            <select class="system-processor-select">
              <option value="flat" ${system.processorId === 'flat' ? 'selected' : ''}>Flat amount</option>
              <option value="volume" ${system.processorId === 'volume' ? 'selected' : ''}>Linearly scaled by volume</option>
            </select>
          </label>
          <label class="system-toggle"><input class="system-behavior-toggle" type="checkbox" data-behavior="inherit" ${system.behaviors.inherit ? 'checked' : ''}> Live inheritance</label>
          <label class="system-toggle"><input class="system-behavior-toggle" type="checkbox" data-behavior="addNumeric" ${system.behaviors.addNumeric ? 'checked' : ''}> Add numeric fields</label>
          <label class="system-toggle"><input class="system-calculation-toggle" type="checkbox" ${system.showInCalculations ? 'checked' : ''}> Show in crafting calculations</label>
        </div>
      </div>

      <div class="system-schema-grid">
        <div>
          <div class="system-subheading"><h4>Fields</h4><button class="btn btn-secondary add-system-field">Add Field</button></div>
          ${Object.values(system.fields).map((field) => `
            <div class="schema-row" data-field-id="${field.id}">
              <div><strong>${escapeHtml(field.name)}</strong> <span class="type-badge">${field.type}</span>
                ${field.type === 'choice' ? `<div class="choice-options">${field.options.map((option) => `<span>${escapeHtml(option.label)} <button class="edit-choice-option" data-option-id="${option.id}">edit</button><button class="delete-choice-option" data-option-id="${option.id}">×</button></span>`).join('')} <button class="add-choice-option">+ option</button></div>` : ''}
              </div>
              <div><button class="edit-system-field">Edit</button><button class="delete-system-field">Delete</button></div>
            </div>`).join('') || '<p class="empty">No fields defined.</p>'}
        </div>
        <div>
          <div class="system-subheading"><h4>Labels</h4><button class="btn btn-secondary add-system-label">Add Label</button></div>
          ${Object.values(system.labels).map((label) => `<div class="schema-row" data-label-id="${label.id}"><div><strong>${escapeHtml(label.name)}</strong><small>${escapeHtml(label.description || '')}</small></div><div><button class="edit-system-label">Edit</button><button class="delete-system-label">Delete</button></div></div>`).join('') || '<p class="empty">No labels defined.</p>'}
        </div>
      </div>

      <div class="central-system-data">
        <h4>Attached Data</h4>
        ${renderCentralSystemData(system)}
      </div>
    </div>
  `).join('');

  container.querySelectorAll('.system-editor').forEach((editor) => {
    const system = state.systems[editor.dataset.systemId];
    editor.querySelector('.edit-system-button').addEventListener('click', () => {
      const name = promptText('System name', system.name); if (!name) return;
      const description = promptText('System description', system.description); if (description === null) return;
      system.name = name; system.description = description; persistState(); renderAllTabs();
    });
    editor.querySelector('.delete-system-button').addEventListener('click', () => {
      if (confirmDelete(`system “${system.name}”`)) { deleteSystemDefinition(system.id); renderAllTabs(); }
    });
    editor.querySelectorAll('.system-target-toggle').forEach((input) => input.addEventListener('change', () => { system.targets[input.dataset.target] = input.checked; persistState(); renderAllTabs(); }));
    editor.querySelector('.system-processor-select').addEventListener('change', (event) => { system.processorId = event.target.value === 'volume' ? 'volume' : 'flat'; persistState(); renderAllTabs(); });
    editor.querySelectorAll('.system-behavior-toggle').forEach((input) => input.addEventListener('change', () => { system.behaviors[input.dataset.behavior] = input.checked; persistState(); renderAllTabs(); }));
    editor.querySelector('.system-calculation-toggle').addEventListener('change', (event) => { system.showInCalculations = event.target.checked; persistState(); renderAllTabs(); });

    editor.querySelector('.add-system-field').addEventListener('click', () => {
      const name = promptText('Field name', 'Value'); if (!name) return;
      const type = promptText('Field type: number, text, boolean, or choice', 'text'); if (!FIELD_TYPES.includes(type)) return alert('Unknown field type.');
      const options = type === 'choice' ? (promptText('Choice options, comma separated', '') || '').split(',').map((value) => value.trim()).filter(Boolean) : [];
      system.addField(name, type, options); renderAllTabs();
    });
    editor.querySelectorAll('.schema-row[data-field-id]').forEach((row) => {
      const field = system.fields[row.dataset.fieldId];
      row.querySelector('.edit-system-field').addEventListener('click', () => {
        const name = promptText('Field name', field.name); if (!name) return;
        const type = promptText('Field type: number, text, boolean, or choice', field.type); if (!FIELD_TYPES.includes(type)) return alert('Unknown field type.');
        field.name = name;
        if (type !== field.type && confirm('Changing type clears all values stored for this field. Continue?')) changeSystemFieldType(system.id, field.id, type, type === 'choice' ? (promptText('Choice options, comma separated', '') || '').split(',').map((value) => value.trim()).filter(Boolean) : []);
        else persistState();
        renderAllTabs();
      });
      row.querySelector('.delete-system-field').addEventListener('click', () => { if (confirmDelete(`field “${field.name}”`)) { deleteSystemField(system.id, field.id); renderAllTabs(); } });
      row.querySelector('.add-choice-option')?.addEventListener('click', () => { const label = promptText('Option label', ''); if (!label) return; field.options.push({ id: generateId('option'), label }); persistState(); renderAllTabs(); });
      row.querySelectorAll('.edit-choice-option').forEach((button) => button.addEventListener('click', () => { const option = field.options.find((entry) => entry.id === button.dataset.optionId); const label = promptText('Option label', option.label); if (!label) return; option.label = label; persistState(); renderAllTabs(); }));
      row.querySelectorAll('.delete-choice-option').forEach((button) => button.addEventListener('click', () => { if (confirm('Delete this option and clear values that use it?')) { deleteChoiceOption(system.id, field.id, button.dataset.optionId); renderAllTabs(); } }));
    });

    editor.querySelector('.add-system-label').addEventListener('click', () => { const name = promptText('Label name', ''); if (!name) return; const description = promptText('Label description', '') ?? ''; system.addLabel(name, description); renderAllTabs(); });
    editor.querySelectorAll('.schema-row[data-label-id]').forEach((row) => {
      const label = system.labels[row.dataset.labelId];
      row.querySelector('.edit-system-label').addEventListener('click', () => { const name = promptText('Label name', label.name); if (!name) return; const description = promptText('Label description', label.description); if (description === null) return; label.name = name; label.description = description; persistState(); renderAllTabs(); });
      row.querySelector('.delete-system-label').addEventListener('click', () => { if (confirmDelete(`label “${label.name}”`)) { deleteSystemLabel(system.id, label.id); renderAllTabs(); } });
    });
  });
  bindSystemDataInputs(container);
}

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    const btn = document.getElementById('create-system-button');
    if (btn) {
      btn.addEventListener('click', () => {
        const name = document.getElementById('system-name').value;
        const description = document.getElementById('system-description').value;

        if (!name) {
          alert('Please enter a system name');
          return;
        }

        const processor = document.getElementById('system-processor').value;
        const system = createSystemDefinition(name, description, processor);
        document.getElementById('system-name').value = '';
        document.getElementById('system-description').value = '';
        document.getElementById('system-processor').value = 'flat';

        renderAllTabs();
      });
    }
  }, 100);
});

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('export-data-button')?.addEventListener('click', () => {
    const blob = new Blob([exportCraftingData()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `crafting-system-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  });

  const importInput = document.getElementById('import-data-file');
  document.getElementById('import-data-button')?.addEventListener('click', () => importInput?.click());
  importInput?.addEventListener('change', async () => {
    const file = importInput.files?.[0];
    if (!file) return;
    try {
      if (!confirm('Import this crafting workspace? The imported data will replace all current local data.')) return;
      importCraftingData(await file.text());
      newMaterialBuffer = null;
      renderAllTabs();
      alert('Crafting data imported successfully.');
    } catch (error) {
      alert(`Import failed: ${error.message}`);
    } finally {
      importInput.value = '';
    }
  });

  document.getElementById('reset-data-button')?.addEventListener('click', () => {
    if (!confirm('Reset all crafting data? This permanently replaces the current browser data with the defaults.')) return;
    newMaterialBuffer = null;
    resetCraftingData();
    renderAllTabs();
    alert('Crafting data was reset to defaults.');
  });

  const designButton = document.querySelector('.tab-button[data-tab="design"]');
  const designTab = document.getElementById('design-tab');
  if (designButton) designButton.classList.add('active');
  if (designTab) designTab.classList.add('active');

  document.querySelectorAll('.tab-button').forEach((button) => {
    if (button.dataset.tab !== 'design') {
      button.classList.remove('active');
    }
  });
  document.querySelectorAll('.tab-content').forEach((tab) => {
    if (tab.id !== 'design-tab') {
      tab.classList.remove('active');
    }
  });

  renderAllTabs();
});
