import Capacitor
import UIKit

/**
 Where the shell is wired up, and deliberately nothing else.

 `SceneDelegate` builds this instead of `CAPBridgeViewController`, and that is
 the only reference to it. `Main.storyboard` also names a root controller and is
 never read — the template ships both and the scene delegate wins — so changing
 the storyboard to point here looks right and does nothing at all. If a future
 Capacitor upgrade regenerates `SceneDelegate.swift`, all of this goes with it;
 `shell.test.ts` pins the line for that reason.

 `capacitorDidLoad()` is the documented seam and it survives a `cap sync`. It is
 also the only place native code gets a bridge before the page loads, which is
 why everything the shell adds ends up being called from these few lines — and
 why they are kept to a table of contents. Each thing it names owns its own
 file; when a fourth arrives, it should be a line here and a file beside it,
 not another method on this class.
 */
class MainViewController: CAPBridgeViewController {
    /// Held because it owns an observer that outlives the call that made it.
    private var universalLinks: UniversalLinkRouter?

    override func capacitorDidLoad() {
        ShellPlugins.register(on: bridge)

        universalLinks = UniversalLinkRouter(host: self)
        universalLinks?.start()
    }
}
