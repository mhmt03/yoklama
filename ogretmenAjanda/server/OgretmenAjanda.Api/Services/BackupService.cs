using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using OgretmenAjanda.Api.Data;
using OgretmenAjanda.Api.Models;

namespace OgretmenAjanda.Api.Services
{
    public class BackupManifest
    {
        public string Scope { get; set; } = "full"; // "full" | "school"
        public string SchemaVersion { get; set; } = "11.0";
        public string AppVersion { get; set; } = "1.11.0";
        public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
        public string TriggerType { get; set; } = "manual"; // "manual" | "auto" | "safety"
        public string? Reason { get; set; }
        public Guid? SchoolId { get; set; }
        public string? SchoolCode { get; set; }
        public string? SchoolName { get; set; }
        public string Sha256 { get; set; } = string.Empty;
        public string IntegrityCheck { get; set; } = "ok";
        public Dictionary<string, int> RecordCounts { get; set; } = new();
    }

    public class BackupFileInfoDto
    {
        public string FileName { get; set; } = string.Empty;
        public long SizeBytes { get; set; }
        public double SizeMb => Math.Round(SizeBytes / (1024.0 * 1024.0), 2);
        public DateTime CreatedAtUtc { get; set; }
        public string Scope { get; set; } = "full";
        public string TriggerType { get; set; } = "manual";
        public string? Reason { get; set; }
        public Guid? SchoolId { get; set; }
        public string? SchoolCode { get; set; }
        public string? SchoolName { get; set; }
        public string IntegrityCheck { get; set; } = "ok";
        public Dictionary<string, int> RecordCounts { get; set; } = new();
    }

    public class BackupSettingsDto
    {
        public bool AutoBackupEnabled { get; set; } = true;
        public int AutoBackupHourTr { get; set; } = 3; // 03:00 TR
        public int RetentionDays { get; set; } = 30;
        public int MaxQuotaMb { get; set; } = 500;
        public DateTime? LastAutoBackupUtc { get; set; }
    }

    public class BackupValidationResult
    {
        public bool IsValid { get; set; }
        public string Message { get; set; } = string.Empty;
        public string FileName { get; set; } = string.Empty;
        public long SizeBytes { get; set; }
        public BackupManifest? Manifest { get; set; }
    }

    public class SchoolBackupPayload
    {
        public School? School { get; set; }
        public List<SchoolClass> Classes { get; set; } = new();
        public List<SchoolLesson> Lessons { get; set; } = new();
        public List<User> Users { get; set; } = new();
        public List<Student> Students { get; set; } = new();
        public List<ScheduleItem> Schedules { get; set; } = new();
        public List<TeacherDuty> Duties { get; set; } = new();
        public List<YearlyPlanItem> YearlyPlans { get; set; } = new();
        public List<Assignment> Assignments { get; set; } = new();
        public List<AssignmentSubmission> AssignmentSubmissions { get; set; } = new();
        public List<StudentEvaluation> Evaluations { get; set; } = new();
        public List<ExamHall> ExamHalls { get; set; } = new();
        public List<WrittenExam> WrittenExams { get; set; } = new();
        public List<ExamSeating> ExamSeatings { get; set; } = new();
        public List<OptikForm> OptikFormlar { get; set; } = new();
        public List<OptikSinav> OptikSinavlar { get; set; } = new();
        public List<OptikSoruKazanim> OptikSoruKazanimlari { get; set; } = new();
        public List<OptikSinavSonuc> OptikSinavSonuclari { get; set; } = new();
        public List<OptikSinavSonucKazanim> OptikSinavSonucKazanimlari { get; set; } = new();
        public List<ClassAttendanceDefinition> ClassAttendanceDefinitions { get; set; } = new();
        public List<DailyClassAttendance> DailyClassAttendances { get; set; } = new();
    }

    public interface IBackupService
    {
        string BackupsDirectory { get; }
        bool IsSafeFileName(string fileName);
        BackupSettingsDto GetSettings();
        BackupSettingsDto SaveSettings(BackupSettingsDto settings);
        Task<BackupFileInfoDto> CreateFullBackupAsync(AppDbContext context, string triggerType = "manual", string? reason = null);
        Task<BackupFileInfoDto> CreateSchoolBackupAsync(AppDbContext context, Guid schoolId, string triggerType = "manual", string? reason = null);
        Task<object> ListBackupsAsync(AppDbContext context, Guid? schoolId, bool isSuperAdmin);
        Task<BackupValidationResult> ValidateBackupAsync(string fileName, Guid? targetSchoolId, bool isSuperAdmin);
        Task<(bool success, string message, BackupManifest? manifest)> RestoreBackupAsync(AppDbContext context, string fileName, Guid? targetSchoolId, bool isSuperAdmin);
        bool DeleteBackup(string fileName, Guid? schoolId, bool isSuperAdmin, out string error);
        string? GetBackupFilePath(string fileName, Guid? schoolId, bool isSuperAdmin);
        Task EnforceRetentionAndQuotaAsync();
    }

    public class BackupService : IBackupService
    {
        private static readonly Regex SafeFileRegex = new(@"^[A-Za-z0-9_\-\.]+\.zip$", RegexOptions.Compiled);
        private static readonly SemaphoreSlim BackupLock = new(1, 1);
        private readonly string _backupsDir;
        private readonly string _settingsPath;

        public string BackupsDirectory => _backupsDir;

