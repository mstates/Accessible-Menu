import Link from "next/link";
import type { Metadata } from "next";
import { en } from "@/copy";
import { PageFrame } from "@/ui/PageFrame";

export const metadata: Metadata = {
  title: en.notFound.title,
};

export default function NotFound() {
  return (
    <PageFrame siteName={en.site.name} homeHref="/">
      <h1 className="text-3xl font-bold">{en.notFound.heading}</h1>
      <p className="mt-6">
        <Link href="/" className="text-link underline">
          {en.notFound.home}
        </Link>
      </p>
    </PageFrame>
  );
}
