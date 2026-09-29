import Link from "next/link";
import type { Copy } from "@/copy";
import type { Restaurant } from "@/domain/types";
import { PageFrame } from "@/ui/PageFrame";

type Props = { restaurant: Restaurant; copy: Copy };

// Placeholder so the footer link on every menu resolves. The form is Phase 4.
export function FeedbackPage({ restaurant, copy }: Props) {
  return (
    <PageFrame siteName={copy.site.name} homeHref="/">
      <h1 className="text-3xl font-bold">{copy.feedback.heading}</h1>
      <p className="mt-4">{copy.feedback.notReady}</p>
      <p className="mt-6">
        <Link href={`/m/${restaurant.slug}`} className="text-link underline">
          {copy.feedback.backToMenu}
        </Link>
      </p>
    </PageFrame>
  );
}
