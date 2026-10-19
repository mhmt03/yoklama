using System;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OgretmenAjanda.Api.Data;
using OgretmenAjanda.Api.DTOs;
using OgretmenAjanda.Api.Models;
using OgretmenAjanda.Api.Services;

namespace OgretmenAjanda.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class SyncController : ControllerBase
    {
        private readonly AppDbContext _context;
        private readonly IAuditLogService _auditLogService;

        public SyncController(AppDbContext context, IAuditLogService auditLogService)
        {
            _context = context;
            _auditLogService = auditLogService;
        }

        private Guid CurrentUserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        private string CurrentUserRole => User.FindFirstValue(ClaimTypes.Role)!;
        private string? CurrentUserName => User.FindFirstValue(ClaimTypes.Name) ?? User.Identity?.Name;
        private bool IsTeacher => string.Equals(CurrentUserRole, UserRoles.Teacher, StringComparison.OrdinalIgnoreCase);

        private async Task LogActionAsync(Guid? schoolId, string actionType, string entityName, string? entityId, string description, string? detailsJson = null)
        {
            try
            {
                var user = await _context.Users.FindAsync(CurrentUserId);
                await _auditLogService.LogAsync(
                    _context,
                    schoolId,
                    CurrentUserId,
                    user?.Username ?? CurrentUserName,
                    user?.FullName,
                    CurrentUserRole,
                    actionType,
                    entityName,
                    entityId,
                    description,
                    detailsJson,
                    HttpContext?.Connection?.RemoteIpAddress?.ToString()
                );
            }
            catch {}
        }

        // 1. Öğrencileri Toplu Kaydet (Atomik Batch - Admin telefonu hazırlar, tek seferde kaydeder)
        [HttpPost("students/batch")]
        public async Task<IActionResult> BatchSyncStudents([FromBody] BatchStudentSyncRequest request)
        {
            if (IsTeacher)
            {
                return StatusCode(StatusCodes.Status403Forbidden, new { message = "Okula bağlı öğretmenler toplu öğrenci yükleme yetkisine sahip değildir. Bu işlem yalnızca okul idaresi tarafından yapılabilir." });
            }

            if (request.Students == null || !request.Students.Any())
            {
                return BadRequest(new { message = "Yüklenecek öğrenci listesi boş." });
            }

            var school = await _context.Schools.FindAsync(request.SchoolId);
            if (school == null) return NotFound(new { message = "Okul bulunamadı." });

            foreach (var item in request.Students)
            {
                var existing = await _context.Students
                    .FirstOrDefaultAsync(s => s.SchoolId == request.SchoolId && s.StudentNumber == item.StudentNumber.Trim());

                if (existing != null)
                {
                    existing.FullName = item.FullName.Trim();
                    existing.Grade = item.Grade.Trim();
                    existing.Section = item.Section.Trim();
                    if (!string.IsNullOrEmpty(item.PhotoPath)) existing.PhotoPath = item.PhotoPath;
                    if (!string.IsNullOrEmpty(item.ParentName)) existing.ParentName = item.ParentName;
                    if (!string.IsNullOrEmpty(item.ParentPhone)) existing.ParentPhone = item.ParentPhone;
                    if (!string.IsNullOrEmpty(item.StudentPhone)) existing.StudentPhone = item.StudentPhone;
                    existing.UpdatedAt = DateTime.UtcNow;
                }
                else
                {
                    var newStudent = new Student
                    {
                        Id = item.Id != Guid.Empty ? item.Id : Guid.NewGuid(),
                        SchoolId = request.SchoolId,
                        StudentNumber = item.StudentNumber.Trim(),
                        FullName = item.FullName.Trim(),
                        Grade = item.Grade.Trim(),
                        Section = item.Section.Trim(),
                        PhotoPath = item.PhotoPath,
                        ParentName = item.ParentName,
                        ParentPhone = item.ParentPhone,
                        StudentPhone = item.StudentPhone,
                        CreatedAt = DateTime.UtcNow,
                        UpdatedAt = DateTime.UtcNow
                    };
                    await _context.Students.AddAsync(newStudent);
                }
            }

            _context.AuditLogs.Add(new AuditLog
            {
                SchoolId = request.SchoolId,
                UserId = CurrentUserId,
                UserRole = CurrentUserRole,
                ActionType = "BATCH_STUDENTS_SYNCED",
                EntityName = "Student",
                DetailsJson = $"{request.Students.Count} öğrenci başarıyla kaydedildi/güncellendi.",
                Timestamp = DateTime.UtcNow
            });

            await _context.SaveChangesAsync();
            return Ok(new { message = $"{request.Students.Count} öğrenci başarıyla sunucuya kaydedildi." });
        }

        // 1.1 Tek Öğrenci Ekle (Admin Doğrudan Server'a Ekler)
        [HttpPost("students/single")]
        public async Task<IActionResult> CreateSingleStudent([FromBody] CreateSingleStudentRequest request)
        {
            if (IsTeacher)
            {
                return StatusCode(StatusCodes.Status403Forbidden, new { message = "Okula bağlı öğretmenler öğrenci ekleme yetkisine sahip değildir. Bu işlem yalnızca okul idaresi tarafından yapılabilir." });
            }

            var school = await _context.Schools.FindAsync(request.SchoolId);
            if (school == null) return NotFound(new { message = "Okul bulunamadı." });

            var studentNumber = request.StudentNumber.Trim();
            var exists = await _context.Students.AnyAsync(s => s.SchoolId == request.SchoolId && s.StudentNumber == studentNumber);
            if (exists)
            {
                return BadRequest(new { message = $"{studentNumber} numaralı öğrenci bu okulda zaten mevcut." });
            }

            var student = new Student
            {
                Id = Guid.NewGuid(),
                SchoolId = request.SchoolId,
                RelationId = school.RelationId,
                StudentNumber = studentNumber,
                FullName = request.FullName.Trim(),
                Grade = request.Grade.Trim(),
                Section = request.Section.Trim().ToUpper(),
                ParentName = request.ParentName?.Trim(),
                ParentPhone = request.ParentPhone?.Trim(),
                StudentPhone = request.StudentPhone?.Trim(),
                PhotoPath = request.PhotoPath,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };

            await _context.Students.AddAsync(student);

            _context.AuditLogs.Add(new AuditLog
            {
                SchoolId = request.SchoolId,
                UserId = CurrentUserId,
                UserRole = CurrentUserRole,
                ActionType = "STUDENT_CREATED",
                EntityName = "Student",
                EntityId = student.Id.ToString(),
                DetailsJson = $"{student.FullName} ({student.StudentNumber} - {student.Grade}/{student.Section}) eklendi.",
                Timestamp = DateTime.UtcNow
            });

            await _context.SaveChangesAsync();
            return Ok(student);
        }

        // 1.2 Öğrenci Düzenle (Admin Doğrudan Server'da Düzenler)
        [HttpPut("students/{studentId}")]
        public async Task<IActionResult> UpdateStudent(Guid studentId, [FromBody] UpdateStudentRequest request)
        {
            if (IsTeacher)
            {
                return StatusCode(StatusCodes.Status403Forbidden, new { message = "Okula bağlı öğretmenler öğrenci düzenleme yetkisine sahip değildir. Bu işlem yalnızca okul idaresi tarafından yapılabilir." });
            }

            var student = await _context.Students.FindAsync(studentId);
            if (student == null) return NotFound(new { message = "Öğrenci bulunamadı." });

            student.FullName = request.FullName.Trim();
            student.StudentNumber = request.StudentNumber.Trim();
            student.Grade = request.Grade.Trim();
            student.Section = request.Section.Trim().ToUpper();
            if (request.ParentName != null) student.ParentName = request.ParentName.Trim();
            if (request.ParentPhone != null) student.ParentPhone = request.ParentPhone.Trim();
            if (request.StudentPhone != null) student.StudentPhone = request.StudentPhone.Trim();
            if (request.PhotoPath != null) student.PhotoPath = request.PhotoPath;
            student.UpdatedAt = DateTime.UtcNow;

            await _context.SaveChangesAsync();
            return Ok(student);
        }

        // 1.3 Öğrenci Sil (Admin Doğrudan Server'dan Siler)
        [HttpDelete("students/{studentId}")]
        public async Task<IActionResult> DeleteStudent(Guid studentId)
        {
            if (IsTeacher)
            {
                return StatusCode(StatusCodes.Status403Forbidden, new { message = "Okula bağlı öğretmenler öğrenci silme yetkisine sahip değildir. Bu işlem yalnızca okul idaresi tarafından yapılabilir." });
            }

            var student = await _context.Students.FindAsync(studentId);
            if (student == null) return NotFound(new { message = "Öğrenci bulunamadı." });

            _context.Students.Remove(student);

            _context.AuditLogs.Add(new AuditLog
            {
                SchoolId = student.SchoolId,
                UserId = CurrentUserId,
                UserRole = CurrentUserRole,
                ActionType = "STUDENT_DELETED",
                EntityName = "Student",
                EntityId = student.Id.ToString(),
                DetailsJson = $"{student.FullName} ({student.StudentNumber}) silindi.",
                Timestamp = DateTime.UtcNow
            });

            await _context.SaveChangesAsync();
            return Ok(new { message = "Öğrenci silindi." });
        }

        // 1.4 Öğrenci Fotoğrafı Güncelle
        [HttpPut("students/{studentId}/photo")]
        public async Task<IActionResult> UpdateStudentPhoto(Guid studentId, [FromBody] UpdatePhotoRequest request)
        {
            if (IsTeacher)
            {
                return StatusCode(StatusCodes.Status403Forbidden, new { message = "Okula bağlı öğretmenler öğrenci fotoğrafı güncelleme yetkisine sahip değildir. Bu işlem yalnızca okul idaresi tarafından yapılabilir." });
            }

            var student = await _context.Students.FindAsync(studentId);
            if (student == null) return NotFound(new { message = "Öğrenci bulunamadı." });

            student.PhotoPath = request.PhotoPath;
            student.UpdatedAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();

            return Ok(new { message = "Öğrenci fotoğrafı güncellendi.", photoPath = student.PhotoPath });
        }

        // 2. Okulun Öğrencilerini Çek (Öğretmen cihazına hazır çekme)
        [AllowAnonymous]
        [HttpGet("students")]
        public async Task<IActionResult> GetStudents(
            [FromQuery] Guid? schoolId = null,
            [FromQuery] string? schoolCode = null,
            [FromQuery] string? className = null,
            [FromQuery] string? grade = null,
            [FromQuery] string? section = null)
        {
            var query = _context.Students.AsQueryable();

            if (schoolId.HasValue && schoolId.Value != Guid.Empty)
            {
                query = query.Where(s => s.SchoolId == schoolId.Value);
            }
            else if (!string.IsNullOrEmpty(schoolCode))
            {
                var school = await _context.Schools.FirstOrDefaultAsync(s => s.Code == schoolCode.Trim());
                if (school == null)
                {
                    return NotFound(new { message = "Belirtilen okul koduna ait okul bulunamadı." });
                }
                query = query.Where(s => s.SchoolId == school.Id);
            }

            if (!string.IsNullOrEmpty(grade))
            {
                query = query.Where(s => s.Grade == grade.Trim());
            }

            if (!string.IsNullOrEmpty(section))
            {
                query = query.Where(s => s.Section == section.Trim());
            }

            if (!string.IsNullOrEmpty(className))
            {
                var cleanClass = className.Trim();
                var parts = cleanClass.Split(new[] { '-', '/', ' ' }, StringSplitOptions.RemoveEmptyEntries);
                if (parts.Length == 2)
                {
                    var g = parts[0];
                    var sec = parts[1];
                    query = query.Where(s => (s.Grade == g && s.Section == sec) || (s.Grade + "-" + s.Section == cleanClass));
                }
                else
                {
                    query = query.Where(s => s.Section == cleanClass || s.Grade == cleanClass || (s.Grade + "-" + s.Section == cleanClass));
                }
            }

            var students = await query
                .OrderBy(s => s.Grade)
                .ThenBy(s => s.Section)
                .ThenBy(s => s.StudentNumber)
                .Select(s => new
                {
                    s.Id,
                    s.SchoolId,
                    s.StudentNumber,
                    s.FullName,
                    s.Grade,
                    s.Section,
                    s.PhotoPath,
                    s.ParentName,
                    s.ParentPhone,
                    s.StudentPhone
                })
                .ToListAsync();

            return Ok(students);
        }

        // 3. Ders Programını Toplu Kaydet (AI Çarşaf Program Çıktısı)
        [HttpPost("schedules/batch")]
        public async Task<IActionResult> BatchSyncSchedules([FromBody] BatchScheduleSyncRequest request)
        {
            var school = await _context.Schools.FindAsync(request.SchoolId);
            if (school == null) return NotFound();

            // 1. Sınıfları ve Şubeleri Eşle / Ekle
            int addedClassesCount = 0;
            if (request.SyncClasses && request.Classes != null && request.Classes.Count > 0)
            {
                var existingClasses = await _context.SchoolClasses
                    .Where(c => c.SchoolId == request.SchoolId)
                    .ToListAsync();

                foreach (var classStr in request.Classes)
                {
                    if (string.IsNullOrWhiteSpace(classStr)) continue;
                    var parts = classStr.Trim().Split(new[] { '-', '/', ' ' }, StringSplitOptions.RemoveEmptyEntries);
                    string grade = parts.Length > 0 ? parts[0] : classStr.Trim();
                    string section = parts.Length > 1 ? parts[1].ToUpper() : "A";

                    if (!existingClasses.Any(c => c.Grade == grade && c.Section == section))
                    {
                        var newClass = new SchoolClass
                        {
                            Id = Guid.NewGuid(),
                            SchoolId = request.SchoolId,
                            Grade = grade,
                            Section = section,
                            AcademicYear = $"{DateTime.UtcNow.Year}-{DateTime.UtcNow.Year + 1}",
                            CreatedAt = DateTime.UtcNow
                        };
                        _context.SchoolClasses.Add(newClass);
                        existingClasses.Add(newClass);
                        addedClassesCount++;
                    }
                }
            }

            // 2. Dersleri Ders Havuzuna Eşle / Ekle
            int addedLessonsCount = 0;
            if (request.SyncLessons && ((request.Lessons != null && request.Lessons.Count > 0) || (request.LessonDetails != null && request.LessonDetails.Count > 0)))
            {
                var existingLessons = await _context.SchoolLessons
                    .Where(l => l.SchoolId == request.SchoolId)
                    .ToListAsync();

                var lessonNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                if (request.Lessons != null)
                {
                    foreach (var l in request.Lessons) if (!string.IsNullOrWhiteSpace(l)) lessonNames.Add(l.Trim());
                }
                if (request.LessonDetails != null)
                {
                    foreach (var ld in request.LessonDetails) if (!string.IsNullOrWhiteSpace(ld.Name)) lessonNames.Add(ld.Name.Trim());
                }

                foreach (var cleanLesson in lessonNames)
                {
                    var detail = request.LessonDetails?.FirstOrDefault(ld => string.Equals(ld.Name.Trim(), cleanLesson, StringComparison.OrdinalIgnoreCase));
                    int realWeeklyHours = (detail != null && detail.WeeklyHours.HasValue && detail.WeeklyHours.Value > 0) ? detail.WeeklyHours.Value : 2;
                    string shortCode = detail?.Code?.Trim() ?? (cleanLesson.Length > 3 ? cleanLesson.Substring(0, 3).ToUpper() : cleanLesson.ToUpper());
                    string grade = !string.IsNullOrWhiteSpace(detail?.Grade) ? detail.Grade.Trim() : "Tüm Kademeler";

                    var existing = existingLessons.FirstOrDefault(l => string.Equals(l.Name.Trim(), cleanLesson, StringComparison.OrdinalIgnoreCase));
                    if (existing != null)
                    {
                        if (detail != null && detail.WeeklyHours.HasValue && detail.WeeklyHours.Value > 0 && existing.WeeklyHours != detail.WeeklyHours.Value)
                        {
                            existing.WeeklyHours = detail.WeeklyHours.Value;
                        }
                    }
                    else
                    {
                        var newLesson = new SchoolLesson
                        {
                            Id = Guid.NewGuid(),
                            SchoolId = request.SchoolId,
                            Name = cleanLesson,
                            ShortCode = shortCode,
                            Grade = grade,
                            WeeklyHours = realWeeklyHours,
                            CreatedAt = DateTime.UtcNow
                        };
                        _context.SchoolLessons.Add(newLesson);
                        existingLessons.Add(newLesson);
                        addedLessonsCount++;
                    }
                }
            }

            // 3. Öğretmenleri Ekle / Kadroya Tanımla
            int addedTeachersCount = 0;
            if (request.SyncTeachers && request.Teachers != null && request.Teachers.Count > 0)
            {
                var existingTeachers = await _context.Users
                    .Where(u => u.SchoolId == request.SchoolId && u.Role == UserRoles.Teacher)
                    .ToListAsync();

                foreach (var teacherName in request.Teachers)
                {
                    var cleanTeacher = teacherName?.Trim();
                    if (string.IsNullOrWhiteSpace(cleanTeacher)) continue;

                    if (!existingTeachers.Any(t => string.Equals(t.FullName.Trim(), cleanTeacher, StringComparison.OrdinalIgnoreCase)))
                    {
                        var safeUsername = cleanTeacher.ToLower()
                            .Replace("ç", "c").Replace("ğ", "g").Replace("ı", "i")
                            .Replace("ö", "o").Replace("ş", "s").Replace("ü", "u")
                            .Replace(" ", ".");
                        var username = $"{safeUsername}.{Random.Shared.Next(100, 999)}";

                        var newTeacher = new User
                        {
                            Id = Guid.NewGuid(),
                            SchoolId = request.SchoolId,
                            FullName = cleanTeacher,
                            Username = username,
                            PasswordHash = BCrypt.Net.BCrypt.HashPassword("1234"),
                            Role = UserRoles.Teacher,
                            IsActive = true,
                            CreatedAt = DateTime.UtcNow
                        };
                        _context.Users.Add(newTeacher);
                        existingTeachers.Add(newTeacher);
                        addedTeachersCount++;
                    }
                }
            }

            // 4. Haftalık Ders Programını Eşle / Kaydet
            int savedScheduleCount = 0;
            if (request.SyncSchedules && request.Schedules != null && request.Schedules.Count > 0)
            {
                if (request.OverwriteAll)
                {
                    var existingItems = _context.ScheduleItems.Where(s => s.SchoolId == request.SchoolId);
                    _context.ScheduleItems.RemoveRange(existingItems);

                    foreach (var item in request.Schedules)
                    {
                        _context.ScheduleItems.Add(new ScheduleItem
                        {
                            Id = item.Id != Guid.Empty ? item.Id : Guid.NewGuid(),
                            SchoolId = request.SchoolId,
                            TeacherName = item.TeacherName,
                            DayOfWeek = item.DayOfWeek,
                            LessonHour = item.LessonHour,
                            Grade = item.Grade,
                            Section = item.Section,
                            LessonName = item.LessonName,
                            LessonCode = item.LessonCode?.Trim(),
                            Classroom = item.Classroom
                        });
                        savedScheduleCount++;
                    }
                }
                else
                {
                    // Mevcut verileri koruyarak yalnızca değişiklikleri yansıt (Merge / Update)
                    var existingList = await _context.ScheduleItems
                        .Where(s => s.SchoolId == request.SchoolId)
                        .ToListAsync();

                    foreach (var item in request.Schedules)
                    {
                        var existing = existingList.FirstOrDefault(s =>
                            s.DayOfWeek == item.DayOfWeek &&
                            s.LessonHour == item.LessonHour &&
                            (
                                (!string.IsNullOrEmpty(s.TeacherName) && !string.IsNullOrEmpty(item.TeacherName) && string.Equals(s.TeacherName.Trim(), item.TeacherName.Trim(), StringComparison.OrdinalIgnoreCase)) ||
                                (!string.IsNullOrEmpty(s.Grade) && !string.IsNullOrEmpty(item.Grade) && s.Grade == item.Grade && s.Section == item.Section)
                            )
                        );

                        if (existing != null)
                        {
                            existing.TeacherName = item.TeacherName;
                            existing.Grade = item.Grade;
                            existing.Section = item.Section;
                            existing.LessonName = item.LessonName;
                            if (!string.IsNullOrEmpty(item.LessonCode)) existing.LessonCode = item.LessonCode.Trim();
                            if (!string.IsNullOrEmpty(item.Classroom)) existing.Classroom = item.Classroom;
                        }
                        else
                        {
                            _context.ScheduleItems.Add(new ScheduleItem
                            {
                                Id = item.Id != Guid.Empty ? item.Id : Guid.NewGuid(),
                                SchoolId = request.SchoolId,
                                TeacherName = item.TeacherName,
                                DayOfWeek = item.DayOfWeek,
                                LessonHour = item.LessonHour,
                                Grade = item.Grade,
                                Section = item.Section,
                                LessonName = item.LessonName,
                                LessonCode = item.LessonCode?.Trim(),
                                Classroom = item.Classroom
                            });
                        }
                        savedScheduleCount++;
                    }
                }
            }

            var modeText = request.OverwriteAll ? "Sıfırdan Temiz Kurulum (Mevcut Program Silindi)" : "Mevcutları Koru & Güncelle";
            var detailText = $"{modeText}. Kaydedilen: {addedTeachersCount} yeni öğretmen, {addedClassesCount} yeni şube, {addedLessonsCount} yeni ders, {savedScheduleCount} ders saati.";

            _context.AuditLogs.Add(new AuditLog
            {
                SchoolId = request.SchoolId,
                UserId = CurrentUserId,
                UserRole = CurrentUserRole,
                ActionType = "BATCH_SCHEDULE_SYNCED",
                EntityName = "ScheduleItem",
                DetailsJson = detailText,
                Timestamp = DateTime.UtcNow
            });

            await _context.SaveChangesAsync();
            await LogActionAsync(request.SchoolId, "BATCH_SCHEDULE_SYNCED", "ScheduleItem", null, detailText);
            
            // ⚡ Otomatik Dengeleyici: Yükleme biter bitmez çakışmaları şubelerin boş saatleriyle otomatik eşleştir
            var (autoMovedCount, autoMovedDetails) = await RunAutoReconcileInternalAsync(request.SchoolId, 8);
            if (autoMovedCount > 0)
            {
                detailText += $" | ⚡ Otomatik Dengeleme: {autoMovedCount} ders boş saatlere yerleştirildi!";
            }

            return Ok(new
            {
                message = detailText,
                addedTeachersCount,
                addedClassesCount,
                addedLessonsCount,
                savedScheduleCount,
                autoMovedCount
            });
        }

        // 4. Ders Programını Çek
        [HttpGet("schedules")]
        public async Task<IActionResult> GetSchedules([FromQuery] Guid schoolId, [FromQuery] string? teacherName)
        {
            var query = _context.ScheduleItems.Where(s => s.SchoolId == schoolId);

            if (!string.IsNullOrEmpty(teacherName))
            {
                query = query.Where(s => s.TeacherName != null && s.TeacherName.ToLower().Contains(teacherName.ToLower()));
            }

            var items = await query.ToListAsync();
            return Ok(items);
        }

        // 4.1 Tek Bir Ders Programı Hücresini Güncelle / Ekle
        [HttpPost("schedules/item")]
        public async Task<IActionResult> SaveSingleScheduleItem([FromBody] SingleScheduleItemRequest request)
        {
            var school = await _context.Schools.FindAsync(request.SchoolId);
            if (school == null) return NotFound(new { message = "Okul bulunamadı." });

            ScheduleItem? item = null;
            if (request.Id.HasValue && request.Id.Value != Guid.Empty)
            {
                item = await _context.ScheduleItems.FirstOrDefaultAsync(s => s.Id == request.Id.Value && s.SchoolId == request.SchoolId);
            }

            if (item == null)
            {
                item = await _context.ScheduleItems.FirstOrDefaultAsync(s =>
                    s.SchoolId == request.SchoolId &&
                    s.Grade == request.Grade &&
                    s.Section == request.Section &&
                    s.DayOfWeek == request.DayOfWeek &&
                    s.LessonHour == request.LessonHour);
            }

            if (item == null && !string.IsNullOrEmpty(request.TeacherName))
            {
                var tName = request.TeacherName.Trim().ToLower();
                item = await _context.ScheduleItems.FirstOrDefaultAsync(s =>
                    s.SchoolId == request.SchoolId &&
                    s.TeacherName != null && s.TeacherName.ToLower() == tName &&
                    s.DayOfWeek == request.DayOfWeek &&
                    s.LessonHour == request.LessonHour);
            }

            // Eğer ders adı boşsa veya temizlenmek isteniyorsa, sil
            if (string.IsNullOrWhiteSpace(request.LessonName))
            {
                if (item != null)
                {
                    _context.ScheduleItems.Remove(item);
                    await _context.SaveChangesAsync();
                }
                return Ok(new { success = true, action = "deleted", message = "Ders saati boşaltıldı." });
            }

            if (item != null)
            {
                item.TeacherName = request.TeacherName?.Trim();
                item.LessonName = request.LessonName.Trim();
                item.LessonCode = request.LessonCode?.Trim();
                item.Classroom = request.Classroom?.Trim();
                item.Grade = request.Grade.Trim();
                item.Section = request.Section.Trim().ToUpper();
                item.DayOfWeek = request.DayOfWeek;
                item.LessonHour = request.LessonHour;
            }
            else
            {
                item = new ScheduleItem
                {
                    Id = Guid.NewGuid(),
                    SchoolId = request.SchoolId,
                    TeacherName = request.TeacherName?.Trim(),
                    LessonName = request.LessonName.Trim(),
                    LessonCode = request.LessonCode?.Trim(),
                    Classroom = request.Classroom?.Trim(),
                    Grade = request.Grade.Trim(),
                    Section = request.Section.Trim().ToUpper(),
                    DayOfWeek = request.DayOfWeek,
                    LessonHour = request.LessonHour
                };
                _context.ScheduleItems.Add(item);
            }

            await _context.SaveChangesAsync();
            return Ok(new { success = true, action = "saved", item });
        }

        // 4.2 Tek Bir Ders Programı Hücresini Sil
        [HttpDelete("schedules/item")]
        public async Task<IActionResult> DeleteSingleScheduleItem(
            [FromQuery] Guid schoolId,
            [FromQuery] Guid? id,
            [FromQuery] string? grade,
            [FromQuery] string? section,
            [FromQuery] string? teacherName,
            [FromQuery] int? dayOfWeek,
            [FromQuery] int? lessonHour)
        {
            ScheduleItem? item = null;
            if (id.HasValue && id.Value != Guid.Empty)
            {
                item = await _context.ScheduleItems.FirstOrDefaultAsync(s => s.Id == id.Value && s.SchoolId == schoolId);
            }
            else if (!string.IsNullOrEmpty(grade) && !string.IsNullOrEmpty(section) && dayOfWeek.HasValue && lessonHour.HasValue)
            {
                item = await _context.ScheduleItems.FirstOrDefaultAsync(s =>
                    s.SchoolId == schoolId &&
                    s.Grade == grade &&
                    s.Section == section &&
                    s.DayOfWeek == dayOfWeek.Value &&
                    s.LessonHour == lessonHour.Value);
            }
            else if (!string.IsNullOrEmpty(teacherName) && dayOfWeek.HasValue && lessonHour.HasValue)
            {
                var tName = teacherName.Trim().ToLower();
                item = await _context.ScheduleItems.FirstOrDefaultAsync(s =>
                    s.SchoolId == schoolId &&
                    s.TeacherName != null && s.TeacherName.ToLower() == tName &&
                    s.DayOfWeek == dayOfWeek.Value &&
                    s.LessonHour == lessonHour.Value);
            }

            if (item == null) return NotFound(new { message = "Silinecek ders hücresi bulunamadı." });

            _context.ScheduleItems.Remove(item);
            await _context.SaveChangesAsync();
            return Ok(new { success = true, message = "Ders hücresi silindi." });
        }

        // 4.2.1 Toplu Program Silme (Tüm Okul, Tek Şube veya Tek Öğretmen)
        [HttpDelete("schedules/clear")]
        public async Task<IActionResult> ClearSchedules(
            [FromQuery] Guid schoolId,
            [FromQuery] string? scope, // "all", "class", "teacher"
            [FromQuery] string? grade,
            [FromQuery] string? section,
            [FromQuery] string? teacherName)
        {
            var query = _context.ScheduleItems.Where(s => s.SchoolId == schoolId);

            string actionMsg = "";
            if (scope == "class" && !string.IsNullOrEmpty(grade) && !string.IsNullOrEmpty(section))
            {
                query = query.Where(s => s.Grade == grade && s.Section == section);
                actionMsg = $"{grade}-{section} şubesinin tüm ders saatleri silindi.";
            }
            else if (scope == "teacher" && !string.IsNullOrEmpty(teacherName))
            {
                var tName = teacherName.Trim().ToLower();
                query = query.Where(s => s.TeacherName != null && s.TeacherName.ToLower() == tName);
                actionMsg = $"{teacherName} öğretmeninin tüm ders saatleri silindi.";
            }
            else
            {
                // Tüm okul programını sil
                actionMsg = "Okulun tüm haftalık ders programı (tüm saatler) tamamen silindi.";
            }

            var itemsToDelete = await query.ToListAsync();
            int count = itemsToDelete.Count;
            if (count > 0)
            {
                _context.ScheduleItems.RemoveRange(itemsToDelete);
                await LogActionAsync(schoolId, "SCHEDULES_CLEARED", "ScheduleItem", null, $"{actionMsg} (Toplam {count} saat)");
                await _context.SaveChangesAsync();
            }

            return Ok(new { success = true, deletedCount = count, message = $"{actionMsg} ({count} saat kaldırıldı)." });
        }

        // 4.3 Sadece Bir Öğretmenin Haftalık Programını Yenile (Tek Öğretmen Çarşaf / Fotoğraf Okuma Çıktısı)
        [HttpPost("schedules/teacher-replace")]
        public async Task<IActionResult> ReplaceTeacherSchedule([FromBody] TeacherScheduleReplaceRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.TeacherName))
                return BadRequest(new { message = "Öğretmen adı belirtilmelidir." });

            var tName = request.TeacherName.Trim().ToLower();

            // Öğretmenin mevcut program satırlarını kaldır
            var oldRows = await _context.ScheduleItems
                .Where(s => s.SchoolId == request.SchoolId && s.TeacherName != null && s.TeacherName.ToLower() == tName)
                .ToListAsync();

            if (oldRows.Any())
            {
                _context.ScheduleItems.RemoveRange(oldRows);
            }

            // Yeni program satırlarını ekle
            int added = 0;
            if (request.Schedules != null && request.Schedules.Count > 0)
            {
                foreach (var sch in request.Schedules)
                {
                    _context.ScheduleItems.Add(new ScheduleItem
                    {
                        Id = Guid.NewGuid(),
                        SchoolId = request.SchoolId,
                        TeacherName = request.TeacherName.Trim(),
                        DayOfWeek = sch.DayOfWeek,
                        LessonHour = sch.LessonHour,
                        Grade = sch.Grade.Trim(),
                        Section = sch.Section.Trim().ToUpper(),
                        LessonName = sch.LessonName.Trim(),
                        LessonCode = sch.LessonCode?.Trim(),
                        Classroom = sch.Classroom?.Trim()
                    });
                    added++;
                }
            }

            await _context.SaveChangesAsync();
            return Ok(new { success = true, message = $"{request.TeacherName} için {added} ders saati başarıyla güncellendi." });
        }

        // 4.4 Okul Ders Programı Doğruluk, Doluluk & Çakışma Denetimi (OCR Kontrol Özeti)
        [HttpGet("schedules/stats")]
        public async Task<IActionResult> GetScheduleStats([FromQuery] Guid schoolId, [FromQuery] int dailyHours = 8)
        {
            var registeredClasses = await _context.SchoolClasses
                .Where(c => c.SchoolId == schoolId)
                .OrderBy(c => c.Grade).ThenBy(c => c.Section)
                .ToListAsync();

            var registeredTeachers = await _context.Users
                .Where(u => u.SchoolId == schoolId && (u.Role == "TEACHER" || u.Role == "STAFF"))
                .ToListAsync();

            var schedules = await _context.ScheduleItems
                .Where(s => s.SchoolId == schoolId)
                .ToListAsync();

            int weeklySlotsPerClass = dailyHours * 5;
            int totalExpectedSlots = registeredClasses.Count * weeklySlotsPerClass;

            // Şube bazlı doluluk
            var classFullnessList = new List<object>();
            foreach (var cls in registeredClasses)
            {
                var classSlots = schedules.Where(s => s.Grade == cls.Grade && s.Section == cls.Section).ToList();
                int filledCount = classSlots.Count;
                int missingCount = Math.Max(0, weeklySlotsPerClass - filledCount);
                double percent = weeklySlotsPerClass > 0 ? Math.Round((double)filledCount / weeklySlotsPerClass * 100, 1) : 0;

                classFullnessList.Add(new
                {
                    grade = cls.Grade,
                    section = cls.Section,
                    className = $"{cls.Grade}-{cls.Section}",
                    filledCount,
                    expectedCount = weeklySlotsPerClass,
                    missingCount,
                    percent,
                    isFullyFilled = filledCount >= weeklySlotsPerClass
                });
            }

            // Çakışma Kontrolleri
            var conflicts = new List<object>();

            // 1. Öğretmen Çakışması: Aynı öğretmen aynı gün ve aynı saatte birden fazla sınıfta
            var teacherGroups = schedules
                .Where(s => !string.IsNullOrEmpty(s.TeacherName))
                .GroupBy(s => new { Teacher = s.TeacherName!.ToLower().Trim(), s.DayOfWeek, s.LessonHour })
                .Where(g => g.Count() > 1);

            foreach (var tg in teacherGroups)
            {
                var items = tg.ToList();
                var first = items.First();
                var conflictingClasses = string.Join(", ", items.Select(i => $"{i.Grade}-{i.Section} ({i.LessonName})"));
                conflicts.Add(new
                {
                    type = "TEACHER_CONFLICT",
                    title = "Öğretmen Çakışması",
                    teacherName = first.TeacherName,
                    dayOfWeek = first.DayOfWeek,
                    lessonHour = first.LessonHour,
                    description = $"{first.TeacherName} adlı öğretmen {first.DayOfWeek}. gün {first.LessonHour}. saatte birden fazla sınıfta görünüyor: {conflictingClasses}"
                });
            }

            // 2. Sınıf Çakışması: Aynı sınıfta aynı gün ve aynı saatte birden fazla ders/öğretmen
            var classGroups = schedules
                .GroupBy(s => new { Grade = s.Grade.Trim(), Section = s.Section.Trim().ToUpper(), s.DayOfWeek, s.LessonHour })
                .Where(g => g.Count() > 1);

            foreach (var cg in classGroups)
            {
                var items = cg.ToList();
                var first = items.First();
                var conflictingDetails = string.Join(", ", items.Select(i => $"{i.LessonName} - {i.TeacherName}"));
                conflicts.Add(new
                {
                    type = "CLASS_CONFLICT",
                    title = "Şube Çakışması",
                    className = $"{first.Grade}-{first.Section}",
                    dayOfWeek = first.DayOfWeek,
                    lessonHour = first.LessonHour,
                    description = $"{first.Grade}-{first.Section} şubesinde {first.DayOfWeek}. gün {first.LessonHour}. saatte birden fazla ders tanımlanmış: {conflictingDetails}"
                });
            }

            // 3. Öğretmen Bazlı Ders Dağılımı ve Haftalık Toplam Saatleri
            var teacherWorkloads = schedules
                .Where(s => !string.IsNullOrWhiteSpace(s.TeacherName))
                .GroupBy(s => s.TeacherName!.Trim(), StringComparer.OrdinalIgnoreCase)
                .Select(g => new
                {
                    teacherName = g.First().TeacherName!.Trim(),
                    totalHours = g.Count(),
                    classes = g.Select(s => $"{s.Grade}-{s.Section}").Distinct().OrderBy(c => c).ToList(),
                    lessons = g.Select(s => s.LessonName).Where(l => !string.IsNullOrEmpty(l)).Distinct().OrderBy(l => l).ToList()
                })
                .OrderByDescending(t => t.totalHours)
                .ThenBy(t => t.teacherName)
                .ToList();

            // 4. Detaylı Ders Dağılım Listesi (Hangi dersi kim hangi sınıfa kaç saat veriyor)
            var courseAllocations = schedules
                .GroupBy(s => new
                {
                    Lesson = (s.LessonName ?? "Belirtilmemiş").Trim(),
                    Grade = s.Grade.Trim(),
                    Section = s.Section.Trim().ToUpper(),
                    Teacher = (s.TeacherName ?? "Atanmamış").Trim()
                })
                .Select(g => new
                {
                    lessonName = g.Key.Lesson,
                    className = $"{g.Key.Grade}-{g.Key.Section}",
                    grade = g.Key.Grade,
                    section = g.Key.Section,
                    teacherName = g.Key.Teacher,
                    hours = g.Count()
                })
                .OrderBy(c => c.className)
                .ThenBy(c => c.lessonName)
                .ThenBy(c => c.teacherName)
                .ToList();

            return Ok(new
            {
                totalRegisteredClasses = registeredClasses.Count,
                totalRegisteredTeachers = registeredTeachers.Count,
                dailyHours,
                weeklyHoursPerClass = weeklySlotsPerClass,
                totalActualSlots = schedules.Count,
                totalExpectedSlots,
                overallFillPercent = totalExpectedSlots > 0 ? Math.Round((double)schedules.Count / totalExpectedSlots * 100, 1) : 0,
                classesWithSchedule = schedules.Select(s => $"{s.Grade}-{s.Section}").Distinct().Count(),
                teachersWithSchedule = schedules.Where(s => !string.IsNullOrEmpty(s.TeacherName)).Select(s => s.TeacherName!.ToLower().Trim()).Distinct().Count(),
                conflictsCount = conflicts.Count,
                conflicts,
                classFullness = classFullnessList,
                teacherWorkloads,
                courseAllocations
            });
        }

        // 4.5 Akıllı Çakışma-Boşluk Eşleştirici ve Dengeleyici (Auto-Reconcile Gaps & Conflicts)
        [HttpPost("schedules/auto-reconcile")]
        public async Task<IActionResult> AutoReconcileSchedule([FromQuery] Guid schoolId, [FromQuery] int dailyHours = 8, [FromQuery] bool includeGaps = false)
        {
            var (movedCount, movedDescriptions) = await RunAutoReconcileInternalAsync(schoolId, dailyHours);

            int placedCount = 0;
            var placedDescriptions = new List<string>();

            if (includeGaps)
            {
                var fillResult = await RunAutoFillMissingLessonsAsync(schoolId, dailyHours);
                placedCount = fillResult.placedCount;
                placedDescriptions = fillResult.placedDescriptions;
            }

            int totalActionCount = movedCount + placedCount;
            var allDetails = new List<string>(movedDescriptions);
            allDetails.AddRange(placedDescriptions);

            string msg;
            if (totalActionCount > 0)
            {
                var parts = new List<string>();
                if (movedCount > 0) parts.Add($"{movedCount} çakışan ders boş saatlere aktarıldı");
                if (placedCount > 0) parts.Add($"{placedCount} eksik ders saati müfredata göre tamamlandı");
                msg = $"{string.Join(" ve ", parts)}!";
            }
            else
            {
                msg = "Taşınabilecek çakışma veya müfredata göre eklenebilecek eksik ders bulunamadı.";
            }

            return Ok(new
            {
                success = true,
                movedCount = totalActionCount,
                reconciledConflictsCount = movedCount,
                placedGapsCount = placedCount,
                message = msg,
                details = allDetails
            });
        }

        // 4.6 Boşlukları Doldur & Eksik Öğretmen Saatlerini Müfredata Göre Tamamla
        [HttpPost("schedules/auto-fill-gaps")]
        public async Task<IActionResult> AutoFillMissingLessons([FromQuery] Guid schoolId, [FromQuery] int dailyHours = 8)
        {
            var (placedCount, placedDescriptions) = await RunAutoFillMissingLessonsAsync(schoolId, dailyHours);

            return Ok(new
            {
                success = true,
                placedCount,
                message = placedCount > 0
                    ? $"{placedCount} adet eksik ders saati müfredata ve öğretmen dağılımına göre şubelerin boş saatlerine başarıyla yerleştirildi!"
                    : "Tüm sınıflar ve öğretmen saatleri müfredata uygun veya yerleştirilebilecek boş ders bulunamadı.",
                details = placedDescriptions
            });
        }

        private async Task<(int movedCount, List<string> movedDescriptions)> RunAutoReconcileInternalAsync(Guid schoolId, int dailyHours = 8)
        {
            var schedules = await _context.ScheduleItems
                .Where(s => s.SchoolId == schoolId)
                .ToListAsync();

            if (!schedules.Any())
            {
                return (0, new List<string>());
            }

            int movedCount = 0;
            var movedDescriptions = new List<string>();

            // 🎯 ALTIN KURAL: "Hiçbir sınıfın boş dersi olamaz!" (MEB Standartı: 40/40 Saat)
            // Çoklu geçişli (Multi-pass) Dengeleme: Taşınan bir ders başka bir çakışmayı veya boşluğu açabilir.
            for (int pass = 1; pass <= 3; pass++)
            {
                int movedInPass = 0;

                // 1. ÖNCELİK: Sınıfları boş ders (eksik saat) sayısına göre sırala!
                // Boş saati en fazla olan sınıflar İLK SIRADA analiz edilir ve boşlukları doldurulur.
                var rawClassGroups = schedules
                    .GroupBy(s => $"{s.Grade.Trim()}-{s.Section.Trim().ToUpper()}")
                    .Select(cg =>
                    {
                        var classSlots = cg.ToList();
                        var occupied = new HashSet<string>(classSlots.Select(s => $"{s.DayOfWeek}_{s.LessonHour}"));
                        var emptySlots = new List<(int day, int hour)>();
                        for (int d = 1; d <= 5; d++)
                        {
                            for (int h = 1; h <= dailyHours; h++)
                            {
                                if (!occupied.Contains($"{d}_{h}"))
                                {
                                    emptySlots.Add((d, h));
                                }
                            }
                        }

                        var conflictGroups = classSlots
                            .GroupBy(s => new { s.DayOfWeek, s.LessonHour })
                            .Where(g => g.Count() > 1)
                            .ToList();

                        return new
                        {
                            ClassName = cg.Key,
                            ClassSlots = classSlots,
                            EmptySlots = emptySlots,
                            ConflictGroups = conflictGroups,
                            MissingCount = emptySlots.Count
                        };
                    })
                    .OrderByDescending(c => c.MissingCount)
                    .ThenByDescending(c => c.ConflictGroups.Count)
                    .ToList();

                // FAZ 1: Şube İçi Çakışmaları Şubenin Kendi Boş Saatlerine Yerleştirme (Önce Boş Dersi Olan Şubeler)
                foreach (var cg in rawClassGroups)
                {
                    if (!cg.ConflictGroups.Any() || !cg.EmptySlots.Any()) continue;

                    var emptySlots = new List<(int day, int hour)>(cg.EmptySlots);
                    var classSlots = cg.ClassSlots;

                    foreach (var conf in cg.ConflictGroups)
                    {
                        // 2. AKILLI ADAY PUANLAMA:
                        // Blok ders oluşturan (+25 puan) korunmalı, başka sınıfta da çakışan (-35 puan) öncelikle taşınmalı!
                        var scoredCandidates = conf.Select(item =>
                        {
                            int score = 0;

                            // Önceki saat (h-1) veya sonraki saat (h+1) ile ardışık 2 saat blok oluşturuyor mu?
                            bool hasAdjacentBlock = classSlots.Any(s =>
                                s.Id != item.Id &&
                                s.DayOfWeek == item.DayOfWeek &&
                                (s.LessonHour == item.LessonHour - 1 || s.LessonHour == item.LessonHour + 1) &&
                                !string.IsNullOrEmpty(s.TeacherName) &&
                                string.Equals(s.TeacherName.Trim(), item.TeacherName?.Trim(), StringComparison.OrdinalIgnoreCase));

                            if (hasAdjacentBlock) score += 25; // Blok ders kesinlikle yerinde kalmalı

                            // Aday öğretmenin aynı saatte başka bir şubede de çakışması var mı?
                            bool busyElsewhere = schedules.Any(other =>
                                other.Id != item.Id &&
                                !string.IsNullOrEmpty(other.TeacherName) &&
                                string.Equals(other.TeacherName.Trim(), item.TeacherName?.Trim(), StringComparison.OrdinalIgnoreCase) &&
                                other.DayOfWeek == item.DayOfWeek &&
                                other.LessonHour == item.LessonHour);

                            if (busyElsewhere) score -= 35; // Başka sınıfta da çakışan öğretmen öncelikle taşınmalı

                            return new { Item = item, Score = score };
                        })
                        .OrderBy(x => x.Score) // En düşük puanlı (taşınmaya en uygun) adaylar ilk sırada!
                        .ToList();

                        // Taşınmaya en uygun adaydan başlayarak geçerli boşluk ara
                        foreach (var candWrap in scoredCandidates)
                        {
                            var candidate = candWrap.Item;
                            (int day, int hour)? targetSlot = null;

                            var sameDayEmpty = emptySlots.Where(e => e.day == conf.Key.DayOfWeek).ToList();

                            // Tercih A: Aynı günde adayın bu sınıftaki başka bir tekil dersinin yanındaki boş saat (Blok Tamamlama)
                            foreach (var emp in sameDayEmpty)
                            {
                                bool completesBlock = classSlots.Any(s =>
                                    s.Id != candidate.Id &&
                                    s.DayOfWeek == emp.day &&
                                    (s.LessonHour == emp.hour - 1 || s.LessonHour == emp.hour + 1) &&
                                    !string.IsNullOrEmpty(s.TeacherName) &&
                                    string.Equals(s.TeacherName.Trim(), candidate.TeacherName?.Trim(), StringComparison.OrdinalIgnoreCase));

                                if (completesBlock)
                                {
                                    bool teacherBusy = !string.IsNullOrEmpty(candidate.TeacherName) && schedules.Any(other =>
                                        other.Id != candidate.Id &&
                                        !string.IsNullOrEmpty(other.TeacherName) &&
                                        string.Equals(other.TeacherName.Trim(), candidate.TeacherName.Trim(), StringComparison.OrdinalIgnoreCase) &&
                                        other.DayOfWeek == emp.day &&
                                        other.LessonHour == emp.hour);

                                    if (!teacherBusy)
                                    {
                                        targetSlot = emp;
                                        break;
                                    }
                                }
                            }

                            // Tercih B: Aynı günde öğretmenin boş olduğu en yakın boş saat
                            if (!targetSlot.HasValue)
                            {
                                var sortedSameDay = sameDayEmpty.OrderBy(e => Math.Abs(e.hour - conf.Key.LessonHour)).ToList();
                                foreach (var emp in sortedSameDay)
                                {
                                    bool teacherBusy = !string.IsNullOrEmpty(candidate.TeacherName) && schedules.Any(other =>
                                        other.Id != candidate.Id &&
                                        !string.IsNullOrEmpty(other.TeacherName) &&
                                        string.Equals(other.TeacherName.Trim(), candidate.TeacherName.Trim(), StringComparison.OrdinalIgnoreCase) &&
                                        other.DayOfWeek == emp.day &&
                                        other.LessonHour == emp.hour);

                                    if (!teacherBusy)
                                    {
                                        targetSlot = emp;
                                        break;
                                    }
                                }
                            }

                            // Tercih C: Diğer günlerde adayın tek kalan dersiyle blok oluşturan boş saat
                            if (!targetSlot.HasValue)
                            {
                                var otherDaysEmpty = emptySlots.Where(e => e.day != conf.Key.DayOfWeek).ToList();
                                foreach (var emp in otherDaysEmpty)
                                {
                                    bool completesBlock = classSlots.Any(s =>
                                        s.Id != candidate.Id &&
                                        s.DayOfWeek == emp.day &&
                                        (s.LessonHour == emp.hour - 1 || s.LessonHour == emp.hour + 1) &&
                                        !string.IsNullOrEmpty(s.TeacherName) &&
                                        string.Equals(s.TeacherName.Trim(), candidate.TeacherName?.Trim(), StringComparison.OrdinalIgnoreCase));

                                    if (completesBlock)
                                    {
                                        bool teacherBusy = !string.IsNullOrEmpty(candidate.TeacherName) && schedules.Any(other =>
                                            other.Id != candidate.Id &&
                                            !string.IsNullOrEmpty(other.TeacherName) &&
                                            string.Equals(other.TeacherName.Trim(), candidate.TeacherName.Trim(), StringComparison.OrdinalIgnoreCase) &&
                                            other.DayOfWeek == emp.day &&
                                            other.LessonHour == emp.hour);

                                        if (!teacherBusy)
                                        {
                                            targetSlot = emp;
                                            break;
                                        }
                                    }
                                }
                            }

                            // Tercih D: Diğer günlerde öğretmenin okul genelinde boş olduğu herhangi bir boş saat
                            if (!targetSlot.HasValue)
                            {
                                var otherDaysEmpty = emptySlots.Where(e => e.day != conf.Key.DayOfWeek).ToList();
                                foreach (var emp in otherDaysEmpty)
                                {
                                    bool teacherBusy = !string.IsNullOrEmpty(candidate.TeacherName) && schedules.Any(other =>
                                        other.Id != candidate.Id &&
                                        !string.IsNullOrEmpty(other.TeacherName) &&
                                        string.Equals(other.TeacherName.Trim(), candidate.TeacherName.Trim(), StringComparison.OrdinalIgnoreCase) &&
                                        other.DayOfWeek == emp.day &&
                                        other.LessonHour == emp.hour);

                                    if (!teacherBusy)
                                    {
                                        targetSlot = emp;
                                        break;
                                    }
                                }
                            }

                            if (targetSlot.HasValue)
                            {
                                var oldDay = candidate.DayOfWeek;
                                var oldHour = candidate.LessonHour;
                                candidate.DayOfWeek = targetSlot.Value.day;
                                candidate.LessonHour = targetSlot.Value.hour;

                                emptySlots.Remove(targetSlot.Value);
                                movedInPass++;
                                movedCount++;
                                movedDescriptions.Add($"{candidate.Grade}-{candidate.Section} {candidate.LessonName} ({candidate.TeacherName}): {oldDay}. Gün {oldHour}. Saat ➔ {targetSlot.Value.day}. Gün {targetSlot.Value.hour}. Saat (Boş Saate Aktarıldı)");
                                break; // Bu çakışma çözüldü, sıradaki çakışmaya geç
                            }
                        }
                    }
                }

                // FAZ 2: Sınıflar Arası Öğretmen Çakışmaları (Bir öğretmenin aynı saatte iki sınıfta olması)
                // Boş dersi olan sınıftaki ders, o sınıfın boş bir saatine aktarılır (Böylece boş ders dolar ve çakışma biter!)
                var teacherConflicts = schedules
                    .Where(s => !string.IsNullOrEmpty(s.TeacherName))
                    .GroupBy(s => new { Teacher = s.TeacherName!.ToLower().Trim(), s.DayOfWeek, s.LessonHour })
                    .Where(g => g.Count() > 1)
                    .ToList();

                foreach (var tg in teacherConflicts)
                {
                    var candidates = tg.ToList();
                    // Boş saati en çok olan sınıf adayını belirle
                    var candidateWithHoles = candidates
                        .Select(c =>
                        {
                            var cSlots = schedules.Where(s => s.Grade == c.Grade && s.Section == c.Section).ToList();
                            var occ = new HashSet<string>(cSlots.Select(s => $"{s.DayOfWeek}_{s.LessonHour}"));
                            var empties = new List<(int day, int hour)>();
                            for (int d = 1; d <= 5; d++)
                            {
                                for (int h = 1; h <= dailyHours; h++)
                                {
                                    if (!occ.Contains($"{d}_{h}")) empties.Add((d, h));
                                }
                            }
                            return new { Item = c, ClassName = $"{c.Grade}-{c.Section}", Empties = empties };
                        })
                        .Where(x => x.Empties.Any())
                        .OrderByDescending(x => x.Empties.Count)
                        .FirstOrDefault();

                    if (candidateWithHoles != null)
                    {
                        var itemToMove = candidateWithHoles.Item;
                        var target = candidateWithHoles.Empties.FirstOrDefault(emp =>
                            !schedules.Any(s =>
                                s.Id != itemToMove.Id &&
                                !string.IsNullOrEmpty(s.TeacherName) &&
                                string.Equals(s.TeacherName.Trim(), itemToMove.TeacherName?.Trim(), StringComparison.OrdinalIgnoreCase) &&
                                s.DayOfWeek == emp.day &&
                                s.LessonHour == emp.hour));

                        if (target != default)
                        {
                            int oldD = itemToMove.DayOfWeek;
                            int oldH = itemToMove.LessonHour;
                            itemToMove.DayOfWeek = target.day;
                            itemToMove.LessonHour = target.hour;

                            movedInPass++;
                            movedCount++;
                            movedDescriptions.Add($"[Öğretmen Çakışması Çözüldü] {candidateWithHoles.ClassName} {itemToMove.LessonName} ({itemToMove.TeacherName}): {oldD}. Gün {oldH}. Saat ➔ {target.day}. Gün {target.hour}. Saat (Boş Saate Aktarıldı)");
                        }
                    }
                }

                if (movedInPass == 0) break; // Artık taşınabilecek çakışma kalmadı
            }

            if (movedCount > 0)
            {
                await _context.SaveChangesAsync();
                await LogActionAsync(schoolId, "SCHEDULES_AUTO_RECONCILED", "ScheduleItem", null, $"Akıllı Dengeleyici: {movedCount} çakışan ders başarıyla boş saatlere yerleştirildi.");
            }

            return (movedCount, movedDescriptions);
        }

        private static string CleanLessonName(string? name)
        {
            if (string.IsNullOrWhiteSpace(name)) return string.Empty;
            var s = name.Trim().ToUpperInvariant()
                .Replace("SEÇMELİ", "SEC")
                .Replace("SEÇ.", "SEC")
                .Replace("SEÇ", "SEC")
                .Replace("S.", "SEC")
                .Replace(" VE SPOR", "")
                .Replace(" VE AHLAK BİLGİSİ", "")
                .Replace(" VE YÖNLENDİRME", "")
                .Replace(" VE UYGULAMALARI", "")
                .Replace(" VE ATATÜRKÇÜLÜK", "")
                .Replace("_", " ")
                .Replace("-", " ");
            s = s.Replace("İ", "I").Replace("Ş", "S").Replace("Ğ", "G").Replace("Ü", "U").Replace("Ö", "O").Replace("Ç", "C");
            return System.Text.RegularExpressions.Regex.Replace(s, @"\s+", " ").Trim();
        }

        private static bool AreLessonNamesEquivalent(string? nameA, string? nameB)
        {
            if (string.Equals(nameA?.Trim(), nameB?.Trim(), StringComparison.OrdinalIgnoreCase)) return true;
            var cA = CleanLessonName(nameA);
            var cB = CleanLessonName(nameB);
            if (string.IsNullOrEmpty(cA) || string.IsNullOrEmpty(cB)) return false;
            if (cA == cB) return true;
            if (cA.Length >= 4 && cB.Length >= 4)
            {
                if (cA.Contains(cB) || cB.Contains(cA)) return true;
            }
            return false;
        }

        private async Task<(int placedCount, List<string> placedDescriptions)> RunAutoFillMissingLessonsAsync(Guid schoolId, int dailyHours = 8)
        {
            var schedules = await _context.ScheduleItems
                .Where(s => s.SchoolId == schoolId)
                .ToListAsync();

            if (!schedules.Any())
            {
                return (0, new List<string>());
            }

            var curriculumLessons = await _context.SchoolLessons
                .Where(l => l.SchoolId == schoolId)
                .ToListAsync();

            if (!curriculumLessons.Any())
            {
                return (0, new List<string>());
            }

            int placedCount = 0;
            var placedDescriptions = new List<string>();

            // Okuldaki şubeleri grupla
            var classGroups = schedules
                .GroupBy(s => $"{s.Grade.Trim()}-{s.Section.Trim().ToUpper()}")
                .ToList();

            foreach (var cg in classGroups)
            {
                var classSlots = cg.ToList();
                var occupied = new HashSet<string>(classSlots.Select(s => $"{s.DayOfWeek}_{s.LessonHour}"));
                var emptySlots = new List<(int day, int hour)>();

                for (int d = 1; d <= 5; d++)
                {
                    for (int h = 1; h <= dailyHours; h++)
                    {
                        if (!occupied.Contains($"{d}_{h}"))
                        {
                            emptySlots.Add((d, h));
                        }
                    }
                }

                if (!emptySlots.Any()) continue;

                // Bu sınıfta okutulan mevcut dersleri ve öğretmenleri analiz et
                var lessonTeacherGroups = classSlots
                    .GroupBy(s => new { Lesson = s.LessonName?.Trim() ?? string.Empty, Teacher = s.TeacherName?.Trim() ?? string.Empty })
                    .Where(g => !string.IsNullOrEmpty(g.Key.Lesson))
                    .Select(g =>
                    {
                        // Müfredat tablosunda bu derse karşılık gelen haftalık ders saatini bul (Eşdeğerlik kontrolüyle)
                        var curr = curriculumLessons.FirstOrDefault(cl =>
                            AreLessonNamesEquivalent(cl.Name, g.Key.Lesson) &&
                            (string.Equals(cl.Grade?.Trim(), "Tüm Kademeler", StringComparison.OrdinalIgnoreCase) ||
                             (cl.Grade != null && cl.Grade.Contains(classSlots.First().Grade.Trim()))))
                            ?? curriculumLessons.FirstOrDefault(cl =>
                            AreLessonNamesEquivalent(cl.Name, g.Key.Lesson));

                        int expected = curr != null && curr.WeeklyHours > 0 ? curr.WeeklyHours : 0;
                        int actual = g.Count();
                        int missing = expected > actual ? expected - actual : 0;

                        return new
                        {
                            Lesson = g.Key.Lesson,
                            Teacher = g.Key.Teacher,
                            Actual = actual,
                            Expected = expected,
                            Missing = missing,
                            ExistingItems = g.ToList()
                        };
                    })
                    .Where(x => x.Missing > 0)
                    .OrderByDescending(x => x.Missing)
                    .ToList();

                foreach (var lt in lessonTeacherGroups)
                {
                    int missingToFill = lt.Missing;
                    var sampleItem = lt.ExistingItems.First();

                    for (int m = 0; m < missingToFill; m++)
                    {
                        if (!emptySlots.Any()) break;

                        (int day, int hour)? bestSlot = null;

                        // Öncelik 1: Aynı günde adayın bu sınıftaki dersinin yanındaki boş saat (2 saatlik blok tamamlama!)
                        foreach (var emp in emptySlots)
                        {
                            bool completesBlock = classSlots.Any(s =>
                                s.DayOfWeek == emp.day &&
                                (s.LessonHour == emp.hour - 1 || s.LessonHour == emp.hour + 1) &&
                                !string.IsNullOrEmpty(s.TeacherName) &&
                                string.Equals(s.TeacherName.Trim(), lt.Teacher, StringComparison.OrdinalIgnoreCase) &&
                                AreLessonNamesEquivalent(s.LessonName, lt.Lesson));

                            if (completesBlock)
                            {
                                bool busy = !string.IsNullOrEmpty(lt.Teacher) && schedules.Any(s =>
                                    !string.IsNullOrEmpty(s.TeacherName) &&
                                    string.Equals(s.TeacherName.Trim(), lt.Teacher, StringComparison.OrdinalIgnoreCase) &&
                                    s.DayOfWeek == emp.day &&
                                    s.LessonHour == emp.hour);

                                if (!busy)
                                {
                                    bestSlot = emp;
                                    break;
                                }
                            }
                        }

                        // Öncelik 2: Aynı günde en yakın boş saat
                        if (!bestSlot.HasValue)
                        {
                            foreach (var item in lt.ExistingItems)
                            {
                                var sameDayEmpties = emptySlots
                                    .Where(e => e.day == item.DayOfWeek)
                                    .OrderBy(e => Math.Abs(e.hour - item.LessonHour))
                                    .ToList();

                                foreach (var emp in sameDayEmpties)
                                {
                                    bool busy = !string.IsNullOrEmpty(lt.Teacher) && schedules.Any(s =>
                                        !string.IsNullOrEmpty(s.TeacherName) &&
                                        string.Equals(s.TeacherName.Trim(), lt.Teacher, StringComparison.OrdinalIgnoreCase) &&
                                        s.DayOfWeek == emp.day &&
                                        s.LessonHour == emp.hour);

                                    if (!busy)
                                    {
                                        bestSlot = emp;
                                        break;
                                    }
                                }

                                if (bestSlot.HasValue) break;
                            }
                        }

                        // Öncelik 3: Diğer günlerde öğretmenin okul genelinde boş olduğu herhangi bir boş saat
                        if (!bestSlot.HasValue)
                        {
                            foreach (var emp in emptySlots)
                            {
                                bool busy = !string.IsNullOrEmpty(lt.Teacher) && schedules.Any(s =>
                                    !string.IsNullOrEmpty(s.TeacherName) &&
                                    string.Equals(s.TeacherName.Trim(), lt.Teacher, StringComparison.OrdinalIgnoreCase) &&
                                    s.DayOfWeek == emp.day &&
                                    s.LessonHour == emp.hour);

                                if (!busy)
                                {
                                    bestSlot = emp;
                                    break;
                                }
                            }
                        }

                        if (bestSlot.HasValue)
                        {
                            var newItem = new ScheduleItem
                            {
                                Id = Guid.NewGuid(),
                                SchoolId = schoolId,
                                Grade = sampleItem.Grade,
                                Section = sampleItem.Section,
                                LessonName = lt.Lesson,
                                TeacherName = lt.Teacher,
                                TeacherId = sampleItem.TeacherId,
                                LessonCode = sampleItem.LessonCode,
                                Classroom = sampleItem.Classroom,
                                DayOfWeek = bestSlot.Value.day,
                                LessonHour = bestSlot.Value.hour
                            };

                            _context.ScheduleItems.Add(newItem);
                            schedules.Add(newItem);
                            classSlots.Add(newItem);
                            emptySlots.Remove(bestSlot.Value);

                            placedCount++;
                            placedDescriptions.Add($"{cg.Key} {lt.Lesson} ({lt.Teacher}): {bestSlot.Value.day}. Gün {bestSlot.Value.hour}. Saate eklendi (Müfredata göre eksik saat tamamlandı)");
                        }
                    }
                }

                // FAZ 2: Sınıfta HİÇ BULUNMAYAN veya EKSİK KALAN Müfredat Derslerini Okuldaki Branş Öğretmenleriyle Boşluklara Yerleştirme
                if (emptySlots.Any())
                {
                    var classGrade = classSlots.FirstOrDefault()?.Grade?.Trim() ?? "";
                    var applicableCurriculum = curriculumLessons
                        .Where(cl => string.Equals(cl.Grade?.Trim(), "Tüm Kademeler", StringComparison.OrdinalIgnoreCase) ||
                                     (cl.Grade != null && cl.Grade.Contains(classGrade)))
                        .OrderByDescending(cl => cl.WeeklyHours)
                        .ToList();

                    foreach (var curr in applicableCurriculum)
                    {
                        if (!emptySlots.Any()) break;

                        int expected = curr.WeeklyHours > 0 ? curr.WeeklyHours : 0;
                        int currentInClass = classSlots.Count(s => AreLessonNamesEquivalent(s.LessonName, curr.Name));
                        int missing = expected > currentInClass ? expected - currentInClass : 0;
                        if (missing <= 0) continue;

                        // Okulda bu dersi okutan uygun branş öğretmenlerini bul (önce aynı kademede okutanlar)
                        var candidateTeachers = schedules
                            .Where(s => AreLessonNamesEquivalent(s.LessonName, curr.Name) && !string.IsNullOrWhiteSpace(s.TeacherName))
                            .GroupBy(s => s.TeacherName!.Trim(), StringComparer.OrdinalIgnoreCase)
                            .Select(g => new
                            {
                                TeacherName = g.First().TeacherName!.Trim(),
                                TeacherId = g.First().TeacherId,
                                TeachesInSameGrade = g.Any(s => s.Grade.Trim() == classGrade),
                                TotalHours = schedules.Count(s => string.Equals(s.TeacherName?.Trim(), g.First().TeacherName!.Trim(), StringComparison.OrdinalIgnoreCase)),
                                Sample = g.First()
                            })
                            .OrderByDescending(t => t.TeachesInSameGrade)
                            .ThenBy(t => t.TotalHours)
                            .ToList();

                        if (!candidateTeachers.Any()) continue;

                        for (int m = 0; m < missing; m++)
                        {
                            if (!emptySlots.Any()) break;

                            (int day, int hour)? placedSlot = null;
                            string? chosenTeacher = null;
                            Guid? chosenTeacherId = null;
                            string? chosenCode = null;

                            foreach (var cand in candidateTeachers)
                            {
                                var availableSlots = emptySlots
                                    .Where(emp => !schedules.Any(s =>
                                        !string.IsNullOrEmpty(s.TeacherName) &&
                                        string.Equals(s.TeacherName.Trim(), cand.TeacherName, StringComparison.OrdinalIgnoreCase) &&
                                        s.DayOfWeek == emp.day &&
                                        s.LessonHour == emp.hour))
                                    .ToList();

                                if (!availableSlots.Any()) continue;

                                var blockSlot = availableSlots.FirstOrDefault(emp => classSlots.Any(s =>
                                    s.DayOfWeek == emp.day &&
                                    (s.LessonHour == emp.hour - 1 || s.LessonHour == emp.hour + 1) &&
                                    string.Equals(s.TeacherName?.Trim(), cand.TeacherName, StringComparison.OrdinalIgnoreCase)));

                                placedSlot = blockSlot != default ? blockSlot : availableSlots.First();
                                chosenTeacher = cand.TeacherName;
                                chosenTeacherId = cand.TeacherId;
                                chosenCode = cand.Sample.LessonCode;
                                break;
                            }

                            if (placedSlot.HasValue && !string.IsNullOrEmpty(chosenTeacher))
                            {
                                var sample = classSlots.First();
                                var newItem = new ScheduleItem
                                {
                                    Id = Guid.NewGuid(),
                                    SchoolId = schoolId,
                                    Grade = sample.Grade,
                                    Section = sample.Section,
                                    LessonName = curr.Name,
                                    TeacherName = chosenTeacher,
                                    TeacherId = chosenTeacherId,
                                    LessonCode = chosenCode,
                                    Classroom = sample.Classroom,
                                    DayOfWeek = placedSlot.Value.day,
                                    LessonHour = placedSlot.Value.hour
                                };

                                _context.ScheduleItems.Add(newItem);
                                schedules.Add(newItem);
                                classSlots.Add(newItem);
                                emptySlots.Remove(placedSlot.Value);

                                placedCount++;
                                placedDescriptions.Add($"{cg.Key} {curr.Name} ({chosenTeacher}): {placedSlot.Value.day}. Gün {placedSlot.Value.hour}. Saate eklendi (Müfredat dersi tamamlandı)");
                            }
                        }
                    }
                }
            }

            if (placedCount > 0)
            {
                await _context.SaveChangesAsync();
                await LogActionAsync(schoolId, "SCHEDULES_AUTO_FILLED_GAPS", "ScheduleItem", null, $"Müfredat Tamamlayıcı: {placedCount} eksik ders saati boşluklara yerleştirildi.");
            }

            return (placedCount, placedDescriptions);
        }

        // 5. Yıllık Planları Toplu Kaydet (Admin AI veya Excel Şablonu ile yükler)
        [HttpPost("yearly-plans/batch")]
        public async Task<IActionResult> BatchSyncYearlyPlans([FromBody] BatchYearlyPlanSyncRequest request)
        {
            if (request.PlanItems == null || request.PlanItems.Count == 0)
            {
                return BadRequest(new { message = "Kaydedilecek plan satırı bulunamadı." });
            }

            // Eğer OverwriteExisting true ise, bu ders/kademelere ait mevcut satırları temizle
            if (request.OverwriteExisting)
            {
                var lessonNames = request.PlanItems.Select(p => p.LessonName.Trim().ToLower()).Distinct().ToList();
                var oldItems = await _context.YearlyPlanItems
                    .Where(p => p.SchoolId == request.SchoolId && lessonNames.Contains(p.LessonName.ToLower()))
                    .ToListAsync();

                if (oldItems.Any())
                {
                    _context.YearlyPlanItems.RemoveRange(oldItems);
                }
            }

            foreach (var item in request.PlanItems)
            {
                var existing = request.OverwriteExisting ? null : await _context.YearlyPlanItems
                    .FirstOrDefaultAsync(p => p.SchoolId == request.SchoolId &&
                                              p.LessonName == item.LessonName &&
                                              p.Grade == item.Grade &&
                                              p.WeekNumber == item.WeekNumber);

                if (existing != null)
                {
                    existing.Subject = item.Subject;
                    existing.LearningOutcomes = item.LearningOutcomes;
                    if (item.StartDate.HasValue) existing.StartDate = item.StartDate;
                    if (item.EndDate.HasValue) existing.EndDate = item.EndDate;
                }
                else
                {
                    _context.YearlyPlanItems.Add(new YearlyPlanItem
                    {
                        Id = item.Id != Guid.Empty ? item.Id : Guid.NewGuid(),
                        SchoolId = request.SchoolId,
                        LessonName = item.LessonName,
                        Grade = item.Grade,
                        WeekNumber = item.WeekNumber,
                        StartDate = item.StartDate,
                        EndDate = item.EndDate,
                        Subject = item.Subject,
                        LearningOutcomes = item.LearningOutcomes
                    });
                }
            }

            await _context.SaveChangesAsync();
            await LogActionAsync(request.SchoolId, "BATCH_YEARLY_PLANS_SYNCED", "YearlyPlanItem", null, $"{request.PlanItems.Count} adet haftalık yıllık plan kaydı sisteme yüklendi.");
            return Ok(new { message = "Yıllık planlar başarıyla kaydedildi.", count = request.PlanItems.Count });
        }

        // 5.1 Yıllık Planı Sil (Ders veya Kademe Bazında)
        [HttpDelete("yearly-plans")]
        public async Task<IActionResult> DeleteYearlyPlans([FromQuery] Guid schoolId, [FromQuery] string? lessonName, [FromQuery] string? grade)
        {
            var query = _context.YearlyPlanItems.Where(p => p.SchoolId == schoolId);

            if (!string.IsNullOrWhiteSpace(lessonName))
            {
                var normLesson = lessonName.Trim().ToLower();
                query = query.Where(p => p.LessonName.ToLower() == normLesson || p.LessonName.ToLower().Contains(normLesson) || normLesson.Contains(p.LessonName.ToLower()));
            }

            if (!string.IsNullOrWhiteSpace(grade))
            {
                var normGrade = grade.Trim().ToLower();
                query = query.Where(p => p.Grade.ToLower() == normGrade);
            }

            var toDelete = await query.ToListAsync();
            _context.YearlyPlanItems.RemoveRange(toDelete);
            await _context.SaveChangesAsync();

            await LogActionAsync(schoolId, "DELETE_YEARLY_PLANS", "YearlyPlanItem", null, $"{toDelete.Count} adet yıllık plan kaydı silindi ({lessonName ?? "Tüm Planlar"}).");
            return Ok(new { message = $"{toDelete.Count} adet yıllık plan kaydı başarıyla silindi.", count = toDelete.Count });
        }

        // 6. Yıllık Planı Çek
        [HttpGet("yearly-plans")]
        public async Task<IActionResult> GetYearlyPlans([FromQuery] Guid schoolId, [FromQuery] string? lessonName, [FromQuery] string? grade)
        {
            var query = _context.YearlyPlanItems.Where(p => p.SchoolId == schoolId);

            if (!string.IsNullOrWhiteSpace(lessonName))
            {
                var normLesson = lessonName.Trim().ToLower();
                query = query.Where(p => p.LessonName.ToLower() == normLesson || p.LessonName.ToLower().Contains(normLesson) || normLesson.Contains(p.LessonName.ToLower()));
            }

            if (!string.IsNullOrWhiteSpace(grade))
            {
                var normGrade = grade.Trim().ToLower();
                query = query.Where(p => p.Grade.ToLower() == normGrade);
            }

            var plans = await query
                .OrderBy(p => p.LessonName)
                .ThenBy(p => p.Grade)
                .ThenBy(p => p.WeekNumber)
                .ToListAsync();

            return Ok(plans);
        }

        // 7. Ödev Gönderimi / Senkronizasyonu (UUID Tabanlı)
        [HttpPost("assignment")]
        public async Task<IActionResult> SyncAssignment([FromBody] AssignmentSyncRequest request)
        {
            var teacher = await _context.Users.FindAsync(CurrentUserId);
            var assignment = await _context.Assignments.FindAsync(request.Id);

            if (assignment != null)
            {
                // Güncelleme
                assignment.Title = request.Title;
                assignment.Description = request.Description;
                assignment.DueDate = request.DueDate;
                assignment.UpdatedAt = DateTime.UtcNow;
            }
            else
            {
                // Yeni Ödev
                assignment = new Assignment
                {
                    Id = request.Id != Guid.Empty ? request.Id : Guid.NewGuid(),
                    SchoolId = request.SchoolId,
                    TeacherId = CurrentUserId,
                    TeacherName = teacher?.FullName ?? "Öğretmen",
                    LessonName = request.LessonName,
                    Title = request.Title,
                    Description = request.Description,
                    DueDate = request.DueDate,
                    TargetGrade = request.TargetGrade,
                    TargetSection = request.TargetSection,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                };
                await _context.Assignments.AddAsync(assignment);
            }

            // Teslim durumları
            foreach (var sub in request.Submissions)
            {
                var existingSub = await _context.AssignmentSubmissions
                    .FirstOrDefaultAsync(s => s.AssignmentId == assignment.Id && s.StudentId == sub.StudentId);

                if (existingSub != null)
                {
                    existingSub.Status = sub.Status;
                    existingSub.Feedback = sub.Feedback;
                    existingSub.UpdatedAt = DateTime.UtcNow;
                }
                else
                {
                    _context.AssignmentSubmissions.Add(new AssignmentSubmission
                    {
                        Id = sub.Id != Guid.Empty ? sub.Id : Guid.NewGuid(),
                        AssignmentId = assignment.Id,
                        StudentId = sub.StudentId,
                        Status = sub.Status,
                        Feedback = sub.Feedback,
                        CheckedAt = DateTime.UtcNow,
                        UpdatedAt = DateTime.UtcNow
                    });
                }
            }

            _context.AuditLogs.Add(new AuditLog
            {
                SchoolId = request.SchoolId,
                UserId = CurrentUserId,
                UserRole = CurrentUserRole,
                ActionType = "ASSIGNMENT_SYNCED",
                EntityName = "Assignment",
                EntityId = assignment.Id.ToString(),
                DetailsJson = $"Ödev: '{assignment.Title}' ({assignment.TargetGrade}-{assignment.TargetSection})",
                Timestamp = DateTime.UtcNow
            });

            await _context.SaveChangesAsync();
            return Ok(assignment);
        }

        // 8. Öğrenci Görüşü / Quiz Notu Senkronizasyonu (UUID - Yerel Düzeltilince Sunucu da Düzelir)
        [HttpPost("evaluation")]
        public async Task<IActionResult> SyncEvaluation([FromBody] EvaluationSyncRequest request)
        {
            var teacher = await _context.Users.FindAsync(CurrentUserId);
            var evaluation = await _context.StudentEvaluations.FindAsync(request.Id);

            string? oldContent = null;
            if (evaluation != null)
            {
                oldContent = evaluation.Content;
                evaluation.Title = request.Title;
                evaluation.Content = request.Content;
                evaluation.Score = request.Score;
                evaluation.IsSharedWithParent = request.IsSharedWithParent;
                evaluation.UpdatedAt = DateTime.UtcNow;
            }
            else
            {
                evaluation = new StudentEvaluation
                {
                    Id = request.Id != Guid.Empty ? request.Id : Guid.NewGuid(),
                    SchoolId = request.SchoolId,
                    TeacherId = CurrentUserId,
                    TeacherName = teacher?.FullName ?? "Öğretmen",
                    StudentId = request.StudentId,
                    Type = request.Type,
                    Title = request.Title,
                    Content = request.Content,
                    Score = request.Score,
                    IsSharedWithParent = request.IsSharedWithParent,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                };
                await _context.StudentEvaluations.AddAsync(evaluation);
            }

            // Düzeltme yapıldıysa audit log ile eski ve yeni değer saklanır
            _context.AuditLogs.Add(new AuditLog
            {
                SchoolId = request.SchoolId,
                UserId = CurrentUserId,
                UserRole = CurrentUserRole,
                ActionType = oldContent != null ? "EVALUATION_UPDATED" : "EVALUATION_CREATED",
                EntityName = "StudentEvaluation",
                EntityId = evaluation.Id.ToString(),
                DetailsJson = oldContent != null
                    ? $"{{\"old\": \"{oldContent}\", \"new\": \"{evaluation.Content}\", \"shared\": {evaluation.IsSharedWithParent}}}"
                    : $"{{\"content\": \"{evaluation.Content}\", \"shared\": {evaluation.IsSharedWithParent}}}",
                Timestamp = DateTime.UtcNow
            });

            await _context.SaveChangesAsync();
            return Ok(evaluation);
        }

        // 9. Öğrenci & Veli Akışı (Kendi ödevlerini, teslimlerini ve veliye paylaşılan notları görme)
        [HttpGet("student-feed")]
        public async Task<IActionResult> GetStudentFeed([FromQuery] Guid studentId)
        {
            var student = await _context.Students.FindAsync(studentId);
            if (student == null) return NotFound();

            var assignments = await _context.Assignments
                .Where(a => a.SchoolId == student.SchoolId &&
                            a.TargetGrade == student.Grade &&
                            (a.TargetSection == student.Section || string.IsNullOrEmpty(a.TargetSection)))
                .OrderByDescending(a => a.CreatedAt)
                .Select(a => new
                {
                    a.Id,
                    a.Title,
                    a.Description,
                    a.LessonName,
                    a.DueDate,
                    a.TeacherName,
                    Submission = _context.AssignmentSubmissions
                        .Where(s => s.AssignmentId == a.Id && s.StudentId == studentId)
                        .Select(s => new { s.Status, s.Feedback, s.CheckedAt })
                        .FirstOrDefault()
                })
                .ToListAsync();

            // Sadece veliyle paylaşılmış olan görüş ve notlar
            var evaluations = await _context.StudentEvaluations
                .Where(e => e.StudentId == studentId && e.IsSharedWithParent)
                .OrderByDescending(e => e.CreatedAt)
                .Select(e => new
                {
                    e.Id,
                    e.Type,
                    e.Title,
                    e.Content,
                    e.Score,
                    e.TeacherName,
                    e.CreatedAt,
                    e.UpdatedAt
                })
                .ToListAsync();

            return Ok(new
            {
                student = new
                {
                    student.Id,
                    student.StudentNumber,
                    student.FullName,
                    student.Grade,
                    student.Section,
                    student.PhotoPath
                },
                assignments,
                evaluations
            });
        }
    }

    public class CreateSingleStudentRequest
    {
        public Guid SchoolId { get; set; }
        public string StudentNumber { get; set; } = string.Empty;
        public string FullName { get; set; } = string.Empty;
        public string Grade { get; set; } = string.Empty;
        public string Section { get; set; } = string.Empty;
        public string? ParentName { get; set; }
        public string? ParentPhone { get; set; }
        public string? StudentPhone { get; set; }
        public string? PhotoPath { get; set; }
    }

    public class UpdateStudentRequest
    {
        public string StudentNumber { get; set; } = string.Empty;
        public string FullName { get; set; } = string.Empty;
        public string Grade { get; set; } = string.Empty;
        public string Section { get; set; } = string.Empty;
        public string? ParentName { get; set; }
        public string? ParentPhone { get; set; }
        public string? StudentPhone { get; set; }
        public string? PhotoPath { get; set; }
    }

    public class UpdatePhotoRequest
    {
        public string PhotoPath { get; set; } = string.Empty;
    }
}
