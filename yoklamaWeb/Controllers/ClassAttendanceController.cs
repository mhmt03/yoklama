using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OfficeOpenXml;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using yoklamaWeb.Data;
using yoklamaWeb.Models;

namespace yoklamaWeb.Controllers
{
    [Authorize(Roles = "Admin,Idareci,SinavYoneticisi,gunlukYoklamaci,SuperYoklamaci")]
    public class ClassAttendanceController : Controller
    {
        private readonly AppDbContext _context;

        public ClassAttendanceController(AppDbContext context)
        {
            _context = context;
        }

        public async Task<IActionResult> Index(string nameFilter = "", string buildingFilter = "", string statusFilter = "All", DateTime? dateFilter = null, string sortOrder = "date_desc")
        {
            var items = _context.ClassAttendances.AsQueryable();

            if (!string.IsNullOrWhiteSpace(nameFilter))
                items = items.Where(x => x.Name.Contains(nameFilter));

            if (!string.IsNullOrWhiteSpace(buildingFilter))
                items = items.Where(x => x.BuildingNumber.Contains(buildingFilter));

            var today = DateTime.UtcNow.Date;
            if (statusFilter == "Active")
            {
                items = items.Where(x => x.ValidFrom.Date <= today && x.ValidTo.Date >= today);
            }
            else if (statusFilter == "Expired")
            {
                items = items.Where(x => x.ValidTo.Date < today);
            }

            if (dateFilter.HasValue)
            {
                var targetDate = dateFilter.Value.Date;
                items = items.Where(x => x.ValidFrom.Date <= targetDate && x.ValidTo.Date >= targetDate);
            }

            switch (sortOrder)
            {
                case "date_asc":
                    items = items.OrderBy(x => x.ValidFrom);
                    break;
                case "date_desc":
                default:
                    items = items.OrderByDescending(x => x.ValidFrom);
                    break;
            }

            ViewData["NameFilter"] = nameFilter;
            ViewData["BuildingFilter"] = buildingFilter;
            ViewData["StatusFilter"] = statusFilter;
            ViewData["DateFilter"] = dateFilter?.ToString("yyyy-MM-dd");
            ViewData["SortOrder"] = sortOrder;

            var model = await items.ToListAsync();
            return View(model);
        }

        [Authorize(Roles = "Admin,Idareci,SinavYoneticisi")]
        public IActionResult Create()
        {
            return View();
        }

        [Authorize(Roles = "Admin,Idareci,SinavYoneticisi")]
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> Create(ClassAttendance model)
        {
            if (!ModelState.IsValid)
            {
                return View(model);
            }

            _context.Add(model);
            await _context.SaveChangesAsync();
            return RedirectToAction(nameof(Index));
        }

        [Authorize(Roles = "Admin,Idareci,SinavYoneticisi")]
        public async Task<IActionResult> Edit(int? id)
        {
            if (id == null) return NotFound();

            var attendance = await _context.ClassAttendances.FindAsync(id.Value);
            if (attendance == null) return NotFound();

            return View(attendance);
        }

        [Authorize(Roles = "Admin,Idareci,SinavYoneticisi")]
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> Edit(int id, ClassAttendance model)
        {
            if (id != model.Id) return NotFound();

            if (!ModelState.IsValid)
            {
                return View(model);
            }

            var attendance = await _context.ClassAttendances.FindAsync(id);
            if (attendance == null) return NotFound();

            attendance.Name = model.Name;
            attendance.BuildingNumber = model.BuildingNumber;
            attendance.ValidFrom = model.ValidFrom;
            attendance.ValidTo = model.ValidTo;
            attendance.StartTime = model.StartTime;
            attendance.EndTime = model.EndTime;
            attendance.OnlyCurrentDayAttendance = model.OnlyCurrentDayAttendance;

            try
            {
                _context.Update(attendance);
                await _context.SaveChangesAsync();
            }
            catch (DbUpdateConcurrencyException)
            {
                if (!await _context.ClassAttendances.AnyAsync(x => x.Id == id))
                    return NotFound();
                throw;
            }

            return RedirectToAction(nameof(Index));
        }

