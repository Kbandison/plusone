import type { Metadata } from "next";

import { MemberSearch } from "./member-search";
import { Roster } from "./roster";

export const metadata: Metadata = { title: "Members" };

/**
 * Member lookup (§7.3).
 *
 * Search, and since 2026-09-09 a roster above it.
 *
 * This said "there is no listing, no browse" and gave the reason: anything more
 * is a directory of members with a search box on it. Kevin asked for the
 * listing on 2026-09-09, having found there was no way to answer "who has
 * signed up" without already knowing a name to type — `admin_metrics` says
 * eight and cannot say which eight.
 *
 * The objection is answered by what the roster WITHHOLDS rather than by
 * disagreeing with it. The words that mattered were "private details": it shows
 * a name, a date, a status and a last-seen, and no condition, email, phone,
 * location or content.
 *
 * The search below is unchanged — still the only way to reach one person by
 * name, still refusing a query under two characters rather than returning
 * everyone.
 *
 * No condition data. That is what `RevealCondition` is for, and it costs a
 * written reason.
 *
 * The search itself is a POST, not a query string — see the note on
 * lookupMembers. A display name in `?q=` is a member's name in our access logs.
 */
export default function MembersPage() {
  return (
    <main id="main">
      <h1 className="mt-4 text-h2">Members</h1>
      <Roster />

      <div className="mt-10 border-t border-line pt-8">
        <MemberSearch />
      </div>
    </main>
  );
}
