"use client";

import { Button } from "@/components/ui/button";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <p className="eyebrow">Unexpected error</p>
      <h1 className="type-h2 mt-4">Something went wrong on this page</h1>
      <p className="mt-2 text-muted-foreground">Please try again. If the problem continues, refresh the page.</p>
      <Button className="mt-6" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
