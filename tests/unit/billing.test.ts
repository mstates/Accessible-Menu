import { describe, expect, it } from "vitest";
import {
  billingState,
  isRestaurantStatus,
  restaurantStatusFromSubscription,
} from "../../src/domain/billing";

describe("restaurantStatusFromSubscription (D-79)", () => {
  it.each([
    ["trialing", "trial"],
    ["active", "active"],
    ["past_due", "paused"],
    ["unpaid", "paused"],
    ["canceled", "closed"],
  ])("maps %s to %s", (stripe, ours) => {
    expect(restaurantStatusFromSubscription(stripe)).toBe(ours);
  });

  it("maps the states D-79 does not name to the nearest honest one", () => {
    expect(restaurantStatusFromSubscription("paused")).toBe("paused");
    expect(restaurantStatusFromSubscription("incomplete_expired")).toBe(
      "closed",
    );
  });

  it("leaves the row alone for incomplete or unknown statuses", () => {
    expect(restaurantStatusFromSubscription("incomplete")).toBeNull();
    expect(restaurantStatusFromSubscription("something_new")).toBeNull();
  });
});

describe("billingState", () => {
  it("is unstarted only for a trial with no Stripe customer", () => {
    expect(billingState("trial", false)).toBe("unstarted");
    expect(billingState("trial", true)).toBe("trial");
  });

  it("passes every other status through", () => {
    expect(billingState("active", true)).toBe("active");
    expect(billingState("paused", true)).toBe("paused");
    expect(billingState("closed", false)).toBe("closed");
  });
});

describe("isRestaurantStatus", () => {
  it("accepts the four statuses and nothing else", () => {
    expect(isRestaurantStatus("trial")).toBe(true);
    expect(isRestaurantStatus("closed")).toBe(true);
    expect(isRestaurantStatus("trialing")).toBe(false);
    expect(isRestaurantStatus(null)).toBe(false);
  });
});
