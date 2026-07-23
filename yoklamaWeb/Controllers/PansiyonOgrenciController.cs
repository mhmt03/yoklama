using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Rendering;
using Microsoft.EntityFrameworkCore;
using yoklamaWeb.Data;
using yoklamaWeb.Models;
using yoklamaWeb.Models.Enums;
using yoklamaWeb.ViewModels.Pansiyon;

using Microsoft.AspNetCore.Authorization;
using yoklamaWeb.Filters;

namespace yoklamaWeb.Controllers
{
    [PansiyonAdminAuthorize]
    public class PansiyonOgrenciController : Controller
    {
        private readonly AppDbContext _context;

        public PansiyonOgrenciController(AppDbContext context)
        {
            _context = context;
        }

        // GET: PansiyonOgrenci
        public async Task<IActionResult> Index(PansiyonOgrenciFilterViewModel filter)
        {
            var query = _context.PansiyonOgrenciler
                .Include(o => o.Oda)
                .AsQueryable();

            if (!string.IsNullOrWhiteSpace(filter.Arama))
            {
                query = query.Where(o => o.OgrenciNo.Contains(filter.Arama) 
                    || o.AdSoyad.Contains(filter.Arama) 
                    || o.Telefon.Contains(filter.Arama)
                    || o.VeliTelefon.Contains(filter.Arama));
            }

            if (filter.OdaId.HasValue)
            {
                query = query.Where(o => o.OdaId == filter.OdaId.Value);
            }

            if (!string.IsNullOrWhiteSpace(filter.SinifDuzeyi))
            {
                query = query.Where(o => o.SinifDuzeyi == filter.SinifDuzeyi);
            }

            if (!string.IsNullOrWhiteSpace(filter.Sube))
            {
                query = query.Where(o => o.Sube == filter.Sube);
            }

            if (filter.SadeceAktif)
            {
                query = query.Where(o => o.Aktif);
            }

            var ogrenciler = await query
                .OrderBy(o => o.AdSoyad)
                .ToListAsync();

            var viewModel = new PansiyonOgrenciListViewModel
            {
                Ogrenciler = ogrenciler.Select(o => new PansiyonOgrenciViewModel
                {
                    Id = o.Id,
                    OgrenciNo = o.OgrenciNo,
                    AdSoyad = o.AdSoyad,
                    SinifDuzeyi = o.SinifDuzeyi,
                    Sube = o.Sube,
                    Telefon = o.Telefon,
                    VeliTelefon = o.VeliTelefon,
                    Adres = o.Adres,
                    OdaId = o.OdaId,
                    OdaNo = o.Oda?.OdaNo,
                    Aktif = o.Aktif,
                    RowVersion = o.RowVersion
                }).ToList(),
                Filter = filter
            };

            // Dropdown listeleri
            ViewBag.Odalar = await _context.Odalar
                .Where(o => o.Aktif)
                .OrderBy(o => o.Kat)
                .ThenBy(o => o.OdaNo)
                .Select(o => new SelectListItem { Value = o.Id.ToString(), Text = $"{o.OdaNo} (Kat {o.Kat})" })
                .ToListAsync();

            ViewBag.SinifDuzeyleri = Enum.GetValues(typeof(SinifDuzeyi))
                .Cast<SinifDuzeyi>()
                .Select(s => new SelectListItem { Value = ((int)s).ToString(), Text = s.ToString() })
                .ToList();

            ViewBag.Subeler = await _context.PansiyonOgrenciler
                .Where(o => o.Aktif && !string.IsNullOrEmpty(o.Sube))
                .Select(o => o.Sube)
                .Distinct()
                .OrderBy(s => s)
                .ToListAsync();

            return View(viewModel);
        }

