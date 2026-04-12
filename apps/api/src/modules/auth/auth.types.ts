export interface TokenPayload {
  sub: string // userId interno (Prisma)
  familyId: string
  role: string
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
