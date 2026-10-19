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
            var totalCustomers = await _context.Users.CountAsync(u => u.Role == UserRoles.SchoolAdmin);
            var totalUsers = await _context.Users.CountAsync();
            var totalTeachers = await _context.Users.CountAsync(u => u.Role == UserRoles.Teacher);
            var totalStudents = await _context.Students.CountAsync();
            var totalAssignments = await _context.Assignments.CountAsync();

            return Ok(new
            {
                totalSchools,
                totalCustomers,
                totalUsers,
                totalTeachers,
                totalStudents,
                totalAssignments
            });
        }

        // Tüm Müşterileri (Okul Adminleri) Listele - Çoklu Okul & İlişki ID Bağlantısı
        [HttpGet("customers")]
        public async Task<IActionResult> GetAllCustomers()
        {
            var admins = await _context.Users
                .Where(u => u.Role == UserRoles.SchoolAdmin)
                .OrderByDescending(u => u.CreatedAt)
                .ToListAsync();

            var result = new System.Collections.Generic.List<CustomerResponse>();

            foreach (var a in admins)
            {
                var customerId = a.CustomerId ?? a.Username;
                var relationId = a.RelationId ?? a.Id.ToString();

                var schools = await _context.Schools
                    .Where(s => s.AdminUserId == a.Id || s.CustomerId == customerId || s.RelationId == relationId)
                    .ToListAsync();

                var schoolIds = schools.Select(s => s.Id).ToList();

                var teacherCount = await _context.Users
                    .CountAsync(u => (u.RelationId == relationId || (u.SchoolId.HasValue && schoolIds.Contains(u.SchoolId.Value))) && u.Role == UserRoles.Teacher);

                var studentCount = await _context.Students
                    .CountAsync(st => st.RelationId == relationId || schoolIds.Contains(st.SchoolId));

                result.Add(new CustomerResponse
                {
                    Id = a.Id,
                    CustomerId = customerId,
                    RelationId = relationId,
                    FullName = a.FullName,
                    Username = a.Username,
                    Phone = a.Phone,
                    Email = a.Email,
                    CreatedAt = a.CreatedAt,
                    LicenseExpiresAt = a.LicenseExpiresAt,
                    IsActive = a.IsActive,
                    SchoolCount = schools.Count,
                    SchoolNames = schools.Select(s => $"{s.Name} ({s.Code})").ToList(),
                    TeacherCount = teacherCount,
                    StudentCount = studentCount
                });
            }

            return Ok(result);
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
                    s.CustomerId,
                    s.RelationId,
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

        // Lisans Uzatma / Süre Yönetimi (Müşteri Admin, Okul veya Bireysel Öğretmen)
        [HttpPost("extend-license")]
        public async Task<IActionResult> ExtendLicense([FromBody] ExtendLicenseRequest request)
        {
            // 1. Müşteri (Okul Admini) ise: Tüm okulları, öğretmenleri ve öğrencileri tek seferde uzat
            var adminCustomer = await _context.Users.FirstOrDefaultAsync(u => u.Id == request.TargetId && u.Role == UserRoles.SchoolAdmin);
            if (adminCustomer != null)
            {
                var baseDate = (adminCustomer.LicenseExpiresAt.HasValue && adminCustomer.LicenseExpiresAt.Value > DateTime.UtcNow)
                    ? adminCustomer.LicenseExpiresAt.Value
                    : DateTime.UtcNow;

                adminCustomer.LicenseExpiresAt = baseDate.AddYears(request.AdditionalYears);
                adminCustomer.IsActive = request.IsActive;

                var customerId = adminCustomer.CustomerId ?? adminCustomer.Username;
                var relationId = adminCustomer.RelationId;

                // Müşterinin yönettiği tüm okulların lisansını güncelle
                var customerSchools = await _context.Schools
                    .Where(s => s.AdminUserId == adminCustomer.Id || s.CustomerId == customerId || (!string.IsNullOrEmpty(relationId) && s.RelationId == relationId))
                    .ToListAsync();

                foreach (var sc in customerSchools)
                {
                    sc.LicenseExpiresAt = adminCustomer.LicenseExpiresAt;
                    sc.IsActive = request.IsActive;
                }

                // Bu müşteriye/ilişkiye bağlı tüm öğretmenlerin lisansını güncelle
                var schoolIds = customerSchools.Select(s => s.Id).ToList();
                var customerTeachers = await _context.Users
                    .Where(u => (!string.IsNullOrEmpty(relationId) && u.RelationId == relationId) || (u.SchoolId.HasValue && schoolIds.Contains(u.SchoolId.Value)))
                    .ToListAsync();

                foreach (var t in customerTeachers)
                {
                    t.LicenseExpiresAt = adminCustomer.LicenseExpiresAt;
                    t.IsActive = request.IsActive;
                }

                _context.AuditLogs.Add(new AuditLog
                {
                    UserId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!),
                    UserRole = UserRoles.SuperAdmin,
                    ActionType = "CUSTOMER_LICENSE_EXTENDED",
                    EntityName = "User",
                    EntityId = adminCustomer.Id.ToString(),
                    DetailsJson = $"Müşteri {adminCustomer.FullName} ({adminCustomer.CustomerId}) lisansı {request.AdditionalYears} yıl uzatıldı. ({customerSchools.Count} okul, {customerTeachers.Count} öğretmen güncellendi).",
                    Timestamp = DateTime.UtcNow
                });

                await _context.SaveChangesAsync();
                return Ok(new { message = $"Müşteri ({adminCustomer.CustomerId}) ve bağlı {customerSchools.Count} okulun lisansı uzatıldı. Yeni Bitiş: {adminCustomer.LicenseExpiresAt:dd.MM.yyyy}" });
            }

            // 2. Belirli bir Okul ise
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

                // Okulun sahibi olan admin müşterinin süresini de eşitle
                if (school.AdminUserId.HasValue)
                {
                    var ownerAdmin = await _context.Users.FindAsync(school.AdminUserId.Value);
                    if (ownerAdmin != null)
                    {
                        ownerAdmin.LicenseExpiresAt = school.LicenseExpiresAt;
                        ownerAdmin.IsActive = request.IsActive;
                    }
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

            // 3. Bireysel öğretmen lisansı kontrolü
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

        // --- KURUMLAR (INSTITUTIONS / TENANTS) YÖNETİMİ ---
        [HttpGet("institutions")]
        public async Task<IActionResult> GetAllInstitutions()
        {
            var institutions = await _context.Institutions
                .OrderByDescending(i => i.CreatedAt)
                .ToListAsync();

            var result = new System.Collections.Generic.List<InstitutionDto>();

            foreach (var inst in institutions)
            {
                var cleanCode = inst.Code.ToLower();
                var schools = await _context.Schools
                    .Where(s => (s.CustomerId != null && s.CustomerId.ToLower() == cleanCode) ||
                                (inst.AdminUserId.HasValue && s.AdminUserId == inst.AdminUserId.Value))
                    .ToListAsync();

                result.Add(new InstitutionDto
                {
                    Id = inst.Id,
                    Code = inst.Code,
                    Name = inst.Name,
                    MaxSchoolCount = inst.MaxSchoolCount,
                    CurrentSchoolCount = schools.Count,
                    ContactName = inst.ContactName,
                    ContactPhone = inst.ContactPhone,
                    ContactEmail = inst.ContactEmail,
                    LicenseExpiresAt = inst.LicenseExpiresAt,
                    IsActive = inst.IsActive,
                    SchoolNames = schools.Select(s => $"{s.Name} ({s.Code})").ToList()
                });
            }

            return Ok(result);
        }

        [HttpPost("institutions")]
        public async Task<IActionResult> CreateInstitution([FromBody] CreateInstitutionRequest request)
        {
            var cleanCode = request.Code.Trim().ToLower();
            if (string.IsNullOrEmpty(cleanCode) || string.IsNullOrEmpty(request.Name))
            {
                return BadRequest(new { message = "Kurum kodu ve kurum adı zorunludur." });
            }

            var exists = await _context.Institutions.AnyAsync(i => i.Code.ToLower() == cleanCode);
            if (exists)
            {
                return BadRequest(new { message = "Bu kurum adı/kodu zaten sistemde kayıtlı. Lütfen benzersiz bir ad giriniz." });
            }

            var inst = new Institution
            {
                Id = Guid.NewGuid(),
                Code = cleanCode,
                Name = request.Name.Trim(),
                MaxSchoolCount = request.MaxSchoolCount > 0 ? request.MaxSchoolCount : 1,
                ContactName = request.ContactName,
                ContactPhone = request.ContactPhone,
                ContactEmail = request.ContactEmail,
                CreatedAt = DateTime.UtcNow,
                LicenseExpiresAt = DateTime.UtcNow.AddYears(request.AdditionalYears > 0 ? request.AdditionalYears : 1),
                IsActive = true
            };

            // Eğer yönetici hesabı bilgisi verilmişse otomatik SchoolAdmin oluştur
            if (!string.IsNullOrEmpty(request.AdminUsername) && !string.IsNullOrEmpty(request.AdminPassword))
            {
                var cleanAdminUser = request.AdminUsername.Trim().ToLower();
                var adminUser = await _context.Users.FirstOrDefaultAsync(u => u.Username.ToLower() == cleanAdminUser);
                if (adminUser == null)
                {
                    adminUser = new User
                    {
                        Id = Guid.NewGuid(),
                        Username = cleanAdminUser,
                        PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.AdminPassword),
                        FullName = request.AdminFullName ?? $"{request.Name} Yöneticisi",
                        Role = UserRoles.SchoolAdmin,
                        CustomerId = cleanCode,
                        RelationId = $"ILK-{Guid.NewGuid().ToString("N").Substring(0, 5).ToUpper()}",
                        CreatedAt = DateTime.UtcNow,
                        LicenseExpiresAt = inst.LicenseExpiresAt,
                        IsActive = true
                    };
                    await _context.Users.AddAsync(adminUser);
                    inst.AdminUserId = adminUser.Id;
                }
                else
                {
                    adminUser.CustomerId = cleanCode;
                    inst.AdminUserId = adminUser.Id;
                }
            }

            await _context.Institutions.AddAsync(inst);
            await _context.SaveChangesAsync();

            return Ok(inst);
        }

        [HttpPut("institutions/{id}")]
        public async Task<IActionResult> UpdateInstitution(Guid id, [FromBody] UpdateInstitutionRequest request)
        {
            var inst = await _context.Institutions.FindAsync(id);
            if (inst == null)
            {
                return NotFound(new { message = "Kurum bulunamadı." });
            }

            if (!string.IsNullOrEmpty(request.Name)) inst.Name = request.Name.Trim();
            if (request.MaxSchoolCount.HasValue && request.MaxSchoolCount.Value > 0) inst.MaxSchoolCount = request.MaxSchoolCount.Value;
            if (request.IsActive.HasValue) inst.IsActive = request.IsActive.Value;
            if (request.ContactName != null) inst.ContactName = request.ContactName;
            if (request.ContactPhone != null) inst.ContactPhone = request.ContactPhone;
            if (request.ContactEmail != null) inst.ContactEmail = request.ContactEmail;
            if (request.AdditionalYears.HasValue && request.AdditionalYears.Value > 0)
            {
                var baseDate = (inst.LicenseExpiresAt.HasValue && inst.LicenseExpiresAt.Value > DateTime.UtcNow)
                    ? inst.LicenseExpiresAt.Value
                    : DateTime.UtcNow;
                inst.LicenseExpiresAt = baseDate.AddYears(request.AdditionalYears.Value);
            }

            await _context.SaveChangesAsync();
            return Ok(inst);
        }

        [HttpDelete("institutions/{id}")]
        public async Task<IActionResult> DeleteInstitution(Guid id)
        {
            var inst = await _context.Institutions.FindAsync(id);
            if (inst == null)
            {
                return NotFound(new { message = "Kurum bulunamadı." });
            }

            _context.Institutions.Remove(inst);
            await _context.SaveChangesAsync();
            return Ok(new { message = $"Kurum ({inst.Name}) sistemden silindi." });
        }

        [HttpDelete("schools/{id}")]
        public async Task<IActionResult> DeleteSchool(Guid id)
        {
            var school = await _context.Schools.FindAsync(id);
            if (school == null)
            {
                return NotFound(new { message = "Okul bulunamadı." });
            }

            _context.Schools.Remove(school);
            await _context.SaveChangesAsync();
            return Ok(new { message = $"Okul ({school.Name}) sistemden silindi." });
        }
    }
}
