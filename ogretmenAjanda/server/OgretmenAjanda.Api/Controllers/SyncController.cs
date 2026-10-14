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

namespace OgretmenAjanda.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class SyncController : ControllerBase
    {
        private readonly AppDbContext _context;

        public SyncController(AppDbContext context)
        {
            _context = context;
        }

        private Guid CurrentUserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        private string CurrentUserRole => User.FindFirstValue(ClaimTypes.Role)!;

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
                }
            }

            _context.AuditLogs.Add(new AuditLog
            {
                SchoolId = request.SchoolId,
                UserId = CurrentUserId,
                UserRole = CurrentUserRole,
                ActionType = "BATCH_SCHEDULE_SYNCED",
                EntityName = "ScheduleItem",
                DetailsJson = $"{request.Schedules.Count} ders programı kaydı yüklendi. (Mod: {(request.OverwriteAll ? "Sıfırdan Yaz" : "Güncelle")})",
                Timestamp = DateTime.UtcNow
            });

            await _context.SaveChangesAsync();
            return Ok(new { message = request.OverwriteAll ? "Ders programı sıfırlanıp yeniden yazıldı." : "Ders programı başarıyla güncellendi." });
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

        // 5. Yıllık Planları Toplu Kaydet (Admin AI ile yükler)
        [HttpPost("yearly-plans/batch")]
        public async Task<IActionResult> BatchSyncYearlyPlans([FromBody] BatchYearlyPlanSyncRequest request)
        {
            foreach (var item in request.PlanItems)
            {
                var existing = await _context.YearlyPlanItems
                    .FirstOrDefaultAsync(p => p.SchoolId == request.SchoolId &&
                                              p.LessonName == item.LessonName &&
                                              p.Grade == item.Grade &&
                                              p.WeekNumber == item.WeekNumber);

                if (existing != null)
                {
                    existing.Subject = item.Subject;
                    existing.LearningOutcomes = item.LearningOutcomes;
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
                        Subject = item.Subject,
                        LearningOutcomes = item.LearningOutcomes
                    });
                }
            }

            await _context.SaveChangesAsync();
            return Ok(new { message = "Yıllık planlar başarıyla kaydedildi." });
        }

        // 6. Yıllık Planı Çek
        [HttpGet("yearly-plans")]
        public async Task<IActionResult> GetYearlyPlans([FromQuery] Guid schoolId, [FromQuery] string lessonName, [FromQuery] string grade)
        {
            var plans = await _context.YearlyPlanItems
                .Where(p => p.SchoolId == schoolId && p.LessonName == lessonName && p.Grade == grade)
                .OrderBy(p => p.WeekNumber)
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
