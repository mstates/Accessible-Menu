import type { ReactNode } from "react";
import type { Copy } from "@/copy";
import { fill } from "@/copy/fill";
import { Button } from "@/ui/Button";
import { PageFrame } from "@/ui/PageFrame";

type Props = {
  copy: Copy;
  email: string;
  signOut: () => Promise<void>;
  notice?: string | null;
  children?: ReactNode;
};

// The dashboard. The page passes each restaurant's billing line as children;
// with none, the empty message shows. Menus arrive with Phase 1.
export function DashboardShell({
  copy,
  email,
  signOut,
  notice,
  children,
}: Props) {
  return (
    <PageFrame
      siteName={copy.site.name}
      homeHref="/"
      loadingLabel={copy.ui.loading}
    >
      <h1 className="text-3xl font-bold">{copy.owner.heading}</h1>
      <p className="mt-2 text-foreground-muted">
        {fill(copy.owner.signedInAs, { email })}
      </p>
      {notice ? (
        <p role="status" className="mt-4 rounded bg-background-raised p-4">
          {notice}
        </p>
      ) : null}
      {children ?? <p className="mt-6">{copy.owner.empty}</p>}
      <form action={signOut} className="mt-8">
        <Button type="submit">{copy.owner.signOut}</Button>
      </form>
    </PageFrame>
  );
}
