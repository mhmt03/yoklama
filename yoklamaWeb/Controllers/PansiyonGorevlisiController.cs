using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Rendering;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Identity;
using yoklamaWeb.Data;
using yoklamaWeb.Models;
using yoklamaWeb.Models.Enums;
using yoklamaWeb.ViewModels.Pansiyon;

using Microsoft.AspNetCore.Authorization;
using yoklamaWeb.Filters;

namespace yoklamaWeb.Controllers
{
    [PansiyonAdminAuthorize]
    public class PansiyonGorevlisiController : Controller
    {
        private readonly AppDbContext _context;
        private readonly UserManager<IdentityUser> _userManager;
        private readonly RoleManager<IdentityRole> _roleManager;

        public PansiyonGorevlisiController(AppDbContext context, UserManager<IdentityUser> userManager, RoleManager<IdentityRole> roleManager)
        {
            _context = context;
            _userManager = userManager;
            _roleManager = roleManager;
        }

        // GET: PansiyonGorevlisi
        public async Task<IActionResult> Index(PansiyonGorevlisiFilterViewModel filter)
        {
var query = _context.PansiyonGorevlileri
                .AsQueryable();

            if (!string.IsNullOrWhiteSpace(filter.Arama))
            {
                query = query.Where(g => g.KullaniciAdi.Contains(filter.Arama)
                    || g.AdSoyad.Contains(filter.Arama)
                    || g.Telefon.Contains(filter.Arama)
                    || g.Email.Contains(filter.Arama));
            }

if (!string.IsNullOrWhiteSpace(filter.Rol))
        {
            query = query.Where(g => g.Rol.ToString() == filter.Rol);
            }

            if (filter.SadeceAktif)
            {
                query = query.Where(g => g.Aktif);
            }

            var gorevlisiler = await query
                .OrderBy(g => g.AdSoyad)
                .ToListAsync();

            var viewModel = new PansiyonGorevlisiListViewModel
            {
                Gorevlisiler = gorevlisiler.Select(g => new PansiyonGorevlisiViewModel
                {
                    Id = g.Id,
                    KullaniciAdi = g.KullaniciAdi,
                    AdSoyad = g.AdSoyad,
                    Rol = g.Rol,
                    Telefon = g.Telefon,
                    Email = g.Email,
                    Aktif = g.Aktif,
                    KayitTarihi = g.KayitTarihi,
                    SonGirisTarihi = g.SonGirisTarihi
                }).ToList()
            };

            ViewBag.Roller = Enum.GetValues(typeof(GorevliRol))
                .Cast<GorevliRol>()
                .Select(r => new SelectListItem { Value = r.ToString(), Text = r.ToString() }).ToList();
            return View(viewModel);
        }

        // GET: PansiyonGorevlisi/Details/5
        public async Task<IActionResult> Details(int? id)
        {
            if (id == null)
            {
                return NotFound();
            }

var gorevlisi = await _context.PansiyonGorevlileri
                .Include(g => g.NobetciPlanlari)
                .Include(g => g.Yoklamalar)
                .Include(g => g.IzinGirisleri)
                .FirstOrDefaultAsync(m => m.Id == id);

            if (gorevlisi == null)
            {
                return NotFound();
            }

            var viewModel = new PansiyonGorevlisiDetailViewModel
            {
                Id = gorevlisi.Id,
                KullaniciAdi = gorevlisi.KullaniciAdi,
                AdSoyad = gorevlisi.AdSoyad,
                Rol = gorevlisi.Rol,
                Telefon = gorevlisi.Telefon,
                Email = gorevlisi.Email,
                Aktif = gorevlisi.Aktif,
                RowVersion = gorevlisi.RowVersion,
                NobetciPlanlari = gorevlisi.NobetciPlanlari
                    .OrderByDescending(n => n.BaslangicTarihi)
                    .Select(n => new NobetciPlanViewModel
                    {
                        Id = n.Id,
                        BaslangicTarihi = n.BaslangicTarihi,
                        BitisTarihi = n.BitisTarihi,
                        Gun = n.Gun,
                        Aciklama = n.Aciklama
                    }).ToList(),
                YapilanYoklamalar = gorevlisi.Yoklamalar
                    .OrderByDescending(y => y.Tarih)
                    .Take(30)
                    .Select(y => new PansiyonYoklamaListViewModel
                    {
                        Id = y.Id,
                        Tarih = y.Tarih,
                        VarMi = y.Durum == "Var",
                        Aciklama = y.Aciklama
                    }).ToList(),
                KaydedilenIzinler = gorevlisi.IzinGirisleri
                    .OrderByDescending(i => i.BaslangicTarihi)
                    .Select(i => new IzinGirisiListViewModel
                    {
                        Id = i.Id,
                        BaslangicTarihi = i.BaslangicTarihi,
                        BitisTarihi = i.BitisTarihi,
                        IzinTuru = i.Tur.ToString(),
                        Aciklama = i.Aciklama
                    }).ToList()
            };

            return View(viewModel);
        }

