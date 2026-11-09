"use client";

import { unstable_isUnrecognizedActionError } from "next/navigation";
import {
  useEffect,
  useState,
  useTransition,
  type Dispatch,
  type SetStateAction,
} from "react";
import { noticeCookie, type DishNotice } from "@/core/notice";
import type { FormError } from "@/ui/Form";
import { focusTarget, type FocusTarget } from "@/ui/form-focus";
import { useUnsaved } from "../editing/useUnsaved";
import type { SaveRefused, SaveResult } from "./form-result";

// The shell every dish page that saves by a press shares (D-223, D-229;
// rule 12, the third use): one Save, the page's own validation run on
// submit, the server's answer, and where focus goes after each. A submit
// with problems sends nothing, shows them, and focuses by Primer's rule
// (form-focus.ts). A clean submit sends the payload through the bound
// server action, held while it is on its way (D-209); a save that lands
// sets the result's cookie and loads the page again as a new document, so
// the flash arrives first in main (D-211, D-219), and the button stays
// held until that document comes. A save the server refused keeps every
// value as the owner left it, puts the failure sentence in the summary,
// and focuses the summary. A throw, a dropped connection or an action the
// server no longer knows, becomes a failure the same way and never reaches
// the error page (Q-41). The leave rule is useUnsaved's.

// The summary's id: where focus goes with SUMMARY_FROM problems or a
// failure. By id, as a field is, so no ref rides through the page's state.
export const FORM_SUMMARY_ID = "dish-form-summary";

// What a submit prepared: the payload to send, or the problems that stop
// it, in field order.
export type Prepared<Payload> =
  { payload: Payload } | { problems: FormError[] };

type Props<Payload, Detail> = {
  action: (payload: Payload) => Promise<SaveResult<Detail>>;
  notice: DishNotice;
  // The page's own path, the cookie's and the reload's.
  path: string;
  headingId: string;
  dirty: boolean;
  // The problems shown under the fields and in the summary, the page's
  // state, so a page can drop one whose field is gone.
  errors: FormError[];
  setErrors: Dispatch<SetStateAction<FormError[]>>;
  // The sentence for a save that did not land, in the page's words.
  failureOf: (result: SaveRefused<Detail>) => string;
  // What else the page adopts from a save that did not land.
  onFailed?: (result: SaveRefused<Detail>) => void;
};

type Landing = {
  count: number;
  focus: FocusTarget;
  fieldId: string | null;
};

export function useDishForm<Payload, Detail = never>({
  action,
  notice,
  path,
  headingId,
  dirty,
  errors,
  setErrors,
  failureOf,
  onFailed,
}: Props<Payload, Detail>) {
  const [pending, startTransition] = useTransition();
  const [leaving, setLeaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [landing, setLanding] = useState<Landing>({
    count: 0,
    focus: null,
    fieldId: null,
  });
  const unsaved = useUnsaved({
    dirty,
    pending: pending || leaving,
    headingId,
  });

  // Focus is placed after the render that shows the outcome, so the
  // summary or the field is on the page when it takes it.
  useEffect(() => {
    if (landing.count === 0) return;
    const id = landing.focus === "summary" ? FORM_SUMMARY_ID : landing.fieldId;
    if (landing.focus !== null && id !== null) {
      document.getElementById(id)?.focus();
    }
  }, [landing]);

  function land(problems: readonly FormError[], failed: boolean) {
    setLanding((before) => ({
      count: before.count + 1,
      focus: focusTarget(problems.length, failed),
      fieldId: problems[0]?.id ?? null,
    }));
  }

  function submit(prepared: Prepared<Payload>) {
    if (pending || leaving) return;
    if ("problems" in prepared) {
      setErrors(prepared.problems);
      setFailure(null);
      land(prepared.problems, false);
      return;
    }
    setErrors([]);
    setFailure(null);
    const { payload } = prepared;
    startTransition(async () => {
      let result: SaveResult<Detail>;
      try {
        result = await action(payload);
      } catch (error) {
        const stale = unstable_isUnrecognizedActionError(error);
        result = {
          status: "failed",
          problem: { kind: stale ? "out-of-date" : "unreachable" },
        };
      }
      if (result.status === "saved") {
        unsaved.departing();
        setLeaving(true);
        document.cookie = noticeCookie(notice, path);
        window.location.replace(path);
        return;
      }
      onFailed?.(result);
      setFailure(failureOf(result));
      land([], true);
    });
  }

  return {
    pending,
    leaving,
    errors,
    failure,
    submit,
    asking: unsaved.asking,
    keep: unsaved.keep,
    leave: unsaved.leave,
  };
}

export type DishFormState = Omit<ReturnType<typeof useDishForm>, "submit">;
