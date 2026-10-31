import type { Metadata } from "next";

import { AdminDashboard } from "@/features/admin/AdminDashboard";

export const metadata: Metadata = { title: "Tableau de bord admin" };

export default function AdminPage() {
  return <AdminDashboard />;
}
