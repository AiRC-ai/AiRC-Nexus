ALTER TABLE nexus.record_revisions ADD COLUMN natural_vector tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('english',coalesce(content->>'title','')),'A') ||
  setweight(to_tsvector('english',coalesce(content->>'problem','')),'A') ||
  setweight(to_tsvector('english',coalesce(content->>'resolution','')),'B')
) STORED;
CREATE INDEX revisions_natural_search_idx ON nexus.record_revisions USING gin(natural_vector);
