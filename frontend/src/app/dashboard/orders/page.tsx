"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Inbox, RefreshCw, Search } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { toast } from "sonner";

import { EmptyState, ErrorState, OrderStatusBadge, PageHeader, PageLoader, PaymentStatusBadge, Spinner } from "@/components/common";
import { SlidingTabs } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api, errorMessage } from "@/lib/api";
import { formatMoney, formatTime, ORDER_STATUS_LABEL, timeAgo, TRANSITION_LABEL } from "@/lib/format";
import type { Order, OrderStatus, OrderSummary, Page } from "@/lib/types";

const TABS: { key: string; label: string; statuses: OrderStatus[]; unpaid?: boolean; sort: "oldest" | "newest" }[] = [
  { key: "active", label: "Active", statuses: ["PLACED", "PREPARING", "READY"], sort: "oldest" },
  { key: "PLACED", label: "New", statuses: ["PLACED"], sort: "oldest" },
  { key: "PREPARING", label: "Preparing", statuses: ["PREPARING"], sort: "oldest" },
  { key: "READY", label: "Ready", statuses: ["READY"], sort: "oldest" },
  { key: "DELIVERED", label: "Delivered", statuses: ["DELIVERED"], sort: "newest" },
  { key: "CANCELLED", label: "Cancelled", statuses: ["CANCELLED"], sort: "newest" },
  { key: "PENDING_PAYMENT", label: "Unpaid", statuses: ["PENDING_PAYMENT"], unpaid: true, sort: "newest" },
];

const NEXT: Partial<Record<OrderStatus, OrderStatus>> = { PLACED: "PREPARING", PREPARING: "READY", READY: "DELIVERED" };
const PAGE_SIZE = 20;

function QuickAdvance({ order }: { order: OrderSummary }) {
  const qc = useQueryClient();
  const next = NEXT[order.status];
  const m = useMutation({
    mutationFn: () => api<Order>(`/admin/orders/${order.id}/status`, { method: "POST", body: { to_status: next } }),
    onSuccess: (o) => {
      toast.success(`${o.order_number} is now ${ORDER_STATUS_LABEL[o.status].toLowerCase()}`);
      qc.invalidateQueries({ queryKey: ["admin-orders"] });
    },
    onError: (e) => {
      toast.error(errorMessage(e));
      qc.invalidateQueries({ queryKey: ["admin-orders"] });
    },
  });
  if (!next) return null;
  return (
    <Button
      size="sm"
      variant={order.status === "PLACED" ? "default" : "secondary"}
      disabled={m.isPending}
      onClick={(e) => {
        e.preventDefault();
        m.mutate();
      }}
    >
      {m.isPending && <Spinner />}
      {TRANSITION_LABEL[next]}
    </Button>
  );
}

function OrdersQueue() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tabKey = params.get("status") ?? "active";
  const tab = TABS.find((t) => t.key === tabKey) ?? TABS[0];
  const search = params.get("q") ?? "";
  const date = params.get("date") ?? "";
  const page = Math.max(1, Number(params.get("page") ?? 1) || 1);
  const [searchInput, setSearchInput] = useState(search);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(t);
  }, []);

  const setParam = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    Object.entries(changes).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    if (!("page" in changes)) next.delete("page");
    router.replace(`${pathname}?${next}`, { scroll: false });
  };

  useEffect(() => {
    if (searchInput === search) return;
    const t = setTimeout(() => setParam({ q: searchInput.trim() || null }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const query = {
    status: tab.statuses,
    include_unpaid: tab.unpaid,
    sort: tab.sort,
    search: search || undefined,
    from: date || undefined,
    to: date || undefined,
    page,
    page_size: PAGE_SIZE,
  };
  const q = useQuery({
    queryKey: ["admin-orders", query],
    queryFn: () => api<Page<OrderSummary>>("/admin/orders", { query }),
    placeholderData: keepPreviousData,
    refetchInterval: 10_000, // live queue
  });

  const pages = q.data ? Math.max(1, Math.ceil(q.data.total / PAGE_SIZE)) : 1;

  return (
    <>
      <PageHeader
        eyebrow="Kitchen"
        title="Orders"
        description="Paid orders appear here automatically. The list refreshes every 10 seconds."
        actions={
          <Button variant="outline" onClick={() => q.refetch()} disabled={q.isFetching}>
            <RefreshCw className={q.isFetching ? "animate-spin" : ""} /> Refresh
          </Button>
        }
      />

      <SlidingTabs
        label="Order status"
        size="sm"
        className="pb-1"
        value={tab.key}
        onChange={(key) => setParam({ status: key === "active" ? null : key })}
        items={TABS.map((t) => ({ value: t.key, label: t.label }))}
      />

      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by order number or customer name"
            className="pl-11"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value.slice(0, 100))}
            aria-label="Search orders"
          />
        </div>
        <Input type="date" className="sm:w-48" value={date} onChange={(e) => setParam({ date: e.target.value || null })} aria-label="Filter by date" />
      </div>

      <div className="mt-6">
        {q.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : q.data!.items.length === 0 ? (
          <EmptyState icon={Inbox} title="No orders here" description={search || date ? "Try clearing the search or date." : "New paid orders will appear automatically."} />
        ) : (
          <>
            <div className="overflow-hidden rounded-xl bg-white ring-1 ring-border">
              <ul key={tab.key} className="m-stagger divide-y divide-border">
                {q.data!.items.map((o) => {
                  const fresh = o.status === "PLACED" && o.placed_at && now - new Date(o.placed_at).getTime() < 3 * 60 * 1000;
                  return (
                    <li key={o.id}>
                      <Link
                        href={`/dashboard/orders/${o.id}`}
                        className={`flex flex-col gap-3 px-5 py-4 transition-colors hover:bg-surface-tint md:flex-row md:items-center ${fresh ? "bg-primary/5" : ""}`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-2 text-[15px]">
                            {o.order_number}
                            {fresh && <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] text-white">New</span>}
                          </p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {o.customer_name} · {o.item_count} items · {o.order_type === "DELIVERY" ? "Delivery" : "Pickup"} ·{" "}
                            {o.placed_at ? `${formatTime(o.placed_at)} (${timeAgo(o.placed_at)})` : timeAgo(o.created_at)}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <OrderStatusBadge status={o.status} />
                          <PaymentStatusBadge status={o.payment_status} />
                        </div>
                        <div className="flex items-center justify-between gap-3 md:w-64 md:justify-end">
                          <span className="tabular-nums">{formatMoney(o.total_amount, o.currency)}</span>
                          <QuickAdvance order={o} />
                          <ChevronRight className="hidden size-4 text-muted-foreground md:block" />
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
            {pages > 1 && (
              <div className="mt-6 flex items-center justify-center gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setParam({ page: String(page - 1) })}>
                  Previous
                </Button>
                <span className="px-3 text-sm text-muted-foreground">
                  Page {page} of {pages}
                </span>
                <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setParam({ page: String(page + 1) })}>
                  Next
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

export default function OrdersPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <OrdersQueue />
    </Suspense>
  );
}
