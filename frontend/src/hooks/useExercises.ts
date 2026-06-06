import { useQuery } from "@tanstack/react-query";
import { fetchExercises } from "../api/strength";
import { queryKeys } from "./queryKeys";

/** Глобальный справочник упражнений (GET /api/strength/exercises). */
export function useExercises() {
  return useQuery({
    queryKey: queryKeys.strengthExercises,
    queryFn: fetchExercises,
    staleTime: 60_000,
  });
}
