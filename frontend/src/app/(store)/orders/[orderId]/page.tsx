"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog, EmptyState, ErrorState, OrderStatusBadge, PageLoader, PaymentStatusBadge } from "@/components/common";
import { OrderSummaryCard, OrderTimeline, PaymentAttempts } from "@/components/orders";
import { SuccessCheck } from "@/components/motion";
import { RequireRole } from "@/components/require-role";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import { formatDateTime, formatTime, ORDER_STATUS_LABEL } from "@/lib/format";
import { qk } from "@/lib/hooks";
import type { Order } from "@/lib/types";

const ACTIVE = ["PENDING_PAYMENT", "PLACED", "PREPARING", "READY"];

function Tracking() {
  const { orderId } = useParams<{ orderId: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [cancelOpen, setCancelOpen] = useState(false);
  const q = useQuery({
    queryKey: qk.order(orderId),
    queryFn: () => api<Order>(`/orders/${orderId}`),
    // Poll every 15 s while the order is in progress; stop once it reaches a final state.
    refetchInterval: (query) => (query.state.data && ACTIVE.includes(query.state.data.status) ? 15_000 : false),
  });
  // Tell the customer when a poll brings a new status.
  const status = q.data?.status;
  const lastStatus = useRef(status);
  useEffect(() => {
    if (status && lastStatus.current && status !== lastStatus.current) {
      toast.success(`Your order is now ${ORDER_STATUS_LABEL[status].toLowerCase()}`);
    }
    lastStatus.current = status;
  }, [status]);

  const cancel = useMutation({
    mutationFn: () => api<{ order: Order }>(`/orders/${orderId}/cancel`, { method: "POST", body: { restore_to_cart: true } }),
    onSuccess: (res) => {
      qc.setQueryData(qk.order(orderId), res.order);
      qc.invalidateQueries({ queryKey: qk.cart });
      setCancelOpen(false);
      toast.success("Order cancelled. Available items were returned to your cart.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not cancel"),
  });

  if (q.isLoading) return <PageLoader />;
  if (q.error instanceof ApiError && (q.error.status === 404 || q.error.status === 422)) {
    return (
      <EmptyState
        title="Order not found"
        action={
          <Button asChild>
            <Link href="/orders">My orders</Link>
          </Button>
        }
      />
    );
  }
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const o = q.data!;
  const eta = o.placed_at ? new Date(new Date(o.placed_at).getTime() + o.estimated_ready_minutes * 60000).toISOString() : null;

  return (
    <>
      <Button variant="ghost" size="sm" asChild className="mb-6 -ml-3">
        <Link href="/orders">
          <ArrowLeft /> All orders
        </Link>
      </Button>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">Placed {formatDateTime(o.created_at)}</p>
          <h1 className="type-h2 mt-3">Order {o.order_number}</h1>
          <div className="mt-3 flex flex-wrap gap-2">
            <OrderStatusBadge status={o.status} />
            <PaymentStatusBadge status={o.payment_status} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {o.allowed_actions.includes("PAY") && (
            <Button onClick={() => router.push(`/orders/${o.id}/pay`)}>Complete payment</Button>
          )}
          {o.allowed_actions.includes("CANCEL") && (
            <Button variant="outline" onClick={() => setCancelOpen(true)}>
              Cancel order
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={() => q.refetch()} aria-label="Refresh status" disabled={q.isFetching}>
            <RefreshCw className={q.isFetching ? "animate-spin" : ""} />
          </Button>
        </div>
      </div>

      {o.status === "DELIVERED" && (
        <div className="m-scale-in mb-6 flex flex-col items-center gap-4 rounded-xl bg-night p-6 text-center sm:flex-row sm:text-left">
          <SuccessCheck className="mx-0 size-14 shrink-0" />
          <div>
            <p className="text-lg text-on-dark">{o.order_type === "DELIVERY" ? "Delivered. Enjoy your meal!" : "Collected. Enjoy your meal!"}</p>
            <p className="mt-1 text-sm text-fog">Thanks for ordering from Saffron &amp; Smoke.</p>
          </div>
        </div>
      )}
      <div className="m-stagger grid gap-6 lg:grid-cols-[1fr_400px]">
        <div className="space-y-6">
          <section className="rounded-xl bg-white p-6 ring-1 ring-border">
            <div className="mb-6 flex items-center justify-between gap-4">
              <h2 className="text-lg">Order progress</h2>
              {eta && ACTIVE.includes(o.status) && (
                <p className="text-sm text-muted-foreground">
                  Est. {o.order_type === "DELIVERY" ? "delivery" : "ready"} ~{formatTime(eta)}
                </p>
              )}
            </div>
            <OrderTimeline order={o} />
            {ACTIVE.includes(o.status) && <p className="mt-6 text-xs text-muted-foreground">This page refreshes automatically.</p>}
          </section>
          <PaymentAttempts order={o} />
        </div>
        <OrderSummaryCard order={o} className="h-fit" />
      </div>

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancel this order?"
        description="It hasn't been paid yet. Available items will be returned to your cart."
        confirmLabel="Cancel order"
        destructive
        loading={cancel.isPending}
        onConfirm={() => cancel.mutate()}
      />
    </>
  );
}

export default function OrderPage() {
  return (
    <div className="container-page py-12">
      <RequireRole roles={["CUSTOMER"]}>
        <Tracking />
      </RequireRole>
    </div>
  );
}
