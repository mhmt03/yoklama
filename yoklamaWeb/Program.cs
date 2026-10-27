using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.Data.Sqlite;
using Microsoft.AspNetCore.Authentication;
using SQLitePCL;
using System.Data;
using System.Linq;
using yoklamaWeb.Data;
using yoklamaWeb.Models;
using Microsoft.AspNetCore.Mvc.Razor.RuntimeCompilation;

var builder = WebApplication.CreateBuilder(args);
SQLitePCL.Batteries_V2.Init();
OfficeOpenXml.ExcelPackage.LicenseContext = OfficeOpenXml.LicenseContext.NonCommercial;

// Add services to the container.
builder.Services.AddControllersWithViews(options =>
{
    options.Filters.Add(new Microsoft.AspNetCore.Mvc.AutoValidateAntiforgeryTokenAttribute());
    options.Filters.Add<yoklamaWeb.Filters.AuditLogFilter>();
}).AddRazorRuntimeCompilation();

// Session services for inactivity timeout (30 minutes)
builder.Services.AddSession(options =>
{
    options.IdleTimeout = TimeSpan.FromMinutes(30);
    options.Cookie.HttpOnly = true;
    options.Cookie.IsEssential = true;
    options.Cookie.SameSite = SameSiteMode.Lax;
    options.Cookie.SecurePolicy = CookieSecurePolicy.SameAsRequest;
});

// Configure authentication cookie expiration and sliding expiration (30 minutes)
builder.Services.ConfigureApplicationCookie(options =>
{
    options.ExpireTimeSpan = TimeSpan.FromMinutes(30);
    options.SlidingExpiration = true;
    options.LoginPath = "/Account/Login";
    options.AccessDeniedPath = "/Account/AccessDenied";
    options.Cookie.HttpOnly = true;
    options.Cookie.SameSite = SameSiteMode.Lax;
    options.Cookie.SecurePolicy = CookieSecurePolicy.SameAsRequest;
});
builder.WebHost.UseUrls("http://0.0.0.0:5046");

 // SQLite database configuration (using a subfolder "db")
var dbFolder = System.IO.Path.Combine(builder.Environment.ContentRootPath, "db");
if (!System.IO.Directory.Exists(dbFolder))
{
    System.IO.Directory.CreateDirectory(dbFolder);
}
var dbPath = System.IO.Path.Combine(dbFolder, "yoklama.db");
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlite($"Data Source={dbPath}"));

// Identity configuration
builder.Services.AddIdentity<IdentityUser, IdentityRole>(options =>
{
    options.Password.RequireDigit = false;
    options.Password.RequireUppercase = false;
    options.Password.RequireLowercase = false;
    options.Password.RequireNonAlphanumeric = false;
    options.Password.RequiredLength = 4;
})
    .AddEntityFrameworkStores<AppDbContext>()
    .AddDefaultTokenProviders();

builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(options =>
    {
        options.LoginPath = "/Account/Login";
        options.AccessDeniedPath = "/Account/AccessDenied";
    });

// Persist DataProtection keys to file system to avoid antiforgery token errors on restart
var dataProtectionPath = System.IO.Path.Combine(builder.Environment.ContentRootPath, "DataProtectionKeys");
if (!System.IO.Directory.Exists(dataProtectionPath))
{
    System.IO.Directory.CreateDirectory(dataProtectionPath);
}
builder.Services.AddDataProtection()
    .PersistKeysToFileSystem(new System.IO.DirectoryInfo(dataProtectionPath))
    .SetApplicationName("yoklamaWeb");

var app = builder.Build();

