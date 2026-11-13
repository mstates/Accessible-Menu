"use client";

import type { Copy } from "@/copy";
import { Button } from "@/ui/Button";
import type { FailureButtons, Status } from "./status";
import type { Editing } from "./useEditing";

type Props = {
  strings: Copy["owner"]["editing"];
  status: Status;
  // The last failure's sentence, shown while the status is failed.
  notice: string | null;
  // Which buttons the page's failures get, by the one rule (status.ts,
  // D-237): Try again while a field holds a value a retry could land,
  // Reload while a failure can only be fixed by one.
  buttons: FailureButtons;
  onRetry: () => void;
};

// The one saved status of an editing screen (D-111). It is a status with
// aria-live off: a screen reader can find it and read it, and its changes
// are never spoken, so Saving and its return are not read field after
// field. What must be heard, a field that saved, a failure, and the return
// to saved after one, goes through the page's log (D-118). Try again and
// Reload sit beside it, outside the status, and show only when a failure
// calls for one: a failure a retry cannot fix, a row or its parent gone or
// a page from before a deploy, offers Reload and never Try again (D-237).
export function SavedStatus({
  strings,
  status,
  notice,
  buttons,
  onRetry,
}: Props) {
  const text = {
    saved: strings.saved,
    saving: strings.saving,
    slow: strings.slow,
    failed: notice ?? strings.failed,
  }[status];

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-3">
      <p role="status" aria-live="off" className="min-w-0 font-semibold">
        {text}
      </p>
      {buttons.tryAgain ? (
        <Button onPress={onRetry}>{strings.tryAgain}</Button>
      ) : null}
      {buttons.reload ? (
        <Button onPress={() => window.location.reload()}>
          {strings.reload}
        </Button>
      ) : null}
    </div>
  );
}

// The one status of a page that draws no list of its own (D-111): a
// dish's Choice lists page (D-222). Canvas for the status and its buttons,
// placed where the page's content ends.
export function PageSavedStatus({
  strings,
  editing,
  onRetry,
}: {
  strings: Copy["owner"]["editing"];
  editing: Editing;
  onRetry: () => void;
}) {
  return (
    <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
      <SavedStatus
        strings={strings}
        status={editing.status}
        notice={editing.notice}
        buttons={editing.buttons}
        onRetry={onRetry}
      />
    </div>
  );
}
