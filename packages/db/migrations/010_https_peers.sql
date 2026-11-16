ALTER TABLE nexus.federation_peers DROP CONSTRAINT federation_peers_endpoint_check;
ALTER TABLE nexus.federation_peers ADD CONSTRAINT federation_peers_endpoint_check CHECK(
  length(endpoint)<=2048 AND (
    endpoint ~ '^http://127[.]0[.]0[.]1:[0-9]{4,5}/?$'
    OR endpoint ~ '^https://[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:[0-9]{1,5})?/?$'
  )
);
