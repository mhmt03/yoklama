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
    public class OdaController : Controller
    {
        private readonly AppDbContext _context;

        public OdaController(AppDbContext context)
        {
            _context = context;
        }

        // GET: Oda
        public async Task<IActionResult> Index(OdaFilterViewModel filter)
        {
            var query = _context.Odalar
                .Include(o => o.Ogrenciler)
                .AsQueryable();

            if (!string.IsNullOrWhiteSpace(filter.Arama))
            {
                query = query.Where(o => o.OdaNo.Contains(filter.Arama) || o.Aciklama.Contains(filter.Arama));
            }

            if (filter.Kat.HasValue)
            {
                query = query.Where(o => o.Kat == filter.Kat.Value);
            }

            if (!string.IsNullOrWhiteSpace(filter.Cinsiyet))
            {
                query = query.Where(o => o.Cinsiyet == filter.Cinsiyet);
            }

            if (filter.SadeceAktif)
            {
                query = query.Where(o => o.Aktif);
            }

            if (filter.DolulukDurumu.HasValue)
            {
                query = filter.DolulukDurumu.Value switch
                {
                    DolulukDurumu.Bos => query.Where(o => o.Ogrenciler.Count == 0),
                    DolulukDurumu.Dolu => query.Where(o => o.Ogrenciler.Count >= o.Kapasite),
                    DolulukDurumu.Kismi => query.Where(o => o.Ogrenciler.Count > 0 && o.Ogrenciler.Count < o.Kapasite),
                    _ => query
                };
            }

            var odalar = await query
                .OrderBy(o => o.Kat)
                .ThenBy(o => o.OdaNo)
                .ToListAsync();

            var viewModel = new OdaListViewModel
            {
                Odalar = odalar.Select(o => new OdaViewModel
                {
                    Id = o.Id,
                    OdaNo = o.OdaNo,
                    Kapasite = o.Kapasite,
                    Kat = o.Kat,
                    Cinsiyet = o.Cinsiyet,
                    Aciklama = o.Aciklama,
                    Aktif = o.Aktif,
                    DoluSayisi = o.Ogrenciler.Count,
                    RowVersion = o.RowVersion
                }).ToList(),
                Filter = filter
            };

            // Kat listesi için dropdown
            ViewBag.Katlar = await _context.Odalar
                .Where(o => o.Aktif)
                .Select(o => o.Kat)
                .Distinct()
                .OrderBy(k => k)
                .ToListAsync();

            return View(viewModel);
        }

        // GET: Oda/Details/5
        public async Task<IActionResult> Details(int? id)
        {
            if (id == null)
            {
                return NotFound();
            }

            var oda = await _context.Odalar
                .Include(o => o.Ogrenciler)
                .FirstOrDefaultAsync(m => m.Id == id);

            if (oda == null)
            {
                return NotFound();
            }

            // Retrieve all active boarding students with their assigned rooms (in-memory projection to prevent EF Core inner-join translation issues)
            var activeOgrenciler = await _context.PansiyonOgrenciler
                .Include(o => o.Oda)
                .Where(o => o.Aktif)
                .OrderBy(o => o.AdSoyad)
                .ToListAsync();

            ViewBag.TumOgrenciler = activeOgrenciler.Select(o => new PansiyonOgrenciViewModel
            {
                Id = o.Id,
                OgrenciNo = o.OgrenciNo,
                AdSoyad = o.AdSoyad,
                OdaId = o.OdaId,
                OdaNo = o.Oda?.OdaNo
            }).ToList();

            var viewModel = new OdaViewModel
            {
                Id = oda.Id,
                OdaNo = oda.OdaNo,
                Kapasite = oda.Kapasite,
                Kat = oda.Kat,
                Cinsiyet = oda.Cinsiyet,
                Aciklama = oda.Aciklama,
                Aktif = oda.Aktif,
                DoluSayisi = oda.Ogrenciler.Count,
                Ogrenciler = oda.Ogrenciler.Select(ogr => new PansiyonOgrenciViewModel
                {
                    Id = ogr.Id,
                    OgrenciNo = ogr.OgrenciNo,
                    AdSoyad = ogr.AdSoyad,
                    SinifDuzeyi = ogr.SinifDuzeyi,
                    Sube = ogr.Sube
                }).ToList(),
                RowVersion = oda.RowVersion
            };

            return View(viewModel);
        }

        // GET: Oda/Create
        public IActionResult Create()
        {
            var viewModel = new OdaCreateViewModel();
            return View(viewModel);
        }

        // POST: Oda/Create
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> Create(OdaCreateViewModel viewModel)
        {
            if (ModelState.IsValid)
            {
                var oda = new Oda
                {
                    OdaNo = viewModel.OdaNo,
                    Kapasite = viewModel.Kapasite,
                    Kat = viewModel.Kat,
                    Cinsiyet = viewModel.Cinsiyet,
                    Aciklama = viewModel.Aciklama,
                    Aktif = viewModel.Aktif
                };

                _context.Add(oda);
                await _context.SaveChangesAsync();
                TempData["SuccessMessage"] = "Oda başarıyla oluşturuldu.";
                return RedirectToAction(nameof(Index));
            }
            return View(viewModel);
        }

        // GET: Oda/Edit/5
        public async Task<IActionResult> Edit(int? id)
        {
            if (id == null)
            {
                return NotFound();
            }

            var oda = await _context.Odalar.FindAsync(id);
            if (oda == null)
            {
                return NotFound();
            }

            var viewModel = new OdaEditViewModel
            {
                Id = oda.Id,
                OdaNo = oda.OdaNo,
                Kapasite = oda.Kapasite,
                Kat = oda.Kat,
                Cinsiyet = oda.Cinsiyet,
                Aciklama = oda.Aciklama,
                Aktif = oda.Aktif,
                RowVersion = oda.RowVersion
            };

            return View(viewModel);
        }

        // POST: Oda/Edit/5
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> Edit(int id, OdaEditViewModel viewModel)
        {
            if (id != viewModel.Id)
            {
                return NotFound();
            }

            if (ModelState.IsValid)
            {
                try
                {
                    var oda = await _context.Odalar.FindAsync(id);
                    if (oda == null)
                    {
                        return NotFound();
                    }

                    // Concurrency check
                    if (!viewModel.RowVersion.SequenceEqual(oda.RowVersion))
                    {
                        ModelState.AddModelError(string.Empty, "Bu kayıt başka bir kullanıcı tarafından güncellendi. Lütfen sayfayı yenileyip tekrar deneyin.");
                        return View(viewModel);
                    }

                    oda.OdaNo = viewModel.OdaNo;
                    oda.Kapasite = viewModel.Kapasite;
                    oda.Kat = viewModel.Kat;
                    oda.Cinsiyet = viewModel.Cinsiyet;
                    oda.Aciklama = viewModel.Aciklama;
                    oda.Aktif = viewModel.Aktif;

                    _context.Update(oda);
                    await _context.SaveChangesAsync();
                    TempData["SuccessMessage"] = "Oda başarıyla güncellendi.";
                    return RedirectToAction(nameof(Index));
                }
                catch (DbUpdateConcurrencyException)
                {
                    if (!OdaExists(viewModel.Id))
                    {
                        return NotFound();
                    }
                    else
                    {
                        throw;
                    }
                }
            }
            return View(viewModel);
        }

        // GET: Oda/Delete/5
        public async Task<IActionResult> Delete(int? id)
        {
            if (id == null)
            {
                return NotFound();
            }

            var oda = await _context.Odalar
                .Include(o => o.Ogrenciler)
                .FirstOrDefaultAsync(m => m.Id == id);

            if (oda == null)
            {
                return NotFound();
            }

            var viewModel = new OdaViewModel
            {
                Id = oda.Id,
                OdaNo = oda.OdaNo,
                Kapasite = oda.Kapasite,
                Kat = oda.Kat,
                Cinsiyet = oda.Cinsiyet,
                Aciklama = oda.Aciklama,
                Aktif = oda.Aktif,
                DoluSayisi = oda.Ogrenciler.Count,
                RowVersion = oda.RowVersion
            };

            return View(viewModel);
        }

        // POST: Oda/Delete/5
        [HttpPost, ActionName("Delete")]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> DeleteConfirmed(int id, byte[] rowVersion)
        {
            var oda = await _context.Odalar.FindAsync(id);
            if (oda == null)
            {
                return NotFound();
            }

            // Concurrency check
            if (!rowVersion.SequenceEqual(oda.RowVersion))
            {
                TempData["ErrorMessage"] = "Bu kayıt başka bir kullanıcı tarafından güncellendi. Lütfen sayfayı yenileyip tekrar deneyin.";
                return RedirectToAction(nameof(Index));
            }

            // Öğrencisi varsa silme
            if (await _context.PansiyonOgrenciler.AnyAsync(o => o.OdaId == id))
            {
                TempData["ErrorMessage"] = "Bu odada öğrenci bulunduğu için silinemez. Önce öğrencileri başka bir odaya taşıyın.";
                return RedirectToAction(nameof(Index));
            }

            _context.Odalar.Remove(oda);
            await _context.SaveChangesAsync();
            TempData["SuccessMessage"] = "Oda başarıyla silindi.";
            return RedirectToAction(nameof(Index));
        }

        // GET: Oda/Filter (Partial view for AJAX)
        [HttpGet]
        public IActionResult Filter()
        {
            var filter = new OdaFilterViewModel();
            ViewBag.Katlar = _context.Odalar
                .Where(o => o.Aktif)
                .Select(o => o.Kat)
                .Distinct()
                .OrderBy(k => k)
                .ToList();
            return PartialView("_Filter", filter);
        }

        // POST: Oda/AddStudents/5
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> AddStudents(int id, List<int> selectedStudentIds)
        {
            var oda = await _context.Odalar
                .Include(o => o.Ogrenciler)
                .FirstOrDefaultAsync(m => m.Id == id);

            if (oda == null)
            {
                return NotFound();
            }

            if (selectedStudentIds == null || !selectedStudentIds.Any())
            {
                TempData["ErrorMessage"] = "Lütfen odaya eklemek için en az bir öğrenci seçin.";
                return RedirectToAction(nameof(Details), new { id });
            }

            // Find selected active students
            var ogrenciler = await _context.PansiyonOgrenciler
                .Where(o => selectedStudentIds.Contains(o.Id) && o.Aktif)
                .ToListAsync();

            // Calculate room capacity details
            var yeniEklenecekler = ogrenciler.Where(o => o.OdaId != id).ToList();
            var bosYer = oda.Kapasite - oda.Ogrenciler.Count;

            if (yeniEklenecekler.Count > bosYer)
            {
                TempData["ErrorMessage"] = $"Hata: Oda kapasitesi yetersiz. Bu odada {bosYer} kişilik boş yer var, ancak {yeniEklenecekler.Count} yeni öğrenci eklemeye çalışıyorsunuz.";
                return RedirectToAction(nameof(Details), new { id });
            }

            // Assign new OdaId
            foreach (var ogrenci in yeniEklenecekler)
            {
                ogrenci.OdaId = id;
            }

            await _context.SaveChangesAsync();
            TempData["SuccessMessage"] = $"{yeniEklenecekler.Count} öğrenci odaya başarıyla eklendi.";
            return RedirectToAction(nameof(Details), new { id });
        }

        // POST: Oda/RemoveStudent/5
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> RemoveStudent(int id, int ogrenciId)
        {
            var ogrenci = await _context.PansiyonOgrenciler.FindAsync(ogrenciId);
            if (ogrenci != null && ogrenci.OdaId == id)
            {
                ogrenci.OdaId = null;
                await _context.SaveChangesAsync();
                TempData["SuccessMessage"] = "Öğrenci odadan çıkarıldı.";
            }
            return RedirectToAction(nameof(Details), new { id });
        }

        private bool OdaExists(int id)
        {
            return _context.Odalar.Any(e => e.Id == id);
        }
    }
}