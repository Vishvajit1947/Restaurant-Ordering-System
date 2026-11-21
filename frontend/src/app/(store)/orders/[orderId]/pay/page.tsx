"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CreditCard, Lock, RotateCcw, Smartphone, XCircle } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog, ErrorState, FieldError, InlineError, OrderStatusBadge, PageLoader, Spinner } from "@/components/common";
import { OrderSummaryCard, PaymentAttempts } from "@/components/orders";
import { CheckoutSteps, scrollToTop, SlidingTabs } from "@/components/motion";
import { RequireRole } from "@/components/require-role";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { api, ApiError, newIdempotencyKey } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { qk } from "@/lib/hooks";
import type { Order, PaymentMethod, PaymentResult } from "@/lib/types";

const TEST_CARDS = [
  ["4242 4242 4242 4242", "Succeeds"],
  ["4000 0000 0000 0002", "Declined"],
  ["4000 0000 0000 0069", "Expired card"],
  ["4000 0000 0000 9995", "Insufficient funds"],
];

function useCountdown(iso: string | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!iso) return null;
  const ms = Math.max(0, new Date(iso).getTime() - now);
  return { ms, label: `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}` };
}

function luhn(num: string) {
  let sum = 0;
  [...num].reverse().forEach((ch, i) => {
    let d = Number(ch);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  });
  return sum % 10 === 0;
}

