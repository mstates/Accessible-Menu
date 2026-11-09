import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  settleChoice,
  type Settle,
} from "../../src/features/owner/editing/settle";

// A choice that saves once it has settled (D-229): the price choice's
// radios walked by arrow keys save once, half a second after the last
// stop, and not at all when the walk ends on the saved choice.

const WAIT = 500;

describe("settleChoice", () => {
  let saved: string;
  let settle: Settle<string>;

  beforeEach(() => {
    vi.useFakeTimers();
    saved = "one";
    settle = settleChoice<string>({ waitMs: WAIT, saved: () => saved });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts a round on the first choice and resolves with it after the wait, not before", async () => {
    const round = settle.choose("sizes");
    expect(round).not.toBeNull();
    let value: string | null | undefined;
    void round?.then((v) => (value = v));
    await vi.advanceTimersByTimeAsync(WAIT - 1);
    expect(value).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(value).toBe("sizes");
  });

  it("takes later choices into the waiting round, restarts the wait, and resolves with the last", async () => {
    const round = settle.choose("sizes");
    await vi.advanceTimersByTimeAsync(WAIT - 1);
    expect(settle.choose("market"), "no second round").toBeNull();
    let value: string | null | undefined;
    void round?.then((v) => (value = v));
    await vi.advanceTimersByTimeAsync(WAIT - 1);
    expect(value, "the wait started again").toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(value).toBe("market");
  });

  it("resolves null when the walk ends on the saved choice", async () => {
    const round = settle.choose("sizes");
    settle.choose("market");
    settle.choose("one");
    let value: string | null | undefined;
    void round?.then((v) => (value = v));
    await vi.advanceTimersByTimeAsync(WAIT);
    expect(value).toBeNull();
  });

  it("starts a new round once one has resolved", async () => {
    const first = settle.choose("sizes");
    await vi.advanceTimersByTimeAsync(WAIT);
    await expect(first).resolves.toBe("sizes");
    const second = settle.choose("market");
    expect(second).not.toBeNull();
    await vi.advanceTimersByTimeAsync(WAIT);
    await expect(second).resolves.toBe("market");
  });

  it("compares a round that starts while the last value is on its way against that value, until it is finished", async () => {
    const first = settle.choose("sizes");
    await vi.advanceTimersByTimeAsync(WAIT);
    await expect(first).resolves.toBe("sizes");
    // The save of "sizes" is still on its way: the prop still says "one".
    const back = settle.choose("sizes");
    await vi.advanceTimersByTimeAsync(WAIT);
    await expect(
      back,
      "sizes is what was sent, so nothing",
    ).resolves.toBeNull();
    settle.finished("sizes");
    saved = "sizes";
    const next = settle.choose("one");
    await vi.advanceTimersByTimeAsync(WAIT);
    await expect(next).resolves.toBe("one");
  });
});
