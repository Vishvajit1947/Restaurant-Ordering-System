"use client";

import { MoonStar } from "lucide-react";

import { SiteFooter } from "@/components/store/site-footer";
import { SiteHeader } from "@/components/store/site-header";
import { useRestaurant } from "@/lib/hooks";

function ClosedBanner() {
  const { data } = useRestaurant();
  if (!data || data.is_open) return null;
  return (
    <div className="bg-[#2a2840] text-on-dark" role="status">
      <div className="container-page flex items-center justify-center gap-2 py-2.5 text-center text-sm">
        <MoonStar className="size-4 shrink-0 text-periwinkle" />
        We&apos;re closed right now — browse the menu and fill your cart, ordering resumes when we reopen.
      </div>
    </div>
  );
}

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <ClosedBanner />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </>
  );
}
