# Accessible Menu

Working title. A hosted restaurant menu that everyone can read.

A restaurant imports its menu once and gets a permanent link and a QR code. A braille-and-NFC sign for the door follows after the MVP. Diners scan or tap and get a plain HTML page. No app, no sign-in, no PDF.

- The promise to diners: if you see the sign, you can read the menu.
- The promise to owners: one import, a sign for the door, and you're done.

Menu only. No ordering, no payments, no POS writes.

## Status

In development, before launch. The current phase and the next step are in Notion, on the Build plan page. See [Where the truth lives](#where-the-truth-lives).

## Who it is for

- Diners who cannot use a paper or PDF menu: blind and low-vision diners, dyslexic diners, older diners, people reading in a second language, and anyone in a dim room.
- Independent restaurants and small groups whose QR code opens a scanned PDF today.

## How it stays accessible

The template is the accessibility. Owners fill in fields and the page is generated. No menu can ship as a PDF, a photo, or free-form HTML.

- **Static first.** A diner page is complete HTML. It reads in full with JavaScript off. Controls only add to it.
- **Words first.** Prices, allergens, and dietary tags are written as sentences in one place. The screen, the screen reader, and read aloud all say the same thing. Icons sit beside the words, never in place of them.
- **A person confirms allergens.** Nothing reads as allergen-free unless the owner said so. Allergen lines sit in the dish itself, never behind a popover or a disclosure.
- **Diners are anonymous.** Diner pages set no cookies and load no third-party scripts. Anything we count is a total, never a person.
- **Standard parts.** Every interactive control comes from React Aria Components through `src/ui`. No hand-rolled dialogs, menus, tabs, or comboboxes.
- **The device decides.** Dark mode, reduced motion, and forced colors follow the device's own settings.
- **Checked by machine and by ear.** axe and a keyboard walk run on every page in three browser engines. VoiceOver and TalkBack passes are done by hand before a phase closes.

What we say about it: built to WCAG 2.2 AA and tested with real screen readers on every release. We do not claim more than that.

## Stack

Next.js App Router, TypeScript in strict mode, Tailwind, React Aria Components, Supabase (Postgres, Auth, Storage, row level security), Stripe, and Vercel. The stack is settled. Versions are in `package.json`.

## Getting started

You need Node 24 (see `.nvmrc`) and npm.

```sh
npm install
cp .env.example .env.local
npm run dev
```

- `npm install` also points git at the hooks in `.githooks`.
- Fill in `.env.local` from the notes in `.env.example`. It is never committed. Keys go from the dashboard to that file by hand, never through a chat or a screenshot.
- The app runs at `http://localhost:3000`.

## Commands

| Command             | What it does                                                                                                                                 |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`       | Runs the app on this machine.                                                                                                                |
| `npm run typecheck` | Writes Next's route types, then checks TypeScript.                                                                                           |
| `npm run lint`      | ESLint, with the jsx-a11y rules.                                                                                                             |
| `npm run format`    | Prettier, writing changes. `npm run format:check` only checks.                                                                               |
| `npm test`          | Vitest unit tests, with the copy guard.                                                                                                      |
| `npm run a11y`      | The accessibility gate. Builds the app, serves it on port 3100, and runs Playwright with axe and a keyboard walk over the public pages.      |
| `npm run local`     | Starts a Supabase stand-in on this machine, builds against it, and runs the checks that need a save to land. Nothing reaches a real project. |
| `npm run hear`      | macOS only. Reads pages with VoiceOver through Guidepup. Run by hand, never in CI.                                                           |

A few variations:

- The gate against a Vercel preview: `A11Y_BASE_URL=https://your-preview.vercel.app npm run a11y`
- The owner screens, signed in as the test owner: `A11Y_SCOPE=owner npm run a11y`. It needs the test owner values described in `.env.example`.
- Either gate against the stand-in: `npm run local -- --owner-gate` or `npm run local -- --public-gate`.

Every option is listed at the top of `tests/local/run.mjs`. Read that file before the first `npm run hear`. It needs two macOS privacy switches turned on, and it says what it changes on the Mac.

## Before a change is done

- `npm run typecheck`, `npm run lint`, `npm test`, and `npm run a11y` are all clean.
- A keyboard-only walk of every control. Focus is visible, the order makes sense, nothing is trapped.
- 200% zoom, 320px width, the text spacing override, and the largest phone text size. Nothing is clipped and nothing scrolls sideways.
- VoiceOver on iOS Safari and TalkBack on Android Chrome for anything a diner touches.

The full checklist is in `CLAUDE.md`. The copy guard is part of `npm test`. It fails on em dashes and on the words we never use in product copy.

## Branches and releases

- `main` is the working branch. Every push gets a Vercel preview.
- GitHub Actions runs Checks (typecheck, lint, format check, unit tests, build) on every push to `main` and on pull requests.
- The accessibility gate runs against each Vercel preview, in Chromium, WebKit, and Firefox.
- Production is the `release` branch. It moves only by a merged pull request. A pre-push hook refuses a direct push.
- Promoting to production is done by hand, by the repo owner.

## Database

- Schema changes are numbered SQL files in `supabase/migrations`. An applied migration is never edited. Add a new one.
- Row level security is on from the first migration. Owners see only their own restaurants.
- `supabase/checks` holds SQL that is run by hand in the Supabase SQL editor: the owner boundary checks, and the data for the CI test restaurant.
- Remote Supabase commands such as `db push` are run by hand by the repo owner, after the migration has been read.

## Where things are

```txt
app/                   Routes: diner menu (m), statement (a11y), feedback,
                       owner area (app), sign-in (auth), route handlers (api).
src/domain/            Types and pure logic. No React, no network.
src/features/          Feature islands. They never import from each other.
src/core/              Infrastructure: Supabase, Stripe, cache, a11y helpers.
src/ui/                Design tokens and primitives on React Aria Components.
src/copy/              Every user-facing string.
supabase/migrations/   Numbered SQL.
supabase/checks/       SQL run by hand: boundary checks and CI test data.
tests/unit/            Vitest: domain logic, guards, the copy guard.
tests/a11y/            Playwright: axe, keyboard walks, aria snapshots.
tests/local/           Playwright against the stand-in, and the VoiceOver run.
```

A menu lives at `/m/` plus the restaurant's eight-digit code. That address is permanent. It never changes and never redirects away.

## Where the truth lives

Product knowledge lives in Notion, under the page "Accessible Menu": Spec, Build plan, Architecture, Decisions, Questions, and Research. There is no docs folder here on purpose.

- `CLAUDE.md` holds the rules that never bend and the link to each Notion page. This repo is built with Claude Code, which reads that file on every turn. The rules apply to people too.
- This README is the front door. It says what the project is and how to run it. If it disagrees with Notion, Notion wins.
