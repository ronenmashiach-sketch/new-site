import React from "react";
import { Globe, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import LanguageToggle from "./LanguageToggle";
import BwThemeToggle from "./BwThemeToggle";

export default function NewsHeader({ currentLang, onLangChange, onRefresh, isRefreshing, lastUpdated }) {
  const titles = {
    he: "BaSaD",
    ar: "BaSaD",
    en: "BaSaD",
  };

  const subtitles = {
    he: "Breaking Story Daily",
    ar: "Breaking Story Daily",
    en: "Breaking Story Daily",
  };

  return (
    <header className="sticky top-0 z-50 backdrop-blur-xl bg-background/80 border-b border-border">
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex flex-col items-center gap-4">
          <div
            className="flex items-center gap-3"
            dir={currentLang === "en" ? "ltr" : "rtl"}
          >
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shadow-lg shrink-0">
              <Globe className="w-5 h-5 text-primary-foreground" />
            </div>
            <div className="text-center">
              <h1 className="text-4xl font-extrabold text-foreground tracking-tight">
                {titles[currentLang]}
              </h1>
              <p className="text-sm text-muted-foreground">
                {subtitles[currentLang]}
              </p>
            </div>
          </div>

          {/* EN: LTR — timestamp left, refresh, languages right. HE/AR: RTL — mirror (שפות start, עדכון end). */}
          <div
            dir={currentLang === "en" ? "ltr" : "rtl"}
            className="flex flex-wrap items-center justify-center gap-3 w-full max-w-2xl"
          >
            {lastUpdated && (
              <div className="flex flex-col items-center text-xs text-muted-foreground bg-muted px-3 py-1.5 rounded-lg shrink-0">
                <span className="font-medium">
                  {currentLang === "he" ? "עדכון אחרון" : currentLang === "ar" ? "آخر تحديث" : "Last update"}
                </span>
                <span>
                  {new Date(lastUpdated).toLocaleDateString(
                    currentLang === "he" ? "he-IL" : currentLang === "ar" ? "ar" : "en-US",
                    { day: "2-digit", month: "2-digit", year: "numeric" }
                  )}{" "}
                  {new Date(lastUpdated).toLocaleTimeString(
                    currentLang === "he" ? "he-IL" : currentLang === "ar" ? "ar" : "en-US",
                    { hour: "2-digit", minute: "2-digit" }
                  )}
                </span>
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={isRefreshing}
              className="rounded-full shrink-0"
              aria-label={currentLang === "he" ? "רענון" : currentLang === "ar" ? "تحديث" : "Refresh"}
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
            </Button>
            <BwThemeToggle currentLang={currentLang} />
            <LanguageToggle currentLang={currentLang} onLangChange={onLangChange} />
          </div>
        </div>
      </div>
    </header>
  );
}