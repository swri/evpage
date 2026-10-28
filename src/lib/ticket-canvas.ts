// Pure client-side canvas renderer for downloadable Registration Proof and E-Tickets.
// Generates high-DPI crisp PNG files without any external network requests.

import { formatEventDateTime, formatTicketCode } from './utils.ts';

export interface TicketCanvasOptions {
  type: 'proof' | 'ticket';
  eventTitle: string;
  organizerName?: string;
  location?: string;
  startsAt?: string;
  startsAtFormatted?: string;
  contactName: string;
  code: string;
  status?: string;
  statusLabel?: string;
  totalAmount?: number;
  createdAt?: string;
  qrDataUrl?: string; // Data URL of QR code (only code payload, no phone)
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines = 3
): number {
  const words = text.split(' ');
  let line = '';
  let linesCount = 0;
  let currentY = y;

  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' ';
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && n > 0) {
      linesCount++;
      if (linesCount >= maxLines) {
        ctx.fillText(line.trim() + '...', x, currentY);
        return currentY + lineHeight;
      }
      ctx.fillText(line, x, currentY);
      line = words[n] + ' ';
      currentY += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, currentY);
  return currentY + lineHeight;
}

export function drawTicketCanvas(options: TicketCanvasOptions): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;

  const width = 800;
  const height = options.type === 'ticket' ? 1160 : 1000;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const isConfirmed = options.type === 'ticket';

  // 1. Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  // Subtle outer border
  ctx.strokeStyle = isConfirmed ? '#10b981' : '#e5e7eb';
  ctx.lineWidth = 4;
  ctx.strokeRect(16, 16, width - 32, height - 32);

  // 2. Top Header Bar
  const headerBg = isConfirmed ? '#064e3b' : '#1e293b';
  ctx.fillStyle = headerBg;
  ctx.fillRect(16, 16, width - 32, 110);

  // Header Brand & Subtitle
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 26px system-ui, -apple-system, sans-serif';
  ctx.fillText('EvPage Platform', 44, 60);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '14px system-ui, -apple-system, sans-serif';
  ctx.fillText(
    options.organizerName ? `Penyelenggara: ${options.organizerName}` : 'Platform Manajemen Event Resmi',
    44,
    92
  );

  // Badge in header (Right)
  const badgeText = isConfirmed ? '✓ E-TIKET RESMI' : 'BUKTI PENDAFTARAN';
  ctx.font = 'bold 13px system-ui, -apple-system, sans-serif';
  const badgeWidth = ctx.measureText(badgeText).width + 24;
  const badgeX = width - 44 - badgeWidth;
  ctx.fillStyle = isConfirmed ? '#10b981' : '#f59e0b';
  ctx.beginPath();
  ctx.roundRect(badgeX, 48, badgeWidth, 32, 6);
  ctx.fill();
  ctx.fillStyle = isConfirmed ? '#ffffff' : '#000000';
  ctx.fillText(badgeText, badgeX + 12, 70);

  // 3. Event Title
  let curY = 165;
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 30px system-ui, -apple-system, sans-serif';
  curY = wrapText(ctx, options.eventTitle, 44, curY, width - 88, 38, 2);

  // 4. Status Banner
  curY += 10;
  const statusBg = isConfirmed ? '#ecfdf5' : '#fffbeb';
  const statusBorder = isConfirmed ? '#a7f3d0' : '#fde68a';
  const statusTextCol = isConfirmed ? '#047857' : '#b45309';

  ctx.fillStyle = statusBg;
  ctx.strokeStyle = statusBorder;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(44, curY, width - 88, 54, 8);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = statusTextCol;
  ctx.font = 'bold 15px system-ui, -apple-system, sans-serif';
  const statusLabel =
    options.statusLabel ||
    (isConfirmed
      ? 'STATUS: TERVERIFIKASI / VALID (Tunjukkan saat kehadiran)'
      : 'STATUS: MENUNGGU VERIFIKASI (Bukan tiket masuk)');
  ctx.fillText(statusLabel, 64, curY + 33);

  // 5. Registration Code Card
  curY += 76;
  ctx.fillStyle = '#f8fafc';
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(44, curY, width - 88, 96, 10);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#64748b';
  ctx.font = 'bold 12px system-ui, -apple-system, sans-serif';
  ctx.fillText('KODE PENDAFTARAN UNIK', 64, curY + 30);

  const cleanCode = formatTicketCode(options.code);
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 34px ui-monospace, Menlo, Consolas, monospace';
  ctx.fillText(cleanCode, 64, curY + 74);

  // 6. Two-Column Information Details
  curY += 126;
  const col1X = 44;
  const col2X = width / 2 + 10;
  const colWidth = width / 2 - 54;

  const drawField = (label: string, value: string, x: number, y: number): number => {
    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 12px system-ui, -apple-system, sans-serif';
    ctx.fillText(label.toUpperCase(), x, y);

    ctx.fillStyle = '#0f172a';
    ctx.font = '500 16px system-ui, -apple-system, sans-serif';
    return wrapText(ctx, value || '-', x, y + 24, colWidth, 22, 2);
  };

  // Row 1: Nama Peserta & Penyelenggara
  drawField('Nama Pendaftar', options.contactName, col1X, curY);
  drawField('Penyelenggara', options.organizerName || 'Panitia Resmi', col2X, curY);

  // Row 2: Waktu Bermain & Total Biaya
  curY += 70;
  drawField(
    'Waktu Bermain',
    options.startsAtFormatted || formatEventDateTime(options.startsAt),
    col1X,
    curY
  );
  const amountStr =
    options.totalAmount !== undefined
      ? options.totalAmount === 0
        ? 'Gratis'
        : `Rp ${options.totalAmount.toLocaleString('id-ID')}`
      : '-';
  drawField('Total Biaya', amountStr, col2X, curY);

  // Row 3: Lokasi Pertandingan (Full Width)
  curY += 70;
  ctx.fillStyle = '#64748b';
  ctx.font = 'bold 12px system-ui, -apple-system, sans-serif';
  ctx.fillText('LOKASI PERTANDINGAN', col1X, curY);
  ctx.fillStyle = '#0f172a';
  ctx.font = '500 15px system-ui, -apple-system, sans-serif';
  curY = wrapText(ctx, options.location || '-', col1X, curY + 24, width - 88, 22, 2);

  // 7. QR Code Section (Only for confirmed e-tickets)
  if (isConfirmed && options.qrDataUrl) {
    curY += 20;
    // Draw divider line
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(44, curY);
    ctx.lineTo(width - 44, curY);
    ctx.stroke();
    ctx.setLineDash([]);

    curY += 24;
    // We will draw the QR code image asynchronously in download function or below
  }

  // 8. Footer Notes
  const footerY = height - 50;
  ctx.fillStyle = '#94a3b8';
  ctx.font = '11px system-ui, -apple-system, sans-serif';
  ctx.fillText('Dokumen elektronik ini sah dan diakui oleh sistem EvPage.', 44, footerY);
  const dateStr = new Date().toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Jakarta',
  });
  const printText = `Diunduh pada ${dateStr} WIB`;
  const printWidth = ctx.measureText(printText).width;
  ctx.fillText(printText, width - 44 - printWidth, footerY);

  return canvas;
}

