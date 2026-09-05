# Auth e-mail templates

Supabase keeps these in the dashboard, not in a repo, so there is no history and
no way to tell that one has drifted from another. That is exactly what happened:
*Confirm signup* was designed in French and branded, *Reset Password* was left as
Supabase's English default, and the gap was invisible until someone actually
reset a password. Switching to a custom SMTP sender does not touch templates —
the mail came from `Monɔkɔ <noreply@mail.monoko.africa>` and still read
"Follow this link to reset the password for your user".

Keep the source of every template here and paste it into
**Authentication → Email Templates** when it changes.

| File | Supabase template | Status |
| --- | --- | --- |
| `reset_password.html` | Reset Password | written 2026-09-05 |
| — | Confirm signup | branded in the dashboard, **not yet exported here** |
| — | Magic Link, Invite, Change Email, Reauthentication | unused by the app |

**Export the Confirm signup template into this folder** next time you open it.
Until then the two can drift again and nothing in the repo will show it.

## Which templates the app actually sends

Only two. Anything else is dead configuration:

- **Confirm signup** — `supabaseClient.auth.signUp(...)` in `index.html`
- **Reset Password** — `resetPasswordForEmail` in `index.html`

The app does not use magic links, invitations, e-mail change (the address is
read-only in settings) or reauthentication.

## Writing rules

These are e-mails, not pages. The app's own CSS would collapse in most clients.

- **Table layout only.** No flexbox, no grid, no `position`.
- **Every style inline.** Gmail strips `<style>` in some contexts; Outlook
  renders through Word.
- **No web fonts.** Georgia for the wordmark, Helvetica/Arial for body — the
  nearest ubiquitous stand-ins for Playfair Display and DM Sans.
- **Buttons are table cells with a background colour**, wrapping an `<a>`.
  A real `<button>` does not render.
- **HTML-escape the ɔ** as `&#596;` — raw UTF-8 in a subject or body survives
  most clients but not all, and the brand name is the worst place to find out.
- Palette from `monoko-ui.css`: canvas `#f4f7f2`, surface `#fff`, ink `#202820`,
  muted `#667069`, line `#dfe6df`, forest `#163c32`, green `#2f7d54`.

## Verifying

Send one to a real address and read it on a phone. `{{ .ConfirmationURL }}`
appears twice on purpose — once on the button, once as copyable text — because
some clients strip or rewrite the button link.
