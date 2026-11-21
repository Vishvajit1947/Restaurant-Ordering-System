import type { OrderStatus, PaymentStatus } from "./types";

const formatters = new Map<string, Intl.NumberFormat>();

export function formatMoney(value: string | number, currency = "INR"): string {
  let f = formatters.get(currency);
  if (!f) {
    f = new Intl.NumberFormat("en-IN", { style: "currency", currency, minimumFractionDigits: 2 });
    formatters.set(currency, f);
  }
  return f.format(typeof value === "string" ? Number(value) : value);
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

export function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  return `${Math.floor(diff / 86400)} d ago`;
}

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "Awaiting payment",
  PLACED: "Placed",
  PREPARING: "Preparing",
  READY: "Ready",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  PENDING: "Unpaid",
  SUCCESS: "Paid",
  FAILED: "Payment failed",
  REFUNDED: "Refunded",
};

export const TRANSITION_LABEL: Partial<Record<OrderStatus, string>> = {
  PREPARING: "Start preparing",
  READY: "Mark ready",
  DELIVERED: "Mark delivered",
  CANCELLED: "Cancel order",
};

export function spiceLabel(level: number): string {
  return ["Not spicy", "Mild", "Medium", "Hot"][level] ?? "";
}
