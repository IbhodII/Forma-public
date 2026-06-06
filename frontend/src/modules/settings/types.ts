export type {
  CloudSyncProvider,
  Sex,
  UnitsSystem,
  UserProfile,
  UserProfileUpdate,
} from "../../api/user";

export const CLOUD_SYNC_OPTIONS = [
  { id: "yandex" as const, label: "Yandex Disk", description: "OAuth, бэкап БД и синхронизация тренировок" },
  { id: "google" as const, label: "Google Drive", description: "OAuth, бэкап БД и синхронизация тренировок" },
];

export const SEX_OPTIONS = [
  { id: "male" as const, label: "Мужской" },
  { id: "female" as const, label: "Женский" },
];

export const UNITS_SYSTEM_OPTIONS = [
  {
    id: "metric" as const,
    label: "Метрическая (кг, см, км, °C)",
  },
  {
    id: "american" as const,
    label: "Американская (экспериментальная)",
  },
] as const;