/**
 * Generates and downloads the PNG ticket/proof.
 */
export async function downloadTicketImage(options: TicketCanvasOptions): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  try {
    const canvas = drawTicketCanvas(options);
    if (!canvas) return false;
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;

    // If QR code data URL is provided for confirmed tickets, load and draw it
    if (options.type === 'ticket' && options.qrDataUrl) {
      await new Promise<void>((resolve) => {
        const img = new Image();
        img.onload = () => {
          // Center the QR Code
          const qrSize = 160;
          const qrX = (canvas.width - qrSize) / 2;
          const qrY = canvas.height - 230;

          // Draw white card background for QR
          ctx.fillStyle = '#ffffff';
          ctx.strokeStyle = '#cbd5e1';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.roundRect(qrX - 12, qrY - 12, qrSize + 24, qrSize + 24, 8);
          ctx.fill();
          ctx.stroke();

          ctx.drawImage(img, qrX, qrY, qrSize, qrSize);

          ctx.fillStyle = '#64748b';
          ctx.font = '11px system-ui, -apple-system, sans-serif';
          const scanText = 'Scan QR di atas untuk verifikasi kehadiran panitia';
          const scanWidth = ctx.measureText(scanText).width;
          ctx.fillText(scanText, (canvas.width - scanWidth) / 2, qrY + qrSize + 24);

          resolve();
        };
        img.onerror = () => resolve();
        img.src = options.qrDataUrl!;
      });
    }

    const cleanCode = formatTicketCode(options.code);
    const filename = options.type === 'ticket' ? `tiket-${cleanCode}.png` : `bukti-pendaftaran-${cleanCode}.png`;

    return new Promise<boolean>((resolve) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          resolve(false);
          return;
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        resolve(true);
      }, 'image/png');
    });
  } catch (err) {
    console.error('Failed to download ticket PNG:', err);
    return false;
  }
}
