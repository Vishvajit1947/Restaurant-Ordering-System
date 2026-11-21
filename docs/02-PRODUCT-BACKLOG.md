# 02 — Product Backlog and User Stories

Priority: **M**ust / **S**hould / **C**ould. Estimates are in story points (Fibonacci). The sprint column refers to [07-ROADMAP.md](07-ROADMAP.md).
Acceptance criteria are written so that each can become a test case.

## Backlog summary

| ID | Epic | Story (short) | Pri | SP | Sprint |
|---|---|---|---|---|---|
| TS-01 | Technical | Repository, tooling, Docker Postgres, CI | M | 5 | 0 |
| TS-02 | Technical | Backend skeleton, error envelope, migrations, seed | M | 5 | 0 |
| TS-03 | Technical | Frontend skeleton, design system, API client, type generation | M | 5 | 0 |
| US-01 | Accounts | Customer registration | M | 3 | 1 |
| US-02 | Accounts | Login / logout | M | 3 | 1 |
| US-03 | Accounts | Role-based access to the dashboard and APIs | M | 5 | 1 |
| US-04 | Restaurant | View restaurant info and open status | M | 2 | 1 |
| US-05 | Restaurant | Admin toggles open/closed and edits settings | M | 3 | 1 |
| US-06 | Menu | Browse menu by category | M | 3 | 2 |
| US-07 | Menu | Search menu | M | 2 | 2 |
| US-08 | Menu | Filter and sort menu | M | 3 | 2 |
| US-09 | Menu | View item details | M | 2 | 2 |
| US-10 | Menu admin | Manage categories | M | 3 | 2 |
| US-11 | Menu admin | Create and edit menu items | M | 5 | 2 |
| US-12 | Menu admin | Toggle availability | M | 2 | 2 |
| US-13 | Menu admin | Delete / archive menu items | M | 2 | 2 |
| US-14 | Menu admin | Upload item images | S | 3 | 2 |
| US-15 | Cart | Add item to cart | M | 3 | 3 |
| US-16 | Cart | Change quantity / remove / clear | M | 3 | 3 |
| US-17 | Cart | View cart with server-computed totals | M | 3 | 3 |
| US-18 | Checkout | Place order from cart | M | 8 | 3 |
| US-19 | Checkout | Duplicate submission protection | M | 5 | 3 |
| US-20 | Payment | Successful simulated payment | M | 5 | 4 |
| US-21 | Payment | Failed payment and retry | M | 5 | 4 |
| US-22 | Payment | Order confirmation page | M | 2 | 4 |
| US-23 | Orders | Cancel unpaid order | S | 3 | 4 |
| US-24 | Orders | Order history | M | 3 | 4 |
| US-25 | Orders | Order tracking timeline | M | 3 | 4 |
| US-26 | Operations | Staff order queue | M | 5 | 5 |
| US-27 | Operations | Order details for staff | M | 2 | 5 |
| US-28 | Operations | Update order status (valid transitions) | M | 5 | 5 |
| US-29 | Operations | Admin cancels paid order with simulated refund | S | 3 | 5 |
| US-30 | Dashboard | Admin statistics | M | 5 | 5 |
| US-31 | Accounts | Admin manages staff accounts | S | 3 | 5 |
| US-32 | Dashboard | 7-day revenue chart | C | 2 | 6 |
| US-33 | Restaurant | Opening hours display | C | 1 | 6 |
| TS-04 | Technical | Postman collection and API docs | M | 2 | 6 |
| TS-05 | Technical | E2E smoke test of the happy path (Playwright) | S | 3 | 6 |
| TS-06 | Technical | Login rate limiting | C | 2 | 6 |

**Total:** about 129 SP. Must items: about 110 SP.

---

## Technical stories

### TS-01 — Repository and tooling
As a developer, I want a consistent repository setup so the team can collaborate safely.
- AC1: A Git repository with a `main` branch, a `.gitignore` for Python/Node, and a branch naming convention (`feature/US-xx-short-name`).
- AC2: `docker compose up -d db` starts PostgreSQL 16 with a dev database and a test database.
- AC3: GitHub Actions runs ruff, pytest (backend) and lint, typecheck and build (frontend) on every pull request.
- AC4: `.env.example` files exist for the backend and the frontend.

