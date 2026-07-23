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
    [Authorize(Roles = "Admin")]
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
        public async Task<IActionResult> Create([Bind("OgrenciNo,AdSoyad,SinifDuzeyi,Sube")] Ogrenci ogrenci)
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
        public async Task<IActionResult> Edit(string id, [Bind("OgrenciNo,AdSoyad,SinifDuzeyi,Sube")] Ogrenci ogrenci)
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

            var errors = new List<string>();
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

                    // Expected columns order
                    var expectedHeaders = new[] { "OgrenciNo", "AdSoyad", "SinifDuzeyi", "Sube" };
                    for (int col = 1; col <= expectedHeaders.Length; col++)
                    {
                        var header = worksheet.Cells[1, col].Text?.Trim();
                        if (!string.Equals(header, expectedHeaders[col - 1], StringComparison.OrdinalIgnoreCase))
                        {
                            errors.Add($"Beklenen başlık '{expectedHeaders[col - 1]}' yerine '{header}' bulundu (Sütun {col}).");
                        }
                    }

                    if (errors.Any())
                    {
                        // Abort import if any header mismatch
                        ViewData["Errors"] = errors;
                        return View();
                    }

                    var row = startRow;
                    while (true)
                    {
                        var ogrenciNo = worksheet.Cells[row, 1].Text?.Trim();
                        var adSoyad = worksheet.Cells[row, 2].Text?.Trim();
                        var sinif = worksheet.Cells[row, 3].Text?.Trim();
                        var sube = worksheet.Cells[row, 4].Text?.Trim();

                        if (string.IsNullOrWhiteSpace(ogrenciNo) && string.IsNullOrWhiteSpace(adSoyad) && string.IsNullOrWhiteSpace(sinif) && string.IsNullOrWhiteSpace(sube))
                        {
                            // Reached empty row, stop processing
                            break;
                        }

                        // Validate each cell
                        if (string.IsNullOrWhiteSpace(ogrenciNo)) errors.Add($"Satır {row}: Öğrenci No eksik.");
                        if (string.IsNullOrWhiteSpace(adSoyad)) errors.Add($"Satır {row}: Ad Soyad eksik.");
                        if (string.IsNullOrWhiteSpace(sinif)) errors.Add($"Satır {row}: Sınıf Düzeyi eksik.");
                        if (string.IsNullOrWhiteSpace(sube)) errors.Add($"Satır {row}: Şube eksik.");

                        if (!errors.Any())
                        {
                            // Check duplicate
                            var exists = await _context.Ogrenciler.AnyAsync(o => o.OgrenciNo == ogrenciNo);
                            if (exists)
                            {
                                errors.Add($"Satır {row}: Öğrenci No '{ogrenciNo}' zaten mevcut.");
                            }
                            else
                            {
                                var yeniOgrenci = new Ogrenci
                                {
                                    OgrenciNo = ogrenciNo,
                                    AdSoyad = adSoyad,
                                    SinifDuzeyi = sinif,
                                    Sube = sube
                                };
                                _context.Ogrenciler.Add(yeniOgrenci);
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
                }
            }

            TempData["SuccessMessage"] = "Excel dosyası başarıyla içe aktarıldı.";
            return RedirectToAction(nameof(Index));
        }

        private bool OgrenciExists(string id)
        {
            return _context.Ogrenciler.Any(e => e.OgrenciNo == id);
        }
            // GET: /Ogrenci/Siniflar
        public async Task<IActionResult> Siniflar()
        {
            var siniflar = await _context.Siniflar.ToListAsync();
            return View(siniflar);
        }

    }
}