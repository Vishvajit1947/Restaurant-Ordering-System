"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ChefHat, LayoutDashboard, LogOut, Menu as MenuIcon, Receipt, User as UserIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { api } from "@/lib/api";
import { useMe, useRestaurant } from "@/lib/hooks";

import { CartSheet } from "./cart-sheet";

export function Logo({ light = true }: { light?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2.5" aria-label="Saffron & Smoke home">
      <span className="flex size-8 items-center justify-center rounded-full bg-primary text-white">
        <ChefHat className="size-4" />
      </span>
      <span className={light ? "text-[17px] font-[480] tracking-wide text-on-dark" : "text-[17px] font-[480] tracking-wide text-ink"}>
        Saffron &amp; Smoke
      </span>
    </Link>
  );
}

export function useLogout() {
  const qc = useQueryClient();
  const router = useRouter();
  return async () => {
    await api("/auth/logout", { method: "POST" }).catch(() => undefined);
    qc.clear();
    router.push("/");
    router.refresh();
  };
}

const NAV = [
  { href: "/", label: "Home" },
  { href: "/menu", label: "Menu" },
];

export function SiteHeader() {
  const { data: user } = useMe();
  const { data: restaurant } = useRestaurant();
  const pathname = usePathname();
  const logout = useLogout();
  const [mobileOpen, setMobileOpen] = useState(false);
  const isCustomer = user?.role === "CUSTOMER";
  const isStaff = user && user.role !== "CUSTOMER";

  return (
    <header className="sticky top-0 z-40 bg-night">
      <div className="container-page flex h-[72px] items-center justify-between gap-4">
        <div className="flex items-center gap-8">
          <Logo />
          <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={`flex h-10 items-center rounded-full px-5 text-[15px] transition-colors duration-200 ${
                  pathname === n.href ? "bg-white/10 text-on-dark" : "text-fog hover:text-on-dark"
                }`}
              >
                {n.label}
              </Link>
            ))}
            {isCustomer && (
              <Link
                href="/orders"
                className={`flex h-10 items-center rounded-full px-5 text-[15px] transition-colors ${
                  pathname.startsWith("/orders") ? "bg-white/10 text-on-dark" : "text-fog hover:text-on-dark"
                }`}
              >
                My orders
              </Link>
            )}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          {restaurant && (
            <span
              className={`hidden h-8 items-center gap-2 rounded-full px-3 text-[13px] lg:flex ${
                restaurant.is_open ? "bg-[rgba(156,180,232,0.16)] text-on-dark" : "bg-white/6 text-fog"
              }`}
            >
              <span className={`size-1.5 rounded-full ${restaurant.is_open ? "bg-[#7ee2b0]" : "bg-fog"}`} />
              {restaurant.is_open ? "Open now" : "Closed"}
            </span>
          )}

          {isCustomer && <CartSheet enabled />}

          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost-dark" size="icon" aria-label="Account menu">
                  <UserIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 rounded-xl">
                <DropdownMenuLabel className="font-normal">
                  <p className="text-sm text-ink">{user.full_name}</p>
                  <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {isCustomer && (
                  <DropdownMenuItem asChild>
                    <Link href="/orders">
                      <Receipt /> My orders
                    </Link>
                  </DropdownMenuItem>
                )}
                {isStaff && (
                  <DropdownMenuItem asChild>
                    <Link href="/dashboard">
                      <LayoutDashboard /> Dashboard
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={logout}>
                  <LogOut /> Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="hidden items-center gap-2 sm:flex">
              <Button variant="ghost-dark" asChild>
                <Link href="/login">Log in</Link>
              </Button>
              <Button asChild>
                <Link href="/register">Create account</Link>
              </Button>
            </div>
          )}

          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost-dark" size="icon" className="md:hidden" aria-label="Open menu">
                <MenuIcon />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 border-none bg-night text-on-dark">
              <SheetHeader>
                <SheetTitle className="text-on-dark">Saffron &amp; Smoke</SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col gap-1 px-4" aria-label="Mobile">
                {[...NAV, ...(isCustomer ? [{ href: "/orders", label: "My orders" }] : []), ...(isStaff ? [{ href: "/dashboard", label: "Dashboard" }] : [])].map(
                  (n) => (
                    <Link key={n.href} href={n.href} onClick={() => setMobileOpen(false)} className="rounded-full px-4 py-3 text-fog hover:bg-white/8 hover:text-on-dark">
                      {n.label}
                    </Link>
                  ),
                )}
                {!user && (
                  <div className="mt-4 flex flex-col gap-2">
                    <Button variant="glass" asChild onClick={() => setMobileOpen(false)}>
                      <Link href="/login">Log in</Link>
                    </Button>
                    <Button asChild onClick={() => setMobileOpen(false)}>
                      <Link href="/register">Create account</Link>
                    </Button>
                  </div>
                )}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
