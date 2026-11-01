using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using OfficeOpenXml;
using yoklamaWeb.Data;
using yoklamaWeb.Models;

namespace yoklamaWeb.Controllers
{
    [Authorize(Roles = "Admin,Idareci,SinavYoneticisi,SuperYoklamaci")]
    public class OptikModulController : Controller
    {
        private readonly AppDbContext _context;

        public OptikModulController(AppDbContext context)
        {
            _context = context;
        }

        // 1. OPTİK FORM TANIMLAMA & CRUD
        public async Task<IActionResult> FormTanimla()
        {
            var formlar = await _context.OptikFormlar.Include(f => f.Dersler).ToListAsync();
            return View(formlar);
        }

        [HttpPost]
        public async Task<IActionResult> FormKaydet(OptikForm model, string derslerJson)
        {
            if (ModelState.IsValid)
            {
                var dersler = JsonSerializer.Deserialize<List<OptikFormDers>>(derslerJson);
                model.Dersler = dersler;

                _context.OptikFormlar.Add(model);
                await _context.SaveChangesAsync();
                TempData["SuccessMessage"] = "Form başarıyla kaydedildi.";
                return RedirectToAction(nameof(FormTanimla));
            }
            return RedirectToAction(nameof(FormTanimla));
        }

        public async Task<IActionResult> FormDuzenle(int id)
        {
            var form = await _context.OptikFormlar.Include(f => f.Dersler).FirstOrDefaultAsync(f => f.Id == id);
            if (form == null) return NotFound();
            return View(form);
        }

        [HttpPost]
        public async Task<IActionResult> FormDuzenle(int id, OptikForm model, string derslerJson)
        {
            if (id != model.Id) return NotFound();

            var form = await _context.OptikFormlar.Include(f => f.Dersler).FirstOrDefaultAsync(f => f.Id == id);
            if (form == null) return NotFound();

            form.FormAdi = model.FormAdi;
            form.NumaraBaslangic = model.NumaraBaslangic;
            form.NumaraUzunluk = model.NumaraUzunluk;
            form.AdSoyadBaslangic = model.AdSoyadBaslangic;
            form.AdSoyadUzunluk = model.AdSoyadUzunluk;
            form.SinifBaslangic = model.SinifBaslangic;
            form.SinifUzunluk = model.SinifUzunluk;

            // Dersleri güncelle (eskileri sil, yenileri ekle)
            _context.OptikFormDersleri.RemoveRange(form.Dersler);
            
            if (!string.IsNullOrEmpty(derslerJson))
            {
                var dersler = JsonSerializer.Deserialize<List<OptikFormDers>>(derslerJson);
                form.Dersler = dersler;
            }

            await _context.SaveChangesAsync();
            TempData["SuccessMessage"] = "Form başarıyla güncellendi.";
            return RedirectToAction(nameof(FormTanimla));
        }

        [HttpPost]
        public async Task<IActionResult> FormSil(int id)
        {
            var form = await _context.OptikFormlar.FindAsync(id);
            if (form != null)
            {
                _context.OptikFormlar.Remove(form);
                await _context.SaveChangesAsync();
                TempData["SuccessMessage"] = "Form başarıyla silindi.";
            }
            return RedirectToAction(nameof(FormTanimla));
        }

        // 2. SINAV OLUŞTURMA & CRUD
        public async Task<IActionResult> SinavOlustur()
        {
            var sinavlar = await _context.OptikSinavlar.Include(s => s.Dersler).OrderByDescending(s => s.UygulamaTarihi).ToListAsync();
            ViewBag.Formlar = await _context.OptikFormlar.Include(f => f.Dersler).ToListAsync();
            return View(sinavlar);
        }

        [HttpGet]
        public async Task<IActionResult> GetSinifVeOgrenciler()
        {
            var ogrenciler = await _context.Ogrenciler
                .OrderBy(o => o.SinifDuzeyi)
                .ThenBy(o => o.Sube)
                .ThenBy(o => o.AdSoyad)
                .ToListAsync();

            var grouped = ogrenciler.GroupBy(o => o.SinifDuzeyi)
                .Select(g => new {
                    SinifDuzeyi = g.Key,
                    Subeler = g.GroupBy(s => s.Sube).Select(sg => new {
                        Sube = sg.Key,
                        Ogrenciler = sg.Select(ogr => new {
                            ogr.OgrenciNo,
                            ogr.AdSoyad
                        }).ToList()
                    }).ToList()
                }).ToList();

            return Json(grouped);
        }

        [HttpGet]
        public async Task<IActionResult> GetOgrencilerListesi()
        {
            var ogrenciler = await _context.Ogrenciler
                .Select(o => new { o.OgrenciNo, AdSoyad = o.AdSoyad, Sinif = o.SinifDuzeyi + o.Sube })
                .OrderBy(o => o.Sinif)
                .ThenBy(o => o.OgrenciNo)
                .ToListAsync();

            return Json(ogrenciler);
        }

        [HttpPost]
        public async Task<IActionResult> SinavKaydet(OptikSinav model, string derslerJson, List<string> SeciliSiniflar, List<string> SeciliOgrenciler)
        {
            if (ModelState.IsValid)
            {
                var dersler = JsonSerializer.Deserialize<List<OptikSinavDers>>(derslerJson);
                model.Dersler = dersler;
                
                if (SeciliSiniflar != null && SeciliSiniflar.Any())
                    model.HedefSiniflar = string.Join(",", SeciliSiniflar);

                if (SeciliOgrenciler != null && SeciliOgrenciler.Any())
                    model.HedefOgrenciler = string.Join(",", SeciliOgrenciler);

                _context.OptikSinavlar.Add(model);
                await _context.SaveChangesAsync();
                TempData["SuccessMessage"] = "Sınav başarıyla oluşturuldu.";
                return RedirectToAction(nameof(SinavOlustur));
            }
            return RedirectToAction(nameof(SinavOlustur));
        }