### TS-02 — Backend skeleton
- AC1: `GET /api/v1/health` returns `{"status":"ok","database":"ok"}` after a real DB round-trip.
- AC2: Alembic migration creates all tables. `alembic downgrade base` works cleanly.
- AC3: Any domain error returns `{"error":{"code","message","details"}}` with the correct HTTP status. Unhandled exceptions return 500 `INTERNAL_ERROR` with no stack trace.
- AC4: `python -m scripts.seed` creates the admin, a staff member, a sample customer, restaurant settings, 5 categories and about 20 items with images. It is safe to run twice.

### TS-03 — Frontend skeleton
- AC1: Next.js App Router with TypeScript in strict mode, Tailwind, and shadcn/ui initialised with the base components.
- AC2: An API client wrapper that parses the error envelope into a typed `ApiError`.
- AC3: TypeScript types in `src/lib/types.ts` mirror the backend response schemas.
- AC4: Shared `EmptyState`, `ErrorState`, `LoadingSkeleton` and `ConfirmDialog` components.

---

## Epic: Accounts

### US-01 — Customer registration
As a **visitor**, I want to create an account so that I can order food.
- AC1: Given a valid name, email and password, registration creates a CUSTOMER and logs me in.
- AC2: A duplicate email (in any letter case) is rejected with 409 `EMAIL_ALREADY_REGISTERED`.
- AC3: A password shorter than 8 characters, or without both a letter and a digit, is rejected with 422 and a field message.
- AC4: The role cannot be set through the registration payload. Any `role` field is ignored.

### US-02 — Login / logout
As a **user**, I want to log in and out securely.
- AC1: Valid credentials return a token and set an httpOnly cookie. The UI redirects by role (customer → menu, staff/admin → dashboard).
- AC2: Invalid credentials return 401 `INVALID_CREDENTIALS` without revealing which field was wrong.
- AC3: Logout clears the cookie. Protected pages then redirect to login.
- AC4: Deactivated users receive 403 `ACCOUNT_DISABLED`.

### US-03 — Role-based access
As the **owner**, I want staff and admin functions protected so customers cannot reach them.
- AC1: A customer calling any `/admin/*` endpoint gets 403.
- AC2: A call without a token to a protected endpoint gets 401.
- AC3: Staff calling admin-only endpoints (menu, categories, settings, stats, staff) get 403.
- AC4: Frontend route guards redirect unauthorised users. The backend check is authoritative.

### US-31 — Admin manages staff
As an **admin**, I want to create and deactivate staff accounts.
- AC1: The admin creates staff with a name, email and temporary password.
- AC2: The admin can deactivate a staff account. Their next request fails with 403.
- AC3: An admin cannot deactivate their own account.

---

## Epic: Restaurant

### US-04 — View restaurant info
As a **visitor**, I want to see restaurant information and whether it is open.
- AC1: The landing page shows the name, tagline, description, address, phone and hero image, all loaded from the API.
- AC2: An "Open now" or "Closed" badge reflects `is_open`.
- AC3: When the restaurant is closed, a site-wide banner says ordering is paused.

### US-05 — Admin controls status and settings
As an **admin**, I want to open or close the restaurant and edit its settings.
- AC1: A toggle flips `is_open`. Customers see the change on their next fetch.
- AC2: While closed, checkout and payment return 409 `RESTAURANT_CLOSED`.
- AC3: Editing the tax rate (0–30%) and delivery fee (≥ 0) is validated, and the new values affect only new orders.

---

## Epic: Menu (customer)

### US-06 — Browse by category
- AC1: Category tabs or chips come from the API in `sort_order`. Inactive categories are hidden.
- AC2: Selecting a category filters the item grid. "All" shows every item.
- AC3: Item cards show the image, name, short description, price, veg indicator and availability.
- AC4: Skeleton cards while loading. An empty state when no items match.

### US-07 — Search
- AC1: Typing (debounced by 300 ms) searches name and description, case-insensitive.
- AC2: The search term is kept in the URL query string, so it survives a refresh and can be shared.
- AC3: No results → an empty state with a "Clear search" action.

