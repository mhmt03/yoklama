using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Claims;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OgretmenAjanda.Api.Data;
using OgretmenAjanda.Api.Models;
using OgretmenAjanda.Api.Services;

namespace OgretmenAjanda.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class PermissionsController : ControllerBase
    {
        private readonly AppDbContext _context;
        private readonly IAuditLogService _auditLogService;

        public PermissionsController(AppDbContext context, IAuditLogService auditLogService)
        {
            _context = context;
            _auditLogService = auditLogService;
        }

        private Guid CurrentUserId =>
            Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        private string CurrentUserRole =>
            User.FindFirstValue(ClaimTypes.Role) ?? string.Empty;

        private async Task<(bool isAuthorized, User? currentUser, List<School> schools)> GetAuthorizedInstitutionContextAsync()
        {
            var user = await _context.Users.FindAsync(CurrentUserId);
            if (user == null) return (false, null, new List<School>());

            var customerId = user.CustomerId;
            var relationId = user.RelationId;

            bool isSuper = CurrentUserRole == UserRoles.SuperAdmin;
            bool isInstAdmin = (user.Role == UserRoles.SchoolAdmin || user.Role == UserRoles.InstitutionAdmin) &&
                (!user.SchoolId.HasValue || _context.Institutions.Any(i => i.AdminUserId == user.Id || (!string.IsNullOrEmpty(customerId) && i.Code.ToLower() == customerId.ToLower())));

            if (!isSuper && !isInstAdmin)
            {
                return (false, user, new List<School>());
            }

            IQueryable<School> schoolQuery = _context.Schools.Where(s => s.IsActive);
            if (!isSuper)
            {
                schoolQuery = schoolQuery.Where(s =>
                    s.AdminUserId == user.Id ||
                    (!string.IsNullOrEmpty(customerId) && s.CustomerId == customerId) ||
                    (!string.IsNullOrEmpty(relationId) && s.RelationId == relationId)
                );
            }

            var schools = await schoolQuery.OrderBy(s => s.Name).ToListAsync();
            return (true, user, schools);
        }

        // 1. Kurumun tüm kullanıcılarını, okullarını ve yetki özetini getir
        [HttpGet("overview")]
        public async Task<IActionResult> GetPermissionsOverview()
        {
            var (isAuthorized, currentUser, schools) = await GetAuthorizedInstitutionContextAsync();
            if (!isAuthorized)
            {
                return Forbid();
            }

            var schoolIds = schools.Select(s => s.Id).ToList();
            var customerId = currentUser?.CustomerId;
            var relationId = currentUser?.RelationId;

            // Kuruma bağlı tüm personeli (öğretmenler + idareciler) çek
            var allUsersQuery = _context.Users.Where(u =>
                u.Role != UserRoles.SuperAdmin &&
                u.Role != UserRoles.Student &&
                u.Id != CurrentUserId // Kurum admininin kendisini ayır
            );

            if (CurrentUserRole != UserRoles.SuperAdmin)
            {
                allUsersQuery = allUsersQuery.Where(u =>
                    (u.SchoolId.HasValue && schoolIds.Contains(u.SchoolId.Value)) ||
                    (!string.IsNullOrEmpty(customerId) && u.CustomerId == customerId) ||
                    (!string.IsNullOrEmpty(relationId) && u.RelationId == relationId)
                );
            }

            var usersList = await allUsersQuery
                .OrderBy(u => u.FullName)
                .ToListAsync();

            // Okul isim eşleştirmesi
            var schoolMap = schools.ToDictionary(s => s.Id, s => s.Name);

            var administrators = new List<object>();
            var teachers = new List<object>();

            foreach (var u in usersList)
            {
                var assignedSchoolIds = new List<string>();
                if (!string.IsNullOrEmpty(u.AssignedSchoolIdsJson))
                {
                    try
                    {
                        var parsed = JsonSerializer.Deserialize<List<string>>(u.AssignedSchoolIdsJson);
                        if (parsed != null) assignedSchoolIds = parsed;
                    }
                    catch { }
                }

                if (u.SchoolId.HasValue && !assignedSchoolIds.Contains(u.SchoolId.Value.ToString()))
                {
                    assignedSchoolIds.Add(u.SchoolId.Value.ToString());
                }

                var schoolName = u.SchoolId.HasValue && schoolMap.ContainsKey(u.SchoolId.Value)
                    ? schoolMap[u.SchoolId.Value]
                    : "Atanmamış / Genel";

                object? permissionsObj = null;
                if (!string.IsNullOrEmpty(u.PermissionsJson))
                {
                    try { permissionsObj = JsonSerializer.Deserialize<object>(u.PermissionsJson); } catch { }
                }

                var dto = new
                {
                    id = u.Id,
                    username = u.Username,
                    fullName = u.FullName,
                    role = u.Role,
                    schoolId = u.SchoolId,
                    schoolName,
                    branch = u.Branch,
                    phone = u.Phone,
                    email = u.Email,
                    assignedClassesJson = u.AssignedClassesJson,
                    assignedLessonsJson = u.AssignedLessonsJson,
                    assignedSchoolIds,
                    permissions = permissionsObj,
                    isActive = u.IsActive
                };

                if (u.Role == UserRoles.Staff || u.Role == UserRoles.SchoolAdmin)
                {
                    administrators.Add(dto);
                }
                else
                {
                    teachers.Add(dto);
                }
            }

            return Ok(new
            {
                schools = schools.Select(s => new { id = s.Id, name = s.Name, code = s.Code }),
                administrators,
                teachers,
                totalAdminCount = administrators.Count,
                totalTeacherCount = teachers.Count
            });
        }

        // 2. Tek bir kullanıcının yetkilerini ve atandığı okulları güncelle
        [HttpPut("user/{userId}")]
        public async Task<IActionResult> UpdateUserPermissions(Guid userId, [FromBody] UpdateUserPermissionsRequest request)
        {
            var (isAuthorized, currentUser, schools) = await GetAuthorizedInstitutionContextAsync();
            if (!isAuthorized) return Forbid();

            var targetUser = await _context.Users.FindAsync(userId);
            if (targetUser == null) return NotFound(new { message = "Kullanıcı bulunamadı." });

            if (!string.IsNullOrEmpty(request.Role))
            {
                targetUser.Role = request.Role.Trim().ToUpperInvariant();
            }

            if (request.SchoolId.HasValue)
            {
                targetUser.SchoolId = request.SchoolId.Value;
            }

            if (request.AssignedSchoolIds != null)
            {
                targetUser.AssignedSchoolIdsJson = JsonSerializer.Serialize(request.AssignedSchoolIds);
                if (request.AssignedSchoolIds.Count > 0 && !targetUser.SchoolId.HasValue)
                {
                    if (Guid.TryParse(request.AssignedSchoolIds[0], out var firstG))
                    {
                        targetUser.SchoolId = firstG;
                    }
                }
            }

            if (request.PermissionsJson != null)
            {
                targetUser.PermissionsJson = request.PermissionsJson;
            }

            if (request.AssignedClassesJson != null)
            {
                targetUser.AssignedClassesJson = request.AssignedClassesJson;
            }

            // Müşteri No ve İlişki ID güvencesi
            if (currentUser != null)
            {
                if (string.IsNullOrEmpty(targetUser.CustomerId)) targetUser.CustomerId = currentUser.CustomerId;
                if (string.IsNullOrEmpty(targetUser.RelationId)) targetUser.RelationId = currentUser.RelationId;
            }

            var clientIp = HttpContext?.Connection?.RemoteIpAddress?.ToString();
            await _auditLogService.LogAsync(
                _context,
                targetUser.SchoolId,
                CurrentUserId,
                currentUser?.Username,
                currentUser?.FullName,
                currentUser?.Role,
                "PERMISSIONS_UPDATED",
                "User",
                targetUser.Id.ToString(),
                $"{targetUser.FullName} kullanıcısının rolü ({targetUser.Role}) ve yetkileri güncellendi.",
                $"{{\"role\":\"{targetUser.Role}\", \"assignedSchools\":{targetUser.AssignedSchoolIdsJson ?? "[]"}}}",
                clientIp
            );

            await _context.SaveChangesAsync();
            return Ok(new { success = true, message = "Kullanıcı yetkileri başarıyla güncellendi." });
        }

        // 3. Toplu Yetki Atama (Batch Update)
        [HttpPost("batch-update")]
        public async Task<IActionResult> BatchUpdatePermissions([FromBody] BatchPermissionsRequest request)
        {
            var (isAuthorized, currentUser, schools) = await GetAuthorizedInstitutionContextAsync();
            if (!isAuthorized) return Forbid();

            if (request.UserIds == null || request.UserIds.Count == 0)
            {
                return BadRequest(new { message = "Lütfen en az bir kullanıcı seçiniz." });
            }

            var targetUsers = await _context.Users
                .Where(u => request.UserIds.Contains(u.Id))
                .ToListAsync();

            if (targetUsers.Count == 0)
            {
                return NotFound(new { message = "Seçilen kullanıcılar bulunamadı." });
            }

            int updatedCount = 0;
            foreach (var user in targetUsers)
            {
                if (!string.IsNullOrEmpty(request.Role))
                {
                    user.Role = request.Role.Trim().ToUpperInvariant();
                }

                if (request.AssignedSchoolIds != null && request.AssignedSchoolIds.Count > 0)
                {
                    user.AssignedSchoolIdsJson = JsonSerializer.Serialize(request.AssignedSchoolIds);
                    if (Guid.TryParse(request.AssignedSchoolIds[0], out var g))
                    {
                        user.SchoolId = g;
                    }
                }

                // Mevcut izinlerle yeni izinleri birleştir (Merge)
                if (request.Permissions != null)
                {
                    Dictionary<string, object> currentPerms = new();
                    if (!string.IsNullOrEmpty(user.PermissionsJson))
                    {
                        try
                        {
                            var parsed = JsonSerializer.Deserialize<Dictionary<string, object>>(user.PermissionsJson);
                            if (parsed != null) currentPerms = parsed;
                        }
                        catch { }
                    }

                    foreach (var kvp in request.Permissions)
                    {
                        currentPerms[kvp.Key] = kvp.Value;
                    }

                    user.PermissionsJson = JsonSerializer.Serialize(currentPerms);
                }

                if (currentUser != null)
                {
                    if (string.IsNullOrEmpty(user.CustomerId)) user.CustomerId = currentUser.CustomerId;
                    if (string.IsNullOrEmpty(user.RelationId)) user.RelationId = currentUser.RelationId;
                }

                updatedCount++;
            }

            var clientIp = HttpContext?.Connection?.RemoteIpAddress?.ToString();
            await _auditLogService.LogAsync(
                _context,
                targetUsers.FirstOrDefault()?.SchoolId,
                CurrentUserId,
                currentUser?.Username,
                currentUser?.FullName,
                currentUser?.Role,
                "BATCH_PERMISSIONS_UPDATED",
                "User",
                $"{updatedCount}_users",
                $"{updatedCount} kullanıcı için toplu yetki güncellemesi yapıldı.",
                JsonSerializer.Serialize(new { count = updatedCount, role = request.Role }),
                clientIp
            );

            await _context.SaveChangesAsync();
            return Ok(new
            {
                success = true,
                message = $"{updatedCount} personelin yetkileri başarıyla güncellendi.",
                updatedCount
            });
        }
    }

    public class UpdateUserPermissionsRequest
    {
        public string? Role { get; set; }
        public Guid? SchoolId { get; set; }
        public List<string>? AssignedSchoolIds { get; set; }
        public string? PermissionsJson { get; set; }
        public string? AssignedClassesJson { get; set; }
    }

    public class BatchPermissionsRequest
    {
        public List<Guid> UserIds { get; set; } = new();
        public string? Role { get; set; }
        public List<string>? AssignedSchoolIds { get; set; }
        public Dictionary<string, object>? Permissions { get; set; }
    }
}
