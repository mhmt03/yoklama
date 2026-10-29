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
            try { await context.Database.ExecuteSqlRawAsync("ALTER TABLE \"Schools\" ADD COLUMN \"DailyLessonHours\" INTEGER DEFAULT 8;"); } catch { }
            try { await context.Database.ExecuteSqlRawAsync("ALTER TABLE \"Schools\" ADD COLUMN \"LastAiUsageDate\" TEXT;"); } catch { }
            try { await context.Database.ExecuteSqlRawAsync("ALTER TABLE \"Schools\" ADD COLUMN \"LastAiRequestTime\" TEXT;"); } catch { }
            try { await context.Database.ExecuteSqlRawAsync("ALTER TABLE \"Schools\" ADD COLUMN \"LastTokensUsed\" INTEGER DEFAULT 0;"); } catch { }
            try { await context.Database.ExecuteSqlRawAsync("ALTER TABLE \"Students\" ADD COLUMN \"RelationId\" TEXT;"); } catch { }
            try { await context.Database.ExecuteSqlRawAsync("ALTER TABLE \"AppMessages\" ADD COLUMN \"ReceiverName\" TEXT;"); } catch { }
            try { await context.Database.ExecuteSqlRawAsync("ALTER TABLE \"AppMessages\" ADD COLUMN \"TargetDescription\" TEXT;"); } catch { }
            try { await context.Database.ExecuteSqlRawAsync("ALTER TABLE \"AuditLogs\" ADD COLUMN \"UserName\" TEXT;"); } catch { }
            try { await context.Database.ExecuteSqlRawAsync("ALTER TABLE \"AuditLogs\" ADD COLUMN \"UserFullName\" TEXT;"); } catch { }
            try { await context.Database.ExecuteSqlRawAsync("ALTER TABLE \"AuditLogs\" ADD COLUMN \"Description\" TEXT;"); } catch { }
            try { await context.Database.ExecuteSqlRawAsync("ALTER TABLE \"Users\" ADD COLUMN \"Branch\" TEXT;"); } catch { }
            try { await context.Database.ExecuteSqlRawAsync("ALTER TABLE \"Users\" ADD COLUMN \"CounselorClass\" TEXT;"); } catch { }
            try { await context.Database.ExecuteSqlRawAsync("ALTER TABLE \"Users\" ADD COLUMN \"PermissionsJson\" TEXT;"); } catch { }
            try { await context.Database.ExecuteSqlRawAsync("ALTER TABLE \"Users\" ADD COLUMN \"AssignedLessonsJson\" TEXT;"); } catch { }
            try { await context.Database.ExecuteSqlRawAsync("ALTER TABLE \"Users\" ADD COLUMN \"AssignedClassesJson\" TEXT;"); } catch { }
            try { await context.Database.ExecuteSqlRawAsync("ALTER TABLE \"Users\" ADD COLUMN \"AssignedSchoolIdsJson\" TEXT;"); } catch { }
            try { await context.Database.ExecuteSqlRawAsync("ALTER TABLE \"ScheduleItems\" ADD COLUMN \"LessonCode\" TEXT;"); } catch { }
            try { await context.Database.ExecuteSqlRawAsync("ALTER TABLE \"Institutions\" ADD COLUMN \"AdminPassword\" TEXT;"); } catch { }
            try { await context.Database.ExecuteSqlRawAsync("ALTER TABLE \"Students\" ADD COLUMN \"ParentUsername\" TEXT;"); } catch { }
            try { await context.Database.ExecuteSqlRawAsync("ALTER TABLE \"Students\" ADD COLUMN \"ParentPasswordHash\" TEXT;"); } catch { }
            try { await context.Database.ExecuteSqlRawAsync("ALTER TABLE \"Students\" ADD COLUMN \"ParentCustomPassword\" TEXT;"); } catch { }
            try { await context.Database.ExecuteSqlRawAsync("ALTER TABLE \"Students\" ADD COLUMN \"StudentCustomPassword\" TEXT;"); } catch { }
            try { await context.Database.ExecuteSqlRawAsync("ALTER TABLE \"StudentEvaluations\" ADD COLUMN \"TargetAudience\" TEXT DEFAULT 'BOTH';"); } catch { }
            try { await context.Database.ExecuteSqlRawAsync("ALTER TABLE \"StudentEvaluations\" ADD COLUMN \"IsSharedWithStudent\" INTEGER DEFAULT 1;"); } catch { }
            try { await context.Database.ExecuteSqlRawAsync("ALTER TABLE \"AppMessages\" ADD COLUMN \"TargetAudience\" TEXT DEFAULT 'ALL';"); } catch { }
            try { await context.Database.ExecuteSqlRawAsync("ALTER TABLE \"AppMessages\" ADD COLUMN \"ReplyToMessageId\" TEXT;"); } catch { }
            try { await context.Database.ExecuteSqlRawAsync("ALTER TABLE \"AppMessages\" ADD COLUMN \"ReplyToContent\" TEXT;"); } catch { }
            try { await context.Database.ExecuteSqlRawAsync("ALTER TABLE \"AppMessages\" ADD COLUMN \"Subject\" TEXT;"); } catch { }
            try { await context.Database.ExecuteSqlRawAsync("ALTER TABLE \"WrittenExams\" ADD COLUMN \"IsPublishedToStudents\" INTEGER NOT NULL DEFAULT 1;"); } catch { }
            try { await context.Database.ExecuteSqlRawAsync("UPDATE \"AppMessages\" SET \"TargetAudience\" = 'STAFF' WHERE \"TargetRole\" IN ('STAFF', 'ADMIN', 'SCHOOL_ADMIN') AND (\"TargetAudience\" = 'ALL' OR \"TargetAudience\" IS NULL);"); } catch { }
            try { await context.Database.ExecuteSqlRawAsync("UPDATE \"AppMessages\" SET \"TargetAudience\" = 'TEACHER' WHERE \"TargetRole\" IN ('TEACHER', 'TEACHERS', 'SPECIFIC_TEACHER') AND (\"TargetAudience\" = 'ALL' OR \"TargetAudience\" IS NULL);"); } catch { }

            try
            {
                await context.Database.ExecuteSqlRawAsync(@"
                    CREATE TABLE IF NOT EXISTS ""TeacherDuties"" (
                        ""Id"" TEXT NOT NULL PRIMARY KEY,
                        ""SchoolId"" TEXT NOT NULL,
                        ""TeacherName"" TEXT NOT NULL,
                        ""DutyPlace"" TEXT NOT NULL,
                        ""DayOfWeek"" TEXT,
                        ""Date"" TEXT,
                        ""CreatedAt"" TEXT NOT NULL
                    );
                ");
            }
            catch { }

            try
            {
                await context.Database.ExecuteSqlRawAsync(@"
                    CREATE TABLE IF NOT EXISTS ""ExamHalls"" (
                        ""Id"" TEXT NOT NULL PRIMARY KEY,
                        ""SchoolId"" TEXT NOT NULL,
                        ""RoomName"" TEXT NOT NULL,
                        ""Capacity"" INTEGER NOT NULL DEFAULT 30,
                        ""Tag"" TEXT NOT NULL DEFAULT 'İkili Oturum',
                        ""OrderIndex"" INTEGER NOT NULL DEFAULT 0,
                        ""IsActive"" INTEGER NOT NULL DEFAULT 1,
                        ""CreatedAt"" TEXT NOT NULL
                    );
                ");
            }
            catch { }

            try
            {
                await context.Database.ExecuteSqlRawAsync(@"
                    CREATE TABLE IF NOT EXISTS ""WrittenExams"" (
                        ""Id"" TEXT NOT NULL PRIMARY KEY,
                        ""SchoolId"" TEXT NOT NULL,
                        ""Name"" TEXT NOT NULL,
                        ""ExamDate"" TEXT NOT NULL,
                        ""LessonHour"" INTEGER NOT NULL DEFAULT 3,
                        ""StartTime"" TEXT,
                        ""AcademicYear"" TEXT,
                        ""Term"" TEXT,
                        ""IsActive"" INTEGER NOT NULL DEFAULT 1,
                        ""CreatedAt"" TEXT NOT NULL
                    );
                ");
            }
            catch { }

            try
            {
                await context.Database.ExecuteSqlRawAsync(@"
                    CREATE TABLE IF NOT EXISTS ""ExamSeatings"" (
                        ""Id"" TEXT NOT NULL PRIMARY KEY,
                        ""WrittenExamId"" TEXT NOT NULL,
                        ""SchoolId"" TEXT NOT NULL,
                        ""StudentId"" TEXT,
                        ""StudentNumber"" TEXT NOT NULL,
                        ""FullName"" TEXT NOT NULL,
                        ""Grade"" TEXT NOT NULL,
                        ""Section"" TEXT NOT NULL,
                        ""LessonName"" TEXT NOT NULL,
                        ""RoomName"" TEXT NOT NULL,
                        ""SeatNumber"" INTEGER NOT NULL,
                        ""ProctorTeacherName"" TEXT,
                        ""ProctorTeacherId"" TEXT,
                        ""CreatedAt"" TEXT NOT NULL
                    );
                ");
            }
            catch { }

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

            try
            {
                await context.Database.ExecuteSqlRawAsync(@"
                    CREATE TABLE IF NOT EXISTS ""Institutions"" (
                        ""Id"" TEXT NOT NULL PRIMARY KEY,
                        ""Code"" TEXT NOT NULL,
                        ""Name"" TEXT NOT NULL,
                        ""MaxSchoolCount"" INTEGER NOT NULL DEFAULT 2,
                        ""ContactName"" TEXT,
                        ""ContactPhone"" TEXT,
                        ""ContactEmail"" TEXT,
                        ""AdminUserId"" TEXT,
                        ""CreatedAt"" TEXT NOT NULL,
                        ""LicenseExpiresAt"" TEXT,
                        ""IsActive"" INTEGER NOT NULL DEFAULT 1
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

            // 1.1. Varsayılan Kurum (Müşteri): mg-eğitim kurumu (mg-egitim)
            var defaultInst = await context.Institutions.FirstOrDefaultAsync(i => i.Code.ToLower() == "mg-egitim" || i.Code.ToLower() == "zafer-egitim" || i.Code == "MST-10001");
            if (defaultInst == null)
            {
                defaultInst = new Institution
                {
                    Id = Guid.NewGuid(),
                    Code = "mg-egitim",
                    Name = "mg-eğitim kurumu",
                    MaxSchoolCount = 5, // Lisanslanan okul hakkı
                    ContactName = "Mehmet Yönetici",
                    ContactPhone = "0555 123 4567",
                    ContactEmail = "info@mgegitim.k12.tr",
                    CreatedAt = DateTime.UtcNow,
                    LicenseExpiresAt = DateTime.UtcNow.AddYears(1),
                    IsActive = true
                };
                await context.Institutions.AddAsync(defaultInst);
            }
            else
            {
                defaultInst.Code = "mg-egitim";
                defaultInst.Name = "mg-eğitim kurumu";
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
                    CustomerId = "mg-egitim",
                    RelationId = "ILK-10001",
                    IsActive = true,
                    CreatedAt = DateTime.UtcNow,
                    LicenseExpiresAt = DateTime.UtcNow.AddYears(1) // Deneme sürecinde 1 yıllık süre
                };
                await context.Users.AddAsync(schoolAdmin);
                defaultInst.AdminUserId = schoolAdmin.Id;
            }
            else
            {
                schoolAdmin.CustomerId = "mg-egitim";
                if (string.IsNullOrEmpty(schoolAdmin.RelationId)) schoolAdmin.RelationId = "ILK-10001";
                if (!schoolAdmin.LicenseExpiresAt.HasValue) schoolAdmin.LicenseExpiresAt = DateTime.UtcNow.AddYears(1);
                defaultInst.AdminUserId = schoolAdmin.Id;
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
                    CustomerId = "mg-egitim",
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
                testSchool.CustomerId = "mg-egitim";
                if (string.IsNullOrEmpty(testSchool.RelationId)) testSchool.RelationId = "ILK-10001";
                testSchool.AdminUserId = schoolAdmin.Id;
            }

            // 3.1. Kullanıcının sildiği Cumhuriyet Fen Lisesi (OKL-10002) varsa kalıcı olarak temizle
            var testSchool2 = await context.Schools.FirstOrDefaultAsync(s => s.Code == "OKL-10002" || s.Name == "Cumhuriyet Fen Lisesi");
            if (testSchool2 != null)
            {
                context.Schools.Remove(testSchool2);
                await context.SaveChangesAsync();
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
                    CustomerId = "mg-egitim",
                    RelationId = "ILK-10001",
                    IsActive = true,
                    CreatedAt = DateTime.UtcNow,
                    LicenseExpiresAt = DateTime.UtcNow.AddYears(1)
                };
                await context.Users.AddAsync(teacher);
            }
            else
            {
                teacher.CustomerId = "mg-egitim";
                if (string.IsNullOrEmpty(teacher.RelationId)) teacher.RelationId = "ILK-10001";
                teacher.SchoolId = testSchool.Id;
            }

            // Okul bağı boşta kalan öğretmenleri kurumun ilk okuluna bağla
            var unassignedTeachers = await context.Users
                .Where(u => !u.SchoolId.HasValue && (u.Role == UserRoles.Teacher || u.Role == UserRoles.Staff))
                .ToListAsync();

            if (unassignedTeachers.Count > 0 && testSchool != null)
            {
                foreach (var t in unassignedTeachers)
                {
                    t.SchoolId = testSchool.Id;
                    if (string.IsNullOrEmpty(t.CustomerId)) t.CustomerId = testSchool.CustomerId ?? "mg-egitim";
                    if (string.IsNullOrEmpty(t.RelationId)) t.RelationId = testSchool.RelationId ?? "ILK-10001";
                }
                await context.SaveChangesAsync();
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

            // 7. Öğretmen kullanıcı adlarındaki son sayıları güvenle temizle
            try
            {
                var allUsers = await context.Users.ToListAsync();
                var allUsernames = new HashSet<string>(
                    allUsers.Where(u => !string.IsNullOrEmpty(u.Username)).Select(u => u.Username.Trim().ToLowerInvariant()),
                    StringComparer.OrdinalIgnoreCase
                );

                bool anyModified = false;
                foreach (var u in allUsers)
                {
                    if (u.Role != UserRoles.Teacher && u.Role != UserRoles.Staff) continue;
                    if (string.IsNullOrWhiteSpace(u.Username)) continue;

                    var trimmed = u.Username.Trim();
                    // Sadece sonu 1 veya daha fazla rakamla bitenleri hedefle (ör: ali.kaya1 -> ali.kaya)
                    var cleaned = System.Text.RegularExpressions.Regex.Replace(trimmed, @"\d+$", "");

                    // Eğer sayı yoksa veya temizlendiğinde boş kalıyorsa geç
                    if (string.Equals(trimmed, cleaned, StringComparison.OrdinalIgnoreCase) || string.IsNullOrEmpty(cleaned))
                    {
                        continue;
                    }

                    // Eğer temizlenmiş kullanıcı adı başka bir kullanıcı tarafından KULLANILMIYORSA güncelle
                    if (!allUsernames.Contains(cleaned.ToLowerInvariant()))
                    {
                        allUsernames.Remove(trimmed.ToLowerInvariant());
                        allUsernames.Add(cleaned.ToLowerInvariant());
                        u.Username = cleaned;
                        anyModified = true;
                    }
                    else
                    {
                        // Temizlenen ad zaten sistemde var. Bu hesap mükerrer ve ilişkisiz bir hayalet hesapsa güvenle sil:
                        var hasSchedules = await context.ScheduleItems.AnyAsync(s => s.TeacherId == u.Id);
                        if (!hasSchedules)
                        {
                            context.Users.Remove(u);
                            anyModified = true;
                        }
                    }
                }

                if (anyModified)
                {
                    await context.SaveChangesAsync();
                }
            }
            catch { }

            // Mevcut veritabanındaki tüm öğrencilerin sınıf düzeyi ve şube bilgilerini otomatik normalize et
            try
            {
                var allStudents = await context.Students.ToListAsync();
                bool studentModified = false;
                foreach (var st in allStudents)
                {
                    var (normGrade, normSection) = OgretmenAjanda.Api.Helpers.GradeSectionNormalizer.Normalize(st.Grade, st.Section);
                    if (st.Grade != normGrade || st.Section != normSection)
                    {
                        st.Grade = normGrade;
                        st.Section = normSection;
                        studentModified = true;
                    }
                }
                if (studentModified)
                {
                    await context.SaveChangesAsync();
                }
            }
            catch { }

            await context.SaveChangesAsync();
        }
    }
}
