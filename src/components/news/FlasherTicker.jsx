import React from "react";
import { Zap } from "lucide-react";

export default function FlasherTicker({ flashers, lang }) {
  if (!flashers || flashers.length === 0) return null;

  const label = lang === "he" ? "מבזקים" : lang === "ar" ? "عاجل" : "Breaking";

  return (
    <div className="border-t border-border pt-3 mt-3">
      <div className="flex items-center gap-1 bg-destructive/10 text-destructive px-2 py-0.5 rounded-full w-fit mb-2">
        <Zap className="w-3 h-3" />
        <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
      </div>
      <div className="relative overflow-hidden h-20">
        <div className="animate-ticker-vertical absolute w-full">
          {[...flashers, ...flashers].map((flash, i) => (
            <p key={i} className="text-xs text-muted-foreground py-1 leading-snug font-bold">
              <span className="text-destructive/60 mr-1.5">●</span>
              {flash}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}