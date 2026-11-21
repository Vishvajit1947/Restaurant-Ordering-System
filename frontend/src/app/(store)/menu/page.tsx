"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

import { CardGridSkeleton, EmptyState, ErrorState, PageLoader } from "@/components/common";
import { SlidingTabs } from "@/components/motion";
import { MenuItemCard } from "@/components/store/menu-item-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api";
import { qk, useCategories, useRestaurant } from "@/lib/hooks";
import type { MenuItem, Page } from "@/lib/types";

const PAGE_SIZE = 12;

function MenuContent() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { data: categories } = useCategories();
  const { data: restaurant } = useRestaurant();

  const category = params.get("category") ?? "";
  const search = params.get("q") ?? "";
  const veg = params.get("veg") === "1";
  const available = params.get("available") === "1";
  const sort = params.get("sort") ?? "name";
  const minPrice = params.get("min") ?? "";
  const maxPrice = params.get("max") ?? "";
  const page = Math.max(1, Number(params.get("page") ?? 1) || 1);

  const [searchInput, setSearchInput] = useState(search);
  const [showFilters, setShowFilters] = useState(false);
  const [priceDraft, setPriceDraft] = useState({ min: minPrice, max: maxPrice });

  const update = (changes: Record<string, string | null>, resetPage = true) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    if (resetPage) next.delete("page");
    router.replace(`${pathname}${next.toString() ? `?${next}` : ""}`, { scroll: false });
  };

  // Debounced search (300 ms), kept in the URL so it survives refresh and can be shared.
  useEffect(() => {
    if (searchInput === search) return;
    const t = setTimeout(() => update({ q: searchInput.trim() || null }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const query = useMemo(
    () => ({
      category_id: category || undefined,
      search: search || undefined,
      vegetarian: veg ? true : undefined,
      available_only: available || undefined,
      sort,
      min_price: minPrice || undefined,
      max_price: maxPrice || undefined,
      page,
      page_size: PAGE_SIZE,
    }),
    [category, search, veg, available, sort, minPrice, maxPrice, page],
  );

  const menu = useQuery({
    queryKey: qk.menu(query),
    queryFn: () => api<Page<MenuItem>>("/menu-items", { query }),
    placeholderData: keepPreviousData,
  });

  const totalPages = menu.data ? Math.max(1, Math.ceil(menu.data.total / PAGE_SIZE)) : 1;
  const activeFilters = [veg, available, !!minPrice, !!maxPrice].filter(Boolean).length;
  const priceInvalid =
    (priceDraft.min !== "" && Number(priceDraft.min) < 0) ||
    (priceDraft.max !== "" && Number(priceDraft.max) < 0) ||
    (priceDraft.min !== "" && priceDraft.max !== "" && Number(priceDraft.min) > Number(priceDraft.max));

  return (
    <div className="container-page py-12">
      <div className="mb-8">
        <p className="eyebrow">Order online</p>
        <h1 className="type-h1 mt-3">Our menu</h1>
        <p className="mt-2 text-muted-foreground">
          Prices include everything but 5% GST{restaurant ? ` · Delivery ₹${Number(restaurant.delivery_fee)}` : ""}.
        </p>
      </div>

      {/* Search + controls */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value.slice(0, 100))}
            placeholder="Search dishes, e.g. paneer, biryani…"
            className="pl-11"
            aria-label="Search menu"
          />
          {searchInput && (
            <Button
              size="icon-xs"
              variant="ghost"
              className="absolute top-1/2 right-2 -translate-y-1/2"
              onClick={() => setSearchInput("")}
              aria-label="Clear search"
            >
              <X />
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Select value={sort} onValueChange={(v) => update({ sort: v === "name" ? null : v })}>
            <SelectTrigger className="w-full md:w-48" aria-label="Sort">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">Recommended</SelectItem>
              <SelectItem value="price_asc">Price: low to high</SelectItem>
              <SelectItem value="price_desc">Price: high to low</SelectItem>
              <SelectItem value="newest">Newest</SelectItem>
            </SelectContent>
          </Select>
          <Button variant={activeFilters ? "secondary" : "outline"} className="h-11" onClick={() => setShowFilters((s) => !s)}>
            <SlidersHorizontal /> Filters{activeFilters ? ` (${activeFilters})` : ""}
          </Button>
        </div>
      </div>

      {showFilters && (
        <div className="m-fade-up mt-3 grid gap-5 rounded-xl bg-white p-5 ring-1 ring-border sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex items-center justify-between gap-3 text-sm">
            Vegetarian only
            <Switch checked={veg} onCheckedChange={(c) => update({ veg: c ? "1" : null })} />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm">
            Available now
            <Switch checked={available} onCheckedChange={(c) => update({ available: c ? "1" : null })} />
          </label>
          <form
            className="flex items-end gap-2 sm:col-span-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!priceInvalid) update({ min: priceDraft.min || null, max: priceDraft.max || null });
            }}
          >
            <div className="flex-1">
              <label className="mb-1.5 block text-xs text-muted-foreground" htmlFor="min">
                Min price (₹)
              </label>
              <Input id="min" type="number" min={0} inputMode="numeric" value={priceDraft.min} onChange={(e) => setPriceDraft((p) => ({ ...p, min: e.target.value }))} />
            </div>
            <div className="flex-1">
              <label className="mb-1.5 block text-xs text-muted-foreground" htmlFor="max">
                Max price (₹)
              </label>
              <Input id="max" type="number" min={0} inputMode="numeric" value={priceDraft.max} onChange={(e) => setPriceDraft((p) => ({ ...p, max: e.target.value }))} />
            </div>
            <Button type="submit" variant="secondary" className="h-11" disabled={priceInvalid}>
              Apply
            </Button>
          </form>
          {priceInvalid && <p className="text-[13px] text-destructive sm:col-span-2 lg:col-span-4">Enter a valid price range.</p>}
          {activeFilters > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="w-fit"
              onClick={() => {
                setPriceDraft({ min: "", max: "" });
                update({ veg: null, available: null, min: null, max: null });
              }}
            >
              Reset filters
            </Button>
          )}
        </div>
      )}

      {/* Category chips */}
      <SlidingTabs
        label="Categories"
        className="mt-6 pb-1"
        value={category}
        onChange={(id) => update({ category: id || null })}
        items={[{ value: "", label: "All" }, ...(categories ?? []).map((c) => ({ value: c.id, label: c.name }))]}
      />

      <div className="mt-8">
        {menu.isLoading ? (
          <CardGridSkeleton />
        ) : menu.isError ? (
          <ErrorState error={menu.error} onRetry={() => menu.refetch()} />
        ) : menu.data!.items.length === 0 ? (
          <EmptyState
            icon={Search}
            title="No dishes match"
            description={search ? `We couldn't find anything for “${search}”.` : "Try a different category or clear your filters."}
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  setSearchInput("");
                  setPriceDraft({ min: "", max: "" });
                  router.replace(pathname);
                }}
              >
                Clear search & filters
              </Button>
            }
          />
        ) : (
          <>
            <p className="mb-4 text-sm text-muted-foreground" aria-live="polite">
              {menu.data!.total} {menu.data!.total === 1 ? "dish" : "dishes"}
            </p>
            <div
              key={menu.data!.items.map((i) => i.id).join()}
              className={`m-stagger grid gap-5 transition-opacity duration-200 sm:grid-cols-2 lg:grid-cols-3 ${menu.isFetching ? "opacity-70" : ""}`}
            >
              {menu.data!.items.map((item) => (
                <MenuItemCard key={item.id} item={item} currency={restaurant?.currency} />
              ))}
            </div>
            {totalPages > 1 && (
              <nav className="mt-10 flex items-center justify-center gap-2" aria-label="Pagination">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => update({ page: String(page - 1) }, false)}>
                  Previous
                </Button>
                <span className="px-3 text-sm text-muted-foreground">
                  Page {page} of {totalPages}
                </span>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => update({ page: String(page + 1) }, false)}>
                  Next
                </Button>
              </nav>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function MenuPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <MenuContent />
    </Suspense>
  );
}
