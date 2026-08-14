import { BRAND, COPY } from "@plusone/config";

/**
 * Foundation holding page. The marketing site proper is Milestone 8; this exists
 * so the token pipeline, the font pipeline and the theme switch are verifiable
 * from the first commit rather than the last.
 */
export default function Home() {
  return (
    <main id="main" className="mx-auto flex min-h-[100dvh] max-w-[680px] flex-col justify-center px-6 py-24">
      <p className="font-display text-[34px] leading-none tracking-[-0.02em]">
        <span className="align-super text-[0.42em] text-accent">+</span>One
      </p>

      <h1 className="mt-12 max-w-[15ch] text-[clamp(2.3rem,7vw,3.4rem)] text-balance">
        {COPY.marketing.hero}
      </h1>

      <p className="mt-6 max-w-[46ch] text-ink-2">{COPY.marketing.sub}</p>

      <p className="mt-14 border-t border-line pt-6 text-[13.5px] text-ink-3">
        {BRAND.name} is in build. Foundation milestone — schema, walls and mechanics.
      </p>
    </main>
  );
}
