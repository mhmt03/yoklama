using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OfficeOpenXml;
using yoklamaWeb.Data;
using yoklamaWeb.Models;

namespace yoklamaWeb.Controllers
{
    [Authorize(Roles = "Admin,Idareci,SinavYoneticisi")]
    public class OgrenciController : Controller
    {
        private readonly AppDbContext _context;
        public OgrenciController(AppDbContext context)
        {
            _context = context;
        }

        // GET: /Ogrenci
        public async Task<IActionResult> Index()
        {
            var ogrenciler = await _context.Ogrenciler.ToListAsync();
            return View(ogrenciler);
        }

        // GET: /Ogrenci/Details/5
        public async Task<IActionResult> Details(string id)
        {
            if (id == null) return NotFound();
            var ogrenci = await _context.Ogrenciler.FirstOrDefaultAsync(o => o.OgrenciNo == id);
            if (ogrenci == null) return NotFound();
            return View(ogrenci);
        }

        // GET: /Ogrenci/Create
        public IActionResult Create()
        {
            return View();
        }

        // POST: /Ogrenci/Create
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> Create([Bind("OgrenciNo,AdSoyad,SinifDuzeyi,Sube,SinavlaraKatilacak,Alan")] Ogrenci ogrenci)
        {
            if (ModelState.IsValid)
            {
                _context.Add(ogrenci);
                await _context.SaveChangesAsync();
                return RedirectToAction(nameof(Index));
            }
            return View(ogrenci);
        }

        // GET: /Ogrenci/Edit/5
        public async Task<IActionResult> Edit(string id)
        {
            if (id == null) return NotFound();
            var ogrenci = await _context.Ogrenciler.FindAsync(id);
            if (ogrenci == null) return NotFound();
            return View(ogrenci);
        }

        // POST: /Ogrenci/Edit/5
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> Edit(string id, [Bind("OgrenciNo,AdSoyad,SinifDuzeyi,Sube,SinavlaraKatilacak,Alan")] Ogrenci ogrenci)
        {
            if (id != ogrenci.OgrenciNo) return NotFound();
            if (ModelState.IsValid)
            {
                try
                {
                    _context.Update(ogrenci);
                    await _context.SaveChangesAsync();
                }
                catch (DbUpdateConcurrencyException)
                {
                    if (!OgrenciExists(ogrenci.OgrenciNo))
                        return NotFound();
                    else
                        throw;
                }
                return RedirectToAction(nameof(Index));
            }
            return View(ogrenci);
        }

        // GET: /Ogrenci/Delete/5
        public async Task<IActionResult> Delete(string id)
        {
            if (id == null) return NotFound();
            var ogrenci = await _context.Ogrenciler.FirstOrDefaultAsync(o => o.OgrenciNo == id);
            if (ogrenci == null) return NotFound();
            return View(ogrenci);
        }

        // POST: /Ogrenci/Delete/5
        [HttpPost, ActionName("Delete")]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> DeleteConfirmed(string id)
        {
            var ogrenci = await _context.Ogrenciler.FindAsync(id);
            if (ogrenci != null)
            {
                _context.Ogrenciler.Remove(ogrenci);
                await _context.SaveChangesAsync();
                TempData["SuccessMessage"] = $"Öğrenci ({ogrenci.AdSoyad}) başarıyla silindi.";
            }
            return RedirectToAction(nameof(Index));
        }

        // POST: /Ogrenci/DeleteSelected
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> DeleteSelected(List<string> selectedNos)
        {
            if (selectedNos != null && selectedNos.Any())
            {
                var ogrenciler = await _context.Ogrenciler
                    .Where(o => selectedNos.Contains(o.OgrenciNo))
                    .ToListAsync();

                if (ogrenciler.Any())
                {
                    int count = ogrenciler.Count;
                    _context.Ogrenciler.RemoveRange(ogrenciler);
                    await _context.SaveChangesAsync();
                    TempData["SuccessMessage"] = $"{count} adet öğrenci başarıyla silindi.";
                }
            }
            else
            {
                TempData["ErrorMessage"] = "Silinecek öğrenci seçilmedi.";
            }

            return RedirectToAction(nameof(Index));
        }

