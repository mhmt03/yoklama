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
            if (request.SyncLessons && request.Lessons != null && request.Lessons.Count > 0)
            {
                var existingLessons = await _context.SchoolLessons
                    .Where(l => l.SchoolId == request.SchoolId)
                    .ToListAsync();

                foreach (var lessonName in request.Lessons)
                {
                    var cleanLesson = lessonName?.Trim();
                    if (string.IsNullOrWhiteSpace(cleanLesson)) continue;

                    if (!existingLessons.Any(l => string.Equals(l.Name.Trim(), cleanLesson, StringComparison.OrdinalIgnoreCase)))
                    {
                        var newLesson = new SchoolLesson
                        {
                            Id = Guid.NewGuid(),
                            SchoolId = request.SchoolId,
                            Name = cleanLesson,
                            ShortCode = cleanLesson.Length > 3 ? cleanLesson.Substring(0, 3).ToUpper() : cleanLesson.ToUpper(),
                            Grade = "Tüm Kademeler",
                            WeeklyHours = 2,
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
            
            return Ok(new
            {
                message = detailText,
                addedTeachersCount,
                addedClassesCount,
                addedLessonsCount,
                savedScheduleCount,
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

            if (item == null) return NotFound(new { message = "Silinecek ders hücresi bulunamadı." });

            _context.ScheduleItems.Remove(item);
            await _context.SaveChangesAsync();
            return Ok(new { success = true, message = "Ders hücresi silindi." });
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
                classFullness = classFullnessList
            });
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
