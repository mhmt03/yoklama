using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Rendering;
using Microsoft.EntityFrameworkCore;
using yoklamaWeb.Data;
using yoklamaWeb.Models;
using yoklamaWeb.Filters;
using yoklamaWeb.ViewModels.Pansiyon;
using ClosedXML.Excel;

namespace yoklamaWeb.Controllers
{
    public class YoklamaController : Controller
    {
        private readonly AppDbContext _context;

        public YoklamaController(AppDbContext context)
        {
            _context = context;
        }

        // GET: Yoklama
        public async Task<IActionResult> Index(YoklamaFilterViewModel filter)
        {
            var query = _context.PansiyonYoklamalar
                .Include(y => y.PansiyonOgrenci)
                .Include(y => y.YoklamaYapan)
                .AsQueryable();

            if (!string.IsNullOrWhiteSpace(filter.Arama))
            {
                query = query.Where(y => y.PansiyonOgrenci.AdSoyad.Contains(filter.Arama)
                    || y.PansiyonOgrenci.OgrenciNo.Contains(filter.Arama)
                    || y.YoklamaYapan.AdSoyad.Contains(filter.Arama)
                    || y.Aciklama.Contains(filter.Arama));
            }

            if (filter.OgrenciId.HasValue)
            {
                query = query.Where(y => y.PansiyonOgrenciId == filter.OgrenciId.Value);
            }

            if (filter.YoklamaYapanId.HasValue)
            {
                query = query.Where(y => y.YoklamaYapanId == filter.YoklamaYapanId.Value);
            }

            if (!string.IsNullOrWhiteSpace(filter.Durum))
            {
                query = query.Where(y => y.Durum == filter.Durum);
            }

            if (filter.BaslangicTarihi.HasValue)
            {
                query = query.Where(y => y.Tarih >= filter.BaslangicTarihi.Value);
            }

            if (filter.BitisTarihi.HasValue)
            {
                query = query.Where(y => y.Tarih <= filter.BitisTarihi.Value);
            }

            var yoklamalar = await query
                .OrderByDescending(y => y.Tarih)
                .ThenByDescending(y => y.Saat)
                .ToListAsync();

            var viewModel = new YoklamaListViewModel
            {
                Yoklamalar = yoklamalar.Select(y => new PansiyonYoklamaViewModel
                {
                    Id = y.Id,
                    PansiyonOgrenciId = y.PansiyonOgrenciId,
                    OgrenciAdSoyad = y.PansiyonOgrenci.AdSoyad,
                    OgrenciNo = y.PansiyonOgrenci.OgrenciNo,
                    YoklamaYapanId = y.YoklamaYapanId,
                    YoklamaYapanAdSoyad = y.YoklamaYapan.AdSoyad,
                    Tarih = y.Tarih,
                    Saat = y.Saat,
                    Durum = y.Durum,
                    Aciklama = y.Aciklama,
                    RowVersion = y.RowVersion
                }).ToList(),
                Filter = filter
            };

            ViewBag.Ogrenciler = await _context.PansiyonOgrenciler
                .Where(o => o.Aktif)
                .OrderBy(o => o.AdSoyad)
                .Select(o => new SelectListItem { Value = o.Id.ToString(), Text = $"{o.AdSoyad} ({o.OgrenciNo})" })
                .ToListAsync();

            ViewBag.Gorevlisiler = await _context.PansiyonGorevlileri
                .Where(g => g.Aktif)
                .OrderBy(g => g.AdSoyad)
                .Select(g => new SelectListItem { Value = g.Id.ToString(), Text = g.AdSoyad })
                .ToListAsync();

            ViewBag.Durumlar = GetDurumlarSelectList();

            return View(viewModel);
        }