### US-08 — Filter and sort
- AC1: Filters: vegetarian only, available only, and a price range. They combine with AND.
- AC2: Sort: price ascending/descending, name, newest.
- AC3: An invalid query value (e.g. `min_price=-5`) returns 422.

### US-09 — Item details
- AC1: The detail view shows all item fields and the category.
- AC2: An unavailable item shows an "Unavailable" badge and a disabled add button.
- AC3: An unknown item ID → 404 page.

---

## Epic: Menu administration

### US-10 — Manage categories
- AC1: Create a category with a unique name (case-insensitive). A duplicate → 409.
- AC2: Edit the name, description, sort order and active flag.
- AC3: Deleting a category that still holds non-archived items → 409 `CATEGORY_NOT_EMPTY`. The UI shows the reason.
- AC4: Delete asks for confirmation in a dialog first.

### US-11 — Create / edit menu items
- AC1: The form validates name (2–100), description (≤ 500), price (> 0, ≤ 100000, 2 decimals), category (required), prep time (1–180 min) and spice level (0–3).
- AC2: Saving shows a success toast. Field errors from the backend appear next to the matching fields.
- AC3: A price change does not affect existing orders (they keep their snapshots).

### US-12 — Toggle availability
- AC1: A switch in the admin item list toggles availability immediately, with optimistic UI and rollback on error.
- AC2: An unavailable item can no longer be added to carts. Existing cart lines show "No longer available" and block checkout.

### US-13 — Delete / archive items
- AC1: An item that was never ordered is hard-deleted after confirmation.
- AC2: An item referenced by any order is archived instead. The response says `"archived": true` and the UI explains it.
- AC3: Archived items disappear from the public menu and from carts.

### US-14 — Upload images
- AC1: JPEG/PNG/WebP files up to 2 MB are accepted. Anything else → 422.
- AC2: The file is stored under a generated name and its URL is saved on the item.
- AC3: Items without an image show a placeholder.

---

## Epic: Cart

### US-15 — Add item to cart
As a **customer**, I want to add food to my cart.
- AC1: Adding an available item creates a cart line with quantity 1 (or the requested quantity).
- AC2: Adding an item already in the cart **increases** its quantity. No duplicate line is created.
- AC3: Adding an unavailable, archived or non-existent item → 409 `ITEM_UNAVAILABLE` / 404. The cart is unchanged.
- AC4: Quantity 0, negative, decimal, non-numeric, or a resulting total above 50 → 422 `INVALID_QUANTITY`.
- AC5: A guest clicking "Add" is sent to login and returned afterwards.
- AC6: The cart badge count updates without a page reload.

### US-16 — Change quantity / remove / clear
- AC1: The + / − stepper updates the quantity on the server. At quantity 1, "−" offers to remove the line.
- AC2: Setting a quantity outside 1–50 → 422. The UI keeps the last valid value.
- AC3: Remove deletes the line. "Clear cart" asks for confirmation first.

### US-17 — View cart
- AC1: The cart drawer or page shows lines with current server prices, line totals, subtotal, tax, delivery fee (if delivery is selected) and total.
- AC2: Lines whose item became unavailable are flagged and the checkout button is disabled.
- AC3: An empty cart shows an empty state with a "Browse menu" link.

---

## Epic: Checkout and payment

### US-18 — Place order
As a **customer**, I want to turn my cart into an order.
- AC1: Checkout with a valid cart creates an order in `PENDING_PAYMENT` with a unique order number, price snapshots and backend-calculated totals. Then the customer is redirected to the payment page.
- AC2: An empty cart → 400 `CART_EMPTY`.
- AC3: Any unavailable item → 409 `ITEM_UNAVAILABLE` listing the item IDs. No order is created.
- AC4: Restaurant closed → 409 `RESTAURANT_CLOSED`.
- AC5: A delivery order without an address → 422.
- AC6: Prices or totals sent by the client have no effect. The schema does not accept them.
- AC7: The cart is empty after a successful checkout.
- AC8: The status history contains `null → PENDING_PAYMENT`.

