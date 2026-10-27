using Microsoft.AspNetCore.Mvc;
using System.IO;
using System.Threading.Tasks;

namespace OgretmenAjanda.Api.Controllers
{
    [ApiController]
    [Route("api")]
    public class VersionController : ControllerBase
    {
        private readonly string _wwwRoot;
        public VersionController(IWebHostEnvironment env)
        {
            _wwwRoot = Path.Combine(env.ContentRootPath, "wwwroot");
        }

        // GET /api/version – returns plain‑text version (e.g., "1.0.3")
        [HttpGet("version")]
        public async Task<IActionResult> GetVersion()
        {
            var file = Path.Combine(_wwwRoot, "version.txt");
            if (!System.IO.File.Exists(file))
                return NotFound("version.txt not found");
            var txt = await System.IO.File.ReadAllTextAsync(file);
            return Content(txt.Trim(), "text/plain");
        }

        // GET /api/apk – streams the latest APK file or redirects to static APK
        [HttpGet("apk")]
        public IActionResult GetApk()
        {
            var candidates = new[] {
                Path.Combine(_wwwRoot, "ogretmenajanda.apk"),
                Path.Combine(_wwwRoot, "app-release.apk"),
                Path.Combine(Directory.GetCurrentDirectory(), "wwwroot", "ogretmenajanda.apk"),
                Path.Combine(Directory.GetCurrentDirectory(), "ogretmenajanda.apk"),
                Path.Combine(Directory.GetCurrentDirectory(), "app-release.apk")
            };
            foreach (var path in candidates)
            {
                if (System.IO.File.Exists(path))
                {
                    var stream = System.IO.File.OpenRead(path);
                    return File(stream, "application/vnd.android.package-archive", "OgretmenAjanda.apk");
                }
            }
            return Redirect("/ogretmenajanda.apk");
        }
    }
}
