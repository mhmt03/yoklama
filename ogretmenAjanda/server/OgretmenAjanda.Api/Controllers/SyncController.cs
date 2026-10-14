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

        // 2. Okulun Öğrencilerini Çek (Öğretmen cihazına hazır çekme)
        [HttpGet("students")]
        public async Task<IActionResult> GetStudents([FromQuery] Guid schoolId)
        {
            var students = await _context.Students
                .Where(s => s.SchoolId == schoolId)
                .OrderBy(s => s.Grade)
                .ThenBy(s => s.Section)
                .ThenBy(s => s.StudentNumber)
                .ToListAsync();

            return Ok(students);
        }

        // 3. Ders Programını Toplu Kaydet (AI Çarşaf Program Çıktısı)
        [HttpPost("schedules/batch")]
        public async Task<IActionResult> BatchSyncSchedules([FromBody] BatchScheduleSyncRequest request)
        {
            var school = await _context.Schools.FindAsync(request.SchoolId);
            if (school == null) return NotFound();

            // Eski programları temizleyip yenilerini ekleyebilir veya güncelleyebiliriz
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

            _context.AuditLogs.Add(new AuditLog
            {
                SchoolId = request.SchoolId,
                UserId = CurrentUserId,
                UserRole = CurrentUserRole,
                ActionType = "BATCH_SCHEDULE_SYNCED",
                EntityName = "ScheduleItem",
                DetailsJson = $"{request.Schedules.Count} ders programı kaydı yüklendi.",
                Timestamp = DateTime.UtcNow
            });

            await _context.SaveChangesAsync();
            return Ok(new { message = "Ders programı başarıyla kaydedildi." });
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
}
