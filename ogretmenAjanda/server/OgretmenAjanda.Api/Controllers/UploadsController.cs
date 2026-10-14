using System;
using System.IO;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace OgretmenAjanda.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class UploadsController : ControllerBase
    {
        private readonly IWebHostEnvironment _env;

        public UploadsController(IWebHostEnvironment env)
        {
            _env = env;
        }

        [HttpPost("student-photo")]
        public async Task<IActionResult> UploadStudentPhoto([FromForm] IFormFile file, [FromForm] string schoolCode, [FromForm] string studentNumber)
        {
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
    }

    public class Base64PhotoUploadRequest
    {
        public string SchoolCode { get; set; } = string.Empty;
        public string StudentNumber { get; set; } = string.Empty;
        public string Base64Data { get; set; } = string.Empty;
    }
}
