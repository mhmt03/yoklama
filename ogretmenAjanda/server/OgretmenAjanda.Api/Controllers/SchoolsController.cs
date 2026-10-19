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

        public SchoolsController(AppDbContext context, IAuditLogService auditLogService)
        {
            _context = context;
            _auditLogService = auditLogService;
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
            else if (CurrentUserRole == UserRoles.Staff)
            {
                // İdareci sadece kendi okulunu görür
                var currentUser = await _context.Users.FindAsync(CurrentUserId);
                if (currentUser?.SchoolId != null)
                {
                    query = query.Where(s => s.Id == currentUser.SchoolId.Value);
                }
                else
                {
                    query = query.Where(s => false);
                }
            }
            else
            {
                query = query.Where(s => s.AdminUserId == CurrentUserId);
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
                FullName = fullName,
                Role = !string.IsNullOrEmpty(request.Role) ? request.Role : UserRoles.Teacher,
                Branch = request.Branch?.Trim(),
                PermissionsJson = request.PermissionsJson,
                Email = request.Email?.Trim(),
                Phone = request.Phone?.Trim(),
                SchoolId = school.Id,
                RelationId = school.RelationId,
                CustomerId = school.CustomerId,
                LicenseExpiresAt = school.LicenseExpiresAt,
                AssignedClassesJson = request.AssignedClassesJson,
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

            school.IsActive = false;

            // Bu okula bağlı kullanıcıları pasife al
            var teachers = await _context.Users.Where(u => u.SchoolId == school.Id).ToListAsync();
            foreach (var teacher in teachers)
            {
                teacher.IsActive = false;
            }

            await LogActionAsync(
                school.Id,
                "SCHOOL_DELETED",
                "School",
                school.Id.ToString(),
                $"{school.Name} ({school.Code}) okulu silindi (arşive alındı)."
            );

            await _context.SaveChangesAsync();
            return Ok(new { message = "Okul başarıyla silindi.", deletedSchoolId = school.Id });
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
            if (!string.IsNullOrEmpty(request.Role)) teacher.Role = request.Role;
            if (request.PermissionsJson != null) teacher.PermissionsJson = request.PermissionsJson;
            if (request.Phone != null) teacher.Phone = request.Phone.Trim();
            if (request.Email != null) teacher.Email = request.Email.Trim();
            if (request.AssignedClassesJson != null) teacher.AssignedClassesJson = request.AssignedClassesJson;

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

            await _context.SaveChangesAsync();
            return Ok(new { message = $"Şifre başarıyla güncellendi: {newPass}", password = newPass });
        }

        // Öğrenci & Veli Şifre Sıfırlama
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

            var defaultPassword = $"aaaa_{student.StudentNumber.Trim()}";
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

            await _context.SaveChangesAsync();

            await LogActionAsync(
                schoolId,
                "STUDENT_PASSWORD_RESET",
                "Student",
                student.Id.ToString(),
                $"Öğrenci/Veli şifresi sıfırlandı: {student.FullName} (No: {student.StudentNumber})",
                $"{{\"studentNumber\": \"{student.StudentNumber}\", \"isDefault\": {((newPass == defaultPassword) ? "true" : "false")}}}"
            );

            return Ok(new
            {
                success = true,
                message = $"Öğrenci/Veli şifresi başarıyla güncellendi: {newPass}",
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
            await _context.SaveChangesAsync();
            return Ok(new { message = $"{items.Count} adet ders başarıyla silindi." });
        }

        // Toplu İşlemler: Tüm Şubeleri Sil
        [HttpDelete("{schoolId}/classes/all")]
        public async Task<IActionResult> DeleteAllClasses(Guid schoolId)
        {
            var items = await _context.SchoolClasses.Where(c => c.SchoolId == schoolId).ToListAsync();
            _context.SchoolClasses.RemoveRange(items);
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
    }


    public class UpdateTeacherStatusRequest
    {
        public bool IsActive { get; set; } = true;
        public string? Role { get; set; }
        public string? AssignedClassesJson { get; set; }
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
        public string? Phone { get; set; }
        public string? Email { get; set; }
        public string? AssignedClassesJson { get; set; }
        public string? PermissionsJson { get; set; }
    }
}
