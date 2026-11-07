import type { Copy } from "@/copy";
import type { SignInNotice } from "@/core/notice";
import { PageFrame } from "@/ui/PageFrame";
import { GoogleSignInForm } from "./GoogleSignInForm";
import { NoticeBanner } from "./NoticeBanner";
import { signInPath } from "./paths";
import { SignInForm } from "./SignInForm";

// The sign-in heading, where focus goes when the flash is dismissed.
const SIGN_IN_HEADING_ID = "sign-in-heading";

type Props = {
  copy: Copy;
  // A sign-in that failed before this page loaded (an expired link, Google
  // not finishing), read from the cookie the auth callback or the Google
  // form left (D-219).
  notice: SignInNotice | null;
};

export function SignInPage({ copy, notice }: Props) {
  return (
    <PageFrame
      siteName={copy.site.name}
      homeHref="/"
      loadingLabel={copy.ui.loading}
    >
      {/* The flash at the top of the body content, first in main and above
          the heading (D-215), on the load that read the cookie (D-214). */}
      {notice ? (
        <NoticeBanner
          copy={copy}
          notice={notice}
          path={signInPath}
          headingId={SIGN_IN_HEADING_ID}
          className="mb-6"
        />
      ) : null}
      {/* Focusable by code alone, for the flash's dismiss button. */}
      <h1 id={SIGN_IN_HEADING_ID} tabIndex={-1} className="text-3xl font-bold">
        {copy.owner.signIn.heading}
      </h1>
      <p className="mt-2 text-foreground-muted">{copy.owner.signIn.lead}</p>
      <div className="mt-6 max-w-md">
        <SignInForm copy={copy} />
        <p className="my-6 text-center text-foreground-muted">
          {copy.owner.signIn.or}
        </p>
        <GoogleSignInForm copy={copy} />
      </div>
    </PageFrame>
  );
}
