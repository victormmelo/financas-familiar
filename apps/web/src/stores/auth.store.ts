import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { setAccessToken } from '@/lib/api'

interface User {
  id: string
  name: string
  email: string
  role: 'ADMIN' | 'MEMBER'
  familyId: string
  familyName?: string
}

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  setAuth: (user: User, accessToken: string) => void
  clearAuth: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      setAuth: (user, accessToken) => {
        setAccessToken(accessToken)
        set({ user, isAuthenticated: true })
      },
      clearAuth: () => {
        setAccessToken(null)
        set({ user: null, isAuthenticated: false })
      },
    }),
    {
      name: 'auth-storage',
      partialState: (state: AuthState) => ({ user: state.user, isAuthenticated: state.isAuthenticated }),
    } as Parameters<typeof persist>[1],
  ),
)
