// Words for a screen reader inside a label, beside the visible words: the
// row a field belongs to after "Menu name", the day after "Open 24 hours",
// a Select's value before its label (D-188). In the flow, with no size and
// clipped, so the label stays one element and reads whole. Two readings
// decide the shape. VoiceOver on iOS folds a label into its control only
// when that one element labels it (WebKit's title element), so the words
// sit inside the label and not beside it, and the control carries no
// aria-label. And Chrome on macOS hands VoiceOver that one element to read
// in its own text pieces, joined with nothing between them (D-140, D-142),
// so the space between the visible words and these must be part of a
// piece: the caller writes it into the visible words' own text node, "Menu
// name " then this, or this then " State". A space of its own is a text
// node Chrome leaves out, and a box taken out of the flow, sr-only, loses
// its first space, which is what D-140 heard. Proven in Chromium through
// the DevTools Protocol at one and two times text and with the label
// wrapped.
export function HiddenWords({ text }: { text: string }) {
  return (
    <span className="inline-block size-0 overflow-hidden align-baseline whitespace-nowrap">
      {text}
    </span>
  );
}
