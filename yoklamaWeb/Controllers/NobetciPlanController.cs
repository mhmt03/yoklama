using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Rendering;
using Microsoft.EntityFrameworkCore;
using yoklamaWeb.Data;
using yoklamaWeb.Models;
using yoklamaWeb.ViewModels.Pansiyon;

using Microsoft.AspNetCore.Authorization;
using yoklamaWeb.Filters;

namespace yoklamaWeb.Controllers
{
    [PansiyonAdminAuthorize]
    public class NobetciPlanController : Controller
    {
        private readonly AppDbContext _context;

        public NobetciPlanController(AppDbContext context)
        {
            _context = context;
        }

        // GET: NobetciPlan
        public async Task<IActionResult> Index(NobetciPlanFilterViewModel filter)
        {
            var query = _context.NobetciPlanlar
                .Include(n => n.PansiyonGorevlisi)
                .AsQueryable();

            if (!string.IsNullOrWhiteSpace(filter.Arama))
            {
                query = query.Where(n => n.PansiyonGorevlisi.AdSoyad.Contains(filter.Arama)
                    || n.PansiyonGorevlisi.KullaniciAdi.Contains(filter.Arama)
                    || n.Aciklama.Contains(filter.Arama));
            }

            if (filter.GorevlisiId.HasValue)
            {
                query = query.Where(n => n.PansiyonGorevlisiId == filter.GorevlisiId.Value);
            }

            if (!string.IsNullOrWhiteSpace(filter.Gun))
            {
                query = query.Where(n => n.Gun == filter.Gun);
            }

            if (filter.BaslangicTarihi.HasValue)
            {
                query = query.Where(n => n.BitisTarihi >= filter.BaslangicTarihi.Value);
            }

            if (filter.BitisTarihi.HasValue)
            {
                query = query.Where(n => n.BaslangicTarihi <= filter.BitisTarihi.Value);
            }

            if (filter.SadeceAktif)
            {
                var today = DateTime.Today;
                query = query.Where(n => n.BaslangicTarihi <= today && n.BitisTarihi >= today);
            }

            var planlar = await query
                .OrderBy(n => n.BaslangicTarihi)
                .ThenBy(n => n.Gun)
                .ToListAsync();

            var viewModel = new NobetciPlanListViewModel
            {
                Planlar = planlar.Select(n => new NobetciPlanViewModel
                {
                    Id = n.Id,
                    PansiyonGorevlisiId = n.PansiyonGorevlisiId,
                    GorevlisiAdSoyad = n.PansiyonGorevlisi.AdSoyad,
                    BaslangicTarihi = n.BaslangicTarihi,
                    BitisTarihi = n.BitisTarihi,
                    Gun = n.Gun,
                    Aciklama = n.Aciklama,
                    RowVersion = n.RowVersion
                }).ToList(),
                Filter = filter
            };

            ViewBag.Gorevlisiler = await _context.PansiyonGorevlileri
                .Where(g => g.Aktif)
                .OrderBy(g => g.AdSoyad)
                .Select(g => new SelectListItem { Value = g.Id.ToString(), Text = g.AdSoyad })
                .ToListAsync();

            ViewBag.Gunler = GetGunlerSelectList();

            return View(viewModel);
        }

        // GET: NobetciPlan/Details/5
        public async Task<IActionResult> Details(int? id)
        {
            if (id == null)
            {
                return NotFound();
            }

            var plan = await _context.NobetciPlanlar
                .Include(n => n.PansiyonGorevlisi)
                .FirstOrDefaultAsync(m => m.Id == id);

            if (plan == null)
            {
                return NotFound();
            }

            var viewModel = new NobetciPlanViewModel
            {
                Id = plan.Id,
                PansiyonGorevlisiId = plan.PansiyonGorevlisiId,
                GorevlisiAdSoyad = plan.PansiyonGorevlisi.AdSoyad,
                BaslangicTarihi = plan.BaslangicTarihi,
                BitisTarihi = plan.BitisTarihi,
                Gun = plan.Gun,
                Aciklama = plan.Aciklama,
                RowVersion = plan.RowVersion
            };

            return View(viewModel);
        }

        // GET: NobetciPlan/Create
        public async Task<IActionResult> Create()
        {
            var viewModel = new NobetciPlanCreateViewModel
            {
                BaslangicTarihi = DateTime.Today,
                BitisTarihi = DateTime.Today.AddMonths(1)
            };
            ViewBag.Gorevlisiler = await GetGorevlisilerSelectListAsync();
            ViewBag.Gunler = GetGunlerSelectList();
            return View(viewModel);
        }

