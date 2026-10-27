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
                Filter = filter,
                Tarih = filter.BaslangicTarihi ?? DateTime.Today
            };

            ViewBag.Ogrenci = ogrenci;
            ViewBag.Durumlar = GetDurumlarSelectList();

            return View(viewModel);
        }
// GET: Yoklama/GunlukYoklama
        public async Task<IActionResult> GunlukYoklama(DateTime? tarih, YoklamaFilterViewModel filter = null)
        {
            if (filter == null) filter = new YoklamaFilterViewModel();
            var secilenTarih = tarih ?? DateTime.Today;

            var activeYoklamaTurleri = await _context.YoklamaTurleri.Where(y => y.Aktif).OrderBy(y => y.Sira).ToListAsync();
            ViewBag.YoklamaTurleri = activeYoklamaTurleri;

            int secilenYoklamaNo = filter.YoklamaNo ?? 0;
            if (secilenYoklamaNo == 0 || !activeYoklamaTurleri.Any(y => y.Id == secilenYoklamaNo))
            {
                secilenYoklamaNo = activeYoklamaTurleri.FirstOrDefault()?.Id ?? 1;
            }
            filter.YoklamaNo = secilenYoklamaNo;

            var username = User.Identity?.Name ?? "";
            var gorevlisi = await _context.PansiyonGorevlileri.FirstOrDefaultAsync(g => g.KullaniciAdi.ToLower() == username.ToLower());

            // Nöbetçi günü/Admin/İdareci yetki kontrolü
            bool isAdmin = User.IsInRole("Admin") || User.IsInRole("Idareci") || (gorevlisi != null && gorevlisi.Rol == "Admin");
            
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
                .Include(y => y.PansiyonOgrenci.Oda)
                .Include(y => y.YoklamaYapan)
                .Where(y => y.Tarih == secilenTarih && y.YoklamaNo == secilenYoklamaNo)
                .ToListAsync();

            var tumOgrenciler = await _context.PansiyonOgrenciler
                .Include(o => o.Oda)
                .Include(o => o.Etut)
                .Where(o => o.Aktif)
                .OrderBy(o => o.AdSoyad)
                .ToListAsync();

            // Fetch approved leaves active on this date
            var onayliIzinler = await _context.IzinGirisleri
                .Where(i => i.Durum == yoklamaWeb.Models.Enums.IzinDurum.Onaylandi && i.BaslangicTarihi.Date <= secilenTarih.Date && i.BitisTarihi.Date >= secilenTarih.Date)
                .ToListAsync();
            var izinlerMap = onayliIzinler.ToLookup(i => i.OgrenciId);

            var yoklamalarMap = yoklamalar.GroupBy(y => y.PansiyonOgrenciId).ToDictionary(g => g.Key, g => g.First());

            // Build view model
            var viewModel = new YoklamaListViewModel
            {
                Yoklamalar = tumOgrenciler.Select(o => {
                    var y = yoklamalarMap.ContainsKey(o.Id) ? yoklamalarMap[o.Id] : null;

                    var studentLeaves = izinlerMap[o.Id];
                    IzinGirisi activeLeave = null;
                    foreach (var leave in studentLeaves)
                    {
                        if (leave.Tur == yoklamaWeb.Models.Enums.IzinTur.GecGelme)
                        {
                            var nos = (leave.IzinliYoklamaNolar ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries);
                            if (nos.Contains(secilenYoklamaNo.ToString()))
                            {
                                activeLeave = leave;
                                break;
                            }
                        }
                        else
                        {
                            activeLeave = leave;
                            break;
                        }
                    }

                    string izinBilgisi = null;
                    string defaultStatus = "blrsiz";
                    if (activeLeave != null)
                    {
                        defaultStatus = "İzinli";
                        if (activeLeave.Tur == yoklamaWeb.Models.Enums.IzinTur.GecGelme)
                        {
                            var formattedNos = string.Join(", ", (activeLeave.IzinliYoklamaNolar ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries).Select(n => n + ". Yoklama"));
                            izinBilgisi = $"Geç Gelme İzni ({formattedNos}) - {activeLeave.Aciklama}";
                        }
                        else
                        {
                            string turStr = activeLeave.Tur switch
                            {
                                yoklamaWeb.Models.Enums.IzinTur.Hastalik => "Hastalık İzni",
                                yoklamaWeb.Models.Enums.IzinTur.AileZiyareti => "Aile Ziyareti İzni",
                                yoklamaWeb.Models.Enums.IzinTur.ResmiIs => "Resmi İş İzni",
                                yoklamaWeb.Models.Enums.IzinTur.Diger => "Diğer İzin",
                                _ => activeLeave.Tur.ToString()
                            };
                            izinBilgisi = $"{turStr} - {activeLeave.Aciklama}";
                        }
                    }

                    return new PansiyonYoklamaViewModel
                    {
                        Id = y?.Id ?? 0,
                        PansiyonOgrenciId = o.Id,
                        OgrenciAdSoyad = o.AdSoyad,
                        OgrenciNo = o.OgrenciNo,
                        YoklamaYapanId = y?.YoklamaYapanId ?? 0,
                        YoklamaYapanAdSoyad = y?.YoklamaYapan?.AdSoyad,
                        Tarih = secilenTarih,
                        Saat = y?.Saat,
                        Durum = y?.Durum ?? defaultStatus,
                        Aciklama = y?.Aciklama,
                        RowVersion = y?.RowVersion,
                        OdaNo = o.Oda?.OdaNo,
                        EtutId = o.EtutId,
                        EtutAdi = o.Etut?.EtutAdi,
                        Telefon = o.Telefon,
                        VeliTelefon = o.VeliTelefon,
                        YoklamaNo = secilenYoklamaNo,
                        IzinBilgisi = izinBilgisi
                    };
                }).ToList(),
                Filter = filter,
                Tarih = secilenTarih
            };

            // Prepare distinct room numbers for filter dropdown
            var distinctRooms = await _context.Odalar
                .Where(o => o != null)
                .Select(o => o.OdaNo)
                .Distinct()
                .OrderBy(r => r)
                .ToListAsync();
            distinctRooms.Insert(0, "Odası olmayan");
            ViewBag.RoomList = distinctRooms;

            // Prepare distinct study halls for filter dropdown
            var distinctEtuts = await _context.Etutler
                .Where(e => e.Aktif)
                .OrderBy(e => e.EtutAdi)
                .Select(e => new SelectListItem { Value = e.Id.ToString(), Text = e.EtutAdi })
                .ToListAsync();
            ViewBag.EtutList = distinctEtuts;

            // Apply room filter if provided
            if (!string.IsNullOrWhiteSpace(filter?.OdaNo))
            {
                if (filter.OdaNo == "Odası olmayan")
                {
                    viewModel.Yoklamalar = viewModel.Yoklamalar
                        .Where(y => y.OdaNo == null)
                        .ToList();
                }
                else
                {
                    viewModel.Yoklamalar = viewModel.Yoklamalar
                        .Where(y => y.OdaNo != null && y.OdaNo.Equals(filter.OdaNo))
                        .ToList();
                }
            }

            // Apply study hall filter if provided
            if (filter?.EtutId.HasValue == true)
            {
                viewModel.Yoklamalar = viewModel.Yoklamalar
                    .Where(y => y.EtutId == filter.EtutId.Value)
                    .ToList();
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

            // Aktif yoklama türlerini al (veya var olan kayıtların yoklama numaraları)
            var yoklamaTurleri = await _context.YoklamaTurleri
                .Where(t => t.Aktif)
                .OrderBy(t => t.Sira)
                .ToListAsync();

            if (!yoklamaTurleri.Any())
            {
                // Fallback eğer yoklama türü tanımlı değilse
                yoklamaTurleri = new List<yoklamaWeb.Models.YoklamaTuru>
                {
                    new yoklamaWeb.Models.YoklamaTuru { Id = 1, Ad = "Yoklama 1", Sira = 1 }
                };
            }

            var workbook = new XLWorkbook();
            var worksheet = workbook.Worksheets.Add("Yoklama");

            int baseColCount = 3; // Öğrenci No, Ad Soyad, Oda No
            int colsPerYoklama = 4; // Durum, Yoklama Yapan ve Saati, Açıklama, İzin Bilgisi
            int totalCols = baseColCount + (yoklamaTurleri.Count * colsPerYoklama);

            // SATIR 1: Üst Başlık Header Banner
            var titleRange = worksheet.Range(1, 1, 1, totalCols);
            titleRange.Merge();
            titleRange.Value = $"{secilenTarih:dd.MM.yyyy} Tarihli Yoklama Çizelgesi";
            titleRange.Style.Font.Bold = true;
            titleRange.Style.Font.SetFontSize(16);
            titleRange.Style.Font.SetFontColor(XLColor.White);
            titleRange.Style.Fill.BackgroundColor = XLColor.FromHtml("#1e1b4b");
            titleRange.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
            titleRange.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
            worksheet.Row(1).Height = 35;

            // SATIR 2: Sabit Başlıklar + Yoklama Tür Grubu Başlıkları
            worksheet.Range(2, 1, 3, 1).Merge().Value = "Öğrenci No";
            worksheet.Range(2, 2, 3, 2).Merge().Value = "Ad Soyad";
            worksheet.Range(2, 3, 3, 3).Merge().Value = "Oda No";

            int colIndex = baseColCount + 1;
            foreach (var tur in yoklamaTurleri)
            {
                var turHeaderRange = worksheet.Range(2, colIndex, 2, colIndex + colsPerYoklama - 1);
                turHeaderRange.Merge();
                turHeaderRange.Value = tur.Ad;
                turHeaderRange.Style.Font.Bold = true;
                turHeaderRange.Style.Font.SetFontSize(12);
                turHeaderRange.Style.Font.SetFontColor(XLColor.White);
                turHeaderRange.Style.Fill.BackgroundColor = XLColor.FromHtml("#4f46e5");
                turHeaderRange.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;

                // SATIR 3: Yoklama Türü Alt Sütunları
                worksheet.Cell(3, colIndex).Value = "Durum";
                worksheet.Cell(3, colIndex + 1).Value = "Yoklama Yapan / Saati";
                worksheet.Cell(3, colIndex + 2).Value = "Açıklama";
                worksheet.Cell(3, colIndex + 3).Value = "İzin Bilgisi";

                colIndex += colsPerYoklama;
            }

            // Satır 2 ve 3 başlık stilleri
            var subHeaderRange = worksheet.Range(2, 1, 3, totalCols);
            subHeaderRange.Style.Font.Bold = true;
            subHeaderRange.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
            subHeaderRange.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;

            // Sabit 1-3 sütunlar için gri arka plan
            var baseHeaderRange = worksheet.Range(2, 1, 3, baseColCount);
            baseHeaderRange.Style.Fill.BackgroundColor = XLColor.FromHtml("#313150");
            baseHeaderRange.Style.Font.SetFontColor(XLColor.White);

            // Satır 3 alt sütun başlıkları için açık mavi stil
            var colSubHeaderRange = worksheet.Range(3, baseColCount + 1, 3, totalCols);
            colSubHeaderRange.Style.Fill.BackgroundColor = XLColor.FromHtml("#e0e7ff");
            colSubHeaderRange.Style.Font.SetFontColor(XLColor.FromHtml("#1e1b4b"));

            // SATIR 4 ve Sonrası: Öğrenci Verileri
            int row = 4;
            foreach (var ogrenci in tumOgrenciler)
            {
                worksheet.Cell(row, 1).Value = ogrenci.OgrenciNo;
                worksheet.Cell(row, 2).Value = ogrenci.AdSoyad;
                worksheet.Cell(row, 3).Value = ogrenci.Oda?.OdaNo ?? "-";

                var izin = izinlerMap[ogrenci.Id].FirstOrDefault();
                string izinText = izin != null ? $"{izin.Tur} ({izin.BaslangicTarihi:dd.MM.yyyy} - {izin.BitisTarihi:dd.MM.yyyy})" : "";

                colIndex = baseColCount + 1;
                foreach (var tur in yoklamaTurleri)
                {
                    var yoklama = yoklamalar.FirstOrDefault(y => y.PansiyonOgrenciId == ogrenci.Id && y.YoklamaNo == tur.Id);

                    string durumText = "";
                    string yapanText = "";
                    string aciklamaText = yoklama?.Aciklama ?? "";

                    if (yoklama != null)
                    {
                        durumText = string.IsNullOrWhiteSpace(yoklama.Durum) || yoklama.Durum == "blrsiz" ? "Belirtilmemiş" : yoklama.Durum;
                        
                        var yapanAd = yoklama.YoklamaYapan?.AdSoyad ?? "";
                        var saatStr = yoklama.Saat.HasValue ? yoklama.Saat.Value.ToString(@"hh\:mm") : "";
                        yapanText = !string.IsNullOrEmpty(yapanAd) ? $"{yapanAd} {(string.IsNullOrEmpty(saatStr) ? "" : $"({saatStr})")}".Trim() : "";
                    }
                    else
                    {
                        durumText = izin != null ? "İzinli" : "Belirtilmemiş";
                    }

                    worksheet.Cell(row, colIndex).Value = durumText;
                    worksheet.Cell(row, colIndex + 1).Value = yapanText;
                    worksheet.Cell(row, colIndex + 2).Value = aciklamaText;
                    worksheet.Cell(row, colIndex + 3).Value = izinText;

                    // Durum renklendirme
                    var cellDurum = worksheet.Cell(row, colIndex);
                    if (durumText == "Var")
                    {
                        cellDurum.Style.Font.SetFontColor(XLColor.FromHtml("#059669"));
                        cellDurum.Style.Font.Bold = true;
                    }
                    else if (durumText == "Yok")
                    {
                        cellDurum.Style.Font.SetFontColor(XLColor.FromHtml("#dc2626"));
                        cellDurum.Style.Font.Bold = true;
                    }
                    else if (durumText == "İzinli" || durumText == "Izinli")
                    {
                        cellDurum.Style.Font.SetFontColor(XLColor.FromHtml("#d97706"));
                        cellDurum.Style.Font.Bold = true;
                    }
                    else if (durumText == "Geç" || durumText == "Gecikmeli")
                    {
                        cellDurum.Style.Font.SetFontColor(XLColor.FromHtml("#2563eb"));
                        cellDurum.Style.Font.Bold = true;
                    }

                    colIndex += colsPerYoklama;
                }

                row++;
            }

            // Tablo çerçevesi ve biçimlendirmeler
            var dataRange = worksheet.Range(1, 1, row - 1, totalCols);
            dataRange.Style.Border.OutsideBorder = XLBorderStyleValues.Thin;
            dataRange.Style.Border.InsideBorder = XLBorderStyleValues.Thin;
            dataRange.Style.Border.OutsideBorderColor = XLColor.FromHtml("#cbd5e1");
            dataRange.Style.Border.InsideBorderColor = XLColor.FromHtml("#e2e8f0");

            worksheet.Columns(1, totalCols).AdjustToContents();

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
            var username = User.Identity?.Name ?? "";
            var gorevlisi = await _context.PansiyonGorevlileri.FirstOrDefaultAsync(g => g.KullaniciAdi.ToLower() == username.ToLower());

            // Nöbetçi günü/Admin/İdareci yetki kontrolü
            bool isAdmin = User.IsInRole("Admin") || User.IsInRole("Idareci") || (gorevlisi != null && gorevlisi.Rol == "Admin");
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
                                && y.Tarih == viewModel.Tarih
                                && y.YoklamaNo == viewModel.YoklamaNo);

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
                                YoklamaNo = viewModel.YoklamaNo,
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
                return RedirectToAction(nameof(GunlukYoklama), new { tarih = viewModel.Tarih, yoklamaNo = viewModel.YoklamaNo });
            }

            return RedirectToAction(nameof(GunlukYoklama), new { tarih = viewModel.Tarih, yoklamaNo = viewModel.YoklamaNo });
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
            public int YoklamaNo { get; set; }
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> UpdateAttendanceStatus([FromBody] AttendanceUpdateDto dto)
        {
            if (dto == null || string.IsNullOrWhiteSpace(dto.Durum))
                return BadRequest();

            var username = User.Identity?.Name ?? "";
            var gorevlisi = await _context.PansiyonGorevlileri.FirstOrDefaultAsync(g => g.KullaniciAdi.ToLower() == username.ToLower());
            int gorevlisiId = gorevlisi?.Id ?? 0;

            PansiyonYoklama yoklama = null;
            if (dto.Id > 0)
            {
                yoklama = await _context.PansiyonYoklamalar.FirstOrDefaultAsync(y => y.Id == dto.Id);
            }
            else
            {
                var targetDate = dto.Tarih != default ? dto.Tarih.Date : DateTime.Today;
                int targetYoklamaNo = dto.YoklamaNo > 0 ? dto.YoklamaNo : 1;
                yoklama = await _context.PansiyonYoklamalar.FirstOrDefaultAsync(y => 
                    y.PansiyonOgrenciId == dto.PansiyonOgrenciId 
                    && y.Tarih == targetDate 
                    && y.YoklamaNo == targetYoklamaNo);
            }

            if (yoklama == null)
            {
                // Create new record if it does not exist
                yoklama = new PansiyonYoklama
                {
                    PansiyonOgrenciId = dto.PansiyonOgrenciId,
                    Tarih = dto.Tarih != default ? dto.Tarih.Date : DateTime.Today,
                    YoklamaNo = dto.YoklamaNo > 0 ? dto.YoklamaNo : 1,
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
            string yapanAdSoyad = gorevlisi?.AdSoyad ?? "Bilinmiyor";
            return Json(new { 
                success = true, 
                id = yoklama.Id, 
                saat = yoklama.Saat?.ToString(@"hh\:mm"), 
                tarih = yoklama.Tarih.ToString("dd.MM.yyyy"),
                yoklamaYapanAdSoyad = yapanAdSoyad 
            });
        }
        // DTO for note update via AJAX
        public class NoteUpdateDto
        {
            public int Id { get; set; }
            public string Note { get; set; }
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> UpdateNote([FromBody] NoteUpdateDto dto)
        {
            if (dto == null)
                return BadRequest();

            var yoklama = await _context.PansiyonYoklamalar.FirstOrDefaultAsync(y => y.Id == dto.Id);
            if (yoklama == null)
                return NotFound();

            yoklama.Aciklama = dto.Note;
            _context.Update(yoklama);
            await _context.SaveChangesAsync();
            return Json(new { success = true });
        }

        private bool YoklamaExists(int id)
        {
            return _context.PansiyonYoklamalar.Any(e => e.Id == id);
        }
    }
}