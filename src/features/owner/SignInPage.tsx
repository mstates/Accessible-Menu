import type { Copy } from "@/copy";
import { Button } from "@/ui/Button";
import { PageFrame } from "@/ui/PageFrame";
import { ResultMessage } from "@/ui/ResultMessage";
import { SignInForm } from "./SignInForm";

// A sign-in that failed before this page loaded (an expired link, Google not
// finishing), and the key of the render that carries it (D-110).
export type SignInFailure = { reason: "link" | "google"; key: string } | null;

type Props = {
  copy: Copy;
  failure: SignInFailure;
  signInWithGoogle: () => Promise<void>;
};

export function SignInPage({ copy, failure, signInWithGoogle }: Props) {
  return (
    <PageFrame
      siteName={copy.site.name}
      homeHref="/"
      loadingLabel={copy.ui.loading}
    >
      <h1 className="text-3xl font-bold">{copy.owner.signIn.heading}</h1>
      <p className="mt-2 text-foreground-muted">{copy.owner.signIn.lead}</p>
      {failure ? (
        <ResultMessage
          key={failure.key}
          fromUrl={failure.key}
          message={copy.owner.signIn.failures[failure.reason]}
          className="mt-4"
        />
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
