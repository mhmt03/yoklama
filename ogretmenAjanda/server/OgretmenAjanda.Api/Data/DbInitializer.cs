using System;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using OgretmenAjanda.Api.Models;

namespace OgretmenAjanda.Api.Data
{
    public static class DbInitializer
    {
        public static async Task InitializeAsync(AppDbContext context)
        {
            // Tabloları oluştur (varsa korur)
            await context.Database.EnsureCreatedAsync();

            // Süper Admin Kullanıcısını Kontrol Et
            var superAdmin = await context.Users.FirstOrDefaultAsync(u => u.Role == UserRoles.SuperAdmin);
            if (superAdmin == null)
            {
                var newSuperAdmin = new User
                {
                    Id = Guid.NewGuid(),
                    Username = "mehmet",
                    // BCrypt ile güvenli hashlenmiş şifre
                    PasswordHash = BCrypt.Net.BCrypt.HashPassword("123456"),
                    FullName = "Süper Yönetici (Mehmet)",
                    Role = UserRoles.SuperAdmin,
                    IsActive = true,
                    CreatedAt = DateTime.UtcNow,
                    LicenseExpiresAt = DateTime.UtcNow.AddYears(50) // Süresiz
                };

                await context.Users.AddAsync(newSuperAdmin);
                await context.SaveChangesAsync();

                // İlk Audit Log kaydı
                context.AuditLogs.Add(new AuditLog
                {
                    UserId = newSuperAdmin.Id,
                    UserRole = UserRoles.SuperAdmin,
                    ActionType = "SYSTEM_INITIALIZED",
                    EntityName = "User",
                    EntityId = newSuperAdmin.Id.ToString(),
                    DetailsJson = "Süper Admin hesabı otomatik oluşturuldu.",
                    Timestamp = DateTime.UtcNow
                });
                await context.SaveChangesAsync();
            }
        }
    }
}
