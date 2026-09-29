import type { Copy } from "@/copy";
import { PageFrame } from "@/ui/PageFrame";
import { SignInForm } from "./SignInForm";

type Props = { copy: Copy; linkFailed: boolean };

export function SignInPage({ copy, linkFailed }: Props) {
  return (
    <PageFrame siteName={copy.site.name} homeHref="/">
      <h1 className="text-3xl font-bold">{copy.owner.signIn.heading}</h1>
      <p className="mt-2 text-foreground-muted">{copy.owner.signIn.lead}</p>
      {linkFailed ? (
        <p role="alert" className="mt-4 rounded bg-background-raised p-4">
          {copy.owner.signIn.linkFailed}
        </p>
      ) : null}
      <div className="mt-6 max-w-md">
        <SignInForm copy={copy} />
      </div>
    </PageFrame>
  );
}
