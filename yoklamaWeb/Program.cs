using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.Data.Sqlite;
using System.Data;
using yoklamaWeb.Data;
using yoklamaWeb.Models;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddControllersWithViews();

// SQLite and Identity configuration
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlite("Data Source=yoklama.db")
       .ConfigureWarnings(w => w.Ignore(Microsoft.EntityFrameworkCore.Diagnostics.RelationalEventId.PendingModelChangesWarning)));

// Identity with roles
builder.Services.AddIdentity<IdentityUser, IdentityRole>(options =>
{
    // simple password policy
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

var app = builder.Build();

// Seed default roles and users
using (var scope = app.Services.CreateScope())
{
    // Run DB column checks/creation automatically
    var context = scope.ServiceProvider.GetRequiredService<AppDbContext>();

    const string migrationId = "20260711160035_AddMissingExamSeatAndTemporaryProctorColumns";
    if (context.Database.GetPendingMigrations().Contains(migrationId) &&
        TableHasColumn(context, "TemporaryProctors", "ExamNote") &&
        TableHasColumn(context, "TemporaryProctors", "ProctorName") &&
        TableHasColumn(context, "TemporaryProctors", "RoomNote") &&
        TableHasColumn(context, "ExamSeats", "Note"))
    {
        MarkMigrationAsApplied(context, migrationId, "10.0.9");
    }

    context.Database.Migrate();

    var roleManager = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole>>();
    var userManager = scope.ServiceProvider.GetRequiredService<UserManager<IdentityUser>>();

    string[] roles = new[] { "Admin", "Yoklamaci", "SuperYoklamaci", "PansiyonGorevlisi" };
    foreach (var role in roles)
    {
        if (!roleManager.RoleExistsAsync(role).Result)
        {
            roleManager.CreateAsync(new IdentityRole(role)).Wait();
        }
    }

    var users = new[] {
        new { UserName = "admin", Role = "Admin" },
        new { UserName = "yoklamaci", Role = "Yoklamaci" },
        new { UserName = "superyoklamaci", Role = "SuperYoklamaci" },
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

static bool TableHasColumn(AppDbContext context, string tableName, string columnName)
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

// Configure the HTTP request pipeline.
if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Home/Error");
    app.UseHsts();
}

app.UseHttpsRedirection();
app.UseStaticFiles();
app.UseRouting();
app.UseAuthentication();
app.UseAuthorization();

app.MapControllerRoute(
    name: "default",
    pattern: "{controller=Account}/{action=Login}/{id?}");

app.Run();
