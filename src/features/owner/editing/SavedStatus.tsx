"use client";

import type { Copy } from "@/copy";
import { Button } from "@/ui/Button";
import type { Status } from "./status";
import type { Editing } from "./useEditing";

type Props = {
  strings: Copy["owner"]["editing"];
  status: Status;
  // The last failure's sentence, shown while the status is failed.
  notice: string | null;
  // A field holds a value that was not saved, so there is something to retry.
  canRetry: boolean;
  outOfDate: boolean;
  onRetry: () => void;
};

// The one saved status of an editing screen (D-111). It is a status with
// aria-live off: a screen reader can find it and read it, and its changes
// are never spoken, so Saving and its return are not read field after
// field. What must be heard, a field that saved, a failure, and the return
// to saved after one, goes through the page's log (D-118). Try again and
// Reload sit beside it, outside the status, and show only when there is
// something to retry or the page is out of date.
export function SavedStatus({
  strings,
  status,
  notice,
  canRetry,
  outOfDate,
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
      {canRetry ? <Button onPress={onRetry}>{strings.tryAgain}</Button> : null}
      {outOfDate ? (
        <Button onPress={() => window.location.reload()}>
          {strings.reload}
        </Button>
      ) : null}
    </div>
  );
}

// The one status of a page that draws no list (D-111): a dish's five pages
// (D-222). Canvas for the status and its buttons, placed where the page's
// content ends.
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
        canRetry={Object.keys(editing.failures).length > 0}
        outOfDate={editing.outOfDate}
        onRetry={onRetry}
      />
    </div>
  );
}
