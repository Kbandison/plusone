import { PREMIUM_INCLUDES, PREMIUM_LEAD } from "@plusone/config";

/**
 * What premium is, on the two pages that sell it.
 *
 * Both spelled the same list markup by hand against a flat array of five
 * strings — `/pricing` and the premium settings screen — so a change to how the
 * tier reads had to be made twice and could be made once.
 *
 * The grouping is the content, not decoration: PREMIUM_INCLUDES is now two
 * groups because the tier is two things, and Decision #23/#24 has said so since
 * before any of it was built. Five equal bullets said neither.
 */
export function PremiumIncludes({ size = "app" }: { size?: "app" | "marketing" }) {
  // The two pages set type a shade apart already; kept rather than unified,
  // because that is a different argument from this one.
  const head = size === "marketing" ? "text-[13px]" : "text-[12.6px]";
  const bodyText = size === "marketing" ? "text-[13px]" : "text-[12.6px]";

  return (
    <>
      <p className={`text-ink-2 ${bodyText} leading-[1.7]`}>{PREMIUM_LEAD}</p>

      <div className="mt-8 flex flex-col gap-8">
        {PREMIUM_INCLUDES.map((group) => (
          <section key={group.id}>
            <h3 className="text-[11px] tracking-[0.06em] text-ink-3 uppercase">{group.heading}</h3>

            <ul className="mt-4 flex flex-col gap-4">
              {group.items.map((item) => (
                <li key={item.title} className="border-l border-line-2 pl-5">
                  <p className={`text-ink ${head}`}>{item.title}</p>
                  <p className={`mt-1.5 text-ink-2 ${bodyText} leading-[1.65]`}>{item.body}</p>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
