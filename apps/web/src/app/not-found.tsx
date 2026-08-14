import Link from "next/link";

export default function NotFound() {
  return (
    <main
      id="main"
      className="mx-auto flex min-h-[100dvh] max-w-[560px] flex-col justify-center px-6 py-24"
    >
      <p className="font-display text-[28px] leading-none tracking-[-0.02em]">
        <span className="align-super text-[0.42em] text-accent">+</span>One
      </p>

      <h1 className="mt-10 text-[clamp(2rem,6vw,2.8rem)]">This page isn&rsquo;t here.</h1>

      <p className="mt-5 text-ink-2">
        The link may be old, or the page may have moved. Nothing is wrong with your account.
      </p>

      <Link
        href="/"
        className="mt-9 inline-flex w-fit items-center rounded-md bg-accent px-6 py-3.5 text-[15px] font-bold text-accent-ink transition-transform duration-200 hover:-translate-y-0.5"
      >
        Back to the start
      </Link>
    </main>
  );
}
