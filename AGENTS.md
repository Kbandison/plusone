<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Two shells, two engines

Plus One is heading for three surfaces: the web app, an Android TWA and an iOS
Capacitor build. A TWA runs in **real Chrome**. Capacitor runs in **WKWebView**.
Those are different engines — as far apart as Chrome and Safari — and one
Capacitor project would not change that, because Android WebView is not WKWebView
either. A fix verified in one engine is not verified in the other.

So anything touching what a shell can see is not done until it has been checked
against both:

- browser capability detection — `navigator`, `matchMedia`, service worker,
  `PushManager`, `Notification`, `setAppBadge`, `getUserMedia`
- anything branching on `inNativeShell()` or `nativePlatform()`. **Neither sees a
  TWA.** A TWA has no `window.Capacitor`; it is real Chrome. Detect it from
  `document.referrer` beginning `android-app://`, or a marker on the start URL.
- session and cookies: the TWA shares Chrome's jar, WKWebView has its own
- payment paths, which differ by store and by region
- anything reading `env(safe-area-inset-*)`

State in the commit which shells a change was verified against, and say plainly
when one was not. The failure this exists to prevent is silent: a bug fixed on
iOS, assumed fixed on Android, and never looked at again.
