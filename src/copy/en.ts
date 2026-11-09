// Every user-facing string, in English. Components import from "@/copy" and
// hold no literal copy (module rule 6). tests/unit/copy-guard.test.ts checks
// every string here for banned words.
// The day names, one word each, shared by the hours grid, a special's
// schedule, and the diner page's hours in words.
const days = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
} as const;

export const en = {
  lang: "en",
  days,
  site: {
    name: "Accessible Menu",
    // Joins the parts of every owner page title (D-104). A placeholder until
    // Michael's listening pass on main: every screen reader pauses at a comma
    // and none says it as a word at default punctuation.
    titleSeparator: ", ",
    descriptor: "Accessible menu",
    menuBy: "Menu by",
  },
  skipLink: "Skip to main content",
  ui: {
    pending: "in progress",
    loading: "Loading",
    // The name of the nav that shows where a page sits (D-128).
    breadcrumb: "Breadcrumb",
    // A Banner's kind, its landmark's name and its heading, and its dismiss
    // button (D-211, D-219, Primer's Banner): success for a result that
    // landed, info for one that changed nothing, critical for a failure.
    banner: {
      success: "Success",
      info: "Note",
      critical: "Error",
      dismiss: "Dismiss this message",
    },
  },
  home: {
    heading: "Accessible Menu",
    lead: "A restaurant menu anyone can read.",
  },
  owner: {
    title: "Owner dashboard",
    heading: "Owner dashboard",
    empty: "Nothing here yet.",
    signedInAs: "Signed in as {email}",
    signOut: "Sign out",
    error: {
      title: "Something went wrong",
      heading: "Something went wrong",
      lead: "This page may be out of date, or something went wrong on our side. Reload to get the latest version.",
      saveNote: "If you were saving, check your change after the page reloads.",
      reload: "Reload",
    },
    signIn: {
      title: "Sign in",
      heading: "Sign in",
      lead: "Sign in with an emailed link or with Google. No password to remember.",
      emailLabel: "Email address",
      submit: "Email me a sign-in link",
      sent: "Check your email for a sign-in link. Open it on this phone or computer.",
      invalidEmail:
        "That does not look like an email address. Check it and try again.",
      failed:
        "We could not send the link. Wait a minute and try again, or continue with Google.",
      or: "Or",
      google: "Continue with Google",
      failures: {
        link: "That sign-in link did not work. It may have expired. Ask for a new one below.",
        google:
          "Google sign-in did not finish. Try again, or ask for an email link.",
      },
    },
    billing: {
      states: {
        unstarted:
          "Your free trial has not started. Start it to keep your menu up after the first 30 days.",
        trial: "Free trial. Stripe emails you before it ends.",
        active: "Subscription active.",
        paused:
          "A payment did not go through. Your menu is hidden until it is fixed.",
        closed: "Subscription ended. Your menu is hidden.",
      },
      startTrial: "Start your free trial",
      startTrialFor: "for {restaurant}",
      checkoutSuccess: "Thanks. Your free trial has started.",
      checkoutCancel: "Checkout was cancelled. Nothing changed.",
      restaurantMissing: "We could not find that restaurant.",
    },
    restaurants: {
      add: "Add a restaurant",
      none: "You have no restaurants yet. Add one to get your menu link.",
      menuLink: "Menu link",
      menuLinkPermanent: "This link never changes.",
      editDetails: "Edit details",
      editDetailsFor: "for {restaurant}",
      editMenus: "Edit menus",
      editMenusFor: "for {restaurant}",
      backToDashboard: "Back to the dashboard",
      nav: {
        details: "Details",
        menus: "Menus",
      },
      requiredNote: "Fields marked with * are required.",
      sections: {
        location: "Location",
        contact: "Contact",
        hours: "Hours",
        allergens: "Allergens",
      },
      new: {
        title: "Add a restaurant",
        heading: "Add a restaurant",
        lead: "Tell us about the restaurant. Everything but the menu link can change later.",
        submit: "Create restaurant",
      },
      details: {
        title: "Details",
        heading: "Details",
        createdTitle: "Restaurant created. Details",
        lead: "Details save when you press Save and show on the menu page right away.",
        submit: "Save details",
        created: "Your restaurant is set up. Its menu link is above.",
        // The success banner's words after Save details, in the button's
        // own terms (D-211, Primer's content rules).
        saved: "Details saved.",
      },
      fields: {
        name: "Restaurant name",
        address: "Street address",
        city: "City",
        region: "State",
        regionPlaceholder: "Choose a state",
        postalCode: "ZIP code",
        phone: "Phone",
        website: "Website",
        websiteHint: "We add https:// if you leave it off.",
        hoursHint:
          "Leave a day blank if you are closed that day. Check Open 24 hours for a day you are open around the clock.",
        timeHint: "For example, 11 am, 5:30 pm, or 17:30.",
        opens: "{day} opens",
        closes: "{day} closes",
        opensAgain: "{day} opens again",
        closesAgain: "{day} closes again",
        // The box's visible words, then its day; the box's label holds
        // both as one node, "Open 24 hours on Monday" (D-124, D-193).
        allDay: "Open 24 hours",
        allDayDay: "on {day}",
        addSecondTime: "Add a second time for {day}",
        removeSecondTime: "Remove the second time for {day}",
        timezone: "Time zone",
        allergenNote: "Allergen note",
        allergenNoteHint:
          "Shown once near the top of your menu. Leave it blank to show: {default}",
        prepNotes: "Preparation notes",
        prepNotesHint:
          "Pick any that apply. Each one shows under your allergen note.",
        // The icons box on Details (D-189): small outline pictures in a row
        // under each allergen line and each diet line, the words staying.
        showIcons: "Show icons for allergens and diets",
        showIconsHint:
          "Small pictures appear under each allergen line and each diet line on the menu. The words stay.",
      },
      // The address finder above the address fields (D-83, D-200), shown
      // only when the server holds a Places key: a search field whose
      // matches are listed under it in the page flow, each a button. The
      // hint names where the matches come from (Q-113) and where they
      // appear. A reply's count, or that it brought no match, is said once
      // through the page's polite log when it lands.
      finder: {
        label: "Find the address",
        clearLabel: "Clear the address search",
        hint: "Type a few characters of the street or the restaurant's name. Matches from Google appear under this field. Choose one, and the fields below fill in and stay yours to change. Or type the address by hand.",
        matchesLabel: "Address matches",
        count: {
          one: "1 match is listed under the field.",
          other: "{count} matches are listed under the field.",
        },
        noMatches: "No matches. Type more of the address, or type it by hand.",
        filled:
          "The address fields below are filled in from your choice. Check them, and add anything missing.",
        unavailable:
          "Address matches are not available right now. Type the address by hand.",
      },
      days,
      states: {
        AL: "Alabama",
        AK: "Alaska",
        AZ: "Arizona",
        AR: "Arkansas",
        CA: "California",
        CO: "Colorado",
        CT: "Connecticut",
        DE: "Delaware",
        DC: "District of Columbia",
        FL: "Florida",
        GA: "Georgia",
        HI: "Hawaii",
        ID: "Idaho",
        IL: "Illinois",
        IN: "Indiana",
        IA: "Iowa",
        KS: "Kansas",
        KY: "Kentucky",
        LA: "Louisiana",
        ME: "Maine",
        MD: "Maryland",
        MA: "Massachusetts",
        MI: "Michigan",
        MN: "Minnesota",
        MS: "Mississippi",
        MO: "Missouri",
        MT: "Montana",
        NE: "Nebraska",
        NV: "Nevada",
        NH: "New Hampshire",
        NJ: "New Jersey",
        NM: "New Mexico",
        NY: "New York",
        NC: "North Carolina",
        ND: "North Dakota",
        OH: "Ohio",
        OK: "Oklahoma",
        OR: "Oregon",
        PA: "Pennsylvania",
        RI: "Rhode Island",
        SC: "South Carolina",
        SD: "South Dakota",
        TN: "Tennessee",
        TX: "Texas",
        UT: "Utah",
        VT: "Vermont",
        VA: "Virginia",
        WA: "Washington",
        WV: "West Virginia",
        WI: "Wisconsin",
        WY: "Wyoming",
      },
      timezones: {
        "America/New_York": "Eastern Time",
        "America/Chicago": "Central Time",
        "America/Denver": "Mountain Time",
        "America/Phoenix": "Arizona, no daylight saving",
        "America/Los_Angeles": "Pacific Time",
        "America/Anchorage": "Alaska Time",
        "Pacific/Honolulu": "Hawaii Time",
      },
      errors: {
        summary: "Check these fields",
        nameRequired: "Enter the restaurant's name.",
        nameLength: "Keep the name to 120 characters.",
        addressRequired: "Enter the street address.",
        addressLength: "Keep the street address to 200 characters.",
        cityRequired: "Enter the city.",
        cityLength: "Keep the city to 100 characters.",
        region: "Choose a state.",
        postalCode: "Enter a ZIP code like 19601 or 19601-1234.",
        phone:
          "Enter a phone number with 7 to 25 digits, spaces, or punctuation.",
        website: "Enter a web address like example.com.",
        websiteLength: "Keep the web address to 500 characters.",
        timeAmPm: "Add am or pm to the time {field}.",
        timeFormat: "Enter the time {field}, like 11 am, 5:30 pm, or 17:30.",
        timePair: "{day} needs both an opening and a closing time.",
        ranges: "{day} can have two time ranges at most.",
        overlap: "{day} has times that overlap.",
        sameTime:
          "{day} opens and closes at the same time. If you are open around the clock, check Open 24 hours.",
        timezone: "Choose a time zone.",
        allergenNoteLength: "Keep the allergen note to 1000 characters.",
        prepNotes: "Choose preparation notes from the list.",
        capReached:
          "You can add up to three restaurants before starting a free trial. Start the trial on one of them to add another.",
        missing: "We could not find that restaurant.",
        failed: "We could not save that. Try again in a minute.",
      },
    },
    // The editing model every menu screen shares (D-111): one saved status
    // and the reasons a save can fail whatever the field.
    editing: {
      saved: "All changes saved",
      saving: "Saving",
      slow: "Still saving. Check your connection.",
      failed: "Not saved.",
      savedAgain: "All changes saved.",
      // Said once when a field's save lands; the saved status is never spoken.
      fieldSaved: "Saved.",
      // A name sent from the add field shows at once as a row with this
      // under it, until it lands (D-125).
      notSavedYet: "Not saved yet.",
      // The one button on an added row that failed: it was never saved, so
      // it is removed, not deleted.
      removeUnsaved: "Remove",
      tryAgain: "Try again",
      reload: "Reload",
      problems: {
        unreachable:
          "We could not reach the server. What you typed is still here. Try again.",
        outOfDate: "This page is out of date. Reload it to keep editing.",
        signedOut:
          "You are signed out. Sign in again in another tab, then try again.",
        failed: "We could not save that. Try again in a minute.",
      },
    },
    menus: {
      title: "Menus",
      heading: "Menus",
      lead: "Each change saves when you leave its field.",
      none: "No menus yet. Add your first one below.",
      nameLabel: "Menu name",
      labelFor: "for {menu}",
      moveUp: "Move up",
      moveDown: "Move down",
      remove: "Delete",
      // A row control's whole name: its visible label first, then its menu.
      rowAction: "{action}, {menu}",
      // The link from a menu's row to its own page (D-122).
      editSections: "Edit sections",
      newLabel: "New menu name",
      add: "Add menu",
      count: {
        one: "{count} menu",
        other: "{count} menus",
      },
      // Every delete asks first (D-221), and names what goes when the menu
      // holds any (D-119): its sections, and their dishes when they hold
      // any. The question is the dialog's name.
      sectionCount: {
        one: "{count} section",
        other: "{count} sections",
      },
      dishCount: {
        one: "{count} dish",
        other: "{count} dishes",
      },
      deleteAsk: "Delete {menu}, with its {sections}?",
      deleteAskBoth: "Delete {menu}, with its {sections} and {dishes}?",
      deleteAskEmpty: "Delete {menu}?",
      keep: "Keep",
      added: "{menu} added. {count}.",
      movedUp: "{menu} moved up. {position} of {total}.",
      movedDown: "{menu} moved down. {position} of {total}.",
      alreadyFirst: "{menu} is already first.",
      alreadyLast: "{menu} is already last.",
      deleted: "{menu} deleted.",
      removed: "{menu} removed.",
      notSaved: {
        name: "Name of {menu} was not saved.",
      },
      notAdded: "{menu} was not added.",
      notMoved: "{menu} was not moved.",
      notDeleted: "{menu} was not deleted.",
      errors: {
        nameRequired: "A menu needs a name.",
        nameLength: "Keep the name to 60 characters.",
        nameTaken: "Another menu is called {menu}.",
        gone: "That menu is no longer here. Reload the page.",
        listChanged: "The list of menus changed. Reload the page.",
        // The database found more sections or dishes than the owner was
        // told about.
        grew: "It has sections or dishes this page did not show. Press Delete again.",
      },
      // Under the delete question when the menu is published (D-82,
      // migration 12): a deleted published menu is off at once.
      deletePublished:
        "It is published. Deleting it takes it away from diners at once.",
    },
    // Publish and Unpublish for one menu (D-82, migration 12), at the top of
    // the menu's own page, and the dashboard's summary of a restaurant's
    // menus. Publish sends the menu's content to diners as a snapshot; a
    // sold-out mark and a special's schedule reach diners on their own
    // (D-84). A size with no name or no price blocks Publish (D-139), and
    // so does a menu with no dishes in any of its sections (D-177), which
    // the list names by the menu alone.
    publishing: {
      heading: "Publishing",
      state: {
        notPublished: "Not published yet. Diners do not see this menu.",
        published: "Published on {date}. Nothing has changed since.",
        changed:
          "Published on {date}. Changes since then are not published yet.",
      },
      waitingLead: "Publish is waiting on:",
      problems: {
        sizeUnnamed: "{dish} in {section} has a size with no name.",
        sizeUnpriced: "{dish} in {section} has a size with no price.",
        noDishes: "{menu} has no dishes.",
      },
      publish: "Publish",
      unpublish: "Unpublish",
      pending: { publish: "Publishing", unpublish: "Unpublishing" },
      publishHint:
        "Publish sends this menu's words, prices, allergens, and choices to diners. Availability and specials reach diners on their own, with no Publish.",
      unpublishHint: "Unpublish takes this menu away from diners at once.",
      spoken: { published: "Published.", unpublished: "Unpublished." },
      refused: {
        sizeUnnamed:
          "{menu} was not published. {dish} has a size with no name. Name it or remove it, then publish again.",
        sizeUnpriced:
          "{menu} was not published. {dish} has a size with no price. Give it a price or remove it, then publish again.",
        noDishes:
          "{menu} was not published. It has no dishes. Add a dish, then publish again.",
        gone: "{menu} was not published. It is not there any more.",
        notPublished: "{menu} was not published.",
        notUnpublishedGone:
          "{menu} was not unpublished. It is not there any more.",
        notUnpublished: "{menu} was not unpublished.",
      },
      summary: {
        none: "No menu is published yet.",
        published: {
          one: "{names} is published.",
          other: "{names} are published.",
        },
        changed: {
          one: "{names} has changes not yet published.",
          other: "{names} have changes not yet published.",
        },
      },
    },
    // A menu's own page: its sections (D-120 to D-122). The page is named
    // for its menu, so it has no title or heading here. A section's note
    // and its every-dish line are on the section's own page (D-135); the
    // sentences about them stay here, with the section's other words.
    sections: {
      lead: "Sections are the headings on this menu, like Starters and Mains. Edit dishes opens a section's own page, with its dishes and its note. Each change saves when you leave its field.",
      none: "No sections yet. Add the first one below.",
      nameLabel: "Section name",
      // Follows the name's label words inside the one label, so every
      // row's field names its section (D-193).
      labelFor: "for {section}",
      moveUp: "Move up",
      moveDown: "Move down",
      remove: "Delete",
      // A row control's whole name: its visible label first, then its
      // section.
      rowAction: "{action}, {section}",
      // The link from a section's row to its own page (D-128).
      editDishes: "Edit dishes",
      newLabel: "New section name",
      add: "Add section",
      count: {
        one: "{count} section",
        other: "{count} sections",
      },
      // Every delete asks first (D-221), and names what goes when the
      // section holds any (D-119). The question is the dialog's name.
      dishCount: {
        one: "{count} dish",
        other: "{count} dishes",
      },
      deleteAsk: "Delete {section}, with its {dishes}?",
      deleteAskEmpty: "Delete {section}?",
      keep: "Keep",
      added: "{section} added. {count}.",
      movedUp: "{section} moved up. {position} of {total}.",
      movedDown: "{section} moved down. {position} of {total}.",
      alreadyFirst: "{section} is already first.",
      alreadyLast: "{section} is already last.",
      deleted: "{section} deleted.",
      removed: "{section} removed.",
      notSaved: {
        name: "Name of {section} was not saved.",
        note: "Note for {section} was not saved.",
      },
      notAdded: "{section} was not added.",
      notMoved: "{section} was not moved.",
      notDeleted: "{section} was not deleted.",
      errors: {
        nameRequired: "A section needs a name.",
        nameLength: "Keep the name to 60 characters.",
        noteLength: "Keep the note to 500 characters.",
        nameTaken: "Another section is called {section}.",
        gone: "That section is no longer here. Reload the page.",
        parentGone: "This menu is no longer here. Go back to Menus.",
        listChanged: "The list of sections changed. Reload the page.",
        // The database found more dishes than the owner was told about.
        grew: "It has dishes this page did not show. Press Delete again.",
      },
    },
    // A section's own page: its dishes (D-128). The page is named for its
    // section, so it has no title or heading here. A dish has only its name
    // on this page; the rest is on the dish's own page, which its row links
    // to.
    dishes: {
      lead: "Dishes are the items in this section, like soup or a salad.",
      none: "No dishes yet. Add the first one below.",
      nameLabel: "Dish name",
      labelFor: "for {dish}",
      moveUp: "Move up",
      moveDown: "Move down",
      remove: "Delete",
      // A row button's whole name: its visible label first, then its dish.
      rowAction: "{action}, {dish}",
      // The link from a dish's row to its own page (D-128).
      editDish: "Edit dish",
      newLabel: "New dish name",
      add: "Add dish",
      count: {
        one: "{count} dish",
        other: "{count} dishes",
      },
      // Every delete asks first (D-221). A dish holds nothing a delete
      // counts, so the question is its name alone, and it is the dialog's
      // name.
      keep: "Keep",
      deleteAskEmpty: "Delete {dish}?",
      added: "{dish} added. {count}.",
      movedUp: "{dish} moved up. {position} of {total}.",
      movedDown: "{dish} moved down. {position} of {total}.",
      alreadyFirst: "{dish} is already first.",
      alreadyLast: "{dish} is already last.",
      deleted: "{dish} deleted.",
      removed: "{dish} removed.",
      notSaved: {
        name: "Name of {dish} was not saved.",
      },
      notAdded: "{dish} was not added.",
      notMoved: "{dish} was not moved.",
      notDeleted: "{dish} was not deleted.",
      errors: {
        nameRequired: "A dish needs a name.",
        nameLength: "Keep the name to 120 characters.",
        nameTaken: "Another dish in this section is called {dish}.",
        gone: "That dish is no longer here. Reload the page.",
        parentGone: "This section is no longer here. Go back to Menus.",
        listChanged: "The list of dishes changed. Reload the page.",
      },
      // The section's own text, at the top of its page (D-120, D-135). The
      // page is the section, so the label does not name it. The lead comes
      // before the first field it governs. What a section offered with
      // every dish is a choice list now (D-166, owner.choices).
      section: {
        lead: "Each change saves when you leave its field.",
        noteLabel: "Note",
        noteHint:
          "For the whole section. Diners read it once, under the section name.",
      },
      // Moving the section itself to another menu of the restaurant, from
      // its own page (D-129). Nothing is sent until the button is pressed.
      move: {
        heading: "Move this section",
        label: "Move to",
        placeholder: "Choose a menu",
        submit: "Move section",
        choose: "Choose a menu first.",
        moved:
          "{section} moved to {menu}. It is the last section there. You are still on this page.",
        notMoved: "{section} was not moved.",
        errors: {
          nameTaken: "{menu} already has a section called {section}.",
          menuGone: "That menu is no longer here. Reload the page.",
        },
      },
    },
    // A dish's own page (D-128, D-139): its description, its price, and its
    // note, with its sizes, the link to the next dish, and its move to
    // another section. The page is named for its dish, so the labels do not
    // name it; every sentence the log says does, since a sentence is heard
    // on its own. A size's texts are named for their size.
    dish: {
      lead: "Each change saves when you leave its field.",
      // The dish's pages (D-222): General first, then the pages named by
      // their group headings, so a nav item, an h1, and a title's first part
      // are the same words. The state words sit inside each nav link after
      // the page's name, so the link's name says the page and where it
      // stands: "Allergens Not confirmed yet".
      pages: {
        general: "General",
        state: {
          allergensConfirmed: "Confirmed",
          allergensNotConfirmed: "Not confirmed yet",
          none: "None",
          tagCount: {
            one: "{count} tag",
            other: "{count} tags",
          },
          availability: "{choice}, {schedule}",
          scheduleSet: "schedule set",
          scheduleNone: "no schedule",
        },
      },
      descriptionLabel: "Description",
      descriptionHint:
        "What is in it and how it is made. Diners read it in full.",
      noteLabel: "Note",
      noteHint:
        'A short line diners read with this dish, like "Comes with fries or a salad."',
      // The price group (D-139): a heading names the choice, and each choice
      // brings its own fields.
      price: {
        heading: "Price",
        one: "One price",
        sizes: "Prices by size",
        market: "Market price",
        amountLabel: "Price",
        amountHint: "In dollars, like 12 or 12.50.",
        currency: "$",
        // Calories (D-167), one field beside each price: the dish's own
        // under One price or Market price, and one for each size.
        caloriesLabel: "Calories",
        caloriesHint: "A number, like 760, or a range, like 760 to 860.",
        sizeCaloriesLabel: "Calories",
        marketHint: 'Diners read "Market price."',
        sizesLabel: "Sizes",
        sizeNameLabel: "Size",
        sizePriceLabel: "Price",
        // Follows a size field's label, so every size's fields name their
        // size: "Size for Cup", "Price for Cup".
        labelFor: "for {size}",
        sizeHint: "Like Cup, Bowl, Half, or Full.",
        showNames: "Show size names",
        // A size with no name yet, named by its place: "size 2".
        unnamedSize: "size {position}",
        // A size control's whole name: its visible label first, then its
        // size.
        sizeAction: "{action}, {size}",
        addSize: "Add a size",
        removeSize: "Remove",
        sizeAdded: "Size added. {count}.",
        sizeCount: {
          one: "{count} size",
          other: "{count} sizes",
        },
        sizeRemoved: "{size} removed.",
        // Suggested after the restaurant's own size names (D-139).
        suggestions: [
          "Small",
          "Medium",
          "Large",
          "Cup",
          "Bowl",
          "Half",
          "Full",
          "Glass",
          "Bottle",
          "Pint",
        ],
      },
      notSaved: {
        description: "The description of {dish} was not saved.",
        note: "The note for {dish} was not saved.",
        price: "The price of {dish} was not saved.",
        calories: "The calories of {dish} were not saved.",
        priceKind: "The price choice for {dish} was not saved.",
        sizeName: "The name of {size} was not saved.",
        sizePrice: "The price for {size} was not saved.",
        sizeCalories: "The calories for {size} were not saved.",
      },
      notAdded: "A size was not added.",
      notRemoved: "{size} was not removed.",
      errors: {
        descriptionLength: "Keep the description to 500 characters.",
        noteLength: "Keep the note to 120 characters.",
        sizeNameLength: "Keep a size name to 40 characters.",
        priceFormat: "Type a price like 12, 12.50, or $12.",
        priceRange: "Keep the price under $100,000.",
        caloriesFormat:
          "Type calories as a whole number, like 760, or a range, like 760 to 860.",
        caloriesRange: "Keep calories under 100,000.",
        caloriesOrder: "Put the lower number first, like 760 to 860.",
        nameTaken: "Another size of this dish is called {size}.",
        gone: "That size is no longer here. Reload the page.",
        parentGone: "This dish is no longer here. Go back to Menus.",
        listChanged: "The sizes changed. Reload the page.",
      },
      // The link to the next dish in the section, so typing a section is one
      // pass (D-128), and what the last dish says instead.
      next: {
        label: "Next dish: {dish}",
        last: "This is the last dish in {section}.",
      },
      // Moving the dish to another section of the restaurant, from its own
      // page (D-129). Nothing is sent until the button is pressed. The
      // sentence says the owner has not left (D-141).
      move: {
        heading: "Move this dish",
        label: "Move to",
        placeholder: "Choose a section",
        submit: "Move dish",
        choose: "Choose a section first.",
        moved:
          "{dish} moved to {section} in {menu}. It is the last dish there. You are still on this page.",
        notMoved: "{dish} was not moved.",
        errors: {
          nameTaken: "{section} already has a dish called {dish}.",
          sectionGone: "That section is no longer here. Reload the page.",
        },
      },
      // The three pages that save by one press (D-223, D-229): the lead
      // under the h1 that says so, filled with the page's Save words; the
      // heading of the summary of problems a Save found; and the dialog an
      // owner link opens while the page holds unsaved changes.
      form: {
        lead: "Changes on this page save when you press {save}.",
        summary: "Check these fields",
        leave: {
          question: "Leave without saving?",
          note: "Your changes on this page are not saved.",
          keep: "Keep editing",
          leave: "Leave",
        },
      },
      // The dish's dietary tags (task 5, D-66): three boxes with a hint
      // each, and the sentence diners read under them from
      // domain/dietary.ts. The box names are the diner words
      // (en.dietary.names), so the box and the line are one source.
      tags: {
        heading: "Dietary tags",
        hints: {
          vegan: "No meat, fish, dairy, eggs, or honey.",
          vegetarian: "No meat or fish. Tick Vegan instead for a vegan dish.",
          "made-without-gluten":
            "Ingredients only. A dedicated fryer or a shared kitchen is said in your restaurant's allergen note.",
        },
        dinersRead: "Diners read: {sentence}",
        notSaved: "The dietary tags of {dish} were not saved.",
        tagsMoved:
          "The dietary tags changed since this page showed them, so nothing was saved. Look at the tags as they are now.",
        // The page's one Save (D-223, D-229) and the flash its landing
        // brings (D-219).
        submit: "Save dietary tags",
        saved: "Dietary tags saved.",
      },
      // Availability (task 5, D-160): three radios like Price's, a hint on
      // the two that change what diners see, and the group's line saying
      // what the choice means now, from the server's clock.
      availability: {
        heading: "Availability",
        available: "Available",
        soldOut: "Sold out today",
        off: "Off the menu for now",
        soldOutHint:
          "Diners read Sold out today. It comes back on its own at the end of your day.",
        offHint:
          "Diners do not see this dish until you choose Available again.",
        hidden: "Hidden from diners until you choose Available.",
        endsToday: "Available again on its own at {time} today.",
        endsTomorrow: "Available again on its own at {time} tomorrow.",
        endsOn: "Available again on its own on {date}, at {time}.",
        endsMidnight: "Available again on its own at midnight tonight.",
        notSaved: "The availability of {dish} was not saved.",
        // The page's one Save (D-223, D-229), for the choice and the
        // schedule together, and the flash its landing brings (D-219).
        submit: "Save availability",
        saved: "Availability saved.",
      },
      // The schedule (task 5, D-159): five optional parts under one
      // heading, days, hours, and Today only first, the sentence diners
      // read under them from domain/schedule.ts, and when the special
      // next shows. Day names are the hours grid's (restaurants.days) and
      // month names come from Intl.
      schedule: {
        heading: "Schedule",
        lead: "Set a schedule to make this dish a special. Diners see it only on the days you choose, from the start of the day until its hours end. Leave everything blank for a dish that is always on the menu.",
        daysLabel: "Days",
        hoursLabel: "Hours",
        starts: "Starts",
        ends: "Ends",
        hoursHint:
          "For example, 11 am, 5:30 pm, or 17:30. Leave both blank for all day.",
        todayOnly: "Today only",
        // Today only fills the two date fields in the page; Save keeps them
        // (D-223, D-229).
        todayOnlyFilled:
          "First day and last day set to {date}. Press Save availability to keep it.",
        firstDay: "First day",
        lastDay: "Last day",
        dateHint: "For example, October 31 or 10/31/2026.",
        weeksLabel: "Weeks of the month",
        weeksLead:
          "Which of the month's Fridays, for a special on the first Friday of each month. Needs a day above.",
        weeks: {
          first: "First",
          second: "Second",
          third: "Third",
          fourth: "Fourth",
          last: "Last",
        },
        monthsLabel: "Months of the year",
        monthsLead:
          "For a special that comes back each year, like a soup from September to April.",
        dinersRead: "Diners read: {sentence}",
        none: "No schedule. Diners see this dish whenever it is available.",
        showsNow: "Shows now, until {time}.",
        showsNowOn: "Shows now, until {time} {day}.",
        showsNowAllDay: "Shows now, all day.",
        nextShows: "Next shows {date}.",
        never: "No day ahead fits this schedule, so diners do not see it.",
        scheduleMoved:
          "The schedule changed since this page showed it, so nothing was saved. Look at the schedule as it is now.",
        errors: {
          timeAmPmStarts: "Add am or pm to the time it starts.",
          timeAmPmEnds: "Add am or pm to the time it ends.",
          timeFormatStarts:
            "Enter the time it starts, like 11 am, 5:30 pm, or 17:30.",
          timeFormatEnds:
            "Enter the time it ends, like 11 am, 5:30 pm, or 17:30.",
          timePairStarts:
            "Add the time it starts, or leave both blank for all day.",
          timePairEnds:
            "Add the time it ends, or leave both blank for all day.",
          sameTime:
            "The special starts and ends at the same time. Leave both blank for all day.",
          dateFormat: "Type a date like October 31 or 10/31/2026.",
          dateOrder: "The last day is before the first day.",
          weeksNeedDay:
            "Choose a day of the week first, since weeks say which of the month's Mondays.",
          scheduleShape: "That schedule could not be read. Reload the page.",
        },
      },
      // Cooked to order (task 7, D-167): one box under its own heading,
      // after Schedule. The advisory itself is the menu's, once, in the
      // diner page task.
      cookedToOrder: {
        heading: "Cooked to order",
        label: "Cooked to order",
        hint: "For meat, fish, or eggs that can be served rare or undercooked. Diners read Cooked to order. with this dish, and the menu carries the advisory once.",
      },
      // The dish's allergens and their check (task 4, D-148): the nine
      // major allergens as boxes with a hint each, other allergens as typed
      // rows, one box that checks the list, and the sentence diners read
      // under it with who checked it and when. The same-named offer is
      // D-129's. Every write that changes or checks a list carries the
      // lists the page showed and lands only if the dish still holds them.
      allergens: {
        heading: "Allergens",
        // The page's one Save (D-223, D-229) and the flash its landing
        // brings (D-219).
        submit: "Save allergens",
        saved: "Allergens saved.",
        groupLabel: "Major allergens",
        groupHint:
          "Tick each major allergen this dish contains, add any others below, then check the list once it is complete.",
        names: {
          milk: "Milk",
          eggs: "Eggs",
          fish: "Fish",
          shellfish: "Shellfish",
          "tree-nuts": "Tree nuts",
          peanuts: "Peanuts",
          wheat: "Wheat",
          soy: "Soy",
          sesame: "Sesame",
        },
        // Each hint names the places an owner misses the allergen; none
        // says a dish is safe.
        hints: {
          milk: "Butter, ghee, cheese, cream, yogurt, and whey count too.",
          eggs: "Mayonnaise, aioli, meringue, and egg wash count too.",
          fish: "Anchovies, fish sauce, and Worcestershire sauce count too.",
          shellfish:
            "Shrimp, crab, and lobster, and also clams, mussels, oysters, and scallops.",
          "tree-nuts":
            "Almonds, walnuts, pecans, cashews, pistachios, and pesto count too.",
          peanuts: "Peanut oil, peanut butter, and satay sauce count too.",
          wheat:
            "Flour, bread crumbs, pasta, soy sauce, and beer batter count too.",
          soy: "Soy sauce, tofu, edamame, miso, and tempeh count too.",
          sesame: "Tahini, hummus, sesame oil, and seeds on buns count too.",
        },
        othersLabel: "Other allergens",
        otherLabel: "Other allergen",
        // Follows the field's label, so every row's field names its place:
        // "Other allergen 2".
        otherLabelFor: "{position}",
        otherHint: "Like celery, mustard, or sulfites. One allergen per row.",
        // A row with no name yet, as its buttons name it: "allergen 2".
        unnamedOther: "allergen {position}",
        // A row control's whole name: its visible label first, then its
        // row.
        otherAction: "{action}, {other}",
        showOtherNames: "Show allergen names",
        addOther: "Add another allergen",
        removeOther: "Remove allergen",
        otherAdded: "Other allergen {position} added.",
        otherRemoved: "{other} removed.",
        blankRemoved: "Other allergen {position} removed.",
        othersFull: "A dish lists ten other allergens at most.",
        // Suggested after the restaurant's own other allergens.
        suggestions: [
          "Celery",
          "Mustard",
          "Sulfites",
          "Lupin",
          "Gluten",
          "Corn",
          "Coconut",
        ],
        checkLabel: "The allergen list is complete",
        checkHint:
          "Check this once every allergen in this dish is listed above. A change to the list clears the check.",
        dinersRead: "Diners read: {sentence}",
        checkedByYou: "Checked by you on {date}.",
        // While a check is on its way, before the stamp's date arrives.
        checkedByYouNow: "Checked by you.",
        checkedOn: "Checked on {date}.",
        notChecked: "Not checked yet.",
        cleared:
          "Not checked since the list changed. Check it again once the list is complete.",
        // Said after "Saved." when a change to a list clears the check.
        clearedNow: "The list is not checked now.",
        // A check, or a change to a list, found the dish holding other lists
        // than the page showed: nothing was written, and the page shows the
        // lists as they are now.
        listsChanged:
          "The allergen list changed since this page showed it, so it is not checked. Look at the list as it is now, then check it.",
        listsMoved:
          "The allergen list changed since this page showed it, so nothing was saved. Look at the list as it is now.",
        // An uncheck found the dish unchecked already, from another tab or
        // another device.
        checkChanged:
          "The check changed since this page showed it. The page shows it as it is now.",
        sameNamed: {
          different:
            "{dish} is also in {section}, {menu}, with a different allergen list.",
          unchecked: "{dish} is also in {section}, {menu}, not checked yet.",
          apply: "Apply this list there",
          // The button's whole name: its visible words first (WCAG 2.5.3).
          applyTo: "{action}, {dish} in {section}, {menu}",
          // Apply works from the saved list, so while the page holds
          // unsaved changes the press says this and sends nothing (D-229).
          saveFirst: "Save allergens first.",
          applied:
            "Applied. {dish} in {section}, {menu} has this list, checked by you.",
          errors: {
            sourceChanged:
              "This dish's list changed since this page showed it, so nothing was applied.",
            sourceUnchecked:
              "This dish is not checked now, so nothing was applied.",
            targetChanged:
              "{dish} in {section}, {menu} changed since this page loaded, so nothing was applied. Open its page to see it.",
            targetGone:
              "{dish} in {section}, {menu} is no longer there, so nothing was applied.",
            failed: "Nothing was applied.",
          },
        },
        notSaved: {
          allergens: "The allergens of {dish} were not saved.",
          other: "{other} was not saved.",
          check: "The allergen check for {dish} was not saved.",
        },
        notRemoved: "{other} was not removed.",
        errors: {
          otherRequired: "Type an allergen, or remove this row.",
          otherLength: "Keep an allergen name to 40 characters.",
          otherTaken: "This dish already lists {other}.",
          otherMajor:
            "{allergen} has its own box above. Tick it there instead.",
          otherMajorBoth:
            "Peanuts and Tree nuts have their own boxes above. Tick the one this dish has, or both.",
          // A comma reads as two allergens to a diner (D-151).
          otherComma:
            "An allergen name holds no comma. Put each allergen in its own row, with Add another allergen.",
        },
      },
    },
    // Choice lists (task 7, D-166, D-167): what a diner picks or adds with
    // a dish. A list belongs to one dish or one section and shows as a row
    // on its home's page, under its own heading; its lead and its options
    // are edited on the list's own page, where each option has its name,
    // its added price, its calories, and its own allergen group, the dish
    // page's with these words in place of the dish's. The sentences name
    // the list or the option, since a sentence is heard on its own.
    choices: {
      heading: "Choice lists",
      leadDish:
        "What a diner picks or adds with this dish, like a side, a dressing, or an add-on. Each list has a lead, like Choose one side, and its options.",
      leadSection:
        "What a diner picks or adds with any dish in this section, like a side, a dressing, or an add-on. Each list has a lead, like Choose one side, and its options.",
      // The rows on a dish's or a section's page: one row a list, named by
      // its lead, with no field; the lead is edited on the list's page.
      lists: {
        none: "No choice lists yet. Add the first one below.",
        moveUp: "Move up",
        moveDown: "Move down",
        remove: "Delete",
        // A row control's whole name: its visible label first, then its
        // list.
        rowAction: "{action}, {list}",
        // The link from a list's row to its own page.
        edit: "Edit choices",
        newLabel: "New choice list",
        newHint: "The words diners read first, like Choose one side or Add on.",
        add: "Add choice list",
        count: {
          one: "{count} choice list",
          other: "{count} choice lists",
        },
        // Every delete asks first (D-221), and names what goes when the
        // list holds any (D-119). The question is the dialog's name.
        optionCount: {
          one: "{count} option",
          other: "{count} options",
        },
        deleteAsk: "Delete {list}, with its {options}?",
        deleteAskEmpty: "Delete {list}?",
        keep: "Keep",
        added: "{list} added. {count}.",
        movedUp: "{list} moved up. {position} of {total}.",
        movedDown: "{list} moved down. {position} of {total}.",
        alreadyFirst: "{list} is already first.",
        alreadyLast: "{list} is already last.",
        deleted: "{list} deleted.",
        removed: "{list} removed.",
        notAdded: "{list} was not added.",
        notMoved: "{list} was not moved.",
        notDeleted: "{list} was not deleted.",
        errors: {
          leadRequired: "A choice list needs a lead.",
          leadLength: "Keep the lead to 120 characters.",
          // Which one fills nameTaken depends on the home (choice-words.ts).
          leadTakenDish: "This dish already has a choice list called {list}.",
          leadTakenSection:
            "This section already has a choice list called {list}.",
          gone: "That choice list is no longer here. Reload the page.",
          listChanged: "The choice lists changed. Reload the page.",
          // The database found more options than the owner was told about.
          grew: "It has options this page did not show. Press Delete again.",
        },
      },
      // The list's own page: its lead, then its options. The page is named
      // for its lead, so the lead's label does not repeat it; every
      // sentence names the list, since a sentence is heard on its own.
      page: {
        lead: "Each change saves when you leave its field.",
        leadLabel: "Lead",
        leadHint:
          "The words diners read first, like Choose one side or Add on.",
        showLeads: "Show suggested leads",
        suggestions: [
          "Choose one side",
          "Choose two sides",
          "Sweet or unsweet",
          "Add on",
          "Choose a dressing",
        ],
        optionsLead:
          "Options are what a diner picks or adds, like Fries or Ranch. Each has its own allergen list.",
        notSaved: {
          lead: "The lead of {list} was not saved.",
        },
        errors: {
          leadRequired: "A choice list needs a lead.",
          leadLength: "Keep the lead to 120 characters.",
          leadTakenDish: "This dish already has a choice list called {list}.",
          leadTakenSection:
            "This section already has a choice list called {list}.",
          gone: "This choice list is no longer here. Go back to Menus.",
          parentGone: "This choice list is no longer here. Go back to Menus.",
          listChanged: "The options changed. Reload the page.",
        },
      },
      // The options on the list's page: one row each, with three fields
      // and its allergen group, added by name (D-125).
      options: {
        none: "No options yet. Add the first one below.",
        nameLabel: "Option name",
        // Follows a field's label words inside the one label, so every
        // row's fields name their option: "Option name for Fries", "Added
        // price for Fries" (D-193).
        labelFor: "for {option}",
        priceLabel: "Added price",
        priceHint:
          "In dollars, like 1 or 1.50. Leave blank when it costs nothing extra.",
        caloriesLabel: "Calories",
        caloriesHint: "A number, like 760, or a range, like 760 to 860.",
        moveUp: "Move up",
        moveDown: "Move down",
        remove: "Remove",
        rowAction: "{action}, {option}",
        newLabel: "New option name",
        add: "Add option",
        count: {
          one: "{count} option",
          other: "{count} options",
        },
        added: "{option} added. {count}.",
        movedUp: "{option} moved up. {position} of {total}.",
        movedDown: "{option} moved down. {position} of {total}.",
        alreadyFirst: "{option} is already first.",
        alreadyLast: "{option} is already last.",
        deleted: "{option} removed.",
        removed: "{option} removed.",
        notSaved: {
          name: "Name of {option} was not saved.",
          price: "The added price for {option} was not saved.",
          calories: "The calories for {option} were not saved.",
        },
        notAdded: "{option} was not added.",
        notMoved: "{option} was not moved.",
        notDeleted: "{option} was not removed.",
        errors: {
          nameRequired: "An option needs a name.",
          nameLength: "Keep the name to 60 characters.",
          nameTaken: "This list already has an option called {option}.",
          priceFormat: "Type a price like 2, 1.50, or $2.",
          priceRange: "Keep the price under $100,000.",
          caloriesFormat:
            "Type calories as a whole number, like 760, or a range, like 760 to 860.",
          caloriesRange: "Keep calories under 100,000.",
          caloriesOrder: "Put the lower number first, like 760 to 860.",
          gone: "That option is no longer here. Reload the page.",
          parentGone: "This choice list is no longer here. Go back to Menus.",
          listChanged: "The options changed. Reload the page.",
        },
      },
      // An option's own allergens (D-154, D-166): the dish page's group
      // under the option's row, with these words in place of the dish's.
      // As a change to the dish's list clears its check, a change to the
      // option's name clears the option's, since the name is all that
      // names the food (Michael, October 10, 2026).
      allergens: {
        heading: "Allergens for {option}",
        lead: "Tick each major allergen this option contains, add any others below, then check the list once it is complete.",
        checkHint:
          "Check this once every allergen in this option is listed above. A change to the option's name or its list clears the check.",
        othersFull: "An option lists ten other allergens at most.",
        cleared:
          "Not checked since the option or its list changed. Check it again once the list is complete.",
        listsChanged:
          "The option or its allergen list changed since this page showed it, so it is not checked. Look at the option as it is now, then check it.",
        listsMoved:
          "The option or its allergen list changed since this page showed it, so nothing was saved. Look at the option as it is now.",
        checkChanged:
          "The check changed since this page showed it. The page shows it as it is now.",
        notSaved: {
          allergens: "The allergens of {option} were not saved.",
          check: "The allergen check for {option} was not saved.",
        },
        errors: {
          otherTaken: "This option already lists {other}.",
          otherMajorBoth:
            "Peanuts and Tree nuts have their own boxes above. Tick the one this option has, or both.",
        },
        sameNamed: {
          sourceChanged:
            "This option's list changed since this page showed it, so nothing was applied.",
          sourceUnchecked:
            "This option is not checked now, so nothing was applied.",
        },
      },
      // Where an option is, as the same-named offer names a place (D-129,
      // D-166): the list it is in and the list's home, "Choose one side
      // for Kids burger", in the section's place of the sentence.
      placeIn: "{lead} for {home}",
    },
  },
  // The diner page (Spec 3.1, D-81). The week in words comes one line per
  // run of days with the same times (D-92); the notices belong to the
  // template and are never typed by an owner (D-167).
  menu: {
    title: "{restaurant} menu",
    // Every menu page's title names its menu, whatever the number of menus
    // (Q-97): menuName adds the word once to a name that lacks it ("Dinner
    // menu"), a name that already ends in menuWord gets nothing ("Kids
    // Menu"), and a name that is only the word reads as no name, the title
    // above alone. Built by menuNaming() in domain/diner.ts, which also
    // gives the line under the restaurant's name when one menu is
    // published; title alone names the two unavailable pages.
    menuTitle: "{menu}, {restaurant}",
    menuName: "{menu} menu",
    menuWord: "menu",
    menusLabel: "Menus",
    hoursLabel: "Hours",
    hours: {
      line: "{days}, {hours}.",
      closed: "{days}, closed.",
      allDay: "{days}, open 24 hours.",
      dayRun: "{first} to {last}",
      twoRanges: "{first} and {second}",
      range: "{open} to {close}",
    },
    website: "Restaurant website",
    sectionsLabel: "Sections",
    sectionLink: "{section}, {items}",
    // The link inside each dish of a section whose lists show once under
    // the heading, and the name of that block (Q-74, D-81).
    sectionChoicesLink: "Choices for every dish in {section}",
    items: {
      one: "{count} item",
      other: "{count} items",
    },
    marketPrice: "Market price",
    cookedToOrder: "Cooked to order.",
    // A known code with no menu diners can read (Q-84, Q-31), and a menu id
    // that is not one of the restaurant's published menus.
    unavailable: "This menu isn't available right now.",
    menuUnavailable: "That menu isn't available right now.",
    menuUnavailableLink: "See {restaurant}'s menu.",
    // A published menu that shows no dish right now, every dish off the menu
    // for now or every special outside its hours (D-177): one line where the
    // sections would be; the restaurant's note above it stays, and nothing
    // claims its allergens are confirmed.
    nothingServed: "Nothing on this menu is served right now.",
    notices: {
      calories:
        "2,000 calories a day is used for general nutrition advice, but calorie needs vary.",
      nutrition: "More nutrition information is available on request.",
      advisory:
        "Eating raw or undercooked meat, poultry, seafood, shellfish, or eggs may raise your risk of foodborne illness.",
    },
    footer: {
      feedback: "Feedback about this menu",
      statement: "Accessibility statement",
    },
  },
  allergens: {
    names: {
      milk: "milk",
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
      "dedicated-fryer":
        "We keep a dedicated fryer for dishes made without gluten ingredients.",
      "shared-kitchen":
        "Dishes made without gluten ingredients are cooked in a shared kitchen. Not suitable for celiac disease.",
    },
    // The header line (D-36). Options in choice lists count too (D-166):
    // the line never says every dish is confirmed while an option is not.
    confirming: {
      one: "We're still confirming allergens for 1 dish. Ask your server about that.",
      other:
        "We're still confirming allergens for {count} dishes. Ask your server about those.",
      optionsOne:
        "We're still confirming allergens for 1 option. Ask your server about that.",
      optionsOther:
        "We're still confirming allergens for {count} options. Ask your server about those.",
      both: "We're still confirming allergens for {dishes} and {options}. Ask your server about those.",
      dishes: { one: "1 dish", other: "{count} dishes" },
      options: { one: "1 option", other: "{count} options" },
    },
    confirmedAll: "Allergens confirmed for every dish.",
  },
  dietary: {
    names: {
      vegan: "Vegan",
      vegetarian: "Vegetarian",
      "made-without-gluten": "Made without gluten ingredients",
    },
  },
  // The words a special's schedule is read in (D-159), built into one
  // sentence by domain/schedule.ts for the dish page, the diner page, read
  // aloud, and translations. Phrases start lowercase; the sentence
  // capitalizes its first letter. Day names need their plural as a word.
  // Month names, dates, and the list joiner come from Intl. The singular
  // day names are the hours grid's (owner.restaurants.days), handed in
  // beside these.
  schedule: {
    days: {
      mon: "Mondays",
      tue: "Tuesdays",
      wed: "Wednesdays",
      thu: "Thursdays",
      fri: "Fridays",
      sat: "Saturdays",
      sun: "Sundays",
    },
    week: {
      first: "first",
      second: "second",
      third: "third",
      fourth: "fourth",
      last: "last",
    },
    everyDay: "every day",
    weeksOfEachMonth: "the {weeks} {day} of each month",
    weeksInMonth: "the {weeks} {day} in {month}",
    monthRun: "{first} to {last}",
    hours: "{open} to {close}",
    between: "{from} to {until}",
    from: "from {date}",
    until: "until {date}",
    todayOnly: "today only",
    dayOnly: "{date} only",
  },
  // What diners read with a dish sold out today (D-160). A dish off the
  // menu is hidden, so it has no words.
  availability: {
    soldOut: "Sold out today.",
  },
  money: {
    dollar: { one: "dollar", other: "dollars" },
    cent: { one: "cent", other: "cents" },
    and: "and",
    to: "to",
    // An option's added price (D-166): "+$2.00" is said "plus two
    // dollars", and a price of zero reads the same both ways.
    plus: "plus",
    noExtraCharge: "no extra charge",
  },
  // Calories (D-167), read by one builder everywhere they show.
  calories: {
    one: "{count} calorie",
    other: "{count} calories",
    range: "{low} to {high} calories",
  },
  time: {
    am: "am",
    pm: "pm",
    noon: "noon",
    midnight: "midnight",
  },
  // The accessibility statement (Spec 3.4, 7, D-38, D-184), one per
  // restaurant code, generated from its data and these fixed words. The
  // last-tested date, the known issues, and the direct email arrive with
  // Phase 4's release log and barrier reports and with Q-1's domain (Q-109);
  // nothing here reads as coming soon.
  statement: {
    title: "Accessibility statement, {restaurant}",
    heading: "Accessibility statement for {restaurant}",
    standard:
      "Built to WCAG 2.2 AA and tested with real screen readers on every release.",
    // How it is tested (Spec 10), in plain words: the automated checks,
    // then the hands (Michael, October 18, 2026).
    tested: {
      heading: "How it is tested",
      text: "Before every release, automated checks run on every menu page: axe, a keyboard walk of every control, contrast, 200% zoom, a 320 pixel wide screen, and text spacing. Then we test by hand with VoiceOver on iPhone, TalkBack on Android, NVDA on Windows, and a keyboard alone.",
    },
    barriers: {
      heading: "If something is in your way",
      fixed:
        "If something gets in your way, tell us. Reported barriers are fixed within five business days.",
      reply: "A person replies within two business days.",
      person: "Michael, founder, reads every barrier report.",
    },
    // What we count (Spec 4.7, D-24): the standing limit, in the present
    // tense. Nothing counts more than this today, and the beacons that
    // arrive with Phase 3 and Phase 8 are built under it, so the statement
    // never has to be rewritten to say less (Michael, October 18, 2026).
    // Filters are parked (D-29), so they are not here.
    counts: {
      heading: "What we count",
      lead: "Totals, never people. The menu sets no cookie, loads nothing from anyone else, and keeps nothing about you. The only things we ever count are:",
      items: [
        "how many times a menu is read each day",
        "which languages are used",
        "how often read aloud starts",
        "which text sizes are chosen",
        "which contrast setting is chosen",
        "how often allergen lines are hidden",
      ],
    },
    menus: {
      heading: "Menus",
    },
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
