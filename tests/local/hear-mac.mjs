// The Mac side of `npm run hear` (D-194 (b), D-202, D-203): what Guidepup
// needs before it can start VoiceOver, and what it leaves behind after.
//
// Guidepup runs VoiceOver on its own portable preferences, from a disk image
// it attaches on every start. @guidepup/setup is never run here; its install
// step would only download that image, so image() fetches the one image the
// installed @guidepup/guidepup names in its manifest.json and checks it
// against the sha256 in that same file, so the lockfile pins it. The image
// lives in tests/local/hear-cache, which git ignores, and run.mjs points
// Guidepup there with GUIDEPUP_SCREEN_READERS_PATH.
//
// On every start Guidepup also changes two things in VoiceOver's preferences
// folder and never changes them back (read in @guidepup/guidepup 0.40.0,
// lib/macOS/VoiceOver/preferences): it adds its identifier to
// SCRCUserDefaultsAlwaysUsePortableIDs in com.apple.VoiceOver4.local.plist
// (trustPortableIdentifier.js), and it makes four symlinks,
// com.apple.VoiceOver4.portable.*, to its mounted volume
// (createPortableSymlinks.js). putBack() takes out exactly those, and only
// those: the one array entry equal to Guidepup's identifier, the array itself
// only when that leaves it empty and the backup shows it was not there before
// Guidepup, and each symlink whose target is Guidepup's mount path. Anything
// else is left alone and printed. Then cfprefsd is restarted, as Guidepup
// does, so a cached copy does not write the entry back. backupOnce() copies
// the local plist into hear-cache before Guidepup's first change, once.
//
// detach() takes off any attached Guidepup image, found by its image path as
// Guidepup's own detach does (detachPortablePreferences.js), so a run that was
// killed is repaired by the next one, or by npm run hear -- --restore.
//
// Guidepup's own values are read from its installed files: manifest.json,
// lib/macOS/VoiceOver/preferences/constants.js, and the plist parser it
// depends on. A Guidepup release that moves them fails at the require below;
// read the new release's preferences folder before changing the paths.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { homedir, release } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const guidepupMain = require.resolve("@guidepup/guidepup");
const manifest = require("@guidepup/guidepup/manifest.json");
const {
  GUIDEPUP_IDENTIFIER,
  MOUNT_POINT,
  PREFERENCES_PATH,
} = require("@guidepup/guidepup/lib/macOS/VoiceOver/preferences/constants.js");
const plist = createRequire(guidepupMain)("plist");

export const cachePath = fileURLToPath(new URL("hear-cache", import.meta.url));

const KEY = "SCRCUserDefaultsAlwaysUsePortableIDs";
const LOCAL = "com.apple.VoiceOver4.local.plist";
const backupPath = join(cachePath, LOCAL);

// The folder Guidepup picks (getPreferencesDirectory.js).
function preferencesDirectory() {
  const group = join(
    homedir(),
    "Library",
    "Group Containers",
    "group.com.apple.VoiceOver",
    "Library",
    "Preferences",
  );
  return existsSync(group) ? group : join(homedir(), "Library", "Preferences");
}

const localPlist = () => join(preferencesDirectory(), LOCAL);

const read = (command, args) =>
  spawnSync(command, args, { encoding: "utf8", timeout: 20_000 });

// The asset for this macOS (os.release()'s major, as getManifestAsset.js
// reads it) and where Guidepup looks for it under the cache
// (resolveDmgPath.js).
function asset() {
  const platformVersion = release().split(".", 1)[0];
  const found = manifest.screenReaders
    .find(({ id }) => id === "voiceover")
    ?.assets.find((entry) => entry.platformVersion === platformVersion);
  if (!found) {
    throw new Error(
      "Guidepup has no VoiceOver preferences for this macOS version.",
    );
  }
  return {
    ...found,
    path: join(
      cachePath,
      "voiceover",
      found.platformVersion,
      found.version,
      found.asset,
    ),
  };
}

const sha256 = (file) =>
  createHash("sha256").update(readFileSync(file)).digest("hex");

// The image Guidepup attaches, fetched once from the release the manifest
// names (the URL @guidepup/setup builds, download-assets.js), and checked
// against the manifest's sha256 on every run.
export async function image() {
  const wanted = asset();
  if (!existsSync(wanted.path)) {
    const source = `https://github.com/${wanted.repository}/releases/download/${wanted.version}/${wanted.asset}`;
    console.log(`Fetching Guidepup's VoiceOver preferences from ${source}`);
    const response = await fetch(source);
    if (!response.ok) {
      throw new Error(
        `The VoiceOver preferences image could not be fetched (${response.status}).`,
      );
    }
    mkdirSync(dirname(wanted.path), { recursive: true });
    writeFileSync(wanted.path, Buffer.from(await response.arrayBuffer()));
  }
  if (sha256(wanted.path) !== wanted.sha256) {
    rmSync(wanted.path, { force: true });
    throw new Error(
      "The VoiceOver preferences image did not match Guidepup's checksum, so it was deleted; run npm run hear again to fetch it.",
    );
  }
  return wanted.path;
}

