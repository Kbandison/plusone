/**
 * The Play purchase path, which is the only way the TWA may sell anything.
 *
 * Play's policy is the same shape as Apple's 3.1.1: a subscription unlocking
 * features inside an app distributed on Play goes through Play billing. So the
 * Android shell, like the iOS one, hides the Stripe checkout and offers this
 * instead.
 *
 * Deliberately shaped like `native-iap.ts`, so the two shells read alike — every
 * function answers null where there is no purchase path, rather than throwing,
 * and a caller does not have to know which surface it is on.
 *
 * ── what a TWA actually has ─────────────────────────────────────────────────
 *
 * A TWA is real Chrome, so there is no bridge and no plugin. Billing arrives as
 * two web APIs: the Digital Goods API for prices and existing purchases, and
 * the Payment Request API for the purchase itself. Both are present only inside
 * a Trusted Web Activity — in an ordinary tab `getDigitalGoodsService` does not
 * exist, which is why every entry point here checks rather than assumes.
 *
 * ── the base-plan trap, and why the ids look like this ──────────────────────
 *
 * `getDetails()` takes SUBSCRIPTION PRODUCT ids. A base plan id returns an empty
 * list and a PaymentRequest naming one comes back RESULT_CANCELED, which is why
 * these are three separate Play subscriptions rather than one with three base
 * plans. The ids are on `PLANS` as `playProductId` and are NOT Apple's — they
 * are `premium1month`, `premium3months`, `premium6months`, and a product id
 * Play does not know returns an empty list rather than an error.
 */
const PLAY_BILLING = "https://play.google.com/billing";

interface DigitalGoodsService {
  getDetails: (itemIds: string[]) => Promise<PlayItemDetails[]>;
  listPurchases: () => Promise<{ itemId: string; purchaseToken: string }[]>;
}

export interface PlayItemDetails {
  readonly itemId: string;
  readonly title: string;
  readonly description?: string;
  /**
   * Play's own price, and the ONLY one that may be rendered.
   *
   * Play prices per storefront, so this is not `PLANS[].priceCents` formatted —
   * it is what this member will actually be charged, in their currency. The
   * same rule `native-iap.ts` states for Apple, and the same failure if it is
   * ignored: a screen promising $19.99 to somebody billed in euros.
   */
  readonly price: { readonly value: string; readonly currency: string };
  readonly itemType?: "product" | "subscription";
}

function service(): Promise<DigitalGoodsService> | null {
  if (typeof window === "undefined") return null;
  const get = (window as Window & { getDigitalGoodsService?: (m: string) => Promise<unknown> })
    .getDigitalGoodsService;
  if (typeof get !== "function") return null;
  return get(PLAY_BILLING) as Promise<DigitalGoodsService>;
}

/**
 * Whether Play billing exists here at all.
 *
 * NOT whether the products are configured — that is `playProducts()` returning
 * something. The two differ in practice: a base plan not flagged backwards
 * compatible answers with an empty list rather than an error, so a screen can
 * have a working billing service and nothing to sell.
 */
export function playBillingAvailable(): boolean {
  return service() !== null;
}

/** Null means no purchase path here. An empty array means Play knows none of these. */
export async function playProducts(productIds: string[]): Promise<PlayItemDetails[] | null> {
  const svc = service();
  if (!svc) return null;
  try {
    return await (await svc).getDetails(productIds);
  } catch {
    return null;
  }
}

/** What Play already considers bought — the restore path. */
export async function playPurchases(): Promise<{ itemId: string; purchaseToken: string }[] | null> {
  const svc = service();
  if (!svc) return null;
  try {
    return await (await svc).listPurchases();
  } catch {
    return null;
  }
}

export type PlayPurchaseResult =
  | { readonly status: "success"; readonly purchaseToken: string }
  // Three distinct members rather than one with a union status, so narrowing
  // on `status` actually removes a case. The compact version reads better and
  // leaves `purchaseToken` unreachable after the other two are handled.
  | { readonly status: "cancelled" }
  | { readonly status: "unavailable" };

