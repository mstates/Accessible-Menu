import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { OwnerSection, SectionText } from "@/domain/section";

// Owner-side reads and writes on a menu's sections, through the owner's own
// client so row level security decides what is visible (D-75) and the table
// constraints decide what is valid (migration 4). A delete marks the row and
// keeps it, so Undo can bring it back; reads leave marked rows out. Owners
// write name, note, every_item, sort, and deleted_at and nothing else: a
// section never moves to another menu, and nothing here can publish. The
// only place the row shape is known; features see OwnerSection.

const columns = "id, name, note, every_item, sort";

const rowSchema = z.object({
  id: z.string(),
  name: z.string(),
  note: z.string().nullable(),
  every_item: z.string().nullable(),
  sort: z.number(),
});

function toSection(row: z.infer<typeof rowSchema>): OwnerSection {
  return {
    id: row.id,
    name: row.name,
    note: row.note ?? "",
    everyItem: row.every_item ?? "",
  };
}

const columnOf: Record<SectionText, "name" | "note" | "every_item"> = {
  name: "name",
  note: "note",
  everyItem: "every_item",
};

// Postgres's code for a unique index refusing a row: here, sections_name_key.
const UNIQUE_VIOLATION = "23505";
// What the copy trigger says when the caller cannot read the menu.
const NO_MENU = "A section needs an existing menu.";

export type SectionWriteError =
  | { kind: "name-taken" }
  | { kind: "not-found" }
  | { kind: "mismatch" }
  | { kind: "failed" };

export type SectionWriteResult<Value = unknown> =
  { ok: true; value: Value } | { ok: false; error: SectionWriteError };

function refused(code: string | undefined): SectionWriteResult<never> {
  return {
    ok: false,
    error: { kind: code === UNIQUE_VIOLATION ? "name-taken" : "failed" },
  };
}

const notFound: SectionWriteResult<never> = {
  ok: false,
  error: { kind: "not-found" },
};

const failed: SectionWriteResult<never> = {
  ok: false,
  error: { kind: "failed" },
};

// The menu's sections that are not deleted, in the owner's order. sort alone
// is not a total order, since owners can write it directly, so created_at
// and id settle ties the same way every time. A read that fails throws: an
// error must never look like an empty list.
export async function listOwnerSections(
  client: SupabaseClient,
  menuId: string,
): Promise<OwnerSection[]> {
  const { data, error } = await client
    .from("sections")
    .select(columns)
    .eq("menu_id", menuId)
    .is("deleted_at", null)
    .order("sort")
    .order("created_at")
    .order("id");
  if (error) throw new Error(`sections could not be read: ${error.message}`);
  return z.array(rowSchema).parse(data).map(toSection);
}

// A new section goes last, with a name only. The trigger takes its
// restaurant from the menu. Two tabs adding at once can draw the same sort;
// the read's tie-break keeps the order steady and the next reorder
// renumbers. The same read counts the live sections, so an add can say how
// many there are once it is in, whatever waited ahead of it on the page
// (D-125).
export async function addOwnerSection(
  client: SupabaseClient,
  menuId: string,
  name: string,
): Promise<SectionWriteResult<{ section: OwnerSection; total: number }>> {
  const last = await client
    .from("sections")
    .select("sort", { count: "exact" })
    .eq("menu_id", menuId)
    .is("deleted_at", null)
    .order("sort", { ascending: false })
    .limit(1);
  if (last.error || last.count === null) return failed;
  const highest = z.array(z.object({ sort: z.number() })).safeParse(last.data);
  const top = highest.success ? highest.data[0] : undefined;
  const sort = (top ? top.sort : 0) + 1;

  const { data, error } = await client
    .from("sections")
    .insert({ menu_id: menuId, name, sort })
    .select(columns)
    .single();
  if (error) return error.message === NO_MENU ? notFound : refused(error.code);
  const row = rowSchema.safeParse(data);
  return row.success
    ? {
        ok: true,
        value: { section: toSection(row.data), total: last.count + 1 },
      }
    : failed;
}

// Writes one of a section's texts. Under row level security a section the
// caller does not own matches zero rows without an error, so the write asks
// for the row back and reads an empty answer as not found. A blank note or
// every-dish line is stored as null. With expected, the write happens only
// if the text is still that value: an Undo never writes over a newer change.
export async function setOwnerSectionText(
  client: SupabaseClient,
  menuId: string,
  id: string,
  field: SectionText,
  value: string,
  expected?: string,
): Promise<SectionWriteResult<OwnerSection>> {
  const column = columnOf[field];
  let update = client
    .from("sections")
    .update({ [column]: value === "" ? null : value })
    .eq("id", id)
    .eq("menu_id", menuId)
    .is("deleted_at", null);
  if (expected !== undefined) {
    update =
      expected === "" ? update.is(column, null) : update.eq(column, expected);
  }
  const { data, error } = await update.select(columns).maybeSingle();
  if (error) return refused(error.code);
  if (!data) return notFound;
  const row = rowSchema.safeParse(data);
  return row.success ? { ok: true, value: toSection(row.data) } : failed;
}

// Marks a section deleted, or brings it back. Bringing it back fails with
// name-taken while another section of the menu has its name.
export async function setOwnerSectionDeleted(
  client: SupabaseClient,
  menuId: string,
  id: string,
  deleted: boolean,
): Promise<SectionWriteResult<OwnerSection>> {
  const update = client
    .from("sections")
    .update({ deleted_at: deleted ? new Date().toISOString() : null })
    .eq("id", id)
    .eq("menu_id", menuId);
  const { data, error } = await (
    deleted
      ? update.is("deleted_at", null)
      : update.not("deleted_at", "is", null)
  )
    .select(columns)
    .maybeSingle();
  if (error) return refused(error.code);
  if (!data) return notFound;
  const row = rowSchema.safeParse(data);
  return row.success ? { ok: true, value: toSection(row.data) } : failed;
}

// set_section_order() takes the whole list or nothing: a list that is not
// exactly the menu's live sections comes back as a mismatch, which is how a
// page that is out of date finds out.
export async function setOwnerSectionOrder(
  client: SupabaseClient,
  menuId: string,
  ids: readonly string[],
): Promise<SectionWriteResult<null>> {
  const { error } = await client.rpc("set_section_order", {
    p_menu: menuId,
    p_ids: ids,
  });
  if (!error) return { ok: true, value: null };
  return {
    ok: false,
    error: { kind: error.message === "order_mismatch" ? "mismatch" : "failed" },
  };
}
