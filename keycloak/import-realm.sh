#!/bin/sh
set -eu

template="/opt/keycloak/data/import/realm-template.json"
output="/tmp/realm-import.json"

escape() {
  printf '%s' "$1" | sed -e 's/[\/&|]/\\&/g'
}

# Identificador OAuth do recurso MCP (sem barra final) — alinha com apps/mcp env MCP_RESOURCE_URL.
MCP_RESOURCE_IDENTIFIER=$(printf '%s' "${MCP_PUBLIC_URL}" | sed 's/\/$//')

sed \
  -e "s|__KEYCLOAK_REALM__|$(escape "${KEYCLOAK_REALM}")|g" \
  -e "s|__KEYCLOAK_WEB_CLIENT_ID__|$(escape "${KEYCLOAK_WEB_CLIENT_ID}")|g" \
  -e "s|__KEYCLOAK_MCP_CLIENT_ID__|$(escape "${KEYCLOAK_MCP_CLIENT_ID}")|g" \
  -e "s|__KEYCLOAK_MCP_CLIENT_SECRET__|$(escape "${KEYCLOAK_MCP_CLIENT_SECRET}")|g" \
  -e "s|__KEYCLOAK_IDENTITY_ADMIN_CLIENT_ID__|$(escape "${KEYCLOAK_IDENTITY_ADMIN_CLIENT_ID}")|g" \
  -e "s|__KEYCLOAK_IDENTITY_ADMIN_CLIENT_SECRET__|$(escape "${KEYCLOAK_IDENTITY_ADMIN_CLIENT_SECRET}")|g" \
  -e "s|__APP_URL__|$(escape "${NEXT_PUBLIC_APP_URL}")|g" \
  -e "s|__MCP_PUBLIC_URL__|$(escape "${MCP_PUBLIC_URL}")|g" \
  -e "s|__MCP_RESOURCE_IDENTIFIER__|$(escape "${MCP_RESOURCE_IDENTIFIER}")|g" \
  "$template" > "$output"

echo "INFO: Template do realm preparado. O import só criará o realm se ele ainda não existir; realms existentes serão preservados." >&2
echo "INFO: ChatGPT (DCR): se o registo dinâmico falhar com Trusted Hosts, após o Keycloak estar acessível execute: npm run keycloak:patch-dcr (KEYCLOAK_BASE_URL, KEYCLOAK_REALM, KEYCLOAK_ADMIN, KEYCLOAK_ADMIN_PASSWORD)." >&2
echo "INFO: ChatGPT — client scope: anexe 'mcp-resource-audience' aos Default Client Scopes do realm se clients dinâmicos não herdarem o aud do MCP." >&2

/opt/keycloak/bin/kc.sh import --file "$output" --override false

# O import JSON não aplica de forma confiável clientRoles de realm-management ao service account.
# Garantimos permissões via Admin CLI após o servidor responder (mesmo após restarts).
bootstrap_identity_admin_roles() {
  admin_user="${KC_BOOTSTRAP_ADMIN_USERNAME:-admin}"
  admin_pass="${KC_BOOTSTRAP_ADMIN_PASSWORD:-admin}"
  realm="${KEYCLOAK_REALM:-financas-familiar}"
  client_id="${KEYCLOAK_IDENTITY_ADMIN_CLIENT_ID:-financas-identity-admin}"
  sa_user="service-account-${client_id}"

  i=0
  while [ "$i" -lt 90 ]; do
    if /opt/keycloak/bin/kcadm.sh config credentials \
      --server "http://localhost:8080" \
      --realm master \
      --user "$admin_user" \
      --password "$admin_pass" >/dev/null 2>&1; then
      break
    fi
    i=$((i + 1))
    sleep 2
  done

  if [ "$i" -ge 90 ]; then
    echo "WARN: timeout ao autenticar kcadm no realm master; não foi possível aplicar roles ao identity-admin." >&2
    return 0
  fi

  j=0
  last_err=""
  while [ "$j" -lt 8 ]; do
    last_err=$(/opt/keycloak/bin/kcadm.sh add-roles \
      -r "$realm" \
      --uusername "$sa_user" \
      --cclientid realm-management \
      --rolename manage-clients \
      --rolename view-clients \
      --rolename query-clients \
      --rolename view-realm 2>&1) || last_err_code=$?

    if [ "${last_err_code:-0}" -eq 0 ]; then
      echo "INFO: roles realm-management aplicadas ao service account ${sa_user} (realm ${realm})." >&2
      return 0
    fi

    case $last_err in
      *409* | *Conflict* | *already* | *Already*)
        echo "INFO: roles realm-management já presentes para ${sa_user} (realm ${realm})." >&2
        return 0
        ;;
    esac

    j=$((j + 1))
    last_err_code=0
    sleep 2
  done

  echo "WARN: kcadm add-roles não concluiu para ${sa_user} (realm ${realm}). Última saída: ${last_err}" >&2
  echo "WARN: Se a API retornar 403, no console Keycloak: Users → ${sa_user} → Role mapping → realm-management → manage-clients." >&2
}

/opt/keycloak/bin/kc.sh start-dev --http-port=8080 &
KC_PID=$!

trap 'kill -TERM "$KC_PID" 2>/dev/null; wait "$KC_PID" 2>/dev/null; exit 0' INT TERM

bootstrap_identity_admin_roles || true

wait "$KC_PID"
