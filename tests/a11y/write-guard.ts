import { expect, test, type BrowserContext, type Page } from "@playwright/test";

// The gate never sends a write (D-108, D-115). Every owner test runs behind
// this guard, the shared page checks included: it sits on the browser
// context and sees every request to every origin.
//
// A GET goes through. A request to the site that is not a GET is answered
// inside the browser with the response Next gives for an action it does not
// know, the case a save from before a deploy meets (Q-41), and is never
// passed to the network. A request that is not a GET to any other origin is
// stopped and fails the test: owner pages make none, since the session is
// refreshed on the server and nothing in the app calls another origin from
// the browser. A task that adds one names it here.
//
// After each test every such request must have been answered here, and
// there must have been none at all unless the test said it expects them. So
// a walk that tabs through every field proves that an unchanged field
// writes nothing, and a test that presses Save or Move proves what the page
// does when the save cannot land.

type Guard = {
  attempted: string[];
  answered: string[];
  stopped: string[];
  expected: boolean;
  held: Promise<void>;
  release: () => void;
};

const guards = new WeakMap<BrowserContext, Guard>();

// Call once at the top of an owner spec file. The hooks are the file's own,
// so they cover every test in it, whoever registers the test.
export function guardWrites(): void {
  test.beforeEach(async ({ context, baseURL }) => {
    if (!baseURL) throw new Error("the write guard needs a baseURL");
    const origin = new URL(baseURL).origin;
    const guard: Guard = {
      attempted: [],
      answered: [],
      stopped: [],
      expected: false,
      held: Promise.resolve(),
      release: () => {},
    };
    guards.set(context, guard);

    context.on("request", (request) => {
      if (request.method() === "GET") return;
      if (new URL(request.url()).origin === origin) {
        guard.attempted.push(request.url());
      }
    });

    await context.route("**/*", async (route) => {
      const request = route.request();
      if (request.method() === "GET") {
        await route.fallback();
        return;
      }
      if (new URL(request.url()).origin !== origin) {
        guard.stopped.push(`${request.method()} ${request.url()}`);
        await route.abort();
        return;
      }
      guard.answered.push(request.url());
      await guard.held;
      await route.fulfill({
        status: 404,
        headers: { "x-nextjs-action-not-found": "1" },
        body: "",
      });
    });
  });

  test.afterEach(async ({ context }) => {
    const guard = guards.get(context);
    if (!guard) return;
    guard.release();
    expect(
      guard.stopped,
      "no request that is not a GET may go to another origin",
    ).toEqual([]);
    expect(
      guard.attempted,
      "every request that was not a GET was answered in the browser",
    ).toEqual(guard.answered);
    if (!guard.expected) {
      expect(guard.attempted, "this test must not send a write").toEqual([]);
    }
  });
}

// For a test that presses a control that saves. With hold, the answer waits
// until the test releases it, so the pending state can be looked at first.
export function expectWrites(page: Page, { hold = false } = {}) {
  const guard = guards.get(page.context());
  if (!guard) throw new Error("this spec file does not call guardWrites()");
  guard.expected = true;
  if (hold) {
    guard.held = new Promise<void>((resolve) => {
      guard.release = resolve;
    });
  }
  return {
    attempted: guard.attempted,
    answered: guard.answered,
    release: () => guard.release(),
  };
}
