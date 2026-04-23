import React from "react";

export default function NewsCardSkeleton() {
  return (
    <div className="flex flex-1 flex-col w-full min-w-0 bg-card rounded-2xl border border-border p-5 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg animate-shimmer" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-32 rounded animate-shimmer" />
          <div className="h-3 w-20 rounded animate-shimmer" />
        </div>
      </div>
      <div className="space-y-2">
        <div className="h-5 w-full rounded animate-shimmer" />
        <div className="h-5 w-3/4 rounded animate-shimmer" />
      </div>
      <div className="h-40 w-full rounded-xl animate-shimmer" />
      <div className="space-y-2">
        <div className="h-3 w-full rounded animate-shimmer" />
        <div className="h-3 w-2/3 rounded animate-shimmer" />
      </div>
    </div>
  );
}