// ============================================================================
// UI RENDERING AND INTERACTION LOGIC
// ============================================================================

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
  renderStatsDefinitions();
  renderSubstancesDefinitions();
  renderPartTypesDefinitions();
  renderPartTemplatesDefinitions();
  renderItemTemplatesDefinitions();
  updateDesignSelects();
}

function renderStatsDefinitions() {
  const container = document.getElementById('design-stats-list');
  const stats = Object.values(state.stats);

  if (stats.length === 0) {
    container.innerHTML = '<p class="empty">No stats defined yet.</p>';
    return;
  }

  container.innerHTML = stats
    .map((stat) => `
      <div class="definition-card">
        <h4>${stat.name}</h4>
        <p>${stat.description || 'No description'}</p>
        <div class="definition-id">${stat.id.substr(0, 20)}</div>
        <button class="btn btn-secondary delete-stat-button" data-stat-id="${stat.id}">Delete Stat</button>
      </div>
    `)
    .join('');

  document.querySelectorAll('.delete-stat-button').forEach((button) => {
    button.addEventListener('click', () => {
      const statId = button.dataset.statId;
      if (deleteStat(statId)) {
        renderAllTabs();
      }
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    const btn = document.getElementById('design-create-stat-button');
    if (btn) {
      btn.addEventListener('click', () => {
        const name = document.getElementById('design-stat-name').value;
        const description = document.getElementById('design-stat-description').value;

        if (!name) {
          alert('Please enter a stat name');
          return;
        }

        createStat(name, description);
        document.getElementById('design-stat-name').value = '';
        document.getElementById('design-stat-description').value = '';
        renderAllTabs();
      });
    }
  }, 100);
});

function renderSubstancesDefinitions() {
  const container = document.getElementById('design-substances-list');
  const substances = Object.values(state.substances);

  if (substances.length === 0) {
    container.innerHTML = '<p class="empty">No substances defined yet.</p>';
    return;
  }

  container.innerHTML = substances
    .map((substance) => {
      const statsHtml = Object.entries(substance.statsPerCm3)
        .map(([statId, value]) => {
          const stat = state.stats[statId];
          return stat ? `<div>${stat.name}: +${value}</div>` : '';
        })
        .join('');

      return `
        <div class="definition-card">
          <h4>${substance.name}</h4>
          <div>Density: <strong>${substance.densityGramsPerCm3} g/cm³</strong></div>
          <div style="margin-top: 8px; font-size: 0.9em;">${substance.description || 'No description'}</div>
          <div class="substance-stats" style="margin-top: 8px; font-size: 0.9em;">${statsHtml || '<em>No stats</em>'}</div>
        </div>
      `;
    })
    .join('');
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

        const substance = createSubstance(name, density, description);

        document.querySelectorAll('.design-stat-checkbox:checked').forEach((checkbox) => {
          const statId = checkbox.value;
          const valueInput = document.getElementById(`design-stat-value-${statId}`);
          const value = parseFloat(valueInput.value);
          if (!isNaN(value)) {
            substance.addStat(state.stats[statId], value);
          }
        });

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
  const statsList = Object.values(state.stats);
  const statsHtml = statsList
    .map(
      (stat) => `
        <div class="stat-attachment-item">
          <label>
            <input type="checkbox" class="design-stat-checkbox" value="${stat.id}" />
            ${stat.name}:
            <input type="number" id="design-stat-value-${stat.id}" placeholder="Value per cm³" step="0.01" style="width: 100px;" />
          </label>
        </div>
      `
    )
    .join('');
  const statDiv = document.getElementById('design-substance-stats');
  if (statDiv) statDiv.innerHTML = statsHtml || '<p class="empty">No stats defined yet</p>';

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
        <h4>${type.name}</h4>
        <p>${type.description || 'No description'}</p>
      </div>
    `)
    .join('');
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
        <h4>${template.name}</h4>
        <div>Type: <strong>${template.partType.name}</strong></div>
        <div>Volume: <strong>${template.volumeCm3} cm³</strong></div>
        <p>${template.description || 'No description'}</p>
      </div>
    `)
    .join('');
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
        const requiredHtml = template.requiredParts.map((r) => `<li>${r.partType.name}<button class="remove-part-button" data-template-id="${template.id}" data-role="required" data-parttype-id="${r.partType.id}">Remove</button></li>`).join('');
        const optionalHtml = template.electiveParts.map((o) => `<li>${o.partType.name}<button class="remove-part-button" data-template-id="${template.id}" data-role="optional" data-parttype-id="${o.partType.id}">Remove</button></li>`).join('');

        return `
          <div class="definition-card">
            <h4>${template.name}</h4>
            <p>${template.description || 'No description'}</p>
            <div style="margin-top: 8px;">
              <strong>Parts:</strong>
              <ul style="margin: 4px 0 0 20px;">${requiredHtml}${optionalHtml}</ul>
            </div>
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

  const partContainer = document.getElementById('design-item-parts');
  if (partContainer) {
    const partTypes = Object.values(state.partTypes);
    partContainer.innerHTML = `
      <div class="item-part-group">
        <h3>Required Parts</h3>
        <div class="part-type-row">
          <select id="design-item-required-select">
            <option value="">Select required part type...</option>
            ${partTypes.map((partType) => `<option value="${partType.id}">${partType.name}</option>`).join('')}
          </select>
          <button id="design-add-required-button" class="btn btn-secondary">Add Required Part</button>
        </div>
      </div>
      <div class="item-part-group">
        <h3>Optional Parts</h3>
        <div class="part-type-row">
          <select id="design-item-optional-select">
            <option value="">Select optional part type...</option>
            ${partTypes.map((partType) => `<option value="${partType.id}">${partType.name}</option>`).join('')}
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
      template.requirePart(state.partTypes[partTypeId]);
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
      template.electivePart(state.partTypes[partTypeId]);
      document.getElementById('design-item-optional-select').value = '';
      renderAllTabs();
    });
  }
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

        const template = createItemTemplate(name, description);

        document.querySelectorAll('#design-item-required .design-item-parttype-select').forEach((select) => {
          const partTypeId = select.value;
          if (partTypeId) {
            template.requirePart(state.partTypes[partTypeId]);
          }
        });

        document.querySelectorAll('#design-item-optional .design-item-parttype-select').forEach((select) => {
          const partTypeId = select.value;
          if (partTypeId) {
            template.electivePart(state.partTypes[partTypeId]);
          }
        });

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
        .map(([name, volume]) => `<div class="comp-item">${name}: ${volume.toFixed(1)} cm\u00b3</div>`)
        .join('');

      const volumeControls = compositionEntries
        .map((entry) => `
          <div class="material-volume-row">
            <span>${entry.substanceName}${entry.isJunk ? ' (Junk)' : ''}</span>
            <input type="number" min="0" step="0.1" value="${entry.volumeCm3.toFixed(1)}" data-material-id="${material.id}" data-substance-id="${entry.substanceId}" data-is-junk="${entry.isJunk}" class="material-substance-volume" />
          </div>
        `)
        .join('');

      return `
        <div class="material-card">
          <div class="material-header">
            <h4>${material.name}</h4>
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
              ${substance ? substance.name : 'Unknown'}${isJunk ? ' (Junk)' : ''}: ${volume.toFixed(1)} cm\u00b3
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
    const percent = parseFloat(document.getElementById('refine-junk-percent').value) || 100;
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
      output.innerHTML = `<p class="success">Separated ${totalRemoved.toFixed(1)} cm\u00b3 from ${material.name} into ${separatedBatch.name}.</p>`;
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
        newMaterialBuffer.addSubstance(substance, volume);

        document.getElementById('substance-volume').value = '';
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
    .map(([name, volume]) => `<div>${name}: ${volume.toFixed(1)} cm\u00b3</div>`)
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

function getMaterialStats(material) {
  const stats = {};
  Object.values(state.stats).forEach((stat) => {
    stats[stat.id] = 0;
  });

  Object.entries(material.substances).forEach(([substanceId, volumeCm3]) => {
    const substance = state.substances[substanceId];
    if (!substance) return;

    Object.values(state.stats).forEach((stat) => {
      const statPerCm3 = substance.statsPerCm3[stat.id] || 0;
      stats[stat.id] += statPerCm3 * volumeCm3;
    });
  });

  return stats;
}

function getPreviewPartStats(materialId, templateId) {
  const material = state.materials[materialId];
  const template = state.partTemplates[templateId];
  if (!material || !template) return { consumed: 0, partStats: {}, type: '', materialName: '' };

  const availableVolume = material.getUsableVolumeCm3();
  const consumed = Math.min(template.volumeCm3, availableVolume);
  const ratio = availableVolume > 0 ? consumed / availableVolume : 0;
  const partStats = {};

  Object.values(state.stats).forEach((stat) => {
    partStats[stat.id] = 0;
  });

  Object.entries(material.substances).forEach(([substanceId, volumeCm3]) => {
    const substance = state.substances[substanceId];
    if (!substance) return;

    Object.values(state.stats).forEach((stat) => {
      const statPerCm3 = substance.statsPerCm3[stat.id] || 0;
      partStats[stat.id] += statPerCm3 * volumeCm3 * ratio;
    });
  });

  return { consumed, partStats, type: template.partType.name, materialName: material.name };
}

function updateCraftMaterialSelect() {
  const select = document.getElementById('craft-material-select');
  select.innerHTML = '<option value="">Select material for crafting...</option>';

  Object.entries(state.materials).forEach(([id, material]) => {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = `${material.name} (${material.getTotalVolumeCm3().toFixed(1)} cm\u00b3)`;
    select.appendChild(option);
  });

  select.onchange = (e) => {
    const materialId = e.target.value;
    const material = state.materials[materialId];
    const statsDiv = document.getElementById('craft-material-stats');

    if (!material) {
      statsDiv.innerHTML = '';
      return;
    }

    const stats = getMaterialStats(material);
    const statsHtml = Object.entries(stats)
      .map(([statId, value]) => {
        const stat = state.stats[statId];
        return `<div class="stat-item"><span>${stat.name}:</span> <strong>${value.toFixed(2)}</strong></div>`;
      })
      .join('');

    statsDiv.innerHTML = `<div class="stats-display">${statsHtml}</div>`;

    const templateId = document.getElementById('craft-template-select').value;
    if (templateId) {
      const preview = getPreviewPartStats(materialId, templateId);
      const previewStats = Object.entries(preview.partStats)
        .map(([statId, value]) => `<div class="stat-item"><span>${state.stats[statId]?.name || 'Stat'}:</span> <strong>${value.toFixed(2)}</strong></div>`)
        .join('');

      const infoDiv = document.getElementById('template-info');
      infoDiv.innerHTML = `
        <div class="template-card">
          <div><strong>${state.partTemplates[templateId].name}</strong></div>
          <div>Type: ${state.partTemplates[templateId].partType.name}</div>
          <div>Material consumed: ${preview.consumed.toFixed(1)} cm³</div>
          <div>Volume required: ${state.partTemplates[templateId].volumeCm3} cm³</div>
          <div style="font-size: 0.9em; color: #666; margin-top: 4px;">${state.partTemplates[templateId].description}</div>
          <div class="stats-display" style="margin-top: 8px;">${previewStats}</div>
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
      const preview = getPreviewPartStats(materialId, templateId);
      const previewStats = Object.entries(preview.partStats)
        .map(([statId, value]) => `<div class="stat-item"><span>${state.stats[statId]?.name || 'Stat'}:</span> <strong>${value.toFixed(2)}</strong></div>`)
        .join('');

      infoDiv.innerHTML = `
        <div class="template-card">
          <div><strong>${template.name}</strong></div>
          <div>Type: ${template.partType.name}</div>
          <div>Material consumed: ${preview.consumed.toFixed(1)} cm³</div>
          <div>Volume required: ${template.volumeCm3} cm\u00b3</div>
          <div style="font-size: 0.9em; color: #666; margin-top: 4px;">${template.description}</div>
          <div class="stats-display" style="margin-top: 8px;">${previewStats}</div>
        </div>
      `;
    } else {
      infoDiv.innerHTML = `
        <div class="template-card">
          <div><strong>${template.name}</strong></div>
          <div>Type: ${template.partType.name}</div>
          <div>Volume Required: ${template.volumeCm3} cm\u00b3</div>
          <div style="font-size: 0.9em; color: #666; margin-top: 4px;">${template.description}</div>
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
    partsEl.innerHTML = parts.length ? parts.map((part) => `<div class="mini-inventory-card">${part.name} (${part.template.partType.name})</div>`).join('') : '<p class="empty">No parts in inventory</p>';
  }

  if (itemsEl) {
    const items = Object.values(state.items);
    itemsEl.innerHTML = items.length ? items.map((item) => `<div class="mini-inventory-card">${item.name}</div>`).join('') : '<p class="empty">No items in inventory</p>';
  }

  if (itemPartsEl) {
    const parts = Object.values(state.parts);
    itemPartsEl.innerHTML = parts.length ? parts.map((part) => `<div class="mini-inventory-card">${part.name} • ${part.template.name}</div>`).join('') : '<p class="empty">No parts available for item assembly</p>';
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
        const preview = getPreviewPartStats(materialId, templateId);

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
        const partStats = Object.entries(preview.partStats)
          .map(([statId, value]) => `${state.stats[statId]?.name || 'Stat'}: ${value.toFixed(2)}`)
          .join(' • ');

        output.innerHTML = `
          <div class="success">
            <strong>✓ Part Created: ${resolvedPartName}</strong><br>
            Template: ${template.name}<br>
            Material consumed: ${preview.consumed.toFixed(1)} cm³<br>
            Type: ${template.partType.name}<br>
            Stats: ${partStats}
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

  select.addEventListener('change', (e) => {
    const templateId = e.target.value;
    const template = state.itemTemplates[templateId];
    const infoDiv = document.getElementById('assemble-template-info');

    if (!template) {
      infoDiv.innerHTML = '';
      document.getElementById('part-slots').innerHTML = '';
      return;
    }

    const requiredHtml = template.requiredParts
      .map((req) => `<li>${req.partType.name} (required)</li>`)
      .join('');
    const electiveHtml = template.electiveParts.map((elec) => `<li>${elec.partType.name} (optional)</li>`).join('');

    infoDiv.innerHTML = `
      <div class="template-card">
        <div><strong>${template.name}</strong></div>
        <div>${template.description}</div>
        <div style="margin-top: 8px;">
          <strong>Parts Required:</strong>
          <ul style="margin: 4px 0 0 20px;">${requiredHtml}${electiveHtml}</ul>
        </div>
      </div>
    `;

    renderPartSlots(template);
  });
}

