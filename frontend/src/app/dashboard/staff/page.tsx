"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState, ErrorState, FieldError, InlineError, PageHeader, Spinner } from "@/components/common";
import { RequireRole } from "@/components/require-role";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { api, ApiError, errorMessage } from "@/lib/api";
import { useMe } from "@/lib/hooks";
import type { User } from "@/lib/types";

const EMPTY = { full_name: "", email: "", password: "", phone: "" };

function StaffContent() {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const q = useQuery({ queryKey: ["admin-staff"], queryFn: () => api<User[]>("/admin/staff") });
  const [draft, setDraft] = useState<typeof EMPTY | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: (d: typeof EMPTY) => api<User>("/admin/staff", { method: "POST", body: { ...d, phone: d.phone || null } }),
    onSuccess: (u) => {
      toast.success(`${u.full_name} can now log in as staff`);
      setDraft(null);
      qc.invalidateQueries({ queryKey: ["admin-staff"] });
    },
    onError: (e) => {
      if (e instanceof ApiError && e.fields.length) setErrors(Object.fromEntries(e.fields.map((f) => [f.field, f.message])));
      else if (e instanceof ApiError && e.code === "EMAIL_ALREADY_REGISTERED") setErrors({ email: e.message });
      else setFormError(errorMessage(e));
    },
  });
  const toggle = useMutation({
    mutationFn: (v: { id: string; is_active: boolean }) => api<User>(`/admin/staff/${v.id}`, { method: "PATCH", body: { is_active: v.is_active } }),
    onSuccess: (u) => {
      toast.success(`${u.full_name} ${u.is_active ? "reactivated" : "deactivated"}`);
      qc.invalidateQueries({ queryKey: ["admin-staff"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    const errs: Record<string, string> = {};
    if (draft.full_name.trim().length < 2) errs.full_name = "Enter a name";
    if (!/^\S+@\S+\.\S+$/.test(draft.email)) errs.email = "Enter a valid email";
    if (draft.password.length < 8 || !/[A-Za-z]/.test(draft.password) || !/\d/.test(draft.password))
      errs.password = "At least 8 characters with a letter and a digit";
    if (draft.phone && !/^\+?\d{10,15}$/.test(draft.phone)) errs.phone = "10–15 digits";
    setErrors(errs);
    setFormError(null);
    if (!Object.keys(errs).length) create.mutate(draft);
  };

  return (
    <>
      <PageHeader
        eyebrow="Team"
        title="Staff accounts"
        description="Staff can manage the order queue. Only admins can change the menu and settings."
        actions={
          <Button onClick={() => { setErrors({}); setFormError(null); setDraft(EMPTY); }}>
            <Plus /> Add staff
          </Button>
        }
      />
      {q.isLoading ? (
        <Skeleton className="h-48 rounded-xl" />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !q.data!.length ? (
        <EmptyState icon={Users} title="No staff yet" />
      ) : (
        <div className="overflow-hidden rounded-xl bg-white ring-1 ring-border">
          <ul className="m-stagger divide-y divide-border">
            {q.data!.map((u) => (
              <li key={u.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
                <div className="flex flex-1 items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-full bg-lavender text-sm text-ink-secondary">
                    {u.full_name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
                  </span>
                  <div>
                    <p className="text-[15px]">
                      {u.full_name} {u.id === me?.id && <span className="text-muted-foreground">(you)</span>}
                    </p>
                    <p className="text-sm text-muted-foreground">{u.email}</p>
                  </div>
                </div>
                <span className="w-fit rounded-full bg-primary/10 px-3 py-1 text-xs text-ink">{u.role === "ADMIN" ? "Admin" : "Staff"}</span>
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  {u.is_active ? "Active" : "Disabled"}
                  <Switch
                    checked={u.is_active}
                    disabled={u.id === me?.id || toggle.isPending}
                    onCheckedChange={(c) => toggle.mutate({ id: u.id, is_active: c })}
                    aria-label={`${u.full_name} active`}
                  />
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="rounded-xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-[480]">Add a staff member</DialogTitle>
          </DialogHeader>
          {draft && (
            <form onSubmit={submit} className="space-y-4" noValidate>
              <InlineError message={formError} />
              {(
                [
                  ["full_name", "Full name", "text"],
                  ["email", "Email", "email"],
                  ["phone", "Phone (optional)", "tel"],
                  ["password", "Temporary password", "password"],
                ] as const
              ).map(([key, label, type]) => (
                <div key={key}>
                  <Label htmlFor={key} className="mb-2">{label}</Label>
                  <Input id={key} type={type} value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} aria-invalid={!!errors[key]} />
                  <FieldError message={errors[key]} />
                </div>
              ))}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDraft(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={create.isPending}>
                  {create.isPending && <Spinner />} Create account
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function StaffPage() {
  return (
    <RequireRole roles={["ADMIN"]}>
      <StaffContent />
    </RequireRole>
  );
}
