# CLAUDE.md

Accessible Menu (working title). A hosted, accessible restaurant menu. An owner imports a menu once and gets a permanent link, a QR code, and, after MVP, a braille-and-NFC sign. Diners scan or tap and get a static HTML page anyone can read. Menu only. No ordering, no payments, no POS writes.

You are working with Michael, a senior accessibility engineer (IAAP CPWA) with fifteen-plus years of full-stack and design experience. Apply WCAG; do not explain it to him. Keep answers concise and specific. When he asks for a decision, give one recommendation with the tradeoff, not a menu of options, unless he asks for options. End substantive replies with a status block (see "Session shape").

## Where the truth lives

All project knowledge is in Notion under the page "Accessible Menu". Read it through the Notion MCP at the start of every session, before writing any code.

- Parent page, with the status block: https://app.notion.com/p/3e9532d2cbd281b49ba7dbbe2e5490d6
- Spec (product, data model, import pipeline, test plan): https://app.notion.com/p/3e9532d2cbd2812a8dc0e96270c0b8a9
- Build plan (phases, checklists, acceptance, current phase): https://app.notion.com/p/3e9532d2cbd2810c9677fa184e349b47
- Architecture (layout and module rules): https://app.notion.com/p/3e9532d2cbd281f48600fd478dd89593
- Decisions (append-only): https://app.notion.com/p/3e9532d2cbd281b4bdddefdde7ea0be5
- Questions (open items, each with a default and a reversibility rating): https://app.notion.com/p/3e9532d2cbd28152b6cde5cc0367fed4
- Research: diners: https://app.notion.com/p/3e9532d2cbd281b6bbe1ffe0b0bf0827
- Research: dining out: https://app.notion.com/p/3e9532d2cbd2819998c1dfef9362559d

Read in this order: Build plan (current phase and unchecked tasks), Questions (anything open that touches the phase), the Spec sections the phase touches, Architecture. Open Decisions when something looks settled and you want the reason.

If the Notion MCP is not connected, stop and say so. Do not work from memory of these pages and do not recreate them in the repo. There is no docs folder here on purpose.

This file restates the rules that never bend so they are in front of you on every turn. When this file and Notion disagree, Notion wins. Say so and keep going.

## Rules that never bend

- Menu only. No ordering.
- The template is the accessibility. Owners fill fields; pages are generated. No PDFs or free-form HTML on diner pages. Photos require alt text. Allergens are confirmed by the owner, never auto-published.
- Diners never sign in, never see a cookie banner, are never tracked individually. Diner pages set no cookies and load no third-party scripts. Counts, never people.
- Every menu ends with two quiet links: "Feedback about this menu" (also the barrier report) and "Accessibility statement."
- Claims: "built to WCAG 2.2 AA and tested with real screen readers on every release, barriers fixed within five business days." Never "compliant," "certified," "guaranteed," "100%," or "lawsuit-proof."
- Signs are produced by a certified ADA sign partner. We never make braille ourselves.
- A restaurant's menu URL is permanent. The path is `/m/` plus the restaurant's eight-digit code on one domain, built only by `src/domain/menu-url.ts` (D-86, D-88). It never changes and never redirects away.
- Stack is decided: Next.js App Router, TypeScript strict, Tailwind, React Aria Components, Supabase, Stripe, Vercel. Do not propose swaps.
- Writing: plain language, warm, short sentences. No em dashes anywhere, code comments included. Never "AI" in product copy ("we read your menu for you"). Allergens spelled out in words.

## How to work

- One phase at a time. The Build plan page names the current phase. A phase is done when every acceptance line is true on the Vercel preview on a real phone, including the accessibility lines. Do not start the next phase early.
- Check tasks in the Build plan as they land. Add notes under a phase, never new features.
- When a task hits a question the Spec, Decisions, and Architecture do not answer: if it is cheap and local, implement the default, add a row to Questions marked "defaulted," and say so in the session summary. If it is medium or expensive, or touches the data model, auth, billing, the import schema, or the sign flow, stop, add a row marked "open," and ask.
- When something is not covered, propose a default with a reversibility rating (cheap, medium, expensive). Do not invent a feature.
- Decisions is append-only. A later decision may supersede an earlier one; say so in the new row.
- Parked means absent. No feature flags, no stubs, no "coming soon" for parked features. The Spec lists what is parked.
- Never ask Michael for context that is in Notion. Read it.

## Session shape

Start: read Notion as above, including the Status section on the parent page, then state the phase and the task you are picking up in two lines.

End: a session summary in chat with four parts: what changed, what is untested, proposals, spec questions. Then update the Status section on the parent Notion page: settled, parked, open, waiting on Michael, build phase, next smallest step.

## Stack and layout

