"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MoonStar, Sun } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog, ErrorState, FieldError, InlineError, PageHeader, PageLoader, Spinner } from "@/components/common";
import { RequireRole } from "@/components/require-role";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError, errorMessage } from "@/lib/api";
import { qk } from "@/lib/hooks";
import type { Restaurant } from "@/lib/types";

type Form = {
  name: string;
  tagline: string;
  description: string;
  address: string;
  phone: string;
  email: string;
  tax_percent: string;
  delivery_fee: string;
  pending_payment_ttl_minutes: string;
};

function toForm(r: Restaurant): Form {
  return {
    name: r.name,
    tagline: r.tagline ?? "",
    description: r.description ?? "",
    address: r.address ?? "",
    phone: r.phone ?? "",
    email: r.email ?? "",
    tax_percent: String(+(Number(r.tax_rate) * 100).toFixed(2)),
    delivery_fee: String(Number(r.delivery_fee)),
    pending_payment_ttl_minutes: String(r.pending_payment_ttl_minutes),
  };
}

function SettingsContent() {
  const q = useQuery({ queryKey: ["admin-restaurant"], queryFn: () => api<Restaurant>("/admin/restaurant") });
  if (q.isLoading) return <PageLoader />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  return <SettingsForm r={q.data!} />;
}

