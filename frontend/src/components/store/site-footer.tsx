"use client";

import { Clock, MapPin, Phone } from "lucide-react";
import Link from "next/link";

import { useRestaurant } from "@/lib/hooks";

import { Logo } from "./site-header";

export function SiteFooter() {
  const { data: r } = useRestaurant();
  return (
    <footer className="mt-auto bg-night text-fog">
      <div className="container-page grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-4 lg:col-span-2">
          <Logo />
          <p className="max-w-sm text-sm leading-relaxed">{r?.tagline ?? "100% vegetarian kitchen."}</p>
        </div>
        <div className="space-y-3 text-sm">
          <p className="text-on-dark">Visit us</p>
          {r?.address && (
            <p className="flex gap-2">
              <MapPin className="mt-0.5 size-4 shrink-0" /> {r.address}
            </p>
          )}
          {r?.phone && (
            <p className="flex gap-2">
              <Phone className="mt-0.5 size-4 shrink-0" /> {r.phone}
            </p>
          )}
        </div>
        <div className="space-y-3 text-sm">
          <p className="text-on-dark">Hours</p>
          {r?.opening_hours?.map((h) => (
            <p key={h.day} className="flex gap-2">
              <Clock className="mt-0.5 size-4 shrink-0" />
              <span>
                {h.day}
                <br />
                <span className="text-on-dark/80">{h.hours}</span>
              </span>
            </p>
          ))}
        </div>
      </div>
      <div className="border-t border-night-line">
        <div className="container-page flex flex-col gap-2 py-6 text-xs tracking-wide sm:flex-row sm:justify-between">
          <p>© {new Date().getFullYear()} Saffron &amp; Smoke. Academic prototype — payments are simulated.</p>
          <div className="flex gap-5">
            <Link href="/menu" className="hover:text-on-dark">
              Menu
            </Link>
            <Link href="/login" className="hover:text-on-dark">
              Staff login
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
