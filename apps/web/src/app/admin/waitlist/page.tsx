import type { Metadata } from "next";

import { PLAY_TESTER_PASTE, WAITLIST_METRO_TARGET, metroLabel } from "@plusone/config";

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

  const uninvited = rows.filter((r) => !r.invited_at);
  const ios = testerList(rows, "ios");
  const android = testerList(rows, "android");

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

      <InviteForm
        rows={uninvited.map((r) => ({
          id: r.id,
          email: r.email,
          metro: metroLabel(r.metro) ?? r.metro,
          wantsBeta: r.wants_beta,
        }))}
      />

      <Card className="mt-8">
        <h2 className="text-h3">Tester lists</h2>
        <p className="mt-2 text-[11.7px] leading-[1.6] text-ink-3">
          Only people who accepted an invitation AND told us which store account they install with.
          The address they gave us is not necessarily their Google or Apple one, which is why this
          is a separate list from the one above.
        </p>

        <TesterBlock
          heading={PLAY_TESTER_PASTE.heading}
          note={`Paste into ${PLAY_TESTER_PASTE.path} BEFORE sending invitations — the email tells them to install, and Play says "unavailable" until they are on the list. Comma-separated; these must be Google account addresses.`}
          value={android.addresses.join(", ")}
          missing={android.missing}
        />
        <TesterBlock
          heading="TestFlight"
          note="Paste into App Store Connect → TestFlight → Testers BEFORE sending invitations — Apple emails the invitation to the Apple ID, and nothing reaches them until they are on the group. One per line; these must be Apple ID addresses."
          value={ios.addresses.join("\n")}
          missing={ios.missing}
        />
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
