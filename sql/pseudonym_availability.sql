-- Let the signup form tell a learner their pseudonym is taken.
--
-- `profiles` RLS is `auth.uid() = user_id`, so someone who is still signing up
-- cannot read anybody else's row. The availability check the form was making
-- therefore always came back "free", the account was created, and the
-- duplicate only failed later on the profile insert — where it was swallowed,
-- leaving the learner with no profile row, no pseudonym and no message.
--
-- A SECURITY DEFINER function answers the one question the form needs without
-- exposing the table. It returns a boolean and nothing else: whether a name is
-- taken is information any unique-username system necessarily reveals, and it
-- reveals it here at the only moment it is useful.
--
-- Apply after account_settings.sql. Idempotent.

begin;

create or replace function pseudonym_available(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(char_length(trim(p_name)), 0) >= 2
     and not exists (
       select 1 from profiles
       where lower(trim(public_pseudonym)) = lower(trim(p_name))
     );
$$;

-- Revoking from PUBLIC alone would not remove Supabase's default grant to the
-- anon role, and anon is exactly who needs this — but say so explicitly rather
-- than relying on a default that is easy to change.
revoke all on function pseudonym_available(text) from public;
grant execute on function pseudonym_available(text) to anon, authenticated;

commit;
