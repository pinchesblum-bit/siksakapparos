/* Shared public-copy schema. No credentials, customer data, or payment settings. */
(function (root) {
  'use strict';
  const fields = [
  {
    "key": "title",
    "group": "Page wording",
    "label": "Page title",
    "yi": "פנים מאירות סיקסא",
    "en": "Panim Meiros Siksa",
    "max": 120,
    "root": "root"
  },
  {
    "key": "subtitle",
    "group": "Page wording",
    "label": "Page subtitle",
    "yi": "כפרות",
    "en": "Kaparos",
    "max": 120,
    "root": "root"
  },
  {
    "key": "buttonText",
    "group": "Page wording",
    "label": "Order button",
    "yi": "באשטעלט יעצט אייער כפרה",
    "en": "Order your kaparos now",
    "max": 160,
    "root": "root"
  },
  {
    "key": "introText",
    "group": "Page wording",
    "label": "Introduction",
    "yi": "באשטעלט אייערע כפרות גרינג און זיכער. פילט אויס אייערע פרטים און באקומט אייער טיקעט דורך טעקסט און אימעיל.",
    "en": "Order your kaparos simply and securely. Complete your information below and receive your ticket by text and email.",
    "max": 1200
  },
  {
    "key": "benefitOrder",
    "group": "Page wording",
    "label": "First ordering benefit",
    "yi": "א שנעלע באשטעלונג",
    "en": "Quick online order",
    "max": 120
  },
  {
    "key": "benefitPayment",
    "group": "Page wording",
    "label": "Second ordering benefit",
    "yi": "זיכערע באצאלונג",
    "en": "Secure payment",
    "max": 120
  },
  {
    "key": "benefitTicket",
    "group": "Page wording",
    "label": "Third ordering benefit",
    "yi": "טיקעט דורך טעקסט און אימעיל",
    "en": "Ticket by text and email",
    "max": 120
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
    "group": "Contact and notices",
    "label": "Services",
    "yi": "מניני סליחות ושחרית ומקוה חמה",
    "en": "Selichos and Shacharis minyanim, and a heated mikvah",
    "max": 500
  },
  {
    "key": "contactLabel",
    "group": "Contact and notices",
    "label": "Phone label",
    "yi": "רופט:",
    "en": "Call:",
    "max": 120
  },
  {
    "key": "phoneNumber",
    "group": "Contact and notices",
    "label": "Contact phone number",
    "yi": "845-372-3311",
    "en": "845-372-3311",
    "max": 50
  },
  {
    "key": "bookingNote",
    "group": "Contact and notices",
    "label": "Advance-booking notice",
    "yi": "עס איז כדאי צו באשטעלן פאראויס, כדי צו זיין פארזיכערט מיט א כפרה.",
    "en": "Please order in advance to ensure a kaparah is available for you.",
    "max": 1200
  },
  {
    "key": "prepaymentNote",
    "group": "Contact and notices",
    "label": "Advance-payment notice",
    "yi": "א באשטעלטע כפרה מוז זיין באצאלט פון פארויס.",
    "en": "Preordered kaparos must be paid for in advance.",
    "max": 1200
  },
  {
    "key": "orderTitle",
    "group": "Ordering page",
    "label": "Order heading",
    "yi": "באשטעלט אייערע כפרות",
    "en": "Order your kaparos",
    "max": 200
  },
  {
    "key": "orderDescription",
    "group": "Ordering page",
    "label": "Order instructions",
    "yi": "פילט אויס אייערע פרטים און קוקט איבער די באשטעלונג פארן באצאלן.",
    "en": "Enter your information and review the order before payment.",
    "max": 1200
  },
  {
    "key": "confirmationText",
    "group": "Ordering page",
    "label": "Customer confirmation text",
    "yi": "נאכן באצאלן, קענט איר אויסוועלן צו דרוקן דעם טיקעט, אדער אים באקומען דורך אימעיל אדער טעקסט.",
    "en": "After checkout, choose Print Ticket, Email Ticket, or Text Ticket.",
    "max": 1200,
    "root": "root"
  },
  {
    "key": "gateTitle",
    "group": "Closed-page notice",
    "label": "Closed-page heading",
    "yi": "די באשטעלונגען אויפן וועבזייטל וועלן זיך עפענען סעפטעמבער 13.",
    "en": "Online ordering will open September 13.",
    "max": 240
  },
  {
    "key": "gateDescription",
    "group": "Closed-page notice",
    "label": "Preview instructions",
    "yi": "שרייבט אריין אייער באניצער־נאמען און פאסווארט צו זען דעם וועבזייטל.",
    "en": "Enter your username and password to preview the website.",
    "max": 1200
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
    if (!text || !/[\u0590-\u05ff]/.test(text)) return text;
    if (text === field.yi) return field.en;
    if (field.key === 'subtitle' && text === 'ערב יום כיפור כפרות') return 'Erev Yom Kippur Kaparos';
    return null;
  }
  function english(settings = {}) {
    const current = source(settings), saved = settings.englishContent || {};
    const values = {}, missing = [];
    for (const field of fields) {
      const key = field.key, text = current[key];
      const cached = saved.source?.[key] === text && typeof saved.values?.[key] === 'string'
        && (saved.values[key].trim() || !text) ? clean(saved.values[key], field.max * 4) : null;
      const translated = cached === null ? knownEnglish(field, text) : cached;
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
  root.KapparosBuyingContent = Object.freeze({fields, source, english, publicCopy});
  if (typeof module !== 'undefined' && module.exports) module.exports = root.KapparosBuyingContent;
})(globalThis);
