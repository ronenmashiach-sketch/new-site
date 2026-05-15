import { DEFAULT_SITE_FONT_FAMILY, resolveSiteFontStack } from '@/lib/site-font-options';

export const DEFAULT_SITE_TITLE_DISPLAY = {
  text: 'BaSaD',
  fontFamily: DEFAULT_SITE_FONT_FAMILY,
  fontSizePx: 36,
  fontWeight: 800,
  color: '#0f172a',
  useGradient: false,
  gradientFrom: '#0f172a',
  gradientTo: '#3b82f6',
  letterSpacingPx: -0.5,
};

export const DEFAULT_SITE_SUBTITLE_DISPLAY = {
  text: 'Breaking Story Daily',
  fontFamily: DEFAULT_SITE_FONT_FAMILY,
  fontSizePx: 14,
  fontWeight: 400,
  color: '#64748b',
  useGradient: false,
  gradientFrom: '#64748b',
  gradientTo: '#3b82f6',
  letterSpacingPx: 0,
};

/**
 * עטיפה לשם בעורך HTML: ריווח אותיות + גרדיאן אופציונלי על כל השם.
 * @param {{ useGradient?: boolean, gradientFrom?: string, gradientTo?: string, letterSpacingPx?: number } | null | undefined} block
 */
export function buildSiteTitleRichWrapper(block) {
  const letterSpacingPx = block?.letterSpacingPx ?? 0;
  /** @type {import('react').CSSProperties} */
  const style = {
    letterSpacing: `${letterSpacingPx}px`,
  };
  const useGradient = Boolean(block?.useGradient && block.gradientFrom && block.gradientTo);
  if (useGradient) {
    style['--title-grad-from'] = block.gradientFrom;
    style['--title-grad-to'] = block.gradientTo;
  }
  const className = [
    'site-rich-text',
    'site-rich-text--title',
    'tracking-tight',
    'break-words',
    '[&_p]:m-0',
    useGradient ? 'site-rich-text--title-gradient' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return { style, className, useGradient };
}

/**
 * @param {{ useGradient?: boolean, gradientFrom?: string, gradientTo?: string, letterSpacingPx?: number } | null | undefined} block
 */
export function buildSiteSubtitleRichWrapper(block) {
  const letterSpacingPx = block?.letterSpacingPx ?? 0;
  /** @type {import('react').CSSProperties} */
  const style = {
    letterSpacing: `${letterSpacingPx}px`,
  };
  const useGradient = Boolean(block?.useGradient && block.gradientFrom && block.gradientTo);
  if (useGradient) {
    style['--subtitle-grad-from'] = block.gradientFrom;
    style['--subtitle-grad-to'] = block.gradientTo;
  }
  const className = [
    'site-rich-text',
    'site-rich-text--subtitle',
    'mt-0.5',
    'break-words',
    '[&_p]:m-0',
    useGradient ? 'site-rich-text--subtitle-gradient' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return { style, className, useGradient };
}

/**
 * @param {{ fontFamily?: string, fontSizePx: number, fontWeight: number, color: string, useGradient?: boolean, gradientFrom?: string, gradientTo?: string, letterSpacingPx?: number } | null | undefined} block
 * @returns {import('react').CSSProperties}
 */
export function buildSiteTitleStyle(block) {
  if (!block) return {};
  const style = {
    fontFamily: resolveSiteFontStack(block.fontFamily),
    fontSize: `${block.fontSizePx}px`,
    fontWeight: block.fontWeight,
    letterSpacing: `${block.letterSpacingPx ?? 0}px`,
    lineHeight: 1.15,
  };
  if (block.useGradient && block.gradientFrom && block.gradientTo) {
    return {
      ...style,
      backgroundImage: `linear-gradient(90deg, ${block.gradientFrom}, ${block.gradientTo})`,
      WebkitBackgroundClip: 'text',
      backgroundClip: 'text',
      color: 'transparent',
    };
  }
  return { ...style, color: block.color };
}

/**
 * @param {{ fontFamily?: string, fontSizePx: number, fontWeight: number, color: string, useGradient?: boolean, gradientFrom?: string, gradientTo?: string, letterSpacingPx?: number } | null | undefined} block
 * @returns {import('react').CSSProperties}
 */
export function buildSiteSubtitleStyle(block) {
  if (!block) return {};
  const style = {
    fontFamily: resolveSiteFontStack(block.fontFamily),
    fontSize: `${block.fontSizePx}px`,
    fontWeight: block.fontWeight,
    letterSpacing: `${block.letterSpacingPx ?? 0}px`,
    lineHeight: 1.35,
  };
  if (block.useGradient && block.gradientFrom && block.gradientTo) {
    return {
      ...style,
      backgroundImage: `linear-gradient(90deg, ${block.gradientFrom}, ${block.gradientTo})`,
      WebkitBackgroundClip: 'text',
      backgroundClip: 'text',
      color: 'transparent',
    };
  }
  return { ...style, color: block.color };
}
