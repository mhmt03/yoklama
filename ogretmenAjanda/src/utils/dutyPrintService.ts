/**
 * Nöbetçi Öğretmen Ders Telafi & Görevlendirme Çizelgesi Yazdırma Servisi
 * Resmî MEB formatında, A4 boyutunda baskı ve PDF kaydetme çıktısı üretir.
 */

export interface DutyPrintSlot {
  lessonHour: number;
  className: string;
  lessonName: string;
  absentTeacherName: string;
  assignedTeachers: {
    teacherName: string;
    dutyPlace: string;
  }[];
}

export interface DutyPrintOptions {
  schoolName: string;
  dayName: string;
  dateStr?: string;
  slots: DutyPrintSlot[];
  directorName?: string;
}

export function generateDutyAssignmentHtml(options: DutyPrintOptions): string {
  const { schoolName, dayName, slots, dateStr, directorName } = options;
  const todayStr = dateStr || new Date().toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  const rowsHtml = slots.length === 0
    ? `<tr><td colspan="7" style="text-align: center; padding: 24px; color: #64748B;">Seçilen günde görevlendirme yapılacak ders bulunmamaktadır.</td></tr>`
    : slots.map((slot, index) => {
        const assignedNames = slot.assignedTeachers.length > 0
          ? slot.assignedTeachers.map(t => t.teacherName).join(', ')
          : '<span style="color:#DC2626; font-style:italic;">Görevli Seçilmedi</span>';

        const dutyPlaces = slot.assignedTeachers.length > 0
          ? slot.assignedTeachers.map(t => t.dutyPlace).filter(Boolean).join(', ')
          : '—';

        return `
          <tr>
            <td style="text-align: center; font-weight: bold; width: 60px;">${slot.lessonHour}. Ders</td>
            <td style="text-align: center; font-weight: 600; width: 80px;">${slot.className || '—'}</td>
            <td style="text-align: left; font-weight: 500;">${slot.lessonName || '—'}</td>
            <td style="text-align: left; color: #991B1B; font-weight: 600;">${slot.absentTeacherName}</td>
            <td style="text-align: left; font-weight: 700; color: #0F172A;">${assignedNames}</td>
            <td style="text-align: center; font-size: 11px;">${dutyPlaces}</td>
            <td style="text-align: center; width: 100px;"></td>
          </tr>
        `;
      }).join('');

  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Nöbetçi Öğretmen Görevlendirme Çizelgesi - ${todayStr}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 12mm 15mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      margin: 0;
      padding: 16px;
      color: #0F172A;
      background: #FFFFFF;
      font-size: 12px;
      line-height: 1.4;
    }
    .print-actions {
      margin-bottom: 20px;
      display: flex;
      justify-content: flex-end;
      gap: 10px;
    }
    .btn {
      padding: 8px 18px;
      font-size: 13px;
      font-weight: 700;
      border-radius: 6px;
      cursor: pointer;
      border: 1px solid #CBD5E1;
      background: #4F46E5;
      color: #FFFFFF;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .btn:hover {
      background: #4338CA;
    }
    .btn-secondary {
      background: #F1F5F9;
      color: #334155;
    }
    .btn-secondary:hover {
      background: #E2E8F0;
    }

    @media print {
      .print-actions {
        display: none !important;
      }
      body {
        padding: 0;
      }
    }

    .header-box {
      text-align: center;
      border-bottom: 2px solid #0F172A;
      padding-bottom: 10px;
      margin-bottom: 12px;
    }
    .header-box .tc {
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 1px;
    }
    .header-box .school {
      font-size: 15px;
      font-weight: 800;
      text-transform: uppercase;
      margin-top: 2px;
      letter-spacing: 0.5px;
    }
    .header-box .title {
      font-size: 14px;
      font-weight: 800;
      margin-top: 6px;
      color: #1E1B4B;
      text-transform: uppercase;
    }

    .meta-bar {
      display: flex;
      justify-content: space-between;
      margin-bottom: 12px;
      font-size: 12px;
      padding: 6px 8px;
      background: #F8FAFC;
      border: 1px solid #E2E8F0;
      border-radius: 4px;
    }
    .meta-item {
      font-weight: 600;
    }
    .meta-val {
      font-weight: 800;
      color: #1E293B;
    }

    table.schedule-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 16px;
    }
    table.schedule-table th,
    table.schedule-table td {
      border: 1px solid #334155;
      padding: 6px 8px;
      font-size: 11px;
    }
    table.schedule-table th {
      background-color: #F1F5F9;
      color: #0F172A;
      font-weight: 800;
      text-align: center;
      text-transform: uppercase;
      font-size: 10.5px;
    }

    .footer-note {
      font-size: 11px;
      color: #475569;
      font-style: italic;
      margin-top: 8px;
      line-height: 1.5;
    }

    .sign-section {
      margin-top: 36px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      page-break-inside: avoid;
    }
    .sign-box {
      text-align: center;
      width: 220px;
    }
    .sign-title {
      font-weight: 700;
      font-size: 12px;
      color: #0F172A;
    }
    .sign-name {
      margin-top: 4px;
      font-weight: 600;
      font-size: 11px;
    }
    .sign-line {
      margin-top: 40px;
      border-top: 1px dashed #64748B;
      font-size: 10px;
      color: #64748B;
      padding-top: 4px;
    }
  </style>
