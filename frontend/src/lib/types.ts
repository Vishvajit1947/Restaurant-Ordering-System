// Types mirroring the backend Pydantic schemas (backend/app/schemas). Money values are strings ("249.00").

export type UserRole = "CUSTOMER" | "STAFF" | "ADMIN";
export type OrderStatus = "PENDING_PAYMENT" | "PLACED" | "PREPARING" | "READY" | "DELIVERED" | "CANCELLED";
export type PaymentStatus = "PENDING" | "SUCCESS" | "FAILED" | "REFUNDED";
export type PaymentMethod = "CARD" | "UPI";
export type OrderType = "PICKUP" | "DELIVERY";

export interface User {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  role: UserRole;
  is_active: boolean;
}

export interface AuthResponse {
  user: User;
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface Page<T> {
  items: T[];
  page: number;
  page_size: number;
  total: number;
}

export interface OpeningHours {
  day: string;
  hours: string;
}

export interface Restaurant {
  name: string;
  tagline: string | null;
  description: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  hero_image_url: string | null;
  is_open: boolean;
  currency: string;
  tax_rate: string;
  delivery_fee: string;
  pending_payment_ttl_minutes: number;
  opening_hours: OpeningHours[] | null;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  item_count: number;
}

export interface MenuItem {
  id: string;
  category: { id: string; name: string; slug: string };
  name: string;
  description: string | null;
  price: string;
  image_url: string | null;
  is_vegetarian: boolean;
  spice_level: number;
  prep_time_minutes: number;
  is_available: boolean;
  is_archived: boolean;
  created_at: string;
}

export interface CartLine {
  menu_item_id: string;
  name: string;
  image_url: string | null;
  is_vegetarian: boolean;
  unit_price: string;
  quantity: number;
  line_total: string;
  is_available: boolean;
}

export interface Cart {
  items: CartLine[];
  item_count: number;
  subtotal: string;
  tax_amount: string;
  tax_rate: string;
  delivery_fee_if_delivery: string;
  total_pickup: string;
  total_delivery: string;
  currency: string;
  can_checkout: boolean;
  blocking_reasons: string[];
}

export interface OrderItem {
  menu_item_id: string;
  item_name: string;
  unit_price: string;
  quantity: number;
  line_total: string;
}

export interface Payment {
  id: string;
  attempt_number: number;
  method: PaymentMethod;
  status: PaymentStatus;
  amount: string;
  currency: string;
  card_last4: string | null;
  upi_id: string | null;
  provider_reference: string | null;
  failure_reason: string | null;
  created_at: string;
  completed_at: string | null;
  refunded_at: string | null;
}

export interface StatusHistory {
  from_status: OrderStatus | null;
  to_status: OrderStatus;
  actor_role: string;
  actor_name: string | null;
  note: string | null;
  created_at: string;
}

export interface Order {
  id: string;
  order_number: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  order_type: OrderType;
  delivery_address: string | null;
  customer_notes: string | null;
  currency: string;
  items: OrderItem[];
  subtotal: string;
  tax_amount: string;
  delivery_fee: string;
  total_amount: string;
  payment_expires_at: string;
  placed_at: string | null;
  created_at: string;
  cancelled_reason: string | null;
  estimated_ready_minutes: number;
  payments: Payment[];
  status_history: StatusHistory[];
  allowed_actions: string[];
  customer: { id: string; full_name: string; email: string; phone: string | null } | null;
  allowed_transitions: OrderStatus[];
}

export interface OrderSummary {
  id: string;
  order_number: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  order_type: OrderType;
  total_amount: string;
  currency: string;
  item_count: number;
  created_at: string;
  placed_at: string | null;
  customer_name: string | null;
}

export interface PaymentResult {
  payment: Payment;
  order: Order;
}

export interface DashboardStats {
  date: string;
  currency: string;
  orders_today: number;
  revenue_today: string;
  average_order_value: string;
  active_by_status: Record<string, number>;
  pending_payment_count: number;
  cancelled_today: number;
  top_items_7d: { menu_item_id: string; name: string; quantity: number; revenue: string }[];
  revenue_7d: { date: string; revenue: string; orders: number }[];
  menu_items_total: number;
  menu_items_unavailable: number;
}
