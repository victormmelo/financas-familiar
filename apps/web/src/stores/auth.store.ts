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
  persist<AuthState>(
    (set) => ({
      user: null,
      isAuthenticated: false,
      setAuth: (user: User, accessToken: string) => {
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
    },
  ),
)
