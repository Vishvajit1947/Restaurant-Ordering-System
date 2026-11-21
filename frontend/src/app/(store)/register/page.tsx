import { Suspense } from "react";

import { AuthForm } from "@/components/auth-form";
import { PageLoader } from "@/components/common";

export const metadata = { title: "Create account" };

export default function RegisterPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <AuthForm mode="register" />
    </Suspense>
  );
}
