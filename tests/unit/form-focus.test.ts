import { describe, expect, it } from "vitest";
import { focusTarget, SUMMARY_FROM } from "../../src/ui/form-focus";

// Where focus goes after a Save (D-229, Primer): the first invalid field
// with fewer than three problems, the summary with three or more, and the
// summary after a failure the server answered.

describe("focusTarget", () => {
  it("goes nowhere with nothing wrong", () => {
    expect(focusTarget(0, false)).toBeNull();
  });

  it("goes to the first field with one or two problems", () => {
    expect(focusTarget(1, false)).toBe("field");
    expect(focusTarget(2, false)).toBe("field");
  });

  it("goes to the summary from three problems", () => {
    expect(SUMMARY_FROM).toBe(3);
    expect(focusTarget(3, false)).toBe("summary");
    expect(focusTarget(7, false)).toBe("summary");
  });

  it("goes to the summary after a failure, whatever the count", () => {
    expect(focusTarget(0, true)).toBe("summary");
    expect(focusTarget(1, true)).toBe("summary");
  });
});
