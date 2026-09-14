# Buying website wording and languages

The buying website stays on its existing GitHub Pages domain. Settings → Buying Website controls its page wording, time, location, phone number, notices, and closed-page copy. Sales Settings remains the source of selling price and inventory. Public access remains manual.

## Automatic English translation

The initial page copy includes English translations. New Yiddish wording is translated on Save by the dedicated `kapparos-buying-translate` Edge Function. Only changed, allowlisted public copy is sent to Google Cloud Translation Basic (Yiddish `yi` to English `en`, plain text). Cached translations are used only when their source exactly matches the saved wording. The visitor's language choice persists across both pages and refreshes.

One-time connection:

1. In the owner's Google Cloud project, enable **Cloud Translation API**, configure billing if required, and create an API key restricted to Cloud Translation API. Set a suitable daily translation quota in Google Cloud.
2. Add that key directly in Supabase → Project `tugsxxafeaqbqonrruqt` → Edge Functions → Secrets under the name **`KAPPAROS_TRANSLATE_API_KEY`**. Do not put it in either repository, website settings, or chat.
3. In Settings → Buying Website, click Edit and Save. Existing change confirmation applies once. Verify that English is up to date and review the saved English preview.

The translation endpoint validates the existing, unexpired admin session before making a provider request. It reads the session table but does not write state, change credentials, create orders, charge cards, or send messages. Gateway JWT verification is disabled because these are existing opaque admin session tokens; the endpoint implements explicit custom authentication. Configure provider quota as the durable spending limit; the endpoint's burst throttle is per running instance only.

If the provider is missing or unavailable, the Yiddish save still succeeds and Settings displays the translation error. The English choice is withheld wherever required copy lacks a current translation; stale English event details are never displayed. After reconnecting, Edit → Save retries missing translations. Built-in translations do not require a provider call.

## Shared code and deployment

`buying-content.js` is the shared schema used by both frontends and the two narrowly scoped Edge Functions. Keep its four copies identical:

- Admin root
- Buying repository root
- `supabase/functions/kapparos-public-config/buying-content.js`
- `supabase/functions/kapparos-buying-translate/buying-content.js`

Deploy `kapparos-public-config` with its unchanged `preview-access.ts` plus the shared schema, and deploy `kapparos-buying-translate` with its shared schema. Publish each frontend through its existing GitHub Pages workflow.

**No deployment of `kapparos-sync` is part of this change.** Its existing settings storage already preserves these extra fields. The separately blocked validation deployment remains outstanding.

Ticket/PDF/email templates and customer records are not translated by this feature. Demo payment notices stay visible in either language. This change does not change the current $20 selling price to the poster's $23.

## Regression checks

Place the two repositories in sibling directories named `siksakapparos` and `siksakapparos-order`. Run `npm install` followed by `npm test` in `siksakapparos/tests/buying-content`. Tests use local fixtures and mocked authentication/provider responses. They create no real charges, sales, messages, or database changes.

Provider documentation: https://docs.cloud.google.com/translate/docs/translate-text
Supported languages: https://docs.cloud.google.com/translate/docs/languages
Supabase secrets: https://supabase.com/docs/guides/functions/secrets
