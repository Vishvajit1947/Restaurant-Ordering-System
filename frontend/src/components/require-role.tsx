"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { useMe } from "@/lib/hooks";
import type { UserRole } from "@/lib/types";

import { EmptyState, PageLoader } from "./common";

/**
 * Client-side route guard for a better UX. The backend is the real authority:
 * every protected endpoint checks the role again.
 */
export function RequireRole({ roles, children }: { roles: UserRole[]; children: React.ReactNode }) {
  const { data: user, isLoading } = useMe();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && user === null) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [isLoading, user, router, pathname]);

  if (isLoading || user === null || user === undefined) return <PageLoader />;
  if (!roles.includes(user.role)) {
    const home = user.role === "CUSTOMER" ? "/menu" : "/dashboard";
    return (
      <div className="container-page py-16">
        <EmptyState
          title="You don't have access to this page"
          description={`You're signed in as ${user.full_name} (${user.role.toLowerCase()}).`}
          action={
            <Button onClick={() => router.push(home)}>{user.role === "CUSTOMER" ? "Browse the menu" : "Go to dashboard"}</Button>
          }
        />
      </div>
    );
  }
  return <>{children}</>;
}
