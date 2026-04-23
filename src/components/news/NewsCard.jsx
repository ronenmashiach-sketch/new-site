import React, { useState, useEffect } from "react";
import { ExternalLink } from "lucide-react";
import FlasherTicker from "./FlasherTicker";

export default function NewsCard({ source, data, lang, index }) {
  const [heroImageFailed, setHeroImageFailed] = useState(false);
  const mainHeadline = data?.[`main_headline_${lang}`] || null;
  const imageHeadline = data?.[`image_headline_${lang}`] || null;
  const imageUrl = data?.image_url || null;
  const flashers = data?.[`flashers_${lang}`] || [];
  const isLoading = !data;
  const showHeroImage = Boolean(imageUrl) && !heroImageFailed;

  useEffect(() => {
    setHeroImageFailed(false);
  }, [imageUrl, data?.last_fetched]);

  const noDataLabel = {
    he: "טוען נתונים...",
    ar: "جار تحميل البيانات...",
    en: "Loading data...",
  };

  return (
    <div
      className="group flex flex-1 flex-col bg-card rounded-2xl border border-border hover:border-primary/30 hover:shadow-xl hover:shadow-primary/5 transition-all duration-300 overflow-hidden cursor-pointer min-w-0 w-full"
      onClick={() => window.open(`https://translate.google.com/translate?sl=auto&tl=iw&u=${encodeURIComponent(source.url)}`, "_blank")}
    >
      {/* Hero image at top (RSS URLs often expire → onError falls back to text block below) */}
      {showHeroImage && (
        <div className="relative overflow-hidden h-48">
          <img
            src={imageUrl}
            alt={imageHeadline || source.name}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            referrerPolicy="no-referrer"
            loading="lazy"
            onError={() => setHeroImageFailed(true)}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
          {imageHeadline && (
            <div className="absolute bottom-0 inset-x-0 p-3">
              <p className="text-white text-xs font-medium leading-snug line-clamp-2">
                {imageHeadline}
              </p>
            </div>
          )}
        </div>
      )}

      <div className="p-5 flex flex-col flex-1 min-h-0">
        {/* Source header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <img
              src={`https://flagcdn.com/32x24/${source.country.toLowerCase()}.png`}
              srcSet={`https://flagcdn.com/64x48/${source.country.toLowerCase()}.png 2x`}
              width="32"
              height="24"
              alt={source.country}
              className="rounded-sm shadow-sm object-cover"
            />
            <div>
              <h3 className="text-sm font-semibold text-foreground leading-tight">
                {source.name}
              </h3>
              <span className="text-[10px] text-muted-foreground uppercase tracking-widest">
                {source.country}
              </span>
            </div>
          </div>
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/5 transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>

        {/* Main headline */}
        {isLoading ? (
          <p className="text-sm text-muted-foreground italic">{noDataLabel[lang]}</p>
        ) : (
          <h2 className="text-lg font-bold text-foreground leading-snug mb-3 line-clamp-3">
            {mainHeadline || "—"}
          </h2>
        )}

        {!showHeroImage && imageHeadline && (
          <div className="bg-muted rounded-xl p-3 mb-3">
            <p className="text-sm text-muted-foreground leading-snug line-clamp-2">
              {imageHeadline}
            </p>
          </div>
        )}

        {/* Flashers */}
        <FlasherTicker flashers={flashers} lang={lang} />

        {/* Last updated */}
        {data?.last_fetched && (
          <div className="mt-3 pt-2 border-t border-border flex items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground">
              {lang === "he" ? "עודכן:" : lang === "ar" ? "تحديث:" : "Updated:"}
            </span>
            <span className="text-[10px] text-muted-foreground font-medium">
              {new Date(data.last_fetched).toLocaleDateString(
                lang === "he" ? "he-IL" : lang === "ar" ? "ar" : "en-US",
                { day: "2-digit", month: "2-digit", year: "numeric" }
              )}{" "}
              {new Date(data.last_fetched).toLocaleTimeString(
                lang === "he" ? "he-IL" : lang === "ar" ? "ar" : "en-US",
                { hour: "2-digit", minute: "2-digit" }
              )}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}