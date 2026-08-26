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
    }
}
