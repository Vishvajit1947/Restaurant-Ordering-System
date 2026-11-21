"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog, FieldError, Spinner } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api, errorMessage } from "@/lib/api";
import { ORDER_STATUS_LABEL, TRANSITION_LABEL } from "@/lib/format";
import type { Order, OrderStatus } from "@/lib/types";

export function useChangeStatus(orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { to_status: OrderStatus; note?: string }) =>
      api<Order>(`/admin/orders/${orderId}/status`, { method: "POST", body: v }),
    onSuccess: (order) => {
      qc.setQueryData(["admin-order", orderId], order);
      qc.invalidateQueries({ queryKey: ["admin-orders"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      toast.success(`Order ${order.order_number} is now ${ORDER_STATUS_LABEL[order.status].toLowerCase()}`);
    },
    onError: (e) => {
      toast.error(errorMessage(e));
      qc.invalidateQueries({ queryKey: ["admin-orders"] });
      qc.invalidateQueries({ queryKey: ["admin-order", orderId] });
    },
  });
}

/** Shows only the transitions the backend says are valid for this user. */
export function OrderStatusActions({ order, size = "default" }: { order: Order; size?: "default" | "sm" }) {
  const change = useChangeStatus(order.id);
  const qc = useQueryClient();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string>();

  const cancel = useMutation({
    mutationFn: () => api<Order>(`/admin/orders/${order.id}/cancel`, { method: "POST", body: { reason: reason.trim() } }),
    onSuccess: (o) => {
      qc.setQueryData(["admin-order", order.id], o);
      qc.invalidateQueries({ queryKey: ["admin-orders"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      setCancelOpen(false);
      setReason("");
      toast.success(o.payment_status === "REFUNDED" ? "Order cancelled and payment refunded" : "Order cancelled");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const forward = order.allowed_transitions.filter((s) => s !== "CANCELLED");
  const canCancel = order.allowed_transitions.includes("CANCELLED");
  if (!forward.length && !canCancel) {
    return <p className="text-sm text-muted-foreground">No further actions — this order is {ORDER_STATUS_LABEL[order.status].toLowerCase()}.</p>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {forward.map((s) => (
        <Button key={s} size={size} disabled={change.isPending} onClick={() => change.mutate({ to_status: s })}>
          {change.isPending && change.variables?.to_status === s && <Spinner />}
          {TRANSITION_LABEL[s] ?? ORDER_STATUS_LABEL[s]}
        </Button>
      ))}
      {canCancel && (
        <Button size={size} variant="destructive" onClick={() => setCancelOpen(true)}>
          Cancel order
        </Button>
      )}
      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title={`Cancel order ${order.order_number}?`}
        description={
          order.payment_status === "SUCCESS"
            ? "The customer's payment will be refunded (simulated). This cannot be undone."
            : "This cannot be undone."
        }
        confirmLabel="Cancel order"
        destructive
        loading={cancel.isPending}
        onConfirm={() => {
          if (reason.trim().length < 3) {
            setReasonError("Give a short reason (at least 3 characters).");
            return;
          }
          setReasonError(undefined);
          cancel.mutate();
        }}
      >
        <div>
          <label htmlFor="cancel-reason" className="mb-2 block text-sm">
            Reason (shown to the customer)
          </label>
          <Textarea id="cancel-reason" rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} aria-invalid={!!reasonError} />
          <FieldError message={reasonError} />
        </div>
      </ConfirmDialog>
    </div>
  );
}