        // GET: PansiyonGorevlisi/Create
        public IActionResult Create()
        {
            return View(new PansiyonGorevlisiCreateViewModel());
        }

        // POST: PansiyonGorevlisi/Create
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> Create(PansiyonGorevlisiCreateViewModel viewModel)
        {
            if (ModelState.IsValid)
            {
                // Kullanıcı adı kontrolü
                if (await _context.PansiyonGorevlileri.AnyAsync(g => g.KullaniciAdi == viewModel.KullaniciAdi))
                {
                    ModelState.AddModelError("KullaniciAdi", "Bu kullanıcı adı zaten kullanılıyor.");
                    return View(viewModel);
                }

                // Email kontrolü
                if (!string.IsNullOrWhiteSpace(viewModel.Email) &&
                    await _context.PansiyonGorevlileri.AnyAsync(g => g.Email == viewModel.Email))
                {
                    ModelState.AddModelError("Email", "Bu e-posta adresi zaten kayıtlı.");
                    return View(viewModel);
                }

                // Identity kullanıcısı oluştur
                var identityUser = new IdentityUser { UserName = viewModel.KullaniciAdi, Email = viewModel.Email };
                var createResult = await _userManager.CreateAsync(identityUser, viewModel.Sifre);
                if (!createResult.Succeeded)
                {
                    foreach (var error in createResult.Errors)
                    {
                        ModelState.AddModelError(string.Empty, error.Description);
                    }
                    return View(viewModel);
                }

                // Rol kontrolü ve atama
                if (!await _roleManager.RoleExistsAsync("PansiyonGorevlisi"))
                {
                    await _roleManager.CreateAsync(new IdentityRole("PansiyonGorevlisi"));
                }
                await _userManager.AddToRoleAsync(identityUser, "PansiyonGorevlisi");

                var gorevlisi = new PansiyonGorevlisi
                {
                    KullaniciAdi = viewModel.KullaniciAdi,
                    AdSoyad = viewModel.AdSoyad,
                    Rol = viewModel.Rol,
                    Telefon = viewModel.Telefon,
                    Email = viewModel.Email,
                    Aktif = viewModel.Aktif
                };

                _context.Add(gorevlisi);
                await _context.SaveChangesAsync();
                TempData["SuccessMessage"] = "Görevli başarıyla eklendi.";
                return RedirectToAction(nameof(Index));
            }
            return View(viewModel);
        }

        // GET: PansiyonGorevlisi/Edit/5
        public async Task<IActionResult> Edit(int? id)
        {
            if (id == null)
            {
                return NotFound();
            }

            var gorevlisi = await _context.PansiyonGorevlileri.FindAsync(id);
            if (gorevlisi == null)
            {
                return NotFound();
            }

            var viewModel = new PansiyonGorevlisiDetailViewModel
            {
                Id = gorevlisi.Id,
                KullaniciAdi = gorevlisi.KullaniciAdi,
                AdSoyad = gorevlisi.AdSoyad,
                Rol = gorevlisi.Rol,
                Telefon = gorevlisi.Telefon,
                Email = gorevlisi.Email,
                Aktif = gorevlisi.Aktif,
                RowVersion = gorevlisi.RowVersion
            };

            return View(viewModel);
        }

