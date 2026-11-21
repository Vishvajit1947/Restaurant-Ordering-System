"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";

import { MenuItemForm } from "@/components/dashboard/menu-item-form";
import { ErrorState, PageHeader, PageLoader } from "@/components/common";
import { api } from "@/lib/api";
import type { MenuItem } from "@/lib/types";

export default function EditMenuItemPage() {
  const { itemId } = useParams<{ itemId: string }>();
  const q = useQuery({ queryKey: ["admin-menu-item", itemId], queryFn: () => api<MenuItem>(`/admin/menu-items/${itemId}`) });
  if (q.isLoading) return <PageLoader />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  return (
    <>
      <PageHeader eyebrow="Menu" title={`Edit ${q.data!.name}`} />
      <MenuItemForm item={q.data!} />
    </>
  );
}
