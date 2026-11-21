# 07 — Sprint Roadmap, Definition of Done and Agile Process

**Assumptions (❓ to confirm):** 1-week sprints, 4 team members. Capacity is about 20 SP per sprint.
If you work solo or in a pair, keep the sprint order and stretch each sprint to 1.5–2 weeks.

## 1. Sprint plan (one vertical slice per sprint)

| Sprint | Goal | Stories | Demo at review |
|---|---|---|---|
| **0 — Foundation** (Phase 1) | A runnable skeleton, fully wired | TS-01, TS-02, TS-03 | `docker compose up`, `/health` green with DB, migrations, seed, Next.js shell calling the API, CI passing |
| **1 — Identity and restaurant** | Users can sign up and log in. Roles are enforced. Open/closed works | US-01–05 | Register/login for 3 roles, dashboard guard, admin toggles closed and the banner appears |
| **2 — Menu** | The public menu and admin menu management, end to end | US-06–14 | Search/filter menu, admin creates an item with an image, toggles availability, archive behaviour |
| **3 — Cart and checkout** | Server cart and idempotent order creation | US-15–19 | Add/merge/update/remove, unavailable rejection, double-click checkout → 1 order |
| **4 — Payments and tracking** | Simulated payments, retry, history and tracking | US-20–25 | Fail → retry → success on the same order, confirmation, timeline |
| **5 — Operations and dashboard** | Kitchen workflow and admin insight | US-26–31 | Staff moves an order PLACED→DELIVERED, invalid transition blocked, admin refund, stats |
| **6 — Hardening and release** | Quality, docs, demo readiness | US-32–33, TS-04–06, bug fixes, UI polish, accessibility pass | Full demo script, Postman runner green, coverage report, final docs |

Must-have work is complete by the end of Sprint 5. Sprint 6 is a buffer plus Could items, which protects the jury date.

## 2. Sprint 0 (Phase 1) detailed sprint backlog

| Task | Story | Owner | Est (h) |
|---|---|---|---|
| Initialise the Git repo, branch protection, PR template, issue templates, labels | TS-01 | Dev A | 2 |
| `docker-compose.yml` (Postgres 16, dev + test DBs), `.env.example` | TS-01 | Dev A | 2 |
| GitHub Actions: backend (ruff, pytest with a Postgres service), frontend (lint, tsc, build) | TS-01 | Dev A | 4 |
| FastAPI app factory, config, logging, error envelope + handlers | TS-02 | Dev B | 5 |
| SQLAlchemy models for **all** entities + first Alembic migration | TS-02 | Dev B / Dev C | 8 |
| Test harness: test DB, rollback per test, factories, authenticated client fixtures | TS-02 | Dev C | 5 |
| Idempotent seed script with images | TS-02 | Dev C | 3 |
| Next.js app, Tailwind, shadcn init, theme tokens, layouts (storefront + dashboard shells) | TS-03 | Dev D | 6 |
| API client + `ApiError` + OpenAPI type generation script | TS-03 | Dev D | 3 |
| Common components: EmptyState, ErrorState, Skeletons, ConfirmDialog | TS-03 | Dev D | 3 |
| README setup guide, docs folder, sprint log | all | Scrum Master | 2 |

## 3. Roles and task allocation (template)

| Role | Responsibility |
|---|---|
| Product Owner | Owns the backlog order and accepts stories against their acceptance criteria |
| Scrum Master | Runs ceremonies, keeps the sprint board and burndown, removes blockers |
| Backend devs (×2) | Models, services, APIs, backend tests |
| Frontend dev | Pages, components, API integration, UI states |
| QA owner (rotating) | Test cases, Postman collection, testing records |

In a 4-person team each person holds a developer role plus one Scrum role. Allocate each story to a **backend + frontend pair**, so every slice is integrated inside the sprint.

## 4. Definition of Ready (story can enter a sprint)
- It has acceptance criteria, an estimate and a priority.
- API contract changes for the story have been agreed (endpoint, request/response schema).
- Its dependencies are complete or scheduled earlier in the same sprint.