</head>
<body>
  <div class="print-actions">
    <button class="btn btn-secondary" onclick="window.close()">✕ Kapat</button>
    <button class="btn" onclick="window.print()">🖨️ Yazdır / PDF Olarak Kaydet</button>
  </div>

  <div class="header-box">
    <div class="tc">T.C.</div>
    <div class="school">${schoolName || 'MİLLÎ EĞİTİM BAKANLIĞI'}</div>
    <div class="title">GÜNLÜK NÖBETÇİ ÖĞRETMEN DERS TELAFİ VE GÖREVLENDİRME ÇİZELGESİ</div>
  </div>

  <div class="meta-bar">
    <div class="meta-item">Tarih: <span class="meta-val">${todayStr}</span></div>
    <div class="meta-item">Gün: <span class="meta-val">${dayName}</span></div>
    <div class="meta-item">Toplam Görevlendirilen Ders: <span class="meta-val">${slots.length} Saat</span></div>
  </div>

  <table class="schedule-table">
    <thead>
      <tr>
        <th>Saat</th>
        <th>Şube</th>
        <th>Ders Adı</th>
        <th>Gelmeyen / İzinli Öğretmen</th>
        <th>Görevlendirilen Nöbetçi Öğretmen</th>
        <th>Nöbet Yeri</th>
        <th>İmza</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>

  <div class="footer-note">
    * Yukarıda adı geçen nöbetçi öğretmenler, ilgili ders saatinde boşta olmaları sebebiyle ilgili sınıflarda dersin telafisini ve sınıf düzenini sağlamak üzere okul idaresi tarafından görevlendirilmiştir.
  </div>

  <div class="sign-section">
    <div class="sign-box">
      <div class="sign-title">Nöbetçi Müdür Yardımcısı</div>
      <div class="sign-name">İmza</div>
      <div class="sign-line">... / ... / 2026</div>
    </div>

    <div class="sign-box">
      <div class="sign-title">UYGUNDUR</div>
      <div class="sign-name">${directorName || 'Okul Müdürü'}</div>
      <div class="sign-line">Mühür / İmza</div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Web ve genel ortamda yazdırma tetikleyicisi
 */
export function printDutyAssignments(options: DutyPrintOptions): boolean {
  try {
    const html = generateDutyAssignmentHtml(options);

    if (typeof window !== 'undefined' && window.open) {
      const printWin = window.open('', '_blank', 'width=960,height=800,menubar=no,toolbar=no,location=no,status=no');
      if (printWin) {
        printWin.document.open();
        printWin.document.write(html);
        printWin.document.close();
        printWin.focus();
        setTimeout(() => {
          try {
            printWin.print();
          } catch (e) {
            console.warn('Otomatik print çağrısı engellendi, kullanıcı butona basabilir.', e);
          }
        }, 500);
        return true;
      }
    }

    // Fallback: If window.open is blocked or not available, use hidden iframe
    if (typeof document !== 'undefined') {
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      document.body.appendChild(iframe);

      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (doc) {
        doc.open();
        doc.write(html);
        doc.close();
        iframe.contentWindow?.focus();
        setTimeout(() => {
          iframe.contentWindow?.print();
          setTimeout(() => {
            document.body.removeChild(iframe);
          }, 2000);
        }, 500);
        return true;
      }
    }

    return false;
  } catch (error) {
    console.error('Yazdırma işlemi başlatılırken hata oluştu:', error);
    return false;
  }
}
