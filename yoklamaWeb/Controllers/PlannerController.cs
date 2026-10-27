using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using yoklamaWeb.Data;
using yoklamaWeb.Models;
using System.IO;
using OfficeOpenXml;
namespace yoklamaWeb.Controllers
{
    [Authorize(Roles = "Admin,Idareci,SinavYoneticisi")]
    public class PlannerController : Controller
    {
        private readonly AppDbContext _context;

        public PlannerController(AppDbContext context)
        {
            _context = context;
        }

        #region Room Management

        // GET: /Planner/Rooms
        public async Task<IActionResult> Rooms()
        {
            var rooms = await _context.PlannerRooms.OrderBy(r => r.RoomGroup).ThenBy(r => r.RoomName).ToListAsync();
            return View(rooms);
        }

        // GET: /Planner/CreateRoom
        public IActionResult CreateRoom()
        {
            return View();
        }

        // POST: /Planner/CreateRoom
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> CreateRoom([Bind("RoomName,Capacity,RoomGroup")] PlannerRoom room)
        {
            if (ModelState.IsValid)
            {
                _context.Add(room);
                await _context.SaveChangesAsync();
                TempData["SuccessMessage"] = "Salon başarıyla eklendi.";
                return RedirectToAction(nameof(Rooms));
            }
            return View(room);
        }

        // GET: /Planner/EditRoom/5
        public async Task<IActionResult> EditRoom(int? id)
        {
            if (id == null) return NotFound();
            var room = await _context.PlannerRooms.FindAsync(id);
            if (room == null) return NotFound();
            return View(room);
        }

        // POST: /Planner/EditRoom/5
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> EditRoom(int id, [Bind("Id,RoomName,Capacity,RoomGroup")] PlannerRoom room)
        {
            if (id != room.Id) return NotFound();

            if (ModelState.IsValid)
            {
                try
                {
                    _context.Update(room);
                    await _context.SaveChangesAsync();
                    TempData["SuccessMessage"] = "Salon başarıyla güncellendi.";
                }
                catch (DbUpdateConcurrencyException)
                {
                    if (!_context.PlannerRooms.Any(r => r.Id == room.Id))
                        return NotFound();
                    else
                        throw;
                }
                return RedirectToAction(nameof(Rooms));
            }
            return View(room);
        }

        // POST: /Planner/DeleteRoom/5
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> DeleteRoom(int id)
        {
            var room = await _context.PlannerRooms.FindAsync(id);
            if (room != null)
            {
                _context.PlannerRooms.Remove(room);
                await _context.SaveChangesAsync();
                TempData["SuccessMessage"] = "Salon başarıyla silindi.";
            }
            return RedirectToAction(nameof(Rooms));
        }

        #endregion

        #region Exam Management

        // GET: /Planner/Exams
        public async Task<IActionResult> Exams()
        {
            var exams = await _context.PlannerExams.OrderByDescending(e => e.ExamDate).ToListAsync();
            return View(exams);
        }

        // GET: /Planner/CreateExam
        public IActionResult CreateExam()
        {
            var exam = new PlannerExam
            {
                ExamDate = DateTime.Today,
                StartTime = "09:00"
            };
            return View(exam);
        }

        // POST: /Planner/CreateExam
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> CreateExam([Bind("Name,ExamDate,StartTime")] PlannerExam exam)
        {
            if (ModelState.IsValid)
            {
                _context.Add(exam);
                await _context.SaveChangesAsync();
                TempData["SuccessMessage"] = "Planlama sınavı başarıyla oluşturuldu.";
                return RedirectToAction(nameof(Exams));
            }
            return View(exam);
        }

        // GET: /Planner/EditExam/5
        public async Task<IActionResult> EditExam(int? id)
        {
            if (id == null) return NotFound();
            var exam = await _context.PlannerExams.FindAsync(id);
            if (exam == null) return NotFound();
            return View(exam);
        }

        // POST: /Planner/EditExam/5
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> EditExam(int id, [Bind("Id,Name,ExamDate,StartTime")] PlannerExam exam)
        {
            if (id != exam.Id) return NotFound();

            if (ModelState.IsValid)
            {
                try
                {
                    _context.Update(exam);
                    await _context.SaveChangesAsync();
                    TempData["SuccessMessage"] = "Sınav bilgileri güncellendi.";
                }
                catch (DbUpdateConcurrencyException)
                {
                    if (!_context.PlannerExams.Any(e => e.Id == exam.Id))
                        return NotFound();
                    else
                        throw;
                }
                return RedirectToAction(nameof(Exams));
            }
            return View(exam);
        }

        // POST: /Planner/DeleteExam/5
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> DeleteExam(int id)
        {
            try
            {
                var exam = await _context.PlannerExams.FindAsync(id);
                if (exam != null)
                {
                    // Delete related seating and mappings first
                    var seatings = await _context.PlannerSeatings.Where(s => s.PlannerExamId == id).ToListAsync();
                    if (seatings.Any())
                    {
                        _context.PlannerSeatings.RemoveRange(seatings);
                    }

                    var rooms = await _context.PlannerExamRooms.Where(er => er.PlannerExamId == id).ToListAsync();
                    if (rooms.Any())
                    {
                        _context.PlannerExamRooms.RemoveRange(rooms);
                    }

                    _context.PlannerExams.Remove(exam);
                    await _context.SaveChangesAsync();
                    TempData["SuccessMessage"] = "Sınav başarıyla silindi.";
                }
            }
            catch (DbUpdateConcurrencyException)
            {
                TempData["SuccessMessage"] = "Sınav başarıyla silindi.";
            }
            catch (Exception ex)
            {
                TempData["ErrorMessage"] = "Sınav silinirken bir hata oluştu: " + ex.Message;
            }

            return RedirectToAction(nameof(Exams));
        }

        #endregion

        #region Seating Configuration & Placement

