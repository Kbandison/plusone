import { SettingsTabs } from "./settings-tabs";

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

/**
 * Every settings screen, under the same bar.
 *
 * A layout rather than a component each page renders, so the bar is not
 * re-mounted on every tab change — Next keeps a layout across navigations
 * within its segment, which is exactly the behaviour a tab bar wants.
 *
 * The heading stays on each page rather than moving up here, even though one
 * "Settings" over two tabs is the tidier hierarchy. There is a skip link to
 * #main, and #main is opened by the page — so an h1 in the layout is an h1 the
 * skip link jumps past, which costs the members who use it the one line that
 * says where they landed. The rooms bar sits the same way over the same kind
 * of duplicate title.
 */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SettingsTabs />
      {/* The bar is a second piece of chrome above the page, so without this a
          page's title sits on the tab that named it. */}
      <div className="pt-6">{children}</div>
    </>
  );
}
