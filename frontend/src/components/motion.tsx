"use client";

import { Check } from "lucide-react";
import { cn } from "cn";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { formatMoney } from "@/lib/format";

/**
 * Motion helpers for the things CSS cannot do alone. All timing lives in globals.css (--m-*).
 * Mercury's DESIGN.md defines no animation system, so this layer follows its calm, tonal character:
 * short fades and small movements, no bounce, and nothing that blocks an action.
 */

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function scrollToTop() {
  window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
}

/**
 * Reveals elements marked `data-reveal` (or `data-reveal="stagger"`) as they scroll into view.
 * Only elements that start below the fold are hidden, so nothing visible ever flashes or waits.
 */
export function RevealObserver() {
  useEffect(() => {
    if (prefersReducedMotion() || !("IntersectionObserver" in window)) return;
    const seen = new WeakSet<Element>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.setAttribute("data-reveal-state", "in");
          io.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -6% 0px", threshold: 0.05 },
    );
    const scan = () => {
      document.querySelectorAll("[data-reveal]").forEach((el) => {
        if (seen.has(el)) return;
        seen.add(el);
        if (el.getBoundingClientRect().top > window.innerHeight * 0.94) {
          el.setAttribute("data-reveal-state", "hidden");
          io.observe(el);
        }
      });
    };
    scan();
    const mo = new MutationObserver(scan);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      mo.disconnect();
      io.disconnect();
    };
  }, []);
  return null;
}

/** Tweens a number to its new value. With `countUp` it also animates from zero on first render. */
export function AnimatedNumber({
  value,
  format = (n) => Math.round(n).toLocaleString("en-IN"),
  countUp = false,
  className,
}: {
  value: number;
  format?: (n: number) => string;
  countUp?: boolean;
  className?: string;
}) {
  const [shown, setShown] = useState(countUp ? 0 : value);
  const shownRef = useRef(shown);

  useEffect(() => {
    const from = shownRef.current;
    if (from === value) return;
    const duration = prefersReducedMotion() ? 0 : 420;
    const start = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const t = duration ? Math.min(1, (now - start) / duration) : 1;
      const eased = 1 - Math.pow(1 - t, 3);
      const next = t === 1 ? value : from + (value - from) * eased;
      shownRef.current = next;
      setShown(next);
      if (t < 1) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return <span className={cn("tabular-nums", className)}>{format(shown)}</span>;
}

export function AnimatedMoney({
  value,
  currency = "INR",
  countUp,
  className,
}: {
  value: string | number;
  currency?: string;
  countUp?: boolean;
  className?: string;
}) {
  return (
    <AnimatedNumber value={Number(value)} countUp={countUp} className={className} format={(n) => formatMoney(n, currency)} />
  );
}

export type TabItem<T extends string> = { value: T; label: string; icon?: React.ComponentType<{ className?: string }> };

/** Pill tabs whose dark indicator slides between options. */
export function SlidingTabs<T extends string>({
  items,
  value,
  onChange,
  label,
  size = "md",
  className,
}: {
  items: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const pill = pillRef.current;
    if (!root || !pill) return;
    const place = () => {
      const active = root.querySelector<HTMLElement>('[aria-selected="true"]');
      if (!active) {
        pill.style.opacity = "0";
        return;
      }
      pill.style.opacity = "1";
      pill.style.width = `${active.offsetWidth}px`;
      pill.style.height = `${active.offsetHeight}px`;
      pill.style.transform = `translate(${active.offsetLeft}px, ${active.offsetTop}px)`;
      active.scrollIntoView?.({ block: "nearest", inline: "nearest", behavior: "auto" });
    };
    place();
    const frame = requestAnimationFrame(() => pill.setAttribute("data-ready", ""));
    const ro = new ResizeObserver(place);
    ro.observe(root);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
    };
  }, [value, items.length]);

  return (
    <div ref={rootRef} role="tablist" aria-label={label} className={cn("no-scrollbar relative flex gap-2 overflow-x-auto", className)}>
      <span ref={pillRef} aria-hidden className="m-tab-pill absolute top-0 left-0 rounded-full bg-night" />
      {items.map((item) => {
        const active = item.value === value;
        const Icon = item.icon;
        return (
          <button
            key={item.value || "all"}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.value)}
            className={cn(
              "m-tab relative z-10 flex shrink-0 items-center gap-2 rounded-full",
              size === "md" ? "h-10 px-5 text-[15px]" : "h-9 px-4 text-sm",
              active ? "text-on-dark" : "bg-[rgba(112,115,147,0.08)] text-ink hover:bg-[rgba(112,115,147,0.14)]",
            )}
          >
            {Icon && <Icon className="size-4" />}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

/** Check mark that draws itself, with one soft ring. Used for payment success and delivery. */
export function SuccessCheck({ className }: { className?: string }) {
  return (
    <span className={cn("m-success relative mx-auto flex size-16 items-center justify-center rounded-full bg-primary text-white", className)}>
      <span className="m-success-ring absolute inset-0 rounded-full" aria-hidden />
      <svg viewBox="0 0 24 24" className="size-8" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path className="m-draw" pathLength={1} d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    </span>
  );
}

const CHECKOUT_STEPS = ["Cart", "Details", "Payment", "Done"];

export function CheckoutSteps({ current }: { current: number }) {
  return (
    <ol className="mb-8 flex items-center" aria-label="Checkout progress">
      {CHECKOUT_STEPS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={label} className={cn("flex items-center", i < CHECKOUT_STEPS.length - 1 && "flex-1")} aria-current={active ? "step" : undefined}>
            <span className="flex items-center gap-2">
              <span
                key={`${done}-${active}`}
                className={cn(
                  "flex size-7 items-center justify-center rounded-full text-xs",
                  (done || active) && "m-pop",
                  done || active ? "bg-primary text-white" : "bg-muted text-muted-foreground",
                  active && "ring-4 ring-primary/15",
                )}
              >
                {done ? <Check className="size-3.5" /> : i + 1}
              </span>
              <span className={cn("hidden text-sm sm:inline", active ? "text-ink" : "text-muted-foreground")}>{label}</span>
            </span>
            {i < CHECKOUT_STEPS.length - 1 && (
              <span className="mx-2 h-px flex-1 overflow-hidden bg-border sm:mx-3">
                <span className={cn("m-step-line block h-full bg-primary", done && "m-step-line-done")} />
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
