"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Mail, Phone } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { OrderStatusActions } from "@/components/dashboard/order-actions";
import { EmptyState, ErrorState, OrderStatusBadge, PageLoader, PaymentStatusBadge } from "@/components/common";
import { OrderSummaryCard, OrderTimeline, PaymentAttempts, StatusHistoryList } from "@/components/orders";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { Order } from "@/lib/types";

export default function AdminOrderPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const q = useQuery({
    queryKey: ["admin-order", orderId],
    queryFn: () => api<Order>(`/admin/orders/${orderId}`),
    refetchInterval: 15_000,
  });

  if (q.isLoading) return <PageLoader />;
  if (q.error instanceof ApiError && (q.error.status === 404 || q.error.status === 422))
    return (
      <EmptyState
        title="Order not found"
        action={
          <Button asChild>
            <Link href="/dashboard/orders">Back to orders</Link>
          </Button>
        }
      />
    );
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const o = q.data!;

  return (
    <>
      <Button variant="ghost" size="sm" asChild className="mb-6 -ml-3">
        <Link href="/dashboard/orders">
          <ArrowLeft /> Orders
        </Link>
      </Button>
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="eyebrow">Created {formatDateTime(o.created_at)}</p>
          <h1 className="type-h2 mt-3">Order {o.order_number}</h1>
          <div className="mt-3 flex flex-wrap gap-2">
            <OrderStatusBadge status={o.status} />
            <PaymentStatusBadge status={o.payment_status} />
            <span className="inline-flex h-6 items-center rounded-full bg-lavender px-2.5 text-xs text-ink-secondary">
              {o.order_type === "DELIVERY" ? "Delivery" : "Pickup"}
            </span>
          </div>
        </div>
        <OrderStatusActions order={o} />
      </div>

      <div className="m-stagger grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <section className="rounded-xl bg-white p-6 ring-1 ring-border">
            <h2 className="mb-6 text-lg">Progress</h2>
            <OrderTimeline order={o} />
          </section>
          <section className="rounded-xl bg-white p-6 ring-1 ring-border">
            <h2 className="mb-4 text-lg">Status history</h2>
            <StatusHistoryList order={o} />
          </section>
          <PaymentAttempts order={o} />
        </div>
        <div className="space-y-6">
          {o.customer && (
            <section className="rounded-xl bg-night p-6 text-on-dark">
              <p className="text-sm text-fog">Customer</p>
              <p className="mt-1 text-lg">{o.customer.full_name}</p>
              <div className="mt-4 space-y-2 text-sm text-fog">
                <p className="flex items-center gap-2">
                  <Mail className="size-4" /> {o.customer.email}
                </p>
                {o.customer.phone && (
                  <p className="flex items-center gap-2">
                    <Phone className="size-4" /> {o.customer.phone}
                  </p>
                )}
              </div>
            </section>
          )}
          <OrderSummaryCard order={o} />
        </div>
      </div>
    </>
  );
}