        // GET: Yoklama/Details/5
        public async Task<IActionResult> Details(int? id)
        {
            if (id == null)
            {
                return NotFound();
            }

            var yoklama = await _context.PansiyonYoklamalar
                .Include(y => y.PansiyonOgrenci)
                .Include(y => y.YoklamaYapan)
                .FirstOrDefaultAsync(m => m.Id == id);

            if (yoklama == null)
            {
                return NotFound();
            }

            var viewModel = new PansiyonYoklamaViewModel
            {
                Id = yoklama.Id,
                PansiyonOgrenciId = yoklama.PansiyonOgrenciId,
                OgrenciAdSoyad = yoklama.PansiyonOgrenci.AdSoyad,
                OgrenciNo = yoklama.PansiyonOgrenci.OgrenciNo,
                YoklamaYapanId = yoklama.YoklamaYapanId,
                YoklamaYapanAdSoyad = yoklama.YoklamaYapan.AdSoyad,
                Tarih = yoklama.Tarih,
                Saat = yoklama.Saat,
                Durum = yoklama.Durum,
                Aciklama = yoklama.Aciklama,
                RowVersion = yoklama.RowVersion
            };

            return View(viewModel);
        }

        // GET: Yoklama/Create
        public IActionResult Create()
        {
            var viewModel = new YoklamaCreateViewModel
            {
                Tarih = DateTime.Today,
                Saat = DateTime.Now.TimeOfDay
            };
            ViewBag.Ogrenciler = GetOgrencilerSelectList();
            ViewBag.Gorevlisiler = GetGorevlisilerSelectList();
            ViewBag.Durumlar = GetDurumlarSelectList();
            return View(viewModel);
        }

        // POST: Yoklama/Create
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> Create(YoklamaCreateViewModel viewModel)
        {
            if (ModelState.IsValid)
            {
                // Öğrenci kontrolü
                var ogrenci = await _context.PansiyonOgrenciler.FindAsync(viewModel.OgrenciId);
                if (ogrenci == null || !ogrenci.Aktif)
                {
                    ModelState.AddModelError("OgrenciId", "Seçilen öğrenci bulunamadı veya aktif değil.");
                    ViewBag.Ogrenciler = GetOgrencilerSelectList();
                    ViewBag.Gorevlisiler = GetGorevlisilerSelectList();
                    ViewBag.Durumlar = GetDurumlarSelectList();
                    return View(viewModel);
                }

                // Görevli kontrolü
                var gorevlisi = await _context.PansiyonGorevlileri.FindAsync(viewModel.YoklamaYapanId);
                if (gorevlisi == null || !gorevlisi.Aktif)
                {
                    ModelState.AddModelError("YoklamaYapanId", "Seçilen görevli bulunamadı veya aktif değil.");
                    ViewBag.Ogrenciler = GetOgrencilerSelectList();
                    ViewBag.Gorevlisiler = GetGorevlisilerSelectList();
                    ViewBag.Durumlar = GetDurumlarSelectList();
                    return View(viewModel);
                }

                // Aynı öğrenci, aynı tarih ve saat için yoklama var mı kontrol et
                var mevcutYoklama = await _context.PansiyonYoklamalar
                    .FirstOrDefaultAsync(y => y.PansiyonOgrenciId == viewModel.PansiyonOgrenciId
                        && y.Tarih == viewModel.Tarih
                        && y.Saat == viewModel.Saat);

                if (mevcutYoklama != null)
                {
                    ModelState.AddModelError(string.Empty, "Bu öğrenci için aynı tarih ve saatte zaten bir yoklama kaydı var.");
                    ViewBag.Ogrenciler = GetOgrencilerSelectList();
                    ViewBag.Gorevlisiler = GetGorevlisilerSelectList();
                    ViewBag.Durumlar = GetDurumlarSelectList();
                    return View(viewModel);
                }

                var yoklama = new PansiyonYoklama
                {
                    PansiyonOgrenciId = viewModel.PansiyonOgrenciId,
                    YoklamaYapanId = viewModel.YoklamaYapanId,
                    Tarih = viewModel.Tarih,
                    Saat = viewModel.Saat,
                    Durum = viewModel.Durum,
                    Aciklama = viewModel.Aciklama
                };

                _context.Add(yoklama);
                await _context.SaveChangesAsync();
                TempData["SuccessMessage"] = "Yoklama kaydı başarıyla eklendi.";
                return RedirectToAction(nameof(Index));
            }
            ViewBag.Ogrenciler = GetOgrencilerSelectList();
            ViewBag.Gorevlisiler = GetGorevlisilerSelectList();
            ViewBag.Durumlar = GetDurumlarSelectList();
            return View(viewModel);
        }

