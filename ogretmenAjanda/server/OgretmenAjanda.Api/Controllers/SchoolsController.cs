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
    public class SchoolsController : ControllerBase
    {
        private readonly AppDbContext _context;

        public SchoolsController(AppDbContext context)
        {
            _context = context;
        }

        private Guid CurrentUserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        private string CurrentUserRole => User.FindFirstValue(ClaimTypes.Role)!;

        // Adminin tanımladığı okulları listele
        [HttpGet("my-schools")]
        public async Task<IActionResult> GetMySchools()
        {
            var schools = await _context.Schools
                .Where(s => s.AdminUserId == CurrentUserId || CurrentUserRole == UserRoles.SuperAdmin)
                .Select(s => new
                {
                    s.Id,
                    s.Name,
                    s.Code,
                    s.Address,
                    s.Phone,
                    s.GeminiApiKey,
                    s.GeminiModel,
                    s.LicenseExpiresAt,
                    s.IsActive,
                    TeacherCount = _context.Users.Count(u => u.SchoolId == s.Id && u.Role == UserRoles.Teacher),
                    StudentCount = _context.Students.Count(st => st.SchoolId == s.Id)
                })
                .ToListAsync();

            return Ok(schools);
        }

        // Okul koduna göre aynı adminin/kurumun yönettiği tüm okulları listele
        [AllowAnonymous]
        [HttpGet("affiliated-by-code/{code}")]
        public async Task<IActionResult> GetAffiliatedByCode(string code)
        {
            var cleanCode = code.Trim().ToUpper();
            var primarySchool = await _context.Schools
                .FirstOrDefaultAsync(s => s.Code.ToUpper() == cleanCode && s.IsActive);

            if (primarySchool == null)
            {
                return NotFound(new { message = "Okul kodu bulunamadı." });
            }

            var adminUserId = primarySchool.AdminUserId;
            var customerId = primarySchool.CustomerId;
            var relationId = primarySchool.RelationId;

            var allSchools = await _context.Schools
                .Where(s => s.IsActive && (
                    s.AdminUserId == adminUserId ||
                    (!string.IsNullOrEmpty(customerId) && s.CustomerId == customerId) ||
                    (!string.IsNullOrEmpty(relationId) && s.RelationId == relationId)
                ))
                .Select(s => new
                {
                    s.Id,
                    s.Name,
                    s.Code,
                    s.Address,
                    s.Phone,
                    s.GeminiApiKey,
                    s.GeminiModel,
                    IsPrimary = s.Id == primarySchool.Id
                })
                .ToListAsync();

            return Ok(allSchools);
        }

        // Yeni Okul Ekle (En fazla 3 okul kuralı)
        [HttpPost]
        public async Task<IActionResult> CreateSchool([FromBody] CreateSchoolRequest request)
        {
            if (CurrentUserRole != UserRoles.SuperAdmin && CurrentUserRole != UserRoles.SchoolAdmin)
            {
                return Forbid();
            }

            var count = await _context.Schools.CountAsync(s => s.AdminUserId == CurrentUserId);
            if (count >= 3 && CurrentUserRole != UserRoles.SuperAdmin)
            {
                return BadRequest(new { message = "Bir hesapla en fazla 3 okul yönetebilirsiniz." });
            }

            // Rastgele 8 haneli benzersiz okul kodu oluştur: Örn: OKL-8F3A2
            var randomPart = Guid.NewGuid().ToString("N").Substring(0, 5).ToUpper();
            var schoolCode = $"OKL-{randomPart}";

            var adminUser = await _context.Users.FindAsync(CurrentUserId);
            var customerId = adminUser?.CustomerId ?? $"MST-{Guid.NewGuid().ToString("N").Substring(0, 5).ToUpper()}";
            var relationId = adminUser?.RelationId ?? $"ILK-{Guid.NewGuid().ToString("N").Substring(0, 5).ToUpper()}";

            if (adminUser != null)
            {
                if (string.IsNullOrEmpty(adminUser.CustomerId)) adminUser.CustomerId = customerId;
                if (string.IsNullOrEmpty(adminUser.RelationId)) adminUser.RelationId = relationId;
                if (!adminUser.LicenseExpiresAt.HasValue) adminUser.LicenseExpiresAt = DateTime.UtcNow.AddYears(1);
            }

            var school = new School
            {
                Id = Guid.NewGuid(),
                Name = request.Name.Trim(),
                Code = schoolCode,
                Address = request.Address,
                Phone = request.Phone,
                AdminUserId = CurrentUserId,
                CustomerId = customerId,
                RelationId = relationId,
                GeminiApiKey = request.GeminiApiKey,
                CreatedAt = DateTime.UtcNow,
                LicenseExpiresAt = adminUser?.LicenseExpiresAt ?? DateTime.UtcNow.AddYears(1), // Admin lisansı ile senkron
                IsActive = true
            };

            await _context.Schools.AddAsync(school);

            _context.AuditLogs.Add(new AuditLog
            {
                SchoolId = school.Id,
                UserId = CurrentUserId,
                UserRole = CurrentUserRole,
                ActionType = "SCHOOL_CREATED",
                EntityName = "School",
                EntityId = school.Id.ToString(),
                DetailsJson = $"{school.Name} oluşturuldu. Okul Kodu: {school.Code}, Müşteri: {customerId}, İlişki: {relationId}",
                Timestamp = DateTime.UtcNow
            });

            await _context.SaveChangesAsync();

            return Ok(school);
        }

        // Okulun Öğretmenlerini Listele
        [HttpGet("{schoolId}/teachers")]
        public async Task<IActionResult> GetSchoolTeachers(Guid schoolId)
        {
            var teachers = await _context.Users
                .Where(u => u.SchoolId == schoolId && (u.Role == UserRoles.Teacher || u.Role == UserRoles.Staff))
                .Select(u => new
                {
                    u.Id,
                    u.Username,
                    u.FullName,
                    u.Email,
                    u.Phone,
                    u.Role,
                    u.RelationId,
                    u.CustomerId,
                    u.IsActive,
                    u.AssignedClassesJson,
                    u.CreatedAt,
                    u.LastLoginAt
                })
                .ToListAsync();

            return Ok(teachers);
        }

        // Okula Yeni Öğretmen Tanımla (Otomatik Kullanıcı Adı & Şifre)
        [HttpPost("{schoolId}/teachers")]
        public async Task<IActionResult> CreateSchoolTeacher(Guid schoolId, [FromBody] CreateTeacherRequest request)
        {
            var school = await _context.Schools.FindAsync(schoolId);
            if (school == null) return NotFound(new { message = "Okul bulunamadı." });

            var fullName = request.FullName.Trim();
            // Türkçe karakterleri temizleyip kullanıcı adı üret
            var rawUsername = (fullName + (request.Branch ?? "")).ToLower()
                .Replace(" ", "")
                .Replace("ı", "i")
                .Replace("ğ", "g")
                .Replace("ü", "u")
                .Replace("ş", "s")
                .Replace("ö", "o")
                .Replace("ç", "c");

            var username = rawUsername;
            var counter = 1;
            while (await _context.Users.AnyAsync(u => u.Username.ToLower() == username.ToLower()))
            {
                username = $"{rawUsername}{counter++}";
            }

            var password = "1234"; // Varsayılan otomatik şifre
            var teacher = new User
            {
                Id = Guid.NewGuid(),
                Username = username,
                PasswordHash = BCrypt.Net.BCrypt.HashPassword(password),
                FullName = fullName + (!string.IsNullOrEmpty(request.Branch) ? $" ({request.Branch})" : ""),
                Email = request.Email,
                Phone = request.Phone,
                Role = UserRoles.Teacher,
                SchoolId = school.Id,
                RelationId = school.RelationId,
                CustomerId = school.CustomerId,
                LicenseExpiresAt = school.LicenseExpiresAt,
                IsActive = true,
                CreatedAt = DateTime.UtcNow
            };

            await _context.Users.AddAsync(teacher);

            _context.AuditLogs.Add(new AuditLog
            {
                SchoolId = school.Id,
                UserId = CurrentUserId,
                UserRole = CurrentUserRole,
                ActionType = "TEACHER_CREATED",
                EntityName = "User",
                EntityId = teacher.Id.ToString(),
                DetailsJson = $"{teacher.FullName} ({teacher.Username}) oluşturuldu.",
                Timestamp = DateTime.UtcNow
            });

            await _context.SaveChangesAsync();

            return Ok(new
            {
                teacher.Id,
                teacher.Username,
                Password = password,
                teacher.FullName,
                SchoolCode = school.Code,
                teacher.Role,
                teacher.IsActive
            });
        }

        // Öğretmen Yetki / Durum Düzenleme (Admin yetkisi)
        [HttpPut("teachers/{teacherId}/status")]
        public async Task<IActionResult> UpdateTeacherStatus(Guid teacherId, [FromBody] UpdateTeacherStatusRequest request)
        {
            var teacher = await _context.Users.FindAsync(teacherId);
            if (teacher == null) return NotFound();

            teacher.IsActive = request.IsActive;
            if (!string.IsNullOrEmpty(request.Role)) teacher.Role = request.Role;
            if (request.AssignedClassesJson != null) teacher.AssignedClassesJson = request.AssignedClassesJson;

            _context.AuditLogs.Add(new AuditLog
            {
                SchoolId = teacher.SchoolId,
                UserId = CurrentUserId,
                UserRole = CurrentUserRole,
                ActionType = "TEACHER_UPDATED",
                EntityName = "User",
                EntityId = teacher.Id.ToString(),
                DetailsJson = $"{teacher.FullName} yetkileri güncellendi. Aktif: {teacher.IsActive}, Rol: {teacher.Role}",
                Timestamp = DateTime.UtcNow
            });

            await _context.SaveChangesAsync();
            return Ok(new { message = "Öğretmen bilgileri güncellendi." });
        }

        // Okul Adı ve Bilgilerini Güncelleme
        [HttpPut("{schoolId}")]
        public async Task<IActionResult> UpdateSchoolDetails(Guid schoolId, [FromBody] UpdateSchoolRequest request)
        {
            var school = await _context.Schools.FindAsync(schoolId);
            if (school == null) return NotFound(new { message = "Okul bulunamadı." });

            school.Name = request.Name.Trim();
            if (request.Phone != null) school.Phone = request.Phone;
            if (request.Address != null) school.Address = request.Address;

            _context.AuditLogs.Add(new AuditLog
            {
                SchoolId = school.Id,
                UserId = CurrentUserId,
                UserRole = CurrentUserRole,
                ActionType = "SCHOOL_UPDATED",
                EntityName = "School",
                EntityId = school.Id.ToString(),
                DetailsJson = $"Okul adı güncellendi: {school.Name}",
                Timestamp = DateTime.UtcNow
            });

            await _context.SaveChangesAsync();
            return Ok(school);
        }

        // Okul Ortak Gemini API Key ve Model Güncelleme
        [HttpPut("{schoolId}/gemini-key")]
        public async Task<IActionResult> UpdateGeminiApiKey(Guid schoolId, [FromBody] UpdateKeyRequest request)
        {
            var school = await _context.Schools.FindAsync(schoolId);
            if (school == null) return NotFound();

            school.GeminiApiKey = request.ApiKey?.Trim();
            if (!string.IsNullOrEmpty(request.Model))
            {
                school.GeminiModel = request.Model.Trim();
            }
            await _context.SaveChangesAsync();
            return Ok(new { message = "Okul ortak AI API anahtarı ve model tercihi güncellendi.", apiKey = school.GeminiApiKey, model = school.GeminiModel });
        }

        // Okul Ortak Gemini Yapılandırmasını Çek
        [AllowAnonymous]
        [HttpGet("{schoolId}/ai-config")]
        public async Task<IActionResult> GetSchoolAiConfig(Guid schoolId)
        {
            var school = await _context.Schools.FindAsync(schoolId);
            if (school == null) return NotFound(new { message = "Okul bulunamadı." });

            return Ok(new
            {
                apiKey = school.GeminiApiKey,
                model = school.GeminiModel
            });
        }

        // Öğretmen Silme (Admin yetkisi)
        [HttpDelete("teachers/{teacherId}")]
        public async Task<IActionResult> DeleteTeacher(Guid teacherId)
        {
            var teacher = await _context.Users.FindAsync(teacherId);
            if (teacher == null) return NotFound(new { message = "Öğretmen bulunamadı." });

            _context.Users.Remove(teacher);
            _context.AuditLogs.Add(new AuditLog
            {
                SchoolId = teacher.SchoolId,
                UserId = CurrentUserId,
                UserRole = CurrentUserRole,
                ActionType = "TEACHER_DELETED",
                EntityName = "User",
                EntityId = teacher.Id.ToString(),
                DetailsJson = $"{teacher.FullName} ({teacher.Username}) silindi.",
                Timestamp = DateTime.UtcNow
            });

            await _context.SaveChangesAsync();
            return Ok(new { message = "Öğretmen başarıyla silindi." });
        }

        // Öğretmen Bilgilerini Güncelleme
        [HttpPut("teachers/{teacherId}/details")]
        public async Task<IActionResult> UpdateTeacherDetails(Guid teacherId, [FromBody] CreateTeacherRequest request)
        {
            var teacher = await _context.Users.FindAsync(teacherId);
            if (teacher == null) return NotFound(new { message = "Öğretmen bulunamadı." });

            teacher.FullName = request.FullName.Trim() + (!string.IsNullOrEmpty(request.Branch) ? $" ({request.Branch.Trim()})" : "");
            if (request.Phone != null) teacher.Phone = request.Phone;
            if (request.Email != null) teacher.Email = request.Email;

            await _context.SaveChangesAsync();
            return Ok(teacher);
        }

        // Öğretmen Şifre Sıfırlama
        [HttpPost("teachers/{teacherId}/reset-password")]
        public async Task<IActionResult> ResetTeacherPassword(Guid teacherId, [FromBody] ResetPasswordRequest? req)
        {
            var teacher = await _context.Users.FindAsync(teacherId);
            if (teacher == null) return NotFound(new { message = "Öğretmen bulunamadı." });

            var newPass = !string.IsNullOrEmpty(req?.NewPassword) ? req.NewPassword : "1234";
            teacher.PasswordHash = BCrypt.Net.BCrypt.HashPassword(newPass);

            await _context.SaveChangesAsync();
            return Ok(new { message = $"Şifre başarıyla güncellendi: {newPass}", password = newPass });
        }

        // --- SINIF VE ŞUBE YÖNETİMİ ---

        [HttpGet("{schoolId}/classes")]
        public async Task<IActionResult> GetClasses(Guid schoolId)
        {
            var classes = await _context.SchoolClasses
                .Where(c => c.SchoolId == schoolId)
                .OrderBy(c => c.Grade)
                .ThenBy(c => c.Section)
                .Select(c => new
                {
                    c.Id,
                    c.SchoolId,
                    c.Grade,
                    c.Section,
                    ClassName = $"{c.Grade}-{c.Section}",
                    c.AcademicYear,
                    c.CreatedAt,
                    StudentCount = _context.Students.Count(s => s.SchoolId == schoolId && s.Grade == c.Grade && s.Section == c.Section)
                })
                .ToListAsync();

            return Ok(classes);
        }

        [HttpPost("{schoolId}/classes")]
        public async Task<IActionResult> CreateClass(Guid schoolId, [FromBody] CreateClassRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.Grade) || string.IsNullOrWhiteSpace(request.Section))
            {
                return BadRequest(new { message = "Kademe (Grade) ve Şube (Section) zorunludur." });
            }

            var grade = request.Grade.Trim();
            var section = request.Section.Trim().ToUpper();

            var exists = await _context.SchoolClasses.AnyAsync(c => c.SchoolId == schoolId && c.Grade == grade && c.Section == section);
            if (exists)
            {
                return BadRequest(new { message = $"{grade}-{section} sınıfı zaten mevcut." });
            }

            var newClass = new SchoolClass
            {
                Id = Guid.NewGuid(),
                SchoolId = schoolId,
                Grade = grade,
                Section = section,
                AcademicYear = request.AcademicYear ?? "2026-2027",
                CreatedAt = DateTime.UtcNow
            };

            await _context.SchoolClasses.AddAsync(newClass);
            await _context.SaveChangesAsync();

            return Ok(new
            {
                newClass.Id,
                newClass.SchoolId,
                newClass.Grade,
                newClass.Section,
                ClassName = $"{newClass.Grade}-{newClass.Section}",
                newClass.AcademicYear,
                newClass.CreatedAt,
                StudentCount = 0
            });
        }

        [HttpDelete("classes/{classId}")]
        public async Task<IActionResult> DeleteClass(Guid classId)
        {
            var item = await _context.SchoolClasses.FindAsync(classId);
            if (item == null) return NotFound(new { message = "Sınıf bulunamadı." });

            _context.SchoolClasses.Remove(item);
            await _context.SaveChangesAsync();
            return Ok(new { message = "Sınıf silindi." });
        }

        // --- DERS YÖNETİMİ ---

        [HttpGet("{schoolId}/lessons")]
        public async Task<IActionResult> GetLessons(Guid schoolId)
        {
            var lessons = await _context.SchoolLessons
                .Where(l => l.SchoolId == schoolId)
                .OrderBy(l => l.Name)
                .ToListAsync();

            return Ok(lessons);
        }

        [HttpPost("{schoolId}/lessons")]
        public async Task<IActionResult> CreateLesson(Guid schoolId, [FromBody] CreateLessonRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.Name))
            {
                return BadRequest(new { message = "Ders adı zorunludur." });
            }

            var newLesson = new SchoolLesson
            {
                Id = Guid.NewGuid(),
                SchoolId = schoolId,
                Name = request.Name.Trim(),
                ShortCode = request.ShortCode?.Trim().ToUpper(),
                Grade = request.Grade?.Trim() ?? "Tüm Kademeler",
                WeeklyHours = request.WeeklyHours > 0 ? request.WeeklyHours : 2,
                CreatedAt = DateTime.UtcNow
            };

            await _context.SchoolLessons.AddAsync(newLesson);
            await _context.SaveChangesAsync();

            return Ok(newLesson);
        }

        [HttpDelete("lessons/{lessonId}")]
        public async Task<IActionResult> DeleteLesson(Guid lessonId)
        {
            var item = await _context.SchoolLessons.FindAsync(lessonId);
            if (item == null) return NotFound(new { message = "Ders bulunamadı." });

            _context.SchoolLessons.Remove(item);
            await _context.SaveChangesAsync();
            return Ok(new { message = "Ders silindi." });
        }
    }

    public class CreateClassRequest
    {
        public string Grade { get; set; } = string.Empty;
        public string Section { get; set; } = string.Empty;
        public string? AcademicYear { get; set; }
    }

    public class CreateLessonRequest
    {
        public string Name { get; set; } = string.Empty;
        public string? ShortCode { get; set; }
        public string? Grade { get; set; }
        public int WeeklyHours { get; set; } = 2;
    }

    public class ResetPasswordRequest
    {
        public string? NewPassword { get; set; }
    }

    public class UpdateSchoolRequest
    {
        public string Name { get; set; } = string.Empty;
        public string? Phone { get; set; }
        public string? Address { get; set; }
    }


    public class UpdateTeacherStatusRequest
    {
        public bool IsActive { get; set; } = true;
        public string? Role { get; set; }
        public string? AssignedClassesJson { get; set; }
    }

    public class UpdateKeyRequest
    {
        public string? ApiKey { get; set; }
        public string? Model { get; set; }
    }

    public class CreateTeacherRequest
    {
        public string FullName { get; set; } = string.Empty;
        public string? Branch { get; set; }
        public string? Phone { get; set; }
        public string? Email { get; set; }
    }
}
