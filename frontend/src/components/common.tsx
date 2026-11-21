"use client";

import { AlertCircle, Loader2, UtensilsCrossed } from "lucide-react";
import { cn } from "cn";
import { useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/api";
import { ORDER_STATUS_LABEL, PAYMENT_STATUS_LABEL } from "@/lib/format";
import type { OrderStatus, PaymentStatus } from "@/lib/types";

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("size-4 animate-spin", className)} aria-hidden />;
}

export function PageLoader({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-muted-foreground" role="status">
      <Spinner className="size-6 text-primary" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function EmptyState({
  icon: Icon = UtensilsCrossed,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("m-scale-in flex flex-col items-center rounded-xl bg-white px-6 py-14 text-center ring-1 ring-border", className)}>
      <div className="m-pop mb-5 flex size-14 items-center justify-center rounded-full bg-lavender text-primary">
        <Icon className="size-6" />
      </div>
      <h3 className="text-lg">{title}</h3>
      {description && <p className="mt-2 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry, className }: { error: unknown; onRetry?: () => void; className?: string }) {
  return (
    <div className={cn("m-fade-up flex flex-col items-center rounded-xl bg-white px-6 py-12 text-center ring-1 ring-border", className)}>
      <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertCircle className="size-5" />
      </div>
      <h3 className="text-lg">Something went wrong</h3>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">{errorMessage(error)}</p>
      {onRetry && (
        <Button variant="secondary" className="mt-6" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function InlineError({ message, className }: { message?: string | null; className?: string }) {
  if (!message) return null;
  return (
    <div role="alert" className={cn("m-shake flex items-start gap-2 rounded-xl bg-destructive/8 px-4 py-3 text-sm text-destructive", className)}>
      <AlertCircle className="mt-0.5 size-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="m-error mt-1.5 text-[13px] text-destructive">{message}</p>;
}

const STATUS_STYLE: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "bg-[#f7f0e1] text-[#7a5a14]",
  PLACED: "bg-primary/10 text-[#3a4bc4]",
  PREPARING: "bg-[#e7edfb] text-[#34509c]",
  READY: "bg-[#e5f3ec] text-[#2b6e4f]",
  DELIVERED: "bg-[#efeff4] text-[#4c4a5c]",
  CANCELLED: "bg-destructive/10 text-destructive",
};

const PAYMENT_STYLE: Record<PaymentStatus, string> = {
  PENDING: "bg-[#efeff4] text-[#4c4a5c]",
  SUCCESS: "bg-[#e5f3ec] text-[#2b6e4f]",
  FAILED: "bg-destructive/10 text-destructive",
  REFUNDED: "bg-[#f7f0e1] text-[#7a5a14]",
};

function Pill({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className={cn("m-badge inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium whitespace-nowrap", className)}>
      <span className="size-1.5 rounded-full bg-current opacity-70" aria-hidden />
      {children}
    </span>
  );
}

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Pill key={status} className={STATUS_STYLE[status]}>{ORDER_STATUS_LABEL[status]}</Pill>;
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return <Pill key={status} className={PAYMENT_STYLE[status]}>{PAYMENT_STATUS_LABEL[status]}</Pill>;
}

export function VegMark({ veg, className }: { veg: boolean; className?: string }) {
  return (
    <span
      title={veg ? "Vegetarian" : "Non-vegetarian"}
      aria-label={veg ? "Vegetarian" : "Non-vegetarian"}
      className={cn(
        "inline-flex size-4 shrink-0 items-center justify-center rounded-[3px] border-[1.5px] bg-white",
        veg ? "border-[#2b8a57]" : "border-[#b3412f]",
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", veg ? "bg-[#2b8a57]" : "bg-[#b3412f]")} />
    </span>
  );
}

export function FoodImage({ src, alt, className }: { src: string | null; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className={cn("flex items-center justify-center bg-lavender text-primary/60", className)} aria-label={alt}>
        <UtensilsCrossed className="size-1/4 max-h-10 max-w-10" />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      data-fade
      // Fades in once decoded; images already in the browser cache are marked immediately.
      ref={(el) => {
        if (el?.complete && el.naturalWidth > 0) el.setAttribute("data-loaded", "");
      }}
      onLoad={(e) => e.currentTarget.setAttribute("data-loaded", "")}
      onError={() => setFailed(true)}
      className={cn("object-cover", className)}
    />
  );
}

export function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-xl bg-white ring-1 ring-border">
          <Skeleton className="aspect-[4/3] w-full rounded-none" />
          <div className="space-y-3 p-5">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-9 w-28 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  destructive,
  loading,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  children?: React.ReactNode;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="rounded-xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-lg font-[480]">{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        {children}
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button variant="outline" disabled={loading}>
              Keep it
            </Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button
              variant={destructive ? "destructive-solid" : "default"}
              disabled={loading}
              onClick={(e) => {
                e.preventDefault();
                onConfirm();
              }}
            >
              {loading && <Spinner />}
              {confirmLabel}
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <p className="eyebrow mb-3">{eyebrow}</p>}
        <h1 className="type-h2">{title}</h1>
        {description && <p className="mt-2 text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
