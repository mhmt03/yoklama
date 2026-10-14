using System;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OgretmenAjanda.Api.Data;
using OgretmenAjanda.Api.Models;

namespace OgretmenAjanda.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class MessagesController : ControllerBase
    {
        private readonly AppDbContext _context;

        public MessagesController(AppDbContext context)
        {
            _context = context;
        }

        private Guid CurrentUserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        private string CurrentUserRole => User.FindFirstValue(ClaimTypes.Role)!;

        // Kullanıcının mesajlarını listele
        [HttpGet]
        public async Task<IActionResult> GetMyMessages([FromQuery] Guid schoolId)
        {
            var isStaffOrAdmin = CurrentUserRole.Equals("ADMIN", StringComparison.OrdinalIgnoreCase) ||
                                 CurrentUserRole.Equals("STAFF", StringComparison.OrdinalIgnoreCase) ||
                                 CurrentUserRole.Equals("SCHOOL_ADMIN", StringComparison.OrdinalIgnoreCase);

            var messages = await _context.AppMessages
                .Where(m => m.SchoolId == schoolId &&
                           (m.ReceiverId == CurrentUserId ||
                            m.SenderId == CurrentUserId ||
                            m.TargetRole == "ALL" ||
                            m.TargetRole == "MY_STUDENTS" ||
                            m.TargetRole == "GRADE" ||
                            m.TargetRole == "SECTION" ||
                            m.TargetRole == "SPECIFIC_STUDENT" ||
                            m.TargetRole == "SPECIFIC_TEACHER" ||
                            m.TargetRole == CurrentUserRole ||
                            (isStaffOrAdmin && m.TargetRole == "STAFF")))
                .OrderByDescending(m => m.CreatedAt)
                .Take(100)
                .ToListAsync();

            return Ok(messages);
        }

        // Yeni Mesaj Gönder (İç iletişim, veli veya sınıf geneli)
        [HttpPost]
        public async Task<IActionResult> SendMessage([FromBody] SendMessageRequest request)
        {
            var sender = await _context.Users.FindAsync(CurrentUserId);
            if (sender == null) return Unauthorized();

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
                TargetDescription = request.TargetDescription,
                Content = request.Content.Trim(),
                CreatedAt = DateTime.UtcNow,
                IsRead = false
            };

            await _context.AppMessages.AddAsync(message);

            _context.AuditLogs.Add(new AuditLog
            {
                SchoolId = request.SchoolId,
                UserId = CurrentUserId,
                UserRole = CurrentUserRole,
                ActionType = "MESSAGE_SENT",
                EntityName = "AppMessage",
                EntityId = message.Id.ToString(),
                DetailsJson = $"Kime: {request.TargetDescription ?? request.TargetRole ?? request.ReceiverName ?? "Alıcı"}, İçerik: {message.Content}",
                Timestamp = DateTime.UtcNow
            });

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
    }

    public class SendMessageRequest
    {
        public Guid SchoolId { get; set; }
        public Guid? ReceiverId { get; set; }
        public string? ReceiverName { get; set; }
        public string? TargetGrade { get; set; }
        public string? TargetSection { get; set; }
        public string? TargetRole { get; set; } // "TEACHER", "STAFF", "MY_STUDENTS", "GRADE", "SECTION", "SPECIFIC_STUDENT", "SPECIFIC_TEACHER"
        public string? TargetDescription { get; set; }
        public string Content { get; set; } = string.Empty;
    }

    public class RegisterPushTokenRequest
    {
        public string Token { get; set; } = string.Empty;
    }
}
