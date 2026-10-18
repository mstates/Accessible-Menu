import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { en } from "@/copy";
import { fill } from "@/copy/fill";
import { loadStatement } from "@/features/diner/load";
import { StatementPage } from "@/features/diner/StatementPage";

type Params = { params: Promise<{ code: string }> };

// The statement by code (D-88), generated from the restaurant's published
// data and the fixed copy (D-184), kept at the edge under the restaurant's
// tag like its menu, so a Publish or an Unpublish re-renders it. Nothing is
// listed at build time: codes are made when restaurants are.
export function generateStaticParams(): { code: string }[] {
  return [];
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { code } = await params;
  const statement = await loadStatement(code);
  return {
    title: statement
      ? fill(en.statement.title, { restaurant: statement.name })
      : en.notFound.title,
  };
}

export default async function AccessibilityStatementPage({ params }: Params) {
  const { code } = await params;
  const statement = await loadStatement(code);
  if (!statement) notFound();
  return <StatementPage {...statement} copy={en} />;
}