        // GET: /Planner/ConfigureExam/5
        public async Task<IActionResult> ConfigureExam(int? id)
        {
            if (id == null) return NotFound();
            var exam = await _context.PlannerExams.FindAsync(id);
            if (exam == null) return NotFound();

            var rooms = await _context.PlannerRooms.OrderBy(r => r.RoomGroup).ThenBy(r => r.RoomName).ToListAsync();
            var currentRooms = await _context.PlannerExamRooms
                .Where(er => er.PlannerExamId == id)
                .Select(er => er.PlannerRoomId)
                .ToListAsync();

            var gradeLevels = await _context.Ogrenciler
                .Select(o => o.SinifDuzeyi)
                .Distinct()
                .OrderBy(g => g)
                .ToListAsync();

            // Sınıf düzeylerine göre öğrenci sayılarını hesaplayalım
            var studentCounts = await _context.Ogrenciler
                .GroupBy(o => o.SinifDuzeyi)
                .Select(g => new { Grade = g.Key, Count = g.Count() })
                .ToDictionaryAsync(x => x.Grade, x => x.Count);

            var students = await _context.Ogrenciler
                .OrderBy(o => o.AdSoyad)
                .ToListAsync();

            ViewBag.Exam = exam;
            ViewBag.Rooms = rooms;
            ViewBag.CurrentRooms = currentRooms;
            ViewBag.GradeLevels = gradeLevels;
            ViewBag.StudentCounts = studentCounts;
            ViewBag.Students = students;

            // Önceden yapılmış bir yerleşim var mı kontrol edelim
            ViewBag.HasSeating = await _context.PlannerSeatings.AnyAsync(s => s.PlannerExamId == id);

            return View();
        }

        // POST: /Planner/PlaceStudents
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> PlaceStudents(int examId, List<int> selectedRoomIds, List<string> selectedStudentNos, string participationFilter, string placementType, bool isButterfly)
        {
            var exam = await _context.PlannerExams.FindAsync(examId);
            if (exam == null) return NotFound();

            if (selectedRoomIds == null || !selectedRoomIds.Any())
            {
                TempData["ErrorMessage"] = "En az bir salon seçmelisiniz.";
                return RedirectToAction(nameof(ConfigureExam), new { id = examId });
            }

            if (selectedStudentNos == null || !selectedStudentNos.Any())
            {
                TempData["ErrorMessage"] = "En az bir öğrenci seçmelisiniz.";
                return RedirectToAction(nameof(ConfigureExam), new { id = examId });
            }

            var rooms = await _context.PlannerRooms.Where(r => selectedRoomIds.Contains(r.Id)).ToListAsync();
            var totalCapacity = rooms.Sum(r => r.Capacity);

            var students = await _context.Ogrenciler
                .Where(o => selectedStudentNos.Contains(o.OgrenciNo))
                .ToListAsync();

            if (participationFilter == "sadeceKatilacaklar")
            {
                students = students.Where(o => o.SinavlaraKatilacak).ToList();
            }

            if (!students.Any())
            {
                TempData["ErrorMessage"] = "Seçilen kriterlere ve filtreye uygun öğrenci bulunamadı.";
                return RedirectToAction(nameof(ConfigureExam), new { id = examId });
            }

            if (students.Count > totalCapacity)
            {
                TempData["ErrorMessage"] = $"Öğrenci sayısı ({students.Count}) seçilen salonların toplam kapasitesini ({totalCapacity}) aşıyor. Lütfen daha fazla salon seçin.";
                return RedirectToAction(nameof(ConfigureExam), new { id = examId });
            }

            // Shuffle students randomly
            var random = new Random();
            var shuffledStudents = students.OrderBy(x => random.Next()).ToList();

            // Interleave students from different grades if butterfly seating is requested
            if (isButterfly)
            {
                var gradeGroups = shuffledStudents
                    .GroupBy(s => s.SinifDuzeyi)
                    .ToDictionary(g => g.Key, g => new Queue<Ogrenci>(g));

                var interleaved = new List<Ogrenci>();

                while (gradeGroups.Any(kvp => kvp.Value.Count > 0))
                {
                    foreach (var grade in gradeGroups.Keys.ToList())
                    {
                        var queue = gradeGroups[grade];
                        if (queue.Count > 0)
                        {
                            interleaved.Add(queue.Dequeue());
                        }
                    }
                }
                shuffledStudents = interleaved;
            }

            // Clear old assignments for this exam
            var oldSeatings = await _context.PlannerSeatings.Where(s => s.PlannerExamId == examId).ToListAsync();
            _context.PlannerSeatings.RemoveRange(oldSeatings);

            var oldRooms = await _context.PlannerExamRooms.Where(er => er.PlannerExamId == examId).ToListAsync();
            _context.PlannerExamRooms.RemoveRange(oldRooms);

            // Add selected rooms mappings
            foreach (var rId in selectedRoomIds)
            {
                _context.PlannerExamRooms.Add(new PlannerExamRoom
                {
                    PlannerExamId = examId,
                    PlannerRoomId = rId
                });
            }

            // Calculate targets per room based on placementType
            var roomTargets = new Dictionary<int, int>();
            foreach (var r in rooms)
            {
                roomTargets[r.Id] = 0;
            }

            if (placementType == "homogeneous")
            {
                double ratio = (double)shuffledStudents.Count / totalCapacity;
                int allocated = 0;
                
                var roomFractions = new List<(int RoomId, double Fraction)>();
                foreach (var r in rooms)
                {
                    double exact = r.Capacity * ratio;
                    int target = (int)Math.Floor(exact);
                    roomTargets[r.Id] = target;
                    allocated += target;
                    roomFractions.Add((r.Id, exact - target));
                }

                var remaining = shuffledStudents.Count - allocated;
                foreach (var item in roomFractions.OrderByDescending(f => f.Fraction))
                {
                    if (remaining <= 0) break;
                    var room = rooms.First(r => r.Id == item.RoomId);
                    if (roomTargets[room.Id] < room.Capacity)
                    {
                        roomTargets[room.Id]++;
                        remaining--;
                    }
                }

                remaining = shuffledStudents.Count - roomTargets.Values.Sum();
                if (remaining > 0)
                {
                    foreach (var r in rooms.OrderByDescending(r => r.Capacity))
                    {
                        if (remaining <= 0) break;
                        int space = r.Capacity - roomTargets[r.Id];
                        int toAssign = Math.Min(space, remaining);
                        roomTargets[r.Id] += toAssign;
                        remaining -= toAssign;
                    }
                }
            }
            else
            {
                // Sequential / Fill rooms
                int remaining = shuffledStudents.Count;
                foreach (var r in rooms.OrderBy(r => r.RoomName))
                {
                    int toAssign = Math.Min(r.Capacity, remaining);
                    roomTargets[r.Id] = toAssign;
                    remaining -= toAssign;
                }
            }

            // Placement logic using roomTargets
            int studentIndex = 0;
            foreach (var room in rooms.OrderBy(r => r.RoomName))
            {
                int targetCount = roomTargets[room.Id];
                for (int seatNum = 1; seatNum <= targetCount; seatNum++)
                {
                    if (studentIndex >= shuffledStudents.Count)
                        break;

                    var student = shuffledStudents[studentIndex];

                    var seating = new PlannerSeating
                    {
                        PlannerExamId = examId,
                        OgrenciNo = student.OgrenciNo,
                        AdSoyad = student.AdSoyad,
                        SinifDuzeyi = student.SinifDuzeyi,
                        Sube = student.Sube,
                        RoomName = room.RoomName,
                        SeatNumber = seatNum,
                        Sira = seatNum
                    };

                    _context.PlannerSeatings.Add(seating);
                    studentIndex++;
                }
            }

            await _context.SaveChangesAsync();
            TempData["SuccessMessage"] = "Öğrenciler salonlara başarıyla yerleştirildi.";
            return RedirectToAction(nameof(SeatingDetails), new { id = examId });
        }

