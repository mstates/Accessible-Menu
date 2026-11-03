// `npm run local`: the checks that need a save to land (D-142). It starts
// the Supabase stand-in in this folder, builds the app against it, serves
// the build on this machine, runs the specs in tests/local, then stops both.
// Nothing here reaches a real Supabase project: every value it sets is a
// stand-in value, and the specs' config stops unless both addresses are on
// this machine.
//
// It must run on any change to src/ui/TextField.tsx or
// src/features/owner/editing, and in the session that reads each month's
// Dependabot run whenever React, React Aria, or Next moves (D-142).
//
//   npm run local                    build, serve, run tests/local
//   npm run local -- --owner-gate    then the whole owner gate, against the
//                                    same stand-in, freshly seeded
//   npm run local -- --public-gate   then the public gate, against the same
//                                    stand-in, whose diner pages are the
//                                    stand-in restaurant's; PUBLIC_GATE_PROJECTS
//                                    narrows it, as "chromium-*" does, and
//                                    OWNER_GATE_PROJECTS the owner gate
//   npm run local -- --gates-only --owner-gate
//                                    the gate alone, without the local specs
//                                    first; needs --owner-gate, --public-gate,
//                                    or both
//   npm run local -- --gates-only --public-gate --update-snapshots
//                                    the gate run writes every aria snapshot
//                                    file it visits again, from the page's
//                                    raw tree through the rules in
//                                    tests/a11y/snapshot-files.mjs, and reads
//                                    the page against it (D-194); the
//                                    commands, one project per gate, are in
//                                    tests/a11y/aria-snapshot.ts
//   npm run local -- --no-build      serve the build already in .next-local,
//                                    which this script built
//   npm run local -- --grep "<title>"
//                                    only the tests in tests/local whose
//                                    title matches: every argument this
//                                    script does not use itself goes to
//                                    their Playwright run
//   npm run hear                     macOS only: build, serve, and run
//                                    tests/local/voiceover.hear.ts in the
//                                    voiceover-chromium project, VoiceOver
//                                    driven through Guidepup (D-194 (b),
//                                    D-202); no local specs, no gate
//   npm run hear -- --project=voiceover-webkit
//                                    the same in Playwright's WebKit, a hint
//                                    only, since it is not Safari; --grep and
//                                    --no-build pass through as above
//   npm run hear -- --restore        only the clean up below, for a run that
//                                    was killed before it could clean up
//
// npm run hear runs on this Mac whenever React Aria, Next, or Playwright
// moves, beside the npm run local rule above (D-142, D-202), never in CI.
// Before a run, turn on Visual Studio Code's two switches in System
// Settings, Privacy & Security, one under Accessibility and one under Full
// Disk Access, quit and reopen Visual Studio Code for Full Disk Access to
// take, and turn VoiceOver off; turn both switches off again after. Without
// Full Disk Access, macOS refuses VoiceOver's preferences folder as another
// app's data, with no prompt and no switch of its own. The first run in each
// browser raises macOS's Automation prompt, Visual Studio Code asking to
// control Google Chrome for Testing or Playwright (WebKit): allow it, once
// each; while it stands, Guidepup's activation of the browser times out and
// that test fails, and the next test activates. Keep your hands off the Mac
// while it runs: the keys go to the front window. Each test writes what
// VoiceOver said to tests/local/hear-logs, which git ignores.
//
// What it changes on the Mac (D-203): Guidepup starts VoiceOver on its own
// portable preferences, from a disk image this script fetches into
// tests/local/hear-cache and checks against the sha256 in the installed
// Guidepup's manifest; @guidepup/setup is never run. Guidepup adds its
// identifier to VoiceOver's local plist and makes four symlinks beside it,
// and never takes them out. This script detaches Guidepup's image before and
// after every run, copies the local plist into hear-cache once before
// Guidepup first changes it, and after every run puts back exactly what
// Guidepup added, printing what it put back and what it left alone
// (tests/local/hear-mac.mjs). It refuses to start while VoiceOver is on, and
// a run that ends with VoiceOver still on fails and says so.
//
// The ports are fixed, 54400 for the stand-in and 3200 for the app. When
// one is held, this script names the holder, its PID and command line
// through lsof and ps, and refuses to start: the holder may be another
// run.mjs, one typed in a Terminal window, so nothing is ever killed here;
// wait for it to finish, then run again.
//
// The build goes to .next-local, so .next, where next dev, npm run build,
// and the gate's build go, never holds a build against the stand-in.
import { spawn, spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { createConnection } from "node:net";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const args = process.argv.slice(2);
const build = !args.includes("--no-build");
const ownerGate = args.includes("--owner-gate");
const publicGate = args.includes("--public-gate");
const updateSnapshots = args.includes("--update-snapshots");
const gatesOnly = args.includes("--gates-only");
const restore = args.includes("--restore");
// npm run hear passes --hear itself, so --restore arrives beside it and wins.
const hear = args.includes("--hear") && !restore;
const ownFlags = [
  "--no-build",
  "--owner-gate",
  "--public-gate",
  "--update-snapshots",
  "--gates-only",
  "--hear",
  "--restore",
];
// The rest is for the local specs' Playwright run, --grep among them.
const playwrightArgs = args.filter((arg) => !ownFlags.includes(arg));
// The gate runs write their snapshot files only when asked (the helper in
// tests/a11y/aria-snapshot.ts reads the flag); the local specs hold none.
const gateEnv = updateSnapshots ? { A11Y_UPDATE_SNAPSHOTS: "1" } : {};

const STANDIN_PORT = 54400;
const APP_PORT = 3200;
const standin = `http://127.0.0.1:${STANDIN_PORT}`;
const app = `http://localhost:${APP_PORT}`;

// Every value the app and the checks read, all of them stand-ins. The
// command line wins over .env.local, for Next and for the owner gate.
const env = {
  ...process.env,
  STANDIN_PORT: String(STANDIN_PORT),
  NEXT_PUBLIC_SUPABASE_URL: standin,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_standin",
  A11Y_OWNER_EMAIL: "owner@example.test",
  A11Y_OWNER_PASSWORD: "standin",
  A11Y_OWNER_CODE: "12345678",
  LOCAL_BASE_URL: app,
  NEXT_DIST_DIR: ".next-local",
  // The address finder's Google is the stand-in too (D-83): its key, and
  // the origin its fake Places endpoints answer at.
  GOOGLE_PLACES_API_KEY: "standin-places-key",
  GOOGLE_PLACES_ORIGIN: standin,
};

const bin = (name) => `${root}node_modules/.bin/${name}`;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function portTaken(port) {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host: "127.0.0.1" });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

