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
  // Where focus goes, by id, so no ref rides through the page's state.
  id: string;
  heading: string;
  errors: readonly FormError[];
  // The sentence for a save the server refused, when there is one.
  failure: string | null;
};

// The summary of what a submit found (Primer's validation summary, D-229):
// a box named by its heading that takes focus, with the failure sentence
// when the server refused the save, and one link per problem, which
// focuses the field. Drawn only when there are enough problems to need a
// map, SUMMARY_FROM or more, or a failure to read; with fewer, the first
// invalid field takes focus and says its own problem.
export function FormErrors({ id, heading, errors, failure }: ErrorsProps) {
  if (failure === null && errors.length < SUMMARY_FROM) return null;
  return (
    <div
      id={id}
      tabIndex={-1}
      className="rounded border-2 border-foreground p-4"
    >
      <h2 className="text-lg font-bold">{heading}</h2>
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
