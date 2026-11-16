#!/bin/sh
set -eu
nginx -t
nginx -g 'daemon off;' &
nexus_proxy_pid=$!
trap 'kill -TERM "$nexus_proxy_pid" 2>/dev/null || true; wait "$nexus_proxy_pid" || true' TERM INT EXIT
nexus_cert_hash=$(sha256sum /tls/node.crt)
while kill -0 "$nexus_proxy_pid" 2>/dev/null; do
  sleep 30 &
  wait $! || true
  nexus_next_hash=$(sha256sum /tls/node.crt)
  if [ "$nexus_cert_hash" != "$nexus_next_hash" ]; then
    nginx -t && kill -HUP "$nexus_proxy_pid"
    nexus_cert_hash=$nexus_next_hash
  fi
done
wait "$nexus_proxy_pid"
