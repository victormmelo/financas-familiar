import { ApiClientError } from '@/lib/api'

const DEFAULT_UNKNOWN = 'Não foi possível concluir a operação. Tente de novo em instantes.'

/** Junta erros de validação da API em texto curto para toast. */
function joinFieldErrors(fieldErrors?: Record<string, string[] | undefined>): string | null {
  if (!fieldErrors) return null
  const parts: string[] = []
  const keys = Object.keys(fieldErrors).sort()
  for (const key of keys) {
    const msgs = fieldErrors[key]
    const first = msgs?.find(Boolean)
    if (first) parts.push(first)
    if (parts.length >= 4) break
  }
  if (parts.length === 0) return null
  return parts.join('\n')
}

function isNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  const m = err.message.toLowerCase()
  return (
    err.name === 'TypeError' &&
    (m.includes('fetch') || m.includes('network') || m.includes('failed to load') || m.includes('aborted'))
  )
}

/**
 * Mensagem amigável para o usuário final a partir de falhas da API ou da rede.
 */
export function formatUserFacingApiError(err: unknown): string {
  if (isNetworkError(err)) {
    return 'Sem conexão ou o servidor não respondeu. Verifique sua internet e tente de novo.'
  }

  if (err instanceof ApiClientError) {
    const validation =
      joinFieldErrors(err.fieldErrors) ??
      (err.formErrors?.filter(Boolean).slice(0, 3).join('\n') || null)

    switch (err.status) {
      case 400: {
        if (validation) {
          return ['Revise os dados enviados:', validation].join('\n')
        }
        return err.message || 'Pedido inválido. Confira os campos e tente de novo.'
      }
      case 401:
        return 'Sua sessão expirou ou não está válida. Faça login novamente para continuar.'
      case 403:
        if (err.code === 'USER_NOT_PROVISIONED') {
          return (
            err.message ||
            'Cadastro incompleto. Conclua seu perfil ou entre em contato com o administrador da família.'
          )
        }
        return err.message || 'Você não tem permissão para esta ação.'
      case 404:
        return err.message
          ? `${err.message} Se o problema persistir, atualize a página e tente de novo.`
          : 'Registro não encontrado. Atualize a lista e tente de novo.'
      case 409:
        return err.message
          ? `Conflito: ${err.message} Ajuste os valores ou sincronize com os dados mais recentes.`
          : 'Esta alteração entra em conflito com o estado atual. Atualize a página e tente de novo.'
      case 422:
        return err.message
          ? `Não foi possível salvar: ${err.message}`
          : 'Os dados não atendem às regras do sistema. Revise e tente de novo.'
      case 502:
        return 'Serviço temporariamente indisponível. Tente de novo em alguns minutos.'
      case 500:
        return 'Erro interno no servidor. Tente de novo mais tarde; se repetir, avise o suporte.'
      default:
        if (err.status >= 500) {
          return DEFAULT_UNKNOWN
        }
        return err.message || DEFAULT_UNKNOWN
    }
  }

  if (err instanceof Error && err.message) {
    return err.message
  }

  return DEFAULT_UNKNOWN
}
