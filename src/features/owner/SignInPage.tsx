import type { Copy } from "@/copy";
import { Button } from "@/ui/Button";
import { PageFrame } from "@/ui/PageFrame";
import { SignInForm } from "./SignInForm";

export type SignInFailure = "link" | "google" | null;

type Props = {
  copy: Copy;
  failure: SignInFailure;
  signInWithGoogle: () => Promise<void>;
};

export function SignInPage({ copy, failure, signInWithGoogle }: Props) {
  const failureMessage = failure ? copy.owner.signIn.failures[failure] : null;
  return (
    <PageFrame siteName={copy.site.name} homeHref="/">
      <h1 className="text-3xl font-bold">{copy.owner.signIn.heading}</h1>
      <p className="mt-2 text-foreground-muted">{copy.owner.signIn.lead}</p>
      {failureMessage ? (
        <p role="alert" className="mt-4 rounded bg-background-raised p-4">
          {failureMessage}
        </p>
      ) : null}
      <div className="mt-6 max-w-md">
        <SignInForm copy={copy} />
        <p className="my-6 text-center text-foreground-muted">
          {copy.owner.signIn.or}
        </p>
        <form action={signInWithGoogle}>
          <Button type="submit">{copy.owner.signIn.google}</Button>
        </form>
      </div>
    </PageFrame>
  );
}
