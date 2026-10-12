import { Fragment } from "react";
import type { AllergenSentence as Sentence } from "@/domain/allergens";

// One of the three allergen sentences as every page draws it (D-35): the
// allergen words in bold, the sentence inline where the dish or option is,
// never behind a popover or disclosure (D-40). Its third use lifted it here
// (module rule 12): the diner page, the dish page's check box, and an
// option's. No wrapper element, so the caller chooses the paragraph.
export function AllergenSentence({ sentence }: { sentence: Sentence }) {
  if (sentence.kind !== "contains") {
    return <>{sentence.text}</>;
  }
  return (
    <>
      {sentence.lead}{" "}
      {sentence.words.map((word, index) => (
        <Fragment key={`${index}-${word}`}>
          {index > 0 ? ", " : null}
          <strong>{word}</strong>
        </Fragment>
      ))}
      {"."}
    </>
  );
}
