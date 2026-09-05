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

## Pasting one in

The `.html` files are **pure template** — no instructions, no comments. Select
all, paste into the Supabase body field, and **click Save changes**; the editor
does not autosave, and an unsaved edit leaves the stock English template live
while the field on screen shows yours.

**Change the Subject too.** It is a separate field from the body and keeps its
English default otherwise:

| Template | Subject |
| --- | --- |
| Reset Password | `Réinitialisez votre mot de passe` |
| Confirm signup | `Confirmez votre compte Monɔkɔ` |

After saving, the editor's **preview** tab should show the branded design. If
preview looks right but the delivered mail does not, the message was sent before
the save — request another.

## Wording that must match across templates

Both e-mails carry the same brand block, so a change to any of these belongs in
every template at once — including the one still living only in the dashboard.

| Element | Value |
| --- | --- |
| Wordmark | `Mon&#596;k&#596;` |
| Subtitle | `Apprendre les langues africaines` |

The subtitle used to read *Dictionnaire multilingue africain*, which names one
of four parts: Monɔkɔ is structured courses, a professor-verified dictionary,
native-speaker audio and an AI chat. Leading with the verb keeps it a purpose
rather than a category, and it stays true as languages are added.

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
