import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { en } from "../../src/copy";
import { Checkbox, CheckboxGroup } from "../../src/ui/CheckboxGroup";
import { ComboBox, suggestionItems } from "../../src/ui/ComboBox";
import { Radio, RadioGroup } from "../../src/ui/RadioGroup";
import { SearchField } from "../../src/ui/SearchField";
import { Select } from "../../src/ui/Select";
import { TextField } from "../../src/ui/TextField";

// While a field is invalid it is described by its problem alone; its hint
// stays on screen and is tied again once the field is valid (D-230, Q-157).
// Every primitive with a hint and a problem follows the rule: the hint's
// words leave React Aria's description slot while the field is invalid,
// and a hint shared by id (TextField's hintId) is left out of the field's
// describedby.
//
// Rendered on the server, as one-node.test.ts renders. There React Aria
// has not yet looked its slot ids up, so it lists both slot ids whatever
// the page holds; the client drops an id with no element in a layout
// effect. So these assertions go by element: the id on the element holding
// the hint's words, the id on the element holding the problem, and the
// shared hint's id. The gate holds the composed description in a browser.

const HINT = "For example, 11 am, 5:30 pm, or 17:30.";
const PROBLEM = "Add am or pm to the time it starts.";
const SHARED = "shared-hint";
const TIED = "day-error";

// A Select's or a ComboBox's children are rendered once more on the
// server inside an inert template, where React Aria's collection builder
// reads the items; its own components render nothing there, a plain
// element does, and none of it is on the page. Left out of the reading.
const render = (element: ReactElement) =>
  renderToStaticMarkup(element).replace(/<template>[\s\S]*?<\/template>/g, "");

// The items and groups take their children as props, typed, as
// one-node.test.ts hands a box its words.
type PropsOf<Group extends (props: never) => unknown> = Parameters<Group>[0];

function box(props: PropsOf<typeof Checkbox>) {
  return createElement(Checkbox, props);
}

function radio(props: PropsOf<typeof Radio>) {
  return createElement(Radio, props);
}

function boxes(props: PropsOf<typeof CheckboxGroup>) {
  return createElement(CheckboxGroup, props);
}

function radios(props: PropsOf<typeof RadioGroup>) {
  return createElement(RadioGroup, props);
}

// Every aria-describedby in the markup, each as its list of ids.
function describedBys(html: string): string[][] {
  return [...html.matchAll(/aria-describedby="([^"]*)"/g)].map((match) =>
    (match[1] ?? "").split(/\s+/).filter(Boolean),
  );
}

// The attributes of the one element whose text is exactly these words.
function holder(html: string, words: string): string {
  const escaped = words.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const found = [
    ...html.matchAll(new RegExp(`<(\\w+)([^>]*)>${escaped}</\\1>`, "g")),
  ];
  expect(found, `one element holds "${words}"`).toHaveLength(1);
  return found[0]?.[2] ?? "";
}

function idOf(attributes: string): string | null {
  return /\bid="([^"]*)"/.exec(attributes)?.[1] ?? null;
}

function expectNoIdTwice(html: string) {
  for (const ids of describedBys(html)) {
    expect(new Set(ids).size, `no id twice in "${ids.join(" ")}"`).toBe(
      ids.length,
    );
  }
}

// Invalid: the problem's element is tied once, the hint's words, when the
// field shows its own, sit in an element with no id, and the shared hint's
// id is nowhere.
function expectProblemAlone(
  html: string,
  { problemId, ownHint = true }: { problemId?: string; ownHint?: boolean } = {},
) {
  const problem = problemId ?? idOf(holder(html, PROBLEM));
  expect(problem, "the problem's element has an id").not.toBeNull();
  const ties = describedBys(html);
  expect(
    ties.some((ids) => ids.filter((id) => id === problem).length === 1),
    "the problem is tied to the field, once",
  ).toBe(true);
  if (ownHint) {
    expect(
      idOf(holder(html, HINT)),
      "the hint's words are shown, outside the description slot",
    ).toBeNull();
  }
  expect(ties.flat(), "the shared hint is not tied").not.toContain(SHARED);
  expectNoIdTwice(html);
}

// Valid: the hint's element is tied.
function expectHint(html: string) {
  const hint = idOf(holder(html, HINT));
  expect(hint, "the hint sits in the description slot, with an id").not.toBe(
    null,
  );
  expect(describedBys(html).flat(), "the hint is tied").toContain(hint);
  expectNoIdTwice(html);
}

