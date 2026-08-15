import type { Metadata } from "next";

import { MemberSearch } from "./member-search";

export const metadata: Metadata = { title: "Members" };

/**
 * Member lookup (§7.3).
 *
 * Deliberately thin, and it only answers a question: there is no listing, no
 * browse, and a query under two characters returns nothing rather than
 * everyone. A moderator following a report needs to find one person; anything
 * more is a directory of members with a search box on it.
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
      <h1 className="mt-4 text-[clamp(1.9rem,5vw,2.4rem)]">Members</h1>
      <MemberSearch />
    </main>
  );
}
