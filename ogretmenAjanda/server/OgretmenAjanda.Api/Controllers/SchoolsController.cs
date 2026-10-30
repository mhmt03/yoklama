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
    public class SchoolsController : ControllerBase
    {
        private readonly AppDbContext _context;
        private readonly IAuditLogService _auditLogService;
        private readonly ISchoolPurgeService _purgeService;

        public SchoolsController(AppDbContext context, IAuditLogService auditLogService, ISchoolPurgeService purgeService)
        {
            _context = context;
            _auditLogService = auditLogService;
            _purgeService = purgeService;
        }

        private Guid CurrentUserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        private string CurrentUserRole => User.FindFirstValue(ClaimTypes.Role)!;
        private string? CurrentUserName => User.FindFirstValue(ClaimTypes.Name) ?? User.Identity?.Name;
        private bool IsTeacher => string.Equals(CurrentUserRole, UserRoles.Teacher, StringComparison.OrdinalIgnoreCase);

        private async Task LogActionAsync(Guid? schoolId, string actionType, string entityName, string? entityId, string description, string? detailsJson = null)
        {
            try
            {
                var adminUser = await _context.Users.FindAsync(CurrentUserId);
                await _auditLogService.LogAsync(
                    _context,
                    schoolId,
                    CurrentUserId,
                    adminUser?.Username ?? CurrentUserName,
                    adminUser?.FullName,
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

        // Adminin veya İdarecinin okullarını listele
        [HttpGet("my-schools")]
        public async Task<IActionResult> GetMySchools()
        {
            IQueryable<School> query = _context.Schools.Where(s => s.IsActive);

            if (CurrentUserRole == UserRoles.SuperAdmin)
            {
                // Süper admin tüm okulları görür
            }
            else
            {
                var currentUser = await _context.Users.FindAsync(CurrentUserId);
                if (currentUser == null) return Unauthorized();

                if (currentUser.Role == UserRoles.Student || currentUser.Role == UserRoles.Parent)
                {
                    return Forbid("Öğrenci ve veli hesapları okul yönetimi listelerine erişemez.");
                }

                var customerId = currentUser.CustomerId;
                var relationId = currentUser.RelationId;

                // Kurum Admini mi? (Kurumun ana lisans sahibi / müşterisi - 1 adet)
                bool isInstitutionOwner = (currentUser.Role == UserRoles.SchoolAdmin || currentUser.Role == UserRoles.InstitutionAdmin) &&
                    (!currentUser.SchoolId.HasValue || _context.Institutions.Any(i => i.AdminUserId == currentUser.Id || (!string.IsNullOrEmpty(customerId) && i.Code.ToLower() == customerId.ToLower())));

                if (isInstitutionOwner)
                {
                    // Kurum Admini kurumuna bağlı tüm okulları görür
                    query = query.Where(s => s.AdminUserId == CurrentUserId ||
                        (!string.IsNullOrEmpty(customerId) && s.CustomerId == customerId) ||
                        (!string.IsNullOrEmpty(relationId) && s.RelationId == relationId));
                }
                else
                {
                    // Okul Admini / İdareci / Öğretmen:
                    // 1) AssignedSchoolIdsJson içinde atanmış okullar
                    var assignedSchoolIds = new List<Guid>();
                    if (!string.IsNullOrEmpty(currentUser.AssignedSchoolIdsJson))
                    {
                        try
                        {
                            var parsed = System.Text.Json.JsonSerializer.Deserialize<List<string>>(currentUser.AssignedSchoolIdsJson);
                            if (parsed != null)
                            {
                                foreach (var p in parsed)
                                {
                                    if (Guid.TryParse(p, out var g)) assignedSchoolIds.Add(g);
                                }
                            }
                        }
                        catch { }
                    }

                    // 2) Birincil SchoolId
                    if (currentUser.SchoolId.HasValue && !assignedSchoolIds.Contains(currentUser.SchoolId.Value))
                    {
                        assignedSchoolIds.Add(currentUser.SchoolId.Value);
                    }

                    if (assignedSchoolIds.Count > 0)
                    {
                        query = query.Where(s => assignedSchoolIds.Contains(s.Id));
                    }
                    else
                    {
                        // Fallback: Kullanıcının kurumuna/ilişkisine bağlı okullar (özellikle Özkan Sunturlu gibi mevcut kullanıcılar için)
                        query = query.Where(s => (!string.IsNullOrEmpty(customerId) && s.CustomerId == customerId) ||
                                                 (!string.IsNullOrEmpty(relationId) && s.RelationId == relationId) ||
                                                 (currentUser.SchoolId.HasValue && s.Id == currentUser.SchoolId.Value));
                    }
                }
            }

            var schools = await query
                .Select(s => new
                {
                    s.Id,
                    s.Name,
                    s.Code,
                    s.Address,
                    s.Phone,
                    s.GeminiApiKey,
                    s.GeminiModel,
                    DailyLessonHours = s.DailyLessonHours > 0 ? s.DailyLessonHours : 8,
                    s.LicenseExpiresAt,
                    s.IsActive,
                    TeacherCount = _context.Users.Count(u => u.SchoolId == s.Id && u.Role == UserRoles.Teacher),
                    StudentCount = _context.Students.Count(st => st.SchoolId == s.Id)
                })
                .ToListAsync();

            return Ok(schools);
        }

        // Okul koduna göre aynı adminin/kurumun yönettiği okulları listele
        [AllowAnonymous]
        [HttpGet("affiliated-by-code/{code}")]
        public async Task<IActionResult> GetAffiliatedByCode(
            string code,
            [FromQuery] string? teacherName = null,
            [FromQuery] string? username = null)
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

            var allSchoolsQuery = _context.Schools
                .Where(s => s.IsActive && (
                    s.AdminUserId == adminUserId ||
                    (!string.IsNullOrEmpty(customerId) && s.CustomerId == customerId) ||
                    (!string.IsNullOrEmpty(relationId) && s.RelationId == relationId)
                ));

            var cleanTeacher = teacherName?.Trim().ToLower();
            var cleanUser = username?.Trim().ToLower();

            // Eğer öğretmen için sorgulanıyorsa, sadece öğretmenin tanımlı olduğu okulları filtrele
            if (!string.IsNullOrEmpty(cleanTeacher) || !string.IsNullOrEmpty(cleanUser) || CurrentUserRole == UserRoles.Teacher)
            {
                var targetSchools = await allSchoolsQuery.ToListAsync();
                var validSchoolIds = new List<Guid>();

                foreach (var sch in targetSchools)
                {
                    // 1. Bu okulda bu kullanıcı adına veya tam adına kayıtlı öğretmen var mı?
                    var hasUser = await _context.Users.AnyAsync(u =>
                        u.SchoolId == sch.Id && u.IsActive &&
                        ((!string.IsNullOrEmpty(cleanUser) && u.Username.ToLower() == cleanUser) ||
                         (!string.IsNullOrEmpty(cleanTeacher) && u.FullName.ToLower() == cleanTeacher))
                    );

                    if (hasUser)
                    {
                        validSchoolIds.Add(sch.Id);
                        continue;
                    }

                    // 2. Bu okulun ders programında bu öğretmene atanmış ders var mı?
                    if (!string.IsNullOrEmpty(cleanTeacher))
                    {
                        var hasSchedule = await _context.ScheduleItems.AnyAsync(si =>
                            si.SchoolId == sch.Id && si.TeacherName != null &&
                            si.TeacherName.ToLower().Contains(cleanTeacher)
                        );

                        if (hasSchedule)
                        {
                            validSchoolIds.Add(sch.Id);
                            continue;
                        }
                    }
                }

                if (validSchoolIds.Count > 0)
                {
                    allSchoolsQuery = _context.Schools.Where(s => validSchoolIds.Contains(s.Id));
                }
                else
                {
                    // Eğer öğretmen diğer alt okullarda bulunamadıysa giriş yaptığı okulu koru
                    allSchoolsQuery = _context.Schools.Where(s => s.Id == primarySchool.Id);
                }
            }

            var allSchools = await allSchoolsQuery
                .Select(s => new
                {
                    s.Id,
                    s.Name,
                    s.Code,
                    s.Address,
                    s.Phone,
                    s.GeminiApiKey,
                    s.GeminiModel,
                    DailyLessonHours = s.DailyLessonHours > 0 ? s.DailyLessonHours : 8,
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

            var adminUser = await _context.Users.FindAsync(CurrentUserId);
            var customerId = adminUser?.CustomerId ?? $"MST-{Guid.NewGuid().ToString("N").Substring(0, 5).ToUpper()}";
            var relationId = adminUser?.RelationId ?? $"ILK-{Guid.NewGuid().ToString("N").Substring(0, 5).ToUpper()}";

            // Kurum Lisansı ve Max Okul Sayısı Kontrolü
            var institution = await _context.Institutions
                .FirstOrDefaultAsync(i => (!string.IsNullOrEmpty(customerId) && i.Code.ToLower() == customerId.ToLower()) || (adminUser != null && i.AdminUserId == adminUser.Id));

            int maxAllowed = institution?.MaxSchoolCount ?? 2;
            var count = await _context.Schools.CountAsync(s => 
                s.AdminUserId == CurrentUserId || 
                (!string.IsNullOrEmpty(customerId) && s.CustomerId == customerId)
            );

            if (count >= maxAllowed && CurrentUserRole != UserRoles.SuperAdmin)
            {
                return BadRequest(new { message = $"Kurumunuzun lisansı en fazla {maxAllowed} okul açmaya izin vermektedir. Lisans sınırına ulaştınız ({count}/{maxAllowed}). Daha fazla okul açmak için sistem yöneticisi (SuperAdmin) ile iletişime geçiniz." });
            }

            // Rastgele 8 haneli benzersiz okul kodu oluştur: Örn: OKL-8F3A2
            var randomPart = Guid.NewGuid().ToString("N").Substring(0, 5).ToUpper();
            var schoolCode = $"OKL-{randomPart}";

            if (adminUser != null)
            {
                if (string.IsNullOrEmpty(adminUser.CustomerId)) adminUser.CustomerId = customerId;
                if (string.IsNullOrEmpty(adminUser.RelationId)) adminUser.RelationId = relationId;
                if (!adminUser.LicenseExpiresAt.HasValue) adminUser.LicenseExpiresAt = institution?.LicenseExpiresAt ?? DateTime.UtcNow.AddYears(1);
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
                DailyLessonHours = request.DailyLessonHours.HasValue && request.DailyLessonHours.Value >= 4 && request.DailyLessonHours.Value <= 14 ? request.DailyLessonHours.Value : 8,
                CreatedAt = DateTime.UtcNow,
                LicenseExpiresAt = adminUser?.LicenseExpiresAt ?? DateTime.UtcNow.AddYears(1), // Admin lisansı ile senkron
                IsActive = true
            };

            await _context.Schools.AddAsync(school);

            await LogActionAsync(
                school.Id,
                "SCHOOL_CREATED",
                "School",
                school.Id.ToString(),
                $"{school.Name} ({school.Code}) okulu oluşturuldu.",
                $"{{\"customerId\": \"{customerId}\", \"relationId\": \"{relationId}\"}}"
            );

            await _context.SaveChangesAsync();

            return Ok(school);
        }

        // Okulun Öğretmenlerini Listele
        [HttpGet("{schoolId}/teachers")]
        public async Task<IActionResult> GetSchoolTeachers(Guid schoolId)
        {
            var school = await _context.Schools.FindAsync(schoolId);
            var customerId = school?.CustomerId;
            var relationId = school?.RelationId;
            var schoolIdStr = schoolId.ToString();

            var teachers = await _context.Users
                .Where(u =>
                    (u.SchoolId == schoolId ||
                     (!string.IsNullOrEmpty(u.AssignedSchoolIdsJson) && u.AssignedSchoolIdsJson.Contains(schoolIdStr)) ||
                     (!u.SchoolId.HasValue && (
                        (!string.IsNullOrEmpty(customerId) && u.CustomerId == customerId) ||
                        (!string.IsNullOrEmpty(relationId) && u.RelationId == relationId)
                     ))) &&
                    (u.Role == UserRoles.Teacher || u.Role == UserRoles.Staff)
                )
                .OrderBy(u => u.FullName)
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
                    u.AssignedLessonsJson,
                    u.Branch,
                    u.PermissionsJson,
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

            if (CurrentUserRole == UserRoles.Staff)
            {
                var currentUser = await _context.Users.FindAsync(CurrentUserId);
                if (currentUser == null || currentUser.SchoolId != schoolId)
                {
                    return Forbid();
                }
            }

            var fullName = request.FullName.Trim();
            // Türkçe karakterleri temizleyip isim.soyisim formatında kullanıcı adı üret (mükerrerse sonuna 1, 2 ekler)
            var username = await GenerateUniqueTeacherUsernameAsync(fullName);

            var password = "1234"; // Varsayılan otomatik şifre
            var teacher = new User
            {
                Id = Guid.NewGuid(),
                Username = username,
                PasswordHash = BCrypt.Net.BCrypt.HashPassword(password),
                FullName = fullName,
                Role = !string.IsNullOrEmpty(request.Role) ? request.Role : UserRoles.Teacher,
                Branch = request.Branch?.Trim(),
                CounselorClass = request.CounselorClass?.Trim(),
                PermissionsJson = request.PermissionsJson,
                Email = request.Email?.Trim(),
                Phone = request.Phone?.Trim(),
                SchoolId = school.Id,
                RelationId = school.RelationId,
                CustomerId = school.CustomerId,
                LicenseExpiresAt = school.LicenseExpiresAt,
                AssignedClassesJson = request.AssignedClassesJson,
                AssignedLessonsJson = request.AssignedLessonsJson,
                IsActive = true,
                CreatedAt = DateTime.UtcNow
            };

            await _context.Users.AddAsync(teacher);

            await LogActionAsync(
                school.Id,
                "TEACHER_CREATED",
                "User",
                teacher.Id.ToString(),
                $"{teacher.FullName} ({teacher.Username} - {teacher.Role}) kadroya eklendi.",
                $"{{\"role\": \"{teacher.Role}\", \"branch\": \"{teacher.Branch}\", \"permissions\": {request.PermissionsJson ?? "null"}}}"
            );

            await _context.SaveChangesAsync();

            return Ok(new
            {
                teacher.Id,
                teacher.Username,
                Password = password,
                teacher.FullName,
                SchoolCode = school.Code,
                teacher.Role,
                teacher.Branch,
                teacher.PermissionsJson,
                teacher.IsActive
            });
        }

        // Okul Öğretmenlerini Toplu Güncelleme / Yükleme (Excel Senkronizasyonu)
        // ÖNEMLİ KURAL: Mevcut öğretmenlerin şifresi (PasswordHash) ve kullanıcı adı (Username) ASLA DEĞİŞTİRİLMEZ / SIFIRLANMAZ!
        [HttpPost("{schoolId}/teachers/batch")]
        public async Task<IActionResult> BatchSyncTeachers(Guid schoolId, [FromBody] BatchTeacherSyncRequest request)
        {
            if (IsTeacher)
            {
                return StatusCode(StatusCodes.Status403Forbidden, new { message = "Okula bağlı öğretmenler toplu kadro güncelleme yetkisine sahip değildir." });
            }

            var school = await _context.Schools.FindAsync(schoolId);
            if (school == null) return NotFound(new { message = "Okul bulunamadı." });

            if (CurrentUserRole == UserRoles.Staff)
            {
                var currentUser = await _context.Users.FindAsync(CurrentUserId);
                if (currentUser == null || currentUser.SchoolId != schoolId)
                {
                    return Forbid();
                }
            }

            if (request.Teachers == null || !request.Teachers.Any())
            {
                return BadRequest(new { message = "Yüklenecek öğretmen listesi boş." });
            }

            var existingTeachers = await _context.Users
                .Where(u => u.SchoolId == schoolId && (u.Role == UserRoles.Teacher || u.Role == UserRoles.Staff))
                .ToListAsync();

            int updatedCount = 0;
            int addedCount = 0;

            foreach (var item in request.Teachers)
            {
                if (string.IsNullOrWhiteSpace(item.FullName)) continue;

                var cleanName = item.FullName.Trim();
                User? matchedTeacher = null;

                // 1. Varsa kullanıcı adına göre kesin eşleştir
                if (!string.IsNullOrWhiteSpace(item.Username))
                {
                    var cleanUsername = item.Username.Trim().ToLowerInvariant();
                    matchedTeacher = existingTeachers.FirstOrDefault(t => t.Username.ToLowerInvariant() == cleanUsername);
                }

                // 2. Kullanıcı adı ile bulunamadıysa isim benzerliği/denkliği ile eşleştir
                if (matchedTeacher == null)
                {
                    matchedTeacher = existingTeachers.FirstOrDefault(t => IsTeacherNameMatch(t.FullName, cleanName));
                }

                if (matchedTeacher != null)
                {
                    // MEVCUT ÖĞRETMEN: Kullanıcı adı ve şifresi KESİNLİKLE KORUNUR!
                    matchedTeacher.FullName = cleanName;
                    if (!string.IsNullOrWhiteSpace(item.Branch)) matchedTeacher.Branch = item.Branch.Trim();
                    if (!string.IsNullOrWhiteSpace(item.Role))
                    {
                        var roleStr = item.Role.Trim().ToUpperInvariant();
                        if (roleStr.Contains("IDARE") || roleStr.Contains("MÜDÜR") || roleStr.Contains("MUDUR") || roleStr == "STAFF")
                        {
                            matchedTeacher.Role = UserRoles.Staff;
                        }
                        else
                        {
                            matchedTeacher.Role = UserRoles.Teacher;
                        }
                    }
                    if (item.Phone != null) matchedTeacher.Phone = item.Phone.Trim();
                    if (item.Email != null) matchedTeacher.Email = item.Email.Trim();
                    if (item.IsActive.HasValue) matchedTeacher.IsActive = item.IsActive.Value;
                    if (!string.IsNullOrWhiteSpace(item.AssignedClassesJson)) matchedTeacher.AssignedClassesJson = item.AssignedClassesJson;
                    if (!string.IsNullOrWhiteSpace(item.AssignedLessonsJson)) matchedTeacher.AssignedLessonsJson = item.AssignedLessonsJson;

                    updatedCount++;
                }
                else
                {
                    // YENİ ÖĞRETMEN: Otomatik kullanıcı adı (isim.soyisim) ve varsayılan 1234 şifresi ile oluştur
                    var username = await GenerateUniqueTeacherUsernameAsync(cleanName);

                    var role = UserRoles.Teacher;
                    if (!string.IsNullOrWhiteSpace(item.Role))
                    {
                        var roleStr = item.Role.Trim().ToUpperInvariant();
                        if (roleStr.Contains("IDARE") || roleStr.Contains("MÜDÜR") || roleStr.Contains("MUDUR") || roleStr == "STAFF")
                        {
                            role = UserRoles.Staff;
                        }
                    }

                    var newTeacher = new User
                    {
                        Id = Guid.NewGuid(),
                        Username = username,
                        PasswordHash = BCrypt.Net.BCrypt.HashPassword("1234"),
                        FullName = cleanName,
                        Role = role,
                        Branch = item.Branch?.Trim(),
                        Phone = item.Phone?.Trim(),
                        Email = item.Email?.Trim(),
                        SchoolId = school.Id,
                        RelationId = school.RelationId,
                        CustomerId = school.CustomerId,
                        LicenseExpiresAt = school.LicenseExpiresAt,
                        AssignedClassesJson = item.AssignedClassesJson,
                        AssignedLessonsJson = item.AssignedLessonsJson,
                        IsActive = item.IsActive ?? true,
                        CreatedAt = DateTime.UtcNow
                    };

                    await _context.Users.AddAsync(newTeacher);
                    existingTeachers.Add(newTeacher);
                    addedCount++;
                }
            }

            await LogActionAsync(
                school.Id,
                "BATCH_TEACHERS_SYNCED",
                "User",
                null,
                $"Öğretmen kadrosu Excel ile senkronize edildi: {updatedCount} güncellendi, {addedCount} yeni eklendi.",
                $"{{\"updatedCount\": {updatedCount}, \"addedCount\": {addedCount}, \"total\": {request.Teachers.Count}}}"
            );

            await _context.SaveChangesAsync();

            return Ok(new
            {
                message = $"{updatedCount} öğretmen güncellendi, {addedCount} yeni öğretmen kadroya eklendi.",
                updatedCount,
                addedCount,
                total = request.Teachers.Count
            });
        }

        // Öğretmen Yetki / Durum / Rol Düzenleme (Admin veya İdareci yetkisi)
        [HttpPut("teachers/{teacherId}/status")]
        public async Task<IActionResult> UpdateTeacherStatus(Guid teacherId, [FromBody] UpdateTeacherStatusRequest request)
        {
            var teacher = await _context.Users.FindAsync(teacherId);
            if (teacher == null) return NotFound();

            if (CurrentUserRole == UserRoles.Staff)
            {
                var currentUser = await _context.Users.FindAsync(CurrentUserId);
                if (currentUser == null || currentUser.SchoolId != teacher.SchoolId)
                {
                    return Forbid();
                }
            }

            teacher.IsActive = request.IsActive;
            if (!string.IsNullOrEmpty(request.Role)) teacher.Role = request.Role;
            if (request.AssignedClassesJson != null) teacher.AssignedClassesJson = request.AssignedClassesJson;
            if (request.AssignedLessonsJson != null) teacher.AssignedLessonsJson = request.AssignedLessonsJson;
            if (request.PermissionsJson != null) teacher.PermissionsJson = request.PermissionsJson;
            if (!string.IsNullOrEmpty(request.FullName)) teacher.FullName = request.FullName.Trim();
            if (request.Branch != null) teacher.Branch = request.Branch.Trim();
            if (request.Phone != null) teacher.Phone = request.Phone.Trim();
            if (request.Email != null) teacher.Email = request.Email.Trim();

            await LogActionAsync(
                teacher.SchoolId,
                "TEACHER_UPDATED",
                "User",
                teacher.Id.ToString(),
                $"{teacher.FullName} yetkileri ve rolü güncellendi. Rol: {teacher.Role}, Aktif: {teacher.IsActive}",
                $"{{\"role\": \"{teacher.Role}\", \"permissions\": {request.PermissionsJson ?? "null"}, \"assignedClasses\": \"{teacher.AssignedClassesJson}\"}}"
            );

            await _context.SaveChangesAsync();
            return Ok(new { message = "Öğretmen rol ve yetki bilgileri güncellendi.", teacher });
        }

        // Okul Adı ve Bilgilerini Güncelleme
        [HttpPut("{schoolId}")]
        public async Task<IActionResult> UpdateSchoolDetails(Guid schoolId, [FromBody] UpdateSchoolRequest request)
        {
            if (CurrentUserRole != UserRoles.SuperAdmin && CurrentUserRole != UserRoles.SchoolAdmin && CurrentUserRole != UserRoles.Staff)
            {
                return Forbid();
            }

            var school = await _context.Schools.FirstOrDefaultAsync(s => s.Id == schoolId && s.IsActive);
            if (school == null) return NotFound(new { message = "Okul bulunamadı." });

            var currentUser = await _context.Users.FindAsync(CurrentUserId);
            if (CurrentUserRole != UserRoles.SuperAdmin)
            {
                bool isOwner = school.AdminUserId == CurrentUserId;
                bool isSameCustomer = !string.IsNullOrEmpty(school.CustomerId) && school.CustomerId == currentUser?.CustomerId;
                bool isStaffOfThisSchool = CurrentUserRole == UserRoles.Staff && currentUser?.SchoolId == school.Id;

                if (!isOwner && !isSameCustomer && !isStaffOfThisSchool)
                {
                    return Forbid();
                }
            }

            if (string.IsNullOrWhiteSpace(request.Name))
            {
                return BadRequest(new { message = "Okul adı boş bırakılamaz." });
            }

            var oldName = school.Name;
            school.Name = request.Name.Trim();
            if (request.Phone != null) school.Phone = request.Phone.Trim();
            if (request.Address != null) school.Address = request.Address.Trim();
            if (request.GeminiApiKey != null && CurrentUserRole != UserRoles.Staff)
            {
                school.GeminiApiKey = request.GeminiApiKey.Trim();
            }
            if (request.GeminiModel != null && CurrentUserRole != UserRoles.Staff)
            {
                school.GeminiModel = request.GeminiModel.Trim();
            }
            if (request.DailyLessonHours.HasValue && request.DailyLessonHours.Value >= 4 && request.DailyLessonHours.Value <= 14)
            {
                school.DailyLessonHours = request.DailyLessonHours.Value;
            }

            await LogActionAsync(
                school.Id,
                "SCHOOL_UPDATED",
                "School",
                school.Id.ToString(),
                $"{oldName} okulu güncellendi: {school.Name}",
                System.Text.Json.JsonSerializer.Serialize(new { school.Name, school.Phone, school.Address, school.GeminiModel })
            );

            await _context.SaveChangesAsync();
            return Ok(school);
        }

        // Okulu Sil (Soft delete: IsActive = false)
        [HttpDelete("{schoolId}")]
        public async Task<IActionResult> DeleteSchool(Guid schoolId)
        {
            if (CurrentUserRole != UserRoles.SuperAdmin && CurrentUserRole != UserRoles.SchoolAdmin)
            {
                return Forbid();
            }

            var school = await _context.Schools.FirstOrDefaultAsync(s => s.Id == schoolId && s.IsActive);
            if (school == null) return NotFound(new { message = "Okul bulunamadı." });

            var currentUser = await _context.Users.FindAsync(CurrentUserId);
            if (CurrentUserRole != UserRoles.SuperAdmin)
            {
                bool isOwner = school.AdminUserId == CurrentUserId;
                bool isSameCustomer = !string.IsNullOrEmpty(school.CustomerId) && school.CustomerId == currentUser?.CustomerId;

                if (!isOwner && !isSameCustomer)
                {
                    return Forbid();
                }

                // En az bir okul kalmalı
                var activeSchoolCount = await _context.Schools.CountAsync(s => 
                    s.IsActive && 
                    (s.AdminUserId == CurrentUserId || (!string.IsNullOrEmpty(school.CustomerId) && s.CustomerId == school.CustomerId))
                );

                if (activeSchoolCount <= 1)
                {
                    return BadRequest(new { message = "En az bir okul bulunmalıdır. Son kalan okul silinemez." });
                }
            }

            await LogActionAsync(
                school.Id,
                "SCHOOL_DELETED",
                "School",
                school.Id.ToString(),
                $"{school.Name} ({school.Code}) okulu ve ilişkili verileri silindi."
            );

            // Okulu ve bağlı tüm verileri cascade temizle (çoklu okulu olan öğretmenler korunur)
            var purgeResult = await _purgeService.PurgeSchoolAsync(_context, schoolId);

            return Ok(new { 
                message = "Okul ve ilgili tüm verileri başarıyla silindi.", 
                deletedSchoolId = schoolId,
                details = purgeResult
            });
        }

        // Okul Ortak Gemini API Key ve Model Güncelleme
        [HttpPut("{schoolId}/gemini-key")]
        public async Task<IActionResult> UpdateGeminiApiKey(Guid schoolId, [FromBody] UpdateKeyRequest request)
        {
            if (CurrentUserRole == UserRoles.Staff)
            {
                return StatusCode(403, new { message = "İdarecilerin okul AI API anahtarını değiştirme yetkisi bulunmamaktadır." });
            }

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
                schoolId = school.Id,
                schoolName = school.Name,
                schoolCode = school.Code,
                apiKey = school.GeminiApiKey,
                model = school.GeminiModel
            });
        }

        // Okul Koduna Göre Ortak Gemini Yapılandırmasını Çek (Öğretmen Cihazı İçin)
        [AllowAnonymous]
        [HttpGet("ai-config-by-code/{code}")]
        public async Task<IActionResult> GetSchoolAiConfigByCode(string code)
        {
            var cleanCode = code.Trim().ToUpper();
            var school = await _context.Schools.FirstOrDefaultAsync(s => s.Code.ToUpper() == cleanCode && s.IsActive);
            if (school == null) return NotFound(new { message = "Okul bulunamadı." });

            return Ok(new
            {
                schoolId = school.Id,
                schoolName = school.Name,
                schoolCode = school.Code,
                apiKey = school.GeminiApiKey,
                model = school.GeminiModel
            });
        }

        public class ReportAiUsageRequest
        {
            public int Tokens { get; set; } = 0;
            public string? Model { get; set; }
        }

        // Okul Ortak TOTAL AI Kullanımı Bildir (Tüm öğretmenler ve admin havuzu)
        [AllowAnonymous]
        [HttpPost("{schoolId}/ai-usage")]
        public async Task<IActionResult> ReportSchoolAiUsage(Guid schoolId, [FromBody] ReportAiUsageRequest request)
        {
            var school = await _context.Schools.FindAsync(schoolId);
            if (school == null) return NotFound(new { message = "Okul bulunamadı." });

            var today = DateTime.UtcNow.ToString("yyyy-MM-dd");
            var nowTime = DateTime.UtcNow.AddHours(3).ToString("HH:mm");
            var tokensToAdd = request.Tokens > 0 ? request.Tokens : 2500;

            if (school.LastAiUsageDate != today)
            {
                school.LastAiUsageDate = today;
                school.DailyAiRequests = 1;
                school.DailyAiTokens = tokensToAdd;
            }
            else
            {
                school.DailyAiRequests += 1;
                school.DailyAiTokens += tokensToAdd;
            }

            school.LastAiRequestTime = nowTime;
            school.LastTokensUsed = tokensToAdd;
            if (!string.IsNullOrEmpty(request.Model))
            {
                school.GeminiModel = request.Model.Trim();
            }

            await _context.SaveChangesAsync();
            return Ok(new
            {
                requestsToday = school.DailyAiRequests,
                tokensToday = school.DailyAiTokens,
                lastRequestTime = school.LastAiRequestTime,
                lastTokensUsed = school.LastTokensUsed
            });
        }

        // Okul Ortak TOTAL AI Kullanım ve Kota İstatistiklerini Çek
        [AllowAnonymous]
        [HttpGet("{schoolId}/ai-usage")]
        public async Task<IActionResult> GetSchoolAiUsage(Guid schoolId)
        {
            var school = await _context.Schools.FindAsync(schoolId);
            if (school == null) return NotFound(new { message = "Okul bulunamadı." });

            var today = DateTime.UtcNow.ToString("yyyy-MM-dd");
            var isToday = school.LastAiUsageDate == today;

            var model = school.GeminiModel ?? "gemini-2.5-flash";
            var isPro = model.ToLowerInvariant().Contains("pro");
            var dailyLimit = isPro ? 50 : 1500;
            var dailyTokenLimit = isPro ? 200000 : 1000000;

            var requestsToday = isToday ? school.DailyAiRequests : 0;
            var tokensToday = isToday ? school.DailyAiTokens : 0;
            var remainingRequests = Math.Max(0, dailyLimit - requestsToday);
            var remainingTokens = Math.Max(0, dailyTokenLimit - tokensToday);

            var requestPercent = Math.Max(0, Math.Min(100, (double)remainingRequests / dailyLimit * 100));
            var tokenPercent = Math.Max(0, Math.Min(100, (double)remainingTokens / dailyTokenLimit * 100));
            var remainingPercent = Math.Min(requestPercent, tokenPercent);

            return Ok(new
            {
                date = today,
                requestsToday,
                tokensToday,
                lastRequestTime = isToday ? (school.LastAiRequestTime ?? "-") : "-",
                model,
                dailyRequestLimit = dailyLimit,
                remainingRequests,
                dailyTokenLimit,
                remainingTokens,
                remainingPercent = Math.Round(remainingPercent, 1),
                tokenPercent = Math.Round(tokenPercent, 1),
                lastTokensUsed = isToday ? school.LastTokensUsed : 0,
                scope = "TOTAL_SCHOOL"
            });
        }

        // Okul Ortak TOTAL AI Kullanım Sayacını Sıfırla (Admin)
        [HttpPost("{schoolId}/reset-ai-usage")]
        public async Task<IActionResult> ResetSchoolAiUsage(Guid schoolId)
        {
            var school = await _context.Schools.FindAsync(schoolId);
            if (school == null) return NotFound(new { message = "Okul bulunamadı." });

            school.DailyAiRequests = 0;
            school.DailyAiTokens = 0;
            school.LastTokensUsed = 0;
            school.LastAiRequestTime = "-";
            await _context.SaveChangesAsync();

            return Ok(new { message = "Okul ortak TOTAL AI kullanım sayacı sıfırlandı." });
        }

        // Öğretmen Silme (Admin yetkisi)
        [HttpDelete("teachers/{teacherId}")]
        public async Task<IActionResult> DeleteTeacher(Guid teacherId)
        {
            var teacher = await _context.Users.FindAsync(teacherId);
            if (teacher == null) return NotFound(new { message = "Öğretmen bulunamadı." });

            _context.Users.Remove(teacher);
            await LogActionAsync(
                teacher.SchoolId,
                "TEACHER_DELETED",
                "User",
                teacher.Id.ToString(),
                $"{teacher.FullName} ({teacher.Username} - {teacher.Role}) okul kadrosundan silindi.",
                $"{{\"branch\": \"{teacher.Branch ?? ""}\", \"email\": \"{teacher.Email ?? ""}\"}}"
            );

            await _context.SaveChangesAsync();
            return Ok(new { message = "Öğretmen başarıyla silindi." });
        }

        // Öğretmen Bilgilerini Güncelleme
        [HttpPut("teachers/{teacherId}/details")]
        public async Task<IActionResult> UpdateTeacherDetails(Guid teacherId, [FromBody] CreateTeacherRequest request)
        {
            var teacher = await _context.Users.FindAsync(teacherId);
            if (teacher == null) return NotFound(new { message = "Öğretmen bulunamadı." });

            if (CurrentUserRole == UserRoles.Staff)
            {
                var currentUser = await _context.Users.FindAsync(CurrentUserId);
                if (currentUser == null || currentUser.SchoolId != teacher.SchoolId)
                {
                    return Forbid();
                }
            }

            if (!string.IsNullOrEmpty(request.FullName)) teacher.FullName = request.FullName.Trim();
            if (request.Branch != null) teacher.Branch = request.Branch.Trim();
            if (request.CounselorClass != null) teacher.CounselorClass = request.CounselorClass.Trim();
            if (!string.IsNullOrEmpty(request.Role)) teacher.Role = request.Role;
            if (request.PermissionsJson != null) teacher.PermissionsJson = request.PermissionsJson;
            if (request.Phone != null) teacher.Phone = request.Phone.Trim();
            if (request.Email != null) teacher.Email = request.Email.Trim();
            if (request.AssignedClassesJson != null) teacher.AssignedClassesJson = request.AssignedClassesJson;
            if (request.AssignedLessonsJson != null) teacher.AssignedLessonsJson = request.AssignedLessonsJson;

            // Okul bağı ve Müşteri No güvencesi (İdareci yapıldığında okul bağının kopmaması için)
            if (teacher.SchoolId.HasValue && (string.IsNullOrEmpty(teacher.CustomerId) || string.IsNullOrEmpty(teacher.RelationId)))
            {
                var sch = await _context.Schools.FindAsync(teacher.SchoolId.Value);
                if (sch != null)
                {
                    if (string.IsNullOrEmpty(teacher.CustomerId)) teacher.CustomerId = sch.CustomerId;
                    if (string.IsNullOrEmpty(teacher.RelationId)) teacher.RelationId = sch.RelationId;
                }
            }
            if (teacher.SchoolId.HasValue && string.IsNullOrEmpty(teacher.AssignedSchoolIdsJson))
            {
                teacher.AssignedSchoolIdsJson = System.Text.Json.JsonSerializer.Serialize(new List<string> { teacher.SchoolId.Value.ToString() });
            }

            await LogActionAsync(
                teacher.SchoolId,
                "TEACHER_UPDATED",
                "User",
                teacher.Id.ToString(),
                $"{teacher.FullName} bilgileri ve rolü güncellendi. Rol: {teacher.Role}",
                $"{{\"role\": \"{teacher.Role}\", \"permissions\": {request.PermissionsJson ?? "null"}}}"
            );

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

            await LogActionAsync(
                teacher.SchoolId,
                "PASSWORD_RESET",
                "User",
                teacher.Id.ToString(),
                $"{teacher.FullName} ({teacher.Username} - {teacher.Role}) öğretmen şifresi sıfırlandı/güncellendi."
            );

            await _context.SaveChangesAsync();
            return Ok(new { message = $"Şifre başarıyla güncellendi: {newPass}", password = newPass });
        }

        // Öğrenci Şifre Sıfırlama
        [HttpPost("{schoolId}/students/{studentId}/reset-password")]
        public async Task<IActionResult> ResetStudentPassword(Guid schoolId, Guid studentId, [FromBody] ResetPasswordRequest? req)
        {
            var school = await _context.Schools.FindAsync(schoolId);
            if (school == null) return NotFound(new { message = "Okul bulunamadı." });

            if (school.AdminUserId != CurrentUserId && CurrentUserRole != UserRoles.SuperAdmin)
            {
                return Forbid();
            }

            var student = await _context.Students.FirstOrDefaultAsync(s => s.Id == studentId && s.SchoolId == schoolId);
            if (student == null) return NotFound(new { message = "Öğrenci bulunamadı." });

            var defaultPassword = $"ooo_{student.StudentNumber.Trim()}";
            var newPass = !string.IsNullOrWhiteSpace(req?.NewPassword) ? req.NewPassword.Trim() : defaultPassword;

            var studentUser = await _context.Users
                .FirstOrDefaultAsync(u => u.SchoolId == schoolId && u.Username == student.StudentNumber.Trim());

            if (studentUser == null)
            {
                studentUser = new User
                {
                    Id = student.Id,
                    Username = student.StudentNumber.Trim(),
                    PasswordHash = BCrypt.Net.BCrypt.HashPassword(newPass),
                    FullName = student.FullName,
                    Role = UserRoles.Student,
                    SchoolId = school.Id,
                    RelationId = student.RelationId ?? school.RelationId,
                    IsActive = true,
                    CreatedAt = DateTime.UtcNow
                };
                await _context.Users.AddAsync(studentUser);
            }
            else
            {
                studentUser.PasswordHash = BCrypt.Net.BCrypt.HashPassword(newPass);
                studentUser.IsActive = true;
            }

            student.StudentCustomPassword = (newPass == defaultPassword ? null : newPass);
            await _context.SaveChangesAsync();

            await LogActionAsync(
                schoolId,
                "STUDENT_PASSWORD_RESET",
                "Student",
                student.Id.ToString(),
                $"Öğrenci şifresi güncellendi: {student.FullName} (No: {student.StudentNumber})",
                $"{{\"studentNumber\": \"{student.StudentNumber}\", \"isDefault\": {((newPass == defaultPassword) ? "true" : "false")}}}"
            );

            return Ok(new
            {
                success = true,
                message = $"Öğrenci şifresi başarıyla güncellendi: {newPass}",
                password = newPass,
                studentNumber = student.StudentNumber,
                defaultPassword = defaultPassword
            });
        }

        // Veli Şifre Sıfırlama
        [HttpPost("{schoolId}/students/{studentId}/reset-parent-password")]
        public async Task<IActionResult> ResetParentPassword(Guid schoolId, Guid studentId, [FromBody] ResetPasswordRequest? req)
        {
            var school = await _context.Schools.FindAsync(schoolId);
            if (school == null) return NotFound(new { message = "Okul bulunamadı." });

            if (school.AdminUserId != CurrentUserId && CurrentUserRole != UserRoles.SuperAdmin)
            {
                return Forbid();
            }

            var student = await _context.Students.FirstOrDefaultAsync(s => s.Id == studentId && s.SchoolId == schoolId);
            if (student == null) return NotFound(new { message = "Öğrenci bulunamadı." });

            var defaultPassword = $"vvv_{student.StudentNumber.Trim()}";
            var newPass = !string.IsNullOrWhiteSpace(req?.NewPassword) ? req.NewPassword.Trim() : defaultPassword;

            student.ParentPasswordHash = BCrypt.Net.BCrypt.HashPassword(newPass);
            student.ParentCustomPassword = (newPass == defaultPassword ? null : newPass);

            // Veli user varsa onun da şifresini güncelle
            var parentUsername = $"v_{student.StudentNumber.Trim()}";
            var parentUser = await _context.Users
                .FirstOrDefaultAsync(u => u.SchoolId == schoolId && u.Username == parentUsername);
            if (parentUser != null)
            {
                parentUser.PasswordHash = student.ParentPasswordHash;
                parentUser.IsActive = true;
            }

            await _context.SaveChangesAsync();

            await LogActionAsync(
                schoolId,
                "PARENT_PASSWORD_RESET",
                "Student",
                student.Id.ToString(),
                $"Veli şifresi güncellendi: {student.FullName} Velisi (Öğrenci No: {student.StudentNumber})",
                $"{{\"studentNumber\": \"{student.StudentNumber}\", \"isDefault\": {((newPass == defaultPassword) ? "true" : "false")}}}"
            );

            return Ok(new
            {
                success = true,
                message = $"Veli şifresi başarıyla güncellendi: {newPass}",
                password = newPass,
                studentNumber = student.StudentNumber,
                defaultPassword = defaultPassword
            });
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
            if (IsTeacher)
            {
                return StatusCode(StatusCodes.Status403Forbidden, new { message = "Okula bağlı öğretmenler şube oluşturma yetkisine sahip değildir. Bu işlem yalnızca okul idaresi tarafından yapılabilir." });
            }

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
            if (IsTeacher)
            {
                return StatusCode(StatusCodes.Status403Forbidden, new { message = "Okula bağlı öğretmenler şube silme yetkisine sahip değildir. Bu işlem yalnızca okul idaresi tarafından yapılabilir." });
            }

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

        // Ders Güncelleme
        [HttpPut("lessons/{lessonId}")]
        public async Task<IActionResult> UpdateLesson(Guid lessonId, [FromBody] CreateLessonRequest request)
        {
            var item = await _context.SchoolLessons.FindAsync(lessonId);
            if (item == null) return NotFound(new { message = "Ders bulunamadı." });

            if (!string.IsNullOrWhiteSpace(request.Name))
            {
                item.Name = request.Name.Trim();
            }
            if (request.ShortCode != null)
            {
                item.ShortCode = request.ShortCode.Trim().ToUpper();
            }
            if (request.Grade != null)
            {
                item.Grade = request.Grade.Trim();
            }
            if (request.WeeklyHours > 0)
            {
                item.WeeklyHours = request.WeeklyHours;
            }

            await _context.SaveChangesAsync();
            return Ok(item);
        }

        // Toplu İşlemler: Tüm Okul Derslerini Sil
        [HttpDelete("{schoolId}/lessons/all")]
        public async Task<IActionResult> DeleteAllLessons(Guid schoolId)
        {
            var items = await _context.SchoolLessons.Where(l => l.SchoolId == schoolId).ToListAsync();
            _context.SchoolLessons.RemoveRange(items);
            await LogActionAsync(schoolId, "ALL_LESSONS_DELETED", "SchoolLesson", null, $"Tüm ders tanımları silindi ({items.Count} adet).");
            await _context.SaveChangesAsync();
            return Ok(new { message = $"{items.Count} adet ders başarıyla silindi." });
        }

        // Toplu İşlemler: Tüm Şubeleri Sil
        [HttpDelete("{schoolId}/classes/all")]
        public async Task<IActionResult> DeleteAllClasses(Guid schoolId)
        {
            var items = await _context.SchoolClasses.Where(c => c.SchoolId == schoolId).ToListAsync();
            _context.SchoolClasses.RemoveRange(items);
            await LogActionAsync(schoolId, "ALL_CLASSES_DELETED", "SchoolClass", null, $"Tüm sınıf/şube kayıtları silindi ({items.Count} adet).");
            await _context.SaveChangesAsync();
            return Ok(new { message = $"{items.Count} adet sınıf/şube başarıyla silindi." });
        }

        // Toplu İşlemler: Tüm Öğretmenleri Sil
        [HttpDelete("{schoolId}/teachers/all")]
        public async Task<IActionResult> DeleteAllTeachers(Guid schoolId)
        {
            var teachers = await _context.Users
                .Where(u => u.SchoolId == schoolId && (u.Role == UserRoles.Teacher || u.Role == UserRoles.Staff))
                .ToListAsync();
            _context.Users.RemoveRange(teachers);
            await LogActionAsync(schoolId, "ALL_TEACHERS_DELETED", "User", null, $"Tüm öğretmen kadrosu silindi ({teachers.Count} adet).");
            await _context.SaveChangesAsync();
            return Ok(new { message = $"{teachers.Count} adet öğretmen başarıyla silindi." });
        }

        // Toplu İşlemler: Tüm Öğrencileri Sil
        [HttpDelete("{schoolId}/students/all")]
        public async Task<IActionResult> DeleteAllStudents(Guid schoolId)
        {
            var students = await _context.Students.Where(s => s.SchoolId == schoolId).ToListAsync();
            _context.Students.RemoveRange(students);
            await _context.SaveChangesAsync();
            await LogActionAsync(schoolId, "ALL_STUDENTS_DELETED", "Student", null, $"{students.Count} adet öğrenci kaydı silindi.");
            return Ok(new { message = $"{students.Count} adet öğrenci kaydı başarıyla silindi." });
        }

        // 15. Okul İşlem Loglarını Listele (Kullanıcı, Rol, İşlem Türü ve Tarih Filtreli)
        [HttpGet("{schoolId}/audit-logs")]
        public async Task<IActionResult> GetSchoolAuditLogs(
            Guid schoolId,
            [FromQuery] Guid? userId,
            [FromQuery] string? userRole,
            [FromQuery] string? actionType,
            [FromQuery] string? search,
            [FromQuery] DateTime? startDate,
            [FromQuery] DateTime? endDate,
            [FromQuery] int limit = 200
        )
        {
            var school = await _context.Schools.FindAsync(schoolId);
            if (school == null) return NotFound(new { message = "Okul bulunamadı." });

            if (school.AdminUserId != CurrentUserId && CurrentUserRole != UserRoles.SuperAdmin)
                return Forbid();

            var result = await _auditLogService.GetSchoolLogsAsync(
                _context,
                schoolId,
                userId,
                userRole,
                actionType,
                search,
                startDate,
                endDate,
                limit
            );

            return Ok(result);
        }

        // 16. Okul İşlem Loglarını Dosya Olarak İndir / Raporla (.txt veya .csv)
        [HttpGet("{schoolId}/audit-logs/export")]
        public async Task<IActionResult> ExportSchoolAuditLogs(
            Guid schoolId,
            [FromQuery] string format = "txt",
            [FromQuery] Guid? userId = null,
            [FromQuery] string? userRole = null,
            [FromQuery] string? actionType = null,
            [FromQuery] string? search = null,
            [FromQuery] DateTime? startDate = null,
            [FromQuery] DateTime? endDate = null
        )
        {
            var school = await _context.Schools.FindAsync(schoolId);
            if (school == null) return NotFound(new { message = "Okul bulunamadı." });

            if (school.AdminUserId != CurrentUserId && CurrentUserRole != UserRoles.SuperAdmin)
                return Forbid();

            var (content, contentType, fileName) = await _auditLogService.ExportLogsAsync(
                _context,
                schoolId,
                format,
                userId,
                userRole,
                actionType,
                search,
                startDate,
                endDate
            );

            return File(content, contentType, fileName);
        }

        // 17. Belirli Tarih Aralığındaki Logları Veritabanından Temizle (Fiziksel log dosyaları diskte korunur)
        [HttpDelete("{schoolId}/audit-logs")]
        [HttpPost("{schoolId}/audit-logs/purge")]
        public async Task<IActionResult> PurgeSchoolAuditLogs(
            Guid schoolId,
            [FromQuery] DateTime? startDate,
            [FromQuery] DateTime? endDate
        )
        {
            var school = await _context.Schools.FindAsync(schoolId);
            if (school == null) return NotFound(new { message = "Okul bulunamadı." });

            if (school.AdminUserId != CurrentUserId && CurrentUserRole != UserRoles.SuperAdmin && CurrentUserRole != UserRoles.SchoolAdmin)
                return Forbid();

            var query = _context.AuditLogs.Where(l => l.SchoolId == schoolId);

            if (startDate.HasValue)
            {
                query = query.Where(l => l.Timestamp >= startDate.Value.ToUniversalTime());
            }

            if (endDate.HasValue)
            {
                var end = endDate.Value.Date.AddDays(1).AddTicks(-1).ToUniversalTime();
                query = query.Where(l => l.Timestamp <= end);
            }

            var logsToDelete = await query.ToListAsync();
            var count = logsToDelete.Count;

            _context.AuditLogs.RemoveRange(logsToDelete);
            await _context.SaveChangesAsync();

            // Silme işlemini de log dosyasına yaz (disk dosyası asla silinmez, audit trail korunur)
            var trTime = DateTime.UtcNow.AddHours(3);
            var purgeNote = $"[{trTime:yyyy-MM-dd HH:mm:ss}] [PURGE] {count} adet geçmiş işlem kaydı veritabanından temizlendi. (Tarih Aralığı: {startDate:yyyy-MM-dd} - {endDate:yyyy-MM-dd})";
            try
            {
                var logsDirectory = Path.Combine(Directory.GetCurrentDirectory(), "logs");
                var schoolFile = Path.Combine(logsDirectory, $"school_{schoolId}_{DateTime.UtcNow:yyyyMM}.log");
                System.IO.File.AppendAllText(schoolFile, purgeNote + Environment.NewLine, System.Text.Encoding.UTF8);
            }
            catch { }

            return Ok(new { success = true, deletedCount = count, message = $"{count} adet log veritabanından başarıyla temizlendi. (Fiziksel disk log dosyaları korunmuştur.)" });
        }

        public static string GenerateDefaultTeacherUsername(string fullName)
        {
            if (string.IsNullOrWhiteSpace(fullName)) return "ogretmen";

            var clean = fullName.Trim().ToLowerInvariant()
                .Replace("ı", "i")
                .Replace("ğ", "g")
                .Replace("ü", "u")
                .Replace("ş", "s")
                .Replace("ö", "o")
                .Replace("ç", "c");

            clean = System.Text.RegularExpressions.Regex.Replace(clean, @"[^a-z\s]", " ").Trim();
            var parts = clean.Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);

            if (parts.Length == 0) return "ogretmen";
            if (parts.Length == 1) return parts[0];
            if (parts.Length == 2) return $"{parts[0]}.{parts[1]}";

            // 3 veya daha fazla isim: örn. "Ahmet Can Yılmaz" -> "ahmetcan.yilmaz"
            var firstName = string.Join("", parts.Take(parts.Length - 1));
            var lastName = parts.Last();
            return $"{firstName}.{lastName}";
        }

        private async Task<string> GenerateUniqueTeacherUsernameAsync(string fullName, Guid? excludeUserId = null)
        {
            var baseUsername = GenerateDefaultTeacherUsername(fullName);
            var username = baseUsername;
            var counter = 1;

            while (await _context.Users.AnyAsync(u => u.Username.ToLower() == username.ToLower() && (!excludeUserId.HasValue || u.Id != excludeUserId.Value)))
            {
                username = $"{baseUsername}{counter++}";
            }

            return username;
        }

        private static bool IsTeacherNameMatch(string? name1, string? name2)
        {
            if (string.IsNullOrWhiteSpace(name1) || string.IsNullOrWhiteSpace(name2)) return false;

            var norm1 = NormalizeTurkishPersonName(name1);
            var norm2 = NormalizeTurkishPersonName(name2);

            if (norm1 == norm2) return true;

            var parts1 = norm1.Split(' ', StringSplitOptions.RemoveEmptyEntries);
            var parts2 = norm2.Split(' ', StringSplitOptions.RemoveEmptyEntries);

            if (parts1.Length >= 2 && parts2.Length >= 2)
            {
                var lastName1 = parts1[^1];
                var lastName2 = parts2[^1];

                if (lastName1 == lastName2)
                {
                    var first1 = parts1[0];
                    var first2 = parts2[0];
                    if (first1 == first2 || 
                        (first1.Length == 1 && first2.StartsWith(first1)) || 
                        (first2.Length == 1 && first1.StartsWith(first2)))
                    {
                        return true;
                    }
                }
            }

            return false;
        }

        private static string NormalizeTurkishPersonName(string? raw)
        {
            if (string.IsNullOrWhiteSpace(raw)) return string.Empty;

            var clean = raw.Trim();
            clean = System.Text.RegularExpressions.Regex.Replace(clean, @"\b(öğr|öğrt|uzm|dr|prof|gör)\.?\b", "", System.Text.RegularExpressions.RegexOptions.IgnoreCase);

            var trCulture = new System.Globalization.CultureInfo("tr-TR");
            clean = clean.ToLower(trCulture);

            clean = clean
                .Replace("ç", "c")
                .Replace("ğ", "g")
                .Replace("ı", "i")
                .Replace("i", "i")
                .Replace("ö", "o")
                .Replace("ş", "s")
                .Replace("ü", "u");

            clean = System.Text.RegularExpressions.Regex.Replace(clean, @"[^\w\s]", "");
            clean = System.Text.RegularExpressions.Regex.Replace(clean, @"\s+", " ").Trim();

            return clean;
        }

        private static int NormalizeDayOfWeekInt(string? raw)
        {
            if (string.IsNullOrWhiteSpace(raw)) return 1;
            var t = raw.Trim().ToLowerInvariant();
            if (int.TryParse(t, out var n) && n >= 1 && n <= 7) return n;
            if (t.Contains("pazartesi") || t.Contains("pzt")) return 1;
            if (t.Contains("salı") || t.Contains("sali") || t.Contains("sal")) return 2;
            if (t.Contains("çarşamba") || t.Contains("carsamba") || t.Contains("çar")) return 3;
            if (t.Contains("perşembe") || t.Contains("persembe") || t.Contains("per")) return 4;
            if (t.Contains("cuma") || t.Contains("cum")) return 5;
            if (t.Contains("cumartesi") || t.Contains("cts")) return 6;
            if (t.Contains("pazar")) return 7;
            return 1;
        }

        // --- NÖBETÇİ ÖĞRETMEN YÖNETİMİ ---
        [HttpGet("{schoolId}/duties")]
        public async Task<IActionResult> GetSchoolDuties(Guid schoolId)
        {
            var duties = await _context.TeacherDuties
                .Where(d => d.SchoolId == schoolId)
                .OrderBy(d => d.DayOfWeek)
                .ThenBy(d => d.TeacherName)
                .ToListAsync();

            var result = duties.Select(d => new
            {
                d.Id,
                d.SchoolId,
                d.TeacherName,
                d.DutyPlace,
                DayOfWeek = NormalizeDayOfWeekInt(d.DayOfWeek),
                d.Date,
                d.CreatedAt
            });

            return Ok(result);
        }

        [HttpPost("{schoolId}/duties/batch")]
        public async Task<IActionResult> BatchSaveDuties(Guid schoolId, [FromBody] System.Text.Json.JsonElement body)
        {
            var school = await _context.Schools.FindAsync(schoolId);
            if (school == null) return NotFound(new { message = "Okul bulunamadı." });

            bool overwrite = true;
            System.Text.Json.JsonElement dutiesElement;

            if (body.ValueKind == System.Text.Json.JsonValueKind.Array)
            {
                dutiesElement = body;
            }
            else if (body.ValueKind == System.Text.Json.JsonValueKind.Object)
            {
                if (body.TryGetProperty("overwriteExisting", out var ow) || body.TryGetProperty("OverwriteExisting", out ow))
                {
                    overwrite = ow.ValueKind == System.Text.Json.JsonValueKind.True;
                }
                if (body.TryGetProperty("duties", out var dt) || body.TryGetProperty("Duties", out dt))
                {
                    dutiesElement = dt;
                }
                else
                {
                    dutiesElement = body;
                }
            }
            else
            {
                return BadRequest(new { message = "Geçersiz veri formatı." });
            }

            if (overwrite)
            {
                var existing = _context.TeacherDuties.Where(d => d.SchoolId == schoolId);
                _context.TeacherDuties.RemoveRange(existing);
            }

            int count = 0;
            if (dutiesElement.ValueKind == System.Text.Json.JsonValueKind.Array)
            {
                foreach (var item in dutiesElement.EnumerateArray())
                {
                    string teacherName = "";
                    if (item.TryGetProperty("teacherName", out var tn) || item.TryGetProperty("TeacherName", out tn))
                    {
                        teacherName = tn.GetString() ?? "";
                    }
                    if (string.IsNullOrWhiteSpace(teacherName)) continue;

                    string dutyPlace = "Genel Nöbet";
                    if (item.TryGetProperty("dutyPlace", out var dp) || item.TryGetProperty("DutyPlace", out dp))
                    {
                        dutyPlace = dp.GetString() ?? "Genel Nöbet";
                    }

                    string dayOfWeek = "1";
                    if (item.TryGetProperty("dayOfWeek", out var dw) || item.TryGetProperty("DayOfWeek", out dw))
                    {
                        if (dw.ValueKind == System.Text.Json.JsonValueKind.Number)
                        {
                            dayOfWeek = dw.GetInt32().ToString();
                        }
                        else if (dw.ValueKind == System.Text.Json.JsonValueKind.String)
                        {
                            dayOfWeek = dw.GetString() ?? "1";
                        }
                    }

                    int normalizedDay = NormalizeDayOfWeekInt(dayOfWeek);

                    string? date = null;
                    if (item.TryGetProperty("date", out var dtVal) || item.TryGetProperty("Date", out dtVal))
                    {
                        date = dtVal.GetString();
                    }

                    _context.TeacherDuties.Add(new TeacherDuty
                    {
                        Id = Guid.NewGuid(),
                        SchoolId = schoolId,
                        TeacherName = teacherName.Trim(),
                        DutyPlace = !string.IsNullOrWhiteSpace(dutyPlace) ? dutyPlace.Trim() : "Genel Nöbet",
                        DayOfWeek = normalizedDay.ToString(),
                        Date = date?.Trim(),
                        CreatedAt = DateTime.UtcNow
                    });
                    count++;
                }
            }

            await LogActionAsync(schoolId, "DUTIES_SAVED", "TeacherDuty", null, $"{count} adet nöbetçi öğretmen kaydı güncellendi.");
            await _context.SaveChangesAsync();
            return Ok(new { success = true, count, message = $"{count} adet nöbetçi öğretmen başarıyla kaydedildi." });
        }

        [HttpPost("{schoolId}/duties")]
        public async Task<IActionResult> SaveDuty(Guid schoolId, [FromBody] System.Text.Json.JsonElement request)
        {
            string teacherName = "";
            if (request.TryGetProperty("teacherName", out var tn) || request.TryGetProperty("TeacherName", out tn))
                teacherName = tn.GetString() ?? "";

            if (string.IsNullOrWhiteSpace(teacherName))
                return BadRequest(new { message = "Öğretmen adı zorunludur." });

            string dutyPlace = "Genel Nöbet";
            if (request.TryGetProperty("dutyPlace", out var dp) || request.TryGetProperty("DutyPlace", out dp))
                dutyPlace = dp.GetString() ?? "Genel Nöbet";

            string dayOfWeek = "1";
            if (request.TryGetProperty("dayOfWeek", out var dw) || request.TryGetProperty("DayOfWeek", out dw))
            {
                if (dw.ValueKind == System.Text.Json.JsonValueKind.Number)
                    dayOfWeek = dw.GetInt32().ToString();
                else if (dw.ValueKind == System.Text.Json.JsonValueKind.String)
                    dayOfWeek = dw.GetString() ?? "1";
            }
            int normalizedDay = NormalizeDayOfWeekInt(dayOfWeek);

            string? date = null;
            if (request.TryGetProperty("date", out var dt) || request.TryGetProperty("Date", out dt))
                date = dt.GetString();

            Guid dutyId = Guid.NewGuid();
            if (request.TryGetProperty("id", out var idProp) || request.TryGetProperty("Id", out idProp))
            {
                if (idProp.TryGetGuid(out var g) && g != Guid.Empty) dutyId = g;
            }

            var duty = await _context.TeacherDuties.FirstOrDefaultAsync(d => d.Id == dutyId && d.SchoolId == schoolId);
            if (duty == null)
            {
                duty = new TeacherDuty
                {
                    Id = dutyId,
                    SchoolId = schoolId,
                    TeacherName = teacherName.Trim(),
                    DutyPlace = !string.IsNullOrWhiteSpace(dutyPlace) ? dutyPlace.Trim() : "Genel Nöbet",
                    DayOfWeek = normalizedDay.ToString(),
                    Date = date?.Trim(),
                    CreatedAt = DateTime.UtcNow
                };
                await _context.TeacherDuties.AddAsync(duty);
            }
            else
            {
                duty.TeacherName = teacherName.Trim();
                duty.DutyPlace = !string.IsNullOrWhiteSpace(dutyPlace) ? dutyPlace.Trim() : "Genel Nöbet";
                duty.DayOfWeek = normalizedDay.ToString();
                duty.Date = date?.Trim();
            }

            await _context.SaveChangesAsync();
            return Ok(new { success = true, duty = new { duty.Id, duty.TeacherName, duty.DutyPlace, DayOfWeek = normalizedDay, duty.Date } });
        }

        [HttpDelete("{schoolId}/duties/{dutyId}")]
        public async Task<IActionResult> DeleteDuty(Guid schoolId, Guid dutyId)
        {
            var duty = await _context.TeacherDuties.FirstOrDefaultAsync(d => d.Id == dutyId && d.SchoolId == schoolId);
            if (duty != null)
            {
                _context.TeacherDuties.Remove(duty);
                await _context.SaveChangesAsync();
            }
            return Ok(new { success = true });
        }

        // ---------------------------------------------------------
        // OKUL TAM ANLIK GÖRÜNTÜSÜ (OFFLINE-FIRST / SNAPSHOT SYNC)
        // ---------------------------------------------------------
        [HttpGet("{schoolId}/snapshot")]
        public async Task<IActionResult> GetSchoolSnapshot(Guid schoolId)
        {
            var school = await _context.Schools.FindAsync(schoolId);
            if (school == null) return NotFound(new { message = "Okul bulunamadı." });

            var customerId = school.CustomerId;
            var relationId = school.RelationId;
            var schoolIdStr = schoolId.ToString();

            var teachers = await _context.Users
                .AsNoTracking()
                .Where(u =>
                    (u.SchoolId == schoolId ||
                     (!string.IsNullOrEmpty(u.AssignedSchoolIdsJson) && u.AssignedSchoolIdsJson.Contains(schoolIdStr)) ||
                     (!u.SchoolId.HasValue && (
                        (!string.IsNullOrEmpty(customerId) && u.CustomerId == customerId) ||
                        (!string.IsNullOrEmpty(relationId) && u.RelationId == relationId)
                     ))) &&
                    (u.Role == UserRoles.Teacher || u.Role == UserRoles.Staff)
                )
                .OrderBy(u => u.FullName)
                .Select(u => new
                {
                    id = u.Id.ToString(),
                    fullName = u.FullName,
                    username = u.Username,
                    branch = u.Branch ?? "",
                    counselorClass = u.CounselorClass ?? "",
                    phone = u.Phone ?? "",
                    email = u.Email ?? "",
                    role = u.Role,
                    isActive = u.IsActive,
                    lastLoginAt = u.LastLoginAt
                })
                .ToListAsync();

            var classes = await _context.SchoolClasses
                .AsNoTracking()
                .Where(c => c.SchoolId == schoolId)
                .OrderBy(c => c.Grade).ThenBy(c => c.Section)
                .Select(c => new
                {
                    id = c.Id.ToString(),
                    grade = c.Grade,
                    section = c.Section,
                    className = $"{c.Grade}-{c.Section}",
                    name = $"{c.Grade}/{c.Section}"
                })
                .ToListAsync();

            var lessons = await _context.SchoolLessons
                .AsNoTracking()
                .Where(l => l.SchoolId == schoolId)
                .OrderBy(l => l.Name)
                .Select(l => new
                {
                    id = l.Id.ToString(),
                    name = l.Name,
                    shortCode = l.ShortCode ?? "",
                    grade = l.Grade ?? "",
                    weeklyHours = l.WeeklyHours
                })
                .ToListAsync();

            var schedules = await _context.ScheduleItems
                .AsNoTracking()
                .Where(s => s.SchoolId == schoolId)
                .Select(s => new
                {
                    id = s.Id.ToString(),
                    teacherId = s.TeacherId.HasValue ? s.TeacherId.Value.ToString() : null,
                    teacherName = s.TeacherName ?? "",
                    dayOfWeek = s.DayOfWeek,
                    lessonHour = s.LessonHour,
                    grade = s.Grade,
                    section = s.Section,
                    lessonName = s.LessonName,
                    lessonCode = s.LessonCode ?? "",
                    classroom = s.Classroom ?? ""
                })
                .ToListAsync();

            var duties = await _context.TeacherDuties
                .AsNoTracking()
                .Where(d => d.SchoolId == schoolId)
                .Select(d => new
                {
                    id = d.Id.ToString(),
                    teacherName = d.TeacherName,
                    dutyPlace = d.DutyPlace,
                    dayOfWeek = NormalizeDayOfWeekInt(d.DayOfWeek),
                    date = d.Date ?? ""
                })
                .ToListAsync();

            var students = await _context.Students
                .AsNoTracking()
                .Where(s => s.SchoolId == schoolId)
                .OrderBy(s => s.Grade).ThenBy(s => s.Section).ThenBy(s => s.StudentNumber)
                .Select(s => new
                {
                    id = s.Id.ToString(),
                    studentNumber = s.StudentNumber,
                    fullName = s.FullName,
                    grade = s.Grade ?? "",
                    section = s.Section ?? "",
                    photoPath = s.PhotoPath ?? "",
                    parentName = s.ParentName ?? "",
                    parentPhone = s.ParentPhone ?? "",
                    studentPhone = s.StudentPhone ?? ""
                })
                .ToListAsync();

            return Ok(new
            {
                success = true,
                schoolId = school.Id.ToString(),
                schoolName = school.Name,
                dailyLessonHours = school.DailyLessonHours > 0 ? school.DailyLessonHours : 8,
                teachers,
                classes,
                lessons,
                schedules,
                duties,
                students,
                syncedAt = DateTime.UtcNow.ToString("o")
            });
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
        public string? GeminiApiKey { get; set; }
        public string? GeminiModel { get; set; }
        public int? DailyLessonHours { get; set; }
    }

    public class TeacherDutyDto
    {
        public Guid? Id { get; set; }
        public string TeacherName { get; set; } = string.Empty;
        public string DutyPlace { get; set; } = string.Empty;
        public string? DayOfWeek { get; set; }
        public string? Date { get; set; }
    }

    public class BatchTeacherDutyRequest
    {
        public bool OverwriteExisting { get; set; } = true;
        public List<TeacherDutyDto> Duties { get; set; } = new();
    }

    public class UpdateTeacherStatusRequest
    {
        public bool IsActive { get; set; } = true;
        public string? Role { get; set; }
        public string? AssignedClassesJson { get; set; }
        public string? AssignedLessonsJson { get; set; }
        public string? PermissionsJson { get; set; }
        public string? Branch { get; set; }
        public string? Phone { get; set; }
        public string? Email { get; set; }
        public string? FullName { get; set; }
    }

    public class UpdateKeyRequest
    {
        public string? ApiKey { get; set; }
        public string? Model { get; set; }
    }

    public class CreateTeacherRequest
    {
        public string FullName { get; set; } = string.Empty;
        public string? Role { get; set; }
        public string? Branch { get; set; }
        public string? CounselorClass { get; set; }
        public string? Phone { get; set; }
        public string? Email { get; set; }
        public string? AssignedClassesJson { get; set; }
        public string? AssignedLessonsJson { get; set; }
        public string? PermissionsJson { get; set; }
    }

    public class BatchTeacherSyncItem
    {
        public string FullName { get; set; } = string.Empty;
        public string? Username { get; set; }
        public string? Branch { get; set; }
        public string? CounselorClass { get; set; }
        public string? Role { get; set; }
        public string? Phone { get; set; }
        public string? Email { get; set; }
        public bool? IsActive { get; set; }
        public string? AssignedClassesJson { get; set; }
        public string? AssignedLessonsJson { get; set; }
    }

    public class BatchTeacherSyncRequest
    {
        public List<BatchTeacherSyncItem> Teachers { get; set; } = new();
    }
}
