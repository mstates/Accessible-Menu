import type { City, Restaurant } from "@/domain/types";

// The hard-coded sample menu for Phase 0. Phase 1 replaces this seam with
// core/supabase. Prices cover all three shapes and the items
// cover all three allergen sentences.
export const demoCity: City = { slug: "reading-pa", name: "Reading, PA" };

export const demoRestaurant: Restaurant = {
  slug: "demo",
  name: "Maple Street Kitchen",
  city: demoCity,
  hours: "Tuesday to Sunday, 11 am to 9 pm",
  allergenNote: null,
  prepNotes: ["shared-fryer"],
  region: "us",
  menus: [
    {
      id: "dinner",
      name: "Dinner",
      sections: [
        {
          id: "starters",
          name: "Starters",
          items: [
            {
              id: "beet-salad",
              name: "Roasted Beet Salad",
              description:
                "Golden and red beets, orange segments, toasted walnuts, and a maple vinaigrette.",
              price: { kind: "exact", cents: 1100 },
              allergens: ["tree-nuts"],
              customAllergens: [],
              allergensReviewed: true,
              dietaryTags: ["vegan"],
            },
            {
              id: "soup",
              name: "Soup of the Day",
              description:
                "Ask your server what is simmering today. Served with a slice of sourdough.",
              price: { kind: "range", minCents: 600, maxCents: 900 },
              allergens: [],
              customAllergens: [],
              allergensReviewed: false,
              dietaryTags: [],
            },
            {
              id: "chickpeas",
              name: "Crispy Chickpeas",
              description:
                "Fried chickpeas tossed in smoked paprika and lemon.",
              price: { kind: "exact", cents: 750 },
              allergens: [],
              customAllergens: [],
              allergensReviewed: true,
              dietaryTags: ["vegan"],
            },
          ],
        },
        {
          id: "mains",
          name: "Mains",
          // The address is one long unbroken string on purpose: the a11y gate
          // checks that it wraps at 320px under the text-spacing override.
          note: "Every main is cooked to order and takes about twenty minutes. Parties of eight or more, write to reservations@maplestreetkitchen.example.",
          items: [
            {
              id: "trout",
              name: "Pan-Seared Trout",
              description:
                "Local trout with brown butter, capers, and roasted potatoes.",
              price: { kind: "text", text: "Market price" },
              allergens: ["fish", "milk"],
              customAllergens: [],
              allergensReviewed: true,
              dietaryTags: [],
              note: "Ask your server about tonight's catch.",
            },
            {
              id: "peanut-noodles",
              name: "Peanut Noodles",
              description:
                "Rice noodles in a peanut sauce with cucumber, scallions, and crushed peanuts.",
              price: { kind: "exact", cents: 1650 },
              allergens: ["peanuts", "soy", "sesame"],
              customAllergens: [],
              allergensReviewed: true,
              dietaryTags: ["vegan"],
            },
            {
              id: "risotto",
              name: "Mushroom Risotto",
              description: "Arborio rice, wild mushrooms, parmesan, and thyme.",
              price: { kind: "exact", cents: 1900 },
              allergens: ["milk"],
              customAllergens: [],
              allergensReviewed: true,
              dietaryTags: ["vegetarian"],
            },
          ],
        },
        {
          id: "desserts",
          name: "Desserts",
          items: [
            {
              id: "lemon-cake",
              name: "Lemon Olive Oil Cake",
              description: "A moist cake with a lemon glaze and whipped cream.",
              price: { kind: "exact", cents: 900 },
              allergens: ["wheat", "eggs", "milk"],
              customAllergens: [],
              allergensReviewed: true,
              dietaryTags: ["vegetarian"],
            },
            {
              id: "sorbet",
              name: "Seasonal Sorbet",
              description:
                "Two scoops of fruit sorbet. Ask your server for today's flavors.",
              price: { kind: "exact", cents: 600 },
              allergens: [],
              customAllergens: [],
              allergensReviewed: false,
              dietaryTags: ["vegan"],
            },
          ],
        },
      ],
    },
  ],
};