        // POST: /Ogrenci/DeleteAll
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> DeleteAll()
        {
            var tumOgrenciler = await _context.Ogrenciler.ToListAsync();
            int count = tumOgrenciler.Count;

            if (count > 0)
            {
                _context.Ogrenciler.RemoveRange(tumOgrenciler);
                await _context.SaveChangesAsync();
                TempData["SuccessMessage"] = $"Tüm öğrenciler ({count} adet) başarıyla silindi.";
            }
            else
            {
                TempData["ErrorMessage"] = "Silinecek öğrenci bulunamadı.";
            }

            return RedirectToAction(nameof(Index));
        }

        // GET: /Ogrenci/ImportExcel
        public IActionResult ImportExcel()
        {
            // Returns view with file upload form and column guidance.
            return View();
        }

        // POST: /Ogrenci/ImportExcel
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> ImportExcel(IFormFile excelFile, int startRow = 2)
        {
            if (excelFile == null || excelFile.Length == 0)
            {
                ModelState.AddModelError("excelFile", "Excel dosyası seçilmedi.");
                return View();
            }

            ExcelPackage.LicenseContext = LicenseContext.NonCommercial;
            var errors = new List<string>();

            try
            {
                using (var stream = new MemoryStream())
                {
                    await excelFile.CopyToAsync(stream);
                    using (var package = new ExcelPackage(stream))
                    {
                        var worksheet = package.Workbook.Worksheets.FirstOrDefault();
                        if (worksheet == null)
                        {
                            ModelState.AddModelError("excelFile", "Excel dosyasında çalışma sayfası bulunamadı.");
                            return View();
                        }

                        var row = startRow < 1 ? 1 : startRow;
                        int eklenen = 0;
                        int guncellenen = 0;

                        while (true)
                        {
                            var ogrenciNo = worksheet.Cells[row, 1].Text?.Trim();
                            var adSoyad = worksheet.Cells[row, 2].Text?.Trim();
                            var sinif = worksheet.Cells[row, 3].Text?.Trim();
                            var sube = worksheet.Cells[row, 4].Text?.Trim();
                            var katilimText = worksheet.Cells[row, 5].Text?.Trim();
                            var alanText = worksheet.Cells[row, 6].Text?.Trim();

                            // Tüm sütunlar boşsa dosyanın/verinin sonuna gelinmiştir
                            if (string.IsNullOrWhiteSpace(ogrenciNo) && string.IsNullOrWhiteSpace(adSoyad) && 
                                string.IsNullOrWhiteSpace(sinif) && string.IsNullOrWhiteSpace(sube))
                            {
                                break;
                            }

                            // İlk satır veri değil de başlık satırı ise atla
                            if (row == 1 && (
                                ogrenciNo.Equals("OgrenciNo", StringComparison.OrdinalIgnoreCase) ||
                                ogrenciNo.Contains("no", StringComparison.OrdinalIgnoreCase) ||
                                ogrenciNo.Contains("öğrenci", StringComparison.OrdinalIgnoreCase) ||
                                adSoyad.Contains("ad", StringComparison.OrdinalIgnoreCase)))
                            {
                                row++;
                                continue;
                            }

                            // Temel hücre doğrulamaları
                            if (string.IsNullOrWhiteSpace(ogrenciNo)) errors.Add($"Satır {row}: Öğrenci No eksik.");
                            if (string.IsNullOrWhiteSpace(adSoyad)) errors.Add($"Satır {row}: Ad Soyad eksik.");
                            if (string.IsNullOrWhiteSpace(sinif)) errors.Add($"Satır {row}: Sınıf Düzeyi eksik.");
                            if (string.IsNullOrWhiteSpace(sube)) errors.Add($"Satır {row}: Şube eksik.");

                            if (errors.Count == 0)
                            {
                                bool katilacak = ParseKatilim(katilimText);
                                string alan = NormalizeAlan(alanText);

                                var existing = await _context.Ogrenciler.FirstOrDefaultAsync(o => o.OgrenciNo == ogrenciNo);
                                if (existing != null)
                                {
                                    existing.AdSoyad = adSoyad;
                                    existing.SinifDuzeyi = sinif;
                                    existing.Sube = sube;
                                    existing.SinavlaraKatilacak = katilacak;
                                    existing.Alan = alan;
                                    _context.Ogrenciler.Update(existing);
                                    guncellenen++;
                                }
                                else
                                {
                                    var yeniOgrenci = new Ogrenci
                                    {
                                        OgrenciNo = ogrenciNo,
                                        AdSoyad = adSoyad,
                                        SinifDuzeyi = sinif,
                                        Sube = sube,
                                        SinavlaraKatilacak = katilacak,
                                        Alan = alan
                                    };
                                    _context.Ogrenciler.Add(yeniOgrenci);
                                    eklenen++;
                                }
                            }

                            row++;
                        }

                        if (errors.Any())
                        {
                            ViewData["Errors"] = errors;
                            return View();
                        }

                        await _context.SaveChangesAsync();
                        TempData["SuccessMessage"] = $"Excel dosyası başarıyla içe aktarıldı. ({eklenen} yeni öğrenci eklendi, {guncellenen} öğrenci güncellendi.)";
                    }
                }
            }
            catch (Exception ex)
            {
                ViewData["Errors"] = new List<string> { $"Excel işlenirken bir hata oluştu: {ex.Message}" };
                return View();
            }

            return RedirectToAction(nameof(Index));
        }

