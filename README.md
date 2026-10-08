# SB Group Attendance

A small web app for tracking **small-group attendance at Springbrook Community Church**.

Group leaders and church admins use it to set up each group (name, members and meeting schedule), check off who came to each meeting, and later look back at attendance history. It works on a phone, so leaders can take attendance during the meeting.

- **Groups:** one entry per small group.
- **Members:** names only. No contact details or other personal information are stored.
- **Data:** saved as plain JSON files on the server (one file per group). There is no database and no login.

---

## Using the app

The home page (**Groups**) lists every group, with its member count, meeting count and next meeting. Click a group to open it. Each group has four tabs: **Attendance**, **Members**, **Schedule** and **History**.

### 1. Create a group

On the home page, under **Create a group**, type a **Group name** and click **Create group**. You're taken straight to the new group's **Members** tab.

### 2. Add members

On the **Members** tab:

- **One at a time:** type a **Member name** and click **Add** (or press Enter). The box stays ready for the next name.
- **Several at once:** click **Add several at once**, paste names into **Names (one per line)**, and click **Add members**.
- **Rename** or **Remove** a member from the list. A removed member is hidden from new meetings, but their past attendance is kept. **Show removed members** lets you **Restore** them.
- **Group settings** at the bottom lets you rename the group or **Delete group…** (you must type `DELETE` to confirm; this permanently deletes the group, its members, schedule and attendance).

### 3. Build the meeting schedule

On the **Schedule** tab:

- **Meeting calendar:** tap a date to add a meeting, and tap it again to remove it. Changes save automatically ("All changes saved"). Days that already have attendance are shown in green. If you remove one of those, the app asks first, because that attendance would be deleted.
- **Add a repeating meeting:** choose the day under **Meets every**, set **How often** (**Every week**, **Every other week** or **Every 4 weeks**), pick the **Starting** and **Ending** dates, and click **Add N meetings**. Dates already on the calendar are skipped.
- **Scheduled meetings** lists every date. Click a date to open it, or **✕** to remove it.

### 4. Take attendance

On the **Attendance** tab, the meeting for **Today** (or the **Most recent meeting**) is shown at the top with a **Take attendance** / **Review attendance** button. Below it are **Past meetings** and **Upcoming meetings**, each marked **Not taken**, **Scheduled** or "*X* of *Y* present". Click any meeting to open it.

On the meeting page:

- Tap each member who was there. Checked members turn green. The counter shows "*X* of *Y* present".
- **Mark all** checks everyone; **Clear** unchecks everyone.
- Click **Save attendance** in the bar at the bottom. It shows **Unsaved changes** until you save. You can come back and change it later.
- Use the links at the top to jump to the previous or next meeting.

### 5. Review history

The **History** tab (once at least one meeting has attendance) shows:

- Totals: meetings recorded, average attendance and highest attendance.
- **By meeting:** each meeting with its count. Expand it to see who was **Present** and **Absent**, with an **Edit attendance** link.
- **By member:** how many recorded meetings each person attended, as a percentage, and when they last attended.
- **Attendance grid:** members × meetings with ✓ marks.
- **Download CSV:** the grid as a spreadsheet file.

---

## How the code is organized

### Tech stack