        public async Task<IActionResult> Details(int? id)
        {
            if (id == null) return NotFound();

            var attendance = await _context.ClassAttendances
                .Include(x => x.Students)
                .FirstOrDefaultAsync(x => x.Id == id.Value);

            if (attendance == null) return NotFound();

            var viewModel = new ClassAttendanceDetailsViewModel
            {
                Id = attendance.Id,
                Name = attendance.Name,
                BuildingNumber = attendance.BuildingNumber,
                ValidFrom = attendance.ValidFrom,
                ValidTo = attendance.ValidTo,
                StartTime = attendance.StartTime,
                EndTime = attendance.EndTime,
                OnlyCurrentDayAttendance = attendance.OnlyCurrentDayAttendance,
                Students = attendance.Students
                    .OrderBy(s => s.SinifDuzeyi)
                    .ThenBy(s => s.Sube)
                    .ThenBy(s => s.AdSoyad)
                    .Select(s => new ClassAttendanceStudentRowViewModel
                    {
                        Id = s.Id,
                        OgrenciNo = s.OgrenciNo,
                        AdSoyad = s.AdSoyad,
                        SinifDuzeyi = s.SinifDuzeyi,
                        Sube = s.Sube,
                        Salon = s.Salon,
                        Sira = s.Sira
                    })
                    .ToList()
            };

            return View(viewModel);
        }

        [Authorize(Roles = "Admin,Idareci,SinavYoneticisi")]
        public async Task<IActionResult> ImportStudents(int? id)
        {
            if (id == null) return NotFound();

            var attendance = await _context.ClassAttendances.FindAsync(id.Value);
            if (attendance == null) return NotFound();

            ViewBag.ClassAttendanceName = attendance.Name;
            ViewBag.ClassAttendanceId = attendance.Id;
            return View();
        }

        [Authorize(Roles = "Admin,Idareci,SinavYoneticisi")]
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> ImportStudents(int id, IFormFile excelFile, int startRow = 2)
        {
            var attendance = await _context.ClassAttendances.FindAsync(id);
            if (attendance == null) return NotFound();

            if (excelFile == null || excelFile.Length == 0)
            {
                ModelState.AddModelError("excelFile", "Excel dosyası seçilmedi.");
                ViewBag.ClassAttendanceName = attendance.Name;
                ViewBag.ClassAttendanceId = attendance.Id;
                return View();
            }

            var errors = new List<string>();
            var studentsToAdd = new List<ClassAttendanceStudent>();

            using var stream = new MemoryStream();
            await excelFile.CopyToAsync(stream);
            using var package = new ExcelPackage(stream);
            var worksheet = package.Workbook.Worksheets.FirstOrDefault();
            if (worksheet == null)
            {
                ModelState.AddModelError("excelFile", "Excel dosyasında çalışma sayfası bulunamadı.");
                ViewBag.ClassAttendanceName = attendance.Name;
                ViewBag.ClassAttendanceId = attendance.Id;
                return View();
            }

            var allowedHeaders = new[]
            {
                new[] { "Öğrenci No", "OgrenciNo" },
                new[] { "Ad Soyad", "AdSoyad" },
                new[] { "Sınıf Düzeyi", "SinifDuzeyi" },
                new[] { "Şube", "Sube" },
                new[] { "Salon" },
                new[] { "Sıra", "Sira" }
            };

            for (var col = 1; col <= allowedHeaders.Length; col++)
            {
                var header = worksheet.Cells[1, col].Text?.Trim();
                if (!allowedHeaders[col - 1].Any(h => string.Equals(header, h, StringComparison.OrdinalIgnoreCase)))
                {
                    var expectedNames = string.Join(" veya ", allowedHeaders[col - 1]);
                    errors.Add($"Beklenen başlık {expectedNames} yerine '{header}' bulundu (Sütun {col}).");
                }
            }

            if (errors.Any())
            {
                ViewData["Errors"] = errors;
                ViewBag.ClassAttendanceName = attendance.Name;
                ViewBag.ClassAttendanceId = attendance.Id;
                return View();
            }

            var row = startRow;
            while (true)
            {
                var ogrenciNo = worksheet.Cells[row, 1].Text?.Trim();
                var adSoyad = worksheet.Cells[row, 2].Text?.Trim();
                var sinifDuzeyi = worksheet.Cells[row, 3].Text?.Trim();
                var sube = worksheet.Cells[row, 4].Text?.Trim();
                var salon = worksheet.Cells[row, 5].Text?.Trim();
                var sira = worksheet.Cells[row, 6].Text?.Trim();

                if (string.IsNullOrWhiteSpace(ogrenciNo) && string.IsNullOrWhiteSpace(adSoyad)
                    && string.IsNullOrWhiteSpace(sinifDuzeyi) && string.IsNullOrWhiteSpace(sube)
                    && string.IsNullOrWhiteSpace(salon) && string.IsNullOrWhiteSpace(sira))
                {
                    break;
                }

                if (string.IsNullOrWhiteSpace(ogrenciNo))
                    errors.Add($"Satır {row}: Öğrenci No eksik.");
                if (string.IsNullOrWhiteSpace(adSoyad))
                    errors.Add($"Satır {row}: Ad Soyad eksik.");
                if (string.IsNullOrWhiteSpace(sinifDuzeyi))
                    errors.Add($"Satır {row}: Sınıf Düzeyi eksik.");
                if (string.IsNullOrWhiteSpace(sube))
                    errors.Add($"Satır {row}: Şube eksik.");

                if (!errors.Any(e => e.StartsWith($"Satır {row}:")))
                {
                    var ogrenciExists = await _context.Ogrenciler.AnyAsync(x => x.OgrenciNo == ogrenciNo);
                    if (!ogrenciExists)
                    {
                        errors.Add($"Satır {row}: Öğrenci No '{ogrenciNo}' sistemde bulunamadı.");
                    }
                    else
                    {
                        studentsToAdd.Add(new ClassAttendanceStudent
                        {
                            ClassAttendanceId = id,
                            OgrenciNo = ogrenciNo!,
                            AdSoyad = adSoyad!,
                            SinifDuzeyi = sinifDuzeyi!,
                            Sube = sube!,
                            Salon = string.IsNullOrWhiteSpace(salon) ? null : salon,
                            Sira = string.IsNullOrWhiteSpace(sira) ? null : sira
                        });
                    }
                }

                row++;
            }

            if (errors.Any())
            {
                ViewData["Errors"] = errors;
                ViewBag.ClassAttendanceName = attendance.Name;
                ViewBag.ClassAttendanceId = attendance.Id;
                return View();
            }

            var existing = await _context.ClassAttendanceStudents
                .Where(x => x.ClassAttendanceId == id)
                .ToListAsync();

            _context.ClassAttendanceStudents.RemoveRange(existing);
            _context.ClassAttendanceStudents.AddRange(studentsToAdd);
            await _context.SaveChangesAsync();

            TempData["SuccessMessage"] = "Sınıf yoklaması öğrenci listesi başarıyla yüklendi.";
            return RedirectToAction(nameof(Details), new { id });
        }