        // GET: PansiyonOgrenci/Details/5
        public async Task<IActionResult> Details(int? id)
        {
            if (id == null)
            {
                return NotFound();
            }

            var ogrenci = await _context.PansiyonOgrenciler
                .Include(o => o.Oda)
                .Include(o => o.Yoklamalar)
                .Include(o => o.IzinGirisleri)
                .FirstOrDefaultAsync(m => m.Id == id);

            if (ogrenci == null)
            {
                return NotFound();
            }

            var viewModel = new PansiyonOgrenciViewModel
            {
                Id = ogrenci.Id,
                OgrenciNo = ogrenci.OgrenciNo,
                AdSoyad = ogrenci.AdSoyad,
                SinifDuzeyi = ogrenci.SinifDuzeyi,
                Sube = ogrenci.Sube,
                Telefon = ogrenci.Telefon,
                VeliTelefon = ogrenci.VeliTelefon,
                Adres = ogrenci.Adres,
                OdaId = ogrenci.OdaId,
                OdaNo = ogrenci.Oda?.OdaNo,
                Aktif = ogrenci.Aktif,
                RowVersion = ogrenci.RowVersion,
                Yoklamalar = ogrenci.Yoklamalar
                    .OrderByDescending(y => y.Tarih)
                    .Take(30)
                    .Select(y => new PansiyonYoklamaListViewModel
                    {
                        Id = y.Id,
                        Tarih = y.Tarih,
                        VarMi = y.Durum == "Var",
                        Aciklama = y.Aciklama
                    }).ToList(),
                Izinler = ogrenci.IzinGirisleri
                    .OrderByDescending(i => i.BaslangicTarihi)
                    .Select(i => new IzinGirisiListViewModel
                    {
                        Id = i.Id,
                        BaslangicTarihi = i.BaslangicTarihi,
                        BitisTarihi = i.BitisTarihi,
                        IzinTuru = i.Tur.ToString(),
                        Aciklama = i.Aciklama
                    }).ToList()
            };

            return View(viewModel);
        }

        // GET: PansiyonOgrenci/Create
        public async Task<IActionResult> Create()
        {
            var viewModel = new PansiyonOgrenciCreateViewModel();
            ViewBag.Odalar = await GetOdalarSelectListAsync();
            return View(viewModel);
        }

        // POST: PansiyonOgrenci/Create
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> Create(PansiyonOgrenciCreateViewModel viewModel)
        {
            if (ModelState.IsValid)
            {
                // Öğrenci no kontrolü
                if (await _context.PansiyonOgrenciler.AnyAsync(o => o.OgrenciNo == viewModel.OgrenciNo))
                {
                    ModelState.AddModelError("OgrenciNo", "Bu öğrenci numarası zaten kayıtlı.");
                    ViewBag.Odalar = await GetOdalarSelectListAsync();
                    return View(viewModel);
                }

                var ogrenci = new PansiyonOgrenci
                {
                    OgrenciNo = viewModel.OgrenciNo,
                    AdSoyad = viewModel.AdSoyad,
                    SinifDuzeyi = viewModel.SinifDuzeyi,
                    Sube = viewModel.Sube,
                    Telefon = viewModel.Telefon,
                    VeliTelefon = viewModel.VeliTelefon,
                    Adres = viewModel.Adres,
                    OdaId = viewModel.OdaId,
                    Aktif = viewModel.Aktif,
                    Sifre = viewModel.Sifre ?? ""
                };

                _context.Add(ogrenci);
                await _context.SaveChangesAsync();
                TempData["SuccessMessage"] = "Öğrenci başarıyla eklendi.";
                return RedirectToAction(nameof(Index));
            }
            ViewBag.Odalar = await GetOdalarSelectListAsync();
            return View(viewModel);
        }

