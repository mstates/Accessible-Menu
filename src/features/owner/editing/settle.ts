// A choice that saves once it has settled (D-229): the price choice's
// radios are walked with the arrow keys, and every stop would otherwise be
// a save and a "Saved." (D-111, D-143). The first change starts a round;
// every change inside the wait restarts it; when the wait ends, the round
// resolves with the latest choice, or with null when the latest is the
// saved choice again, so nothing is sent and nothing is said. A round that
// has resolved is not finished until its caller says so, and a change
// made while a save is on its way starts the next round, which compares
// against the value just sent, not the stale prop. Pure: no React, no
// network, timers through the global so a test can stop the clock.

// Half a second after the last change (D-229).
export const SETTLE_MS = 500;

export type Settle<Value> = {
  // Records a choice. Returns the round's promise when this choice starts a
  // round, or null when a round is already waiting and took this choice in.
  choose(value: Value): Promise<Value | null> | null;
  // Says the round that resolved with this value has been dealt with, sent
  // or dropped, so the next choice compares against it.
  finished(value: Value): void;
};

export function settleChoice<Value>(options: {
  waitMs: number;
  saved: () => Value;
}): Settle<Value> {
  let latest: Value | null = null;
  let settled: Value | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let resolve: ((value: Value | null) => void) | null = null;

  const fire = () => {
    timer = null;
    const value = latest;
    const against = settled ?? options.saved();
    const done = resolve;
    resolve = null;
    latest = null;
    if (!done) return;
    if (value === null || value === against) {
      done(null);
      return;
    }
    settled = value;
    done(value);
  };

  return {
    choose(value) {
      latest = value;
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(fire, options.waitMs);
      if (resolve !== null) return null;
      return new Promise<Value | null>((done) => {
        resolve = done;
      });
    },
    finished(value) {
      if (settled === value) settled = null;
    },
  };
}
