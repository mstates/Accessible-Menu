"use client";

import { Form as AriaForm, type FormProps } from "react-aria-components";
import { SUMMARY_FROM } from "./form-focus";

// A form that saves by one press (D-229, Primer's explicit saving): the
// fields, then one Save at the foot, never disabled. Validation is the
// page's own, run on submit, and shown through each field's isInvalid and
// errorMessage, so aria-invalid and the description come as they do on
// every field; React Aria's own validation stays out of the way. Where
// focus goes after a submit is form-focus.ts's rule.
export function Form(props: Omit<FormProps, "validationBehavior">) {
  return <AriaForm {...props} validationBehavior="aria" />;
}

// One problem a submit found: the id of the field it belongs to, which
// the summary links to and focus goes to, and its words.
export type FormError = { id: string; message: string };

type ErrorsProps = {
  // The heading's id, where focus goes, so no ref rides through the page's
  // state.
  id: string;
  heading: string;
  errors: readonly FormError[];
  // The sentence for a save the server refused, when there is one.
  failure: string | null;
  // How many problems draw the summary with no failure: SUMMARY_FROM on
  // the pages that follow Primer's rule, one on Details, whose summary
  // takes every refused save (D-179).
  from?: number;
};

// The summary of what a submit found (Primer's validation summary, D-229):
// a box under its heading, with the failure sentence when the server
// refused the save, and one link per problem, which focuses the field.
// Drawn only when there are enough problems to need a map, SUMMARY_FROM or
// more unless the caller says otherwise, or a failure to read; with fewer,
// the first invalid field takes focus and says its own problem.
//
// The heading takes focus, not the box (Q-183, Michael's yes, November 15,
// 2026): a box with no role and no name was silent on the Mac and on the
// iPhone, and the heading is read with its words and its level, "Check
// these fields, heading level 2". The next stop is the first link, or the
// failure sentence when there is no link. Focus is the announcement: no
// live region (Primer). Each link keeps its href and focuses its field in
// its own press, as it always has; what makes it heard on iOS is Q-183's
// open listen, never a guess built here.
export function FormErrors({
  id,
  heading,
  errors,
  failure,
  from = SUMMARY_FROM,
}: ErrorsProps) {
  if (failure === null && errors.length < from) return null;
  return (
    <div className="rounded border-2 border-foreground p-4">
      <h2 id={id} tabIndex={-1} className="text-lg font-bold">
        {heading}
      </h2>
      {failure ? <p className="mt-2">{failure}</p> : null}
      {errors.length > 0 ? (
        <ul className="mt-2 list-disc pl-5">
          {errors.map((error, index) => (
            <li key={`${index}-${error.id}`}>
              <a
                href={`#${error.id}`}
                className="text-link underline"
                onClick={(event) => {
                  const target = document.getElementById(error.id);
                  if (!target) return;
                  event.preventDefault();
                  target.focus();
                }}
              >
                {error.message}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
