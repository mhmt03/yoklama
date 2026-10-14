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
    [Authorize(Roles = UserRoles.SuperAdmin)]
    public class SuperAdminController : ControllerBase
    {
        private readonly AppDbContext _context;

        public SuperAdminController(AppDbContext context)
        {
            _context = context;
        }

        [HttpGet("stats")]
        public async Task<IActionResult> GetSystemStats()
        {
            var totalSchools = await _context.Schools.CountAsync();
            var totalUsers = await _context.Users.CountAsync();
            var totalTeachers = await _context.Users.CountAsync(u => u.Role == UserRoles.Teacher);
            var totalStudents = await _context.Students.CountAsync();
            var totalAssignments = await _context.Assignments.CountAsync();

            return Ok(new
            {
                totalSchools,
                totalUsers,
                totalTeachers,
                totalStudents,
                totalAssignments
            });
        }

        [HttpGet("schools")]
        public async Task<IActionResult> GetAllSchools()
        {
            var schools = await _context.Schools
                .Select(s => new
                {
                    s.Id,
                    s.Name,
                    s.Code,
                    s.Phone,
                    s.CreatedAt,
                    s.LicenseExpiresAt,
                    s.IsActive,
                    TeacherCount = _context.Users.Count(u => u.SchoolId == s.Id && u.Role == UserRoles.Teacher),
                    StudentCount = _context.Students.Count(st => st.SchoolId == s.Id)
                })
                .OrderByDescending(s => s.CreatedAt)
                .ToListAsync();

            return Ok(schools);
        }

        // 1 Yıllık Lisans Uzatma / Süre Yönetimi
        [HttpPost("extend-license")]
        public async Task<IActionResult> ExtendLicense([FromBody] ExtendLicenseRequest request)
        {
            var school = await _context.Schools.FindAsync(request.TargetId);
            if (school != null)
            {
                var baseDate = (school.LicenseExpiresAt.HasValue && school.LicenseExpiresAt.Value > DateTime.UtcNow)
                    ? school.LicenseExpiresAt.Value
                    : DateTime.UtcNow;

                school.LicenseExpiresAt = baseDate.AddYears(request.AdditionalYears);
                school.IsActive = request.IsActive;

                // Okula bağlı tüm öğretmenlerin de lisans süresi güncellenir
                var teachers = await _context.Users.Where(u => u.SchoolId == school.Id).ToListAsync();
                foreach (var t in teachers)
                {
                    t.LicenseExpiresAt = school.LicenseExpiresAt;
                    t.IsActive = request.IsActive;
                }

                _context.AuditLogs.Add(new AuditLog
                {
                    SchoolId = school.Id,
                    UserId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!),
                    UserRole = UserRoles.SuperAdmin,
                    ActionType = "LICENSE_EXTENDED",
                    EntityName = "School",
                    EntityId = school.Id.ToString(),
                    DetailsJson = $"{school.Name} lisansı {request.AdditionalYears} yıl uzatıldı. Yeni Bitiş: {school.LicenseExpiresAt:yyyy-MM-dd}",
                    Timestamp = DateTime.UtcNow
                });

                await _context.SaveChangesAsync();
                return Ok(new { message = $"Lisans başarıyla uzatıldı. Yeni bitiş: {school.LicenseExpiresAt:dd.MM.yyyy}" });
            }

            // Bireysel öğretmen lisansı kontrolü
            var user = await _context.Users.FindAsync(request.TargetId);
            if (user != null)
            {
                var baseDate = (user.LicenseExpiresAt.HasValue && user.LicenseExpiresAt.Value > DateTime.UtcNow)
                    ? user.LicenseExpiresAt.Value
                    : DateTime.UtcNow;

                user.LicenseExpiresAt = baseDate.AddYears(request.AdditionalYears);
                user.IsActive = request.IsActive;

                _context.AuditLogs.Add(new AuditLog
                {
                    SchoolId = user.SchoolId,
                    UserId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!),
                    UserRole = UserRoles.SuperAdmin,
                    ActionType = "LICENSE_EXTENDED",
                    EntityName = "User",
                    EntityId = user.Id.ToString(),
                    DetailsJson = $"{user.FullName} bireysel lisansı {request.AdditionalYears} yıl uzatıldı.",
                    Timestamp = DateTime.UtcNow
                });

                await _context.SaveChangesAsync();
                return Ok(new { message = $"Öğretmen lisansı uzatıldı. Yeni bitiş: {user.LicenseExpiresAt:dd.MM.yyyy}" });
            }

            return NotFound(new { message = "Kayıt bulunamadı." });
        }

        [HttpGet("audit-logs")]
        public async Task<IActionResult> GetAuditLogs([FromQuery] int limit = 100)
        {
            var logs = await _context.AuditLogs
                .OrderByDescending(l => l.Timestamp)
                .Take(limit)
                .ToListAsync();

            return Ok(logs);
        }
    }
}
