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
    [Authorize(Roles = "Admin")]
    public class ClassAttendanceController : Controller
    {
        private readonly AppDbContext _context;

        public ClassAttendanceController(AppDbContext context)
        {
            _context = context;
        }

        public async Task<IActionResult> Index(string nameFilter = "", string buildingFilter = "", string statusFilter = "All")
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

            ViewData["NameFilter"] = nameFilter;
            ViewData["BuildingFilter"] = buildingFilter;
            ViewData["StatusFilter"] = statusFilter;

            var model = await items.OrderByDescending(x => x.ValidFrom).ToListAsync();
            return View(model);
        }

        public IActionResult Create()
        {
            return View();
        }

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

        public async Task<IActionResult> Edit(int? id)
        {
            if (id == null) return NotFound();

            var attendance = await _context.ClassAttendances.FindAsync(id.Value);
            if (attendance == null) return NotFound();

            return View(attendance);
        }

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

        public async Task<IActionResult> ImportStudents(int? id)
        {
            if (id == null) return NotFound();

            var attendance = await _context.ClassAttendances.FindAsync(id.Value);
            if (attendance == null) return NotFound();

            ViewBag.ClassAttendanceName = attendance.Name;
            ViewBag.ClassAttendanceId = attendance.Id;
            return View();
        }

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

        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> CreateDailyAttendanceLists(int id, DateTime startDate, DateTime endDate)
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

            var createdCount = 0;
            var currentDate = startDate.Date;

            while (currentDate <= endDate.Date)
            {
                // Create new attendance for this specific date
                var newAttendance = new ClassAttendance
                {
                    Name = $"{attendance.Name} {currentDate:yyyy-MM-dd}",
                    BuildingNumber = attendance.BuildingNumber,
                    ValidFrom = currentDate,
                    ValidTo = currentDate,
                    StartTime = attendance.StartTime,
                    EndTime = attendance.EndTime,
                    OnlyCurrentDayAttendance = true // Each copy is only valid for 1 day
                };

                _context.ClassAttendances.Add(newAttendance);
                await _context.SaveChangesAsync(); // Save to get the new ID

                // Copy all students to the new attendance
                var studentsToCopy = attendance.Students.Select(s => new ClassAttendanceStudent
                {
                    ClassAttendanceId = newAttendance.Id,
                    OgrenciNo = s.OgrenciNo,
                    AdSoyad = s.AdSoyad,
                    SinifDuzeyi = s.SinifDuzeyi,
                    Sube = s.Sube,
                    Salon = s.Salon,
                    Sira = s.Sira
                }).ToList();

                _context.ClassAttendanceStudents.AddRange(studentsToCopy);
                await _context.SaveChangesAsync();

                createdCount++;
                currentDate = currentDate.AddDays(1);
            }

            TempData["SuccessMessage"] = $"{createdCount} adet günlük yoklama listesi başarıyla oluşturuldu.";
            return RedirectToAction(nameof(Index));
        }

        private static string GetSafeFileName(string fileName)
        {
            var invalidChars = Path.GetInvalidFileNameChars();
            return string.Concat(fileName.Select(ch => invalidChars.Contains(ch) ? '_' : ch));
        }
    }
}
