"use client";

import { useActionState, useEffect } from "react";
import type { Copy } from "@/copy";
import { fill } from "@/copy/fill";
import { noticeCookie } from "@/core/notice";
import { Button } from "@/ui/Button";
import { startTrial, type TrialState } from "./actions";

const initial: TrialState = { status: "idle" };

type Props = {
  copy: Copy;
  restaurant: { id: string; name: string };
  // The page the form is on, where the failure's flash loads: the
  // dashboard, whose path the page hands over, since billing never imports
  // owner's paths.
  path: string;
};

// The one button that starts a restaurant's trial (D-79). The button names
// the restaurant in visually hidden text, so a list of buttons reads one
// entry per restaurant. A trial that starts leaves for Stripe through the
// action's redirect. A restaurant the owner's client cannot find comes back
// as the action's state, and the form loads the page again with the
// failure's notice in a cookie for that load (D-219, src/core/notice.ts):
// a real page load with the error flash, as a Details save loads Details
// (D-211), never a client navigation, where the flash cannot sit (D-214).
// replace, not assign: the same page adds nothing to the history. The
// button stays held until the new page arrives.
export function StartTrialForm({ copy, restaurant, path }: Props) {
  const [state, formAction, pending] = useActionState(startTrial, initial);
  const leaving = state.status === "missing";
  useEffect(() => {
    if (state.status !== "missing") return;
    document.cookie = noticeCookie("checkout-missing", path);
    window.location.replace(path);
  }, [state, path]);
  return (
    <form action={formAction} className="mt-4">
      <input type="hidden" name="restaurant" value={restaurant.id} />
      <Button
        type="submit"
        isPending={pending || leaving}
        pendingLabel={copy.ui.pending}
      >
        {copy.owner.billing.startTrial}
        <span className="sr-only">
          {" "}
          {fill(copy.owner.billing.startTrialFor, {
            restaurant: restaurant.name,
          })}
        </span>
      </Button>
    </form>
  );
}
