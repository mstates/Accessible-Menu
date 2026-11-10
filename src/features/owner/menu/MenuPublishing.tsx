"use client";

import { unstable_isUnrecognizedActionError } from "next/navigation";
import { useEffect, useId, useState, useTransition } from "react";
import type { Copy } from "@/copy";
import { noticeCookie } from "@/core/notice";
import { Button } from "@/ui/Button";
import { FormErrors } from "@/ui/Form";
import { PageLink } from "@/ui/PageLink";
import { useUnsaved } from "../editing/useUnsaved";
import {
  refusedSentence,
  type PublishFailure,
  type PublishingStrings,
  type ReviewLink,
  type ReviewWords,
  type UnconfirmedWords,
} from "../publishing-words";
import type { PublishActionResult } from "./publish-actions";

// The summary's id: where focus goes when a press is refused. By id, as a
// dish's form summary is, so no ref rides through the page's state.
export const PUBLISH_SUMMARY_ID = "menu-publishing-summary";

// What the page shows, in words the server built from the two documents it
// read (publishing-words.ts): the state sentence, whether Unpublish is
// offered, the review, the allergen lists not confirmed, and what Publish
// waits on.
export type PublishingView = {
  state: string;
  published: boolean;
  review: ReviewWords;
  allergens: UnconfirmedWords;
  waiting: ReviewLink[];
};

type Props = {
  strings: PublishingStrings;
  editing: Copy["owner"]["editing"];
  menu: { id: string; name: string };
  // The page's own path, the cookie's and the reload's.
  path: string;
  // The page's h1, which the leave rule falls back to.
  headingId: string;
  view: PublishingView;
  // Publish, bound to the restaurant, the menu, and the token of the draft
  // this page reviewed; Unpublish, bound to the restaurant and the menu.
  publish: () => Promise<PublishActionResult>;
  unpublish: () => Promise<PublishActionResult>;
};

type Press = "publish" | "unpublish";

const linkClass = "inline-flex min-h-11 items-center text-link underline";
const headingClass = "text-xl font-bold";

function Links({ links }: { links: readonly ReviewLink[] }) {
  return (
    <ul className="list-disc pl-6">
      {links.map((link, index) => (
        // Two sizes of one dish can wait with the same words and the same
        // address, so the place in the list is part of the key.
        <li key={`${index} ${link.href}`}>
          <PageLink href={link.href} className={linkClass}>
            {link.text}
          </PageLink>
        </li>
      ))}
    </ul>
  );
}

