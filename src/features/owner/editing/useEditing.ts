"use client";

import { unstable_isUnrecognizedActionError, useRouter } from "next/navigation";
import {
  startTransition,
  useCallback,
  useEffect,
  useOptimistic,
  useRef,
  useState,
} from "react";
import type { Copy } from "@/copy";
import { useAnnounce } from "@/core/a11y/announcer";
import { useNavigationGuard, type NavigationGuard } from "@/ui/NavigationGuard";
import { useReportPending } from "@/ui/NavigationStatus";
import { afterHold, leaveOf } from "./leave";
import { saveQueue } from "./queue";
import { saysSaved, saysSavedAgain, type Landing } from "./spoken";
import { buttonsOf, statusOf } from "./status";

// The state every editing screen keeps (D-111): what is on its way, what
// failed, what the owner typed and has not saved, and the rules that follow
// from it. Saves run one after another, in the order they were made, and
// each one records its own outcome before the next starts (queue.ts). A
// save that throws, a dropped connection or an action the server no longer
// knows, becomes a result and never reaches the error boundary (Q-41). The
// status is never spoken; a field whose save lands says "Saved." once, and
// a failure is said once, through the page's log (D-118). A link waits for
// saves on their way and stays when one has failed, and leaving the document
// with anything unsaved raises the browser's own warning.

// Past ten seconds a save is not just slow enough to notice: every later
// save is waiting behind it, so the screen says so.
const SLOW_MS = 10_000;

// A field whose save failed: where it is, what went wrong, the sentence that
// was spoken, and the value it failed with, which is not sent again until
// the owner changes it or asks to try again. Fields that commit together
// can be refused on more than one at once (D-164): fieldId and problem are
// the first on the page, where focus goes, and others are the rest, each
// shown under its own field. kind is the problem's, which decides whether
// Try again or Reload is the button it gets (status.ts, D-237).
export type FieldFailure = {
  fieldId: string;
  kind: string;
  problem: string;
  others?: readonly { fieldId: string; problem: string }[];
  sentence: string;
  value: string;
};

// What a save comes back as when the server never answered it.
export type Unanswered = {
  ok: false;
  problem: { kind: "unreachable" } | { kind: "out-of-date" };
};

type Live = {
  inFlight: number;
  drafts: Record<string, string>;
  sent: Record<string, string>;
  failures: Record<string, FieldFailure>;
  // Counts every failure, so a link that waited can tell one happened.
  failed: number;
  // A failure was said, and "All changes saved." has not been since. Set
  // when the failure is said, not when the status shows it, since a save
  // waiting behind a failure keeps the status at saving.
  owed: boolean;
};

function without<Value>(
  record: Record<string, Value>,
  key: string,
): Record<string, Value> {
  const next = { ...record };
  delete next[key];
  return next;
}

