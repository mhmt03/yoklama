using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Linq;
using System.Threading.Tasks;
using yoklamaWeb.Data;

namespace yoklamaWeb.Controllers
{
    [Authorize(Roles = "Admin")]
    public class SystemLogController : Controller
    {
        private readonly AppDbContext _context;

        public SystemLogController(AppDbContext context)
        {
            _context = context;
        }

        // GET: SystemLog
        // POST: Delete a single log entry
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> Delete(int id)
        {
            var log = await _context.SystemLogs.FindAsync(id);
            if (log != null)
            {
                _context.SystemLogs.Remove(log);
                await _context.SaveChangesAsync();
            }
            return RedirectToAction(nameof(Index));
        }

        // POST: Delete all log entries
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> DeleteAll()
        {
            _context.SystemLogs.RemoveRange(_context.SystemLogs);
            await _context.SaveChangesAsync();
            return RedirectToAction(nameof(Index));
        }

        // GET: SystemLog
        public async Task<IActionResult> Index(string arama, string rol, string metot, int sayfa = 1)
        {
            const int SayfaBoyutu = 50;

            var query = _context.SystemLogs.AsQueryable();

            if (!string.IsNullOrWhiteSpace(arama))
            {
                query = query.Where(l => l.KullaniciAdi.Contains(arama) || 
                                         l.ControllerName.Contains(arama) || 
                                         l.ActionName.Contains(arama) || 
                                         l.Parametreler.Contains(arama) || 
                                         l.IpAdresi.Contains(arama));
            }

            if (!string.IsNullOrWhiteSpace(rol))
            {
                query = query.Where(l => l.Rol.Contains(rol));
            }

            if (!string.IsNullOrWhiteSpace(metot))
            {
                query = query.Where(l => l.Metot == metot);
            }

            var toplamKayit = await query.CountAsync();
            var logs = await query
                .OrderByDescending(l => l.Tarih)
                .Skip((sayfa - 1) * SayfaBoyutu)
                .Take(SayfaBoyutu)
                .ToListAsync();

            ViewBag.Arama = arama;
            ViewBag.SeciliRol = rol;
            ViewBag.SeciliMetot = metot;
            ViewBag.Sayfa = sayfa;
            ViewBag.ToplamSayfa = (int)System.Math.Ceiling((double)toplamKayit / SayfaBoyutu);
            ViewBag.ToplamKayit = toplamKayit;

            return View(logs);
        }
    }
}