        // GET: PansiyonOgrenci/Edit/5
        public async Task<IActionResult> Edit(int? id)
        {
            if (id == null)
            {
                return NotFound();
            }

            var ogrenci = await _context.PansiyonOgrenciler.FindAsync(id);
            if (ogrenci == null)
            {
                return NotFound();
            }

            var viewModel = new PansiyonOgrenciEditViewModel
            {
                Id = ogrenci.Id,
                OgrenciNo = ogrenci.OgrenciNo,
                AdSoyad = ogrenci.AdSoyad,
                SinifDuzeyi = ogrenci.SinifDuzeyi,
                Sube = ogrenci.Sube,
                Telefon = ogrenci.Telefon,
                VeliTelefon = ogrenci.VeliTelefon,
                Adres = ogrenci.Adres,
                OdaId = ogrenci.OdaId,
                Aktif = ogrenci.Aktif,
                Sifre = ogrenci.Sifre,
                RowVersion = ogrenci.RowVersion
            };

            ViewBag.Odalar = await GetOdalarSelectListAsync();
            return View(viewModel);
        }

        // POST: PansiyonOgrenci/Edit/5
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> Edit(int id, PansiyonOgrenciEditViewModel viewModel)
        {
            if (id != viewModel.Id)
            {
                return NotFound();
            }

            if (ModelState.IsValid)
            {
                try
                {
                    var ogrenci = await _context.PansiyonOgrenciler.FindAsync(id);
                    if (ogrenci == null)
                    {
                        return NotFound();
                    }

                    // Concurrency check
                    if (!viewModel.RowVersion.SequenceEqual(ogrenci.RowVersion))
                    {
                        ModelState.AddModelError(string.Empty, "Bu kayıt başka bir kullanıcı tarafından güncellendi. Lütfen sayfayı yenileyip tekrar deneyin.");
                        ViewBag.Odalar = await GetOdalarSelectListAsync();
                        return View(viewModel);
                    }

                    // Öğrenci no kontrolü (kendisi hariç)
                    if (await _context.PansiyonOgrenciler.AnyAsync(o => o.OgrenciNo == viewModel.OgrenciNo && o.Id != id))
                    {
                        ModelState.AddModelError("OgrenciNo", "Bu öğrenci numarası zaten kayıtlı.");
                        ViewBag.Odalar = await GetOdalarSelectListAsync();
                        return View(viewModel);
                    }

                    ogrenci.OgrenciNo = viewModel.OgrenciNo;
                    ogrenci.AdSoyad = viewModel.AdSoyad;
                    ogrenci.SinifDuzeyi = viewModel.SinifDuzeyi;
                    ogrenci.Sube = viewModel.Sube;
                    ogrenci.Telefon = viewModel.Telefon;
                    ogrenci.VeliTelefon = viewModel.VeliTelefon;
                    ogrenci.Adres = viewModel.Adres;
                    ogrenci.OdaId = viewModel.OdaId;
                    ogrenci.Aktif = viewModel.Aktif;

                    if (!string.IsNullOrWhiteSpace(viewModel.Sifre))
                    {
                        ogrenci.Sifre = viewModel.Sifre;
                    }

                    _context.Update(ogrenci);
                    await _context.SaveChangesAsync();
                    TempData["SuccessMessage"] = "Öğrenci başarıyla güncellendi.";
                    return RedirectToAction(nameof(Index));
                }
                catch (DbUpdateConcurrencyException)
                {
                    if (!PansiyonOgrenciExists(viewModel.Id))
                    {
                        return NotFound();
                    }
                    else
                    {
                        throw;
                    }
                }
            }
            ViewBag.Odalar = await GetOdalarSelectListAsync();
            return View(viewModel);
        }

        // GET: PansiyonOgrenci/Delete/5
        public async Task<IActionResult> Delete(int? id)
        {
            if (id == null)
            {
                return NotFound();
            }

            var ogrenci = await _context.PansiyonOgrenciler
                .Include(o => o.Oda)
                .FirstOrDefaultAsync(m => m.Id == id);

            if (ogrenci == null)
            {
                return NotFound();
            }

            var viewModel = new PansiyonOgrenciViewModel
            {
                Id = ogrenci.Id,
                OgrenciNo = ogrenci.OgrenciNo,
                AdSoyad = ogrenci.AdSoyad,
                SinifDuzeyi = ogrenci.SinifDuzeyi,
                Sube = ogrenci.Sube,
                Telefon = ogrenci.Telefon,
                VeliTelefon = ogrenci.VeliTelefon,
                Adres = ogrenci.Adres,
                OdaId = ogrenci.OdaId,
                OdaNo = ogrenci.Oda?.OdaNo,
                Aktif = ogrenci.Aktif,
                RowVersion = ogrenci.RowVersion
            };

            return View(viewModel);
        }

