import { describe, expect, it } from "vitest";
import {
  confirmCounts,
  CONFIRM_GUARD_MS,
  FIRST_FOCUS_WAIT_MS,
  type PressKind,
} from "../../src/ui/alert-dialog-guard";

// The double-tap guard (D-119). The press that opens the confirmation can
// come twice, and the second one must not confirm it. That is a pointer's
// problem, so only a mouse, a finger, and a pen are held back. A key and a
// screen reader count at once: a press from either was meant, and it is
// never dropped without a word. The presses themselves are made on the real
// page, in the gate and against the local stand-in; this is the rule.
describe("the confirmation's double-tap guard (D-119)", () => {
  const opened = 1000;
  const heldBack: PressKind[] = ["mouse", "touch", "pen"];
  const atOnce: PressKind[] = ["keyboard", "virtual"];

  it("lasts about half a second", () => {
    expect(CONFIRM_GUARD_MS).toBe(500);
  });

  describe.each(heldBack)("a press from a pointer (%s)", (kind) => {
    it("is not taken before the dialog has shown", () => {
      expect(confirmCounts(kind, null, opened)).toBe(false);
    });

    it("is ignored in the same instant, the second tap of a double tap", () => {
      expect(confirmCounts(kind, opened, opened)).toBe(false);
      expect(confirmCounts(kind, opened, opened + 80)).toBe(false);
      expect(confirmCounts(kind, opened, opened + 300)).toBe(false);
    });

    it("is ignored up to the last millisecond of the guard", () => {
      expect(confirmCounts(kind, opened, opened + CONFIRM_GUARD_MS - 1)).toBe(
        false,
      );
    });

    it("counts once the guard is over", () => {
      expect(confirmCounts(kind, opened, opened + CONFIRM_GUARD_MS)).toBe(true);
      expect(confirmCounts(kind, opened, opened + 5000)).toBe(true);
    });

    it("is ignored if the clock ever reads earlier than the opening", () => {
      expect(confirmCounts(kind, opened, opened - 1)).toBe(false);
    });
  });

  describe.each(atOnce)("a press with no pointer behind it (%s)", (kind) => {
    it("counts in the same instant, so a Tab then Enter is never dropped", () => {
      expect(confirmCounts(kind, opened, opened)).toBe(true);
      expect(confirmCounts(kind, opened, opened + 80)).toBe(true);
      expect(confirmCounts(kind, opened, opened + CONFIRM_GUARD_MS - 1)).toBe(
        true,
      );
    });

    it("counts after the guard as well", () => {
      expect(confirmCounts(kind, opened, opened + CONFIRM_GUARD_MS)).toBe(true);
    });

    it("does not wait on the clock at all", () => {
      expect(confirmCounts(kind, null, opened)).toBe(true);
      expect(confirmCounts(kind, opened, opened - 1)).toBe(true);
    });
  });

  it("holds back a kind of press it does not know, the way it holds a pointer", () => {
    const unknown = "eraser" as PressKind;
    expect(confirmCounts(unknown, opened, opened + 80)).toBe(false);
    expect(confirmCounts(unknown, opened, opened + CONFIRM_GUARD_MS)).toBe(
      true,
    );
  });
});

// The first focus of every dialog (D-136): the dialog itself, then its first
// stop after a wait chosen by ear. The gate pins the timeline on a stopped
// clock; this pins the number, which changes only after listening again.
describe("the first focus of a dialog (D-136)", () => {
  it("moves to the first stop a tenth of a second after the dialog opens", () => {
    expect(FIRST_FOCUS_WAIT_MS).toBe(100);
  });
});
