# StackFast Development Guidelines

This document explains how to set up, run, and maintain the frontend and backend for the checkpoint prototype.

## 1. Prerequisites

- Node.js 18+ (recommended: Node.js 20 LTS)
- npm 9+
- Git
- PostgreSQL 14+

Check versions:

```bash
node -v
npm -v
git --version
```

## 2. Project structure

- `backend/`: Node.js + Express APIs
- `frontend/`: React + Vite app

## 3. First-time setup

From the repository root:

```bash
cd backend
npm install

cd ../frontend
npm install
```

## 4. Environment variables (.env)

Do not commit `.env` files. They are ignored by `.gitignore`.

### Backend `.env`

Create `backend/.env`:

```env
PORT=4000
DATABASE_URL=postgresql://username:password@localhost:5432/stackfast
```

You can copy from the template and edit it:

```bash
cp backend/.env.example backend/.env
```

### Frontend `.env`

Create `frontend/.env`:

```env
VITE_API_BASE_URL=http://localhost:4000
```

Notes:
- Frontend env variables must start with `VITE_` to be available in client code.
- If you change `.env`, restart the corresponding dev server.

## 5. Run the app

Open two terminals.

### Terminal 1: backend

Initialize schema and seed data (first run, or when you want a reset):

```bash
cd backend
npm run db:init
npm run db:seed
```

Start backend:

```bash
cd backend
npm run dev
```

Backend runs at `http://localhost:4000`.

### Terminal 2: frontend

```bash
cd frontend
npm run dev
```

Frontend runs at `http://localhost:5173`.

## 6. Build commands

### Frontend production build

```bash
cd frontend
npm run build
```

### Backend start (non-watch mode)

```bash
cd backend
npm run start
```

## 7. API quick checks

After backend is running:

```bash
curl http://localhost:4000/health
curl "http://localhost:4000/search?q=postgresql"
curl http://localhost:4000/tags
curl http://localhost:4000/benchmark
```

## 8. Database scripts

Run from `backend/`:

```bash
npm run db:init   # create tables and indexes
npm run db:seed   # seed initial sample data
npm run db:reset  # init + seed
```

## 9. Installing packages

Install dependencies in the correct folder.

### Backend package

```bash
cd backend
npm install <package-name>
```

Example:

```bash
npm install pg
```

### Frontend package

```bash
cd frontend
npm install <package-name>
```

Example:

```bash
npm install axios
```

### Dev dependency

```bash
npm install -D <package-name>
```

## 10. Common troubleshooting

- Port in use:
  - Change `PORT` in `backend/.env`, or stop the process using that port.
- Frontend cannot reach backend:
  - Confirm backend is running.
  - Confirm `VITE_API_BASE_URL` in `frontend/.env`.
  - Restart frontend after `.env` changes.
- Backend cannot connect to PostgreSQL:
  - Confirm PostgreSQL is running and accessible.
  - Verify `DATABASE_URL` in `backend/.env`.
  - Re-run `npm run db:init` after fixing connection settings.
- Dependency issues:
  - Delete `node_modules` and `package-lock.json` in affected folder, then run `npm install` again.

## 11. Git workflow tip

Before committing, verify ignored files are not staged:

```bash
git status
```

If needed, unstage and re-add after updating `.gitignore`:

```bash
git reset
git add .
```
