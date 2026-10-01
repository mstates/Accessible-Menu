"use client";

import { useActionState } from "react";
import { Form } from "react-aria-components";
import type { Copy } from "@/copy";
import { Button } from "@/ui/Button";
import { TextField } from "@/ui/TextField";
import { requestMagicLink, type SignInState } from "./actions";

const initial: SignInState = { status: "idle" };

export function SignInForm({ copy }: { copy: Copy }) {
  const [state, action, pending] = useActionState(requestMagicLink, initial);
  return (
    <Form action={action} className="flex flex-col gap-4">
      <TextField
        name="email"
        type="email"
        autoComplete="email"
        isRequired
        label={copy.owner.signIn.emailLabel}
        isInvalid={state.status === "error"}
        errorMessage={state.status === "error" ? state.message : undefined}
      />
      <div>
        <Button type="submit" isPending={pending}>
          {copy.owner.signIn.submit}
        </Button>
      </div>
      <p role="status" className="min-h-6">
        {state.status === "sent" ? state.message : null}
      </p>
    </Form>
  );
}
