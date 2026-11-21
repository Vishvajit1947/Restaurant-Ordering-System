"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ErrorState, PageHeader, PageLoader } from "@/components/common";
import { AnimatedMoney, AnimatedNumber } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { useMe } from "@/lib/hooks";
import type { DashboardStats } from "@/lib/types";

function StatCard({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="m-card rounded-xl bg-white p-6 ring-1 ring-border">
      <p className="eyebrow">{label}</p>
      <p className="mt-4 text-[32px] leading-none font-[480] tabular-nums">{value}</p>
      {hint && <p className="mt-2 text-sm text-muted-foreground">{hint}</p>}
    </div>
  );
}

function RevenueChart({ data, currency }: { data: DashboardStats["revenue_7d"]; currency: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => Number(d.revenue)));
  const fmtDay = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short" });
  return (
    <div className="rounded-xl bg-white p-6 ring-1 ring-border">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg">Revenue, last 7 days</h2>
        <p className="text-sm text-muted-foreground">Paid orders only</p>
      </div>
      <div className="relative mt-6 flex h-48 items-end gap-2 border-b border-border" role="img" aria-label="Bar chart of daily revenue for the last 7 days">
        {data.map((d, i) => {
          const h = (Number(d.revenue) / max) * 100;
          return (
            <div
              key={d.date}
              className="relative flex h-full flex-1 items-end justify-center"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              tabIndex={0}
            >
              <div
                className={`m-bar w-full max-w-10 rounded-t-[4px] transition-colors ${hover === i ? "bg-[#4457dc]" : "bg-primary"}`}
                style={{ height: `${Math.max(h, Number(d.revenue) > 0 ? 2 : 0)}%`, animationDelay: `${i * 45}ms` }}
              />
              {hover === i && (
                <div className="m-error pointer-events-none absolute bottom-full z-10 mb-2 rounded-lg bg-night px-3 py-2 text-xs whitespace-nowrap text-on-dark shadow-lg">
                  <p className="text-fog">{new Date(`${d.date}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</p>
                  <p className="tabular-nums">{formatMoney(d.revenue, currency)}</p>
                  <p className="text-fog">{d.orders} orders</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-2">
        {data.map((d) => (
          <span key={d.date} className="flex-1 text-center text-xs text-muted-foreground">
            {fmtDay(d.date)}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>Daily revenue</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.date}>
              <th>{d.date}</th>
              <td>{formatMoney(d.revenue, currency)}</td>
              <td>{d.orders} orders</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function DashboardHome() {
  const { data: user } = useMe();
  const router = useRouter();
  const isAdmin = user?.role === "ADMIN";

  useEffect(() => {
    if (user && user.role === "STAFF") router.replace("/dashboard/orders");
  }, [user, router]);

  const stats = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: () => api<DashboardStats>("/admin/dashboard/stats"),
    enabled: isAdmin,
    refetchInterval: 30_000,
  });

  if (user && !isAdmin) return <PageLoader />;
  if (!user || stats.isLoading)
    return (
      <div className="space-y-4" role="status" aria-label="Loading dashboard">
        <Skeleton className="h-16 w-72 max-w-full" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  if (stats.isError) return <ErrorState error={stats.error} onRetry={() => stats.refetch()} />;
  const s = stats.data!;
  const active = s.active_by_status;

  return (
    <>
      <PageHeader
        eyebrow="Overview"
        title={`Good to see you, ${user!.full_name.split(" ")[0]}`}
        description={`Today, ${new Date(`${s.date}T00:00:00`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}`}
        actions={
          <Button asChild>
            <Link href="/dashboard/orders">
              Open order queue <ArrowRight />
            </Link>
          </Button>
        }
      />

      <div className="m-stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Revenue today" value={<AnimatedMoney value={s.revenue_today} currency={s.currency} countUp />} hint="Successful payments" />
        <StatCard label="Orders today" value={<AnimatedNumber value={s.orders_today} countUp />} hint={`${s.cancelled_today} cancelled`} />
        <StatCard label="Avg. order value" value={<AnimatedMoney value={s.average_order_value} currency={s.currency} countUp />} />
        <StatCard label="Awaiting payment" value={<AnimatedNumber value={s.pending_payment_count} countUp />} hint="Not yet in the kitchen" />
      </div>

      <div className="m-stagger mt-4 grid gap-4 sm:grid-cols-3">
        {(
          [
            ["PLACED", "New orders", "Waiting to start"],
            ["PREPARING", "Preparing", "In the kitchen"],
            ["READY", "Ready", "Awaiting handover"],
          ] as const
        ).map(([key, label, hint]) => (
          <Link
            key={key}
            href={`/dashboard/orders?status=${key}`}
            className="m-card group rounded-xl bg-night p-6 text-on-dark hover:bg-night-raised"
          >
            <p className="text-sm text-fog">{label}</p>
            <p className="mt-3 text-5xl font-[480]"><AnimatedNumber value={active[key] ?? 0} countUp /></p>
            <p className="mt-3 flex items-center gap-1 text-sm text-fog">
              {hint} <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" />
            </p>
          </Link>
        ))}
      </div>

      <div className="m-stagger mt-4 grid items-start gap-4 lg:grid-cols-[1fr_360px]">
        <RevenueChart data={s.revenue_7d} currency={s.currency} />
        <div className="rounded-xl bg-white p-6 ring-1 ring-border">
          <h2 className="text-lg">Top dishes, 7 days</h2>
          {s.top_items_7d.length === 0 ? (
            <p className="mt-6 text-sm text-muted-foreground">No paid orders in the last 7 days.</p>
          ) : (
            <ol className="m-stagger mt-4 space-y-4">
              {s.top_items_7d.map((t, i) => (
                <li key={t.menu_item_id} className="flex items-center gap-3">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-lavender text-xs text-ink-secondary">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px]">{t.name}</span>
                    <span className="text-xs text-muted-foreground">{formatMoney(t.revenue, s.currency)}</span>
                  </span>
                  <span className="text-sm tabular-nums text-muted-foreground">{t.quantity} sold</span>
                </li>
              ))}
            </ol>
          )}
          <div className="mt-6 rounded-xl bg-lavender p-4 text-sm">
            <p className="text-ink-secondary">Menu</p>
            <p className="mt-1">
              {s.menu_items_total} items · {s.menu_items_unavailable} unavailable
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
