# stack-exchange

## CS349: Database and Information Systems

### Project Report

**StackFast: A Stack Overflow Clone with a Vectorized PostgreSQL Engine**

Madhav (23B0990)
Vivek Vardhan (23B0972)
Kishan Teja (23B1061)
Nithin (23B0993)

---

## Project Description and Goals

StackFast is a developer Q&A platform inspired by Stack Overflow. We are building a Stack Overflow clone while exploring database performance optimization in PostgreSQL.

---

## Goals

* Build a Stack Overflow–style platform supporting question search, answer viewing and tag-based browsing with efficient database queries.
* Use the Stack Overflow public dataset containing millions of posts, comments and users to evaluate query performance and scalability.
* Improve query performance by modifying PostgreSQL to support vectorized queries.
* Provide a query execution comparison framework to measure performance differences between standard and modified PostgreSQL engines.

---

## System Improvements

* Faster search queries using vectorized execution.
* Tag-based filtering and browsing.
* Benchmark page showing query performance comparison.
* Query inspector showing SQL queries and execution plans.

---

## High-Level Implementation Ideas

### System Architecture

Three-layer architecture: Frontend, Backend and Database.

---

### Frontend (React)

* Search interface for programming questions
* Question page showing answers and comments
* Tag browsing and filtering
* Database engine selection toggle for query execution comparison
* Benchmark page for query performance

---

### Backend (Node.js + Express)

* REST APIs for search and question retrieval
* Query routing to selected database engine
* Query timing measurement
* Structured responses to frontend

---

### Database Layer

* Vanilla PostgreSQL – baseline database
* Modified PostgreSQL – vectorized query engine

---

## Vectorized Query Execution

Standard PostgreSQL processes one row at a time (Volcano model). Our system processes batches of rows to reduce function calls and improve CPU usage.

* Add vector tuple structure
* Modify sequential scan to process batches
* Extend aggregation operators for vectors
* Evaluate performance using benchmark queries

---

## Dataset

Stack Overflow public dataset containing posts (questions and answers), comments, users and tags. The large scale of the dataset allows realistic evaluation of search queries and database performance.

---

## Expected Outcome

* Functional Stack Overflow–style Q&A platform
* PostgreSQL engine supporting vectorized execution
* Performance comparison between both engines
* Demonstration of database performance optimization

---

## Checkpoint Implementation Status (Priorities 1 and 2)

### Priority 1: Basic frontend layout + API wiring

Implemented in `frontend/` using React + Vite:

* Home/search page with keyword + optional tag filter
* Question details page with answers
* Tag browse page
* Benchmark comparison page placeholder
* Engine toggle UI (baseline/vectorized)
* Basic navigation and loading/error states
* API wiring to backend routes

### Priority 2: Backend endpoints working

Implemented in `backend/` using Node.js + Express:

* `GET /search`
* `GET /question/:id`
* `GET /tags`
* `GET /benchmark`
* `GET /health`

Each endpoint returns structured JSON with metadata, and relevant endpoints include query-inspector placeholder fields for checkpoint demos.

---

## Local Setup and Run

### 1. Install dependencies

```bash
cd backend && npm install
cd ../frontend && npm install
```

### 2. Start backend

```bash
cd backend
npm run dev
```

Backend runs at `http://localhost:4000`.

### 3. Start frontend

In a second terminal:

```bash
cd frontend
npm run dev
```

Frontend runs at `http://localhost:5173` and calls backend APIs at `http://localhost:4000` by default.

### Optional frontend API base override

Set `VITE_API_BASE_URL` before running the frontend if backend is hosted elsewhere.
