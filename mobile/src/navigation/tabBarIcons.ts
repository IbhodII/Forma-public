import {TAB} from './routes';

export type TabIconMeta = {
  icon: string;
  iconActive: string;
  short: string;
};

export const TAB_BAR_ICONS: Record<string, TabIconMeta> = {
  [TAB.Dashboard]: {icon: 'home-outline', iconActive: 'home', short: 'Дом'},
  [TAB.Workouts]: {icon: 'barbell-outline', iconActive: 'barbell', short: 'Трен'},
  [TAB.Food]: {icon: 'nutrition-outline', iconActive: 'nutrition', short: 'Еда'},
  [TAB.Analytics]: {icon: 'pulse-outline', iconActive: 'pulse', short: 'Стат'},
  [TAB.HealthConnect]: {icon: 'heart-outline', iconActive: 'heart', short: 'HC'},
  [TAB.Settings]: {icon: 'settings-outline', iconActive: 'settings', short: 'Ещё'},
};

const FALLBACK: TabIconMeta = {
  icon: 'ellipse-outline',
  iconActive: 'ellipse',
  short: '—',
};

export function getTabIconMeta(routeName: string, tabBarLabel?: string): TabIconMeta {
  const meta = TAB_BAR_ICONS[routeName];
  if (meta) {
    return meta;
  }
  return {
    ...FALLBACK,
    short: tabBarLabel ?? routeName,
  };
}
