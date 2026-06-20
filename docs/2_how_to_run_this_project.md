# How to Run DBGit — Tracking Changes for Any PostgreSQL Setup

This guide walks through setting up and using DBGit for three scenarios:
- PostgreSQL installed natively on your machine
- PostgreSQL running inside a Docker container
- PostgreSQL hosted on a cloud provider (Neon, Supabase, Railway, etc.)

---

## Prerequisites

Node.js v18 or above installed on your machine.

Install dependencies once:

```bash
cd dbgit
npm install
```

Optionally install globally so you can run `dbgit` from any folder:

```bash
npm install -g .
# now you can use: dbgit init / dbgit snapshot / dbgit diff
# without "node src/cli.js" prefix
```

If not installed globally, replace `dbgit` with `node src/cli.js` in all commands below.

---

## Scenario 1 — Native PostgreSQL (installed directly on your machine)

### Step 1 — Verify PostgreSQL is running

```bash
# Linux
sudo systemctl status postgresql

# Mac (Homebrew)
brew services list | grep postgresql

# Or just try connecting
psql -U postgres -c "\l"
```

### Step 2 — Navigate to the folder you want to track from

DBGit creates a `.dbgit/` folder in whichever directory you run `init` from, similar to how Git creates `.git/`.

```bash
mkdir my-project && cd my-project
```

### Step 3 — Initialize DBGit (interactive prompts)

```bash
dbgit init
```

You will see:

```
Initializing DBGit repository...

PostgreSQL host     [localhost]:          ← press Enter (default)
PostgreSQL port     [5432]:               ← press Enter (default)
Database name      : mydb                 ← type your database name
Username           : postgres             ← type your username
Password           : ****                 ← type your password
Enable SSL?        [y/N]:                 ← press Enter (no SSL needed locally)

Initialized DBGit repository.
  Mode     : local / Docker
  SSL      : disabled
  Directory: /path/to/my-project/.dbgit
```

### Step 4 — Take your first snapshot

Make sure your database has some tables and data, then:

```bash
dbgit snapshot -m "Initial state"
```

Output:

```
Reading database tables...
  Hashing users... stored
  Hashing orders... stored

Snapshot s1 created.
  Message : Initial state
  Tables  : 2 (2 stored, 0 reused)
  Parent  : none
```

### Step 5 — Make some changes to your database

Open psql or any client and make changes:

```sql
INSERT INTO users (name, email) VALUES ('Rahul', 'rahul@example.com');
UPDATE users SET name = 'Adarsh Kumar' WHERE id = 1;
```

### Step 6 — Take another snapshot

```bash
dbgit snapshot -m "Added Rahul, updated Adarsh"
```

Output:

```
Reading database tables...
  Hashing users... stored       ← users changed, new object stored
  Hashing orders... unchanged   ← orders unchanged, existing object reused

Snapshot s2 created.
  Message : Added Rahul, updated Adarsh
  Tables  : 2 (1 stored, 1 reused)
  Parent  : s1
```

### Step 7 — Compare snapshots

```bash
dbgit diff s1 s2
```

Output:

```
Comparing s1 → s2...

Changed tables: 1
  users: +1 added, ~1 updated, -0 deleted

Report saved to: /path/to/my-project/diff-report.html
```

Open `diff-report.html` in your browser to see the visual diff report.

---

## Scenario 2 — PostgreSQL Inside a Docker Container

### Step 1 — Start a PostgreSQL container with a volume

The `-v` flag maps a folder on your real disk into the container so data is not lost when the container stops.

```bash
docker run \
  --name my-postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=secret \
  -e POSTGRES_DB=mydb \
  -p 5434:5432 \
  -v ~/pgdata:/var/lib/postgresql/data \
  -d \
  postgres:15
```

Flag breakdown:

| Flag | What it does |
|---|---|
| `--name my-postgres` | Names the container so you can reference it easily |
| `-e POSTGRES_USER` | Creates this user inside PostgreSQL |
| `-e POSTGRES_PASSWORD` | Sets the password |
| `-e POSTGRES_DB` | Creates this database on first start |
| `-p 5434:5432` | Maps port 5434 on your machine to 5432 inside the container |
| `-v ~/pgdata:/var/lib/postgresql/data` | Persists data on your real disk |
| `-d` | Runs in background (detached) |

Note: port `5434` is used here to avoid conflicts if native PostgreSQL is already running on `5432`. You can use any free port.

### Step 2 — Verify the container is running

```bash
docker ps
# should show "my-postgres" in the list

# test the connection
psql -h localhost -p 5434 -U postgres -d mydb -c "\dt"
```

### Step 3 — Initialize DBGit

```bash
mkdir my-project && cd my-project

# Option A — interactive prompts
dbgit init
```

```
PostgreSQL host     [localhost]:    ← press Enter
PostgreSQL port     [5432]:    5434 ← type the mapped port
Database name      : mydb
Username           : postgres
Password           : secret
Enable SSL?        [y/N]:           ← press Enter (no SSL for local Docker)
```

