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
        private readonly Services.ISchoolPurgeService _purgeService;

        public SuperAdminController(AppDbContext context, Services.ISchoolPurgeService purgeService)
        {
            _context = context;
            _purgeService = purgeService;
        }

        [HttpGet("stats")]
        public async Task<IActionResult> GetSystemStats()
        {
            // Eğer sistemde silinmiş/pasif okullar veya yetim öğretmenler varsa arka planda temizle
            var hasInactiveSchools = await _context.Schools.AnyAsync(s => !s.IsActive);
            if (hasInactiveSchools)
            {
                try
                {
                    await _purgeService.CleanupOrphanDataAsync(_context);
                }
                catch { }
            }

            var activeSchoolIds = await _context.Schools.Where(s => s.IsActive).Select(s => s.Id).ToListAsync();
            var activeSchoolIdStrings = activeSchoolIds.Select(id => id.ToString()).ToList();

            var totalSchools = activeSchoolIds.Count;
            var totalCustomers = await _context.Users.CountAsync(u => u.Role == UserRoles.SchoolAdmin && u.IsActive);
            var totalUsers = await _context.Users.CountAsync(u => u.IsActive);

            // Öğretmenler: Sadece aktif bir okula bağlı olan ve kendisi de aktif olan öğretmenler
            var totalTeachers = await _context.Users
                .Where(u => u.Role == UserRoles.Teacher && u.IsActive &&
                            ((u.SchoolId.HasValue && activeSchoolIds.Contains(u.SchoolId.Value)) ||
                             (!string.IsNullOrEmpty(u.AssignedSchoolIdsJson) && activeSchoolIdStrings.Any(asId => u.AssignedSchoolIdsJson.Contains(asId)))))
                .CountAsync();

            var totalStudents = await _context.Students
                .Where(st => activeSchoolIds.Contains(st.SchoolId))
                .CountAsync();

            var totalAssignments = await _context.Assignments
                .Where(a => activeSchoolIds.Contains(a.SchoolId))
                .CountAsync();

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

        [HttpPost("cleanup-orphans")]
        public async Task<IActionResult> CleanupOrphanData()
        {
            var result = await _purgeService.CleanupOrphanDataAsync(_context);
            return Ok(result);
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
                .Where(s => s.IsActive)
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
                    TeacherCount = _context.Users.Count(u => u.IsActive && u.Role == UserRoles.Teacher && (u.SchoolId == s.Id || (u.AssignedSchoolIdsJson != null && u.AssignedSchoolIdsJson.Contains(s.Id.ToString())))),
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

                var schoolIds = schools.Select(s => s.Id).ToList();

                var teacherCount = await _context.Users
                    .CountAsync(u => ((u.SchoolId.HasValue && schoolIds.Contains(u.SchoolId.Value)) ||
                                      (u.CustomerId != null && u.CustomerId.ToLower() == cleanCode)) && u.Role == UserRoles.Teacher);

                var studentCount = await _context.Students
                    .CountAsync(st => schoolIds.Contains(st.SchoolId));

                var adminUser = inst.AdminUserId.HasValue
                    ? await _context.Users.FirstOrDefaultAsync(u => u.Id == inst.AdminUserId.Value)
                    : await _context.Users.FirstOrDefaultAsync(u => u.Role == UserRoles.SchoolAdmin && u.CustomerId != null && u.CustomerId.ToLower() == cleanCode);

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
                    SchoolNames = schools.Select(s => $"{s.Name} ({s.Code})").ToList(),
                    AdminUserId = adminUser?.Id ?? inst.AdminUserId,
                    AdminUsername = adminUser?.Username ?? "admin",
                    AdminFullName = adminUser?.FullName ?? $"{inst.Name} Yöneticisi",
                    AdminPassword = inst.AdminPassword ?? (adminUser?.Username == "admin" ? "admin123" : "1234"),
                    TotalTeachers = teacherCount,
                    TotalStudents = studentCount
                });
            }

            return Ok(result);
        }

        [HttpGet("institutions/{id}/details")]
        public async Task<IActionResult> GetInstitutionDetails(Guid id)
        {
            var inst = await _context.Institutions.FindAsync(id);
            if (inst == null) return NotFound(new { message = "Kurum bulunamadı." });

            var cleanCode = inst.Code.ToLower();

            // 1. Kurum Admini
            var adminUser = inst.AdminUserId.HasValue 
                ? await _context.Users.FirstOrDefaultAsync(u => u.Id == inst.AdminUserId.Value)
                : await _context.Users.FirstOrDefaultAsync(u => u.Role == UserRoles.SchoolAdmin && u.CustomerId != null && u.CustomerId.ToLower() == cleanCode);

            // 2. Okullar
            var schools = await _context.Schools
                .Where(s => (s.CustomerId != null && s.CustomerId.ToLower() == cleanCode) ||
                            (inst.AdminUserId.HasValue && s.AdminUserId == inst.AdminUserId.Value))
                .OrderByDescending(s => s.CreatedAt)
                .ToListAsync();

            var schoolIds = schools.Select(s => s.Id).ToList();

            // 3. Öğretmenler
            var teachers = await _context.Users
                .Where(u => (u.SchoolId.HasValue && schoolIds.Contains(u.SchoolId.Value)) ||
                            (u.CustomerId != null && u.CustomerId.ToLower() == cleanCode && u.Role == UserRoles.Teacher))
                .Select(u => new
                {
                    u.Id,
                    u.FullName,
                    u.Username,
                    u.Role,
                    u.Phone,
                    u.Email,
                    u.Branch,
                    u.LastLoginAt,
                    u.SchoolId,
                    SchoolName = _context.Schools.Where(s => s.Id == u.SchoolId).Select(s => s.Name).FirstOrDefault() ?? "Genel"
                })
                .OrderBy(u => u.FullName)
                .ToListAsync();

            // 4. Öğrenciler (Önizleme listesi ve toplam sayı)
            var students = await _context.Students
                .Where(st => schoolIds.Contains(st.SchoolId))
                .Select(st => new
                {
                    st.Id,
                    st.FullName,
                    st.StudentNumber,
                    st.Grade,
                    st.Section,
                    st.SchoolId,
                    SchoolName = _context.Schools.Where(s => s.Id == st.SchoolId).Select(s => s.Name).FirstOrDefault() ?? "Okul"
                })
                .OrderBy(st => st.Grade).ThenBy(st => st.Section).ThenBy(st => st.StudentNumber)
                .Take(200)
                .ToListAsync();

            var totalStudentsCount = await _context.Students.CountAsync(st => schoolIds.Contains(st.SchoolId));

            // 5. Günlük Loglar
            var recentLogs = await _context.AuditLogs
                .Where(l => l.SchoolId.HasValue && schoolIds.Contains(l.SchoolId.Value))
                .OrderByDescending(l => l.Timestamp)
                .Take(40)
                .ToListAsync();

            return Ok(new
            {
                institution = new
                {
                    inst.Id,
                    inst.Code,
                    inst.Name,
                    inst.MaxSchoolCount,
                    CurrentSchoolCount = schools.Count,
                    inst.ContactName,
                    inst.ContactPhone,
                    inst.ContactEmail,
                    inst.LicenseExpiresAt,
                    inst.IsActive,
                    inst.CreatedAt
                },
                admin = new
                {
                    userId = adminUser?.Id,
                    username = adminUser?.Username ?? "admin",
                    fullName = adminUser?.FullName ?? $"{inst.Name} Yöneticisi",
                    password = inst.AdminPassword ?? (adminUser?.Username == "admin" ? "admin123" : "1234"),
                    lastLoginAt = adminUser?.LastLoginAt
                },
                schools = schools.Select(s => new
                {
                    s.Id,
                    s.Name,
                    s.Code,
                    s.Phone,
                    s.Address,
                    s.DailyLessonHours,
                    s.LicenseExpiresAt,
                    s.IsActive,
                    s.CreatedAt,
                    TeacherCount = teachers.Count(t => t.SchoolId == s.Id),
                    StudentCount = _context.Students.Count(st => st.SchoolId == s.Id)
                }).ToList(),
                teachers,
                students,
                totalStudentsCount,
                stats = new
                {
                    schoolCount = schools.Count,
                    teacherCount = teachers.Count,
                    studentCount = totalStudentsCount,
                    logCount = recentLogs.Count
                },
                recentLogs
            });
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
                AdminPassword = request.AdminPassword?.Trim(),
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

            var oldCode = inst.Code;

            // Kurum Kodu Güncelleme (Benzersizlik ve İlişkili Veri Güncellemesi)
            if (!string.IsNullOrWhiteSpace(request.Code))
            {
                var cleanCode = request.Code.Trim().ToLowerInvariant();
                if (cleanCode != oldCode.ToLowerInvariant())
                {
                    var exists = await _context.Institutions.AnyAsync(i => i.Id != id && i.Code.ToLower() == cleanCode);
                    if (exists)
                    {
                        return BadRequest(new { message = $"'{cleanCode}' kurum kodu zaten başka bir kurum tarafından kullanılmaktadır." });
                    }

                    inst.Code = cleanCode;

                    // Bu kuruma bağlı okulların CustomerId kodlarını da senkronize et
                    var schools = await _context.Schools
                        .Where(s => s.CustomerId != null && s.CustomerId.ToLower() == oldCode.ToLower())
                        .ToListAsync();
                    foreach (var s in schools)
                    {
                        s.CustomerId = cleanCode;
                    }

                    // Bu kuruma bağlı kullanıcıların CustomerId kodlarını da senkronize et
                    var users = await _context.Users
                        .Where(u => u.CustomerId != null && u.CustomerId.ToLower() == oldCode.ToLower())
                        .ToListAsync();
                    foreach (var u in users)
                    {
                        u.CustomerId = cleanCode;
                    }
                }
            }

            if (!string.IsNullOrEmpty(request.Name)) inst.Name = request.Name.Trim();
            if (request.MaxSchoolCount.HasValue && request.MaxSchoolCount.Value > 0) inst.MaxSchoolCount = request.MaxSchoolCount.Value;
            if (request.IsActive.HasValue) inst.IsActive = request.IsActive.Value;
            if (request.ContactName != null) inst.ContactName = request.ContactName;
            if (request.ContactPhone != null) inst.ContactPhone = request.ContactPhone;
            if (request.ContactEmail != null) inst.ContactEmail = request.ContactEmail;

            // Manuel Lisans Bitiş Tarihi veya Ek Yıl
            if (request.LicenseExpiresAt.HasValue)
            {
                inst.LicenseExpiresAt = request.LicenseExpiresAt.Value;
            }
            else if (request.AdditionalYears.HasValue && request.AdditionalYears.Value > 0)
            {
                var baseDate = (inst.LicenseExpiresAt.HasValue && inst.LicenseExpiresAt.Value > DateTime.UtcNow)
                    ? inst.LicenseExpiresAt.Value
                    : DateTime.UtcNow;
                inst.LicenseExpiresAt = baseDate.AddYears(request.AdditionalYears.Value);
            }

            // Lisans süresi değiştiyse bağlı okulları ve öğretmenleri de senkronize et
            if (request.LicenseExpiresAt.HasValue || (request.AdditionalYears.HasValue && request.AdditionalYears.Value > 0))
            {
                var syncCode = inst.Code.ToLower();
                var schoolsToSync = await _context.Schools
                    .Where(s => s.CustomerId != null && s.CustomerId.ToLower() == syncCode)
                    .ToListAsync();
                foreach (var s in schoolsToSync)
                {
                    s.LicenseExpiresAt = inst.LicenseExpiresAt;
                    if (request.IsActive.HasValue) s.IsActive = request.IsActive.Value;
                }

                var usersToSync = await _context.Users
                    .Where(u => u.CustomerId != null && u.CustomerId.ToLower() == syncCode)
                    .ToListAsync();
                foreach (var u in usersToSync)
                {
                    u.LicenseExpiresAt = inst.LicenseExpiresAt;
                    if (request.IsActive.HasValue) u.IsActive = request.IsActive.Value;
                }
            }

            // Yönetici Şifresi ve Kullanıcı Adı Güncellemesi
            var adminUser = inst.AdminUserId.HasValue
                ? await _context.Users.FirstOrDefaultAsync(u => u.Id == inst.AdminUserId.Value)
                : await _context.Users.FirstOrDefaultAsync(u => u.Role == UserRoles.SchoolAdmin && u.CustomerId != null && u.CustomerId.ToLower() == inst.Code.ToLower());

            if (!string.IsNullOrWhiteSpace(request.AdminPassword))
            {
                inst.AdminPassword = request.AdminPassword.Trim();
                if (adminUser != null)
                {
                    adminUser.PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.AdminPassword.Trim());
                }
            }

            if (!string.IsNullOrWhiteSpace(request.AdminUsername) && adminUser != null)
            {
                adminUser.Username = request.AdminUsername.Trim().ToLower();
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

            var schoolName = school.Name;
            var purgeResult = await _purgeService.PurgeSchoolAsync(_context, id);

            return Ok(new { 
                message = $"Okul ({schoolName}) ve bağlı tüm verileri sistemden tamamen silindi.",
                details = purgeResult
            });
        }
    }
}
