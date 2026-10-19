import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { googlePlaces } from "../../src/core/places/google";
import { parseAddress, parseSuggestions } from "../../src/core/places/parse";
import { PlacesError } from "../../src/core/places/provider";

// The Places client (D-83) against Google's answers as the Places API (New)
// documents them, held as fixtures: the list from Autocomplete, and the
// five parts (D-87) from Place Details for a US address with a unit and a
// ZIP suffix, one with parts missing, and one outside the US.

function fixture(name: string): unknown {
  return JSON.parse(
    readFileSync(
      fileURLToPath(new URL(`../fixtures/${name}.json`, import.meta.url)),
      "utf8",
    ),
  );
}

function caught(run: () => unknown): PlacesError {
  try {
    run();
  } catch (error) {
    if (error instanceof PlacesError) return error;
    throw error;
  }
  throw new Error("nothing was thrown");
}

describe("parseSuggestions (D-83)", () => {
  it("reads each place prediction's id and text in order and skips an entry without one", () => {
    expect(parseSuggestions(fixture("places-autocomplete"))).toEqual([
      { id: "ChIJ2main", text: "2 Main Street, Reading, PA, USA" },
      { id: "ChIJbistro", text: "Test Bistro, Penn Street, Reading, PA, USA" },
      { id: "ChIJwest", text: "2 Main Street, West Reading, PA, USA" },
    ]);
  });

  it("reads an answer with no suggestions as an empty list", () => {
    expect(parseSuggestions({})).toEqual([]);
    expect(parseSuggestions({ suggestions: [] })).toEqual([]);
  });

  it("refuses an answer that is not the shape, naming the call and the issue and never the body", () => {
    const error = caught(() =>
      parseSuggestions({ suggestions: "SECRET-TEXT-FROM-THE-BODY" }),
    );
    expect(error.call).toBe("suggest");
    expect(error.status).toBeNull();
    expect(error.message).toContain("invalid_type at suggestions");
    expect(error.message).not.toContain("SECRET");
  });
});

describe("parseAddress (D-87)", () => {
  it("reads the five parts of a US address with a unit and a ZIP suffix", () => {
    expect(parseAddress(fixture("places-details-us"))).toEqual({
      street: "2 Main Street, Suite 2",
      city: "Reading",
      state: "PA",
      zip: "19601-1234",
      country: "US",
    });
  });

  it("leaves a missing part empty, takes the borough as the city, and keeps a five-digit ZIP", () => {
    expect(parseAddress(fixture("places-details-missing"))).toEqual({
      street: "Atlantic Avenue",
      city: "Brooklyn",
      state: "NY",
      zip: "11201",
      country: "US",
    });
  });

  it("reads an address outside the US as given", () => {
    expect(parseAddress(fixture("places-details-ca"))).toEqual({
      street: "301 Front Street West",
      city: "Toronto",
      state: "ON",
      zip: "M5V 2T6",
      country: "CA",
    });
  });

  it("reads an answer with no components as five empty parts", () => {
    expect(parseAddress({})).toEqual({
      street: "",
      city: "",
      state: "",
      zip: "",
      country: "",
    });
  });

  it("refuses an answer that is not the shape", () => {
    const error = caught(() =>
      parseAddress({ addressComponents: [{ types: "SECRET-TEXT" }] }),
    );
    expect(error.call).toBe("pick");
    expect(error.message).toContain(
      "invalid_type at addressComponents.0.types",
    );
    expect(error.message).not.toContain("SECRET");
  });
});

describe("googlePlaces", () => {
  type Sent = { url: string; init: RequestInit };

  function stub(answer: () => Response) {
    const sent: Sent[] = [];
    const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      sent.push({ url: String(input), init: init ?? {} });
      return answer();
    };
    return {
      sent,
      provider: googlePlaces({
        key: "k-secret",
        origin: "https://places.example",
        fetch,
      }),
    };
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("asks Autocomplete with the key, the mask, the session, and the US, and reads the list", async () => {
    const { sent, provider } = stub(() =>
      Response.json(fixture("places-autocomplete")),
    );
    const list = await provider.suggest("2 Main", "sess-1");
    expect(list.map((each) => each.id)).toEqual([
      "ChIJ2main",
      "ChIJbistro",
      "ChIJwest",
    ]);
    expect(sent).toHaveLength(1);
    const [call] = sent;
    expect(call?.url).toBe("https://places.example/v1/places:autocomplete");
    expect(call?.init.method).toBe("POST");
    expect(call?.init.headers).toEqual({
      "content-type": "application/json",
      "x-goog-api-key": "k-secret",
      "x-goog-fieldmask":
        "suggestions.placePrediction.placeId,suggestions.placePrediction.text",
    });
    expect(JSON.parse(String(call?.init.body))).toEqual({
      input: "2 Main",
      sessionToken: "sess-1",
      includedRegionCodes: ["us"],
      languageCode: "en",
      regionCode: "us",
    });
    expect(call?.init.cache).toBe("no-store");
    expect(call?.init.signal).toBeInstanceOf(AbortSignal);
  });

  it("asks Place Details for the address components alone, with the session, and reads the parts", async () => {
    const { sent, provider } = stub(() =>
      Response.json(fixture("places-details-us")),
    );
    const parts = await provider.pick("ChIJ2main", "sess-1");
    expect(parts.street).toBe("2 Main Street, Suite 2");
    expect(parts.zip).toBe("19601-1234");
    const [call] = sent;
    expect(call?.url).toBe(
      "https://places.example/v1/places/ChIJ2main?sessionToken=sess-1&languageCode=en&regionCode=us",
    );
    expect(call?.init.method).toBe("GET");
    expect(call?.init.headers).toEqual({
      "x-goog-api-key": "k-secret",
      "x-goog-fieldmask": "addressComponents",
    });
    expect(call?.init.cache).toBe("no-store");
    expect(call?.init.signal).toBeInstanceOf(AbortSignal);
  });

  it("logs one line without the key or the body and throws with the status when Google refuses", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { provider } = stub(() =>
      Response.json(
        {
          error: {
            code: 403,
            message: "The request is missing a valid API key. k-secret",
            status: "PERMISSION_DENIED",
          },
        },
        { status: 403 },
      ),
    );
    await expect(provider.suggest("2 Main", "sess-1")).rejects.toMatchObject({
      name: "PlacesError",
      call: "suggest",
      status: 403,
    });
    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0]?.[0])).toBe(
      "places suggest: 403 PERMISSION_DENIED",
    );
  });

  it("logs the error's name and throws with no status when nothing answers", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const provider = googlePlaces({
      key: "k-secret",
      origin: "https://places.example",
      fetch: async () => {
        throw Object.assign(new Error("connect ECONNREFUSED k-secret"), {
          name: "TypeError",
        });
      },
    });
    await expect(provider.pick("ChIJ2main", "sess-1")).rejects.toMatchObject({
      call: "pick",
      status: null,
    });
    expect(String(error.mock.calls[0]?.[0])).toBe(
      "places pick: no answer (TypeError)",
    );
  });
});
