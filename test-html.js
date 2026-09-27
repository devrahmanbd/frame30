import React from "react";
import { renderToString } from "react-dom/server";
import { Heart } from "lucide-react";

console.log(renderToString(
  <button
    className="absolute right-3 top-3 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-[var(--theme-surface)]/90 text-[var(--theme-ink)] shadow-sm backdrop-blur-sm transition-all duration-300 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 group/btn"
  >
    <Heart
      className="size-3.5 transition-all duration-300 group-hover/btn:fill-[var(--theme-ink)] group-hover/btn:scale-110"
      strokeWidth={1.5}
      fill="none"
    />
  </button>
));
