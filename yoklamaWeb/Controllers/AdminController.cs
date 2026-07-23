using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Rendering;
using Microsoft.EntityFrameworkCore;
using yoklamaWeb.Data;
using yoklamaWeb.Models;

namespace yoklamaWeb.Controllers
{
    [Authorize(Roles = "Admin")]
    public class AdminController : Controller
    {
        private readonly AppDbContext _context;
        private readonly UserManager<IdentityUser> _userManager;
        private readonly RoleManager<IdentityRole> _roleManager;

        public AdminController(AppDbContext context, UserManager<IdentityUser> userManager, RoleManager<IdentityRole> roleManager)
        {
            _context = context;
            _userManager = userManager;
            _roleManager = roleManager;
        }

        public async Task<IActionResult> Index()
        {
            var proctorUserIds = await _context.TemporaryProctors.Select(pa => pa.UserId).ToListAsync();
            var users = await _userManager.Users
                .Where(u => !proctorUserIds.Contains(u.Id))
                .OrderBy(u => u.UserName)
                .ToListAsync();

            var model = new List<AdminUserListItemModel>();

            foreach (var user in users)
            {
                var roles = await _userManager.GetRolesAsync(user);
                model.Add(new AdminUserListItemModel
                {
                    Id = user.Id,
                    UserName = user.UserName ?? string.Empty,
                    Role = roles.FirstOrDefault() ?? "-"
                });
            }

            return View(model);
        }

        public async Task<IActionResult> CreateUser()
        {
            var model = new AdminUserCreateModel
            {
                Roles = await GetRoleSelectListAsync()
            };
            return View(model);
        }

        [HttpPost]
        public async Task<IActionResult> CreateUser(AdminUserCreateModel model)
        {
            if (!ModelState.IsValid)
            {
                model.Roles = await GetRoleSelectListAsync();
                return View(model);
            }

            var user = new IdentityUser { UserName = model.UserName };
            var result = await _userManager.CreateAsync(user, model.Password);
            if (!result.Succeeded)
            {
                AddErrors(result);
                model.Roles = await GetRoleSelectListAsync();
                return View(model);
            }

            if (!await _roleManager.RoleExistsAsync(model.Role))
            {
                ModelState.AddModelError("Role", "Seçilen rol bulunamadı.");
                model.Roles = await GetRoleSelectListAsync();
                return View(model);
            }

            await _userManager.AddToRoleAsync(user, model.Role);
            return RedirectToAction(nameof(Index));
        }

        public async Task<IActionResult> EditUser(string id)
        {
            if (string.IsNullOrEmpty(id))
            {
                return NotFound();
            }

            var user = await _userManager.FindByIdAsync(id);
            if (user == null)
            {
                return NotFound();
            }

            var roles = await _userManager.GetRolesAsync(user);
            var model = new AdminUserEditModel
            {
                Id = user.Id,
                UserName = user.UserName ?? string.Empty,
                Role = roles.FirstOrDefault() ?? string.Empty,
                Roles = await GetRoleSelectListAsync()
            };

            return View(model);
        }

        [HttpPost]
        public async Task<IActionResult> EditUser(AdminUserEditModel model)
        {
            if (!ModelState.IsValid)
            {
                model.Roles = await GetRoleSelectListAsync();
                return View(model);
            }

            var user = await _userManager.FindByIdAsync(model.Id);
            if (user == null)
            {
                return NotFound();
            }

            user.UserName = model.UserName;
            var updateResult = await _userManager.UpdateAsync(user);
            if (!updateResult.Succeeded)
            {
                AddErrors(updateResult);
                model.Roles = await GetRoleSelectListAsync();
                return View(model);
            }

            if (!string.IsNullOrEmpty(model.NewPassword))
            {
                var token = await _userManager.GeneratePasswordResetTokenAsync(user);
                var passwordResult = await _userManager.ResetPasswordAsync(user, token, model.NewPassword);
                if (!passwordResult.Succeeded)
                {
                    AddErrors(passwordResult);
                    model.Roles = await GetRoleSelectListAsync();
                    return View(model);
                }
            }

            var currentRoles = await _userManager.GetRolesAsync(user);
            if (!currentRoles.Contains(model.Role))
            {
                var removeResult = await _userManager.RemoveFromRolesAsync(user, currentRoles);
                if (!removeResult.Succeeded)
                {
                    AddErrors(removeResult);
                    model.Roles = await GetRoleSelectListAsync();
                    return View(model);
                }

                var addRoleResult = await _userManager.AddToRoleAsync(user, model.Role);
                if (!addRoleResult.Succeeded)
                {
                    AddErrors(addRoleResult);
                    model.Roles = await GetRoleSelectListAsync();
                    return View(model);
                }
            }

            return RedirectToAction(nameof(Index));
        }

        [HttpPost]
        public async Task<IActionResult> DeleteUser(string id)
        {
            if (string.IsNullOrEmpty(id))
            {
                return NotFound();
            }

            var user = await _userManager.FindByIdAsync(id);
            if (user == null)
            {
                return NotFound();
            }

            if (user.Id == _userManager.GetUserId(User))
            {
                TempData["AdminError"] = "Kendi hesabınızı silemezsiniz.";
                return RedirectToAction(nameof(Index));
            }

            var result = await _userManager.DeleteAsync(user);
            if (!result.Succeeded)
            {
                TempData["AdminError"] = "Kullanıcı silinemedi.";
            }

            return RedirectToAction(nameof(Index));
        }

        private async Task<List<SelectListItem>> GetRoleSelectListAsync()
        {
            return await _roleManager.Roles
                .OrderBy(r => r.Name)
                .Select(r => new SelectListItem(r.Name!, r.Name!))
                .ToListAsync();
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
