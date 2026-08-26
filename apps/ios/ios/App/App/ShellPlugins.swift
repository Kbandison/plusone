import Capacitor
import Foundation

/**
 The native plugins this shell adds, and the one thing about adding them that is
 not obvious.

 Capacitor finds plugins two ways and neither finds one that lives in this
 target: a fixed list of the plugins built into the framework, and the
 `packageClassList` in `capacitor.config.json`, which `npx cap sync` regenerates
 from the npm packages it can see. Writing a class name into that list by hand
 works until the next sync quietly drops it.

 Kept in its own file because this is the list that grows. Anything native the
 page needs — the badge is the next one — is a line here and nothing else, and a
 list is easier to read for what is missing than a view controller is.
 */
enum ShellPlugins {
    static func register(on bridge: CAPBridgeProtocol?) {
        // registerPluginInstance, NOT registerPluginType. The type call is the
        // one every guide shows and it begins `if autoRegisterPlugins { return }`
        // — auto-registration is on by default, so it returns having done
        // nothing, with no log and no error. What that looks like from the page
        // is a plugin missing from Capacitor.PluginHeaders and a nativePromise
        // that never settles: not a rejection, silence. Confirmed by reading
        // CapacitorBridge.swift after watching it happen.
        bridge?.registerPluginInstance(PlusOneStoreKitPlugin())
        bridge?.registerPluginInstance(PlusOneShellPlugin())
    }
}
