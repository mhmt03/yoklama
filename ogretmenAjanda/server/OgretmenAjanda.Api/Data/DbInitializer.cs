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

            // 2. Okul Admini: mehmetadmin / 1234
            var schoolAdmin = await context.Users.FirstOrDefaultAsync(u => u.Username.ToLower() == "mehmetadmin");
            if (schoolAdmin == null)
            {
                schoolAdmin = new User
                {
                    Id = Guid.NewGuid(),
                    Username = "mehmetadmin",
                    PasswordHash = BCrypt.Net.BCrypt.HashPassword("1234"),
                    FullName = "Mehmet (Okul Müdürü)",
                    Role = UserRoles.SchoolAdmin,
                    IsActive = true,
                    CreatedAt = DateTime.UtcNow,
                    LicenseExpiresAt = DateTime.UtcNow.AddYears(2)
                };
                await context.Users.AddAsync(schoolAdmin);
            }

            // 3. Varsayılan Deneme Okulu: OKL-10001
            var testSchool = await context.Schools.FirstOrDefaultAsync(s => s.Code == "OKL-10001");
            if (testSchool == null)
            {
                testSchool = new School
                {
                    Id = Guid.NewGuid(),
                    Name = "Atatürk Anadolu Lisesi",
                    Code = "OKL-10001",
                    AdminUserId = schoolAdmin.Id,
                    Address = "Merkez Mah. Okul Cad. No:1",
                    Phone = "0212 555 0101",
                    CreatedAt = DateTime.UtcNow,
                    LicenseExpiresAt = DateTime.UtcNow.AddYears(2),
                    IsActive = true
                };
                await context.Schools.AddAsync(testSchool);
            }

            // 4. Öğretmen: mehmetogretmen / 1234 (Fizik Öğretmeni)
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
                    IsActive = true,
                    CreatedAt = DateTime.UtcNow,
                    LicenseExpiresAt = DateTime.UtcNow.AddYears(2)
                };
                await context.Users.AddAsync(teacher);
            }

            await context.SaveChangesAsync();
        }
    }
}