export function useEditing(strings: Copy["owner"]["editing"]) {
  const announce = useAnnounce();
  const router = useRouter();

  // How many saves are on their way, for the status. It is optimistic state
  // because a save runs inside a transition, and inside one a plain state
  // update waits until the transition is over, which is when the count is no
  // longer wanted. An optimistic update shows on the current frame and falls
  // away by itself once the saves it belongs to have settled.
  const [inFlight, addInFlight] = useOptimistic(
    0,
    (count: number, more: number) => count + more,
  );
  const [slow, setSlow] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [failures, setFailures] = useState<Record<string, FieldFailure>>({});
  const [notice, setNotice] = useState<string | null>(null);
  // The kind of the last change that failed, a move or a delete, for as
  // long as its sentence is the one shown.
  const [changeKind, setChangeKind] = useState<string | null>(null);
  const [outOfDate, setOutOfDate] = useState(false);
  const [holding, setHolding] = useState(false);

  // The same values for code that runs outside a render: the link guard,
  // the leave warning, and saves that finish later. Written only from event
  // handlers and from saves, in step with the state above.
  const live = useRef<Live>({
    inFlight: 0,
    drafts: {},
    sent: {},
    failures: {},
    failed: 0,
    owed: false,
  });
  const [queue] = useState(saveQueue);

  const status = statusOf({
    inFlight,
    slow,
    failedFields: Object.keys(failures).length,
    notice,
  });

  // Coming back to saved after a failure is said once, and the field save
  // that got it there said nothing of its own (D-118).
  useEffect(() => {
    if (!saysSavedAgain(live.current.owed, status)) return;
    live.current.owed = false;
    announce(strings.savedAgain);
  }, [status, announce, strings.savedAgain]);

  // One save and everything it records, after the saves made before it.
  // Call it inside a transition, in the same one as any change shown ahead
  // of the server's answer: the count it adds is optimistic state.
  const run = useCallback(
    async (work: () => Promise<void>): Promise<void> => {
      live.current.inFlight += 1;
      addInFlight(1);
      await queue.run(async () => {
        try {
          await work();
        } finally {
          live.current.inFlight -= 1;
        }
      });
    },
    [addInFlight, queue],
  );

  // Calls a server action and turns anything thrown into a result.
  const call = useCallback(
    async <Result>(
      action: () => Promise<Result>,
    ): Promise<Result | Unanswered> => {
      const timer = window.setTimeout(() => {
        setSlow(true);
        announce(strings.slow);
      }, SLOW_MS);
      try {
        return await action();
      } catch (error) {
        const stale = unstable_isUnrecognizedActionError(error);
        if (stale) setOutOfDate(true);
        return {
          ok: false,
          problem: { kind: stale ? "out-of-date" : "unreachable" },
        };
      } finally {
        window.clearTimeout(timer);
        setSlow(false);
      }
    },
    [announce, strings.slow],
  );

  const type = useCallback((key: string, value: string) => {
    live.current.drafts = { ...live.current.drafts, [key]: value };
    setDrafts(live.current.drafts);
  }, []);

  const clearFailure = useCallback((key: string) => {
    if (!(key in live.current.failures)) return;
    live.current.failures = without(live.current.failures, key);
    setFailures(live.current.failures);
    if (Object.keys(live.current.failures).length === 0) {
      setNotice(null);
      setChangeKind(null);
    }
  }, []);

  // Typed back to the saved value: nothing to save, nothing failed.
  const reset = useCallback(
    (key: string) => {
      live.current.drafts = without(live.current.drafts, key);
      setDrafts(live.current.drafts);
      clearFailure(key);
    },
    [clearFailure],
  );

  const sending = useCallback((key: string, value: string) => {
    live.current.sent = { ...live.current.sent, [key]: value };
  }, []);

  const answered = useCallback((key: string) => {
    live.current.sent = without(live.current.sent, key);
  }, []);

  // Every save that landed ends here: the last failure's sentence goes
  // unless a field is still failed, and a field's text says "Saved." once
  // (D-118). It runs inside run, so this save still counts as on its way.
  const land = useCallback(
    (kind: Landing["kind"]) => {
      const { failures: failed, owed, inFlight: pending } = live.current;
      const failedFields = Object.keys(failed).length;
      if (failedFields === 0) {
        setNotice(null);
        setChangeKind(null);
      }
      if (saysSaved({ kind, owed, failedFields, waiting: pending - 1 })) {
        announce(strings.fieldSaved);
      }
    },
    [announce, strings.fieldSaved],
  );

  // A field's save landed. Its draft goes only if the owner has not typed on
  // since, and inside a transition, so the field switches to the saved value
  // in the same commit that brings the refreshed list and the old value
  // never shows in between.
  const landedField = useCallback(
    (key: string, typed: string | null) => {
      if (live.current.drafts[key] === typed) {
        live.current.drafts = without(live.current.drafts, key);
        const next = live.current.drafts;
        startTransition(() => setDrafts(next));
      }
      clearFailure(key);
      land("text");
    },
    [clearFailure, land],
  );

  // A row left the screen: what was typed in it goes with it.
  const dropField = useCallback(
    (key: string) => {
      if (key in live.current.drafts) {
        live.current.drafts = without(live.current.drafts, key);
        setDrafts(live.current.drafts);
      }
      clearFailure(key);
    },
    [clearFailure],
  );

  // A save that was not a field landed: an add, a move, or a delete, which
  // says its own sentence.
  const landed = useCallback(() => land("change"), [land]);

  const failField = useCallback(
    (key: string, failure: FieldFailure) => {
      live.current.failures = { ...live.current.failures, [key]: failure };
      live.current.failed += 1;
      live.current.owed = true;
      setFailures(live.current.failures);
      setNotice(failure.sentence);
      setChangeKind(null);
      announce(failure.sentence);
    },
    [announce],
  );

  // A change with no field of its own failed: a move, a delete. Its kind
  // decides whether Reload is offered beside its sentence.
  const failChange = useCallback(
    (sentence: string, kind: string) => {
      live.current.failed += 1;
      live.current.owed = true;
      setNotice(sentence);
      setChangeKind(kind);
      announce(sentence);
    },
    [announce],
  );

  // Focus goes to the failed field that comes first on the page.
  const focusFirstFailed = useCallback((): FieldFailure | null => {
    const found = Object.values(live.current.failures)
      .map((failure) => ({
        failure,
        element: document.getElementById(failure.fieldId),
      }))
      .filter(
        (entry): entry is { failure: FieldFailure; element: HTMLElement } =>
          entry.element !== null,
      )
      .sort((a, b) =>
        a.element.compareDocumentPosition(b.element) &
        Node.DOCUMENT_POSITION_FOLLOWING
          ? -1
          : 1,
      );
    const first = found[0];
    if (!first) return null;
    first.element.focus();
    return first.failure;
  }, []);

  // A link on this screen asks before it leaves. With a failed save it
  // stays: focus goes to the first failed field and its failure is said once
  // more. With a save on its way it waits, then goes, unless that save
  // failed, in which case it stays and the failure has just been said.
  const guard = useCallback<NavigationGuard>(
    (href) => {
      const failedFields = Object.keys(live.current.failures).length;
      const leave = leaveOf({ inFlight: live.current.inFlight, failedFields });
      if (leave === "go") return "go";
      if (leave === "stay") {
        const failure = focusFirstFailed();
        if (failure) announce(failure.sentence);
        return "hold";
      }
      const failedBefore = live.current.failed;
      setHolding(true);
      void queue.idle().then(() => {
        const next = afterHold({
          failedFields: Object.keys(live.current.failures).length,
          failedWhileHeld: live.current.failed !== failedBefore,
        });
        if (next === "go") {
          router.push(href);
          return;
        }
        setHolding(false);
        focusFirstFailed();
      });
      return "hold";
    },
    [announce, focusFirstFailed, queue, router],
  );
  useNavigationGuard(guard);

  // While a link waits for saves, and until the page it leads to arrives,
  // the header's status region counts it as pending, so "Loading" still
  // shows after a second (D-106).
  useReportPending(holding);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      const {
        inFlight: pending,
        drafts: typed,
        failures: failed,
      } = live.current;
      if (
        pending > 0 ||
        Object.keys(typed).length > 0 ||
        Object.keys(failed).length > 0
      ) {
        event.preventDefault();
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  // Which button a failure on the page gets, by the one rule (D-237).
  const buttons = buttonsOf({
    fields: Object.values(failures).map((failure) => failure.kind),
    change: notice === null ? null : changeKind,
    outOfDate,
  });

  return {
    status,
    notice,
    buttons,
    drafts,
    failures,
    run,
    call,
    type,
    reset,
    sending,
    answered,
    landedField,
    dropField,
    landed,
    failField,
    failChange,
    focusFirstFailed,
    // The values as they are now, for a handler that runs after a render.
    peek: () => live.current,
  };
}

export type Editing = ReturnType<typeof useEditing>;
