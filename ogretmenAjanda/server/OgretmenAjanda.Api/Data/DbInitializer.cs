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

            // SQLite için yeni sütunları ve tabloları güvenle ekle
            try { await context.Database.ExecuteSqlRawAsync("ALTER TABLE \"Users\" ADD COLUMN \"CustomerId\" TEXT;"); } catch { }
            try { await context.Database.ExecuteSqlRawAsync("ALTER TABLE \"Users\" ADD COLUMN \"RelationId\" TEXT;"); } catch { }
            try { await context.Database.ExecuteSqlRawAsync("ALTER TABLE \"Schools\" ADD COLUMN \"CustomerId\" TEXT;"); } catch { }
            try { await context.Database.ExecuteSqlRawAsync("ALTER TABLE \"Schools\" ADD COLUMN \"RelationId\" TEXT;"); } catch { }
            try { await context.Database.ExecuteSqlRawAsync("ALTER TABLE \"Schools\" ADD COLUMN \"GeminiModel\" TEXT;"); } catch { }
            try { await context.Database.ExecuteSqlRawAsync("ALTER TABLE \"Schools\" ADD COLUMN \"DailyAiRequests\" INTEGER DEFAULT 0;"); } catch { }
            try { await context.Database.ExecuteSqlRawAsync("ALTER TABLE \"Schools\" ADD COLUMN \"DailyAiTokens\" INTEGER DEFAULT 0;"); } catch { }
            try { await context.Database.ExecuteSqlRawAsync("ALTER TABLE \"Schools\" ADD COLUMN \"LastAiUsageDate\" TEXT;"); } catch { }
            try { await context.Database.ExecuteSqlRawAsync("ALTER TABLE \"Schools\" ADD COLUMN \"LastAiRequestTime\" TEXT;"); } catch { }
            try { await context.Database.ExecuteSqlRawAsync("ALTER TABLE \"Schools\" ADD COLUMN \"LastTokensUsed\" INTEGER DEFAULT 0;"); } catch { }
            try { await context.Database.ExecuteSqlRawAsync("ALTER TABLE \"Students\" ADD COLUMN \"RelationId\" TEXT;"); } catch { }
            try { await context.Database.ExecuteSqlRawAsync("ALTER TABLE \"AppMessages\" ADD COLUMN \"ReceiverName\" TEXT;"); } catch { }
            try { await context.Database.ExecuteSqlRawAsync("ALTER TABLE \"AppMessages\" ADD COLUMN \"TargetDescription\" TEXT;"); } catch { }

            try
            {
                await context.Database.ExecuteSqlRawAsync(@"
                    CREATE TABLE IF NOT EXISTS ""SchoolClasses"" (
                        ""Id"" TEXT NOT NULL PRIMARY KEY,
                        ""SchoolId"" TEXT NOT NULL,
                        ""Grade"" TEXT NOT NULL,
                        ""Section"" TEXT NOT NULL,
                        ""AcademicYear"" TEXT,
                        ""CreatedAt"" TEXT NOT NULL
                    );
                ");
            }
            catch { }

            try
            {
                await context.Database.ExecuteSqlRawAsync(@"
                    CREATE TABLE IF NOT EXISTS ""SchoolLessons"" (
                        ""Id"" TEXT NOT NULL PRIMARY KEY,
                        ""SchoolId"" TEXT NOT NULL,
                        ""Name"" TEXT NOT NULL,
                        ""ShortCode"" TEXT,
                        ""Grade"" TEXT,
                        ""WeeklyHours"" INTEGER NOT NULL DEFAULT 2,
                        ""CreatedAt"" TEXT NOT NULL
                    );
                ");
            }
            catch { }

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

            // 5. Varsayılan Sınıf & Şubeler (9-A, 9-B, 10-A, 11-A, 12-A)
            var hasClasses = await context.SchoolClasses.AnyAsync(c => c.SchoolId == testSchool.Id);
            if (!hasClasses)
            {
                var defaultClasses = new[]
                {
                    new SchoolClass { Id = Guid.NewGuid(), SchoolId = testSchool.Id, Grade = "9", Section = "A", AcademicYear = "2026-2027" },
                    new SchoolClass { Id = Guid.NewGuid(), SchoolId = testSchool.Id, Grade = "9", Section = "B", AcademicYear = "2026-2027" },
                    new SchoolClass { Id = Guid.NewGuid(), SchoolId = testSchool.Id, Grade = "10", Section = "A", AcademicYear = "2026-2027" },
                    new SchoolClass { Id = Guid.NewGuid(), SchoolId = testSchool.Id, Grade = "11", Section = "A", AcademicYear = "2026-2027" },
                    new SchoolClass { Id = Guid.NewGuid(), SchoolId = testSchool.Id, Grade = "12", Section = "A", AcademicYear = "2026-2027" },
                };
                await context.SchoolClasses.AddRangeAsync(defaultClasses);
            }

            // 6. Varsayılan Dersler
            var hasLessons = await context.SchoolLessons.AnyAsync(l => l.SchoolId == testSchool.Id);
            if (!hasLessons)
            {
                var defaultLessons = new[]
                {
                    new SchoolLesson { Id = Guid.NewGuid(), SchoolId = testSchool.Id, Name = "Fizik", ShortCode = "FZK", Grade = "Tüm Kademeler", WeeklyHours = 2 },
                    new SchoolLesson { Id = Guid.NewGuid(), SchoolId = testSchool.Id, Name = "Kimya", ShortCode = "KMY", Grade = "Tüm Kademeler", WeeklyHours = 2 },
                    new SchoolLesson { Id = Guid.NewGuid(), SchoolId = testSchool.Id, Name = "Biyoloji", ShortCode = "BYL", Grade = "Tüm Kademeler", WeeklyHours = 2 },
                    new SchoolLesson { Id = Guid.NewGuid(), SchoolId = testSchool.Id, Name = "Matematik", ShortCode = "MAT", Grade = "Tüm Kademeler", WeeklyHours = 6 },
                    new SchoolLesson { Id = Guid.NewGuid(), SchoolId = testSchool.Id, Name = "Türk Dili ve Edebiyatı", ShortCode = "EDB", Grade = "Tüm Kademeler", WeeklyHours = 5 },
                    new SchoolLesson { Id = Guid.NewGuid(), SchoolId = testSchool.Id, Name = "Tarih", ShortCode = "TRH", Grade = "Tüm Kademeler", WeeklyHours = 2 },
                    new SchoolLesson { Id = Guid.NewGuid(), SchoolId = testSchool.Id, Name = "İngilizce", ShortCode = "İNG", Grade = "Tüm Kademeler", WeeklyHours = 4 }
                };
                await context.SchoolLessons.AddRangeAsync(defaultLessons);
            }

            // 7. Örnek Öğrenciler
            var hasStudents = await context.Students.AnyAsync(s => s.SchoolId == testSchool.Id);
            if (!hasStudents)
            {
                var defaultStudents = new[]
                {
                    new Student
                    {
                        Id = Guid.NewGuid(),
                        SchoolId = testSchool.Id,
                        RelationId = "ILK-10001",
                        StudentNumber = "101",
                        FullName = "Ali Yılmaz",
                        Grade = "9",
                        Section = "A",
                        ParentName = "Kemal Yılmaz",
                        ParentPhone = "05551112233",
                        StudentPhone = "05552223344"
                    },
                    new Student
                    {
                        Id = Guid.NewGuid(),
                        SchoolId = testSchool.Id,
                        RelationId = "ILK-10001",
                        StudentNumber = "102",
                        FullName = "Ayşe Demir",
                        Grade = "9",
                        Section = "A",
                        ParentName = "Fatma Demir",
                        ParentPhone = "05553334455",
                        StudentPhone = "05554445566"
                    },
                    new Student
                    {
                        Id = Guid.NewGuid(),
                        SchoolId = testSchool.Id,
                        RelationId = "ILK-10001",
                        StudentNumber = "201",
                        FullName = "Can Yıldız",
                        Grade = "10",
                        Section = "A",
                        ParentName = "Mustafa Yıldız",
                        ParentPhone = "05555556677",
                        StudentPhone = "05556667788"
                    }
                };
                await context.Students.AddRangeAsync(defaultStudents);
            }

            await context.SaveChangesAsync();
        }
    }
}
