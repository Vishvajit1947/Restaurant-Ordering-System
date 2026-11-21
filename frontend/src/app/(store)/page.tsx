"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Bike, ChefHat, CreditCard, ShoppingBag, Store } from "lucide-react";
import Link from "next/link";

import { CardGridSkeleton, ErrorState, FoodImage } from "@/components/common";
import { MenuItemCard } from "@/components/store/menu-item-card";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useCategories, useRestaurant } from "@/lib/hooks";
import type { MenuItem, Page } from "@/lib/types";

export default function HomePage() {
  const { data: r } = useRestaurant();
  const { data: categories } = useCategories();
  const featured = useQuery({
    queryKey: ["menu", "featured"],
    queryFn: () => api<Page<MenuItem>>("/menu-items", { query: { available_only: true, page_size: 6, sort: "price_desc" } }),
  });

  return (
    <>
      {/* ─── Night hero ─── */}
      <section className="relative overflow-hidden bg-night">
        <div className="absolute inset-0">
          <FoodImage src={r?.hero_image_url ?? "/media/seed/hero-veg.jpg"} alt="" className="m-kenburns size-full opacity-45" />
          <div className="absolute inset-0 bg-gradient-to-r from-night via-night/85 to-night/30" />
          <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-night to-transparent" />
        </div>
        <div className="container-page relative py-24 sm:py-32">
          <div className="m-stagger max-w-2xl">
            <p className="eyebrow !text-fog">
              {r?.is_open ? "100% vegetarian · Pickup & delivery" : "100% vegetarian · Ordering paused"}
            </p>
            <h1 className="type-display mt-5 !text-on-dark">
              Fire, spice and everything nice — delivered warm.
            </h1>
            <p className="type-body-lg mt-6 max-w-xl text-fog">
              {r?.description?.split(".")[0] ??
                "Regional Indian classics and global comfort food, cooked over charcoal and slow flames"}
              .
            </p>
            <div className="mt-10 flex flex-wrap gap-3">
              <Button size="lg" asChild>
                <Link href="/menu">
                  Order now <ArrowRight />
                </Link>
              </Button>
              <Button size="lg" variant="glass" asChild>
                <Link href="#popular">See popular dishes</Link>
              </Button>
            </div>
          </div>
          <dl className="m-stagger mt-20 grid max-w-3xl grid-cols-2 gap-8 border-t border-night-line pt-10 sm:grid-cols-4">
            {[
              ["30+", "Dishes on the menu"],
              ["100%", "Pure vegetarian"],
              ["5%", "GST, nothing hidden"],
              [r?.delivery_fee ? `₹${Number(r.delivery_fee)}` : "₹40", "Flat delivery fee"],
            ].map(([stat, label]) => (
              <div key={label}>
                <dt className="sr-only">{label}</dt>
                <dd className="text-4xl font-[480] text-on-dark tabular-nums">{stat}</dd>
                <p className="mt-2 text-sm text-fog">{label}</p>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ─── Categories ─── */}
      <section className="container-page py-20 sm:py-24">
        <div data-reveal className="mx-auto max-w-xl text-center">
          <p className="eyebrow">The menu</p>
          <h2 className="type-h1 mt-4">Something for every craving</h2>
        </div>
        <div data-reveal="stagger" className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(categories ?? []).map((c) => (
            <Link
              key={c.id}
              href={`/menu?category=${c.id}`}
              className="m-card group flex flex-col justify-between rounded-xl bg-lavender p-8 hover:bg-[#e4e2f8]"
            >
              <div>
                <h3 className="type-h2">{c.name}</h3>
                <p className="mt-2 text-ink-secondary">{c.description}</p>
              </div>
              <p className="mt-8 flex items-center gap-2 text-sm text-ink">
                {c.item_count} dishes
                <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
              </p>
            </Link>
          ))}
        </div>
      </section>

      {/* ─── Popular ─── */}
      <section id="popular" className="bg-surface-tint py-20 sm:py-24">
        <div className="container-page">
          <div data-reveal className="mb-10 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="eyebrow">Chef&apos;s picks</p>
              <h2 className="type-h1 mt-4">Popular right now</h2>
            </div>
            <Button variant="secondary" asChild>
              <Link href="/menu">
                Full menu <ArrowRight />
              </Link>
            </Button>
          </div>
          {featured.isLoading ? (
            <CardGridSkeleton />
          ) : featured.isError ? (
            <ErrorState error={featured.error} onRetry={() => featured.refetch()} />
          ) : (
            <div data-reveal="stagger" className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {featured.data!.items.map((item) => (
                <MenuItemCard key={item.id} item={item} currency={r?.currency} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ─── How it works ─── */}
      <section className="container-page py-20 sm:py-24">
        <div data-reveal className="mx-auto max-w-xl text-center">
          <p className="eyebrow">How it works</p>
          <h2 className="type-h1 mt-4">From our fire to your door</h2>
        </div>
        <div data-reveal="stagger" className="mt-12 grid gap-4 md:grid-cols-4">
          {[
            [ShoppingBag, "Build your cart", "Pick dishes and quantities. Prices are always calculated by our kitchen system."],
            [CreditCard, "Pay securely", "Pay by card or UPI. If a payment fails, simply retry — your order is kept."],
            [ChefHat, "We cook it fresh", "The kitchen starts as soon as your payment is confirmed."],
            [Bike, "Pickup or delivery", "Track every step live, from preparing to ready to delivered."],
          ].map(([Icon, title, text]) => {
            const I = Icon as typeof Store;
            return (
              <div key={title as string} className="m-card rounded-xl bg-white p-7 ring-1 ring-border">
                <span className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <I className="size-5" />
                </span>
                <h3 className="mt-6 text-lg">{title as string}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{text as string}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ─── About (dark split) ─── */}
      <section className="bg-night py-20 sm:py-24">
        <div data-reveal="stagger" className="container-page grid items-center gap-12 lg:grid-cols-2">
          <div>
            <p className="eyebrow !text-fog">Our kitchen</p>
            <h2 className="type-h1 mt-4 !text-on-dark">A neighbourhood kitchen with a charcoal heart</h2>
            <p className="type-body-lg mt-6 text-fog">{r?.description}</p>
            <div className="mt-8 grid gap-3 text-sm text-fog sm:grid-cols-2">
              {r?.address && <p className="rounded-xl bg-night-raised p-5">{r.address}</p>}
              {r?.opening_hours && (
                <div className="rounded-xl bg-night-raised p-5">
                  {r.opening_hours.map((h) => (
                    <p key={h.day} className="flex justify-between gap-4">
                      <span>{h.day}</span>
                      <span className="text-on-dark">{h.hours}</span>
                    </p>
                  ))}
                </div>
              )}
            </div>
          </div>
          <FoodImage src="/media/seed/interior.jpg" alt="Inside the restaurant" className="aspect-[4/3] w-full rounded-xl" />
        </div>
      </section>

      {/* ─── Closing CTA ─── */}
      <section data-reveal className="container-page py-20 text-center sm:py-24">
        <h2 className="type-h1 mx-auto max-w-2xl">Hungry? Your table is a few taps away.</h2>
        <p className="mx-auto mt-4 max-w-lg text-muted-foreground">
          Create an account to save your cart, pay in seconds and follow your order live.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button size="lg" asChild>
            <Link href="/menu">Start your order</Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="/register">Create account</Link>
          </Button>
        </div>
      </section>
    </>
  );
}
