"use client";

import { useEffect, useId, useRef } from "react";
import { Dialog, Heading, Modal, ModalOverlay } from "react-aria-components";
import { confirmCounts } from "./alert-dialog-guard";
import { Button } from "./Button";
import { useFirstFocus } from "./useFirstFocus";

type Props = {
  isOpen: boolean;
  // The question, which is also the dialog's name: "Delete Lunch, with its
  // 4 sections?"
  title: string;
  keepLabel: string;
  confirmLabel: string;
  // Keep, or Escape. Nothing is sent.
  onKeep: () => void;
  onConfirm: () => void;
};

// The one dialog (D-119): a question before a delete that takes content with
// it, with two answers. Semantics, the focus trap, Escape, and the inert
// page behind it come from React Aria. The question is the dialog's heading
// and its name. The dialog takes focus first, so the question is read, and a
// tenth of a second later focus moves to Keep (D-136): Enter, or a key held a
// moment too long, does nothing on the dialog and keeps on Keep. A press
// outside does nothing, there is no close button, and nothing moves or fades:
// a dialog that asks about a delete should be plain.
//
// The page that opens it decides what happens next, and it closes the
// dialog before it does anything else: while the dialog is open the page
// behind is inert, so focus cannot be placed there and a sentence added to
// an inert log is not heard.
//
// The overlay is the scroll container and the dialog sits in it with auto
// margins, so a question taller than the screen, at a large text size,
// scrolls from its top instead of being cut off above it. The veil is the
// page's own background, since the tokens define no black. The border is the
// dialog's edge in forced colors, where the background is dropped.
export function AlertDialog({
  isOpen,
  title,
  keepLabel,
  confirmLabel,
  onKeep,
  onConfirm,
}: Props) {
  return (
    <ModalOverlay
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onKeep();
      }}
      className="fixed inset-0 z-50 flex overflow-y-auto bg-background/80 p-2"
    >
      <Modal className="m-auto w-full max-w-md rounded border-2 border-border bg-background p-4">
        <Dialog role="alertdialog" className="outline-none">
          <Heading slot="title" className="text-xl font-bold">
            {title}
          </Heading>
          <Answers
            keepLabel={keepLabel}
            confirmLabel={confirmLabel}
            onKeep={onKeep}
            onConfirm={onConfirm}
          />
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}

type AnswersProps = Pick<
  Props,
  "keepLabel" | "confirmLabel" | "onKeep" | "onConfirm"
>;

// The two answers. They are mounted only while the dialog is open, so the
// moment they mount is the moment it opened. Two things start then. The
// first focus: React Aria focuses the dialog itself, and after the wait focus
// moves once to Keep, the safe answer, unless the owner has already moved
// inside the dialog (useFirstFocus, D-136). And the double-tap guard starts
// counting: for about half a second the confirming button takes no press
// from a mouse, a finger, or a pen, and looks and sounds as it always does.
// A key or a screen reader's press counts at once, so the button is told
// what kind of press it got.
function Answers({ keepLabel, confirmLabel, onKeep, onConfirm }: AnswersProps) {
  const keepId = useId();
  const openedAt = useRef<number | null>(null);
  useEffect(() => {
    openedAt.current = performance.now();
  }, []);
  useFirstFocus(keepId);

  return (
    <div className="mt-6 flex flex-wrap gap-3">
      <Button id={keepId} onPress={onKeep}>
        {keepLabel}
      </Button>
      <Button
        onPress={(event) => {
          const now = performance.now();
          if (confirmCounts(event.pointerType, openedAt.current, now)) {
            onConfirm();
          }
        }}
      >
        {confirmLabel}
      </Button>
    </div>
  );
}
