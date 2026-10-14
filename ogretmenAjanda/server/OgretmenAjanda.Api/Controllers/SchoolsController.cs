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

            var school = new School
            {
                Id = Guid.NewGuid(),
                Name = request.Name.Trim(),
                Code = schoolCode,
                Address = request.Address,
                Phone = request.Phone,
                AdminUserId = CurrentUserId,
                GeminiApiKey = request.GeminiApiKey,
                CreatedAt = DateTime.UtcNow,
                LicenseExpiresAt = DateTime.UtcNow.AddYears(1), // Varsayılan 1 yıl deneme/lisans
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
                DetailsJson = $"{school.Name} oluşturuldu. Okul Kodu: {school.Code}",
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
                    u.IsActive,
                    u.AssignedClassesJson,
                    u.CreatedAt,
                    u.LastLoginAt
                })
                .ToListAsync();

            return Ok(teachers);
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
}
