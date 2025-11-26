import { create } from 'zustand'

interface AuthState {
  token: string | null
  businessLineId: string | null
  setToken: (token: string | null) => void
  setBusinessLineId: (lineId: string | null) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  businessLineId: null,
  setToken: (token) => set({ token }),
  setBusinessLineId: (businessLineId) => set({ businessLineId }),
  logout: () => set({ token: null, businessLineId: null }),
}))