describe("a text field", () => {
  it("invalid, its own hint is shown but not tied, and its problem is tied once", () => {
    expectProblemAlone(
      render(
        createElement(TextField, {
          id: "starts",
          label: "Starts",
          description: HINT,
          isInvalid: true,
          errorMessage: PROBLEM,
        }),
      ),
    );
  });

  it("valid, its own hint is tied", () => {
    expectHint(
      render(
        createElement(TextField, {
          id: "starts",
          label: "Starts",
          description: HINT,
        }),
      ),
    );
  });

  it("invalid, a hint shared by id is left out and the caller's own ids stay", () => {
    const html = render(
      createElement(TextField, {
        id: "opens",
        label: "Monday opens",
        hintId: SHARED,
        "aria-describedby": TIED,
        isInvalid: true,
        errorMessage: PROBLEM,
      }),
    );
    expectProblemAlone(html, { ownHint: false });
    expect(describedBys(html).flat()).toContain(TIED);
  });

  it("invalid by a day's problem alone, with no problem of its own, the shared hint is still left out", () => {
    const html = render(
      createElement(TextField, {
        id: "opens",
        label: "Monday opens",
        hintId: SHARED,
        "aria-describedby": TIED,
        isInvalid: true,
      }),
    );
    const ties = describedBys(html).flat();
    expect(ties).toContain(TIED);
    expect(ties).not.toContain(SHARED);
    expectNoIdTwice(html);
  });

  it("valid, a hint shared by id is tied after the caller's own ids", () => {
    const html = render(
      createElement(TextField, {
        id: "opens",
        label: "Monday opens",
        hintId: SHARED,
        "aria-describedby": TIED,
      }),
    );
    const input = describedBys(html).find((ids) => ids.includes(SHARED));
    expect(input, "the shared hint is tied").toBeDefined();
    expect(input?.indexOf(TIED)).toBeGreaterThanOrEqual(0);
    expect(input?.indexOf(SHARED)).toBeGreaterThan(input?.indexOf(TIED) ?? 0);
    expectNoIdTwice(html);
  });
});

describe("every other primitive with a hint and a problem", () => {
  const cases: [string, (invalid: boolean) => ReactElement][] = [
    [
      "a search field",
      (invalid) =>
        createElement(SearchField, {
          id: "finder",
          label: "Find the address",
          clearLabel: "Clear the address search",
          description: HINT,
          isInvalid: invalid,
          errorMessage: PROBLEM,
        }),
    ],
    [
      "a combo box",
      (invalid) =>
        createElement(ComboBox, {
          id: "size",
          label: "Size name",
          buttonLabel: "Show size names",
          description: HINT,
          isInvalid: invalid,
          errorMessage: PROBLEM,
          items: suggestionItems(["Cup", "Bowl"]),
          value: "Cup",
          onChange: () => {},
          onCommit: () => {},
        }),
    ],
    [
      "a select",
      (invalid) =>
        createElement(Select, {
          triggerId: "move",
          label: "Move to",
          description: HINT,
          isInvalid: invalid,
          errorMessage: PROBLEM,
          items: [{ id: "starters", label: "Starters" }],
        }),
    ],
    [
      "a checkbox group",
      (invalid) =>
        boxes({
          label: "Preparation notes",
          description: HINT,
          isInvalid: invalid,
          errorMessage: PROBLEM,
          children: box({ value: "fryer", children: "Fryer" }),
        }),
    ],
    [
      "a radio group",
      (invalid) =>
        radios({
          label: "Price",
          description: HINT,
          isInvalid: invalid,
          errorMessage: PROBLEM,
          children: radio({ value: "one", children: "One price" }),
        }),
    ],
  ];

  for (const [name, element] of cases) {
    it(`${name}: invalid, its hint is shown but not tied, and its problem is tied once; valid, its hint is tied`, () => {
      expectProblemAlone(render(element(true)));
      expectHint(render(element(false)));
    });
  }

  it("a checkbox: invalid, its hint is shown but not tied, and the problem the caller ties stays; valid, its hint is tied", () => {
    const milk = (invalid: boolean) =>
      render(
        createElement(
          "div",
          null,
          box({
            id: "milk",
            description: HINT,
            "aria-describedby": "milk-error",
            validationBehavior: "aria",
            isInvalid: invalid,
            children: "Milk",
          }),
          createElement("span", { id: "milk-error" }, PROBLEM),
        ),
      );
    expectProblemAlone(milk(true), { problemId: "milk-error" });
    expectHint(milk(false));
  });

  it("a radio: invalid in its group, its hint is shown but not tied; valid, its hint is tied", () => {
    const group = (invalid: boolean) =>
      render(
        radios({
          label: "Availability",
          isInvalid: invalid,
          errorMessage: PROBLEM,
          children: radio({
            value: "sold-out",
            description: HINT,
            children: "Sold out today",
          }),
        }),
      );
    expectProblemAlone(group(true));
    expectHint(group(false));
  });
});

describe("the words", () => {
  it("each error about a value's shape carries the hint's example, since the hint is not read while it stands", () => {
    const schedule = en.owner.dish.schedule.errors;
    const hours = en.owner.restaurants.errors;
    for (const words of [
      schedule.timeAmPmStarts,
      schedule.timeAmPmEnds,
      schedule.timePairStarts,
      schedule.timePairEnds,
      hours.timeAmPm,
      hours.timePair,
    ]) {
      expect(words, words).toMatch(/\blike \d{1,2} (am|pm)\b/);
    }
    expect(en.owner.choices.options.errors.priceFormat).toContain(
      "Leave it blank when it costs nothing extra.",
    );
  });

  it("a Save refused because the page's lists moved under it says to reload the page and save again, since a form page does not refresh", () => {
    for (const words of [
      en.owner.dish.allergens.listsMoved,
      en.owner.dish.tags.tagsMoved,
      en.owner.dish.schedule.scheduleMoved,
    ]) {
      expect(words, words).toContain("Reload the page");
      expect(words, words).toContain("save again");
    }
  });
});
