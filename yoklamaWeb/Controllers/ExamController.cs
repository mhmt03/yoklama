using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using yoklamaWeb.Models;
using yoklamaWeb.Data;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using OfficeOpenXml;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;

namespace yoklamaWeb.Controllers
{
    [Authorize(Roles = "Admin,Idareci,SinavYoneticisi")]
    public class ExamController : Controller
    {
        private readonly AppDbContext _context;
        private readonly UserManager<IdentityUser> _userManager;

        public ExamController(AppDbContext context, UserManager<IdentityUser> userManager)
        {
            _context = context;
            _userManager = userManager;
        }

        // GET: /Exam
        public async Task<IActionResult> Index(string nameFilter = "", string buildingFilter = "", string statusFilter = "All")
        {
            var exams = _context.Exams.AsQueryable();

            if (!string.IsNullOrWhiteSpace(nameFilter))
                exams = exams.Where(e => e.Name.Contains(nameFilter));

            if (!string.IsNullOrWhiteSpace(buildingFilter))
                exams = exams.Where(e => e.BuildingNumber.Contains(buildingFilter));

            var today = DateTime.Today;
            if (statusFilter == "Active")
            {
                exams = exams.Where(e => e.ValidFrom <= today && e.ValidTo >= today);
            }
            else if (statusFilter == "Expired")
            {
                exams = exams.Where(e => e.ValidTo < today);
            }
            else if (statusFilter == "Upcoming")
            {
                exams = exams.Where(e => e.ValidFrom > today);
            }

            ViewData["NameFilter"] = nameFilter;
            ViewData["BuildingFilter"] = buildingFilter;
            ViewData["StatusFilter"] = statusFilter;

            var examList = await exams.OrderByDescending(e => e.ApplicationDate).ToListAsync();
            var examIds = examList.Select(e => e.Id).ToList();
            var allSeats = await _context.ExamSeats
                .Where(es => examIds.Contains(es.ExamId))
                .ToListAsync();

            var viewModel = examList.Select(e =>
            {
                var examSeats = allSeats.Where(es => es.ExamId == e.Id).ToList();
                return new AdminExamItemViewModel
                {
                    Id = e.Id,
                    Name = e.Name,
                    ApplicationDate = e.ApplicationDate,
                    BuildingNumber = e.BuildingNumber,
                    ValidFrom = e.ValidFrom,
                    ValidTo = e.ValidTo,
                    StartTime = e.StartTime,
                    EndTime = e.EndTime,
                    YoklamaSayisi = e.YoklamaSayisi,
                    TotalStudents = examSeats.Count,
                    PresentCount = examSeats.Count(s => s.AttendanceStatus == AttendanceStatus.Katildi),
                    AbsentCount = examSeats.Count(s => s.AttendanceStatus == AttendanceStatus.Katilmadi),
                    LateCount = examSeats.Count(s => s.AttendanceStatus == AttendanceStatus.Gec),
                    PendingCount = examSeats.Count(s => s.AttendanceStatus == AttendanceStatus.KontrolEdilmedi)
                };
            }).ToList();

            return View(viewModel);
        }

        // GET: /Exam/Create
        public IActionResult Create()
        {
            return View();
        }

        // POST: /Exam/Create
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> Create([Bind("Name,ApplicationDate,BuildingNumber,ValidFrom,ValidTo,StartTime,EndTime,IsActive,YoklamaSayisi")] Exam exam)
        {
            if (ModelState.IsValid)
            {
                if (exam.YoklamaSayisi < 1) exam.YoklamaSayisi = 1;
                _context.Exams.Add(exam);
                await _context.SaveChangesAsync();
                return RedirectToAction(nameof(Index));
            }
            return View(exam);
        }

        // GET: /Exam/Details/5?yoklamaNo=1
        public async Task<IActionResult> Details(int? id, int yoklamaNo = 1)
        {
            if (id == null) return NotFound();
            var exam = await _context.Exams
                .Include(e => e.ExamSeats)
                    .ThenInclude(seat => seat.Ogrenci)
                .FirstOrDefaultAsync(e => e.Id == id);
            if (exam == null) return NotFound();

            int selectedYoklamaNo = yoklamaNo < 1 ? 1 : yoklamaNo;
            if (selectedYoklamaNo > exam.YoklamaSayisi && exam.YoklamaSayisi > 0)
                selectedYoklamaNo = 1;

            var assignments = await _context.TemporaryProctors
                .Where(tp => tp.ExamId == id.Value)
                .ToListAsync();

            var filteredSeats = exam.ExamSeats.Where(s => s.YoklamaNo == selectedYoklamaNo || s.YoklamaNo == 0).ToList();

            var rows = filteredSeats
                .OrderBy(s => s.Sira)
                .ThenBy(s => s.SeatNumber)
                .ThenBy(s => s.OgrenciNo)
                .Select(seat =>
                {
                    var assignment = assignments.FirstOrDefault(a => a.Room == seat.SalonAdi);
                    return new AdminSeatRowViewModel
                    {
                        SeatId = seat.Id,
                        OgrenciNo = seat.OgrenciNo,
                        AdSoyad = seat.Ogrenci?.AdSoyad ?? "Bilinmiyor",
                        SinifDuzeyi = seat.Ogrenci?.SinifDuzeyi ?? string.Empty,
                        Sube = seat.Ogrenci?.Sube ?? string.Empty,
                        SeatNumber = seat.SeatNumber,
                        SalonAdi = seat.SalonAdi,
                        Sira = seat.Sira,
                        BinaNo = seat.BinaNo,
                        AttendanceStatus = seat.AttendanceStatus,
                        YoklamaNo = seat.YoklamaNo,
                        Note = seat.Note ?? string.Empty,
                        ProctorName = assignment?.ProctorName ?? string.Empty,
                        RoomNote = assignment?.RoomNote ?? string.Empty,
                        UpdatedAt = seat.UpdatedAt
                    };
                })
                .ToList();

            var viewModel = new AdminExamDetailsViewModel
            {
                ExamId = exam.Id,
                ExamName = exam.Name,
                ApplicationDate = exam.ApplicationDate,
                BuildingNumber = exam.BuildingNumber,
                ValidFrom = exam.ValidFrom,
                ValidTo = exam.ValidTo,
                StartTime = exam.StartTime,
                EndTime = exam.EndTime,
                YoklamaSayisi = exam.YoklamaSayisi > 0 ? exam.YoklamaSayisi : 1,
                SelectedYoklamaNo = selectedYoklamaNo,
                Seats = rows
            };

            return View(viewModel);
        }

