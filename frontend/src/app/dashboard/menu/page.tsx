"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Search, Trash2, UtensilsCrossed } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog, EmptyState, ErrorState, FoodImage, PageHeader, VegMark } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { api, errorMessage } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import type { Category, MenuItem, Page } from "@/lib/types";

export default function AdminMenuPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [category, setCategory] = useState("all");
  const [availability, setAvailability] = useState("all");
  const [showArchived, setShowArchived] = useState(false);
  const [toDelete, setToDelete] = useState<MenuItem | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const categories = useQuery({ queryKey: ["admin-categories"], queryFn: () => api<Category[]>("/admin/categories") });
  const query = {
    search: debounced || undefined,
    category_id: category === "all" ? undefined : category,
    is_available: availability === "all" ? undefined : availability === "available",
    include_archived: showArchived || undefined,
    page_size: 100,
  };
  const items = useQuery({
    queryKey: ["admin-menu", query],
    queryFn: () => api<Page<MenuItem>>("/admin/menu-items", { query }),
    placeholderData: keepPreviousData,
  });

  const toggle = useMutation({
    mutationFn: (v: { id: string; is_available: boolean }) =>
      api<MenuItem>(`/admin/menu-items/${v.id}/availability`, { method: "PUT", body: { is_available: v.is_available } }),
    // Optimistic update with rollback on failure.
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: ["admin-menu"] });
      const prev = qc.getQueriesData<Page<MenuItem>>({ queryKey: ["admin-menu"] });
      qc.setQueriesData<Page<MenuItem>>({ queryKey: ["admin-menu"] }, (old) =>
        old ? { ...old, items: old.items.map((i) => (i.id === v.id ? { ...i, is_available: v.is_available } : i)) } : old,
      );
      return { prev };
    },
    onError: (e, _v, ctx) => {
      ctx?.prev.forEach(([key, data]) => qc.setQueryData(key, data));
      toast.error(errorMessage(e));
    },
    onSuccess: (item) => {
      toast.success(`${item.name} is now ${item.is_available ? "available" : "unavailable"}`);
      qc.invalidateQueries({ queryKey: ["menu"] });
    },
  });

  const del = useMutation({
    mutationFn: (id: string) => api<{ deleted: boolean; archived: boolean }>(`/admin/menu-items/${id}`, { method: "DELETE" }),
    onSuccess: (res) => {
      toast.success(res.archived ? "Item archived — it has past orders, so its history is kept." : "Item deleted");
      setToDelete(null);
      qc.invalidateQueries({ queryKey: ["admin-menu"] });
      qc.invalidateQueries({ queryKey: ["menu"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <>
      <PageHeader
        eyebrow="Menu"
        title="Menu items"
        description="Add dishes, update prices and switch availability in real time."
        actions={
          <Button asChild>
            <Link href="/dashboard/menu/new">
              <Plus /> New item
            </Link>
          </Button>
        }
      />

      <div className="mb-4 grid gap-3 md:grid-cols-[1fr_200px_180px_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search items" className="pl-11" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search items" />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-full" aria-label="Category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.data?.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={availability} onValueChange={setAvailability}>
          <SelectTrigger className="w-full" aria-label="Availability">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any availability</SelectItem>
            <SelectItem value="available">Available</SelectItem>
            <SelectItem value="unavailable">Unavailable</SelectItem>
          </SelectContent>
        </Select>
        <label className="flex h-11 items-center gap-2 rounded-xl bg-white px-4 text-sm ring-1 ring-input">
          <Switch checked={showArchived} onCheckedChange={setShowArchived} /> Archived
        </label>
      </div>

      {items.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : items.isError ? (
        <ErrorState error={items.error} onRetry={() => items.refetch()} />
      ) : items.data!.items.length === 0 ? (
        <EmptyState
          icon={UtensilsCrossed}
          title="No items found"
          description="Try different filters, or add a new item."
          action={
            <Button asChild>
              <Link href="/dashboard/menu/new">New item</Link>
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-border">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="eyebrow px-5 py-3 !text-[11px]">Item</th>
                <th className="eyebrow px-5 py-3 !text-[11px]">Category</th>
                <th className="eyebrow px-5 py-3 text-right !text-[11px]">Price</th>
                <th className="eyebrow px-5 py-3 !text-[11px]">Available</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody key={items.data!.items.length} className="m-stagger divide-y divide-border">
              {items.data!.items.map((i) => (
                <tr key={i.id} className={`transition-colors duration-150 hover:bg-surface-tint ${i.is_archived ? "opacity-60" : ""}`}>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <FoodImage src={i.image_url} alt={i.name} className="size-11 rounded-lg" />
                      <div>
                        <p className="flex items-center gap-2 text-[15px]">
                          <VegMark veg={i.is_vegetarian} /> {i.name}
                        </p>
                        {i.is_archived && <p className="text-xs text-muted-foreground">Archived</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{i.category.name}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{formatMoney(i.price)}</td>
                  <td className="px-5 py-3">
                    <Switch
                      checked={i.is_available}
                      disabled={i.is_archived}
                      onCheckedChange={(c) => toggle.mutate({ id: i.id, is_available: c })}
                      aria-label={`${i.name} available`}
                    />
                  </td>
                  <td className="px-5 py-3">
                    {!i.is_archived && (
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon-sm" asChild aria-label={`Edit ${i.name}`}>
                          <Link href={`/dashboard/menu/${i.id}`}>
                            <Pencil />
                          </Link>
                        </Button>
                        <Button variant="ghost" size="icon-sm" onClick={() => setToDelete(i)} aria-label={`Delete ${i.name}`}>
                          <Trash2 />
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={`Delete ${toDelete?.name}?`}
        description="If this item appears in past orders it will be archived instead, so order history stays intact. It will be removed from the menu and from customers' carts."
        confirmLabel="Delete"
        destructive
        loading={del.isPending}
        onConfirm={() => toDelete && del.mutate(toDelete.id)}
      />
    </>
  );
}
