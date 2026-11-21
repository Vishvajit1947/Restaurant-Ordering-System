"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Clock, Flame, Minus, Plus } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

import { EmptyState, ErrorState, FoodImage, PageLoader, Spinner, VegMark } from "@/components/common";
import { AnimatedMoney } from "@/components/motion";
import { useAddToCart } from "@/components/store/menu-item-card";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import { formatMoney, spiceLabel } from "@/lib/format";
import { qk, useRestaurant } from "@/lib/hooks";
import type { MenuItem } from "@/lib/types";

export default function MenuItemPage() {
  const { itemId } = useParams<{ itemId: string }>();
  const { data: restaurant } = useRestaurant();
  const [qty, setQty] = useState(1);
  const { addItem, isPending, canOrder } = useAddToCart();
  const q = useQuery({ queryKey: qk.menuItem(itemId), queryFn: () => api<MenuItem>(`/menu-items/${itemId}`) });

  if (q.isLoading) return <PageLoader />;
  if (q.error instanceof ApiError && (q.error.status === 404 || q.error.status === 422)) {
    return (
      <div className="container-page py-16">
        <EmptyState
          title="Dish not found"
          description="It may have been removed from the menu."
          action={
            <Button asChild>
              <Link href="/menu">Back to menu</Link>
            </Button>
          }
        />
      </div>
    );
  }
  if (q.isError) return <div className="container-page py-16"><ErrorState error={q.error} onRetry={() => q.refetch()} /></div>;
  const item = q.data!;
  const currency = restaurant?.currency ?? "INR";

  return (
    <div className="container-page py-10">
      <Button variant="ghost" size="sm" asChild className="mb-6 -ml-3">
        <Link href="/menu">
          <ArrowLeft /> Back to menu
        </Link>
      </Button>
      <div className="m-stagger grid gap-10 lg:grid-cols-2">
        <div className="relative overflow-hidden rounded-xl">
          <FoodImage src={item.image_url} alt={item.name} className={`aspect-[4/3] w-full ${item.is_available ? "" : "grayscale"}`} />
          {!item.is_available && (
            <span className="absolute top-4 left-4 rounded-full bg-night/85 px-3 py-1.5 text-sm text-on-dark">Currently unavailable</span>
          )}
        </div>
        <div className="flex flex-col">
          <p className="eyebrow">{item.category.name}</p>
          <div className="mt-4 flex items-start gap-3">
            <VegMark veg={item.is_vegetarian} className="mt-2.5" />
            <h1 className="type-h1">{item.name}</h1>
          </div>
          <p className="mt-4 text-2xl tabular-nums">{formatMoney(item.price, currency)}</p>
          <p className="type-body-lg mt-6 text-ink-secondary">{item.description}</p>

          <dl className="mt-8 grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-lavender p-4">
              <dt className="text-xs text-ink-secondary">Diet</dt>
              <dd className="mt-1">{item.is_vegetarian ? "Vegetarian" : "Non-veg"}</dd>
            </div>
            <div className="rounded-xl bg-lavender p-4">
              <dt className="flex items-center gap-1 text-xs text-ink-secondary">
                <Flame className="size-3" /> Spice
              </dt>
              <dd className="mt-1">{spiceLabel(item.spice_level)}</dd>
            </div>
            <div className="rounded-xl bg-lavender p-4">
              <dt className="flex items-center gap-1 text-xs text-ink-secondary">
                <Clock className="size-3" /> Prep time
              </dt>
              <dd className="mt-1">{item.prep_time_minutes} min</dd>
            </div>
          </dl>

          {canOrder && (
            <div className="mt-10 flex flex-wrap items-center gap-3">
              <div className="inline-flex items-center rounded-full bg-[rgba(112,115,147,0.1)] p-1">
                <Button size="icon-sm" variant="ghost" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1} aria-label="Decrease quantity">
                  <Minus />
                </Button>
                <span className="w-10 text-center tabular-nums" aria-live="polite">
                  <span key={qty} className="m-pop inline-block">
                    {qty}
                  </span>
                </span>
                <Button size="icon-sm" variant="ghost" onClick={() => setQty((q) => Math.min(50, q + 1))} disabled={qty >= 50} aria-label="Increase quantity">
                  <Plus />
                </Button>
              </div>
              <Button size="lg" disabled={!item.is_available || isPending} onClick={() => addItem(item, qty)}>
                {isPending && <Spinner />}
                {item.is_available ? (
                  <>
                    Add to cart · <AnimatedMoney value={Number(item.price) * qty} currency={currency} />
                  </>
                ) : (
                  "Unavailable"
                )}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
