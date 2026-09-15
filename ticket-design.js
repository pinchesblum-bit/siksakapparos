/* Shared ticket artwork: the settings preview and the delivered PDF use this renderer. */
(function (root) {
  'use strict';
const DEFAULT_TICKET_DELIVERY = {
      emailSubject: 'Your Kapparos Ticket — #{ticket_id}',
      emailSender: '{brand}',
      heading: '{title}',
      subheading: '{subtitle}',
      ticketNumberLabel: 'Ticket',
      emailMessage: 'Hello {name},\n\nThank you for choosing {brand}. Please present the barcode above or the attached PDF when picking up your kapparos.\n\nגמר חתימה טובה',
      footer: 'Please keep this ticket.',
      nameLabel: 'Name',
      phoneLabel: 'Phone',
      quantityLabel: 'Amount of כפרות',
      priceLabel: 'Price Paid',
      paymentLabel: 'Payment Method',
      emailShowSubtitle: true,
      emailShowDetails: true,
      emailShowPrice: true,
      emailShowBarcode: true,
      emailShowMessage: true,
      pdfShowSubtitle: true,
      pdfShowDetails: true,
      pdfShowPrice: false,
      pdfShowBarcode: true,
      pdfShowFooter: true,
      emailBackgroundColor: '#fcfaf5',
      emailCardColor: '#fffefb',
      emailAccentColor: '#203c36',
      emailTextColor: '#203c36',
      emailMutedColor: '#626b63',
      emailFontSize: 16,
      emailHeadingSize: 30,
      pdfBackgroundColor: '#fcfaf5',
      pdfAccentColor: '#a6854f',
      pdfTextColor: '#203c36',
      pdfMutedColor: '#626b63',
      pdfHeadingSize: 64,
      pdfValueSize: 43,
      smsMessage: '{title}\n{subtitle}\n\nHello {name},\n\nThank you for choosing {brand} for your kapparos.\n\nOrder details:\nName: {name}\nPhone: {phone}\nNumber of kapparos: {quantity}\nPayment method: {payment_method}\n\nPlease present this ticket number when picking up your kapparos:\n#{ticket_id}\n\nגמר חתימה טובה'
    };

  const safeTicketColor = (value, fallback) => /^#[0-9a-f]{6}$/i.test(value || '') ? value : fallback;
  const safeTicketSize = (value, fallback, min, max) => Number.isFinite(Number(value)) ? Math.min(max, Math.max(min, Number(value))) : fallback;

  // Code 128 Set C is widely supported by inexpensive 1D scanners and adds a
  // checksum. Ticket IDs remain the same six digits (or legacy ten digits).
  const CODE128_PATTERNS = [
    '212222','222122','222221','121223','121322','131222','122213','122312',
    '132212','221213','221312','231212','112232','122132','122231','113222',
    '123122','123221','223211','221132','221231','213212','223112','312131',
    '311222','321122','321221','312212','322112','322211','212123','212321',
    '232121','111323','131123','131321','112313','132113','132311','211313',
    '231113','231311','112133','112331','132131','113123','113321','133121',
    '313121','211331','231131','213113','213311','213131','311123','311321',
    '331121','312113','312311','332111','314111','221411','431111','111224',
    '111422','121124','121421','141122','141221','112214','112412','122114',
    '122411','142112','142211','241211','221114','413111','241112','134111',
    '111242','121142','121241','114212','124112','124211','411212','421112',
    '421211','212141','214121','412121','111143','111341','131141','114113',
    '114311','411113','411311','113141','114131','311141','411131','211412',
    '211214','211232','2331112'
  ];

  function barcodeData(value) {
    const ticketId = String(value || '').replace(/\D/g, '');
    if (!/^(?:\d{6}|\d{10})$/.test(ticketId)) throw new Error('The ticket number is not valid.');
    const codewords = [105];
    for (let index = 0; index < ticketId.length; index += 2) {
      codewords.push(Number(ticketId.slice(index, index + 2)));
    }
    let checksum = codewords[0];
    for (let index = 1; index < codewords.length; index += 1) checksum += codewords[index] * index;
    codewords.push(checksum % 103, 106);
    const units = codewords.flatMap(codeword => CODE128_PATTERNS[codeword].split('').map(Number));
    return { ticketId, codewords, units };
  }

  function barcodeSvg(value, options = {}) {
    const { ticketId, units } = barcodeData(value);
    const moduleWidth = Math.max(2, Math.round(Number(options.moduleWidth) || 3));
    const height = Math.max(48, Math.round(Number(options.height) || 72));
    const quietModules = 10;
    const totalWidth = (units.reduce((sum, unit) => sum + unit, 0) + quietModules * 2) * moduleWidth;
    let x = quietModules * moduleWidth;
    const bars = [];
    units.forEach((unit, index) => {
      const width = unit * moduleWidth;
      if (index % 2 === 0) bars.push(`<rect x="${x}" y="0" width="${width}" height="${height}"/>`);
      x += width;
    });
    return `<svg viewBox="0 0 ${totalWidth} ${height}" role="img" aria-label="Barcode for ticket ${ticketId}" preserveAspectRatio="xMidYMid meet"><rect width="100%" height="100%" fill="#fff"/><g fill="#17130f">${bars.join('')}</g></svg>`;
  }

  function drawBarcode(context, value, centerX, y, height, maximumWidth) {
    const { units } = barcodeData(value);
    const quietModules = 10;
    const totalModules = units.reduce((sum, unit) => sum + unit, 0) + quietModules * 2;
    const moduleWidth = Math.max(5, Math.floor(maximumWidth / totalModules));
    const totalWidth = totalModules * moduleWidth;
    let x = centerX - totalWidth / 2;
    context.fillStyle = '#ffffff';
    context.fillRect(x, y, totalWidth, height);
    x += quietModules * moduleWidth;
    context.fillStyle = '#17130f';
    units.forEach((unit, index) => {
      const width = unit * moduleWidth;
      if (index % 2 === 0) context.fillRect(x, y, width, height);
      x += width;
    });
  }

  function render(design, values) {
    design = { ...DEFAULT_TICKET_DELIVERY, ...(design || {}) };
    const ticketId = String(values.ticket_id || '').replace(/\D/g, '');
    if (!/^(?:\d{6}|\d{10})$/.test(ticketId)) throw new Error('The ticket number is not valid.');
    const fill = value => String(value ?? '').replace(/\{([a-z_]+)\}/g, (match, key) => Object.prototype.hasOwnProperty.call(values, key) ? String(values[key] ?? '') : match);
      const canvas = document.createElement('canvas');
      canvas.width = 1440;
      canvas.height = 1720;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('This device could not prepare the PDF.');

      const background = safeTicketColor(design.pdfBackgroundColor, '#fcfaf5');
      const accent = safeTicketColor(design.pdfAccentColor, '#a6854f');
      const textColor = safeTicketColor(design.pdfTextColor, '#203c36');
      const muted = safeTicketColor(design.pdfMutedColor, '#626b63');
      const headingSize = safeTicketSize(design.pdfHeadingSize, 64, 38, 86);
      const valueSize = safeTicketSize(design.pdfValueSize, 43, 26, 56);

      context.fillStyle = background;
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.strokeStyle = accent;
      context.lineWidth = 5;
      context.strokeRect(42, 42, canvas.width - 84, canvas.height - 84);
      context.textAlign = 'center';
      context.fillStyle = textColor;
      context.font = `900 ${headingSize}px Arial, sans-serif`;
      context.fillText(fill(design.heading), canvas.width / 2, 145, canvas.width - 180);

      let headerY = 215;
      if (design.pdfShowSubtitle && fill(design.subheading)) {
        context.fillStyle = accent;
        context.font = '800 46px Arial, sans-serif';
        context.fillText(fill(design.subheading), canvas.width / 2, headerY, canvas.width - 180);
        headerY += 75;
      }
      context.fillStyle = accent;
      context.font = '900 38px Arial, sans-serif';
      context.fillText(`${fill(design.ticketNumberLabel)} #${ticketId}`, canvas.width / 2, headerY, canvas.width - 180);
      const dividerY = headerY + 50;
      context.beginPath();
      context.moveTo(110, dividerY);
      context.lineTo(canvas.width - 110, dividerY);
      context.stroke();

      let contentBottom = dividerY;
      if (design.pdfShowDetails) {
        const details = [
          [design.nameLabel, values.name],
          [design.phoneLabel, values.phone],
          [design.quantityLabel, values.quantity],
          ...(design.pdfShowPrice ? [[design.priceLabel, values.price_paid]] : []),
          [design.paymentLabel, values.payment_method]
        ];
        const availableHeight = design.pdfShowBarcode ? 720 : 1080;
        const rowGap = Math.min(175, Math.max(125, availableHeight / Math.max(1, details.length)));
        const startY = dividerY + 85;
        details.forEach(([label, value], index) => {
          const y = startY + index * rowGap;
          context.fillStyle = muted;
          context.font = '800 28px Arial, sans-serif';
          context.fillText(fill(label), canvas.width / 2, y, canvas.width - 190);
          context.fillStyle = textColor;
          context.font = `700 ${valueSize}px Arial, sans-serif`;
          const cleanValue = String(value || '—');
          const fittedValue = cleanValue.length > 52 ? `${cleanValue.slice(0, 51)}…` : cleanValue;
          context.fillText(fittedValue, canvas.width / 2, y + Math.max(52, valueSize + 15), canvas.width - 190);
          contentBottom = y + Math.max(62, valueSize + 25);
        });
      }

      if (design.pdfShowBarcode) {
        const barcodeY = Math.min(1250, Math.max(contentBottom + 75, design.pdfShowDetails ? 1040 : 520));
        const barcodeHeight = Math.min(230, 1490 - barcodeY);
        drawBarcode(context, ticketId, canvas.width / 2, barcodeY, barcodeHeight, 1100);
        context.font = '700 34px monospace';
        context.fillStyle = textColor;
        context.fillText(ticketId.split('').join(' '), canvas.width / 2, barcodeY + barcodeHeight + 62);
      }

      if (design.pdfShowFooter && fill(design.footer)) {
        context.fillStyle = muted;
        context.font = '500 25px Arial, sans-serif';
        context.fillText(fill(design.footer), canvas.width / 2, 1590, canvas.width - 190);
      }


    return canvas;
  }
  async function toJpeg(design, values) {
    const canvas = render(design, values);
    const blob = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('The PDF could not be created.')), 'image/jpeg', .95));
    return { bytes:new Uint8Array(await blob.arrayBuffer()), width:canvas.width, height:canvas.height };
  }
  root.KapparosTicketDesign = Object.freeze({ render, toJpeg, barcodeSvg, barcodeData });
})(globalThis);
