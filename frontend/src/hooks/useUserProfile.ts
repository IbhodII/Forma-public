import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchUserProfile, saveUserProfile, type UserProfileUpdate } from "../api/user";

import { queryKeys } from "./queryKeys";



export function useUserProfile(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.userProfile,
    queryFn: fetchUserProfile,
    enabled: options?.enabled ?? true,
  });
}



export function useSaveUserProfile() {

  const qc = useQueryClient();

  return useMutation({

    mutationFn: (body: UserProfileUpdate) => saveUserProfile(body),

    onSuccess: (data) => {

      qc.setQueryData(queryKeys.userProfile, data);

      void qc.invalidateQueries({ queryKey: queryKeys.userProfile });

    },

  });

}

