using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using yoklamaWeb.Data;
using yoklamaWeb.Models;

namespace yoklamaWeb.Controllers
{
    [Authorize(Roles = "Yoklamaci")]
    [Route("Yoklamaci")]
    public class YoklamaciController : Controller
    {
        private readonly AppDbContext _context;
        private readonly UserManager<IdentityUser> _userManager;

        public YoklamaciController(AppDbContext context, UserManager<IdentityUser> userManager)
        {
            _context = context;
            _userManager = userManager;
        }

        // GET /Yoklamaci — Yoklamacıya atanmış sınavların listesi
        [HttpGet("")]
        [HttpGet("Index")]
        public async Task<IActionResult> Index()
        {
            var userId = _userManager.GetUserId(User);
            if (userId == null) return Challenge();

            var now = DateTime.UtcNow;

            var assignments = await _context.TemporaryProctors
                .Include(tp => tp.Exam)
                .Where(tp => tp.UserId == userId)
                .OrderBy(tp => tp.Exam.ApplicationDate)
                .ToListAsync();

            var viewModel = assignments.Select(tp =>
            {
                // Sınavın geçerlilik aralığını hesapla
                var start = tp.ValidFrom.Date;
                if (tp.StartTime.HasValue)
                    start = tp.ValidFrom.Date + tp.StartTime.Value;

                var end = tp.ValidTo.Date;
                if (tp.EndTime.HasValue)
                    end = tp.ValidTo.Date + tp.EndTime.Value;
                else
                    end = tp.ValidTo.Date.AddDays(1).AddTicks(-1);

                return new YoklamaciExamItemViewModel
                {
                    ExamId = tp.ExamId,
                    ExamName = tp.Exam.Name,
                    ApplicationDate = tp.Exam.ApplicationDate,
                    Room = tp.Room,
                    ValidFrom = tp.ValidFrom,
                    ValidTo = tp.ValidTo,
                    StartTime = tp.StartTime,
                    EndTime = tp.EndTime,
                    IsAccessible = now >= start && now <= end
                };
            }).ToList();

            return View(viewModel);
        }

        // GET /Yoklamaci/TakeAttendance/5?sortBy=Sira&filterStatus=Tumu
        [HttpGet("TakeAttendance/{examId:int}")]
        public async Task<IActionResult> TakeAttendance(int examId,
            string sortBy = "Sira", string filterStatus = "Tumu")
        {
            var userId = _userManager.GetUserId(User);
            if (userId == null) return Challenge();

            var assignment = await _context.TemporaryProctors
                .Include(tp => tp.Exam)
                .FirstOrDefaultAsync(tp => tp.ExamId == examId && tp.UserId == userId);

            if (assignment == null)
                return Forbid(); // Bu sınava yetkisi yok

            // Zaman kontrolü
            var now = DateTime.UtcNow;
            
            var start = assignment.ValidFrom.Date;
            if (assignment.StartTime.HasValue)
                start = assignment.ValidFrom.Date + assignment.StartTime.Value;

            var end = assignment.ValidTo.Date;
            if (assignment.EndTime.HasValue)
                end = assignment.ValidTo.Date + assignment.EndTime.Value;
            else
                end = assignment.ValidTo.Date.AddDays(1).AddTicks(-1);

            bool isTimeValid = now >= start && now <= end;

            // Salonun koltuklarını ve öğrencilerini çek
            var seats = await _context.ExamSeats
                .Include(es => es.Ogrenci)
                .Where(es => es.ExamId == examId && es.SalonAdi == assignment.Room)
                .ToListAsync();

            // Filtrele
            if (filterStatus != "Tumu")
            {
                if (Enum.TryParse<AttendanceStatus>(filterStatus, out var statusFilter))
                    seats = seats.Where(s => s.AttendanceStatus == statusFilter).ToList();
            }

            // Sırala
            seats = sortBy switch
            {
                "AdSoyad" => seats.OrderBy(s => s.Ogrenci?.AdSoyad).ToList(),
                "OgrenciNo" => seats.OrderBy(s => s.OgrenciNo).ToList(),
                "Sinif" => seats.OrderBy(s => s.Ogrenci?.SinifDuzeyi).ThenBy(s => s.Ogrenci?.Sube).ToList(),
                "Sira" => seats.OrderBy(s => s.Sira).ThenBy(s => s.SeatNumber).ToList(),
                _ => seats.OrderBy(s => s.Sira).ThenBy(s => s.SeatNumber).ToList()
            };

            var rows = seats.Select(s => new AttendanceSeatRow
            {
                SeatId = s.Id,
                OgrenciNo = s.OgrenciNo,
                AdSoyad = s.Ogrenci?.AdSoyad ?? "-",
                SinifDuzeyi = s.Ogrenci?.SinifDuzeyi ?? "-",
                Sube = s.Ogrenci?.Sube ?? "-",
                SeatNumber = s.SeatNumber,
                Sira = s.Sira,
                Status = s.AttendanceStatus,
                Not = s.Note ?? string.Empty
            }).ToList();

            var vm = new TakeAttendanceViewModel
            {
                ExamId = examId,
                ExamName = assignment.Exam.Name,
                ApplicationDate = assignment.Exam.ApplicationDate,
                Room = assignment.Room,
                Seats = rows,
                SortBy = sortBy,
                FilterStatus = filterStatus,
                IsTimeValid = isTimeValid,
                ProctorName = assignment.ProctorName,
                ExamNote = assignment.ExamNote
            };

            return View(vm);
        }

