import Link from "next/link";
import type { Copy } from "@/copy";
import { fill } from "@/copy/fill";
import { menuPath } from "@/domain/menu-url";
import { QuietLinks } from "./MenuPage";

type Props = {
  code: string;
  name: string;
  // A known code with no menu diners can read (Q-84, Q-31), or a menu id
  // that is not one of the restaurant's published menus.
  kind: "restaurant" | "menu";
  copy: Copy;
};

// Never a 404 and never a redirect for a printed code: the restaurant's
// name, one line, and the two quiet links. The status is never shown.
export function UnavailablePage({ code, name, kind, copy }: Props) {
  return (
    <>
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto max-w-menu px-4 pt-6 pb-10 outline-none"
      >
        <h1 className="text-sm font-semibold text-foreground-muted">
          {copy.site.descriptor}
        </h1>
        <h2 className="text-3xl font-bold">{name}</h2>
        <p className="mt-4">
          {kind === "menu" ? copy.menu.menuUnavailable : copy.menu.unavailable}
        </p>
        {kind === "menu" ? (
          <p className="mt-2">
            <Link
              prefetch={false}
              href={menuPath(code)}
              className="text-link underline"
            >
              {fill(copy.menu.menuUnavailableLink, { restaurant: name })}
            </Link>
          </p>
        ) : null}
      </main>
      <footer className="mx-auto max-w-menu border-t border-border px-4 pt-6 pb-10 text-sm">
        <QuietLinks code={code} copy={copy} />
      </footer>
    </>
  );
}
