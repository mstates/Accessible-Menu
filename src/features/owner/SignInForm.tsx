"use client";

import { startTransition, useActionState, useEffect } from "react";
import { Form } from "react-aria-components";
import type { Copy } from "@/copy";
import { Button } from "@/ui/Button";
import { ResultMessage } from "@/ui/ResultMessage";
import { TextField } from "@/ui/TextField";
import { requestMagicLink, type SignInState } from "./actions";

const initial: SignInState = { status: "idle" };
const emailFieldId = "sign-in-email";

// The magic link form. The action is called from onSubmit inside a
// transition, not through the form's action prop, so React does not reset
// the form after each submit and the typed address stays. An address problem
// shows on the field and moves focus there; every other outcome, sent or
// failed, is one message after the button that takes focus, keyed per
// submission so the same message twice is read twice. The field stays valid
// for those.
export function SignInForm({ copy }: { copy: Copy }) {
  const [state, formAction, pending] = useActionState(
    requestMagicLink,
    initial,
  );
  const invalid = state.status === "invalid";

  useEffect(() => {
    if (state.status === "invalid") {
      document.getElementById(emailFieldId)?.focus();
    }
  }, [state]);

  return (
    <Form
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => formAction(data));
      }}
      className="flex flex-col gap-4"
    >
      <TextField
        id={emailFieldId}
        name="email"
        type="email"
        autoComplete="email"
        isRequired
        label={copy.owner.signIn.emailLabel}
        isInvalid={invalid}
        errorMessage={invalid ? state.message : undefined}
      />
      <div>
        <Button
          type="submit"
          isPending={pending}
          pendingLabel={copy.ui.pending}
        >
          {copy.owner.signIn.submit}
        </Button>
      </div>
      {state.status === "sent" || state.status === "failed" ? (
        <ResultMessage key={state.attempt} message={state.message} />
      ) : null}
    </Form>
  );
}
