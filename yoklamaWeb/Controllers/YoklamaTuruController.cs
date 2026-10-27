using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using yoklamaWeb.Data;
using yoklamaWeb.Models;
using yoklamaWeb.Filters;
using System;
using System.Linq;
using System.Threading.Tasks;

namespace yoklamaWeb.Controllers
{
    [PansiyonAdminAuthorize]
    public class YoklamaTuruController : Controller
    {
        private readonly AppDbContext _context;

        public YoklamaTuruController(AppDbContext context)
        {
            _context = context;
        }

        // GET: YoklamaTuru
        public async Task<IActionResult> Index(string arama, bool sadeceAktif = false)
        {
            var query = _context.YoklamaTurleri.AsQueryable();

            if (!string.IsNullOrWhiteSpace(arama))
            {
                query = query.Where(y => y.Ad.Contains(arama));
            }

            if (sadeceAktif)
            {
                query = query.Where(y => y.Aktif);
            }

            var list = await query.OrderBy(y => y.Sira).ToListAsync();

            ViewBag.Arama = arama;
            ViewBag.SadeceAktif = sadeceAktif;

            return View(list);
        }

        // GET: YoklamaTuru/Details/5
        public async Task<IActionResult> Details(int? id)
        {
            if (id == null) return NotFound();

            var yoklamaTuru = await _context.YoklamaTurleri
                .FirstOrDefaultAsync(m => m.Id == id);

            if (yoklamaTuru == null) return NotFound();

            return View(yoklamaTuru);
        }

        // GET: YoklamaTuru/Create
        public IActionResult Create()
        {
            return View();
        }

        // POST: YoklamaTuru/Create
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> Create([Bind("Ad,Sira,Aktif")] YoklamaTuru yoklamaTuru)
        {
            if (ModelState.IsValid)
            {
                yoklamaTuru.OlusturmaTarihi = DateTime.UtcNow;
                _context.Add(yoklamaTuru);
                await _context.SaveChangesAsync();
                TempData["SuccessMessage"] = "Yoklama çeşidi başarıyla oluşturuldu.";
                return RedirectToAction(nameof(Index));
            }
            return View(yoklamaTuru);
        }

        // GET: YoklamaTuru/Edit/5
        public async Task<IActionResult> Edit(int? id)
        {
            if (id == null) return NotFound();

            var yoklamaTuru = await _context.YoklamaTurleri.FindAsync(id);
            if (yoklamaTuru == null) return NotFound();

            return View(yoklamaTuru);
        }

        // POST: YoklamaTuru/Edit/5
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> Edit(int id, [Bind("Id,Ad,Sira,Aktif,OlusturmaTarihi,RowVersion")] YoklamaTuru yoklamaTuru)
        {
            if (id != yoklamaTuru.Id) return NotFound();

            if (ModelState.IsValid)
            {
                try
                {
                    _context.Update(yoklamaTuru);
                    await _context.SaveChangesAsync();
                    TempData["SuccessMessage"] = "Yoklama çeşidi başarıyla güncellendi.";
                }
                catch (DbUpdateConcurrencyException)
                {
                    if (!YoklamaTuruExists(yoklamaTuru.Id))
                    {
                        return NotFound();
                    }
                    else
                    {
                        ModelState.AddModelError(string.Empty, "Bu kayıt başka bir kullanıcı tarafından güncellendi. Lütfen sayfayı yenileyip tekrar deneyin.");
                        return View(yoklamaTuru);
                    }
                }
                return RedirectToAction(nameof(Index));
            }
            return View(yoklamaTuru);
        }

        // GET: YoklamaTuru/Delete/5
        public async Task<IActionResult> Delete(int? id)
        {
            if (id == null) return NotFound();

            var yoklamaTuru = await _context.YoklamaTurleri
                .FirstOrDefaultAsync(m => m.Id == id);

            if (yoklamaTuru == null) return NotFound();

            return View(yoklamaTuru);
        }

        // POST: YoklamaTuru/Delete/5
        [HttpPost, ActionName("Delete")]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> DeleteConfirmed(int id)
        {
            var yoklamaTuru = await _context.YoklamaTurleri.FindAsync(id);
            if (yoklamaTuru != null)
            {
                // Kontrol: bu yoklama çeşidine ait kayıtlı yoklama verileri var mı?
                bool hasData = await _context.PansiyonYoklamalar.AnyAsync(y => y.YoklamaNo == id);
                if (hasData)
                {
                    TempData["ErrorMessage"] = "Bu yoklama çeşidine ait geçmiş yoklama verileri bulunduğu için silinemez. Durumunu pasif yapabilirsiniz.";
                    return RedirectToAction(nameof(Index));
                }

                _context.YoklamaTurleri.Remove(yoklamaTuru);
                await _context.SaveChangesAsync();
                TempData["SuccessMessage"] = "Yoklama çeşidi başarıyla silindi.";
            }
            return RedirectToAction(nameof(Index));
        }

        private bool YoklamaTuruExists(int id)
        {
            return _context.YoklamaTurleri.Any(e => e.Id == id);
        }
    }
}