| Part | Technology |
| ---- | ---------- |
| Website | [React](https://react.dev) 19 + TypeScript, built with [Vite](https://vite.dev) |
| Page navigation | [React Router](https://reactrouter.com) |
| Calendar | [React DayPicker](https://daypicker.dev) (multiple-date selection) |
| API server | [Express](https://expressjs.com) 5 in TypeScript, run with [tsx](https://tsx.is) |
| Storage | JSON files on disk, one per group |
| Tests / lint | [Vitest](https://vitest.dev) + Supertest, [oxlint](https://oxc.rs) |

In development, Vite serves the website and forwards `/api` requests to the Express server. In production (`npm start` or Docker), the Express server serves both the built website and the API on one port.

### Repository layout

```
├── src/                      # Website (React)
│   ├── main.tsx              # Entry point: router + global styles
│   ├── App.tsx               # Header and page routes
│   ├── pages/                # One component per page/tab
│   │   ├── GroupsPage.tsx        # Home: group list + "Create a group"
│   │   ├── GroupLayout.tsx       # Loads a group, shows its name and tabs
│   │   ├── MeetingsPage.tsx      # Attendance tab: pick a meeting
│   │   ├── AttendancePage.tsx    # Check off members for one meeting
│   │   ├── MembersPage.tsx       # Add/rename/remove members, group settings
│   │   ├── SchedulePage.tsx      # Meeting calendar + repeating meetings
│   │   └── HistoryPage.tsx       # Stats, by meeting/member, grid, CSV
│   ├── api.ts                # Typed fetch calls to the API
│   └── index.css             # All styling (mobile-first)
├── server/                   # API server (Express)
│   ├── index.ts              # Startup: reads env vars/.env, checks the data folder, listens
│   ├── app.ts                # API routes and validation
│   ├── storage.ts            # JSON file storage (atomic writes, per-group queue)
│   └── *.test.ts             # API and storage tests
├── shared/                   # Code used by both website and server
│   ├── types.ts              # Group / Member / Meeting types (the data model)
│   ├── dates.ts              # Date helpers (YYYY-MM-DD, repeating dates)
│   └── dates.test.ts
├── data/                     # Default data folder (contents are gitignored)
├── docs/azure-container-apps.md      # Azure deployment guide
├── deploy/azure-container-apps/      # Example Bicep file for Azure
├── Dockerfile                # Production image
├── docker-compose.yml        # Example: run with data on a host folder/share
├── .env.example              # Optional local settings (copy to .env)
├── vite.config.ts            # Vite config, including the /api dev proxy
└── vitest.config.ts          # Test config
```

### API

All endpoints are under `/api` and send and receive JSON. Every change returns the updated group.

| Method | Path | Body | Purpose |
| ------ | ---- | ---- | ------- |
| GET | `/health` | | `{ ok, dataWritable }`; returns 503 if the data folder can't be written |
| GET | `/groups` | | List groups (summary) |
| POST | `/groups` | `{ name }` | Create a group |
| GET | `/groups/:groupId` | | Get one group (members, meetings, attendance) |
| PATCH | `/groups/:groupId` | `{ name }` | Rename a group |
| DELETE | `/groups/:groupId` | | Delete a group |
| POST | `/groups/:groupId/members` | `{ name }` | Add a member |
| PATCH | `/groups/:groupId/members/:memberId` | `{ name }` or `{ restore: true }` | Rename or restore a member |
| DELETE | `/groups/:groupId/members/:memberId` | | Remove a member (kept for history) |
| PUT | `/groups/:groupId/meetings` | `{ dates: ["2026-10-07", …], force? }` | Replace the meeting schedule |
| PUT | `/groups/:groupId/meetings/:date/attendance` | `{ presentMemberIds: [...] }` | Save attendance for a meeting |
| DELETE | `/groups/:groupId/meetings/:date/attendance` | | Clear attendance for a meeting |

`PUT …/meetings` keeps attendance for dates that stay on the schedule. Removing a date that already has attendance returns `409` unless `force: true` is sent. Attendance can only be saved for a scheduled date.

### Data model

Each group is one file: `DATA_DIR/groups/<group-id>.json`. `DATA_DIR` is `./data` by default.

| Field | Meaning |
| ----- | ------- |
| `id`, `name`, `createdAt`, `updatedAt` | The group |
| `members[]` | `{ id, name, addedAt, removedAt? }`. `removedAt` is set when a member is removed; they stay in the file so history keeps their name. |
| `meetings[]` | `{ date, attendance? }`, sorted by date. `date` is a calendar date (`YYYY-MM-DD`). `attendance` is missing until it's taken. |
| `meetings[].attendance` | `{ presentMemberIds[], recordedAt }`: who was there and when it was saved |

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
    { "date": "2026-10-07", "attendance": { "presentMemberIds": ["a1…"], "recordedAt": "2026-10-07T20:15:00.000Z" } },
    { "date": "2026-10-14" }
  ]
}
```

Files are written to a temp file in the same folder and then renamed into place, so a crash can't leave a half-written file. Saves to the same group are queued one at a time. Temp files left over from a crash are cleaned up at startup.

---

## Local development

Everything runs on your own computer. You don't need Docker, an Azure account or any cloud service.

**Prerequisites**

- [Node.js](https://nodejs.org) **24 LTS** (the same version the Docker image uses; `.nvmrc` says `24`). Node 20.19 or newer also works.
- npm (comes with Node.js)

**Run it**

```bash
npm install      # once, and again after pulling changes to package.json
npm run dev
```

- Open **http://localhost:5173**. That's the Vite dev server, which reloads instantly when you edit `src/`.
- The API server runs on **http://localhost:3001** and restarts when you edit `server/` or `shared/`.
- Data goes to `./data/groups/*.json`. Delete that folder to start fresh.
- Stop both servers with **Ctrl+C**.

**Optional local settings:** run `cp .env.example .env` and edit `.env` to set any of the [configuration](#configuration) variables. The server reads `.env` at startup, and the dev proxy picks up `PORT`. Variables set in your shell take precedence. `.env` is gitignored.

**Production-like local run**

```bash
npm run build
npm start        # http://localhost:3001 serves the built site and the API
```

Other devices on the same network (for example a phone) can use `http://<this-computer's-IP>:3001`.

### Scripts

| Script | What it does |
| ------ | ------------ |
| `npm run dev` | Start the API server (tsx watch) and the Vite dev server together |
| `npm run build` | Type-check everything and build the website into `dist/` |
| `npm start` | Run the server: API plus the built website from `dist/` |
| `npm test` | Run the tests (date helpers, JSON storage, API) |
| `npm run typecheck` | Type-check the website, server and shared code |
| `npm run lint` | Lint with oxlint |

---

## Configuration

Set these in your shell, in a local `.env` file, with `docker run -e`, or as environment variables on the Azure container app.

| Variable | Default | What it does |
| -------- | ------- | ------------ |
| `DATA_DIR` | `./data` in the project folder (`/data` in Docker) | Folder for the JSON data. Absolute paths are used as-is; relative paths are resolved from the current directory. |
| `PORT` | `3001` | Port the server listens on. |
| `HOST` | `0.0.0.0` | Address the server binds to (all network interfaces). Use `127.0.0.1` for this computer only. |
| `ATTENDANCE_DATA_PATH` | `./data` | **docker-compose.yml only:** host folder mounted into the container at `/data`. |

On startup the server creates `DATA_DIR/groups/` if it's missing, checks that it can write there, and logs `Data folder: …`. If it can't write, it prints an error and exits instead of starting.

---

## Docker and Azure

**Docker:** the `Dockerfile` builds a production image (Node 24 on Alpine). It runs as the non-root `node` user (uid/gid 1000), stores data in `/data`, and has a health check on `/api/health`.

```bash
docker build -t sb-group-attendance .
docker run -d --name sb-attendance --init --restart unless-stopped \
  -p 3001:3001 -v /path/to/share/sb-group-attendance:/data sb-group-attendance
```

The mounted folder must be writable by **uid 1000**. For a local folder, `chown 1000:1000` it. For an SMB/CIFS share (such as Azure Files), mount it with `uid=1000,gid=1000,dir_mode=0770,file_mode=0660`. Or use Docker Compose: `ATTENDANCE_DATA_PATH=/path/to/share docker compose up -d --build`. `docker-compose.yml` also has a commented example for mounting an Azure Files SMB share directly.

**Azure Container Apps:** see **[docs/azure-container-apps.md](docs/azure-container-apps.md)** and the example [`deploy/azure-container-apps/main.bicep`](deploy/azure-container-apps/main.bicep). The data lives on an Azure Files SMB volume mounted at `/data`, and the storage account key is kept in Key Vault and used by the Container Apps environment, not by the app. The app only needs `DATA_DIR=/data`.

---

## Notes

- **No login.** Anyone who can reach the server can view and change attendance. Run it on a trusted network, or put it behind authentication (for example, Container Apps built-in authentication) before exposing it to the internet.
- **Data is not in git.** `data/` holds church members' names, so its contents are gitignored (only `data/.gitkeep` is committed). Back up the data folder or file share separately.
- **Run a single server/replica per data folder.** Saves are coordinated inside one process. Two servers writing the same folder at the same time could overwrite each other's changes. On Azure, keep min and max replicas at 1.
