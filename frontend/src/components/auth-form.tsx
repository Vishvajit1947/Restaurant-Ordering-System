"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm, type Path } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { FieldError, InlineError, Spinner } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api";
import { qk } from "@/lib/hooks";
import type { AuthResponse } from "@/lib/types";

const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});

const registerSchema = z.object({
  full_name: z.string().trim().min(2, "Enter your full name").max(100),
  email: z.string().trim().email("Enter a valid email address"),
  phone: z
    .string()
    .trim()
    .regex(/^(\+?[0-9]{10,15})?$/, "Phone must be 10–15 digits")
    .optional(),
  password: z
    .string()
    .min(8, "Use at least 8 characters")
    .max(128)
    .regex(/[A-Za-z]/, "Include at least one letter")
    .regex(/[0-9]/, "Include at least one digit"),
});

type LoginValues = z.infer<typeof loginSchema>;
type RegisterValues = z.infer<typeof registerSchema>;

const DEMO = [
  ["Customer", "customer@saffronsmoke.test", "Customer@123"],
  ["Staff", "staff@saffronsmoke.test", "Staff@123"],
  ["Admin", "admin@saffronsmoke.test", "Admin@123"],
];

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const isLogin = mode === "login";

  const form = useForm<LoginValues & Partial<RegisterValues>>({
    resolver: zodResolver(isLogin ? loginSchema : registerSchema) as never,
    defaultValues: { email: "", password: "", full_name: "", phone: "" },
  });
  const { register, handleSubmit, formState, setError, setValue } = form;

  const onSubmit = async (values: LoginValues & Partial<RegisterValues>) => {
    setFormError(null);
    try {
      const body = isLogin
        ? { email: values.email, password: values.password }
        : { ...values, phone: values.phone || undefined };
      const res = await api<AuthResponse>(isLogin ? "/auth/login" : "/auth/register", { method: "POST", body });
      qc.clear();
      qc.setQueryData(qk.me, res.user);
      toast.success(isLogin ? `Welcome back, ${res.user.full_name.split(" ")[0]}` : "Your account is ready");
      const next = params.get("next");
      const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : null;
      if (res.user.role === "CUSTOMER") router.push(safeNext && !safeNext.startsWith("/dashboard") ? safeNext : "/menu");
      else router.push(safeNext?.startsWith("/dashboard") ? safeNext : "/dashboard");
    } catch (e) {
      if (e instanceof ApiError && e.fields.length) {
        e.fields.forEach((f) => setError(f.field as Path<LoginValues & RegisterValues>, { message: f.message }));
      } else if (e instanceof ApiError && e.code === "EMAIL_ALREADY_REGISTERED") {
        setError("email", { message: e.message });
      } else {
        setFormError(e instanceof Error ? e.message : "Something went wrong");
      }
    }
  };

  const err = formState.errors;
  return (
    <div className="container-page flex justify-center py-16">
      <div className="w-full max-w-md">
        <div className="m-scale-in rounded-xl bg-white p-8 ring-1 ring-border sm:p-10">
          <p className="eyebrow">{isLogin ? "Welcome back" : "Join us"}</p>
          <h1 className="type-h2 mt-3">{isLogin ? "Log in to your account" : "Create your account"}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {isLogin ? "Customers, staff and admins all sign in here." : "Save your cart, pay faster and track every order."}
          </p>

          <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-5" noValidate>
            <InlineError message={formError} />
            {!isLogin && (
              <div>
                <Label htmlFor="full_name" className="mb-2">Full name</Label>
                <Input id="full_name" autoComplete="name" aria-invalid={!!err.full_name} {...register("full_name")} />
                <FieldError message={err.full_name?.message} />
              </div>
            )}
            <div>
              <Label htmlFor="email" className="mb-2">Email</Label>
              <Input id="email" type="email" autoComplete="email" aria-invalid={!!err.email} {...register("email")} />
              <FieldError message={err.email?.message} />
            </div>
            {!isLogin && (
              <div>
                <Label htmlFor="phone" className="mb-2">
                  Phone <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Input id="phone" type="tel" autoComplete="tel" placeholder="+919876543210" aria-invalid={!!err.phone} {...register("phone")} />
                <FieldError message={err.phone?.message} />
              </div>
            )}
            <div>
              <Label htmlFor="password" className="mb-2">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete={isLogin ? "current-password" : "new-password"}
                aria-invalid={!!err.password}
                {...register("password")}
              />
              <FieldError message={err.password?.message} />
              {!isLogin && !err.password && (
                <p className="mt-1.5 text-xs text-muted-foreground">At least 8 characters with a letter and a digit.</p>
              )}
            </div>
            <Button type="submit" size="lg" className="w-full" disabled={formState.isSubmitting}>
              {formState.isSubmitting && <Spinner />}
              {isLogin ? "Log in" : "Create account"}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            {isLogin ? "New here? " : "Already have an account? "}
            <Link
              href={`${isLogin ? "/register" : "/login"}${params.get("next") ? `?next=${encodeURIComponent(params.get("next")!)}` : ""}`}
              className="text-primary hover:underline"
            >
              {isLogin ? "Create an account" : "Log in"}
            </Link>
          </p>
        </div>

        {isLogin && (
          <div className="m-fade-up mt-4 rounded-xl bg-lavender p-5 [animation-delay:90ms]">
            <p className="eyebrow mb-3">Demo accounts</p>
            <div className="flex flex-wrap gap-2">
              {DEMO.map(([label, email, password]) => (
                <Button
                  key={label}
                  size="sm"
                  variant="secondary"
                  type="button"
                  onClick={() => {
                    setValue("email", email);
                    setValue("password", password);
                  }}
                >
                  {label}
                </Button>
              ))}
            </div>
            <p className="mt-3 text-xs text-ink-secondary">Click a role to fill in its credentials.</p>
          </div>
        )}
      </div>
    </div>
  );
}
