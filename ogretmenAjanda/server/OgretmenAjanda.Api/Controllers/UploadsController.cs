using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
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
    public class UploadsController : ControllerBase
    {
        private readonly IWebHostEnvironment _env;
        private readonly AppDbContext _context;
        private readonly IAuditLogService _auditLogService;

        public UploadsController(IWebHostEnvironment env, AppDbContext context, IAuditLogService auditLogService)
        {
            _env = env;
            _context = context;
            _auditLogService = auditLogService;
        }

        private Guid CurrentUserId => Guid.Parse(User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value ?? Guid.Empty.ToString());
        private string CurrentUserRole => User.FindFirst(System.Security.Claims.ClaimTypes.Role)?.Value ?? string.Empty;
        private bool IsTeacher => string.Equals(CurrentUserRole, UserRoles.Teacher, StringComparison.OrdinalIgnoreCase);

        [HttpPost("student-photo")]
        public async Task<IActionResult> UploadStudentPhoto([FromForm] IFormFile file, [FromForm] string schoolCode, [FromForm] string studentNumber)
        {
            if (IsTeacher)
            {
                return StatusCode(StatusCodes.Status403Forbidden, new { message = "Okula bağlı öğretmenler öğrenci fotoğrafı yükleme yetkisine sahip değildir. Bu işlem yalnızca okul idaresi tarafından yapılabilir." });
            }

            if (file == null || file.Length == 0)
            {
                return BadRequest(new { message = "Geçersiz dosya." });
            }

            // Dosya uzantısı kontrolü
            var ext = Path.GetExtension(file.FileName).ToLower();
            if (ext != ".jpg" && ext != ".jpeg" && ext != ".png" && ext != ".webp")
            {
                return BadRequest(new { message = "Sadece JPG, PNG veya WebP görsel formatları desteklenir." });
            }

            // Boyut kontrolü (Maksimum 500 KB - mobilde zaten 20-30 KB'a sıkıştırılmış olacak)
            if (file.Length > 512 * 1024)
            {
                return BadRequest(new { message = "Görsel boyutu 500 KB'den büyük olamaz. Lütfen sıkıştırılmış görsel yükleyin." });
            }

            var webRoot = _env.WebRootPath ?? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");
            var cleanSchoolCode = string.Join("_", schoolCode.Split(Path.GetInvalidFileNameChars())).ToUpper();
            var targetDir = Path.Combine(webRoot, "uploads", "schools", cleanSchoolCode, "students");

            if (!Directory.Exists(targetDir))
            {
                Directory.CreateDirectory(targetDir);
            }

            var fileName = $"{studentNumber}_{Guid.NewGuid().ToString("N").Substring(0, 6)}{ext}";
            var fullPath = Path.Combine(targetDir, fileName);

            using (var stream = new FileStream(fullPath, FileMode.Create))
            {
                await file.CopyToAsync(stream);
            }

            var relativePath = $"/uploads/schools/{cleanSchoolCode}/students/{fileName}";
            return Ok(new { photoPath = relativePath });
        }

        [HttpPost("student-photo-base64")]
        public async Task<IActionResult> UploadStudentPhotoBase64([FromBody] Base64PhotoUploadRequest request)
        {
            if (IsTeacher)
            {
                return StatusCode(StatusCodes.Status403Forbidden, new { message = "Okula bağlı öğretmenler öğrenci fotoğrafı yükleme yetkisine sahip değildir. Bu işlem yalnızca okul idaresi tarafından yapılabilir." });
            }

            if (string.IsNullOrWhiteSpace(request.Base64Data))
            {
                return BadRequest(new { message = "Görsel verisi boş." });
            }

            try
            {
                var cleanBase64 = request.Base64Data;
                var ext = ".jpg";
                if (cleanBase64.Contains(","))
                {
                    var prefix = cleanBase64.Substring(0, cleanBase64.IndexOf(","));
                    if (prefix.Contains("png")) ext = ".png";
                    else if (prefix.Contains("webp")) ext = ".webp";
                    cleanBase64 = cleanBase64.Substring(cleanBase64.IndexOf(",") + 1);
                }

                var bytes = Convert.FromBase64String(cleanBase64);
                if (bytes.Length > 800 * 1024)
                {
                    return BadRequest(new { message = "Görsel boyutu 800 KB'den büyük olamaz." });
                }

                var webRoot = _env.WebRootPath ?? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");
                var cleanSchoolCode = string.Join("_", (request.SchoolCode ?? "OKL").Split(Path.GetInvalidFileNameChars())).ToUpper();
                var targetDir = Path.Combine(webRoot, "uploads", "schools", cleanSchoolCode, "students");

                if (!Directory.Exists(targetDir))
                {
                    Directory.CreateDirectory(targetDir);
                }

                var fileName = $"{request.StudentNumber}_{Guid.NewGuid().ToString("N").Substring(0, 6)}{ext}";
                var fullPath = Path.Combine(targetDir, fileName);

                await System.IO.File.WriteAllBytesAsync(fullPath, bytes);

                var relativePath = $"/uploads/schools/{cleanSchoolCode}/students/{fileName}";
                return Ok(new { photoPath = relativePath });
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = "Görsel yüklenemedi: " + ex.Message });
            }
        }

        [HttpPost("batch-student-photos")]
        public async Task<IActionResult> BatchUploadStudentPhotos([FromBody] BatchStudentPhotoUploadRequest request, [FromQuery] Guid? schoolId)
        {
            if (IsTeacher)
            {
                return StatusCode(StatusCodes.Status403Forbidden, new { message = "Okula bağlı öğretmenler öğrenci fotoğrafı yükleme yetkisine sahip değildir. Bu işlem yalnızca okul idaresi tarafından yapılabilir." });
            }

            if (request.Photos == null || !request.Photos.Any())
            {
                return BadRequest(new { message = "Yüklenecek fotoğraf listesi boş." });
            }

            // schoolId query parametresinden veya body'den alınabilir
            var effectiveSchoolId = request.SchoolId != Guid.Empty ? request.SchoolId : (schoolId ?? Guid.Empty);
            if (effectiveSchoolId == Guid.Empty)
            {
                return BadRequest(new { message = "Okul ID belirtilmedi." });
            }

            // Okul kodunu tespit et
            var cleanSchoolCode = request.SchoolCode;
            if (string.IsNullOrWhiteSpace(cleanSchoolCode))
            {
                var school = await _context.Schools.FirstOrDefaultAsync(s => s.Id == effectiveSchoolId);
                cleanSchoolCode = school?.Code ?? "OKL";
            }
            cleanSchoolCode = string.Join("_", cleanSchoolCode.Split(Path.GetInvalidFileNameChars())).ToUpper();

            var webRoot = _env.WebRootPath ?? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");
            var targetDir = Path.Combine(webRoot, "uploads", "schools", cleanSchoolCode, "students");

            if (!Directory.Exists(targetDir))
            {
                Directory.CreateDirectory(targetDir);
            }

            int successCount = 0;
            int failedCount = 0;

            foreach (var item in request.Photos)
            {
                try
                {
                    // Hem Base64Data hem PhotoBase64 kabul et
                    var rawBase64 = !string.IsNullOrWhiteSpace(item.Base64Data) ? item.Base64Data : item.PhotoBase64;
                    if (string.IsNullOrWhiteSpace(item.StudentNumber) || string.IsNullOrWhiteSpace(rawBase64))
                    {
                        failedCount++;
                        continue;
                    }

                    var cleanBase64 = rawBase64;
                    var ext = ".jpg";
                    if (cleanBase64.Contains(","))
                    {
                        var prefix = cleanBase64.Substring(0, cleanBase64.IndexOf(","));
                        if (prefix.Contains("png")) ext = ".png";
                        else if (prefix.Contains("webp")) ext = ".webp";
                        cleanBase64 = cleanBase64.Substring(cleanBase64.IndexOf(",") + 1);
                    }

                    var bytes = Convert.FromBase64String(cleanBase64);
                    var fileName = $"{item.StudentNumber.Trim()}_{Guid.NewGuid().ToString("N").Substring(0, 6)}{ext}";
                    var fullPath = Path.Combine(targetDir, fileName);

                    await System.IO.File.WriteAllBytesAsync(fullPath, bytes);

                    var relativePath = $"/uploads/schools/{cleanSchoolCode}/students/{fileName}";

                    // Öğrenci kaydını güncelle
                    var student = await _context.Students
                        .FirstOrDefaultAsync(s => s.SchoolId == effectiveSchoolId && s.StudentNumber == item.StudentNumber.Trim());

                    if (student != null)
                    {
                        student.PhotoPath = relativePath;
                        student.UpdatedAt = DateTime.UtcNow;
                    }

                    successCount++;
                }
                catch
                {
                    failedCount++;
                }
            }

            await _context.SaveChangesAsync();

            if (successCount > 0 && effectiveSchoolId != Guid.Empty)
            {
                try
                {
                    var user = await _context.Users.FindAsync(CurrentUserId);
                    var clientIp = HttpContext?.Connection?.RemoteIpAddress?.ToString();
                    await _auditLogService.LogAsync(
                        _context,
                        effectiveSchoolId,
                        CurrentUserId,
                        user?.Username,
                        user?.FullName,
                        CurrentUserRole,
                        "PHOTOS_UPLOADED",
                        "Student",
                        null,
                        $"{successCount} adet öğrenci vesikalık fotoğrafı sisteme aktarıldı/güncellendi.",
                        $"{{\"successCount\": {successCount}, \"failedCount\": {failedCount}}}",
                        clientIp
                    );
                    await _context.SaveChangesAsync();
                }
                catch {}
            }

            return Ok(new
            {
                message = $"{successCount} öğrencinin fotoğrafı başarıyla yüklendi.",
                successCount,
                updatedCount = successCount,
                failedCount
            });
        }
    }

    public class Base64PhotoUploadRequest
    {
        public string SchoolCode { get; set; } = string.Empty;
        public string StudentNumber { get; set; } = string.Empty;
        public string Base64Data { get; set; } = string.Empty;
    }

    public class BatchStudentPhotoUploadRequest
    {
        public Guid SchoolId { get; set; }
        public string SchoolCode { get; set; } = string.Empty;
        public List<StudentPhotoItem> Photos { get; set; } = new();
    }

    public class StudentPhotoItem
    {
        public string StudentNumber { get; set; } = string.Empty;
        public string Base64Data { get; set; } = string.Empty;
        public string? PhotoBase64 { get; set; }
        public string? FileName { get; set; }
    }
}
