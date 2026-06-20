const crypto = require('crypto');

// Deterministic hash: sort keys so row object order doesn't matter
function hashRows(rows) {
  const normalized = rows.map(row => {
    const sorted = {};
    Object.keys(row).sort().forEach(k => { sorted[k] = row[k]; });
    return sorted;
  });
  const content = JSON.stringify(normalized);
  return crypto.createHash('sha256').update(content).digest('hex');
}

function hashString(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

module.exports = { hashRows, hashString };
