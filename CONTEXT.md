# Crafting System Prototype

This is a designer-facing creative-mode prototype for runtime-defined crafting systems. Designers define schemas, calculations, material classifications, and eligibility rules at runtime. Evaluated output and constraint validity remain live: editing a definition immediately affects existing Materials, Parts, and Items that refer to it.

## Crafting graph

1. Substances define density and attached system data.
2. Materials contain usable and junk Substance volumes.
3. Parts consume usable Material volume according to a Part Template and retain that composition snapshot.
4. Items assemble compatible Parts according to fixed Part Type slots on an Item Template.

Material, Part, and Item instances do not copy calculated system output or type assignments. They evaluate their related definitions whenever needed.

## Runtime systems and attached data

Each `SystemDefinition` has a stable ID, editable metadata, attachment targets, Flat or Volume calculation policy, inheritance and aggregation switches, calculation visibility, and an optional Type Constraints capability. Any number of Systems may use either processor or enable type constraints.

Fields may be number, text, boolean, or choice. Labels, choice options, and constraint types use stable IDs. Version 5 stores attached data in a capability-friendly envelope:

```js
definition.systemData[systemId] = {
  values: {
    [labelId]: { [fieldId]: value }
  },
  typeMembership: {
    typeIds: []
  },
  allowRule: {
    enabled: false,
    allowedTypeIds: [],
    minimumCoveragePercent: null
  }
};
```

Substances use type membership. Part Types and Part Templates use material allow-rules. Item Templates only use ordinary runtime field values. Disabling a capability or attachment target preserves its data but hides and ignores it until re-enabled.

## Calculation processors

Processors are reusable numeric scaling policies, not system identities:

- Flat values use multiplier `1` whenever their definition contributes.
- Volume values on a Substance multiply by that constituent's usable volume.
- Volume values on a Part Type or Part Template multiply by the resulting Part's usable volume.
- Volume values on an Item Template multiply by total usable volume across its Parts.

Junk never contributes to scaling. Text, boolean, and choice values are inherited with provenance but never multiplied. Switching processors recalculates existing output without rewriting stored values.

`evaluateSystem(systemId, context)` returns contribution records, optional numeric aggregates, processor metadata, and usable context volume. `evaluateVisibleSystems(context)` evaluates every System opted into crafting displays.

## Type constraints

A constraint-enabled System owns an editable type catalog, symmetric allowed-companion relationships, and a default coverage threshold.

Material compatibility checks every pair of usable constituents. Untyped Substances are neutral. Substances sharing a type are compatible, and multi-typed Substances are compatible when any cross-pair is an allowed companion relationship. Junk is ignored.

Part eligibility measures how much usable material volume has at least one type in an enabled allow-list. A multi-typed constituent's volume is counted once. A blank rule threshold inherits the System default. When Part Type and Part Template rules are both enabled, either passing rule permits the Part. Every applicable constraint-enabled System must pass.

The public validation helpers are:

- `validateMaterialConstraints(material)` for constituent compatibility.
- `validatePartConstraints(template, material)` for compatibility and allowed-volume coverage.
- `getDerivedTypeSummary(context)` for live Material, Part, and Item type summaries.

Incompatible additions, merges, Part crafting, and assembly with newly invalid Parts are rejected before destructive mutation. Existing objects invalidated by later rule edits remain available for correction, separation, or deletion and display their live violations.

## Defaults

Stats remains an ordinary Volume system targeting Substances, with numeric Value data under Action, Base, and Crit.

Types is an ordinary constraint-enabled System targeting Substances, Part Types, and Part Templates. Its default threshold is 100%. Iron, Aluminum, and Gold are Metal; Handle, Blade, and Pommel allow Metal. Carbon is untyped and Junk is excluded from constraint evaluation.

Both default Systems are editable and deletable. Designers may create multiple independent calculation or type-constraint Systems.

## Persistence

Version 5 uses `text-based-mmo-crafting-system-v5`. Reset removes v1 through v5 keys. Local v4 work and v4 imports migrate one way into the v5 envelope, preserve existing definitions and inventory, and receive the baseline Types capability where exact default names still exist.

Export Data downloads a complete v5 JSON snapshot. Import accepts v5 and migrates v4. Hydration validates typed field values, type references, companion relationships, memberships, allow-rules, and thresholds. A failed import restores the preceding workspace.

## Deferred extensions

Item Templates continue to use fixed Part Type slots. A future pass may generalize those slots into Type-System queries so an Item Template could request parts by runtime classifications rather than concrete Part Types. Refining transformations, expressions, conditional effects, and set bonuses also remain deferred.
