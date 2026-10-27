using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using System.Linq;
using System.Threading.Tasks;
using yoklamaWeb.Data;
using yoklamaWeb.Models;

namespace yoklamaWeb.Controllers
{
    public class AccountController : Controller
    {
        private readonly AppDbContext _context;
        private readonly SignInManager<IdentityUser> _signInManager;
        private readonly UserManager<IdentityUser> _userManager;
        private readonly RoleManager<IdentityRole> _roleManager;

        public AccountController(AppDbContext context, SignInManager<IdentityUser> signInManager, UserManager<IdentityUser> userManager, RoleManager<IdentityRole> roleManager)
        {
            _context = context;
            _signInManager = signInManager;
            _userManager = userManager;
            _roleManager = roleManager;
        }

        [HttpGet]
        public IActionResult Login()
        {
            return RedirectToAction("Index", "Home");
        }

        [HttpPost]
        public async Task<IActionResult> Login(string username, string password, string role)
        {
            if (string.IsNullOrWhiteSpace(username) || string.IsNullOrWhiteSpace(password) || string.IsNullOrWhiteSpace(role))
            {
                TempData["ErrorMessage"] = "Kullanıcı adı, şifre ve rol seçimi gereklidir.";
                return RedirectToAction("Index", "Home");
            }

            var normalizedRole = role.Trim();
            var allowedRoles = new[] { "Admin", "Yoklamaci", "SuperYoklamaci", "PansiyonGorevlisi", "Idareci", "SinavYoneticisi", "gunlukYoklamaci" };
            if (!allowedRoles.Contains(normalizedRole))
            {
                TempData["ErrorMessage"] = "Geçersiz rol seçildi.";
                return RedirectToAction("Index", "Home");
            }

            string clientIp = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "Bilinmiyor";

            var result = await _signInManager.PasswordSignInAsync(username, password, false, lockoutOnFailure: false);
            if (!result.Succeeded)
            {
                if (await ValidateLegacyCredentialsAsync(username, password, normalizedRole))
                {
                    var identityUser = await _userManager.FindByNameAsync(username);
                    if (identityUser == null)
                    {
                        identityUser = new IdentityUser { UserName = username };
                        var createResult = await _userManager.CreateAsync(identityUser, password);
                        if (!createResult.Succeeded)
                        {
                            await LogLoginAttemptAsync(username, normalizedRole, clientIp, false, "Kullanıcı oluşturulamadı: " + string.Join(" ", createResult.Errors.Select(e => e.Description)));
                            TempData["ErrorMessage"] = string.Join(" ", createResult.Errors.Select(e => e.Description));
                            return RedirectToAction("Index", "Home");
                        }
                    }

                    if (!await _roleManager.RoleExistsAsync(normalizedRole))
                    {
                        await _roleManager.CreateAsync(new IdentityRole(normalizedRole));
                    }

                    if (!await _userManager.IsInRoleAsync(identityUser, normalizedRole))
                    {
                        await _userManager.AddToRoleAsync(identityUser, normalizedRole);
                    }

                    if (!(await _signInManager.CheckPasswordSignInAsync(identityUser, password, false)).Succeeded)
                    {
                        var resetToken = await _userManager.GeneratePasswordResetTokenAsync(identityUser);
                        var resetResult = await _userManager.ResetPasswordAsync(identityUser, resetToken, password);
                        if (!resetResult.Succeeded)
                        {
                            await LogLoginAttemptAsync(username, normalizedRole, clientIp, false, "Şifre sıfırlama hatası: " + string.Join(" ", resetResult.Errors.Select(e => e.Description)));
                            TempData["ErrorMessage"] = string.Join(" ", resetResult.Errors.Select(e => e.Description));
                            return RedirectToAction("Index", "Home");
                        }
                    }

                    result = await _signInManager.PasswordSignInAsync(username, password, false, lockoutOnFailure: false);
                }
            }

            if (result.Succeeded)
            {
                var user = await _userManager.FindByNameAsync(username);
                var roles = user != null ? await _userManager.GetRolesAsync(user) : new List<string>();
                if (!roles.Contains(normalizedRole))
                {
                    await _signInManager.SignOutAsync();
                    await LogLoginAttemptAsync(username, normalizedRole, clientIp, false, $"Rol Uyuşmazlığı (Kullanıcının rolleri: {string.Join(",", roles)})");
                    TempData["ErrorMessage"] = "Seçilen role uygun giriş yapılamadı.";
                    return RedirectToAction("Index", "Home");
                }

                await LogLoginAttemptAsync(username, normalizedRole, clientIp, true, "Giriş Başarılı");

                return normalizedRole switch
                {
                    "Admin" => RedirectToAction("Index", "Exam"),
                    "Idareci" => RedirectToAction("Index", "Exam"),
                    "SinavYoneticisi" => RedirectToAction("Index", "Exam"),
                    "Yoklamaci" => RedirectToAction("Index", "Yoklamaci"),
                    "SuperYoklamaci" => RedirectToAction("Index", "SuperYoklamaci"),
                    "PansiyonGorevlisi" => RedirectToAction("GunlukYoklama", "Yoklama"),
                    "gunlukYoklamaci" => RedirectToAction("DailyAttendance", "ClassAttendance"),
                    _ => RedirectToAction("Index", "Home"),
                };
            }

            await LogLoginAttemptAsync(username, normalizedRole, clientIp, false, "Hatalı Kullanıcı Adı veya Şifre");
            TempData["ErrorMessage"] = "Kullanıcı adı veya şifre hatalı.";
            return RedirectToAction("Index", "Home");
        }

