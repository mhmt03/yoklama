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
    public class AuthController : ControllerBase
    {
        private readonly AppDbContext _context;
        private readonly ITokenService _tokenService;

        public AuthController(AppDbContext context, ITokenService tokenService)
        {
            _context = context;
            _tokenService = tokenService;
        }

        [HttpPost("login")]
        public async Task<IActionResult> Login([FromBody] LoginRequest request)
        {
            var user = await _context.Users
                .FirstOrDefaultAsync(u => u.Username.ToLower() == request.Username.Trim().ToLower());

            if (user == null || !BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash))
            {
                return Unauthorized(new { message = "Kullanıcı adı veya şifre hatalı." });
            }

            if (!user.IsActive)
            {
                return StatusCode(403, new { message = "Hesabınız askıya alınmıştır. Lütfen yöneticinizle görüşün." });
            }

            // Lisans süresi kontrolü
            if (user.Role != UserRoles.SuperAdmin && user.LicenseExpiresAt.HasValue && user.LicenseExpiresAt.Value < DateTime.UtcNow)
            {
                return StatusCode(402, new { message = "Lisans süreniz dolmuştur. Lütfen yenileyiniz." });
            }

            School? school = null;
            if (user.SchoolId.HasValue)
            {
                school = await _context.Schools.FindAsync(user.SchoolId.Value);
            }

            user.LastLoginAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();

            var token = _tokenService.GenerateToken(user, school?.Code);

            return Ok(new LoginResponse
            {
                Token = token,
                UserId = user.Id,
                Username = user.Username,
                FullName = user.FullName,
                Role = user.Role,
                SchoolId = user.SchoolId,
                SchoolCode = school?.Code,
                SchoolName = school?.Name,
                GeminiApiKey = school?.GeminiApiKey,
                LicenseExpiresAt = user.LicenseExpiresAt ?? school?.LicenseExpiresAt
            });
        }

        // KVKK Uyumlu Öğrenci & Veli Girişi (Okul Kodu + OgrenciNo + aaaa_ogrencino)
        [HttpPost("student-login")]
        public async Task<IActionResult> StudentLogin([FromBody] StudentLoginRequest request)
        {
            var school = await _context.Schools
                .FirstOrDefaultAsync(s => s.Code.ToUpper() == request.SchoolCode.Trim().ToUpper() && s.IsActive);

            if (school == null)
            {
                return NotFound(new { message = "Geçersiz okul kodu." });
            }

            var student = await _context.Students
                .FirstOrDefaultAsync(s => s.SchoolId == school.Id && s.StudentNumber == request.StudentNumber.Trim());

            if (student == null)
            {
                return NotFound(new { message = "Bu okulda belirtilen öğrenci numarası bulunamadı." });
            }

            // Varsayılan şifre: aaaa_ + ogrencino
            string defaultPassword = $"aaaa_{student.StudentNumber}";
            var studentUser = await _context.Users
                .FirstOrDefaultAsync(u => u.SchoolId == school.Id && u.Username == student.StudentNumber);

            if (studentUser == null)
            {
                // İlk girişte öğrenci hesabı yoksa ve varsayılan şifre doğru girilmişse hesabı otomatik oluştur
                if (request.Password != defaultPassword)
                {
                    return Unauthorized(new { message = "Şifre hatalı. (Varsayılan şifreniz: aaaa_öğrencino)" });
                }

                studentUser = new User
                {
                    Id = student.Id, // Aynı UUID
                    Username = student.StudentNumber,
                    PasswordHash = BCrypt.Net.BCrypt.HashPassword(defaultPassword),
                    FullName = student.FullName,
                    Role = UserRoles.Student,
                    SchoolId = school.Id,
                    IsActive = true,
                    CreatedAt = DateTime.UtcNow
                };
                await _context.Users.AddAsync(studentUser);
                await _context.SaveChangesAsync();
            }
            else
            {
                if (!BCrypt.Net.BCrypt.Verify(request.Password, studentUser.PasswordHash))
                {
                    return Unauthorized(new { message = "Şifre hatalı." });
                }
            }

            var token = _tokenService.GenerateToken(studentUser, school.Code);

            return Ok(new LoginResponse
            {
                Token = token,
                UserId = studentUser.Id,
                Username = studentUser.Username,
                FullName = studentUser.FullName,
                Role = UserRoles.Student,
                SchoolId = school.Id,
                SchoolCode = school.Code,
                SchoolName = school.Name
            });
        }

        // Okul Kodu ile Öğretmen Kaydı
        [HttpPost("register-teacher")]
        public async Task<IActionResult> RegisterTeacher([FromBody] TeacherRegisterRequest request)
        {
            var school = await _context.Schools
                .FirstOrDefaultAsync(s => s.Code.ToUpper() == request.SchoolCode.Trim().ToUpper() && s.IsActive);

            if (school == null)
            {
                return NotFound(new { message = "Geçersiz veya aktif olmayan okul kodu." });
            }

            if (await _context.Users.AnyAsync(u => u.Username.ToLower() == request.Username.Trim().ToLower()))
            {
                return BadRequest(new { message = "Bu kullanıcı adı zaten kullanılıyor." });
            }

            var teacher = new User
            {
                Id = Guid.NewGuid(),
                Username = request.Username.Trim(),
                PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password),
                FullName = request.FullName.Trim(),
                Email = request.Email,
                Phone = request.Phone,
                Role = UserRoles.Teacher,
                SchoolId = school.Id,
                LicenseExpiresAt = school.LicenseExpiresAt, // Okulun lisans süresi kadar
                IsActive = true,
                CreatedAt = DateTime.UtcNow
            };

            await _context.Users.AddAsync(teacher);

            // Audit Log
            _context.AuditLogs.Add(new AuditLog
            {
                SchoolId = school.Id,
                UserId = teacher.Id,
                UserRole = UserRoles.Teacher,
                ActionType = "TEACHER_REGISTERED",
                EntityName = "User",
                EntityId = teacher.Id.ToString(),
                DetailsJson = $"{teacher.FullName} ({teacher.Username}) okula bağlandı.",
                Timestamp = DateTime.UtcNow
            });

            await _context.SaveChangesAsync();

            var token = _tokenService.GenerateToken(teacher, school.Code);

            return Ok(new LoginResponse
            {
                Token = token,
                UserId = teacher.Id,
                Username = teacher.Username,
                FullName = teacher.FullName,
                Role = teacher.Role,
                SchoolId = school.Id,
                SchoolCode = school.Code,
                SchoolName = school.Name,
                GeminiApiKey = school.GeminiApiKey,
                LicenseExpiresAt = teacher.LicenseExpiresAt
            });
        }

        [Authorize]
        [HttpPost("change-password")]
        public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordRequest request)
        {
            var userIdStr = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (!Guid.TryParse(userIdStr, out var userId)) return Unauthorized();

            var user = await _context.Users.FindAsync(userId);
            if (user == null) return NotFound();

            if (!BCrypt.Net.BCrypt.Verify(request.OldPassword, user.PasswordHash))
            {
                return BadRequest(new { message = "Mevcut şifreniz hatalı." });
            }

            user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.NewPassword);
            await _context.SaveChangesAsync();

            return Ok(new { message = "Şifreniz başarıyla güncellendi." });
        }
    }
}
