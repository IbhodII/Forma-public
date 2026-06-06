import { resolveApiBaseUrl } from "../../api/runtimeBaseUrl";

export const FREE_EXERCISE_DB_IMAGE_BASE =
  "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/";

/** Базовый URL API без /api (для /uploads/…). */
export function getApiOrigin(): string {
  const apiUrl = resolveApiBaseUrl();
  if (apiUrl?.startsWith("http")) {
    return apiUrl.replace(/\/api\/?$/, "");
  }
  return "";
}

/** Полный URL одного пути из images_json. */
export function resolveStretchingImageUrl(path: string): string | null {
  const p = path?.trim();
  if (!p) return null;
  if (p.startsWith("http://") || p.startsWith("https://")) return p;
  if (p.startsWith("/uploads")) return `${getApiOrigin()}${p}`;
  const normalized = p.replace(/^\//, "");
  if (normalized.startsWith("exercises/")) {
    return `${FREE_EXERCISE_DB_IMAGE_BASE}${normalized}`;
  }
  return `${FREE_EXERCISE_DB_IMAGE_BASE}${normalized}`;
}

export function getExerciseImageUrl(imagesJson?: string[] | null): string | null {
  if (!imagesJson?.length) return null;
  return resolveStretchingImageUrl(imagesJson[0]);
}

export function exerciseDisplayName(ex: {
  name: string;
  original_name?: string | null;
  translated?: boolean;
  exercise_name?: string;
}): string {
  if (ex.exercise_name?.trim()) return ex.exercise_name;
  if (ex.translated && ex.name.trim()) return ex.name;
  return ex.original_name?.trim() || ex.name;
}

export function exerciseDescriptionText(ex: {
  description?: string | null;
  original_description?: string | null;
}): string {
  const ru = ex.description?.trim();
  if (ru) return ru;
  const en = ex.original_description?.trim();
  if (en) return en;
  return "Описание отсутствует.";
}
