import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  clampMaxFlashersDisplay,
  DEFAULT_MAX_FLASHERS_DISPLAY,
} from '@/lib/flasher-ticker-display';
import {
  DEFAULT_FLASHER_SPEED_LEVEL,
  speedLevelLabelHe,
  speedLevelToTiming,
} from '@/lib/flasher-ticker-duration';

const SETTINGS_PATH = path.join(process.cwd(), 'data', 'flasher-ticker-settings.json');

function clampSpeedLevel(value) {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  const i = Math.trunc(n);
  if (i < 1) return 1;
  if (i > 20) return 20;
  return i;
}

/** @param {Record<string, unknown>} data */
function buildSettingsFromData(data) {
  const speedLevel = clampSpeedLevel(data?.speedLevel) ?? DEFAULT_FLASHER_SPEED_LEVEL;
  const maxFlashersDisplay =
    clampMaxFlashersDisplay(data?.maxFlashersDisplay) ?? DEFAULT_MAX_FLASHERS_DISPLAY;
  const timing = speedLevelToTiming(speedLevel);
  return {
    speedLevel,
    speedLabel: speedLevelLabelHe(speedLevel),
    maxFlashersDisplay,
    ...timing,
  };
}

export async function readFlasherTickerSettings() {
  try {
    const raw = await fs.readFile(SETTINGS_PATH, 'utf8');
    const data = JSON.parse(raw);
    return buildSettingsFromData(data);
  } catch (e) {
    if (e?.code === 'ENOENT') return buildSettingsFromData({});
    return buildSettingsFromData({});
  }
}

export async function writeFlasherTickerSettings(partial) {
  const current = await readFlasherTickerSettings();

  const speedLevel =
    'speedLevel' in partial
      ? clampSpeedLevel(partial.speedLevel)
      : current.speedLevel;
  if ('speedLevel' in partial && speedLevel == null) {
    throw new Error('invalid_speed_level');
  }

  const maxFlashersDisplay =
    'maxFlashersDisplay' in partial
      ? clampMaxFlashersDisplay(partial.maxFlashersDisplay)
      : current.maxFlashersDisplay;
  if ('maxFlashersDisplay' in partial && maxFlashersDisplay == null) {
    throw new Error('invalid_max_flashers');
  }

  const built = buildSettingsFromData({
    speedLevel: speedLevel ?? DEFAULT_FLASHER_SPEED_LEVEL,
    maxFlashersDisplay: maxFlashersDisplay ?? DEFAULT_MAX_FLASHERS_DISPLAY,
  });

  await fs.mkdir(path.dirname(SETTINGS_PATH), { recursive: true });
  await fs.writeFile(
    SETTINGS_PATH,
    `${JSON.stringify(
      {
        speedLevel: built.speedLevel,
        maxFlashersDisplay: built.maxFlashersDisplay,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
  return built;
}
