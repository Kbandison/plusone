"use client";

import { Button, Card } from "@/app/ui";

/**
 * The app's error boundary.
 *
 * There was none anywhere, so an unhandled error took the whole screen to
 * Next's default page — a stack trace in development and a bare "something went
 * wrong" in production, with the app's chrome gone and no way back.
 *
 * The message is deliberately not shown. On this app an error string can carry
 * a member id, a chat id, or the name of a table that says what this product is
 * about; `digest` is the id to quote to us and nothing else.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main id="main">
      <Card className="mt-10">
        <h1 className="text-h3">Something went wrong at our end</h1>
        <p className="mt-3 text-body leading-[1.7] text-ink-2">
          Nothing you did caused this and nothing has been lost. Try again, and if it keeps
          happening it will help us to know this reference.
        </p>
        {error.digest ? (
          <p className="mt-3 font-mono text-body-sm text-ink-3">{error.digest}</p>
        ) : null}
        <Button type="button" onClick={reset} className="mt-6">
          Try again
        </Button>
      </Card>
    </main>
  );
}
