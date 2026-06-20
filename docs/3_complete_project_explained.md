# DBGit — Complete Project Explained

Everything you need to understand, explain, and defend this project in an interview.

---

## 1. The Core Idea

Git tracks versions of files. DBGit tracks versions of a PostgreSQL database.

The problem DBGit solves: databases change over time — rows get inserted, updated, deleted, columns get added or removed, tables get dropped. There is no built-in way to look back and say "what exactly changed between last Tuesday and today?" DBGit gives you that.

The design is intentionally inspired by Git because Git's core ideas — content-addressable storage, snapshots, diffs — translate cleanly to databases.

---

## 2. What DBGit Does NOT Do

It is important to be honest about scope in an interview.

DBGit does not:
- Restore or roll back a database to a previous state
- Branch or merge like Git
- Sync changes to a remote repository
- Replace proper database backup tools (pg_dump, etc.)
- Track stored procedures, triggers, or views — only table data and schema

What it does:
- Take point-in-time snapshots of all tables
- Store only what changed between snapshots (not full copies every time)
- Compare any two snapshots and show row-level and schema-level differences
- Generate a visual HTML diff report
- Work with local PostgreSQL, Docker PostgreSQL, and cloud-hosted PostgreSQL

---

## 3. High-Level Architecture

```
dbgit/
├── src/
│   ├── cli.js                  ← entry point, command routing
│   │
│   ├── commands/               ← one file per user-facing command
│   │   ├── init.js             ← dbgit init
│   │   ├── snapshot.js         ← dbgit snapshot
│   │   ├── diff.js             ← dbgit diff
│   │   └── log.js              ← dbgit log
│   │
│   ├── services/               ← business logic, no CLI concerns
│   │   ├── postgres.js         ← all DB interaction
│   │   ├── hash.js             ← SHA-256 hashing
│   │   ├── snapshotService.js  ← read/write snapshots and objects
│   │   ├── diffService.js      ← row diff and schema diff algorithms
│   │   └── htmlReport.js       ← generates the HTML report
│   │
│   └── utils/
│       ├── fileUtils.js        ← fs wrappers and path helpers
│       └── jsonUtils.js        ← JSON parse and stringify
```

The separation between `commands/` and `services/` is intentional. Commands handle user input and output. Services contain the actual logic. If you wanted to build an API on top of this instead of a CLI, you would only replace the `commands/` layer.

---

## 4. The .dbgit Directory

When you run `dbgit init`, it creates a `.dbgit` folder in your current directory, exactly like how `git init` creates `.git`.

```
.dbgit/
├── metadata.json       ← database connection config
├── HEAD                ← ID of the most recent snapshot
├── objects/            ← stores actual table data, keyed by hash
│   ├── a3f9c2...json
│   └── 7b1d44...json
└── snapshots/          ← stores snapshot metadata
    ├── s1.json
    ├── s2.json
    └── s3.json
```

### metadata.json

Stores connection details. Written once by `init`, read by every other command.

```json
{
  "version": "1.0.0",
  "created": "2026-06-20T10:00:00Z",
  "connection": {
    "host": "localhost",
    "port": 5432,
    "database": "mydb",
    "user": "postgres",
    "password": "secret"
  }
}
```

Or when using a URL:

```json
{
  "connection": {
    "connectionString": "postgresql://postgres:pass@host:5432/db",
    "ssl": { "rejectUnauthorized": false }
  }
}
```

### HEAD

A plain text file containing just the ID of the latest snapshot.

```
s3
```

When there are no snapshots yet, it contains the string `null`.

### objects/

Each file is named by its SHA-256 hash and contains a JSON array. This is content-addressable storage — the same data always produces the same hash, so the same data is never stored twice.

One object file can represent either:
- **Table row data** — an array of row objects
- **Table schema** — an array of column definition objects

```json
[
  { "id": 1, "name": "Adarsh", "email": "adarsh@example.com" },
  { "id": 2, "name": "Rahul",  "email": "rahul@example.com"  }
]
```

### snapshots/

Each snapshot file is named `s1.json`, `s2.json` etc. and contains metadata plus references to object hashes — never the data itself.

```json
{
  "id": "s2",
  "message": "Added Rahul",
  "timestamp": "2026-06-20T10:30:00Z",
  "parent": "s1",
  "tables": {
    "users": {
      "dataHash":   "a3f9c2...",
      "schemaHash": "7b1d44..."
    },
    "orders": {
      "dataHash":   "cc12ab...",
      "schemaHash": "51fa99..."
    }
  }
}
```

The snapshot does not store any rows. It stores hash pointers. The actual data lives in `objects/`. This is the same principle Git uses — a commit stores references to tree objects, not file contents directly.

