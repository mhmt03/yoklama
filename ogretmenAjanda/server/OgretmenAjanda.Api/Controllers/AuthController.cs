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

        [AllowAnonymous]
        [HttpGet("lookup-institution/{code}")]
        public async Task<IActionResult> LookupInstitution(string code)
        {
            var clean = (code ?? string.Empty).Trim().ToLower();
            if (string.IsNullOrEmpty(clean))
            {
                return BadRequest(new { success = false, message = "Lütfen bir kurum kodu veya adı giriniz." });
            }

            var inst = await _context.Institutions
                .FirstOrDefaultAsync(i => i.Code.ToLower() == clean || i.Name.ToLower() == clean ||
                                         (clean == "mg-egitim" && (i.Code.ToLower() == "zafer-egitim" || i.Code == "MST-10001")) ||
                                         (clean == "zafer-egitim" && i.Code.ToLower() == "mg-egitim"));

            if (inst == null)
            {
                // Fallback: Belki CustomerId olarak okullarda kayıtlıdır
                var schoolMatch = await _context.Schools
                    .FirstOrDefaultAsync(s => s.CustomerId != null && s.CustomerId.ToLower() == clean);
                if (schoolMatch != null)
                {
                    return Ok(new
                    {
                        success = true,
                        data = new
                        {
                            code = schoolMatch.CustomerId,
                            name = schoolMatch.Name,
                            maxSchoolCount = 2,
                            isActive = schoolMatch.IsActive,
                            isExpired = schoolMatch.LicenseExpiresAt.HasValue && schoolMatch.LicenseExpiresAt.Value < DateTime.UtcNow
                        }
                    });
                }

                return NotFound(new { success = false, message = "Belirtilen ada veya koda sahip bir kurum bulunamadı. Lütfen kontrol ediniz." });
            }

            var isExpired = inst.LicenseExpiresAt.HasValue && inst.LicenseExpiresAt.Value < DateTime.UtcNow;

            return Ok(new
            {
                success = true,
                data = new
                {
                    code = inst.Code,
                    name = inst.Name,
                    maxSchoolCount = inst.MaxSchoolCount,
                    isActive = inst.IsActive,
                    isExpired
                }
            });
        }

        [HttpPost("login")]
        public async Task<IActionResult> Login([FromBody] LoginRequest request)
        {
            var cleanUsername = request.Username.Trim().ToLower();
            var cleanInst = request.InstitutionCode?.Trim().ToLower();

            User? user = null;

            if (!string.IsNullOrEmpty(cleanInst))
            {
                var validCodes = new HashSet<string> { cleanInst };
                if (cleanInst == "mg-egitim" || cleanInst == "mg-eğitim kurumu")
                {
                    validCodes.Add("zafer-egitim");
                    validCodes.Add("mst-10001");
                    validCodes.Add("mg-egitim");
                }
                else if (cleanInst == "zafer-egitim")
                {
                    validCodes.Add("mg-egitim");
                }

                // Kurum Kodu ile eşleşen kullanıcı (SuperAdmin hariç kullanıcı adı çakışmalarını önler)
                user = await _context.Users.FirstOrDefaultAsync(u =>
                    u.Username.ToLower() == cleanUsername &&
                    (u.Role == UserRoles.SuperAdmin ||
                     (u.CustomerId != null && validCodes.Contains(u.CustomerId.ToLower())) ||
                     (u.RelationId != null && validCodes.Contains(u.RelationId.ToLower()))));

                if (user == null)
                {
                    // Okulun CustomerId'si üzerinden kontrol
                    var matchingSchoolIds = await _context.Schools
                        .Where(s => s.CustomerId != null && validCodes.Contains(s.CustomerId.ToLower()))
                        .Select(s => s.Id)
                        .ToListAsync();

                    user = await _context.Users.FirstOrDefaultAsync(u =>
                        u.Username.ToLower() == cleanUsername &&
                        ((u.SchoolId.HasValue && matchingSchoolIds.Contains(u.SchoolId.Value)) || u.Role == UserRoles.SuperAdmin));
                }
            }
            else
            {
                user = await _context.Users.FirstOrDefaultAsync(u => u.Username.ToLower() == cleanUsername);
            }

            if (user == null || !BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash))
            {
                return Unauthorized(new { message = "Kullanıcı adı veya şifre hatalı." });
            }

            if (!user.IsActive)
            {
                return StatusCode(403, new { message = "Hesabınız askıya alınmıştır. Lütfen yöneticinizle görüşün." });
            }

            School? school = null;
            if (user.SchoolId.HasValue)
            {
                school = await _context.Schools.FindAsync(user.SchoolId.Value);
            }

            // Hiyerarşik Lisans Kontrolü (İlişki ID -> Müşteri ID -> Admin Lisans Bitişi)
            if (user.Role != UserRoles.SuperAdmin)
            {
                if (user.Role == UserRoles.SchoolAdmin)
                {
                    // Okul Admini doğrudan lisans sahibidir (Müşteri)
                    if (user.LicenseExpiresAt.HasValue && user.LicenseExpiresAt.Value < DateTime.UtcNow)
                    {
                        return StatusCode(402, new { message = $"Müşteri hesabınızın (Müşteri No: {user.CustomerId ?? user.Username}) lisans süresi dolmuştur. Lütfen sistem yöneticisi ile iletişime geçiniz." });
                    }
                }
                else if (user.Role == UserRoles.Teacher || user.Role == UserRoles.Staff)
                {
                    // Öğretmen: İlişki ID -> Müşteri Admin
                    var relId = user.RelationId ?? school?.RelationId;
                    if (!string.IsNullOrEmpty(relId))
                    {
                        var adminCustomer = await _context.Users
                            .FirstOrDefaultAsync(u => u.Role == UserRoles.SchoolAdmin && u.RelationId == relId);

                        if (adminCustomer != null)
                        {
                            if (!adminCustomer.IsActive)
                            {
                                return StatusCode(403, new { message = $"Bağlı olduğunuz kurumun (Müşteri No: {adminCustomer.CustomerId}) hesabı askıya alınmıştır." });
                            }
                            if (adminCustomer.LicenseExpiresAt.HasValue && adminCustomer.LicenseExpiresAt.Value < DateTime.UtcNow)
                            {
                                return StatusCode(402, new { message = $"Bağlı olduğunuz kurumun (Müşteri No: {adminCustomer.CustomerId}) lisans süresi dolmuştur. Lütfen okul yöneticiniz ile iletişime geçiniz." });
                            }
                        }
                    }
                    else if (user.LicenseExpiresAt.HasValue && user.LicenseExpiresAt.Value < DateTime.UtcNow)
                    {
                        // Bireysel Öğretmen
                        return StatusCode(402, new { message = "Bireysel lisans süreniz dolmuştur. Lütfen yenileyiniz." });
                    }
                }
            }

            user.LastLoginAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();

            var token = _tokenService.GenerateToken(user, school?.Code);

            // Bağlı olduğu admin/kuruma ait tüm okulları bul (Admin birden fazla okul yönetiyorsa hepsi döner)
            var adminUserId = school?.AdminUserId ?? (user.Role == UserRoles.SchoolAdmin ? user.Id : (Guid?)null);
            var customerId = user.CustomerId ?? school?.CustomerId;
            var relationId = user.RelationId ?? school?.RelationId;

            List<SchoolDto> affiliatedSchools;
            if (user.Role == UserRoles.Teacher || user.Role == UserRoles.Staff)
            {
                // Öğretmen yalnızca kayıtlı olduğu okulu/okulları görebilir
                var teacherSchoolIds = new List<Guid>();
                if (user.SchoolId.HasValue) teacherSchoolIds.Add(user.SchoolId.Value);
                if (school != null && !teacherSchoolIds.Contains(school.Id)) teacherSchoolIds.Add(school.Id);

                affiliatedSchools = await _context.Schools
                    .Where(s => s.IsActive && teacherSchoolIds.Contains(s.Id))
                    .Select(s => new SchoolDto
                    {
                        Id = s.Id,
                        Name = s.Name,
                        Code = s.Code,
                        Address = s.Address,
                        Phone = s.Phone,
                        GeminiApiKey = s.GeminiApiKey,
                        GeminiModel = s.GeminiModel
                    })
                    .ToListAsync();
            }
            else
            {
                // Admin veya Süperadmin: Kuruma bağlı tüm okullar
                affiliatedSchools = await _context.Schools
                    .Where(s => s.IsActive && (
                        (adminUserId.HasValue && s.AdminUserId == adminUserId.Value) ||
                        (!string.IsNullOrEmpty(customerId) && s.CustomerId == customerId) ||
                        (!string.IsNullOrEmpty(relationId) && s.RelationId == relationId) ||
                        (school != null && s.Id == school.Id)
                    ))
                    .Select(s => new SchoolDto
                    {
                        Id = s.Id,
                        Name = s.Name,
                        Code = s.Code,
                        Address = s.Address,
                        Phone = s.Phone,
                        GeminiApiKey = s.GeminiApiKey,
                        GeminiModel = s.GeminiModel
                    })
                    .ToListAsync();
            }

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
                CustomerId = user.CustomerId ?? school?.CustomerId,
                RelationId = user.RelationId ?? school?.RelationId,
                GeminiApiKey = school?.GeminiApiKey,
                LicenseExpiresAt = user.LicenseExpiresAt ?? school?.LicenseExpiresAt,
                AffiliatedSchools = affiliatedSchools
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

            var cleanInput = request.StudentNumber.Trim();
            var cleanPhone = cleanInput.Replace(" ", "").Replace("-", "").Replace("(", "").Replace(")", "");

            var student = await _context.Students
                .FirstOrDefaultAsync(s => s.SchoolId == school.Id && 
                    (s.StudentNumber == cleanInput || 
                     (!string.IsNullOrEmpty(s.ParentPhone) && s.ParentPhone.Replace(" ", "").Replace("-", "").Replace("(", "").Replace(")", "") == cleanPhone)));

            if (student == null)
            {
                return NotFound(new { message = "Bu okulda belirtilen öğrenci numarası veya veli telefon numarası bulunamadı." });
            }

            // Lisans Kontrolü: Öğrenci İlişki ID -> Müşteri ID -> Admin Lisansı
            var studentRelationId = student.RelationId ?? school.RelationId;
            if (!string.IsNullOrEmpty(studentRelationId))
            {
                var adminCustomer = await _context.Users
                    .FirstOrDefaultAsync(u => u.Role == UserRoles.SchoolAdmin && u.RelationId == studentRelationId);

                if (adminCustomer != null)
                {
                    if (!adminCustomer.IsActive)
                    {
                        return StatusCode(403, new { message = $"Okulunuzun (Müşteri No: {adminCustomer.CustomerId}) sistemi şu anda aktif değildir." });
                    }
                    if (adminCustomer.LicenseExpiresAt.HasValue && adminCustomer.LicenseExpiresAt.Value < DateTime.UtcNow)
                    {
                        return StatusCode(402, new { message = $"Okulunuzun (Müşteri No: {adminCustomer.CustomerId}) lisans süresi dolmuştur. Lütfen okul idaresine başvurunuz." });
                    }
                }
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
                    RelationId = studentRelationId,
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
                SchoolName = school.Name,
                CustomerId = school.CustomerId,
                RelationId = studentRelationId
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
                RelationId = school.RelationId,
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
                Role = UserRoles.Teacher,
                SchoolId = school.Id,
                SchoolCode = school.Code,
                SchoolName = school.Name,
                CustomerId = school.CustomerId,
                RelationId = school.RelationId,
                GeminiApiKey = school.GeminiApiKey,
                LicenseExpiresAt = school.LicenseExpiresAt
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

        [Authorize]
        [HttpPost("update-credentials")]
        public async Task<IActionResult> UpdateCredentials([FromBody] UpdateCredentialsRequest request)
        {
            var userIdStr = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (!Guid.TryParse(userIdStr, out var userId)) return Unauthorized();

            var user = await _context.Users.FindAsync(userId);
            if (user == null) return NotFound(new { message = "Kullanıcı bulunamadı." });

            // Kullanıcı adı güncelleme
            if (!string.IsNullOrWhiteSpace(request.NewUsername))
            {
                var newUsername = request.NewUsername.Trim();
                if (!string.Equals(user.Username, newUsername, StringComparison.OrdinalIgnoreCase))
                {
                    var exists = await _context.Users.AnyAsync(u => u.Id != userId && u.Username.ToLower() == newUsername.ToLower());
                    if (exists)
                    {
                        return BadRequest(new { message = $"'{newUsername}' kullanıcı adı zaten başka bir kullanıcı tarafından kullanılıyor." });
                    }
                    user.Username = newUsername;
                }
            }

            // Şifre güncelleme
            if (!string.IsNullOrEmpty(request.NewPassword))
            {
                if (string.IsNullOrEmpty(request.OldPassword))
                {
                    return BadRequest(new { message = "Şifrenizi değiştirmek için mevcut şifrenizi girmelisiniz." });
                }

                if (!BCrypt.Net.BCrypt.Verify(request.OldPassword, user.PasswordHash))
                {
                    return BadRequest(new { message = "Mevcut şifreniz hatalı." });
                }

                user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.NewPassword);
            }

            await _context.SaveChangesAsync();
            return Ok(new
            {
                message = "Bilgileriniz başarıyla güncellendi.",
                username = user.Username
            });
        }
    }
}
