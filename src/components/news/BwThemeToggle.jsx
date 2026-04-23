'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BW_THEME_STORAGE_KEY } from '@/lib/theme-storage';

const labels = {
  he: { on: 'מצב כהה פעיל', off: 'מעבר למצב כהה (שחור/לבן)', title: 'מצב שחור ולבן' },
  en: { on: 'Dark mode on', off: 'Switch to dark mode', title: 'Dark / light' },
  ar: { on: 'الوضع الداكن مفعّل', off: 'التبديل إلى الوضع الداكن', title: 'أسود وأبيض' },
};

export default function BwThemeToggle({ currentLang }) {
  const lang = currentLang === 'ar' ? 'ar' : currentLang === 'en' ? 'en' : 'he';
  const L = labels[lang];

  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const dark =
      typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
    setIsDark(dark);
  }, []);

  const toggle = () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle('dark', next);
    try {
      localStorage.setItem(BW_THEME_STORAGE_KEY, next ? 'dark' : 'light');
    } catch {
      /* ignore */
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={toggle}
      className="rounded-full shrink-0 gap-1.5"
      aria-pressed={isDark}
      aria-label={isDark ? L.on : L.off}
      title={L.title}
    >
      {isDark ? (
        <Sun className="w-4 h-4" aria-hidden />
      ) : (
        <Moon className="w-4 h-4" aria-hidden />
      )}
      <span className="hidden sm:inline text-xs font-medium max-w-[7rem] truncate">{L.title}</span>
    </Button>
  );
}
