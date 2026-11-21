import { Suspense } from "react";

import { AuthForm } from "@/components/auth-form";
import { PageLoader } from "@/components/common";

export const metadata = { title: "Log in" };

export default function LoginPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <AuthForm mode="login" />
    </Suspense>
  );
}
