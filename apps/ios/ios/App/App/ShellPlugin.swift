import Capacitor
import Foundation
import UIKit

/**
 The one thing about the shell's chrome that no Capacitor API reaches.

 iOS takes the SYSTEM appearance as the truth about whether this app is light or
 dark. This app takes the member's stored choice, which the theme script in the
 root layout prefers over `prefers-color-scheme`. When those disagree the result
 is not merely a wrong status bar — UIKit lays a grey scrim over the top of the
 page to reconcile the two. Measured on a dark phone with Linen chosen: the top
 62pt fade from rgb(139,134,128) up to Linen's own rgb(239,233,223), a drift of
 100 across a band the member never asked for.

 `SystemBars.setStyle` fixes the status bar TEXT and demonstrably changes it
 while the band stays, because the band is not the status bar. It comes from
 `overrideUserInterfaceStyle`, which follows the system until something sets it
 and which no Capacitor plugin exposes. That is all this file is for.

 Set on the WINDOW rather than the view controller: the scrim is drawn outside
 the web view's own bounds, and a window-level override is the only one every
 layer above it inherits.
 */
@objc(PlusOneShellPlugin)
public class PlusOneShellPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PlusOneShellPlugin"
    public let jsName = "PlusOneShell"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setInterfaceStyle", returnType: CAPPluginReturnPromise)
    ]

    @objc func setInterfaceStyle(_ call: CAPPluginCall) {
        let requested = (call.getString("style") ?? "SYSTEM").uppercased()
        let style: UIUserInterfaceStyle
        switch requested {
        case "DARK": style = .dark
        case "LIGHT": style = .light
        // Anything else hands the decision back to iOS rather than guessing.
        // A page that has not chosen should look like the phone it is on.
        default: style = .unspecified
        }

        DispatchQueue.main.async { [weak self] in
            guard let controller = self?.bridge?.viewController else {
                call.reject("No view controller")
                return
            }
            // The window when there is one; the controller is the fallback for
            // the moment before the scene has attached, and it is enough on its
            // own for everything drawn inside it.
            if let window = controller.view.window {
                window.overrideUserInterfaceStyle = style
            } else {
                controller.overrideUserInterfaceStyle = style
            }
            call.resolve(["style": requested])
        }
    }
}