        // POST /Yoklamaci/SaveAttendance
        [HttpPost("SaveAttendance")]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> SaveAttendance(SaveAttendanceViewModel model)
        {
            var userId = _userManager.GetUserId(User);
            if (userId == null) return Challenge();

            // Yetki kontrolü
            var assignment = await _context.TemporaryProctors
                .Include(tp => tp.Exam)
                .FirstOrDefaultAsync(tp => tp.ExamId == model.ExamId && tp.UserId == userId);
            if (assignment == null) return Forbid();

            // Zaman kontrolü (Güvenlik)
            var now = DateTime.UtcNow;
            
            var start = assignment.ValidFrom.Date;
            if (assignment.StartTime.HasValue)
                start = assignment.ValidFrom.Date + assignment.StartTime.Value;

            var end = assignment.ValidTo.Date;
            if (assignment.EndTime.HasValue)
                end = assignment.ValidTo.Date + assignment.EndTime.Value;
            else
                end = assignment.ValidTo.Date.AddDays(1).AddTicks(-1);

            if (now < start || now > end)
            {
                TempData["ErrorMessage"] = "Yoklama geçerlilik saat aralığı dışında olduğundan kaydedilemedi.";
                return RedirectToAction(nameof(TakeAttendance), new { examId = model.ExamId });
            }

            if (string.IsNullOrWhiteSpace(model.YoklamaciIsmi))
            {
                TempData["ErrorMessage"] = "Yoklamacı ismi zorunludur.";
                return RedirectToAction(nameof(TakeAttendance), new { examId = model.ExamId });
            }

            // Yoklamacı adı ve sınav notunu güncelle
            assignment.ProctorName = model.YoklamaciIsmi;
            assignment.ExamNote = model.SinavNotu;

            // Her koltuk kaydını güncelle
            foreach (var row in model.Seats)
            {
                var seat = await _context.ExamSeats.FindAsync(row.SeatId);
                if (seat == null || seat.ExamId != model.ExamId) continue;

                seat.AttendanceStatus = row.Status;
                seat.Note = row.Not;
                seat.UpdatedAt = DateTime.UtcNow;
            }

            await _context.SaveChangesAsync();

            TempData["SuccessMessage"] = $"Yoklama başarıyla kaydedildi. Yoklamacı: {model.YoklamaciIsmi}" +
                (!string.IsNullOrWhiteSpace(model.SinavNotu) ? $" | Not: {model.SinavNotu}" : "");

            return RedirectToAction(nameof(Index));
        }
    }
}
