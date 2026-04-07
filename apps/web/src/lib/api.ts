const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

let accessToken: string | null = null

export function setAccessToken(token: string | null) {
  accessToken = token
}

export function getAccessToken(): string | null {
  return accessToken
}

async function refreshToken(): Promise<string | null> {
  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    })
    if (!res.ok) return null
    const data = await res.json()
    accessToken = data.accessToken
    return accessToken
  } catch {
    return null
  }
}

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {},
  retry = true,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  })

  if (res.status === 401 && retry) {
    const newToken = await refreshToken()
    if (newToken) {
      return apiFetch<T>(path, options, false)
    }
    // Clear token and redirect to login
    accessToken = null
    if (typeof window !== 'undefined') {
      window.location.href = '/auth/login'
    }
    throw new Error('Não autenticado')
  }

  if (res.status === 204) {
    return undefined as T
  }

  const data = await res.json()

  if (!res.ok) {
    throw new Error(data.message ?? 'Erro na requisição')
  }

  return data as T
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, {
      method: 'POST',
      // JSON.stringify(undefined) omite o body no fetch; Fastify exige corpo com application/json
      body: JSON.stringify(body ?? {}),
    }),
  patch: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => apiFetch<T>(path, { method: 'DELETE' }),
}

// Multipart upload — does NOT set Content-Type (browser sets it with boundary)
export async function apiFetchMultipart<T = unknown>(
  path: string,
  formData: FormData,
  retry = true,
): Promise<T> {
  const headers: Record<string, string> = {}

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`
  }

  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    body: formData,
    headers,
    credentials: 'include',
  })

  if (res.status === 401 && retry) {
    const newToken = await refreshToken()
    if (newToken) {
      return apiFetchMultipart<T>(path, formData, false)
    }
    accessToken = null
    if (typeof window !== 'undefined') {
      window.location.href = '/auth/login'
    }
    throw new Error('Não autenticado')
  }

  const data = await res.json()

  if (!res.ok) {
    throw new Error(data.message ?? 'Erro no upload')
  }

  return data as T
}