        // GET: /Exam/ImportSeats/5
        public async Task<IActionResult> ImportSeats(int? id)
        {
            if (id == null) return NotFound();
            var exam = await _context.Exams.FindAsync(id);
            if (exam == null) return NotFound();

            var plannerExams = await _context.PlannerExams
                .Where(pe => _context.PlannerSeatings.Any(s => s.PlannerExamId == pe.Id))
                .OrderByDescending(pe => pe.ExamDate)
                .ToListAsync();

            ViewBag.ExamId = exam.Id;
            ViewBag.PlannerExams = plannerExams;
            return View();
        }

        // POST: /Exam/ImportFromPlanner
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> ImportFromPlanner(int examId, int plannerExamId)
        {
            var exam = await _context.Exams.FindAsync(examId);
            if (exam == null) return NotFound();

            var plannerExam = await _context.PlannerExams.FindAsync(plannerExamId);
            if (plannerExam == null)
            {
                TempData["ErrorMessage"] = "Seçilen planlama sınavı bulunamadı.";
                return RedirectToAction(nameof(ImportSeats), new { id = examId });
            }

            var seatings = await _context.PlannerSeatings
                .Where(s => s.PlannerExamId == plannerExamId)
                .ToListAsync();

            if (!seatings.Any())
            {
                TempData["ErrorMessage"] = "Seçilen planlama sınavında yerleşim bulunmamaktadır.";
                return RedirectToAction(nameof(ImportSeats), new { id = examId });
            }

            var oldSeats = await _context.ExamSeats.Where(es => es.ExamId == examId).ToListAsync();
            _context.ExamSeats.RemoveRange(oldSeats);

            foreach (var seat in seatings)
            {
                var examSeat = new ExamSeat
                {
                    ExamId = examId,
                    OgrenciNo = seat.OgrenciNo,
                    SeatNumber = seat.SeatNumber,
                    SalonAdi = seat.RoomName,
                    Sira = seat.Sira,
                    BinaNo = exam.BuildingNumber ?? "1",
                    UpdatedAt = DateTime.UtcNow
                };
                _context.ExamSeats.Add(examSeat);
            }

            await _context.SaveChangesAsync();
            TempData["SuccessMessage"] = $"'{plannerExam.Name}' oturma planı başarıyla bu sınava aktarıldı.";
            return RedirectToAction(nameof(Details), new { id = examId });
        }

