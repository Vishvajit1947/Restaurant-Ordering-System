"use client";

import { ChefHat, ExternalLink, LayoutGrid, LogOut, Menu as MenuIcon, Receipt, Settings, Tags, UtensilsCrossed, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { RequireRole } from "@/components/require-role";
import { useLogout } from "@/components/store/site-header";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useMe, useRestaurant } from "@/lib/hooks";
import type { UserRole } from "@/lib/types";

const NAV: { href: string; label: string; icon: typeof Receipt; roles: UserRole[] }[] = [
  { href: "/dashboard", label: "Overview", icon: LayoutGrid, roles: ["ADMIN"] },
  { href: "/dashboard/orders", label: "Orders", icon: Receipt, roles: ["ADMIN", "STAFF"] },
  { href: "/dashboard/menu", label: "Menu items", icon: UtensilsCrossed, roles: ["ADMIN"] },
  { href: "/dashboard/categories", label: "Categories", icon: Tags, roles: ["ADMIN"] },
  { href: "/dashboard/staff", label: "Staff", icon: Users, roles: ["ADMIN"] },
  { href: "/dashboard/settings", label: "Restaurant", icon: Settings, roles: ["ADMIN"] },
];

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { data: user } = useMe();
  const { data: restaurant } = useRestaurant();
  const logout = useLogout();
  const items = NAV.filter((n) => user && n.roles.includes(user.role));

  return (
    <div className="flex h-full flex-col bg-night text-on-dark">
      <div className="flex h-[72px] items-center gap-2.5 px-6">
        <span className="flex size-8 items-center justify-center rounded-full bg-primary">
          <ChefHat className="size-4" />
        </span>
        <div>
          <p className="text-[15px] font-[480]">Saffron &amp; Smoke</p>
          <p className="text-xs text-fog">{user?.role === "ADMIN" ? "Admin" : "Kitchen staff"}</p>
        </div>
      </div>
      {restaurant && (
        <div className="mx-4 mb-4 flex items-center gap-2 rounded-xl bg-night-raised px-4 py-3 text-sm">
          <span className={`size-2 rounded-full ${restaurant.is_open ? "bg-[#7ee2b0]" : "bg-fog"}`} />
          <span className="text-fog">Restaurant is</span>
          <span>{restaurant.is_open ? "open" : "closed"}</span>
        </div>
      )}
      <nav className="flex-1 space-y-1 px-3" aria-label="Dashboard">
        {items.map((n) => {
          const active = n.href === "/dashboard" ? pathname === n.href : pathname.startsWith(n.href);
          const Icon = n.icon;
          return (
            <Link
              key={n.href}
              href={n.href}
              onClick={onNavigate}
              className={`group/nav relative flex h-10 items-center gap-3 rounded-lg px-3 text-[15px] transition-colors duration-200 ${
                active ? "bg-night-raised text-on-dark" : "text-fog hover:bg-night-raised/60 hover:text-on-dark"
              }`}
            >
              {active && <span className="m-rail absolute top-2 bottom-2 left-0 w-[3px] rounded-full bg-primary" />}
              <Icon className="size-4 transition-transform duration-200 group-hover/nav:translate-x-0.5" />
              {n.label}
            </Link>
          );
        })}
      </nav>
      <div className="space-y-1 border-t border-night-line p-3">
        <Link href="/" className="flex h-10 items-center gap-3 rounded-lg px-3 text-sm text-fog hover:bg-night-raised/60 hover:text-on-dark">
          <ExternalLink className="size-4" /> View storefront
        </Link>
        <button onClick={logout} className="flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm text-fog hover:bg-night-raised/60 hover:text-on-dark">
          <LogOut className="size-4" /> Log out
        </button>
        {user && <p className="truncate px-3 pt-2 text-xs text-slate">{user.email}</p>}
      </div>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <RequireRole roles={["ADMIN", "STAFF"]}>
      <div className="flex min-h-screen bg-canvas">
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 lg:block">
          <SidebarContent />
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-16 items-center justify-between bg-night px-4 lg:hidden">
            <span className="text-on-dark">Saffron &amp; Smoke</span>
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost-dark" size="icon" aria-label="Open navigation">
                  <MenuIcon />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 border-none p-0">
                <SheetTitle className="sr-only">Navigation</SheetTitle>
                <SidebarContent onNavigate={() => setOpen(false)} />
              </SheetContent>
            </Sheet>
          </header>
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-8 sm:py-10">{children}</main>
        </div>
      </div>
    </RequireRole>
  );
}
