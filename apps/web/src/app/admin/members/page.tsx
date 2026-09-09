import type { Metadata } from "next";

import { MemberSearch } from "./member-search";

/**
 * Deferred, not resolved.
 *
 * `instant = false` marks this segment as ALLOWED TO BLOCK while Cache
 * Components is adopted one route at a time — the incremental flow the
 * migration guide describes. It does not force the route to be dynamic, so a
 * genuinely prerenderable one still ships a static shell.
 *
 * Removing this line is the unit of work: the route then has to resolve its own
 * validation, by caching data with `use cache` or wrapping the runtime parts in
 * <Suspense>.
 */
export const instant = false;

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
      <h1 className="mt-4 text-h2">Members</h1>
      <MemberSearch />
    </main>
  );
}
