# 01 — Software Requirements Specification (SRS)

**Project:** Restaurant Ordering and Management System
**Version:** 0.1 (Analysis baseline — pending review)
**Date:** 2026-11-20

---

## 1. Introduction

### 1.1 Purpose
This document specifies the requirements for a single-restaurant web ordering platform. It is the baseline for the product backlog, architecture, database design, API contract and test plan.

### 1.2 Scope
The system lets **customers** browse a menu, manage a server-side cart, place orders, complete a **simulated** payment and track order progress. **Staff** process incoming orders through the kitchen workflow. **Admins** manage the menu, categories, restaurant operating status and view business statistics.

Out of scope: real payment gateways, multi-restaurant/marketplace features, delivery-driver logistics, inventory/stock counts, loyalty programmes, push/SMS/email notifications, native mobile apps.

### 1.3 Definitions
| Term | Meaning |
|---|---|
| Order | A confirmed intent to buy, created at checkout in `PENDING_PAYMENT` state |
| Payment attempt | One simulated charge against an order. An order may have many attempts but only one successful one |
| Idempotency key | A client-generated UUID sent with a state-changing request so that retries do not create duplicates |
| Snapshot | Copy of item name and unit price stored on `order_items` at order time |
| Available | `menu_items.is_available = true AND is_archived = false` and category active |

### 1.4 Stakeholders
| Stakeholder | Interest |
|---|---|
| Customer | Fast, clear ordering and transparent status |
| Staff | A clear queue of paid orders and one-click status updates |
| Admin / Owner | Menu control, open/closed control, sales visibility |
| Jury / Evaluator | Correct business logic, sound engineering, Agile evidence |

---

## 2. Overall Description

### 2.1 Product perspective
A standalone web application: Next.js frontend, FastAPI REST backend, PostgreSQL database. The backend is the single source of truth for every rule. The frontend only presents data and collects input.

### 2.2 User classes
| Role | How created | Capabilities (summary) |
|---|---|---|
| Guest (unauthenticated) | — | View landing page, restaurant info, menu, item details |
| CUSTOMER | Self-registration | Guest abilities + cart, checkout, payment, order history and tracking, cancel unpaid order |
| STAFF | Created by admin (or seed script) | Dashboard: order queue, order details, status transitions |
| ADMIN | Seed script | Everything staff can do + menu, categories, restaurant settings, statistics, staff accounts, cancel/refund orders |

### 2.3 Operating environment
- Modern evergreen browsers (Chrome, Edge, Firefox, Safari — last 2 versions), viewport ≥ 360 px.
- Backend: Python 3.12, FastAPI, SQLAlchemy 2.x, Alembic, PostgreSQL 16.
- Frontend: Node 20 LTS, Next.js (App Router), TypeScript, Tailwind CSS, shadcn/ui.
- Local development via Docker Compose (PostgreSQL), with the apps run natively or in containers.

