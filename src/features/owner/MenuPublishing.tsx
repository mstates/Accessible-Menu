"use client";

import { useId, useState, useTransition } from "react";
import type { Copy } from "@/copy";
import { useAnnounce } from "@/core/a11y/announcer";
import type { MenuPublishState, PublishBlocker } from "@/domain/menu";
import { Button } from "@/ui/Button";
import type { Editing } from "./editing/useEditing";
import { publishMenu, unpublishMenu } from "./menu-actions";
import {
  blockerSentence,
  refusedSentence,
  stateSentence,
  type PublishingStrings,
} from "./publishing-words";

export type MenuPublishingProps = {
  strings: PublishingStrings;
  editing: Copy["owner"]["editing"];
  code: string;
  menu: { id: string; name: string };
  // The menu's state as the server holds it. Every press ends with a
  // refresh, so this is always the truth.
  state: MenuPublishState;
  // What would block Publish now, in page order; empty when nothing would.
  blockers: PublishBlocker[];
  // The restaurant's time zone, for the day the menu was published.
  timeZone: string;
  lang: string;
};

type Props = MenuPublishingProps & {
  // The page's one editing state (D-111): a press waits its turn behind
  // every save on its way, and a press that did not land is said and shown
  // the way a failed move is, with Reload when the page is out of date.
  saves: Editing;
};

type Press = "publish" | "unpublish";

// Publish and Unpublish for one menu (D-82, migration 12), at the top of
// the menu's own page: one sentence of state, what would block Publish when
// anything would, Publish, and, while the menu is published, Unpublish,
// each with its hint. Publish is always there, since a published menu's
// changes reach diners through it; a press with nothing changed publishes
// again. The state is plain text, never a live region; a press that lands
// is said once through the page's log ("Published.", "Unpublished.") and
// the refreshed page brings the new state. Focus stays on Publish after a
// press of it; a landed Unpublish takes its own button away, so focus moves
// to Publish beside it before the button goes, and never falls to the body.
// Publish stays enabled while something blocks it (D-111 never disables):
// the press refuses with the first problem's sentence, and the list above
// the buttons says what to fix. Neither press is an Undo entry: each is its
// own reversible button, and Undo stays about content.
export function MenuPublishing({
  strings,
  editing,
  code,
  menu,
  state,
  blockers,
  timeZone,
  lang,
  saves,
}: Props) {
  const announce = useAnnounce();
  const [pending, startPending] = useTransition();
  const [pressing, setPressing] = useState<Press | null>(null);
  const headingId = useId();
  const publishButtonId = useId();
  const publishHintId = useId();
  const unpublishHintId = useId();
  const { published } = state;

  function press(action: Press) {
    setPressing(action);
    startPending(async () => {
      try {
        await saves.run(async () => {
          const result = await saves.call(() =>
            action === "publish"
              ? publishMenu(code, menu.id)
              : unpublishMenu(code, menu.id),
          );
          if (!result.ok) {
            saves.failChange(
              refusedSentence(
                strings,
                editing,
                menu.name,
                action,
                result.problem,
              ),
            );
            return;
          }
          saves.landed();
          announce(
            action === "publish"
              ? strings.spoken.published
              : strings.spoken.unpublished,
          );
          if (action === "unpublish") {
            document.getElementById(publishButtonId)?.focus();
          }
        });
      } finally {
        setPressing(null);
      }
    });
  }

  return (
    <section aria-labelledby={headingId} className="mt-6 flex flex-col gap-3">
      <h2 id={headingId} className="text-xl font-bold">
        {strings.heading}
      </h2>
      <p>{stateSentence(strings, state, timeZone, lang)}</p>
      {blockers.length > 0 ? (
        <>
          <p>{strings.waitingLead}</p>
          <ul className="list-disc pl-6">
            {blockers.map((blocker, index) => (
              <li key={`${blocker.kind}-${index}`}>
                {blockerSentence(strings, blocker)}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button
          id={publishButtonId}
          onPress={() => press("publish")}
          isPending={pending && pressing === "publish"}
          pendingLabel={strings.pending.publish}
          aria-describedby={publishHintId}
        >
          {strings.publish}
        </Button>
        {published ? (
          <Button
            onPress={() => press("unpublish")}
            isPending={pending && pressing === "unpublish"}
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
      {published ? (
        <p id={unpublishHintId} className="text-sm text-foreground-muted">
          {strings.unpublishHint}
        </p>
      ) : null}
    </section>
  );
}
