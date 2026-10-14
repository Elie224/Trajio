import type { Metadata } from "next";

import { ForgotPasswordForm } from "@/features/auth/ForgotPasswordForm";

export const metadata: Metadata = { title: "Mot de passe oublié", referrer: "no-referrer" };

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