Decided and not up for discussion: Next.js App Router, TypeScript strict, Tailwind, React Aria Components for every interactive primitive, Supabase (Postgres, Auth, Storage, RLS from the first migration), Stripe Checkout and Billing, Vercel with previews per branch and a manual production promote.

The layout is in the Architecture page. In short: `app/` holds routes (marketing, `m/[code]` diner menu, `a11y/[code]` statement, `d/[city]` directory, `feedback/[code]`, `app/` owner area, `api/` route handlers). `src/domain` is pure types and logic. `src/features` are islands (diner, owner, import, feedback, kit, directory, billing). `src/core` is infrastructure (supabase, model, stripe, cache, a11y). `src/ui` is tokens and primitives on React Aria Components. `src/copy` holds every user-facing string. `supabase/migrations` is numbered SQL. `tests/` is Vitest and Playwright.

## Module rules (short form; the Architecture page is canonical)

1. The diner side is static first. `app/m/[code]` renders complete HTML at build or revalidation time. Controls enhance that HTML; the page must be fully readable with JavaScript off.
2. Features import only from `domain`, `core`, `ui`, and `copy`. Never from another feature's internals.
3. Pure logic has no React or network imports and runs under Vitest in plain Node.
4. Every model call goes through `core/model` with a zod schema on both sides and a provider interface. Import output is data to review, never content to publish. Allergen suggestions from import are stored as suggestions and never rendered to diners.
5. Interactive semantics come from React Aria Components via `src/ui`. Never hand-roll dialogs, menus, tabs, or comboboxes.
6. User-facing strings live in `src/copy`. Components contain no literal copy. The copy guard test fails the build on em dashes, "AI", "compliant", "guaranteed", "100%".
7. Analytics is a plain image request for reads and an event request from the controls, deduped per hour in memory. No script, no cookie, nothing about the diner stored.
8. Prices, allergens, and dietary tags render through `domain` sentence builders in one place, so visible text, screen reader text, and read-aloud say the same thing. Icons sit next to those words, never in place of them.
9. Every item shows one of three allergen sentences. The exact wording lives in Spec 3.2 (D-35) and renders through `domain/allergens.ts`, along with the restaurant note and the confirmation line (D-36). Nothing reads as allergen-free unless a person said so. Allergen lines are always inline in the item, never behind a popover, dialog, or disclosure (D-40).
10. Device preferences (dark mode, invert, reduced motion, forced colors) are followed through media queries, never toggled in the page. In-site text size, contrast, language, and the allergen-lines choice are stored in local storage only.
11. No italics anywhere on a diner page, enforced in tokens and lint. Descriptions render in full, never truncated (D-39).
12. No helper until the third use. No generic utils folder. No dependency under fifty lines. Every dependency gets a one-line row in Decisions.
13. Never edit an applied migration. Add a new numbered one.
14. Every new function in `public` gets an explicit `revoke all ... from public` by name and a grant only to the role that needs it. PUBLIC holds execute on every new function through Postgres's global default, and migration one's per-schema default-privilege revoke cannot remove it.

## Commands and gates

- `npm run typecheck`, `npm run lint`, `npm run test`, `npm run a11y`. All four clean before any task is called done. `a11y` runs Playwright with axe against every diner page and a keyboard walk of every control.
- The copy guard is part of `test`. Run it before every commit.
- Production is promoted by hand. Never promote.

## Accessibility check before calling anything done

- axe clean on every diner page, zero violations.
- Keyboard-only walk of every control. Focus visible, order sensible, nothing trapped.
- VoiceOver on iOS Safari and TalkBack on Android Chrome, following the script in Spec 10: arrive, hear the allergen note and the confirmation line, jump to a section from the section list, read an item with its allergen sentence, hide allergen lines and confirm the note stays, read aloud, change language, submit feedback and hear the reference number. Run only the steps the current phase has built.
- 200% zoom, 320px reflow, text spacing override, largest phone text size. Nothing clipped, no horizontal scroll.
- Copy pass: no em dashes, no "AI", no "compliant", "guaranteed", or "100%".

## Never

- Add ordering, carts, payments for diners, or POS writes.
- Put a PDF, an image of a menu, or free-form HTML on a diner page.
- Publish an allergen the owner did not confirm.
- Set a cookie or load a third-party script on a diner page.
- Change a restaurant's code or add a redirect away from a menu URL.
- Write "compliant," "certified," "guaranteed," "100%," "lawsuit-proof," or "AI" in product copy.
- Use an em dash.
- Put an allergen sentence behind a popover, dialog, or disclosure, or let an owner hide allergen lines.
- Use italics on a diner page.
- Build a parked feature, add a feature flag for one, or leave a stub for one.
- Propose a stack swap.
- Recreate the Notion pages as files in this repo.
