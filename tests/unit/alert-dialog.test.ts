import { describe, expect, it } from "vitest";
import {
  confirmCounts,
  CONFIRM_GUARD_MS,
} from "../../src/ui/alert-dialog-guard";

// The double-tap guard (D-119). The press that opens the confirmation can
// come twice, and the second one must not confirm it. The press itself is
// driven on the real page against the local stand-in; this is the rule.
describe("the confirmation's double-tap guard (D-119)", () => {
  const opened = 1000;

  it("lasts about half a second", () => {
    expect(CONFIRM_GUARD_MS).toBe(500);
  });

  it("takes no press before the dialog has shown", () => {
    expect(confirmCounts(null, opened)).toBe(false);
  });

  it("ignores a press in the same instant, the second tap of a double tap", () => {
    expect(confirmCounts(opened, opened)).toBe(false);
    expect(confirmCounts(opened, opened + 80)).toBe(false);
    expect(confirmCounts(opened, opened + 300)).toBe(false);
  });

  it("ignores a press up to the last millisecond of the guard", () => {
    expect(confirmCounts(opened, opened + CONFIRM_GUARD_MS - 1)).toBe(false);
  });

  it("takes a press once the guard is over", () => {
    expect(confirmCounts(opened, opened + CONFIRM_GUARD_MS)).toBe(true);
    expect(confirmCounts(opened, opened + 5000)).toBe(true);
  });

  it("ignores a press if the clock ever reads earlier than the opening", () => {
    expect(confirmCounts(opened, opened - 1)).toBe(false);
  });
});
