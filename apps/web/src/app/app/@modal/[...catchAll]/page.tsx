/**
 * Nothing — and the reason a sheet closes when you leave it.
 *
 * A parallel-route slot keeps whatever it last rendered across a SOFT
 * navigation to a URL it does not match. So without this, pressing "Open chat"
 * on somebody's profile would load the chat underneath and leave the profile
 * sheet sitting over it. Same for "Go to inbox", and for the connect action's
 * own redirect to the inbox after sending.
 *
 * Matching every other path under /app and rendering null is how the slot is
 * told to empty itself. It is Next's documented pattern (parallel-routes.md,
 * "Closing the modal"). `default.tsx` still covers hard loads, and the
 * intercepted routes beside this still win on the navigations they intercept.
 */
export default function NoModal() {
  return null;
}