        // POST: PansiyonGorevlisi/Edit/5
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> Edit(int id, PansiyonGorevlisiDetailViewModel viewModel)
        {
            if (id != viewModel.Id)
            {
                return NotFound();
            }

            if (ModelState.IsValid)
            {
                try
                {
                    var gorevlisi = await _context.PansiyonGorevlileri.FindAsync(id);
                    if (gorevlisi == null)
                    {
                        return NotFound();
                    }

                    // Concurrency check
                    if (!viewModel.RowVersion.SequenceEqual(gorevlisi.RowVersion))
                    {
                        ModelState.AddModelError(string.Empty, "Bu kayıt başka bir kullanıcı tarafından güncellendi. Lütfen sayfayı yenileyip tekrar deneyin.");
                        return View(viewModel);
                    }

                    // Kullanıcı adı kontrolü (kendisi hariç)
                    if (await _context.PansiyonGorevlileri.AnyAsync(g => g.KullaniciAdi == viewModel.KullaniciAdi && g.Id != id))
                    {
                        ModelState.AddModelError("KullaniciAdi", "Bu kullanıcı adı zaten kullanılıyor.");
                        return View(viewModel);
                    }

                    // Email kontrolü (kendisi hariç)
                    if (!string.IsNullOrWhiteSpace(viewModel.Email) &&
                        await _context.PansiyonGorevlileri.AnyAsync(g => g.Email == viewModel.Email && g.Id != id))
                    {
                        ModelState.AddModelError("Email", "Bu e-posta adresi zaten kayıtlı.");
                        return View(viewModel);
                    }

                    // Identity Kullanıcısını bul ve güncelle
                    var originalUsername = gorevlisi.KullaniciAdi;
                    var identityUser = await _userManager.FindByNameAsync(originalUsername);

                    if (identityUser == null)
                    {
                        // Bulunamazsa fallback olarak yeni kullanıcı oluştur
                        identityUser = new IdentityUser { UserName = viewModel.KullaniciAdi, Email = viewModel.Email };
                        var createResult = await _userManager.CreateAsync(identityUser, viewModel.Sifre ?? "1234");
                        if (!createResult.Succeeded)
                        {
                            foreach (var error in createResult.Errors)
                            {
                                ModelState.AddModelError(string.Empty, error.Description);
                            }
                            return View(viewModel);
                        }
                    }
                    else
                    {
                        // Kullanıcı adı değişikliği
                        if (viewModel.KullaniciAdi != originalUsername)
                        {
                            var setUsernameResult = await _userManager.SetUserNameAsync(identityUser, viewModel.KullaniciAdi);
                            if (!setUsernameResult.Succeeded)
                            {
                                foreach (var error in setUsernameResult.Errors)
                                {
                                    ModelState.AddModelError("KullaniciAdi", error.Description);
                                }
                                return View(viewModel);
                            }
                        }

                        // Email değişikliği
                        if (viewModel.Email != identityUser.Email)
                        {
                            identityUser.Email = viewModel.Email;
                            await _userManager.UpdateAsync(identityUser);
                        }

                        // Şifre değişikliği (şifre girilmişse)
                        if (!string.IsNullOrWhiteSpace(viewModel.Sifre))
                        {
                            var token = await _userManager.GeneratePasswordResetTokenAsync(identityUser);
                            var resetPasswordResult = await _userManager.ResetPasswordAsync(identityUser, token, viewModel.Sifre);
                            if (!resetPasswordResult.Succeeded)
                            {
                                foreach (var error in resetPasswordResult.Errors)
                                {
                                    ModelState.AddModelError("Sifre", error.Description);
                                }
                                return View(viewModel);
                            }
                        }
                    }

                    // Rol kontrolü ve atama
                    if (!await _roleManager.RoleExistsAsync("PansiyonGorevlisi"))
                    {
                        await _roleManager.CreateAsync(new IdentityRole("PansiyonGorevlisi"));
                    }
                    if (!await _userManager.IsInRoleAsync(identityUser, "PansiyonGorevlisi"))
                    {
                        await _userManager.AddToRoleAsync(identityUser, "PansiyonGorevlisi");
                    }

                    gorevlisi.KullaniciAdi = viewModel.KullaniciAdi;
                    gorevlisi.AdSoyad = viewModel.AdSoyad;
                    gorevlisi.Rol = viewModel.Rol;
                    gorevlisi.Telefon = viewModel.Telefon;
                    gorevlisi.Email = viewModel.Email;
                    gorevlisi.Aktif = viewModel.Aktif;

                    _context.Update(gorevlisi);
                    await _context.SaveChangesAsync();
                    TempData["SuccessMessage"] = "Görevli başarıyla güncellendi.";
                    return RedirectToAction(nameof(Index));
                }
                catch (DbUpdateConcurrencyException)
                {
                    if (!PansiyonGorevlisiExists(viewModel.Id))
                    {
                        return NotFound();
                    }
                    else
                    {
                        throw;
                    }
                }
            }
            return View(viewModel);
        }