        // POST: NobetciPlan/Create
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> Create(NobetciPlanCreateViewModel viewModel)
        {
            if (ModelState.IsValid)
            {
                // Tarih kontrolü
                if (viewModel.BitisTarihi < viewModel.BaslangicTarihi)
                {
                    ModelState.AddModelError("BitisTarihi", "Bitiş tarihi başlangıç tarihinden önce olamaz.");
                    ViewBag.Gorevlisiler = await GetGorevlisilerSelectListAsync();
                    ViewBag.Gunler = GetGunlerSelectList();
                    return View(viewModel);
                }

                // Çakışma kontrolü - aynı görevli, aynı tarih aralığında, aynı gün
                var cakisma = await _context.NobetciPlanlar.AnyAsync(n =>
                    n.PansiyonGorevlisiId == viewModel.PansiyonGorevlisiId &&
                    n.Gun == viewModel.Gun &&
                    n.BaslangicTarihi <= viewModel.BitisTarihi &&
                    n.BitisTarihi >= viewModel.BaslangicTarihi);

                if (cakisma)
                {
                    ModelState.AddModelError(string.Empty, "Bu görevli için aynı gün ve tarih aralığında zaten bir nöbet planı var.");
                    ViewBag.Gorevlisiler = await GetGorevlisilerSelectListAsync();
                    ViewBag.Gunler = GetGunlerSelectList();
                    return View(viewModel);
                }

                var plan = new NobetciPlan
                {
                    PansiyonGorevlisiId = viewModel.PansiyonGorevlisiId,
                    BaslangicTarihi = viewModel.BaslangicTarihi,
                    BitisTarihi = viewModel.BitisTarihi,
                    Gun = viewModel.Gun,
                    Aciklama = viewModel.Aciklama
                };

                _context.Add(plan);
                await _context.SaveChangesAsync();
                TempData["SuccessMessage"] = "Nöbet planı başarıyla eklendi.";
                return RedirectToAction(nameof(Index));
            }
            ViewBag.Gorevlisiler = await GetGorevlisilerSelectListAsync();
            ViewBag.Gunler = GetGunlerSelectList();
            return View(viewModel);
        }

        // GET: NobetciPlan/Edit/5
        public async Task<IActionResult> Edit(int? id)
        {
            if (id == null)
            {
                return NotFound();
            }

            var plan = await _context.NobetciPlanlar.FindAsync(id);
            if (plan == null)
            {
                return NotFound();
            }

            var viewModel = new NobetciPlanEditViewModel
            {
                Id = plan.Id,
                PansiyonGorevlisiId = plan.PansiyonGorevlisiId,
                BaslangicTarihi = plan.BaslangicTarihi,
                BitisTarihi = plan.BitisTarihi,
                Gun = plan.Gun,
                Aciklama = plan.Aciklama,
                RowVersion = plan.RowVersion
            };

            ViewBag.Gorevlisiler = await GetGorevlisilerSelectListAsync();
            ViewBag.Gunler = GetGunlerSelectList();
            return View(viewModel);
        }

        // POST: NobetciPlan/Edit/5
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> Edit(int id, NobetciPlanEditViewModel viewModel)
        {
            if (id != viewModel.Id)
            {
                return NotFound();
            }

            if (ModelState.IsValid)
            {
                try
                {
                    var plan = await _context.NobetciPlanlar.FindAsync(id);
                    if (plan == null)
                    {
                        return NotFound();
                    }

                    // Concurrency check
                    if (!viewModel.RowVersion.SequenceEqual(plan.RowVersion))
                    {
                        ModelState.AddModelError(string.Empty, "Bu kayıt başka bir kullanıcı tarafından güncellendi. Lütfen sayfayı yenileyip tekrar deneyin.");
                        ViewBag.Gorevlisiler = await GetGorevlisilerSelectListAsync();
                        ViewBag.Gunler = GetGunlerSelectList();
                        return View(viewModel);
                    }

                    // Tarih kontrolü
                    if (viewModel.BitisTarihi < viewModel.BaslangicTarihi)
                    {
                        ModelState.AddModelError("BitisTarihi", "Bitiş tarihi başlangıç tarihinden önce olamaz.");
                        ViewBag.Gorevlisiler = await GetGorevlisilerSelectListAsync();
                        ViewBag.Gunler = GetGunlerSelectList();
                        return View(viewModel);
                    }

                    // Çakışma kontrolü (kendisi hariç)
                    var cakisma = await _context.NobetciPlanlar.AnyAsync(n =>
                        n.Id != id &&
                        n.PansiyonGorevlisiId == viewModel.PansiyonGorevlisiId &&
                        n.Gun == viewModel.Gun &&
                        n.BaslangicTarihi <= viewModel.BitisTarihi &&
                        n.BitisTarihi >= viewModel.BaslangicTarihi);

                    if (cakisma)
                    {
                        ModelState.AddModelError(string.Empty, "Bu görevli için aynı gün ve tarih aralığında zaten bir nöbet planı var.");
                        ViewBag.Gorevlisiler = await GetGorevlisilerSelectListAsync();
                        ViewBag.Gunler = GetGunlerSelectList();
                        return View(viewModel);
                    }

                    plan.PansiyonGorevlisiId = viewModel.PansiyonGorevlisiId;
                    plan.BaslangicTarihi = viewModel.BaslangicTarihi;
                    plan.BitisTarihi = viewModel.BitisTarihi;
                    plan.Gun = viewModel.Gun;
                    plan.Aciklama = viewModel.Aciklama;

                    _context.Update(plan);
                    await _context.SaveChangesAsync();
                    TempData["SuccessMessage"] = "Nöbet planı başarıyla güncellendi.";
                    return RedirectToAction(nameof(Index));
                }
                catch (DbUpdateConcurrencyException)
                {
                    if (!NobetciPlanExists(viewModel.Id))
                    {
                        return NotFound();
                    }
                    else
                    {
                        throw;
                    }
                }
            }
            ViewBag.Gorevlisiler = await GetGorevlisilerSelectListAsync();
            ViewBag.Gunler = GetGunlerSelectList();
            return View(viewModel);
        }

