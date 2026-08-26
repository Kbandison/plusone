import Capacitor
import Foundation
import WebKit

/**
 Takes a tapped universal link to the page it names.

 Capacitor posts a notification when iOS hands it one and NOTHING in core
 listens. `@capacitor/app` is what normally does, forwarding it to JS as
 `appUrlOpen`; without it the notification is posted and dropped, and the app
 opens on whatever page it last had. That is worse than the Safari behaviour the
 entitlement exists to fix — the member gets the app and loses the thing they
 tapped, with nothing to say a link was involved.

 Handled natively rather than by adding the plugin because the plugin's answer
 is an event for the page to act on, and the page is loaded over the network
 from the URL that is about to change. Doing it here is the same three lines
 without a dependency or a race.

 Its own object rather than a few methods on the view controller because it owns
 something with a lifetime: an observer that has to be removed. That is the part
 that goes wrong quietly if it is mixed in with everything else the controller
 does.
 */
final class UniversalLinkRouter {
    private weak var host: CAPBridgeViewController?
    private var observer: NSObjectProtocol?

    init(host: CAPBridgeViewController) {
        self.host = host
    }

    deinit {
        if let observer { NotificationCenter.default.removeObserver(observer) }
    }

    /**
     Cold launch is covered by one observer. Capacitor holds the activity from
     `willConnectTo` and replays it on the first `capacitorViewDidAppear`, once
     plugins exist — so a link tapped against a closed app arrives late rather
     than not at all.
     */
    func start() {
        observer = NotificationCenter.default.addObserver(
            forName: .capacitorSceneOpenUniversalLink,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            guard let url = notification.userInfo?["url"] as? URL else { return }
            self?.open(url)
        }
    }

    /**
     The hosts a link is allowed to send the web view to.

     iOS only hands over links for a domain in the entitlement, so this is
     belt-and-braces — but the thing being handed a URL is the window the
     member's session lives in, and the cost of the check is a string compare.
     The apex is included HERE and deliberately absent from the entitlement: it
     308s to www, so iOS can never claim it, but if one ever does arrive there is
     no reason to refuse it.
     */
    private static let claimedHosts = ["www.loveplusone.app", "loveplusone.app"]

    private func open(_ url: URL) {
        guard let host = url.host?.lowercased(), Self.claimedHosts.contains(host) else { return }
        // A full load rather than a client-side navigation. The page is a
        // server-rendered app fetched over the network, so this is exactly what
        // following the link does; asking the router to move instead would be
        // faster and would depend on the page already being loaded, which on a
        // cold launch is the one thing that is not true.
        self.host?.webView?.load(URLRequest(url: url))
    }
}
