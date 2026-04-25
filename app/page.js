'use client'

import React, { useState, useEffect, useCallback } from "react";
import { NEWS_SOURCES, LANGUAGES } from "@/lib/newsSources";
import NewsHeader from "@/components/news/NewsHeader";
import NewsCard from "@/components/news/NewsCard";
import NewsCardSkeleton from "@/components/news/NewsCardSkeleton";
import { listNewsSource } from "@/utils/csvDatabase";
import { useAuth } from "@/lib/AuthContext";
import UserNotRegisteredError from "@/components/UserNotRegisteredError";
import MissingBase44Config from "@/components/MissingBase44Config";

export const dynamic = 'force-dynamic';

const base44LoginOrigin =
  typeof process !== 'undefined' && process.env.NEXT_PUBLIC_BASE44_API_ORIGIN
    ? process.env.NEXT_PUBLIC_BASE44_API_ORIGIN
    : 'https://base44.app';

export default function Dashboard() {
  const { isLoadingAuth, isLoadingPublicSettings, authError, appParams } = useAuth();
  const [lang, setLang] = useState("he");
  const [newsData, setNewsData] = useState({});
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [loadingKeys, setLoadingKeys] = useState(new Set());

  useEffect(() => {
    if (authError?.type !== 'auth_required' || !appParams?.appId?.trim()) return;
    const nextUrl = typeof window !== 'undefined' ? window.location.href : '';
    window.location.href = `${base44LoginOrigin}/login?from_url=${encodeURIComponent(nextUrl)}&app_id=${encodeURIComponent(appParams.appId)}`;
  }, [authError, appParams]);

  const dir = LANGUAGES[lang].dir;

  // Load cached data from CSV
  const loadCachedData = useCallback(async () => {
    const cached = await listNewsSource("-updated_date", 50);
    const dataMap = {};
    cached.forEach((item) => {
      dataMap[item.source_key] = item;
    });
    setNewsData(dataMap);
    if (cached.length > 0) {
      const latest = cached.reduce((a, b) =>
        new Date(a.last_fetched || 0) > new Date(b.last_fetched || 0) ? a : b
      );
      setLastUpdated(latest.last_fetched);
    }
  }, []);

  // Fetch news from RSS. DB.csv מתעדכן מ־`/api/ynet`, `/api/maariv`, `/api/walla` (לא מהדף).
  const fetchSource = useCallback(async (source) => {
    const { fetchNewsFromRSS } = await import("@/utils/rssNewsFetcher");
    return await fetchNewsFromRSS(source);
  }, []);

  // ריענון ידני בלבד (RSS → מצב במסך; לא כותב ל־DB.csv)
  const refreshAllSources = useCallback(async () => {
    setIsRefreshing(true);
    const allKeys = new Set(NEWS_SOURCES.map((s) => s.key));
    setLoadingKeys(allKeys);

    const promises = NEWS_SOURCES.map(async (source) => {
      try {
        const data = await fetchSource(source);
        setNewsData((prev) => ({ ...prev, [source.key]: data }));
        setLoadingKeys((prev) => {
          const next = new Set(prev);
          next.delete(source.key);
          return next;
        });
        return data;
      } catch (err) {
        console.error(`Failed to fetch ${source.name}:`, err);
        setLoadingKeys((prev) => {
          const next = new Set(prev);
          next.delete(source.key);
          return next;
        });
        return null;
      }
    });
    await Promise.all(promises);

    setLastUpdated(new Date().toISOString());
    setIsRefreshing(false);
  }, [fetchSource]);

  // טעינה ראשונה: רק מ־DB.csv — בלי RSS וללא עדכון רשת אוטומטי.
  useEffect(() => {
    if (isLoadingPublicSettings || isLoadingAuth || authError) return;
    loadCachedData();
  }, [loadCachedData, isLoadingPublicSettings, isLoadingAuth, authError]);

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'missing_app_configuration') {
      return <MissingBase44Config />;
    }
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    }
    if (authError.type === 'auth_required') {
      return null;
    }
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <p className="text-destructive text-center">{authError.message || 'Failed to load app'}</p>
      </div>
    );
  }

  return (
    <div dir={dir} className={`min-h-screen bg-background ${dir === "rtl" ? "font-hebrew" : "font-sans"}`}>
        <NewsHeader
          currentLang={lang}
          onLangChange={setLang}
          onRefresh={refreshAllSources}
          isRefreshing={isRefreshing}
          lastUpdated={lastUpdated}
        />

        <main className="max-w-7xl mx-auto px-4 py-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 items-stretch">
            {NEWS_SOURCES.map((source, index) => {
              const data = newsData[source.key];
              const isLoading = loadingKeys.has(source.key);

              return (
                <div key={source.key} className="min-w-0 flex">
                  {isLoading && !data ? (
                    <NewsCardSkeleton />
                  ) : (
                    <NewsCard
                      source={source}
                      data={data}
                      lang={lang}
                      index={index}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </main>

        {/* Footer */}
        <footer className="border-t border-border py-6 mt-12">
          <div className="max-w-7xl mx-auto px-4 text-center">
            <p className="text-xs text-muted-foreground">
              {lang === "he"
                ? "בטעינת הדף מוצג מה שנשמר בקובץ הנתונים. לעדכון מהרשת השתמשו בכפתור הרענון."
                : lang === "ar"
                ? "عند التحميل يُعرض ما هو محفوظ في الملف. لتحديث من الشبكة استخدم زر التحديث."
                : "On load, data comes from the saved file. Use the refresh button to fetch live feeds."}
            </p>
          </div>
        </footer>
      </div>
  );
}