function SettingsForm({ r }: { r: Restaurant }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<Form>(() => toForm(r));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);

  const onSaved = (r: Restaurant) => {
    qc.setQueryData(["admin-restaurant"], r);
    qc.invalidateQueries({ queryKey: qk.restaurant });
    qc.invalidateQueries({ queryKey: ["cart"] });
  };

  const setOpen = useMutation({
    mutationFn: (is_open: boolean) => api<Restaurant>("/admin/restaurant/status", { method: "PUT", body: { is_open } }),
    onSuccess: (r) => {
      onSaved(r);
      setConfirmClose(false);
      toast.success(r.is_open ? "Restaurant is open — customers can order" : "Restaurant closed — new orders are paused");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const save = useMutation({
    mutationFn: (f: Form) =>
      api<Restaurant>("/admin/restaurant", {
        method: "PATCH",
        body: {
          name: f.name.trim(),
          tagline: f.tagline.trim() || null,
          description: f.description.trim() || null,
          address: f.address.trim() || null,
          phone: f.phone.trim() || null,
          email: f.email.trim() || null,
          tax_rate: (Number(f.tax_percent) / 100).toFixed(4),
          delivery_fee: Number(f.delivery_fee).toFixed(2),
          pending_payment_ttl_minutes: Number(f.pending_payment_ttl_minutes),
        },
      }),
    onSuccess: (r) => {
      onSaved(r);
      setForm(toForm(r));
      toast.success("Settings saved");
    },
    onError: (e) => {
      if (e instanceof ApiError && e.fields.length)
        setErrors(Object.fromEntries(e.fields.map((f) => [f.field === "tax_rate" ? "tax_percent" : f.field, f.message])));
      else setFormError(errorMessage(e));
    },
  });

  const f = form;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (f.name.trim().length < 2) errs.name = "Enter the restaurant name";
    const tax = Number(f.tax_percent);
    if (f.tax_percent === "" || isNaN(tax) || tax < 0 || tax > 30) errs.tax_percent = "Tax must be between 0 and 30%";
    const fee = Number(f.delivery_fee);
    if (f.delivery_fee === "" || isNaN(fee) || fee < 0 || fee > 1000) errs.delivery_fee = "Fee must be between ₹0 and ₹1000";
    const ttl = Number(f.pending_payment_ttl_minutes);
    if (!Number.isInteger(ttl) || ttl < 5 || ttl > 120) errs.pending_payment_ttl_minutes = "Between 5 and 120 minutes";
    if (f.email && !/^\S+@\S+\.\S+$/.test(f.email)) errs.email = "Enter a valid email";
    setErrors(errs);
    setFormError(null);
    if (!Object.keys(errs).length) save.mutate(f);
  };
  const field = (key: keyof Form, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <div>
      <Label htmlFor={key} className="mb-2">{label}</Label>
      <Input id={key} value={f[key]} onChange={(e) => setForm({ ...f, [key]: e.target.value })} aria-invalid={!!errors[key]} {...props} />
      <FieldError message={errors[key]} />
    </div>
  );

  return (
    <>
      <PageHeader eyebrow="Restaurant" title="Settings" description="Operating status, restaurant details and pricing." />

      <section className={`mb-6 flex flex-col gap-4 rounded-xl p-6 transition-colors duration-300 sm:flex-row sm:items-center ${r.is_open ? "bg-night text-on-dark" : "bg-lavender"}`}>
        <span key={String(r.is_open)} className={`m-pop flex size-12 items-center justify-center rounded-full ${r.is_open ? "bg-primary text-white" : "bg-white text-ink-secondary"}`}>
          {r.is_open ? <Sun className="size-5" /> : <MoonStar className="size-5" />}
        </span>
        <div className="flex-1">
          <p className="text-lg">{r.is_open ? "The restaurant is open" : "The restaurant is closed"}</p>
          <p className={`text-sm ${r.is_open ? "text-fog" : "text-ink-secondary"}`}>
            {r.is_open
              ? "Customers can check out and pay. Closing pauses new orders immediately."
              : "Customers can browse and fill carts, but checkout and payment are blocked."}
          </p>
        </div>
        {r.is_open ? (
          <Button variant="glass" onClick={() => setConfirmClose(true)}>
            Close restaurant
          </Button>
        ) : (
          <Button onClick={() => setOpen.mutate(true)} disabled={setOpen.isPending}>
            {setOpen.isPending && <Spinner />} Open restaurant
          </Button>
        )}
      </section>

      <form onSubmit={submit} className="m-stagger grid gap-6 lg:grid-cols-2" noValidate>
        <section className="space-y-4 rounded-xl bg-white p-6 ring-1 ring-border">
          <h2 className="text-lg">Restaurant details</h2>
          {field("name", "Name")}
          {field("tagline", "Tagline")}
          <div>
            <Label htmlFor="description" className="mb-2">Description</Label>
            <Textarea id="description" rows={4} maxLength={2000} value={f.description} onChange={(e) => setForm({ ...f, description: e.target.value })} />
          </div>
          {field("address", "Address")}
          <div className="grid gap-4 sm:grid-cols-2">
            {field("phone", "Phone")}
            {field("email", "Email", { type: "email" })}
          </div>
        </section>
        <section className="h-fit space-y-4 rounded-xl bg-white p-6 ring-1 ring-border">
          <h2 className="text-lg">Pricing &amp; ordering</h2>
          <p className="text-sm text-muted-foreground">Changes apply to new orders only. Existing orders keep their original amounts.</p>
          {field("tax_percent", "GST rate (%)", { inputMode: "decimal" })}
          {field("delivery_fee", "Delivery fee (₹)", { inputMode: "decimal" })}
          {field("pending_payment_ttl_minutes", "Payment window (minutes)", { inputMode: "numeric" })}
          <InlineError message={formError} />
          <Button type="submit" className="w-full" disabled={save.isPending}>
            {save.isPending && <Spinner />} Save settings
          </Button>
        </section>
      </form>

      <ConfirmDialog
        open={confirmClose}
        onOpenChange={setConfirmClose}
        title="Close the restaurant?"
        description="Customers won't be able to place or pay for orders until you reopen. Orders already in the kitchen are unaffected."
        confirmLabel="Close restaurant"
        destructive
        loading={setOpen.isPending}
        onConfirm={() => setOpen.mutate(false)}
      />
    </>
  );
}

export default function SettingsPage() {
  return (
    <RequireRole roles={["ADMIN"]}>
      <SettingsContent />
    </RequireRole>
  );
}