```bash
# Option B — single URL flag (faster)
dbgit init --url "postgresql://postgres:secret@localhost:5434/mydb"
```

Both produce the same result.

### Step 4 — Use exactly like native

From here, the workflow is identical to Scenario 1:

```bash
dbgit snapshot -m "Initial state"

# make DB changes...

dbgit snapshot -m "After changes"

dbgit diff s1 s2
```

### Useful Docker commands during development

```bash
# Stop the container (data is safe because of the volume)
docker stop my-postgres

# Start it again (connects to the same data)
docker start my-postgres

# View PostgreSQL logs
docker logs my-postgres

# Open a psql shell inside the container
docker exec -it my-postgres psql -U postgres -d mydb

# Completely remove the container (data still safe in ~/pgdata)
docker rm my-postgres

# Recreate it pointing to the same data
docker run --name my-postgres -p 5434:5432 -v ~/pgdata:/var/lib/postgresql/data -d postgres:15
```

---

## Scenario 3 — Cloud-Hosted PostgreSQL (Neon, Supabase, Railway, etc.)

Cloud providers give you a connection URL from their dashboard. You paste it directly into DBGit.

### Getting your connection URL

**Neon**
Dashboard → your project → Connection Details → copy the connection string.
It looks like:
```
postgresql://alex:AbCdEf123@ep-cool-darkness-123456.us-east-2.aws.neon.tech/neondb?sslmode=require
```

**Supabase**
Dashboard → Settings → Database → Connection string → URI tab.
It looks like:
```
postgresql://postgres:yourpassword@db.xxxxxxxxxxxx.supabase.co:5432/postgres
```

**Railway**
Dashboard → your PostgreSQL service → Connect → copy the Public URL.
It looks like:
```
postgresql://postgres:randompassword@roundhouse.proxy.rlwy.net:12345/railway
```

**AWS RDS / other**
Find the endpoint hostname in the RDS console and construct:
```
postgresql://youruser:yourpass@your-instance.rds.amazonaws.com:5432/yourdb
```

### Step 1 — Initialize DBGit with the URL

```bash
mkdir my-project && cd my-project

dbgit init --url "postgresql://alex:AbCdEf123@ep-cool-darkness-123456.us-east-2.aws.neon.tech/neondb?sslmode=require"
```

If `sslmode=require` is in your URL, SSL is enabled automatically. If your URL does not include it but SSL is still needed, add `--ssl`:

```bash
dbgit init --url "postgresql://postgres:pass@db.supabase.co:5432/postgres" --ssl
```

Output:

```
Initialized DBGit repository.
  Mode     : URL / connection string
  SSL      : enabled
  Directory: /path/to/my-project/.dbgit
```

### Step 2 — Take snapshots and diffs — exactly the same commands

```bash
dbgit snapshot -m "Production state before migration"

# run your migration / make changes on the cloud DB...

dbgit snapshot -m "After migration"

dbgit diff s1 s2
```

Because DBGit reads data from the cloud database and stores the objects locally in `.dbgit/`, you get a local history of your remote database state. No data is written back to the cloud.

---

## What gets stored where

```
my-project/
├── .dbgit/
│   ├── metadata.json       ← connection config (created by init)
│   ├── HEAD                ← ID of the latest snapshot
│   │
│   ├── objects/
│   │   ├── abc123.json     ← actual table row data, stored by SHA-256 hash
│   │   └── xyz456.json     ← same content = same filename, never duplicated
│   │
│   └── snapshots/
│       ├── s1.json         ← snapshot metadata + references to object hashes
│       └── s2.json
│
└── diff-report.html        ← generated each time you run dbgit diff
```

---

## Command Reference

```bash
# Initialize (interactive)
dbgit init

# Initialize with a connection URL
dbgit init --url "postgresql://user:pass@host:port/db"

# Initialize with URL and explicit SSL
dbgit init --url "postgresql://user:pass@host:port/db" --ssl

# Take a snapshot
dbgit snapshot -m "your message here"

# Compare any two snapshots
dbgit diff s1 s2
dbgit diff s1 s3
dbgit diff s2 s4
```

---

## Troubleshooting

**Connection refused**
- Native: check `sudo systemctl status postgresql` — the service may be stopped.
- Docker: check `docker ps` — the container may not be running. Run `docker start my-postgres`.
- Check the port. If you mapped to `5434`, make sure you entered `5434` during init, not `5432`.

**SSL error on cloud**
Run `dbgit init` again after deleting `.dbgit/` and add `--ssl`, or ensure `?sslmode=require` is in your URL.

**No tables found**
The database exists but has no tables in the `public` schema yet. Create your tables first, then snapshot.

**Permission denied**
Your PostgreSQL user may not have SELECT permission on all tables. Grant it:
```sql
GRANT SELECT ON ALL TABLES IN SCHEMA public TO youruser;
```
