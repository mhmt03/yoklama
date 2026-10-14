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

            // SQLite için yeni sütunları güvenle ekle
            try { await context.Database.ExecuteSqlRawAsync("ALTER TABLE \"Users\" ADD COLUMN \"CustomerId\" TEXT;"); } catch { }
            try { await context.Database.ExecuteSqlRawAsync("ALTER TABLE \"Users\" ADD COLUMN \"RelationId\" TEXT;"); } catch { }
            try { await context.Database.ExecuteSqlRawAsync("ALTER TABLE \"Schools\" ADD COLUMN \"CustomerId\" TEXT;"); } catch { }
            try { await context.Database.ExecuteSqlRawAsync("ALTER TABLE \"Schools\" ADD COLUMN \"RelationId\" TEXT;"); } catch { }
            try { await context.Database.ExecuteSqlRawAsync("ALTER TABLE \"Students\" ADD COLUMN \"RelationId\" TEXT;"); } catch { }

            // 1. Süper Admin: mehmetsuper / 1234 (veya mehmet / 123456)
            var superAdmin = await context.Users.FirstOrDefaultAsync(u => u.Username.ToLower() == "mehmetsuper");
            if (superAdmin == null)
            {
                var newSuperAdmin = new User
                {
                    Id = Guid.NewGuid(),
                    Username = "mehmetsuper",
                    PasswordHash = BCrypt.Net.BCrypt.HashPassword("1234"),
                    FullName = "Süper Yönetici (Mehmet)",
                    Role = UserRoles.SuperAdmin,
                    IsActive = true,
                    CreatedAt = DateTime.UtcNow,
                    LicenseExpiresAt = DateTime.UtcNow.AddYears(50)
                };
                await context.Users.AddAsync(newSuperAdmin);
            }

            // 2. Okul Admini (Müşteri): mehmetadmin / 1234 (1 Yıllık Deneme Lisansı)
            var schoolAdmin = await context.Users.FirstOrDefaultAsync(u => u.Username.ToLower() == "mehmetadmin");
            if (schoolAdmin == null)
            {
                schoolAdmin = new User
                {
                    Id = Guid.NewGuid(),
                    Username = "mehmetadmin",
                    PasswordHash = BCrypt.Net.BCrypt.HashPassword("1234"),
                    FullName = "Mehmet (Okul Müdürü & Müşteri)",
                    Role = UserRoles.SchoolAdmin,
                    CustomerId = "MST-10001",
                    RelationId = "ILK-10001",
                    IsActive = true,
                    CreatedAt = DateTime.UtcNow,
                    LicenseExpiresAt = DateTime.UtcNow.AddYears(1) // Deneme sürecinde 1 yıllık süre
                };
                await context.Users.AddAsync(schoolAdmin);
            }
            else
            {
                if (string.IsNullOrEmpty(schoolAdmin.CustomerId)) schoolAdmin.CustomerId = "MST-10001";
                if (string.IsNullOrEmpty(schoolAdmin.RelationId)) schoolAdmin.RelationId = "ILK-10001";
                if (!schoolAdmin.LicenseExpiresAt.HasValue) schoolAdmin.LicenseExpiresAt = DateTime.UtcNow.AddYears(1);
            }

            // 3. Varsayılan Deneme Okulu 1: Atatürk Anadolu Lisesi (OKL-10001)
            var testSchool = await context.Schools.FirstOrDefaultAsync(s => s.Code == "OKL-10001");
            if (testSchool == null)
            {
                testSchool = new School
                {
                    Id = Guid.NewGuid(),
                    Name = "Atatürk Anadolu Lisesi",
                    Code = "OKL-10001",
                    AdminUserId = schoolAdmin.Id,
                    CustomerId = "MST-10001",
                    RelationId = "ILK-10001",
                    Address = "Merkez Mah. Okul Cad. No:1",
                    Phone = "0212 555 0101",
                    CreatedAt = DateTime.UtcNow,
                    LicenseExpiresAt = DateTime.UtcNow.AddYears(1),
                    IsActive = true
                };
                await context.Schools.AddAsync(testSchool);
            }
            else
            {
                if (string.IsNullOrEmpty(testSchool.CustomerId)) testSchool.CustomerId = "MST-10001";
                if (string.IsNullOrEmpty(testSchool.RelationId)) testSchool.RelationId = "ILK-10001";
                testSchool.AdminUserId = schoolAdmin.Id;
            }

            // 3.1. Deneme Okulu 2: Cumhuriyet Fen Lisesi (OKL-10002) - Aynı Müşteri birden fazla okul yönetebilir
            var testSchool2 = await context.Schools.FirstOrDefaultAsync(s => s.Code == "OKL-10002");
            if (testSchool2 == null)
            {
                testSchool2 = new School
                {
                    Id = Guid.NewGuid(),
                    Name = "Cumhuriyet Fen Lisesi",
                    Code = "OKL-10002",
                    AdminUserId = schoolAdmin.Id,
                    CustomerId = "MST-10001",
                    RelationId = "ILK-10001",
                    Address = "Gazi Cad. No:45",
                    Phone = "0212 555 0202",
                    CreatedAt = DateTime.UtcNow,
                    LicenseExpiresAt = DateTime.UtcNow.AddYears(1),
                    IsActive = true
                };
                await context.Schools.AddAsync(testSchool2);
            }
            else
            {
                if (string.IsNullOrEmpty(testSchool2.CustomerId)) testSchool2.CustomerId = "MST-10001";
                if (string.IsNullOrEmpty(testSchool2.RelationId)) testSchool2.RelationId = "ILK-10001";
                testSchool2.AdminUserId = schoolAdmin.Id;
            }

            // 4. Öğretmen: mehmetogretmen / 1234 (Fizik Öğretmeni) - Okul ve İlişki ID ile bağlı
            var teacher = await context.Users.FirstOrDefaultAsync(u => u.Username.ToLower() == "mehmetogretmen");
            if (teacher == null)
            {
                teacher = new User
                {
                    Id = Guid.NewGuid(),
                    Username = "mehmetogretmen",
                    PasswordHash = BCrypt.Net.BCrypt.HashPassword("1234"),
                    FullName = "Mehmet Öğretmen (Fizik)",
                    Role = UserRoles.Teacher,
                    SchoolId = testSchool.Id,
                    RelationId = "ILK-10001",
                    IsActive = true,
                    CreatedAt = DateTime.UtcNow,
                    LicenseExpiresAt = DateTime.UtcNow.AddYears(1)
                };
                await context.Users.AddAsync(teacher);
            }
            else
            {
                if (string.IsNullOrEmpty(teacher.RelationId)) teacher.RelationId = "ILK-10001";
                teacher.SchoolId = testSchool.Id;
            }

            await context.SaveChangesAsync();
        }
    }
}
