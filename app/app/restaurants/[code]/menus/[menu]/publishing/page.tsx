import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { en } from "@/copy";
import { pageTitle } from "@/copy/title";
import { MENU_NOTICES, readNotice } from "@/core/notice";
import {
  listPublishBlockers,
  readOwnerMenuDraft,
  readOwnerMenuPublished,
} from "@/core/supabase/menus";
import { allergenSentence } from "@/domain/allergens";
import { reviewMenu, unconfirmedIn } from "@/domain/menu-review";
import { loadMenu } from "@/features/owner/menu/load-menu";
import {
  MENU_PAGE_HEADING_IDS,
  menuPagePath,
  menuPageState,
  menuPageTitle,
  publishingState,
} from "@/features/owner/menu/menu-pages";
import { MenuPageFrame } from "@/features/owner/menu/MenuPageFrame";
import {
  MenuPublishing,
  type PublishingView,
} from "@/features/owner/menu/MenuPublishing";
import {
  publishMenu,
  unpublishMenu,
} from "@/features/owner/menu/publish-actions";
import { reviewToken } from "@/features/owner/menu/review-token";
import { signInPath } from "@/features/owner/paths";
import {
  blockerLink,
  reviewWords,
  stateSentence,
  unconfirmedWords,
} from "@/features/owner/publishing-words";

type Props = { params: Promise<{ code: string; menu: string }> };

const PAGE = "publishing";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code, menu: menuId } = await params;
  const { restaurant, menu } = await loadMenu(code, menuId);
  if (!restaurant || !menu) return { title: pageTitle(en, en.notFound.title) };
  return {
    title: menuPageTitle(en, PAGE, {
      menu: menu.name,
      restaurant: restaurant.name,
    }),
  };
}

// A menu's Publishing page (D-224, D-231): whether the menu is published,
// a review of what a Publish would change, the allergen lists not
// confirmed, what Publish is waiting on, and Publish and Unpublish. The
// page is named for the page, in the title and in the h1, with the menu
// right after it (D-225).
//
// The review is read here, on every render: the draft as menu_snapshot()
// builds it and what is published, in one row, with what would block
// Publish beside them. The state sentence, the nav's line, and the review
// all come from those two documents through one compare, so they cannot
// disagree. A published snapshot the reader refuses still renders the
// page, as published and changed, since Publish is what replaces it; a
// draft the reader refuses is thrown to the owner error page, as any read
// that failed is. The Publish action is bound to the token of the draft
// read here, so the press carries what this page showed and is refused if
// the draft has moved since (review-token.ts). A press that lands loads the
// page again, with its result in the request's cookie.
export default async function RestaurantMenuPublishingPage({ params }: Props) {
  const { code, menu: menuId } = await params;
  const { supabase, email, restaurant, menu } = await loadMenu(code, menuId);
  if (!email) redirect(signInPath);
  if (!restaurant || !menu) notFound();
  const [draft, published, blockers] = await Promise.all([
    readOwnerMenuDraft(supabase, menu.id),
    readOwnerMenuPublished(supabase, restaurant.id, menu.id),
    listPublishBlockers(supabase, menu.id),
  ]);
  if (draft === "failed") throw new Error("the draft could not be read");
  if (published === "failed") {
    throw new Error("what is published could not be read");
  }
  // The menu went between the reads.
  if (draft === "not-found" || published === "not-found") notFound();

  const strings = en.owner.publishing;
  const review = reviewMenu(draft.snapshot, published?.snapshot ?? null);
  const state = publishingState(menu, published, review);
  // The sentence diners read with a dish or an option that is not
  // confirmed, from the one builder (rule 8).
  const dinersRead = allergenSentence(
    { allergens: [], customAllergens: [], allergensReviewed: false },
    en.allergens,
  ).text;
  const view: PublishingView = {
    state: stateSentence(strings, state, restaurant.timezone, en.lang),
    published: state.published,
    review: reviewWords(strings, review),
    allergens: unconfirmedWords(
      strings,
      en.owner.choices,
      unconfirmedIn(draft.snapshot),
      dinersRead,
      restaurant.code,
    ),
    waiting: blockers.map((blocker) =>
      blockerLink(strings, blocker, restaurant.code, menu),
    ),
  };
  const notice = readNotice((await headers()).get("cookie"), MENU_NOTICES);

  return (
    <MenuPageFrame
      copy={en}
      restaurant={restaurant}
      menu={menu}
      state={menuPageState(state)}
      page={PAGE}
      notice={notice}
    >
      <MenuPublishing
        strings={strings}
        editing={en.owner.editing}
        menu={menu}
        path={menuPagePath(restaurant.code, menu.id, PAGE)}
        headingId={MENU_PAGE_HEADING_IDS.publishing}
        view={view}
        publish={publishMenu.bind(
          null,
          restaurant.code,
          menu.id,
          reviewToken(draft.raw),
        )}
        unpublish={unpublishMenu.bind(null, restaurant.code, menu.id)}
      />
    </MenuPageFrame>
  );
}