        // GET: /Planner/SeatingDetails/5
        public async Task<IActionResult> SeatingDetails(int? id)
        {
            if (id == null) return NotFound();
            var exam = await _context.PlannerExams.FindAsync(id);
            if (exam == null) return NotFound();

            var seatings = await _context.PlannerSeatings
                .Where(s => s.PlannerExamId == id)
                .OrderBy(s => s.RoomName)
                .ThenBy(s => s.SeatNumber)
                .ToListAsync();

            var roomCapacities = await _context.PlannerRooms
                .GroupBy(r => r.RoomName)
                .ToDictionaryAsync(g => g.Key, g => g.First().Capacity);

            ViewBag.Exam = exam;
            ViewBag.RoomCapacities = roomCapacities;
            return View(seatings);
        }

        // POST: /Planner/DeleteSeating
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> DeleteSeating(int id)
        {
            var seating = await _context.PlannerSeatings.FindAsync(id);
            if (seating == null) return NotFound();

            int examId = seating.PlannerExamId;
            _context.PlannerSeatings.Remove(seating);
            await _context.SaveChangesAsync();

            TempData["SuccessMessage"] = "Öğrenci yerleşim planından silindi.";
            return RedirectToAction(nameof(SeatingDetails), new { id = examId });
        }

        // POST: /Planner/MoveSeating
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> MoveSeating(int id, string targetRoomName)
        {
            var seating = await _context.PlannerSeatings.FindAsync(id);
            if (seating == null) return NotFound();

            int examId = seating.PlannerExamId;

            var room = await _context.PlannerRooms.FirstOrDefaultAsync(r => r.RoomName == targetRoomName);
            if (room == null)
            {
                TempData["ErrorMessage"] = $"Hedef salon '{targetRoomName}' bulunamadı.";
                return RedirectToAction(nameof(SeatingDetails), new { id = examId });
            }

            var takenSeats = await _context.PlannerSeatings
                .Where(s => s.PlannerExamId == examId && s.RoomName == targetRoomName)
                .Select(s => s.SeatNumber)
                .ToListAsync();

            if (takenSeats.Count >= room.Capacity)
            {
                TempData["ErrorMessage"] = $"Hedef salon ({targetRoomName}) dolu!";
                return RedirectToAction(nameof(SeatingDetails), new { id = examId });
            }

            int targetSeat = 1;
            for (int i = 1; i <= room.Capacity; i++)
            {
                if (!takenSeats.Contains(i))
                {
                    targetSeat = i;
                    break;
                }
            }

            seating.RoomName = targetRoomName;
            seating.SeatNumber = targetSeat;
            seating.Sira = targetSeat;

            _context.Update(seating);
            await _context.SaveChangesAsync();

            TempData["SuccessMessage"] = $"{seating.AdSoyad} adlı öğrenci {targetRoomName} salonuna (Koltuk {targetSeat}) başarıyla taşındı.";
            return RedirectToAction(nameof(SeatingDetails), new { id = examId });
        }

        private static string FormatExamDateTime(PlannerExam exam)
        {
            var culture = new System.Globalization.CultureInfo("tr-TR");
            string gun = exam.ExamDate.ToString("dddd", culture);
            string tarih = exam.ExamDate.ToString("dd.MM.yyyy");

            string saat = exam.StartTime ?? "09:00";
            if (TimeSpan.TryParse(saat, out var ts))
            {
                saat = ts.ToString(@"hh\:mm");
            }
            else if (DateTime.TryParse(saat, out var dt))
            {
                saat = dt.ToString("HH:mm");
            }

            return $"{tarih} {gun} Saat: {saat}";
        }

