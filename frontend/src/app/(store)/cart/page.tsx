"use client";

import { ShoppingBag } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { ConfirmDialog, EmptyState, ErrorState, InlineError, PageHeader, PageLoader } from "@/components/common";
import { AnimatedMoney, CheckoutSteps } from "@/components/motion";
import { RequireRole } from "@/components/require-role";
import { blockingMessage, CartLines } from "@/components/store/cart-sheet";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { formatMoney } from "@/lib/format";
import { useCart, useCartMutations } from "@/lib/hooks";

function CartContent() {
  const cart = useCart(true);
  const { clear } = useCartMutations();
  const [confirm, setConfirm] = useState(false);

  if (cart.isLoading) return <PageLoader />;
  if (cart.isError) return <ErrorState error={cart.error} onRetry={() => cart.refetch()} />;
  const c = cart.data!;
  if (!c.items.length) {
    return (
      <EmptyState
        icon={ShoppingBag}
        title="Your cart is empty"
        description="Browse the menu and add something delicious."
        action={
          <Button asChild>
            <Link href="/menu">Browse the menu</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
      <div className="rounded-xl bg-white px-6 py-2 ring-1 ring-border">
        <CartLines cart={c} />
      </div>
      <aside className="h-fit space-y-4 rounded-xl bg-white p-6 ring-1 ring-border lg:sticky lg:top-24">
        <h2 className="text-lg">Summary</h2>
        <InlineError message={blockingMessage(c)} />
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <dt>Subtotal ({c.item_count} items)</dt>
            <dd><AnimatedMoney value={c.subtotal} currency={c.currency} /></dd>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <dt>GST ({Math.round(Number(c.tax_rate) * 100)}%)</dt>
            <dd><AnimatedMoney value={c.tax_amount} currency={c.currency} /></dd>
          </div>
          <Separator className="my-3" />
          <div className="flex justify-between text-base text-ink">
            <dt>Pickup total</dt>
            <dd><AnimatedMoney value={c.total_pickup} currency={c.currency} /></dd>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <dt>Delivery total (+{formatMoney(c.delivery_fee_if_delivery, c.currency)})</dt>
            <dd><AnimatedMoney value={c.total_delivery} currency={c.currency} /></dd>
          </div>
        </dl>
        {c.can_checkout ? (
          <Button size="lg" className="w-full" asChild>
            <Link href="/checkout">Continue to checkout</Link>
          </Button>
        ) : (
          <Button size="lg" className="w-full" disabled>
            Continue to checkout
          </Button>
        )}
        <div className="flex justify-between">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/menu">Add more items</Link>
          </Button>
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setConfirm(true)}>
            Clear cart
          </Button>
        </div>
      </aside>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Clear your cart?"
        description="All items will be removed."
        confirmLabel="Clear cart"
        destructive
        loading={clear.isPending}
        onConfirm={() => clear.mutate(undefined, { onSuccess: () => setConfirm(false) })}
      />
    </div>
  );
}

export default function CartPage() {
  return (
    <div className="container-page py-12">
      <CheckoutSteps current={0} />
      <PageHeader eyebrow="Your order" title="Cart" description="Prices and totals are always calculated by the kitchen system." />
      <RequireRole roles={["CUSTOMER"]}>
        <CartContent />
      </RequireRole>
    </div>
  );
}