---

## 5. Content-Addressable Storage

This is the core optimization. Worth explaining in detail.

When you take a snapshot, for each table:
1. Fetch all rows from PostgreSQL
2. Compute SHA-256 hash of those rows
3. Check if `objects/<hash>.json` already exists
4. If yes — do nothing. The data is identical, no need to store it again.
5. If no — write it.

```
Snapshot s1:
  users hash = abc123  →  objects/abc123.json  [written]

Snapshot s2: (users unchanged)
  users hash = abc123  →  objects/abc123.json  [already exists, skipped]

Snapshot s3: (users changed)
  users hash = def456  →  objects/def456.json  [written]
```

If you take 100 snapshots and the orders table never changes, only one object file is ever written for orders. All 100 snapshots point to that same hash.

The hash is deterministic: the rows are sorted by key before hashing so that column order differences in PostgreSQL do not produce different hashes for the same logical data.

```javascript
function hashRows(rows) {
  const normalized = rows.map(row => {
    const sorted = {};
    Object.keys(row).sort().forEach(k => { sorted[k] = row[k]; });
    return sorted;
  });
  return crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}
```

---

## 6. Schema Tracking

Each snapshot stores two hashes per table: one for the data, one for the schema.

The schema is fetched from PostgreSQL's `information_schema.columns`:

```sql
SELECT column_name, data_type, is_nullable, column_default, character_maximum_length
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = $1
ORDER BY ordinal_position
```

This returns a row for each column in the table. That array is hashed the same way as row data and stored in `objects/` as its own file.

Why separate? Because data can change without schema changing, and schema can change without data changing. Storing them separately lets the diff know exactly what kind of change happened.

---

## 7. The Diff Algorithm

### Row Diff

Comparing two arrays of rows directly (like comparing two arrays element by element) would be wrong because rows can be in different orders, and row identity depends on primary keys.

DBGit uses a map-based approach:

1. Fetch primary key column(s) from PostgreSQL for the table
2. Build a `Map` from both the old and new row arrays, keyed by primary key value
3. Walk through new map: if key not in old → added; if key in old but values differ → updated
4. Walk through old map: if key not in new → deleted

```javascript
// key for a row using primary key columns
function rowKey(row) {
  return pkCols.map(k => String(row[k])).join('::');
}

const oldMap = new Map(oldRows.map(r => [rowKey(r), r]));
const newMap = new Map(newRows.map(r => [rowKey(r), r]));

for (const [key, newRow] of newMap) {
  if (!oldMap.has(key))         → added
  else if (!rowsEqual(...))     → updated
}
for (const [key, oldRow] of oldMap) {
  if (!newMap.has(key))         → deleted
}
```

This is O(n) for both building the maps and comparing them.

### Schema Diff

Same map approach, but keyed by `column_name`:

- Column in new schema but not old → added column
- Column in old schema but not new → removed column
- Column in both but `data_type`, `is_nullable`, or `character_maximum_length` differs → changed column

### Table-Level Events

Before even comparing rows, `diffSnapshots` checks which tables exist in each snapshot:

- Table in snapshot B but not A → **new table**
- Table in snapshot A but not B → **dropped table**
- Table in both → compare data hash and schema hash

If hashes are equal, the table is skipped entirely. This is the fast path — hash comparison is O(1) and avoids loading any object files.

---

## 8. Command Reference with Full Examples

---

### `dbgit init`

Initializes a `.dbgit` repository in the current directory. Writes `metadata.json`, `HEAD`, and creates empty `objects/` and `snapshots/` directories.

**Interactive mode (local or Docker):**

```bash
dbgit init
```

```
Initializing DBGit repository...

PostgreSQL host     [localhost]:
PostgreSQL port     [5432]:
Database name      : mydb
Username           : postgres
Password           : secret
Enable SSL?        [y/N]:

Initialized DBGit repository.
  Mode     : local / Docker
  SSL      : disabled
  Directory: /home/adarsh/project/.dbgit
```

**URL mode (cloud or Docker with a single string):**

```bash
dbgit init --url 'postgresql://postgres:pass@localhost:5434/mydb'
```

Special characters in passwords (`?`, `&`, `#`, `@`) must be percent-encoded:
- `?` → `%3F`
- `&` → `%26`
- `#` → `%23`
- `@` → `%40`

**Cloud with SSL:**

```bash
dbgit init --url 'postgresql://postgres:pass%3Fword@db.xyz.supabase.co:5432/postgres' --ssl
```

If `sslmode=require` is already in the URL, `--ssl` is not needed — DBGit detects it automatically.

