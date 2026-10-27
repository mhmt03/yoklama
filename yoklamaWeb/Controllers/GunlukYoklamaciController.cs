using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using yoklamaWeb.Data;
using yoklamaWeb.Models;
using System.Linq;
using System.Threading.Tasks;

namespace yoklamaWeb.Controllers
{
    [Authorize(Roles = "Admin,Idareci,SinavYoneticisi")]
    public class GunlukYoklamaciController : Controller
    {
        private readonly AppDbContext _context;

        public GunlukYoklamaciController(AppDbContext context)
        {
            _context = context;
        }

        // GET: GunlukYoklamaci
        public async Task<IActionResult> Index(string arama)
        {
            var query = _context.GunlukYoklamacilar.AsQueryable();

            if (!string.IsNullOrWhiteSpace(arama))
            {
                query = query.Where(y => y.AdSoyad.Contains(arama) || y.KullaniciAdi.Contains(arama) || y.Brans.Contains(arama));
            }

            var list = await query.OrderBy(y => y.AdSoyad).ToListAsync();
            ViewBag.Arama = arama;
            return View(list);
        }

        // GET: GunlukYoklamaci/Create
        public IActionResult Create()
        {
            return View();
        }

        // POST: GunlukYoklamaci/Create
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> Create([Bind("AdSoyad,KullaniciAdi,Sifre,Brans")] GunlukYoklamaci yoklamaci)
        {
            if (ModelState.IsValid)
            {
                // Check if username already exists
                var exists = await _context.GunlukYoklamacilar.AnyAsync(y => y.KullaniciAdi == yoklamaci.KullaniciAdi);
                if (exists)
                {
                    ModelState.AddModelError("KullaniciAdi", "Bu kullanıcı adı zaten kullanılmaktadır.");
                    return View(yoklamaci);
                }

                _context.Add(yoklamaci);
                await _context.SaveChangesAsync();
                TempData["SuccessMessage"] = "Günlük yoklamacı başarıyla eklendi.";
                return RedirectToAction(nameof(Index));
            }
            return View(yoklamaci);
        }

        // GET: GunlukYoklamaci/Edit/5
        public async Task<IActionResult> Edit(int? id)
        {
            if (id == null) return NotFound();

            var yoklamaci = await _context.GunlukYoklamacilar.FindAsync(id);
            if (yoklamaci == null) return NotFound();

            return View(yoklamaci);
        }

        // POST: GunlukYoklamaci/Edit/5
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> Edit(int id, [Bind("Id,AdSoyad,KullaniciAdi,Sifre,Brans")] GunlukYoklamaci yoklamaci)
        {
            if (id != yoklamaci.Id) return NotFound();

            if (ModelState.IsValid)
            {
                // Check username unique constraint (excluding self)
                var exists = await _context.GunlukYoklamacilar.AnyAsync(y => y.KullaniciAdi == yoklamaci.KullaniciAdi && y.Id != id);
                if (exists)
                {
                    ModelState.AddModelError("KullaniciAdi", "Bu kullanıcı adı zaten kullanılmaktadır.");
                    return View(yoklamaci);
                }

                try
                {
                    _context.Update(yoklamaci);
                    await _context.SaveChangesAsync();
                    TempData["SuccessMessage"] = "Günlük yoklamacı başarıyla güncellendi.";
                }
                catch (DbUpdateConcurrencyException)
                {
                    if (!GunlukYoklamaciExists(yoklamaci.Id))
                    {
                        return NotFound();
                    }
                    else
                    {
                        throw;
                    }
                }
                return RedirectToAction(nameof(Index));
            }
            return View(yoklamaci);
        }

        // GET: GunlukYoklamaci/Delete/5
        public async Task<IActionResult> Delete(int? id)
        {
            if (id == null) return NotFound();

            var yoklamaci = await _context.GunlukYoklamacilar
                .FirstOrDefaultAsync(m => m.Id == id);
            if (yoklamaci == null) return NotFound();

            return View(yoklamaci);
        }

