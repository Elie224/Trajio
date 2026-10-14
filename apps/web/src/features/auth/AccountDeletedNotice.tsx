"use client";

import { useEffect, useState } from "react";

import { ACCOUNT_DELETED_FLAG } from "@/lib/account-flags";

/** One-shot confirmation shown on the home page after an account deletion. */
export function AccountDeletedNotice() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(ACCOUNT_DELETED_FLAG)) {
        sessionStorage.removeItem(ACCOUNT_DELETED_FLAG);
        // eslint-disable-next-line react-hooks/set-state-in-effect -- reads browser-only storage once
        setVisible(true);
      }
    } catch {
      // Storage unavailable: nothing to show.
    }
  }, []);

  if (!visible) return null;
  return (
    <div role="status" className="border-b border-emerald-200 bg-emerald-50 px-4 py-3 text-center text-sm font-medium text-emerald-800">
      Votre compte a été supprimé.
    </div>
  );
}
