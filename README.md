# DBGit

Git for your PostgreSQL database.

Takes snapshots of your database and lets you compare them — so you can see exactly what changed between any two points in time. Which rows were added, which were updated, which were deleted, and if any table schema changed.

Built with Node.js and no ORMs. Just `pg`, `commander`, and `crypto`.

---

## What it does

- `init` — connects to your database and sets up a `.dbgit` folder to store everything
- `snapshot` — reads all your tables, hashes them, and saves only what changed
- `log` — shows all your snapshots in order
- `diff` — compares two snapshots and generates an HTML report showing every change

Works with local PostgreSQL, Docker, and cloud databases like Supabase, Neon, Railway.

---

## Setup

```bash
npm install
npm install -g .
```

The second command lets you use `dbgit` directly instead of `node src/cli.js`.

---

## Usage — Local PostgreSQL (native install)

PostgreSQL installed directly on your machine, running as a system service.

```bash
# initialize — will prompt for host, port, db name, user, password
dbgit init

# take first snapshot
dbgit snapshot -m "initial state"

# make changes to your database, then snapshot again
dbgit snapshot -m "added users, updated orders"

# see all snapshots
dbgit log

# compare any two
dbgit diff s1 s2
```

When prompted during `init`:
- host → `localhost`
- port → `5432`
- SSL → `N`

---

## Usage — PostgreSQL in Docker

Start your container first:

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

Then use DBGit with the URL flag so you can specify the mapped port:

```bash
# initialize
dbgit init --url 'postgresql://postgres:secret@localhost:5434/mydb'

# take first snapshot
dbgit snapshot -m "initial state"

# make changes to your database, then snapshot again
dbgit snapshot -m "added users, updated orders"

# see all snapshots
dbgit log

# compare any two
dbgit diff s1 s2
```

Port `5434` is used here to avoid clashing with a native PostgreSQL that might already be running on `5432`. Use whatever port you mapped in the `-p` flag.

---

## Usage — Cloud PostgreSQL (Supabase, Neon, Railway, etc.)

Get your connection URL from the provider dashboard. On Supabase it's under Settings → Database → URI.

```bash
# initialize with the connection URL
# if your password has ? or & in it, encode them: ? → %3F  and  & → %26
dbgit init --url 'postgresql://postgres:yourpassword@db.xxxx.supabase.co:5432/postgres' --ssl

# take first snapshot
dbgit snapshot -m "initial state"

# make changes to your database, then snapshot again
dbgit snapshot -m "added users, updated orders"

# see all snapshots
dbgit log

# compare any two
dbgit diff s1 s2
```

`--ssl` is required for all cloud providers. If your URL already has `?sslmode=require` at the end you can skip the flag, DBGit picks it up automatically.

---

## Project structure

```
src/
├── cli.js
├── commands/       init, snapshot, diff, log
├── services/       postgres, hash, diff logic, html report
└── utils/          file and json helpers

docs/
├── 1_working_of_postgress.md
├── 2_how_to_run_this_project.md
└── 3_complete_project_explained.md
```