        public BackupService()
        {
            // wwwroot DIŞINDA güvenli yedek dizini
            _backupsDir = Path.Combine(Directory.GetCurrentDirectory(), "Backups");
            if (!Directory.Exists(_backupsDir))
            {
                Directory.CreateDirectory(_backupsDir);
            }
            _settingsPath = Path.Combine(_backupsDir, "backup_settings.json");
        }

        public bool IsSafeFileName(string fileName)
        {
            if (string.IsNullOrWhiteSpace(fileName)) return false;
            if (fileName.Contains("..") || fileName.Contains('/') || fileName.Contains('\\')) return false;
            return SafeFileRegex.IsMatch(fileName);
        }

        public BackupSettingsDto GetSettings()
        {
            try
            {
                if (File.Exists(_settingsPath))
                {
                    var json = File.ReadAllText(_settingsPath, Encoding.UTF8);
                    var dto = JsonSerializer.Deserialize<BackupSettingsDto>(json, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
                    if (dto != null) return dto;
                }
            }
            catch { }
            return new BackupSettingsDto();
        }

        public BackupSettingsDto SaveSettings(BackupSettingsDto settings)
        {
            try
            {
                if (settings.AutoBackupHourTr < 0 || settings.AutoBackupHourTr > 23) settings.AutoBackupHourTr = 3;
                if (settings.RetentionDays < 1) settings.RetentionDays = 7;
                if (settings.MaxQuotaMb < 50) settings.MaxQuotaMb = 100;

                var json = JsonSerializer.Serialize(settings, new JsonSerializerOptions { WriteIndented = true });
                File.WriteAllText(_settingsPath, json, Encoding.UTF8);
            }
            catch { }
            return settings;
        }

        public async Task<BackupFileInfoDto> CreateFullBackupAsync(AppDbContext context, string triggerType = "manual", string? reason = null)
        {
            await BackupLock.WaitAsync();
            var tempDbPath = Path.Combine(_backupsDir, $"temp_full_{Guid.NewGuid():N}.db");
            try
            {
                // 1. SQLite tutarlı anlık kopya (VACUUM INTO)
                var escapedPath = tempDbPath.Replace("'", "''");
                await context.Database.ExecuteSqlRawAsync($"VACUUM INTO '{escapedPath}';");

                // 2. PRAGMA integrity_check doğrulaması
                string integrity = "ok";
                using (var checkConn = new SqliteConnection($"Data Source={tempDbPath};Pooling=False"))
                {
                    await checkConn.OpenAsync();
                    using var cmd = checkConn.CreateCommand();
                    cmd.CommandText = "PRAGMA integrity_check;";
                    var res = await cmd.ExecuteScalarAsync();
                    integrity = res?.ToString() ?? "ok";
                }

                // 3. SHA-256 Özeti
                var sha256 = ComputeFileSha256(tempDbPath);

                // 4. Kayıt sayıları
                var counts = new Dictionary<string, int>();
                try
                {
                    counts["institutions"] = await context.Institutions.CountAsync();
                    counts["schools"] = await context.Schools.CountAsync();
                    counts["users"] = await context.Users.CountAsync();
                    counts["students"] = await context.Students.CountAsync();
                    counts["schedules"] = await context.ScheduleItems.CountAsync();
                    counts["writtenExams"] = await context.WrittenExams.CountAsync();
                    counts["optikExams"] = await context.OptikSinavlar.CountAsync();
                    counts["optikResults"] = await context.OptikSinavSonuclari.CountAsync();
                }
                catch { }

                var nowUtc = DateTime.UtcNow;
                var trNow = nowUtc.AddHours(3);
                var safeTrigger = SanitizeToken(triggerType);
                var zipFileName = $"full_ogretmenajanda_{trNow:yyyyMMdd_HHmmss}_{safeTrigger}.zip";
                var zipFullPath = Path.Combine(_backupsDir, zipFileName);

                var manifest = new BackupManifest
                {
                    Scope = "full",
                    SchemaVersion = "11.0",
                    AppVersion = "1.11.0",
                    CreatedAtUtc = nowUtc,
                    TriggerType = safeTrigger,
                    Reason = reason,
                    Sha256 = sha256,
                    IntegrityCheck = integrity,
                    RecordCounts = counts
                };

                var manifestJson = JsonSerializer.Serialize(manifest, new JsonSerializerOptions { WriteIndented = true });

                using (var fs = new FileStream(zipFullPath, FileMode.Create, FileAccess.Write, FileShare.None))
                using (var archive = new ZipArchive(fs, ZipArchiveMode.Create))
                {
                    archive.CreateEntryFromFile(tempDbPath, "ogretmenajanda.db", CompressionLevel.Optimal);
                    var manifestEntry = archive.CreateEntry("manifest.json", CompressionLevel.Optimal);
                    using var writer = new StreamWriter(manifestEntry.Open(), Encoding.UTF8);
                    await writer.WriteAsync(manifestJson);
                }

                var fi = new FileInfo(zipFullPath);
                await EnforceRetentionAndQuotaInternalAsync();

                return new BackupFileInfoDto
                {
                    FileName = zipFileName,
                    SizeBytes = fi.Length,
                    CreatedAtUtc = nowUtc,
                    Scope = "full",
                    TriggerType = safeTrigger,
                    Reason = reason,
                    IntegrityCheck = integrity,
                    RecordCounts = counts
                };
            }
            finally
            {
                try { if (File.Exists(tempDbPath)) File.Delete(tempDbPath); } catch { }
                BackupLock.Release();
            }
        }

        public async Task<BackupFileInfoDto> CreateSchoolBackupAsync(AppDbContext context, Guid schoolId, string triggerType = "manual", string? reason = null)
        {
            await BackupLock.WaitAsync();
            try
            {
                var school = await context.Schools.AsNoTracking().FirstOrDefaultAsync(s => s.Id == schoolId);
                if (school == null)
                    throw new InvalidOperationException("Yedeklenecek okul bulunamadı.");

                var schoolIdStr = schoolId.ToString();
                var payload = new SchoolBackupPayload
                {
                    School = school,
                    Classes = await context.SchoolClasses.AsNoTracking().Where(x => x.SchoolId == schoolId).ToListAsync(),
                    Lessons = await context.SchoolLessons.AsNoTracking().Where(x => x.SchoolId == schoolId).ToListAsync(),
                    Users = await context.Users.AsNoTracking().Where(u => u.SchoolId == schoolId || (u.AssignedSchoolIdsJson != null && u.AssignedSchoolIdsJson.Contains(schoolIdStr))).ToListAsync(),
                    Students = await context.Students.AsNoTracking().Where(x => x.SchoolId == schoolId).ToListAsync(),
                    Schedules = await context.ScheduleItems.AsNoTracking().Where(x => x.SchoolId == schoolId).ToListAsync(),
                    Duties = await context.TeacherDuties.AsNoTracking().Where(x => x.SchoolId == schoolId).ToListAsync(),
                    YearlyPlans = await context.YearlyPlanItems.AsNoTracking().Where(x => x.SchoolId == schoolId).ToListAsync(),
                    Assignments = await context.Assignments.AsNoTracking().Where(x => x.SchoolId == schoolId).ToListAsync(),
                    Evaluations = await context.StudentEvaluations.AsNoTracking().Where(x => x.SchoolId == schoolId).ToListAsync(),
                    ExamHalls = await context.ExamHalls.AsNoTracking().Where(x => x.SchoolId == schoolId).ToListAsync(),
                    WrittenExams = await context.WrittenExams.AsNoTracking().Where(x => x.SchoolId == schoolId).ToListAsync(),
                    ExamSeatings = await context.ExamSeatings.AsNoTracking().Where(x => x.SchoolId == schoolId).ToListAsync(),
                    OptikFormlar = await context.OptikFormlar.AsNoTracking().Include(f => f.Dersler).Where(x => x.SchoolId == schoolId).ToListAsync(),
                    OptikSinavlar = await context.OptikSinavlar.AsNoTracking().Include(s => s.Dersler).Where(x => x.SchoolId == schoolId).ToListAsync(),
                    OptikSoruKazanimlari = await context.OptikSoruKazanimlari.AsNoTracking().Where(x => x.SchoolId == schoolId).ToListAsync(),
                    OptikSinavSonuclari = await context.OptikSinavSonuclari.AsNoTracking().Include(r => r.DersSonuclari).Where(x => x.SchoolId == schoolId).ToListAsync(),
                    OptikSinavSonucKazanimlari = await context.OptikSinavSonucKazanimlari.AsNoTracking().Where(x => x.SchoolId == schoolId).ToListAsync(),
                    ClassAttendanceDefinitions = await context.ClassAttendanceDefinitions.AsNoTracking().Where(x => x.SchoolId == schoolId).ToListAsync(),
                    DailyClassAttendances = await context.DailyClassAttendances.AsNoTracking().Where(x => x.SchoolId == schoolId).ToListAsync()
                };

                var assignmentIds = payload.Assignments.Select(a => a.Id).ToList();
                if (assignmentIds.Count > 0)
                {
                    payload.AssignmentSubmissions = await context.AssignmentSubmissions.AsNoTracking()
                        .Where(sub => assignmentIds.Contains(sub.AssignmentId))
                        .ToListAsync();
                }

                var dataJson = JsonSerializer.Serialize(payload, new JsonSerializerOptions { WriteIndented = true });
                var dataBytes = Encoding.UTF8.GetBytes(dataJson);
                var sha256 = ComputeBytesSha256(dataBytes);

                var counts = new Dictionary<string, int>
                {
                    ["classes"] = payload.Classes.Count,
                    ["lessons"] = payload.Lessons.Count,
                    ["teachers"] = payload.Users.Count(u => u.Role == UserRoles.Teacher || u.Role == UserRoles.Staff),
                    ["students"] = payload.Students.Count,
                    ["schedules"] = payload.Schedules.Count,
                    ["writtenExams"] = payload.WrittenExams.Count,
                    ["optikExams"] = payload.OptikSinavlar.Count,
                    ["optikResults"] = payload.OptikSinavSonuclari.Count
                };

                var nowUtc = DateTime.UtcNow;
                var trNow = nowUtc.AddHours(3);
                var safeCode = SanitizeToken(school.Code);
                var safeTrigger = SanitizeToken(triggerType);
                var shortId = schoolId.ToString("N").Substring(0, 8);
                var zipFileName = $"school_{safeCode}_{shortId}_{trNow:yyyyMMdd_HHmmss}_{safeTrigger}.zip";
                var zipFullPath = Path.Combine(_backupsDir, zipFileName);

                var manifest = new BackupManifest
                {
                    Scope = "school",
                    SchemaVersion = "11.0",
                    AppVersion = "1.11.0",
                    CreatedAtUtc = nowUtc,
                    TriggerType = safeTrigger,
                    Reason = reason,
                    SchoolId = school.Id,
                    SchoolCode = school.Code,
                    SchoolName = school.Name,
                    Sha256 = sha256,
                    IntegrityCheck = "ok",
                    RecordCounts = counts
                };

                var manifestJson = JsonSerializer.Serialize(manifest, new JsonSerializerOptions { WriteIndented = true });

                using (var fs = new FileStream(zipFullPath, FileMode.Create, FileAccess.Write, FileShare.None))
                using (var archive = new ZipArchive(fs, ZipArchiveMode.Create))
                {
                    var dataEntry = archive.CreateEntry("school_data.json", CompressionLevel.Optimal);
                    using (var s = dataEntry.Open())
                    {
                        await s.WriteAsync(dataBytes, 0, dataBytes.Length);
                    }

                    var manifestEntry = archive.CreateEntry("manifest.json", CompressionLevel.Optimal);
                    using (var writer = new StreamWriter(manifestEntry.Open(), Encoding.UTF8))
                    {
                        await writer.WriteAsync(manifestJson);
                    }
                }

                var fi = new FileInfo(zipFullPath);
                await EnforceRetentionAndQuotaInternalAsync();

                return new BackupFileInfoDto
                {
                    FileName = zipFileName,
                    SizeBytes = fi.Length,
                    CreatedAtUtc = nowUtc,
                    Scope = "school",
                    TriggerType = safeTrigger,
                    Reason = reason,
                    SchoolId = school.Id,
                    SchoolCode = school.Code,
                    SchoolName = school.Name,
                    IntegrityCheck = "ok",
                    RecordCounts = counts
                };
            }
            finally
            {
                BackupLock.Release();
            }
        }

        public async Task<object> ListBackupsAsync(AppDbContext context, Guid? schoolId, bool isSuperAdmin)
        {
            var files = Directory.Exists(_backupsDir)
                ? Directory.GetFiles(_backupsDir, "*.zip").OrderByDescending(f => File.GetCreationTimeUtc(f)).ToList()
                : new List<string>();

            var items = new List<BackupFileInfoDto>();
            long totalUsedBytes = 0;

            foreach (var file in files)
            {
                var fi = new FileInfo(file);
                totalUsedBytes += fi.Length;
                var manifest = ReadManifestFromZip(file);

                var dto = new BackupFileInfoDto
                {
                    FileName = fi.Name,
                    SizeBytes = fi.Length,
                    CreatedAtUtc = manifest?.CreatedAtUtc ?? fi.CreationTimeUtc,
                    Scope = manifest?.Scope ?? (fi.Name.StartsWith("school_", StringComparison.OrdinalIgnoreCase) ? "school" : "full"),
                    TriggerType = manifest?.TriggerType ?? "manual",
                    Reason = manifest?.Reason,
                    SchoolId = manifest?.SchoolId,
                    SchoolCode = manifest?.SchoolCode,
                    SchoolName = manifest?.SchoolName,
                    IntegrityCheck = manifest?.IntegrityCheck ?? "ok",
                    RecordCounts = manifest?.RecordCounts ?? new Dictionary<string, int>()
                };

                if (isSuperAdmin)
                {
                    if (!schoolId.HasValue || schoolId.Value == Guid.Empty || dto.Scope == "full" || dto.SchoolId == schoolId.Value)
                    {
                        items.Add(dto);
                    }
                }
                else if (schoolId.HasValue && dto.Scope == "school" && dto.SchoolId == schoolId.Value)
                {
                    items.Add(dto);
                }
            }

            items = items.OrderByDescending(x => x.CreatedAtUtc).ToList();
            var latest = items.FirstOrDefault();
            var hoursSinceLast = latest != null ? (DateTime.UtcNow - latest.CreatedAtUtc).TotalHours : 9999;
            var settings = GetSettings();

            // Süper admin için okul bazlı özet
            object? schoolSummaries = null;
            if (isSuperAdmin)
            {
                var allSchools = await context.Schools.AsNoTracking().Where(s => s.IsActive).Select(s => new { s.Id, s.Name, s.Code }).ToListAsync();
                schoolSummaries = allSchools.Select(s =>
                {
                    var latestForSchool = items.FirstOrDefault(i => i.SchoolId == s.Id || i.Scope == "full");
                    return new
                    {
                        schoolId = s.Id,
                        schoolName = s.Name,
                        schoolCode = s.Code,
                        lastBackupAtUtc = latestForSchool?.CreatedAtUtc,
                        lastBackupFileName = latestForSchool?.FileName,
                        isStale = latestForSchool == null || (DateTime.UtcNow - latestForSchool.CreatedAtUtc).TotalHours > 48
                    };
                }).ToList();
            }

            return new
            {
                backups = items,
                totalCount = items.Count,
                usedBytes = totalUsedBytes,
                usedMb = Math.Round(totalUsedBytes / (1024.0 * 1024.0), 2),
                maxQuotaMb = settings.MaxQuotaMb,
                lastBackupAtUtc = latest?.CreatedAtUtc,
                hoursSinceLastBackup = latest != null ? Math.Round(hoursSinceLast, 1) : (double?)null,
                isStaleWarning = hoursSinceLast > 48,
                settings = settings,
                schoolSummaries = schoolSummaries
            };
        }

        public async Task<BackupValidationResult> ValidateBackupAsync(string fileName, Guid? targetSchoolId, bool isSuperAdmin)
        {
            if (!IsSafeFileName(fileName))
                return new BackupValidationResult { IsValid = false, Message = "Geçersiz dosya adı." };

            var fullPath = Path.Combine(_backupsDir, fileName);
            if (!File.Exists(fullPath))
                return new BackupValidationResult { IsValid = false, Message = "Yedek dosyası bulunamadı." };

            var fi = new FileInfo(fullPath);
            try
            {
                using var archive = ZipFile.OpenRead(fullPath);
                var manifestEntry = archive.GetEntry("manifest.json");
                if (manifestEntry == null)
                    return new BackupValidationResult { IsValid = false, Message = "Yedek paketinde manifest.json bulunamadı.", FileName = fileName };

                BackupManifest? manifest;
                using (var s = manifestEntry.Open())
                {
                    manifest = await JsonSerializer.DeserializeAsync<BackupManifest>(s, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
                }

                if (manifest == null)
                    return new BackupValidationResult { IsValid = false, Message = "Manifest okunamadı.", FileName = fileName };

                if (manifest.Scope == "full")
                {
                    if (!isSuperAdmin)
                        return new BackupValidationResult { IsValid = false, Message = "Tam sistem yedeğini yalnızca Süper Admin doğrulayabilir ve geri yükleyebilir.", FileName = fileName };

                    var dbEntry = archive.GetEntry("ogretmenajanda.db");
                    if (dbEntry == null)
                        return new BackupValidationResult { IsValid = false, Message = "Tam yedek içinde ogretmenajanda.db bulunamadı.", FileName = fileName };

                    var tempVerifyPath = Path.Combine(_backupsDir, $"verify_{Guid.NewGuid():N}.db");
                    try
                    {
                        dbEntry.ExtractToFile(tempVerifyPath, true);
                        var sha = ComputeFileSha256(tempVerifyPath);
                        if (!string.IsNullOrEmpty(manifest.Sha256) && !string.Equals(sha, manifest.Sha256, StringComparison.OrdinalIgnoreCase))
                        {
                            return new BackupValidationResult { IsValid = false, Message = "SHA-256 bütünlük doğrulaması başarısız! Dosya bozulmuş veya değiştirilmiş.", FileName = fileName, Manifest = manifest };
                        }

                        using var conn = new SqliteConnection($"Data Source={tempVerifyPath};Pooling=False");
                        await conn.OpenAsync();
                        using var cmd = conn.CreateCommand();
                        cmd.CommandText = "PRAGMA integrity_check;";
                        var integrity = (await cmd.ExecuteScalarAsync())?.ToString() ?? "";
                        if (!string.Equals(integrity, "ok", StringComparison.OrdinalIgnoreCase))
                        {
                            return new BackupValidationResult { IsValid = false, Message = $"SQLite bütünlük testi başarısız: {integrity}", FileName = fileName, Manifest = manifest };
                        }
                    }
                    finally
                    {
                        try { if (File.Exists(tempVerifyPath)) File.Delete(tempVerifyPath); } catch { }
                    }
                }
                else if (manifest.Scope == "school")
                {
                    if (targetSchoolId.HasValue && targetSchoolId.Value != Guid.Empty && manifest.SchoolId != targetSchoolId.Value && !isSuperAdmin)
                    {
                        return new BackupValidationResult
                        {
                            IsValid = false,
                            Message = $"Bu yedek başka bir okula ({manifest.SchoolName ?? manifest.SchoolCode}) aittir. Güvenlik nedeniyle geri yüklenemez.",
                            FileName = fileName,
                            Manifest = manifest
                        };
                    }

                    var dataEntry = archive.GetEntry("school_data.json");
                    if (dataEntry == null)
                        return new BackupValidationResult { IsValid = false, Message = "Okul yedeği içinde school_data.json bulunamadı.", FileName = fileName };

                    using var ms = new MemoryStream();
                    using (var es = dataEntry.Open())
                    {
                        await es.CopyToAsync(ms);
                    }
                    var sha = ComputeBytesSha256(ms.ToArray());
                    if (!string.IsNullOrEmpty(manifest.Sha256) && !string.Equals(sha, manifest.Sha256, StringComparison.OrdinalIgnoreCase))
                    {
                        return new BackupValidationResult { IsValid = false, Message = "SHA-256 bütünlük doğrulaması başarısız!", FileName = fileName, Manifest = manifest };
                    }
                }

                return new BackupValidationResult
                {
                    IsValid = true,
                    Message = "Yedek dosyası doğrulandı ve geri yüklemeye uygun.",
                    FileName = fileName,
                    SizeBytes = fi.Length,
                    Manifest = manifest
                };
            }
            catch (Exception ex)
            {
                return new BackupValidationResult { IsValid = false, Message = $"Yedek doğrulama hatası: {ex.Message}", FileName = fileName };
            }
        }

        public async Task<(bool success, string message, BackupManifest? manifest)> RestoreBackupAsync(AppDbContext context, string fileName, Guid? targetSchoolId, bool isSuperAdmin)
        {
            var validation = await ValidateBackupAsync(fileName, targetSchoolId, isSuperAdmin);
            if (!validation.IsValid || validation.Manifest == null)
            {
                return (false, validation.Message, validation.Manifest);
            }

            var manifest = validation.Manifest;
            var fullZipPath = Path.Combine(_backupsDir, fileName);

            if (manifest.Scope == "full")
            {
                if (!isSuperAdmin)
                    return (false, "Tam sistem geri yükleme yetkisi yalnızca Süper Admin'e aittir.", manifest);

                // 1. Otomatik güvenlik yedeği al
                await CreateFullBackupAsync(context, "safety", $"Tam geri yükleme öncesi otomatik güvenlik yedeği ({fileName})");

                await BackupLock.WaitAsync();
                var tempRestoreDb = Path.Combine(_backupsDir, $"restore_{Guid.NewGuid():N}.db");
                try
                {
                    using (var archive = ZipFile.OpenRead(fullZipPath))
                    {
                        var dbEntry = archive.GetEntry("ogretmenajanda.db");
                        if (dbEntry == null)
                            return (false, "ogretmenajanda.db bulunamadı.", manifest);
                        dbEntry.ExtractToFile(tempRestoreDb, true);
                    }

                    // Canlı SQLite veritabanına SqliteConnection.BackupDatabase API'si ile atomik geri yükleme
                    var liveConnStr = context.Database.GetConnectionString() ?? "Data Source=ogretmenajanda.db";
                    using (var sourceConn = new SqliteConnection($"Data Source={tempRestoreDb};Pooling=False"))
                    using (var destConn = new SqliteConnection(liveConnStr))
                    {
                        await sourceConn.OpenAsync();
                        await destConn.OpenAsync();
                        sourceConn.BackupDatabase(destConn);
                    }

                    // Şema ileri uyumluluğu için DbInitializer çalıştır
                    await DbInitializer.InitializeAsync(context);

                    return (true, $"Tam sistem yedeği ({fileName}) başarıyla geri yüklendi ve şema doğrulandı.", manifest);
                }
                finally
                {
                    try { if (File.Exists(tempRestoreDb)) File.Delete(tempRestoreDb); } catch { }
                    BackupLock.Release();
                }
            }
            else
            {
                // Okul Bazlı Geri Yükleme
                var effectiveSchoolId = manifest.SchoolId ?? targetSchoolId;
                if (!effectiveSchoolId.HasValue || effectiveSchoolId.Value == Guid.Empty)
                    return (false, "Okul kimliği belirlenemedi.", manifest);

                if (!isSuperAdmin && targetSchoolId.HasValue && targetSchoolId.Value != effectiveSchoolId.Value)
                    return (false, "Başka bir okulun yedeğini geri yükleyemezsiniz.", manifest);

                // 1. Önce ilgili okulun güvenlik yedeğini al
                try
                {
                    if (await context.Schools.AnyAsync(s => s.Id == effectiveSchoolId.Value))
                    {
                        await CreateSchoolBackupAsync(context, effectiveSchoolId.Value, "safety", $"Okul geri yükleme öncesi güvenlik yedeği ({fileName})");
                    }
                }
                catch { }

                await BackupLock.WaitAsync();
                try
                {
                    SchoolBackupPayload? payload;
                    using (var archive = ZipFile.OpenRead(fullZipPath))
                    {
                        var dataEntry = archive.GetEntry("school_data.json");
                        if (dataEntry == null)
                            return (false, "school_data.json bulunamadı.", manifest);

                        using var s = dataEntry.Open();
                        payload = await JsonSerializer.DeserializeAsync<SchoolBackupPayload>(s, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
                    }

                    if (payload == null || payload.School == null)
                        return (false, "Okul yedek verisi okunamadı.", manifest);

                    var sid = payload.School.Id;
                    using var tx = await context.Database.BeginTransactionAsync();
                    try
                    {
                        // Mevcut okul verilerini temizle
                        var existingSchool = await context.Schools.FirstOrDefaultAsync(s => s.Id == sid);
                        if (existingSchool == null)
                        {
                            await context.Schools.AddAsync(payload.School);
                        }
                        else
                        {
                            context.Entry(existingSchool).CurrentValues.SetValues(payload.School);
                        }

                        context.SchoolClasses.RemoveRange(await context.SchoolClasses.Where(x => x.SchoolId == sid).ToListAsync());
                        context.SchoolLessons.RemoveRange(await context.SchoolLessons.Where(x => x.SchoolId == sid).ToListAsync());
                        context.ScheduleItems.RemoveRange(await context.ScheduleItems.Where(x => x.SchoolId == sid).ToListAsync());
                        context.TeacherDuties.RemoveRange(await context.TeacherDuties.Where(x => x.SchoolId == sid).ToListAsync());
                        context.YearlyPlanItems.RemoveRange(await context.YearlyPlanItems.Where(x => x.SchoolId == sid).ToListAsync());

                        var oldAssignments = await context.Assignments.Where(x => x.SchoolId == sid).ToListAsync();
                        var oldAssIds = oldAssignments.Select(a => a.Id).ToList();
                        if (oldAssIds.Count > 0)
                        {
                            context.AssignmentSubmissions.RemoveRange(await context.AssignmentSubmissions.Where(sub => oldAssIds.Contains(sub.AssignmentId)).ToListAsync());
                        }
                        context.Assignments.RemoveRange(oldAssignments);
                        context.StudentEvaluations.RemoveRange(await context.StudentEvaluations.Where(x => x.SchoolId == sid).ToListAsync());
                        context.Students.RemoveRange(await context.Students.Where(x => x.SchoolId == sid).ToListAsync());

                        context.ExamHalls.RemoveRange(await context.ExamHalls.Where(x => x.SchoolId == sid).ToListAsync());
                        context.WrittenExams.RemoveRange(await context.WrittenExams.Where(x => x.SchoolId == sid).ToListAsync());
                        context.ExamSeatings.RemoveRange(await context.ExamSeatings.Where(x => x.SchoolId == sid).ToListAsync());

                        context.OptikFormlar.RemoveRange(await context.OptikFormlar.Include(f => f.Dersler).Where(x => x.SchoolId == sid).ToListAsync());
                        context.OptikSinavlar.RemoveRange(await context.OptikSinavlar.Include(e => e.Dersler).Where(x => x.SchoolId == sid).ToListAsync());
                        context.OptikSoruKazanimlari.RemoveRange(await context.OptikSoruKazanimlari.Where(x => x.SchoolId == sid).ToListAsync());
                        context.OptikSinavSonuclari.RemoveRange(await context.OptikSinavSonuclari.Include(r => r.DersSonuclari).Where(x => x.SchoolId == sid).ToListAsync());
                        context.OptikSinavSonucKazanimlari.RemoveRange(await context.OptikSinavSonucKazanimlari.Where(x => x.SchoolId == sid).ToListAsync());
                        context.ClassAttendanceDefinitions.RemoveRange(await context.ClassAttendanceDefinitions.Where(x => x.SchoolId == sid).ToListAsync());
                        context.DailyClassAttendances.RemoveRange(await context.DailyClassAttendances.Where(x => x.SchoolId == sid).ToListAsync());

                        await context.SaveChangesAsync();

                        // Yedekten verileri geri ekle
                        if (payload.Classes.Any()) await context.SchoolClasses.AddRangeAsync(payload.Classes);
                        if (payload.Lessons.Any()) await context.SchoolLessons.AddRangeAsync(payload.Lessons);
                        if (payload.Students.Any()) await context.Students.AddRangeAsync(payload.Students);
                        if (payload.Schedules.Any()) await context.ScheduleItems.AddRangeAsync(payload.Schedules);
                        if (payload.Duties.Any()) await context.TeacherDuties.AddRangeAsync(payload.Duties);
                        if (payload.YearlyPlans.Any()) await context.YearlyPlanItems.AddRangeAsync(payload.YearlyPlans);
                        if (payload.Assignments.Any()) await context.Assignments.AddRangeAsync(payload.Assignments);
                        if (payload.AssignmentSubmissions.Any()) await context.AssignmentSubmissions.AddRangeAsync(payload.AssignmentSubmissions);
                        if (payload.Evaluations.Any()) await context.StudentEvaluations.AddRangeAsync(payload.Evaluations);
                        if (payload.ExamHalls.Any()) await context.ExamHalls.AddRangeAsync(payload.ExamHalls);
                        if (payload.WrittenExams.Any()) await context.WrittenExams.AddRangeAsync(payload.WrittenExams);
                        if (payload.ExamSeatings.Any()) await context.ExamSeatings.AddRangeAsync(payload.ExamSeatings);
                        if (payload.OptikFormlar.Any()) await context.OptikFormlar.AddRangeAsync(payload.OptikFormlar);
                        if (payload.OptikSinavlar.Any()) await context.OptikSinavlar.AddRangeAsync(payload.OptikSinavlar);
                        if (payload.OptikSoruKazanimlari.Any()) await context.OptikSoruKazanimlari.AddRangeAsync(payload.OptikSoruKazanimlari);
                        if (payload.OptikSinavSonuclari.Any()) await context.OptikSinavSonuclari.AddRangeAsync(payload.OptikSinavSonuclari);
                        if (payload.OptikSinavSonucKazanimlari.Any()) await context.OptikSinavSonucKazanimlari.AddRangeAsync(payload.OptikSinavSonucKazanimlari);
                        if (payload.ClassAttendanceDefinitions.Any()) await context.ClassAttendanceDefinitions.AddRangeAsync(payload.ClassAttendanceDefinitions);
                        if (payload.DailyClassAttendances.Any()) await context.DailyClassAttendances.AddRangeAsync(payload.DailyClassAttendances);

                        // Öğretmen/Personel kayıtlarını eşle (varsa güncelle, yoksa ekle)
                        foreach (var u in payload.Users)
                        {
                            var existingUser = await context.Users.FirstOrDefaultAsync(x => x.Id == u.Id);
                            if (existingUser == null)
                            {
                                await context.Users.AddAsync(u);
                            }
                            else
                            {
                                context.Entry(existingUser).CurrentValues.SetValues(u);
                            }
                        }

                        await context.SaveChangesAsync();
                        await tx.CommitAsync();

                        return (true, $"'{payload.School.Name}' okul yedeği ({payload.Students.Count} öğrenci, {payload.Schedules.Count} ders saati, {payload.OptikSinavlar.Count} optik sınav) başarıyla geri yüklendi.", manifest);
                    }
                    catch (Exception ex)
                    {
                        await tx.RollbackAsync();
                        return (false, $"Okul geri yükleme sırasında hata oluştu (işlem geri alındı): {ex.Message}", manifest);
                    }
                }
                finally
                {
                    BackupLock.Release();
                }
            }
        }

        public bool DeleteBackup(string fileName, Guid? schoolId, bool isSuperAdmin, out string error)
        {
            error = string.Empty;
            if (!IsSafeFileName(fileName))
            {
                error = "Geçersiz dosya adı.";
                return false;
            }

            var fullPath = Path.Combine(_backupsDir, fileName);
            if (!File.Exists(fullPath))
            {
                error = "Yedek dosyası bulunamadı.";
                return false;
            }

            var manifest = ReadManifestFromZip(fullPath);
            if (!isSuperAdmin)
            {
                if (manifest == null || manifest.Scope != "school" || !schoolId.HasValue || manifest.SchoolId != schoolId.Value)
                {
                    error = "Bu yedek dosyasını silme yetkiniz yok.";
                    return false;
                }
            }

            try
            {
                File.Delete(fullPath);
                return true;
            }
            catch (Exception ex)
            {
                error = ex.Message;
                return false;
            }
        }

        public string? GetBackupFilePath(string fileName, Guid? schoolId, bool isSuperAdmin)
        {
            if (!IsSafeFileName(fileName)) return null;
            var fullPath = Path.Combine(_backupsDir, fileName);
            if (!File.Exists(fullPath)) return null;

            if (!isSuperAdmin)
            {
                var manifest = ReadManifestFromZip(fullPath);
                if (manifest == null || manifest.Scope != "school" || !schoolId.HasValue || manifest.SchoolId != schoolId.Value)
                    return null;
            }
            return fullPath;
        }

        public async Task EnforceRetentionAndQuotaAsync()
        {
            await BackupLock.WaitAsync();
            try
            {
                await EnforceRetentionAndQuotaInternalAsync();
            }
            finally
            {
                BackupLock.Release();
            }
        }

        private Task EnforceRetentionAndQuotaInternalAsync()
        {
            try
            {
                var settings = GetSettings();
                var cutoffUtc = DateTime.UtcNow.AddDays(-settings.RetentionDays);
                var files = Directory.GetFiles(_backupsDir, "*.zip")
                    .Select(f => new FileInfo(f))
                    .OrderByDescending(f => f.CreationTimeUtc)
                    .ToList();

                // En az son 3 yedeği her zaman koru; daha eskilerden süresi dolanları sil
                for (int i = 3; i < files.Count; i++)
                {
                    if (files[i].CreationTimeUtc < cutoffUtc)
                    {
                        try { files[i].Delete(); } catch { }
                    }
                }

                // Kota kontrolü
                files = Directory.GetFiles(_backupsDir, "*.zip")
                    .Select(f => new FileInfo(f))
                    .OrderByDescending(f => f.CreationTimeUtc)
                    .ToList();

                long maxBytes = (long)settings.MaxQuotaMb * 1024L * 1024L;
                long currentBytes = files.Sum(f => f.Length);

                while (currentBytes > maxBytes && files.Count > 2)
                {
                    var oldest = files.Last();
                    currentBytes -= oldest.Length;
                    try { oldest.Delete(); } catch { }
                    files.RemoveAt(files.Count - 1);
                }
            }
            catch { }
            return Task.CompletedTask;
        }

        private static BackupManifest? ReadManifestFromZip(string zipPath)
        {
            try
            {
                using var archive = ZipFile.OpenRead(zipPath);
                var entry = archive.GetEntry("manifest.json");
                if (entry == null) return null;
                using var s = entry.Open();
                return JsonSerializer.Deserialize<BackupManifest>(s, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
            }
            catch
            {
                return null;
            }
        }

        private static string ComputeFileSha256(string filePath)
        {
            using var sha = SHA256.Create();
            using var stream = File.OpenRead(filePath);
            var hash = sha.ComputeHash(stream);
            return BitConverter.ToString(hash).Replace("-", "").ToLowerInvariant();
        }

        private static string ComputeBytesSha256(byte[] bytes)
        {
            using var sha = SHA256.Create();
            var hash = sha.ComputeHash(bytes);
            return BitConverter.ToString(hash).Replace("-", "").ToLowerInvariant();
        }

        private static string SanitizeToken(string? input)
        {
            if (string.IsNullOrWhiteSpace(input)) return "backup";
            var clean = Regex.Replace(input.Trim(), @"[^A-Za-z0-9_\-]", "");
            return string.IsNullOrEmpty(clean) ? "backup" : clean.ToLowerInvariant();
        }
    }

    public class BackupSchedulerService : BackgroundService
    {
        private readonly IServiceProvider _serviceProvider;
        private readonly IBackupService _backupService;

        public BackupSchedulerService(IServiceProvider serviceProvider, IBackupService backupService)
        {
            _serviceProvider = serviceProvider;
            _backupService = backupService;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            // Başlangıçtan 30 saniye sonra ilk kontrolü yap
            try { await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken); } catch { return; }

            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    var settings = _backupService.GetSettings();
                    if (settings.AutoBackupEnabled)
                    {
                        var nowUtc = DateTime.UtcNow;
                        var trNow = nowUtc.AddHours(3);
                        bool neverBackedUp = !settings.LastAutoBackupUtc.HasValue;
                        bool moreThan23Hours = settings.LastAutoBackupUtc.HasValue && (nowUtc - settings.LastAutoBackupUtc.Value).TotalHours >= 23;
                        bool isTargetHour = trNow.Hour == settings.AutoBackupHourTr;

                        // Eğer hiç otomatik yedek alınmadıysa veya hedef saatte 23+ saat geçtiyse
                        if (neverBackedUp || (isTargetHour && moreThan23Hours) || (settings.LastAutoBackupUtc.HasValue && (nowUtc - settings.LastAutoBackupUtc.Value).TotalHours >= 24))
                        {
                            using var scope = _serviceProvider.CreateScope();
                            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                            await _backupService.CreateFullBackupAsync(db, "auto", "Zamanlanmış günlük otomatik sistem yedeği");
                            settings.LastAutoBackupUtc = nowUtc;
                            _backupService.SaveSettings(settings);
                        }
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[BackupSchedulerService] Otomatik yedek hatası: {ex.Message}");
                }

                try
                {
                    await Task.Delay(TimeSpan.FromMinutes(30), stoppingToken);
                }
                catch
                {
                    break;
                }
            }
        }
    }
}