        public class OgrenciImportDto
        {
            public string OgrenciNo { get; set; } = string.Empty;
            public string AdSoyad { get; set; } = string.Empty;
            public string SinifDuzeyi { get; set; } = string.Empty;
            public string Sube { get; set; } = string.Empty;
            public bool SinavlaraKatilacak { get; set; } = true;
            public string Alan { get; set; } = "YOK";
        }

        // POST: /Ogrenci/ImportJson
        [HttpPost]
        [IgnoreAntiforgeryToken]
        public async Task<IActionResult> ImportJson([FromBody] List<OgrenciImportDto> students)
        {
            if (students == null || !students.Any())
            {
                return BadRequest(new { success = false, message = "Aktarılacak öğrenci listesi bulunamadı veya boş." });
            }

            try
            {
                int eklenen = 0;
                int guncellenen = 0;

                foreach (var s in students)
                {
                    var no = s.OgrenciNo?.Trim();
                    var ad = s.AdSoyad?.Trim();
                    var sinif = s.SinifDuzeyi?.Trim() ?? "";
                    var sube = s.Sube?.Trim() ?? "";
                    bool katilacak = s.SinavlaraKatilacak;
                    string alan = NormalizeAlan(s.Alan);

                    if (string.IsNullOrWhiteSpace(no) || string.IsNullOrWhiteSpace(ad))
                    {
                        continue;
                    }

                    var existing = await _context.Ogrenciler.FirstOrDefaultAsync(o => o.OgrenciNo == no);
                    if (existing != null)
                    {
                        existing.AdSoyad = ad;
                        existing.SinifDuzeyi = sinif;
                        existing.Sube = sube;
                        existing.SinavlaraKatilacak = katilacak;
                        existing.Alan = alan;
                        _context.Ogrenciler.Update(existing);
                        guncellenen++;
                    }
                    else
                    {
                        var yeni = new Ogrenci
                        {
                            OgrenciNo = no,
                            AdSoyad = ad,
                            SinifDuzeyi = sinif,
                            Sube = sube,
                            SinavlaraKatilacak = katilacak,
                            Alan = alan
                        };
                        _context.Ogrenciler.Add(yeni);
                        eklenen++;
                    }
                }

                await _context.SaveChangesAsync();

                return Ok(new { 
                    success = true, 
                    message = $"{eklenen} yeni öğrenci eklendi, {guncellenen} öğrenci güncellendi.",
                    eklenen, 
                    guncellenen 
                });
            }
            catch (Exception ex)
            {
                var errorMsg = ex.InnerException != null ? $"{ex.Message} -> {ex.InnerException.Message}" : ex.Message;
                return StatusCode(500, new { 
                    success = false, 
                    message = $"Veritabanına kaydetme sırasında hata oluştu: {errorMsg}" 
                });
            }
        }

        private static bool ParseKatilim(string? text)
        {
            if (string.IsNullOrWhiteSpace(text)) return true;
            string clean = text.Trim().ToLowerInvariant();
            if (clean == "hayır" || clean == "hayir" || clean == "h" || clean == "false" || clean == "0" || clean == "katılmayacak" || clean == "katilmayacak")
                return false;
            return true;
        }

        private static string NormalizeAlan(string? text)
        {
            if (string.IsNullOrWhiteSpace(text)) return "YOK";
            string clean = text.Trim().ToUpperInvariant();
            if (clean.Contains("SAY")) return "SAY";
            if (clean.Contains("TM") || clean.Contains("EA") || clean.Contains("EŞİT") || clean.Contains("ESIT")) return "TM";
            if (clean.Contains("SÖZ") || clean.Contains("SOZ")) return "SÖZ";
            if (clean.Contains("DİL") || clean.Contains("DIL")) return "DİL";
            if (clean.Contains("YOK") || clean == "-") return "YOK";
            return clean;
        }