        // GET: PansiyonGorevlisi/Delete/5
        public async Task<IActionResult> Delete(int? id)
        {
            if (id == null)
            {
                return NotFound();
            }

            var gorevlisi = await _context.PansiyonGorevlileri
                .FirstOrDefaultAsync(m => m.Id == id);

            if (gorevlisi == null)
            {
                return NotFound();
            }

            var viewModel = new PansiyonGorevlisiViewModel
            {
                Id = gorevlisi.Id,
                KullaniciAdi = gorevlisi.KullaniciAdi,
                AdSoyad = gorevlisi.AdSoyad,
                Rol = gorevlisi.Rol,
                Telefon = gorevlisi.Telefon,
                Email = gorevlisi.Email,
                Aktif = gorevlisi.Aktif,
                RowVersion = gorevlisi.RowVersion
            };

            return View(viewModel);
        }

        // POST: PansiyonGorevlisi/Delete/5
        [HttpPost, ActionName("Delete")]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> DeleteConfirmed(int id, byte[] rowVersion)
        {
            var gorevlisi = await _context.PansiyonGorevlileri.FindAsync(id);
            if (gorevlisi == null)
            {
                return NotFound();
            }

            // Concurrency check
            if (!rowVersion.SequenceEqual(gorevlisi.RowVersion))
            {
                TempData["ErrorMessage"] = "Bu kayıt başka bir kullanıcı tarafından güncellendi. Lütfen sayfayı yenileyip tekrar deneyin.";
                return RedirectToAction(nameof(Index));
            }

            // İlişkili kayıtları kontrol et
            var hasRelations = await _context.NobetciPlanlar.AnyAsync(n => n.PansiyonGorevlisiId == id)
                || await _context.PansiyonYoklamalar.AnyAsync(y => y.YoklamaYapanId == id)
                || await _context.IzinGirisleri.AnyAsync(i => i.OnaylayanId == id);

            if (hasRelations)
            {
                TempData["ErrorMessage"] = "Bu görevlinin ilişkili nöbet planı, yoklama veya izin onayı kayıtları var. Silmek yerine 'Aktif' pasif yapabilirsiniz.";
                return RedirectToAction(nameof(Index));
            }

            _context.PansiyonGorevlileri.Remove(gorevlisi);
            await _context.SaveChangesAsync();
            TempData["SuccessMessage"] = "Görevli başarıyla silindi.";
            return RedirectToAction(nameof(Index));
        }

        private bool PansiyonGorevlisiExists(int id)
        {
            return _context.PansiyonGorevlileri.Any(e => e.Id == id);
        }
    }
}
