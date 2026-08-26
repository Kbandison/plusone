/**
 * The App Store purchase path, which is the only way the shell may sell
 * anything.
 *
 * Guideline 3.1.1: a subscription that unlocks features inside an iOS app goes
 * through in-app purchase. `e8eee7d` hid the Stripe checkout in the shell for
 * that reason and deliberately did not replace it, which left the paid tier
 * unreachable there — a dead end, and its own 4.2 problem. This is the other
 * half.
 *
 * Reached through `Capacitor.nativePromise` and `Capacitor.addListener`, the
 * same seam `native-push.ts` uses and for the same reason: the shell loads this
 * app over the network, so nothing here is bundled into it and the injected
 * bridge is the entire interface. The native side is `PlusOneStoreKitPlugin`
 * in `apps/ios`, registered by `MainViewController`.
 *
 * Nothing in this file decides who is premium. Every transaction carries `jws`
 * — Apple's signature over it — and only the server, checking that against
 * Apple's root certificates, may grant anything. The rest of the fields are for
 * drawing a screen and matching up a `finish` call.
 *
 * Every function answers null in a browser, so a caller does not have to know
 * which surface it is on.
 */
const PLUGIN = "PlusOneStoreKit";

interface CapacitorBridge {
  nativePromise?: (plugin: string, method: string, options: unknown) => Promise<unknown>;
  addListener?: (
    plugin: string,
    eventName: string,
    callback: (data: unknown) => void,
  ) => { remove: () => Promise<void> };
}

function bridge(): CapacitorBridge | null {
  if (typeof window === "undefined") return null;
  const cap = (window as Window & { Capacitor?: CapacitorBridge }).Capacitor;
  return cap?.nativePromise && cap.addListener ? cap : null;
}

/**
 * Whether a bridge exists — NOT whether this plugin does.
 *
 * There is no synchronous way to ask the second question, and the two differ in
 * practice: `apps/web` deploys on every push and a shell reaches a phone only
 * through review, so a member can be running a build from before this plugin
 * existed for weeks. On that build every call below rejects and returns null,
 * which the UI must treat as "no purchase path" rather than as an error to
 * report. `nativeStoreProducts` returning null is the real availability test.
 */
export function nativeStoreAvailable(): boolean {
  return bridge() !== null;
}

async function call<T>(method: string, options: unknown = {}): Promise<T | null> {
  const cap = bridge();
  if (!cap) return null;
  try {
    return (await cap.nativePromise?.(PLUGIN, method, options)) as T;
  } catch {
    // Includes "no such plugin" on an older shell, a StoreKit error, and a
    // device with no App Store account. None of them is worth a stack trace to
    // a member, and none of them may log — a rejection can carry a transaction.
    return null;
  }
}

export interface NativeProduct {
  readonly id: string;
  readonly displayName: string;
  readonly description: string;
  /**
   * Apple's localized price string, and the ONLY price that may be rendered.
   * App Store pricing is per-storefront, so this is not `PLANS[].priceCents`
   * formatted — it is what this member will actually be charged, in their
   * currency. Showing our own number instead is how a screen ends up promising
   * $19.99 to somebody whose card is debited in euros.
   */
  readonly displayPrice: string;
  readonly priceCents: number;
  readonly currencyCode?: string;
  readonly periodUnit?: "DAY" | "WEEK" | "MONTH" | "YEAR";
  readonly periodValue?: number;
}

export interface NativeTransaction {
  /** Apple's signed JWS. The only field the server may trust, after checking it. */
  readonly jws: string;
  /** StoreKit's own local verification. Reported, never relied on. */
  readonly verified: boolean;
  readonly transactionId: string;
  readonly originalTransactionId: string;
  readonly productId: string;
  readonly purchasedAt: number;
  readonly expiresAt?: number;
  readonly revokedAt?: number;
  readonly appAccountToken?: string;
}

export type NativePurchase =
  | { readonly status: "success"; readonly transaction: NativeTransaction }
  | { readonly status: "cancelled" | "pending" | "unknown" };

/** Null means no purchase path here — a browser, or a shell without the plugin. */
export async function nativeStoreProducts(productIds: string[]): Promise<NativeProduct[] | null> {
  const result = await call<{ products: NativeProduct[] }>("products", { productIds });
  return result?.products ?? null;
}

/**
 * Runs Apple's purchase sheet.
 *
 * `appAccountToken` is the member's id and must be sent. It travels inside the
 * signed transaction and comes back on every renewal and in every App Store
 * server notification, which is what lets a subscription be bound to an account
 * here rather than only to an Apple ID — one Apple ID must not unlock several
 * members, and a renewal arriving months later has to find its way home.
 *
 * A resolved `success` is not a granted subscription. The transaction stays
 * open until the server has verified it and `finishNativeTransaction` is
 * called; anything else throws away StoreKit's redelivery of a purchase whose
 * grant did not land.
 */
export async function purchaseNativeProduct(
  productId: string,
  appAccountToken: string,
): Promise<NativePurchase | null> {
  return call<NativePurchase>("purchase", { productId, appAccountToken });
}

/** What Apple currently considers bought — restore, and a second device. */
export async function nativeEntitlements(): Promise<NativeTransaction[] | null> {
  const result = await call<{ transactions: NativeTransaction[] }>("currentEntitlements");
  return result?.transactions ?? null;
}

/**
 * Purchases StoreKit is still redelivering because nothing finished them —
 * money taken whose grant never stuck. Submitted on launch, which is the entire
 * reason finishing is a separate step.
 */
export async function nativeUnfinishedTransactions(): Promise<NativeTransaction[] | null> {
  const result = await call<{ transactions: NativeTransaction[] }>("unfinishedTransactions");
  return result?.transactions ?? null;
}

/** Only after the server has granted. */
export async function finishNativeTransaction(transactionId: string): Promise<boolean> {
  const result = await call<{ finished: boolean }>("finish", { transactionId });
  return result?.finished === true;
}

/**
 * Transactions that arrive without anybody pressing anything: a renewal, an
 * Ask-to-Buy approval, a purchase made on another device, a refund. The native
 * side retains these until something consumes them, so a listener attached
 * after launch still receives one that fired while the page was loading.
 */
export function onNativeTransaction(
  handler: (transaction: NativeTransaction) => void,
): (() => void) | null {
  const cap = bridge();
  if (!cap) return null;
  try {
    const listener = cap.addListener?.(PLUGIN, "transactionUpdated", (data) =>
      handler(data as NativeTransaction),
    );
    return () => void listener?.remove();
  } catch {
    return null;
  }
}
