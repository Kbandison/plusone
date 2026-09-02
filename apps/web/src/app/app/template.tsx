/**
 * The fade between screens.
 *
 * A `template.tsx` rather than anything in the layout, and the difference is
 * the whole reason this file works: a layout persists across navigations, so an
 * animation on it fires once and never again. A template re-renders on every
 * route change, which is exactly when a page should announce it has arrived.
 *
 * It wraps the PAGE only. The nav and header live in the layout above and stay
 * still while this moves, which is what makes the movement read as the content
 * changing rather than the app redrawing.
 *
 * No client component and no JavaScript: one class, one keyframe, and it is
 * inert under `prefers-reduced-motion` through the same rule that silences
 * `rise-in`.
 */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