        // GET: Yoklama/Edit/5
        public async Task<IActionResult> Edit(int? id)
        {
            if (id == null)
            {
                return NotFound();
            }

            var yoklama = await _context.PansiyonYoklamalar.FindAsync(id);
            if (yoklama == null)
            {
                return NotFound();
            }

            var viewModel = new YoklamaEditViewModel
            {
                Id = yoklama.Id,
                PansiyonOgrenciId = yoklama.PansiyonOgrenciId,
                YoklamaYapanId = yoklama.YoklamaYapanId,
                Tarih = yoklama.Tarih,
                Saat = yoklama.Saat,
                Durum = yoklama.Durum,
                Aciklama = yoklama.Aciklama,
                RowVersion = yoklama.RowVersion
            };

            ViewBag.Ogrenciler = GetOgrencilerSelectList();
            ViewBag.Gorevlisiler = GetGorevlisilerSelectList();
            ViewBag.Durumlar = GetDurumlarSelectList();
            return View(viewModel);
        }

        // POST: Yoklama/Edit/5
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> Edit(int id, YoklamaEditViewModel viewModel)
        {
            if (id != viewModel.Id)
            {
                return NotFound();
            }

            if (ModelState.IsValid)
            {
                try
                {
                    var yoklama = await _context.PansiyonYoklamalar.FindAsync(id);
                    if (yoklama == null)
                    {
                        return NotFound();
                    }

                    // Concurrency check
                    if (!viewModel.RowVersion.SequenceEqual(yoklama.RowVersion))
                    {
                        ModelState.AddModelError(string.Empty, "Bu kayıt başka bir kullanıcı tarafından güncellendi. Lütfen sayfayı yenileyip tekrar deneyin.");
                        ViewBag.Ogrenciler = GetOgrencilerSelectList();
                        ViewBag.Gorevlisiler = GetGorevlisilerSelectList();
                        ViewBag.Durumlar = GetDurumlarSelectList();
                        return View(viewModel);
                    }

                    // Öğrenci kontrolü
                    var ogrenci = await _context.PansiyonOgrenciler.FindAsync(viewModel.PansiyonOgrenciId);
                    if (ogrenci == null || !ogrenci.Aktif)
                    {
                        ModelState.AddModelError("OgrenciId", "Seçilen öğrenci bulunamadı veya aktif değil.");
                        ViewBag.Ogrenciler = GetOgrencilerSelectList();
                        ViewBag.Gorevlisiler = GetGorevlisilerSelectList();
                        ViewBag.Durumlar = GetDurumlarSelectList();
                        return View(viewModel);
                    }

                    // Görevli kontrolü
                    var gorevlisi = await _context.PansiyonGorevlileri.FindAsync(viewModel.YoklamaYapanId);
                    if (gorevlisi == null || !gorevlisi.Aktif)
                    {
                        ModelState.AddModelError("YoklamaYapanId", "Seçilen görevli bulunamadı veya aktif değil.");
                        ViewBag.Ogrenciler = GetOgrencilerSelectList();
                        ViewBag.Gorevlisiler = GetGorevlisilerSelectList();
                        ViewBag.Durumlar = GetDurumlarSelectList();
                        return View(viewModel);
                    }

                    // Aynı öğrenci, aynı tarih ve saat için yoklama var mı kontrol et (kendisi hariç)
                    var mevcutYoklama = await _context.PansiyonYoklamalar
                        .FirstOrDefaultAsync(y => y.Id != id
                            && y.PansiyonOgrenciId == viewModel.PansiyonOgrenciId
                            && y.Tarih == viewModel.Tarih
                            && y.Saat == viewModel.Saat);

                    if (mevcutYoklama != null)
                    {
                        ModelState.AddModelError(string.Empty, "Bu öğrenci için aynı tarih ve saatte zaten bir yoklama kaydı var.");
                        ViewBag.Ogrenciler = GetOgrencilerSelectList();
                        ViewBag.Gorevlisiler = GetGorevlisilerSelectList();
                        ViewBag.Durumlar = GetDurumlarSelectList();
                        return View(viewModel);
                    }

                    yoklama.PansiyonOgrenciId = viewModel.PansiyonOgrenciId;
                    yoklama.YoklamaYapanId = viewModel.YoklamaYapanId;
                    yoklama.Tarih = viewModel.Tarih;
                    yoklama.Saat = viewModel.Saat;
                    yoklama.Durum = viewModel.Durum;
                    yoklama.Aciklama = viewModel.Aciklama;

                    _context.Update(yoklama);
                    await _context.SaveChangesAsync();
                    TempData["SuccessMessage"] = "Yoklama kaydı başarıyla güncellendi.";
                    return RedirectToAction(nameof(Index));
                }
                catch (DbUpdateConcurrencyException)
                {
                    if (!YoklamaExists(viewModel.Id))
                    {
                        return NotFound();
                    }
                    else
                    {
                        throw;
                    }
                }
            }
            ViewBag.Ogrenciler = GetOgrencilerSelectList();
            ViewBag.Gorevlisiler = GetGorevlisilerSelectList();
            ViewBag.Durumlar = GetDurumlarSelectList();
            return View(viewModel);
        }

