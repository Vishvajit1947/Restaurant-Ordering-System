"use client";

import { MenuItemForm } from "@/components/dashboard/menu-item-form";
import { PageHeader } from "@/components/common";

export default function NewMenuItemPage() {
  return (
    <>
      <PageHeader eyebrow="Menu" title="New menu item" />
      <MenuItemForm />
    </>
  );
}
