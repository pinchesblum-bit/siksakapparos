/* Shared public-copy schema. No credentials, customer data, or payment settings. */
(function (root) {
  'use strict';
  const fields = [
  {
    "key": "title",
    "group": "Heading",
    "label": "Page title",
    "yi": "פנים מאירות סיקסא",
    "en": "Punim Meiros Siksa",
    "max": 120,
    "root": "root",
    "required": true
  },
  {
    "key": "subtitle",
    "group": "Heading",
    "label": "Page subtitle",
    "yi": "כפרות",
    "en": "Kaparos",
    "max": 120,
    "root": "root",
    "aliases": {
      "ערב יום כיפור כפרות": "Erev Yom Kippur Kaparos"
    },
    "required": true
  },
  {
    "key": "buttonText",
    "group": "Heading",
    "label": "Order button",
    "yi": "באשטעלט יעצט אייער כפרה",
    "en": "Order your kaparos now",
    "max": 160,
    "root": "root",
    "required": true
  },
  {
    "key": "introText",
    "group": "Heading",
    "label": "Introduction",
    "yi": "באשטעלט אייערע כפרות גרינג און זיכער. פילט אויס אייערע פרטים און באקומט אייער טיקעט דורך טעקסט און אימעיל.",
    "en": "Order your kaparos simply and securely. Complete your information below and receive your ticket by text and email.",
    "max": 1200,
    "aliases": {
      "באשטעלט אייער כפרות גרינג און באקוועם": "Order your kaparos easily and conveniently."
    }
  },
  {
    "key": "eventDay",
    "group": "Time and location",
    "label": "Day / date",
    "yi": "ערב יום כיפור",
    "en": "Erev Yom Kippur",
    "max": 200
  },
  {
    "key": "timeText",
    "group": "Time and location",
    "label": "Time",
    "yi": "פון 5:40 ביז 8:00",
    "en": "From 5:40 to 8:00",
    "max": 200
  },
  {
    "key": "venue",
    "group": "Time and location",
    "label": "Venue",
    "yi": "בחצר בית מדרשינו",
    "en": "In our synagogue courtyard",
    "max": 240
  },
  {
    "key": "addressLine1",
    "group": "Time and location",
    "label": "Street address",
    "yi": "76 Grove St.",
    "en": "76 Grove St.",
    "max": 240
  },
  {
    "key": "addressLine2",
    "group": "Time and location",
    "label": "City, state and ZIP",
    "yi": "Monsey, N.Y. 10952",
    "en": "Monsey, N.Y. 10952",
    "max": 240
  },
  {
    "key": "services",
    "group": "Time and location",
    "label": "Services",
    "yi": "מניני סליחות ושחרית ומקוה חמה",
    "en": "Selichos and Shacharis minyanim, and a heated mikvah",
    "max": 500
  },
  {
    "key": "benefitOrder",
    "group": "Highlights and icons",
    "label": "First ordering benefit",
    "yi": "א שנעלע באשטעלונג",
    "en": "Quick online order",
    "max": 120,
    "aliases": {
      "שוחט אויפן פלאץ": "Shoyched on site"
    }
  },
  {
    "key": "benefitPayment",
    "group": "Highlights and icons",
    "label": "Second ordering benefit",
    "yi": "זיכערע באצאלונג",
    "en": "Secure payment",
    "max": 120,
    "aliases": {
      "מניני סליחות ושחרית": "Selichos and Shacharis minyanim"
    }
  },
  {
    "key": "benefitTicket",
    "group": "Highlights and icons",
    "label": "Third ordering benefit",
    "yi": "טיקעט דורך טעקסט און אימעיל",
    "en": "Ticket by text and email",
    "max": 120,
    "aliases": {
      "מקוה חמה": "Heated mikvah"
    }
  },
  {
    "key": "benefitOrderIcon",
    "group": "Highlights and icons",
    "label": "First icon",
    "yi": "🐓",
    "en": "🐓",
    "max": 24,
    "type": "icon",
    "translate": false
  },
  {
    "key": "benefitPaymentIcon",
    "group": "Highlights and icons",
    "label": "Second icon",
    "yi": "🕍",
    "en": "🕍",
    "max": 24,
    "type": "icon",
    "translate": false
  },
  {
    "key": "benefitTicketIcon",
    "group": "Highlights and icons",
    "label": "Third icon",
    "yi": "💧",
    "en": "💧",
    "max": 24,
    "type": "icon",
    "translate": false
  },
  {
    "key": "contactLabel",
    "group": "Notices and ordering phone",
    "label": "Phone label",
    "yi": "רופט:",
    "en": "Call:",
    "max": 120,
    "aliases": {
      "צו באשטעלן אויפן טעלעפאן רופט:": "To order by phone, call:"
    }
  },
  {
    "key": "phoneNumber",
    "group": "Notices and ordering phone",
    "label": "Contact phone number",
    "yi": "845-372-3311",
    "en": "845-372-3311",
    "max": 50,
    "type": "tel"
  },
  {
    "key": "bookingNote",
    "group": "Notices and ordering phone",
    "label": "Advance-booking notice",
    "yi": "עס איז כדאי צו באשטעלן פאראויס, כדי צו זיין פארזיכערט מיט א כפרה.",
    "en": "Please order in advance to ensure a kaparah is available for you.",
    "max": 1200,
    "aliases": {
      "ווען איר באשטעלט א כפרה וועט דאס ווערן אוועקגעלייגט ביז 8:00": "When you order a kaparah, it will be set aside for you until 8:00."
    }
  },
  {
    "key": "prepaymentNote",
    "group": "Notices and ordering phone",
    "label": "Advance-payment notice",
    "yi": "א באשטעלטע כפרה מוז זיין באצאלט פון פארויס.",
    "en": "Preordered kaparos must be paid for in advance.",
    "max": 1200
  },
  {
    "key": "orderTitle",
    "group": "Order form",
    "label": "Order heading",
    "yi": "באשטעלט אייערע כפרות",
    "en": "Order your kaparos",
    "max": 200
  },
  {
    "key": "orderDescription",
    "group": "Order form",
    "label": "Order instructions",
    "yi": "פילט אויס אייערע פרטים און קוקט איבער די באשטעלונג פארן באצאלן.",
    "en": "Enter your information and review the order before payment.",
    "max": 1200
  },
  {
    "key": "infoHeading",
    "group": "Order form",
    "label": "Information heading",
    "yi": "אייערע פרטים",
    "en": "Your information",
    "max": 160,
    "required": true,
    "ui": "Your information"
  },
  {
    "key": "nameLabel",
    "group": "Order form",
    "label": "Name label",
    "yi": "פולער נאמען",
    "en": "Full name",
    "max": 120,
    "required": true,
    "ui": "Full name"
  },
  {
    "key": "phoneLabel",
    "group": "Order form",
    "label": "Phone label",
    "yi": "טעלעפאן נומער",
    "en": "Phone number",
    "max": 120,
    "required": true,
    "ui": "Phone number"
  },
  {
    "key": "emailLabel",
    "group": "Order form",
    "label": "Email label",
    "yi": "אימעיל",
    "en": "Email",
    "max": 120,
    "required": true,
    "ui": "Email"
  },
  {
    "key": "orderGroupHeading",
    "group": "Order form",
    "label": "Quantity section heading",
    "yi": "אייער באשטעלונג",
    "en": "Your order",
    "max": 160,
    "required": true,
    "ui": "Your order"
  },
  {
    "key": "quantityLabel",
    "group": "Order form",
    "label": "Quantity label",
    "yi": "וויפיל כפרות",
    "en": "Number of kaparos",
    "max": 160,
    "required": true,
    "ui": "Number of kaparos"
  },
  {
    "key": "paymentHeading",
    "group": "Order form",
    "label": "Payment heading",
    "yi": "באצאלונג",
    "en": "Payment",
    "max": 120,
    "required": true,
    "ui": "Payment"
  },
  {
    "key": "cardLabel",
    "group": "Order form",
    "label": "Card payment label",
    "yi": "קרעדיט קארד",
    "en": "Credit card",
    "max": 120,
    "required": true,
    "ui": "Credit card"
  },
  {
    "key": "backHomeLabel",
    "group": "Order form",
    "label": "Back-to-home link",
    "yi": "צוריק צום הויפט־בלאט →",
    "en": "← Back to home",
    "max": 160,
    "required": true,
    "ui": "← Back to home"
  },
  {
    "key": "confirmationText",
    "group": "Order summary",
    "label": "Customer confirmation text",
    "yi": "נאכן באצאלן, קענט איר אויסוועלן צו דרוקן דעם טיקעט, אדער אים באקומען דורך אימעיל אדער טעקסט.",
    "en": "After checkout, choose Print Ticket, Email Ticket, or Text Ticket.",
    "max": 1200,
    "root": "root"
  },
  {
    "key": "summaryHeading",
    "group": "Order summary",
    "label": "Summary heading",
    "yi": "איבערבליק פון דער באשטעלונג",
    "en": "Order summary",
    "max": 200,
    "required": true,
    "ui": "Order summary"
  },
  {
    "key": "quantitySummaryLabel",
    "group": "Order summary",
    "label": "Chickens label",
    "yi": "כפרות",
    "en": "Kaparos",
    "max": 120,
    "required": true,
    "ui": "Kaparos"
  },
  {
    "key": "totalLabel",
    "group": "Order summary",
    "label": "Total label",
    "yi": "סך הכל",
    "en": "Total",
    "max": 120,
    "required": true,
    "ui": "Total"
  },
  {
    "key": "checkoutLabel",
    "group": "Order summary",
    "label": "Continue button",
    "yi": "ווייטער צום באצאלן",
    "en": "Continue to payment",
    "max": 160,
    "required": true,
    "ui": "Continue to payment"
  },
  {
    "key": "secureNote",
    "group": "Order summary",
    "label": "Checkout note",
    "yi": "🔒 זיכערע באצאלונג",
    "en": "🔒 Secure checkout",
    "max": 240,
    "ui": "🔒 Secure checkout"
  },
  {
    "key": "ticketChoiceLabel",
    "group": "Ticket actions",
    "label": "Ticket instructions",
    "yi": "קלייבט אויס וויאזוי איר ווילט באקומען אייער טיקעט.",
    "en": "Choose how you would like to receive your ticket.",
    "max": 500,
    "required": true,
    "ui": "Choose how you would like to receive your ticket."
  },
  {
    "key": "printTicketLabel",
    "group": "Ticket actions",
    "label": "Print button",
    "yi": "דרוקט דעם טיקעט",
    "en": "Print Ticket",
    "max": 160,
    "required": true,
    "ui": "Print Ticket"
  },
  {
    "key": "emailTicketLabel",
    "group": "Ticket actions",
    "label": "Email button",
    "yi": "שיקט דעם טיקעט דורך אימעיל",
    "en": "Email Ticket",
    "max": 160,
    "required": true,
    "ui": "Email Ticket"
  },
  {
    "key": "textTicketLabel",
    "group": "Ticket actions",
    "label": "Text button",
    "yi": "שיקט דעם טיקעט דורך טעקסט",
    "en": "Text Ticket",
    "max": 160,
    "required": true,
    "ui": "Text Ticket"
  },
  {
    "key": "doneLabel",
    "group": "Ticket actions",
    "label": "Done button",
    "yi": "פארטיג",
    "en": "Done",
    "max": 120,
    "required": true,
    "ui": "Done"
  },
  {
    "key": "termsTitle",
    "group": "Buyer terms",
    "label": "Terms heading",
    "yi": "תנאים",
    "en": "Terms",
    "max": 200,
    "required": true
  },
  {
    "key": "termsText",
    "group": "Buyer terms",
    "label": "Terms the buyer must accept",
    "yi": "",
    "en": "",
    "max": 6000
  },
  {
    "key": "termsAcceptLabel",
    "group": "Buyer terms",
    "label": "Acceptance checkbox label",
    "yi": "איך האב געלייענט און איך בין מסכים צו די תנאים.",
    "en": "I have read and agree to the terms.",
    "max": 300,
    "required": true
  },
  {
    "key": "supportMessage",
    "group": "Support footer",
    "label": "Support message",
    "yi": "פאר הילף מיטן וועבזייטל, פארבינדט זיך מיט אונז:",
    "en": "For help with the website, contact us:",
    "max": 500
  },
  {
    "key": "supportPhone",
    "group": "Support footer",
    "label": "Support phone number",
    "yi": "",
    "en": "",
    "max": 50,
    "type": "tel"
  },
  {
    "key": "supportEmail",
    "group": "Support footer",
    "label": "Support email address",
    "yi": "",
    "en": "",
    "max": 200,
    "type": "email"
  }
];
  const own = (value, key) => value && Object.prototype.hasOwnProperty.call(value, key);
  const clean = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
  function source(settings = {}) {
    const result = {};
    for (const field of fields) {
      const value = field.root && own(settings, field.key) ? settings : settings.pageContent;
      result[field.key] = own(value, field.key) ? clean(value[field.key], field.max) : field.yi;
    }
    return result;
  }
  function knownEnglish(field, text) {
    if (field.translate === false || !text || !/[\u0590-\u05ff]/.test(text)) return text;
    if (text === field.yi) return field.en;
    if (own(field.aliases, text)) return field.aliases[text];
    return null;
  }
  function english(settings = {}) {
    const current = source(settings), saved = settings.englishContent || {};
    const values = {}, missing = [];
    for (const field of fields) {
      const key = field.key, text = current[key];
      const cached = saved.source?.[key] === text && typeof saved.values?.[key] === 'string'
        && (saved.values[key].trim() || !text) ? clean(saved.values[key], field.max * 4) : null;
      const translated = field.key === 'title' && text === field.yi && cached === 'Panim Meiros Siksa' ? field.en : cached === null ? knownEnglish(field, text) : cached;
      if (translated === null) missing.push(key); else values[key] = translated;
    }
    return { source: current, values, missing };
  }
  function publicCopy(settings = {}, keys = fields.map(field => field.key)) {
    const translated = english(settings), pageContent = {}, englishContent = {source: {}, values: {}};
    for (const key of keys) {
      if (!fields.some(field => field.key === key)) continue;
      pageContent[key] = translated.source[key];
      if (own(translated.values, key)) {
        englishContent.source[key] = translated.source[key];
        englishContent.values[key] = translated.values[key];
      }
    }
    return { pageContent, englishContent };
  }
  function phone(value) {
    const text = String(value || '').trim(), digits = text.replace(/\D/g, '');
    const national = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
    const label = national.length === 10 ? national.slice(0, 3) + '-' + national.slice(3, 6) + '-' + national.slice(6) : text;
    const href = digits.length >= 7 && digits.length <= 15 ? 'tel:' + (digits.length === 10 ? '+1' : digits.length === 11 && digits.startsWith('1') || text.startsWith('+') ? '+' : '') + digits : '';
    return {label, href};
  }
  function terms(settings = {}, language = 'yi') {
    const original = source(settings), translated = english(settings), keys = ['termsTitle', 'termsText', 'termsAcceptLabel'];
    const required = settings.termsEnabled === true;
    const available = Boolean(original.termsText) && (language !== 'en' || keys.every(key => own(translated.values, key)));
    const values = language === 'en' ? translated.values : original;
    return {required, available, title: values.termsTitle || '', text: values.termsText || '', label: values.termsAcceptLabel || ''};
  }
  async function termsRevision(settings = {}) {
    const yi = terms(settings, 'yi'), en = terms(settings, 'en');
    const value = JSON.stringify({required: yi.required, yi: [yi.title, yi.text, yi.label], en: en.available ? [en.title, en.text, en.label] : null});
    const digest = await root.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  }
  root.KapparosBuyingContent = Object.freeze({fields, source, english, publicCopy, phone, terms, termsRevision});
  if (typeof module !== 'undefined' && module.exports) module.exports = root.KapparosBuyingContent;
})(globalThis);
