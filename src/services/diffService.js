// ── Row diff ─────────────────────────────────────────────────────────────────

function diffRows(oldRows, newRows, primaryKeys) {
  const pkCols = primaryKeys && primaryKeys.length > 0
    ? primaryKeys
    : oldRows.length > 0 ? [Object.keys(oldRows[0])[0]] : ['id'];

  function rowKey(row) {
    return pkCols.map(k => String(row[k])).join('::');
  }

  function rowsEqual(a, b) {
    const keysA = Object.keys(a).sort();
    const keysB = Object.keys(b).sort();
    if (keysA.join(',') !== keysB.join(',')) return false;
    return keysA.every(k => String(a[k]) === String(b[k]));
  }

  const oldMap = new Map(oldRows.map(r => [rowKey(r), r]));
  const newMap = new Map(newRows.map(r => [rowKey(r), r]));

  const added = [];
  const deleted = [];
  const updated = [];

  for (const [key, newRow] of newMap) {
    if (!oldMap.has(key)) {
      added.push(newRow);
    } else {
      const oldRow = oldMap.get(key);
      if (!rowsEqual(oldRow, newRow)) {
        updated.push({ old: oldRow, new: newRow });
      }
    }
  }

  for (const [key, oldRow] of oldMap) {
    if (!newMap.has(key)) {
      deleted.push(oldRow);
    }
  }

  return { added, updated, deleted };
}

// ── Schema diff ───────────────────────────────────────────────────────────────

function diffSchema(oldSchema, newSchema) {
  const oldMap = new Map(oldSchema.map(c => [c.column_name, c]));
  const newMap = new Map(newSchema.map(c => [c.column_name, c]));

  const addedColumns = [];
  const removedColumns = [];
  const changedColumns = [];

  for (const [name, col] of newMap) {
    if (!oldMap.has(name)) {
      addedColumns.push(col);
    } else {
      const old = oldMap.get(name);
      const changed = [];
      if (old.data_type !== col.data_type)
        changed.push({ field: 'type', old: old.data_type, new: col.data_type });
      if (old.is_nullable !== col.is_nullable)
        changed.push({ field: 'nullable', old: old.is_nullable, new: col.is_nullable });
      if (String(old.character_maximum_length) !== String(col.character_maximum_length))
        changed.push({ field: 'max_length', old: old.character_maximum_length, new: col.character_maximum_length });
      if (changed.length) {
        changedColumns.push({ column: name, changes: changed });
      }
    }
  }

  for (const [name, col] of oldMap) {
    if (!newMap.has(name)) {
      removedColumns.push(col);
    }
  }

  return { addedColumns, removedColumns, changedColumns };
}

// ── Snapshot diff ─────────────────────────────────────────────────────────────

// Normalize old string-format entries (pre-schema tracking) to the new shape
function resolveHashes(entry) {
  if (!entry) return { dataHash: null, schemaHash: null };
  if (typeof entry === 'string') return { dataHash: entry, schemaHash: null };
  return { dataHash: entry.dataHash || null, schemaHash: entry.schemaHash || null };
}

function diffSnapshots(snapA, snapB, loadObject, tablePrimaryKeys) {
  const tablesA = new Set(Object.keys(snapA.tables));
  const tablesB = new Set(Object.keys(snapB.tables));
  const allTables = new Set([...tablesA, ...tablesB]);

  const results = [];

  for (const table of allTables) {
    const { dataHash: dataHashA, schemaHash: schemaHashA } = resolveHashes(snapA.tables[table]);
    const { dataHash: dataHashB, schemaHash: schemaHashB } = resolveHashes(snapB.tables[table]);

    // Table added
    if (!tablesA.has(table) && tablesB.has(table)) {
      const newRows = dataHashB ? loadObject(dataHashB) : [];
      results.push({
        table,
        status: 'added',
        schemaChanges: null,
        added: newRows,
        updated: [],
        deleted: [],
      });
      continue;
    }

    // Table dropped
    if (tablesA.has(table) && !tablesB.has(table)) {
      const oldRows = dataHashA ? loadObject(dataHashA) : [];
      results.push({
        table,
        status: 'dropped',
        schemaChanges: null,
        added: [],
        updated: [],
        deleted: oldRows,
      });
      continue;
    }

    // Table exists in both — check what changed
    const dataChanged = dataHashA !== dataHashB;
    const schemaChanged = schemaHashA && schemaHashB && schemaHashA !== schemaHashB;

    if (!dataChanged && !schemaChanged) continue;

    let schemaChanges = null;
    if (schemaChanged) {
      const oldSchema = loadObject(schemaHashA);
      const newSchema = loadObject(schemaHashB);
      const sc = diffSchema(oldSchema, newSchema);
      if (sc.addedColumns.length || sc.removedColumns.length || sc.changedColumns.length) {
        schemaChanges = sc;
      }
    }

    let rowDiff = { added: [], updated: [], deleted: [] };
    if (dataChanged) {
      const oldRows = dataHashA ? loadObject(dataHashA) : [];
      const newRows = dataHashB ? loadObject(dataHashB) : [];
      rowDiff = diffRows(oldRows, newRows, tablePrimaryKeys[table] || []);
    }

    if (schemaChanges || rowDiff.added.length || rowDiff.updated.length || rowDiff.deleted.length) {
      results.push({
        table,
        status: 'modified',
        schemaChanges,
        ...rowDiff,
      });
    }
  }

  return results;
}

module.exports = { diffRows, diffSchema, diffSnapshots };
