"use client";

import type { ReactNode } from "react";
import { fill } from "@/copy/fill";
import { Button } from "@/ui/Button";
import { Form, FormErrors } from "@/ui/Form";
import { LeaveDialog } from "../editing/LeaveDialog";
import type { DishStrings } from "./dish-words";
import { FORM_SUMMARY_ID, type DishFormState } from "./useDishForm";

type Props = {
  strings: DishStrings;
  // The hold's words, "in progress" (D-209).
  pendingLabel: string;
  // The Save button's words, "Save allergens".
  submit: string;
  form: DishFormState;
  onSubmit: () => void;
  children: ReactNode;
};

// The shape of a dish page that saves by a press (D-223, D-229): under the
// h1, one line saying how the page saves, then the summary when there is
// one, the page's groups, and one Save at the foot, type submit, never
// disabled, held while a save is on its way (D-209). The form's own submit
// is taken over, so React never resets the fields after the action
// answers; the shell's submit decides what is sent. The leave dialog sits
// beside the form, closed until a link asks.
export function DishForm({
  strings,
  pendingLabel,
  submit,
  form,
  onSubmit,
  children,
}: Props) {
  return (
    <>
      <Form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
        className="flex flex-col"
      >
        <p className="mt-6 text-foreground-muted">
          {fill(strings.form.lead, { save: submit })}
        </p>
        <FormErrors
          id={FORM_SUMMARY_ID}
          heading={strings.form.summary}
          errors={form.errors}
          failure={form.failure}
        />
        {children}
        <div className="mt-8">
          <Button
            type="submit"
            isPending={form.pending || form.leaving}
            pendingLabel={pendingLabel}
          >
            {submit}
          </Button>
        </div>
      </Form>
      <LeaveDialog
        strings={strings.form.leave}
        isOpen={form.asking}
        onKeep={form.keep}
        onLeave={form.leave}
      />
    </>
  );
}