// Apply migrations and seed data
using (var scope = app.Services.CreateScope())
{
    var context = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    context.Database.Migrate();
    
    // Ensure Planner tables exist in SQLite
    context.Database.ExecuteSqlRaw(@"
        CREATE TABLE IF NOT EXISTS PlannerRooms (
            Id INTEGER PRIMARY KEY AUTOINCREMENT,
            RoomName TEXT NOT NULL,
            Capacity INTEGER NOT NULL,
            RoomGroup TEXT NULL
        );
    ");
    context.Database.ExecuteSqlRaw(@"
        CREATE TABLE IF NOT EXISTS PlannerExams (
            Id INTEGER PRIMARY KEY AUTOINCREMENT,
            Name TEXT NOT NULL,
            ExamDate TEXT NOT NULL,
            StartTime TEXT NOT NULL
        );
    ");
    context.Database.ExecuteSqlRaw(@"
        CREATE TABLE IF NOT EXISTS PlannerExamRooms (
            Id INTEGER PRIMARY KEY AUTOINCREMENT,
            PlannerExamId INTEGER NOT NULL,
            PlannerRoomId INTEGER NOT NULL,
            FOREIGN KEY (PlannerExamId) REFERENCES PlannerExams(Id) ON DELETE CASCADE,
            FOREIGN KEY (PlannerRoomId) REFERENCES PlannerRooms(Id) ON DELETE CASCADE
        );
    ");
    context.Database.ExecuteSqlRaw(@"
        CREATE TABLE IF NOT EXISTS PlannerSeatings (
            Id INTEGER PRIMARY KEY AUTOINCREMENT,
            PlannerExamId INTEGER NOT NULL,
            OgrenciNo TEXT NOT NULL,
            AdSoyad TEXT NOT NULL,
            SinifDuzeyi TEXT NOT NULL,
            Sube TEXT NOT NULL,
            RoomName TEXT NOT NULL,
            SeatNumber INTEGER NOT NULL,
            Sira INTEGER NOT NULL,
            FOREIGN KEY (PlannerExamId) REFERENCES PlannerExams(Id) ON DELETE CASCADE
        );
    ");

    // Drop old DailyClassAttendances schema if it contains the obsolete OturumNo column OR lacks YoklamaYapanKullaniciAdi in DailyClassAttendanceStudents
    var connectionObj = (SqliteConnection)context.Database.GetDbConnection();
    bool hasOldSchema = false;
    try
    {
        bool tableExists = false;
        if (connectionObj.State != ConnectionState.Open) connectionObj.Open();
        using (var cmd = connectionObj.CreateCommand())
        {
            cmd.CommandText = "SELECT name FROM sqlite_master WHERE type='table' AND name='DailyClassAttendanceStudents';";
            tableExists = cmd.ExecuteScalar() != null;
        }

        hasOldSchema = ColumnExists(connectionObj, "DailyClassAttendances", "OturumNo") || 
                       (tableExists && !ColumnExists(connectionObj, "DailyClassAttendanceStudents", "YoklamaYapanKullaniciAdi"));
    }
    catch { }
    if (hasOldSchema)
    {
        context.Database.ExecuteSqlRaw("DROP TABLE IF EXISTS DailyClassAttendanceStudents;");
        context.Database.ExecuteSqlRaw("DROP TABLE IF EXISTS DailyClassAttendances;");
    }

    context.Database.ExecuteSqlRaw(@"
        CREATE TABLE IF NOT EXISTS DailyClassAttendances (
            Id INTEGER PRIMARY KEY AUTOINCREMENT,
            ClassAttendanceId INTEGER NOT NULL,
            Tarih TEXT NOT NULL,
            SalonNotu TEXT NULL,
            GozetmenNotu TEXT NULL,
            YoklamaYapanKullaniciAdi TEXT NULL,
            KayitZamani TEXT NOT NULL,
            FOREIGN KEY (ClassAttendanceId) REFERENCES ClassAttendances(Id) ON DELETE CASCADE
        );
    ");
    context.Database.ExecuteSqlRaw(@"
        CREATE TABLE IF NOT EXISTS DailyClassAttendanceStudents (
            Id INTEGER PRIMARY KEY AUTOINCREMENT,
            DailyClassAttendanceId INTEGER NOT NULL,
            OgrenciNo TEXT NOT NULL,
            AdSoyad TEXT NOT NULL,
            SinifDuzeyi TEXT NOT NULL,
            Sube TEXT NOT NULL,
            Salon TEXT NULL,
            Sira TEXT NULL,
            Durum TEXT NOT NULL DEFAULT 'Belirsiz',
            OturumNo INTEGER NOT NULL,
            [Not] TEXT NULL,
            YoklamaYapanKullaniciAdi TEXT NULL,
            KayitZamani TEXT NULL,
            FOREIGN KEY (DailyClassAttendanceId) REFERENCES DailyClassAttendances(Id) ON DELETE CASCADE
        );
    ");
    context.Database.ExecuteSqlRaw(@"
        CREATE TABLE IF NOT EXISTS GunlukYoklamacilar (
            Id INTEGER PRIMARY KEY AUTOINCREMENT,
            AdSoyad TEXT NOT NULL,
            KullaniciAdi TEXT NOT NULL,
            Sifre TEXT NOT NULL,
            Brans TEXT NOT NULL
        );
    ");
    context.Database.ExecuteSqlRaw(@"
        CREATE TABLE IF NOT EXISTS GunlukYoklamaciProgramlari (
            Id INTEGER PRIMARY KEY AUTOINCREMENT,
            GunlukYoklamaciId INTEGER NOT NULL,
            Gun TEXT NOT NULL,
            OturumNo INTEGER NOT NULL,
            Salon TEXT NOT NULL,
            FOREIGN KEY (GunlukYoklamaciId) REFERENCES GunlukYoklamacilar(Id) ON DELETE CASCADE
        );
    ");

    // Ensure SinavlaraKatilacak column exists in Ogrenciler table
    var conn = (SqliteConnection)context.Database.GetDbConnection();
    if (!ColumnExists(conn, "Ogrenciler", "SinavlaraKatilacak"))
    {
        context.Database.ExecuteSqlRaw("ALTER TABLE Ogrenciler ADD COLUMN SinavlaraKatilacak INTEGER NOT NULL DEFAULT 1;");
    }

    // Ensure Alan column exists in Ogrenciler table
    if (!ColumnExists(conn, "Ogrenciler", "Alan"))
    {
        context.Database.ExecuteSqlRaw("ALTER TABLE Ogrenciler ADD COLUMN Alan TEXT NOT NULL DEFAULT 'YOK';");
    }

    // Ensure ExamType column exists in PlannerExams table
    if (!ColumnExists(conn, "PlannerExams", "ExamType"))
    {
        context.Database.ExecuteSqlRaw("ALTER TABLE PlannerExams ADD COLUMN ExamType TEXT NOT NULL DEFAULT 'Deneme';");
    }

    // Ensure Ders column exists in PlannerSeatings table
    if (!ColumnExists(conn, "PlannerSeatings", "Ders"))
    {
        context.Database.ExecuteSqlRaw("ALTER TABLE PlannerSeatings ADD COLUMN Ders TEXT NULL;");
    }

    // Ensure Alan column exists in PlannerSeatings table
    if (!ColumnExists(conn, "PlannerSeatings", "Alan"))
    {
        context.Database.ExecuteSqlRaw("ALTER TABLE PlannerSeatings ADD COLUMN Alan TEXT NULL;");
    }

    // Ensure RoomGroup column exists in PlannerRooms table
    if (!ColumnExists(conn, "PlannerRooms", "RoomGroup"))
    {
        context.Database.ExecuteSqlRaw("ALTER TABLE PlannerRooms ADD COLUMN RoomGroup TEXT NULL;");
    }

    // Ensure Etutler table exists in SQLite
    context.Database.ExecuteSqlRaw(@"
        CREATE TABLE IF NOT EXISTS Etutler (
            Id INTEGER PRIMARY KEY AUTOINCREMENT,
            EtutAdi TEXT NOT NULL,
            Kapasite INTEGER NOT NULL,
            Aciklama TEXT NULL,
            Aktif INTEGER NOT NULL DEFAULT 1,
            OlusturmaTarihi TEXT NOT NULL,
            RowVersion BLOB NULL
        );
    ");

    // Ensure EtutId column exists in PansiyonOgrenciler table
    if (!ColumnExists(conn, "PansiyonOgrenciler", "EtutId"))
    {
        context.Database.ExecuteSqlRaw("ALTER TABLE PansiyonOgrenciler ADD COLUMN EtutId INTEGER NULL REFERENCES Etutler(Id) ON DELETE SET NULL;");
    }

    // Ensure YoklamaSayisi column exists in Exams table
    if (!ColumnExists(conn, "Exams", "YoklamaSayisi"))
    {
        context.Database.ExecuteSqlRaw("ALTER TABLE Exams ADD COLUMN YoklamaSayisi INTEGER NOT NULL DEFAULT 1;");
    }

    // Ensure YoklamaNo column exists in ExamSeats table
    if (!ColumnExists(conn, "ExamSeats", "YoklamaNo"))
    {
        context.Database.ExecuteSqlRaw("ALTER TABLE ExamSeats ADD COLUMN YoklamaNo INTEGER NOT NULL DEFAULT 1;");
    }

    // Ensure YoklamaNo column exists in PansiyonYoklamalar table
    if (!ColumnExists(conn, "PansiyonYoklamalar", "YoklamaNo"))
    {
        context.Database.ExecuteSqlRaw("ALTER TABLE PansiyonYoklamalar ADD COLUMN YoklamaNo INTEGER NOT NULL DEFAULT 1;");
    }

    // Ensure IzinliYoklamaNolar column exists in IzinGirisleri table
    if (!ColumnExists(conn, "IzinGirisleri", "IzinliYoklamaNolar"))
    {
        context.Database.ExecuteSqlRaw("ALTER TABLE IzinGirisleri ADD COLUMN IzinliYoklamaNolar TEXT NULL;");
    }

    // Ensure TalepEdenId column exists in IzinGirisleri table
    if (!ColumnExists(conn, "IzinGirisleri", "TalepEdenId"))
    {
        context.Database.ExecuteSqlRaw("ALTER TABLE IzinGirisleri ADD COLUMN TalepEdenId INTEGER NULL REFERENCES PansiyonGorevlileri(Id) ON DELETE RESTRICT;");
    }

    // Ensure YoklamaTurleri table exists in SQLite
    context.Database.ExecuteSqlRaw(@"
        CREATE TABLE IF NOT EXISTS YoklamaTurleri (
            Id INTEGER PRIMARY KEY AUTOINCREMENT,
            Ad TEXT NOT NULL,
            Sira INTEGER NOT NULL,
            Aktif INTEGER NOT NULL DEFAULT 1,
            OlusturmaTarihi TEXT NOT NULL,
            RowVersion BLOB NULL
        );
    ");

    // Seed YoklamaTurleri if empty
    bool connWasClosed = conn.State != ConnectionState.Open;
    if (connWasClosed) conn.Open();
    try
    {
        using (var countCommand = conn.CreateCommand())
        {
            countCommand.CommandText = "SELECT COUNT(*) FROM YoklamaTurleri;";
            long countVal = (long)(countCommand.ExecuteScalar() ?? 0L);
            if (countVal == 0)
            {
                var nowStr = DateTime.UtcNow.ToString("o");
                context.Database.ExecuteSqlRaw($"INSERT INTO YoklamaTurleri (Ad, Sira, Aktif, OlusturmaTarihi) VALUES ('1. Yoklama', 1, 1, '{nowStr}');");
                context.Database.ExecuteSqlRaw($"INSERT INTO YoklamaTurleri (Ad, Sira, Aktif, OlusturmaTarihi) VALUES ('2. Yoklama', 2, 1, '{nowStr}');");
                context.Database.ExecuteSqlRaw($"INSERT INTO YoklamaTurleri (Ad, Sira, Aktif, OlusturmaTarihi) VALUES ('3. Yoklama', 3, 1, '{nowStr}');");
                context.Database.ExecuteSqlRaw($"INSERT INTO YoklamaTurleri (Ad, Sira, Aktif, OlusturmaTarihi) VALUES ('4. Yoklama', 4, 1, '{nowStr}');");
            }
        }
    }
    finally
    {
        if (connWasClosed) conn.Close();
    }

    context.Database.ExecuteSqlRaw("PRAGMA journal_mode=WAL;");
    context.Database.ExecuteSqlRaw("PRAGMA busy_timeout=5000;");

    // Ensure SystemLogs table exists in SQLite
    context.Database.ExecuteSqlRaw(@"
        CREATE TABLE IF NOT EXISTS SystemLogs (
            Id INTEGER PRIMARY KEY AUTOINCREMENT,
            KullaniciAdi TEXT NOT NULL,
            Rol TEXT NULL,
            ControllerName TEXT NOT NULL,
            ActionName TEXT NOT NULL,
            Metot TEXT NULL,
            Parametreler TEXT NULL,
            IpAdresi TEXT NOT NULL,
            Tarih TEXT NOT NULL
        );
    ");

    var roleManager = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole>>();
    var userManager = scope.ServiceProvider.GetRequiredService<UserManager<IdentityUser>>();

    string[] roles = new[] { "Admin", "Yoklamaci", "SuperYoklamaci", "PansiyonGorevlisi", "Idareci", "SinavYoneticisi" };
    foreach (var role in roles)
    {
        if (!roleManager.RoleExistsAsync(role).Result)
        {
            roleManager.CreateAsync(new IdentityRole(role)).Wait();
        }
    }

    var users = new[]
    {
        new { UserName = "admin", Role = "Admin" },
        new { UserName = "yoklamaci", Role = "Yoklamaci" },
        new { UserName = "superyoklamaci", Role = "SuperYoklamaci" },
        new { UserName = "sinavyoneticisi", Role = "SinavYoneticisi" },
        new { UserName = "pansiyongorevlisi", Role = "PansiyonGorevlisi" }
    };
    foreach (var u in users)
    {
        if (userManager.FindByNameAsync(u.UserName).Result == null)
        {
            var user = new IdentityUser { UserName = u.UserName };
            userManager.CreateAsync(user, "12345").Wait();
            userManager.AddToRoleAsync(user, u.Role).Wait();
        }
    }

    // Seed PansiyonGorevlisi entity
    if (!context.PansiyonGorevlileri.Any(g => g.KullaniciAdi == "pansiyongorevlisi"))
    {
        var pg = new PansiyonGorevlisi
        {
            KullaniciAdi = "pansiyongorevlisi",
            AdSoyad = "Pansiyon Görevlisi",
            Rol = "Gorevli",
            Telefon = "05555555555",
            Email = "pansiyon@school.com",
            Aktif = true,
            KayitTarihi = DateTime.UtcNow
        };
        context.PansiyonGorevlileri.Add(pg);
        context.SaveChanges();
    }
}

// Configure the HTTP request pipeline.
app.UseStaticFiles();
app.UseRouting();

// Security Headers middleware
app.Use(async (context, next) =>
{
    context.Response.Headers.Append("X-Content-Type-Options", "nosniff");
    context.Response.Headers.Append("X-Frame-Options", "SAMEORIGIN");
    context.Response.Headers.Append("X-XSS-Protection", "1; mode=block");
    context.Response.Headers.Append("Referrer-Policy", "strict-origin-when-cross-origin");
    await next();
});

// Session middleware
app.UseSession();

// Inactivity logout middleware (30 minutes)
app.Use(async (context, next) =>
{
    if (context.User?.Identity?.IsAuthenticated == true)
    {
        var last = context.Session.GetString("LastActivity");
        var now = DateTime.UtcNow;
        if (last != null && DateTime.TryParse(last, out var lastDt) && (now - lastDt).TotalMinutes > 30)
        {
            await context.SignOutAsync();
            context.Response.Redirect("/Account/Login?timeout=1");
            return;
        }
        context.Session.SetString("LastActivity", now.ToString("o"));
    }
    await next();
});

app.UseAuthentication();
app.UseAuthorization();

app.MapControllerRoute(
    name: "default",
    pattern: "{controller=Home}/{action=Index}/{id?}");

app.Run();

// Utility methods (previously commented)

// Checks whether a column exists in a given SQLite table.
static bool ColumnExists(SqliteConnection connection, string tableName, string columnName)
{
    bool closeAfter = false;
    if (connection.State != ConnectionState.Open)
    {
        connection.Open();
        closeAfter = true;
    }

    try
    {
        using var command = connection.CreateCommand();
        command.CommandText = $"PRAGMA table_info('{tableName}')";
        using var reader = command.ExecuteReader();
        while (reader.Read())
        {
            if (reader.GetString(reader.GetOrdinal("name")).Equals(columnName, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }
        return false;
    }
    finally
    {
        if (closeAfter)
        {
            connection.Close();
        }
    }
}

// Marks a migration as applied manually (if needed).
static void MarkMigrationAsApplied(AppDbContext context, string migrationId, string productVersion)
{
    var connection = (SqliteConnection)context.Database.GetDbConnection();
    var closeAfter = false;
    if (connection.State != ConnectionState.Open)
    {
        connection.Open();
        closeAfter = true;
    }

    try
    {
        using var command = connection.CreateCommand();
        command.CommandText = "INSERT OR IGNORE INTO \"__EFMigrationsHistory\" (\"MigrationId\", \"ProductVersion\") VALUES ($id, $version);";
        command.Parameters.AddWithValue("$id", migrationId);
        command.Parameters.AddWithValue("$version", productVersion);
        command.ExecuteNonQuery();
    }
    finally
    {
        if (closeAfter)
        {
            connection.Close();
        }
    }
}
