# 05 — REST API Specification

Base URL: `/api/v1`. The format is JSON. Monetary amounts are serialised as **strings** (`"249.00"`) to keep decimal precision. Timestamps are ISO-8601 UTC.
Auth is `Authorization: Bearer <jwt>` **or** the `access_token` httpOnly cookie. The full machine-readable contract is FastAPI's `/openapi.json` (UI at `/docs`).

Auth column: **P** = public, **C** = customer, **S** = staff or admin, **A** = admin only.

## 1. Conventions
- Paginated list response: `{ "items": [...], "page": 1, "page_size": 20, "total": 57 }`. Query `page` ≥ 1, `page_size` 1–100.
- Error response: `{ "error": { "code": "…", "message": "…", "details": {…} } }`.
- Idempotent endpoints require `Idempotency-Key: <uuid v4>`.

## 2. Endpoints

### Health
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | P | API + DB liveness |

### Auth
| Method | Path | Auth | Body → Response | Errors |
|---|---|---|---|---|
| POST | `/auth/register` | P | `{full_name, email, password, phone?}` → 201 `{user, access_token}` + cookie | 409 EMAIL_ALREADY_REGISTERED, 422 |
| POST | `/auth/login` | P | `{email, password}` → 200 `{user, access_token, token_type, expires_in}` + cookie | 401 INVALID_CREDENTIALS, 403 ACCOUNT_DISABLED |
| POST | `/auth/logout` | P | → 204, clears cookie | — |
| GET | `/auth/me` | C/S/A | → `{id, full_name, email, phone, role}` | 401 |

### Restaurant
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/restaurant` | P | Public info: name, tagline, description, address, phone, hero image, `is_open`, currency, tax_rate, delivery_fee, opening_hours |
| GET | `/admin/restaurant` | A | Full settings |
| PATCH | `/admin/restaurant` | A | Partial update (info, tax_rate, delivery_fee, ttl) |
| PUT | `/admin/restaurant/status` | A | `{is_open: bool}` |

### Categories
| Method | Path | Auth | Description | Errors |
|---|---|---|---|---|
| GET | `/categories` | P | Active categories, sorted, with `item_count` | |
| GET | `/admin/categories` | A | All categories, including inactive | |
| POST | `/admin/categories` | A | `{name, description?, sort_order?, is_active?}` → 201 | 409 CATEGORY_NAME_TAKEN |
| PATCH | `/admin/categories/{id}` | A | Partial update | 404, 409 |
| DELETE | `/admin/categories/{id}` | A | → 204 | 409 CATEGORY_NOT_EMPTY |

### Menu
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/menu-items` | P | Query: `category_id`, `search` (≤ 100 chars), `vegetarian` (bool), `available_only` (bool), `min_price`, `max_price`, `sort` (`name`\|`price_asc`\|`price_desc`\|`newest`), `page`, `page_size`. Archived items and items in inactive categories are always excluded |
| GET | `/menu-items/{id}` | P | Item detail (404 if archived) |
| GET | `/admin/menu-items` | A | Same filters + `include_archived`, `is_available` |
| POST | `/admin/menu-items` | A | `{category_id, name, description?, price, image_url?, is_vegetarian, spice_level, prep_time_minutes, is_available}` → 201 |
| PATCH | `/admin/menu-items/{id}` | A | Partial update |
| PUT | `/admin/menu-items/{id}/availability` | A | `{is_available: bool}` |
| DELETE | `/admin/menu-items/{id}` | A | → 200 `{deleted: true}` or `{archived: true}` (if it was ever ordered) |
| POST | `/admin/uploads/images` | A | multipart `file` → 201 `{url}`. 422 INVALID_IMAGE / FILE_TOO_LARGE |

`MenuItem` response: `{id, category: {id, name}, name, description, price, image_url, is_vegetarian, spice_level, prep_time_minutes, is_available, created_at}`.

