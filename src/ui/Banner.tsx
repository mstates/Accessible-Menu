"use client";

import { useId, useState, type ReactNode, type Ref } from "react";
import { Button as AriaButton } from "react-aria-components";

// A Banner, built to Primer's Banner and its accessibility page (D-211):
// feedback about a whole page, placed by the caller at the top of the body
// content, first in main and above the page's heading (D-215), the
// container's full width. A section landmark named by its type, through an
// h2 that says the type and is visually hidden, since the words are short
// (Primer: the title may be hidden when the body is short and easily
// scanned). The type's icon sits beside the words and is hidden from
// assistive technology: the heading says the type, so the icon and its
// color are never the only sign of it.
//
// By default no live region and no focus on arrival. A banner that comes
// with the page is read with it, and found by its landmark and its heading;
// one added to a page already open is the caller's to announce or to focus
// (Primer: a success is announced, an essential banner takes focus).
//
// A flash (D-214) is the banner a page load brings as the result of what
// was just done, built as GitHub's own flash: its words sit in an alert
// with aria-atomic, and its dismiss button carries autofocus in the served
// HTML, so the browser focuses the button as the page loads, before React
// hydrates, and a screen reader says the words with it. This departs from
// Primer's Banner accessibility page, which announces a success and never
// focuses it (departure 6 on the UX reference page): after the load, iOS
// left that unheard, VoiceOver stopping on the skip link, and GitHub's
// flash is the shape heard to work on iOS and on macOS. React writes
// autoFocus as the attribute on the server and never on the client, and
// calls focus() only for a button it creates, never for one it hydrates,
// so the browser's focus at the load is the only one. React Aria's own
// autoFocus puts nothing in the HTML and focuses in an effect after
// hydration, so the attribute goes on through the Button's render
// function, which hands the element React Aria's props and its ref.
//
// The dismiss button, when there is one, is named by the caller's words, is
// 44 pixels square (Primer asks 24 or more), and on press moves focus to
// the element the caller names before the banner goes, so focus is never
// lost to the body.
//
// The button comes first in the reading order and last on screen, as
// GitHub's flash does (D-215): its close button is first in its markup and
// its message next, so from the focused button the next item a screen
// reader reaches is the words. On screen the icon and the words keep the
// left and the button the right, by CSS order on the flex items. That is
// sound here because the button is the banner's one control: its place
// among the page's Tab stops is the same in either order, so focus order
// is unaffected, and the heading, the button's name, and the words mean the
// same read in either order. No reading-flow, which would make the reading
// follow the screen.
//
// Monochrome like every token: the raised background with the border token
// around it, which forced colors keep; the icon and the cross are stroked
// in currentColor, so they follow the text in both schemes and in forced
// colors. The words keep at least 8rem: where the row is narrower than the
// icon, the words, and the button together, at 320 pixels with the largest
// text, they wrap onto a line of their own and the button after them on
// screen, so nothing scrolls sideways.

type Kind = "success";

type Props = {
  kind: Kind;
  // The type's name, which names the landmark and is its heading.
  title: string;
  children: ReactNode;
  dismiss?: { label: string; focusId: string };
  // A flash (D-214): the words in an alert, the dismiss button focused by
  // the served autofocus. Only for a banner the page load brings, never for
  // one added to a page already open.
  flash?: boolean;
  className?: string;
  ref?: Ref<HTMLElement>;
};

const wordsClass = "min-w-0 grow basis-32";

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
  flash = false,
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
      {/* First to read, last on screen (D-215). */}
      {dismiss ? (
        <AriaButton
          aria-label={dismiss.label}
          onPress={() => {
            document.getElementById(dismiss.focusId)?.focus();
            setShown(false);
          }}
          render={
            flash
              ? ({ ref: buttonRef, ...buttonProps }) => (
                  // eslint-disable-next-line jsx-a11y/no-autofocus -- D-214: the served autofocus is the flash's point
                  <button ref={buttonRef} {...buttonProps} autoFocus />
                )
              : undefined
          }
          className="order-last -m-2 ms-auto inline-flex size-11 shrink-0 items-center justify-center rounded border-2 border-transparent data-[hovered]:bg-background data-[pressed]:bg-background"
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
      {flash ? (
        <div role="alert" aria-atomic="true" className={wordsClass}>
          {children}
        </div>
      ) : (
        <p className={wordsClass}>{children}</p>
      )}
    </section>
  );
}
