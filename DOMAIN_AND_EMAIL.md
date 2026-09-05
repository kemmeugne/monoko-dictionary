# Domain, DNS and transactional mail

The cutover from `monoko-dictionary.vercel.app` to **monoko.africa**, done
2026-09-04, and the mail sender that followed it. Written down because most of
what went wrong here was invisible: wrong values that returned `200`, records
that looked right, and settings that silently overrode the app.

---

## What is live

| Host | Serves | Notes |
|---|---|---|
| `monoko.africa` | the app | apex, Production |
| `www.monoko.africa` | 308 → apex | permanent, so ranking consolidates |
| `monoko-app.vercel.app` | the app | Vercel alias, stays live |
| `monoko-dictionary.vercel.app` | the app | older alias, stays live |
| `monoko.ca` | nothing yet | owned, still parked at GoDaddy |

TLS is Let's Encrypt, issued by Vercel, renewing itself.

## The zone at GoDaddy

Registrar and DNS are both GoDaddy (`ns71/ns72.domaincontrol.com`).

| Type | Name | Value | Purpose |
|---|---|---|---|
| A | `@` | `216.198.79.1` | Vercel |
| CNAME | `www` | `monoko.africa.` | resolves to Vercel; www is a domain on the project |
| MX | `@` | 5 × Google (`aspmx.l.google.com` …) | Workspace mail |
| TXT | `@` | `v=spf1 include:dc-aa8e722993._spfm.monoko.africa ~all` | **root SPF** |
| TXT | `@` | `google-site-verification=…` | Search Console |
| TXT | `dc-aa8e722993._spfm` | `v=spf1 include:_spf.google.com ~all` | GoDaddy's managed SPF chain |
| TXT | `google._domainkey` | `v=DKIM1;k=rsa;p=…` | Workspace DKIM |
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:anthony@monoko.africa` | |
| TXT | `resend._domainkey.mail` | `p=MIGf…` (218 chars) | Resend DKIM |
| MX | `send.mail` | `feedback-smtp.us-east-1.amazonses.com` (10) | Resend bounces |
| TXT | `send.mail` | `v=spf1 include:amazonses.com ~all` | Resend SPF |

### Rules

**One SPF record on the root, ever.** A second is a PermError and breaks
authentication for everything on the domain, Google Workspace included. Resend's
SPF lives on `send.mail`, never on `@`. Adding a sender does not mean editing the
root record — that was a wrong assumption during setup and it is worth not
repeating.

**Multiple DKIM selectors are normal.** `google._domainkey` and
`resend._domainkey.mail` coexist by design.

**GoDaddy's Name field is relative.** Resend displays relative names already, so
paste them as-is; if a provider shows a full hostname, strip the domain or you
create `send.mail.monoko.africa.monoko.africa`, which never verifies and gives no
useful error.

**Ignore GoDaddy's "Connect Domain" / Airo / "Add Protection" prompts.** They
re-run GoDaddy's setup and can restore the WebsiteBuilder A record. Domain
Connect auto-configuration was declined for the same reason: some templates
rewrite the root SPF.

## Supabase auth URLs

**Authentication → URL Configuration**

```
Site URL:       https://monoko.africa
Redirect URLs:  https://monoko.africa/**
                https://www.monoko.africa/**
                https://monoko-app.vercel.app/**
                http://localhost:3000/**
```

**The scheme is not optional.** Set to a bare `monoko.africa`, Site URL produced
`redirect_to=monoko.africa` and every confirmation link died on
`{"error":"requested path is invalid"}`. The app's own `emailRedirectTo` was
being discarded and Site URL substituted — which is also why the wildcard
Redirect URLs matter: without them the fallback happens no matter what the client
sends.

## Transactional mail

Sender is **Resend**, from `noreply@mail.monoko.africa`, configured in Supabase
under **Project Settings → Authentication → SMTP Settings**:

```
Host      smtp.resend.com
Port      587
Username  resend            ← the literal word, not an e-mail address
Password  <Resend API key, re_…>
Sender    noreply@mail.monoko.africa
Name      Monɔkɔ
```

A subdomain sender keeps transactional reputation separate from `anthony@` and
`hello@`. The cost is that it starts with **no** sending reputation and warms up
over days — expect slightly worse deliverability at first, converging up.

`_dmarc` stays at `p=none` until the new sender has a week or two of clean
reports. Subdomains inherit the org policy (no `sp=` tag), so
`mail.monoko.africa` needs no DMARC record of its own.

**Raise the auth email rate limit** under Authentication → Rate Limits. It is
throttled hard for the shared Supabase sender and does *not* lift when custom
SMTP is enabled — it breaks on the first real signup burst otherwise.

## Failure modes worth recognising

**"It still shows the old site."** Almost always a stale resolver, not the
config. Check the authoritative server directly and compare:

```bash
dig @ns71.domaincontrol.com monoko.africa A     # the truth
dig @8.8.8.8 monoko.africa A                    # public resolvers
dig monoko.africa A                             # your resolver, with TTL countdown
curl -sI --resolve monoko.africa:443:216.198.79.1 https://monoko.africa/
```

The last one bypasses DNS entirely. `Server: Vercel` means the site is fine and
the resolver is behind; `Server: DPS/2.0.0` with scripts from `img1.wsimg.com` is
GoDaddy's Website Builder answering from a cached IP. TTL is 1 hour.

**A verification that never completes.** Check for the doubled suffix
(`…monoko.africa.monoko.africa`) and byte-compare the DKIM key — a truncated key
looks fine in a dashboard and fails silently.

**Deleting a user fails** with "Database error deleting user": see
`sql/user_delete_cascade.sql`. `profiles` and `user_progress` predate the
`on delete cascade` convention every later table follows.

## Adding monoko.ca

Same shape, as a redirect rather than a second site — the dictionary's SEO should
compound on one domain:

1. Vercel → project → **Domains** (a top-level tab, not under Settings) → add
   `monoko.ca` and `www.monoko.ca`, both **Redirect to Another Domain →
   monoko.africa**, permanent (308) rather than 307.
2. GoDaddy: replace the parked A record on `@` with Vercel's, same as the apex.
3. Leave `monoko.ca` mail records alone if any exist.

Do not batch it with a domain that serves the app — Vercel's Add Domains dialog
applies one destination to everything in the batch.