// Who holds a port: each listener's PID with its command line, from lsof
// and ps, so a refusal says what is there. Empty when neither can say.
function holders(port) {
  const read = (command, commandArgs) =>
    spawnSync(command, commandArgs, { encoding: "utf8" }).stdout ?? "";
  const pids = read("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"])
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
  return pids.map((pid) => {
    const line = read("ps", ["-o", "command=", "-p", pid]).trim();
    return `PID ${pid}: ${line === "" ? "(no command line read)" : line}`;
  });
}

async function until(url, what) {
  for (let tries = 0; tries < 600; tries += 1) {
    try {
      await fetch(url);
      return;
    } catch {
      await wait(200);
    }
  }
  throw new Error(`${what} did not answer at ${url}`);
}

// A process of its own group, so stopping it stops what it started.
function start(command, commandArgs, label) {
  const child = spawn(command, commandArgs, {
    cwd: root,
    env,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const prefix = (chunk) =>
    chunk
      .toString()
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => `[${label}] ${line}\n`)
      .join("");
  child.stdout.on("data", (chunk) => process.stdout.write(prefix(chunk)));
  child.stderr.on("data", (chunk) => process.stderr.write(prefix(chunk)));
  return child;
}

function stop(child) {
  if (child && child.exitCode === null) {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      // Already gone.
    }
  }
}

function run(command, commandArgs, extra = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, commandArgs, {
      cwd: root,
      env: { ...env, ...extra },
      stdio: "inherit",
    });
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

// The Mac side of npm run hear, loaded only for it, so npm run local reads
// nothing of Guidepup's.
const mac =
  hear || restore
    ? await import(new URL("./hear-mac.mjs", import.meta.url).href)
    : null;
// The clean up after Guidepup, run after every hear run and by --restore.
// It waits up to ten seconds for VoiceOver to be off, since Guidepup's stop
// may still be quitting it when Playwright exits; with VoiceOver still on
// after that, it says so and leaves everything as it is.
async function cleanUp() {
  for (let check = 0; check < 20 && mac.voiceOverRunning(); check += 1) {
    await new Promise((done) => setTimeout(done, 500));
  }
  if (mac.voiceOverRunning()) {
    console.error(
      "VoiceOver is still on after the run: turn it off with Command-F5, then run npm run hear -- --restore.",
    );
    return false;
  }
  mac.detach();
  return mac.putBack();
}

