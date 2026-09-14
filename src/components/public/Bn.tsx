import type { ReactNode } from "react";
import { PUBLIC_BANGLA_ENABLED } from "@/lib/public-locale";

const BN_CLASS = "font-bangla text-muted-foreground [letter-spacing:0] leading-[1.5]";

/**
 * A Bangla twin line. Renders nothing while the public site is English-only,
 * so no band has to branch on the flag itself.
 */
export function Bn({ children, block = true }: { children: ReactNode; block?: boolean }) {
  if (!PUBLIC_BANGLA_ENABLED) return null;
  return (
    <>
      {block ? <br /> : null}
      <span lang="bn" className={BN_CLASS}>
        {children}
      </span>
    </>
  );
}