        // POST: PansiyonOgrenci/Delete/5
        [HttpPost, ActionName("Delete")]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> DeleteConfirmed(int id, byte[] rowVersion)
        {
            var ogrenci = await _context.PansiyonOgrenciler.FindAsync(id);
            if (ogrenci == null)
            {
                return NotFound();
            }

            // Concurrency check
            if (!rowVersion.SequenceEqual(ogrenci.RowVersion))
            {
                TempData["ErrorMessage"] = "Bu kayıt başka bir kullanıcı tarafından güncellendi. Lütfen sayfayı yenileyip tekrar deneyin.";
                return RedirectToAction(nameof(Index));
            }

            _context.PansiyonOgrenciler.Remove(ogrenci);
            await _context.SaveChangesAsync();
            TempData["SuccessMessage"] = "Öğrenci başarıyla silindi.";
            return RedirectToAction(nameof(Index));
        }

        // GET: PansiyonOgrenci/Import
        public IActionResult Import()
        {
            return View();
        }

        // POST: PansiyonOgrenci/Import
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> Import(PansiyonOgrenciImportViewModel viewModel)
        {
            if (ModelState.IsValid && viewModel.ExcelFile != null)
            {
                try
                {
                    using var stream = new MemoryStream();
                    await viewModel.ExcelFile.CopyToAsync(stream);
                    stream.Position = 0;

                    using var package = new OfficeOpenXml.ExcelPackage(stream);
                    var worksheet = package.Workbook.Worksheets[0];
                    var rowCount = worksheet.Dimension.Rows;

                    int basarili = 0, hatali = 0;
                    var hatalar = new List<string>();

                    for (int row = 2; row <= rowCount; row++) // 1. satır header
                    {
                        try
                        {
                            var ogrenciNo = worksheet.Cells[row, 1].Text?.Trim();
                            var adSoyad = worksheet.Cells[row, 2].Text?.Trim();
                            var sinifDuzeyiStr = worksheet.Cells[row, 3].Text?.Trim();
                            var sube = worksheet.Cells[row, 4].Text?.Trim();
                            var telefon = worksheet.Cells[row, 5].Text?.Trim();
                            var veliTelefon = worksheet.Cells[row, 6].Text?.Trim();
                            var adres = worksheet.Cells[row, 7].Text?.Trim();
                            var odaNo = worksheet.Cells[row, 8].Text?.Trim();

                            if (string.IsNullOrWhiteSpace(ogrenciNo) || string.IsNullOrWhiteSpace(adSoyad))
                            {
                                hatalar.Add($"Satır {row}: Öğrenci no veya ad soyad boş.");
                                hatali++;
                                continue;
                            }

                            if (!Enum.TryParse<SinifDuzeyi>(sinifDuzeyiStr, out var sinifDuzeyi))
                            {
                                hatalar.Add($"Satır {row}: Geçersiz sınıf düzeyi '{sinifDuzeyiStr}'.");
                                hatali++;
                                continue;
                            }

                            // Öğrenci no kontrolü
                            if (await _context.PansiyonOgrenciler.AnyAsync(o => o.OgrenciNo == ogrenciNo))
                            {
                                hatalar.Add($"Satır {row}: Öğrenci no '{ogrenciNo}' zaten kayıtlı.");
                                hatali++;
                                continue;
                            }

                            int? odaId = null;
                            if (!string.IsNullOrWhiteSpace(odaNo))
                            {
                                var oda = await _context.Odalar.FirstOrDefaultAsync(o => o.OdaNo == odaNo && o.Aktif);
                                if (oda == null)
                                {
                                    hatalar.Add($"Satır {row}: Oda '{odaNo}' bulunamadı veya aktif değil.");
                                    hatali++;
                                    continue;
                                }
                                odaId = oda.Id;
                            }

                            var ogrenci = new PansiyonOgrenci
                            {
                                OgrenciNo = ogrenciNo,
                                AdSoyad = adSoyad,
                                SinifDuzeyi = sinifDuzeyi.ToString(),
                                Sube = sube,
                                Telefon = telefon,
                                VeliTelefon = veliTelefon,
                                Adres = adres,
                                OdaId = odaId,
                                Aktif = true
                            };

                            _context.Add(ogrenci);
                            basarili++;
                        }
                        catch (Exception ex)
                        {
                            hatalar.Add($"Satır {row}: {ex.Message}");
                            hatali++;
                        }
                    }

                    await _context.SaveChangesAsync();

                    TempData["SuccessMessage"] = $"{basarili} öğrenci başarıyla içe aktarıldı.";
                    if (hatali > 0)
                    {
                        TempData["ErrorMessage"] = $"{hatali} satır hatalı atlandı. Detaylar: {string.Join("; ", hatalar.Take(5))}";
                    }
                    return RedirectToAction(nameof(Index));
                }
                catch (Exception ex)
                {
                    ModelState.AddModelError(string.Empty, $"Dosya işlenirken hata oluştu: {ex.Message}");
                }
            }
            return View(viewModel);
        }

