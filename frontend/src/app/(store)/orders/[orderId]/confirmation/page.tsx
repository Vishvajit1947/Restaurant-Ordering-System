"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";

import { ErrorState, PageLoader } from "@/components/common";
import { OrderSummaryCard } from "@/components/orders";
import { CheckoutSteps, SuccessCheck } from "@/components/motion";
import { RequireRole } from "@/components/require-role";
import { Button } from "@/components/ui/button";
import { formatTime } from "@/lib/format";
import { qk } from "@/lib/hooks";
import { api } from "@/lib/api";
import type { Order } from "@/lib/types";

function Confirmation() {
  const { orderId } = useParams<{ orderId: string }>();
  const q = useQuery({ queryKey: qk.order(orderId), queryFn: () => api<Order>(`/orders/${orderId}`) });
  if (q.isLoading) return <PageLoader />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const o = q.data!;
  const paid = o.payment_status === "SUCCESS";
  const eta = o.placed_at ? new Date(new Date(o.placed_at).getTime() + o.estimated_ready_minutes * 60000).toISOString() : null;

  return (
    <div className="mx-auto max-w-2xl">
      <CheckoutSteps current={paid ? 3 : 2} />
      <div className="m-scale-in rounded-xl bg-night p-8 text-center sm:p-12">
        <SuccessCheck />
        <h1 className="type-h1 mt-6 !text-on-dark">{paid ? "Order confirmed" : "Order received"}</h1>
        <p className="mt-3 text-fog">
          {paid
            ? "Thank you! Your simulated payment succeeded and the kitchen has your order."
            : "Your order is awaiting payment."}
        </p>
        <dl className="mx-auto mt-8 grid max-w-md grid-cols-2 gap-3 text-left">
          <div className="rounded-xl bg-night-raised p-4">
            <dt className="text-xs text-fog">Order number</dt>
            <dd className="mt-1 text-on-dark">{o.order_number}</dd>
          </div>
          <div className="rounded-xl bg-night-raised p-4">
            <dt className="text-xs text-fog">{o.order_type === "DELIVERY" ? "Estimated delivery" : "Ready for pickup"}</dt>
            <dd className="mt-1 text-on-dark">{eta ? `~${formatTime(eta)}` : "—"}</dd>
          </div>
        </dl>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button size="lg" asChild>
            <Link href={`/orders/${o.id}`}>Track order</Link>
          </Button>
          <Button size="lg" variant="glass" asChild>
            <Link href="/menu">Order something else</Link>
          </Button>
        </div>
      </div>
      <OrderSummaryCard order={o} className="mt-6" />
    </div>
  );
}

export default function ConfirmationPage() {
  return (
    <div className="container-page py-12">
      <RequireRole roles={["CUSTOMER"]}>
        <Confirmation />
      </RequireRole>
    </div>
  );
}
