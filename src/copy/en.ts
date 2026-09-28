// Every user-facing string, in English. Components import from "@/copy" and
// hold no literal copy (module rule 6). tests/unit/copy-guard.test.ts checks
// every string here for banned words.
export const en = {
  lang: "en",
  site: {
    name: "Accessible Menu",
  },
  home: {
    heading: "Accessible Menu",
    lead: "A restaurant menu anyone can read.",
  },
} as const;
