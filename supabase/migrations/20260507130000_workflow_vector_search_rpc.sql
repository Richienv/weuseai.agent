-- Vector search RPC for workflow-discover Edge Function.
--
-- Spec: docs/plans/2026-05-07-workflow-library-foundation-spec.md
--
-- pgvector's <=> operator returns COSINE DISTANCE in [0, 2]. The
-- discovery contract speaks in COSINE SIMILARITY in [0, 1]. The
-- conversion is `confidence = 1 - distance / 2`, but only when the
-- vectors come from a normalized embedding model — text-embedding-3-small
-- IS normalized (unit L2 norm), so distance is in [0, 2] and the
-- subtraction-and-halve produces similarity in [0, 1].
--
-- We expose the RPC instead of inlining the SQL in the Edge Function
-- to:
--   1. Keep the embedding literal serialization on the Postgres side
--      (avoids a 1536-element comma string in the JSON body of every
--      .from('workflows').select() call from the function).
--   2. Allow plan reuse — Postgres caches the prepared statement.
--   3. Make the SQL reviewable in version control rather than buried
--      in a .ts file.

create or replace function workflow_vector_search(
  query_embedding vector(1536),
  agent_slug text,
  allowed_tiers text[],
  match_limit int default 3
)
returns table (
  workflow jsonb,
  confidence numeric
)
language sql stable
as $$
  select
    to_jsonb(w) as workflow,
    1 - (w.intent_embedding <=> query_embedding) / 2 as confidence
  from workflows w
  where
    w.agent_slugs @> array[agent_slug]
    and w.tier = any(allowed_tiers)
    and w.intent_embedding is not null
  order by w.intent_embedding <=> query_embedding
  limit match_limit;
$$;

comment on function workflow_vector_search is
  'Phase 2E-1 vector search RPC for workflow-discover. Returns top-K workflows for an agent_slug + tier filter, sorted by cosine similarity descending. Confidence range [0, 1] assuming unit-normalized embeddings (text-embedding-3-small is unit-norm by default).';

-- Grant: only service-role calls this. anon would bypass tier gates if
-- given execute, so we don't grant it.
revoke execute on function workflow_vector_search from public;
revoke execute on function workflow_vector_search from anon;
revoke execute on function workflow_vector_search from authenticated;
-- service_role implicitly has execute via its bypass; explicit GRANT not needed.