if (hear || restore) {
  const refusal =
    process.platform !== "darwin"
      ? "npm run hear runs only on macOS, where VoiceOver is."
      : ownerGate || publicGate || gatesOnly
        ? "npm run hear runs on its own, without the gates."
        : mac.voiceOverRunning()
          ? "VoiceOver is on: turn it off with Command-F5, then run this again."
          : null;
  if (refusal) {
    console.error(refusal);
    process.exit(1);
  }
}
if (restore) {
  process.exit((await cleanUp()) ? 0 : 1);
}

let standinProcess;
let appProcess;
let failed = false;
try {
  if (hear) {
    await mac.image();
    mac.detach();
    mac.backupOnce();
  }
  if (gatesOnly && !ownerGate && !publicGate) {
    throw new Error(
      "nothing to run: --gates-only needs --owner-gate or --public-gate",
    );
  }
  for (const [port, what] of [
    [STANDIN_PORT, "the stand-in"],
    [APP_PORT, "the app"],
  ]) {
    if (await portTaken(port)) {
      const who = holders(port);
      const by =
        who.length === 0 ? "a process lsof could not name" : who.join("; ");
      throw new Error(
        `port ${port}, for ${what}, is already in use by ${by}.\n` +
          "That may be another run.mjs, one typed in a Terminal window. " +
          "Do not kill it: wait for it to finish, then run this again.",
      );
    }
  }

  standinProcess = start(
    process.execPath,
    [`${root}tests/local/fake-supabase.mjs`],
    "stand-in",
  );
  await until(`${standin}/__test/menus`, "the stand-in");

  if (build && (await run(bin("next"), ["build"])) !== 0) {
    throw new Error("the build against the stand-in failed");
  }
  // The diner pages' route cache and data cache from the last run live on
  // disk and outlast a build, so a code a test created would still answer;
  // a fresh stand-in gets a fresh cache, as a new deployment does.
  for (const folder of ["server/route-cache", "cache/fetch-cache"]) {
    rmSync(`${root}.next-local/${folder}`, { recursive: true, force: true });
  }

  appProcess = start(bin("next"), ["start", "-p", String(APP_PORT)], "app");
  await until(app, "the app");

  if (hear) {
    // A fresh stand-in, as the gates get, then the readings alone, in
    // Chromium unless a project is named.
    await fetch(`${standin}/__test/reset`);
    const named = playwrightArgs.some((arg) => arg.startsWith("--project"));
    const voice = await run(
      bin("playwright"),
      [
        "test",
        "-c",
        "tests/local/playwright.config.ts",
        ...(named ? [] : ["--project=voiceover-chromium"]),
        ...playwrightArgs,
      ],
      { A11Y_HEAR: "1", GUIDEPUP_SCREEN_READERS_PATH: mac.cachePath },
    );
    failed ||= voice !== 0;
  }

  if (!gatesOnly && !hear) {
    const local = await run(bin("playwright"), [
      "test",
      "-c",
      "tests/local/playwright.config.ts",
      ...playwrightArgs,
    ]);
    failed ||= local !== 0;
  }

  if (ownerGate) {
    await fetch(`${standin}/__test/reset`);
    const projects = process.env.OWNER_GATE_PROJECTS
      ? [`--project=${process.env.OWNER_GATE_PROJECTS}`]
      : [];
    const gate = await run(bin("playwright"), ["test", ...projects], {
      ...gateEnv,
      A11Y_SCOPE: "owner",
      A11Y_BASE_URL: app,
    });
    failed ||= gate !== 0;
  }

  if (publicGate) {
    await fetch(`${standin}/__test/reset`);
    const projects = process.env.PUBLIC_GATE_PROJECTS
      ? [`--project=${process.env.PUBLIC_GATE_PROJECTS}`]
      : [];
    const gate = await run(bin("playwright"), ["test", ...projects], {
      ...gateEnv,
      A11Y_BASE_URL: app,
      A11Y_MENU_CODE: "12345678",
    });
    failed ||= gate !== 0;
  }
} catch (error) {
  failed = true;
  console.error(error instanceof Error ? error.message : error);
} finally {
  stop(appProcess);
  stop(standinProcess);
  if (hear) {
    // Failed or not, and even when the run never reached the readings, so a
    // detach before it is matched by one after.
    failed = !(await cleanUp()) || failed;
  }
}

console.log(
  "\n.next-local holds the build against the stand-in; .next is untouched.",
);
process.exit(failed ? 1 : 0);
