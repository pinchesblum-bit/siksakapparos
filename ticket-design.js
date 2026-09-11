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
        const patterns = {
          0: 'nnwwn', 1: 'wnnnw', 2: 'nwnnw', 3: 'wwnnn', 4: 'nnwnw',
          5: 'wnwnn', 6: 'nwwnn', 7: 'nnnww', 8: 'wnnwn', 9: 'nwnwn'
        };
        const units = [1, 1, 1, 1];
        for (let index = 0; index < ticketId.length; index += 2) {
          const bars = patterns[ticketId[index]];
          const spaces = patterns[ticketId[index + 1]];
          for (let part = 0; part < 5; part += 1) {
            units.push(bars[part] === 'w' ? 3 : 1, spaces[part] === 'w' ? 3 : 1);
          }
        }
        units.push(3, 1, 1);
        const barcodeWidth = 1040;
        const unitWidth = barcodeWidth / units.reduce((sum, unit) => sum + unit, 0);
        let barcodeX = (canvas.width - barcodeWidth) / 2;
        const barcodeY = Math.min(1250, Math.max(contentBottom + 75, design.pdfShowDetails ? 1040 : 520));
        const barcodeHeight = Math.min(230, 1490 - barcodeY);
        context.fillStyle = textColor;
        units.forEach((unit, index) => {
          const width = unit * unitWidth;
          if (index % 2 === 0) context.fillRect(barcodeX, barcodeY, width, barcodeHeight);
          barcodeX += width;
        });
        context.font = '700 34px monospace';
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
  root.KapparosTicketDesign = Object.freeze({ render, toJpeg });
})(globalThis);