        // POST: GunlukYoklamaci/Delete/5
        [HttpPost, ActionName("Delete")]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> DeleteConfirmed(int id)
        {
            var yoklamaci = await _context.GunlukYoklamacilar.FindAsync(id);
            if (yoklamaci != null)
            {
                _context.GunlukYoklamacilar.Remove(yoklamaci);
                await _context.SaveChangesAsync();
                TempData["SuccessMessage"] = "Günlük yoklamacı başarıyla silindi.";
            }
            return RedirectToAction(nameof(Index));
        }

        [HttpGet]
        public async Task<IActionResult> GetProgram(int id)
        {
            var program = await _context.GunlukYoklamaciProgramlari
                .Where(p => p.GunlukYoklamaciId == id)
                .Select(p => new { p.Gun, p.OturumNo, p.Salon })
                .ToListAsync();

            var salons = await _context.PlannerRooms.OrderBy(r => r.RoomName).Select(r => r.RoomName).ToListAsync();

            return Json(new { program, salons });
        }

        [HttpPost]
        public async Task<IActionResult> SaveProgram(int proctorId, [FromBody] System.Collections.Generic.List<ProgramItemInput> items)
        {
            var proctor = await _context.GunlukYoklamacilar.FindAsync(proctorId);
            if (proctor == null) return NotFound();

            // Clear existing schedule
            var existing = _context.GunlukYoklamaciProgramlari.Where(p => p.GunlukYoklamaciId == proctorId);
            _context.GunlukYoklamaciProgramlari.RemoveRange(existing);

            if (items != null)
            {
                foreach (var item in items)
                {
                    if (!string.IsNullOrWhiteSpace(item.Salon))
                    {
                        var newProg = new GunlukYoklamaciProgram
                        {
                            GunlukYoklamaciId = proctorId,
                            Gun = item.Gun,
                            OturumNo = item.OturumNo,
                            Salon = item.Salon
                        };
                        _context.GunlukYoklamaciProgramlari.Add(newProg);
                    }
                }
            }

            await _context.SaveChangesAsync();
            return Json(new { success = true });
        }

