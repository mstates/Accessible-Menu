// Every user-facing string, in English. Components import from "@/copy" and
// hold no literal copy (module rule 6). tests/unit/copy-guard.test.ts checks
// every string here for banned words.
export const en = {
  lang: "en",
  site: {
    name: "Accessible Menu",
    descriptor: "Accessible menu",
    menuBy: "Menu by",
  },
  skipLink: "Skip to main content",
  home: {
    heading: "Accessible Menu",
    lead: "A restaurant menu anyone can read.",
    sample: "See a sample menu",
  },
  owner: {
    title: "Owner dashboard",
    heading: "Owner dashboard",
    empty: "Nothing here yet.",
    signedInAs: "Signed in as {email}",
    signOut: "Sign out",
    signIn: {
      title: "Sign in",
      heading: "Sign in",
      lead: "We email you a link. No password to remember.",
      emailLabel: "Email address",
      submit: "Email me a sign-in link",
      sending: "Sending the link",
      sent: "Check your email for a sign-in link. Open it on this phone or computer.",
      invalidEmail:
        "That does not look like an email address. Check it and try again.",
      failed: "We could not send the link. Try again in a minute.",
      linkFailed:
        "That sign-in link did not work. It may have expired. Ask for a new one below.",
    },
  },
  directory: {
    title: "Accessible menus in {city}",
    heading: "Accessible menus in {city}",
    empty: "No menus in this city yet.",
  },
  menu: {
    title: "{restaurant} menu",
    hours: "Hours: {hours}",
    website: "Restaurant website",
    sectionsLabel: "Sections",
    sectionLink: "{section}, {items}",
    items: {
      one: "{count} item",
      other: "{count} items",
    },
    footer: {
      feedback: "Feedback about this menu",
      statement: "Accessibility statement",
    },
  },
  allergens: {
    names: {
      milk: "dairy",
      eggs: "eggs",
      fish: "fish",
      shellfish: "shellfish",
      "tree-nuts": "tree nuts",
      peanuts: "peanuts",
      wheat: "wheat",
      soy: "soy",
      sesame: "sesame",
      celery: "celery",
      gluten: "gluten",
      lupin: "lupin",
      molluscs: "molluscs",
      mustard: "mustard",
      sulphites: "sulphites",
    },
    contains: "Contains",
    checkedNone: "Checked. No major allergens.",
    notConfirmed: "Allergens not confirmed yet. Ask your server.",
    noteDefault:
      "Tell your server about any food allergy, intolerance, or celiac disease. We want to cook safely for everyone.",
    prepNotes: {
      "shared-fryer": "Fried items share a fryer with breaded foods.",
      "dedicated-fryer": "We keep a dedicated fryer for gluten-free orders.",
      "shared-kitchen":
        "Gluten-free ingredients in a shared kitchen. Not suitable for celiac disease.",
    },
    confirming: {
      one: "We're still confirming allergens for 1 dish. Ask your server about that.",
      other:
        "We're still confirming allergens for {count} dishes. Ask your server about those.",
    },
    confirmedAll: "Allergens confirmed for every dish.",
  },
  dietary: {
    names: {
      vegan: "Vegan",
      vegetarian: "Vegetarian",
    },
  },
  money: {
    dollar: { one: "dollar", other: "dollars" },
    cent: { one: "cent", other: "cents" },
    and: "and",
    to: "to",
  },
  statement: {
    title: "Accessibility statement, {restaurant}",
    heading: "Accessibility statement for {restaurant}",
    standard:
      "Built to WCAG 2.2 AA and tested with real screen readers on every release.",
    barriers:
      "If something gets in your way, tell us. Reported barriers are fixed within five business days.",
    reply: "A person replies within two business days.",
    person: "Michael, founder, reads every barrier report.",
    feedback: "Feedback about this menu",
    backToMenu: "Back to the menu",
  },
  feedback: {
    title: "Feedback, {restaurant}",
    heading: "Feedback about this menu",
    notReady: "The feedback form is not ready yet.",
    backToMenu: "Back to the menu",
  },
  notFound: {
    title: "Page not found",
    heading: "We could not find that page.",
    home: "Go to the home page",
  },
} as const;
