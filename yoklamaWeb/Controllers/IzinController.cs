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
    [Authorize]
    public class IzinController : Controller
    {
        private readonly AppDbContext _context;

        public IzinController(AppDbContext context)
        {
            _context = context;
        }

        // GET: Izin
        [PansiyonAdminAuthorize]
        public async Task<IActionResult> Index(IzinFilterViewModel filter)
        {
            var query = _context.IzinGirisleri
                .Include(i => i.Ogrenci)
                .Include(i => i.Onaylayan)
                .Include(i => i.TalepEden)
                .AsQueryable();

            if (!string.IsNullOrWhiteSpace(filter.Arama))
            {
                query = query.Where(i => i.Ogrenci.AdSoyad.Contains(filter.Arama)
                    || i.Ogrenci.OgrenciNo.Contains(filter.Arama)
                    || i.Aciklama.Contains(filter.Arama)
                    || (i.Onaylayan != null && i.Onaylayan.AdSoyad.Contains(filter.Arama))
                    || (i.TalepEden != null && i.TalepEden.AdSoyad.Contains(filter.Arama)));
            }

            if (filter.OgrenciId.HasValue)
            {
                query = query.Where(i => i.OgrenciId == filter.OgrenciId.Value);
            }

            if (filter.Durum.HasValue)
            {
                query = query.Where(i => i.Durum == filter.Durum.Value);
            }

            if (filter.Tur.HasValue)
            {
                query = query.Where(i => i.Tur == filter.Tur.Value);
            }

            if (filter.BaslangicTarihi.HasValue)
            {
                query = query.Where(i => i.BaslangicTarihi >= filter.BaslangicTarihi.Value);
            }

            if (filter.BitisTarihi.HasValue)
            {
                query = query.Where(i => i.BitisTarihi <= filter.BitisTarihi.Value);
            }

            var izinler = await query
                .OrderByDescending(i => i.BaslangicTarihi)
                .ThenByDescending(i => i.OlusturmaTarihi)
                .ToListAsync();

            var viewModel = new IzinListViewModel
            {
                Izinler = izinler.Select(i => new PansiyonIzinViewModel
                {
                    Id = i.Id,
                    OgrenciId = i.OgrenciId,
                    OgrenciAdSoyad = i.Ogrenci.AdSoyad,
                    OgrenciNo = i.Ogrenci.OgrenciNo,
                    Tur = i.Tur,
                    BaslangicTarihi = i.BaslangicTarihi,
                    BitisTarihi = i.BitisTarihi,
                    GunSayisi = i.GunSayisi,
                    Durum = i.Durum,
                    Aciklama = i.Aciklama,
                    TalepEdenId = i.TalepEdenId,
                    TalepEdenAdSoyad = i.TalepEden?.AdSoyad,
                    OnaylayanId = i.OnaylayanId,
                    OnaylayanAdSoyad = i.Onaylayan?.AdSoyad,
                    OnayTarihi = i.OnayTarihi,
                    OlusturmaTarihi = i.OlusturmaTarihi,
                    RowVersion = i.RowVersion
                }).ToList(),
                Filter = filter
            };

            ViewBag.Ogrenciler = await _context.PansiyonOgrenciler
                .Where(o => o.Aktif)
                .OrderBy(o => o.AdSoyad)
                .Select(o => new SelectListItem { Value = o.Id.ToString(), Text = $"{o.AdSoyad} ({o.OgrenciNo})" })
                .ToListAsync();

            ViewBag.Durumlar = Enum.GetValues(typeof(IzinDurum))
                .Cast<IzinDurum>()
                .Select(d => new SelectListItem { Value = ((int)d).ToString(), Text = d.ToString() })
                .ToList();

            ViewBag.Turler = Enum.GetValues(typeof(IzinTur))
                .Cast<IzinTur>()
                .Select(t => new SelectListItem { Value = ((int)t).ToString(), Text = t.ToString() })
                .ToList();

            ViewBag.YoklamaTurleriMap = await _context.YoklamaTurleri
                .ToDictionaryAsync(y => y.Id, y => y.Ad);

            return View(viewModel);
        }

        // GET: Izin/Details/5
        [PansiyonAdminAuthorize]
        public async Task<IActionResult> Details(int? id)
        {
            if (id == null)
            {
                return NotFound();
            }

            var izin = await _context.IzinGirisleri
                .Include(i => i.Ogrenci)
                .Include(i => i.Onaylayan)
                .Include(i => i.TalepEden)
                .FirstOrDefaultAsync(m => m.Id == id);

            if (izin == null)
            {
                return NotFound();
            }

            var viewModel = new IzinGirisiViewModel
            {
                Id = izin.Id,
                OgrenciId = izin.OgrenciId,
                OgrenciAdSoyad = izin.Ogrenci.AdSoyad,
                OgrenciNo = izin.Ogrenci.OgrenciNo,
                Tur = izin.Tur,
                BaslangicTarihi = izin.BaslangicTarihi,
                BitisTarihi = izin.BitisTarihi,
                GunSayisi = izin.GunSayisi,
                Durum = izin.Durum,
                Aciklama = izin.Aciklama,
                TalepEdenId = izin.TalepEdenId,
                TalepEdenAdSoyad = izin.TalepEden?.AdSoyad,
                OnaylayanId = izin.OnaylayanId,
                OnaylayanAdSoyad = izin.Onaylayan?.AdSoyad,
                OnayTarihi = izin.OnayTarihi,
                OlusturmaTarihi = izin.OlusturmaTarihi,
                RowVersion = izin.RowVersion
            };

            ViewBag.YoklamaTurleriMap = await _context.YoklamaTurleri
                .ToDictionaryAsync(y => y.Id, y => y.Ad);

            return View(viewModel);
        }

        // GET: Izin/Create
        public async Task<IActionResult> Create()
        {
            var viewModel = new IzinCreateViewModel
            {
                BaslangicTarihi = DateTime.Today,
                BitisTarihi = DateTime.Today.AddDays(1)
            };
            await LoadIzinFormViewBagsAsync();
            return View(viewModel);
        }

        // POST: Izin/Create
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> Create(IzinCreateViewModel viewModel)
        {
            if (ModelState.IsValid)
            {
                // Öğrenci kontrolü
                var ogrenci = await _context.PansiyonOgrenciler.FindAsync(viewModel.OgrenciId);
                if (ogrenci == null || !ogrenci.Aktif)
                {
                    ModelState.AddModelError("OgrenciId", "Seçilen öğrenci bulunamadı veya aktif değil.");
                    await LoadIzinFormViewBagsAsync();
                    return View(viewModel);
                }

                // Tarih kontrolü
                if (viewModel.BitisTarihi < viewModel.BaslangicTarihi)
                {
                    ModelState.AddModelError("BitisTarihi", "Bitiş tarihi başlangıç tarihinden önce olamaz.");
                    await LoadIzinFormViewBagsAsync();
                    return View(viewModel);
                }

                // Seçilen günlere denk gelen tarihleri bul
                var tumTarihler = new List<DateTime>();
                for (var date = viewModel.BaslangicTarihi.Date; date <= viewModel.BitisTarihi.Date; date = date.AddDays(1))
                {
                    if (viewModel.SecilenGunler == null || !viewModel.SecilenGunler.Any() || viewModel.SecilenGunler.Contains(date.DayOfWeek))
                    {
                        tumTarihler.Add(date);
                    }
                }

                if (!tumTarihler.Any())
                {
                    ModelState.AddModelError(string.Empty, "Seçtiğiniz tarih aralığında belirlediğiniz günlere denk gelen bir tarih bulunamadı.");
                    await LoadIzinFormViewBagsAsync();
                    return View(viewModel);
                }

                // Ardışık günleri gruplayarak izin blokları oluştur
                var izinBloklari = new List<(DateTime Baslangic, DateTime Bitis)>();
                DateTime? blokBaslangic = null;
                DateTime? blokSon = null;

                foreach (var t in tumTarihler)
                {
                    if (!blokBaslangic.HasValue)
                    {
                        blokBaslangic = t;
                        blokSon = t;
                    }
                    else if (blokSon.HasValue && t == blokSon.Value.AddDays(1))
                    {
                        blokSon = t;
                    }
                    else
                    {
                        izinBloklari.Add((blokBaslangic.Value, blokSon.Value));
                        blokBaslangic = t;
                        blokSon = t;
                    }
                }
                if (blokBaslangic.HasValue && blokSon.HasValue)
                {
                    izinBloklari.Add((blokBaslangic.Value, blokSon.Value));
                }

                bool isAdmin = await IsUserPansiyonAdminAsync();
                if (!isAdmin)
                {
                    viewModel.Durum = IzinDurum.Bekliyor;
                }

                var username = User.Identity?.Name ?? "";
                var gorevlisi = await _context.PansiyonGorevlileri.FirstOrDefaultAsync(g => g.KullaniciAdi.ToLower() == username.ToLower());
                int? talepEdenId = gorevlisi?.Id;

                int? onaylayanId = null;
                DateTime? onayTarihi = null;
                if (viewModel.Durum == IzinDurum.Onaylandi)
                {
                    onaylayanId = gorevlisi?.Id ?? 1;
                    onayTarihi = DateTime.Now;
                }

                int eklenenSayi = 0;
                int cakisanSayi = 0;

                foreach (var blok in izinBloklari)
                {
                    // Çakışan izin var mı kontrol et
                    var cakisanIzin = await _context.IzinGirisleri
                        .FirstOrDefaultAsync(i => i.OgrenciId == viewModel.OgrenciId
                            && i.Durum != IzinDurum.Reddedildi
                            && i.Durum != IzinDurum.IptalEdildi
                            && i.BaslangicTarihi <= blok.Bitis
                            && i.BitisTarihi >= blok.Baslangic);

                    if (cakisanIzin != null)
                    {
                        cakisanSayi++;
                        continue;
                    }

                    var gunSayisi = (blok.Bitis - blok.Baslangic).Days + 1;
                    var izin = new IzinGirisi
                    {
                        OgrenciId = viewModel.OgrenciId,
                        Tur = viewModel.Tur,
                        BaslangicTarihi = blok.Baslangic,
                        BitisTarihi = blok.Bitis,
                        GunSayisi = gunSayisi,
                        Durum = viewModel.Durum,
                        Aciklama = viewModel.Aciklama,
                        IzinliYoklamaNolar = viewModel.IzinliYoklamaNolar,
                        TalepEdenId = talepEdenId,
                        OnaylayanId = onaylayanId,
                        OnayTarihi = onayTarihi
                    };

                    _context.Add(izin);
                    eklenenSayi++;
                }

                if (eklenenSayi == 0)
                {
                    ModelState.AddModelError(string.Empty, "Belirtilen günlerde zaten onaylanmış veya bekleyen izinler bulunduğu için izin eklenemedi.");
                    await LoadIzinFormViewBagsAsync();
                    return View(viewModel);
                }

                await _context.SaveChangesAsync();
                
                if (cakisanSayi > 0)
                {
                    TempData["SuccessMessage"] = $"{eklenenSayi} adet izin kaydı oluşturuldu ({cakisanSayi} adet çakışan tarih atlandı).";
                }
                else
                {
                    TempData["SuccessMessage"] = eklenenSayi > 1 
                        ? $"{eklenenSayi} adet izin kaydı başarıyla oluşturuldu." 
                        : "İzin talebi başarıyla oluşturuldu.";
                }

                return RedirectToAction(nameof(Index));
            }
            await LoadIzinFormViewBagsAsync();
            return View(viewModel);
        }

        // GET: Izin/Edit/5
        [PansiyonAdminAuthorize]
        public async Task<IActionResult> Edit(int? id)
        {
            if (id == null)
            {
                return NotFound();
            }

            var izin = await _context.IzinGirisleri.FindAsync(id);
            if (izin == null)
            {
                return NotFound();
            }

            // Sadece bekleyen izinler düzenlenebilir
            if (izin.Durum != IzinDurum.Bekliyor)
            {
                TempData["ErrorMessage"] = "Sadece bekleyen izinler düzenlenebilir.";
                return RedirectToAction(nameof(Index));
            }

            var viewModel = new IzinEditViewModel
            {
                Id = izin.Id,
                OgrenciId = izin.OgrenciId,
                Tur = izin.Tur,
                BaslangicTarihi = izin.BaslangicTarihi,
                BitisTarihi = izin.BitisTarihi,
                Durum = izin.Durum,
                Aciklama = izin.Aciklama,
                IzinliYoklamaNolar = izin.IzinliYoklamaNolar,
                RowVersion = izin.RowVersion
            };

            await LoadIzinFormViewBagsAsync();
            return View(viewModel);
        }

        // POST: Izin/Edit/5
        [HttpPost]
        [ValidateAntiForgeryToken]
        [PansiyonAdminAuthorize]
        public async Task<IActionResult> Edit(int id, IzinEditViewModel viewModel)
        {
            if (id != viewModel.Id)
            {
                return NotFound();
            }

            if (ModelState.IsValid)
            {
                try
                {
                    var izin = await _context.IzinGirisleri.FindAsync(id);
                    if (izin == null)
                    {
                        return NotFound();
                    }

                    // Sadece bekleyen izinler düzenlenebilir
                    if (izin.Durum != IzinDurum.Bekliyor)
                    {
                        TempData["ErrorMessage"] = "Sadece bekleyen izinler düzenlenebilir.";
                        return RedirectToAction(nameof(Index));
                    }

                    // Concurrency check
                    if (!viewModel.RowVersion.SequenceEqual(izin.RowVersion))
                    {
                        ModelState.AddModelError(string.Empty, "Bu kayıt başka bir kullanıcı tarafından güncellendi. Lütfen sayfayı yenileyip tekrar deneyin.");
                        await LoadIzinFormViewBagsAsync();
                        return View(viewModel);
                    }

                    // Öğrenci kontrolü
                    var ogrenci = await _context.PansiyonOgrenciler.FindAsync(viewModel.OgrenciId);
                    if (ogrenci == null || !ogrenci.Aktif)
                    {
                        ModelState.AddModelError("OgrenciId", "Seçilen öğrenci bulunamadı veya aktif değil.");
                        await LoadIzinFormViewBagsAsync();
                        return View(viewModel);
                    }

                    // Tarih kontrolü
                    if (viewModel.BitisTarihi < viewModel.BaslangicTarihi)
                    {
                        ModelState.AddModelError("BitisTarihi", "Bitiş tarihi başlangıç tarihinden önce olamaz.");
                        await LoadIzinFormViewBagsAsync();
                        return View(viewModel);
                    }

                    // Çakışan izin var mı kontrol et (kendisi hariç)
                    var cakisanIzin = await _context.IzinGirisleri
                        .FirstOrDefaultAsync(i => i.Id != id
                            && i.OgrenciId == viewModel.OgrenciId
                            && i.Durum != IzinDurum.Reddedildi
                            && i.Durum != IzinDurum.IptalEdildi
                            && i.BaslangicTarihi <= viewModel.BitisTarihi
                            && i.BitisTarihi >= viewModel.BaslangicTarihi);

                    if (cakisanIzin != null)
                    {
                        ModelState.AddModelError(string.Empty, "Bu öğrenci için belirtilen tarih aralığında onaylanmış veya bekleyen bir izin zaten var.");
                        await LoadIzinFormViewBagsAsync();
                        return View(viewModel);
                    }

                    var gunSayisi = (int)(viewModel.BitisTarihi - viewModel.BaslangicTarihi).TotalDays + 1;

                    izin.OgrenciId = viewModel.OgrenciId;
                    izin.Tur = viewModel.Tur;
                    izin.BaslangicTarihi = viewModel.BaslangicTarihi;
                    izin.BitisTarihi = viewModel.BitisTarihi;
                    izin.GunSayisi = gunSayisi;
                    izin.Durum = viewModel.Durum;
                    izin.Aciklama = viewModel.Aciklama;
                    izin.IzinliYoklamaNolar = viewModel.IzinliYoklamaNolar;

                    _context.Update(izin);
                    await _context.SaveChangesAsync();
                    TempData["SuccessMessage"] = "İzin talebi başarıyla güncellendi.";
                    return RedirectToAction(nameof(Index));
                }
                catch (DbUpdateConcurrencyException)
                {
                    if (!IzinExists(viewModel.Id))
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
            ViewBag.Turler = GetTurlerSelectList();
            ViewBag.Durumlar = await GetDurumlarSelectListAsync();
            return View(viewModel);
        }

        // GET: Izin/Delete/5
        [PansiyonAdminAuthorize]
        public async Task<IActionResult> Delete(int? id)
        {
            if (id == null)
            {
                return NotFound();
            }

            var izin = await _context.IzinGirisleri
                .Include(i => i.Ogrenci)
                .Include(i => i.Onaylayan)
                .FirstOrDefaultAsync(m => m.Id == id);

            if (izin == null)
            {
                return NotFound();
            }

            var viewModel = new PansiyonIzinViewModel
            {
                Id = izin.Id,
                OgrenciId = izin.OgrenciId,
                OgrenciAdSoyad = izin.Ogrenci.AdSoyad,
                OgrenciNo = izin.Ogrenci.OgrenciNo,
                Tur = izin.Tur,
                BaslangicTarihi = izin.BaslangicTarihi,
                BitisTarihi = izin.BitisTarihi,
                GunSayisi = izin.GunSayisi,
                Durum = izin.Durum,
                Aciklama = izin.Aciklama,
                OnaylayanId = izin.OnaylayanId,
                OnaylayanAdSoyad = izin.Onaylayan?.AdSoyad,
                OnayTarihi = izin.OnayTarihi,
                OlusturmaTarihi = izin.OlusturmaTarihi,
                RowVersion = izin.RowVersion
            };

            return View(viewModel);
        }

        // POST: Izin/Delete/5
        [HttpPost, ActionName("Delete")]
        [ValidateAntiForgeryToken]
        [PansiyonAdminAuthorize]
        public async Task<IActionResult> DeleteConfirmed(int id, byte[] rowVersion)
        {
            var izin = await _context.IzinGirisleri.FindAsync(id);
            if (izin == null)
            {
                return NotFound();
            }

            // Sadece bekleyen izinler silinebilir
            if (izin.Durum != IzinDurum.Bekliyor)
            {
                TempData["ErrorMessage"] = "Sadece bekleyen izinler silinebilir.";
                return RedirectToAction(nameof(Index));
            }

            // Concurrency check
            if (!rowVersion.SequenceEqual(izin.RowVersion))
            {
                TempData["ErrorMessage"] = "Bu kayıt başka bir kullanıcı tarafından güncellendi. Lütfen sayfayı yenileyip tekrar deneyin.";
                return RedirectToAction(nameof(Index));
            }

            _context.IzinGirisleri.Remove(izin);
            await _context.SaveChangesAsync();
            TempData["SuccessMessage"] = "İzin talebi başarıyla silindi.";
            return RedirectToAction(nameof(Index));
        }

        // POST: Izin/Onayla/5
        [HttpPost]
        [ValidateAntiForgeryToken]
        [PansiyonAdminAuthorize]
        public async Task<IActionResult> Onayla(int id, byte[] rowVersion)
        {
            var izin = await _context.IzinGirisleri.FindAsync(id);
            if (izin == null)
            {
                return NotFound();
            }

            if (izin.Durum != IzinDurum.Bekliyor)
            {
                TempData["ErrorMessage"] = "Sadece bekleyen izinler onaylanabilir.";
                return RedirectToAction(nameof(Index));
            }

            // Concurrency check
            if (!rowVersion.SequenceEqual(izin.RowVersion))
            {
                TempData["ErrorMessage"] = "Bu kayıt başka bir kullanıcı tarafından güncellendi. Lütfen sayfayı yenileyip tekrar deneyin.";
                return RedirectToAction(nameof(Index));
            }

            var username = User.Identity?.Name ?? "";
            var gorevlisi = await _context.PansiyonGorevlileri.FirstOrDefaultAsync(g => g.KullaniciAdi.ToLower() == username.ToLower());

            izin.Durum = IzinDurum.Onaylandi;
            izin.OnaylayanId = gorevlisi?.Id ?? 1;
            izin.OnayTarihi = DateTime.Now;

            _context.Update(izin);
            await _context.SaveChangesAsync();
            TempData["SuccessMessage"] = "İzin talebi onaylandı.";
            return RedirectToAction(nameof(Index));
        }

        // POST: Izin/Reddet/5
        [HttpPost]
        [ValidateAntiForgeryToken]
        [PansiyonAdminAuthorize]
        public async Task<IActionResult> Reddet(int id, byte[] rowVersion, string redSebebi)
        {
            var izin = await _context.IzinGirisleri.FindAsync(id);
            if (izin == null)
            {
                return NotFound();
            }

            if (izin.Durum != IzinDurum.Bekliyor)
            {
                TempData["ErrorMessage"] = "Sadece bekleyen izinler reddedilebilir.";
                return RedirectToAction(nameof(Index));
            }

            // Concurrency check
            if (!rowVersion.SequenceEqual(izin.RowVersion))
            {
                TempData["ErrorMessage"] = "Bu kayıt başka bir kullanıcı tarafından güncellendi. Lütfen sayfayı yenileyip tekrar deneyin.";
                return RedirectToAction(nameof(Index));
            }

            var username = User.Identity?.Name ?? "";
            var gorevlisi = await _context.PansiyonGorevlileri.FirstOrDefaultAsync(g => g.KullaniciAdi.ToLower() == username.ToLower());

            izin.Durum = IzinDurum.Reddedildi;
            izin.OnaylayanId = gorevlisi?.Id ?? 1;
            izin.OnayTarihi = DateTime.Now;
            izin.Aciklama = string.IsNullOrWhiteSpace(izin.Aciklama) 
                ? $"Red Sebebi: {redSebebi}" 
                : $"{izin.Aciklama}\nRed Sebebi: {redSebebi}";

            _context.Update(izin);
            await _context.SaveChangesAsync();
            TempData["SuccessMessage"] = "İzin talebi reddedildi.";
            return RedirectToAction(nameof(Index));
        }

        // POST: Izin/Iptal/5
        [HttpPost]
        [ValidateAntiForgeryToken]
        [PansiyonAdminAuthorize]
        public async Task<IActionResult> Iptal(int id, byte[] rowVersion)
        {
            var izin = await _context.IzinGirisleri.FindAsync(id);
            if (izin == null)
            {
                return NotFound();
            }

            if (izin.Durum != IzinDurum.Bekliyor && izin.Durum != IzinDurum.Onaylandi)
            {
                TempData["ErrorMessage"] = "Sadece bekleyen veya onaylanmış izinler iptal edilebilir.";
                return RedirectToAction(nameof(Index));
            }

            // Concurrency check
            if (!rowVersion.SequenceEqual(izin.RowVersion))
            {
                TempData["ErrorMessage"] = "Bu kayıt başka bir kullanıcı tarafından güncellendi. Lütfen sayfayı yenileyip tekrar deneyin.";
                return RedirectToAction(nameof(Index));
            }

            izin.Durum = IzinDurum.IptalEdildi;

            _context.Update(izin);
            await _context.SaveChangesAsync();
            TempData["SuccessMessage"] = "İzin talebi iptal edildi.";
            return RedirectToAction(nameof(Index));
        }

        // GET: Izin/OgrenciIzinleri/5
        [PansiyonAdminAuthorize]
        public async Task<IActionResult> OgrenciIzinleri(int? id, IzinFilterViewModel filter)
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

            var query = _context.IzinGirisleri
                .Include(i => i.Ogrenci)
                .Include(i => i.Onaylayan)
                .Include(i => i.TalepEden)
                .Where(i => i.OgrenciId == id)
                .AsQueryable();

            if (filter.Durum.HasValue)
            {
                query = query.Where(i => i.Durum == filter.Durum.Value);
            }

            if (filter.Tur.HasValue)
            {
                query = query.Where(i => i.Tur == filter.Tur.Value);
            }

            if (filter.BaslangicTarihi.HasValue)
            {
                query = query.Where(i => i.BaslangicTarihi >= filter.BaslangicTarihi.Value);
            }

            if (filter.BitisTarihi.HasValue)
            {
                query = query.Where(i => i.BitisTarihi <= filter.BitisTarihi.Value);
            }

            var izinler = await query
                .OrderByDescending(i => i.BaslangicTarihi)
                .ThenByDescending(i => i.OlusturmaTarihi)
                .ToListAsync();

            var viewModel = new IzinListViewModel
            {
                Izinler = izinler.Select(i => new PansiyonIzinViewModel
                {
                    Id = i.Id,
                    OgrenciId = i.OgrenciId,
                    OgrenciAdSoyad = i.Ogrenci.AdSoyad,
                    OgrenciNo = i.Ogrenci.OgrenciNo,
                    Tur = i.Tur,
                    BaslangicTarihi = i.BaslangicTarihi,
                    BitisTarihi = i.BitisTarihi,
                    GunSayisi = i.GunSayisi,
                    Durum = i.Durum,
                    Aciklama = i.Aciklama,
                    TalepEdenId = i.TalepEdenId,
                    TalepEdenAdSoyad = i.TalepEden?.AdSoyad,
                    OnaylayanId = i.OnaylayanId,
                    OnaylayanAdSoyad = i.Onaylayan?.AdSoyad,
                    OnayTarihi = i.OnayTarihi,
                    OlusturmaTarihi = i.OlusturmaTarihi,
                    RowVersion = i.RowVersion
                }).ToList(),
                Filter = filter
            };

            ViewBag.Ogrenci = ogrenci;
            ViewBag.Durumlar = Enum.GetValues(typeof(IzinDurum))
                .Cast<IzinDurum>()
                .Select(d => new SelectListItem { Value = ((int)d).ToString(), Text = d.ToString() })
                .ToList();

            ViewBag.Turler = Enum.GetValues(typeof(IzinTur))
                .Cast<IzinTur>()
                .Select(t => new SelectListItem { Value = ((int)t).ToString(), Text = t.ToString() })
                .ToList();

            ViewBag.YoklamaTurleriMap = await _context.YoklamaTurleri
                .ToDictionaryAsync(y => y.Id, y => y.Ad);

            return View(viewModel);
        }

        private List<SelectListItem> GetOgrencilerSelectList()
        {
            return _context.PansiyonOgrenciler
                .Where(o => o.Aktif)
                .OrderBy(o => o.AdSoyad)
                .Select(o => new SelectListItem { Value = o.Id.ToString(), Text = $"{o.AdSoyad} ({o.OgrenciNo})" })
                .ToList();
        }

        private List<SelectListItem> GetTurlerSelectList()
        {
            return new List<SelectListItem>
            {
                new SelectListItem { Value = "0", Text = "Hastalık İzni" },
                new SelectListItem { Value = "1", Text = "Aile Ziyareti İzni" },
                new SelectListItem { Value = "2", Text = "Resmi İş İzni" },
                new SelectListItem { Value = "3", Text = "Diğer İzin" },
                new SelectListItem { Value = "4", Text = "Geç Gelme İzni" }
            };
        }

        private async Task<bool> IsUserPansiyonAdminAsync()
        {
            if (User.IsInRole("Admin"))
                return true;

            if (User.IsInRole("PansiyonGorevlisi") && User.Identity?.Name != null)
            {
                var username = User.Identity.Name ?? "";
                var isPansiyonAdmin = await _context.PansiyonGorevlileri
                    .AnyAsync(g => g.KullaniciAdi.ToLower() == username.ToLower() && g.Aktif && g.Rol == "Admin");
                return isPansiyonAdmin;
            }

            return false;
        }

        private async Task<List<SelectListItem>> GetDurumlarSelectListAsync()
        {
            bool isAdmin = await IsUserPansiyonAdminAsync();
            if (isAdmin)
            {
                return new List<SelectListItem>
                {
                    new SelectListItem { Value = "0", Text = "Bekliyor" },
                    new SelectListItem { Value = "1", Text = "Onaylandı" },
                    new SelectListItem { Value = "2", Text = "Reddedildi" },
                    new SelectListItem { Value = "3", Text = "İptal Edildi" }
                };
            }

            return new List<SelectListItem>
            {
                new SelectListItem { Value = "0", Text = "Bekliyor" }
            };
        }

        private bool IzinExists(int id)
        {
            return _context.IzinGirisleri.Any(e => e.Id == id);
        }

        private async Task LoadIzinFormViewBagsAsync()
        {
            ViewBag.Ogrenciler = GetOgrencilerSelectList();
            ViewBag.Turler = GetTurlerSelectList();
            ViewBag.Durumlar = await GetDurumlarSelectListAsync();
            ViewBag.YoklamaTurleri = await _context.YoklamaTurleri.Where(y => y.Aktif).OrderBy(y => y.Sira).ToListAsync();
        }
    }
}
