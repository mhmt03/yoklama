using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using System.Linq;
using System.Threading.Tasks;
using yoklamaWeb.Data;

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
            ViewBag.SelectedRole = "Admin";
            return View();
        }

        [HttpPost]
        public async Task<IActionResult> Login(string username, string password, string role)
        {
            ViewBag.SelectedRole = string.IsNullOrEmpty(role) ? "Admin" : role;

            if (string.IsNullOrWhiteSpace(username) || string.IsNullOrWhiteSpace(password) || string.IsNullOrWhiteSpace(role))
            {
                ModelState.AddModelError(string.Empty, "Kullanıcı adı, şifre ve rol seçimi gereklidir.");
                return View();
            }

            var normalizedRole = role.Trim();
            var allowedRoles = new[] { "Admin", "Yoklamaci", "SuperYoklamaci", "PansiyonGorevlisi" };
            if (!allowedRoles.Contains(normalizedRole))
            {
                ModelState.AddModelError(string.Empty, "Geçersiz rol seçildi.");
                return View();
            }

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
                            AddErrors(createResult);
                            return View();
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
                            AddErrors(resetResult);
                            return View();
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
                    ModelState.AddModelError(string.Empty, "Seçilen role uygun giriş yapılamadı.");
                    return View();
                }

                return normalizedRole switch
                {
                    "Admin" => RedirectToAction("Index", "Exam"),
                    "Yoklamaci" => RedirectToAction("Index", "Yoklamaci"),
                    "SuperYoklamaci" => RedirectToAction("Index", "SuperYoklamaci"),
                    "PansiyonGorevlisi" => RedirectToAction("GunlukYoklama", "Yoklama"),
                    _ => RedirectToAction("Index", "Home"),
                };
            }

            ModelState.AddModelError(string.Empty, "Geçersiz giriş.");
            return View();
        }

        [HttpPost]
        public async Task<IActionResult> Logout()
        {
            await _signInManager.SignOutAsync();
            return RedirectToAction("Login", "Account");
        }

        private async Task<bool> ValidateLegacyCredentialsAsync(string username, string password, string role)
        {
            return role switch
            {
                "Admin" => await _context.Adminler.AnyAsync(x => x.KullaniciAdi == username && x.Sifre == password),
                "Yoklamaci" => await _context.Yoklamacilar.AnyAsync(x => x.KullaniciAdi == username && x.Sifre == password),
                "SuperYoklamaci" => await _context.SuperYoklamacilar.AnyAsync(x => x.KullaniciAdi == username && x.Sifre == password),
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
    }
}
