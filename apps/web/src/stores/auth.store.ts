import { create } from 'zustand'

interface User {
  id: string
  name: string
  email: string
  role: 'ADMIN' | 'MEMBER'
  familyId: string
  familyName?: string
}

export type AuthBootstrapStatus = 'idle' | 'loading' | 'ready' | 'error'

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  bootstrapStatus: AuthBootstrapStatus
  hasSessionToken: boolean
  setUser: (user: User | null) => void
  setBootstrapStatus: (status: AuthBootstrapStatus) => void
  setHasSessionToken: (hasSessionToken: boolean) => void
  clearAuth: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  bootstrapStatus: 'idle',
  hasSessionToken: false,
  setUser: (user) => set({ user, isAuthenticated: !!user }),
  setBootstrapStatus: (bootstrapStatus) => set({ bootstrapStatus }),
  setHasSessionToken: (hasSessionToken) => set({ hasSessionToken }),
  clearAuth: () =>
    set({
      user: null,
      isAuthenticated: false,
      hasSessionToken: false,
    }),
}))
