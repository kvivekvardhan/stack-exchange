# StackFast Development Guidelines

This document explains how to set up, run, and maintain the frontend and backend for the checkpoint prototype.

## 1. Prerequisites

- Node.js 18+ (recommended: Node.js 20 LTS)
- npm 9+
- Git

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
# For later DB integration:
# DATABASE_URL=postgresql://username:password@localhost:5432/stackfast
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

## 8. Installing packages

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

## 9. Common troubleshooting

- Port in use:
  - Change `PORT` in `backend/.env`, or stop the process using that port.
- Frontend cannot reach backend:
  - Confirm backend is running.
  - Confirm `VITE_API_BASE_URL` in `frontend/.env`.
  - Restart frontend after `.env` changes.
- Dependency issues:
  - Delete `node_modules` and `package-lock.json` in affected folder, then run `npm install` again.

## 10. Git workflow tip

Before committing, verify ignored files are not staged:

```bash
git status
```

If needed, unstage and re-add after updating `.gitignore`:

```bash
git reset
git add .
```
