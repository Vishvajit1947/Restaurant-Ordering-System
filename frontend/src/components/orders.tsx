"use client";

import { Check, ChefHat, CircleDollarSign, PackageCheck, Receipt, XCircle } from "lucide-react";
import { cn } from "cn";

import { Separator } from "@/components/ui/separator";
import { formatDateTime, formatMoney, formatTime, ORDER_STATUS_LABEL } from "@/lib/format";
import type { Order, OrderStatus } from "@/lib/types";

const STEPS: { status: OrderStatus; label: string; hint: string; icon: typeof Check }[] = [
  { status: "PLACED", label: "Order placed", hint: "Payment confirmed", icon: Receipt },
  { status: "PREPARING", label: "Preparing", hint: "The kitchen is cooking", icon: ChefHat },
  { status: "READY", label: "Ready", hint: "Packed and ready", icon: PackageCheck },
  { status: "DELIVERED", label: "Delivered", hint: "Enjoy your meal!", icon: Check },
];

export function OrderTimeline({ order }: { order: Order }) {
  const reached = new Map(order.status_history.map((h) => [h.to_status, h.created_at]));
  if (order.status === "CANCELLED") {
    const at = reached.get("CANCELLED");
    return (
      <div className="m-fade-up flex items-start gap-4 rounded-xl bg-destructive/6 p-5">
        <XCircle className="mt-0.5 size-5 shrink-0 text-destructive" />
        <div>
          <p className="text-ink">Order cancelled{at ? ` · ${formatDateTime(at)}` : ""}</p>
          {order.cancelled_reason && <p className="mt-1 text-sm text-muted-foreground">{order.cancelled_reason}</p>}
          {order.payment_status === "REFUNDED" && (
            <p className="mt-1 text-sm text-muted-foreground">Your payment has been refunded (simulated).</p>
          )}
        </div>
      </div>
    );
  }
  if (order.status === "PENDING_PAYMENT") {
    return (
      <div className="m-fade-up flex items-start gap-4 rounded-xl bg-[#f7f0e1] p-5">
        <CircleDollarSign className="mt-0.5 size-5 shrink-0 text-[#7a5a14]" />
        <div>
          <p className="text-ink">Waiting for payment</p>
          <p className="mt-1 text-sm text-ink-secondary">
            The kitchen starts once payment succeeds. Complete it before {formatTime(order.payment_expires_at)}.
          </p>
        </div>
      </div>
    );
  }
  const currentIdx = STEPS.findIndex((s) => s.status === order.status);
  return (
    <ol className="m-stagger relative">
      {STEPS.map((step, i) => {
        const done = i <= currentIdx;
        const current = i === currentIdx;
        const at = reached.get(step.status);
        const Icon = step.icon;
        return (
          <li key={step.status} className="relative flex gap-4 pb-7 last:pb-0">
            {i < STEPS.length - 1 && (
              <span className="absolute top-10 left-5 h-[calc(100%-2.5rem)] w-px bg-border" aria-hidden>
                {i < currentIdx && <span className="m-line-grow block h-full w-full bg-primary" style={{ animationDelay: `${120 + i * 110}ms` }} />}
              </span>
            )}
            <span
              key={`${done}-${current}`}
              className={cn(
                "relative z-10 flex size-10 shrink-0 items-center justify-center rounded-full",
                done ? "m-pop bg-primary text-white" : "bg-muted text-muted-foreground",
                current && (order.status === "DELIVERED" ? "ring-4 ring-primary/15" : "m-pulse"),
              )}
            >
              <Icon className="size-4" />
            </span>
            <div className="pt-1.5">
              <p className={cn("text-[15px]", done ? "text-ink" : "text-muted-foreground")}>
                {step.label}
                {current && order.status !== "DELIVERED" && (
                  <span className="ml-2 inline-flex items-center gap-1 text-xs text-primary">
                    <span className="size-1.5 animate-pulse rounded-full bg-primary" /> Now
                  </span>
                )}
              </p>
              <p className="text-sm text-muted-foreground">{at ? formatDateTime(at) : step.hint}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function OrderSummaryCard({ order, className }: { order: Order; className?: string }) {
  const c = order.currency;
  return (
    <div className={cn("rounded-xl bg-white p-6 ring-1 ring-border", className)}>
      <h2 className="text-lg">Order summary</h2>
      <ul className="mt-4 space-y-3">
        {order.items.map((i) => (
          <li key={i.menu_item_id} className="flex justify-between gap-4 text-[15px]">
            <span>
              <span className="text-muted-foreground tabular-nums">{i.quantity}×</span> {i.item_name}
            </span>
            <span className="tabular-nums">{formatMoney(i.line_total, c)}</span>
          </li>
        ))}
      </ul>
      <Separator className="my-4" />
      <dl className="space-y-2 text-sm">
        <div className="flex justify-between text-muted-foreground">
          <dt>Subtotal</dt>
          <dd className="tabular-nums">{formatMoney(order.subtotal, c)}</dd>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <dt>GST</dt>
          <dd className="tabular-nums">{formatMoney(order.tax_amount, c)}</dd>
        </div>
        {order.order_type === "DELIVERY" && (
          <div className="flex justify-between text-muted-foreground">
            <dt>Delivery fee</dt>
            <dd className="tabular-nums">{formatMoney(order.delivery_fee, c)}</dd>
          </div>
        )}
        <div className="flex justify-between pt-2 text-base text-ink">
          <dt>Total</dt>
          <dd className="tabular-nums">{formatMoney(order.total_amount, c)}</dd>
        </div>
      </dl>
      <Separator className="my-4" />
      <dl className="space-y-2 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Type</dt>
          <dd>{order.order_type === "DELIVERY" ? "Delivery" : "Pickup"}</dd>
        </div>
        {order.delivery_address && (
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Address</dt>
            <dd className="text-right">{order.delivery_address}</dd>
          </div>
        )}
        {order.customer_notes && (
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Notes</dt>
            <dd className="text-right">{order.customer_notes}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}

export function PaymentAttempts({ order }: { order: Order }) {
  if (!order.payments.length) return null;
  return (
    <div className="rounded-xl bg-white p-6 ring-1 ring-border">
      <h2 className="text-lg">Payment attempts</h2>
      <ul className="m-stagger mt-4 divide-y divide-border">
        {order.payments.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-4 py-3 text-sm">
            <div>
              <p>
                #{p.attempt_number} · {p.method === "CARD" ? `Card •••• ${p.card_last4}` : `UPI ${p.upi_id}`}
              </p>
              <p className="text-muted-foreground">
                {formatDateTime(p.created_at)}
                {p.failure_reason ? ` · ${p.failure_reason}` : p.provider_reference ? ` · ${p.provider_reference}` : ""}
              </p>
            </div>
            <span
              className={cn(
                "rounded-full px-2.5 py-1 text-xs",
                p.status === "SUCCESS" && "bg-[#e5f3ec] text-[#2b6e4f]",
                p.status === "FAILED" && "bg-destructive/10 text-destructive",
                p.status === "REFUNDED" && "bg-[#f7f0e1] text-[#7a5a14]",
                p.status === "PENDING" && "bg-muted text-muted-foreground",
              )}
            >
              {p.status.charAt(0) + p.status.slice(1).toLowerCase()}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function StatusHistoryList({ order }: { order: Order }) {
  return (
    <ol className="m-stagger space-y-3">
      {[...order.status_history].reverse().map((h, i) => (
        <li key={i} className="flex gap-3 text-sm">
          <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary/60" />
          <div>
            <p>
              {h.from_status ? `${ORDER_STATUS_LABEL[h.from_status]} → ` : ""}
              <span className="text-ink">{ORDER_STATUS_LABEL[h.to_status]}</span>
            </p>
            <p className="text-muted-foreground">
              {formatDateTime(h.created_at)} · {h.actor_name ?? h.actor_role.toLowerCase()}
              {h.note ? ` · “${h.note}”` : ""}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
