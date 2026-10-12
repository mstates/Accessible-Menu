import { describe, expect, it } from "vitest";
import {
  feedbackPath,
  isMenuCode,
  menuPath,
  menuUrl,
  normalizeMenuCode,
  parseMenuOrigin,
  resolveMenuOrigin,
  resolveMenuPath,
  statementPath,
} from "../../src/domain/menu-url";

describe("menu codes (D-86, D-88)", () => {
  it("accepts eight digits that do not start with 0", () => {
    expect(isMenuCode("47293158")).toBe(true);
    expect(isMenuCode("10000000")).toBe(true);
    expect(isMenuCode("99999999")).toBe(true);
  });

  it.each(["07293158", "4729315", "472931589", "4729315a", "", " 47293158"])(
    "rejects %j",
    (value) => {
      expect(isMenuCode(value)).toBe(false);
    },
  );

  it("normalizes case and whitespace before the check", () => {
    expect(normalizeMenuCode("  47293158 ")).toBe("47293158");
    expect(normalizeMenuCode("ABC")).toBe("abc");
    expect(isMenuCode(normalizeMenuCode(" 47293158\n"))).toBe(true);
  });
});

describe("the one URL builder (D-88)", () => {
  it("builds the menu, statement, and feedback paths from the code", () => {
    expect(menuPath("47293158")).toBe("/m/47293158");
    expect(statementPath("47293158")).toBe("/a11y/47293158");
    expect(feedbackPath("47293158")).toBe("/feedback/47293158");
  });

  it("joins the origin and the menu path", () => {
    expect(menuUrl("https://menus.example", "47293158")).toBe(
      "https://menus.example/m/47293158",
    );
  });

  it("names a menu by its id under the code, never its name", () => {
    const id = "3f9a1c2e-7b3d-4c9e-9a1b-2c3d4e5f6a7b";
    expect(menuPath("47293158", id)).toBe(`/m/47293158/${id}`);
    expect(menuUrl("https://menus.example", "47293158", id)).toBe(
      `https://menus.example/m/47293158/${id}`,
    );
  });
});

describe("the one resolver (D-88)", () => {
  const id = "3f9a1c2e-7b3d-4c9e-9a1b-2c3d4e5f6a7b";

  it("reads the bare code and the code with a menu's id", () => {
    expect(resolveMenuPath(["47293158"])).toEqual({
      kind: "menu",
      code: "47293158",
      menuId: null,
    });
    expect(resolveMenuPath(["47293158", id])).toEqual({
      kind: "menu",
      code: "47293158",
      menuId: id,
    });
  });

  it("normalizes the code and the id before the check", () => {
    expect(resolveMenuPath([" 47293158 ", id.toUpperCase()])).toEqual({
      kind: "menu",
      code: "47293158",
      menuId: id,
    });
  });

  it.each([
    [[]],
    [["demo"]],
    [["07293158"]],
    [["4729315"]],
    [["47293158", "dinner"]],
    [["47293158", "3f9a1c2e"]],
    [["47293158", id, "extra"]],
    [["47293158", ""]],
    [["", id]],
  ])("knows nothing of %j", (segments) => {
    expect(resolveMenuPath(segments)).toEqual({ kind: "unknown" });
  });
});

describe("the menu origin (D-88, D-96)", () => {
  it("accepts an https origin with nothing after it", () => {
    expect(parseMenuOrigin("https://menus.example")).toBe(
      "https://menus.example",
    );
    expect(parseMenuOrigin("https://menus.example:8443")).toBe(
      "https://menus.example:8443",
    );
  });

  it.each([
    "http://menus.example",
    "https://menus.example/",
    "https://menus.example/menus",
    "https://menus.example?x=1",
    "https://menus.example#top",
    "menus.example",
    "",
  ])("rejects %j", (value) => {
    expect(parseMenuOrigin(value)).toBeNull();
  });

  it("uses MENU_ORIGIN wherever it is set and marks the link permanent", () => {
    expect(
      resolveMenuOrigin({
        MENU_ORIGIN: "https://menus.example",
        VERCEL_ENV: "preview",
        VERCEL_URL: "deploy-abc.vercel.app",
      }),
    ).toEqual({ ok: true, origin: "https://menus.example", permanent: true });
  });

  it("refuses an invalid MENU_ORIGIN anywhere", () => {
    expect(
      resolveMenuOrigin({
        MENU_ORIGIN: "https://menus.example/",
        VERCEL_ENV: "preview",
      }),
    ).toEqual({ ok: false, reason: "invalid" });
  });

  it("requires MENU_ORIGIN in production", () => {
    expect(
      resolveMenuOrigin({
        VERCEL_ENV: "production",
        VERCEL_URL: "deploy-abc.vercel.app",
      }),
    ).toEqual({ ok: false, reason: "missing-in-production" });
  });

  it("falls back to the preview URL, then to localhost", () => {
    expect(
      resolveMenuOrigin({
        VERCEL_ENV: "preview",
        VERCEL_URL: "deploy-abc.vercel.app",
      }),
    ).toEqual({
      ok: true,
      origin: "https://deploy-abc.vercel.app",
      permanent: false,
    });
    expect(resolveMenuOrigin({})).toEqual({
      ok: true,
      origin: "http://localhost:3000",
      permanent: false,
    });
  });
});
