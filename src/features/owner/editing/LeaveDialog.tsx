"use client";

import type { Copy } from "@/copy";
import { AlertDialog } from "@/ui/AlertDialog";

type Props = {
  strings: Copy["owner"]["dish"]["form"]["leave"];
  isOpen: boolean;
  onKeep: () => void;
  onLeave: () => void;
};

// The question before a link leaves a page with unsaved changes (D-229),
// through the one dialog (D-119, D-136): the question is its name, the
// note its description, Keep editing the first stop, and Leave the answer
// the double-tap guard holds back for half a second.
export function LeaveDialog({ strings, isOpen, onKeep, onLeave }: Props) {
  return (
    <AlertDialog
      isOpen={isOpen}
      title={strings.question}
      description={strings.note}
      keepLabel={strings.keep}
      confirmLabel={strings.leave}
      onKeep={onKeep}
      onConfirm={onLeave}
    />
  );
}