/**
 * Runs Play's purchase sheet.
 *
 * A resolved `success` is NOT a granted subscription, exactly as on iOS. The
 * token has to reach `submitPlayPurchase`, which verifies it with Google and
 * only then acknowledges — and Play REFUNDS a purchase that is not acknowledged
 * within 72 hours, so dropping the token on the floor is worse here than
 * leaving a StoreKit transaction unfinished.
 *
 * ── changing tier is a replacement, not a second purchase ───────────────────
 *
 * `oldSku` and `purchaseToken` name the subscription being replaced, and
 * `replacementMode` decides what happens to the money already paid.
 * `withTimeProration` is the default: switch now, credit unused time by pushing
 * the renewal out — right for an UPGRADE. For a DOWNGRADE it takes effect
 * immediately against a term already bought, so `deferred` is correct there.
 * Neither errors, which is why the caller states it rather than inheriting it.
 */
export async function purchasePlayProduct(
  productId: string,
  replacing?: {
    readonly productId: string;
    readonly purchaseToken: string;
    readonly deferred?: boolean;
  },
): Promise<PlayPurchaseResult | null> {
  if (typeof window === "undefined" || typeof PaymentRequest === "undefined") return null;
  if (!playBillingAvailable()) return null;

  const data: Record<string, unknown> = { sku: productId };
  if (replacing) {
    data["oldSku"] = replacing.productId;
    data["purchaseToken"] = replacing.purchaseToken;
    // Renamed in android-browser-helper billing-1.1.0; `prorationMode` is
    // deprecated but still honoured, and the ChromeOS guide still documents the
    // old pair, so the two sources read as though they disagree.
    data["replacementMode"] = replacing.deferred ? "deferred" : "withTimeProration";
  }

  try {
    /**
     * `details` is required by the Payment Request API and ignored by Play.
     *
     * ChromeOS's sample constructs this with one argument, which the DOM types
     * refuse — the spec requires a total. Play takes the price from the store
     * record rather than from here, so a placeholder is correct and a number
     * copied out of PLANS would be worse: it would look authoritative while
     * having no effect on what anybody is charged.
     */
    const request = new PaymentRequest([{ supportedMethods: PLAY_BILLING, data }], {
      total: { label: "Subscription", amount: { currency: "USD", value: "0" } },
    });
    const response = await request.show();
    const token = (response.details as { purchaseToken?: string })?.purchaseToken;
    // complete() dismisses Play's sheet. "success" here is about the SHEET, not
    // about the grant — the server has not been asked yet.
    await response.complete(token ? "success" : "fail");
    return token ? { status: "success", purchaseToken: token } : { status: "cancelled" };
  } catch {
    // A dismissed sheet rejects, and so does a product Play does not know. Both
    // are ordinary and neither may log: a rejection can carry a purchase.
    return { status: "cancelled" };
  }
}

/**
 * What actually went wrong, in words, for a screen nobody can attach a debugger
 * to.
 *
 * A TWA runs in Chrome on a phone, and the only ways to see a console are USB
 * remote debugging or nothing. So three rounds of this were spent guessing:
 * `playProducts()` answers null for a service that is absent, a service that
 * rejects, and a `getDetails` that throws, and those have completely different
 * causes. This walks the same steps and says which one stopped.
 *
 * Behind `?debug=play` and shown to nobody otherwise. It reports the shape of a
 * failure, never a purchase — the ids it prints are our own product ids, which
 * are in the client bundle already.
 */
export async function playDiagnostics(productIds: string[]): Promise<string[]> {
  const lines: string[] = [];
  const has =
    typeof window !== "undefined" &&
    typeof (window as Window & { getDigitalGoodsService?: unknown }).getDigitalGoodsService ===
      "function";
  lines.push(`getDigitalGoodsService present: ${has}`);
  lines.push(`referrer: ${typeof document === "undefined" ? "-" : document.referrer || "(empty)"}`);
  if (!has) return lines;

  let svc: DigitalGoodsService;
  try {
    svc = await (service() as Promise<DigitalGoodsService>);
    lines.push("service resolved: yes");
  } catch (cause) {
    lines.push(
      `service REJECTED: ${cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause)}`,
    );
    return lines;
  }

  try {
    const items = await svc.getDetails(productIds);
    lines.push(`getDetails returned ${items.length} of ${productIds.length} asked for`);
    for (const item of items)
      lines.push(`  ${item.itemId} ${item.price?.value} ${item.price?.currency}`);
    if (items.length === 0)
      lines.push(
        "  (empty list — Play does not know these ids, or the base plan is not backwards compatible)",
      );
  } catch (cause) {
    lines.push(
      `getDetails THREW: ${cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause)}`,
    );
  }
  return lines;
}
