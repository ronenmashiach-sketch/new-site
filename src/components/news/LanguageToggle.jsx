import React from "react";
import { LANGUAGES } from "@/lib/newsSources";
import { cn } from "@/lib/utils";

/** Logical order en→ar→he; dir flips visual placement: EN UI = LTR (Eng left), HE/AR UI = RTL (עברית left). */
const LANG_ORDER = ["he", "ar", "en"];

export default function LanguageToggle({ currentLang, onLangChange }) {
  const uiDir = currentLang === "en" ? "ltr" : "rtl";
  return (
    <div
      role="group"
      aria-label="Site language"
      dir={uiDir}
      className="inline-flex flex-wrap items-center justify-center gap-1 rounded-full border border-border bg-card p-1 shadow-sm"
    >
      {LANG_ORDER.map((code) => {
        const { label } = LANGUAGES[code];
        const active = currentLang === code;
        return (
          <button
            key={code}
            type="button"
            onClick={() => onLangChange(code)}
            className={cn(
              "rounded-full px-3 py-2 text-sm font-medium transition-colors sm:px-4 sm:py-2 min-h-9 min-w-[4.25rem] sm:min-w-[5rem]",
              active
                ? "bg-primary text-primary-foreground shadow-md"
                : "border border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground"
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}