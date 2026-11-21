"use client";

import { Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { ConfirmDialog, EmptyState, FoodImage, InlineError, Spinner, VegMark } from "@/components/common";
import { AnimatedMoney, prefersReducedMotion } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { formatMoney } from "@/lib/format";
import { useCart, useCartMutations } from "@/lib/hooks";
import type { Cart, CartLine } from "@/lib/types";

export function blockingMessage(cart: Cart): string | null {
  if (cart.blocking_reasons.includes("RESTAURANT_CLOSED"))
    return "The restaurant is closed right now. You can keep your cart and check out once we reopen.";
  if (cart.blocking_reasons.includes("ITEM_UNAVAILABLE"))
    return "Some items are no longer available. Remove them to continue.";
  return null;
}

export function QuantityStepper({ line, compact, onRemove }: { line: CartLine; compact?: boolean; onRemove?: () => void }) {
  const { setQty, remove } = useCartMutations();
  const busy = setQty.isPending || remove.isPending;
  const dec = () =>
    line.quantity <= 1 ? (onRemove ? onRemove() : remove.mutate(line.menu_item_id)) : setQty.mutate({ menu_item_id: line.menu_item_id, quantity: line.quantity - 1 });
  return (
    <div className="inline-flex items-center rounded-full bg-[rgba(112,115,147,0.1)] p-0.5">
      <Button size={compact ? "icon-xs" : "icon-sm"} variant="ghost" onClick={dec} disabled={busy} aria-label={`Decrease ${line.name}`}>
        {line.quantity <= 1 ? <Trash2 /> : <Minus />}
      </Button>
      <span className={`w-7 text-center text-sm tabular-nums transition-opacity duration-150 ${busy ? "opacity-50" : ""}`} aria-live="polite">
        <span key={line.quantity} className="m-pop inline-block">
          {line.quantity}
        </span>
      </span>
      <Button
        size={compact ? "icon-xs" : "icon-sm"}
        variant="ghost"
        onClick={() => setQty.mutate({ menu_item_id: line.menu_item_id, quantity: line.quantity + 1 })}
        disabled={busy || line.quantity >= 50 || !line.is_available}
        aria-label={`Increase ${line.name}`}
      >
        <Plus />
      </Button>
    </div>
  );
}

export function CartLines({ cart, compact }: { cart: Cart; compact?: boolean }) {
  const { remove } = useCartMutations();
  const [leaving, setLeaving] = useState<ReadonlySet<string>>(new Set());
  const removeLine = (id: string) => {
    if (leaving.has(id)) return;
    const settle = () =>
      setLeaving((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    if (prefersReducedMotion()) {
      remove.mutate(id);
      return;
    }
    // Plays the collapse, then removes. If the request fails, the line comes back.
    setLeaving((prev) => new Set(prev).add(id));
    setTimeout(() => remove.mutate(id, { onSettled: settle }), 180);
  };
  return (
    <ul className="divide-y divide-border">
      {cart.items.map((line) => (
        <li key={line.menu_item_id} className={`flex gap-3 py-4 ${leaving.has(line.menu_item_id) ? "m-leave" : "m-fade-up"}`}>
          <FoodImage src={line.image_url} alt={line.name} className="size-16 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <VegMark veg={line.is_vegetarian} />
                <p className="truncate text-[15px]">{line.name}</p>
              </div>
              <p className="shrink-0 text-[15px] tabular-nums">{formatMoney(line.line_total, cart.currency)}</p>
            </div>
            <p className="mt-0.5 text-[13px] text-muted-foreground">{formatMoney(line.unit_price, cart.currency)} each</p>
            {!line.is_available && <p className="mt-1 text-[13px] text-destructive">No longer available</p>}
            <div className="mt-2 flex items-center justify-between">
              <QuantityStepper line={line} compact={compact} onRemove={() => removeLine(line.menu_item_id)} />
              <Button size="xs" variant="ghost" onClick={() => removeLine(line.menu_item_id)} className="text-muted-foreground">
                Remove
              </Button>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function CartSheet({ enabled }: { enabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const { data: cart, isLoading } = useCart(enabled);
  const { clear } = useCartMutations();
  const count = cart?.item_count ?? 0;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="glass" size="default" className="relative px-4" aria-label={`Cart, ${count} items`}>
          <ShoppingBag />
          <span className="hidden sm:inline">Cart</span>
          {count > 0 && (
            <span key={count} className="m-pop flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-white tabular-nums">
              {count}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="flex w-full flex-col gap-0 bg-canvas p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border px-6 py-5">
          <SheetTitle className="text-xl font-[480]">Your cart</SheetTitle>
        </SheetHeader>
        {isLoading ? (
          <div className="flex flex-1 items-center justify-center">
            <Spinner className="size-6 text-primary" />
          </div>
        ) : !cart || cart.items.length === 0 ? (
          <div className="flex-1 p-6">
            <EmptyState
              icon={ShoppingBag}
              title="Your cart is empty"
              description="Add a few dishes from the menu to get started."
              action={
                <Button asChild onClick={() => setOpen(false)}>
                  <Link href="/menu">Browse the menu</Link>
                </Button>
              }
            />
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-6">
              <CartLines cart={cart} compact />
              <Button variant="ghost" size="xs" className="mb-4 text-muted-foreground" onClick={() => setConfirmClear(true)}>
                Clear cart
              </Button>
            </div>
            <div className="space-y-3 border-t border-border bg-white px-6 py-5">
              <InlineError message={blockingMessage(cart)} />
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Subtotal</span>
                <AnimatedMoney value={cart.subtotal} currency={cart.currency} />
              </div>
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>GST ({Math.round(Number(cart.tax_rate) * 100)}%)</span>
                <AnimatedMoney value={cart.tax_amount} currency={cart.currency} />
              </div>
              <Separator />
              <div className="flex justify-between text-base">
                <span>Total (pickup)</span>
                <AnimatedMoney value={cart.total_pickup} currency={cart.currency} />
              </div>
              <p className="text-xs text-muted-foreground">
                Delivery adds {formatMoney(cart.delivery_fee_if_delivery, cart.currency)}. Final amount is confirmed at checkout.
              </p>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <Button variant="outline" asChild onClick={() => setOpen(false)}>
                  <Link href="/cart">View cart</Link>
                </Button>
                <Button asChild disabled={!cart.can_checkout} onClick={() => setOpen(false)}>
                  {cart.can_checkout ? <Link href="/checkout">Checkout</Link> : <span aria-disabled>Checkout</span>}
                </Button>
              </div>
            </div>
          </>
        )}
        <ConfirmDialog
          open={confirmClear}
          onOpenChange={setConfirmClear}
          title="Clear your cart?"
          description="All items will be removed from your cart."
          confirmLabel="Clear cart"
          destructive
          loading={clear.isPending}
          onConfirm={() => clear.mutate(undefined, { onSuccess: () => setConfirmClear(false) })}
        />
      </SheetContent>
    </Sheet>
  );
}
