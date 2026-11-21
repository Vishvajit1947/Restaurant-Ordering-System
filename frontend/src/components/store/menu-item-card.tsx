"use client";

import { Check, Clock, Flame, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { FoodImage, Spinner, VegMark } from "@/components/common";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/format";
import { useCartMutations, useMe } from "@/lib/hooks";
import type { MenuItem } from "@/lib/types";

export function useAddToCart() {
  const { data: user } = useMe();
  const router = useRouter();
  const pathname = usePathname();
  const { add } = useCartMutations();
  const canOrder = !user || user.role === "CUSTOMER";
  const addItem = (item: MenuItem, quantity = 1, onAdded?: () => void) => {
    if (!user) {
      router.push(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    add.mutate({ menu_item_id: item.id, quantity, name: item.name }, { onSuccess: () => onAdded?.() });
  };
  return { addItem, isPending: add.isPending, pendingId: add.variables?.menu_item_id, canOrder };
}

export function MenuItemCard({ item, currency = "INR" }: { item: MenuItem; currency?: string }) {
  const { addItem, isPending, pendingId, canOrder } = useAddToCart();
  const busy = isPending && pendingId === item.id;
  const [added, setAdded] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const onAdded = () => {
    setAdded(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setAdded(false), 1400);
  };

  return (
    <article
      className={`m-card group flex flex-col overflow-hidden rounded-xl bg-white ring-1 ring-border ${
        item.is_available ? "" : "opacity-75"
      }`}
    >
      <Link href={`/menu/${item.id}`} className="relative block aspect-[4/3] overflow-hidden" aria-label={item.name}>
        <FoodImage
          src={item.image_url}
          alt={item.name}
          className={`size-full group-hover:scale-[1.05] ${item.is_available ? "" : "grayscale"}`}
        />
        {!item.is_available && (
          <span className="m-badge absolute top-3 left-3 rounded-full bg-night/85 px-3 py-1 text-xs text-on-dark">Unavailable</span>
        )}
      </Link>
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start gap-2">
          <VegMark veg={item.is_vegetarian} className="mt-1" />
          <Link href={`/menu/${item.id}`} className="text-[17px] leading-snug font-[460] transition-colors duration-200 hover:text-primary">
            {item.name}
          </Link>
        </div>
        <p className="mt-2 line-clamp-2 flex-1 text-sm leading-relaxed text-muted-foreground">{item.description}</p>
        <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="size-3.5" /> {item.prep_time_minutes} min
          </span>
          {item.spice_level > 0 && (
            <span className="flex items-center gap-0.5" aria-label={`Spice level ${item.spice_level} of 3`}>
              {Array.from({ length: item.spice_level }).map((_, i) => (
                <Flame key={i} className="size-3.5 text-[#c8573c]" />
              ))}
            </span>
          )}
        </div>
        <div className="mt-4 flex items-center justify-between">
          <span className="text-lg tabular-nums">{formatMoney(item.price, currency)}</span>
          {canOrder && (
            <Button
              size="sm"
              variant={item.is_available ? "secondary" : "outline"}
              disabled={!item.is_available || busy}
              onClick={() => addItem(item, 1, onAdded)}
              aria-label={`Add ${item.name} to cart`}
            >
              {busy ? <Spinner /> : added ? <Check key="added" className="m-pop" /> : <Plus />}
              {!item.is_available ? "Sold out" : added ? "Added" : "Add"}
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}