What gets written to disk:

```
.dbgit/
├── metadata.json   ← connection config
├── HEAD            ← "null" (no snapshots yet)
├── objects/        ← empty
└── snapshots/      ← empty
```

---

### `dbgit snapshot -m "message"`

Reads the entire database, hashes each table's data and schema, stores only what changed, and writes a snapshot file.

```bash
dbgit snapshot -m "Initial state"
```

```
Reading database tables...
  Hashing orders... new table
  Hashing users...  new table

Snapshot s1 created.
  Message : Initial state
  Tables  : 2 (2 changed, 0 unchanged)
  Parent  : none
```

After making changes to the database:

```bash
dbgit snapshot -m "Added John, altered users schema"
```

```
Reading database tables...
  Hashing orders... unchanged
  Hashing users...  schema changed, data changed

Snapshot s2 created.
  Message : Added John, altered users schema
  Tables  : 2 (1 changed, 1 unchanged)
  Parent  : s1
```

After dropping a table and adding a new one:

```bash
dbgit snapshot -m "Dropped orders, added products"
```

```
Reading database tables...
  Hashing products... new table
  Hashing users...    unchanged
  orders... dropped

Snapshot s3 created.
  Message : Dropped orders, added products
  Tables  : 2 (1 changed, 1 unchanged)
  Dropped : orders
  Parent  : s2
```

**Internally, per table:**

```
1. SELECT * FROM "users"                   → fetch rows
2. hash(rows)                              → dataHash = "abc123"
3. objects/abc123.json exists?
     yes → skip writing
     no  → write objects/abc123.json
4. SELECT column_name, data_type ... 
   FROM information_schema.columns         → fetch schema
5. hash(schema)                            → schemaHash = "def456"
6. objects/def456.json exists?
     yes → skip writing
     no  → write objects/def456.json
7. newTables["users"] = { dataHash, schemaHash }
```

**The snapshot file written:**

```json
{
  "id": "s2",
  "message": "Added John, altered users schema",
  "timestamp": "2026-06-20T11:00:00Z",
  "parent": "s1",
  "tables": {
    "users":  { "dataHash": "abc123", "schemaHash": "def456" },
    "orders": { "dataHash": "cc12ab", "schemaHash": "51fa99" }
  }
}
```

---

### `dbgit log`

Lists all snapshots, newest first. Shows the parent chain so you can trace history.

```bash
dbgit log
```

```
snapshot s3  (HEAD)
  Message : Dropped orders, added products
  Date    : 20 Jun 2026, 16:30:00
  Tables  : 2
  Parent  : s2

snapshot s2
  Message : Added John, altered users schema
  Date    : 20 Jun 2026, 14:15:00
  Tables  : 2
  Parent  : s1

snapshot s1
  Message : Initial state
  Date    : 20 Jun 2026, 12:00:00
  Tables  : 2
  Parent  : none
```

`(HEAD)` marks the latest snapshot. Use the IDs shown here (`s1`, `s2`, `s3`) as arguments to `dbgit diff`.

---

### `dbgit diff <snapshotA> <snapshotB>`

Compares two snapshots and generates `diff-report.html` in the current directory.

The order matters. `snapshotA` is the baseline (old), `snapshotB` is the target (new).

**Example 1 — data changes only:**

```bash
dbgit diff s1 s2
```

```
Comparing s1 → s2...

Changed tables: 1
  [MOD]  users: +1 added, ~1 updated, -0 deleted

Report saved to: /home/adarsh/project/diff-report.html
```

**Example 2 — schema change detected:**

```bash
dbgit diff s1 s2
```

```
Changed tables: 1
  [MOD]  users: +0 added, ~0 updated, -0 deleted | schema: +1 col, -0 col, ~0 col
```

**Example 3 — new and dropped tables:**

```bash
dbgit diff s2 s3
```

```
Changed tables: 2
  [NEW]     products (+2 rows)
  [DROPPED] orders   (-2 rows)
```

**Reversed diff — opposite result:**

```bash
dbgit diff s3 s2
```

```
Changed tables: 2
  [DROPPED] products (-2 rows)
  [NEW]     orders   (+2 rows)
```

**Internally:**

```
1. Load snapshots/s1.json and snapshots/s2.json
2. For each table in the union of both snapshots:
     a. If only in s2 → status: added
     b. If only in s1 → status: dropped
     c. If in both:
          compare dataHash   → if different, load both objects and diff rows
          compare schemaHash → if different, load both objects and diff columns
3. Write diff-report.html
```

The diff only reads object files for tables that actually changed. Unchanged tables (same hash) are skipped entirely — no file reads, no comparison.

