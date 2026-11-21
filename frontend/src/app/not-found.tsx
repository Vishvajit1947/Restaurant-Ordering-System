import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-night px-4 text-center">
      <p className="eyebrow !text-fog">404</p>
      <h1 className="type-h1 mt-4 !text-on-dark">This page isn&apos;t on the menu</h1>
      <p className="mt-3 text-fog">The page you&apos;re looking for doesn&apos;t exist or has moved.</p>
      <div className="mt-8 flex gap-3">
        <Button asChild>
          <Link href="/menu">Browse the menu</Link>
        </Button>
        <Button variant="glass" asChild>
          <Link href="/">Home</Link>
        </Button>
      </div>
    </div>
  );
}
