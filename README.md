# Saffron & Smoke — Restaurant Ordering and Management System

A full-stack, database-backed ordering platform for a single restaurant. Customers browse the menu, manage a server-side cart, check out for **pickup or delivery**, pay through a **simulated payment gateway** (with failure and retry), and track their order live. Staff run the kitchen queue; admins manage the menu, categories, staff, restaurant status and pricing, and see sales statistics.

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router), TypeScript, Tailwind CSS 4, shadcn/ui (Radix), TanStack Query, react-hook-form + zod |
| Backend | Python 3.12+, FastAPI, SQLAlchemy 2, Alembic, Pydantic 2, PyJWT, bcrypt |
| Database | PostgreSQL 16 |
| Testing | pytest (149 tests on a real PostgreSQL DB), Postman/newman collection (41 requests, 50 assertions) |
| Packaging | Docker + Docker Compose |

The UI follows the **Mercury design language** in [frontend/DESIGN.md](frontend/DESIGN.md), added with `npx getdesign@latest add mercury`. That means night-coloured navigation and footer, a near-white canvas, one indigo primary pill per view, translucent secondary pills, lavender cards, and Inter at light weights.

`getdesign` installs that one specification file; it ships no components or animation API. The motion layer is therefore project code built on the existing `tw-animate-css`: shared timing tokens and `m-*` classes in `frontend/src/app/globals.css`, plus scroll reveal, number tweening and sliding tabs in `frontend/src/components/motion.tsx`. All of it respects `prefers-reduced-motion`.

The menu is **100% vegetarian** (39 dishes, no egg or gelatin). Existing databases are converted once by the Alembic data migration `b7e41c90a2f6`. Retired dishes that appear on past orders stay archived so order history remains accurate.

---

## Quick start (Docker — recommended)

Requires Docker Desktop.

```bash
docker compose up --build
```

Then open **http://localhost:3000**. On first start the backend applies migrations and seeds demo data automatically.

| Service | URL |
|---|---|
| Website | http://localhost:3000 |
| API (direct) | http://localhost:8000/api/v1 |
| Interactive API docs (Swagger) | http://localhost:8000/docs |
| PostgreSQL | `localhost:5433`, user/password/db `restaurant` |

To stop: `docker compose down`. To also wipe the database and uploaded images: `docker compose down -v`.

### Demo accounts

| Role | Email | Password |
|---|---|---|
| Admin | admin@saffronsmoke.test | Admin@123 |
| Staff | staff@saffronsmoke.test | Staff@123 |
| Customer | customer@saffronsmoke.test | Customer@123 |

The login page has one-click buttons that fill these in. New customers can also register.

### Simulated payments

| Input | Result |
|---|---|
| Card `4242 4242 4242 4242` | Success |
| Card `4000 0000 0000 0002` | Declined |
| Card `4000 0000 0000 0069` | Expired card |
| Card `4000 0000 0000 9995` | Insufficient funds |
| UPI `anything@bank` | Success |
| UPI `fail@sim` | Declined |
| "Simulate a failed payment" switch | Always fails |

Use any future expiry (e.g. `12/30`) and any 3-digit CVV. Only the last 4 digits are stored, and the CVV is never stored.

---

## Local development (without Docker for the apps)