        public async Task<IActionResult> DownloadTemplate(int id)
        {
            var attendance = await _context.ClassAttendances.FindAsync(id);
            if (attendance == null) return NotFound();

            ExcelPackage.LicenseContext = LicenseContext.NonCommercial;
            using var package = new ExcelPackage();
            var worksheet = package.Workbook.Worksheets.Add("Sınıf Yoklaması Şablonu");

            var headers = new[] { "Öğrenci No", "Ad Soyad", "Sınıf Düzeyi", "Şube", "Salon", "Sıra" };
            for (var i = 0; i < headers.Length; i++)
            {
                worksheet.Cells[1, i + 1].Value = headers[i];
                worksheet.Cells[1, i + 1].Style.Font.Bold = true;
            }

            worksheet.Cells[2, 1, 2, headers.Length].Value = string.Empty;
            worksheet.Cells[worksheet.Dimension.Address].AutoFitColumns();

            var fileName = GetSafeFileName($"SinifYoklamasi_Sablon_{attendance.Name}") + ".xlsx";
            return File(package.GetAsByteArray(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", fileName);
        }

        public async Task<IActionResult> ExportStudents(int id)
        {
            var attendance = await _context.ClassAttendances
                .Include(x => x.Students)
                .FirstOrDefaultAsync(x => x.Id == id);

            if (attendance == null) return NotFound();

            ExcelPackage.LicenseContext = LicenseContext.NonCommercial;
            using var package = new ExcelPackage();
            var worksheet = package.Workbook.Worksheets.Add("Sınıf Yoklaması");

            worksheet.Cells[1, 1].Value = "Yoklama Adı";
            worksheet.Cells[1, 2].Value = attendance.Name;
            worksheet.Cells[2, 1].Value = "Bina";
            worksheet.Cells[2, 2].Value = attendance.BuildingNumber;
            worksheet.Cells[3, 1].Value = "Geçerlilik";
            worksheet.Cells[3, 2].Value = $"{attendance.ValidFrom:yyyy-MM-dd} - {attendance.ValidTo:yyyy-MM-dd}";
            worksheet.Cells[4, 1].Value = "Saat";
            worksheet.Cells[4, 2].Value = attendance.StartTime.HasValue && attendance.EndTime.HasValue
                ? $"{attendance.StartTime:hh\\:mm} - {attendance.EndTime:hh\\:mm}"
                : string.Empty;
            worksheet.Cells[5, 1].Value = "Sadece Kendi Gününde";
            worksheet.Cells[5, 2].Value = attendance.OnlyCurrentDayAttendance ? "Evet" : "Hayır";

            var headers = new[] { "OgrenciNo", "AdSoyad", "SinifDuzeyi", "Sube", "Salon", "Sira" };
            var headerRow = 7;
            for (var i = 0; i < headers.Length; i++)
            {
                worksheet.Cells[headerRow, i + 1].Value = headers[i];
                worksheet.Cells[headerRow, i + 1].Style.Font.Bold = true;
            }

            var rowIndex = headerRow + 1;
            foreach (var student in attendance.Students.OrderBy(s => s.SinifDuzeyi).ThenBy(s => s.Sube).ThenBy(s => s.AdSoyad))
            {
                worksheet.Cells[rowIndex, 1].Value = student.OgrenciNo;
                worksheet.Cells[rowIndex, 2].Value = student.AdSoyad;
                worksheet.Cells[rowIndex, 3].Value = student.SinifDuzeyi;
                worksheet.Cells[rowIndex, 4].Value = student.Sube;
                worksheet.Cells[rowIndex, 5].Value = student.Salon;
                worksheet.Cells[rowIndex, 6].Value = student.Sira;
                rowIndex++;
            }

            worksheet.Cells[worksheet.Dimension.Address].AutoFitColumns();

            var fileName = GetSafeFileName($"SinifYoklamasi_{attendance.Name}_{attendance.ValidFrom:yyyyMMdd}") + ".xlsx";
            return File(package.GetAsByteArray(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", fileName);
        }

        [Authorize(Roles = "Admin,Idareci,SinavYoneticisi")]
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> CreateDailyAttendanceLists(int id, DateTime startDate, DateTime endDate, int dailyCount = 1)
        {
            var attendance = await _context.ClassAttendances
                .Include(x => x.Students)
                .FirstOrDefaultAsync(x => x.Id == id);

            if (attendance == null) return NotFound();

            // Validate date range
            if (startDate > endDate)
            {
                TempData["ErrorMessage"] = "Başlangıç tarihi bitiş tarihinden sonra olamaz.";
                return RedirectToAction(nameof(Details), new { id });
            }

            // Ensure dates are within the original attendance's valid range
            if (startDate.Date < attendance.ValidFrom.Date || endDate.Date > attendance.ValidTo.Date)
            {
                TempData["ErrorMessage"] = "Seçilen tarih aralığı orijinal yoklama geçerlilik aralığı içinde olmalıdır.";
                return RedirectToAction(nameof(Details), new { id });
            }

            if (dailyCount < 1) dailyCount = 1;

            var createdCount = 0;
            var currentDate = startDate.Date;

            while (currentDate <= endDate.Date)
            {
                // Check if already exists for this date and template
                var dailyAttendance = await _context.DailyClassAttendances
                    .Include(d => d.Students)
                    .FirstOrDefaultAsync(d => d.ClassAttendanceId == id && d.Tarih == currentDate);

                if (dailyAttendance == null)
                {
                    dailyAttendance = new DailyClassAttendance
                    {
                        ClassAttendanceId = id,
                        Tarih = currentDate,
                        SalonNotu = "",
                        GozetmenNotu = "",
                        YoklamaYapanKullaniciAdi = User.Identity?.Name,
                        KayitZamani = DateTime.UtcNow
                    };

                    _context.DailyClassAttendances.Add(dailyAttendance);
                    await _context.SaveChangesAsync(); // Save to get ID
                    createdCount++;
                }

                // Add student sessions up to dailyCount
                var existingOturumlar = dailyAttendance.Students.Select(s => s.OturumNo).Distinct().ToList();
                var studentsToInsert = new List<DailyClassAttendanceStudent>();

                for (int i = 1; i <= dailyCount; i++)
                {
                    if (!existingOturumlar.Contains(i))
                    {
                        var studentsToCopy = attendance.Students.Select(s => new DailyClassAttendanceStudent
                        {
                            DailyClassAttendanceId = dailyAttendance.Id,
                            OgrenciNo = s.OgrenciNo,
                            AdSoyad = s.AdSoyad,
                            SinifDuzeyi = s.SinifDuzeyi,
                            Sube = s.Sube,
                            Salon = s.Salon,
                            Sira = s.Sira,
                            Durum = "Belirsiz",
                            OturumNo = i,
                            Not = ""
                        }).ToList();

                        studentsToInsert.AddRange(studentsToCopy);
                    }
                }

                if (studentsToInsert.Any())
                {
                    _context.DailyClassAttendanceStudents.AddRange(studentsToInsert);
                    await _context.SaveChangesAsync();
                }

                currentDate = currentDate.AddDays(1);
            }

            TempData["SuccessMessage"] = $"{createdCount} adet günlük yoklama listesi başarıyla oluşturuldu.";
            return RedirectToAction(nameof(DailyAttendance));
        }

        [HttpGet]
        public async Task<IActionResult> DailyAttendance(DateTime? tarih, int? classAttendanceId, int? oturumNo)
        {
            var secilenTarih = tarih ?? DateTime.Today;

            // Fetch all active ClassAttendance templates
            var templates = await _context.ClassAttendances.OrderBy(c => c.Name).ToListAsync();
            ViewBag.Templates = templates;

            // If template ID is not passed, find any active daily attendance today to show
            if (!classAttendanceId.HasValue)
            {
                var dailyToday = await _context.DailyClassAttendances
                    .FirstOrDefaultAsync(d => d.Tarih == secilenTarih);
                if (dailyToday != null)
                {
                    classAttendanceId = dailyToday.ClassAttendanceId;
                }
            }

            var secilenTemplateId = classAttendanceId ?? templates.FirstOrDefault()?.Id ?? 0;
            ViewBag.SelectedTemplateId = secilenTemplateId;
            ViewBag.SelectedTarih = secilenTarih;

            // Load the DailyClassAttendance
            var dailyAttendance = await _context.DailyClassAttendances
                .FirstOrDefaultAsync(d => d.ClassAttendanceId == secilenTemplateId && d.Tarih == secilenTarih);

            // Authorization & Schedule Check
            bool isAuthorized = true;
            List<string> assignedSalons = null!;
            List<int> teacherSessions = null!;

            if (User.IsInRole("gunlukYoklamaci"))
            {
                var username = User.Identity?.Name;
                var teacher = await _context.GunlukYoklamacilar.FirstOrDefaultAsync(y => y.KullaniciAdi == username);
                if (teacher == null)
                {
                    isAuthorized = false;
                }
                else
                {
                    // Get Turkish day name
                    string dayName = secilenTarih.ToString("dddd", new System.Globalization.CultureInfo("tr-TR"));
                    
                    // Filter available sessions for the teacher
                    teacherSessions = await _context.GunlukYoklamaciProgramlari
                        .Where(p => p.GunlukYoklamaciId == teacher.Id && p.Gun == dayName)
                        .Select(p => p.OturumNo)
                        .Distinct()
                        .OrderBy(o => o)
                        .ToListAsync();

                    if (teacherSessions.Any())
                    {
                        if (!oturumNo.HasValue || !teacherSessions.Contains(oturumNo.Value))
                        {
                            oturumNo = teacherSessions.First();
                        }
                    }
                    else
                    {
                        isAuthorized = false;
                    }

                    // Get assigned salons for this teacher's selected day and session
                    if (oturumNo.HasValue)
                    {
                        assignedSalons = await _context.GunlukYoklamaciProgramlari
                            .Where(p => p.GunlukYoklamaciId == teacher.Id && p.Gun == dayName && p.OturumNo == oturumNo.Value)
                            .Select(p => p.Salon)
                            .ToListAsync();
                    }

                    // Get today's classes info banner
                    var todaysProgram = await _context.GunlukYoklamaciProgramlari
                        .Where(p => p.GunlukYoklamaciId == teacher.Id && p.Gun == dayName)
                        .OrderBy(p => p.OturumNo)
                        .Select(p => new { p.OturumNo, p.Salon })
                        .ToListAsync();

                    ViewBag.TodaysProgramInfo = todaysProgram.Select(p => $"{p.OturumNo}. Oturum: {p.Salon}").ToList();
                }
            }

            ViewBag.IsAuthorized = isAuthorized;
            ViewBag.TeacherAssignedSalons = assignedSalons;

            // Fetch available sessions from the student list
            var availableSessions = new List<int>();
            if (dailyAttendance != null)
            {
                if (User.IsInRole("gunlukYoklamaci") && teacherSessions != null)
                {
                    availableSessions = teacherSessions;
                }
                else
                {
                    availableSessions = await _context.DailyClassAttendanceStudents
                        .Where(s => s.DailyClassAttendanceId == dailyAttendance.Id)
                        .Select(s => s.OturumNo)
                        .Distinct()
                        .OrderBy(o => o)
                        .ToListAsync();
                }
            }

            ViewBag.AvailableSessions = availableSessions;

            var secilenOturum = oturumNo ?? (availableSessions.Any() ? availableSessions.First() : 1);
            ViewBag.SelectedOturum = secilenOturum;

            if (dailyAttendance != null)
            {
                var queryStudents = _context.DailyClassAttendanceStudents
                    .Where(s => s.DailyClassAttendanceId == dailyAttendance.Id && s.OturumNo == secilenOturum);

                if (User.IsInRole("gunlukYoklamaci") && assignedSalons != null)
                {
                    queryStudents = queryStudents.Where(s => assignedSalons.Contains(s.Salon ?? ""));
                }

                dailyAttendance.Students = await queryStudents
                    .OrderBy(s => s.SinifDuzeyi).ThenBy(s => s.Sube).ThenBy(s => s.AdSoyad)
                    .ToListAsync();

                // Retrieve audit details
                var auditStudent = dailyAttendance.Students.FirstOrDefault(s => !string.IsNullOrEmpty(s.YoklamaYapanKullaniciAdi));
                if (auditStudent != null)
                {
                    ViewBag.SubmittedBy = auditStudent.YoklamaYapanKullaniciAdi;
                    ViewBag.SubmittedAt = auditStudent.KayitZamani?.AddHours(3).ToString("dd.MM.yyyy HH:mm");

                    var teacher = await _context.GunlukYoklamacilar.FirstOrDefaultAsync(y => y.KullaniciAdi == auditStudent.YoklamaYapanKullaniciAdi);
                    ViewBag.SubmittedByFullName = teacher != null ? teacher.AdSoyad : auditStudent.YoklamaYapanKullaniciAdi;
                }
            }

            return View(dailyAttendance);
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> SaveDailyAttendance(int dailyAttendanceId, int oturumNo, Dictionary<int, string> studentDurum, Dictionary<int, string> studentNot, string salonNotu, string gozetmenNotu)
        {
            var dailyAttendance = await _context.DailyClassAttendances
                .FirstOrDefaultAsync(d => d.Id == dailyAttendanceId);

            if (dailyAttendance == null)
            {
                TempData["ErrorMessage"] = "Yoklama kaydı bulunamadı.";
                return RedirectToAction(nameof(DailyAttendance));
            }

            // Authorization & Schedule Check on POST
            List<string> assignedSalons = null!;
            if (User.IsInRole("gunlukYoklamaci"))
            {
                var username = User.Identity?.Name;
                var teacher = await _context.GunlukYoklamacilar.FirstOrDefaultAsync(y => y.KullaniciAdi == username);
                if (teacher == null)
                {
                    TempData["ErrorMessage"] = "Yoklama alma yetkiniz bulunmamaktadır.";
                    return RedirectToAction(nameof(DailyAttendance));
                }

                string dayName = dailyAttendance.Tarih.ToString("dddd", new System.Globalization.CultureInfo("tr-TR"));
                assignedSalons = await _context.GunlukYoklamaciProgramlari
                    .Where(p => p.GunlukYoklamaciId == teacher.Id && p.Gun == dayName && p.OturumNo == oturumNo)
                    .Select(p => p.Salon)
                    .ToListAsync();

                if (!assignedSalons.Any())
                {
                    TempData["ErrorMessage"] = "Bu gün ve oturumda ders programınız bulunmadığı için yoklama kaydedilemez.";
                    return RedirectToAction(nameof(DailyAttendance), new { tarih = dailyAttendance.Tarih.ToString("yyyy-MM-dd"), classAttendanceId = dailyAttendance.ClassAttendanceId, oturumNo = oturumNo });
                }
            }

            dailyAttendance.SalonNotu = salonNotu;
            dailyAttendance.GozetmenNotu = gozetmenNotu;
            dailyAttendance.YoklamaYapanKullaniciAdi = User.Identity?.Name;
            dailyAttendance.KayitZamani = DateTime.UtcNow;

            var students = await _context.DailyClassAttendanceStudents
                .Where(s => s.DailyClassAttendanceId == dailyAttendanceId && s.OturumNo == oturumNo)
                .ToListAsync();

            foreach (var student in students)
            {
                // If the user is a daily proctor, they can only edit students in their assigned salons
                if (assignedSalons != null && !assignedSalons.Contains(student.Salon ?? ""))
                {
                    continue;
                }

                if (studentDurum != null && studentDurum.ContainsKey(student.Id))
                {
                    student.Durum = studentDurum[student.Id];
                }
                if (studentNot != null && studentNot.ContainsKey(student.Id))
                {
                    student.Not = studentNot[student.Id];
                }
                student.YoklamaYapanKullaniciAdi = User.Identity?.Name;
                student.KayitZamani = DateTime.UtcNow;
            }

            await _context.SaveChangesAsync();
            TempData["SuccessMessage"] = "Yoklama başarıyla kaydedildi.";

            return RedirectToAction(nameof(DailyAttendance), new { 
                tarih = dailyAttendance.Tarih.ToString("yyyy-MM-dd"), 
                classAttendanceId = dailyAttendance.ClassAttendanceId, 
                oturumNo = oturumNo 
            });
        }
        [HttpGet]
        public async Task<IActionResult> DailyAttendanceList(DateTime? dateFilter, int? classAttendanceId)
        {
            var templates = await _context.ClassAttendances.OrderBy(c => c.Name).ToListAsync();
            ViewBag.Templates = templates;

            var query = _context.DailyClassAttendances
                .Include(d => d.ClassAttendance)
                .Include(d => d.Students)
                .AsQueryable();

            if (dateFilter.HasValue)
            {
                query = query.Where(d => d.Tarih == dateFilter.Value.Date);
            }

            if (classAttendanceId.HasValue && classAttendanceId.Value > 0)
            {
                query = query.Where(d => d.ClassAttendanceId == classAttendanceId.Value);
            }

            var list = await query
                .OrderByDescending(d => d.Tarih)
                .ThenBy(d => d.ClassAttendance.Name)
                .ToListAsync();

            ViewBag.DateFilter = dateFilter?.ToString("yyyy-MM-dd");
            ViewBag.SelectedTemplateId = classAttendanceId;

            return View(list);
        }

        [Authorize(Roles = "Admin,Idareci,SinavYoneticisi")]
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> DeleteDailyAttendance(int id)
        {
            var dailyAttendance = await _context.DailyClassAttendances.FindAsync(id);
            if (dailyAttendance != null)
            {
                _context.DailyClassAttendances.Remove(dailyAttendance);
                await _context.SaveChangesAsync();
                TempData["SuccessMessage"] = "Günlük yoklama listesi başarıyla silindi.";
            }
            else
            {
                TempData["ErrorMessage"] = "Silinecek yoklama listesi bulunamadı.";
            }

            return RedirectToAction(nameof(DailyAttendanceList));
        }

        // GET: ClassAttendance/Delete/5
        [Authorize(Roles = "Admin,Idareci,SinavYoneticisi")]
        public async Task<IActionResult> Delete(int? id)
        {
            if (id == null) return NotFound();
            var attendance = await _context.ClassAttendances.FindAsync(id);
            if (attendance == null) return NotFound();
            return View(attendance);
        }

        // POST: ClassAttendance/Delete/5
        [Authorize(Roles = "Admin,Idareci,SinavYoneticisi")]
        [HttpPost, ActionName("Delete")]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> DeleteConfirmed(int id)
        {
            var attendance = await _context.ClassAttendances.FindAsync(id);
            if (attendance != null)
            {
                _context.ClassAttendances.Remove(attendance);
                await _context.SaveChangesAsync();
            }
            return RedirectToAction(nameof(Index));
        }

        private static string GetSafeFileName(string fileName)
        {
            var invalidChars = Path.GetInvalidFileNameChars();
            return string.Concat(fileName.Select(ch => invalidChars.Contains(ch) ? '_' : ch));
        }
    }
}
