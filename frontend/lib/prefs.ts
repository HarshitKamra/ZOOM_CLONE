export type Prefs = {
  videoOnJoin: boolean;
  muteOnJoin: boolean;
};

const KEY = "zoom-prefs";

export const defaultPrefs: Prefs = { videoOnJoin: true, muteOnJoin: false };

export function loadPrefs(): Prefs {
  if (typeof window === "undefined") return defaultPrefs;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultPrefs;
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return {
      videoOnJoin: parsed.videoOnJoin !== false,
      muteOnJoin: !!parsed.muteOnJoin,
    };
  } catch {
    return defaultPrefs;
  }
}

export function savePrefs(prefs: Prefs) {
  localStorage.setItem(KEY, JSON.stringify(prefs));
}