**1. Database** (runs in Docker on port 5433, so it won't clash with a local PostgreSQL install):

```bash
docker compose up -d db
```

**2. Backend**

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # macOS/Linux: source .venv/bin/activate
pip install -r requirements-dev.txt
alembic upgrade head
python -m scripts.seed
uvicorn app.main:app --reload --port 8000
```

**3. Frontend** (in a second terminal)

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000. The frontend proxies `/api/*` and `/media/*` to `BACKEND_URL` (default `http://localhost:8000`). See `frontend/.env.example` and `backend/.env.example` for all settings.

---

## Running the tests

```bash
cd backend
.venv\Scripts\activate
python -m pytest                     # 149 tests, uses the restaurant_test database
python -m pytest --cov=app           # with coverage (≈92% overall)
ruff check app tests scripts         # lint
```

Frontend checks:

```bash
cd frontend
npx tsc --noEmit && npx eslint src && npm run build
```

API collection: import `postman/RestaurantOrdering.postman_collection.json` into Postman and run it with the Collection Runner. Or run it from the command line:

```bash
npx newman run postman/RestaurantOrdering.postman_collection.json
```

### Required test scenarios → where they are covered

| Scenario | Test |
|---|---|
| Successful menu retrieval | `tests/test_menu_and_cart.py::test_menu_retrieval_success` |
| Adding available items to cart | `test_add_available_item_to_cart`, `test_add_same_item_merges_quantity` |
| Rejecting unavailable items | `test_add_unavailable_item_rejected`, `test_item_became_unavailable_blocks_checkout` |
| Empty cart checkout | `tests/test_orders_and_payments.py::test_empty_cart_checkout` |
| Successful simulated payment | `test_success_places_order` |
| Failed payment | `test_failed_payment_keeps_pending`, `test_retry_after_failure_single_order` |
| Duplicate order submission | `test_duplicate_submission_returns_same_order`, `test_concurrent_duplicate_submission` |
| Invalid quantities | `test_invalid_quantities` (0, −1, 1.5, "2", 51, null, true) |
| Unauthorized admin access | `tests/test_auth_and_access.py` (anonymous 401, customer 403, staff 403 on admin-only) |
| Invalid order status transitions | `tests/test_unit.py::test_every_unlisted_transition_is_rejected`, `test_invalid_transition_409` |

---

## How the mandatory business rules are enforced

All rules live in the backend service layer. Most also have a database constraint as a final safeguard. The frontend never sends prices or totals.

| # | Rule | Where |
|---|---|---|
| 1 | Unavailable items can't be added to the cart | `cart_service.add_item` |
| 2 | Checkout re-validates availability (and payment re-checks again) | `order_service.checkout`, `payment_service.pay` |
| 3 | Quantities are positive integers (1–50) | Pydantic strict int + DB `CHECK` |
| 4 | Duplicate cart items merge quantities | `INSERT … ON CONFLICT` + `UNIQUE(user_id, menu_item_id)` |
| 5–6 | Backend calculates every price; client prices are rejected | `pricing.py` (Decimal, half-up); request schemas forbid extra fields; DB `CHECK total = subtotal + tax + fee` |
| 7 | Unique order IDs | UUID primary key + sequence-based `ORD-YYYYMMDD-NNNNNN` |
| 8 | Duplicate-submission protection | `Idempotency-Key` header + `UNIQUE(user_id, idempotency_key)` + per-user row lock |
| 9–11 | Simulated success/failure; failures keep the order `PENDING_PAYMENT`; retry reuses the same order | `payment_gateway.py`, `payment_service.py` |
| 12 | Only paid orders become `PLACED` | State machine (SYSTEM-only transition) + DB `CHECK` |
| 13 | Valid status transitions only | `order_state_machine.py` |
| 14 | Status history | `order_status_history` table, written on every transition |
| 15 | Role-based authorization | `require_roles(...)` dependencies, role re-read from DB per request |
| 16 | No ordering while closed | `restaurant_service.assert_open` at checkout and payment |

Other safeguards: at most one successful payment per order (partial unique index), item prices are copied into `order_items` at order time, unpaid orders expire after 15 minutes (configurable), and menu items with order history are archived rather than deleted.

---

## Deploying

The app is two containers (backend and frontend) plus PostgreSQL, so it runs on any Docker host (a VPS with `docker compose up -d`, Render, Railway or Fly.io).

**Example: Render (backend + database) and Vercel (frontend)**

1. **Database:** create a PostgreSQL instance and copy its connection URL. `postgres://…` URLs are converted automatically.
2. **Backend:** create a Docker web service from `backend/`. Environment:
   - `ENV=production`
   - `DATABASE_URL=<database url>`
   - `JWT_SECRET=<long random string>` — required; the app refuses to start with the default outside dev
   - `COOKIE_SECURE=true`
   - `SEED_DEMO_DATA=true` for a demo, or `false`
   - `PORT` is respected automatically.
3. **Frontend:** import `frontend/` into Vercel, or deploy `frontend/Dockerfile`, and set `BACKEND_URL=https://<your-backend-host>`.

The browser only ever talks to the frontend origin. The frontend's `/api` and `/media` routes proxy to the backend, so the httpOnly auth cookie is first-party and CORS isn't needed.

> Uploaded images are stored on the backend's disk (`MEDIA_DIR`). On hosts with ephemeral filesystems, attach a persistent disk at that path, or uploaded images will disappear on redeploy. Seed images are re-copied on every start.

---

## Project structure

```
backend/
  app/
    api/            deps.py (auth, roles, idempotency), routes/public.py, routes/admin.py
    core/           config, security (JWT/bcrypt), exceptions (error envelope)
    db/             SQLAlchemy base + session
    models/         users, categories, menu_items, cart_items, orders, order_items,
                    payments, order_status_history, restaurant_settings
    schemas/        Pydantic request/response models
    services/       business logic: cart, order (checkout/expiry/transitions), payment,
                    pricing, order_state_machine, payment_gateway, menu, dashboard, auth
  alembic/          migrations
  scripts/seed.py   idempotent demo data
  seed_assets/      bundled menu photos
  tests/            unit + API tests (real PostgreSQL)
frontend/
  src/app/(store)/  landing, menu, item, cart, checkout, pay, confirmation, orders, login, register
  src/app/dashboard overview, orders queue + detail, menu items, categories, staff, settings
  src/app/api, media  same-origin proxy route handlers to the backend
  src/components/   UI primitives (shadcn), store, dashboard, orders, common states
  src/lib/          api client, types, hooks, formatting
  DESIGN.md         Mercury design reference
postman/            API collection
docs/               requirements, architecture, database, API and business-rule specs
docker-compose.yml  full stack
```

## API overview

All endpoints are under `/api/v1`. Errors always use `{"error": {"code", "message", "details"}}`. The full specification is in [docs/05-API-SPEC.md](docs/05-API-SPEC.md) and live at `/docs`.

- **Public:** `GET /health`, `GET /restaurant`, `GET /categories`, `GET /menu-items`, `GET /menu-items/{id}`
- **Auth:** `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`
- **Customer:** `/cart` (GET, DELETE), `/cart/items` (POST, PATCH, DELETE), `POST /orders` *(Idempotency-Key)*, `GET /orders`, `GET /orders/{id}`, `POST /orders/{id}/cancel`, `POST /orders/{id}/payments` *(Idempotency-Key)*
- **Staff + admin:** `GET /admin/orders`, `GET /admin/orders/{id}`, `POST /admin/orders/{id}/status`
- **Admin only:** menu items, categories, image upload, `POST /admin/orders/{id}/cancel` (refund), restaurant settings and open/closed status, dashboard stats, staff accounts
