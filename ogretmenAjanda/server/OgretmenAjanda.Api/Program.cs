using System;
using System.IO;
using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Builder;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.IdentityModel.Tokens;
using OgretmenAjanda.Api.Data;
using OgretmenAjanda.Api.Services;

var builder = WebApplication.CreateBuilder(args);

// 1. Veritabanı Yapılandırması (SQLite veya MSSQL - monsterasp esnekliği)
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection") 
    ?? "Data Source=ogretmenajanda.db";

builder.Services.AddDbContext<AppDbContext>(options =>
{
    // Varsayılan hafif SQLite, connection string içinde 'Server=' varsa SqlServer
    if (connectionString.Contains("Server=", StringComparison.OrdinalIgnoreCase))
    {
        options.UseSqlServer(connectionString);
    }
    else
    {
        options.UseSqlite(connectionString);
    }
});

// 2. Bağımlılıklar (Services)
builder.Services.AddScoped<ITokenService, TokenService>();
builder.Services.AddSingleton<IAuditLogService, AuditLogService>();
builder.Services.AddScoped<ISchoolPurgeService, SchoolPurgeService>();

// 3. JWT Kimlik Doğrulama
var jwtKey = builder.Configuration["Jwt:Key"] ?? "OgretmenAjandaUltraSecureJWTSecretKey2026!MehmetG!XYZ987";
var key = Encoding.UTF8.GetBytes(jwtKey);

builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    options.RequireHttpsMetadata = false;
    options.SaveToken = true;
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuerSigningKey = true,
        IssuerSigningKey = new SymmetricSecurityKey(key),
        ValidateIssuer = false,
        ValidateAudience = false,
        ClockSkew = TimeSpan.Zero
    };
});

// 4. CORS (Mobil Expo ve Web erişimi için)
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAll", policy =>
    {
        policy.AllowAnyOrigin()
              .AllowAnyMethod()
              .AllowAnyHeader();
    });
});

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

// 5. Veritabanını İlklendir & Süper Admin'i Oluştur
using (var scope = app.Services.CreateScope())
{
    var context = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    await DbInitializer.InitializeAsync(context);
}

// 6. Statik Dosyalar (Fotoğrafların wwwroot/uploads üzerinden sunulması)
var uploadsDir = Path.Combine(app.Environment.WebRootPath ?? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot"), "uploads");
if (!Directory.Exists(uploadsDir))
{
    Directory.CreateDirectory(uploadsDir);
}

// Statik dosya MIME tipleri (.apk ve .wasm desteği)
var contentTypeProvider = new Microsoft.AspNetCore.StaticFiles.FileExtensionContentTypeProvider();
contentTypeProvider.Mappings[".apk"] = "application/vnd.android.package-archive";
contentTypeProvider.Mappings[".wasm"] = "application/wasm";

app.UseDefaultFiles(); // index.html varsa kök dizinde otomatik aç
app.UseStaticFiles(new StaticFileOptions
{
    ContentTypeProvider = contentTypeProvider
});  // wwwroot ve wwwroot/uploads sunumu

// Swagger geliştirme ve testte açık
app.UseSwagger();
app.UseSwaggerUI(c =>
{
    c.SwaggerEndpoint("/swagger/v1/swagger.json", "Öğretmen Ajandası API v1");
    c.RoutePrefix = "swagger";
});

app.UseCors("AllowAll");

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

// Canlılık / Health Check Ucu
app.MapGet("/health", () => Results.Ok(new
{
    status = "OK",
    service = "Öğretmen Ajandası Hibrit REST API",
    version = "1.0.0",
    docs = "/swagger"
}));

// SPA Yönlendirmesi: API veya dosya bulunamayan istekleri index.html'e yönlendirir
app.MapFallbackToFile("index.html");

app.Run();