        // GET: NobetciPlan/Delete/5
        public async Task<IActionResult> Delete(int? id)
        {
            if (id == null)
            {
                return NotFound();
            }

            var plan = await _context.NobetciPlanlar
                .Include(n => n.PansiyonGorevlisi)
                .FirstOrDefaultAsync(m => m.Id == id);

            if (plan == null)
            {
                return NotFound();
            }

            var viewModel = new NobetciPlanViewModel
            {
                Id = plan.Id,
                PansiyonGorevlisiId = plan.PansiyonGorevlisiId,
                GorevlisiAdSoyad = plan.PansiyonGorevlisi.AdSoyad,
                BaslangicTarihi = plan.BaslangicTarihi,
                BitisTarihi = plan.BitisTarihi,
                Gun = plan.Gun,
                Aciklama = plan.Aciklama,
                RowVersion = plan.RowVersion
            };

            return View(viewModel);
        }

        // POST: NobetciPlan/Delete/5
        [HttpPost, ActionName("Delete")]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> DeleteConfirmed(int id, byte[] rowVersion)
        {
            var plan = await _context.NobetciPlanlar.FindAsync(id);
            if (plan == null)
            {
                return NotFound();
            }

            // Concurrency check
            if (!rowVersion.SequenceEqual(plan.RowVersion))
            {
                TempData["ErrorMessage"] = "Bu kayıt başka bir kullanıcı tarafından güncellendi. Lütfen sayfayı yenileyip tekrar deneyin.";
                return RedirectToAction(nameof(Index));
            }

            _context.NobetciPlanlar.Remove(plan);
            await _context.SaveChangesAsync();
            TempData["SuccessMessage"] = "Nöbet planı başarıyla silindi.";
            return RedirectToAction(nameof(Index));
        }

        // POST: NobetciPlan/CreateQuick
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> CreateQuick(int pansiyonGorevlisiId, DateTime nobetTarihi, string? aciklama)
        {
            var gorevlisi = await _context.PansiyonGorevlileri.FindAsync(pansiyonGorevlisiId);
            if (gorevlisi == null)
            {
                TempData["ErrorMessage"] = "Seçilen görevli bulunamadı.";
                return RedirectToAction(nameof(Index));
            }

            // Calculate Turkish day name based on nobetTarihi
            string gunAdi = nobetTarihi.DayOfWeek switch
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

            var plan = new NobetciPlan
            {
                PansiyonGorevlisiId = pansiyonGorevlisiId,
                BaslangicTarihi = nobetTarihi.Date,
                BitisTarihi = nobetTarihi.Date, // Start and End are the same date!
                Gun = gunAdi,
                Aciklama = aciklama ?? "",
                OlusturmaTarihi = DateTime.UtcNow
            };

            // Set OlusturanId if user is authenticated and matches a proctor
            var username = User.Identity?.Name;
            var olusturan = await _context.PansiyonGorevlileri.FirstOrDefaultAsync(g => g.KullaniciAdi == username);
            if (olusturan != null)
            {
                plan.OlusturanId = olusturan.Id;
            }

            _context.NobetciPlanlar.Add(plan);
            await _context.SaveChangesAsync();

            TempData["SuccessMessage"] = $"{gorevlisi.AdSoyad} için {nobetTarihi:dd.MM.yyyy} ({gunAdi}) tarihine nöbet başarıyla eklendi.";
            return RedirectToAction(nameof(Index));
        }

        private async Task<List<SelectListItem>> GetGorevlisilerSelectListAsync()
        {
            return await _context.PansiyonGorevlileri
                .Where(g => g.Aktif)
                .OrderBy(g => g.AdSoyad)
                .Select(g => new SelectListItem { Value = g.Id.ToString(), Text = g.AdSoyad })
                .ToListAsync();
        }

        private List<SelectListItem> GetGunlerSelectList()
        {
            return new List<SelectListItem>
            {
                new SelectListItem { Value = "Pazartesi", Text = "Pazartesi" },
                new SelectListItem { Value = "Sali", Text = "Salı" },
                new SelectListItem { Value = "Carsamba", Text = "Çarşamba" },
                new SelectListItem { Value = "Persembe", Text = "Perşembe" },
                new SelectListItem { Value = "Cuma", Text = "Cuma" },
                new SelectListItem { Value = "Cumartesi", Text = "Cumartesi" },
                new SelectListItem { Value = "Pazar", Text = "Pazar" }
            };
        }

        private bool NobetciPlanExists(int id)
        {
            return _context.NobetciPlanlar.Any(e => e.Id == id);
        }
    }
}