        // POST: /Exam/ImportSeats/5
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> ImportSeats(int id, IFormFile excelFile, int startRow = 2)
        {
            var exam = await _context.Exams.FindAsync(id);
            if (exam == null) return NotFound();
            if (excelFile == null || excelFile.Length == 0)
            {
                ModelState.AddModelError("excelFile", "Excel dosyası seçilmedi.");
                ViewBag.ExamId = id;
                return View();
            }

            var errors = new List<string>();
            using (var stream = new MemoryStream())
            {
                await excelFile.CopyToAsync(stream);
                using (var package = new ExcelPackage(stream))
                {
                    var worksheet = package.Workbook.Worksheets.FirstOrDefault();
                    if (worksheet == null)
                    {
                        ModelState.AddModelError("excelFile", "Excel dosyasında çalışma sayfası bulunamadı.");
                        ViewBag.ExamId = id;
                        return View();
                    }

                    // Expect headers: OgrenciNo, SeatNumber, SalonAdi, Sira, BinaNo
                    var expectedHeaders = new[] { "OgrenciNo", "SeatNumber", "SalonAdi", "Sira", "BinaNo" };
                    for (int col = 1; col <= expectedHeaders.Length; col++)
                    {
                        var header = worksheet.Cells[1, col].Text?.Trim();
                        if (!string.Equals(header, expectedHeaders[col - 1], StringComparison.OrdinalIgnoreCase))
                        {
                            errors.Add($"Beklenen başlık '{expectedHeaders[col - 1]}' yerine '{header}' bulundu (Sütun {col}).");
                        }
                    }
                    if (errors.Any())
                    {
                        ViewData["Errors"] = errors;
                        ViewBag.ExamId = id;
                        return View();
                    }

                    var row = startRow;
                    var seatsToAdd = new List<ExamSeat>();
                    while (true)
                    {
                        var ogrenciNo = worksheet.Cells[row, 1].Text?.Trim();
                        var seatNumber = worksheet.Cells[row, 2].Text?.Trim();
                        var salonAdi = worksheet.Cells[row, 3].Text?.Trim();
                        var siraText = worksheet.Cells[row, 4].Text?.Trim();
                        var binaNo = worksheet.Cells[row, 5].Text?.Trim();

                        if (string.IsNullOrWhiteSpace(ogrenciNo) && string.IsNullOrWhiteSpace(seatNumber)
                            && string.IsNullOrWhiteSpace(salonAdi) && string.IsNullOrWhiteSpace(siraText)
                            && string.IsNullOrWhiteSpace(binaNo))
                        {
                            break;
                        }

                        if (string.IsNullOrWhiteSpace(ogrenciNo))
                            errors.Add($"Satır {row}: Öğrenci No eksik.");
                        if (string.IsNullOrWhiteSpace(seatNumber))
                            errors.Add($"Satır {row}: Koltuk numarası eksik.");
                        if (string.IsNullOrWhiteSpace(salonAdi))
                            errors.Add($"Satır {row}: Salon adı eksik.");
                        if (string.IsNullOrWhiteSpace(siraText))
                            errors.Add($"Satır {row}: Sıra eksik.");
                        if (string.IsNullOrWhiteSpace(binaNo))
                            errors.Add($"Satır {row}: Bina numarası eksik.");

                        if (!errors.Any(e => e.StartsWith($"Satır {row}:")))
                        {
                            var studentExists = await _context.Ogrenciler.AnyAsync(o => o.OgrenciNo == ogrenciNo);
                            if (!studentExists)
                            {
                                errors.Add($"Satır {row}: Öğrenci No '{ogrenciNo}' sistemde bulunamadı.");
                            }
                            else if (!int.TryParse(seatNumber, out int seatNum))
                            {
                                errors.Add($"Satır {row}: Koltuk numarası '{seatNumber}' geçerli bir sayı değil.");
                            }
                            else if (!int.TryParse(siraText, out int sira))
                            {
                                errors.Add($"Satır {row}: Sıra '{siraText}' geçerli bir sayı değil.");
                            }
                            else
                            {
                                seatsToAdd.Add(new ExamSeat
                                {
                                    ExamId = id,
                                    OgrenciNo = ogrenciNo,
                                    SeatNumber = seatNum,
                                    SalonAdi = salonAdi,
                                    Sira = sira,
                                    BinaNo = binaNo,
                                    UpdatedAt = DateTime.UtcNow
                                });
                            }
                        }

                        row++;
                    }

                    if (errors.Any())
                    {
                        ViewData["Errors"] = errors;
                        ViewBag.ExamId = id;
                        return View();
                    }

                    _context.ExamSeats.AddRange(seatsToAdd);
                    await _context.SaveChangesAsync();
                }
            }
            TempData["SuccessMessage"] = "Koltuk dağılımı başarıyla yüklendi.";
            return RedirectToAction(nameof(Details), new { id = id });
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> GenerateProctors(int id)
        {
            var exam = await _context.Exams.FindAsync(id);
            if (exam == null) return NotFound();

            var salonAdlari = await _context.ExamSeats
                .Where(es => es.ExamId == id && !string.IsNullOrWhiteSpace(es.SalonAdi))
                .Select(es => es.SalonAdi.Trim())
                .Distinct()
                .OrderBy(s => s)
                .ToListAsync();

            if (!salonAdlari.Any())
            {
                TempData["ErrorMessage"] = "Bu sınav için henüz salon bilgisi bulunamadı. Lütfen önce koltuk ataması yapın.";
                return RedirectToAction(nameof(Details), new { id });
            }

            var existingAssignments = await _context.TemporaryProctors
                .Where(pa => pa.ExamId == id)
                .ToListAsync();

            var assignmentsToRemove = existingAssignments.Where(pa => !salonAdlari.Contains(pa.Room)).ToList();
            foreach (var toRemove in assignmentsToRemove)
            {
                var orphanUserId = toRemove.UserId;
                _context.TemporaryProctors.Remove(toRemove);
                if (!await _context.TemporaryProctors.AnyAsync(pa => pa.UserId == orphanUserId && pa.ExamId != id))
                {
                    var orphanUser = await _userManager.FindByIdAsync(orphanUserId);
                    if (orphanUser != null)
                    {
                        await _userManager.DeleteAsync(orphanUser);
                    }
                }
            }

            foreach (var salon in salonAdlari)
            {
                var assignment = existingAssignments.FirstOrDefault(pa => pa.Room == salon);
                IdentityUser? user = null;
                // Mevcut atama varsa aynı şifreyi koru; yeni salon için yeni şifre üret
                string password;

                if (assignment != null)
                {
                    user = await _userManager.FindByIdAsync(assignment.UserId);
                    // Mevcut kullanıcı bulunduysa şifreyi yenileme, mevcut şifreyi koru
                    if (user != null)
                    {
                        password = assignment.Password; // Var olan şifreyi koru
                    }
                    else
                    {
                        password = GenerateRandomPassword(); // Kullanıcı kaybolmuşsa yeni şifre
                    }
                }
                else
                {
                    password = GenerateRandomPassword(); // Yeni salon için yeni şifre
                }

                if (user == null)
                {
                    var username = await GetUniqueProctorUserNameAsync(salon, exam.BuildingNumber);
                    user = await _userManager.FindByNameAsync(username);
                    if (user == null)
                    {
                        user = new IdentityUser { UserName = username };
                        var createResult = await _userManager.CreateAsync(user, password);
                        if (!createResult.Succeeded)
                        {
                            TempData["ErrorMessage"] = "Salon için yoklamacı oluşturulurken hata oluştu: " + string.Join(", ", createResult.Errors.Select(e => e.Description));
                            return RedirectToAction(nameof(Details), new { id });
                        }
                    }
                    else
                    {
                        // Kullanıcı adı aynı ama assignment yoksa şifreyi sıfırla
                        var token2 = await _userManager.GeneratePasswordResetTokenAsync(user);
                        await _userManager.ResetPasswordAsync(user, token2, password);
                    }
                }

                if (!await _userManager.IsInRoleAsync(user, "Yoklamaci"))
                {
                    await _userManager.AddToRoleAsync(user, "Yoklamaci");
                }

                // Şifre sadece yeni kullanıcı veya kaybolmuş kullanıcı için sıfırlanır
                if (assignment == null || assignment.Password != password)
                {
                    var token = await _userManager.GeneratePasswordResetTokenAsync(user);
                    var passwordResult = await _userManager.ResetPasswordAsync(user, token, password);
                    if (!passwordResult.Succeeded)
                    {
                        TempData["ErrorMessage"] = "Yoklamacı şifresi ayarlanamadı: " + string.Join(", ", passwordResult.Errors.Select(e => e.Description));
                        return RedirectToAction(nameof(Details), new { id });
                    }
                }

                if (assignment == null)
                {
                    assignment = new TemporaryProctor
                    {
                        ExamId = id,
                        Room = salon,
                        UserId = user.Id,
                        Password = password,
                        ValidFrom = exam.ValidFrom,
                        ValidTo = exam.ValidTo,
                        StartTime = exam.StartTime,
                        EndTime = exam.EndTime
                    };
                    _context.TemporaryProctors.Add(assignment);
                    existingAssignments.Add(assignment);
                }
                else
                {
                    assignment.UserId = user.Id;
                    // Password değişmemişse güncelleme yapma (zaten korundu)
                    assignment.ValidFrom = exam.ValidFrom;
                    assignment.ValidTo = exam.ValidTo;
                    assignment.StartTime = exam.StartTime;
                    assignment.EndTime = exam.EndTime;
                }
            }

            await _context.SaveChangesAsync();
            TempData["SuccessMessage"] = "Yoklamacı listesi başarıyla oluşturuldu.";
            return RedirectToAction(nameof(Proctors), new { id });
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> RecreateProctors(int id)
        {
            var exam = await _context.Exams.FindAsync(id);
            if (exam == null) return NotFound();

            var existingAssignments = await _context.TemporaryProctors
                .Where(pa => pa.ExamId == id)
                .ToListAsync();

            foreach (var toRemove in existingAssignments)
            {
                var userId = toRemove.UserId;
                _context.TemporaryProctors.Remove(toRemove);
                if (!await _context.TemporaryProctors.AnyAsync(pa => pa.UserId == userId && pa.ExamId != id))
                {
                    var user = await _userManager.FindByIdAsync(userId);
                    if (user != null)
                    {
                        await _userManager.DeleteAsync(user);
                    }
                }
            }
            await _context.SaveChangesAsync();

            return await GenerateProctors(id);
        }

        // GET: /Exam/CreateProctor?examId=5
        public async Task<IActionResult> CreateProctor(int examId)
        {
            var exam = await _context.Exams.FindAsync(examId);
            if (exam == null) return NotFound();

            var viewModel = new TemporaryProctor
            {
                ExamId = examId,
                ValidFrom = exam.ValidFrom,
                ValidTo = exam.ValidTo,
                StartTime = exam.StartTime,
                EndTime = exam.EndTime
            };

            ViewBag.ExamName = exam.Name;
            ViewBag.ExamId = examId;
            return View(viewModel);
        }

        // POST: /Exam/CreateProctor
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> CreateProctor(TemporaryProctor model)
        {
            if (ModelState.IsValid)
            {
                var exam = await _context.Exams.FindAsync(model.ExamId);
                if (exam == null) return NotFound();

                var username = await GetUniqueProctorUserNameAsync(model.Room, exam.BuildingNumber);
                var password = string.IsNullOrWhiteSpace(model.Password) ? GenerateRandomPassword() : model.Password;

                var user = new IdentityUser { UserName = username };
                var createResult = await _userManager.CreateAsync(user, password);
                if (createResult.Succeeded)
                {
                    await _userManager.AddToRoleAsync(user, "Yoklamaci");

                    model.UserId = user.Id;
                    model.Password = password;
                    _context.TemporaryProctors.Add(model);
                    await _context.SaveChangesAsync();

                    return RedirectToAction(nameof(Proctors), new { id = model.ExamId });
                }
                else
                {
                    ModelState.AddModelError("", "Kullanıcı oluşturulurken hata: " + string.Join(", ", createResult.Errors.Select(e => e.Description)));
                }
            }

            var ex = await _context.Exams.FindAsync(model.ExamId);
            ViewBag.ExamName = ex?.Name;
            ViewBag.ExamId = model.ExamId;
            return View(model);
        }

        // GET: /Exam/EditProctor/5
        public async Task<IActionResult> EditProctor(int id)
        {
            var proctor = await _context.TemporaryProctors.Include(p => p.User).FirstOrDefaultAsync(p => p.Id == id);
            if (proctor == null) return NotFound();

            var exam = await _context.Exams.FindAsync(proctor.ExamId);
            ViewBag.ExamName = exam?.Name;
            return View(proctor);
        }

        // POST: /Exam/EditProctor/5
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> EditProctor(int id, TemporaryProctor model)
        {
            if (id != model.Id) return NotFound();

            if (ModelState.IsValid)
            {
                var dbProctor = await _context.TemporaryProctors.FindAsync(id);
                if (dbProctor == null) return NotFound();

                dbProctor.Room = model.Room;
                dbProctor.ValidFrom = model.ValidFrom;
                dbProctor.ValidTo = model.ValidTo;
                dbProctor.StartTime = model.StartTime;
                dbProctor.EndTime = model.EndTime;

                if (!string.IsNullOrWhiteSpace(model.Password) && dbProctor.Password != model.Password)
                {
                    dbProctor.Password = model.Password;
                    var user = await _userManager.FindByIdAsync(dbProctor.UserId);
                    if (user != null)
                    {
                        var token = await _userManager.GeneratePasswordResetTokenAsync(user);
                        await _userManager.ResetPasswordAsync(user, token, model.Password);
                    }
                }

                _context.Update(dbProctor);
                await _context.SaveChangesAsync();
                return RedirectToAction(nameof(Proctors), new { id = dbProctor.ExamId });
            }

            var ex = await _context.Exams.FindAsync(model.ExamId);
            ViewBag.ExamName = ex?.Name;
            return View(model);
        }

        // POST: /Exam/DeleteProctor/5
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> DeleteProctor(int id)
        {
            var proctor = await _context.TemporaryProctors.FindAsync(id);
            if (proctor == null) return NotFound();

            var examId = proctor.ExamId;
            var userId = proctor.UserId;

            _context.TemporaryProctors.Remove(proctor);
            await _context.SaveChangesAsync();

            if (!await _context.TemporaryProctors.AnyAsync(p => p.UserId == userId))
            {
                var user = await _userManager.FindByIdAsync(userId);
                if (user != null)
                {
                    await _userManager.DeleteAsync(user);
                }
            }

            return RedirectToAction(nameof(Proctors), new { id = examId });
        }

        public async Task<IActionResult> Proctors(int? id)
        {
            if (id == null) return NotFound();
            var exam = await _context.Exams.FindAsync(id);
            if (exam == null) return NotFound();

            var proctors = await _context.TemporaryProctors
                .Include(pa => pa.User)
                .Where(pa => pa.ExamId == id)
                .OrderBy(pa => pa.Room)
                .ToListAsync();

            ViewBag.ExamName = exam.Name;
            ViewBag.ExamId = exam.Id;
            return View(proctors);
        }

        // GET: /Exam/Edit/5
        public async Task<IActionResult> Edit(int? id)
        {
            if (id == null) return NotFound();
            var exam = await _context.Exams.FindAsync(id);
            if (exam == null) return NotFound();
            return View(exam);
        }

        // POST: /Exam/Edit/5
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> Edit(int id, [Bind("Id,Name,ApplicationDate,BuildingNumber,ValidFrom,ValidTo,StartTime,EndTime,IsActive")] Exam exam)
        {
            if (id != exam.Id) return NotFound();
            if (ModelState.IsValid)
            {
                try
                {
                    _context.Exams.Update(exam);
                    await _context.SaveChangesAsync();

                    var proctors = await _context.TemporaryProctors.Where(pa => pa.ExamId == id).ToListAsync();
                    foreach (var proctor in proctors)
                    {
                        proctor.ValidFrom = exam.ValidFrom;
                        proctor.ValidTo = exam.ValidTo;
                        proctor.StartTime = exam.StartTime;
                        proctor.EndTime = exam.EndTime;
                    }
                    if (proctors.Any())
                    {
                        await _context.SaveChangesAsync();
                    }

                    TempData["SuccessMessage"] = "Sınav başarıyla güncellendi.";
                    return RedirectToAction(nameof(Index));
                }
                catch (DbUpdateConcurrencyException)
                {
                    if (!ExamExists(exam.Id))
                        return NotFound();
                    throw;
                }
            }
            return View(exam);
        }

        private bool ExamExists(int id)
        {
            return _context.Exams.Any(e => e.Id == id);
        }

        // GET: /Exam/Delete/5
        public IActionResult Delete(int? id)
        {
            if (id == null) return NotFound();
            var exam = _context.Exams.Find(id);
            if (exam == null) return NotFound();
            return View(exam);
        }

        // POST: /Exam/Delete/5
        [HttpPost, ActionName("Delete")]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> DeleteConfirmed(int id)
        {
            try
            {
                var exam = await _context.Exams.FindAsync(id);
                if (exam != null)
                {
                    // 1. İlişkili yoklamacıları ve kullanıcı hesaplarını temizle
                    var proctors = await _context.TemporaryProctors.Where(pa => pa.ExamId == id).ToListAsync();
                    foreach (var proctor in proctors)
                    {
                        if (!await _context.TemporaryProctors.AnyAsync(pa => pa.UserId == proctor.UserId && pa.ExamId != id))
                        {
                            var user = await _userManager.FindByIdAsync(proctor.UserId);
                            if (user != null)
                            {
                                await _userManager.DeleteAsync(user);
                            }
                        }
                    }
                    if (proctors.Any())
                    {
                        _context.TemporaryProctors.RemoveRange(proctors);
                    }

                    // 2. İlişkili ExamSeats (koltuk) kayıtlarını temizle
                    var examSeats = await _context.ExamSeats.Where(es => es.ExamId == id).ToListAsync();
                    if (examSeats.Any())
                    {
                        _context.ExamSeats.RemoveRange(examSeats);
                    }

                    // 3. İlişkili Yoklamalar kayıtlarını temizle
                    var yoklamalar = await _context.Yoklamalar.Where(y => y.SinavId == id).ToListAsync();
                    if (yoklamalar.Any())
                    {
                        _context.Yoklamalar.RemoveRange(yoklamalar);
                    }

                    // 4. Sınav kaydını sil
                    _context.Exams.Remove(exam);
                    await _context.SaveChangesAsync();
                    TempData["SuccessMessage"] = "Sınav ve tüm ilişkili veriler başarıyla silindi.";
                }
            }
            catch (DbUpdateConcurrencyException)
            {
                // Zaten silinmiş veya eşzamanlı silme yapılmışsa kullanıcıya temiz geri bildirim ver
                TempData["SuccessMessage"] = "Sınav başarıyla silindi.";
            }
            catch (Exception ex)
            {
                TempData["ErrorMessage"] = "Sınav silinirken bir hata oluştu: " + ex.Message;
            }

            return RedirectToAction(nameof(Index));
        }

        private static string GenerateRandomPassword()
        {
            return Random.Shared.Next(10000, 100000).ToString();
        }

        private async Task<string> GetUniqueProctorUserNameAsync(string room, string buildingNumber)
        {
            var cleanRoom = Regex.Replace(room.Trim(), "[^A-Za-z0-9._@+-]", "_");
            var cleanBina = Regex.Replace(buildingNumber.Trim(), "[^A-Za-z0-9._@+-]", "_");
            var baseName = $"{cleanRoom}-{cleanBina}";
            var userName = baseName;
            var counter = 1;
            while (await _userManager.FindByNameAsync(userName) != null)
            {
                userName = $"{baseName}_{counter}";
                counter++;
            }

            return userName;
        }

        // POST: /Exam/AddStudent
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> AddStudent(int examId, string ogrenciNo, string seatNumber, string salonAdi, int sira, string binaNo)
        {
            var exam = await _context.Exams.FindAsync(examId);
            if (exam == null) return NotFound();
            
            if (!int.TryParse(seatNumber, out int seatNum))
            {
                return BadRequest("Koltuk numarası geçerli bir sayı olmalıdır.");
            }
            
            var seat = new ExamSeat
            {
                ExamId = examId,
                OgrenciNo = ogrenciNo,
                SeatNumber = seatNum,
                SalonAdi = salonAdi,
                Sira = sira,
                BinaNo = binaNo
            };
            _context.ExamSeats.Add(seat);
            await _context.SaveChangesAsync();
            return RedirectToAction(nameof(Details), new { id = examId });
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> UpdateSeat(int seatId, AttendanceStatus attendanceStatus, string note, string proctorName, string roomNote)
        {
            var seat = await _context.ExamSeats.FindAsync(seatId);
            if (seat == null) return NotFound();

            seat.AttendanceStatus = attendanceStatus;
            seat.Note = note;
            seat.UpdatedAt = DateTime.UtcNow;

            var assignment = await _context.TemporaryProctors
                .FirstOrDefaultAsync(tp => tp.ExamId == seat.ExamId && tp.Room == seat.SalonAdi);
            if (assignment != null)
            {
                assignment.ProctorName = proctorName;
                assignment.RoomNote = roomNote;
            }

            await _context.SaveChangesAsync();
            TempData["SuccessMessage"] = "Yoklama bilgisi güncellendi.";
            if (Request.Headers["X-Requested-With"] == "XMLHttpRequest" || Request.Headers["Accept"].ToString().Contains("application/json"))
            {
                return Json(new { success = true, message = "Yoklama bilgisi güncellendi." });
            }
            return RedirectToAction(nameof(Details), new { id = seat.ExamId });
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> UpdateSeatLocation(int seatId, int seatNumber, string salonAdi, int sira, string binaNo)
        {
            var seat = await _context.ExamSeats.FindAsync(seatId);
            if (seat == null) return NotFound();

            seat.SeatNumber = seatNumber;
            seat.SalonAdi = salonAdi;
            seat.Sira = sira;
            seat.BinaNo = binaNo;
            seat.UpdatedAt = DateTime.UtcNow;

            await _context.SaveChangesAsync();
            TempData["SuccessMessage"] = "Salon ve sıra bilgisi güncellendi.";
            return RedirectToAction(nameof(Details), new { id = seat.ExamId });
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> DeleteSeat(int seatId)
        {
            var seat = await _context.ExamSeats.FindAsync(seatId);
            if (seat == null) return NotFound();

            var examId = seat.ExamId;
            _context.ExamSeats.Remove(seat);
            await _context.SaveChangesAsync();

            TempData["SuccessMessage"] = "Öğrenci sınavdan çıkarıldı.";
            return RedirectToAction(nameof(Details), new { id = examId });
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> ExportToExcel(int examId, string sortBy)
        {
            var exam = await _context.Exams.FindAsync(examId);
            if (exam == null) return NotFound();

            var seats = await _context.ExamSeats
                .Include(s => s.Ogrenci)
                .Where(s => s.ExamId == examId)
                .ToListAsync();

            var proctorAssignments = await _context.TemporaryProctors
                .Where(tp => tp.ExamId == examId)
                .ToListAsync();

            var assignmentByRoom = proctorAssignments
                .GroupBy(tp => tp.Room)
                .ToDictionary(g => g.Key, g => g.First());

            string? getRoomNote(string room)
            {
                return assignmentByRoom.TryGetValue(room, out var assignment) ? assignment.RoomNote : null;
            }

            string? getProctorName(string room)
            {
                return assignmentByRoom.TryGetValue(room, out var assignment) ? assignment.ProctorName : null;
            }

            List<ExamSeat> rows;
            if (sortBy == "OgrenciNo")
            {
                rows = seats.OrderBy(s => s.OgrenciNo).ThenBy(s => s.SalonAdi).ThenBy(s => s.Sira).ToList();
            }
            else if (sortBy == "AdSoyad")
            {
                rows = seats.OrderBy(s => s.Ogrenci.AdSoyad).ThenBy(s => s.OgrenciNo).ToList();
            }
            else if (sortBy == "SinifDuzeyi")
            {
                rows = seats.OrderBy(s => s.Ogrenci.SinifDuzeyi).ThenBy(s => s.Ogrenci.Sube).ThenBy(s => s.Ogrenci.AdSoyad).ToList();
            }
            else if (sortBy == "Sube")
            {
                rows = seats.OrderBy(s => s.Ogrenci.Sube).ThenBy(s => s.Ogrenci.SinifDuzeyi).ThenBy(s => s.Ogrenci.AdSoyad).ToList();
            }
            else if (sortBy == "SalonAdi")
            {
                rows = seats.OrderBy(s => s.SalonAdi).ThenBy(s => s.Sira).ThenBy(s => s.SeatNumber).ToList();
            }
            else if (sortBy == "Sira")
            {
                rows = seats.OrderBy(s => s.Sira).ThenBy(s => s.SalonAdi).ThenBy(s => s.SeatNumber).ToList();
            }
            else if (sortBy == "AttendanceStatus")
            {
                rows = seats.OrderBy(s => s.AttendanceStatus).ThenBy(s => s.SalonAdi).ThenBy(s => s.Sira).ToList();
            }
            else if (sortBy == "BinaNo")
            {
                rows = seats.OrderBy(s => s.BinaNo).ThenBy(s => s.SalonAdi).ThenBy(s => s.Sira).ToList();
            }
            else if (sortBy == "Note")
            {
                rows = seats.OrderBy(s => s.Note).ThenBy(s => s.SalonAdi).ThenBy(s => s.Sira).ToList();
            }
            else if (sortBy == "RoomNote")
            {
                rows = seats.OrderBy(s => getRoomNote(s.SalonAdi)).ThenBy(s => s.SalonAdi).ThenBy(s => s.Sira).ToList();
            }
            else if (sortBy == "ProctorName")
            {
                rows = seats.OrderBy(s => getProctorName(s.SalonAdi)).ThenBy(s => s.SalonAdi).ThenBy(s => s.Sira).ToList();
            }
            else
            {
                rows = seats.OrderBy(s => s.SalonAdi).ThenBy(s => s.Sira).ThenBy(s => s.SeatNumber).ToList();
            }

            ExcelPackage.LicenseContext = LicenseContext.NonCommercial;
            using var package = new ExcelPackage();
            var worksheet = package.Workbook.Worksheets.Add("Koltuk Atamaları");

            worksheet.Cells[1, 1].Value = "Sınav Adı";
            worksheet.Cells[1, 2].Value = exam.Name;
            worksheet.Cells[2, 1].Value = "Uygulama Tarihi";
            worksheet.Cells[2, 2].Value = exam.ApplicationDate.ToString("yyyy-MM-dd");
            worksheet.Cells[3, 1].Value = "Bina";
            worksheet.Cells[3, 2].Value = exam.BuildingNumber;
            worksheet.Cells[4, 1].Value = "Geçerlilik";
            worksheet.Cells[4, 2].Value = $"{exam.ValidFrom:yyyy-MM-dd} - {exam.ValidTo:yyyy-MM-dd}";
            worksheet.Cells[5, 1].Value = "Saat";
            worksheet.Cells[5, 2].Value = exam.StartTime.HasValue && exam.EndTime.HasValue
                ? $"{exam.StartTime.Value.ToString(@"hh\:mm")} - {exam.EndTime.Value.ToString(@"hh\:mm") }"
                : string.Empty;

            var headers = new[] { "Öğrenci No", "Adı Soyadı", "Sınıf", "Şube", "Salon", "Sıra", "Durum", "Bina", "Yoklama Notu", "Salon Notu", "Yoklamacı" };
            var headerRow = 7;
            for (int i = 0; i < headers.Length; i++)
            {
                worksheet.Cells[headerRow, i + 1].Value = headers[i];
                worksheet.Cells[headerRow, i + 1].Style.Font.Bold = true;
            }

            var rowIndex = headerRow + 1;
            foreach (var seat in rows)
            {
                worksheet.Cells[rowIndex, 1].Value = seat.OgrenciNo;
                worksheet.Cells[rowIndex, 2].Value = seat.Ogrenci?.AdSoyad ?? "Bilinmiyor";
                worksheet.Cells[rowIndex, 3].Value = seat.Ogrenci?.SinifDuzeyi ?? string.Empty;
                worksheet.Cells[rowIndex, 4].Value = seat.Ogrenci?.Sube ?? string.Empty;
                worksheet.Cells[rowIndex, 5].Value = seat.SalonAdi;
                worksheet.Cells[rowIndex, 6].Value = seat.Sira;

                var statusText = seat.AttendanceStatus switch
                {
                    AttendanceStatus.Katildi => "Var",
                    AttendanceStatus.Katilmadi => "Yok",
                    AttendanceStatus.Gec => "Geç",
                    _ => "Belirsiz"
                };
                worksheet.Cells[rowIndex, 7].Value = statusText;
                if (statusText == "Yok")
                {
                    worksheet.Cells[rowIndex, 7].Style.Font.Bold = true;
                    worksheet.Cells[rowIndex, 7].Style.Font.Color.SetColor(System.Drawing.Color.Red);
                }

                worksheet.Cells[rowIndex, 8].Value = seat.BinaNo;
                worksheet.Cells[rowIndex, 9].Value = seat.Note;

                var assignment = await _context.TemporaryProctors
                    .FirstOrDefaultAsync(tp => tp.ExamId == examId && tp.Room == seat.SalonAdi);
                worksheet.Cells[rowIndex, 10].Value = assignment?.RoomNote ?? string.Empty;
                worksheet.Cells[rowIndex, 11].Value = assignment?.ProctorName ?? string.Empty;
                rowIndex++;
            }

            // Set borders for the table headers and data rows
            var lastRow = rowIndex - 1;
            if (lastRow >= headerRow)
            {
                var tableRange = worksheet.Cells[headerRow, 1, lastRow, headers.Length];
                tableRange.Style.Border.Top.Style = OfficeOpenXml.Style.ExcelBorderStyle.Thin;
                tableRange.Style.Border.Bottom.Style = OfficeOpenXml.Style.ExcelBorderStyle.Thin;
                tableRange.Style.Border.Left.Style = OfficeOpenXml.Style.ExcelBorderStyle.Thin;
                tableRange.Style.Border.Right.Style = OfficeOpenXml.Style.ExcelBorderStyle.Thin;
                tableRange.AutoFilter = true;
            }

            worksheet.Cells[worksheet.Dimension.Address].AutoFitColumns();

            var fileName = GetSafeFileName($"{exam.Name}_{exam.ApplicationDate:yyyyMMdd}") + ".xlsx";
            return File(package.GetAsByteArray(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", fileName);
        }

        [HttpGet]
        public async Task<IActionResult> AttendanceReportPreview(
            string classFilter,
            string branchFilter,
            string studentNameFilter,
            int? examIdFilter,
            DateTime? startDateFilter,
            DateTime? endDateFilter)
        {
            var classes = await _context.Ogrenciler.Select(o => o.SinifDuzeyi).Distinct().OrderBy(c => c).ToListAsync();
            var branches = await _context.Ogrenciler.Select(o => o.Sube).Distinct().OrderBy(b => b).ToListAsync();
            var examsList = await _context.Exams.OrderByDescending(e => e.ApplicationDate).Select(e => new { e.Id, e.Name }).ToListAsync();

            var query = _context.Ogrenciler.AsQueryable();

            if (!string.IsNullOrEmpty(classFilter))
                query = query.Where(o => o.SinifDuzeyi == classFilter);

            if (!string.IsNullOrEmpty(branchFilter))
                query = query.Where(o => o.Sube == branchFilter);

            if (!string.IsNullOrEmpty(studentNameFilter))
            {
                var term = studentNameFilter.ToLower();
                query = query.Where(o => o.AdSoyad.ToLower().Contains(term) || o.OgrenciNo.Contains(studentNameFilter));
            }

            var students = await query.ToListAsync();
            var studentNos = students.Select(s => s.OgrenciNo).ToList();

            var seatsQuery = _context.ExamSeats
                .Include(es => es.Exam)
                .Where(es => studentNos.Contains(es.OgrenciNo));

            if (examIdFilter.HasValue)
                seatsQuery = seatsQuery.Where(es => es.ExamId == examIdFilter.Value);

            if (startDateFilter.HasValue)
                seatsQuery = seatsQuery.Where(es => es.Exam.ApplicationDate >= startDateFilter.Value);

            if (endDateFilter.HasValue)
                seatsQuery = seatsQuery.Where(es => es.Exam.ApplicationDate <= endDateFilter.Value);

            var seats = await seatsQuery.ToListAsync();

            var previewItems = new List<AttendanceReportPreviewItem>();
            foreach (var student in students)
            {
                var studentSeats = seats.Where(es => es.OgrenciNo == student.OgrenciNo).ToList();
                if (studentSeats.Count == 0)
                {
                    if (examIdFilter.HasValue || startDateFilter.HasValue || endDateFilter.HasValue)
                    {
                        continue;
                    }

                    previewItems.Add(new AttendanceReportPreviewItem
                    {
                        OgrenciNo = student.OgrenciNo,
                        AdSoyad = student.AdSoyad,
                        SinifDuzeyi = student.SinifDuzeyi,
                        Sube = student.Sube,
                        ExamName = "—",
                        ExamDate = "—",
                        Status = "Yoklama Yok",
                        YoklamaNo = 0
                    });
                }
                else
                {
                    foreach (var seat in studentSeats)
                    {
                        previewItems.Add(new AttendanceReportPreviewItem
                        {
                            OgrenciNo = student.OgrenciNo,
                            AdSoyad = student.AdSoyad,
                            SinifDuzeyi = student.SinifDuzeyi,
                            Sube = student.Sube,
                            ExamName = seat.Exam.Name,
                            ExamDate = seat.Exam.ApplicationDate.ToString("dd.MM.yyyy"),
                            Status = seat.AttendanceStatus switch
                            {
                                AttendanceStatus.Katildi => "Var",
                                AttendanceStatus.Katilmadi => "Yok",
                                AttendanceStatus.Gec => "Geç",
                                _ => "Belirsiz"
                            },
                            YoklamaNo = seat.YoklamaNo
                        });
                    }
                }
            }

            return Json(new
            {
                classes,
                branches,
                exams = examsList,
                data = previewItems
            });
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> ExportAttendanceReport(
            string classFilter,
            string branchFilter,
            string studentNameFilter,
            int? examIdFilter,
            DateTime? startDateFilter,
            DateTime? endDateFilter,
            List<string> selectedOgrenciNos)
        {
            var query = _context.Ogrenciler.AsQueryable();

            if (!string.IsNullOrEmpty(classFilter))
                query = query.Where(o => o.SinifDuzeyi == classFilter);

            if (!string.IsNullOrEmpty(branchFilter))
                query = query.Where(o => o.Sube == branchFilter);

            if (!string.IsNullOrEmpty(studentNameFilter))
            {
                var term = studentNameFilter.ToLower();
                query = query.Where(o => o.AdSoyad.ToLower().Contains(term) || o.OgrenciNo.Contains(studentNameFilter));
            }

            if (selectedOgrenciNos != null && selectedOgrenciNos.Count > 0)
                query = query.Where(o => selectedOgrenciNos.Contains(o.OgrenciNo));

            var students = await query.ToListAsync();
            var studentNos = students.Select(s => s.OgrenciNo).ToList();

            var seatsQuery = _context.ExamSeats
                .Include(es => es.Exam)
                .Where(es => studentNos.Contains(es.OgrenciNo));

            if (examIdFilter.HasValue)
                seatsQuery = seatsQuery.Where(es => es.ExamId == examIdFilter.Value);

            if (startDateFilter.HasValue)
                seatsQuery = seatsQuery.Where(es => es.Exam.ApplicationDate >= startDateFilter.Value);

            if (endDateFilter.HasValue)
                seatsQuery = seatsQuery.Where(es => es.Exam.ApplicationDate <= endDateFilter.Value);

            var seats = await seatsQuery.ToListAsync();

            ExcelPackage.LicenseContext = LicenseContext.NonCommercial;
            using var package = new ExcelPackage();
            var worksheet = package.Workbook.Worksheets.Add("Katılım Raporu");

            var headers = new[] { "Öğrenci No", "Adı Soyadı", "Sınıf", "Şube", "Sınav Adı", "Sınav Tarihi", "Yoklama No", "Katılım Durumu" };
            for (int i = 0; i < headers.Length; i++)
            {
                var cell = worksheet.Cells[1, i + 1];
                cell.Value = headers[i];
                cell.Style.Font.Bold = true;
                cell.Style.Fill.PatternType = OfficeOpenXml.Style.ExcelFillStyle.Solid;
                cell.Style.Fill.BackgroundColor.SetColor(System.Drawing.Color.LightGray);
            }

            var rowIndex = 2;
            foreach (var student in students)
            {
                var studentSeats = seats.Where(es => es.OgrenciNo == student.OgrenciNo).ToList();
                if (studentSeats.Count == 0)
                {
                    if (examIdFilter.HasValue || startDateFilter.HasValue || endDateFilter.HasValue)
                    {
                        continue;
                    }

                    worksheet.Cells[rowIndex, 1].Value = student.OgrenciNo;
                    worksheet.Cells[rowIndex, 2].Value = student.AdSoyad;
                    worksheet.Cells[rowIndex, 3].Value = student.SinifDuzeyi;
                    worksheet.Cells[rowIndex, 4].Value = student.Sube;
                    worksheet.Cells[rowIndex, 5].Value = "—";
                    worksheet.Cells[rowIndex, 6].Value = "—";
                    worksheet.Cells[rowIndex, 7].Value = "—";
                    worksheet.Cells[rowIndex, 8].Value = "Yoklama Yok";
                    rowIndex++;
                }
                else
                {
                    foreach (var seat in studentSeats)
                    {
                        worksheet.Cells[rowIndex, 1].Value = student.OgrenciNo;
                        worksheet.Cells[rowIndex, 2].Value = student.AdSoyad;
                        worksheet.Cells[rowIndex, 3].Value = student.SinifDuzeyi;
                        worksheet.Cells[rowIndex, 4].Value = student.Sube;
                        worksheet.Cells[rowIndex, 5].Value = seat.Exam.Name;
                        worksheet.Cells[rowIndex, 6].Value = seat.Exam.ApplicationDate.ToString("yyyy-MM-dd");
                        worksheet.Cells[rowIndex, 7].Value = seat.YoklamaNo;
                        worksheet.Cells[rowIndex, 8].Value = seat.AttendanceStatus switch
                        {
                            AttendanceStatus.Katildi => "Var",
                            AttendanceStatus.Katilmadi => "Yok",
                            AttendanceStatus.Gec => "Geç",
                            _ => "Belirsiz"
                        };
                        rowIndex++;
                    }
                }
            }

            worksheet.Cells[worksheet.Dimension.Address].AutoFitColumns();

            var finalFileName = "Ogrenci_Katilim_Raporu_" + DateTime.Now.ToString("yyyyMMdd_HHmmss") + ".xlsx";
            return File(package.GetAsByteArray(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", finalFileName);
        }

        private static string GetSafeFileName(string fileName)
        {
            var invalidChars = Path.GetInvalidFileNameChars();
            return string.Concat(fileName.Select(ch => invalidChars.Contains(ch) ? '_' : ch));
        }
    }
}