function PayContent() {
  const { orderId } = useParams<{ orderId: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const order = useQuery({ queryKey: qk.order(orderId), queryFn: () => api<Order>(`/orders/${orderId}`) });
  const countdown = useCountdown(order.data?.payment_expires_at);

  const [method, setMethod] = useState<PaymentMethod>("CARD");
  const [card, setCard] = useState({ number: "", expiry: "", cvv: "", holder_name: "" });
  const [upi, setUpi] = useState("");
  const [simulateFailure, setSimulateFailure] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const keyRef = useRef<string | null>(null);

  const pay = useMutation({
    mutationFn: () => {
      // Reuse the key only when retrying after a network failure for the same attempt.
      keyRef.current ??= newIdempotencyKey();
      return api<PaymentResult>(`/orders/${orderId}/payments`, {
        method: "POST",
        idempotencyKey: keyRef.current,
        body: {
          method,
          card: method === "CARD" ? { ...card, number: card.number.replace(/\s/g, "") } : undefined,
          upi_id: method === "UPI" ? upi.trim() : undefined,
          simulate: simulateFailure ? "FAILURE" : undefined,
        },
      });
    },
    onSuccess: (res) => {
      keyRef.current = null;
      qc.setQueryData(qk.order(orderId), res.order);
      qc.invalidateQueries({ queryKey: ["orders"] });
      if (res.payment.status === "SUCCESS") {
        router.push(`/orders/${orderId}/confirmation`);
      } else {
        setFailure(res.payment.failure_reason ?? "Payment failed.");
        scrollToTop();
      }
    },
    onError: (e) => {
      if (!(e instanceof ApiError && e.code === "NETWORK_ERROR")) keyRef.current = null;
      if (e instanceof ApiError && e.fields.length) {
        setErrors(Object.fromEntries(e.fields.map((f) => [f.field.replace(/^card\./, ""), f.message])));
      } else {
        setApiError(e instanceof Error ? e.message : "Payment could not be processed.");
        scrollToTop();
      }
      qc.invalidateQueries({ queryKey: qk.order(orderId) });
    },
  });

  const cancel = useMutation({
    mutationFn: () => api<{ order: Order; restored: string[]; skipped: string[] }>(`/orders/${orderId}/cancel`, { method: "POST", body: { restore_to_cart: true } }),
    onSuccess: (res) => {
      qc.setQueryData(qk.order(orderId), res.order);
      qc.invalidateQueries({ queryKey: qk.cart });
      toast.success(
        res.skipped.length ? `Order cancelled. ${res.skipped.join(", ")} could not be restored.` : "Order cancelled. Items are back in your cart.",
      );
      router.push("/cart");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not cancel"),
  });

  if (order.isLoading) return <PageLoader />;
  if (order.isError) return <ErrorState error={order.error} onRetry={() => order.refetch()} />;
  const o = order.data!;

  if (o.status !== "PENDING_PAYMENT") {
    return (
      <div className="mx-auto max-w-lg rounded-xl bg-white p-8 text-center ring-1 ring-border">
        <OrderStatusBadge status={o.status} />
        <h2 className="type-h2 mt-4">{o.status === "CANCELLED" ? "This order was cancelled" : "This order is already paid"}</h2>
        <p className="mt-2 text-muted-foreground">{o.cancelled_reason ?? `Order ${o.order_number}`}</p>
        <Button className="mt-6" asChild>
          <Link href={o.status === "CANCELLED" ? "/menu" : `/orders/${o.id}`}>{o.status === "CANCELLED" ? "Back to menu" : "Track order"}</Link>
        </Button>
      </div>
    );
  }

  const expired = countdown?.ms === 0;
  const validate = () => {
    const errs: Record<string, string> = {};
    if (method === "CARD") {
      const digits = card.number.replace(/\s/g, "");
      if (!/^\d{12,19}$/.test(digits) || !luhn(digits)) errs.number = "Enter a valid card number";
      if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(card.expiry)) errs.expiry = "Use MM/YY";
      if (!/^\d{3,4}$/.test(card.cvv)) errs.cvv = "3–4 digits";
      if (card.holder_name.trim().length < 2) errs.holder_name = "Enter the name on the card";
    } else if (!/^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/.test(upi.trim())) {
      errs.upi_id = "Enter a UPI ID like name@bank";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setFailure(null);
    setApiError(null);
    if (validate()) pay.mutate();
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_400px]">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-lavender px-5 py-4">
          <p className="text-sm text-ink-secondary">
            Order <span className="text-ink">{o.order_number}</span> is reserved for you.
          </p>
          <p className={`text-sm tabular-nums ${expired ? "text-destructive" : "text-ink"}`}>
            {expired ? "Payment window expired" : `Time left ${countdown?.label}`}
          </p>
        </div>

        {failure && (
          <div key={o.payments.length} className="m-shake flex items-start gap-3 rounded-xl bg-destructive/8 p-5" role="alert">
            <XCircle className="mt-0.5 size-5 shrink-0 text-destructive" />
            <div className="flex-1">
              <p className="text-ink">Payment failed</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {failure}. Your order is still saved — no new order is created when you retry.
              </p>
            </div>
          </div>
        )}

        <form onSubmit={submit} className="rounded-xl bg-white p-6 ring-1 ring-border" noValidate>
          <SlidingTabs
            label="Payment method"
            value={method}
            onChange={(m) => {
              setMethod(m);
              setErrors({});
            }}
            items={[
              { value: "CARD", label: "Card", icon: CreditCard },
              { value: "UPI", label: "UPI", icon: Smartphone },
            ]}
          />

          {method === "CARD" ? (
            <div key="card" className="m-fade-up mt-6 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor="cc-number" className="mb-2">Card number</Label>
                <Input
                  id="cc-number"
                  inputMode="numeric"
                  autoComplete="cc-number"
                  placeholder="4242 4242 4242 4242"
                  value={card.number}
                  onChange={(e) =>
                    setCard((c) => ({ ...c, number: e.target.value.replace(/[^\d]/g, "").slice(0, 19).replace(/(\d{4})(?=\d)/g, "$1 ") }))
                  }
                  aria-invalid={!!errors.number}
                />
                <FieldError message={errors.number} />
              </div>
              <div>
                <Label htmlFor="cc-exp" className="mb-2">Expiry</Label>
                <Input
                  id="cc-exp"
                  placeholder="MM/YY"
                  autoComplete="cc-exp"
                  value={card.expiry}
                  onChange={(e) => {
                    const d = e.target.value.replace(/[^\d]/g, "").slice(0, 4);
                    setCard((c) => ({ ...c, expiry: d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d }));
                  }}
                  aria-invalid={!!errors.expiry}
                />
                <FieldError message={errors.expiry} />
              </div>
              <div>
                <Label htmlFor="cc-cvv" className="mb-2">CVV</Label>
                <Input
                  id="cc-cvv"
                  type="password"
                  inputMode="numeric"
                  autoComplete="cc-csc"
                  placeholder="123"
                  value={card.cvv}
                  onChange={(e) => setCard((c) => ({ ...c, cvv: e.target.value.replace(/[^\d]/g, "").slice(0, 4) }))}
                  aria-invalid={!!errors.cvv}
                />
                <FieldError message={errors.cvv} />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="cc-name" className="mb-2">Name on card</Label>
                <Input
                  id="cc-name"
                  autoComplete="cc-name"
                  value={card.holder_name}
                  onChange={(e) => setCard((c) => ({ ...c, holder_name: e.target.value }))}
                  aria-invalid={!!errors.holder_name}
                />
                <FieldError message={errors.holder_name} />
              </div>
            </div>
          ) : (
            <div key="upi" className="m-fade-up mt-6">
              <Label htmlFor="upi" className="mb-2">UPI ID</Label>
              <Input id="upi" placeholder="yourname@okbank" value={upi} onChange={(e) => setUpi(e.target.value)} aria-invalid={!!errors.upi_id} />
              <FieldError message={errors.upi_id} />
              <p className="mt-2 text-xs text-muted-foreground">Use fail@sim to simulate a declined UPI request.</p>
            </div>
          )}

          <label className="mt-6 flex items-center justify-between gap-4 rounded-xl bg-muted px-4 py-3 text-sm">
            <span>
              Simulate a failed payment
              <span className="block text-xs text-muted-foreground">For demonstrating the retry flow</span>
            </span>
            <Switch checked={simulateFailure} onCheckedChange={setSimulateFailure} />
          </label>

          <InlineError message={apiError} className="mt-4" />

          <Button type="submit" size="lg" className={`mt-6 w-full ${pay.isPending ? "m-processing" : ""}`} disabled={pay.isPending || expired}>
            {pay.isPending ? <Spinner /> : failure ? <RotateCcw /> : <Lock />}
            {pay.isPending ? "Processing simulated payment…" : `${failure ? "Retry payment" : "Pay"} ${formatMoney(o.total_amount, o.currency)}`}
          </Button>
          <p className="mt-3 text-center text-xs text-muted-foreground">
            This is a simulated payment — no real money is charged and card details are never stored.
          </p>
        </form>

        {method === "CARD" && (
          <div className="rounded-xl bg-lavender p-5">
            <p className="eyebrow mb-3">Test cards (any future expiry, any CVV)</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {TEST_CARDS.map(([num, label]) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => setCard({ number: num, expiry: "12/30", cvv: "123", holder_name: card.holder_name || "Demo Customer" })}
                  className="flex justify-between rounded-lg bg-white/70 px-3 py-2 text-left text-sm hover:bg-white"
                >
                  <span className="tabular-nums">{num}</span>
                  <span className="text-muted-foreground">{label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <aside className="space-y-4">
        <OrderSummaryCard order={o} />
        <PaymentAttempts order={o} />
        <Button variant="ghost" className="w-full text-muted-foreground" onClick={() => setCancelOpen(true)}>
          Cancel order and return items to cart
        </Button>
      </aside>

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancel this order?"
        description="The order will be cancelled and its items put back in your cart."
        confirmLabel="Cancel order"
        destructive
        loading={cancel.isPending}
        onConfirm={() => cancel.mutate()}
      />
    </div>
  );
}

export default function PayPage() {
  return (
    <div className="container-page py-12">
      <div className="mb-8">
        <CheckoutSteps current={2} />
        <p className="eyebrow">Simulated checkout</p>
        <h1 className="type-h2 mt-3 flex flex-wrap items-center gap-3">
          Complete your payment
          <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium tracking-normal text-[#3a4bc4]">Demo · no real money</span>
        </h1>
      </div>
      <RequireRole roles={["CUSTOMER"]}>
        <PayContent />
      </RequireRole>
    </div>
  );
}
