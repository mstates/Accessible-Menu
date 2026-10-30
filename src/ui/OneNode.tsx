// The one node (D-193): a label's accessible text as a single text node
// holding the whole name, beside the visible words hidden from assistive
// technology. A field named with words beyond its visible ones, "Menu name
// for Dinner", "Open 24 hours on Monday", "State, Pennsylvania", is named by
// one label, React Aria's, and this is what that label holds. Two hearings
// on the iPhone (October 26 and 27, 2026) settled the rule: VoiceOver on
// iOS folds a label into its control, a checkbox, a button, or a text
// field alike, only when the label's accessible text is one text node; a
// label of two pieces never folds, whatever hides the second piece and
// wherever the label sits. So the suffix as hidden words in the flow after
// the visible words (D-188) was a stop of its own, and 0px text in the
// flow was not stitched into the visible words. The whole name is clipped
// out of the flow (sr-only, a box of a pixel, never 0px), so it is one
// static text piece in Chrome's tree as well, which is what Chrome hands
// VoiceOver on macOS (D-140). The cost, accepted: touching the visible
// words speaks nothing, while a tap on them still activates the control
// through the label; and the visible words must stay the start of the
// name, with a Select's comma and value after them (2.5.3, D-195), which
// the readings in tests/a11y/label-shape.ts and the unit guard hold.
export function OneNode({
  visible,
  whole,
}: {
  visible: string;
  whole: string;
}) {
  return (
    <>
      <span aria-hidden="true" className="min-w-0">
        {visible}
      </span>
      <span className="sr-only">{whole}</span>
    </>
  );
}