### Cart (customer only)
| Method | Path | Body → Response | Errors |
|---|---|---|---|
| GET | `/cart` | → `Cart` | |
| POST | `/cart/items` | `{menu_item_id, quantity = 1}` → 200 `Cart` (merges into an existing line) | 404 MENU_ITEM_NOT_FOUND, 409 ITEM_UNAVAILABLE, 422 INVALID_QUANTITY |
| PATCH | `/cart/items/{menu_item_id}` | `{quantity}` (sets the value) → `Cart` | 404 CART_ITEM_NOT_FOUND, 422 |
| DELETE | `/cart/items/{menu_item_id}` | → `Cart` | 404 |
| DELETE | `/cart` | → `Cart` (empty) | |

```json
// Cart
{ "items": [ { "menu_item_id": "…", "name": "Paneer Tikka", "image_url": "…", "unit_price": "249.00",
               "quantity": 2, "line_total": "498.00", "is_available": true } ],
  "item_count": 2, "subtotal": "498.00", "tax_amount": "24.90",
  "delivery_fee_if_delivery": "40.00", "currency": "INR", "can_checkout": true,
  "blocking_reasons": [] }   // e.g. ["RESTAURANT_CLOSED", "ITEM_UNAVAILABLE"]
```
`quantity` is a strict integer. JSON `1.5`, `"2"`, `0` and `-1` are all rejected (`Field(strict=True, ge=1, le=50)`).

### Orders (customer)
| Method | Path | Headers / Body → Response | Errors |
|---|---|---|---|
| POST | `/orders` | `Idempotency-Key`. `{order_type: "PICKUP"\|"DELIVERY", delivery_address?, customer_notes?}` → **201** `Order` (new) or **200** `Order` (replayed) | 400 IDEMPOTENCY_KEY_REQUIRED, 400 CART_EMPTY, 409 ITEM_UNAVAILABLE `{menu_item_ids}`, 409 RESTAURANT_CLOSED, 409 IDEMPOTENCY_KEY_REUSED, 422 |
| GET | `/orders` | `?status&page&page_size` → Page[`OrderSummary`] | |
| GET | `/orders/{id}` | → `Order` (own orders only) | 404 ORDER_NOT_FOUND |
| POST | `/orders/{id}/cancel` | `{restore_to_cart: bool}` → `Order` + `{restored, skipped}` | 409 INVALID_STATUS_TRANSITION |

The request schema uses `extra="forbid"`, so a request containing `items`, `price` or `total` is rejected with 422. This makes rule 6 explicit and testable.

```json
// Order
{ "id": "…", "order_number": "ORD-20261120-000042", "status": "PENDING_PAYMENT", "payment_status": "FAILED",
  "order_type": "DELIVERY", "delivery_address": "…", "customer_notes": null, "currency": "INR",
  "items": [ { "menu_item_id": "…", "item_name": "Paneer Tikka", "unit_price": "249.00", "quantity": 2, "line_total": "498.00" } ],
  "subtotal": "498.00", "tax_amount": "24.90", "delivery_fee": "40.00", "total_amount": "562.90",
  "payment_expires_at": "…", "placed_at": null, "created_at": "…",
  "payments": [ { "id": "…", "attempt_number": 1, "method": "CARD", "status": "FAILED", "failure_reason": "Card declined (simulated)", "created_at": "…" } ],
  "status_history": [ { "from_status": null, "to_status": "PENDING_PAYMENT", "actor_role": "CUSTOMER", "created_at": "…" } ],
  "allowed_actions": ["PAY", "CANCEL"] }
```

### Payments (customer)
| Method | Path | Headers / Body → Response | Errors |
|---|---|---|---|
| POST | `/orders/{id}/payments` | `Idempotency-Key`. `{method: "CARD", card: {number, expiry, cvv, holder_name}}` or `{method: "UPI", upi_id}`, plus optional `simulate: "SUCCESS"\|"FAILURE"` → **201** `PaymentResult` (new attempt) / **200** (replayed) | 404, 409 ORDER_ALREADY_PAID, 409 ORDER_NOT_PAYABLE (cancelled etc.), 409 ORDER_EXPIRED, 409 RESTAURANT_CLOSED, 409 ITEM_UNAVAILABLE, 422 |
| GET | `/orders/{id}/payments` | → list of attempts | 404 |

