export const SETTINGS_TAB_STORAGE_KEY = "health-dashboard-settings-tab";

export const SETTINGS_SECTIONS = [
  { id: "profile", labelKey: "settings.profile", icon: "👤", descriptionKey: "settings.profileDesc" },
  {
    id: "connections",
    labelKey: "settings.connections",
    icon: "🔗",
    descriptionKey: "settings.connectionsDesc",
  },
  {
    id: "data",
    labelKey: "settings.data",
    icon: "💾",
    descriptionKey: "settings.dataDesc",
  },
  {
    id: "sync",
    labelKey: "settings.sync",
    icon: "🔄",
    descriptionKey: "settings.syncDesc",
  },
  {
    id: "analytics",
    labelKey: "settings.analytics",
    icon: "📊",
    descriptionKey: "settings.analyticsDesc",
  },
  { id: "nutrition", labelKey: "settings.nutrition", icon: "🍎", descriptionKey: "settings.nutritionDesc" },
  { id: "bike", labelKey: "settings.bike", icon: "🚲", descriptionKey: "settings.bikeDesc" },
  { id: "interface", labelKey: "settings.interface", icon: "🎨", descriptionKey: "settings.interfaceDesc" },
  { id: "about", labelKey: "settings.about", icon: "💚", descriptionKey: "settings.aboutDesc" },
] as const;

export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]["id"];

const LEGACY_TAB_ALIASES: Record<string, SettingsSectionId> = {
  integrations: "connections",
  sync_cloud: "sync",
  cloud: "sync",
  account: "profile",
  experimental: "about",
  cycle: "about",
  analytics_settings: "analytics",
};

export function isSettingsSectionId(value: string | null): value is SettingsSectionId {
  return SETTINGS_SECTIONS.some((s) => s.id === value);
}

export function resolveSettingsSectionId(value: string | null): SettingsSectionId {
  if (value && isSettingsSectionId(value)) return value;
  if (value && value in LEGACY_TAB_ALIASES) return LEGACY_TAB_ALIASES[value];
  return "profile";
}
