/** Base da API Fastify. `??` não cobre string vazia — aí o fetch vira relativo e bate no Next (:3000). */

function resolvePublicApiUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL
  if (typeof raw === 'string' && raw.trim().length > 0) {
    return raw.trim().replace(/\/+$/, '')
  }
  return 'http://localhost:3001'
}

const API_URL = resolvePublicApiUrl()

let accessToken: string | null = null

export class ApiClientError extends Error {
  status: number
  code?: string

  constructor(message: string, options: { status: number; code?: string }) {
    super(message)
    this.name = 'ApiClientError'
    this.status = options.status
    this.code = options.code
  }
}

export function setAccessToken(token: string | null) {
  accessToken = token
}

export function getAccessToken(): string | null {
  return accessToken
}

export async function apiFetch<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const incoming = (options.headers as Record<string, string> | undefined) ?? {}
  const headers: Record<string, string> = { ...incoming }

  const hasBody =
    options.body !== undefined && options.body !== null && String(options.body).length > 0

  if (hasBody && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`
  }
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  })

  if (res.status === 204) {
    return undefined as T
  }

  const text = await res.text()
  let data: Record<string, unknown> = {}
  if (text.length > 0) {
    try {
      data = JSON.parse(text) as Record<string, unknown>
    } catch {
      data = {}
    }
  }
  if (res.status === 401) {
    accessToken = null
    throw new ApiClientError('Não autenticado', { status: 401, code: 'UNAUTHENTICATED' })
  }

  if (res.status === 403 && data.code === 'USER_NOT_PROVISIONED') {
    throw new ApiClientError(typeof data.message === 'string' ? data.message : 'Cadastro incompleto', {
      status: 403,
      code: 'USER_NOT_PROVISIONED',
    })
  }

  if (!res.ok) {
    throw new ApiClientError(typeof data.message === 'string' ? data.message : 'Erro na requisição', {
      status: res.status,
      code: typeof data.code === 'string' ? data.code : undefined,
    })
  }

  return data as T
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, {
      method: 'POST',
      body: JSON.stringify(body ?? {}),
    }),
  patch: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => apiFetch<T>(path, { method: 'DELETE' }),
}

export async function apiFetchMultipart<T = unknown>(
  path: string,
  formData: FormData,
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

  if (res.status === 204) {
    return undefined as T
  }

  const text = await res.text()
  let data: Record<string, unknown> = {}
  if (text.length > 0) {
    try {
      data = JSON.parse(text) as Record<string, unknown>
    } catch {
      data = {}
    }
  }
  if (res.status === 401) {
    accessToken = null
    throw new ApiClientError('Não autenticado', { status: 401, code: 'UNAUTHENTICATED' })
  }

  if (res.status === 403 && data.code === 'USER_NOT_PROVISIONED') {
    throw new ApiClientError(typeof data.message === 'string' ? data.message : 'Cadastro incompleto', {
      status: 403,
      code: 'USER_NOT_PROVISIONED',
    })
  }

  if (!res.ok) {
    throw new ApiClientError(typeof data.message === 'string' ? data.message : 'Erro no upload', {
      status: res.status,
      code: typeof data.code === 'string' ? data.code : undefined,
    })
  }

  return data as T
}