        [HttpGet]
        public IActionResult DownloadTemplate()
        {
            using var package = new OfficeOpenXml.ExcelPackage();
            var worksheet = package.Workbook.Worksheets.Add("Yoklamaci Program Sablonu");

            // Headers
            worksheet.Cells[1, 1].Value = "KullaniciAdi";
            worksheet.Cells[1, 2].Value = "Gun";
            worksheet.Cells[1, 3].Value = "OturumNo";
            worksheet.Cells[1, 4].Value = "Salon";

            using (var range = worksheet.Cells[1, 1, 1, 4])
            {
                range.Style.Font.Bold = true;
            }

            // Example data
            worksheet.Cells[2, 1].Value = "ahmetyilmaz";
            worksheet.Cells[2, 2].Value = "Pazartesi";
            worksheet.Cells[2, 3].Value = 1;
            worksheet.Cells[2, 4].Value = "Salon A";

            worksheet.Cells[3, 1].Value = "ahmetyilmaz";
            worksheet.Cells[3, 2].Value = "Pazartesi";
            worksheet.Cells[3, 3].Value = 2;
            worksheet.Cells[3, 4].Value = "Salon B";

            worksheet.Cells[worksheet.Dimension.Address].AutoFitColumns();

            var fileBytes = package.GetAsByteArray();
            return File(fileBytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Yoklamaci_Ders_Programi_Sablon.xlsx");
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> UploadExcel(Microsoft.AspNetCore.Http.IFormFile excelFile)
        {
            if (excelFile == null || excelFile.Length == 0)
            {
                TempData["ErrorMessage"] = "Lütfen geçerli bir Excel dosyası seçin.";
                return RedirectToAction(nameof(Index));
            }

            try
            {
                using var stream = excelFile.OpenReadStream();
                using var package = new OfficeOpenXml.ExcelPackage(stream);
                var worksheet = package.Workbook.Worksheets.FirstOrDefault();

                if (worksheet == null)
                {
                    TempData["ErrorMessage"] = "Excel dosyasında çalışma sayfası bulunamadı.";
                    return RedirectToAction(nameof(Index));
                }

                var rowCount = worksheet.Dimension.Rows;
                if (rowCount < 2)
                {
                    TempData["ErrorMessage"] = "Excel dosyasında veri satırı bulunamadı.";
                    return RedirectToAction(nameof(Index));
                }

                var users = await _context.GunlukYoklamacilar.ToListAsync();
                var userMap = users.ToDictionary(u => u.KullaniciAdi.ToLower().Trim(), u => u.Id);

                // Collect usernames from sheet to clear their schedules first
                var usernamesToImport = new System.Collections.Generic.HashSet<string>();
                for (int row = 2; row <= rowCount; row++)
                {
                    var userVal = worksheet.Cells[row, 1].Value?.ToString()?.ToLower()?.Trim();
                    if (!string.IsNullOrEmpty(userVal))
                    {
                        usernamesToImport.Add(userVal);
                    }
                }

                // Clear old programs of these teachers
                var teacherIdsToClear = usernamesToImport
                    .Where(u => userMap.ContainsKey(u))
                    .Select(u => userMap[u])
                    .ToList();

                if (teacherIdsToClear.Any())
                {
                    var oldProgs = _context.GunlukYoklamaciProgramlari
                        .Where(p => teacherIdsToClear.Contains(p.GunlukYoklamaciId));
                    _context.GunlukYoklamaciProgramlari.RemoveRange(oldProgs);
                    await _context.SaveChangesAsync();
                }

                var listToInsert = new System.Collections.Generic.List<GunlukYoklamaciProgram>();
                var skipCount = 0;

                for (int row = 2; row <= rowCount; row++)
                {
                    var userVal = worksheet.Cells[row, 1].Value?.ToString()?.ToLower()?.Trim();
                    var gunVal = worksheet.Cells[row, 2].Value?.ToString()?.Trim();
                    var oturumValStr = worksheet.Cells[row, 3].Value?.ToString()?.Trim();
                    var salonVal = worksheet.Cells[row, 4].Value?.ToString()?.Trim();

                    if (string.IsNullOrEmpty(userVal) || string.IsNullOrEmpty(gunVal) || string.IsNullOrEmpty(oturumValStr) || string.IsNullOrEmpty(salonVal))
                    {
                        skipCount++;
                        continue;
                    }

                    if (userMap.TryGetValue(userVal, out int proctorId))
                    {
                        if (int.TryParse(oturumValStr, out int oturumNo))
                        {
                            listToInsert.Add(new GunlukYoklamaciProgram
                            {
                                GunlukYoklamaciId = proctorId,
                                Gun = gunVal,
                                OturumNo = oturumNo,
                                Salon = salonVal
                            });
                        }
                        else
                        {
                            skipCount++;
                        }
                    }
                    else
                    {
                        skipCount++;
                    }
                }

                if (listToInsert.Any())
                {
                    _context.GunlukYoklamaciProgramlari.AddRange(listToInsert);
                    await _context.SaveChangesAsync();
                }

                TempData["SuccessMessage"] = $"{listToInsert.Count} program kaydı başarıyla yüklendi. (Atlanan satır: {skipCount})";
            }
            catch (System.Exception ex)
            {
                TempData["ErrorMessage"] = "Excel yükleme hatası: " + ex.Message;
            }

            return RedirectToAction(nameof(Index));
        }

        public class ProgramItemInput
        {
            public string Gun { get; set; } = null!;
            public int OturumNo { get; set; }
            public string Salon { get; set; } = null!;
        }

        private bool GunlukYoklamaciExists(int id)
        {
            return _context.GunlukYoklamacilar.Any(e => e.Id == id);
        }
    }
}