---

## 9. The HTML Report

The report is a single self-contained HTML file. No external dependencies, no JavaScript framework — just HTML and inline CSS.

It opens in any browser.

### Summary bar at the top

Shows a count of new tables, dropped tables, and modified tables at a glance.

```
+1 new table   -1 dropped table   2 modified tables
```

### Per-table sections

Each changed table gets its own section. The section header shows the table name and a status badge:

```
Table: users          ← modified, no badge
Table: products  [NEW TABLE]
Table: orders    [DROPPED TABLE]
```

### Schema changes block (purple)

Appears only when the schema changed between the two snapshots. Shows a table with columns:

| Column | Change | Before | After |
|---|---|---|---|
| email | COLUMN ADDED | — | character varying(255) |
| phone | COLUMN DROPPED | character varying(20) | — |
| name | TYPE CHANGED | character varying | text |

### Data change blocks

Three blocks per table:

- **INSERT** (green) — rows that exist in the new snapshot but not the old
- **UPDATE** (yellow) — rows where the primary key exists in both but values differ, shown side by side
- **DELETE** (red) — rows that exist in the old snapshot but not the new

---

## 10. How the Three PostgreSQL Setups Work

### Local native

```
Your OS
└── postgres process (system service)
    └── data at /var/lib/postgresql/15/main/
```

DBGit connects via `localhost:5432` with no SSL.

### Docker

```
Your OS
└── Docker engine
    └── container
        └── postgres process
            └── data at /var/lib/postgresql/data (inside container)
                 ↕ if volume mounted
            → actually saved to ~/pgdata on your real disk
```

DBGit connects via `localhost:<mapped-port>`. No SSL needed since traffic stays on your machine.

### Cloud (Supabase, Neon, Railway etc.)

```
Your Machine ──── SSL/TLS over internet ────► Cloud Provider's Server
                                                └── postgres process
                                                    └── managed storage
```

DBGit connects via a URL. SSL is required. Passwords with special characters (`?`, `&`, `#`) must be percent-encoded in the URL.

---

## 11. Technologies Used and Why

| Technology | Why |
|---|---|
| **Node.js** | Async I/O, good for database clients, runs everywhere |
| **pg** | Official PostgreSQL client for Node.js, no ORM overhead |
| **commander** | Minimal CLI argument parsing, no bloat |
| **crypto (built-in)** | SHA-256 hashing without any extra dependency |
| **fs / path (built-in)** | File I/O for `.dbgit` directory management |

No ORM, no framework, no frontend library. Every dependency can be justified in one sentence.

---

## 12. Interview Explanation (1-minute version)

"I built a lightweight Git-like version control system for PostgreSQL databases.

The core idea is simple: every time you run `dbgit snapshot`, it reads all tables, generates a SHA-256 hash for each table's data and schema. If the hash already exists in the objects store, we skip writing — this is content-addressable storage, the same principle Git uses. If it changed, we store the new version.

Snapshots don't store data directly — they store hash pointers to objects, exactly like Git commits point to blobs.

To compare two snapshots, the diff command loads only the object files for tables whose hashes changed. It uses a map-based row comparison keyed by primary key — so it correctly identifies inserts, updates, and deletes even if row order changed. Schema diffs track column additions, removals, and type changes.

The result is a self-contained HTML report. The system works with local PostgreSQL, Docker containers, and cloud providers like Supabase — just pass a connection URL."

---

## 13. Design Decisions Worth Mentioning

**Why SHA-256 and not MD5 or a simpler hash?**
SHA-256 has no known collisions. Two different table states will never produce the same hash. MD5 is faster but has known collision vulnerabilities — not suitable for anything where correctness matters.

**Why store schema and data as separate objects?**
Because they change independently. A data migration might not change the schema. An `ALTER TABLE` might not touch any rows. Separate hashes let the diff report tell you exactly which kind of change happened, and avoid re-storing schema when only data changed.

**Why not store the diff instead of the full table state?**
Storing diffs (delta compression) is more complex and makes random-access comparisons expensive. By storing full table states as objects and deduplicating via hashing, you get simplicity and still avoid redundant storage. This mirrors how Git stores blob objects rather than file diffs.

**Why primary-key-based row comparison?**
Row order in PostgreSQL is not guaranteed. A simple index-based comparison would misidentify every row as changed if the database returned them in a different order. Primary keys give each row a stable identity.

**Why HTML output instead of terminal diff?**
Database rows can have many columns. A terminal diff of wide rows becomes unreadable. HTML lets you display old and new side by side in a table, styled for readability, and it opens in any browser without installing anything.
