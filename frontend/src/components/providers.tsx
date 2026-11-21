"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { Toaster } from "sonner";

import { ApiError } from "@/lib/api";

import { RevealObserver } from "./motion";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <RevealObserver />
      {children}
      <Toaster
        position="top-center"
        offset={{ top: 84 }}
        mobileOffset={{ top: 80 }}
        toastOptions={{
          classNames: {
            toast: "!rounded-xl !border-border !bg-white !text-ink !shadow-[0_8px_30px_rgba(40,37,59,0.08)]",
            description: "!text-muted-foreground",
          },
        }}
      />
    </QueryClientProvider>
  );
}