// Every attached image whose path is Guidepup's image: unmounted with umount,
// then detached, its shadow file removed, as detachPortablePreferences.js
// does. Each step is printed.
export function detach() {
  const wanted = asset().path;
  const info = read("/usr/bin/hdiutil", ["info", "-plist"]);
  const images =
    info.status === 0 ? (plist.parse(info.stdout).images ?? []) : [];
  for (const attached of images) {
    if (attached["image-path"] !== wanted) continue;
    const entities = attached["system-entities"] ?? [];
    for (const { "mount-point": mountPoint } of entities) {
      if (!mountPoint) continue;
      const done = read("/sbin/umount", [mountPoint]);
      console.log(
        `${done.status === 0 ? "Unmounted" : "Could not unmount"} ${mountPoint}`,
      );
    }
    const device = entities[0]?.["dev-entry"];
    if (device) {
      const done = read("/usr/bin/hdiutil", ["detach", device]);
      console.log(
        `${done.status === 0 ? "Detached" : "Could not detach"} Guidepup's image at ${device}`,
      );
    }
  }
  rmSync(`${wanted}.shadow`, { force: true });
  if (existsSync(MOUNT_POINT)) {
    console.log(`Still mounted, left alone: ${MOUNT_POINT}`);
  }
}

// macOS refuses VoiceOver's preferences folder, with no prompt, to a process
// without Full Disk Access, and existsSync would read that refusal as no
// file, so the folder is listed first and a refusal is said as one.
const REFUSED =
  "macOS refused VoiceOver's preferences folder: turn on Full Disk Access for Visual Studio Code, quit and reopen it";

function readable() {
  try {
    readdirSync(preferencesDirectory());
    return true;
  } catch {
    return false;
  }
}

// VoiceOver's local plist, copied once into hear-cache before Guidepup first
// changes it.
export function backupOnce() {
  if (!readable()) throw new Error(`${REFUSED}, then run this again.`);
  const local = localPlist();
  if (!existsSync(local)) {
    throw new Error(
      "VoiceOver has no local preferences yet: turn it on once with Command-F5, then off, and run this again.",
    );
  }
  if (!existsSync(backupPath)) {
    mkdirSync(cachePath, { recursive: true });
    copyFileSync(local, backupPath);
    console.log(
      `VoiceOver's local preferences, as they were, are copied to ${backupPath}`,
    );
  }
}

// The trust array from a plist file, or null when it has no such key.
function trusted(file) {
  const done = read("/usr/bin/plutil", [
    "-extract",
    KEY,
    "json",
    "-o",
    "-",
    file,
  ]);
  return done.status === 0 ? JSON.parse(done.stdout) : null;
}

function guidepupLinks(folder) {
  const ours = [];
  const others = [];
  for (const name of readdirSync(folder)) {
    if (!name.startsWith("com.apple.VoiceOver4.portable")) continue;
    const path = join(folder, name);
    const stat = lstatSync(path);
    if (stat.isSymbolicLink() && readlinkSync(path) === PREFERENCES_PATH) {
      ours.push(path);
    } else {
      others.push(path);
    }
  }
  return { ours, others };
}

// Takes out exactly what Guidepup added, prints what it put back and what it
// left alone, and returns false when something of Guidepup's is still there.
export function putBack() {
  if (!readable()) {
    console.error(
      `Nothing was put back. ${REFUSED}, then run npm run hear -- --restore.`,
    );
    return false;
  }
  const folder = preferencesDirectory();
  const local = localPlist();
  const buddy = (command) =>
    read("/usr/libexec/PlistBuddy", ["-c", command, local]).status === 0;
  const putBackLines = [];
  const leftAlone = [];

  const before = trusted(local);
  if (Array.isArray(before)) {
    const index = before.indexOf(GUIDEPUP_IDENTIFIER);
    if (index !== -1 && buddy(`Delete :${KEY}:${index}`)) {
      putBackLines.push(`Guidepup's entry in ${KEY}`);
    }
    const now = trusted(local) ?? [];
    const others = now.filter((entry) => entry !== GUIDEPUP_IDENTIFIER);
    if (now.length === 0) {
      const backup = existsSync(backupPath) ? trusted(backupPath) : undefined;
      if (backup === null && buddy(`Delete :${KEY}`)) {
        putBackLines.push(`${KEY} itself, absent before Guidepup`);
      } else {
        leftAlone.push(`${KEY}, empty`);
      }
    } else if (others.length > 0) {
      leftAlone.push(`${KEY} entries not Guidepup's: ${others.join(", ")}`);
    }
  }

  const { ours, others } = guidepupLinks(folder);
  for (const path of ours) {
    unlinkSync(path);
    putBackLines.push(`the link ${path}`);
  }
  for (const path of others) leftAlone.push(path);

  read("/usr/bin/killall", ["cfprefsd"]);
  spawnSync("/bin/sleep", ["1"]);

  const after = trusted(local);
  const entryStays =
    Array.isArray(after) && after.includes(GUIDEPUP_IDENTIFIER);
  const linksStay = guidepupLinks(folder).ours;
  console.log(
    putBackLines.length === 0
      ? "Put back: nothing of Guidepup's was in VoiceOver's preferences."
      : `Put back: ${putBackLines.join("; ")}.`,
  );
  if (leftAlone.length > 0) console.log(`Left alone: ${leftAlone.join("; ")}.`);
  if (entryStays || linksStay.length > 0) {
    console.error(
      `Still there after the put back: ${[
        ...(entryStays ? [`Guidepup's entry in ${KEY}`] : []),
        ...linksStay,
      ].join("; ")}.`,
    );
    return false;
  }
  return true;
}

export function voiceOverRunning() {
  return read("/usr/bin/pgrep", ["-x", "VoiceOver"]).status === 0;
}
