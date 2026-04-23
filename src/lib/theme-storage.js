/** localStorage key for dark (black/white) theme preference */
export const BW_THEME_STORAGE_KEY = 'news-bw-theme';

/** Inline script for <head>: apply .dark before first paint (avoids flash). */
export const bwThemeInitScript = `(function(){try{var t=localStorage.getItem('${BW_THEME_STORAGE_KEY}');if(t==='dark')document.documentElement.classList.add('dark');else if(t==='light')document.documentElement.classList.remove('dark');}catch(e){}})();`;
