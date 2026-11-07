"use client";

import { useActionState, useEffect } from "react";
import type { Copy } from "@/copy";
import { noticeCookie } from "@/core/notice";
import { Button } from "@/ui/Button";
import { signInWithGoogle, type GoogleSignInState } from "./actions";
import { signInPath } from "./paths";

const initial: GoogleSignInState = { status: "idle" };

// Continue with Google. A sign-in that starts leaves for Google through the
// action's redirect. One that cannot start (Supabase gave an error or no
// URL) comes back as the action's state, and the form loads the sign-in
// page again with the failure's notice in a cookie for that load (D-219,
// src/core/notice.ts): a real page load with the error flash, as a Details
// save loads Details (D-211), never a client navigation, where the flash
// cannot sit (D-214). replace, not assign: the same page adds nothing to
// the history. The button stays held until the new page arrives.
export function GoogleSignInForm({ copy }: { copy: Copy }) {
  const [state, formAction, pending] = useActionState(
    signInWithGoogle,
    initial,
  );
  const leaving = state.status === "failed";
  useEffect(() => {
    if (state.status !== "failed") return;
    document.cookie = noticeCookie("sign-in-google", signInPath);
    window.location.replace(signInPath);
  }, [state]);
  return (
    <form action={formAction}>
      <Button
        type="submit"
        isPending={pending || leaving}
        pendingLabel={copy.ui.pending}
      >
        {copy.owner.signIn.google}
      </Button>
    </form>
  );
}