// A menu's Publishing page (D-224, D-231), under the h1 that names it: the
// state sentence, directly under the h1 with no heading of its own (D-226);
// then, each under its h2, the review of what changed since the last
// publish, the allergen lists not confirmed, and Publish, with what it is
// waiting on read on the way to the button, and Unpublish while the menu is
// published, each button with its hint. Everything is plain text and links:
// nothing here is a live region, and the page has no status and no log.
//
// Publish is always there and never disabled (D-111): a published menu's
// changes reach diners through it, a press with nothing changed publishes
// again (Q-82), and a press while something blocks it is refused with the
// first problem's sentence (D-139, D-177). Nothing in the review blocks: a
// dish that is not confirmed publishes with the sentence diners already
// read.
//
// A press that lands writes the result's cookie and loads the page again as
// a new document, so the flash arrives first in main and names the menu
// (D-219, D-231). A press that is refused keeps the page, puts the failure
// in the summary, and focuses it: focus is the announcement. A throw, a
// dropped connection or an action the server no longer knows, becomes a
// failure the same way and never reaches the error page (Q-41).
//
// From the press until its answer, and on until the new document when it
// lands, the page draws what it showed at the press. A landed press clears
// the restaurant's diner pages, and that brings a fresh render of this page
// back with the action's answer, in the old document: left to show, a
// landed Unpublish would take its own button away there, and focus with it,
// a moment before the new document arrives. Held, the pressed button stays
// mounted, held, and focused, and nothing moves until the page loads again.
// A refused press lets go, so the page is the server's again.
//
// The pressed button is held while the press is on its way (D-209), a
// second press on either button does nothing, and an owner link holds
// without a question, since the press's result decides (D-229); the
// browser's leave warning is armed only then.
export function MenuPublishing({
  strings,
  editing,
  menu,
  path,
  headingId,
  view: latest,
  publish,
  unpublish,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [pressing, setPressing] = useState<Press | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [held, setHeld] = useState<PublishingView | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [refusals, setRefusals] = useState(0);
  const publishHintId = useId();
  const unpublishHintId = useId();
  const unsaved = useUnsaved({
    dirty: false,
    pending: pending || leaving,
    headingId,
  });
  const view = held ?? latest;
  const busy = pending || leaving;

  // Focus is placed after the render that shows the summary, so it is on
  // the page when it takes it.
  useEffect(() => {
    if (refusals === 0) return;
    document.getElementById(PUBLISH_SUMMARY_ID)?.focus();
  }, [refusals]);

  function press(action: Press) {
    if (busy) return;
    setPressing(action);
    setHeld(latest);
    setFailure(null);
    startTransition(async () => {
      let problem: PublishFailure | null;
      try {
        const result = await (action === "publish" ? publish() : unpublish());
        problem = result.ok ? null : result.problem;
      } catch (error) {
        problem = {
          kind: unstable_isUnrecognizedActionError(error)
            ? "out-of-date"
            : "unreachable",
        };
      }
      if (problem === null) {
        unsaved.departing();
        setLeaving(true);
        document.cookie = noticeCookie(
          action === "publish" ? "menu-published" : "menu-unpublished",
          path,
        );
        window.location.replace(path);
        return;
      }
      setHeld(null);
      setPressing(null);
      setFailure(refusedSentence(strings, editing, menu.name, action, problem));
      setRefusals((count) => count + 1);
    });
  }

  return (
    <div className="mt-6 flex flex-col gap-8">
      <FormErrors
        id={PUBLISH_SUMMARY_ID}
        heading={strings.problemHeading}
        errors={[]}
        failure={failure}
      />
      <p>{view.state}</p>

      <div className="flex flex-col gap-3">
        <h2 className={headingClass}>{strings.review.heading}</h2>
        {"sentence" in view.review ? (
          <p>{view.review.sentence}</p>
        ) : (
          <ul className="list-disc pl-6">
            {view.review.changes.map((change) => (
              <li key={change}>{change}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className={headingClass}>{strings.unconfirmed.heading}</h2>
        {"sentence" in view.allergens ? (
          <p>{view.allergens.sentence}</p>
        ) : (
          <>
            <p>{view.allergens.lead}</p>
            <Links links={view.allergens.links} />
          </>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className={headingClass}>{strings.actionsHeading}</h2>
        {view.waiting.length > 0 ? (
          <>
            <p>{strings.waitingLead}</p>
            <Links links={view.waiting} />
          </>
        ) : null}
        <div className="flex flex-wrap gap-3">
          <Button
            onPress={() => press("publish")}
            isPending={busy && pressing === "publish"}
            pendingLabel={strings.pending.publish}
            aria-describedby={publishHintId}
          >
            {strings.publish}
          </Button>
          {view.published ? (
            <Button
              onPress={() => press("unpublish")}
              isPending={busy && pressing === "unpublish"}
              pendingLabel={strings.pending.unpublish}
              aria-describedby={unpublishHintId}
            >
              {strings.unpublish}
            </Button>
          ) : null}
        </div>
        <p id={publishHintId} className="text-sm text-foreground-muted">
          {strings.publishHint}
        </p>
        {view.published ? (
          <p id={unpublishHintId} className="text-sm text-foreground-muted">
            {strings.unpublishHint}
          </p>
        ) : null}
      </div>
    </div>
  );
}
