"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Tags, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog, EmptyState, ErrorState, FieldError, InlineError, PageHeader, Spinner } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError, errorMessage } from "@/lib/api";
import type { Category } from "@/lib/types";

type Draft = { id?: string; name: string; description: string; sort_order: string; is_active: boolean };
const EMPTY: Draft = { name: "", description: "", sort_order: "0", is_active: true };

export default function CategoriesPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-categories"], queryFn: () => api<Category[]>("/admin/categories") });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Category | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin-categories"] });
    qc.invalidateQueries({ queryKey: ["categories"] });
    qc.invalidateQueries({ queryKey: ["menu"] });
  };

  const save = useMutation({
    mutationFn: (d: Draft) => {
      const body = {
        name: d.name.trim(),
        description: d.description.trim() || null,
        sort_order: Number(d.sort_order),
        is_active: d.is_active,
      };
      return d.id
        ? api<Category>(`/admin/categories/${d.id}`, { method: "PATCH", body })
        : api<Category>("/admin/categories", { method: "POST", body });
    },
    onSuccess: (c) => {
      toast.success(`Category “${c.name}” saved`);
      setDraft(null);
      invalidate();
    },
    onError: (e) => {
      if (e instanceof ApiError && e.fields.length) setErrors(Object.fromEntries(e.fields.map((f) => [f.field, f.message])));
      else if (e instanceof ApiError && e.code === "CATEGORY_NAME_TAKEN") setErrors({ name: e.message });
      else setFormError(errorMessage(e));
    },
  });

  const del = useMutation({
    mutationFn: (id: string) => api<{ deleted: boolean; deactivated: boolean }>(`/admin/categories/${id}`, { method: "DELETE" }),
    onSuccess: (r) => {
      toast.success(r.deactivated ? "Category hidden (it has archived items with order history)" : "Category deleted");
      setToDelete(null);
      invalidate();
    },
    onError: (e) => {
      toast.error(errorMessage(e));
      setToDelete(null);
    },
  });

  const open = (d: Draft) => {
    setErrors({});
    setFormError(null);
    setDraft(d);
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    const errs: Record<string, string> = {};
    if (draft.name.trim().length < 2 || draft.name.trim().length > 60) errs.name = "Name must be 2–60 characters";
    if (!/^\d+$/.test(draft.sort_order) || Number(draft.sort_order) > 10000) errs.sort_order = "Use a whole number from 0 to 10000";
    setErrors(errs);
    if (!Object.keys(errs).length) save.mutate(draft);
  };

  return (
    <>
      <PageHeader
        eyebrow="Menu"
        title="Categories"
        description="Group dishes on the menu. Lower sort numbers appear first."
        actions={
          <Button onClick={() => open(EMPTY)}>
            <Plus /> New category
          </Button>
        }
      />
      {q.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !q.data!.length ? (
        <EmptyState icon={Tags} title="No categories yet" action={<Button onClick={() => open(EMPTY)}>Create one</Button>} />
      ) : (
        <div className="m-stagger grid gap-3 sm:grid-cols-2">
          {q.data!.map((c) => (
            <div key={c.id} className={`m-card flex items-start gap-4 rounded-xl p-6 ${c.is_active ? "bg-lavender" : "bg-muted opacity-70"}`}>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-lg">
                  {c.name}
                  {!c.is_active && <span className="rounded-full bg-white px-2 py-0.5 text-xs text-muted-foreground">Hidden</span>}
                </p>
                <p className="mt-1 text-sm text-ink-secondary">{c.description || "No description"}</p>
                <p className="mt-3 text-xs text-ink-secondary">
                  {c.item_count} items · sort {c.sort_order}
                </p>
              </div>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Edit ${c.name}`}
                  onClick={() =>
                    open({ id: c.id, name: c.name, description: c.description ?? "", sort_order: String(c.sort_order), is_active: c.is_active })
                  }
                >
                  <Pencil />
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label={`Delete ${c.name}`} onClick={() => setToDelete(c)}>
                  <Trash2 />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="rounded-xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-[480]">{draft?.id ? "Edit category" : "New category"}</DialogTitle>
          </DialogHeader>
          {draft && (
            <form onSubmit={submit} className="space-y-4" noValidate>
              <InlineError message={formError} />
              <div>
                <Label htmlFor="cat-name" className="mb-2">Name</Label>
                <Input id="cat-name" value={draft.name} maxLength={60} onChange={(e) => setDraft({ ...draft, name: e.target.value })} aria-invalid={!!errors.name} />
                <FieldError message={errors.name} />
              </div>
              <div>
                <Label htmlFor="cat-desc" className="mb-2">Description</Label>
                <Textarea id="cat-desc" rows={2} maxLength={300} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="cat-sort" className="mb-2">Sort order</Label>
                  <Input id="cat-sort" inputMode="numeric" value={draft.sort_order} onChange={(e) => setDraft({ ...draft, sort_order: e.target.value })} aria-invalid={!!errors.sort_order} />
                  <FieldError message={errors.sort_order} />
                </div>
                <label className="mt-7 flex h-11 items-center justify-between rounded-xl bg-muted px-4 text-sm">
                  Visible
                  <Switch checked={draft.is_active} onCheckedChange={(v) => setDraft({ ...draft, is_active: v })} />
                </label>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDraft(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={save.isPending}>
                  {save.isPending && <Spinner />} Save
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={`Delete “${toDelete?.name}”?`}
        description={
          toDelete?.item_count
            ? `This category still has ${toDelete.item_count} item(s). Move or delete them first — the server will refuse otherwise.`
            : "This category will be removed."
        }
        confirmLabel="Delete"
        destructive
        loading={del.isPending}
        onConfirm={() => toDelete && del.mutate(toDelete.id)}
      />
    </>
  );
}
