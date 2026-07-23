using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using yoklamaWeb.Data;
using yoklamaWeb.Models;

namespace yoklamaWeb.Controllers
{
    [Authorize(Roles = "SuperYoklamaci")]
    [Route("SuperYoklamaci")]
    public class SuperYoklamaciController : Controller
    {
        private readonly AppDbContext _context;
        private readonly UserManager<IdentityUser> _userManager;

        public SuperYoklamaciController(AppDbContext context, UserManager<IdentityUser> userManager)
        {
            _context = context;
            _userManager = userManager;
        }

        // GET /SuperYoklamaci
        [HttpGet("")]
        [HttpGet("Index")]
        public async Task<IActionResult> Index()
        {
            var now = DateTime.UtcNow;
            var exams = await _context.Exams.OrderBy(e => e.ApplicationDate).ToListAsync();

            var viewModel = exams.Select(e =>
            {
                var start = e.ValidFrom.Date;
                if (e.StartTime.HasValue)
                    start = e.ValidFrom.Date + e.StartTime.Value;

                var end = e.ValidTo.Date;
                if (e.EndTime.HasValue)
                    end = e.ValidTo.Date + e.EndTime.Value;
                else
                    end = e.ValidTo.Date.AddDays(1).AddTicks(-1);

                return new SuperYoklamaciExamItemViewModel
                {
                    ExamId = e.Id,
                    ExamName = e.Name,
                    ApplicationDate = e.ApplicationDate,
                    BuildingNumber = e.BuildingNumber,
                    ValidFrom = e.ValidFrom,
                    ValidTo = e.ValidTo,
                    StartTime = e.StartTime,
                    EndTime = e.EndTime,
                    IsAccessible = now >= start && now <= end
                };
            }).ToList();

            return View(viewModel);
        }

        // GET /SuperYoklamaci/Rooms/5
        [HttpGet("Rooms/{examId:int}")]
        public async Task<IActionResult> Rooms(int examId)
        {
            var exam = await _context.Exams.FindAsync(examId);
            if (exam == null) return NotFound();

            // Sınavda atanan tüm salonları ve öğrenci sayılarını çek
            var roomGroups = await _context.ExamSeats
                .Where(es => es.ExamId == examId)
                .GroupBy(es => es.SalonAdi)
                .Select(g => new
                {
                    RoomName = g.Key,
                    Count = g.Count()
                })
                .ToListAsync();

            // Atanmış olan yoklamacı bilgilerini (ProctorName) çekmek için proctor'ları bulalım
            var proctors = await _context.TemporaryProctors
                .Where(tp => tp.ExamId == examId)
                .ToListAsync();

            var roomItems = roomGroups.Select(rg => new SuperYoklamaciRoomItem
            {
                RoomName = rg.RoomName,
                StudentCount = rg.Count,
                ProctorName = proctors.FirstOrDefault(p => p.Room == rg.RoomName)?.ProctorName
            }).ToList();

            var viewModel = new SuperYoklamaciRoomsViewModel
            {
                ExamId = examId,
                ExamName = exam.Name,
                ApplicationDate = exam.ApplicationDate,
                Rooms = roomItems
            };

            return View(viewModel);
        }