        // GET: PansiyonOgrenci/Export
        public async Task<IActionResult> Export()
        {
            var ogrenciler = await _context.PansiyonOgrenciler
                .Include(o => o.Oda)
                .Where(o => o.Aktif)
                .OrderBy(o => o.AdSoyad)
                .ToListAsync();

            using var package = new OfficeOpenXml.ExcelPackage();
            var worksheet = package.Workbook.Worksheets.Add("Öğrenciler");

            // Header
            worksheet.Cells[1, 1].Value = "Öğrenci No";
            worksheet.Cells[1, 2].Value = "Ad Soyad";
            worksheet.Cells[1, 3].Value = "Sınıf Düzeyi";
            worksheet.Cells[1, 4].Value = "Şube";
            worksheet.Cells[1, 5].Value = "Telefon";
            worksheet.Cells[1, 6].Value = "Veli Telefon";
            worksheet.Cells[1, 7].Value = "Adres";
            worksheet.Cells[1, 8].Value = "Oda No";

            // Data
            for (int i = 0; i < ogrenciler.Count; i++)
            {
                var o = ogrenciler[i];
                worksheet.Cells[i + 2, 1].Value = o.OgrenciNo;
                worksheet.Cells[i + 2, 2].Value = o.AdSoyad;
                worksheet.Cells[i + 2, 3].Value = o.SinifDuzeyi.ToString();
                worksheet.Cells[i + 2, 4].Value = o.Sube;
                worksheet.Cells[i + 2, 5].Value = o.Telefon;
                worksheet.Cells[i + 2, 6].Value = o.VeliTelefon;
                worksheet.Cells[i + 2, 7].Value = o.Adres;
                worksheet.Cells[i + 2, 8].Value = o.Oda?.OdaNo;
            }

            worksheet.Cells.AutoFitColumns();
            var stream = new MemoryStream(package.GetAsByteArray());
            return File(stream, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", $"PansiyonOgrenciler_{DateTime.Now:yyyyMMdd}.xlsx");
        }

        private async Task<List<SelectListItem>> GetOdalarSelectListAsync()
        {
            return await _context.Odalar
                .Where(o => o.Aktif)
                .OrderBy(o => o.Kat)
                .ThenBy(o => o.OdaNo)
                .Select(o => new SelectListItem { Value = o.Id.ToString(), Text = $"{o.OdaNo} (Kat {o.Kat}, Kap.{o.Kapasite})" })
                .ToListAsync();
        }

        private bool PansiyonOgrenciExists(int id)
        {
            return _context.PansiyonOgrenciler.Any(e => e.Id == id);
        }
    }
}