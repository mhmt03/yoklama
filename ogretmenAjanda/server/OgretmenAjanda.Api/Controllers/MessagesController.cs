using System;
using System.Linq;
using System.Security.Claims;
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
    public class MessagesController : ControllerBase
    {
        private readonly AppDbContext _context;
        private readonly IAuditLogService _auditLogService;

        public MessagesController(AppDbContext context, IAuditLogService auditLogService)
        {
            _context = context;
            _auditLogService = auditLogService;
        }

        private Guid CurrentUserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        private string CurrentUserRole => User.FindFirstValue(ClaimTypes.Role)!;

        // Kullanıcının veya okulun mesajlarını listele (scope: personal/inbox, sent, all)
        [HttpGet]
        public async Task<IActionResult> GetMyMessages([FromQuery] Guid schoolId, [FromQuery] string? scope = null)
        {
            var user = await _context.Users.FindAsync(CurrentUserId);
            if (user == null) return Unauthorized();

            var sId = await ResolveSchoolIdAsync(schoolId != Guid.Empty ? schoolId.ToString() : null, user.SchoolId);
            if (sId == Guid.Empty && schoolId != Guid.Empty) sId = schoolId;

            var query = await BuildUserMessageQueryAsync(sId, user, false, scope);
            var messages = await query
                .OrderByDescending(m => m.CreatedAt)
                .Take(300)
                .ToListAsync();

            return Ok(messages);
        }

        // Yeni Mesaj Gönder (İç iletişim, veli veya sınıf geneli, yanıt verme)
        [HttpPost]
        public async Task<IActionResult> SendMessage([FromBody] SendMessageRequest request)
        {
            var sender = await _context.Users.FindAsync(CurrentUserId);
            if (sender == null) return Unauthorized();

            // Öğretmen yetki kontrolü
            if (sender.Role == UserRoles.Teacher && !string.IsNullOrEmpty(sender.PermissionsJson))
            {
                try
                {
                    using var doc = System.Text.Json.JsonDocument.Parse(sender.PermissionsJson);
                    var root = doc.RootElement;
                    var target = (request.TargetRole ?? "").ToUpper();

                    if ((target.Contains("STUDENT") || target == "GRADE" || target == "SECTION" || target == "MY_STUDENTS") &&
                        root.TryGetProperty("canMessageStudents", out var canStudent) && !canStudent.GetBoolean())
                    {
                        return BadRequest(new { message = "Öğrencilere mesaj gönderme yetkiniz okul yönetimi tarafından sınırlandırılmıştır." });
                    }

                    if ((target.Contains("TEACHER") || target == "ALL_TEACHERS") &&
                        root.TryGetProperty("canMessageTeachers", out var canTeacher) && !canTeacher.GetBoolean())
                    {
                        return BadRequest(new { message = "Öğretmenlere mesaj gönderme yetkiniz okul yönetimi tarafından sınırlandırılmıştır." });
                    }

                    if (target.Contains("PARENT") &&
                        root.TryGetProperty("canMessageParents", out var canParent) && !canParent.GetBoolean())
                    {
                        return BadRequest(new { message = "Velilere mesaj gönderme yetkiniz okul yönetimi tarafından sınırlandırılmıştır." });
                    }
                }
                catch { }
            }

            var message = new AppMessage
            {
                Id = Guid.NewGuid(),
                SchoolId = request.SchoolId,
                SenderId = CurrentUserId,
                SenderName = sender.FullName,
                SenderRole = CurrentUserRole,
                ReceiverId = request.ReceiverId,
                ReceiverName = request.ReceiverName,
                TargetGrade = request.TargetGrade,
                TargetSection = request.TargetSection,
                TargetRole = request.TargetRole,
                TargetAudience = !string.IsNullOrEmpty(request.TargetAudience) 
                    ? request.TargetAudience.ToUpperInvariant() 
                    : (request.TargetRole?.Contains("PARENT") == true ? "PARENT" : (request.TargetRole?.Contains("STUDENT") == true ? "STUDENT" : "ALL")),
                TargetDescription = request.TargetDescription,
                Content = request.Content.Trim(),
                ReplyToMessageId = request.ReplyToMessageId,
                ReplyToContent = request.ReplyToContent,
                Subject = request.Subject,
                CreatedAt = DateTime.UtcNow,
                IsRead = false
            };

            await _context.AppMessages.AddAsync(message);

            var user = await _context.Users.FindAsync(CurrentUserId);
            var clientIp = HttpContext?.Connection?.RemoteIpAddress?.ToString();
            var targetWho = request.TargetDescription ?? request.TargetRole ?? request.ReceiverName ?? "Alıcı";
            var snippet = message.Content.Length > 60 ? message.Content.Substring(0, 57) + "..." : message.Content;

            await _auditLogService.LogAsync(
                _context,
                request.SchoolId,
                CurrentUserId,
                user?.Username,
                user?.FullName,
                CurrentUserRole,
                "MESSAGE_SENT",
                "AppMessage",
                message.Id.ToString(),
                $"'{targetWho}' hedefine mesaj iletildi: \"{snippet}\"",
                $"{{\"target\": \"{targetWho}\", \"content\": \"{message.Content.Replace("\"", "\\\"")}\"}}",
                clientIp
            );

            await _context.SaveChangesAsync();
            return Ok(message);
        }

        // Expo Push Token Kaydet
        [HttpPost("register-push-token")]
        public async Task<IActionResult> RegisterPushToken([FromBody] RegisterPushTokenRequest request)
        {
            var user = await _context.Users.FindAsync(CurrentUserId);
            if (user == null) return Unauthorized();

            user.PushToken = request.Token;
            await _context.SaveChangesAsync();

            return Ok(new { message = "Push token kaydedildi." });
        }

        private async Task<Guid> ResolveSchoolIdAsync(string? schoolId, Guid? userSchoolId)
        {
            if (!string.IsNullOrWhiteSpace(schoolId))
            {
                if (Guid.TryParse(schoolId, out var parsedGuid) && parsedGuid != Guid.Empty)
                {
                    return parsedGuid;
                }
                var schoolByCode = await _context.Schools.FirstOrDefaultAsync(s => s.Code.ToUpper() == schoolId.Trim().ToUpper());
                if (schoolByCode != null)
                {
                    return schoolByCode.Id;
                }
            }
            return userSchoolId ?? Guid.Empty;
        }

        // Okunmamış mesaj sayısı (Ana sayfa baloncuk bildirimi)
        // Okunmamış mesaj sayısı (Ana sayfa baloncuk bildirimi)
        [HttpGet("unread-count")]
        public async Task<IActionResult> GetUnreadCount([FromQuery] string? schoolId, [FromQuery] string? scope = null)
        {
            var user = await _context.Users.FindAsync(CurrentUserId);
            if (user == null) return Ok(new { count = 0 });

            var sId = await ResolveSchoolIdAsync(schoolId, user.SchoolId);
            var isStaffOrAdmin = CurrentUserRole.Equals("ADMIN", StringComparison.OrdinalIgnoreCase) ||
                                 CurrentUserRole.Equals("STAFF", StringComparison.OrdinalIgnoreCase) ||
                                 CurrentUserRole.Equals("SCHOOL_ADMIN", StringComparison.OrdinalIgnoreCase) ||
                                 CurrentUserRole.Equals("SUPERADMIN", StringComparison.OrdinalIgnoreCase);

            var effectiveScope = scope ?? (isStaffOrAdmin ? "personal" : null);
            var query = await BuildUserMessageQueryAsync(sId, user, true, effectiveScope);
            var unread = await query.CountAsync();
            return Ok(new { count = unread });
        }

        // Mesajı okundu olarak işaretle
        [HttpPost("{messageId}/read")]
        public async Task<IActionResult> MarkMessageAsRead(Guid messageId)
        {
            var msg = await _context.AppMessages.FindAsync(messageId);
            if (msg == null) return NotFound();

            msg.IsRead = true;
            await _context.SaveChangesAsync();
            return Ok(new { success = true });
        }

        // Tüm mesajları okundu yap
        [HttpPost("mark-all-read")]
        public async Task<IActionResult> MarkAllAsRead([FromQuery] string? schoolId)
        {
            var user = await _context.Users.FindAsync(CurrentUserId);
            if (user == null) return Unauthorized();

            var sId = await ResolveSchoolIdAsync(schoolId, user.SchoolId);
            var query = await BuildUserMessageQueryAsync(sId, user, true);
            var unreadMessages = await query.ToListAsync();

            foreach (var m in unreadMessages)
            {
                m.IsRead = true;
            }

            await _context.SaveChangesAsync();
            return Ok(new { success = true, markedCount = unreadMessages.Count });
        }

        private async Task<IQueryable<AppMessage>> BuildUserMessageQueryAsync(Guid schoolId, User user, bool unreadOnly, string? scope = null)
        {
            var isStaffOrAdmin = CurrentUserRole.Equals("ADMIN", StringComparison.OrdinalIgnoreCase) ||
                                 CurrentUserRole.Equals("STAFF", StringComparison.OrdinalIgnoreCase) ||
                                 CurrentUserRole.Equals("SCHOOL_ADMIN", StringComparison.OrdinalIgnoreCase) ||
                                 CurrentUserRole.Equals("SUPERADMIN", StringComparison.OrdinalIgnoreCase);

            var query = _context.AppMessages.AsQueryable();

            if (unreadOnly)
            {
                query = query.Where(m => !m.IsRead && m.SenderId != user.Id);
            }

            var cleanScope = (scope ?? "").ToLowerInvariant().Trim();

            // Gönderilen mesajlar
            if (cleanScope == "sent")
            {
                query = query.Where(m => m.SenderId == user.Id);
                if (schoolId != Guid.Empty) query = query.Where(m => m.SchoolId == schoolId);
                else if (user.SchoolId.HasValue) query = query.Where(m => m.SchoolId == user.SchoolId.Value);
                return query;
            }

            // İdareci / Admin Özel Filtrelemesi:
            if (isStaffOrAdmin)
            {
                // Admin'in şahsına veya idareye gelen mesajlar ("personal", "inbox", "direct", "me")
                if (cleanScope == "personal" || cleanScope == "inbox" || cleanScope == "direct" || cleanScope == "me")
                {
                    query = query.Where(m =>
                        m.ReceiverId == user.Id ||
                        m.TargetRole == "STAFF" ||
                        m.TargetRole == "ADMIN" ||
                        m.TargetRole == "SCHOOL_ADMIN");
                }
                // cleanScope == "all" veya boşsa: Tüm okul mesaj trafiği (denetim amaçlı)

                if (schoolId != Guid.Empty)
                {
                    query = query.Where(m => m.SchoolId == schoolId);
                }
                else if (user.SchoolId.HasValue)
                {
                    query = query.Where(m => m.SchoolId == user.SchoolId.Value);
                }
                return query;
            }

            var isParent = CurrentUserRole.Equals("PARENT", StringComparison.OrdinalIgnoreCase);
            var isStudent = CurrentUserRole.Equals("STUDENT", StringComparison.OrdinalIgnoreCase);

            if (isParent || isStudent)
            {
                var cleanNum = user.Username ?? "";
                if (cleanNum.StartsWith("vo_", StringComparison.OrdinalIgnoreCase)) cleanNum = cleanNum.Substring(3);
                else if (cleanNum.StartsWith("v_", StringComparison.OrdinalIgnoreCase)) cleanNum = cleanNum.Substring(2);
                else if (cleanNum.StartsWith("o_", StringComparison.OrdinalIgnoreCase)) cleanNum = cleanNum.Substring(2);

                var sId = schoolId != Guid.Empty ? schoolId : user.SchoolId;
                var student = await _context.Students.FirstOrDefaultAsync(s =>
                    (sId == null || s.SchoolId == sId) &&
                    (s.StudentNumber == cleanNum || s.StudentNumber == user.Username));

                var studentId = student?.Id;
                var studentGrade = student?.Grade;
                var studentSection = student?.Section;

                if (isParent)
                {
                    query = query.Where(m =>
                        (m.ReceiverId == user.Id ||
                         m.SenderId == user.Id ||
                         (studentId != null && m.ReceiverId == studentId) ||
                         (m.TargetRole == "ALL" && m.TargetAudience != "STUDENT") ||
                         (m.TargetRole == "PARENT" || m.TargetRole == "PARENTS") ||
                         (studentGrade != null && m.TargetRole == "GRADE" && m.TargetGrade == studentGrade && m.TargetAudience != "STUDENT") ||
                         (studentGrade != null && studentSection != null && m.TargetRole == "SECTION" && m.TargetGrade == studentGrade && m.TargetSection == studentSection && m.TargetAudience != "STUDENT") ||
                         (studentGrade != null && m.TargetRole == "MY_STUDENTS" && (m.TargetGrade == null || m.TargetGrade == studentGrade) && (m.TargetSection == null || m.TargetSection == studentSection) && m.TargetAudience != "STUDENT") ||
                         (studentId != null && m.TargetRole == "SPECIFIC_STUDENT" && m.ReceiverId == studentId)));
                }
                else // isStudent
                {
                    query = query.Where(m =>
                        (m.ReceiverId == user.Id ||
                         m.SenderId == user.Id ||
                         (studentId != null && m.ReceiverId == studentId) ||
                         (m.TargetRole == "ALL" && m.TargetAudience != "PARENT") ||
                         (m.TargetRole == "STUDENT" || m.TargetRole == "STUDENTS") ||
                         (studentGrade != null && m.TargetRole == "GRADE" && m.TargetGrade == studentGrade && m.TargetAudience != "PARENT") ||
                         (studentGrade != null && studentSection != null && m.TargetRole == "SECTION" && m.TargetGrade == studentGrade && m.TargetSection == studentSection && m.TargetAudience != "PARENT") ||
                         (studentGrade != null && m.TargetRole == "MY_STUDENTS" && (m.TargetGrade == null || m.TargetGrade == studentGrade) && (m.TargetSection == null || m.TargetSection == studentSection) && m.TargetAudience != "PARENT") ||
                         (studentId != null && m.TargetRole == "SPECIFIC_STUDENT" && m.ReceiverId == studentId)));
                }

                if (sId.HasValue && sId.Value != Guid.Empty)
                {
                    query = query.Where(m => m.SchoolId == sId.Value);
                }

                return query;
            }

            // Teacher / Other Role
            if (cleanScope == "personal" || cleanScope == "inbox")
            {
                query = query.Where(m =>
                    m.ReceiverId == user.Id ||
                    (m.TargetRole == "SPECIFIC_TEACHER" && m.ReceiverId == user.Id) ||
                    ((m.TargetRole == "ALL" || m.TargetRole == "TEACHER" || m.TargetRole == "TEACHERS") && (m.TargetAudience == "ALL" || m.TargetAudience == "TEACHER")));
            }
            else
            {
                query = query.Where(m =>
                    m.ReceiverId == user.Id ||
                    m.SenderId == user.Id ||
                    (m.TargetRole == "SPECIFIC_TEACHER" && m.ReceiverId == user.Id) ||
                    ((m.TargetRole == "ALL" || m.TargetRole == "TEACHER" || m.TargetRole == "TEACHERS") && (m.TargetAudience == "ALL" || m.TargetAudience == "TEACHER")));
            }

            if (schoolId != Guid.Empty)
            {
                query = query.Where(m => m.SchoolId == schoolId);
            }
            else if (user.SchoolId.HasValue)
            {
                query = query.Where(m => m.SchoolId == user.SchoolId.Value);
            }

            return query;
        }
    }

    public class SendMessageRequest
    {
        public Guid SchoolId { get; set; }
        public Guid? ReceiverId { get; set; }
        public string? ReceiverName { get; set; }
        public string? TargetGrade { get; set; }
        public string? TargetSection { get; set; }
        public string? TargetRole { get; set; } // "TEACHER", "STAFF", "MY_STUDENTS", "GRADE", "SECTION", "SPECIFIC_STUDENT", "SPECIFIC_TEACHER", "PARENT", "ALL"
        public string? TargetAudience { get; set; } // "ALL", "STUDENT", "PARENT"
        public string? TargetDescription { get; set; }
        public string Content { get; set; } = string.Empty;
        public Guid? ReplyToMessageId { get; set; }
        public string? ReplyToContent { get; set; }
        public string? Subject { get; set; }
    }

    public class RegisterPushTokenRequest
    {
        public string Token { get; set; } = string.Empty;
    }
}
