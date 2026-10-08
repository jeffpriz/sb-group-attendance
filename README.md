# SB Group Attendance

A simple web app for tracking small-group attendance at **Springbrook Community Church**.

- **Groups:** create a group with a name (rename or delete it later).
- **Members:** add members by name only, one at a time or several at once. Rename or remove them. Removed members are kept in the data so past attendance still shows their name, and you can restore them.
- **Meeting schedule:** tap dates on a calendar to add or remove meetings. Use the "Add a repeating meeting" helper to fill in a weekly, every-other-week or every-4-weeks meeting day between two dates.
- **Take attendance:** open a group, pick a meeting (the most recent one is shown at the top), tap each member who came, or use **Mark all** / **Clear**, then **Save attendance**. It's built to work well on a phone.
- **Review history:** for each group, see who came to each past meeting, attendance per member (count, percentage, last attended), a members × meetings grid, and a CSV download.

## Tech

- [React](https://react.dev) + TypeScript, built with [Vite](https://vite.dev)
- [React Router](https://reactrouter.com) for page navigation
- [React DayPicker](https://daypicker.dev) for the meeting calendar
- A small [Express](https://expressjs.com) server (TypeScript, run with [tsx](https://tsx.is)) that saves data as JSON files
- [Vitest](https://vitest.dev) + Supertest for tests, [oxlint](https://oxc.rs) for linting

## Local development (no Docker, no Azure)

Everything runs on your own computer. You don't need an Azure account, Docker or any cloud service. Data is saved as JSON files in the project's `data/` folder.

**Prerequisites**

- [Node.js](https://nodejs.org) **24 LTS** (the same version the Docker image uses; `.nvmrc` says `24`). Node 20.19 or newer also works.
- npm (comes with Node.js)

**Run it**

```bash
npm install      # once, and again after pulling changes to package.json
npm run dev
```

- Open **http://localhost:5173**. That's the Vite dev server, with instant reload when you edit `src/`.
- The API server runs on **http://localhost:3001** and restarts when you edit `server/` or `shared/`. Vite forwards `/api` requests to it.
- Data goes to `./data/groups/*.json`. Delete that folder to start fresh.
- Stop both servers with **Ctrl+C**.

**Change local settings (optional)**

```bash
cp .env.example .env    # then edit .env
```

`.env` can set `DATA_DIR`, `PORT` and `HOST` (see the table below). The server reads it at startup and the dev proxy picks up `PORT`. `.env` is gitignored, so your local settings are never committed. Variables set in your shell take precedence over `.env`.

**Other commands**

```bash
npm test             # run the tests
npm run typecheck    # type-check website, server and shared code
npm run lint         # lint
```

### Production-like local run

```bash
npm run build
npm start
```

Then open http://localhost:3001. In this mode one Express server serves both the built website and the API, as it does in Docker. Other devices on the same network (for example a phone) can use `http://<this-computer's-IP>:3001`.

### Environment variables

| Variable   | Default                        | What it does                                                                                       |
| ---------- | ------------------------------ | -------------------------------------------------------------------------------------------------- |
| `DATA_DIR` | `data/` in the project folder (`/data` in Docker) | Folder where JSON files are saved. Absolute paths are used as-is; relative paths are resolved from the current directory (the project folder when using npm scripts). |
| `PORT`     | `3001`                         | Port the server listens on.                                                                        |
| `HOST`     | `0.0.0.0`                      | Address the server binds to (all interfaces by default).                                           |

Set these in your shell, in a local `.env` file, with `docker run -e`, or as container app environment variables in Azure. On startup the server creates `DATA_DIR` and its `groups/` subfolder if they're missing, checks it can write there, and logs the folder it's using. If the folder can't be created or written, it prints an error and exits instead of starting.

```bash
DATA_DIR=/mnt/share/attendance PORT=8080 npm start
```

## Docker

The `Dockerfile` builds a production image (Node 24 LTS on Alpine, multi-stage). It runs as the non-root `node` user (uid/gid 1000) with `NODE_ENV=production`, `PORT=3001` and `DATA_DIR=/data`. `/data` is declared as a volume, and a health check calls `/api/health`, which fails if the data folder becomes unwritable.

Build and run:

```bash
docker build -t sb-group-attendance .

# Store data in a host folder or mounted file share
docker run -d --name sb-attendance --init --restart unless-stopped \
  -p 3001:3001 \
  -v /path/to/share/sb-group-attendance:/data \
  sb-group-attendance
```

Use a different data path or port inside the container:

```bash
docker run -d --name sb-attendance --init \
  -p 8080:8080 -e PORT=8080 \
  -e DATA_DIR=/mnt/share/attendance \
  -v /path/to/share:/mnt/share \
  sb-group-attendance
```

Or with Docker Compose (see `docker-compose.yml`):

```bash
ATTENDANCE_DATA_PATH=/path/to/share/sb-group-attendance docker compose up -d --build
```

Check the logs for the `Data folder: ...` line to confirm where data is being saved: `docker logs sb-attendance`.

### File permissions on mounted folders and shares

The container runs as uid **1000** (gid 1000), not root, so the mounted folder must be writable by uid 1000. If it isn't, the container logs `Cannot create data folder ...` or `... is not writable` and exits.

- **Local folder:** `sudo chown -R 1000:1000 /path/to/share/sb-group-attendance`
- **SMB / CIFS (including Azure Files SMB):** ownership comes from the mount options, not `chown`. Mount with `uid=1000,gid=1000,dir_mode=0770,file_mode=0660`. Example for an Azure Files share on a Linux Docker host:
  ```bash
  sudo mount -t cifs //<account>.file.core.windows.net/<share> /mnt/churchshare \
    -o vers=3.1.1,username=<account>,password=<storage-key>,uid=1000,gid=1000,dir_mode=0770,file_mode=0660,serverino,nosharesock,actimeo=30
  ```
  `docker-compose.yml` also has a commented example that lets Docker mount the SMB share itself.
- **NFS (including Azure Files NFS):** make the export directory owned by uid/gid 1000 (`chown 1000:1000` from a client), or set the share's squash settings so uid 1000 can write.
- **Azure Container Apps:** see **[docs/azure-container-apps.md](docs/azure-container-apps.md)**. It covers the Azure Files SMB volume, the storage key kept in Key Vault, mount options `uid=1000,gid=1000`, a single replica, health probes and an example Bicep file in `deploy/azure-container-apps/`.

**Run one container per data folder.** The server queues saves within a single process. Two containers writing the same share at the same time could overwrite each other's changes. Saves write a temp file in the same folder and then rename it over the real file. That works on SMB and NFS shares, but `DATA_DIR` must point straight at the share, not at a folder that spans two filesystems.

## Deploying to Azure Container Apps

See **[docs/azure-container-apps.md](docs/azure-container-apps.md)** and the example Bicep file [`deploy/azure-container-apps/main.bicep`](deploy/azure-container-apps/main.bicep). The app itself only needs `DATA_DIR=/data`. The storage account key lives in Key Vault and is used by the Container Apps environment to mount the share, never by the app.

## Scripts

| Script              | What it does                                                      |
| ------------------- | ----------------------------------------------------------------- |
| `npm run dev`       | Start the API server and Vite dev server with hot reload          |
| `npm run build`     | Type-check everything and build the website into `dist/`          |
| `npm start`         | Run the server: API plus the built website from `dist/`           |
| `npm run typecheck` | Type-check the website, server and shared code                    |
| `npm run lint`      | Lint with oxlint                                                  |
| `npm test`          | Run the tests (date helpers, JSON storage and API)                |

`GET /api/health` returns `{ "ok": true, "dataWritable": true }`, or a 503 status if the data folder can't be written.

## Where data is stored

Everything is saved as JSON files in the `data/` folder, one file per group:

```
data/
  groups/
    <group-id>.json   # group name, members, meeting schedule and attendance
```

A group file looks like this:

```json
{
  "id": "6f1c…",
  "name": "Wednesday Night Group",
  "createdAt": "2026-10-01T15:00:00.000Z",
  "updatedAt": "2026-10-07T20:15:00.000Z",
  "members": [
    { "id": "a1…", "name": "Jane Smith", "addedAt": "2026-10-01T15:01:00.000Z" },
    { "id": "b2…", "name": "John Doe", "addedAt": "2026-10-01T15:01:05.000Z", "removedAt": "2026-11-02T18:00:00.000Z" }
  ],
  "meetings": [
    {
      "date": "2026-10-07",
      "attendance": { "presentMemberIds": ["a1…"], "recordedAt": "2026-10-07T20:15:00.000Z" }
    },
    { "date": "2026-10-14" }
  ]
}
```

- Meeting dates are plain calendar dates (`YYYY-MM-DD`), so they never shift with time zones. A meeting without `attendance` hasn't been taken yet.
- Files are written to a temporary file in the same folder first and then swapped into place, so a crash can't leave a half-written file. Changes to the same group are saved one at a time. Temp files left behind by a crash are cleaned up on the next start.
- Set the `DATA_DIR` environment variable to keep the data somewhere else, such as a file share (see [Docker](#docker)).
- **The `data/` folder is not committed to git** (it holds people's names). Back it up by copying the folder.

## API

All endpoints are under `/api` and use JSON.

| Method | Path                                         | Body                         |
| ------ | -------------------------------------------- | ---------------------------- |
| GET    | `/groups`                                    |                              |
| POST   | `/groups`                                    | `{ name }`                   |
| GET    | `/groups/:groupId`                           |                              |
| PATCH  | `/groups/:groupId`                           | `{ name }`                   |
| DELETE | `/groups/:groupId`                           |                              |
| POST   | `/groups/:groupId/members`                   | `{ name }`                   |
| PATCH  | `/groups/:groupId/members/:memberId`         | `{ name }` or `{ restore: true }` |
| DELETE | `/groups/:groupId/members/:memberId`         | (marks the member removed)   |
| PUT    | `/groups/:groupId/meetings`                  | `{ dates: ["2026-10-07"], force? }` |
| PUT    | `/groups/:groupId/meetings/:date/attendance` | `{ presentMemberIds: [] }`   |
| DELETE | `/groups/:groupId/meetings/:date/attendance` |                              |

`PUT /meetings` replaces the whole schedule and keeps attendance for dates that stay. Removing a meeting that already has attendance returns `409` unless `force: true` is sent.

## Notes

There is no login. Anyone who can reach the server can view and change attendance, so run it on a trusted network or put it behind a login before exposing it to the internet.