        public async Task<IActionResult> SinavDuzenle(int id)
        {
            var sinav = await _context.OptikSinavlar.Include(s => s.Dersler).FirstOrDefaultAsync(s => s.Id == id);
            if (sinav == null) return NotFound();
            ViewBag.Formlar = await _context.OptikFormlar.Include(f => f.Dersler).ToListAsync();
            return View(sinav);
        }

        [HttpGet]
        public async Task<IActionResult> GetOptikFormDersleri(int formId)
        {
            var form = await _context.OptikFormlar.Include(f => f.Dersler).FirstOrDefaultAsync(f => f.Id == formId);
            if (form == null) return NotFound();

            return Json(form.Dersler.Select(d => new {
                dersAdi = d.DersAdi,
                soruSayisi = d.KarakterSayisi
            }));
        }

        [HttpPost]
        public async Task<IActionResult> SinavDuzenle(int id, OptikSinav model, string derslerJson, List<string> SeciliSiniflar, List<string> SeciliOgrenciler)
        {
            if (id != model.Id) return NotFound();

            var sinav = await _context.OptikSinavlar.Include(s => s.Dersler).FirstOrDefaultAsync(s => s.Id == id);
            if (sinav == null) return NotFound();

            sinav.SinavAdi = model.SinavAdi;
            sinav.UygulamaTarihi = model.UygulamaTarihi;
            sinav.YanlisDogruyuGotururSayisi = model.YanlisDogruyuGotururSayisi;

            sinav.HedefSiniflar = SeciliSiniflar != null && SeciliSiniflar.Any() ? string.Join(",", SeciliSiniflar) : null;
            sinav.HedefOgrenciler = SeciliOgrenciler != null && SeciliOgrenciler.Any() ? string.Join(",", SeciliOgrenciler) : null;

            _context.OptikSinavDersleri.RemoveRange(sinav.Dersler);
            
            if (!string.IsNullOrEmpty(derslerJson))
            {
                var dersler = JsonSerializer.Deserialize<List<OptikSinavDers>>(derslerJson);
                sinav.Dersler = dersler;
            }

            await _context.SaveChangesAsync();
            TempData["SuccessMessage"] = "Sınav başarıyla güncellendi.";
            return RedirectToAction(nameof(SinavOlustur));
        }

        [HttpPost]
        public async Task<IActionResult> SinavSil(int id)
        {
            var sinav = await _context.OptikSinavlar.FindAsync(id);
            if (sinav != null)
            {
                _context.OptikSinavlar.Remove(sinav);
                await _context.SaveChangesAsync();
                TempData["SuccessMessage"] = "Sınav başarıyla silindi.";
            }
            return RedirectToAction(nameof(SinavOlustur));
        }