        private bool OgrenciExists(string id)
        {
            return _context.Ogrenciler.Any(e => e.OgrenciNo == id);
        }
            // GET: /Ogrenci/ExportToExcel
        [HttpGet]
        public async Task<IActionResult> ExportToExcel()
        {
            ExcelPackage.LicenseContext = LicenseContext.NonCommercial;
            using var package = new ExcelPackage();
            var worksheet = package.Workbook.Worksheets.Add("Öğrenci Listesi");

            // Başlıklar (ImportExcel şablonu ile tam uyumlu formatta)
            var headers = new[] { "Öğrenci No", "Adı Soyadı", "Sınıf", "Şube", "Sınav Katılımı", "Alanı" };
            for (int i = 0; i < headers.Length; i++)
            {
                var cell = worksheet.Cells[1, i + 1];
                cell.Value = headers[i];
                cell.Style.Font.Bold = true;
                cell.Style.Fill.PatternType = OfficeOpenXml.Style.ExcelFillStyle.Solid;
                cell.Style.Fill.BackgroundColor.SetColor(System.Drawing.Color.FromArgb(44, 62, 80));
                cell.Style.Font.Color.SetColor(System.Drawing.Color.White);
                cell.Style.HorizontalAlignment = OfficeOpenXml.Style.ExcelHorizontalAlignment.Center;
            }

            var ogrenciler = await _context.Ogrenciler.ToListAsync();
            ogrenciler = ogrenciler
                .OrderBy(o => int.TryParse(o.SinifDuzeyi, out var s) ? s : 999)
                .ThenBy(o => o.Sube)
                .ThenBy(o => int.TryParse(o.OgrenciNo, out var n) ? n : 999999)
                .ToList();

            int row = 2;
            foreach (var o in ogrenciler)
            {
                worksheet.Cells[row, 1].Value = o.OgrenciNo;
                worksheet.Cells[row, 1].Style.HorizontalAlignment = OfficeOpenXml.Style.ExcelHorizontalAlignment.Center;

                worksheet.Cells[row, 2].Value = o.AdSoyad;
                worksheet.Cells[row, 2].Style.HorizontalAlignment = OfficeOpenXml.Style.ExcelHorizontalAlignment.Left;

                worksheet.Cells[row, 3].Value = o.SinifDuzeyi;
                worksheet.Cells[row, 3].Style.HorizontalAlignment = OfficeOpenXml.Style.ExcelHorizontalAlignment.Center;

                worksheet.Cells[row, 4].Value = o.Sube;
                worksheet.Cells[row, 4].Style.HorizontalAlignment = OfficeOpenXml.Style.ExcelHorizontalAlignment.Center;

                worksheet.Cells[row, 5].Value = o.SinavlaraKatilacak ? "Evet" : "Hayır";
                worksheet.Cells[row, 5].Style.HorizontalAlignment = OfficeOpenXml.Style.ExcelHorizontalAlignment.Center;

                worksheet.Cells[row, 6].Value = string.IsNullOrWhiteSpace(o.Alan) ? "YOK" : o.Alan;
                worksheet.Cells[row, 6].Style.HorizontalAlignment = OfficeOpenXml.Style.ExcelHorizontalAlignment.Center;

                row++;
            }

            if (row > 2)
            {
                var tableRange = worksheet.Cells[1, 1, row - 1, headers.Length];
                tableRange.Style.Border.Top.Style = OfficeOpenXml.Style.ExcelBorderStyle.Thin;
                tableRange.Style.Border.Bottom.Style = OfficeOpenXml.Style.ExcelBorderStyle.Thin;
                tableRange.Style.Border.Left.Style = OfficeOpenXml.Style.ExcelBorderStyle.Thin;
                tableRange.Style.Border.Right.Style = OfficeOpenXml.Style.ExcelBorderStyle.Thin;
                tableRange.AutoFilter = true;
            }

            worksheet.Cells[worksheet.Dimension.Address].AutoFitColumns();

            var fileName = $"Ogrenci_Listesi_{DateTime.Now:yyyyMMdd_HHmm}.xlsx";
            return File(package.GetAsByteArray(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", fileName);
        }

        // GET: /Ogrenci/Siniflar
        public async Task<IActionResult> Siniflar()
        {
            var siniflar = await _context.Siniflar.ToListAsync();
            return View(siniflar);
        }

    }
}