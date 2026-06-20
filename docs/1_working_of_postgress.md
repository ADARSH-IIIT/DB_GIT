# How PostgreSQL Works — Local, Docker, and Cloud

---

## 1. PostgreSQL Installed Natively (Local)

When you install PostgreSQL directly on your machine, it becomes a **system service** — exactly like MySQL.

```
Your Machine (Linux / Mac / Windows)
│
├── OS manages a background service: "postgresql"
│
└── That service runs a process that:
    ├── Listens on port 5432
    ├── Accepts incoming connections
    └── Reads and writes data to a folder on your disk
```

That folder on disk is called the **data directory**. It is the single source of truth for everything PostgreSQL knows.

```
/var/lib/postgresql/15/main/       ← Ubuntu / Debian
/usr/local/var/postgresql@15/      ← Mac via Homebrew
C:\Program Files\PostgreSQL\15\data\  ← Windows
```

Inside that folder:

```
data/
├── base/              ← actual table data (one subfolder per database)
│   └── 16384/         ← your database, identified by an internal OID number
│       ├── 16385      ← file for table "users"    (binary, 8KB pages)
│       ├── 16386      ← file for table "orders"
│       └── 16387      ← index on users.id
│
├── pg_wal/            ← Write-Ahead Log — used for crash recovery
├── pg_hba.conf        ← controls who can connect and how
├── postgresql.conf    ← all config: port, memory limits, logging etc.
└── global/            ← cluster-wide data: roles, tablespaces
```

### How a query actually works

```
Your App
   │
   │  (SQL over TCP, port 5432)
   ▼
PostgreSQL Process
   │
   ├── Parses the SQL
   ├── Plans the query (picks best index etc.)
   ├── Checks shared_buffers (in-memory cache) for the page
   │       if found → returns from memory
   │       if not   → reads 8KB page from disk file in base/
   └── Returns result
```

Data is stored in **8KB pages** inside binary files. You cannot open these with a text editor. PostgreSQL manages its own memory cache (`shared_buffers`) and writes changes to the WAL before touching the actual data files — this is how it survives crashes.

---

## 2. PostgreSQL Inside a Docker Container

Docker runs PostgreSQL inside an **isolated container** — a lightweight, self-contained Linux environment on your machine.

```
Your Machine
│
└── Docker Engine
    │
    └── Container (its own mini Linux)
        ├── has its own filesystem
        ├── has its own process space
        └── runs: postgres process
                   └── data directory at /var/lib/postgresql/data
                                           (inside the container)
```

From the outside, you reach it by mapping its port to your machine:

```bash
docker run -p 5432:5432 postgres
#               ↑     ↑
#          your port  container port
```

The PostgreSQL internals — data pages, WAL, config — are **identical** to a native install. Docker is just an isolation wrapper. Postgres does not know or care that it is inside a container.

---

## 3. The Problem with Docker

Containers are **ephemeral** by design. Their filesystem is temporary.

```
docker run postgres     ← starts container, postgres writes data inside it
docker rm <container>   ← container deleted → ALL DATA GONE
```

This is fine for development where you want a fresh database every time. But for anything real, you need data to survive a container restart or deletion.

```
Without a volume:

  Container filesystem
  └── /var/lib/postgresql/data/   ← data lives here only
                                      deleted when container is removed
```

---

## 4. The Solution — Docker Volumes

You mount a folder from your real machine into the container. Now both sides see the same folder.

```bash
docker run \
  -p 5432:5432 \
  -v /home/adarsh/pgdata:/var/lib/postgresql/data \
  -e POSTGRES_PASSWORD=secret \
  postgres
```

```
Your real disk: /home/adarsh/pgdata/
         ↕  (mounted — same folder, two views)
Container sees: /var/lib/postgresql/data/
```

Now when PostgreSQL writes inside the container, it actually lands on your real disk. Delete the container, recreate it with the same `-v` flag — data is still there.

```
With a volume:

  Your machine disk
  └── /home/adarsh/pgdata/        ← data lives here permanently
              ↕ mounted
  Container
  └── /var/lib/postgresql/data/   ← postgres writes here → goes to your disk
```

There is also a second approach — **named volumes** — where Docker manages the folder location for you:

```bash
docker volume create pgdata

docker run \
  -p 5432:5432 \
  -v pgdata:/var/lib/postgresql/data \
  -e POSTGRES_PASSWORD=secret \
  postgres
```

Docker stores this at `/var/lib/docker/volumes/pgdata/_data/` internally. Same idea, Docker just manages the path.

---

## 5. Cloud-Hosted PostgreSQL and Connection URLs

Cloud providers (Neon, Supabase, Railway, Render, AWS RDS etc.) run PostgreSQL on their own servers. You do not manage the data directory, backups, or the process at all. You just get a connection string.

```
Your Machine
    │
    │  TCP connection over the internet
    │  (usually port 5432, with SSL encryption)
    │
    ▼
Cloud Provider's Server
    └── PostgreSQL process
        └── data stored on their managed disk / SSD cluster
```

### The Connection URL format

```
postgresql://username:password@hostname:port/database?sslmode=require
     ↑            ↑       ↑        ↑       ↑     ↑          ↑
  protocol      user    pass     host    port  database   SSL param
```

Real examples:

```
# Neon
postgresql://alex:AbCdEf@ep-cool-darkness-123456.us-east-2.aws.neon.tech/neondb?sslmode=require

# Supabase
postgresql://postgres:yourpassword@db.xxxxxxxxxxxx.supabase.co:5432/postgres

# Railway
postgresql://postgres:randompass@roundhouse.proxy.rlwy.net:12345/railway

# Local native (no SSL needed)
postgresql://postgres:secret@localhost:5432/mydb

# Local Docker (mapped to port 5434)
postgresql://postgres:secret@localhost:5434/mydb
```

### Why SSL is required for cloud

When you connect to a cloud database, your SQL queries and results travel over the public internet. Without SSL, anyone on the network path can read your data in plain text. Cloud providers enforce SSL to encrypt this traffic.

Local connections (localhost) skip SSL because traffic never leaves your machine.

```
Local:   your app → localhost → postgres     (no encryption needed, same machine)
Cloud:   your app → internet → cloud server  (must encrypt, SSL/TLS required)
```

### What happens internally when you connect via URL

The `pg` library (Node.js) parses the URL, opens a TCP socket to the host, performs a TLS handshake if SSL is required, then runs the standard PostgreSQL wire protocol — same as if you had typed each field separately. The URL is just a compact way to pass all connection details in one string.

---

## Summary

| | Native Install | Docker (no volume) | Docker (with volume) | Cloud |
|---|---|---|---|---|
| Data location | Real disk path | Inside container | Real disk path | Provider's servers |
| Data survives restart | Yes | Yes | Yes | Yes |
| Data survives `docker rm` | N/A | No | Yes | Yes |
| You manage the process | Yes | Yes (via Docker) | Yes (via Docker) | No |
| SSL needed | No | No | No | Yes |
| How you connect | host + port + creds | localhost + mapped port | localhost + mapped port | URL string |
| Port config | postgresql.conf | `-p` flag on `docker run` | `-p` flag on `docker run` | Fixed by provider |
