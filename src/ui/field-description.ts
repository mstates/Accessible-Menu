// A field's description, handed to React Aria as well as shown in the
// field's Text slot (D-147). React Aria ties the description to the field
// by id, and its useField looks for that id on the page again only when
// the description it was handed comes or goes. React Aria Components
// leaves description out of its props, since the words sit in the slot, so
// a field that never hands it over has the id looked for once, when it
// mounts: words shown later were never tied to the field, and words taken
// away left the field pointing at an id no longer on the page. Handed
// over, the tie follows the words both ways.
//
// The props are typed as a plain object so they spread past those props;
// the components still pass them to their hooks. The gate's switch to and
// from market price on a dish's page fails if a React Aria update stops
// doing so.
export function fieldDescription(description: string | undefined): object {
  return { description };
}
