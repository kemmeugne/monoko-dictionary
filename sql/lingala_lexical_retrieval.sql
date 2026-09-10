-- High-confidence Lingala sentence retrieval for live translation.
-- Run once in the production Supabase SQL editor before deploying the API.

create extension if not exists fuzzystrmatch with schema extensions;
create extension if not exists unaccent with schema extensions;

create or replace function public.match_examples_lexical(
  p_query         text,
  match_count     int,
  p_language_id   bigint,
  min_similarity float
)
returns table (
  id               bigint,
  sentence_french  text,
  sentence_dialect text,
  similarity       float
)
language sql
stable
set search_path = public, extensions
as $$
  with normalized as (
    select
      e.id,
      e.sentence_french,
      e.sentence_dialect,
      left(regexp_replace(unaccent(lower(coalesce(e.sentence_dialect, ''))), '[^[:alnum:]]', '', 'g'), 255) as candidate,
      left(regexp_replace(unaccent(lower(coalesce(p_query, ''))), '[^[:alnum:]]', '', 'g'), 255) as query
    from public.examples e
    join public.senses s on s.id = e.sense_id
    join public.words w on w.id = s.word_id
    where w.language_id = p_language_id
      and e.sentence_dialect is not null
      and e.sentence_french is not null
  ), scored as (
    select
      normalized.*,
      1.0 - levenshtein(query, candidate)::float
        / greatest(length(query), length(candidate), 1) as score
    from normalized
    where query <> '' and candidate <> ''
  )
  select scored.id, scored.sentence_french, scored.sentence_dialect, scored.score
  from scored
  where scored.score >= min_similarity
  order by scored.score desc, scored.id
  limit greatest(match_count, 1);
$$;

revoke all on function public.match_examples_lexical(text, int, bigint, float) from public;
grant execute on function public.match_examples_lexical(text, int, bigint, float)
  to anon, authenticated, service_role;