function renderPartSlots(template) {
  const slotsDiv = document.getElementById('part-slots');
  const allSlots = [
    ...template.requiredParts.map((entry) => ({ ...entry, required: true })),
    ...template.electiveParts.map((entry) => ({ ...entry, required: false })),
  ];

  const slots = allSlots
    .map((slot, index) => {
      const compatibleParts = Object.values(state.parts).filter(
        (part) => part.template.partType.id === slot.partType.id
      );

      const optionsHtml = compatibleParts
        .map((part) => `<option value="${part.id}">${part.name}</option>`)
        .join('');

      return `
        <div class="slot">
          <label>${slot.partType.name}${slot.required ? '' : ' (optional)'}</label>
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
        const item = createItem(itemName, template);

        const slots = document.querySelectorAll('.part-slot-select');
        let partCount = 0;

        slots.forEach((slot) => {
          const partId = slot.value;
          if (partId) {
            const part = state.parts[partId];
            if (part) {
              item.addPart(part);
              partCount++;
            }
          }
        });

        const output = document.getElementById('item-created-output');
        output.innerHTML = `
          <div class="success">
            <strong>\u2713 Item Created: ${itemName}</strong><br>
            Parts Used: ${partCount}
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
      const stats = part.getStats(state.substances, state.stats);
      const totalMass = part.material.getTotalMassGrams(state.substances);

      const statsHtml = Object.entries(stats)
        .map(([statId, value]) => {
          const stat = state.stats[statId];
          return `<div class="stat-item"><span>${stat.name}:</span> ${value.toFixed(2)}</div>`;
        })
        .join('');

      return `
        <div class="inventory-card">
          <div class="card-header">
            <h4>${part.name}</h4>
            <span class="type-badge">${part.template.partType.name}</span>
          </div>
          <div class="card-body">
            <div>Template: ${part.template.name}</div>
            <div>Mass: ${totalMass.toFixed(0)}g</div>
            <div class="stats-display">${statsHtml}</div>
          </div>
        </div>
      `;
    })
    .join('');
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
      const stats = item.getStats(state.substances, state.stats);
      let totalMass = 0;
      item.parts.forEach((part) => {
        totalMass += part.material.getTotalMassGrams(state.substances);
      });

      const statsHtml = Object.entries(stats)
        .map(([statId, value]) => {
          const stat = state.stats[statId];
          return `<div class="stat-item"><span>${stat.name}:</span> ${value.toFixed(2)}</div>`;
        })
        .join('');

      const partsList = item.parts.map((part) => `<li>${part.name}</li>`).join('');

      return `
        <div class="inventory-card">
          <div class="card-header">
            <h4>${item.name}</h4>
            <span class="type-badge">${item.template.name}</span>
          </div>
          <div class="card-body">
            <div>Total Mass: ${totalMass.toFixed(0)}g</div>
            <strong>Components:</strong>
            <ul style="margin: 4px 0 0 20px;">${partsList}</ul>
            <div class="stats-display" style="margin-top: 12px;">${statsHtml}</div>
          </div>
        </div>
      `;
    })
    .join('');
}

// ============================================================================
// SYSTEMS TAB
// ============================================================================

function renderSystemsTab() {
  renderSystemsList();
}

function renderSystemsList() {
  const container = document.getElementById('systems-list');
  const systems = Object.values(state.systems);

  if (systems.length === 0) {
    container.innerHTML = '<p class="empty">No systems registered.</p>';
    return;
  }

  container.innerHTML = systems
    .map((system) => {
      const componentCount = Object.keys(system.components).length;
      return `
        <div class="system-card">
          <h4>${system.name}</h4>
          <p>${system.description}</p>
          <div class="component-count">Components: ${componentCount}</div>
        </div>
      `;
    })
    .join('');
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

        createComponentSystem(name, description);

        document.getElementById('system-name').value = '';
        document.getElementById('system-description').value = '';

        renderSystemsTab();
      });
    }
  }, 100);
});

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
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