### 2.4 Constraints
- Payments are simulated; no real card data is stored or transmitted (only a card's last 4 digits for display).
- Single restaurant: one settings record.
- Academic timeline: features are delivered incrementally in sprints.

---

## 3. Gaps in the Brief and Assumptions

The brief leaves several decisions open. Each item below records the assumption I propose. **Items marked ❓ need your confirmation.**

### 3.1 Missing entities found during analysis
| # | Gap | Resolution |
|---|---|---|
| G1 | The brief lists no **cart** table, but rules 1, 3 and 4 must be enforced and tested on the backend | Add a `cart_items` table (one implicit cart per customer). A cart kept only in browser storage would be "fake frontend-only functionality" |
| G2 | There is no table for **restaurant operating status** (rule 16) or restaurant information | Add a single-row `restaurant_settings` table |
| G3 | **Idempotency** storage is not specified | `orders.idempotency_key` and `payments.idempotency_key` with unique constraints |
| G4 | **Pricing components** are undefined (tax? delivery fee?) | Subtotal + tax (configurable rate) + delivery fee (configurable, only for delivery orders) = total |

### 3.2 Assumptions
| # | Assumption |
|---|---|
| A1 | Guests can browse. **Login is required to add to cart**, because the cart is server-side. No guest checkout |
| A2 | ❓ **Order type:** `PICKUP` or `DELIVERY`. Delivery requires a free-text address and adds a flat delivery fee. "DELIVERED" means handed to the customer for either type |
| A3 | ❓ **Currency:** one currency set in settings (default `INR`). Money is stored as `NUMERIC(10,2)` and handled as `Decimal`. Floats are never used |
| A4 | ❓ **Tax:** one flat rate on the subtotal (default 5%), rounded half-up to 2 decimals |
| A5 | **Availability** is a boolean flag. There is no stock counting |
| A6 | **Checkout converts the cart into an order.** In one transaction, the order is created in `PENDING_PAYMENT` with price snapshots and the cart is cleared. Payment then happens against that order, so retrying a failed payment never creates a new order |
| A7 | An unpaid order **expires** after a configurable time (default 15 minutes) and becomes `CANCELLED`. Expiry is checked lazily, whenever the order is read or paid. No background scheduler is needed |
| A8 | Availability and restaurant status are checked **at add-to-cart, at checkout and again at payment**. If an item became unavailable after the order was created, the payment is rejected and the customer can cancel the order and restore the items to the cart |
| A9 | When the restaurant is **closed**, browsing and cart editing still work (with a banner). Checkout and payment are blocked |
| A10 | Simulated payment outcome is **deterministic**. The payment form has an explicit "simulate failure" option, and there are documented test card numbers (e.g. ending `0002` = declined). This keeps demos and tests repeatable. Random outcomes are not used |
| A11 | Customers may cancel only `PENDING_PAYMENT` orders. Admins may cancel `PLACED` or `PREPARING` orders, which marks the successful payment `REFUNDED` (simulated) |
| A12 | Menu items referenced by past orders are **archived (soft-deleted)**, never hard-deleted. Categories cannot be deleted while they contain non-archived items |
| A13 | Menu images: the admin uploads an image file (JPEG/PNG/WebP, ≤ 2 MB). It is stored on the backend's local disk and served statically. Seed data uses bundled images |
| A14 | Order IDs: the internal primary key is a UUID. The customer-facing **order number** is human-readable (`ORD-YYYYMMDD-000123`) and generated from a PostgreSQL sequence, so it is unique even under concurrency |
| A15 | Live updates use **polling** (staff queue every 10 s, customer tracking every 15 s). WebSockets are out of scope |
| A16 | Quantity per cart line: integer 1–50. Distinct lines per cart: at most 30 |
| A17 | Only one admin account is seeded. Admins create staff accounts. Registration always creates a CUSTOMER account |

### 3.3 Open questions for you
1. ❓ How many people are in your team, and how long is a sprint? Task allocation in [07-ROADMAP.md](07-ROADMAP.md) uses a placeholder 4-person team and 1-week sprints.
2. ❓ What is your jury date? This decides whether "Could" items get scheduled.
3. ❓ Do you need a public deployment (for example Vercel + Render/Railway), or is a local Docker demo enough?
4. ❓ Do you confirm A2 (pickup/delivery), A3 (INR) and A4 (5% tax)?

---

## 4. Functional Requirements

Priority uses MoSCoW: **M**ust / **S**hould / **C**ould.

### FR-AUTH — Authentication and authorization
| ID | Requirement | Pri |
|---|---|---|
| FR-AUTH-1 | A visitor can register with full name, email (unique, case-insensitive), phone (optional) and password (≥ 8 characters, at least one letter and one digit) | M |
| FR-AUTH-2 | A user can log in with email and password and receives a JWT (returned in the response body and set as an httpOnly cookie) | M |
| FR-AUTH-3 | A user can log out, which clears the cookie | M |
| FR-AUTH-4 | `GET /auth/me` returns the current user and role | M |
| FR-AUTH-5 | Every protected endpoint checks role on the server. Wrong role → 403; missing or invalid token → 401 | M |
| FR-AUTH-6 | Deactivated users cannot log in or use existing tokens | S |
| FR-AUTH-7 | An admin can create, list and deactivate staff accounts | S |

### FR-REST — Restaurant information and status
| ID | Requirement | Pri |
|---|---|---|
| FR-REST-1 | Public endpoint returns name, tagline, description, address, phone, hero image, open status, currency, tax rate and delivery fee | M |
| FR-REST-2 | An admin can toggle the restaurant open/closed | M |
| FR-REST-3 | An admin can edit restaurant information and pricing settings | S |
| FR-REST-4 | Weekly opening hours shown on the landing page (informational only) | C |

### FR-MENU — Menu browsing (public)
| ID | Requirement | Pri |
|---|---|---|
| FR-MENU-1 | List active categories in their configured order | M |
| FR-MENU-2 | List non-archived menu items with pagination | M |
| FR-MENU-3 | Filter by category, vegetarian, availability and price range | M |
| FR-MENU-4 | Search by name or description (case-insensitive substring) | M |
| FR-MENU-5 | Sort by name, price (ascending/descending) or newest | S |
| FR-MENU-6 | View item detail: image, description, price, veg flag, spice level, prep time and availability | M |
| FR-MENU-7 | Unavailable items are shown greyed out with an "Unavailable" badge and a disabled add button | M |

### FR-ADMENU — Menu and category management (admin)
| ID | Requirement | Pri |
|---|---|---|
| FR-ADMENU-1 | Create, rename, reorder, activate and deactivate categories. Names are unique | M |
| FR-ADMENU-2 | Delete a category only if it has no non-archived items (otherwise 409) | M |
| FR-ADMENU-3 | Create and edit menu items with validated fields (name 2–100 characters, price > 0 and ≤ 100000, category required) | M |
| FR-ADMENU-4 | Toggle item availability with one action | M |
| FR-ADMENU-5 | Delete an item: hard delete if it was never ordered, otherwise archive | M |
| FR-ADMENU-6 | Upload an item image (type and size validated) | S |
| FR-ADMENU-7 | The admin menu list includes archived and unavailable items, with filters | S |

### FR-CART — Cart (customer)
| ID | Requirement | Pri |
|---|---|---|
| FR-CART-1 | Add an item with a quantity (default 1). If the item is already in the cart, its quantity is increased (rule 4) | M |
| FR-CART-2 | Reject unavailable, archived or non-existent items (rule 1) | M |
| FR-CART-3 | Quantity must be an integer from 1 to 50. Reject 0, negatives, decimals, strings and values above the maximum (rule 3) | M |
| FR-CART-4 | Set a line's quantity, remove a line, clear the cart | M |
| FR-CART-5 | `GET /cart` returns lines with **current** server prices, line totals, subtotal, tax, delivery-fee preview and total, plus a per-line `is_available` flag (rule 5) | M |
| FR-CART-6 | The cart persists across devices and sessions (stored in the database) | M |

### FR-ORDER — Checkout and orders (customer)
| ID | Requirement | Pri |
|---|---|---|
| FR-ORDER-1 | Checkout requires an `Idempotency-Key` header. The request body contains **no items and no prices**: only order type, delivery address (if delivery) and notes (rule 6) | M |
| FR-ORDER-2 | Checkout is rejected if the cart is empty (`CART_EMPTY`), the restaurant is closed (`RESTAURANT_CLOSED`) or any item is unavailable (`ITEM_UNAVAILABLE`, with the offending item IDs listed) (rules 2, 16) | M |
| FR-ORDER-3 | The backend calculates all amounts, snapshots each item's name and price, creates the order in `PENDING_PAYMENT`, writes a status history entry and clears the cart, all in one transaction (rules 5, 7, 14) | M |
| FR-ORDER-4 | Repeating checkout with the same key returns the original order (HTTP 200) and creates nothing. Reusing a key with a different body → 409 `IDEMPOTENCY_KEY_REUSED` (rule 8) | M |
| FR-ORDER-5 | The customer can list their orders (paginated, newest first) and view one order with items, amounts, payment attempts and status timeline | M |
| FR-ORDER-6 | The customer can cancel an order in `PENDING_PAYMENT`. They can choose to restore its items to the cart | S |
| FR-ORDER-7 | A customer can never read another customer's order (404, so that order IDs are not leaked) | M |

### FR-PAY — Simulated payment
| ID | Requirement | Pri |
|---|---|---|
| FR-PAY-1 | The customer submits a payment attempt for a `PENDING_PAYMENT` order, with an `Idempotency-Key` header, payment method (CARD/UPI) and simulated details | M |
| FR-PAY-2 | The amount is always the order's stored total. Any client-supplied amount is ignored or rejected (rule 6) | M |
| FR-PAY-3 | Success: in one transaction, the payment becomes `SUCCESS`, the order moves `PENDING_PAYMENT → PLACED`, `placed_at` is set and history is recorded (rule 12) | M |
| FR-PAY-4 | Failure: the payment becomes `FAILED` with a reason. **The order stays `PENDING_PAYMENT`** (rule 10) | M |
| FR-PAY-5 | Retry: a new attempt on the same order is allowed while it is `PENDING_PAYMENT` and not expired. No new order is created (rule 11) | M |
| FR-PAY-6 | Paying an order that already has a successful payment → 409 `ORDER_ALREADY_PAID`. The database also enforces at most one successful payment per order | M |
| FR-PAY-7 | Payment re-checks restaurant open status, item availability and order expiry (A7, A8) | M |
| FR-PAY-8 | An admin cancelling a paid order marks the payment `REFUNDED` (simulated) | S |

### FR-STAFF — Order processing (staff and admin)
| ID | Requirement | Pri |
|---|---|---|
| FR-STAFF-1 | List orders filtered by status, date range and order number search. The default view is active orders (`PLACED`, `PREPARING`, `READY`), oldest first | M |
| FR-STAFF-2 | `PENDING_PAYMENT` orders are hidden from the staff queue by default (they are not real orders yet) | M |
| FR-STAFF-3 | View order details: customer name and phone, items, notes, type and address, amounts, payment status, history | M |
| FR-STAFF-4 | Change status only through valid transitions (see [06-BUSINESS-RULES.md](06-BUSINESS-RULES.md)). Invalid → 409 `INVALID_STATUS_TRANSITION` (rule 13) | M |
| FR-STAFF-5 | Every transition records from/to status, actor, role, timestamp and an optional note (rule 14) | M |
| FR-STAFF-6 | Staff cannot access menu, category, settings, staff or statistics endpoints (rule 15) | M |

### FR-DASH — Dashboard (admin)
| ID | Requirement | Pri |
|---|---|---|
| FR-DASH-1 | Show today's paid orders, today's revenue (successful minus refunded), average order value and active-order counts by status | M |
| FR-DASH-2 | Show top 5 items by quantity over the last 7 days | S |
| FR-DASH-3 | Show a 7-day revenue chart | C |

---

## 5. Non-Functional Requirements

| ID | Category | Requirement |
|---|---|---|
| NFR-SEC-1 | Security | Passwords hashed with bcrypt (cost ≥ 12). Never logged or returned |
| NFR-SEC-2 | Security | JWT signed HS256 with a secret from the environment. Access token lifetime 8 hours (configurable via `JWT_EXPIRE_MINUTES`). Cookie is `httpOnly`, `SameSite=Lax`, and `Secure` in production |
| NFR-SEC-3 | Security | All input validated by Pydantic on the backend (zod on the frontend is only for user experience) |
| NFR-SEC-4 | Security | SQL only through the SQLAlchemy ORM or bound parameters. No string-built SQL |
| NFR-SEC-5 | Security | CORS restricted to the configured frontend origin. Uploads restricted by MIME type and size, and stored under generated filenames |
| NFR-SEC-6 | Security | Login rate-limited (5 failed attempts per minute per IP) — *Could* |
| NFR-DATA-1 | Integrity | Multi-step writes (checkout, payment, status change) run in a single DB transaction. The order row is locked (`SELECT … FOR UPDATE`) during payment and status changes |
| NFR-DATA-2 | Integrity | Database constraints back the business rules: CHECKs, unique and partial-unique indexes, foreign keys |
| NFR-PERF-1 | Performance | Menu and cart endpoints p95 < 300 ms locally with ≤ 500 items. List endpoints paginated (max page size 100) |
| NFR-USE-1 | Usability | Responsive from 360 px up. Every data view has loading, empty and error states |
| NFR-USE-2 | Accessibility | WCAG 2.1 AA contrast, keyboard-operable controls, labelled form fields (shadcn/Radix primitives) |
| NFR-REL-1 | Reliability | One consistent error envelope on every API error. No unhandled 500s leak stack traces |
| NFR-MAIN-1 | Maintainability | Layered backend (routes → services → models). Typed code (Python type hints, strict TypeScript). Linting: ruff and ESLint/Prettier |
| NFR-MAIN-2 | Maintainability | Frontend API types (`frontend/src/lib/types.ts`) mirror the backend Pydantic schemas one-to-one; the OpenAPI schema at `/api/v1/openapi.json` is the reference contract |
| NFR-TEST-1 | Testability | Backend automated tests run against a real PostgreSQL test database. ≥ 80% line coverage on `services/` |
| NFR-OPS-1 | Portability | One-command local database (`docker compose up`). `.env.example` documents every setting |
| NFR-OPS-2 | Observability | Structured request logging with request ID, method, path, status and duration |
| NFR-DOC-1 | Documentation | README with setup steps. OpenAPI docs at `/docs`. Exported Postman collection. These docs kept current each sprint |
