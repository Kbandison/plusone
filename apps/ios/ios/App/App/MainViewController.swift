import Capacitor
import UIKit

/**
 Exists only to register `PlusOneStoreKitPlugin`.

 Capacitor finds plugins two ways and neither one finds a plugin that lives in
 this target: a fixed list of the plugins built into the framework, and the
 `packageClassList` in `capacitor.config.json`, which `npx cap sync` regenerates
 from the npm packages it can see. Adding the class name there by hand works
 until the next sync silently drops it — and what that failure looks like is the
 premium screen finding no bridge and offering nothing, which is also exactly
 what the shell does when everything is fine. `capacitorDidLoad()` is the
 documented seam and it survives a sync.

 `SceneDelegate` builds this instead of `CAPBridgeViewController`, and that is
 the only reference to it. `Main.storyboard` also names a root controller and is
 never read — the template ships both and the scene delegate wins — so changing
 the storyboard to point here looks right and does nothing at all. If a future
 Capacitor upgrade regenerates `SceneDelegate.swift`, the plugin goes with it;
 `shell.test.ts` pins the line for that reason.
 */
class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        // registerPluginInstance, NOT registerPluginType. The type call is the
        // one every guide shows and it begins `if autoRegisterPlugins { return }`
        // — auto-registration is on by default, so it returns having done
        // nothing, with no log and no error. What that looks like from the page
        // is a plugin missing from Capacitor.PluginHeaders and a nativePromise
        // that never settles: not a rejection, silence. Confirmed by reading
        // CapacitorBridge.swift after watching it happen.
        bridge?.registerPluginInstance(PlusOneStoreKitPlugin())
        observeUniversalLinks()
    }

    deinit {
        if let linkObserver { NotificationCenter.default.removeObserver(linkObserver) }
    }

    private var linkObserver: NSObjectProtocol?

    /**
     Takes a tapped universal link to the page it names.

     Capacitor posts a notification when iOS hands it one and NOTHING in core
     listens. `@capacitor/app` is what normally does, forwarding it to JS as
     `appUrlOpen`; without it the notification is posted and dropped, and the
     app opens on whatever page it last had. That is worse than the Safari
     behaviour this whole item exists to fix — the member gets the app and
     loses the thing they tapped, with nothing to say a link was involved.

     Handled here rather than by adding the plugin because the plugin's answer
     is an event for the page to act on, and the page is loaded over the network
     from the URL we are about to change. Doing it natively is the same three
     lines without a dependency or a race.

     Cold launch is covered: Capacitor holds the activity from
     `willConnectTo` and replays it on the first `capacitorViewDidAppear`, once
     plugins exist. So one observer serves both, and a link tapped against a
     closed app arrives late rather than not at all.
     */
    private func observeUniversalLinks() {
        linkObserver = NotificationCenter.default.addObserver(
            forName: .capacitorSceneOpenUniversalLink,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            guard let url = notification.userInfo?["url"] as? URL else { return }
            self?.openUniversalLink(url)
        }
    }

    /**
     The hosts a link is allowed to send the WebView to.

     iOS only hands over links for a domain in the entitlement, so this is
     belt-and-braces — but the thing being handed a URL is the window the
     member's session lives in, and the cost of the check is a string compare.
     The apex is included HERE and deliberately absent from the entitlement:
     it 308s to www, so iOS can never claim it, but if one ever does arrive
     there is no reason to refuse it.
     */
    private static let claimedHosts = ["www.loveplusone.app", "loveplusone.app"]

    private func openUniversalLink(_ url: URL) {
        guard let host = url.host?.lowercased(), Self.claimedHosts.contains(host) else { return }
        // A full load rather than a client-side navigation. The page is a
        // server-rendered app fetched over the network, so this is exactly what
        // following the link does; asking the router to move instead would be
        // faster and would depend on the page already being loaded, which on a
        // cold launch is the one thing that is not true.
        webView?.load(URLRequest(url: url))
    }
}
