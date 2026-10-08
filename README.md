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

## Getting started

Requires Node.js 20.19 or newer.

```bash
npm install
npm run dev
```

Then open http://localhost:5173. `npm run dev` starts both the Vite dev server and the API server (on port 3001). Vite forwards `/api` requests to the API server.

### Running it for real use

```bash
npm install
npm run build
npm start
```

Then open http://localhost:3001. In this mode one Express server serves both the built website and the API. Set `PORT` to use a different port. Other devices on the same network (for example a phone) can use `http://<this-computer's-IP>:3001`.

## Scripts

| Script              | What it does                                                      |
| ------------------- | ----------------------------------------------------------------- |
| `npm run dev`       | Start the API server and Vite dev server with hot reload          |
| `npm run build`     | Type-check everything and build the website into `dist/`          |
| `npm start`         | Run the server: API plus the built website from `dist/`           |
| `npm run typecheck` | Type-check the website, server and shared code                    |
| `npm run lint`      | Lint with oxlint                                                  |
| `npm test`          | Run the tests (date helpers, JSON storage and API)                |

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
- Files are written to a temporary file first and then swapped into place, so a crash can't leave a half-written file. Changes to the same group are saved one at a time.
- Set the `DATA_DIR` environment variable to keep the data somewhere else.
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