        // GET: /OptikModul/CevapAnahtariExcel/5
        [HttpGet]
        public async Task<IActionResult> CevapAnahtariExcel(int id)
        {
            var sinav = await _context.OptikSinavlar
                .Include(s => s.Dersler)
                .FirstOrDefaultAsync(s => s.Id == id);

            if (sinav == null)
            {
                TempData["ErrorMessage"] = "Sınav bulunamadı.";
                return RedirectToAction(nameof(SinavOlustur));
            }

            if (sinav.Dersler == null || !sinav.Dersler.Any())
            {
                TempData["ErrorMessage"] = "Bu sınava ait ders ve cevap anahtarı bulunamadı.";
                return RedirectToAction(nameof(SinavOlustur));
            }

            ExcelPackage.LicenseContext = LicenseContext.NonCommercial;
            using var package = new ExcelPackage();

            bool hasB = sinav.Dersler.Any(d => !string.IsNullOrWhiteSpace(d.CevapAnahtariB));
            bool hasC = sinav.Dersler.Any(d => !string.IsNullOrWhiteSpace(d.CevapAnahtariC));
            bool hasD = sinav.Dersler.Any(d => !string.IsNullOrWhiteSpace(d.CevapAnahtariD));

            // SAYFA 1: Soru Soru Detaylı Cevap Anahtarı
            var wsDetay = package.Workbook.Worksheets.Add("Cevap Anahtarı (Soru Soru)");

            // Başlık ve Bilgi Alanı
            wsDetay.Cells[1, 1].Value = "SINAV CEVAP ANAHTARI";
            wsDetay.Cells[1, 1].Style.Font.Size = 15;
            wsDetay.Cells[1, 1].Style.Font.Bold = true;
            wsDetay.Cells[1, 1].Style.Font.Color.SetColor(System.Drawing.Color.FromArgb(44, 62, 80));

            wsDetay.Cells[2, 1].Value = "Sınav Adı:";
            wsDetay.Cells[2, 1].Style.Font.Bold = true;
            wsDetay.Cells[2, 2].Value = sinav.SinavAdi;

            wsDetay.Cells[3, 1].Value = "Tarih:";
            wsDetay.Cells[3, 1].Style.Font.Bold = true;
            wsDetay.Cells[3, 2].Value = sinav.UygulamaTarihi.ToString("dd.MM.yyyy");

            wsDetay.Cells[4, 1].Value = "Kural:";
            wsDetay.Cells[4, 1].Style.Font.Bold = true;
            wsDetay.Cells[4, 2].Value = sinav.YanlisDogruyuGotururSayisi > 0 
                ? $"{sinav.YanlisDogruyuGotururSayisi} Yanlış 1 Doğruyu Götürür" 
                : "Yanlış doğruyu götürmez";

            var headers = new List<string> { "Sıra", "Ders Adı", "Soru No", "A Kitapçığı" };
            if (hasB) headers.Add("B Kitapçığı");
            if (hasC) headers.Add("C Kitapçığı");
            if (hasD) headers.Add("D Kitapçığı");

            int headerRow = 6;
            for (int i = 0; i < headers.Count; i++)
            {
                var cell = wsDetay.Cells[headerRow, i + 1];
                cell.Value = headers[i];
                cell.Style.Font.Bold = true;
                cell.Style.Fill.PatternType = OfficeOpenXml.Style.ExcelFillStyle.Solid;
                cell.Style.Fill.BackgroundColor.SetColor(System.Drawing.Color.FromArgb(44, 62, 80));
                cell.Style.Font.Color.SetColor(System.Drawing.Color.White);
                cell.Style.HorizontalAlignment = OfficeOpenXml.Style.ExcelHorizontalAlignment.Center;
            }

            int currentRow = headerRow + 1;
            int siraNo = 1;

            foreach (var ders in sinav.Dersler)
            {
                string aKey = ders.CevapAnahtari ?? "";
                string bKey = ders.CevapAnahtariB ?? "";
                string cKey = ders.CevapAnahtariC ?? "";
                string dKey = ders.CevapAnahtariD ?? "";

                for (int q = 1; q <= ders.SoruSayisi; q++)
                {
                    wsDetay.Cells[currentRow, 1].Value = siraNo;
                    wsDetay.Cells[currentRow, 1].Style.HorizontalAlignment = OfficeOpenXml.Style.ExcelHorizontalAlignment.Center;

                    wsDetay.Cells[currentRow, 2].Value = ders.DersAdi;

                    wsDetay.Cells[currentRow, 3].Value = q;
                    wsDetay.Cells[currentRow, 3].Style.HorizontalAlignment = OfficeOpenXml.Style.ExcelHorizontalAlignment.Center;

                    int col = 4;
                    string aAns = q <= aKey.Length ? aKey[q - 1].ToString() : "";
                    wsDetay.Cells[currentRow, col].Value = aAns;
                    wsDetay.Cells[currentRow, col].Style.HorizontalAlignment = OfficeOpenXml.Style.ExcelHorizontalAlignment.Center;
                    wsDetay.Cells[currentRow, col].Style.Font.Bold = true;
                    col++;

                    if (hasB)
                    {
                        string bAns = q <= bKey.Length ? bKey[q - 1].ToString() : "";
                        wsDetay.Cells[currentRow, col].Value = bAns;
                        wsDetay.Cells[currentRow, col].Style.HorizontalAlignment = OfficeOpenXml.Style.ExcelHorizontalAlignment.Center;
                        wsDetay.Cells[currentRow, col].Style.Font.Bold = true;
                        col++;
                    }

                    if (hasC)
                    {
                        string cAns = q <= cKey.Length ? cKey[q - 1].ToString() : "";
                        wsDetay.Cells[currentRow, col].Value = cAns;
                        wsDetay.Cells[currentRow, col].Style.HorizontalAlignment = OfficeOpenXml.Style.ExcelHorizontalAlignment.Center;
                        wsDetay.Cells[currentRow, col].Style.Font.Bold = true;
                        col++;
                    }

                    if (hasD)
                    {
                        string dAns = q <= dKey.Length ? dKey[q - 1].ToString() : "";
                        wsDetay.Cells[currentRow, col].Value = dAns;
                        wsDetay.Cells[currentRow, col].Style.HorizontalAlignment = OfficeOpenXml.Style.ExcelHorizontalAlignment.Center;
                        wsDetay.Cells[currentRow, col].Style.Font.Bold = true;
                        col++;
                    }

                    if (siraNo % 2 == 0)
                    {
                        var rowRange = wsDetay.Cells[currentRow, 1, currentRow, headers.Count];
                        rowRange.Style.Fill.PatternType = OfficeOpenXml.Style.ExcelFillStyle.Solid;
                        rowRange.Style.Fill.BackgroundColor.SetColor(System.Drawing.Color.FromArgb(245, 247, 250));
                    }

                    siraNo++;
                    currentRow++;
                }
            }

            if (currentRow > headerRow + 1)
            {
                var tableRange = wsDetay.Cells[headerRow, 1, currentRow - 1, headers.Count];
                tableRange.Style.Border.Top.Style = OfficeOpenXml.Style.ExcelBorderStyle.Thin;
                tableRange.Style.Border.Bottom.Style = OfficeOpenXml.Style.ExcelBorderStyle.Thin;
                tableRange.Style.Border.Left.Style = OfficeOpenXml.Style.ExcelBorderStyle.Thin;
                tableRange.Style.Border.Right.Style = OfficeOpenXml.Style.ExcelBorderStyle.Thin;
                tableRange.AutoFilter = true;
            }

            wsDetay.Cells[wsDetay.Dimension.Address].AutoFitColumns();

            // SAYFA 2: Ders Özetleri ve Anahtar Dizilimleri
            var wsOzet = package.Workbook.Worksheets.Add("Ders Özetleri");
            var ozetHeaders = new List<string> { "Ders Adı", "Soru Sayısı", "A Kitapçığı Anahtarı" };
            if (hasB) ozetHeaders.Add("B Kitapçığı Anahtarı");
            if (hasC) ozetHeaders.Add("C Kitapçığı Anahtarı");
            if (hasD) ozetHeaders.Add("D Kitapçığı Anahtarı");

            for (int i = 0; i < ozetHeaders.Count; i++)
            {
                var cell = wsOzet.Cells[1, i + 1];
                cell.Value = ozetHeaders[i];
                cell.Style.Font.Bold = true;
                cell.Style.Fill.PatternType = OfficeOpenXml.Style.ExcelFillStyle.Solid;
                cell.Style.Fill.BackgroundColor.SetColor(System.Drawing.Color.FromArgb(44, 62, 80));
                cell.Style.Font.Color.SetColor(System.Drawing.Color.White);
                cell.Style.HorizontalAlignment = OfficeOpenXml.Style.ExcelHorizontalAlignment.Center;
            }

            int ozetRow = 2;
            foreach (var ders in sinav.Dersler)
            {
                wsOzet.Cells[ozetRow, 1].Value = ders.DersAdi;
                wsOzet.Cells[ozetRow, 2].Value = ders.SoruSayisi;
                wsOzet.Cells[ozetRow, 2].Style.HorizontalAlignment = OfficeOpenXml.Style.ExcelHorizontalAlignment.Center;

                int c = 3;
                wsOzet.Cells[ozetRow, c++].Value = ders.CevapAnahtari;
                if (hasB) wsOzet.Cells[ozetRow, c++].Value = ders.CevapAnahtariB;
                if (hasC) wsOzet.Cells[ozetRow, c++].Value = ders.CevapAnahtariC;
                if (hasD) wsOzet.Cells[ozetRow, c++].Value = ders.CevapAnahtariD;

                ozetRow++;
            }

            if (ozetRow > 2)
            {
                var ozetTable = wsOzet.Cells[1, 1, ozetRow - 1, ozetHeaders.Count];
                ozetTable.Style.Border.Top.Style = OfficeOpenXml.Style.ExcelBorderStyle.Thin;
                ozetTable.Style.Border.Bottom.Style = OfficeOpenXml.Style.ExcelBorderStyle.Thin;
                ozetTable.Style.Border.Left.Style = OfficeOpenXml.Style.ExcelBorderStyle.Thin;
                ozetTable.Style.Border.Right.Style = OfficeOpenXml.Style.ExcelBorderStyle.Thin;
                ozetTable.AutoFilter = true;
            }

            wsOzet.Cells[wsOzet.Dimension.Address].AutoFitColumns();

            var safeSinavAdi = string.Join("_", sinav.SinavAdi.Split(Path.GetInvalidFileNameChars())).Replace(" ", "_");
            var fileName = $"{safeSinavAdi}_Cevap_Anahtari_{sinav.UygulamaTarihi:yyyyMMdd}.xlsx";
            return File(package.GetAsByteArray(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", fileName);
        }

        // 3. SINAV DEĞERLENDİRME & DİNAMİK EŞLEŞTİRME
        public async Task<IActionResult> SinavDegerlendir()
        {
            ViewBag.Sinavlar = await _context.OptikSinavlar.OrderByDescending(s => s.UygulamaTarihi).ToListAsync();
            ViewBag.Formlar = await _context.OptikFormlar.ToListAsync();
            return View();
        }

        [HttpGet]
        public async Task<IActionResult> GetSinavVeFormDersleri(int sinavId, int formId)
        {
            var sinav = await _context.OptikSinavlar.Include(s => s.Dersler).FirstOrDefaultAsync(s => s.Id == sinavId);
            var form = await _context.OptikFormlar.Include(f => f.Dersler).FirstOrDefaultAsync(f => f.Id == formId);

            if (sinav == null || form == null) return NotFound();

            return Json(new {
                SinavDersleri = sinav.Dersler.Select(d => new { d.DersAdi, d.SoruSayisi }).ToList(),
                FormDersleri = form.Dersler.Select(d => new { d.Id, d.DersAdi, d.BaslangicSutun, d.KarakterSayisi }).ToList(),
                FormDetay = new {
                    form.Id,
                    form.FormAdi,
                    form.NumaraBaslangic,
                    form.NumaraUzunluk,
                    form.SinifBaslangic,
                    form.SinifUzunluk,
                    form.AdSoyadBaslangic,
                    form.AdSoyadUzunluk,
                    form.KitapcikTuruBaslangic,
                    form.KitapcikTuruUzunluk
                }
            });
        }

        public class DinamikFormKayitDto
        {
            public int FormId { get; set; }
            public int NumaraBaslangic { get; set; }
            public int NumaraUzunluk { get; set; }
            public int AdSoyadBaslangic { get; set; }
            public int AdSoyadUzunluk { get; set; }
            public int SinifBaslangic { get; set; }
            public int SinifUzunluk { get; set; }
            public int? KitapcikTuruBaslangic { get; set; }
            public int? KitapcikTuruUzunluk { get; set; }
            public List<DinamikDersDto>? Dersler { get; set; }
        }

        public class DinamikDersDto
        {
            public string DersAdi { get; set; } = null!;
            public int BaslangicSutun { get; set; }
            public int KarakterSayisi { get; set; }
        }

        [HttpPost]
        [IgnoreAntiforgeryToken]
        public async Task<IActionResult> KaydetDinamikFormParametreleri([FromBody] DinamikFormKayitDto dto)
        {
            if (dto == null) return Json(new { success = false, message = "Geçersiz veri gönderildi." });

            var form = await _context.OptikFormlar.Include(f => f.Dersler).FirstOrDefaultAsync(f => f.Id == dto.FormId);
            if (form == null) return Json(new { success = false, message = "Optik form bulunamadı." });

            form.NumaraBaslangic = dto.NumaraBaslangic;
            form.NumaraUzunluk = dto.NumaraUzunluk;
            form.AdSoyadBaslangic = dto.AdSoyadBaslangic;
            form.AdSoyadUzunluk = dto.AdSoyadUzunluk;
            form.SinifBaslangic = dto.SinifBaslangic;
            form.SinifUzunluk = dto.SinifUzunluk;
            form.KitapcikTuruBaslangic = dto.KitapcikTuruBaslangic;
            form.KitapcikTuruUzunluk = dto.KitapcikTuruUzunluk;

            int guncellenenDers = 0;
            if (dto.Dersler != null && dto.Dersler.Any())
            {
                foreach (var d in dto.Dersler)
                {
                    if (string.IsNullOrEmpty(d.DersAdi)) continue;
                    var existing = form.Dersler.FirstOrDefault(fd => fd.DersAdi.Equals(d.DersAdi, StringComparison.OrdinalIgnoreCase));
                    if (existing != null)
                    {
                        existing.BaslangicSutun = d.BaslangicSutun;
                        existing.KarakterSayisi = d.KarakterSayisi;
                        guncellenenDers++;
                    }
                    else
                    {
                        form.Dersler.Add(new OptikFormDers
                        {
                            OptikFormId = form.Id,
                            DersAdi = d.DersAdi,
                            BaslangicSutun = d.BaslangicSutun,
                            KarakterSayisi = d.KarakterSayisi
                        });
                        guncellenenDers++;
                    }
                }
            }

            _context.OptikFormlar.Update(form);
            await _context.SaveChangesAsync();

            return Json(new { 
                success = true, 
                message = $"'{form.FormAdi}' şablonu başarıyla güncellendi:\n• Öğrenci genel koordinatları (No, Ad, Sınıf, Kitapçık)\n• {guncellenenDers} adet dersin başlangıç sütunu ve soru sayısı şablona kaydedildi." 
            });
        }

        [HttpPost]
        [IgnoreAntiforgeryToken]
        public async Task<IActionResult> TxtOku(
            int sinavId, 
            int formId, 
            IFormFile txtFile, 
            string dersEslesmeleriJson, 
            bool sinifFiltresiUygula = false, 
            bool numarasizlariDahilEt = true,
            string? dinamikFormJson = null, 
            bool optikFormuGuncelle = false)
        {
            if (txtFile == null || txtFile.Length == 0)
                return Json(new { success = false, message = "Dosya seçilmedi." });

            var sinav = await _context.OptikSinavlar.Include(s => s.Dersler).FirstOrDefaultAsync(s => s.Id == sinavId);
            var form = await _context.OptikFormlar.Include(f => f.Dersler).FirstOrDefaultAsync(f => f.Id == formId);
            
            if (sinav == null || form == null)
                return Json(new { success = false, message = "Sınav veya form bulunamadı." });

            // Dinamik form parametreleri geldiyse form objesini güncelle
            if (!string.IsNullOrEmpty(dinamikFormJson))
            {
                try
                {
                    using var doc = JsonDocument.Parse(dinamikFormJson);
                    var root = doc.RootElement;
                    if (root.TryGetProperty("numaraBaslangic", out var nb)) form.NumaraBaslangic = nb.GetInt32();
                    if (root.TryGetProperty("numaraUzunluk", out var nu)) form.NumaraUzunluk = nu.GetInt32();
                    if (root.TryGetProperty("adSoyadBaslangic", out var ab)) form.AdSoyadBaslangic = ab.GetInt32();
                    if (root.TryGetProperty("adSoyadUzunluk", out var au)) form.AdSoyadUzunluk = au.GetInt32();
                    if (root.TryGetProperty("sinifBaslangic", out var sb)) form.SinifBaslangic = sb.GetInt32();
                    if (root.TryGetProperty("sinifUzunluk", out var su)) form.SinifUzunluk = su.GetInt32();
                    if (root.TryGetProperty("kitapcikTuruBaslangic", out var kb) && kb.ValueKind == JsonValueKind.Number) form.KitapcikTuruBaslangic = kb.GetInt32();
                    if (root.TryGetProperty("kitapcikTuruUzunluk", out var ku) && ku.ValueKind == JsonValueKind.Number) form.KitapcikTuruUzunluk = ku.GetInt32();

                    if (root.TryGetProperty("dersler", out var derslerArray) && derslerArray.ValueKind == JsonValueKind.Array)
                    {
                        foreach (var dElem in derslerArray.EnumerateArray())
                        {
                            var dersAdi = dElem.GetProperty("dersAdi").GetString();
                            var baslangic = dElem.GetProperty("baslangicSutun").GetInt32();
                            var karakter = dElem.GetProperty("karakterSayisi").GetInt32();

                            if (!string.IsNullOrEmpty(dersAdi))
                            {
                                var existingDers = form.Dersler.FirstOrDefault(fd => fd.DersAdi.Equals(dersAdi, StringComparison.OrdinalIgnoreCase));
                                if (existingDers != null)
                                {
                                    existingDers.BaslangicSutun = baslangic;
                                    existingDers.KarakterSayisi = karakter;
                                }
                            }
                        }
                    }

                    if (optikFormuGuncelle)
                    {
                        _context.OptikFormlar.Update(form);
                        await _context.SaveChangesAsync();
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine("Dinamik form ayrıştırma hatası: " + ex.Message);
                }
            }

            // Eşleştirmeler dict: Key = SinavDersi, Value = FormDersi
            var dersEslesmeleri = new Dictionary<string, string>();
            if (!string.IsNullOrEmpty(dersEslesmeleriJson))
            {
                dersEslesmeleri = JsonSerializer.Deserialize<Dictionary<string, string>>(dersEslesmeleriJson) ?? new Dictionary<string, string>();
            }

            var hedeflenenSiniflar = string.IsNullOrEmpty(sinav.HedefSiniflar) 
                ? new List<string>() 
                : sinav.HedefSiniflar.Split(',').Select(x => x.Trim()).ToList();
                
            var hedeflenenOgrenciler = string.IsNullOrEmpty(sinav.HedefOgrenciler) 
                ? new List<string>() 
                : sinav.HedefOgrenciler.Split(',').Select(x => x.Trim()).ToList();

            var cleanHedefSiniflar = hedeflenenSiniflar
                .Select(x => x.Replace(" ", "").Replace("-", "").Replace("/", "").ToUpper())
                .Where(x => !string.IsNullOrEmpty(x))
                .ToList();

            var sonuclar = new List<object>();

            using (var reader = new StreamReader(txtFile.OpenReadStream()))
            {
                string line;
                while ((line = await reader.ReadLineAsync()) != null)
                {
                    if (string.IsNullOrWhiteSpace(line)) continue;

                    try
                    {
                        string ogrenciNo = "";
                        if (line.Length >= form.NumaraBaslangic + form.NumaraUzunluk)
                            ogrenciNo = line.Substring(form.NumaraBaslangic, form.NumaraUzunluk).Trim();

                        string sinif = "";
                        if (line.Length >= form.SinifBaslangic + form.SinifUzunluk)
                            sinif = line.Substring(form.SinifBaslangic, form.SinifUzunluk).Trim();

                        string adSoyad = "";
                        if (line.Length >= form.AdSoyadBaslangic + form.AdSoyadUzunluk)
                            adSoyad = line.Substring(form.AdSoyadBaslangic, form.AdSoyadUzunluk).Trim();

                        string kitapcikTuru = "A"; // Varsayılan
                        if (form.KitapcikTuruBaslangic.HasValue && form.KitapcikTuruUzunluk.HasValue)
                        {
                            if (line.Length >= form.KitapcikTuruBaslangic.Value + form.KitapcikTuruUzunluk.Value)
                            {
                                string okunanKitapcik = line.Substring(form.KitapcikTuruBaslangic.Value, form.KitapcikTuruUzunluk.Value).Trim().ToUpper();
                                if (okunanKitapcik == "A" || okunanKitapcik == "B" || okunanKitapcik == "C" || okunanKitapcik == "D")
                                {
                                    kitapcikTuru = okunanKitapcik;
                                }
                            }
                        }

                        // DB'den öğrenciyi bul (Optik formda kodlanan numaraya göre)
                        string trimmedNo = ogrenciNo.TrimStart('0');
                        Ogrenci? ogrenci = null;
                        if (!string.IsNullOrEmpty(ogrenciNo))
                        {
                            ogrenci = await _context.Ogrenciler.FirstOrDefaultAsync(o => 
                                o.OgrenciNo == ogrenciNo || 
                                (!string.IsNullOrEmpty(trimmedNo) && o.OgrenciNo == trimmedNo));
                        }

                        string ogrenciDbDurum = ogrenci != null ? "Bulundu" : "Bulunamadı";
                        string ogrenciDbAd = ogrenci != null ? ogrenci.AdSoyad : (string.IsNullOrWhiteSpace(adSoyad) ? "Bilinmeyen Öğrenci" : adSoyad);
                        string gosterilecekSinif = ogrenci != null ? $"{ogrenci.SinifDuzeyi}{ogrenci.Sube}" : sinif;

                        // Sınıf / Numara Kısıtlaması Kontrolü
                        bool shouldEvaluate = true;
                        if (sinifFiltresiUygula)
                        {
                            bool kisitlamaVar = cleanHedefSiniflar.Any() || hedeflenenOgrenciler.Any();
                            if (kisitlamaVar)
                            {
                                if (ogrenci != null)
                                {
                                    // Öğrenci DB'de var: Formdaki sınıf kodlamasına değil, DB'deki gerçek sınıfına bak
                                    string cleanDbSinif = $"{ogrenci.SinifDuzeyi}{ogrenci.Sube}".Replace(" ", "").Replace("-", "").Replace("/", "").ToUpper();
                                    string cleanDbSinifSlash = $"{ogrenci.SinifDuzeyi}/{ogrenci.Sube}".Replace(" ", "").Replace("-", "").Replace("/", "").ToUpper();

                                    bool sinifEslesiyor = cleanHedefSiniflar.Contains(cleanDbSinif) || cleanHedefSiniflar.Contains(cleanDbSinifSlash);
                                    bool noEslesiyor = hedeflenenOgrenciler.Contains(ogrenci.OgrenciNo) || 
                                                      (!string.IsNullOrEmpty(trimmedNo) && hedeflenenOgrenciler.Contains(trimmedNo));

                                    shouldEvaluate = sinifEslesiyor || noEslesiyor;
                                }
                                else
                                {
                                    // Öğrenci numarası kodlanmamış veya DB'de bulunamamış
                                    // "Numarasız veya sistemde bulunamayanları da ekle" seçeneğine göre karar ver
                                    shouldEvaluate = numarasizlariDahilEt;
                                }
                            }
                        }

                        if (!shouldEvaluate) continue;

                        // Ders hesaplamaları
                        int toplamDogru = 0, toplamYanlis = 0, toplamBos = 0;
                        double toplamNet = 0;
                        var dersSonuclari = new List<object>();

                        foreach (var sinavDers in sinav.Dersler)
                        {
                            // Eşleştirilmiş form dersi adını bul
                            if (!dersEslesmeleri.TryGetValue(sinavDers.DersAdi, out var formDersAdi)) 
                                continue;

                            var formDers = form.Dersler.FirstOrDefault(d => d.DersAdi == formDersAdi);
                            if (formDers == null) continue;

                            string ogrenciCevaplari = "";
                            if (line.Length >= formDers.BaslangicSutun + formDers.KarakterSayisi)
                                ogrenciCevaplari = line.Substring(formDers.BaslangicSutun, formDers.KarakterSayisi);
                            else if (line.Length > formDers.BaslangicSutun)
                                ogrenciCevaplari = line.Substring(formDers.BaslangicSutun);
                            
                            ogrenciCevaplari = ogrenciCevaplari.PadRight(sinavDers.SoruSayisi, ' ');

                            int dDogru = 0, dYanlis = 0, dBos = 0;

                            string seciliAnahtar = sinavDers.CevapAnahtari;
                            if (kitapcikTuru == "B" && !string.IsNullOrEmpty(sinavDers.CevapAnahtariB)) seciliAnahtar = sinavDers.CevapAnahtariB;
                            if (kitapcikTuru == "C" && !string.IsNullOrEmpty(sinavDers.CevapAnahtariC)) seciliAnahtar = sinavDers.CevapAnahtariC;
                            if (kitapcikTuru == "D" && !string.IsNullOrEmpty(sinavDers.CevapAnahtariD)) seciliAnahtar = sinavDers.CevapAnahtariD;

                            if (string.IsNullOrEmpty(seciliAnahtar) || seciliAnahtar.Length < sinavDers.SoruSayisi)
                            {
                                // Anahtar yoksa veya eksikse bu dersi değerlendirme
                                continue;
                            }

                            for (int i = 0; i < sinavDers.SoruSayisi && i < seciliAnahtar.Length && i < ogrenciCevaplari.Length; i++)
                            {
                                char cvp = ogrenciCevaplari[i];
                                char anahtar = seciliAnahtar[i];

                                if (anahtar == 'X')
                                {
                                    // Soru iptal, dahil etme
                                    continue;
                                }
                                else if (anahtar == 'H')
                                {
                                    // Herkes için doğru
                                    dDogru++;
                                }
                                else if (cvp == ' ' || cvp == '*') 
                                {
                                    dBos++;
                                }
                                else if (cvp == anahtar) 
                                {
                                    dDogru++;
                                }
                                else 
                                {
                                    dYanlis++;
                                }
                            }

                            double dNet = dDogru;
                            if (sinav.YanlisDogruyuGotururSayisi > 0)
                            {
                                dNet = dDogru - (dYanlis / sinav.YanlisDogruyuGotururSayisi);
                            }

                            toplamDogru += dDogru;
                            toplamYanlis += dYanlis;
                            toplamBos += dBos;
                            toplamNet += dNet;

                            dersSonuclari.Add(new { 
                                DersAdi = sinavDers.DersAdi,
                                Kodlama = ogrenciCevaplari,
                                Dogru = dDogru,
                                Yanlis = dYanlis,
                                Bos = dBos,
                                Net = dNet
                            });
                        }

                        sonuclar.Add(new
                        {
                            OgrenciNo = ogrenciNo,
                            AdSoyad = ogrenciDbAd,
                            Sinif = gosterilecekSinif,
                            Durum = ogrenciDbDurum,
                            ToplamDogru = toplamDogru,
                            ToplamYanlis = toplamYanlis,
                            ToplamBos = toplamBos,
                            ToplamNet = Math.Round(toplamNet, 2),
                            KitapcikTuru = kitapcikTuru,
                            DersSonuclari = dersSonuclari,
                            OrijinalSatir = line
                        });

                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine("Satır Okuma Hatası: " + ex.Message);
                    }
                }
            }

            return Json(new { success = true, data = sonuclar, sinavDersleri = sinav.Dersler.Select(d => d.DersAdi).ToList() });
        }

        public class RecalculateRowDto
        {
            public int SinavId { get; set; }
            public string YeniOgrenciNo { get; set; }
            public string YeniKitapcikTuru { get; set; }
            public Dictionary<string, string> Kodlamalar { get; set; }
            public string OrijinalSatir { get; set; }
        }

        [HttpPost]
        [IgnoreAntiforgeryToken]
        public async Task<IActionResult> RecalculateRow([FromBody] RecalculateRowDto dto)
        {
            var sinav = await _context.OptikSinavlar.Include(s => s.Dersler).FirstOrDefaultAsync(s => s.Id == dto.SinavId);
            if (sinav == null) return Json(new { success = false, message = "Sınav bulunamadı." });

            string trimmedDtoNo = dto.YeniOgrenciNo?.TrimStart('0');
            var ogrenci = await _context.Ogrenciler.FirstOrDefaultAsync(o => o.OgrenciNo == dto.YeniOgrenciNo || (!string.IsNullOrEmpty(trimmedDtoNo) && o.OgrenciNo == trimmedDtoNo));
            string ogrenciDbDurum = ogrenci != null ? "Bulundu" : "Bulunamadı";
            string ogrenciDbAd = ogrenci != null ? ogrenci.AdSoyad : "Bilinmiyor";
            string sinif = ogrenci != null ? ogrenci.SinifDuzeyi + ogrenci.Sube : "-";
            string kitapcikTuru = dto.YeniKitapcikTuru ?? "A";

            int toplamDogru = 0, toplamYanlis = 0, toplamBos = 0;
            double toplamNet = 0;
            var dersSonuclari = new List<object>();

            foreach (var sinavDers in sinav.Dersler)
            {
                if (!dto.Kodlamalar.TryGetValue(sinavDers.DersAdi, out var ogrenciCevaplari))
                    continue; // Formda eşleştirilmemiş veya kodu silinmişse değerlendirme

                ogrenciCevaplari = ogrenciCevaplari.PadRight(sinavDers.SoruSayisi, ' ');
                int dDogru = 0, dYanlis = 0, dBos = 0;

                string seciliAnahtar = sinavDers.CevapAnahtari;
                if (kitapcikTuru == "B" && !string.IsNullOrEmpty(sinavDers.CevapAnahtariB)) seciliAnahtar = sinavDers.CevapAnahtariB;
                if (kitapcikTuru == "C" && !string.IsNullOrEmpty(sinavDers.CevapAnahtariC)) seciliAnahtar = sinavDers.CevapAnahtariC;
                if (kitapcikTuru == "D" && !string.IsNullOrEmpty(sinavDers.CevapAnahtariD)) seciliAnahtar = sinavDers.CevapAnahtariD;

                if (string.IsNullOrEmpty(seciliAnahtar) || seciliAnahtar.Length < sinavDers.SoruSayisi)
                    continue;

                for (int i = 0; i < sinavDers.SoruSayisi && i < seciliAnahtar.Length && i < ogrenciCevaplari.Length; i++)
                {
                    char cvp = ogrenciCevaplari[i];
                    char anahtar = seciliAnahtar[i];

                    if (anahtar == 'X') continue;
                    else if (anahtar == 'H') dDogru++;
                    else if (cvp == ' ' || cvp == '*') dBos++;
                    else if (cvp == anahtar) dDogru++;
                    else dYanlis++;
                }

                double dNet = dDogru;
                if (sinav.YanlisDogruyuGotururSayisi > 0)
                {
                    dNet = dDogru - ((double)dYanlis / sinav.YanlisDogruyuGotururSayisi);
                }

                toplamDogru += dDogru;
                toplamYanlis += dYanlis;
                toplamBos += dBos;
                toplamNet += dNet;

                dersSonuclari.Add(new { 
                    DersAdi = sinavDers.DersAdi,
                    Kodlama = ogrenciCevaplari,
                    Dogru = dDogru,
                    Yanlis = dYanlis,
                    Bos = dBos,
                    Net = dNet
                });
            }

            var result = new
            {
                OgrenciNo = dto.YeniOgrenciNo,
                AdSoyad = ogrenciDbAd,
                Sinif = sinif,
                Durum = ogrenciDbDurum,
                ToplamDogru = toplamDogru,
                ToplamYanlis = toplamYanlis,
                ToplamBos = toplamBos,
                ToplamNet = Math.Round(toplamNet, 2),
                KitapcikTuru = kitapcikTuru,
                DersSonuclari = dersSonuclari,
                OrijinalSatir = dto.OrijinalSatir // TODO: Eğer orijinal satırı güncellemek istersek yapabiliriz
            };

            return Json(new { success = true, data = result });
        }

        public class SonucKayitItemDto
        {
            public string? OgrenciNo { get; set; }
            public string? Durum { get; set; }
            public string? KitapcikTuru { get; set; }
            public int ToplamDogru { get; set; }
            public int ToplamYanlis { get; set; }
            public int ToplamBos { get; set; }
            public double ToplamNet { get; set; }
            public string? OrijinalSatir { get; set; }
            public List<SonucKayitDersDto>? DersSonuclari { get; set; }
        }

        public class SonucKayitDersDto
        {
            public string? DersAdi { get; set; }
            public int Dogru { get; set; }
            public int Yanlis { get; set; }
            public int Bos { get; set; }
            public double Net { get; set; }
        }

        [HttpPost]
        [IgnoreAntiforgeryToken]
        public async Task<IActionResult> SonuclariKaydet(int sinavId, string sonuclarJson)
        {
            try
            {
                if (string.IsNullOrEmpty(sonuclarJson))
                    return Json(new { success = false, message = "Kaydedilecek sonuç verisi bulunamadı." });

                var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
                var sonuclar = JsonSerializer.Deserialize<List<SonucKayitItemDto>>(sonuclarJson, options);

                if (sonuclar == null || !sonuclar.Any())
                    return Json(new { success = false, message = "Kaydedilecek geçerli sonuç bulunamadı." });

                var mevcutSonuclar = await _context.OptikSinavSonuclari
                    .Where(s => s.OptikSinavId == sinavId)
                    .ToListAsync();
                if (mevcutSonuclar.Any())
                {
                    _context.OptikSinavSonuclari.RemoveRange(mevcutSonuclar);
                    await _context.SaveChangesAsync();
                }

                foreach (var item in sonuclar)
                {
                    if (string.Equals(item.Durum, "Bulunamadı", StringComparison.OrdinalIgnoreCase))
                        continue;

                    if (string.IsNullOrEmpty(item.OgrenciNo))
                        continue;

                    // Öğrenci veritabanında var mı kontrol et, varsa gerçek numarasını kullan (Foreign Key güvencesi)
                    var exists = await _context.Ogrenciler.AnyAsync(o => o.OgrenciNo == item.OgrenciNo);
                    var finalOgrNo = item.OgrenciNo;
                    if (!exists)
                    {
                        var trimmed = item.OgrenciNo.TrimStart('0');
                        var realOgr = await _context.Ogrenciler.FirstOrDefaultAsync(o => o.OgrenciNo == trimmed);
                        if (realOgr != null)
                        {
                            finalOgrNo = realOgr.OgrenciNo;
                        }
                        else
                        {
                            continue; // Veritabanında öğrenci kaydı yoksa foreign key hatası almamak için atla
                        }
                    }

                    var sonuc = new OptikSinavSonuc
                    {
                        OptikSinavId = sinavId,
                        OgrenciNo = finalOgrNo,
                        KitapcikTuru = item.KitapcikTuru ?? "A",
                        ToplamDogru = item.ToplamDogru,
                        ToplamYanlis = item.ToplamYanlis,
                        ToplamBos = item.ToplamBos,
                        ToplamNet = item.ToplamNet,
                        OrijinalSatir = item.OrijinalSatir
                    };

                    if (item.DersSonuclari != null)
                    {
                        foreach (var d in item.DersSonuclari)
                        {
                            if (string.IsNullOrEmpty(d.DersAdi)) continue;
                            sonuc.DersSonuclari.Add(new OptikSinavSonucDers
                            {
                                DersAdi = d.DersAdi,
                                Dogru = d.Dogru,
                                Yanlis = d.Yanlis,
                                Bos = d.Bos,
                                Net = d.Net
                            });
                        }
                    }

                    _context.OptikSinavSonuclari.Add(sonuc);
                }

                await _context.SaveChangesAsync();
                return Json(new { success = true });
            }
            catch (Exception ex)
            {
                return Json(new { success = false, message = ex.Message });
            }
        }

        // 4. SINAV SONUÇLARI
        public async Task<IActionResult> SinavSonuclari(int? sinavId, string ogrenciNo)
        {
            ViewBag.Sinavlar = await _context.OptikSinavlar.OrderByDescending(s => s.UygulamaTarihi).ToListAsync();
            ViewBag.SeciliSinavId = sinavId;
            ViewBag.SeciliOgrenciNo = ogrenciNo;

            var query = _context.OptikSinavSonuclari
                .Include(s => s.Ogrenci)
                .Include(s => s.DersSonuclari)
                .Include(s => s.OptikSinav)
                .AsQueryable();

            if (sinavId.HasValue && sinavId > 0)
            {
                query = query.Where(s => s.OptikSinavId == sinavId.Value);
            }

            if (!string.IsNullOrEmpty(ogrenciNo))
            {
                query = query.Where(s => s.OgrenciNo == ogrenciNo);
            }

            var sonuclar = await query.OrderByDescending(s => s.ToplamNet).ToListAsync();
            return View(sonuclar);
        }
    }
}
