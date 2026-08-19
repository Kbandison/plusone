import { ButtonLink, Wordmark } from "@/app/ui";

export default function NotFound() {
  return (
    <main
      id="main"
      className="mx-auto flex min-h-[100dvh] max-w-[537.6px] flex-col justify-center px-6 py-24"
    >
      <Wordmark className="text-[26.9px]" />

      <h1 className="mt-10 text-h1">This page isn&rsquo;t here.</h1>

      <p className="mt-5 text-ink-2">
        The link may be old, or the page may have moved. Nothing is wrong with your account.
      </p>

      <ButtonLink href="/" className="mt-9 w-fit">
        Back to the start
      </ButtonLink>
    </main>
  );
}
