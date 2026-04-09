# Backend Configuration Guidelines

This guide explains how to configure PostgreSQL and backend environment variables for this project on Linux.

## 1) Prerequisites

- Node.js 18+
- npm 9+
- PostgreSQL 14+

Install PostgreSQL on Ubuntu/Debian:

  sudo apt update
  sudo apt install -y postgresql postgresql-contrib
  sudo systemctl enable --now postgresql

## 2) Create Database and User

Open PostgreSQL shell:

  sudo -u postgres psql

Run:

  CREATE USER stackfast_app WITH PASSWORD 'stackfast_dev_pass';
  CREATE DATABASE stackfast OWNER stackfast_app;
  \q

## 3) Environment Variables

Create backend env file:

  cp .env.example .env

Recommended values in .env:

  PORT=4000
  DATABASE_URL=postgresql://stackfast_app:stackfast_dev_pass@localhost:5432/stackfast

Alternative discrete variables (used only when DATABASE_URL is not set):

  PGHOST=localhost
  PGPORT=5432
  PGUSER=stackfast_app
  PGPASSWORD=stackfast_dev_pass
  PGDATABASE=stackfast

Optional:

  DATABASE_SSL=false

Important:

- Keep only valid key=value lines in .env.
- Do not leave stray text lines in .env.
- If DATABASE_URL exists, discrete PG variables are ignored.

## 4) Initialize and Seed Database

From backend folder:

  npm install
  npm run db:init
  npm run db:seed

## 5) Start Backend

From backend folder:

  npm run dev

Expected log:

  StackFast backend listening on http://localhost:4000

## 6) Quick Connectivity Checks

Check DB login:

  psql "postgresql://stackfast_app:stackfast_dev_pass@localhost:5432/stackfast" -c "select 1;"

Check backend health:

  curl -i http://localhost:4000/health

Check search API:

  curl -i "http://localhost:4000/search?q=react"

If frontend uses Vite proxy, check through frontend server:

  curl -i "http://localhost:5173/api/search?q=react"

## 7) Common Issues

1. Empty response in browser
- Backend not running, crashed, or wrong target URL.
- Ensure backend is active on port 4000.

2. Port already in use (EADDRINUSE)
- Another process is already using the port.
- Find process:

    lsof -i :4000 -n -P

- Kill process if needed:

    lsof -ti:4000 | xargs -r kill

3. Password authentication failed
- Credentials in DATABASE_URL do not match PostgreSQL user password.
- Reset password in psql and update .env.

4. Frontend still using old API config
- Restart frontend dev server after changing API or Vite proxy config.
