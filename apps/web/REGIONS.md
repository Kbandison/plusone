# Why `pdx1`

The Supabase project lives at `aws-0-us-west-2` — AWS Oregon. Vercel's default
function region is `iad1`, Washington DC. Left alone, every database round trip
in the app crosses the continent.

That is not one round trip per page. `AppLayout` calls `getUser()`, then
`loadFacts()` fans out five queries, and only then does the page run its own —
so a single screen is several sequential coast-to-coast hops before anything
renders. `pdx1` is Vercel's Portland region, in the same AWS region as the
database, which turns each of those from roughly 60–70ms into single digits.

It is a cost change as well as a latency one: Vercel bills provisioned memory
for the duration a function is alive, and a function waiting on the network is
alive the whole time it waits.

There is no failover region. `functionFailoverRegions` — Vercel calls them
passive regions — is restricted to the Enterprise plan, and adding one made
every deployment fail with "Deploying Serverless Function passive regions is
restricted to the Enterprise plan." A single region is the whole of what a
non-Enterprise project can ask for.

If the database ever moves, this moves with it. They are one decision.
