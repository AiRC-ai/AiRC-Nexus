#!/bin/bash
set -euo pipefail
umask 077
nexus_name=${1:?north or south}
nexus_origin=${2:?HTTPS origin}
nexus_bind=${3:?LAN bind address}
nexus_image=${4:?immutable application image tag}
nexus_ca_url=${NEXUS_CA_URL:?set the trusted CA URL}
[[ "$nexus_name" == north || "$nexus_name" == south ]]
[[ "$nexus_origin" =~ ^https://[a-z0-9.-]+:9443$ ]]
[[ "$nexus_bind" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]
[[ "$nexus_image" =~ ^airc-nexus-hosted:[a-f0-9]+$ ]]
[[ "$nexus_ca_url" =~ ^https://[a-z0-9.:-]+$ ]]
if [ "$nexus_name" = north ]; then nexus_label='Nexus North'; else nexus_label='Nexus South'; fi
nexus_state="$HOME/.local/share/airc-nexus/$nexus_name"
mkdir -p "$nexus_state"/{secrets,operator,identity,public,trust,tls,data}
chmod 700 "$nexus_state" "$nexus_state"/{secrets,operator,identity,public,trust,tls}
for nexus_role in postgres app worker federation; do
  if [ ! -e "$nexus_state/secrets/${nexus_role}_password" ]; then
    openssl rand -hex 24 > "$nexus_state/secrets/${nexus_role}_password"
    chmod 400 "$nexus_state/secrets/${nexus_role}_password"
  fi
done
for nexus_role in app worker federation; do
  nexus_pass=$(cat "$nexus_state/secrets/${nexus_role}_password")
  printf 'postgresql://nexus_%s:%s@database:5432/nexus' "$nexus_role" "$nexus_pass" > "$nexus_state/secrets/${nexus_role}_url"
  chmod 400 "$nexus_state/secrets/${nexus_role}_url"
done
cat > "$nexus_state/node.env" <<EOF
NEXUS_PROJECT=airc-nexus-$nexus_name
NEXUS_STATE_DIR=$nexus_state
NEXUS_IMAGE=$nexus_image
NEXUS_UID=$(id -u)
NEXUS_GID=$(id -g)
NEXUS_PUBLIC_ORIGIN=$nexus_origin
NEXUS_BIND_IP=$nexus_bind
NEXUS_CA_URL=$nexus_ca_url
NEXUS_NODE_LABEL='$nexus_label'
NEXUS_OPERATOR_NAME='$nexus_label operator'
EOF
chmod 600 "$nexus_state/node.env"
printf 'Prepared protected state for %s; credentials remain host-local.\n' "$nexus_name"
