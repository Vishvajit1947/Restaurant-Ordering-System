"use client";

import { RequireRole } from "@/components/require-role";

export default function AdminOnlyLayout({ children }: { children: React.ReactNode }) {
  return <RequireRole roles={["ADMIN"]}>{children}</RequireRole>;
}
