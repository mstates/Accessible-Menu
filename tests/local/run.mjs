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
//   npm run local -- --no-build      serve the build already in .next, which
//                                    must have been built by this script
//
// Afterwards .next holds a build against the stand-in. `npm run a11y` builds
// again before it serves, so the gate never reads it.
import { spawn } from "node:child_process";
import { createConnection } from "node:net";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const args = process.argv.slice(2);
const build = !args.includes("--no-build");
const ownerGate = args.includes("--owner-gate");

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

let standinProcess;
let appProcess;
let failed = false;
try {
  for (const [port, what] of [
    [STANDIN_PORT, "the stand-in"],
    [APP_PORT, "the app"],
  ]) {
    if (await portTaken(port)) {
      throw new Error(`port ${port}, for ${what}, is already in use`);
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

  appProcess = start(bin("next"), ["start", "-p", String(APP_PORT)], "app");
  await until(app, "the app");

  const local = await run(bin("playwright"), [
    "test",
    "-c",
    "tests/local/playwright.config.ts",
  ]);
  failed ||= local !== 0;

  if (ownerGate) {
    await fetch(`${standin}/__test/reset`);
    const gate = await run(bin("playwright"), ["test"], {
      A11Y_SCOPE: "owner",
      A11Y_BASE_URL: app,
    });
    failed ||= gate !== 0;
  }
} catch (error) {
  failed = true;
  console.error(error instanceof Error ? error.message : error);
} finally {
  stop(appProcess);
  stop(standinProcess);
}

console.log(
  "\n.next now holds a build against the stand-in; npm run a11y builds again before it serves.",
);
process.exit(failed ? 1 : 0);
