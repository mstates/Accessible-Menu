import type { Copy } from "@/copy";
import { PageFrame } from "@/ui/PageFrame";

// Empty owner shell. Sign-in and the dashboard arrive with the Supabase task.
export function DashboardShell({ copy }: { copy: Copy }) {
  return (
    <PageFrame siteName={copy.site.name} homeHref="/">
      <h1 className="text-3xl font-bold">{copy.owner.heading}</h1>
      <p className="mt-4">{copy.owner.empty}</p>
    </PageFrame>
  );
}
