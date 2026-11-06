import type { ReactNode } from "react";
import type { Copy } from "@/copy";
import { fill } from "@/copy/fill";
import { Button } from "@/ui/Button";
import { PageFrame } from "@/ui/PageFrame";
import { ResultMessage } from "@/ui/ResultMessage";
import { dashboardPath } from "./paths";

// A result that arrived with the page, such as the return from Checkout, and
// the key of the render that carries it (D-110).
export type DashboardNotice = { message: string; key: string };

type Props = {
  copy: Copy;
  email: string;
  signOut: () => Promise<void>;
  notice?: DashboardNotice | null;
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
      homeHref={dashboardPath}
      loadingLabel={copy.ui.loading}
    >
      <h1 className="text-3xl font-bold">{copy.owner.heading}</h1>
      <p className="mt-2 text-foreground-muted">
        {fill(copy.owner.signedInAs, { email })}
      </p>
      {notice ? (
        <ResultMessage
          key={notice.key}
          fromUrl={notice.key}
          message={notice.message}
          className="mt-4"
        />
      ) : null}
      {children ?? <p className="mt-6">{copy.owner.empty}</p>}
      <form action={signOut} className="mt-8">
        <Button type="submit">{copy.owner.signOut}</Button>
      </form>
    </PageFrame>
  );
}
