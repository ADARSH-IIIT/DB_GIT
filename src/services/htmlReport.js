function escapeHtml(value) {
  return String(value ?? 'null')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderRow(row, cls) {
  const cells = Object.entries(row)
    .map(([k, v]) => `<td><span class="col">${escapeHtml(k)}</span>: ${escapeHtml(v)}</td>`)
    .join('');
  return `<tr class="${cls}">${cells}</tr>`;
}

function renderSchemaDiff(schemaChanges) {
  if (!schemaChanges) return '';
  const { addedColumns, removedColumns, changedColumns } = schemaChanges;

  let html = `<div class="block schema-block">
    <div class="block-title schema-title">SCHEMA CHANGES</div>
    <table>
      <thead><tr><th>Column</th><th>Change</th><th>Before</th><th>After</th></tr></thead>
      <tbody>`;

  addedColumns.forEach(col => {
    html += `<tr class="added">
      <td><code>${escapeHtml(col.column_name)}</code></td>
      <td><span class="tag tag-add">COLUMN ADDED</span></td>
      <td>—</td>
      <td>${escapeHtml(col.data_type)}${col.character_maximum_length ? `(${col.character_maximum_length})` : ''} ${col.is_nullable === 'NO' ? 'NOT NULL' : ''}</td>
    </tr>`;
  });

  removedColumns.forEach(col => {
    html += `<tr class="removed">
      <td><code>${escapeHtml(col.column_name)}</code></td>
      <td><span class="tag tag-drop">COLUMN DROPPED</span></td>
      <td>${escapeHtml(col.data_type)}${col.character_maximum_length ? `(${col.character_maximum_length})` : ''} ${col.is_nullable === 'NO' ? 'NOT NULL' : ''}</td>
      <td>—</td>
    </tr>`;
  });

  changedColumns.forEach(({ column, changes }) => {
    changes.forEach(change => {
      html += `<tr class="changed">
        <td><code>${escapeHtml(column)}</code></td>
        <td><span class="tag tag-change">${escapeHtml(change.field).toUpperCase()} CHANGED</span></td>
        <td>${escapeHtml(change.old)}</td>
        <td>${escapeHtml(change.new)}</td>
      </tr>`;
    });
  });

  html += `</tbody></table></div>`;
  return html;
}

function renderTableDiff({ table, status, schemaChanges, added, updated, deleted }) {
  const statusLabel = status === 'added'
    ? '<span class="table-badge badge-new">NEW TABLE</span>'
    : status === 'dropped'
    ? '<span class="table-badge badge-dropped">DROPPED TABLE</span>'
    : '';

  let html = `<section class="table-diff">
  <h2>Table: <code>${escapeHtml(table)}</code> ${statusLabel}</h2>`;

  // Schema changes (only for modified tables)
  if (schemaChanges) {
    html += renderSchemaDiff(schemaChanges);
  }

  // INSERT
  html += `<div class="block">
    <div class="block-title insert">INSERT (${added.length})</div>`;
  if (added.length === 0) {
    html += '<p class="none">None</p>';
  } else {
    html += '<table><tbody>';
    added.forEach(row => { html += renderRow(row, 'added'); });
    html += '</tbody></table>';
  }
  html += '</div>';

  // UPDATE (not applicable for new/dropped tables)
  if (status === 'modified') {
    html += `<div class="block">
      <div class="block-title update">UPDATE (${updated.length})</div>`;
    if (updated.length === 0) {
      html += '<p class="none">None</p>';
    } else {
      updated.forEach(({ old: o, new: n }) => {
        html += '<table><thead><tr><th>Old</th><th>New</th></tr></thead><tbody><tr>';
        html += `<td><table><tbody>${renderRow(o, 'removed')}</tbody></table></td>`;
        html += `<td><table><tbody>${renderRow(n, 'added')}</tbody></table></td>`;
        html += '</tr></tbody></table>';
      });
    }
    html += '</div>';
  }

  // DELETE
  html += `<div class="block">
    <div class="block-title delete">DELETE (${deleted.length})</div>`;
  if (deleted.length === 0) {
    html += '<p class="none">None</p>';
  } else {
    html += '<table><tbody>';
    deleted.forEach(row => { html += renderRow(row, 'removed'); });
    html += '</tbody></table>';
  }
  html += '</div>';

  html += '</section>';
  return html;
}

function generateReport(snapA, snapB, diffs) {
  const changedCount = diffs.length;
  const newTables = diffs.filter(d => d.status === 'added').length;
  const droppedTables = diffs.filter(d => d.status === 'dropped').length;
  const modifiedTables = diffs.filter(d => d.status === 'modified').length;

  const tableSections = diffs.map(renderTableDiff).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DBGit Diff: ${escapeHtml(snapA.id)} → ${escapeHtml(snapB.id)}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', system-ui, sans-serif;
      background: #0f1117;
      color: #e2e8f0;
      padding: 2rem;
      line-height: 1.6;
    }
    header {
      border-bottom: 1px solid #2d3748;
      padding-bottom: 1.5rem;
      margin-bottom: 2rem;
    }
    header h1 { font-size: 1.75rem; color: #f7fafc; }
    .meta { font-size: 0.85rem; color: #718096; margin-top: 0.5rem; }
    .meta span { margin-right: 1.5rem; }
    .summary-bar {
      display: flex;
      gap: 0.75rem;
      margin-top: 0.75rem;
      flex-wrap: wrap;
    }
    .badge {
      display: inline-block;
      padding: 0.2rem 0.65rem;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.04em;
    }
    .badge-new     { background: #1a3a2a; color: #68d391; }
    .badge-dropped { background: #3a1a1a; color: #fc8181; }
    .badge-mod     { background: #2d3748; color: #90cdf4; }
    .table-diff {
      background: #1a1e2e;
      border: 1px solid #2d3748;
      border-radius: 8px;
      padding: 1.5rem;
      margin-bottom: 1.5rem;
    }
    .table-diff h2 {
      font-size: 1.1rem;
      margin-bottom: 1rem;
      color: #90cdf4;
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    .table-badge {
      font-size: 0.7rem;
      font-weight: 700;
      letter-spacing: 0.06em;
      padding: 0.2rem 0.5rem;
      border-radius: 3px;
    }
    code {
      background: #2d3748;
      padding: 0.1rem 0.4rem;
      border-radius: 3px;
      font-size: 0.9em;
    }
    .block { margin-bottom: 1.25rem; }
    .schema-block {
      background: #1e2235;
      border: 1px solid #3a4060;
      border-radius: 6px;
      padding: 1rem;
      margin-bottom: 1.25rem;
    }
    .block-title {
      font-weight: 700;
      font-size: 0.8rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      padding: 0.3rem 0.75rem;
      border-radius: 4px;
      display: inline-block;
      margin-bottom: 0.75rem;
    }
    .schema-title { background: #2a2060; color: #b794f4; }
    .insert  { background: #1a3a2a; color: #68d391; }
    .update  { background: #332a00; color: #f6e05e; }
    .delete  { background: #3a1a1a; color: #fc8181; }
    table { border-collapse: collapse; width: 100%; font-size: 0.85rem; }
    td, th {
      padding: 0.45rem 0.75rem;
      border: 1px solid #2d3748;
      vertical-align: top;
    }
    th { background: #2d3748; color: #a0aec0; font-size: 0.75rem; text-transform: uppercase; }
    tr.added   td { background: #1a3a2a; }
    tr.removed td { background: #3a1a1a; }
    tr.changed td { background: #2a2000; }
    .col { color: #718096; font-size: 0.75rem; margin-right: 0.3rem; }
    .none { color: #4a5568; font-style: italic; font-size: 0.85rem; }
    .tag {
      display: inline-block;
      padding: 0.1rem 0.4rem;
      border-radius: 3px;
      font-size: 0.7rem;
      font-weight: 700;
      letter-spacing: 0.04em;
    }
    .tag-add    { background: #1a3a2a; color: #68d391; }
    .tag-drop   { background: #3a1a1a; color: #fc8181; }
    .tag-change { background: #2a2000; color: #f6e05e; }
    .empty-state {
      text-align: center;
      padding: 3rem;
      color: #4a5568;
    }
  </style>
</head>
<body>
  <header>
    <h1>DBGit Diff Report</h1>
    <div class="meta">
      <span><strong>From:</strong> ${escapeHtml(snapA.id)} &mdash; ${escapeHtml(snapA.message)}</span>
      <span><strong>To:</strong> ${escapeHtml(snapB.id)} &mdash; ${escapeHtml(snapB.message)}</span>
    </div>
    <div class="summary-bar">
      ${newTables     ? `<span class="badge badge-new">+${newTables} new table${newTables !== 1 ? 's' : ''}</span>` : ''}
      ${droppedTables ? `<span class="badge badge-dropped">-${droppedTables} dropped table${droppedTables !== 1 ? 's' : ''}</span>` : ''}
      ${modifiedTables ? `<span class="badge badge-mod">${modifiedTables} modified table${modifiedTables !== 1 ? 's' : ''}</span>` : ''}
      ${changedCount === 0 ? '<span class="badge badge-mod">No changes</span>' : ''}
    </div>
  </header>

  ${changedCount === 0
    ? '<div class="empty-state"><h2>No changes between these snapshots.</h2></div>'
    : tableSections
  }
</body>
</html>`;
}

module.exports = { generateReport };
