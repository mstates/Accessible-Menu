import Link from "next/link";
import type { Metadata } from "next";
import { en } from "@/copy";
import { PageFrame } from "@/ui/PageFrame";

export const metadata: Metadata = {
  title: en.site.name,
};

// Marketing placeholder. The real home page is Phase 5.
export default function Home() {
  return (
    <PageFrame siteName={en.site.name} homeHref="/">
      <h1 className="text-3xl font-bold">{en.home.heading}</h1>
      <p className="mt-4 text-lg">{en.home.lead}</p>
      <p className="mt-6">
        <Link href="/m/demo" className="text-link underline">
          {en.home.sample}
        </Link>
      </p>
    </PageFrame>
  );
}
