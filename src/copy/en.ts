// Every user-facing string, in English. Components import from "@/copy" and
// hold no literal copy (module rule 6). tests/unit/copy-guard.test.ts checks
// every string here for banned words.
export const en = {
  lang: "en",
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
  },
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
        saved: "Saved.",
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
        // The box's visible words, then its day in visually hidden text:
        // "Open 24 hours on Monday" (D-124).
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
      },
      days: {
        mon: "Monday",
        tue: "Tuesday",
        wed: "Wednesday",
        thu: "Thursday",
        fri: "Friday",
        sat: "Saturday",
        sun: "Sunday",
      },
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
    // The editing model every menu screen shares (D-111): one saved status,
    // one Undo, and the reasons a save can fail whatever the field.
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
      // it is removed, not deleted, and nothing is left to undo.
      removeUnsaved: "Remove",
      tryAgain: "Try again",
      reload: "Reload",
      undo: "Undo",
      nothingToUndo: "Nothing to undo.",
      notUndone: "That was not undone.",
      stale: "That change can no longer be undone.",
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
      // A delete that takes sections with it asks first, and names what goes
      // (D-119): its sections, and their dishes when they hold any. The
      // question is the dialog's name.
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
      keep: "Keep",
      added: "{menu} added. {count}.",
      movedUp: "{menu} moved up. {position} of {total}.",
      movedDown: "{menu} moved down. {position} of {total}.",
      alreadyFirst: "{menu} is already first.",
      alreadyLast: "{menu} is already last.",
      deleted: "{menu} deleted. Undo is available.",
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
      undo: {
        renamed: "Undo: renamed {from} to {to}",
        added: "Undo: added {menu}",
        deleted: "Undo: deleted {menu}",
        moved: "Undo: moved {menu}",
        renamedBack: "Undone. The name is {from} again.",
        removed: "Undone. {menu} is removed.",
        restored: "Undone. {menu} is back, {position} of {total}.",
        movedBack: "Undone. {menu} is back at {position} of {total}.",
        textChanged: "The name was changed again since, so nothing was undone.",
        restoreBlocked:
          "{menu} cannot come back while another menu is called {menu}.",
        renameBlocked:
          "The name {from} is taken by another menu, so this was not undone.",
        // Undo never deletes content: an added menu that now holds sections
        // stays, and its Delete button is the way to remove it.
        addGrew:
          "{menu} has sections now, so it stays. To delete it, use its Delete button.",
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
      // Follows the name's label in hidden text, so every row's field names
      // its section.
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
      // A delete that takes dishes with it asks first, and names what goes
      // (D-119). The question is the dialog's name.
      dishCount: {
        one: "{count} dish",
        other: "{count} dishes",
      },
      deleteAsk: "Delete {section}, with its {dishes}?",
      keep: "Keep",
      added: "{section} added. {count}.",
      movedUp: "{section} moved up. {position} of {total}.",
      movedDown: "{section} moved down. {position} of {total}.",
      alreadyFirst: "{section} is already first.",
      alreadyLast: "{section} is already last.",
      deleted: "{section} deleted. Undo is available.",
      removed: "{section} removed.",
      notSaved: {
        name: "Name of {section} was not saved.",
        note: "Note for {section} was not saved.",
        everyItem: "The line for every dish in {section} was not saved.",
      },
      notAdded: "{section} was not added.",
      notMoved: "{section} was not moved.",
      notDeleted: "{section} was not deleted.",
      errors: {
        nameRequired: "A section needs a name.",
        nameLength: "Keep the name to 60 characters.",
        noteLength: "Keep the note to 500 characters.",
        everyItemLength: "Keep this line to 120 characters.",
        nameTaken: "Another section is called {section}.",
        gone: "That section is no longer here. Reload the page.",
        parentGone: "This menu is no longer here. Go back to Menus.",
        listChanged: "The list of sections changed. Reload the page.",
        // The database found more dishes than the owner was told about.
        grew: "It has dishes this page did not show. Press Delete again.",
      },
      undo: {
        renamed: "Undo: renamed {from} to {to}",
        added: "Undo: added {section}",
        deleted: "Undo: deleted {section}",
        moved: "Undo: moved {section}",
        note: "Undo: changed the note for {section}",
        everyItem: "Undo: changed the line for every dish in {section}",
        renamedBack: "Undone. The name is {from} again.",
        removed: "Undone. {section} is removed.",
        restored: "Undone. {section} is back, {position} of {total}.",
        movedBack: "Undone. {section} is back at {position} of {total}.",
        noteBack: "Undone. The note for {section} is as it was.",
        everyItemBack:
          "Undone. The line for every dish in {section} is as it was.",
        textChanged: "That was changed again since, so nothing was undone.",
        restoreBlocked:
          "{section} cannot come back while another section is called {section}.",
        renameBlocked:
          "The name {from} is taken by another section, so this was not undone.",
        // Undo never deletes content: an added section that now holds dishes
        // stays, and its Delete button is the way to remove it.
        addGrew:
          "{section} has dishes now, so it stays. To delete it, use its Delete button.",
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
      added: "{dish} added. {count}.",
      movedUp: "{dish} moved up. {position} of {total}.",
      movedDown: "{dish} moved down. {position} of {total}.",
      alreadyFirst: "{dish} is already first.",
      alreadyLast: "{dish} is already last.",
      deleted: "{dish} deleted. Undo is available.",
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
      undo: {
        renamed: "Undo: renamed {from} to {to}",
        added: "Undo: added {dish}",
        deleted: "Undo: deleted {dish}",
        moved: "Undo: moved {dish}",
        renamedBack: "Undone. The name is {from} again.",
        removed: "Undone. {dish} is removed.",
        restored: "Undone. {dish} is back, {position} of {total}.",
        movedBack: "Undone. {dish} is back at {position} of {total}.",
        textChanged: "The name was changed again since, so nothing was undone.",
        restoreBlocked:
          "{dish} cannot come back while another dish is called {dish}.",
        renameBlocked:
          "The name {from} is taken by another dish, so this was not undone.",
      },
      // The section's own texts, at the top of its page (D-120, D-135).
      // The page is the section, so the labels do not name it. The lead
      // comes before the first field it governs.
      section: {
        lead: "Each change saves when you leave its field.",
        noteLabel: "Note",
        noteHint:
          "For the whole section. Diners read it once, under the section name.",
        everyItemLabel: "Shown with every dish",
        everyItemHint:
          'For an option or side, like "Add spaghetti to any dish for 3 dollars." Diners read it with each dish in this section. Allergens still go on each dish.',
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
        undo: {
          moved: "Undo: moved {section} to {menu}",
          movedBack:
            "Undone. {section} is back in {menu}, {position} of {total}.",
          blocked:
            "{section} cannot go back while {menu} has another section called {section}.",
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
        sizeRemoved: "{size} removed. Undo is available.",
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
        priceKind: "The price choice for {dish} was not saved.",
        sizeName: "The name of {size} was not saved.",
        sizePrice: "The price for {size} was not saved.",
      },
      notAdded: "A size was not added.",
      notRemoved: "{size} was not removed.",
      errors: {
        descriptionLength: "Keep the description to 500 characters.",
        noteLength: "Keep the note to 120 characters.",
        sizeNameLength: "Keep a size name to 40 characters.",
        priceFormat: "Type a price like 12, 12.50, or $12.",
        priceRange: "Keep the price under $100,000.",
        nameTaken: "Another size of this dish is called {size}.",
        gone: "That size is no longer here. Reload the page.",
        parentGone: "This dish is no longer here. Go back to Menus.",
        listChanged: "The sizes changed. Reload the page.",
      },
      undo: {
        description: "Undo: changed the description of {dish}",
        descriptionBack: "Undone. The description of {dish} is as it was.",
        note: "Undo: changed the note for {dish}",
        noteBack: "Undone. The note for {dish} is as it was.",
        price: "Undo: changed the price of {dish}",
        priceBack: "Undone. The price of {dish} is as it was.",
        priceKind: "Undo: changed how {dish} is priced",
        priceKindBack: "Undone. {dish} is priced as before: {kind}.",
        sizeAdded: "Undo: added {size}",
        sizeRemoved: "Undone. {size} is removed.",
        sizeDeleted: "Undo: removed {size}",
        sizeRestored: "Undone. {size} is back.",
        sizeName: "Undo: changed the name of {size}",
        sizeNameBack: "Undone. The name of {size} is as it was.",
        sizePrice: "Undo: changed the price for {size}",
        sizePriceBack: "Undone. The price for {size} is as it was.",
        textChanged: "That was changed again since, so nothing was undone.",
        restoreBlocked:
          "{size} cannot come back while another size is called {size}.",
        // Undo never deletes content: an added size that holds a name or a
        // price now stays, and its Remove button is the way to remove it.
        addGrew:
          "{size} has a name or a price now, so it stays. To remove it, use its Remove button.",
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
        undo: {
          moved: "Undo: moved {dish} to {section}",
          movedBack:
            "Undone. {dish} is back in {section}, {position} of {total}.",
          blocked:
            "{dish} cannot go back while {section} has another dish called {dish}.",
        },
      },
      // The dish's allergens and their check (task 4, D-148): the nine
      // major allergens as boxes with a hint each, other allergens as typed
      // rows, one box that checks the list, and the sentence diners read
      // under it with who checked it and when. The same-named offer is
      // D-129's. Every write that changes or checks a list carries the
      // lists the page showed and lands only if the dish still holds them.
      allergens: {
        heading: "Allergens",
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
        otherRemoved: "{other} removed. Undo is available.",
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
          undo: {
            applied: "Undo: applied this list to {dish} in {section}, {menu}",
            back: "Undone. {dish} in {section}, {menu} has its old list back. It is not checked now.",
            backUnchanged: "Undone. {dish} in {section}, {menu} is as it was.",
            changed:
              "{dish} in {section}, {menu} has changed since, so it stays as it is.",
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
        },
        undo: {
          ticked: "Undo: ticked {allergen} for {dish}",
          unticked: "Undo: unticked {allergen} for {dish}",
          tickedBack: "Undone. {allergen} is unticked again.",
          untickedBack: "Undone. {allergen} is ticked again.",
          otherAdded: "Undo: added {other}",
          otherRemoved: "Undo: removed {other}",
          otherRenamed: "Undo: renamed {from} to {to}",
          othersChanged: "Undo: changed the other allergens for {dish}",
          otherAddedBack: "Undone. {other} is removed.",
          otherRemovedBack: "Undone. {other} is back.",
          otherRenamedBack: "Undone. The name is {from} again.",
          othersBack:
            "Undone. The other allergens for {dish} are as they were.",
          checked: "Undo: checked the allergens for {dish}",
          unchecked: "Undo: unchecked the allergens for {dish}",
          checkedBack: "Undone. The allergens for {dish} are not checked.",
          uncheckedBack: "Undone. The allergens for {dish} are checked by you.",
          listsChanged:
            "The allergen list was changed again since, so nothing was undone.",
        },
      },
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
      "made-without-gluten": "Made without gluten ingredients",
    },
  },
  money: {
    dollar: { one: "dollar", other: "dollars" },
    cent: { one: "cent", other: "cents" },
    and: "and",
    to: "to",
  },
  time: {
    am: "am",
    pm: "pm",
    noon: "noon",
    midnight: "midnight",
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
