"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Bike, ShoppingBag, Store } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { EmptyState, ErrorState, FieldError, FoodImage, InlineError, PageHeader, PageLoader, Spinner } from "@/components/common";
import { AnimatedMoney, CheckoutSteps } from "@/components/motion";
import { RequireRole } from "@/components/require-role";
import { blockingMessage } from "@/components/store/cart-sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError, newIdempotencyKey } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { qk, useCart } from "@/lib/hooks";
import type { Order, OrderType } from "@/lib/types";

function CheckoutContent() {
  const router = useRouter();
  const qc = useQueryClient();
  const cart = useCart(true);
  const [orderType, setOrderType] = useState<OrderType>("PICKUP");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  // One idempotency key per checkout attempt: a double-click or network retry re-sends the same key,
  // so the backend returns the same order instead of creating a duplicate.
  const keyRef = useRef<string>(newIdempotencyKey());

  const placeOrder = useMutation({
    mutationFn: () =>
      api<Order>("/orders", {
        method: "POST",
        idempotencyKey: keyRef.current,
        body: {
          order_type: orderType,
          delivery_address: orderType === "DELIVERY" ? address.trim() : null,
          customer_notes: notes.trim() || null,
        },
      }),
    onSuccess: (order) => {
      qc.setQueryData(qk.order(order.id), order);
      qc.invalidateQueries({ queryKey: qk.cart });
      router.push(`/orders/${order.id}/pay`);
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code !== "NETWORK_ERROR") keyRef.current = newIdempotencyKey();
      if (e instanceof ApiError && e.fields.length) {
        setFieldErrors(Object.fromEntries(e.fields.map((f) => [f.field === "request" ? "delivery_address" : f.field, f.message])));
      } else {
        setError(e instanceof Error ? e.message : "Could not place the order.");
      }
      if (e instanceof ApiError && ["ITEM_UNAVAILABLE", "CART_EMPTY", "RESTAURANT_CLOSED"].includes(e.code)) {
        qc.invalidateQueries({ queryKey: qk.cart });
        qc.invalidateQueries({ queryKey: qk.restaurant });
      }
    },
  });

  if (cart.isLoading) return <PageLoader />;
  if (cart.isError) return <ErrorState error={cart.error} onRetry={() => cart.refetch()} />;
  const c = cart.data!;
  if (!c.items.length && !placeOrder.isPending && !placeOrder.isSuccess) {
    return (
      <EmptyState
        icon={ShoppingBag}
        title="Nothing to check out"
        description="Your cart is empty."
        action={
          <Button asChild>
            <Link href="/menu">Browse the menu</Link>
          </Button>
        }
      />
    );
  }

  const total = orderType === "DELIVERY" ? c.total_delivery : c.total_pickup;
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const errs: Record<string, string> = {};
    if (orderType === "DELIVERY" && address.trim().length < 10) errs.delivery_address = "Enter a delivery address of at least 10 characters.";
    if (notes.length > 300) errs.customer_notes = "Notes can be at most 300 characters.";
    setFieldErrors(errs);
    if (Object.keys(errs).length === 0) placeOrder.mutate();
  };

  return (
    <form onSubmit={submit} className="grid gap-8 lg:grid-cols-[1fr_400px]" noValidate>
      <div className="space-y-6">
        <section className="rounded-xl bg-white p-6 ring-1 ring-border">
          <h2 className="text-lg">How would you like your order?</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Order type">
            {(
              [
                ["PICKUP", Store, "Pickup", "Collect from the restaurant", "Free"],
                ["DELIVERY", Bike, "Delivery", "We bring it to your door", `+${formatMoney(c.delivery_fee_if_delivery, c.currency)}`],
              ] as const
            ).map(([value, Icon, label, hint, fee]) => (
              <button
                type="button"
                role="radio"
                aria-checked={orderType === value}
                key={value}
                onClick={() => setOrderType(value)}
                className={`flex items-start gap-3 rounded-xl p-4 text-left ring-1 transition-[background-color,box-shadow,transform] duration-200 active:scale-[0.99] ${
                  orderType === value ? "bg-primary/6 ring-2 ring-primary" : "bg-white ring-border hover:bg-muted"
                }`}
              >
                <span key={String(orderType === value)} className={`flex size-10 items-center justify-center rounded-full ${orderType === value ? "m-pop bg-primary text-white" : "bg-muted text-ink-secondary"}`}>
                  <Icon className="size-4" />
                </span>
                <span className="flex-1">
                  <span className="flex justify-between">
                    <span>{label}</span>
                    <span className="text-sm text-muted-foreground">{fee}</span>
                  </span>
                  <span className="text-sm text-muted-foreground">{hint}</span>
                </span>
              </button>
            ))}
          </div>

          {orderType === "DELIVERY" && (
            <div className="m-fade-up mt-5">
              <Label htmlFor="address" className="mb-2">Delivery address</Label>
              <Textarea
                id="address"
                rows={3}
                maxLength={300}
                placeholder="Flat / house no., street, area, city, PIN"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                aria-invalid={!!fieldErrors.delivery_address}
              />
              <FieldError message={fieldErrors.delivery_address} />
            </div>
          )}
          <div className="mt-5">
            <Label htmlFor="notes" className="mb-2">
              Notes for the kitchen <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="notes"
              rows={2}
              maxLength={300}
              placeholder="Allergies, spice preference, cutlery…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              aria-invalid={!!fieldErrors.customer_notes}
            />
            <FieldError message={fieldErrors.customer_notes} />
          </div>
        </section>
      </div>

      <aside className="h-fit space-y-4 rounded-xl bg-white p-6 ring-1 ring-border lg:sticky lg:top-24">
        <h2 className="text-lg">Your order</h2>
        <ul className="space-y-3">
          {c.items.map((l) => (
            <li key={l.menu_item_id} className="flex items-center gap-3 text-sm">
              <FoodImage src={l.image_url} alt={l.name} className="size-11 rounded-lg" />
              <span className="flex-1">
                {l.quantity}× {l.name}
                {!l.is_available && <span className="block text-xs text-destructive">No longer available</span>}
              </span>
              <span className="tabular-nums">{formatMoney(l.line_total, c.currency)}</span>
            </li>
          ))}
        </ul>
        <Separator />
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <dt>Subtotal</dt>
            <dd><AnimatedMoney value={c.subtotal} currency={c.currency} /></dd>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <dt>GST ({Math.round(Number(c.tax_rate) * 100)}%)</dt>
            <dd><AnimatedMoney value={c.tax_amount} currency={c.currency} /></dd>
          </div>
          {orderType === "DELIVERY" && (
            <div className="m-fade-up flex justify-between text-muted-foreground">
              <dt>Delivery</dt>
              <dd className="tabular-nums">{formatMoney(c.delivery_fee_if_delivery, c.currency)}</dd>
            </div>
          )}
          <div className="flex justify-between pt-2 text-lg text-ink">
            <dt>Total</dt>
            <dd><AnimatedMoney value={total} currency={c.currency} /></dd>
          </div>
        </dl>
        <InlineError message={error ?? blockingMessage(c)} />
        <Button type="submit" size="lg" className="w-full" disabled={!c.can_checkout || placeOrder.isPending || placeOrder.isSuccess}>
          {(placeOrder.isPending || placeOrder.isSuccess) && <Spinner />}
          Place order & pay <AnimatedMoney value={total} currency={c.currency} />
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          Your order is reserved for 15 minutes while you complete payment.
        </p>
      </aside>
    </form>
  );
}

export default function CheckoutPage() {
  return (
    <div className="container-page py-12">
      <CheckoutSteps current={1} />
      <PageHeader eyebrow="Checkout" title="Review and place your order" />
      <RequireRole roles={["CUSTOMER"]}>
        <CheckoutContent />
      </RequireRole>
    </div>
  );
}
