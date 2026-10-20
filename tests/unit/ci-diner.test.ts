import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// CI Diner's data file is run by hand in the SQL editor and grows with later
// tasks (D-126). What it promises in its header holds for every version: it
// touches one restaurant, deletes nothing, and creates nothing.

const file = fileURLToPath(
  new URL("../../supabase/checks/ci_diner.sql", import.meta.url),
);
const text = readFileSync(file, "utf8");
// The statements alone. Comments and the report's sentences say what the
// file never does, and what to do by hand, in words.
const code = text
  .split("\n")
  .map((line) => line.replace(/--.*$/, ""))
  .join("\n")
  .replace(/'(?:[^']|'')*'/g, "''");

describe("CI Diner's data file (D-126)", () => {
  it("names no restaurant but CI Diner", () => {
    const codes = new Set(text.match(/\b\d{8}\b/g) ?? []);
    expect([...codes]).toEqual(["56097672"]);
  });

  it("deletes nothing, by statement or by mark", () => {
    expect(code).not.toMatch(/\b(delete|truncate|drop)\b/i);
    expect(code).not.toMatch(/\bdeleted_at\s*=/i);
  });

  it("creates nothing and grants nothing", () => {
    expect(code).not.toMatch(/\b(create|alter|grant|revoke)\b/i);
  });

  it("writes only through inserts, the details, sort updates, the eight dishes' prices, seven dishes' allergens, the roll's price, lists, and check, the four dishes' tags, availability, and schedule, the calories, the dressing options, the mark, Kids' descriptions and options, and Brunch's dish", () => {
    const updates = code.match(/\bupdate\s+public\.\w+\s+\w+\s+set\s+\w+/gi);
    expect(updates).toEqual([
      "update public.restaurants r\n  set timezone",
      "update public.menus m\n  set sort",
      "update public.sections s\n  set sort",
      "update public.items i\n  set sort",
      "update public.items i\n  set price_kind",
      "update public.items i\n  set price_kind",
      "update public.items i\n  set price_kind",
      "update public.items i\n  set allergens",
      "update public.items i\n  set allergens_reviewed",
      "update public.items i\n  set allergens",
      "update public.items i\n  set allergens_reviewed",
      "update public.choice_options o\n  set added_price_cents",
      "update public.choice_options o\n  set allergens_reviewed",
      "update public.items i\n  set dietary_tags",
      "update public.items i\n  set available",
      "update public.items i\n  set special_schedule",
      "update public.items i\n  set calories_low",
      "update public.choice_options o\n    set calories_low",
      "update public.choice_options o\n    set allergens_reviewed",
      "update public.choice_options o\n  set sort",
      "update public.item_sizes z\n  set calories_low",
      "update public.items i\n  set calories_low",
      "update public.items i\n  set price_kind",
      "update public.items i\n  set allergens",
      "update public.items i\n  set allergens_reviewed",
      "update public.sections s\n  set sort",
      "update public.items i\n    set price_kind",
      "update public.items i\n    set description",
      "update public.items i\n    set allergens",
      "update public.items i\n    set allergens_reviewed",
      "update public.items i\n  set sort",
      "update public.choice_options o\n      set calories_low",
      "update public.choice_options o\n      set allergens_reviewed",
      "update public.choice_options o\n    set sort",
      "update public.items i\n  set price_kind",
      "update public.items i\n  set description",
      "update public.items i\n  set allergens",
      "update public.items i\n  set allergens_reviewed",
      "update public.items i\n  set available",
    ]);
  });

  // The live details the diner page reads (the diner page task, and the
  // icons toggle, D-189): one statement on the restaurant's row, writing
  // the five columns and nothing else, never the name, the code, or the
  // status.
  it("sets the time zone, hours, preparation sentence, allergen note, and icons in one statement and writes nothing else to the restaurant", () => {
    const writes = [
      ...code.matchAll(/update public\.restaurants r\n  set [^;]*;/g),
    ].map((match) => match[0]);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatch(/where r\.id = diner/);
    expect(writes[0]).toMatch(/show_icons = true/);
    expect(writes[0]).toMatch(/or not r\.show_icons\)/);
    expect(writes[0]).not.toMatch(
      /\b(name|code|status|plan|address|city|region|postal_code|phone|website|stripe_customer_id)\s*=/,
    );
  });

  // The tags, availability, and schedule updates (migration 9, task 5)
  // touch Starters' three dishes by id, and Brunch's Shakshuka goes off the
  // menu the same way (D-177); nothing else is written to them.
  it("tags, takes off, and schedules the four dishes by id and writes nothing else to them", () => {
    const writes = [
      ...code.matchAll(
        /update public\.items i\n  set (dietary_tags|available|special_schedule)[^;]*;/g,
      ),
    ].map((match) => match[0]);
    expect(writes).toHaveLength(4);
    for (const statement of writes) {
      expect(statement).toMatch(/where i\.id = (soup|salad|bread|shakshuka)/);
      expect(statement).not.toMatch(
        /\b(name|sort|description|note|price_kind|price_cents|allergens)\s*=/,
      );
    }
  });

  // The price updates touch only Starters' three dishes, Drinks' Lemonade,
  // Kids' three dishes, and Brunch's Shakshuka, by id, and write only the
  // choice and the price (D-139); a description is its own statement.
  it("prices the eight dishes by id and writes nothing else to them", () => {
    const prices = [
      ...code.matchAll(/update public\.items i\n\s+set price_kind[^;]*;/g),
    ].map((match) => match[0]);
    expect(prices).toHaveLength(6);
    for (const statement of prices) {
      expect(statement).toMatch(
        /where i\.id = (soup|salad|bread|lemonade|dish_id|shakshuka)/,
      );
      expect(statement).not.toMatch(/\b(name|sort|description|note)\s*=/);
    }
    const descriptions = [
      ...code.matchAll(/update public\.items i\n\s+set description[^;]*;/g),
    ].map((match) => match[0]);
    expect(descriptions).toHaveLength(2);
    for (const statement of descriptions) {
      expect(statement).toMatch(/where i\.id = (dish_id|shakshuka)/);
      expect(statement).not.toMatch(
        /\b(name|sort|note|price_kind|price_cents|allergens)\s*=/,
      );
    }
  });

  // The allergen writes touch the soup, the salad, the lemonade, Kids'
  // three dishes, and Brunch's Shakshuka, by id, write only the two lists
  // and the check, and check in a statement of their own, since one
  // statement that changes a list and checks it ends unchecked (D-148).
  it("lists and checks seven dishes' allergens by id, the check in its own statement, as CI Diner's owner", () => {
    const lists = [
      ...code.matchAll(/update public\.items i\n\s+set allergens =[^;]*;/g),
    ].map((match) => match[0]);
    const checks = [
      ...code.matchAll(
        /update public\.items i\n\s+set allergens_reviewed = true[^;]*;/g,
      ),
    ].map((match) => match[0]);
    expect(lists).toHaveLength(5);
    expect(checks).toHaveLength(5);
    for (const statement of [...lists, ...checks]) {
      expect(statement).toMatch(
        /where i\.id = (soup|salad|lemonade|dish_id|shakshuka)/,
      );
      expect(statement).not.toMatch(
        /\b(name|sort|description|note|price_kind|price_cents|allergens_reviewed_by|allergens_reviewed_at)\s*=/,
      );
    }
    for (const statement of lists) {
      expect(statement).not.toMatch(/allergens_reviewed\s*=/);
    }
    // A check needs a person: the block acts as CI Diner's owner, read from
    // the owners table, and never names a user id of its own.
    expect(code).toMatch(
      /from public\.owners o\s+where o\.restaurant_id = diner/,
    );
    expect(code).toMatch(
      /set_config\(''[\s\S]*?json_build_object\(''[\s\S]*?owner_uid/,
    );
    expect(text).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/,
    );
  });

  // The choice lists (migration 11, task 7, and Build 2 of the diner page
  // task): the roll list on Starters, the dressing list on House salad,
  // and Kids' two lists, each option's lists in one statement and its
  // check in its own, by id, as CI Diner's owner, and never the stamps. No
  // lead or option names a dish in Starters, since the gate matches names
  // by substring, and no Kids drink is Lemonade, which the gate matches
  // exactly on the Drinks page.
  it("gives Starters its roll list, House salad its dressing list, and Kids its two lists, each option checked in its own statement by id, naming no dish", () => {
    const lists = [
      ...code.matchAll(
        /update public\.choice_options o\n\s+set (added_price_cents|calories_low) =[^;]*;/g,
      ),
    ].map((match) => match[0]);
    const checks = [
      ...code.matchAll(
        /update public\.choice_options o\n\s+set allergens_reviewed = true[^;]*;/g,
      ),
    ].map((match) => match[0]);
    expect(lists).toHaveLength(3);
    expect(checks).toHaveLength(3);
    for (const statement of [...lists, ...checks]) {
      expect(statement).toMatch(/where o\.id = (roll|option_id)/);
      expect(statement).not.toMatch(
        /\b(name|sort|deleted_at|allergens_reviewed_by|allergens_reviewed_at)\s*=/,
      );
    }
    for (const statement of lists) {
      expect(statement).not.toMatch(/allergens_reviewed\s*=/);
    }
    const inserts = [
      ...text.matchAll(
        /insert into public\.choice_(lists|options) \(([^)]*)\)/g,
      ),
    ].map((match) => `${match[1]}: ${match[2]}`);
    expect(inserts).toEqual([
      "lists: section_id, lead, sort",
      "options: choice_list_id, name, sort",
      "lists: item_id, lead, sort",
      "options: choice_list_id, name, sort",
      "lists: section_id, lead, sort",
      "options: choice_list_id, name, sort",
    ]);
    const leads = [
      ...text.matchAll(/values \((?:starters|salad), '([^']+)', 1\)/g),
    ].map((match) => match[1]);
    expect(leads).toEqual([
      "Add a buttered roll to any dish",
      "Choose a dressing",
    ]);
    const kidsLeads = [...text.matchAll(/\('(Choose one \w+)', [12]\)/g)].map(
      (match) => match[1],
    );
    expect(kidsLeads).toEqual(["Choose one side", "Choose one drink"]);
    const kidsOptions = [
      ...text.matchAll(/\('Choose one \w+', '([^']+)', /g),
    ].map((match) => match[1] ?? "");
    expect(kidsOptions).toHaveLength(11);
    expect(kidsOptions.map((name) => name.toLowerCase())).not.toContain(
      "lemonade",
    );
    for (const words of [
      ...leads,
      ...kidsLeads,
      ...kidsOptions,
      "Buttered roll",
      "Ranch",
      "Vinaigrette",
    ]) {
      for (const dish of ["soup of the day", "house salad", "garlic bread"]) {
        expect((words ?? "").toLowerCase()).not.toContain(dish);
      }
    }
  });

  // Publish (migration 12): Dinner, Drinks, and Brunch are published
  // through publish_menu() as CI Diner's owner, each only when it is not
  // published or its draft differs from what was published, so a second
  // run writes nothing; Lunch stays unpublished, and nothing is ever
  // unpublished. Brunch publishes with its one dish off the menu (D-177),
  // since the refusal reads neither availability nor schedules.
  it("publishes Dinner, Drinks, and Brunch through publish_menu() only when not published or changed, and unpublishes nothing", () => {
    const presses = [...code.matchAll(/publish_menu\(([^)]*)\)/g)].map(
      (match) => match[1],
    );
    expect(presses).toEqual(["dinner", "drinks", "brunch"]);
    for (const menu of ["dinner", "drinks", "brunch"]) {
      expect(code).toMatch(
        new RegExp(
          `if exists \\(\\s*select 1 from public\\.menu_publish_states\\(diner\\) s\\s*where s\\.menu = ${menu} and \\(not s\\.published or s\\.changed\\)\\s*\\) then\\s*perform public\\.publish_menu\\(${menu}\\);`,
        ),
      );
    }
    expect(code).not.toMatch(/unpublish_menu/);
    expect(code).not.toMatch(/published_snapshot\s*=/);
    expect(code).not.toMatch(/\bpublished\s*=\s*(true|false)/);
  });

  // Calories and the mark (migration 11, task 7) touch Starters' dishes and
  // Soup of the day's sizes by id, and write nothing else to them.
  it("gives the salad and the bread their calories and the bread its mark by id, and writes nothing else to them", () => {
    const writes = [
      ...code.matchAll(/update public\.items i\n  set calories_low[^;]*;/g),
    ].map((match) => match[0]);
    expect(writes).toHaveLength(2);
    for (const statement of writes) {
      expect(statement).toMatch(/where i\.id = (salad|bread)/);
      expect(statement).not.toMatch(
        /\b(name|sort|description|note|price_kind|price_cents|allergens|dietary_tags|available)\s*=/,
      );
    }
    const sizes = [
      ...code.matchAll(
        /update public\.item_sizes z\n  set calories_low[^;]*;/g,
      ),
    ].map((match) => match[0]);
    expect(sizes).toHaveLength(1);
    expect(sizes[0]).toMatch(/where z\.item_id = soup/);
    expect(sizes[0]).not.toMatch(/\b(name|price_cents|deleted_at)\s*=/);
  });
});
