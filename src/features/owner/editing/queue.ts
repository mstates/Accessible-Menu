// Saves run one after another, in the order they were made (D-111): each
// one records its own outcome before the next starts, so an add pressed
// while another is on its way waits its turn (D-125). Pure.

export type SaveQueue = {
  // Runs work once every run made before it has finished, well or not.
  run: (work: () => Promise<void>) => Promise<void>;
  // Settles once every run made so far has finished.
  idle: () => Promise<void>;
};

export function saveQueue(): SaveQueue {
  let tail: Promise<void> = Promise.resolve();
  return {
    run(work) {
      const before = tail;
      let finish = () => {};
      tail = new Promise<void>((resolve) => {
        finish = resolve;
      });
      return before.then(async () => {
        try {
          await work();
        } finally {
          finish();
        }
      });
    },
    idle: () => tail,
  };
}
