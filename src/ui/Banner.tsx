"use client";

import { useId, useState, type ReactNode, type Ref } from "react";
import { Button as AriaButton } from "react-aria-components";

// A Banner, built to Primer's Banner and its accessibility page (D-211):
// feedback about a whole page, placed by the caller at the top of the body
// content, the container's full width. A section landmark named by its
// type, through an h2 that says the type and is visually hidden, since the
// words are short (Primer: the title may be hidden when the body is short
// and easily scanned). The type's icon sits beside the words and is hidden
// from assistive technology: the heading says the type, so the icon and its
// color are never the only sign of it.
//
// No live region and no focus on arrival. A banner that comes with the page
// is read with it, and found by its landmark and its heading; one added to
// a page already open is the caller's to announce or to focus (Primer: a
// success is announced, an essential banner takes focus).
//
// The dismiss button, when there is one, is named by the caller's words, is
// 44 pixels square (Primer asks 24 or more), and on press moves focus to
// the element the caller names before the banner goes, so focus is never
// lost to the body. Monochrome like every token: the raised background with
// the border token around it, which forced colors keep; the icon and the
// cross are stroked in currentColor, so they follow the text in both
// schemes and in forced colors. The words keep at least 8rem: where the row
// is narrower than the icon, the words, and the button together, at 320
// pixels with the largest text, they wrap onto a line of their own and the
// button after them, in the order they are read, so nothing scrolls
// sideways.

type Kind = "success";

type Props = {
  kind: Kind;
  // The type's name, which names the landmark and is its heading.
  title: string;
  children: ReactNode;
  dismiss?: { label: string; focusId: string };
  className?: string;
  ref?: Ref<HTMLElement>;
};

const icons: Record<Kind, ReactNode> = {
  // A check in a circle, Primer's success mark.
  success: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12.5 2.75 2.75L16.5 9.5" />
    </>
  ),
};

export function Banner({
  kind,
  title,
  children,
  dismiss,
  className,
  ref,
}: Props) {
  const titleId = useId();
  const [shown, setShown] = useState(true);
  if (!shown) return null;
  return (
    <section
      ref={ref}
      aria-labelledby={titleId}
      className={`flex flex-wrap items-start gap-3 rounded border-2 border-border bg-background-raised p-4 ${className ?? ""}`}
    >
      <h2 id={titleId} className="sr-only">
        {title}
      </h2>
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="size-6 shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {icons[kind]}
      </svg>
      <p className="min-w-0 grow basis-32">{children}</p>
      {dismiss ? (
        <AriaButton
          aria-label={dismiss.label}
          onPress={() => {
            document.getElementById(dismiss.focusId)?.focus();
            setShown(false);
          }}
          className="-m-2 ms-auto inline-flex size-11 shrink-0 items-center justify-center rounded border-2 border-transparent data-[hovered]:bg-background data-[pressed]:bg-background"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="size-5"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
          >
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </AriaButton>
      ) : null}
    </section>
  );
}
