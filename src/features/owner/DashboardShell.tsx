import type { Copy } from "@/copy";
import { fill } from "@/copy/fill";
import { Button } from "@/ui/Button";
import { PageFrame } from "@/ui/PageFrame";

type Props = {
  copy: Copy;
  email: string;
  signOut: () => Promise<void>;
};

// The empty dashboard. Menus arrive with Phase 1.
export function DashboardShell({ copy, email, signOut }: Props) {
  return (
    <PageFrame siteName={copy.site.name} homeHref="/">
      <h1 className="text-3xl font-bold">{copy.owner.heading}</h1>
      <p className="mt-2 text-foreground-muted">
        {fill(copy.owner.signedInAs, { email })}
      </p>
      <p className="mt-6">{copy.owner.empty}</p>
      <form action={signOut} className="mt-8">
        <Button type="submit">{copy.owner.signOut}</Button>
      </form>
    </PageFrame>
  );
}