## 5. Definition of Done
A story is Done only when **all** of the following hold:
1. Code is merged to `main` through a pull request with at least 1 reviewer approval.
2. Every acceptance criterion is demonstrably met on a local build.
3. Backend: automated tests cover the acceptance criteria (success and failure paths). `pytest` passes. Service coverage has not dropped below 80%.
4. Frontend: loading, empty, error and validation states are implemented. There are no TypeScript errors. Lint is clean. Generated API types are up to date.
5. No placeholder or mock functionality where backend behaviour is required.
6. The DB schema changes are in an Alembic migration that upgrades and downgrades cleanly.
7. Postman requests have been added or updated for any new endpoint.
8. The README and relevant `docs/` files are updated. The test log entry is recorded.
9. CI is green.

## 6. Ceremonies and artefacts
| Ceremony | When | Output (saved in `docs/sprints/sprint-N.md`) |
|---|---|---|
| Sprint planning | Day 1 | Sprint goal, selected stories, task breakdown, owners |
| Daily stand-up | Daily, 10 min | Short notes on blockers |
| Sprint review | Last day | Demo checklist, accepted/rejected stories |
| Retrospective | Last day | Keep / improve / try, plus action items |
| Backlog refinement | Mid-sprint | Re-estimated and re-ordered backlog |

Tracking: GitHub Projects board (Backlog → Ready → In Progress → In Review → Done). One issue per story, with sub-task checklists. Pull requests reference the issue (`Closes #12`).

## 7. Git workflow
- `main` is protected. Work happens on `feature/US-15-add-to-cart` or `fix/…` branches.
- Conventional commits: `feat(cart): merge duplicate items on add`, `test(payments): retry after failure`, `docs: …`.
- Small pull requests, one story or task each. Squash merge.
- Tags at each sprint end: `v0.1-sprint1`, …, `v1.0-final`.

## 8. Testing strategy and records

| Level | Tool | Scope |
|---|---|---|
| Unit | pytest | pricing, state machine (all pairs of states × roles), simulated gateway, order number format |
| API / integration | pytest + httpx TestClient + real Postgres | every endpoint: success, validation, authorization, business rule errors, concurrency for checkout and payment |
| Contract | shared types + `tsc` + Postman/newman | frontend/backend schema consistency |
| Manual / exploratory | Postman collection + runner | the demo flows, recorded in the test log |
| E2E (Should) | Playwright | register → add to cart → checkout → fail → retry → staff delivers |

**Required test cases (from the brief), mapped:**
| Brief requirement | Test |
|---|---|
| Successful menu retrieval | `test_menu.py::test_list_menu_returns_available_and_unavailable_non_archived` |
| Adding available items to cart | `test_cart.py::test_add_available_item` |
| Rejecting unavailable items | `test_cart.py::test_add_unavailable_item_rejected` |
| Empty cart checkout | `test_checkout.py::test_empty_cart_checkout_400` |
| Successful simulated payment | `test_payments.py::test_success_places_order` |
| Failed payment | `test_payments.py::test_failed_payment_keeps_pending` |
| Duplicate order submission | `test_checkout.py::test_duplicate_submission_returns_same_order` (+ concurrent version) |
| Invalid quantities | `test_cart.py::test_invalid_quantities` (parametrised) |
| Unauthorized admin access | `test_authorization.py::test_customer_forbidden_on_admin_routes`, `::test_anonymous_401` |
| Invalid order status transitions | `test_state_machine.py`, `test_admin_orders.py::test_invalid_transition_409` |

**Testing record format** (`docs/testing/TEST-LOG.md`):
`| Date | Sprint | Test ID | Description | Type | Expected | Actual | Result | Tester | Commit |`
The pytest output and coverage HTML report are attached each sprint, under `docs/testing/reports/sprint-N/`.

## 9. Phase 1 exit criteria (what "done" means for Sprint 0)
- `docker compose up -d db && alembic upgrade head && python -m scripts.seed` works on a clean machine.
- `GET /api/v1/health` reports the DB as OK. The frontend home page renders data fetched from `/api/v1/restaurant`.
- CI runs and passes on a pull request.
- The full schema exists in a migration, with all the constraints from [04-DATABASE.md](04-DATABASE.md).
