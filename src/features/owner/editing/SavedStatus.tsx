"use client";

import type { Copy } from "@/copy";
import { Button } from "@/ui/Button";
import type { Status } from "./status";

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
