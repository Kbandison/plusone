import Capacitor
import Foundation
import StoreKit

/**
 A local Capacitor plugin over StoreKit 2, so the shell can sell the premium
 tier the way guideline 3.1.1 requires.

 Local, rather than a package, for two reasons. There is no first-party or
 community Capacitor in-app-purchase plugin — the only maintained option is
 RevenueCat, and that puts a third party between a member and their purchase,
 which means naming a new processor in the privacy policy and on both stores'
 labels for work this app already does itself server-side. And `apps/web`
 bundles nothing into this shell: the page is loaded from the network, so it
 reaches native code only through the injected bridge. A plugin here is
 reachable from a remote page exactly as `SystemBars` and `PushNotifications`
 already are, and an npm dependency would buy nothing extra.

 Nothing here decides whether anybody is premium. Every method that returns a
 transaction returns Apple's **signed JWS representation** of it, which the
 server verifies against Apple's root certificates before it grants anything.
 A device saying "I bought this" is a claim, not proof, and a jailbroken one
 can say it for free. This class is a transport.

 §9.6: no method logs a transaction, a JWS, or an account token.
 */
@objc(PlusOneStoreKitPlugin)
public class PlusOneStoreKitPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PlusOneStoreKitPlugin"
    public let jsName = "PlusOneStoreKit"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "products", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "currentEntitlements", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "unfinishedTransactions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "finish", returnType: CAPPluginReturnPromise)
    ]

    /// Held so it can be cancelled; StoreKit keeps delivering otherwise.
    private var updates: Task<Void, Never>?

    @objc override public func load() {
        // Started at launch rather than when the premium screen asks, because
        // this is the only way some transactions ever arrive: a renewal, an
        // Ask-to-Buy approval a parent granted hours later, a purchase made on
        // another device, or a refund. None of them are the result of a call
        // from the page, and a purchase that lands while the app is on some
        // other screen is still money that has to turn into premium.
        updates = Task.detached { [weak self] in
            for await result in Transaction.updates {
                await self?.emit(result)
            }
        }
    }

    deinit {
        updates?.cancel()
    }

    // MARK: - Products

    @objc func products(_ call: CAPPluginCall) {
        guard let ids = call.getArray("productIds", String.self), !ids.isEmpty else {
            call.reject("productIds is required")
            return
        }

        Task {
            do {
                let found = try await Product.products(for: ids)
                call.resolve(["products": found.map(Self.describe)])
            } catch {
                call.reject("Could not load products", nil, error)
            }
        }
    }

    /**
     What the page is allowed to render.

     `displayPrice` is Apple's localized string for the member's storefront and
     is the only price the UI may show. `PLANS[].priceCents` is what Stripe
     charges on the web in USD; App Store pricing is per-storefront and Apple
     may move a tier, so the two agree today and are not the same number. Cents
     are still reported for a caller that needs to compare or sort, alongside
     the currency they are in — a bare integer is not a price.
     */
    private static func describe(_ product: Product) -> [String: Any] {
        var out: [String: Any] = [
            "id": product.id,
            "displayName": product.displayName,
            "description": product.description,
            "displayPrice": product.displayPrice,
            "priceCents": NSDecimalNumber(decimal: product.price * 100).intValue
        ]
        out["currencyCode"] = product.priceFormatStyle.currencyCode
        if let period = product.subscription?.subscriptionPeriod {
            out["periodUnit"] = String(describing: period.unit).uppercased()
            out["periodValue"] = period.value
        }
        return out
    }

    // MARK: - Purchase

    @objc func purchase(_ call: CAPPluginCall) {
        guard let productId = call.getString("productId") else {
            call.reject("productId is required")
            return
        }

        // Apple's own field for "which of your accounts is this". It travels in
        // the signed transaction and comes back on every renewal and in every
        // server notification, which is what lets the server bind a purchase to
        // a member without trusting the client to say who it is later. It must
        // be a UUID; the member id already is one.
        var accountToken: UUID?
        if let raw = call.getString("appAccountToken") {
            guard let parsed = UUID(uuidString: raw) else {
                call.reject("appAccountToken must be a UUID")
                return
            }
            accountToken = parsed
        }

        Task {
            do {
                guard let product = try await Product.products(for: [productId]).first else {
                    call.reject("Unknown product")
                    return
                }

                var options: Set<Product.PurchaseOption> = []
                if let accountToken { options.insert(.appAccountToken(accountToken)) }

                switch try await product.purchase(options: options) {
                case .success(let verification):
                    // NOT finished here. The transaction stays open until the
                    // server has verified the JWS and written the entitlement,
                    // so that a grant lost to a dead network is redelivered by
                    // StoreKit instead of being paid for and forgotten.
                    call.resolve([
                        "status": "success",
                        "transaction": Self.describe(verification)
                    ])
                case .userCancelled:
                    call.resolve(["status": "cancelled"])
                case .pending:
                    // Ask-to-Buy, or a payment method needing action. The
                    // approval arrives later on Transaction.updates.
                    call.resolve(["status": "pending"])
                @unknown default:
                    call.resolve(["status": "unknown"])
                }
            } catch {
                call.reject("Purchase failed", nil, error)
            }
        }
    }

    // MARK: - Recovery

    /// What Apple currently considers bought — the restore path, and the answer
    /// to a member reinstalling or arriving on a second device.
    @objc func currentEntitlements(_ call: CAPPluginCall) {
        Task {
            var out: [[String: Any]] = []
            for await result in Transaction.currentEntitlements {
                out.append(Self.describe(result))
            }
            call.resolve(["transactions": out])
        }
    }

    /// Transactions StoreKit is still redelivering because nothing finished
    /// them — money taken whose grant did not stick. The page submits these on
    /// launch, which is the whole reason `finish` is a separate call.
    @objc func unfinishedTransactions(_ call: CAPPluginCall) {
        Task {
            var out: [[String: Any]] = []
            for await result in Transaction.unfinished {
                out.append(Self.describe(result))
            }
            call.resolve(["transactions": out])
        }
    }

    /// Called only after the server has granted. Finishing earlier throws the
    /// redelivery away.
    @objc func finish(_ call: CAPPluginCall) {
        guard let raw = call.getString("transactionId"), let id = UInt64(raw) else {
            call.reject("transactionId is required")
            return
        }

        Task {
            for await result in Transaction.unfinished where Self.unsafeTransaction(result).id == id {
                await Self.unsafeTransaction(result).finish()
                call.resolve(["finished": true])
                return
            }
            // Already finished, or never ours. Not an error: the page retries
            // this after a reconnect and the second attempt finds nothing.
            call.resolve(["finished": false])
        }
    }

    // MARK: - Shared

    @MainActor private func emit(_ result: VerificationResult<Transaction>) {
        // Retained until consumed, because this fires from app launch and the
        // web page may still be loading — an event delivered to nobody is a
        // renewal that never became premium.
        notifyListeners("transactionUpdated", data: Self.describe(result), retainUntilConsumed: true)
    }

    /**
     The payload for one transaction.

     `jws` is the entire point: Apple's signature over the transaction, which
     the server checks against Apple's root certificates. The plain fields
     beside it are for rendering and for matching up a `finish` call — the
     server must read its own copy out of the verified JWS and never trust
     these, because everything except the signature crossed the bridge as JSON.

     `verified` is StoreKit's local check, and it is reported rather than
     enforced. An unverified result is still sent up: the server's verification
     is the one that counts, and refusing here would turn a device with a wrong
     clock into a member who paid and got nothing.
     */
    private static func describe(_ result: VerificationResult<Transaction>) -> [String: Any] {
        let transaction = unsafeTransaction(result)
        var out: [String: Any] = [
            "jws": result.jwsRepresentation,
            "verified": {
                if case .verified = result { return true }
                return false
            }(),
            "transactionId": String(transaction.id),
            "originalTransactionId": String(transaction.originalID),
            "productId": transaction.productID,
            "purchasedAt": transaction.purchaseDate.timeIntervalSince1970 * 1000
        ]
        if let expires = transaction.expirationDate {
            out["expiresAt"] = expires.timeIntervalSince1970 * 1000
        }
        if let revoked = transaction.revocationDate {
            out["revokedAt"] = revoked.timeIntervalSince1970 * 1000
        }
        if let token = transaction.appAccountToken {
            out["appAccountToken"] = token.uuidString
        }
        return out
    }

    /// The payload out of either case. Named for what it is: the caller has
    /// not checked the signature, and neither has this.
    private static func unsafeTransaction(_ result: VerificationResult<Transaction>) -> Transaction {
        switch result {
        case .verified(let transaction): return transaction
        case .unverified(let transaction, _): return transaction
        }
    }
}
