# Buying website editor

Open **Settings → Buying Website → Edit Website**. The separate editor has nine sections and 48 stored wording/icon fields. Venue is edited using two text boxes. Each section has its own Edit, Cancel, Save, and saved English preview. Saving one section preserves drafts in other sections. Refresh keeps the editor page selected.

The sections are Heading, Time and location, Highlights and icons, Notices and ordering phone, Order form, Order summary, Ticket actions, Buyer terms, and Support footer. The knife, prayer book, and mikvah icons use matching deep-green and gold SVGs in both the editor preview and the buying website. Select a suggested icon or paste another emoji; an empty icon stays hidden. Empty optional fields stay hidden. Selling price and inventory still come from Sales Settings.

The private-access page is fixed English and is not editable in this editor. Public opening remains manual. Demo-payment notices and editable ticket/PDF/email templates retain their existing behavior; this editor does not convert demo payments into real payments or rewrite ticket templates.

## Information layout

The introduction appears above the time/address box. Venue line 1 and line 2 appear at the bottom of that box, side by side on desktop and stacked on mobile. A single populated line is centered. The ordering phone follows the reservation notice. Mobile highlight icons share a fixed-width column at the right edge in Yiddish and the left edge in English.

Both Venue inputs save into the existing `pageContent.venue` value, separated by a newline, with the existing 240-character combined limit. Existing single-line Venue content stays in the first input. Translations preserve the two lines separately and reuse exact matching saved English. This requires no backend deployment or schema change.

## English translation

The current saved wording has English translations, including **Punim Meiros Siksa** and **Shoychet on site**. The admin's confirmed Yiddish label is **שוחט אויפן פלאץ**. Translations are matched to their exact source; stale English is not displayed after a wording change.

Future custom Yiddish text uses the dedicated `kapparos-buying-translate` function. The editor's **Check translation connection** action checks whether its server-side key is configured. A configured key still needs a successful translation request to verify provider access.

One-time connection:

1. Enable Cloud Translation API in the owner's Google Cloud project, configure billing if required, and create an API key restricted to Cloud Translation API. Set a suitable daily quota.
2. Add the key directly in Supabase project `tugsxxafeaqbqonrruqt` → Edge Functions → Secrets as **`KAPPAROS_TRANSLATE_API_KEY`**. Do not put the key in either repository, website fields, or chat.
3. Open the editor, check the connection, then Edit and Save a section with new Yiddish wording. Review that section's saved English wording.

When translation is unavailable, the Yiddish change still saves and the section reports English as pending. Built-in/current translations remain usable. English is withheld if visible page content lacks a current translation. Hidden support text or disabled terms do not unnecessarily remove the English option. Saving that section again retries its translation.

Only changed, allowlisted public copy is sent to Google Cloud Translation Basic (`yi` → `en`, plain text). The endpoint validates the existing unexpired admin session first. It does not write website state, change credentials, create sales, charge cards, or send messages. Provider quotas are the durable spending limit; the endpoint also has a per-instance burst throttle.

## Buyer terms

Enter the exact terms in **Buyer terms**, save them, and turn on **Require buyers to accept the terms**. The switch works before Edit. It opens the editor if no terms have been saved yet. The requirement is off until the owner supplies and enables their terms.

Buyers must check an initially unchecked acceptance box before continuing to payment. Changing the displayed language or the terms revision resets acceptance. Checkout verifies acceptance again on the server before creating a new order. It records the accepted text, heading, checkbox label, language, revision, and server timestamp with the sale. Existing order retries continue through the same atomic order RPC; this change does not duplicate sales or inventory deductions.

The revision identifies the saved Yiddish terms and their current English translation. Terms are validated against the server state read for the new order. Existing completed orders retain the terms accepted at that time. Terms do not appear in ticket/PDF/email templates unless separately requested.

## Support footer and phones

Add a support phone number and/or email address in **Support footer**. The help line appears at the bottom of both buying pages when a contact is supplied. Phone and email links use `tel:` and `mailto:`. US phone numbers display consistently in either language and stay on one line. The buyer's phone field accepts a leading US country code from mobile autofill and submits the validated ten-digit number.

## Files and deployment

`buying-content.js` is shared by both frontends and three functions; keep all five copies identical:

- Admin repository root
- Buying repository root
- `supabase/functions/kapparos-public-config/buying-content.js`
- `supabase/functions/kapparos-buying-translate/buying-content.js`
- `supabase/functions/kapparos-public-order/buying-content.js`

The frontend-only `buying-presentation.js` supplies the branded icon choices, icon defaults, and the visible Shoychet spelling correction without changing access or checkout code. Keep its two copies and the three SVG assets identical.

Deploy those three functions with their matching shared schema only when making an authorized backend change. The icon/spelling update is frontend-only and does not deploy any function. Both copies of `preview-access.ts` remain unchanged. Publish each frontend through its existing GitHub Pages workflow.

**Do not deploy `kapparos-sync` as part of this work.** Its separately blocked validation deployment remains outstanding. No database migration is needed; the existing atomic order RPC already preserves the terms-acceptance metadata in the sale JSON.

## Verification

Keep `siksakapparos` and `siksakapparos-order` in sibling directories. In `siksakapparos/tests/buying-content`, run `npm install`, then `npm test`. The tests use local fixtures and mocked authentication/provider/database responses. They cover section-save isolation, confirmations, before-Edit switches, English access, current/stale translations, phone links, terms enforcement, retry behavior, and unchanged pricing/inventory behavior. They create no real charges, sales, emails, or texts.

Provider documentation: https://docs.cloud.google.com/translate/docs/translate-text
Supabase secrets: https://supabase.com/docs/guides/functions/secrets