        [HttpGet]
        [HttpPost]
        public async Task<IActionResult> Logout()
        {
            var username = User.Identity?.Name ?? "Bilinmiyor";
            string clientIp = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "Bilinmiyor";
            await LogLoginAttemptAsync(username, "-", clientIp, true, "Çıkış Yapıldı");

            await _signInManager.SignOutAsync();
            return RedirectToAction("Index", "Home");
        }

        private async Task LogLoginAttemptAsync(string username, string role, string ip, bool isSuccess, string message)
        {
            try
            {
                var log = new SystemLog
                {
                    KullaniciAdi = string.IsNullOrWhiteSpace(username) ? "Bilinmiyor" : username,
                    Rol = string.IsNullOrWhiteSpace(role) ? "-" : role,
                    ControllerName = "Account",
                    ActionName = isSuccess ? "LoginSuccess" : "LoginFailed",
                    Metot = "POST",
                    Parametreler = $"Sonuç: {(isSuccess ? "Başarılı" : "BAŞARISIZ")} - Detay: {message}",
                    IpAdresi = ip,
                    Tarih = DateTime.Now
                };
                _context.SystemLogs.Add(log);
                await _context.SaveChangesAsync();
            }
            catch
            {
                // Logging errors should not block authentication flow
            }
        }

        private async Task<bool> ValidateLegacyCredentialsAsync(string username, string password, string role)
        {
            return role switch
            {
                "Admin" => await _context.Adminler.AnyAsync(x => x.KullaniciAdi == username && x.Sifre == password),
                "Yoklamaci" => await _context.Yoklamacilar.AnyAsync(x => x.KullaniciAdi == username && x.Sifre == password),
                "SuperYoklamaci" => await _context.SuperYoklamacilar.AnyAsync(x => x.KullaniciAdi == username && x.Sifre == password),
                "gunlukYoklamaci" => await _context.GunlukYoklamacilar.AnyAsync(x => x.KullaniciAdi == username && x.Sifre == password),
                _ => false,
            };
        }

        private void AddErrors(IdentityResult result)
        {
            foreach (var error in result.Errors)
            {
                ModelState.AddModelError(string.Empty, error.Description);
            }
        }
        [Authorize]
        [HttpGet]
        public IActionResult ChangePassword()
        {
            return View();
        }

        [Authorize]
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> ChangePassword(ChangePasswordViewModel model)
        {
            if (!ModelState.IsValid)
            {
                return View(model);
            }

            var user = await _userManager.GetUserAsync(User);
            if (user == null)
            {
                return Challenge();
            }

            var result = await _userManager.ChangePasswordAsync(user, model.CurrentPassword, model.NewPassword);
            if (!result.Succeeded)
            {
                foreach (var error in result.Errors)
                {
                    ModelState.AddModelError(string.Empty, error.Description);
                }
                return View(model);
            }

            // Sync with legacy plain text passwords if any
            var username = user.UserName;
            if (!string.IsNullOrEmpty(username))
            {
                var admin = await _context.Adminler.FirstOrDefaultAsync(x => x.KullaniciAdi == username);
                if (admin != null) admin.Sifre = model.NewPassword;

                var yoklamaci = await _context.Yoklamacilar.FirstOrDefaultAsync(x => x.KullaniciAdi == username);
                if (yoklamaci != null) yoklamaci.Sifre = model.NewPassword;

                var superYoklamaci = await _context.SuperYoklamacilar.FirstOrDefaultAsync(x => x.KullaniciAdi == username);
                if (superYoklamaci != null) superYoklamaci.Sifre = model.NewPassword;

                var gunlukYoklamaci = await _context.GunlukYoklamacilar.FirstOrDefaultAsync(x => x.KullaniciAdi == username);
                if (gunlukYoklamaci != null) gunlukYoklamaci.Sifre = model.NewPassword;

                await _context.SaveChangesAsync();
            }

            await _signInManager.RefreshSignInAsync(user);
            TempData["SuccessMessage"] = "Şifreniz başarıyla değiştirildi.";
            return RedirectToAction("Index", "Home");
        }
    }
}