        // GET: /Planner/ExportRoomAttendanceExcel/5
        public async Task<IActionResult> ExportRoomAttendanceExcel(int id, bool includeSummary = true)
        {
            var exam = await _context.PlannerExams.FindAsync(id);
            if (exam == null) return NotFound();

            var seatings = await _context.PlannerSeatings
                .Where(s => s.PlannerExamId == id)
                .OrderBy(s => s.RoomName)
                .ThenBy(s => s.SeatNumber)
                .ToListAsync();

            using var package = new ExcelPackage();
            var grouped = seatings.GroupBy(s => s.RoomName).OrderBy(g => g.Key);

            string examDateFormatted = FormatExamDateTime(exam);
            bool isWrittenExam = exam.ExamType == "Yazili" || seatings.Any(s => !string.IsNullOrEmpty(s.Ders));

            foreach (var group in grouped)
            {
                var ws = package.Workbook.Worksheets.Add(group.Key);
                ws.Cells.Style.Font.Name = "Calibri";
                ws.Cells.Style.Font.Size = 11;

                int totalCols = isWrittenExam ? 7 : 6;

                // 1. Title Header
                ws.Cells[1, 1].Value = $"{examDateFormatted}  |  {exam.Name}  |  {group.Key} Salon Yoklama Listesi";
                ws.Cells[1, 1, 1, totalCols].Merge = true;
                using (var titleRange = ws.Cells[1, 1, 1, totalCols])
                {
                    titleRange.Style.Font.Bold = true;
                    titleRange.Style.Font.Size = 13;
                    titleRange.Style.HorizontalAlignment = OfficeOpenXml.Style.ExcelHorizontalAlignment.Center;
                    titleRange.Style.Fill.PatternType = OfficeOpenXml.Style.ExcelFillStyle.Solid;
                    titleRange.Style.Fill.BackgroundColor.SetColor(System.Drawing.Color.FromArgb(240, 244, 248));
                }

                // Table Headers (Row 3)
                ws.Cells[3, 1].Value = "Koltuk";
                ws.Cells[3, 2].Value = "Öğrenci No";
                ws.Cells[3, 3].Value = "Adı Soyadı";
                ws.Cells[3, 4].Value = "Sınıf / Şube";
                ws.Cells[3, 5].Value = "Alanı";
                if (isWrittenExam)
                {
                    ws.Cells[3, 6].Value = "Yazılı Dersi";
                    ws.Cells[3, 7].Value = "İmza";
                }
                else
                {
                    ws.Cells[3, 6].Value = "İmza";
                }

                using (var range = ws.Cells[3, 1, 3, totalCols])
                {
                    range.Style.Font.Bold = true;
                    range.Style.Fill.PatternType = OfficeOpenXml.Style.ExcelFillStyle.Solid;
                    range.Style.Fill.BackgroundColor.SetColor(System.Drawing.Color.DarkSlateGray);
                    range.Style.Font.Color.SetColor(System.Drawing.Color.White);
                    range.Style.HorizontalAlignment = OfficeOpenXml.Style.ExcelHorizontalAlignment.Center;
                }

                int row = 4;
                foreach (var seat in group.OrderBy(s => s.SeatNumber))
                {
                    ws.Cells[row, 1].Value = seat.SeatNumber;
                    ws.Cells[row, 1].Style.HorizontalAlignment = OfficeOpenXml.Style.ExcelHorizontalAlignment.Center;

                    ws.Cells[row, 2].Value = seat.OgrenciNo;
                    ws.Cells[row, 2].Style.HorizontalAlignment = OfficeOpenXml.Style.ExcelHorizontalAlignment.Center;

                    ws.Cells[row, 3].Value = seat.AdSoyad;
                    ws.Cells[row, 3].Style.HorizontalAlignment = OfficeOpenXml.Style.ExcelHorizontalAlignment.Left;

                    ws.Cells[row, 4].Value = $"{seat.SinifDuzeyi}-{seat.Sube}";
                    ws.Cells[row, 4].Style.HorizontalAlignment = OfficeOpenXml.Style.ExcelHorizontalAlignment.Center;

                    ws.Cells[row, 5].Value = string.IsNullOrEmpty(seat.Alan) || seat.Alan == "YOK" ? "-" : seat.Alan;
                    ws.Cells[row, 5].Style.HorizontalAlignment = OfficeOpenXml.Style.ExcelHorizontalAlignment.Center;

                    if (isWrittenExam)
                    {
                        ws.Cells[row, 6].Value = string.IsNullOrEmpty(seat.Ders) ? "-" : seat.Ders;
                        ws.Cells[row, 6].Style.HorizontalAlignment = OfficeOpenXml.Style.ExcelHorizontalAlignment.Left;
                        ws.Cells[row, 7].Value = ""; // İmza
                    }
                    else
                    {
                        ws.Cells[row, 6].Value = ""; // İmza
                    }
                    row++;
                }

                // Table Borders
                using (var borderRange = ws.Cells[3, 1, row - 1, totalCols])
                {
                    borderRange.Style.Border.Top.Style = OfficeOpenXml.Style.ExcelBorderStyle.Thin;
                    borderRange.Style.Border.Bottom.Style = OfficeOpenXml.Style.ExcelBorderStyle.Thin;
                    borderRange.Style.Border.Left.Style = OfficeOpenXml.Style.ExcelBorderStyle.Thin;
                    borderRange.Style.Border.Right.Style = OfficeOpenXml.Style.ExcelBorderStyle.Thin;
                }

                if (includeSummary)
                {
                    // --- DETAILED COMPACT SUMMARY BLOCK (A4 Fits comfortably) ---
                    int summaryStartRow = row + 1;

                    // 1. Summary Title
                    ws.Cells[summaryStartRow, 1, summaryStartRow, totalCols].Merge = true;
                    ws.Cells[summaryStartRow, 1].Value = $"SALON ÖZETİ (Toplam {group.Count()} Öğrenci)";
                    using (var sTitle = ws.Cells[summaryStartRow, 1, summaryStartRow, totalCols])
                    {
                        sTitle.Style.Font.Bold = true;
                        sTitle.Style.Font.Size = 11;
                        sTitle.Style.Fill.PatternType = OfficeOpenXml.Style.ExcelFillStyle.Solid;
                        sTitle.Style.Fill.BackgroundColor.SetColor(System.Drawing.Color.LightGray);
                        sTitle.Style.HorizontalAlignment = OfficeOpenXml.Style.ExcelHorizontalAlignment.Center;
                    }

                    int curSummaryRow = summaryStartRow + 1;

                    // 2. Ders Dağılımı (if written exam or ders present)
                    var dersCounts = group
                        .Where(s => !string.IsNullOrWhiteSpace(s.Ders))
                        .GroupBy(s => s.Ders!.Trim())
                        .OrderBy(g => g.Key)
                        .Select(g => $"{g.Key}: {g.Count()} kişi")
                        .ToList();

                    if (dersCounts.Any())
                    {
                        ws.Cells[curSummaryRow, 1, curSummaryRow, totalCols].Merge = true;
                        ws.Cells[curSummaryRow, 1].Value = "📚 YAZILI DERS DAĞILIMI:  " + string.Join("  •  ", dersCounts);
                        ws.Cells[curSummaryRow, 1].Style.Font.Bold = true;
                        ws.Cells[curSummaryRow, 1].Style.Font.Size = 10;
                        ws.Cells[curSummaryRow, 1].Style.Fill.PatternType = OfficeOpenXml.Style.ExcelFillStyle.Solid;
                        ws.Cells[curSummaryRow, 1].Style.Fill.BackgroundColor.SetColor(System.Drawing.Color.FromArgb(254, 249, 231));
                        curSummaryRow++;
                    }

                    // 3. Sınıf & Alan Dağılımı (e.g. 11 SAY: 12 kişi, 12 TM: 8 kişi, 10: 6 kişi)
                    var classAlanCounts = group
                        .GroupBy(s => {
                            string alanStr = (string.IsNullOrWhiteSpace(s.Alan) || s.Alan.Trim() == "YOK") ? "" : $" {s.Alan.Trim()}";
                            return $"{s.SinifDuzeyi}{alanStr}";
                        })
                        .OrderBy(g => g.Key)
                        .Select(g => $"{g.Key}: {g.Count()} kişi")
                        .ToList();

                    ws.Cells[curSummaryRow, 1, curSummaryRow, totalCols].Merge = true;
                    ws.Cells[curSummaryRow, 1].Value = "👥 SINIF & ALAN DAĞILIMI:  " + string.Join("  •  ", classAlanCounts);
                    ws.Cells[curSummaryRow, 1].Style.Font.Size = 10;
                    curSummaryRow++;

                    // 4. Şubeler Dağılımı
                    var subeCounts = group
                        .GroupBy(s => $"{s.SinifDuzeyi}-{s.Sube}")
                        .OrderBy(g => g.Key)
                        .Select(g => $"{g.Key}: {g.Count()}")
                        .ToList();

                    ws.Cells[curSummaryRow, 1, curSummaryRow, totalCols].Merge = true;
                    ws.Cells[curSummaryRow, 1].Value = "🏫 ŞUBELER:  " + string.Join(", ", subeCounts);
                    ws.Cells[curSummaryRow, 1].Style.Font.Size = 9;
                    ws.Cells[curSummaryRow, 1].Style.Font.Italic = true;

                    // Summary Borders
                    using (var sBorder = ws.Cells[summaryStartRow, 1, curSummaryRow, totalCols])
                    {
                        sBorder.Style.Border.Top.Style = OfficeOpenXml.Style.ExcelBorderStyle.Medium;
                        sBorder.Style.Border.Bottom.Style = OfficeOpenXml.Style.ExcelBorderStyle.Medium;
                        sBorder.Style.Border.Left.Style = OfficeOpenXml.Style.ExcelBorderStyle.Medium;
                        sBorder.Style.Border.Right.Style = OfficeOpenXml.Style.ExcelBorderStyle.Medium;
                    }
                }

                ws.Cells.AutoFitColumns();

                // Print settings: Force 1-page fit
                ws.PrinterSettings.PaperSize = OfficeOpenXml.ePaperSize.A4;
                ws.PrinterSettings.Orientation = OfficeOpenXml.eOrientation.Portrait;
                ws.PrinterSettings.FitToPage = true;
                ws.PrinterSettings.FitToWidth = 1;
                ws.PrinterSettings.FitToHeight = 1;
            }

            if (package.Workbook.Worksheets.Count == 0)
            {
                package.Workbook.Worksheets.Add("Boş");
            }

            var fileBytes = package.GetAsByteArray();
            var fileName = $"{exam.Name.Replace(" ", "_")}_Salon_Yoklama_Listeleri.xlsx";
            return File(fileBytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", fileName);
        }

        // GET: /Planner/ExportStudentInfoExcel/5
        public async Task<IActionResult> ExportStudentInfoExcel(int id)
        {
            var exam = await _context.PlannerExams.FindAsync(id);
            if (exam == null) return NotFound();

            var seatings = await _context.PlannerSeatings
                .Where(s => s.PlannerExamId == id)
                .OrderBy(s => s.AdSoyad)
                .ToListAsync();

            using var package = new ExcelPackage();
            string examDateFormatted = FormatExamDateTime(exam);

            var groupedByBranch = seatings.GroupBy(s => $"{s.SinifDuzeyi}-{s.Sube}").OrderBy(g => g.Key);
            foreach (var branchGroup in groupedByBranch)
            {
                var ws = package.Workbook.Worksheets.Add(branchGroup.Key);
                ws.Cells.Style.Font.Size = 12;

                int cols = seatings.Any(s => !string.IsNullOrEmpty(s.Ders)) ? 5 : 4;
                
                // Merged Title Header
                ws.Cells[1, 1].Value = $"{examDateFormatted}  |  {exam.Name}  |  {branchGroup.Key} Öğrenci Bilgilendirme Listesi";
                ws.Cells[1, 1, 1, cols].Merge = true;
                using (var titleRange = ws.Cells[1, 1, 1, cols])
                {
                    titleRange.Style.Font.Bold = true;
                    titleRange.Style.Font.Size = 13;
                    titleRange.Style.HorizontalAlignment = OfficeOpenXml.Style.ExcelHorizontalAlignment.Center;
                    titleRange.Style.Fill.PatternType = OfficeOpenXml.Style.ExcelFillStyle.Solid;
                    titleRange.Style.Fill.BackgroundColor.SetColor(System.Drawing.Color.FromArgb(240, 244, 248));
                }

                ws.Cells[3, 1].Value = "Öğrenci No";
                ws.Cells[3, 2].Value = "Adı Soyadı";
                ws.Cells[3, 3].Value = "Sınav Salonu";
                ws.Cells[3, 4].Value = "Koltuk No";
                if (cols == 5)
                {
                    ws.Cells[3, 5].Value = "Yazılı Dersi";
                }

                using (var range = ws.Cells[3, 1, 3, cols])
                {
                    range.Style.Font.Bold = true;
                    range.Style.Fill.PatternType = OfficeOpenXml.Style.ExcelFillStyle.Solid;
                    range.Style.Fill.BackgroundColor.SetColor(System.Drawing.Color.SteelBlue);
                    range.Style.Font.Color.SetColor(System.Drawing.Color.White);
                    range.Style.HorizontalAlignment = OfficeOpenXml.Style.ExcelHorizontalAlignment.Center;
                }

                int row = 4;
                foreach (var seat in branchGroup.OrderBy(s => s.AdSoyad))
                {
                    ws.Cells[row, 1].Value = seat.OgrenciNo;
                    ws.Cells[row, 1].Style.HorizontalAlignment = OfficeOpenXml.Style.ExcelHorizontalAlignment.Center;
                    ws.Cells[row, 2].Value = seat.AdSoyad;
                    ws.Cells[row, 3].Value = seat.RoomName;
                    ws.Cells[row, 3].Style.HorizontalAlignment = OfficeOpenXml.Style.ExcelHorizontalAlignment.Center;
                    ws.Cells[row, 4].Value = seat.SeatNumber;
                    ws.Cells[row, 4].Style.HorizontalAlignment = OfficeOpenXml.Style.ExcelHorizontalAlignment.Center;
                    if (cols == 5)
                    {
                        ws.Cells[row, 5].Value = seat.Ders ?? "-";
                    }
                    row++;
                }

                using (var borderRange = ws.Cells[3, 1, row - 1, cols])
                {
                    borderRange.Style.Border.Top.Style = OfficeOpenXml.Style.ExcelBorderStyle.Thin;
                    borderRange.Style.Border.Bottom.Style = OfficeOpenXml.Style.ExcelBorderStyle.Thin;
                    borderRange.Style.Border.Left.Style = OfficeOpenXml.Style.ExcelBorderStyle.Thin;
                    borderRange.Style.Border.Right.Style = OfficeOpenXml.Style.ExcelBorderStyle.Thin;
                }

                ws.Cells.AutoFitColumns();
                ws.PrinterSettings.PaperSize = OfficeOpenXml.ePaperSize.A4;
                ws.PrinterSettings.Orientation = OfficeOpenXml.eOrientation.Portrait;
                ws.PrinterSettings.FitToPage = true;
                ws.PrinterSettings.FitToWidth = 1;
            }

            var gradeLevels = seatings.Select(s => s.SinifDuzeyi).Distinct().ToList();
            var allStudentsInGrades = await _context.Ogrenciler
                .Where(o => gradeLevels.Contains(o.SinifDuzeyi))
                .ToListAsync();

            var seatedStudentNos = seatings.Select(s => s.OgrenciNo).ToHashSet();
            var nonParticipants = allStudentsInGrades
                .Where(o => !seatedStudentNos.Contains(o.OgrenciNo))
                .OrderBy(o => o.SinifDuzeyi)
                .ThenBy(o => o.Sube)
                .ThenBy(o => o.AdSoyad)
                .ToList();

            var wsNon = package.Workbook.Worksheets.Add("Sınava Girmeyenler");
            wsNon.Cells.Style.Font.Size = 12;
            
            wsNon.Cells[1, 1].Value = $"{examDateFormatted}  |  {exam.Name} Sınava Girmeyen Öğrenciler";
            wsNon.Cells[1, 1, 1, 4].Merge = true;
            using (var titleRange = wsNon.Cells[1, 1, 1, 4])
            {
                titleRange.Style.Font.Bold = true;
                titleRange.Style.Font.Size = 13;
                titleRange.Style.HorizontalAlignment = OfficeOpenXml.Style.ExcelHorizontalAlignment.Center;
            }

            wsNon.Cells[3, 1].Value = "Öğrenci No";
            wsNon.Cells[3, 2].Value = "Ad Soyad";
            wsNon.Cells[3, 3].Value = "Sınıf / Şube";
            wsNon.Cells[3, 4].Value = "Katılmama Durumu";

            using (var range = wsNon.Cells[3, 1, 3, 4])
            {
                range.Style.Font.Bold = true;
                range.Style.Fill.PatternType = OfficeOpenXml.Style.ExcelFillStyle.Solid;
                range.Style.Fill.BackgroundColor.SetColor(System.Drawing.Color.DarkRed);
                range.Style.Font.Color.SetColor(System.Drawing.Color.White);
            }

            int rowNon = 4;
            foreach (var student in nonParticipants)
            {
                wsNon.Cells[rowNon, 1].Value = student.OgrenciNo;
                wsNon.Cells[rowNon, 2].Value = student.AdSoyad;
                wsNon.Cells[rowNon, 3].Value = $"{student.SinifDuzeyi}-{student.Sube}";
                wsNon.Cells[rowNon, 4].Value = student.SinavlaraKatilacak ? "Listeden Silindi" : "Kendi İsteğiyle Girmeyen";
                rowNon++;
            }

            if (nonParticipants.Any())
            {
                using (var borderRange = wsNon.Cells[3, 1, rowNon - 1, 4])
                {
                    borderRange.Style.Border.Top.Style = OfficeOpenXml.Style.ExcelBorderStyle.Thin;
                    borderRange.Style.Border.Bottom.Style = OfficeOpenXml.Style.ExcelBorderStyle.Thin;
                    borderRange.Style.Border.Left.Style = OfficeOpenXml.Style.ExcelBorderStyle.Thin;
                    borderRange.Style.Border.Right.Style = OfficeOpenXml.Style.ExcelBorderStyle.Thin;
                }
            }

            wsNon.Cells.AutoFitColumns();

            var wsAll = package.Workbook.Worksheets.Add("Tüm Liste (Alfabetik)");
            wsAll.Cells.Style.Font.Size = 12;
            
            int allCols = seatings.Any(s => !string.IsNullOrEmpty(s.Ders)) ? 6 : 5;
            wsAll.Cells[1, 1].Value = $"{examDateFormatted}  |  {exam.Name} Tüm Öğrenciler Salon Bilgilendirme Listesi";
            wsAll.Cells[1, 1, 1, allCols].Merge = true;
            using (var titleRange = wsAll.Cells[1, 1, 1, allCols])
            {
                titleRange.Style.Font.Bold = true;
                titleRange.Style.Font.Size = 13;
                titleRange.Style.HorizontalAlignment = OfficeOpenXml.Style.ExcelHorizontalAlignment.Center;
            }

            wsAll.Cells[3, 1].Value = "Ad Soyad";
            wsAll.Cells[3, 2].Value = "Öğrenci No";
            wsAll.Cells[3, 3].Value = "Sınıf / Şube";
            wsAll.Cells[3, 4].Value = "Sınav Salonu";
            wsAll.Cells[3, 5].Value = "Koltuk No";
            if (allCols == 6)
            {
                wsAll.Cells[3, 6].Value = "Yazılı Dersi";
            }

            using (var range = wsAll.Cells[3, 1, 3, allCols])
            {
                range.Style.Font.Bold = true;
                range.Style.Fill.PatternType = OfficeOpenXml.Style.ExcelFillStyle.Solid;
                range.Style.Fill.BackgroundColor.SetColor(System.Drawing.Color.ForestGreen);
                range.Style.Font.Color.SetColor(System.Drawing.Color.White);
            }

            int rowAll = 4;
            foreach (var seat in seatings.OrderBy(s => s.AdSoyad))
            {
                wsAll.Cells[rowAll, 1].Value = seat.AdSoyad;
                wsAll.Cells[rowAll, 2].Value = seat.OgrenciNo;
                wsAll.Cells[rowAll, 3].Value = $"{seat.SinifDuzeyi}-{seat.Sube}";
                wsAll.Cells[rowAll, 4].Value = seat.RoomName;
                wsAll.Cells[rowAll, 5].Value = seat.SeatNumber;
                if (allCols == 6)
                {
                    wsAll.Cells[rowAll, 6].Value = seat.Ders ?? "-";
                }
                rowAll++;
            }

            using (var borderRange = wsAll.Cells[3, 1, rowAll - 1, allCols])
            {
                borderRange.Style.Border.Top.Style = OfficeOpenXml.Style.ExcelBorderStyle.Thin;
                borderRange.Style.Border.Bottom.Style = OfficeOpenXml.Style.ExcelBorderStyle.Thin;
                borderRange.Style.Border.Left.Style = OfficeOpenXml.Style.ExcelBorderStyle.Thin;
                borderRange.Style.Border.Right.Style = OfficeOpenXml.Style.ExcelBorderStyle.Thin;
            }

            wsAll.Cells.AutoFitColumns();

            var fileBytes = package.GetAsByteArray();
            var fileName = $"{exam.Name.Replace(" ", "_")}_Ogrenci_Bilgilendirme_Listeleri.xlsx";
            return File(fileBytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", fileName);
        }

        #endregion

        #region Yazılı Oturma Planı Modülü

        // GET: /Planner/YaziliExams
        public async Task<IActionResult> YaziliExams()
        {
            var exams = await _context.PlannerExams
                .Where(e => e.ExamType == "Yazili")
                .OrderByDescending(e => e.ExamDate)
                .ToListAsync();

            var seatingCounts = await _context.PlannerSeatings
                .GroupBy(s => s.PlannerExamId)
                .Select(g => new { ExamId = g.Key, Count = g.Count() })
                .ToDictionaryAsync(x => x.ExamId, x => x.Count);

            ViewBag.SeatingCounts = seatingCounts;
            return View(exams);
        }

        // GET: /Planner/CreateYaziliExam
        public IActionResult CreateYaziliExam()
        {
            var exam = new PlannerExam
            {
                ExamDate = DateTime.Today,
                StartTime = "09:40",
                ExamType = "Yazili"
            };
            return View(exam);
        }

        // POST: /Planner/CreateYaziliExam
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> CreateYaziliExam([Bind("Name,ExamDate,StartTime")] PlannerExam exam)
        {
            exam.ExamType = "Yazili";
            if (ModelState.IsValid)
            {
                _context.Add(exam);
                await _context.SaveChangesAsync();
                TempData["SuccessMessage"] = "Yazılı sınavı oluşturuldu. Lütfen şube, ders ve salon seçimlerini yapın.";
                return RedirectToAction(nameof(ConfigureYaziliExam), new { id = exam.Id });
            }
            return View(exam);
        }

        // GET: /Planner/ConfigureYaziliExam/5
        public async Task<IActionResult> ConfigureYaziliExam(int? id)
        {
            if (id == null) return NotFound();
            var exam = await _context.PlannerExams.FindAsync(id);
            if (exam == null) return NotFound();

            var rooms = await _context.PlannerRooms.OrderBy(r => r.RoomGroup).ThenBy(r => r.RoomName).ToListAsync();
            var currentRooms = await _context.PlannerExamRooms
                .Where(er => er.PlannerExamId == id)
                .Select(er => er.PlannerRoomId)
                .ToListAsync();

            var students = await _context.Ogrenciler.ToListAsync();
            var branches = students
                .GroupBy(s => new { s.SinifDuzeyi, s.Sube })
                .OrderBy(g => g.Key.SinifDuzeyi, StringComparer.OrdinalIgnoreCase)
                .ThenBy(g => g.Key.Sube, StringComparer.OrdinalIgnoreCase)
                .Select(g => new YaziliBranchViewModel
                {
                    SinifDuzeyi = g.Key.SinifDuzeyi,
                    Sube = g.Key.Sube,
                    BranchKey = $"{g.Key.SinifDuzeyi}-{g.Key.Sube}",
                    StudentCount = g.Count(),
                    ParticipatingCount = g.Count(o => o.SinavlaraKatilacak),
                    Alans = g.Select(o => o.Alan).Where(a => !string.IsNullOrEmpty(a) && a != "YOK").Distinct().ToList()
                })
                .ToList();

            ViewBag.Exam = exam;
            ViewBag.Rooms = rooms;
            ViewBag.CurrentRooms = currentRooms;
            ViewBag.Branches = branches;
            ViewBag.HasSeating = await _context.PlannerSeatings.AnyAsync(s => s.PlannerExamId == id);

            return View();
        }

        // POST: /Planner/PlaceYaziliStudents
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> PlaceYaziliStudents(
            int examId,
            List<int> selectedRoomIds,
            List<string> selectedBranches,
            List<string> branchKeys,
            List<string> branchLessons,
            string participationFilter,
            string placementType,
            bool isButterfly)
        {
            var exam = await _context.PlannerExams.FindAsync(examId);
            if (exam == null) return NotFound();

            if (selectedRoomIds == null || !selectedRoomIds.Any())
            {
                TempData["ErrorMessage"] = "En az bir salon seçmelisiniz.";
                return RedirectToAction(nameof(ConfigureYaziliExam), new { id = examId });
            }

            if (selectedBranches == null || !selectedBranches.Any())
            {
                TempData["ErrorMessage"] = "En az bir şube seçmelisiniz.";
                return RedirectToAction(nameof(ConfigureYaziliExam), new { id = examId });
            }

            // Build lesson map per branch
            var lessonMap = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            if (branchKeys != null && branchLessons != null)
            {
                for (int i = 0; i < Math.Min(branchKeys.Count, branchLessons.Count); i++)
                {
                    var key = branchKeys[i];
                    var lesson = branchLessons[i]?.Trim();
                    if (!string.IsNullOrEmpty(key))
                    {
                        lessonMap[key] = string.IsNullOrWhiteSpace(lesson) ? "Yazılı" : lesson;
                    }
                }
            }

            var rooms = await _context.PlannerRooms.Where(r => selectedRoomIds.Contains(r.Id)).ToListAsync();
            var totalCapacity = rooms.Sum(r => r.Capacity);

            var allStudents = await _context.Ogrenciler.ToListAsync();
            var candidateStudents = allStudents
                .Where(s => selectedBranches.Contains($"{s.SinifDuzeyi}-{s.Sube}"))
                .ToList();

            if (participationFilter == "sadeceKatilacaklar")
            {
                candidateStudents = candidateStudents.Where(s => s.SinavlaraKatilacak).ToList();
            }

            if (!candidateStudents.Any())
            {
                TempData["ErrorMessage"] = "Seçilen şubelerde kriterlere uygun öğrenci bulunamadı.";
                return RedirectToAction(nameof(ConfigureYaziliExam), new { id = examId });
            }

            if (candidateStudents.Count > totalCapacity)
            {
                TempData["ErrorMessage"] = $"Öğrenci sayısı ({candidateStudents.Count}) seçilen salonların toplam kapasitesini ({totalCapacity}) aşıyor. Lütfen daha fazla salon seçin.";
                return RedirectToAction(nameof(ConfigureYaziliExam), new { id = examId });
            }

            // Shuffling
            var random = new Random();
            var shuffledStudents = candidateStudents.OrderBy(x => random.Next()).ToList();

            // Butterfly seating for written exams: Interleave across lessons / grades
            if (isButterfly)
            {
                var groups = shuffledStudents
                    .GroupBy(s => $"{lessonMap.GetValueOrDefault($"{s.SinifDuzeyi}-{s.Sube}", "Yazılı")}_{s.SinifDuzeyi}")
                    .ToDictionary(g => g.Key, g => new Queue<Ogrenci>(g));

                var interleaved = new List<Ogrenci>();
                while (groups.Any(kvp => kvp.Value.Count > 0))
                {
                    foreach (var key in groups.Keys.ToList())
                    {
                        var q = groups[key];
                        if (q.Count > 0)
                        {
                            interleaved.Add(q.Dequeue());
                        }
                    }
                }
                shuffledStudents = interleaved;
            }

            // Clear old assignments
            var oldSeatings = await _context.PlannerSeatings.Where(s => s.PlannerExamId == examId).ToListAsync();
            _context.PlannerSeatings.RemoveRange(oldSeatings);

            var oldRooms = await _context.PlannerExamRooms.Where(er => er.PlannerExamId == examId).ToListAsync();
            _context.PlannerExamRooms.RemoveRange(oldRooms);

            // Add selected room mappings
            foreach (var rId in selectedRoomIds)
            {
                _context.PlannerExamRooms.Add(new PlannerExamRoom
                {
                    PlannerExamId = examId,
                    PlannerRoomId = rId
                });
            }

            // Calculate room targets
            var roomTargets = new Dictionary<int, int>();
            foreach (var r in rooms) roomTargets[r.Id] = 0;

            if (placementType == "homogeneous")
            {
                double ratio = (double)shuffledStudents.Count / totalCapacity;
                int allocated = 0;
                var roomFractions = new List<(int RoomId, double Fraction)>();
                foreach (var r in rooms)
                {
                    double exact = r.Capacity * ratio;
                    int target = (int)Math.Floor(exact);
                    roomTargets[r.Id] = target;
                    allocated += target;
                    roomFractions.Add((r.Id, exact - target));
                }

                var remaining = shuffledStudents.Count - allocated;
                foreach (var item in roomFractions.OrderByDescending(f => f.Fraction))
                {
                    if (remaining <= 0) break;
                    var room = rooms.First(r => r.Id == item.RoomId);
                    if (roomTargets[room.Id] < room.Capacity)
                    {
                        roomTargets[room.Id]++;
                        remaining--;
                    }
                }

                remaining = shuffledStudents.Count - roomTargets.Values.Sum();
                if (remaining > 0)
                {
                    foreach (var r in rooms.OrderByDescending(r => r.Capacity))
                    {
                        if (remaining <= 0) break;
                        int space = r.Capacity - roomTargets[r.Id];
                        int toAssign = Math.Min(space, remaining);
                        roomTargets[r.Id] += toAssign;
                        remaining -= toAssign;
                    }
                }
            }
            else
            {
                int remaining = shuffledStudents.Count;
                foreach (var r in rooms.OrderBy(r => r.RoomName))
                {
                    int toAssign = Math.Min(r.Capacity, remaining);
                    roomTargets[r.Id] = toAssign;
                    remaining -= toAssign;
                }
            }

            // Create Seatings
            int studentIdx = 0;
            foreach (var room in rooms.OrderBy(r => r.RoomName))
            {
                int targetCount = roomTargets[room.Id];
                for (int seatNum = 1; seatNum <= targetCount; seatNum++)
                {
                    if (studentIdx >= shuffledStudents.Count) break;

                    var student = shuffledStudents[studentIdx];
                    var branchKey = $"{student.SinifDuzeyi}-{student.Sube}";
                    var ders = lessonMap.GetValueOrDefault(branchKey, "Yazılı");

                    var seating = new PlannerSeating
                    {
                        PlannerExamId = examId,
                        OgrenciNo = student.OgrenciNo,
                        AdSoyad = student.AdSoyad,
                        SinifDuzeyi = student.SinifDuzeyi,
                        Sube = student.Sube,
                        RoomName = room.RoomName,
                        SeatNumber = seatNum,
                        Sira = seatNum,
                        Ders = ders,
                        Alan = student.Alan
                    };

                    _context.PlannerSeatings.Add(seating);
                    studentIdx++;
                }
            }

            await _context.SaveChangesAsync();
            TempData["SuccessMessage"] = "Yazılı sınav oturma planı başarıyla oluşturuldu.";
            return RedirectToAction(nameof(SeatingDetails), new { id = examId });
        }

        #endregion
    }

    public class YaziliBranchViewModel
    {
        public string SinifDuzeyi { get; set; } = "";
        public string Sube { get; set; } = "";
        public string BranchKey { get; set; } = "";
        public int StudentCount { get; set; }
        public int ParticipatingCount { get; set; }
        public List<string> Alans { get; set; } = new();
    }
}
