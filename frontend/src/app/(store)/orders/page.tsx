"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronRight, Receipt } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { EmptyState, ErrorState, OrderStatusBadge, PageHeader, PaymentStatusBadge } from "@/components/common";
import { RequireRole } from "@/components/require-role";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { formatDateTime, formatMoney } from "@/lib/format";
import { qk } from "@/lib/hooks";
import type { OrderSummary, Page } from "@/lib/types";

const PAGE_SIZE = 10;

function History() {
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: qk.orders({ page }),
    queryFn: () => api<Page<OrderSummary>>("/orders", { query: { page, page_size: PAGE_SIZE } }),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });

  if (q.isLoading)
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    );
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const data = q.data!;
  if (!data.items.length)
    return (
      <EmptyState
        icon={Receipt}
        title="No orders yet"
        description="When you place an order it will show up here."
        action={
          <Button asChild>
            <Link href="/menu">Browse the menu</Link>
          </Button>
        }
      />
    );

  const pages = Math.ceil(data.total / PAGE_SIZE);
  return (
    <>
      <ul className="m-stagger space-y-3">
        {data.items.map((o) => (
          <li key={o.id}>
            <Link
              href={o.status === "PENDING_PAYMENT" ? `/orders/${o.id}/pay` : `/orders/${o.id}`}
              className="m-card flex flex-col gap-3 rounded-xl bg-white p-5 ring-1 ring-border sm:flex-row sm:items-center"
            >
              <div className="flex-1">
                <p className="text-[15px]">{o.order_number}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {formatDateTime(o.created_at)} · {o.item_count} {o.item_count === 1 ? "item" : "items"} ·{" "}
                  {o.order_type === "DELIVERY" ? "Delivery" : "Pickup"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <OrderStatusBadge status={o.status} />
                <PaymentStatusBadge status={o.payment_status} />
              </div>
              <div className="flex items-center justify-between gap-3 sm:w-40 sm:justify-end">
                <span className="tabular-nums">{formatMoney(o.total_amount, o.currency)}</span>
                {o.status === "PENDING_PAYMENT" ? (
                  <span className="rounded-full bg-primary px-3 py-1 text-xs text-white">Pay now</span>
                ) : (
                  <ChevronRight className="size-4 text-muted-foreground" />
                )}
              </div>
            </Link>
          </li>
        ))}
      </ul>
      {pages > 1 && (
        <div className="mt-8 flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="px-3 text-sm text-muted-foreground">
            Page {page} of {pages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      )}
    </>
  );
}

export default function OrdersPage() {
  return (
    <div className="container-page py-12">
      <PageHeader eyebrow="Your account" title="My orders" description="Track current orders and view your order history." />
      <RequireRole roles={["CUSTOMER"]}>
        <History />
      </RequireRole>
    </div>
  );
}
