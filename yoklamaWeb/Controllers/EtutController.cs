using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using yoklamaWeb.Data;
using yoklamaWeb.Models;
using Microsoft.AspNetCore.Authorization;
using yoklamaWeb.Filters;
using System;
using System.Linq;
using System.Threading.Tasks;

namespace yoklamaWeb.Controllers
{
    [PansiyonAdminAuthorize]
    public class EtutController : Controller
    {
        private readonly AppDbContext _context;

        public EtutController(AppDbContext context)
        {
            _context = context;
        }

        // GET: Etut
        public async Task<IActionResult> Index(string arama, bool sadeceAktif = false)
        {
            var query = _context.Etutler
                .Include(e => e.Ogrenciler)
                .AsQueryable();

            if (!string.IsNullOrWhiteSpace(arama))
            {
                query = query.Where(e => e.EtutAdi.Contains(arama) || e.Aciklama.Contains(arama));
            }

            if (sadeceAktif)
            {
                query = query.Where(e => e.Aktif);
            }

            var etutler = await query
                .OrderBy(e => e.EtutAdi)
                .ToListAsync();

            ViewBag.Arama = arama;
            ViewBag.SadeceAktif = sadeceAktif;

            return View(etutler);
        }

        // GET: Etut/Details/5
        public async Task<IActionResult> Details(int? id)
        {
            if (id == null) return NotFound();

            var etut = await _context.Etutler
                .Include(e => e.Ogrenciler)
                .FirstOrDefaultAsync(m => m.Id == id);

            if (etut == null) return NotFound();

            ViewBag.AvailableStudents = await _context.PansiyonOgrenciler
                .Include(o => o.Etut)
                .Where(o => o.Aktif && o.EtutId != id)
                .OrderBy(o => o.AdSoyad)
                .ToListAsync();

            return View(etut);
        }

        // POST: Etut/AddStudents
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> AddStudents(int etutId, List<int> ogrenciIds)
        {
            if (ogrenciIds == null || !ogrenciIds.Any())
            {
                TempData["ErrorMessage"] = "Lütfen etüte eklenecek en az bir öğrenci seçin.";
                return RedirectToAction(nameof(Details), new { id = etutId });
            }

            var etut = await _context.Etutler.Include(e => e.Ogrenciler).FirstOrDefaultAsync(e => e.Id == etutId);
            if (etut == null) return NotFound();

            int availableSpots = etut.Kapasite - etut.Ogrenciler.Count;
            if (ogrenciIds.Count > availableSpots)
            {
                TempData["ErrorMessage"] = $"Seçilen öğrenci sayısı ({ogrenciIds.Count}), etüt salonunun kalan kapasitesini ({availableSpots}) aşmaktadır.";
                return RedirectToAction(nameof(Details), new { id = etutId });
            }

            var students = await _context.PansiyonOgrenciler
                .Where(o => ogrenciIds.Contains(o.Id))
                .ToListAsync();

            foreach (var student in students)
            {
                student.EtutId = etutId;
            }

            await _context.SaveChangesAsync();
            TempData["SuccessMessage"] = $"{students.Count} öğrenci başarıyla etüt salonuna eklendi.";

            return RedirectToAction(nameof(Details), new { id = etutId });
        }

        // POST: Etut/RemoveStudent
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> RemoveStudent(int etutId, int ogrenciId)
        {
            var student = await _context.PansiyonOgrenciler.FindAsync(ogrenciId);
            if (student != null && student.EtutId == etutId)
            {
                student.EtutId = null;
                await _context.SaveChangesAsync();
                TempData["SuccessMessage"] = $"{student.AdSoyad} etüt salonundan kaldırıldı.";
            }

            return RedirectToAction(nameof(Details), new { id = etutId });
        }

        // GET: Etut/Create
        public IActionResult Create()
        {
            return View();
        }

        // POST: Etut/Create
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> Create([Bind("EtutAdi,Kapasite,Aciklama,Aktif")] Etut etut)
        {
            if (ModelState.IsValid)
            {
                etut.OlusturmaTarihi = DateTime.UtcNow;
                _context.Add(etut);
                await _context.SaveChangesAsync();
                TempData["SuccessMessage"] = "Etüt salonu başarıyla oluşturuldu.";
                return RedirectToAction(nameof(Index));
            }
            return View(etut);
        }

        // GET: Etut/Edit/5
        public async Task<IActionResult> Edit(int? id)
        {
            if (id == null) return NotFound();

            var etut = await _context.Etutler.FindAsync(id);
            if (etut == null) return NotFound();

            return View(etut);
        }

        // POST: Etut/Edit/5
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> Edit(int id, [Bind("Id,EtutAdi,Kapasite,Aciklama,Aktif,RowVersion")] Etut etut)
        {
            if (id != etut.Id) return NotFound();

            if (ModelState.IsValid)
            {
                try
                {
                    var dbEtut = await _context.Etutler.FindAsync(id);
                    if (dbEtut == null) return NotFound();

                    dbEtut.EtutAdi = etut.EtutAdi;
                    dbEtut.Kapasite = etut.Kapasite;
                    dbEtut.Aciklama = etut.Aciklama;
                    dbEtut.Aktif = etut.Aktif;

                    _context.Update(dbEtut);
                    await _context.SaveChangesAsync();
                    TempData["SuccessMessage"] = "Etüt salonu başarıyla güncellendi.";
                }
                catch (DbUpdateConcurrencyException)
                {
                    if (!EtutExists(etut.Id))
                    {
                        return NotFound();
                    }
                    else
                    {
                        ModelState.AddModelError("", "Bu kayıt başka bir kullanıcı tarafından güncellenmiş. Lütfen sayfayı yenileyip tekrar deneyin.");
                        return View(etut);
                    }
                }
                return RedirectToAction(nameof(Index));
            }
            return View(etut);
        }

        // GET: Etut/Delete/5
        public async Task<IActionResult> Delete(int? id)
        {
            if (id == null) return NotFound();

            var etut = await _context.Etutler
                .Include(e => e.Ogrenciler)
                .FirstOrDefaultAsync(m => m.Id == id);

            if (etut == null) return NotFound();

            return View(etut);
        }

        // POST: Etut/Delete/5
        [HttpPost, ActionName("Delete")]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> DeleteConfirmed(int id)
        {
            var etut = await _context.Etutler.FindAsync(id);
            if (etut == null) return NotFound();

            _context.Etutler.Remove(etut);
            await _context.SaveChangesAsync();
            TempData["SuccessMessage"] = "Etüt salonu başarıyla silindi.";
            return RedirectToAction(nameof(Index));
        }

        private bool EtutExists(int id)
        {
            return _context.Etutler.Any(e => e.Id == id);
        }
    }
}