        // GET /SuperYoklamaci/TakeAttendance/5?room=A-101
        [HttpGet("TakeAttendance/{examId:int}")]
        public async Task<IActionResult> TakeAttendance(int examId, string room,
            string sortBy = "Sira", string filterStatus = "Tumu")
        {
            var exam = await _context.Exams.FindAsync(examId);
            if (exam == null) return NotFound();

            if (string.IsNullOrEmpty(room))
            {
                return RedirectToAction(nameof(Rooms), new { examId = examId });
            }

            // Zaman kontrolü
            var now = DateTime.UtcNow;
            var start = exam.ValidFrom.Date;
            if (exam.StartTime.HasValue)
                start = exam.ValidFrom.Date + exam.StartTime.Value;

            var end = exam.ValidTo.Date;
            if (exam.EndTime.HasValue)
                end = exam.ValidTo.Date + exam.EndTime.Value;
            else
                end = exam.ValidTo.Date.AddDays(1).AddTicks(-1);

            bool isTimeValid = now >= start && now <= end;

            // Salonun yoklamacısını veya notunu çek
            var proctorAssignment = await _context.TemporaryProctors
                .FirstOrDefaultAsync(tp => tp.ExamId == examId && tp.Room == room);

            // Salonun koltuklarını ve öğrencilerini çek
            var seats = await _context.ExamSeats
                .Include(es => es.Ogrenci)
                .Where(es => es.ExamId == examId && es.SalonAdi == room)
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

            var vm = new SuperYoklamaciTakeAttendanceViewModel
            {
                ExamId = examId,
                ExamName = exam.Name,
                ApplicationDate = exam.ApplicationDate,
                Room = room,
                Seats = rows,
                SortBy = sortBy,
                FilterStatus = filterStatus,
                IsTimeValid = isTimeValid,
                ProctorName = proctorAssignment?.ProctorName,
                ExamNote = proctorAssignment?.ExamNote
            };

            return View(vm);
        }

        // POST /SuperYoklamaci/SaveAttendance
        [HttpPost("SaveAttendance")]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> SaveAttendance(SaveAttendanceViewModel model)
        {
            var exam = await _context.Exams.FindAsync(model.ExamId);
            if (exam == null) return NotFound();

            // Zaman kontrolü (Güvenlik)
            var now = DateTime.UtcNow;
            var start = exam.ValidFrom.Date;
            if (exam.StartTime.HasValue)
                start = exam.ValidFrom.Date + exam.StartTime.Value;

            var end = exam.ValidTo.Date;
            if (exam.EndTime.HasValue)
                end = exam.ValidTo.Date + exam.EndTime.Value;
            else
                end = exam.ValidTo.Date.AddDays(1).AddTicks(-1);

            if (now < start || now > end)
            {
                TempData["ErrorMessage"] = "Yoklama geçerlilik saat aralığı dışında olduğundan kaydedilemedi.";
                return RedirectToAction(nameof(TakeAttendance), new { examId = model.ExamId, room = model.Room });
            }

            if (string.IsNullOrWhiteSpace(model.YoklamaciIsmi))
            {
                TempData["ErrorMessage"] = "Yoklamacı ismi zorunludur.";
                return RedirectToAction(nameof(TakeAttendance), new { examId = model.ExamId, room = model.Room });
            }

            // Sınavın TemporaryProctor kaydını bul veya yoksa oluştur (Süper yoklamacı her salona müdahale edebilir)
            var proctorAssignment = await _context.TemporaryProctors
                .FirstOrDefaultAsync(tp => tp.ExamId == model.ExamId && tp.Room == model.Room);

            if (proctorAssignment != null)
            {
                proctorAssignment.ProctorName = model.YoklamaciIsmi;
                proctorAssignment.ExamNote = model.SinavNotu;
            }
            else
            {
                // Yoklamacı ataması yapılmamış olsa bile süper yoklamacının ismini ve notunu saklamak için
                // sahte bir user id ile assignment kaydı oluşturuyoruz
                var defaultUserId = _userManager.GetUserId(User) ?? "system";
                var newAssignment = new TemporaryProctor
                {
                    ExamId = model.ExamId,
                    Room = model.Room,
                    UserId = defaultUserId,
                    Password = "N/A",
                    ValidFrom = exam.ValidFrom,
                    ValidTo = exam.ValidTo,
                    StartTime = exam.StartTime,
                    EndTime = exam.EndTime,
                    ProctorName = model.YoklamaciIsmi,
                    ExamNote = model.SinavNotu
                };
                _context.TemporaryProctors.Add(newAssignment);
            }

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

            TempData["SuccessMessage"] = $"Yoklama başarıyla kaydedildi. Salon: {model.Room} | Yoklamacı: {model.YoklamaciIsmi}";

            return RedirectToAction(nameof(Rooms), new { examId = model.ExamId });
        }
    }
}
