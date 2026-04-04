export interface TokenPayload {
  sub: string       // userId
  familyId: string
  role: string
}

export interface AuthTokens {
  accessToken: string
  refreshToken: string
}

export interface AuthUser {
  id: string
  name: string
  email: string
  role: string
  familyId: string
  family: {
    id: string
    name: string
  }
}