### US-19 — Duplicate submission protection
As a **customer**, I want a double click or network retry not to create two orders.
- AC1: Two checkout requests with the same `Idempotency-Key` produce exactly one order. Both responses return the same order.
- AC2: Concurrent identical requests still produce one order (the database unique constraint holds).
- AC3: The same key with a different body → 409 `IDEMPOTENCY_KEY_REUSED`.
- AC4: A missing `Idempotency-Key` header → 400.
- AC5: The UI disables the Place Order button while the request is in flight.

### US-20 — Successful payment
- AC1: Paying a `PENDING_PAYMENT` order with a success-simulating input creates a `SUCCESS` payment for exactly the order total.
- AC2: The order moves to `PLACED`. `placed_at` is set. History records `PENDING_PAYMENT → PLACED` by system.
- AC3: The order appears in the staff queue.
- AC4: Paying again → 409 `ORDER_ALREADY_PAID`.
- AC5: Only the card's last 4 digits are stored.

### US-21 — Failed payment and retry
- AC1: A failure-simulating input creates a `FAILED` payment with a reason. The order stays `PENDING_PAYMENT`.
- AC2: The UI shows the reason and a "Try again" button that uses the **same order**.
- AC3: After any number of failures, one successful retry places the order. The total number of orders is still 1.
- AC4: An expired order → 409 `ORDER_EXPIRED`. The order is now `CANCELLED`.
- AC5: Repeating a payment with the same payment `Idempotency-Key` returns the same attempt and does not create a new one.

### US-22 — Confirmation page
- AC1: After success, the page shows the order number, items, total, and an estimated ready time (max prep time + 10 min).
- AC2: A "Track order" link opens the tracking page.

### US-23 — Cancel unpaid order
- AC1: The customer can cancel their own `PENDING_PAYMENT` order after confirmation. Status becomes `CANCELLED`.
- AC2: The "restore items to cart" option re-adds available items (merging quantities) and reports any skipped ones.
- AC3: Cancelling a `PLACED` order as a customer → 409.

---

## Epic: Order tracking

### US-24 — Order history
- AC1: The list shows my orders, newest first, paginated: number, date, total, order status and payment status.
- AC2: Unpaid orders show a "Complete payment" action.
- AC3: An empty state appears when I have no orders.

### US-25 — Tracking timeline
- AC1: A timeline shows Placed → Preparing → Ready → Delivered, with timestamps for completed steps. Cancelled orders show a distinct terminal state.
- AC2: The page polls every 15 s while the order is active and stops when it reaches a terminal state.
- AC3: Viewing someone else's order → 404.

---

## Epic: Operations (staff/admin)

### US-26 — Staff order queue
- AC1: The default view lists `PLACED`, `PREPARING` and `READY` orders, oldest first, grouped or filterable by status.
- AC2: Filters: status, date range, order number search.
- AC3: The list auto-refreshes every 10 s. New orders are highlighted.

### US-27 — Order details
- AC1: The details view shows the customer name and phone, type and address, notes, items with snapshot prices, totals, payment attempts and the full status history.

### US-28 — Update order status
- AC1: Only valid next statuses are offered as buttons (e.g. a PLACED order shows "Start preparing").
- AC2: A valid transition updates the status and adds a history row with actor and timestamp.
- AC3: An invalid transition (e.g. `PLACED → DELIVERED`, `DELIVERED → PREPARING`, anything to `PLACED`) → 409 `INVALID_STATUS_TRANSITION`.
- AC4: Two staff clicking at the same time: one succeeds, the other gets 409 (the row lock makes the second request re-check the new state).

### US-29 — Admin cancel with refund
- AC1: An admin can cancel `PLACED` or `PREPARING` orders, with a reason (required) and confirmation.
- AC2: The successful payment becomes `REFUNDED`, the order becomes `CANCELLED`, and history is recorded.
- AC3: Staff cannot cancel paid orders (403).

### US-30 — Admin statistics
- AC1: The dashboard shows today's orders (paid), today's revenue, average order value, and active orders by status.
- AC2: Top 5 items by quantity over the last 7 days.
- AC3: The figures match the database (checked by a test against seeded data).
