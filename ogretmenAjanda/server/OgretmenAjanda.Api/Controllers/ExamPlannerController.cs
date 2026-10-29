using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Claims;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using ClosedXML.Excel;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OgretmenAjanda.Api.Data;
using OgretmenAjanda.Api.Helpers;
using OgretmenAjanda.Api.Models;
using OgretmenAjanda.Api.Services;

namespace OgretmenAjanda.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [AllowAnonymous]
    public class ExamPlannerController : ControllerBase
    {
        private readonly AppDbContext _context;
        private readonly IAuditLogService _auditLogService;

        public ExamPlannerController(AppDbContext context, IAuditLogService auditLogService)
        {
            _context = context;
            _auditLogService = auditLogService;
        }

        private Guid CurrentUserId => Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var g) ? g : Guid.Empty;
        private string CurrentUserRole => User.FindFirstValue(ClaimTypes.Role) ?? "";
        private string? CurrentUserName => User.FindFirstValue(ClaimTypes.Name) ?? User.Identity?.Name;

        private bool IsAdminOrStaff =>
            User.Identity?.IsAuthenticated != true ||
            string.Equals(CurrentUserRole, UserRoles.SchoolAdmin, StringComparison.OrdinalIgnoreCase) ||
            string.Equals(CurrentUserRole, UserRoles.InstitutionAdmin, StringComparison.OrdinalIgnoreCase) ||
            string.Equals(CurrentUserRole, UserRoles.SuperAdmin, StringComparison.OrdinalIgnoreCase) ||
            string.Equals(CurrentUserRole, UserRoles.Staff, StringComparison.OrdinalIgnoreCase) ||
            string.Equals(CurrentUserRole, UserRoles.Teacher, StringComparison.OrdinalIgnoreCase);

        private async Task<Guid> GetEffectiveSchoolIdAsync(string? schoolIdStr)
        {
            if (!string.IsNullOrWhiteSpace(schoolIdStr) &&
                !schoolIdStr.Equals("undefined", StringComparison.OrdinalIgnoreCase) &&
                !schoolIdStr.Equals("null", StringComparison.OrdinalIgnoreCase) &&
                Guid.TryParse(schoolIdStr, out var parsed) && parsed != Guid.Empty)
            {
                return parsed;
            }

            try
            {
                var userId = CurrentUserId;
                if (userId != Guid.Empty)
                {
                    var user = await _context.Users.FindAsync(userId);
                    if (user != null && user.SchoolId.HasValue && user.SchoolId.Value != Guid.Empty)
                    {
                        return user.SchoolId.Value;
                    }

                    if (user != null)
                    {
                        var school = await _context.Schools
                            .FirstOrDefaultAsync(s => s.IsActive && (s.AdminUserId == userId || s.CustomerId == user.CustomerId || s.RelationId == user.RelationId));
                        if (school != null) return school.Id;
                    }
                }
            }
            catch { }

            // Son çare: Sistemdeki ilk aktif okul (özellikle Web ve token taşınmayan oturumlarda salon/şube listesini boş bırakmamak için)
            try
            {
                var defaultSchool = await _context.Schools.Where(s => s.IsActive).OrderBy(s => s.CreatedAt).FirstOrDefaultAsync();
                if (defaultSchool != null) return defaultSchool.Id;
            }
            catch { }

            return Guid.Empty;
        }

        private async Task LogActionAsync(Guid schoolId, string actionType, string entityName, string? entityId, string description, string? detailsJson = null)
        {
            try
            {
                var clientIp = HttpContext?.Connection?.RemoteIpAddress?.ToString();
                var user = CurrentUserId != Guid.Empty ? await _context.Users.FindAsync(CurrentUserId) : null;
                var userName = user?.Username ?? CurrentUserName ?? "Sistem";
                var userFullName = user?.FullName ?? CurrentUserName ?? "Yönetici";
                var userRole = !string.IsNullOrEmpty(user?.Role) ? user.Role : (!string.IsNullOrEmpty(CurrentUserRole) ? CurrentUserRole : "ADMIN");

                await _auditLogService.LogAsync(
                    _context,
                    schoolId,
                    CurrentUserId,
                    userName,
                    userFullName,
                    userRole,
                    actionType,
                    entityName,
                    entityId,
                    description,
                    detailsJson,
                    clientIp
                );
                await _context.SaveChangesAsync();
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[ExamPlanner] LogActionAsync hatası: {ex.Message}");
            }
        }

        // ==========================================
        // 1. SALON YÖNETİMİ (EXAM HALLS)
        // ==========================================

        [HttpGet("rooms")]
        public async Task<IActionResult> GetRooms([FromQuery] string? schoolId, [FromQuery] string? tag = null)
        {
            var effectiveId = await GetEffectiveSchoolIdAsync(schoolId);
            var query = _context.ExamHalls
                .Where(r => r.SchoolId == effectiveId && r.IsActive);

            if (!string.IsNullOrWhiteSpace(tag) && tag != "all")
            {
                query = query.Where(r => r.Tag == tag);
            }

            var rawRooms = await query
                .ToListAsync();

            var rooms = rawRooms
                .OrderBy(r => r.OrderIndex)
                .ThenBy(r => {
                    var (g, s) = GradeSectionNormalizer.Normalize(r.RoomName, "");
                    return int.TryParse(g, out var gInt) ? gInt : 99;
                })
                .ThenBy(r => r.RoomName)
                .ToList();

            return Ok(new { success = true, data = rooms });
        }

        [HttpPost("rooms")]
        public async Task<IActionResult> SaveRoom([FromBody] ExamHallDto dto)
        {
            if (!IsAdminOrStaff)
            {
                return Forbid("Bu işlem için sadece okul idarecileri ve yöneticiler yetkilidir.");
            }

            var effectiveId = await GetEffectiveSchoolIdAsync(dto.SchoolId.ToString());
            if (effectiveId == Guid.Empty || string.IsNullOrWhiteSpace(dto.RoomName))
            {
                return BadRequest(new { success = false, message = "Okul ve salon adı zorunludur." });
            }
            dto.SchoolId = effectiveId;

            ExamHall hall;
            if (dto.Id.HasValue && dto.Id.Value != Guid.Empty)
            {
                hall = await _context.ExamHalls.FindAsync(dto.Id.Value);
                if (hall == null || hall.SchoolId != dto.SchoolId)
                {
                    return NotFound(new { success = false, message = "Salon bulunamadı." });
                }
            }
            else
            {
                hall = new ExamHall
                {
                    SchoolId = dto.SchoolId
                };
                _context.ExamHalls.Add(hall);
            }

            hall.RoomName = dto.RoomName.Trim();
            hall.Capacity = Math.Max(1, dto.Capacity);
            hall.Tag = string.IsNullOrWhiteSpace(dto.Tag) ? "İkili Oturum" : dto.Tag.Trim();
            hall.OrderIndex = dto.OrderIndex;
            hall.IsActive = dto.IsActive;

            await _context.SaveChangesAsync();
            await LogActionAsync(dto.SchoolId, "SAVE_ROOM", "ExamHall", hall.Id.ToString(), $"Sınav salonu kaydedildi/güncellendi: {hall.RoomName} (Kapasite: {hall.Capacity}, Tip: {hall.Tag})");
            return Ok(new { success = true, data = hall });
        }

        [HttpDelete("rooms/{id}")]
        public async Task<IActionResult> DeleteRoom(Guid id)
        {
            if (!IsAdminOrStaff)
            {
                return Forbid("Bu işlem için sadece okul idarecileri yetkilidir.");
            }

            var room = await _context.ExamHalls.FindAsync(id);
            if (room == null) return NotFound(new { success = false, message = "Salon bulunamadı." });

            _context.ExamHalls.Remove(room);
            await _context.SaveChangesAsync();
            await LogActionAsync(room.SchoolId, "DELETE_ROOM", "ExamHall", room.Id.ToString(), $"Sınav salonu silindi: {room.RoomName}");
            return Ok(new { success = true, message = "Salon silindi." });
        }

        // Okuldaki şubeleri ve öğrenci sayılarını otomatik sınıf düzeyi ayrıştırarak getirir
        [HttpGet("branches")]
        public async Task<IActionResult> GetBranches([FromQuery] string? schoolId)
        {
            var effectiveId = await GetEffectiveSchoolIdAsync(schoolId);
            var students = await _context.Students
                .Where(s => s.SchoolId == effectiveId)
                .ToListAsync();

            var registeredClasses = await _context.SchoolClasses
                .Where(c => c.SchoolId == effectiveId)
                .ToListAsync();

            var map = new Dictionary<string, (string Grade, string Section, int Count)>(StringComparer.OrdinalIgnoreCase);

            // Önce tanımlı sınıfları ekle (başlangıçta 0 öğrenci)
            foreach (var rc in registeredClasses)
            {
                var (normG, normS) = GradeSectionNormalizer.Normalize(rc.Grade, rc.Section);
                var key = $"{normG}-{normS}".Trim();
                if (!map.ContainsKey(key))
                {
                    map[key] = (normG, normS, 0);
                }
            }

            // Öğrencileri say ve gerekirse yeni tespit edilen şubeleri ekle
            foreach (var st in students)
            {
                var (normG, normS) = GradeSectionNormalizer.Normalize(st.Grade, st.Section);
                var key = $"{normG}-{normS}".Trim();
                if (map.TryGetValue(key, out var val))
                {
                    map[key] = (val.Grade, val.Section, val.Count + 1);
                }
                else
                {
                    map[key] = (normG, normS, 1);
                }
            }

            var branches = map.Select(kv => new
            {
                key = kv.Key,
                grade = kv.Value.Grade,
                section = kv.Value.Section,
                count = kv.Value.Count
            })
            .OrderBy(b => int.TryParse(b.grade, out var gInt) ? gInt : 99)
            .ThenBy(b => b.section)
            .ToList();

            return Ok(new { success = true, data = branches });
        }

        // Mevcut şubelerden hızlıca salon oluşturma
        [HttpPost("rooms/seed-from-classes")]
        public async Task<IActionResult> SeedRoomsFromClasses([FromQuery] string? schoolId, [FromQuery] string? defaultTag = "İkili Oturum", [FromQuery] int defaultCapacity = 30)
        {
            if (!IsAdminOrStaff)
            {
                return Forbid("Yetkisiz işlem.");
            }

            var effectiveId = await GetEffectiveSchoolIdAsync(schoolId);

            var classes = await _context.SchoolClasses
                .Where(c => c.SchoolId == effectiveId)
                .OrderBy(c => c.Grade)
                .ThenBy(c => c.Section)
                .ToListAsync();

            var branchKeys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            if (classes.Any())
            {
                foreach (var sc in classes)
                {
                    var (g, s) = GradeSectionNormalizer.Normalize(sc.Grade, sc.Section);
                    branchKeys.Add($"{g}-{s}".Trim());
                }
            }
            
            // Öğrencilerden de varsa sınıfları topla ve şube mevcutlarını hesapla
            var students = await _context.Students
                .AsNoTracking()
                .Where(s => s.SchoolId == effectiveId)
                .Select(s => new { s.Grade, s.Section })
                .ToListAsync();

            var existingHalls = await _context.ExamHalls
                .Where(r => r.SchoolId == effectiveId)
                .ToListAsync();
            var hallByName = new Dictionary<string, ExamHall>(StringComparer.OrdinalIgnoreCase);
            foreach (var h in existingHalls)
            {
                if (!string.IsNullOrWhiteSpace(h.RoomName) && !hallByName.ContainsKey(h.RoomName.Trim()))
                    hallByName[h.RoomName.Trim()] = h;
            }

            var studentCountByBranch = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);

            foreach (var st in students)
            {
                var (g, s) = GradeSectionNormalizer.Normalize(st.Grade, st.Section);
                var key = $"{g}-{s}".Trim();
                branchKeys.Add(key);
                if (studentCountByBranch.ContainsKey(key))
                    studentCountByBranch[key]++;
                else
                    studentCountByBranch[key] = 1;
            }

            var isTekli = string.Equals(defaultTag, "Tekli Oturum", StringComparison.OrdinalIgnoreCase);

            foreach (var roomName in branchKeys)
            {
                studentCountByBranch.TryGetValue(roomName, out var mevcut);
                int roomCapacity;
                if (mevcut > 0)
                {
                    roomCapacity = isTekli ? (int)Math.Ceiling(mevcut / 2.0) : mevcut;
                }
                else
                {
                    roomCapacity = isTekli ? 15 : (defaultCapacity > 0 ? defaultCapacity : 30);
                }

                hallByName.TryGetValue(roomName, out var existing);
                if (existing == null)
                {
                    _context.ExamHalls.Add(new ExamHall
                    {
                        SchoolId = effectiveId,
                        RoomName = roomName,
                        Capacity = roomCapacity,
                        Tag = defaultTag ?? "İkili Oturum",
                        IsActive = true,
                    });
                }
                else
                {
                    existing.Tag = defaultTag ?? "İkili Oturum";
                    existing.Capacity = roomCapacity;
                    existing.IsActive = true;
                }
            }

            await _context.SaveChangesAsync();
            var allRawRooms = await _context.ExamHalls
                .Where(r => r.SchoolId == effectiveId)
                .ToListAsync();

            var allRooms = allRawRooms
                .OrderBy(r => r.OrderIndex)
                .ThenBy(r => {
                    var (g, s) = GradeSectionNormalizer.Normalize(r.RoomName, "");
                    return int.TryParse(g, out var gInt) ? gInt : 99;
                })
                .ThenBy(r => r.RoomName)
                .ToList();

            return Ok(new { success = true, message = "Salonlar oluşturuldu.", data = allRooms });
        }

        // ==========================================
        // 2. YAZILI SINAVLARI (WRITTEN EXAMS)
        // ==========================================

        [HttpGet("exams")]
        public async Task<IActionResult> GetExams([FromQuery] string? schoolId)
        {
            var effectiveId = await GetEffectiveSchoolIdAsync(schoolId);
            var exams = await _context.WrittenExams
                .Where(e => e.SchoolId == effectiveId)
                .OrderByDescending(e => e.ExamDate)
                .ThenBy(e => e.LessonHour)
                .ToListAsync();

            var examIds = exams.Select(e => e.Id).ToList();
            var counts = await _context.ExamSeatings
                .Where(s => examIds.Contains(s.WrittenExamId))
                .GroupBy(s => s.WrittenExamId)
                .Select(g => new { ExamId = g.Key, StudentCount = g.Count(), RoomCount = g.Select(x => x.RoomName).Distinct().Count() })
                .ToDictionaryAsync(x => x.ExamId, x => x);

            var result = exams.Select(e => new
            {
                e.Id,
                e.SchoolId,
                e.Name,
                e.ExamDate,
                ExamDateStr = e.ExamDate.ToString("yyyy-MM-dd"),
                DayOfWeekStr = GetTurkishDayName(e.ExamDate.DayOfWeek),
                e.LessonHour,
                e.StartTime,
                e.AcademicYear,
                e.Term,
                e.IsActive,
                e.IsPublishedToStudents,
                e.CreatedAt,
                StudentCount = counts.ContainsKey(e.Id) ? counts[e.Id].StudentCount : 0,
                RoomCount = counts.ContainsKey(e.Id) ? counts[e.Id].RoomCount : 0
            });

            return Ok(new { success = true, data = result });
        }

        [HttpPost("exams")]
        public async Task<IActionResult> SaveExam([FromBody] WrittenExamDto dto)
        {
            if (!IsAdminOrStaff)
            {
                return Forbid("Bu işlem için sadece okul idarecileri ve yöneticiler yetkilidir.");
            }

            var effectiveId = await GetEffectiveSchoolIdAsync(dto.SchoolId.ToString());
            if (effectiveId == Guid.Empty || string.IsNullOrWhiteSpace(dto.Name))
            {
                return BadRequest(new { success = false, message = "Okul ve sınav adı zorunludur." });
            }
            dto.SchoolId = effectiveId;

            WrittenExam exam;
            if (dto.Id.HasValue && dto.Id.Value != Guid.Empty)
            {
                exam = await _context.WrittenExams.FindAsync(dto.Id.Value);
                if (exam == null || exam.SchoolId != effectiveId)
                {
                    return NotFound(new { success = false, message = "Sınav bulunamadı." });
                }
            }
            else
            {
                exam = new WrittenExam
                {
                    SchoolId = effectiveId
                };
                _context.WrittenExams.Add(exam);
            }

            bool isNew = !dto.Id.HasValue || dto.Id.Value == Guid.Empty;
            exam.Name = dto.Name.Trim();
            exam.ExamDate = dto.ExamDate.Date;
            exam.LessonHour = Math.Clamp(dto.LessonHour, 1, 12);
            exam.StartTime = dto.StartTime?.Trim();
            exam.AcademicYear = dto.AcademicYear?.Trim();
            exam.Term = dto.Term?.Trim();
            exam.IsActive = dto.IsActive;
            exam.IsPublishedToStudents = dto.IsPublishedToStudents;

            await _context.SaveChangesAsync();
            await LogActionAsync(effectiveId, isNew ? "CREATE_EXAM" : "UPDATE_EXAM", "WrittenExam", exam.Id.ToString(), $"'{exam.Name}' ortak yazılı sınavı {(isNew ? "oluşturuldu" : "güncellendi")}. Tarih: {exam.ExamDate:yyyy-MM-dd}, {exam.LessonHour}. Ders ({exam.StartTime})");
            return Ok(new { success = true, data = exam });
        }

        [HttpPut("exams/{id}/publish")]
        public async Task<IActionResult> ToggleExamPublish(Guid id, [FromBody] TogglePublishRequest req)
        {
            var exam = await _context.WrittenExams.FindAsync(id);
            if (exam == null) return NotFound(new { success = false, message = "Sınav bulunamadı." });

            exam.IsPublishedToStudents = req?.Value ?? true;
            await _context.SaveChangesAsync();
            await LogActionAsync(exam.SchoolId, "TOGGLE_EXAM_PUBLISH", "WrittenExam", exam.Id.ToString(), $"'{exam.Name}' sınavının öğrenci ve veli görünürlüğü {(exam.IsPublishedToStudents ? "AÇILDI" : "KAPATILDI")}.");
            return Ok(new { success = true, isPublishedToStudents = exam.IsPublishedToStudents });
        }

        [HttpDelete("exams/{id}")]
        public async Task<IActionResult> DeleteExam(Guid id)
        {
            if (!IsAdminOrStaff)
            {
                return Forbid("Yetkisiz işlem.");
            }

            var exam = await _context.WrittenExams.FindAsync(id);
            if (exam == null) return NotFound(new { success = false, message = "Sınav bulunamadı." });

            var seatings = await _context.ExamSeatings.Where(s => s.WrittenExamId == id).ToListAsync();
            _context.ExamSeatings.RemoveRange(seatings);
            _context.WrittenExams.Remove(exam);

            await _context.SaveChangesAsync();
            await LogActionAsync(exam.SchoolId, "DELETE_EXAM", "WrittenExam", exam.Id.ToString(), $"'{exam.Name}' ortak yazılı sınavı ve oturma planı silindi.");
            return Ok(new { success = true, message = "Sınav ve tüm oturma planı silindi." });
        }

        [HttpGet("exams/{id}/details")]
        public async Task<IActionResult> GetExamDetails(Guid id)
        {
            var exam = await _context.WrittenExams.FindAsync(id);
            if (exam == null) return NotFound(new { success = false, message = "Sınav bulunamadı." });

            var seatings = await _context.ExamSeatings
                .Where(s => s.WrittenExamId == id)
                .OrderBy(s => s.RoomName)
                .ThenBy(s => s.SeatNumber)
                .ToListAsync();

            // Salon bazında grupla
            var roomGroups = seatings
                .GroupBy(s => s.RoomName)
                .OrderBy(g => {
                    var (gr, sec) = GradeSectionNormalizer.Normalize(g.Key, "");
                    return int.TryParse(gr, out var gInt) ? gInt : 99;
                })
                .ThenBy(g => g.Key)
                .Select(g => new
                {
                    RoomName = g.Key,
                    StudentCount = g.Count(),
                    ProctorTeacherName = g.FirstOrDefault()?.ProctorTeacherName,
                    ProctorTeacherId = g.FirstOrDefault()?.ProctorTeacherId,
                    Students = g.OrderBy(x => x.SeatNumber).Select(x => new
                    {
                        x.Id,
                        x.StudentNumber,
                        x.FullName,
                        x.Grade,
                        x.Section,
                        x.LessonName,
                        x.SeatNumber
                    }).ToList(),
                    Summary = g.GroupBy(x => new { x.Grade, x.Section, x.LessonName })
                               .Select(sg => new
                               {
                                   Branch = $"{sg.Key.Grade}-{sg.Key.Section}",
                                   sg.Key.LessonName,
                                   Count = sg.Count()
                               }).ToList(),
                    LessonSummary = g.GroupBy(x => new { x.LessonName, x.Grade })
                                     .OrderBy(lg => lg.Key.LessonName)
                                     .Select(lg => new
                                     {
                                         lg.Key.LessonName,
                                         lg.Key.Grade,
                                         Label = $"{lg.Key.LessonName} {lg.Key.Grade}",
                                         Count = lg.Count()
                                     }).ToList(),
                    GradeSummary = g.GroupBy(x => x.Grade)
                                    .OrderBy(gr => int.TryParse(gr.Key, out var gInt) ? gInt : 99)
                                    .Select(gr => new
                                    {
                                        Grade = gr.Key,
                                        Label = $"{gr.Key}. Sınıf",
                                        Count = gr.Count()
                                    }).ToList()
                })
                .ToList();

            var branchesSummary = seatings
                .GroupBy(s => new { s.Grade, s.Section, s.LessonName })
                .Select(g => new
                {
                    Branch = $"{g.Key.Grade}-{g.Key.Section}",
                    g.Key.LessonName,
                    Count = g.Count()
                })
                .OrderBy(x => x.Branch)
                .ToList();

            return Ok(new
            {
                success = true,
                exam = new
                {
                    exam.Id,
                    exam.SchoolId,
                    exam.Name,
                    exam.ExamDate,
                    ExamDateStr = exam.ExamDate.ToString("yyyy-MM-dd"),
                    DayOfWeekStr = GetTurkishDayName(exam.ExamDate.DayOfWeek),
                    exam.LessonHour,
                    exam.StartTime,
                    exam.IsPublishedToStudents,
                    TotalStudents = seatings.Count,
                    TotalRooms = roomGroups.Count
                },
                rooms = roomGroups,
                branchesSummary
            });
        }

        // ==========================================
        // 3. DAĞITIM SİHİRBAZI & ÖĞRENCİLERİ OTURTMA (PLACE STUDENTS)
        // ==========================================

        [HttpPost("exams/{id}/place-students")]
        public async Task<IActionResult> PlaceStudents(Guid id, [FromBody] PlaceStudentsRequest req)
        {
            if (!IsAdminOrStaff)
            {
                return Forbid("Bu işlem için sadece okul idarecileri yetkilidir.");
            }

            var exam = await _context.WrittenExams.FindAsync(id);
            if (exam == null) return NotFound(new { success = false, message = "Sınav bulunamadı." });

            if (req.SelectedRoomIds == null || !req.SelectedRoomIds.Any())
            {
                return BadRequest(new { success = false, message = "En az bir salon seçmelisiniz." });
            }

            if (req.SelectedBranches == null || !req.SelectedBranches.Any())
            {
                return BadRequest(new { success = false, message = "En az bir şube seçmelisiniz." });
            }

            var rooms = await _context.ExamHalls
                .Where(r => req.SelectedRoomIds.Contains(r.Id) && r.SchoolId == exam.SchoolId)
                .OrderBy(r => r.OrderIndex)
                .ThenBy(r => r.RoomName)
                .ToListAsync();

            if (!rooms.Any())
            {
                return BadRequest(new { success = false, message = "Seçilen salonlar bulunamadı." });
            }

            var totalCapacity = rooms.Sum(r => r.Capacity);

            // Şubelerdeki öğrencileri çek
            var allStudents = await _context.Students
                .Where(s => s.SchoolId == exam.SchoolId)
                .ToListAsync();

            var candidateStudents = allStudents
                .Where(s => {
                    var (g, sec) = GradeSectionNormalizer.Normalize(s.Grade, s.Section);
                    var k1 = $"{g}-{sec}".Trim();
                    var k2 = $"{s.Grade}-{s.Section}".Trim();
                    return req.SelectedBranches.Contains(k1, StringComparer.OrdinalIgnoreCase) ||
                           req.SelectedBranches.Contains(k2, StringComparer.OrdinalIgnoreCase);
                })
                .ToList();

            if (!candidateStudents.Any())
            {
                return BadRequest(new { success = false, message = "Seçilen şubelerde kayıtlı öğrenci bulunamadı." });
            }

            if (candidateStudents.Count > totalCapacity)
            {
                return BadRequest(new
                {
                    success = false,
                    message = $"Öğrenci sayısı ({candidateStudents.Count}) seçilen salonların toplam kapasitesini ({totalCapacity}) aşıyor. Lütfen daha fazla salon ekleyin."
                });
            }

            // Şube-Ders eşleme tablosu
            var lessonMap = req.BranchLessons ?? new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

            // Rastgele karıştır
            var rnd = new Random();
            var shuffled = candidateStudents.OrderBy(x => rnd.Next()).ToList();

            // Kelebek yerleşim (Kelebek modunda farklı ders/kademe gruplarını çapraz sırayla diz)
            List<Student> arrangedStudents;
            if (req.IsButterfly)
            {
                var groups = shuffled
                    .GroupBy(s => {
                        var (g, sec) = GradeSectionNormalizer.Normalize(s.Grade, s.Section);
                        var bKey = $"{g}-{sec}".Trim();
                        var lesson = lessonMap.GetValueOrDefault(bKey, lessonMap.GetValueOrDefault($"{s.Grade}-{s.Section}", "Yazılı Sınav"));
                        return $"{lesson}_{g}";
                    })
                    .ToDictionary(g => g.Key, g => new Queue<Student>(g));

                arrangedStudents = new List<Student>();
                while (groups.Any(kvp => kvp.Value.Count > 0))
                {
                    foreach (var key in groups.Keys.ToList())
                    {
                        var queue = groups[key];
                        if (queue.Count > 0)
                        {
                            arrangedStudents.Add(queue.Dequeue());
                        }
                    }
                }
            }
            else
            {
                arrangedStudents = shuffled;
            }

            // O günün haftanın günü numarası (Pazartesi=1, Salı=2, Çarşamba=3, Perşembe=4, Cuma=5, Cmt=6, Paz=7)
            int dayOfWeekNum = exam.ExamDate.DayOfWeek switch
            {
                DayOfWeek.Monday => 1,
                DayOfWeek.Tuesday => 2,
                DayOfWeek.Wednesday => 3,
                DayOfWeek.Thursday => 4,
                DayOfWeek.Friday => 5,
                DayOfWeek.Saturday => 6,
                _ => 1
            };

            // Programdan o saatteki öğretmenleri çek (Gözetmen tespiti için)
            var scheduleAtExamHour = await _context.ScheduleItems
                .Where(si => si.SchoolId == exam.SchoolId && si.DayOfWeek == dayOfWeekNum && si.LessonHour == exam.LessonHour)
                .ToListAsync();

            // Eski oturma planını temizle
            var oldSeatings = await _context.ExamSeatings.Where(s => s.WrittenExamId == id).ToListAsync();
            _context.ExamSeatings.RemoveRange(oldSeatings);

            var newSeatings = new List<ExamSeating>();
            int studentIdx = 0;

            foreach (var room in rooms)
            {
                // Bu salona o saatte dersi olan öğretmeni bul
                // Eşleşme kriterleri: Classroom adı veya Grade-Section adı salon adıyla aynı olan
                var matchedSchedule = scheduleAtExamHour.FirstOrDefault(si =>
                    (!string.IsNullOrEmpty(si.Classroom) && string.Equals(si.Classroom.Trim(), room.RoomName.Trim(), StringComparison.OrdinalIgnoreCase)) ||
                    string.Equals($"{si.Grade}-{si.Section}".Trim(), room.RoomName.Trim(), StringComparison.OrdinalIgnoreCase)
                );

                string? proctorName = matchedSchedule?.TeacherName;
                Guid? proctorId = matchedSchedule?.TeacherId;

                int seatInRoom = 1;
                while (seatInRoom <= room.Capacity && studentIdx < arrangedStudents.Count)
                {
                    var st = arrangedStudents[studentIdx];
                    var branchKey = $"{st.Grade}-{st.Section}".Trim();
                    var lessonName = lessonMap.GetValueOrDefault(branchKey, "Yazılı Sınav");

                    newSeatings.Add(new ExamSeating
                    {
                        WrittenExamId = id,
                        SchoolId = exam.SchoolId,
                        StudentId = st.Id,
                        StudentNumber = st.StudentNumber,
                        FullName = st.FullName,
                        Grade = st.Grade,
                        Section = st.Section,
                        LessonName = lessonName,
                        RoomName = room.RoomName,
                        SeatNumber = seatInRoom,
                        ProctorTeacherName = proctorName,
                        ProctorTeacherId = proctorId
                    });

                    seatInRoom++;
                    studentIdx++;
                }
            }

            _context.ExamSeatings.AddRange(newSeatings);
            await _context.SaveChangesAsync();
            await LogActionAsync(exam.SchoolId, "PLACE_STUDENTS", "WrittenExam", exam.Id.ToString(), $"'{exam.Name}' sınavı için {newSeatings.Count} öğrenci {rooms.Count} salona {(req.IsButterfly ? "kelebek sistemiyle" : "normal")} yerleştirildi.");

            return Ok(new
            {
                success = true,
                message = $"{newSeatings.Count} öğrenci {rooms.Count} salona başarıyla yerleştirildi.",
                placedCount = newSeatings.Count
            });
        }

        // Gözetmen öğretmeni manuel değiştirme
        [HttpPut("exams/{id}/proctor")]
        public async Task<IActionResult> UpdateProctor(Guid id, [FromBody] UpdateProctorDto dto)
        {
            if (!IsAdminOrStaff)
            {
                return Forbid("Yetkisiz işlem.");
            }

            var seatings = await _context.ExamSeatings
                .Where(s => s.WrittenExamId == id && s.RoomName == dto.RoomName)
                .ToListAsync();

            if (!seatings.Any())
            {
                return NotFound(new { success = false, message = "Bu salona ait yerleşim bulunamadı." });
            }

            foreach (var s in seatings)
            {
                s.ProctorTeacherName = dto.ProctorTeacherName?.Trim();
                s.ProctorTeacherId = dto.ProctorTeacherId;
            }

            await _context.SaveChangesAsync();
            await LogActionAsync(seatings.First().SchoolId, "UPDATE_PROCTOR", "ExamSeating", null, $"{dto.RoomName} salonu gözetmeni '{dto.ProctorTeacherName}' olarak güncellendi.");
            return Ok(new { success = true, message = "Gözetmen öğretmen güncellendi." });
        }

        // Akıllı Gözetmen Listesi (Nöbetçi ve Dersi Boş Öğretmenler Öncelikli)
        [HttpGet("exams/{id}/available-proctors")]
        public async Task<IActionResult> GetAvailableProctors(Guid id, [FromQuery] string? roomName = null)
        {
            if (!IsAdminOrStaff) return Forbid();

            var exam = await _context.WrittenExams.FindAsync(id);
            if (exam == null) return NotFound(new { success = false, message = "Sınav bulunamadı." });

            var effectiveId = await GetEffectiveSchoolIdAsync(exam.SchoolId.ToString());

            // 1. Okuldaki öğretmenler
            var teachers = await _context.Users
                .Where(u => u.SchoolId == effectiveId && (u.Role == UserRoles.Teacher || u.Role == UserRoles.SchoolAdmin || u.Role == UserRoles.Staff) && u.IsActive)
                .OrderBy(u => u.FullName)
                .ToListAsync();

            // ScheduleItems'dan da öğretmen isimlerini topla (Users tablosunda eksik olanlar için)
            var scheduleTeacherNames = await _context.ScheduleItems
                .Where(s => s.SchoolId == effectiveId && !string.IsNullOrEmpty(s.TeacherName))
                .Select(s => s.TeacherName!.Trim())
                .Distinct()
                .ToListAsync();

            var teacherNameMap = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var t in teachers) teacherNameMap.Add(t.FullName.Trim());
            foreach (var name in scheduleTeacherNames)
            {
                if (!teacherNameMap.Contains(name))
                {
                    teachers.Add(new User
                    {
                        Id = Guid.Empty,
                        FullName = name,
                        Username = name.ToLower(),
                        Role = UserRoles.Teacher,
                        IsActive = true
                    });
                    teacherNameMap.Add(name);
                }
            }

            var dayName = GetTurkishDayName(exam.ExamDate.DayOfWeek);
            int dayNumber = exam.ExamDate.DayOfWeek == DayOfWeek.Sunday ? 7 : (int)exam.ExamDate.DayOfWeek;
            var examDateStr = exam.ExamDate.ToString("yyyy-MM-dd");

            // 2. O günkü nöbetçiler
            var duties = await _context.TeacherDuties
                .Where(t => t.SchoolId == effectiveId && (t.DayOfWeek == dayName || t.Date == examDateStr))
                .ToListAsync();

            var dutyMap = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (var d in duties)
            {
                if (!string.IsNullOrWhiteSpace(d.TeacherName))
                {
                    dutyMap[d.TeacherName.Trim()] = string.IsNullOrWhiteSpace(d.DutyPlace) ? "Nöbetçi" : d.DutyPlace.Trim();
                }
            }

            // 3. O günkü ve o saatteki ders programı
            var daySchedules = await _context.ScheduleItems
                .Where(s => s.SchoolId == effectiveId && (s.DayOfWeek == dayNumber))
                .ToListAsync();

            var busyAtHourMap = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            var teachesTodaySet = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            foreach (var s in daySchedules)
            {
                if (string.IsNullOrWhiteSpace(s.TeacherName)) continue;
                var tName = s.TeacherName.Trim();
                teachesTodaySet.Add(tName);
                if (s.LessonHour == exam.LessonHour)
                {
                    busyAtHourMap[tName] = $"{s.Grade}-{s.Section} ({s.LessonName})";
                }
            }

            // 4. Zaten bu sınavda atanmış gözetmenler
            var seatings = await _context.ExamSeatings
                .Where(s => s.WrittenExamId == id && !string.IsNullOrEmpty(s.ProctorTeacherName))
                .ToListAsync();

            var proctorAssignmentMap = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (var s in seatings)
            {
                if (!string.IsNullOrWhiteSpace(s.ProctorTeacherName))
                {
                    proctorAssignmentMap[s.ProctorTeacherName.Trim()] = s.RoomName;
                }
            }

            // 5. Her öğretmen için durum, rozet ve öncelik puanı belirle
            var list = new List<object>();
            foreach (var t in teachers)
            {
                var name = t.FullName.Trim();
                bool isDuty = dutyMap.TryGetValue(name, out var dutyPlace);
                bool isBusy = busyAtHourMap.TryGetValue(name, out var busyLesson);
                bool hasLessonsToday = teachesTodaySet.Contains(name);
                bool isAlreadyAssigned = proctorAssignmentMap.TryGetValue(name, out var assignedRoom);
                bool isCurrentRoomProctor = !string.IsNullOrEmpty(roomName) && string.Equals(assignedRoom, roomName, StringComparison.OrdinalIgnoreCase);

                int priority = 99;
                string badge = "";
                string badgeColor = "#64748B";

                if (isCurrentRoomProctor)
                {
                    priority = 0; // Mevcut gözetmen
                    badge = "Şu Anki Gözetmen";
                    badgeColor = "#4F46E5";
                }
                else if (isDuty && !isBusy && !isAlreadyAssigned)
                {
                    priority = 1; // 1. ÖNCELİK: Nöbetçi VE dersi boş!
                    badge = $"🛡️ Nöbetçi ({dutyPlace}) & Dersi Boş";
                    badgeColor = "#16A34A";
                }
                else if (hasLessonsToday && !isBusy && !isAlreadyAssigned)
                {
                    priority = 2; // 2. ÖNCELİK: Okulda VE dersi boş!
                    badge = "⏳ Okulda & Dersi Boş";
                    badgeColor = "#2563EB";
                }
                else if (!hasLessonsToday && !isAlreadyAssigned)
                {
                    priority = 3;
                    badge = "🏠 Bugün Dersi Yok";
                    badgeColor = "#64748B";
                }
                else if (isDuty && isBusy && !isAlreadyAssigned)
                {
                    priority = 4;
                    badge = $"🛡️ Nöbetçi (Derste: {busyLesson})";
                    badgeColor = "#D97706";
                }
                else if (isBusy && !isAlreadyAssigned)
                {
                    priority = 5;
                    badge = $"⚠️ Derste: {busyLesson}";
                    badgeColor = "#EA580C";
                }
                else if (isAlreadyAssigned)
                {
                    priority = 6;
                    badge = $"🚫 {assignedRoom} Salonunda Görevli";
                    badgeColor = "#DC2626";
                }

                list.Add(new
                {
                    id = t.Id,
                    teacherName = name,
                    priority,
                    badge,
                    badgeColor,
                    isDuty,
                    dutyPlace,
                    isBusy,
                    busyLesson,
                    hasLessonsToday,
                    assignedRoom,
                    isCurrentRoomProctor
                });
            }

            var sorted = list
                .OrderBy(x => ((dynamic)x).priority)
                .ThenBy(x => ((dynamic)x).teacherName)
                .ToList();

            return Ok(new { success = true, data = sorted });
        }

        // ==========================================
        // 4. ÖĞRENCİ & VELİ SORGUSU (STUDENT / PARENT SEATING)
        // ==========================================

        [HttpGet("student-seatings")]
        [AllowAnonymous] // Öğrenciler veya veliler kendi no ile sorgulayabilir
        public async Task<IActionResult> GetStudentSeatings([FromQuery] Guid schoolId, [FromQuery] string studentNumber)
        {
            if (string.IsNullOrWhiteSpace(studentNumber) || schoolId == Guid.Empty)
            {
                return BadRequest(new { success = false, message = "Okul ve öğrenci numarası gereklidir." });
            }

            var cleanNum = studentNumber.Trim();

            var seatings = await _context.ExamSeatings
                .Where(s => s.SchoolId == schoolId && s.StudentNumber == cleanNum)
                .ToListAsync();

            if (!seatings.Any())
            {
                return Ok(new { success = true, data = new List<object>() });
            }

            var examIds = seatings.Select(s => s.WrittenExamId).Distinct().ToList();
            var exams = await _context.WrittenExams
                .Where(e => examIds.Contains(e.Id) && e.IsActive && e.IsPublishedToStudents)
                .ToDictionaryAsync(e => e.Id, e => e);

            var list = new List<object>();
            foreach (var s in seatings)
            {
                if (exams.TryGetValue(s.WrittenExamId, out var exam))
                {
                    list.Add(new
                    {
                        s.Id,
                        ExamId = exam.Id,
                        ExamName = exam.Name,
                        ExamDate = exam.ExamDate.ToString("yyyy-MM-dd"),
                        DayOfWeekStr = GetTurkishDayName(exam.ExamDate.DayOfWeek),
                        LessonHour = $"{exam.LessonHour}. Ders",
                        LessonHourNum = exam.LessonHour,
                        exam.StartTime,
                        s.LessonName,
                        s.RoomName,
                        s.SeatNumber,
                        s.ProctorTeacherName,
                        s.FullName,
                        s.Grade,
                        s.Section
                    });
                }
            }

            return Ok(new { success = true, data = list });
        }

        // ==========================================
        // 5. ÖĞRETMEN YAZILI SINAV GÖSTERGESİ / UYARISI
        // ==========================================

        [HttpGet("teacher-exam-alert")]
        public async Task<IActionResult> GetTeacherExamAlert(
            [FromQuery] Guid schoolId,
            [FromQuery] string? teacherName,
            [FromQuery] string? dateStr,
            [FromQuery] int? lessonHour)
        {
            DateTime targetDate = DateTime.Today;
            if (!string.IsNullOrWhiteSpace(dateStr) && DateTime.TryParse(dateStr, out var parsedDate))
            {
                targetDate = parsedDate.Date;
            }

            var examQuery = _context.WrittenExams
                .Where(e => e.SchoolId == schoolId && e.ExamDate.Date == targetDate && e.IsActive);

            if (lessonHour.HasValue && lessonHour.Value > 0)
            {
                examQuery = examQuery.Where(e => e.LessonHour == lessonHour.Value);
            }

            var examsToday = await examQuery.ToListAsync();
            if (!examsToday.Any())
            {
                return Ok(new { success = true, hasExam = false });
            }

            var firstExam = examsToday.First();

            // Eğer öğretmen ismi verilmişse gözetmenlik kontrolü yap
            bool isProctor = false;
            string? proctorRoom = null;
            if (!string.IsNullOrWhiteSpace(teacherName))
            {
                var proctorSeating = await _context.ExamSeatings
                    .FirstOrDefaultAsync(s => s.WrittenExamId == firstExam.Id && s.ProctorTeacherName != null &&
                                              s.ProctorTeacherName.ToLower() == teacherName.Trim().ToLower());
                if (proctorSeating != null)
                {
                    isProctor = true;
                    proctorRoom = proctorSeating.RoomName;
                }
            }

            return Ok(new
            {
                success = true,
                hasExam = true,
                examName = firstExam.Name,
                lessonHour = firstExam.LessonHour,
                startTime = firstExam.StartTime,
                isProctor,
                proctorRoom,
                message = isProctor
                    ? $"⚠️ Bu ders saatinde ({firstExam.LessonHour}. Ders) {firstExam.Name} vardır. {proctorRoom} salonunda GÖZETMENSİNİZ!"
                    : $"⚠️ Bu ders saatinde ({firstExam.LessonHour}. Ders) okul genelinde {firstExam.Name} yapılmaktadır."
            });
        }

        [HttpGet("teacher-proctor-duties")]
        public async Task<IActionResult> GetTeacherProctorDuties([FromQuery] Guid schoolId, [FromQuery] string? teacherName)
        {
            if (string.IsNullOrWhiteSpace(teacherName))
            {
                return Ok(new { success = true, data = new List<object>() });
            }

            var cleanName = teacherName.Trim().ToLowerInvariant();

            // Öğretmenin gözetmen olduğu aktif sınav yerleşimleri
            var seatings = await _context.ExamSeatings
                .Where(s => s.SchoolId == schoolId && s.ProctorTeacherName != null &&
                            s.ProctorTeacherName.ToLower() == cleanName)
                .ToListAsync();

            if (!seatings.Any())
            {
                return Ok(new { success = true, data = new List<object>() });
            }

            var examIds = seatings.Select(s => s.WrittenExamId).Distinct().ToList();
            var exams = await _context.WrittenExams
                .Where(e => examIds.Contains(e.Id) && e.IsActive)
                .ToListAsync();

            var examMap = exams.ToDictionary(e => e.Id);

            var grouped = seatings
                .Where(s => examMap.ContainsKey(s.WrittenExamId))
                .GroupBy(s => new { s.WrittenExamId, s.RoomName })
                .Select(g =>
                {
                    var exam = examMap[g.Key.WrittenExamId];
                    var isToday = exam.ExamDate.Date == DateTime.Today;
                    return new
                    {
                        examId = exam.Id,
                        examName = exam.Name,
                        examDate = exam.ExamDate.ToString("yyyy-MM-dd"),
                        examDateRaw = exam.ExamDate,
                        dayOfWeekStr = exam.ExamDate.ToString("dddd", new System.Globalization.CultureInfo("tr-TR")),
                        lessonHour = exam.LessonHour,
                        startTime = exam.StartTime ?? "09:50",
                        roomName = g.Key.RoomName,
                        studentCount = g.Count(),
                        isToday = isToday
                    };
                })
                .OrderByDescending(x => x.isToday)
                .ThenBy(x => x.examDateRaw)
                .ThenBy(x => x.lessonHour)
                .ToList();

            return Ok(new { success = true, data = grouped });
        }

        // ==========================================
        // 5. MANUEL ÖĞRENCİ YERİ DEĞİŞTİRME / TAKAS (SWAP & MOVE)
        // ==========================================

        [HttpPost("swap-or-move-seat")]
        public async Task<IActionResult> SwapOrMoveSeat([FromBody] MoveSeatRequest req)
        {
            if (!IsAdminOrStaff)
            {
                return Forbid("Yetkisiz işlem.");
            }

            var currentSeat = await _context.ExamSeatings.FirstOrDefaultAsync(s => s.Id == req.SeatingId && s.WrittenExamId == req.WrittenExamId);
            if (currentSeat == null)
            {
                return NotFound(new { success = false, message = "Öğrenci yerleşim kaydı bulunamadı." });
            }

            var targetRoom = (req.TargetRoomName ?? "").Trim();
            var targetSeat = req.TargetSeatNumber;

            if (string.IsNullOrEmpty(targetRoom) || targetSeat <= 0)
            {
                return BadRequest(new { success = false, message = "Geçerli bir salon adı ve sıra numarası giriniz." });
            }

            // Hedef sırada oturan başka bir öğrenci var mı?
            var occupant = await _context.ExamSeatings.FirstOrDefaultAsync(s =>
                s.WrittenExamId == req.WrittenExamId &&
                s.RoomName == targetRoom &&
                s.SeatNumber == targetSeat &&
                s.Id != req.SeatingId
            );

            if (occupant != null)
            {
                // Karşılıklı Takas (Swap)
                var oldRoom = currentSeat.RoomName;
                var oldSeat = currentSeat.SeatNumber;

                occupant.RoomName = oldRoom;
                occupant.SeatNumber = oldSeat;

                currentSeat.RoomName = targetRoom;
                currentSeat.SeatNumber = targetSeat;
            }
            else
            {
                // Boş sıraya doğrudan taşıma
                currentSeat.RoomName = targetRoom;
                currentSeat.SeatNumber = targetSeat;
            }

            await _context.SaveChangesAsync();
            await LogActionAsync(currentSeat.SchoolId, "MOVE_SEAT", "ExamSeating", currentSeat.Id.ToString(),
                occupant != null
                    ? $"{currentSeat.FullName} ile {occupant.FullName} isimli öğrencilerin yerleri karşılıklı takas edildi."
                    : $"{currentSeat.FullName} (No: {currentSeat.StudentNumber}) öğrencisi {targetRoom} salonu {targetSeat}. sıraya taşındı.");

            return Ok(new
            {
                success = true,
                message = occupant != null
                    ? $"{currentSeat.FullName} ile {occupant.FullName} isimli öğrencilerin yerleri karşılıklı takas edildi."
                    : $"{currentSeat.FullName} isimli öğrenci {targetRoom} salonu {targetSeat}. sıraya taşındı."
            });
        }

        // ==========================================
        // 6. CSV / EXCEL UYUMLU RAPOR ÇIKTILARI (UTF-8 BOM + NOKTALI VİRGÜL AYRAÇLI CSV)
        // ==========================================

        // ==========================================
        // 6. GELİŞMİŞ XLSX (CLOSEDXML) VE A4 PDF/PRINT RAPORLARI
        // ==========================================

        private static string SanitizeSheetName(string name, HashSet<string> usedNames)
        {
            if (string.IsNullOrWhiteSpace(name)) name = "Salon";
            var clean = Regex.Replace(name, @"[:\\/?*\[\]]", "-").Trim();
            if (clean.Length > 28) clean = clean.Substring(0, 28);
            var candidate = clean;
            int idx = 1;
            while (usedNames.Contains(candidate.ToLowerInvariant()))
            {
                candidate = $"{clean}_{idx++}";
                if (candidate.Length > 31) candidate = candidate.Substring(0, 31);
            }
            usedNames.Add(candidate.ToLowerInvariant());
            return candidate;
        }

        // 6.1. SALON YOKLAMA LİSTESİ - GERÇEK XLSX (HER SALON AYRI SHEET, ÖZET SEÇENEKLİ, A4 BOYUTU)
        [HttpGet("exams/{id}/export-attendance-xlsx")]
        public async Task<IActionResult> ExportAttendanceXlsx(Guid id, [FromQuery] string? roomName = null, [FromQuery] string summaryType = "course", [FromQuery] bool includeProctorName = true)
        {
            if (!IsAdminOrStaff) return Forbid();

            var exam = await _context.WrittenExams.FindAsync(id);
            if (exam == null) return NotFound(new { success = false, message = "Sınav bulunamadı." });

            var query = _context.ExamSeatings.Where(s => s.WrittenExamId == id);
            if (!string.IsNullOrWhiteSpace(roomName))
            {
                query = query.Where(s => s.RoomName == roomName);
            }

            var seatings = await query
                .OrderBy(s => s.RoomName)
                .ThenBy(s => s.SeatNumber)
                .ToListAsync();

            var groupedRooms = seatings
                .GroupBy(s => s.RoomName)
                .OrderBy(g => {
                    var (gr, sec) = GradeSectionNormalizer.Normalize(g.Key, "");
                    return int.TryParse(gr, out var gInt) ? gInt : 99;
                })
                .ThenBy(g => g.Key)
                .ToList();

            using var wb = new XLWorkbook();
            var usedSheetNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            foreach (var rg in groupedRooms)
            {
                var sheetName = SanitizeSheetName(rg.Key, usedSheetNames);
                var ws = wb.Worksheets.Add(sheetName);

                // A4 ve Sayfa Yerleşimi Ayarları
                ws.PageSetup.PaperSize = XLPaperSize.A4Paper;
                ws.PageSetup.PageOrientation = XLPageOrientation.Portrait;
                ws.PageSetup.FitToPages(1, 0); // 1 sayfa genişliğinde A4'e sığdır
                ws.PageSetup.Margins.Top = 0.5;
                ws.PageSetup.Margins.Bottom = 0.5;
                ws.PageSetup.Margins.Left = 0.4;
                ws.PageSetup.Margins.Right = 0.4;

                var proctor = rg.FirstOrDefault()?.ProctorTeacherName ?? "Gözetmen Belirtilmedi";
                var proctorDisplay = includeProctorName ? proctor : "....................................";

                // Başlık Bloğu
                ws.Cell("A1").Value = $"SALON YOKLAMA VE İMZA LİSTESİ - {rg.Key.ToUpper()}";
                ws.Range("A1:F1").Merge().Style
                    .Font.SetBold().Font.SetFontSize(14).Font.SetFontColor(XLColor.White)
                    .Fill.SetBackgroundColor(XLColor.FromHtml("#1E3A8A"))
                    .Alignment.SetHorizontal(XLAlignmentHorizontalValues.Center)
                    .Alignment.SetVertical(XLAlignmentVerticalValues.Center);
                ws.Row(1).Height = 28;

                ws.Cell("A2").Value = $"Sınav: {exam.Name}  |  Tarih: {exam.ExamDate:dd.MM.yyyy} ({GetTurkishDayName(exam.ExamDate.DayOfWeek)})  |  Saat: {exam.LessonHour}. Ders ({exam.StartTime ?? "-"})";
                ws.Range("A2:F2").Merge().Style
                    .Font.SetBold().Font.SetFontSize(10).Font.SetFontColor(XLColor.FromHtml("#1E293B"))
                    .Fill.SetBackgroundColor(XLColor.FromHtml("#E2E8F0"))
                    .Alignment.SetHorizontal(XLAlignmentHorizontalValues.Center)
                    .Alignment.SetVertical(XLAlignmentVerticalValues.Center);
                ws.Row(2).Height = 20;

                ws.Cell("A3").Value = $"Salon Gözetmeni: {proctorDisplay}  |  Toplam Öğrenci: {rg.Count()}";
                ws.Range("A3:F3").Merge().Style
                    .Font.SetBold().Font.SetFontSize(10).Font.SetFontColor(XLColor.FromHtml("#0F172A"))
                    .Fill.SetBackgroundColor(XLColor.FromHtml("#F1F5F9"))
                    .Alignment.SetHorizontal(XLAlignmentHorizontalValues.Center)
                    .Alignment.SetVertical(XLAlignmentVerticalValues.Center);
                ws.Row(3).Height = 20;

                // Tablo Başlıkları
                int row = 5;
                string[] headers = { "Sıra No", "Öğrenci No", "Adı Soyadı", "Sınıf / Şube", "Girdiği Ders Sınavı", "Öğrenci İmzası" };
                for (int c = 0; c < headers.Length; c++)
                {
                    var cell = ws.Cell(row, c + 1);
                    cell.Value = headers[c];
                    cell.Style
                        .Font.SetBold().Font.SetFontSize(10).Font.SetFontColor(XLColor.White)
                        .Fill.SetBackgroundColor(XLColor.FromHtml("#334155"))
                        .Alignment.SetHorizontal(XLAlignmentHorizontalValues.Center)
                        .Alignment.SetVertical(XLAlignmentVerticalValues.Center);
                }
                ws.Row(row).Height = 22;

                // Öğrenci Satırları
                var sortedStudents = rg.OrderBy(x => x.SeatNumber).ToList();
                foreach (var s in sortedStudents)
                {
                    row++;
                    ws.Cell(row, 1).SetValue(s.SeatNumber).Style.Alignment.SetHorizontal(XLAlignmentHorizontalValues.Center);
                    ws.Cell(row, 2).SetValue(s.StudentNumber).Style.Alignment.SetHorizontal(XLAlignmentHorizontalValues.Center);
                    ws.Cell(row, 3).SetValue(s.FullName).Style.Alignment.SetHorizontal(XLAlignmentHorizontalValues.Left);
                    ws.Cell(row, 4).SetValue($"{s.Grade}-{s.Section}").Style.Alignment.SetHorizontal(XLAlignmentHorizontalValues.Center);
                    ws.Cell(row, 5).SetValue(s.LessonName).Style.Alignment.SetHorizontal(XLAlignmentHorizontalValues.Left);
                    ws.Cell(row, 6).SetValue("").Style.Alignment.SetHorizontal(XLAlignmentHorizontalValues.Center);

                    var dataRange = ws.Range(row, 1, row, 6);
                    dataRange.Style.Border.SetOutsideBorder(XLBorderStyleValues.Thin).Border.SetInsideBorder(XLBorderStyleValues.Thin);
                    dataRange.Style.Border.SetOutsideBorderColor(XLColor.FromHtml("#CBD5E1")).Border.SetInsideBorderColor(XLColor.FromHtml("#CBD5E1"));

                    if (row % 2 == 0)
                    {
                        dataRange.Style.Fill.SetBackgroundColor(XLColor.FromHtml("#F8FAFC"));
                    }
                    ws.Row(row).Height = 20;
                }

                // Kenarlıklar tablonun tamamına
                ws.Range(5, 1, row, 6).Style.Border.SetOutsideBorder(XLBorderStyleValues.Medium).Border.SetOutsideBorderColor(XLColor.FromHtml("#475569"));

                // Kullanıcının Tercih Ettiği Özet Bilgileri
                if (!string.Equals(summaryType, "none", StringComparison.OrdinalIgnoreCase))
                {
                    row += 2;
                    ws.Cell(row, 1).Value = "SALON DAĞILIM VE ÖZET BİLGİSİ";
                    ws.Range(row, 1, row, 5).Merge().Style
                        .Font.SetBold().Font.SetFontSize(10).Font.SetFontColor(XLColor.White)
                        .Fill.SetBackgroundColor(XLColor.FromHtml("#475569"))
                        .Alignment.SetHorizontal(XLAlignmentHorizontalValues.Center);
                    ws.Row(row).Height = 20;

                    // 1. Ders Bazında İstatistik
                    if (summaryType == "course" || summaryType == "all")
                    {
                        row++;
                        ws.Cell(row, 1).Value = "Ders Adı";
                        ws.Range(row, 1, row, 2).Merge().Style.Font.SetBold().Fill.SetBackgroundColor(XLColor.FromHtml("#E2E8F0"));
                        ws.Cell(row, 3).Value = "Sınıf";
                        ws.Cell(row, 3).Style.Font.SetBold().Fill.SetBackgroundColor(XLColor.FromHtml("#E2E8F0")).Alignment.SetHorizontal(XLAlignmentHorizontalValues.Center);
                        ws.Cell(row, 4).Value = "Öğrenci Sayısı";
                        ws.Range(row, 4, row, 5).Merge().Style.Font.SetBold().Fill.SetBackgroundColor(XLColor.FromHtml("#E2E8F0")).Alignment.SetHorizontal(XLAlignmentHorizontalValues.Center);
                        ws.Row(row).Height = 18;

                        var lessonSum = rg.GroupBy(x => new { x.LessonName, x.Grade }).OrderBy(lg => lg.Key.LessonName);
                        foreach (var ls in lessonSum)
                        {
                            row++;
                            ws.Cell(row, 1).Value = ls.Key.LessonName;
                            ws.Range(row, 1, row, 2).Merge();
                            ws.Cell(row, 3).Value = $"{ls.Key.Grade}. Sınıf";
                            ws.Cell(row, 3).Style.Alignment.SetHorizontal(XLAlignmentHorizontalValues.Center);
                            ws.Cell(row, 4).Value = ls.Count();
                            ws.Range(row, 4, row, 5).Merge().Style.Alignment.SetHorizontal(XLAlignmentHorizontalValues.Center);
                            ws.Range(row, 1, row, 5).Style.Border.SetOutsideBorder(XLBorderStyleValues.Thin).Border.SetInsideBorder(XLBorderStyleValues.Thin);
                            ws.Row(row).Height = 18;
                        }
                    }

                    // 2. Kademe Bazında İstatistik
                    if (summaryType == "grade" || summaryType == "all")
                    {
                        row++;
                        ws.Cell(row, 1).Value = "Sınıf Düzeyi (Kademe)";
                        ws.Range(row, 1, row, 3).Merge().Style.Font.SetBold().Fill.SetBackgroundColor(XLColor.FromHtml("#E2E8F0"));
                        ws.Cell(row, 4).Value = "Öğrenci Sayısı";
                        ws.Range(row, 4, row, 5).Merge().Style.Font.SetBold().Fill.SetBackgroundColor(XLColor.FromHtml("#E2E8F0")).Alignment.SetHorizontal(XLAlignmentHorizontalValues.Center);
                        ws.Row(row).Height = 18;

                        var gradeSum = rg.GroupBy(x => x.Grade).OrderBy(gr => int.TryParse(gr.Key, out var gInt) ? gInt : 99);
                        foreach (var gs in gradeSum)
                        {
                            row++;
                            ws.Cell(row, 1).Value = $"{gs.Key}. Sınıf";
                            ws.Range(row, 1, row, 3).Merge();
                            ws.Cell(row, 4).Value = gs.Count();
                            ws.Range(row, 4, row, 5).Merge().Style.Alignment.SetHorizontal(XLAlignmentHorizontalValues.Center);
                            ws.Range(row, 1, row, 5).Style.Border.SetOutsideBorder(XLBorderStyleValues.Thin).Border.SetInsideBorder(XLBorderStyleValues.Thin);
                            ws.Row(row).Height = 18;
                        }
                    }

                    // 3. Şube Bazında İstatistik
                    if (summaryType == "branch" || summaryType == "all")
                    {
                        row++;
                        ws.Cell(row, 1).Value = "Şube";
                        ws.Cell(row, 1).Style.Font.SetBold().Fill.SetBackgroundColor(XLColor.FromHtml("#E2E8F0")).Alignment.SetHorizontal(XLAlignmentHorizontalValues.Center);
                        ws.Cell(row, 2).Value = "Ders Adı";
                        ws.Range(row, 2, row, 3).Merge().Style.Font.SetBold().Fill.SetBackgroundColor(XLColor.FromHtml("#E2E8F0"));
                        ws.Cell(row, 4).Value = "Öğrenci Sayısı";
                        ws.Range(row, 4, row, 5).Merge().Style.Font.SetBold().Fill.SetBackgroundColor(XLColor.FromHtml("#E2E8F0")).Alignment.SetHorizontal(XLAlignmentHorizontalValues.Center);
                        ws.Row(row).Height = 18;

                        var branchSum = rg.GroupBy(x => new { x.Grade, x.Section, x.LessonName }).OrderBy(b => b.Key.Grade).ThenBy(b => b.Key.Section);
                        foreach (var bs in branchSum)
                        {
                            row++;
                            ws.Cell(row, 1).Value = $"{bs.Key.Grade}-{bs.Key.Section}";
                            ws.Cell(row, 1).Style.Alignment.SetHorizontal(XLAlignmentHorizontalValues.Center);
                            ws.Cell(row, 2).Value = bs.Key.LessonName;
                            ws.Range(row, 2, row, 3).Merge();
                            ws.Cell(row, 4).Value = bs.Count();
                            ws.Range(row, 4, row, 5).Merge().Style.Alignment.SetHorizontal(XLAlignmentHorizontalValues.Center);
                            ws.Range(row, 1, row, 5).Style.Border.SetOutsideBorder(XLBorderStyleValues.Thin).Border.SetInsideBorder(XLBorderStyleValues.Thin);
                            ws.Row(row).Height = 18;
                        }
                    }
                }

                // İmza Alanı (Sayfa Sonu)
                row += 2;
                ws.Cell(row, 1).Value = "Gözetmen Öğretmen";
                ws.Range(row, 1, row, 3).Merge().Style.Font.SetBold().Alignment.SetHorizontal(XLAlignmentHorizontalValues.Center);
                ws.Cell(row, 4).Value = "Okul Müdürü / Sınav Komisyonu";
                ws.Range(row, 4, row, 6).Merge().Style.Font.SetBold().Alignment.SetHorizontal(XLAlignmentHorizontalValues.Center);

                row++;
                ws.Cell(row, 1).Value = proctorDisplay;
                ws.Range(row, 1, row, 3).Merge().Style.Alignment.SetHorizontal(XLAlignmentHorizontalValues.Center);
                ws.Cell(row, 4).Value = "İmza / Mühür";
                ws.Range(row, 4, row, 6).Merge().Style.Alignment.SetHorizontal(XLAlignmentHorizontalValues.Center);

                // Sütun Genişlikleri
                ws.Columns().AdjustToContents();
                ws.Column(1).Width = Math.Max(ws.Column(1).Width, 10);
                ws.Column(2).Width = Math.Max(ws.Column(2).Width, 14);
                ws.Column(3).Width = Math.Max(ws.Column(3).Width, 24);
                ws.Column(4).Width = Math.Max(ws.Column(4).Width, 14);
                ws.Column(5).Width = Math.Max(ws.Column(5).Width, 22);
                ws.Column(6).Width = Math.Max(ws.Column(6).Width, 20); // İmza için geniş sütun
            }

            using var stream = new MemoryStream();
            wb.SaveAs(stream);
            var content = stream.ToArray();
            var fileName = $"Salon_Yoklama_Listesi_{exam.Name.Replace(" ", "_")}.xlsx";
            return File(content, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", fileName);
        }

        // 6.2. ÖĞRENCİ BİLGİLENDİRME LİSTESİ - GERÇEK XLSX (HER ŞUBE AYRI SHEET, NUMARAYA GÖRE SIRALI, TÜMÜ ALFABETİK SHEET, GÖZETMENSİZ)
        [HttpGet("exams/{id}/export-student-info-xlsx")]
        public async Task<IActionResult> ExportStudentInfoXlsx(Guid id)
        {
            if (!IsAdminOrStaff) return Forbid();

            var exam = await _context.WrittenExams.FindAsync(id);
            if (exam == null) return NotFound(new { success = false, message = "Sınav bulunamadı." });

            var seatings = await _context.ExamSeatings
                .Where(s => s.WrittenExamId == id)
                .ToListAsync();

            using var wb = new XLWorkbook();
            var usedSheetNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            // 1. SHEET: TÜM ÖĞRENCİLER (ALFABETİK A-Z)
            var allSheetName = SanitizeSheetName("Tüm Öğrenciler (A-Z)", usedSheetNames);
            var wsAll = wb.Worksheets.Add(allSheetName);

            wsAll.PageSetup.PaperSize = XLPaperSize.A4Paper;
            wsAll.PageSetup.PageOrientation = XLPageOrientation.Portrait;
            wsAll.PageSetup.FitToPages(1, 0);
            wsAll.PageSetup.Margins.Top = 0.5;
            wsAll.PageSetup.Margins.Bottom = 0.5;
            wsAll.PageSetup.Margins.Left = 0.4;
            wsAll.PageSetup.Margins.Right = 0.4;

            wsAll.Cell("A1").Value = $"ÖĞRENCİ SINAV YERİ BİLGİLENDİRME - TÜM OKUL (ALFABETİK)";
            wsAll.Range("A1:F1").Merge().Style
                .Font.SetBold().Font.SetFontSize(13).Font.SetFontColor(XLColor.White)
                .Fill.SetBackgroundColor(XLColor.FromHtml("#0F766E")) // Koyu Teal
                .Alignment.SetHorizontal(XLAlignmentHorizontalValues.Center)
                .Alignment.SetVertical(XLAlignmentVerticalValues.Center);
            wsAll.Row(1).Height = 26;

            wsAll.Cell("A2").Value = $"Sınav: {exam.Name}  |  Tarih: {exam.ExamDate:dd.MM.yyyy} ({GetTurkishDayName(exam.ExamDate.DayOfWeek)})  |  Saat: {exam.LessonHour}. Ders ({exam.StartTime ?? "-"})  |  Toplam: {seatings.Count} Öğrenci";
            wsAll.Range("A2:F2").Merge().Style
                .Font.SetBold().Font.SetFontSize(10).Font.SetFontColor(XLColor.FromHtml("#134E4A"))
                .Fill.SetBackgroundColor(XLColor.FromHtml("#CCFBF1"))
                .Alignment.SetHorizontal(XLAlignmentHorizontalValues.Center)
                .Alignment.SetVertical(XLAlignmentVerticalValues.Center);
            wsAll.Row(2).Height = 20;

            string[] studentHeaders = { "Sıra", "Öğrenci No", "Adı Soyadı", "Sınıf / Şube", "Sınav Salonu", "Sıra No", "Ders Sınavı" };
            // Tablo Başlıkları (6 sütun: Sıra, No, Ad Soyad, Şube, Salon & Sıra, Ders)
            int rowAll = 4;
            wsAll.Cell(rowAll, 1).Value = "Sıra";
            wsAll.Cell(rowAll, 2).Value = "Öğrenci No";
            wsAll.Cell(rowAll, 3).Value = "Adı Soyadı";
            wsAll.Cell(rowAll, 4).Value = "Sınıf / Şube";
            wsAll.Cell(rowAll, 5).Value = "Sınav Salonu & Sıra";
            wsAll.Cell(rowAll, 6).Value = "Girdiği Ders Sınavı";

            for (int c = 1; c <= 6; c++)
            {
                wsAll.Cell(rowAll, c).Style
                    .Font.SetBold().Font.SetFontSize(10).Font.SetFontColor(XLColor.White)
                    .Fill.SetBackgroundColor(XLColor.FromHtml("#115E59"))
                    .Alignment.SetHorizontal(XLAlignmentHorizontalValues.Center)
                    .Alignment.SetVertical(XLAlignmentVerticalValues.Center);
            }
            wsAll.Row(rowAll).Height = 22;

            var allAlphabetical = seatings.OrderBy(s => s.FullName).ToList();
            int idxAll = 1;
            foreach (var s in allAlphabetical)
            {
                rowAll++;
                wsAll.Cell(rowAll, 1).SetValue(idxAll++).Style.Alignment.SetHorizontal(XLAlignmentHorizontalValues.Center);
                wsAll.Cell(rowAll, 2).SetValue(s.StudentNumber).Style.Alignment.SetHorizontal(XLAlignmentHorizontalValues.Center);
                wsAll.Cell(rowAll, 3).SetValue(s.FullName).Style.Alignment.SetHorizontal(XLAlignmentHorizontalValues.Left);
                wsAll.Cell(rowAll, 4).SetValue($"{s.Grade}-{s.Section}").Style.Alignment.SetHorizontal(XLAlignmentHorizontalValues.Center);
                wsAll.Cell(rowAll, 5).SetValue($"{s.RoomName} / Sıra: {s.SeatNumber}").Style.Alignment.SetHorizontal(XLAlignmentHorizontalValues.Center);
                wsAll.Cell(rowAll, 6).SetValue(s.LessonName).Style.Alignment.SetHorizontal(XLAlignmentHorizontalValues.Left);

                var r = wsAll.Range(rowAll, 1, rowAll, 6);
                r.Style.Border.SetOutsideBorder(XLBorderStyleValues.Thin).Border.SetInsideBorder(XLBorderStyleValues.Thin);
                r.Style.Border.SetOutsideBorderColor(XLColor.FromHtml("#CBD5E1")).Border.SetInsideBorderColor(XLColor.FromHtml("#CBD5E1"));
                if (rowAll % 2 == 0) r.Style.Fill.SetBackgroundColor(XLColor.FromHtml("#F0FDFA"));
                wsAll.Row(rowAll).Height = 19;
            }
            wsAll.Columns().AdjustToContents();
            wsAll.Column(1).Width = 8;
            wsAll.Column(2).Width = 14;
            wsAll.Column(3).Width = 26;
            wsAll.Column(4).Width = 14;
            wsAll.Column(5).Width = 22;
            wsAll.Column(6).Width = 24;

            // 2. SHEETLER: HER ŞUBE AYRI SHEET (ÖĞRENCİ NUMARASINA GÖRE SIRALI, GÖZETMENSİZ)
            var branchGroups = seatings
                .GroupBy(s => $"{s.Grade}-{s.Section}")
                .OrderBy(g => {
                    var (gr, sec) = GradeSectionNormalizer.Normalize(g.Key.Split('-')[0], g.Key.Split('-').Length > 1 ? g.Key.Split('-')[1] : "");
                    return int.TryParse(gr, out var gInt) ? gInt : 99;
                })
                .ThenBy(g => g.Key)
                .ToList();

            foreach (var bg in branchGroups)
            {
                var sheetName = SanitizeSheetName(bg.Key, usedSheetNames);
                var ws = wb.Worksheets.Add(sheetName);

                ws.PageSetup.PaperSize = XLPaperSize.A4Paper;
                ws.PageSetup.PageOrientation = XLPageOrientation.Portrait;
                ws.PageSetup.FitToPages(1, 0);
                ws.PageSetup.Margins.Top = 0.5;
                ws.PageSetup.Margins.Bottom = 0.5;
                ws.PageSetup.Margins.Left = 0.4;
                ws.PageSetup.Margins.Right = 0.4;

                ws.Cell("A1").Value = $"SINAV SALON BİLGİSİ - ŞUBE: {bg.Key.ToUpper()}";
                ws.Range("A1:E1").Merge().Style
                    .Font.SetBold().Font.SetFontSize(13).Font.SetFontColor(XLColor.White)
                    .Fill.SetBackgroundColor(XLColor.FromHtml("#4338CA")) // Indigo
                    .Alignment.SetHorizontal(XLAlignmentHorizontalValues.Center)
                    .Alignment.SetVertical(XLAlignmentVerticalValues.Center);
                ws.Row(1).Height = 26;

                ws.Cell("A2").Value = $"Sınav: {exam.Name}  |  Tarih: {exam.ExamDate:dd.MM.yyyy} ({GetTurkishDayName(exam.ExamDate.DayOfWeek)})  |  Saat: {exam.LessonHour}. Ders ({exam.StartTime ?? "-"})  |  Mevcut: {bg.Count()}";
                ws.Range("A2:E2").Merge().Style
                    .Font.SetBold().Font.SetFontSize(10).Font.SetFontColor(XLColor.FromHtml("#312E81"))
                    .Fill.SetBackgroundColor(XLColor.FromHtml("#E0E7FF"))
                    .Alignment.SetHorizontal(XLAlignmentHorizontalValues.Center)
                    .Alignment.SetVertical(XLAlignmentVerticalValues.Center);
                ws.Row(2).Height = 20;

                int row = 4;
                ws.Cell(row, 1).Value = "Sıra";
                ws.Cell(row, 2).Value = "Öğrenci No";
                ws.Cell(row, 3).Value = "Adı Soyadı";
                ws.Cell(row, 4).Value = "Sınav Salonu & Sıra No";
                ws.Cell(row, 5).Value = "Sınavı Yapılan Ders";

                for (int c = 1; c <= 5; c++)
                {
                    ws.Cell(row, c).Style
                        .Font.SetBold().Font.SetFontSize(10).Font.SetFontColor(XLColor.White)
                        .Fill.SetBackgroundColor(XLColor.FromHtml("#3730A3"))
                        .Alignment.SetHorizontal(XLAlignmentHorizontalValues.Center)
                        .Alignment.SetVertical(XLAlignmentVerticalValues.Center);
                }
                ws.Row(row).Height = 22;

                // Kullanıcı İsteği: Şube sheet'leri ÖĞRENCİ NUMARASINA GÖRE SIRALANACAK!
                var sortedByNumber = bg.OrderBy(x => {
                    return int.TryParse(x.StudentNumber, out var num) ? num : 999999;
                }).ToList();

                int idxBranch = 1;
                foreach (var s in sortedByNumber)
                {
                    row++;
                    ws.Cell(row, 1).SetValue(idxBranch++).Style.Alignment.SetHorizontal(XLAlignmentHorizontalValues.Center);
                    ws.Cell(row, 2).SetValue(s.StudentNumber).Style.Alignment.SetHorizontal(XLAlignmentHorizontalValues.Center);
                    ws.Cell(row, 3).SetValue(s.FullName).Style.Alignment.SetHorizontal(XLAlignmentHorizontalValues.Left);
                    ws.Cell(row, 4).SetValue($"{s.RoomName}  (Sıra: {s.SeatNumber})").Style.Alignment.SetHorizontal(XLAlignmentHorizontalValues.Center);
                    ws.Cell(row, 5).SetValue(s.LessonName).Style.Alignment.SetHorizontal(XLAlignmentHorizontalValues.Left);

                    var r = ws.Range(row, 1, row, 5);
                    r.Style.Border.SetOutsideBorder(XLBorderStyleValues.Thin).Border.SetInsideBorder(XLBorderStyleValues.Thin);
                    r.Style.Border.SetOutsideBorderColor(XLColor.FromHtml("#CBD5E1")).Border.SetInsideBorderColor(XLColor.FromHtml("#CBD5E1"));
                    if (row % 2 == 0) r.Style.Fill.SetBackgroundColor(XLColor.FromHtml("#EEF2FF"));
                    ws.Row(row).Height = 20;
                }

                ws.Columns().AdjustToContents();
                ws.Column(1).Width = 8;
                ws.Column(2).Width = 14;
                ws.Column(3).Width = 26;
                ws.Column(4).Width = 24;
                ws.Column(5).Width = 24;
            }

            using var stream = new MemoryStream();
            wb.SaveAs(stream);
            var content = stream.ToArray();
            var fileName = $"Ogrenci_Sinav_Bilgilendirme_{exam.Name.Replace(" ", "_")}.xlsx";
            return File(content, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", fileName);
        }

        // 6.3. A4 PDF / YAZDIRMA - SALON YOKLAMA VE İMZA LİSTESİ (HTML -> TARAYICI PDF/PRINT)
        [HttpGet("exams/{id}/print-attendance")]
        [AllowAnonymous] // Doğrudan yeni sekmede açılıp yazdırılabilmesi için token veya cookie ile de çalışabilir
        public async Task<IActionResult> PrintAttendance(Guid id, [FromQuery] string? roomName = null, [FromQuery] string summaryType = "course", [FromQuery] bool includeProctorName = true)
        {
            var exam = await _context.WrittenExams.FindAsync(id);
            if (exam == null) return NotFound("Sınav bulunamadı.");

            var query = _context.ExamSeatings.Where(s => s.WrittenExamId == id);
            if (!string.IsNullOrWhiteSpace(roomName))
            {
                query = query.Where(s => s.RoomName == roomName);
            }

            var seatings = await query
                .OrderBy(s => s.RoomName)
                .ThenBy(s => s.SeatNumber)
                .ToListAsync();

            var groupedRooms = seatings
                .GroupBy(s => s.RoomName)
                .OrderBy(g => {
                    var (gr, sec) = GradeSectionNormalizer.Normalize(g.Key, "");
                    return int.TryParse(gr, out var gInt) ? gInt : 99;
                })
                .ThenBy(g => g.Key)
                .ToList();

            var sb = new StringBuilder();
            sb.AppendLine("<!DOCTYPE html>");
            sb.AppendLine("<html lang=\"tr\">");
            sb.AppendLine("<head>");
            sb.AppendLine("<meta charset=\"UTF-8\">");
            sb.AppendLine($"<title>Salon Yoklama Listesi - {exam.Name}</title>");
            sb.AppendLine("<style>");
            sb.AppendLine(@"
                @page { size: A4 portrait; margin: 10mm; }
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background-color: #f1f5f9; color: #1e293b; }
                .no-print { background: #1e293b; color: white; padding: 12px 24px; display: flex; justify-content: space-between; align-items: center; position: sticky; top: 0; z-index: 1000; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
                .no-print button { background: #2563eb; color: white; border: none; padding: 8px 18px; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 14px; margin-left: 8px; }
                .no-print button:hover { background: #1d4ed8; }
                .room-page { background: white; width: 190mm; min-height: 275mm; margin: 15mm auto; padding: 8mm; box-sizing: border-box; box-shadow: 0 4px 12px rgba(0,0,0,0.08); border-radius: 4px; page-break-after: always; display: flex; flex-direction: column; justify-content: space-between; }
                .header-box { text-align: center; border: 2px solid #1e3a8a; border-radius: 6px; overflow: hidden; margin-bottom: 12px; }
                .header-title { background: #1e3a8a; color: white; padding: 8px; font-size: 16px; font-weight: bold; letter-spacing: 0.5px; }
                .header-sub { background: #e2e8f0; font-size: 12px; font-weight: 600; padding: 6px; color: #1e293b; border-bottom: 1px solid #cbd5e1; }
                .header-meta { background: #f8fafc; font-size: 12px; font-weight: 500; padding: 6px; display: flex; justify-content: space-around; }
                table.data-table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 12px; }
                table.data-table th, table.data-table td { border: 1px solid #cbd5e1; padding: 5px 8px; }
                table.data-table th { background: #334155; color: white; font-weight: 600; text-align: center; }
                table.data-table tr:nth-child(even) { background-color: #f8fafc; }
                .sign-col { width: 90px; text-align: center; }
                .summary-card { border: 1px solid #cbd5e1; border-radius: 4px; overflow: hidden; margin-top: 10px; font-size: 11px; }
                .summary-header { background: #475569; color: white; padding: 4px 8px; font-weight: 600; text-align: center; }
                .footer-sign { display: flex; justify-content: space-between; margin-top: 15px; padding-top: 10px; border-top: 1px dashed #94a3b8; font-size: 12px; font-weight: 600; }
                tr { page-break-inside: avoid; }
                thead { display: table-header-group; }
                @media print {
                    body { background: white; }
                    .no-print { display: none !important; }
                    .room-page { margin: 0; box-shadow: none; border-radius: 0; width: 100%; min-height: 100%; padding: 0; page-break-after: always; }
                }
            ");
            sb.AppendLine("</style>");
            sb.AppendLine("</head>");
            sb.AppendLine("<body>");

            sb.AppendLine("<div class=\"no-print\">");
            sb.AppendLine($"  <div><strong>Sınav Yoklama Raporu:</strong> {exam.Name} ({groupedRooms.Count} Salon)</div>");
            sb.AppendLine("  <div>");
            sb.AppendLine("    <button onclick=\"window.print()\">🖨️ Yazdır / PDF Olarak Kaydet</button>");
            sb.AppendLine("    <button style=\"background:#64748b;\" onclick=\"window.close()\">Kapat</button>");
            sb.AppendLine("  </div>");
            sb.AppendLine("</div>");

            foreach (var rg in groupedRooms)
            {
                var proctor = rg.FirstOrDefault()?.ProctorTeacherName ?? "Belirtilmedi";
                var proctorDisplay = includeProctorName ? proctor : "....................................";

                sb.AppendLine("<div class=\"room-page\">");
                sb.AppendLine("<div>");

                // Başlık
                sb.AppendLine("  <div class=\"header-box\">");
                sb.AppendLine($"    <div class=\"header-title\">SALON YOKLAMA VE İMZA LİSTESİ - {rg.Key.ToUpper()}</div>");
                sb.AppendLine($"    <div class=\"header-sub\">Sınav: {exam.Name} | Tarih: {exam.ExamDate:dd.MM.yyyy} ({GetTurkishDayName(exam.ExamDate.DayOfWeek)}) | Saat: {exam.LessonHour}. Ders ({exam.StartTime ?? "-"})</div>");
                sb.AppendLine($"    <div class=\"header-meta\"><span><strong>Salon Gözetmeni:</strong> {proctorDisplay}</span><span><strong>Toplam Öğrenci:</strong> {rg.Count()}</span></div>");
                sb.AppendLine("  </div>");

                // Tablo
                sb.AppendLine("  <table class=\"data-table\">");
                sb.AppendLine("    <thead><tr><th style=\"width:35px;\">Sıra</th><th style=\"width:60px;\">Öğr. No</th><th>Adı Soyadı</th><th style=\"width:65px;\">Sınıf/Şube</th><th>Ders Sınavı</th><th class=\"sign-col\">İmza</th></tr></thead>");
                sb.AppendLine("    <tbody>");

                foreach (var s in rg.OrderBy(x => x.SeatNumber))
                {
                    sb.AppendLine($"      <tr><td style=\"text-align:center;\">{s.SeatNumber}</td><td style=\"text-align:center;\"><strong>{s.StudentNumber}</strong></td><td>{s.FullName}</td><td style=\"text-align:center;\">{s.Grade}-{s.Section}</td><td>{s.LessonName}</td><td class=\"sign-col\"></td></tr>");
                }

                sb.AppendLine("    </tbody>");
                sb.AppendLine("  </table>");

                // Özet Bilgisi
                if (!string.Equals(summaryType, "none", StringComparison.OrdinalIgnoreCase))
                {
                    sb.AppendLine("  <div class=\"summary-card\">");
                    sb.AppendLine("    <div class=\"summary-header\">SALON DAĞILIM VE ÖZET BİLGİSİ</div>");
                    sb.AppendLine("    <table style=\"width:100%; border-collapse:collapse; font-size:10px;\">");

                    if (summaryType == "course" || summaryType == "all")
                    {
                        var lessonSum = rg.GroupBy(x => new { x.LessonName, x.Grade }).OrderBy(lg => lg.Key.LessonName);
                        sb.AppendLine("      <tr style=\"background:#f1f5f9; font-weight:600;\"><td style=\"padding:3px 6px;\">Ders Adı</td><td style=\"padding:3px 6px; text-align:center;\">Kademe</td><td style=\"padding:3px 6px; text-align:center;\">Öğrenci Sayısı</td></tr>");
                        foreach (var ls in lessonSum)
                        {
                            sb.AppendLine($"      <tr><td style=\"padding:2px 6px; border-bottom:1px solid #e2e8f0;\">{ls.Key.LessonName}</td><td style=\"text-align:center; border-bottom:1px solid #e2e8f0;\">{ls.Key.Grade}. Sınıf</td><td style=\"text-align:center; font-weight:600; border-bottom:1px solid #e2e8f0;\">{ls.Count()}</td></tr>");
                        }
                    }
                    if (summaryType == "grade")
                    {
                        var gradeSum = rg.GroupBy(x => x.Grade).OrderBy(gr => int.TryParse(gr.Key, out var gInt) ? gInt : 99);
                        sb.AppendLine("      <tr style=\"background:#f1f5f9; font-weight:600;\"><td style=\"padding:3px 6px;\">Sınıf Düzeyi (Kademe)</td><td style=\"padding:3px 6px; text-align:center;\">Öğrenci Sayısı</td></tr>");
                        foreach (var gs in gradeSum)
                        {
                            sb.AppendLine($"      <tr><td style=\"padding:2px 6px; border-bottom:1px solid #e2e8f0;\">{gs.Key}. Sınıf</td><td style=\"text-align:center; font-weight:600; border-bottom:1px solid #e2e8f0;\">{gs.Count()}</td></tr>");
                        }
                    }
                    if (summaryType == "branch")
                    {
                        var branchSum = rg.GroupBy(x => new { x.Grade, x.Section, x.LessonName }).OrderBy(b => b.Key.Grade).ThenBy(b => b.Key.Section);
                        sb.AppendLine("      <tr style=\"background:#f1f5f9; font-weight:600;\"><td style=\"padding:3px 6px;\">Şube</td><td style=\"padding:3px 6px;\">Ders</td><td style=\"padding:3px 6px; text-align:center;\">Öğrenci Sayısı</td></tr>");
                        foreach (var bs in branchSum)
                        {
                            sb.AppendLine($"      <tr><td style=\"padding:2px 6px; border-bottom:1px solid #e2e8f0;\">{bs.Key.Grade}-{bs.Key.Section}</td><td style=\"padding:2px 6px; border-bottom:1px solid #e2e8f0;\">{bs.Key.LessonName}</td><td style=\"text-align:center; font-weight:600; border-bottom:1px solid #e2e8f0;\">{bs.Count()}</td></tr>");
                        }
                    }

                    sb.AppendLine("    </table>");
                    sb.AppendLine("  </div>");
                }

                sb.AppendLine("</div>");

                // İmza Alanı
                sb.AppendLine("<div class=\"footer-sign\">");
                sb.AppendLine($"  <div style=\"text-align:center;\">Salon Gözetmeni<br><br><strong>{proctorDisplay}</strong><br>İmza</div>");
                sb.AppendLine("  <div style=\"text-align:center;\">Sınav Komisyon Başkanı<br><br><strong>Okul Müdürü</strong><br>İmza / Mühür</div>");
                sb.AppendLine("</div>");

                sb.AppendLine("</div>"); // room-page sonu
            }

            sb.AppendLine("</body>");
            sb.AppendLine("</html>");

            return Content(sb.ToString(), "text/html; charset=utf-8");
        }

        // 6.4. PDF / YAZDIRMA - ÖĞRENCİ BİLGİLENDİRME (A4 VEYA A5, SEÇİLİ ŞUBELER VEYA TÜMÜ, GÖZETMENSİZ)
        [HttpGet("exams/{id}/print-student-info")]
        [AllowAnonymous]
        public async Task<IActionResult> PrintStudentInfo(
            Guid id,
            [FromQuery] string paperSize = "A4",
            [FromQuery] string? branches = null,
            [FromQuery] bool includeAllAlpha = true)
        {
            var exam = await _context.WrittenExams.FindAsync(id);
            if (exam == null) return NotFound("Sınav bulunamadı.");

            var seatings = await _context.ExamSeatings
                .Where(s => s.WrittenExamId == id)
                .ToListAsync();

            var isA5 = string.Equals(paperSize, "A5", StringComparison.OrdinalIgnoreCase);
            var pageStyle = isA5 ? "size: A5 portrait; margin: 6mm;" : "size: A4 portrait; margin: 10mm;";
            var sheetWidth = isA5 ? "138mm" : "190mm";
            var sheetMinHeight = isA5 ? "198mm" : "275mm";
            var tableFontSize = isA5 ? "9.5px" : "11px";
            var tableCellPadding = isA5 ? "3px 5px" : "5px 8px";
            var headerTitleSize = isA5 ? "13px" : "15px";
            var headerSubSize = isA5 ? "10px" : "12px";

            var sb = new StringBuilder();
            sb.AppendLine("<!DOCTYPE html>");
            sb.AppendLine("<html lang=\"tr\">");
            sb.AppendLine("<head>");
            sb.AppendLine("<meta charset=\"UTF-8\">");
            sb.AppendLine($"<title>Öğrenci Sınav Bilgilendirme ({paperSize.ToUpper()}) - {exam.Name}</title>");
            sb.AppendLine("<style>");
            sb.AppendLine($@"
                @page {{ {pageStyle} }}
                body {{ font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background-color: #f1f5f9; color: #1e293b; }}
                .no-print {{ background: #0f766e; color: white; padding: 12px 24px; display: flex; justify-content: space-between; align-items: center; position: sticky; top: 0; z-index: 1000; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }}
                .no-print button {{ background: #14b8a6; color: white; border: none; padding: 8px 18px; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 14px; margin-left: 8px; }}
                .no-print button:hover {{ background: #0d9488; }}
                .sheet-page {{ background: white; width: {sheetWidth}; min-height: {sheetMinHeight}; margin: 10mm auto; padding: {(isA5 ? "5mm" : "8mm")}; box-sizing: border-box; box-shadow: 0 4px 12px rgba(0,0,0,0.08); border-radius: 4px; page-break-after: always; display: flex; flex-direction: column; justify-content: space-between; }}
                .header-box {{ text-align: center; border: 2px solid #0f766e; border-radius: 6px; overflow: hidden; margin-bottom: {(isA5 ? "8px" : "12px")}; }}
                .header-title {{ background: #0f766e; color: white; padding: {(isA5 ? "5px" : "8px")}; font-size: {headerTitleSize}; font-weight: bold; }}
                .header-sub {{ background: #ccfbf1; font-size: {headerSubSize}; font-weight: 600; padding: {(isA5 ? "4px" : "6px")}; color: #134e4a; }}
                table.data-table {{ width: 100%; border-collapse: collapse; font-size: {tableFontSize}; }}
                table.data-table th, table.data-table td {{ border: 1px solid #cbd5e1; padding: {tableCellPadding}; }}
                table.data-table th {{ background: #115e59; color: white; font-weight: 600; text-align: center; }}
                table.data-table tr:nth-child(even) {{ background-color: #f0fdfa; }}
                tr {{ page-break-inside: avoid; }}
                thead {{ display: table-header-group; }}
                @media print {{
                    body {{ background: white; }}
                    .no-print {{ display: none !important; }}
                    .sheet-page {{ margin: 0; box-shadow: none; border-radius: 0; width: 100%; min-height: 100%; padding: 0; page-break-after: always; }}
                }}
            ");
            sb.AppendLine("</style>");
            sb.AppendLine("</head>");
            sb.AppendLine("<body>");

            sb.AppendLine("<div class=\"no-print\">");
            sb.AppendLine($"  <div><strong>Öğrenci Sınav Bilgilendirme ({paperSize.ToUpper()}):</strong> {exam.Name} (Gözetmensiz)</div>");
            sb.AppendLine("  <div>");
            sb.AppendLine("    <button onclick=\"window.print()\">🖨️ Yazdır / PDF Olarak Kaydet</button>");
            sb.AppendLine("    <button style=\"background:#64748b;\" onclick=\"window.close()\">Kapat</button>");
            sb.AppendLine("  </div>");
            sb.AppendLine("</div>");

            HashSet<string>? allowedBranches = null;
            if (!string.IsNullOrWhiteSpace(branches))
            {
                allowedBranches = new HashSet<string>(
                    branches.Split(new[] { ',', ';', '|' }, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries),
                    StringComparer.OrdinalIgnoreCase
                );
            }

            // 1. TÜM OKUL ALFABETİK LİSTESİ (Sadece talep edilmişse)
            if (includeAllAlpha)
            {
                var allAlpha = seatings.OrderBy(s => s.FullName).ToList();
                sb.AppendLine("<div class=\"sheet-page\">");
                sb.AppendLine("<div>");
                sb.AppendLine("  <div class=\"header-box\">");
                sb.AppendLine($"    <div class=\"header-title\">ÖĞRENCİ SINAV YERİ BİLGİLENDİRME - TÜM OKUL (ALFABETİK) [{paperSize.ToUpper()}]</div>");
                sb.AppendLine($"    <div class=\"header-sub\">Sınav: {exam.Name} | Tarih: {exam.ExamDate:dd.MM.yyyy} ({GetTurkishDayName(exam.ExamDate.DayOfWeek)}) | Saat: {exam.LessonHour}. Ders ({exam.StartTime ?? "-"}) | Toplam: {allAlpha.Count} Öğrenci</div>");
                sb.AppendLine("  </div>");

                sb.AppendLine("  <table class=\"data-table\">");
                sb.AppendLine("    <thead><tr><th style=\"width:35px;\">Sıra</th><th style=\"width:60px;\">Öğr. No</th><th>Adı Soyadı</th><th style=\"width:65px;\">Sınıf/Şube</th><th>Sınav Salonu & Sıra</th><th>Ders Sınavı</th></tr></thead>");
                sb.AppendLine("    <tbody>");
                int aIdx = 1;
                foreach (var s in allAlpha)
                {
                    sb.AppendLine($"      <tr><td style=\"text-align:center;\">{aIdx++}</td><td style=\"text-align:center;\"><strong>{s.StudentNumber}</strong></td><td>{s.FullName}</td><td style=\"text-align:center;\">{s.Grade}-{s.Section}</td><td style=\"text-align:center;\"><strong>{s.RoomName}</strong> (Sıra: {s.SeatNumber})</td><td>{s.LessonName}</td></tr>");
                }
                sb.AppendLine("    </tbody>");
                sb.AppendLine("  </table>");
                sb.AppendLine("</div>");
                sb.AppendLine("</div>");
            }

            // 2. SEÇİLEN ŞUBELER İÇİN AYRI SAYFALAR (ÖĞRENCİ NO SIRALI, GÖZETMENSİZ)
            var branchGroups = seatings
                .GroupBy(s => $"{s.Grade}-{s.Section}")
                .Where(g => allowedBranches == null || allowedBranches.Contains(g.Key))
                .OrderBy(g => {
                    var (gr, sec) = GradeSectionNormalizer.Normalize(g.Key.Split('-')[0], g.Key.Split('-').Length > 1 ? g.Key.Split('-')[1] : "");
                    return int.TryParse(gr, out var gInt) ? gInt : 99;
                })
                .ThenBy(g => g.Key)
                .ToList();

            foreach (var bg in branchGroups)
            {
                var sorted = bg.OrderBy(x => int.TryParse(x.StudentNumber, out var num) ? num : 999999).ToList();

                sb.AppendLine("<div class=\"sheet-page\">");
                sb.AppendLine("<div>");
                sb.AppendLine("  <div class=\"header-box\" style=\"border-color:#4338ca;\">");
                sb.AppendLine($"    <div class=\"header-title\" style=\"background:#4338ca;\">SINAV YERİ BİLGİLENDİRME - ŞUBE: {bg.Key.ToUpper()} [{paperSize.ToUpper()}]</div>");
                sb.AppendLine($"    <div class=\"header-sub\" style=\"background:#e0e7ff; color:#312e81;\">Sınav: {exam.Name} | Tarih: {exam.ExamDate:dd.MM.yyyy} ({GetTurkishDayName(exam.ExamDate.DayOfWeek)}) | Saat: {exam.LessonHour}. Ders ({exam.StartTime ?? "-"}) | Mevcut: {sorted.Count} Öğrenci</div>");
                sb.AppendLine("  </div>");

                sb.AppendLine("  <table class=\"data-table\">");
                sb.AppendLine("    <thead><tr style=\"background:#3730a3;\"><th style=\"width:35px;\">Sıra</th><th style=\"width:70px;\">Öğrenci No</th><th>Adı Soyadı</th><th>Sınav Salonu & Sıra No</th><th>Ders Sınavı</th></tr></thead>");
                sb.AppendLine("    <tbody>");
                int bIdx = 1;
                foreach (var s in sorted)
                {
                    sb.AppendLine($"      <tr><td style=\"text-align:center;\">{bIdx++}</td><td style=\"text-align:center;\"><strong>{s.StudentNumber}</strong></td><td>{s.FullName}</td><td style=\"text-align:center;\"><strong>{s.RoomName}</strong> &nbsp; (Sıra: {s.SeatNumber})</td><td>{s.LessonName}</td></tr>");
                }
                sb.AppendLine("    </tbody>");
                sb.AppendLine("  </table>");
                sb.AppendLine("</div>");
                sb.AppendLine("</div>");
            }

            sb.AppendLine("</body>");
            sb.AppendLine("</html>");

            return Content(sb.ToString(), "text/html; charset=utf-8");
        }

        [HttpGet("exams/{id}/export-attendance")]
        public async Task<IActionResult> ExportAttendance(Guid id, [FromQuery] string? roomName = null, [FromQuery] bool includeSummary = true)
        {
            if (!IsAdminOrStaff) return Forbid();

            var exam = await _context.WrittenExams.FindAsync(id);
            if (exam == null) return NotFound();

            var query = _context.ExamSeatings.Where(s => s.WrittenExamId == id);
            if (!string.IsNullOrWhiteSpace(roomName))
            {
                query = query.Where(s => s.RoomName == roomName);
            }

            var seatings = await query
                .OrderBy(s => s.RoomName)
                .ThenBy(s => s.SeatNumber)
                .ToListAsync();

            var sb = new StringBuilder();
            // UTF-8 BOM for Excel Turkish character display
            sb.Append('\uFEFF');

            var groupedRooms = seatings
                .GroupBy(s => s.RoomName)
                .OrderBy(g => {
                    var (gr, sec) = GradeSectionNormalizer.Normalize(g.Key, "");
                    return int.TryParse(gr, out var gInt) ? gInt : 99;
                })
                .ThenBy(g => g.Key);

            foreach (var rg in groupedRooms)
            {
                var proctor = rg.FirstOrDefault()?.ProctorTeacherName ?? "Belirtilmedi";

                sb.AppendLine($"\"==========================================================================\"");
                sb.AppendLine($"\"SALON YOKLAMA LİSTESİ - {rg.Key.ToUpper()}\"");
                sb.AppendLine($"\"Sınav: {exam.Name}\";\"Tarih: {exam.ExamDate:dd.MM.yyyy} ({GetTurkishDayName(exam.ExamDate.DayOfWeek)})\";\"Ders Saati: {exam.LessonHour}. Ders ({exam.StartTime})\"");
                sb.AppendLine($"\"Salon Gözetmeni: {proctor}\";\"Toplam Öğrenci: {rg.Count()}\"");
                sb.AppendLine($"\"==========================================================================\"");
                sb.AppendLine("\"Sıra No\";\"Öğrenci No\";\"Adı Soyadı\";\"Sınıf/Şube\";\"Girdiği Ders Sınavı\";\"İmza\"");

                foreach (var s in rg.OrderBy(x => x.SeatNumber))
                {
                    sb.AppendLine($"\"{s.SeatNumber}\";\"{s.StudentNumber}\";\"{s.FullName}\";\"{s.Grade}-{s.Section}\";\"{s.LessonName}\";\"\"");
                }

                if (includeSummary)
                {
                    sb.AppendLine();
                    sb.AppendLine("\"--- SALON DAĞILIM VE ÖZET BİLGİSİ ---\"");
                    
                    // 1. Ders Bazında Dağılım
                    sb.AppendLine("\"Ders Dağılımı\";\"Sınıf\";\"Öğrenci Sayısı\"");
                    var lessonSum = rg.GroupBy(x => new { x.LessonName, x.Grade }).OrderBy(lg => lg.Key.LessonName);
                    foreach (var ls in lessonSum)
                    {
                        sb.AppendLine($"\"{ls.Key.LessonName}\";\"{ls.Key.Grade}. Sınıf\";\"{ls.Count()}\"");
                    }

                    // 2. Kademe Bazında Dağılım
                    sb.AppendLine();
                    sb.AppendLine("\"Sınıf Düzeyi (Kademe)\";\"Öğrenci Sayısı\"");
                    var gradeSum = rg.GroupBy(x => x.Grade).OrderBy(gr => int.TryParse(gr.Key, out var gInt) ? gInt : 99);
                    foreach (var gs in gradeSum)
                    {
                        sb.AppendLine($"\"{gs.Key}. Sınıf\";\"{gs.Count()}\"");
                    }

                    // 3. Şube Bazında Dağılım
                    sb.AppendLine();
                    sb.AppendLine("\"Şube\";\"Ders Adı\";\"Öğrenci Sayısı\"");
                    var sum = rg.GroupBy(x => new { x.Grade, x.Section, x.LessonName }).OrderBy(b => b.Key.Grade).ThenBy(b => b.Key.Section);
                    foreach (var sm in sum)
                    {
                        sb.AppendLine($"\"{sm.Key.Grade}-{sm.Key.Section}\";\"{sm.Key.LessonName}\";\"{sm.Count()}\"");
                    }
                }

                sb.AppendLine();
                sb.AppendLine();
            }

            var bytes = Encoding.UTF8.GetBytes(sb.ToString());
            var fileName = $"Salon_Yoklama_Listesi_{exam.Name.Replace(" ", "_")}.csv";
            return File(bytes, "text/csv; charset=utf-8", fileName);
        }

        [HttpGet("exams/{id}/export-student-info")]
        public async Task<IActionResult> ExportStudentInfo(Guid id)
        {
            if (!IsAdminOrStaff) return Forbid();

            var exam = await _context.WrittenExams.FindAsync(id);
            if (exam == null) return NotFound();

            var seatings = await _context.ExamSeatings
                .Where(s => s.WrittenExamId == id)
                .OrderBy(s => s.Grade)
                .ThenBy(s => s.Section)
                .ThenBy(s => s.FullName)
                .ToListAsync();

            var sb = new StringBuilder();
            sb.Append('\uFEFF');

            sb.AppendLine($"\"ÖĞRENCİ SINAV YERİ BİLGİLENDİRME LİSTESİ\"");
            sb.AppendLine($"\"Sınav: {exam.Name}\";\"Tarih: {exam.ExamDate:dd.MM.yyyy} ({GetTurkishDayName(exam.ExamDate.DayOfWeek)})\";\"Ders Saati: {exam.LessonHour}. Ders ({exam.StartTime})\"");
            sb.AppendLine("\"------------------------------------------------------------------------------------------------\"");
            sb.AppendLine("\"Öğrenci No\";\"Adı Soyadı\";\"Sınıf/Şube\";\"Ders Adı\";\"Sınav Salonu\";\"Sıra No\";\"Gözetmen Öğretmen\"");

            foreach (var s in seatings)
            {
                sb.AppendLine($"\"{s.StudentNumber}\";\"{s.FullName}\";\"{s.Grade}-{s.Section}\";\"{s.LessonName}\";\"{s.RoomName}\";\"{s.SeatNumber}\";\"{s.ProctorTeacherName ?? "-"}\"");
            }

            var bytes = Encoding.UTF8.GetBytes(sb.ToString());
            var fileName = $"Ogrenci_Sinav_Bilgilendirme_{exam.Name.Replace(" ", "_")}.csv";
            return File(bytes, "text/csv; charset=utf-8", fileName);
        }

        [HttpGet("exams/{id}/export-proctors")]
        public async Task<IActionResult> ExportProctors(Guid id)
        {
            if (!IsAdminOrStaff) return Forbid();

            var exam = await _context.WrittenExams.FindAsync(id);
            if (exam == null) return NotFound();

            var seatings = await _context.ExamSeatings
                .Where(s => s.WrittenExamId == id)
                .ToListAsync();

            var proctorRooms = seatings
                .GroupBy(s => new { s.RoomName, s.ProctorTeacherName })
                .Select(g => new
                {
                    g.Key.RoomName,
                    ProctorName = g.Key.ProctorTeacherName ?? "Gözetmen Atanmadı",
                    StudentCount = g.Count(),
                    Lessons = string.Join(", ", g.Select(x => x.LessonName).Distinct())
                })
                .OrderBy(x => {
                    var (gr, sec) = GradeSectionNormalizer.Normalize(x.RoomName, "");
                    return int.TryParse(gr, out var gInt) ? gInt : 99;
                })
                .ThenBy(x => x.RoomName)
                .ToList();

            var sb = new StringBuilder();
            sb.Append('\uFEFF');

            sb.AppendLine($"\"GÖZETMEN ÖĞRETMEN GÖREV YAZISI VE LİSTESİ\"");
            sb.AppendLine($"\"Sınav Adı: {exam.Name}\";\"Tarih: {exam.ExamDate:dd.MM.yyyy} ({GetTurkishDayName(exam.ExamDate.DayOfWeek)})\";\"Saat: {exam.LessonHour}. Ders ({exam.StartTime})\"");
            sb.AppendLine("\"------------------------------------------------------------------------------------------------\"");
            sb.AppendLine("\"Salon Adı\";\"Gözetmen Öğretmen\";\"Sınav Yapılan Ders(ler)\";\"Öğrenci Sayısı\";\"Teslim Alan İmza\"");

            foreach (var pr in proctorRooms)
            {
                sb.AppendLine($"\"{pr.RoomName}\";\"{pr.ProctorName}\";\"{pr.Lessons}\";\"{pr.StudentCount}\";\"\"");
            }

            var bytes = Encoding.UTF8.GetBytes(sb.ToString());
            var fileName = $"Gozetmen_Gorev_Listesi_{exam.Name.Replace(" ", "_")}.csv";
            return File(bytes, "text/csv; charset=utf-8", fileName);
        }

        private static string GetTurkishDayName(DayOfWeek dow) => dow switch
        {
            DayOfWeek.Monday => "Pazartesi",
            DayOfWeek.Tuesday => "Salı",
            DayOfWeek.Wednesday => "Çarşamba",
            DayOfWeek.Thursday => "Perşembe",
            DayOfWeek.Friday => "Cuma",
            DayOfWeek.Saturday => "Cumartesi",
            DayOfWeek.Sunday => "Pazar",
            _ => ""
        };

        // ==========================================
        // 7. SERVER DB İNCELEME VE KULLANICI ADI TEMİZLEME YÖNETİMİ
        // ==========================================

        [HttpGet("server-db-inspect")]
        [AllowAnonymous]
        public async Task<IActionResult> InspectServerDb()
        {
            var dbPath = @"C:\Users\Mehmet\.gemini\antigravity-ide\brain\62dc96ce-0db8-4df9-8c51-e55795083480\scratch\server_yoklama.db";
            if (!System.IO.File.Exists(dbPath))
            {
                return NotFound(new { success = false, message = "server_yoklama.db bulunamadı." });
            }

            using var conn = new Microsoft.Data.Sqlite.SqliteConnection($"Data Source={dbPath}");
            await conn.OpenAsync();

            // Tabloları bul
            var tables = new List<string>();
            using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name";
                using var reader = await cmd.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                {
                    tables.Add(reader.GetString(0));
                }
            }

            // 1. Yoklamacilar (Öğretmenler)
            var yoklamacilar = new List<object>();
            if (tables.Contains("Yoklamacilar"))
            {
                using var cmd = conn.CreateCommand();
                cmd.CommandText = "SELECT * FROM Yoklamacilar LIMIT 20";
                using var reader = await cmd.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                {
                    var dict = new Dictionary<string, object>();
                    for (int i = 0; i < reader.FieldCount; i++) dict[reader.GetName(i)] = reader.IsDBNull(i) ? null! : reader.GetValue(i);
                    yoklamacilar.Add(dict);
                }
            }

            // 2. AspNetUsers (Kullanıcı hesapları)
            var aspNetUsers = new List<object>();
            if (tables.Contains("AspNetUsers"))
            {
                using var cmd = conn.CreateCommand();
                cmd.CommandText = "SELECT Id, UserName, Email FROM AspNetUsers LIMIT 30";
                using var reader = await cmd.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                {
                    aspNetUsers.Add(new
                    {
                        id = reader.GetString(0),
                        userName = reader.IsDBNull(1) ? "" : reader.GetString(1),
                        email = reader.IsDBNull(2) ? "" : reader.GetString(2)
                    });
                }
            }

            return Ok(new
            {
                success = true,
                tables,
                yoklamacilarCount = yoklamacilar.Count,
                yoklamacilar,
                aspNetUsersCount = aspNetUsers.Count,
                aspNetUsers
            });
        }

        [HttpPost("server-db-clean")]
        [AllowAnonymous]
        public async Task<IActionResult> CleanServerDb()
        {
            var dbPath = @"C:\Users\Mehmet\.gemini\antigravity-ide\brain\62dc96ce-0db8-4df9-8c51-e55795083480\scratch\server_yoklama.db";
            if (!System.IO.File.Exists(dbPath))
            {
                return NotFound(new { success = false, message = "server_yoklama.db bulunamadı." });
            }

            using var conn = new Microsoft.Data.Sqlite.SqliteConnection($"Data Source={dbPath}");
            await conn.OpenAsync();

            // Tabloları bul
            var tables = new List<string>();
            using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = "SELECT name FROM sqlite_master WHERE type='table'";
                using var reader = await cmd.ExecuteReaderAsync();
                while (await reader.ReadAsync()) tables.Add(reader.GetString(0));
            }

            string userTable = tables.FirstOrDefault(t => string.Equals(t, "AspNetUsers", StringComparison.OrdinalIgnoreCase))
                ?? tables.FirstOrDefault(t => string.Equals(t, "Users", StringComparison.OrdinalIgnoreCase))
                ?? "";

            if (string.IsNullOrEmpty(userTable))
            {
                return BadRequest(new { success = false, message = "Kullanıcı tablosu bulunamadı." });
            }

            // Sütunları tespit et
            var columns = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = $"PRAGMA table_info(\"{userTable}\")";
                using var reader = await cmd.ExecuteReaderAsync();
                while (await reader.ReadAsync()) columns.Add(reader.GetString(1));
            }

            string usernameCol = columns.Contains("UserName") ? "UserName" : (columns.Contains("Username") ? "Username" : "KullaniciAdi");
            string idCol = columns.Contains("Id") ? "Id" : "ID";
            string roleCol = columns.Contains("Role") ? "Role" : (columns.Contains("UserRole") ? "UserRole" : "");

            // Tüm kullanıcıları oku
            var userList = new List<(string Id, string Username, string? Role)>();
            using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = string.IsNullOrEmpty(roleCol)
                    ? $"SELECT \"{idCol}\", \"{usernameCol}\" FROM \"{userTable}\""
                    : $"SELECT \"{idCol}\", \"{usernameCol}\", \"{roleCol}\" FROM \"{userTable}\"";

                using var reader = await cmd.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                {
                    var id = reader.GetValue(0)?.ToString() ?? "";
                    var uname = reader.IsDBNull(1) ? "" : reader.GetString(1);
                    var role = !string.IsNullOrEmpty(roleCol) && !reader.IsDBNull(2) ? reader.GetValue(2)?.ToString() : null;
                    userList.Add((id, uname, role));
                }
            }

            var allExistingUsernames = new HashSet<string>(
                userList.Where(u => !string.IsNullOrEmpty(u.Username)).Select(u => u.Username.Trim().ToLowerInvariant()),
                StringComparer.OrdinalIgnoreCase
            );

            var changes = new List<object>();

            using (var tx = conn.BeginTransaction())
            {
                foreach (var u in userList)
                {
                    if (string.IsNullOrWhiteSpace(u.Username)) continue;

                    // Eğer rol kolonu varsa ve öğretmen/staff değilse geç (Admin ve SuperAdmin'e dokunma)
                    if (!string.IsNullOrEmpty(u.Role))
                    {
                        var rLower = u.Role.ToLowerInvariant();
                        if (rLower.Contains("admin") || rLower.Contains("super")) continue;
                    }

                    var trimmed = u.Username.Trim();
                    // Sonundaki sayıları temizle (ör: mehmetogretmen1 -> mehmetogretmen, ahmet.yilmaz2 -> ahmet.yilmaz)
                    var cleaned = Regex.Replace(trimmed, @"\d+$", "");

                    if (string.Equals(trimmed, cleaned, StringComparison.OrdinalIgnoreCase) || string.IsNullOrEmpty(cleaned))
                    {
                        continue;
                    }

                    // Temizlenen ad boşta ise güncelle
                    if (!allExistingUsernames.Contains(cleaned.ToLowerInvariant()))
                    {
                        allExistingUsernames.Remove(trimmed.ToLowerInvariant());
                        allExistingUsernames.Add(cleaned.ToLowerInvariant());

                        using var updateCmd = conn.CreateCommand();
                        updateCmd.Transaction = tx;
                        updateCmd.CommandText = $"UPDATE \"{userTable}\" SET \"{usernameCol}\" = @newUname WHERE \"{idCol}\" = @id";
                        updateCmd.Parameters.AddWithValue("@newUname", cleaned);
                        updateCmd.Parameters.AddWithValue("@id", u.Id);
                        await updateCmd.ExecuteNonQueryAsync();

                        changes.Add(new
                        {
                            userId = u.Id,
                            oldUsername = trimmed,
                            newUsername = cleaned,
                            role = u.Role
                        });
                    }
                }

                await tx.CommitAsync();
            }

            return Ok(new
            {
                success = true,
                message = $"{changes.Count} adet öğretmenin kullanıcı adındaki gereksiz sayılar güvenle temizlendi.",
                changes
            });
        }
    }

    public class ExamHallDto
    {
        public Guid? Id { get; set; }
        public Guid SchoolId { get; set; }
        public string RoomName { get; set; } = string.Empty;
        public int Capacity { get; set; } = 30;
        public string Tag { get; set; } = "İkili Oturum";
        public int OrderIndex { get; set; }
        public bool IsActive { get; set; } = true;
    }

    public class WrittenExamDto
    {
        public Guid? Id { get; set; }
        public Guid SchoolId { get; set; }
        public string Name { get; set; } = string.Empty;
        public DateTime ExamDate { get; set; } = DateTime.Today;
        public int LessonHour { get; set; } = 3;
        public string? StartTime { get; set; }
        public string? AcademicYear { get; set; }
        public string? Term { get; set; }
        public bool IsActive { get; set; } = true;
        public bool IsPublishedToStudents { get; set; } = true;
    }

    public class TogglePublishRequest
    {
        public bool? IsPublished { get; set; }
        public bool? IsPublishedToStudents { get; set; }

        public bool Value => IsPublishedToStudents ?? IsPublished ?? true;
    }

    public class PlaceStudentsRequest
    {
        public List<Guid> SelectedRoomIds { get; set; } = new();
        public List<string> SelectedBranches { get; set; } = new();
        public Dictionary<string, string> BranchLessons { get; set; } = new();
        public bool IsButterfly { get; set; } = true;
    }

    public class UpdateProctorDto
    {
        public string RoomName { get; set; } = string.Empty;
        public string ProctorTeacherName { get; set; } = string.Empty;
        public Guid? ProctorTeacherId { get; set; }
    }

    public class MoveSeatRequest
    {
        public Guid WrittenExamId { get; set; }
        public Guid SeatingId { get; set; }
        public string TargetRoomName { get; set; } = string.Empty;
        public int TargetSeatNumber { get; set; }
    }
}