A **failed** simulated payment is a successful API call: it returns 201 with `payment.status = "FAILED"`. The API call itself worked; the simulated charge did not. Simulation rules (deterministic):
- `simulate: "FAILURE"` → FAILED ("Payment declined (simulated)").
- Card number ending `0002` → FAILED "Card declined". Ending `0069` → FAILED "Card expired". Any other Luhn-valid number → SUCCESS.
- UPI ID `fail@sim` → FAILED. Any other valid `name@bank` → SUCCESS.
- Expiry date in the past / Luhn-invalid card → 422 (a validation error, not a payment attempt).

```json
// PaymentResult
{ "payment": { "id": "…", "attempt_number": 2, "status": "SUCCESS", "amount": "562.90", "method": "CARD",
               "card_last4": "4242", "provider_reference": "SIM-7F3A…", "failure_reason": null },
  "order": { "id": "…", "status": "PLACED", "payment_status": "SUCCESS" } }
```

### Order management (staff/admin)
| Method | Path | Auth | Description | Errors |
|---|---|---|---|---|
| GET | `/admin/orders` | S | `?status=PLACED,PREPARING,READY` (default active statuses), `include_unpaid`, `from`, `to`, `search` (order number or customer name), `sort=oldest\|newest`, paging | |
| GET | `/admin/orders/{id}` | S | Full order + customer contact + payments + history + `allowed_transitions` for the caller's role | 404 |
| POST | `/admin/orders/{id}/status` | S | `{to_status, note?}` → `Order` | 409 INVALID_STATUS_TRANSITION `{from, to, allowed}`, 403 (e.g. staff → CANCELLED) |
| POST | `/admin/orders/{id}/cancel` | A | `{reason}` (required) → `Order` (payment refunded if paid) | 409 |

### Dashboard (admin)
| Method | Path | Description |
|---|---|---|
| GET | `/admin/dashboard/stats` | `?date=YYYY-MM-DD` (default today, restaurant timezone) → `{orders_today, revenue_today, average_order_value, active_by_status: {PLACED, PREPARING, READY}, pending_payment_count, top_items_7d: [{menu_item_id, name, quantity}], revenue_7d: [{date, revenue}]}` |

### Staff accounts (admin)
| Method | Path | Description |
|---|---|---|
| GET | `/admin/staff` | List staff and admins |
| POST | `/admin/staff` | `{full_name, email, password, phone?}` → 201 (role STAFF) |
| PATCH | `/admin/staff/{id}` | `{is_active}` (cannot deactivate yourself → 409) |

## 3. Error code catalogue
| HTTP | Code | When |
|---|---|---|
| 400 | IDEMPOTENCY_KEY_REQUIRED | Missing or invalid `Idempotency-Key` |
| 400 | CART_EMPTY | Checkout with no cart lines |
| 401 | NOT_AUTHENTICATED / INVALID_CREDENTIALS / TOKEN_EXPIRED | |
| 403 | FORBIDDEN / ACCOUNT_DISABLED | Wrong role / deactivated |
| 404 | *_NOT_FOUND | Including another user's order |
| 409 | ITEM_UNAVAILABLE | Add-to-cart, checkout or payment with an unavailable item |
| 409 | RESTAURANT_CLOSED | Checkout or payment while closed |
| 409 | IDEMPOTENCY_KEY_REUSED | Same key, different body |
| 409 | ORDER_ALREADY_PAID / ORDER_NOT_PAYABLE / ORDER_EXPIRED | Payment preconditions |
| 409 | INVALID_STATUS_TRANSITION | State machine violation |
| 409 | EMAIL_ALREADY_REGISTERED / CATEGORY_NAME_TAKEN / CATEGORY_NOT_EMPTY | Conflicts |
| 422 | VALIDATION_ERROR / INVALID_QUANTITY / INVALID_IMAGE / FILE_TOO_LARGE | Input validation |
| 500 | INTERNAL_ERROR | Unexpected (logged with request ID) |

## 4. Postman
A collection `postman/RestaurantOrdering.postman_collection.json` with an environment (`baseUrl`, `customerToken`, `staffToken`, `adminToken`). A pre-request script generates `Idempotency-Key` values. Folders mirror the sections above, and each request has test scripts asserting status codes. A "Happy path" folder runs end to end in the Postman runner.
