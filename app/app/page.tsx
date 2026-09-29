import type { Metadata } from "next";
import { en } from "@/copy";
import { DashboardShell } from "@/features/owner/DashboardShell";

export const metadata: Metadata = {
  title: en.owner.title,
};

export default function OwnerPage() {
  return <DashboardShell copy={en} />;
}
