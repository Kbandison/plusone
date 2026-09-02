import type { Metadata } from "next";

import {
  PLAY_TESTER_PASTE,
  RADIUS,
  WAITLIST_METRO_TARGET,
  metroLabel,
  metrosWithin,
} from "@plusone/config";

/** The furthest the Drop will ever look — see widenToPool. */
const LAST_RUNG_MI = RADIUS.ladderMi[RADIUS.ladderMi.length - 1] ?? 250;

import { Card } from "@/app/ui";
import { confirmedWaitlist, countByMetro, testerList } from "@/lib/waitlist";
import { InviteForm } from "./invite-form";

export const metadata: Metadata = { title: "Waitlist" };
export const dynamic = "force-dynamic";

/**
 * Who is waiting, where, and who can be let in.
 *
 * ── it shows addresses, and that is the one thing to be careful about ───────
 *
 * Every other admin screen here is built to avoid showing member data it does
 * not need — /admin/members has no listing at all, refuses a query under two
 * characters, and puts condition behind a written reason. This one lists email
 * addresses, which on this app carry an inference about the people holding
 * them.
 *
 * It does so because there is no way to issue an invitation without choosing a
 * person, and no useful handle on a waitlist row except the address. What is
 * NOT here is anything that would deepen that: no condition (the table has
 * none), no join to `profiles`, and no search box — the whole thing is one
 * metro's worth of rows at a time, ordered by when they joined, which is the
 * order an invitation queue actually runs in.
 *
 * Unconfirmed rows are not listed at all. They are somebody who never asked.
 */