        // GET: Yoklama/Delete/5
        public async Task<IActionResult> Delete(int? id)
        {
            if (id == null)
            {
                return NotFound();
            }

            var yoklama = await _context.PansiyonYoklamalar
                .Include(y => y.PansiyonOgrenci)
                .Include(y => y.YoklamaYapan)
                .FirstOrDefaultAsync(m => m.Id == id);

            if (yoklama == null)
            {
                return NotFound();
            }

            var viewModel = new PansiyonYoklamaViewModel
            {
                Id = yoklama.Id,
                PansiyonOgrenciId = yoklama.PansiyonOgrenciId,
                OgrenciAdSoyad = yoklama.PansiyonOgrenci.AdSoyad,
                OgrenciNo = yoklama.PansiyonOgrenci.OgrenciNo,
                YoklamaYapanId = yoklama.YoklamaYapanId,
                YoklamaYapanAdSoyad = yoklama.YoklamaYapan.AdSoyad,
                Tarih = yoklama.Tarih,
                Saat = yoklama.Saat,
                Durum = yoklama.Durum,
                Aciklama = yoklama.Aciklama,
                RowVersion = yoklama.RowVersion
            };

            return View(viewModel);
        }

        // POST: Yoklama/Delete/5
        [HttpPost, ActionName("Delete")]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> DeleteConfirmed(int id, byte[] rowVersion)
        {
            var yoklama = await _context.PansiyonYoklamalar.FindAsync(id);
            if (yoklama == null)
            {
                return NotFound();
            }

            // Concurrency check
            if (!rowVersion.SequenceEqual(yoklama.RowVersion))
            {
                TempData["ErrorMessage"] = "Bu kayıt başka bir kullanıcı tarafından güncellendi. Lütfen sayfayı yenileyip tekrar deneyin.";
                return RedirectToAction(nameof(Index));
            }

            _context.PansiyonYoklamalar.Remove(yoklama);
            await _context.SaveChangesAsync();
            TempData["SuccessMessage"] = "Yoklama kaydı başarıyla silindi.";
            return RedirectToAction(nameof(Index));
        }

        // GET: Yoklama/OgrenciYoklamalari/5
        public async Task<IActionResult> OgrenciYoklamalari(int? id, YoklamaFilterViewModel filter)
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

            filter.OgrenciId = id;

            var query = _context.PansiyonYoklamalar
                .Include(y => y.PansiyonOgrenci)
                .Include(y => y.YoklamaYapan)
                .Where(y => y.PansiyonOgrenciId == id)
                .AsQueryable();

            if (!string.IsNullOrWhiteSpace(filter.Durum))
            {
                query = query.Where(y => y.Durum == filter.Durum);
            }

            if (filter.BaslangicTarihi.HasValue)
            {
                query = query.Where(y => y.Tarih >= filter.BaslangicTarihi.Value);
            }

            if (filter.BitisTarihi.HasValue)
            {
                query = query.Where(y => y.Tarih <= filter.BitisTarihi.Value);
            }

            var yoklamalar = await query
                .OrderByDescending(y => y.Tarih)
                .ThenByDescending(y => y.Saat)
                .ToListAsync();

