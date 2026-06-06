import { useUserProfile } from "./useUserProfile";

/** Менструальный цикл: вкладка, API и коррекции BMR/TRIMP только при поле «Женский». */
export function useCycleFeatureEnabled(): boolean {
  const { data: profile } = useUserProfile();
  return profile?.sex === "female";
}
