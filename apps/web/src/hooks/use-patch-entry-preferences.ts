import { useMutation } from '@tanstack/react-query'
import type { PatchUserEntryPreferencesInput, UserEntryPreferences } from '@financas/shared-types'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth.store'

interface PatchResponse {
  data: { entryPreferences: UserEntryPreferences }
}

export function usePatchEntryPreferences() {
  const setUser = useAuthStore((s) => s.setUser)

  return useMutation({
    mutationFn: (body: PatchUserEntryPreferencesInput) =>
      api.patch<PatchResponse>('/auth/me/entry-preferences', body),
    onSuccess: (res) => {
      const u = useAuthStore.getState().user
      if (u) {
        setUser({ ...u, entryPreferences: res.data.entryPreferences })
      }
    },
  })
}
