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
                    s.LicenseExpiresAt,
                    s.IsActive,
                    TeacherCount = _context.Users.Count(u => u.SchoolId == s.Id && u.Role == UserRoles.Teacher),
                    StudentCount = _context.Students.Count(st => st.SchoolId == s.Id)
                })
                .ToListAsync();

            return Ok(schools);
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

        // Okul Ortak Gemini API Key Güncelleme
        [HttpPut("{schoolId}/gemini-key")]
        public async Task<IActionResult> UpdateGeminiApiKey(Guid schoolId, [FromBody] UpdateKeyRequest request)
        {
            var school = await _context.Schools.FindAsync(schoolId);
            if (school == null) return NotFound();

            school.GeminiApiKey = request.ApiKey;
            await _context.SaveChangesAsync();

            return Ok(new { message = "Okul ortak AI API anahtarı güncellendi." });
        }
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
    }

    public class CreateTeacherRequest
    {
        public string FullName { get; set; } = string.Empty;
        public string? Branch { get; set; }
        public string? Phone { get; set; }
        public string? Email { get; set; }
    }
}
