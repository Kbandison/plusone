import type { Metadata } from "next";
import Link from "next/link";

import { DRAFT_COPY } from "@plusone/config";

import { approximateLocation } from "@/lib/dial-code";
import { ownProfile } from "@/lib/own-profile";
import { RadiusForm } from "@/app/onboarding/radius/radius-form";

export const metadata: Metadata = { title: DRAFT_COPY.radius.heading };

const C = DRAFT_COPY.app;

/**
 * How far to look, after onboarding.
 *
 * The profile SHOWED the radius and could not change it, and the screen that
 * can lived at /onboarding/radius. It decides who is in tonight's Drop and who
 * is in Browse — the single most consequential number a member owns — and it
 * was set once, on the way in, and then frozen.
 */
export default async function ProfileDistancePage() {
  const [profile, approximate] = await Promise.all([ownProfile(), approximateLocation()]);

  return (
    <main id="main">
      <Link
        href="/app/profile"
        className="ease-brand mb-2 inline-flex min-h-tap items-center text-[11.7px] text-ink-3 transition-colors duration-200 hover:text-ink"
      >
        ← {C.profileHeading}
      </Link>

      <h1 className="text-h2">{DRAFT_COPY.radius.heading}</h1>
      <p className="mt-3 text-[12.6px] leading-[1.7] text-ink-2">{DRAFT_COPY.radius.intro}</p>

      <RadiusForm radiusMi={profile?.search_radius_mi ?? null} approximate={approximate} />
    </main>
  );
}
