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

            var examIds = exams.Select(e => e.Id).ToList();
            var allSeats = await _context.ExamSeats
                .Where(es => examIds.Contains(es.ExamId))
                .ToListAsync();

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

                var examSeats = allSeats.Where(s => s.ExamId == e.Id).ToList();

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
                    IsAccessible = now >= start && now <= end,
                    TotalCount = examSeats.Count,
                    PresentCount = examSeats.Count(s => s.AttendanceStatus == AttendanceStatus.Katildi),
                    AbsentCount = examSeats.Count(s => s.AttendanceStatus == AttendanceStatus.Katilmadi),
                    LateCount = examSeats.Count(s => s.AttendanceStatus == AttendanceStatus.Gec),
                    PendingCount = examSeats.Count(s => s.AttendanceStatus == AttendanceStatus.KontrolEdilmedi)
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
                    Count = g.Count(),
                    Present = g.Count(es => es.AttendanceStatus == AttendanceStatus.Katildi),
                    Absent = g.Count(es => es.AttendanceStatus == AttendanceStatus.Katilmadi),
                    Late = g.Count(es => es.AttendanceStatus == AttendanceStatus.Gec),
                    Pending = g.Count(es => es.AttendanceStatus == AttendanceStatus.KontrolEdilmedi)
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
                ProctorName = proctors.FirstOrDefault(p => p.Room == rg.RoomName)?.ProctorName,
                PresentCount = rg.Present,
                AbsentCount = rg.Absent,
                LateCount = rg.Late,
                PendingCount = rg.Pending
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
            TemporaryProctor? proctorAssignment = null;
            if (!string.IsNullOrEmpty(room) && room != "Tümü")
            {
                proctorAssignment = await _context.TemporaryProctors
                    .FirstOrDefaultAsync(tp => tp.ExamId == examId && tp.Room == room);
            }

            // Salonun koltuklarını ve öğrencilerini çek (eğer room boşsa tüm salonları çek)
            var seatsQuery = _context.ExamSeats
                .Include(es => es.Ogrenci)
                .Where(es => es.ExamId == examId);

            if (!string.IsNullOrEmpty(room) && room != "Tümü")
            {
                seatsQuery = seatsQuery.Where(es => es.SalonAdi == room);
            }

            var seats = await seatsQuery.ToListAsync();

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
                Not = s.Note ?? string.Empty,
                SalonName = s.SalonAdi ?? string.Empty
            }).ToList();

            var vm = new SuperYoklamaciTakeAttendanceViewModel
            {
                ExamId = examId,
                ExamName = exam.Name,
                ApplicationDate = exam.ApplicationDate,
                Room = room ?? "Tümü",
                Seats = rows,
                SortBy = sortBy,
                FilterStatus = filterStatus,
                IsTimeValid = isTimeValid,
                ProctorName = proctorAssignment?.ProctorName ?? "Süper Yoklamacı",
                ExamNote = proctorAssignment?.ExamNote
            };

            return View(vm);
        }

        // POST /SuperYoklamaci/SaveAttendance
        [HttpPost("SaveAttendance")]
        [ValidateAntiForgeryToken]
        [RequestFormLimits(ValueCountLimit = 8192)]
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

            var redirectRoom = model.Room == "Tümü" ? null : model.Room;

            if (now < start || now > end)
            {
                TempData["ErrorMessage"] = "Yoklama geçerlilik saat aralığı dışında olduğundan kaydedilemedi.";
                return RedirectToAction(nameof(TakeAttendance), new { examId = model.ExamId, room = redirectRoom });
            }

            if (string.IsNullOrWhiteSpace(model.YoklamaciIsmi))
            {
                TempData["ErrorMessage"] = "Yoklamacı ismi zorunludur.";
                return RedirectToAction(nameof(TakeAttendance), new { examId = model.ExamId, room = redirectRoom });
            }

            // Sadece durumu veya notu değiştirilmiş öğrencileri tespit et ve güncelle
            var modifiedRooms = new HashSet<string>();
            int updateCount = 0;

            if (model.Seats != null)
            {
                foreach (var row in model.Seats)
                {
                    var seat = await _context.ExamSeats.FindAsync(row.SeatId);
                    if (seat == null || seat.ExamId != model.ExamId) continue;

                    if (seat.AttendanceStatus != row.Status || seat.Note != row.Not)
                    {
                        seat.AttendanceStatus = row.Status;
                        seat.Note = row.Not;
                        seat.UpdatedAt = DateTime.UtcNow;
                        updateCount++;

                        if (!string.IsNullOrEmpty(seat.SalonAdi))
                        {
                            modifiedRooms.Add(seat.SalonAdi);
                        }
                    }
                }
            }

            // Sadece durumunu değiştirdiği öğrencilerin salonlarında TemporaryProctor güncelleyelim
            if (modifiedRooms.Any())
            {
                var defaultUserId = _userManager.GetUserId(User) ?? "system";
                foreach (var roomName in modifiedRooms)
                {
                    var proctorAssignment = await _context.TemporaryProctors
                        .FirstOrDefaultAsync(tp => tp.ExamId == model.ExamId && tp.Room == roomName);

                    if (proctorAssignment != null)
                    {
                        proctorAssignment.ProctorName = model.YoklamaciIsmi;
                        if (!string.IsNullOrWhiteSpace(model.SinavNotu))
                        {
                            proctorAssignment.ExamNote = model.SinavNotu;
                        }
                    }
                    else
                    {
                        var newAssignment = new TemporaryProctor
                        {
                            ExamId = model.ExamId,
                            Room = roomName,
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
                }
            }

            await _context.SaveChangesAsync();

            TempData["SuccessMessage"] = $"Yoklama başarıyla kaydedildi. {updateCount} öğrenci güncellendi. Yoklamacı: {model.YoklamaciIsmi}";

            return RedirectToAction(nameof(TakeAttendance), new { examId = model.ExamId, room = redirectRoom });
        }
    }
}
