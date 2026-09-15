# Khamosh Alfaaz — Backend

Private diary backend. Node 20+, JavaScript ESM, Express, Mongoose, MongoDB.

## Features
- Private username and PIN registration/login with scrypt PIN hashing
- Server-generated random session token stored as a SHA-256 hash in an HTTP-only cookie
- Visitor ownership enforced on every entry, category, export, backup, and reset query
- Username availability lookup with a database uniqueness constraint
- Zod validation, Helmet, CORS, rate limiting, 2 MB body limits, centralized errors
- Entries: list/get/create/update/delete, favorite, pin, search, calendar, on-this-day, pagination/sorting/filters
- Categories CRUD with unique-per-visitor names
- Statistics, export, backup/restore, and PIN-protected delete-all/reset
- Health endpoint

## Env (`.env`)
```
NODE_ENV=development
PORT=5001
# For MongoDB Atlas include the database name in the path, e.g. ...mongodb.net/khamosh-alfaaz?retryWrites=true
MONGODB_URI=mongodb://127.0.0.1:27017/khamosh-alfaaz
SESSION_SECRET=replace-with-a-long-random-secret
CLIENT_URL=http://localhost:5173
MAX_TITLE_LENGTH=200
MAX_TAG_COUNT=20
MAX_TAG_LENGTH=50
MAX_NAME_LENGTH=100
SESSION_MAX_AGE_MS=2592000000
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=300
```

## Scripts
- `npm run dev` — watch mode
- `npm start` — production start
- `npm test` — Node test runner against local MongoDB

## API notes
- `GET /api/session/username?username=` — check private username availability
- `POST /api/session` or `/api/session/register` — register with `{ name, username, pin }`
- `POST /api/session/login` — login with `{ username, pin }`
- `GET /api/session` — current session
- `PATCH /api/session/name` — update display name
- `DELETE /api/session` — logout
- Entries: `GET/POST /api/entries`, `GET/PATCH/DELETE /api/entries/:id`, `PATCH /api/entries/:id/favorite`, `PATCH /api/entries/:id/pin`
- `GET /api/entries/search?q=`, `GET /api/entries/calendar?month=YYYY-MM`, `GET /api/entries/on-this-day`
- Categories: `GET/POST /api/categories`, `PATCH/DELETE /api/categories/:id`
- Export: `GET /api/export/entry/:id/{docx,pdf,txt}`, `POST /api/export/{docx,pdf}`
- Backup: `GET /api/backup`, `POST /api/backup/restore`, `POST /api/backup/delete-all` with `{ pin }`
- `GET /api/health`, `GET /api/statistics`

## Security
- PINs are hashed with salted scrypt; raw PINs are never stored
- Session cookies are HTTP-only, SameSite lax/strict, and secure in production
- Session tokens are random 256-bit values and only SHA-256 hashes are stored
- Login and username checks are rate-limited
- All data queries include the server-resolved `visitorId`; client-supplied ownership values are never trusted
- Destructive reset/delete-all requires the current PIN