            var viewModel = new YoklamaListViewModel
            {
                Yoklamalar = yoklamalar.Select(y => new PansiyonYoklamaViewModel
                {
                    Id = y.Id,
                    PansiyonOgrenciId = y.PansiyonOgrenciId,
                    OgrenciAdSoyad = y.PansiyonOgrenci.AdSoyad,
                    OgrenciNo = y.PansiyonOgrenci.OgrenciNo,
                    YoklamaYapanId = y.YoklamaYapanId,
                    YoklamaYapanAdSoyad = y.YoklamaYapan.AdSoyad,
                    Tarih = y.Tarih,
                    Saat = y.Saat,
                    Durum = y.Durum,
                    Aciklama = y.Aciklama,
                    RowVersion = y.RowVersion
                }).ToList(),
                Filter = filter
            };

            ViewBag.Ogrenci = ogrenci;
            ViewBag.Durumlar = GetDurumlarSelectList();

            return View(viewModel);
        }

        // GET: Yoklama/GunlukYoklama
        public async Task<IActionResult> GunlukYoklama(DateTime? tarih)
        {
            var secilenTarih = tarih ?? DateTime.Today;

            var username = User.Identity?.Name;
            var gorevlisi = await _context.PansiyonGorevlileri.FirstOrDefaultAsync(g => g.KullaniciAdi == username);

            // Nöbetçi günü/Admin yetki kontrolü
            bool isAdmin = User.IsInRole("Admin") || (gorevlisi != null && gorevlisi.Rol == "Admin");
            ViewBag.IsAdmin = isAdmin;
            if (!isAdmin)
            {
                if (gorevlisi == null)
                {
                    TempData["ErrorMessage"] = "Yoklama alabilmek için pansiyon görevlisi olarak kayıtlı olmalısınız.";
                    return RedirectToAction("Index", "Home");
                }

                string targetDayName = secilenTarih.DayOfWeek switch
                {
                    DayOfWeek.Monday => "Pazartesi",
                    DayOfWeek.Tuesday => "Salı",
                    DayOfWeek.Wednesday => "Çarşamba",
                    DayOfWeek.Thursday => "Perşembe",
                    DayOfWeek.Friday => "Cuma",
                    DayOfWeek.Saturday => "Cumartesi",
                    DayOfWeek.Sunday => "Pazar",
                    _ => ""
                };

                bool hasPlan = await _context.NobetciPlanlar.AnyAsync(p => 
                    p.PansiyonGorevlisiId == gorevlisi.Id && 
                    p.BaslangicTarihi <= secilenTarih && 
                    p.BitisTarihi >= secilenTarih && 
                    p.Gun == targetDayName);

                if (!hasPlan)
                {
                    TempData["ErrorMessage"] = $"Seçilen tarih ({secilenTarih:dd.MM.yyyy}) için atanan bir nöbet planınız bulunmamaktadır. Yoklama alamazsınız.";
                    return RedirectToAction("Index", "Home");
                }
            }

            var yoklamalar = await _context.PansiyonYoklamalar
                .Include(y => y.PansiyonOgrenci)
                .Include(y => y.YoklamaYapan)
                .Where(y => y.Tarih == secilenTarih)
                .OrderBy(y => y.PansiyonOgrenci.AdSoyad)
                .ToListAsync();

            var tumOgrenciler = await _context.PansiyonOgrenciler
                .Include(o => o.Oda)
                .Where(o => o.Aktif)
                .OrderBy(o => o.AdSoyad)
                .ToListAsync();

            // Fetch approved leaves active on this date
            var onayliIzinler = await _context.IzinGirisleri
                .Where(i => i.Durum == yoklamaWeb.Models.Enums.IzinDurum.Onaylandi && i.BaslangicTarihi.Date <= secilenTarih.Date && i.BitisTarihi.Date >= secilenTarih.Date)
                .ToListAsync();
            var izinlerMap = onayliIzinler.ToLookup(i => i.OgrenciId);

            var yoklamalarMap = yoklamalar.ToDictionary(y => y.PansiyonOgrenciId);

            var viewModel = new GunlukYoklamaViewModel
            {
                Tarih = secilenTarih,
                Yoklamalar = tumOgrenciler.Select(o =>
                {
                    var ogrenciIzin = izinlerMap[o.Id].FirstOrDefault();
                    string? izinBilgisi = ogrenciIzin != null
                        ? $"{ogrenciIzin.Tur switch {
                            yoklamaWeb.Models.Enums.IzinTur.Hastalik => "Sağlık İzni",
                            yoklamaWeb.Models.Enums.IzinTur.AileZiyareti => "Evci İzni",
                            yoklamaWeb.Models.Enums.IzinTur.ResmiIs => "Resmi İzin",
                            _ => "Diğer İzin"
                          }} ({ogrenciIzin.BaslangicTarihi:dd.MM.yyyy} - {ogrenciIzin.BitisTarihi:dd.MM.yyyy})"
                        : null;

                    if (yoklamalarMap.TryGetValue(o.Id, out var y))
                    {
                        return new PansiyonYoklamaViewModel
                        {
                            Id = y.Id,
                            PansiyonOgrenciId = o.Id,
                            OgrenciAdSoyad = o.AdSoyad,
                            OgrenciNo = o.OgrenciNo,
                            OdaNo = o.Oda?.OdaNo,
                            YoklamaYapanId = y.YoklamaYapanId,
                            YoklamaYapanAdSoyad = y.YoklamaYapan?.AdSoyad ?? "",
                            Tarih = y.Tarih,
                            Saat = y.Saat,
                            Durum = y.Durum,
                            Aciklama = y.Aciklama,
                            IzinBilgisi = izinBilgisi,
                            RowVersion = y.RowVersion
                        };
                    }
                    else
                    {
                        return new PansiyonYoklamaViewModel
                        {
                            Id = 0,
                            PansiyonOgrenciId = o.Id,
                            OgrenciAdSoyad = o.AdSoyad,
                            OgrenciNo = o.OgrenciNo,
                            OdaNo = o.Oda?.OdaNo,
                            Tarih = secilenTarih,
                            Durum = ogrenciIzin != null ? "Izinli" : "Belirtilmemiş",
                            Aciklama = ogrenciIzin != null ? "Sistem tarafından otomatik izinli işaretlendi." : "",
                            IzinBilgisi = izinBilgisi
                        };
                    }
                }).ToList(),
                TumOgrenciler = tumOgrenciler.Select(o => new PansiyonOgrenciViewModel
                {
                    Id = o.Id,
                    AdSoyad = o.AdSoyad,
                    OgrenciNo = o.OgrenciNo,
                    OdaNo = o.Oda != null ? o.Oda.OdaNo : null,
                    Aktif = o.Aktif
                }).ToList()
            };

            // Yoklaması olmayan öğrencileri işaretle
            var yoklamasiOlanOgrenciIds = yoklamalar.Select(y => y.PansiyonOgrenciId).ToHashSet();
            foreach (var ogrenci in viewModel.TumOgrenciler)
            {
                ogrenci.YoklamaYapildi = yoklamasiOlanOgrenciIds.Contains(ogrenci.Id);
            }

            return View(viewModel);
        }

                // GET: Yoklama/ExportExcel
        [HttpGet]
        [PansiyonAdminAuthorize]
        public async Task<IActionResult> ExportExcel(DateTime? tarih)
        {
            var secilenTarih = tarih ?? DateTime.Today;
            var yoklamalar = await _context.PansiyonYoklamalar
                .Include(y => y.PansiyonOgrenci)
                .Include(y => y.YoklamaYapan)
                .Where(y => y.Tarih == secilenTarih)
                .OrderBy(y => y.PansiyonOgrenci.AdSoyad)
                .ToListAsync();

            var tumOgrenciler = await _context.PansiyonOgrenciler
                .Include(o => o.Oda)
                .Where(o => o.Aktif)
                .OrderBy(o => o.AdSoyad)
                .ToListAsync();

            var onayliIzinler = await _context.IzinGirisleri
                .Where(i => i.Durum == yoklamaWeb.Models.Enums.IzinDurum.Onaylandi && i.BaslangicTarihi.Date <= secilenTarih.Date && i.BitisTarihi.Date >= secilenTarih.Date)
                .ToListAsync();
            var izinlerMap = onayliIzinler.ToLookup(i => i.OgrenciId);

            var workbook = new XLWorkbook();
            var worksheet = workbook.Worksheets.Add("Yoklama");
            worksheet.Cell(1, 1).Value = "Öğrenci No";
            worksheet.Cell(1, 2).Value = "Ad Soyad";
            worksheet.Cell(1, 3).Value = "Oda No";
            worksheet.Cell(1, 4).Value = "Durum";
            worksheet.Cell(1, 5).Value = "Yoklama Yapan";
            worksheet.Cell(1, 6).Value = "İzin Bilgisi";
            worksheet.Row(1).Style.Font.Bold = true;

            int row = 2;
            foreach (var o in tumOgrenciler)
            {
                var izin = izinlerMap[o.Id].FirstOrDefault();
                var yoklama = yoklamalar.FirstOrDefault(y => y.PansiyonOgrenciId == o.Id);
                worksheet.Cell(row, 1).Value = o.OgrenciNo;
                worksheet.Cell(row, 2).Value = o.AdSoyad;
                worksheet.Cell(row, 3).Value = o.Oda?.OdaNo ?? "-";
                if (yoklama != null)
                {
                    worksheet.Cell(row, 4).Value = yoklama.Durum;
                    worksheet.Cell(row, 5).Value = yoklama.YoklamaYapan?.AdSoyad ?? "";
                }
                else
                {
                    worksheet.Cell(row, 4).Value = izin != null ? "İzinli" : "Var";
                    worksheet.Cell(row, 5).Value = "";
                }
                if (izin != null)
                {
                    worksheet.Cell(row, 6).Value = $"{izin.Tur} ({izin.BaslangicTarihi:dd.MM.yyyy} - {izin.BitisTarihi:dd.MM.yyyy})";
                }
                row++;
            }

            using var stream = new MemoryStream();
            workbook.SaveAs(stream);
            stream.Seek(0, SeekOrigin.Begin);
            var fileName = $"Yoklama_{secilenTarih:yyyyMMdd}.xlsx";
            return File(stream.ToArray(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", fileName);
        }

        // POST: Yoklama/TopluYoklama
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> TopluYoklama(GunlukYoklamaViewModel viewModel)
        {
            var username = User.Identity?.Name;
            var gorevlisi = await _context.PansiyonGorevlileri.FirstOrDefaultAsync(g => g.KullaniciAdi == username);

            // Nöbetçi günü/Admin yetki kontrolü
            bool isAdmin = User.IsInRole("Admin") || (gorevlisi != null && gorevlisi.Rol == "Admin");
            if (!isAdmin)
            {
                if (gorevlisi == null)
                {
                    TempData["ErrorMessage"] = "Yoklama alabilmek için pansiyon görevlisi olarak kayıtlı olmalısınız.";
                    return RedirectToAction("Index", "Home");
                }

                string targetDayName = viewModel.Tarih.DayOfWeek switch
                {
                    DayOfWeek.Monday => "Pazartesi",
                    DayOfWeek.Tuesday => "Salı",
                    DayOfWeek.Wednesday => "Çarşamba",
                    DayOfWeek.Thursday => "Perşembe",
                    DayOfWeek.Friday => "Cuma",
                    DayOfWeek.Saturday => "Cumartesi",
                    DayOfWeek.Sunday => "Pazar",
                    _ => ""
                };

                bool hasPlan = await _context.NobetciPlanlar.AnyAsync(p => 
                    p.PansiyonGorevlisiId == gorevlisi.Id && 
                    p.BaslangicTarihi <= viewModel.Tarih && 
                    p.BitisTarihi >= viewModel.Tarih && 
                    p.Gun == targetDayName);

                if (!hasPlan)
                {
                    TempData["ErrorMessage"] = $"Seçilen tarih ({viewModel.Tarih:dd.MM.yyyy}) için atanan bir nöbet planınız bulunmamaktadır. Yoklama alamazsınız.";
                    return RedirectToAction("Index", "Home");
                }
            }

            if (ModelState.IsValid)
            {
                var gorevlisiId = gorevlisi?.Id ?? 1;

                foreach (var ogrenciYoklama in viewModel.Yoklamalar)
                {
                    if (ogrenciYoklama.PansiyonOgrenciId > 0)
                    {
                        var mevcutYoklama = await _context.PansiyonYoklamalar
                            .FirstOrDefaultAsync(y => y.PansiyonOgrenciId == ogrenciYoklama.PansiyonOgrenciId
                                && y.Tarih == viewModel.Tarih);

                        if (mevcutYoklama != null)
                        {
                            // Güncelle
                            mevcutYoklama.YoklamaYapanId = gorevlisiId;
                            mevcutYoklama.Saat = ogrenciYoklama.Saat;
                            mevcutYoklama.Durum = ogrenciYoklama.Durum;
                            mevcutYoklama.Aciklama = ogrenciYoklama.Aciklama;
                            _context.Update(mevcutYoklama);
                        }
                        else
                        {
                            // Yeni ekle
                            var yeniYoklama = new PansiyonYoklama
                            {
                                PansiyonOgrenciId = ogrenciYoklama.PansiyonOgrenciId,
                                YoklamaYapanId = gorevlisiId,
                                Tarih = viewModel.Tarih,
                                Saat = ogrenciYoklama.Saat,
                                Durum = ogrenciYoklama.Durum,
                                Aciklama = ogrenciYoklama.Aciklama
                            };
                            _context.Add(yeniYoklama);
                        }
                    }
                }

                await _context.SaveChangesAsync();
                TempData["SuccessMessage"] = "Toplu yoklama kaydedildi.";
                return RedirectToAction(nameof(GunlukYoklama), new { tarih = viewModel.Tarih });
            }

            return RedirectToAction(nameof(GunlukYoklama), new { tarih = viewModel.Tarih });
        }

        private List<SelectListItem> GetOgrencilerSelectList()
        {
            return _context.PansiyonOgrenciler
                .Where(o => o.Aktif)
                .OrderBy(o => o.AdSoyad)
                .Select(o => new SelectListItem { Value = o.Id.ToString(), Text = $"{o.AdSoyad} ({o.OgrenciNo})" })
                .ToList();
        }

        private List<SelectListItem> GetGorevlisilerSelectList()
        {
            return _context.PansiyonGorevlileri
                .Where(g => g.Aktif)
                .OrderBy(g => g.AdSoyad)
                .Select(g => new SelectListItem { Value = g.Id.ToString(), Text = g.AdSoyad })
                .ToList();
        }

        private List<SelectListItem> GetDurumlarSelectList()
        {
            return new List<SelectListItem>
            {
                new SelectListItem { Value = "Belirtilmemiş", Text = "Belirtilmemiş" },
                new SelectListItem { Value = "Var", Text = "Var" },
                new SelectListItem { Value = "Yok", Text = "Yok" },
                new SelectListItem { Value = "Izinli", Text = "İzinli" },
                new SelectListItem { Value = "Gecikmeli", Text = "Gecikmeli" }
            };
        }

        // DTO for AJAX update
        public class AttendanceUpdateDto
        {
            public int Id { get; set; }
            public int PansiyonOgrenciId { get; set; }
            public string Durum { get; set; }
            public DateTime Tarih { get; set; }
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> UpdateAttendanceStatus([FromBody] AttendanceUpdateDto dto)
        {
            if (dto == null || string.IsNullOrWhiteSpace(dto.Durum))
                return BadRequest();

            // Identify the current logged‑in staff (yoklamacı)
            var username = User.Identity?.Name;
            var gorevlisi = await _context.PansiyonGorevlileri.FirstOrDefaultAsync(g => g.KullaniciAdi == username);
            int gorevlisiId = gorevlisi?.Id ?? 0;

            var yoklama = await _context.PansiyonYoklamalar.FirstOrDefaultAsync(y => y.Id == dto.Id);
            if (yoklama == null)
            {
                // Create new record if it does not exist (e.g., Id == 0)
                yoklama = new PansiyonYoklama
                {
                    PansiyonOgrenciId = dto.PansiyonOgrenciId,
                    Tarih = dto.Tarih != default ? dto.Tarih.Date : DateTime.Today,
                    Saat = DateTime.Now.TimeOfDay,
                    Durum = dto.Durum,
                    YoklamaYapanId = gorevlisiId
                };
                _context.PansiyonYoklamalar.Add(yoklama);
            }
            else
            {
                yoklama.Durum = dto.Durum;
                yoklama.Saat = DateTime.Now.TimeOfDay;
                yoklama.YoklamaYapanId = gorevlisiId;
                _context.Update(yoklama);
            }
            await _context.SaveChangesAsync();
            return Json(new { success = true, saat = yoklama.Saat, yoklamaYapanId = yoklama.YoklamaYapanId });
        }

        private bool YoklamaExists(int id)
        {
            return _context.PansiyonYoklamalar.Any(e => e.Id == id);
        }
    }
}