export default async function AdminWaitlistPage() {
  const rows = await confirmedWaitlist();
  const counts = countByMetro(rows).filter((c) => c.confirmed > 0);

  /**
   * How many people a member in this metro could actually reach.
   *
   * The column that answers the question the rest of the table cannot: a member
   * sees nobody past RADIUS.ladderMi's last rung, so "Houston 4" and
   * "Dallas 3" are not two thin areas — they are one pool of seven, because
   * those two combine. Deciding where to concentrate without this means doing
   * it from a mental map of the United States.
   */
  const confirmedIn = new Map(counts.map((c) => [c.metro, c.confirmed]));
  const reach = new Map(
    counts.map((c) => {
      const { near, borderline } = metrosWithin(c.metro, LAST_RUNG_MI);
      const combined = near.reduce((n, id) => n + (confirmedIn.get(id) ?? 0), c.confirmed);
      // Only the ones that actually hold somebody are worth naming.
      const withPeople = near.filter((id) => confirmedIn.get(id));
      return [
        c.metro,
        { combined, withPeople, unsure: borderline.filter((id) => confirmedIn.get(id)) },
      ] as const;
    }),
  );

  const uninvited = rows.filter((r) => !r.invited_at);
  const toAdd = { ios: testerList(rows, "ios"), android: testerList(rows, "android") };
  const roster = {
    ios: testerList(rows, "ios", "invited"),
    android: testerList(rows, "android", "invited"),
  };
  const rosterCount = roster.ios.addresses.length + roster.android.addresses.length;

  return (
    <main id="main">
      <h1 className="mt-4 text-h2">Waitlist</h1>
      <p className="mt-3 text-body leading-[1.7] text-ink-2">
        {rows.length} confirmed {rows.length === 1 ? "person" : "people"} across {counts.length}{" "}
        {counts.length === 1 ? "area" : "areas"}. Unconfirmed addresses are not shown — they are
        people who never finished asking.
      </p>

      <Card className="mt-8">
        <h2 className="text-h3">By area</h2>
        <p className="mt-2 text-[11.7px] text-ink-3">
          {WAITLIST_METRO_TARGET} is the number to argue with, not a gate — see
          WAITLIST_METRO_TARGET.
        </p>

        {counts.length === 0 ? (
          <p className="mt-4 text-body text-ink-2">Nobody yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-[12.6px]">
              <thead className="text-ink-3">
                <tr>
                  <th className="py-2 pr-4 font-normal">Area</th>
                  <th className="py-2 pr-4 font-normal">Confirmed</th>
                  <th className="py-2 pr-4 font-normal">Within {LAST_RUNG_MI} mi</th>
                  <th className="py-2 pr-4 font-normal">Would test</th>
                  <th className="py-2 pr-4 font-normal">Invited</th>
                  <th className="py-2 font-normal">Joined</th>
                </tr>
              </thead>
              <tbody>
                {counts.map((c) => (
                  <tr key={c.metro} className="border-t border-line-2">
                    <td className="py-2 pr-4">{c.label}</td>
                    <td className="py-2 pr-4">
                      {c.confirmed}
                      <span className="text-ink-3"> / {WAITLIST_METRO_TARGET}</span>
                    </td>
                    <td className="py-2 pr-4">
                      {reach.get(c.metro)?.combined ?? c.confirmed}
                      {(reach.get(c.metro)?.withPeople.length ?? 0) > 0 ? (
                        <span className="text-ink-3">
                          {" "}
                          · with{" "}
                          {reach
                            .get(c.metro)!
                            .withPeople.map((id) => metroLabel(id) ?? id)
                            .join(", ")}
                        </span>
                      ) : null}
                      {(reach.get(c.metro)?.unsure.length ?? 0) > 0 ? (
                        // Named, not hidden: within METRO_BORDERLINE_MI of the
                        // cut, whether two PEOPLE are in range depends on where
                        // they each sit in their own metro, which no centroid
                        // knows. Presenting that as settled is how a confident
                        // wrong answer gets made.
                        <span className="text-ink-3">
                          {" "}
                          (
                          {reach
                            .get(c.metro)!
                            .unsure.map((id) => metroLabel(id) ?? id)
                            .join(", ")}{" "}
                          is borderline)
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-4">{c.wantsBeta}</td>
                    <td className="py-2 pr-4">{c.invited}</td>
                    <td className="py-2">{c.accepted}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* STEP ONE, and it is above the Invite form because that is the order it
          has to happen in. The invitation email tells somebody to go and
          install, and a store answers an account it has never heard of with
          "unavailable" and no reason — so the track has to be populated first.
          The screen used to run the other way round and read as though invites
          came first. */}
      <Card className="mt-8">
        <h2 className="text-h3">1 · Add these to the stores</h2>
        <p className="mt-2 text-[11.7px] leading-[1.6] text-ink-3">
          People who asked to test, are not invited yet, and told us which store account they
          install with. That address is often not the one they signed up with, which is why this is
          a separate list from the one below. Do this before inviting them.
        </p>

        <TesterBlock
          heading={PLAY_TESTER_PASTE.heading}
          note={`ADD to ${PLAY_TESTER_PASTE.path} — do not replace what is there, this list is only the people not yet added. Comma-separated; these must be Google account addresses.`}
          value={toAdd.android.addresses.join(", ")}
          missing={toAdd.android.missing}
        />
        <TesterBlock
          heading="TestFlight"
          note="ADD to App Store Connect → TestFlight → Testers — do not replace the group, this list is only the people not yet added. One per line; these must be Apple ID addresses."
          value={toAdd.ios.addresses.join("\n")}
          missing={toAdd.ios.missing}
        />
      </Card>

      <h2 className="mt-12 text-h3">2 · Send the invitations</h2>
      <InviteForm
        rows={uninvited.map((r) => ({
          id: r.id,
          email: r.email,
          // Both, because the form GROUPS on the id and DISPLAYS the label.
          // Passing only the label made the metro id the group key by accident,
          // which works until two ids share a label.
          metro: r.metro,
          label: metroLabel(r.metro) ?? r.metro,
          wantsBeta: r.wants_beta,
        }))}
      />

      {/* The roster, so nobody vanishes. Inviting moves somebody out of the box
          above, and without this they would leave the screen entirely — which
          would hide the one person who most needs finding: invited, and never
          actually added to a track. */}
      <Card className="mt-8">
        <h2 className="text-h3">Beta testers</h2>
        <p className="mt-2 text-[11.7px] leading-[1.6] text-ink-3">
          {rosterCount === 0
            ? "Nobody invited yet. People move here once their invitation is sent."
            : `${rosterCount} invited. These should already be on the tracks — if somebody says the store cannot find Plus One, check they are.`}
        </p>

        {rosterCount === 0 ? null : (
          <>
            <TesterBlock
              heading={PLAY_TESTER_PASTE.heading}
              note="Already invited. Here to check against the console, not to paste again."
              value={roster.android.addresses.join(", ")}
              missing={roster.android.missing}
            />
            <TesterBlock
              heading="TestFlight"
              note="Already invited. Here to check against the console, not to paste again."
              value={roster.ios.addresses.join("\n")}
              missing={roster.ios.missing}
            />
          </>
        )}
      </Card>
    </main>
  );
}

/**
 * A read-only textarea rather than a copy button.
 *
 * A copy button needs a client component and the clipboard API, and this is
 * pasted once per invitation round by one person. Selecting the text works
 * everywhere, including the case a copy button quietly fails in.
 */
function TesterBlock({
  heading,
  note,
  value,
  missing,
}: {
  heading: string;
  note: string;
  value: string;
  missing: number;
}) {
  return (
    <div className="mt-6">
      <h3 className="text-[13.8px]">{heading}</h3>
      <p className="mt-1 text-[11px] leading-[1.6] text-ink-3">{note}</p>
      {missing > 0 ? (
        /* Named rather than silently omitted. A short list that looks complete
           is how somebody concludes the invitations did not go out. */
        <p className="mt-2 text-[11.7px] text-critical">
          {missing} {missing === 1 ? "tester has" : "testers have"} accepted but not said which
          store account to use. They are not in this list.
        </p>
      ) : null}
      <textarea
        readOnly
        rows={3}
        value={value}
        aria-label={heading}
        placeholder="Nobody yet."
        className="mt-2 w-full rounded-lg border border-line-control bg-surface-2 px-4 py-3 text-[16px]"
      />
    </div>
  );
}
