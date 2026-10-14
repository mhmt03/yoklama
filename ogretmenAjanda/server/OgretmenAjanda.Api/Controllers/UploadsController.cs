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
    }
}
