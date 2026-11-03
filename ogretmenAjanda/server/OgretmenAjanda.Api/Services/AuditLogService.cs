using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using OgretmenAjanda.Api.Data;
using OgretmenAjanda.Api.Models;

namespace OgretmenAjanda.Api.Services
{
    public interface IAuditLogService
    {
        Task LogAsync(
            AppDbContext context,
            Guid? schoolId,
            Guid userId,
            string? userName,
            string? userFullName,
            string userRole,
            string actionType,
            string entityName,
            string? entityId,
            string description,
            string? detailsJson = null,
            string? ipAddress = null
        );

        Task<object> GetSchoolLogsAsync(
            AppDbContext context,
            Guid schoolId,
            Guid? userId = null,
            string? userRole = null,
            string? actionType = null,
            string? search = null,
            DateTime? startDate = null,
            DateTime? endDate = null,
            int limit = 200,
            string? device = null
        );

        Task<(byte[] content, string contentType, string fileName)> ExportLogsAsync(
            AppDbContext context,
            Guid schoolId,
            string format,
            Guid? userId = null,
            string? userRole = null,
            string? actionType = null,
            string? search = null,
            DateTime? startDate = null,
            DateTime? endDate = null,
            string? device = null
        );
    }

    public class AuditLogService : IAuditLogService
    {
        private static readonly object _fileLock = new object();
        private readonly string _logsDirectory;

        public AuditLogService()
        {
            _logsDirectory = Path.Combine(Directory.GetCurrentDirectory(), "logs");
            if (!Directory.Exists(_logsDirectory))
            {
                Directory.CreateDirectory(_logsDirectory);
            }
        }

        public async Task LogAsync(
            AppDbContext context,
            Guid? schoolId,
            Guid userId,
            string? userName,
            string? userFullName,
            string userRole,
            string actionType,
            string entityName,
            string? entityId,
            string description,
            string? detailsJson = null,
            string? ipAddress = null
        )
        {
            var now = DateTime.UtcNow;

            // 1. Veritabanına Kaydet
            var log = new AuditLog
            {
                Id = Guid.NewGuid(),
                SchoolId = schoolId,
                UserId = userId,
                UserName = userName,
                UserFullName = userFullName,
                UserRole = userRole,
                ActionType = actionType.ToUpperInvariant(),
                EntityName = entityName,
                EntityId = entityId,
                Description = description,
                DetailsJson = detailsJson,
                Timestamp = now,
                IpAddress = ipAddress
            };

            await context.AuditLogs.AddAsync(log);

            // 2. Fiziksel Log Dosyasına Yaz (Disk Logu)
            try
            {
                var trTime = now.AddHours(3); // Türkiye saati
                var logLine = $"[{trTime:yyyy-MM-dd HH:mm:ss}] [IP: {ipAddress ?? "local"}] " +
                              $"[USER: {userName ?? "Sistem"} ({userFullName ?? "-"})] [ROLE: {userRole}] " +
                              $"[ACTION: {actionType}] [ENTITY: {entityName} #{entityId ?? "-"}] " +
                              $"DESC: {description}" +
                              (string.IsNullOrEmpty(detailsJson) ? "" : $" | DETAILS: {detailsJson}");

                lock (_fileLock)
                {
                    // Genel aylık log dosyası
                    var globalFile = Path.Combine(_logsDirectory, $"audit_all_{now:yyyyMM}.log");
                    File.AppendAllText(globalFile, logLine + Environment.NewLine, Encoding.UTF8);

                    // Okula özel log dosyası
                    if (schoolId.HasValue && schoolId.Value != Guid.Empty)
                    {
                        var schoolFile = Path.Combine(_logsDirectory, $"school_{schoolId.Value}_{now:yyyyMM}.log");
                        File.AppendAllText(schoolFile, logLine + Environment.NewLine, Encoding.UTF8);
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[AuditLogService] Log dosyası yazma hatası: {ex.Message}");
            }
        }

        public static (string DeviceType, string PlatformDetail) DetectClientDevice(HttpRequest? request)
        {
            string device = "PC";
            string platform = "PC (Web)";

            if (request == null) return (device, platform);

            // 1. İstemciden gelen açık başlıklar
            if (request.Headers.TryGetValue("X-Client-Device", out var devVal) && !string.IsNullOrWhiteSpace(devVal))
            {
                var rawDev = devVal.ToString().Trim();
                if (rawDev.Equals("Mobil", StringComparison.OrdinalIgnoreCase) || rawDev.Equals("Mobile", StringComparison.OrdinalIgnoreCase))
                    device = "Mobil";
                else if (rawDev.Equals("PC", StringComparison.OrdinalIgnoreCase))
                    device = "PC";
            }

            if (request.Headers.TryGetValue("X-Client-Platform", out var platVal) && !string.IsNullOrWhiteSpace(platVal))
            {
                platform = platVal.ToString().Trim();
                return (device, platform);
            }

            // 2. User-Agent incelemesi
            var ua = request.Headers["User-Agent"].ToString() ?? "";
            if (!string.IsNullOrWhiteSpace(ua))
            {
                bool isMobile = ua.Contains("Android", StringComparison.OrdinalIgnoreCase) ||
                                ua.Contains("iPhone", StringComparison.OrdinalIgnoreCase) ||
                                ua.Contains("iPad", StringComparison.OrdinalIgnoreCase) ||
                                ua.Contains("iPod", StringComparison.OrdinalIgnoreCase) ||
                                ua.Contains("Mobile", StringComparison.OrdinalIgnoreCase) ||
                                ua.Contains("Tablet", StringComparison.OrdinalIgnoreCase);

                if (isMobile)
                {
                    device = "Mobil";
                    if (ua.Contains("Android", StringComparison.OrdinalIgnoreCase))
                        platform = "Mobil (Android)";
                    else if (ua.Contains("iPhone", StringComparison.OrdinalIgnoreCase) || ua.Contains("iPad", StringComparison.OrdinalIgnoreCase))
                        platform = "Mobil (iOS)";
                    else
                        platform = "Mobil Cihaz";
                }
                else
                {
                    device = "PC";
                    if (ua.Contains("Windows", StringComparison.OrdinalIgnoreCase))
                        platform = "PC (Windows)";
                    else if (ua.Contains("Macintosh", StringComparison.OrdinalIgnoreCase) || ua.Contains("Mac OS", StringComparison.OrdinalIgnoreCase))
                        platform = "PC (macOS)";
                    else if (ua.Contains("Linux", StringComparison.OrdinalIgnoreCase))
                        platform = "PC (Linux)";
                    else
                        platform = "PC (Masaüstü)";
                }
            }

            return (device, platform);
        }

        public static (string DeviceType, string PlatformDetail) ExtractDeviceFromDetails(string? detailsJson, string? ipAddress)
        {
            if (!string.IsNullOrEmpty(detailsJson))
            {
                try
                {
                    using var doc = System.Text.Json.JsonDocument.Parse(detailsJson);
                    var root = doc.RootElement;
                    string? dev = null;
                    string? plat = null;

                    if (root.TryGetProperty("device", out var dProp)) dev = dProp.GetString();
                    if (root.TryGetProperty("platform", out var pProp)) plat = pProp.GetString();

                    if (!string.IsNullOrEmpty(dev) || !string.IsNullOrEmpty(plat))
                    {
                        var dt = (dev != null && (dev.Equals("Mobil", StringComparison.OrdinalIgnoreCase) || dev.Equals("Mobile", StringComparison.OrdinalIgnoreCase))) ? "Mobil" : (dev != null && dev.Equals("PC", StringComparison.OrdinalIgnoreCase) ? "PC" : "Bilinmiyor");
                        return (dt, plat ?? dt);
                    }
                }
                catch { }
            }
            return ("Bilinmiyor", "Bilinmiyor");
        }

        public async Task<object> GetSchoolLogsAsync(
            AppDbContext context,
            Guid schoolId,
            Guid? userId = null,
            string? userRole = null,
            string? actionType = null,
            string? search = null,
            DateTime? startDate = null,
            DateTime? endDate = null,
            int limit = 200,
            string? device = null
        )
        {
            var school = await context.Schools.FindAsync(schoolId);
            var customerId = school?.CustomerId;
            var relationId = school?.RelationId;
            var schoolIdStr = schoolId.ToString();

            // Okulla ilişkili tüm kullanıcı ID'lerini bul (öğretmenler dahil)
            var schoolUserIds = await context.Users
                .Where(u =>
                    u.SchoolId == schoolId ||
                    (school != null && u.Id == school.AdminUserId) ||
                    (!string.IsNullOrEmpty(u.AssignedSchoolIdsJson) && u.AssignedSchoolIdsJson.Contains(schoolIdStr)) ||
                    (!u.SchoolId.HasValue && (
                        (!string.IsNullOrEmpty(customerId) && u.CustomerId == customerId) ||
                        (!string.IsNullOrEmpty(relationId) && u.RelationId == relationId)
                    ))
                )
                .Select(u => u.Id)
                .Distinct()
                .ToListAsync();

            // SchoolId doğrudan okul ID'si olanlar VEYA SchoolId null olup bu okula bağlı olan öğretmenlerin logları
            var query = context.AuditLogs.Where(l =>
                l.SchoolId == schoolId ||
                (l.SchoolId == null && schoolUserIds.Contains(l.UserId))
            );

            // Cihaz filtresi (PC vs Mobil)
            if (!string.IsNullOrWhiteSpace(device) && device.ToLowerInvariant() != "all")
            {
                var dev = device.Trim().ToLowerInvariant();
                if (dev == "pc")
                {
                    query = query.Where(l =>
                        (l.DetailsJson != null && (l.DetailsJson.Contains("\"device\":\"PC\"") || l.DetailsJson.Contains("\"device\": \"PC\"") || l.DetailsJson.Contains("\"device\":\"pc\""))) ||
                        (l.Description != null && l.Description.Contains("[PC]"))
                    );
                }
                else if (dev == "mobil" || dev == "mobile")
                {
                    query = query.Where(l =>
                        (l.DetailsJson != null && (l.DetailsJson.Contains("\"device\":\"Mobil\"") || l.DetailsJson.Contains("\"device\": \"Mobil\"") || l.DetailsJson.Contains("\"device\":\"mobil\""))) ||
                        (l.Description != null && (l.Description.Contains("[Mobil]") || l.Description.Contains("[Mobile]")))
                    );
                }
            }

            // Kullanıcı filtresi
            if (userId.HasValue && userId.Value != Guid.Empty)
            {
                query = query.Where(l => l.UserId == userId.Value);
            }

            // Rol filtresi
            if (!string.IsNullOrWhiteSpace(userRole) && userRole != "all")
            {
                query = query.Where(l => l.UserRole.ToLower() == userRole.Trim().ToLower());
            }

            // İşlem türü filtresi
            if (!string.IsNullOrWhiteSpace(actionType) && actionType != "all")
            {
                query = query.Where(l => l.ActionType.ToLower() == actionType.Trim().ToLower());
            }

            // Zaman filtresi (Başlangıç)
            if (startDate.HasValue)
            {
                var utcStart = startDate.Value.ToUniversalTime();
                query = query.Where(l => l.Timestamp >= utcStart);
            }

            // Zaman filtresi (Bitiş)
            if (endDate.HasValue)
            {
                var utcEnd = endDate.Value.ToUniversalTime().AddDays(1);
                query = query.Where(l => l.Timestamp < utcEnd);
            }

            // Metin arama (Kullanıcı adı, isim, açıklama veya detayda)
            if (!string.IsNullOrWhiteSpace(search))
            {
                var s = search.Trim().ToLower();
                query = query.Where(l =>
                    (l.Description != null && l.Description.ToLower().Contains(s)) ||
                    (l.UserName != null && l.UserName.ToLower().Contains(s)) ||
                    (l.UserFullName != null && l.UserFullName.ToLower().Contains(s)) ||
                    (l.ActionType.ToLower().Contains(s)) ||
                    (l.EntityName.ToLower().Contains(s)) ||
                    (l.DetailsJson != null && l.DetailsJson.ToLower().Contains(s))
                );
            }

            var totalCount = await query.CountAsync();

            var todayUtcStart = DateTime.UtcNow.Date;
            var todayCount = await context.AuditLogs
                .Where(l => (l.SchoolId == schoolId || (l.SchoolId == null && schoolUserIds.Contains(l.UserId))) && l.Timestamp >= todayUtcStart)
                .CountAsync();

            var logs = await query
                .OrderByDescending(l => l.Timestamp)
                .Take(limit)
                .ToListAsync();

            // Eğer eski loglarda UserName veya UserFullName boş kalmışsa Users tablosundan eşle
            var missingUserIds = logs
                .Where(l => string.IsNullOrEmpty(l.UserFullName) && l.UserId != Guid.Empty)
                .Select(l => l.UserId)
                .Distinct()
                .ToList();

            if (missingUserIds.Any())
            {
                var userMap = await context.Users
                    .Where(u => missingUserIds.Contains(u.Id))
                    .ToDictionaryAsync(u => u.Id, u => new { u.Username, u.FullName });

                foreach (var logItem in logs)
                {
                    if (string.IsNullOrEmpty(logItem.UserFullName) && userMap.TryGetValue(logItem.UserId, out var uInfo))
                    {
                        logItem.UserName = uInfo.Username;
                        logItem.UserFullName = uInfo.FullName;
                    }
                }
            }

            // Hala eksik kalan varsa Students tablosundan da eşle (Öğrenci işlemleri)
            var stillMissing = logs
                .Where(l => string.IsNullOrEmpty(l.UserFullName) && l.UserId != Guid.Empty)
                .Select(l => l.UserId)
                .Distinct()
                .ToList();

            if (stillMissing.Any())
            {
                var studentMap = await context.Students
                    .Where(s => stillMissing.Contains(s.Id))
                    .ToDictionaryAsync(s => s.Id, s => new { s.StudentNumber, s.FullName });

                foreach (var logItem in logs)
                {
                    if (string.IsNullOrEmpty(logItem.UserFullName) && studentMap.TryGetValue(logItem.UserId, out var sInfo))
                    {
                        logItem.UserName = sInfo.StudentNumber;
                        logItem.UserFullName = sInfo.FullName;
                    }
                }
            }

            // Filtre dropdownları için okuldaki kullanıcılar (öğretmenler ve personel dahil)
            var schoolUsers = await context.Users
                .Where(u =>
                    u.SchoolId == schoolId ||
                    (school != null && u.Id == school.AdminUserId) ||
                    (!string.IsNullOrEmpty(u.AssignedSchoolIdsJson) && u.AssignedSchoolIdsJson.Contains(schoolIdStr)) ||
                    (!u.SchoolId.HasValue && (
                        (!string.IsNullOrEmpty(customerId) && u.CustomerId == customerId) ||
                        (!string.IsNullOrEmpty(relationId) && u.RelationId == relationId)
                    ))
                )
                .Select(u => new
                {
                    id = u.Id,
                    username = u.Username,
                    fullName = u.FullName,
                    role = u.Role
                })
                .OrderBy(u => u.fullName)
                .ToListAsync();

            // Okulda gerçekleşen tüm işlem türleri listesi
            var distinctActionTypes = await context.AuditLogs
                .Where(l => l.SchoolId == schoolId || (l.SchoolId == null && schoolUserIds.Contains(l.UserId)))
                .Select(l => l.ActionType)
                .Distinct()
                .ToListAsync();

            var trCulture = new System.Globalization.CultureInfo("tr-TR");
            var nowTr = DateTime.UtcNow.AddHours(3);

            var enhancedLogs = logs.Select(l =>
            {
                var logTr = l.Timestamp.AddHours(3);
                var diff = nowTr - logTr;

                string relativeTime;
                if (diff.TotalMinutes < 1) relativeTime = "Az önce";
                else if (diff.TotalMinutes < 60) relativeTime = $"{(int)diff.TotalMinutes} dakika önce";
                else if (diff.TotalHours < 24 && logTr.Date == nowTr.Date) relativeTime = $"Bugün, {logTr:HH:mm}";
                else if (logTr.Date == nowTr.Date.AddDays(-1)) relativeTime = $"Dün, {logTr:HH:mm}";
                else relativeTime = logTr.ToString("d MMMM yyyy, HH:mm", trCulture);

                var actionTitle = GetActionTitle(l.ActionType);
                var resolvedName = !string.IsNullOrEmpty(l.UserFullName) ? l.UserFullName : (!string.IsNullOrEmpty(l.UserName) ? l.UserName : "Sistem");
                var roleLabel = GetRoleLabel(l.UserRole);

                var desc = l.Description;
                if (string.IsNullOrWhiteSpace(desc))
                {
                    desc = !string.IsNullOrWhiteSpace(l.DetailsJson) ? l.DetailsJson : actionTitle;
                }

                var (deviceType, platformDetail) = ExtractDeviceFromDetails(l.DetailsJson, l.IpAddress);
                if (deviceType == "Bilinmiyor")
                {
                    if (l.Description != null && (l.Description.Contains("[Mobil]") || l.Description.Contains("[Mobile]")))
                    {
                        deviceType = "Mobil";
                        platformDetail = "Mobil Cihaz";
                    }
                    else if (l.Description != null && l.Description.Contains("[PC]"))
                    {
                        deviceType = "PC";
                        platformDetail = "PC (Web)";
                    }
                }
                string deviceLabel = deviceType == "Mobil" ? "📱 Mobil" : (deviceType == "PC" ? "💻 PC" : "❓ Bilinmiyor");

                return new
                {
                    l.Id,
                    l.SchoolId,
                    l.UserId,
                    userName = l.UserName ?? "-",
                    userFullName = resolvedName,
                    userRole = l.UserRole,
                    roleLabel = roleLabel,
                    actionType = l.ActionType,
                    actionTitle = actionTitle,
                    entityName = l.EntityName,
                    entityId = l.EntityId,
                    description = desc,
                    detailsJson = l.DetailsJson,
                    device = deviceType,
                    deviceDetail = platformDetail,
                    deviceLabel = deviceLabel,
                    timestamp = l.Timestamp,
                    localTimeString = logTr.ToString("yyyy-MM-dd HH:mm:ss"),
                    formattedDate = logTr.ToString("dd MMMM yyyy, dddd HH:mm:ss", trCulture),
                    relativeTime = relativeTime,
                    ipAddress = l.IpAddress ?? "Bilinmiyor"
                };
            }).ToList();

            return new
            {
                total = totalCount,
                todayCount = todayCount,
                logs = enhancedLogs,
                users = schoolUsers,
                actionTypes = distinctActionTypes
            };
        }

        public async Task<(byte[] content, string contentType, string fileName)> ExportLogsAsync(
            AppDbContext context,
            Guid schoolId,
            string format,
            Guid? userId = null,
            string? userRole = null,
            string? actionType = null,
            string? search = null,
            DateTime? startDate = null,
            DateTime? endDate = null,
            string? device = null
        )
        {
            var school = await context.Schools.FindAsync(schoolId);
            var customerId = school?.CustomerId;
            var relationId = school?.RelationId;
            var schoolIdStr = schoolId.ToString();

            var schoolUserIds = await context.Users
                .Where(u =>
                    u.SchoolId == schoolId ||
                    (school != null && u.Id == school.AdminUserId) ||
                    (!string.IsNullOrEmpty(u.AssignedSchoolIdsJson) && u.AssignedSchoolIdsJson.Contains(schoolIdStr)) ||
                    (!u.SchoolId.HasValue && (
                        (!string.IsNullOrEmpty(customerId) && u.CustomerId == customerId) ||
                        (!string.IsNullOrEmpty(relationId) && u.RelationId == relationId)
                    ))
                )
                .Select(u => u.Id)
                .Distinct()
                .ToListAsync();

            var query = context.AuditLogs.Where(l =>
                l.SchoolId == schoolId ||
                (l.SchoolId == null && schoolUserIds.Contains(l.UserId))
            );

            // Cihaz filtresi
            if (!string.IsNullOrWhiteSpace(device) && device.ToLowerInvariant() != "all")
            {
                var dev = device.Trim().ToLowerInvariant();
                if (dev == "pc")
                {
                    query = query.Where(l =>
                        (l.DetailsJson != null && (l.DetailsJson.Contains("\"device\":\"PC\"") || l.DetailsJson.Contains("\"device\": \"PC\"") || l.DetailsJson.Contains("\"device\":\"pc\""))) ||
                        (l.Description != null && l.Description.Contains("[PC]"))
                    );
                }
                else if (dev == "mobil" || dev == "mobile")
                {
                    query = query.Where(l =>
                        (l.DetailsJson != null && (l.DetailsJson.Contains("\"device\":\"Mobil\"") || l.DetailsJson.Contains("\"device\": \"Mobil\"") || l.DetailsJson.Contains("\"device\":\"mobil\""))) ||
                        (l.Description != null && (l.Description.Contains("[Mobil]") || l.Description.Contains("[Mobile]")))
                    );
                }
            }

            if (userId.HasValue && userId.Value != Guid.Empty)
                query = query.Where(l => l.UserId == userId.Value);

            if (!string.IsNullOrWhiteSpace(userRole) && userRole != "all")
                query = query.Where(l => l.UserRole.ToLower() == userRole.Trim().ToLower());

            if (!string.IsNullOrWhiteSpace(actionType) && actionType != "all")
                query = query.Where(l => l.ActionType.ToLower() == actionType.Trim().ToLower());

            if (startDate.HasValue)
                query = query.Where(l => l.Timestamp >= startDate.Value.ToUniversalTime());

            if (endDate.HasValue)
                query = query.Where(l => l.Timestamp < endDate.Value.ToUniversalTime().AddDays(1));

            if (!string.IsNullOrWhiteSpace(search))
            {
                var s = search.Trim().ToLower();
                query = query.Where(l =>
                    (l.Description != null && l.Description.ToLower().Contains(s)) ||
                    (l.UserName != null && l.UserName.ToLower().Contains(s)) ||
                    (l.UserFullName != null && l.UserFullName.ToLower().Contains(s)) ||
                    (l.ActionType.ToLower().Contains(s)) ||
                    (l.EntityName.ToLower().Contains(s)) ||
                    (l.DetailsJson != null && l.DetailsJson.ToLower().Contains(s))
                );
            }

            var logs = await query.OrderByDescending(l => l.Timestamp).Take(2000).ToListAsync();

            // Eksik kullanıcı isimlerini doldur
            var missingUserIds = logs
                .Where(l => string.IsNullOrEmpty(l.UserFullName) && l.UserId != Guid.Empty)
                .Select(l => l.UserId)
                .Distinct()
                .ToList();

            if (missingUserIds.Any())
            {
                var userMap = await context.Users
                    .Where(u => missingUserIds.Contains(u.Id))
                    .ToDictionaryAsync(u => u.Id, u => new { u.Username, u.FullName });

                foreach (var logItem in logs)
                {
                    if (string.IsNullOrEmpty(logItem.UserFullName) && userMap.TryGetValue(logItem.UserId, out var uInfo))
                    {
                        logItem.UserName = uInfo.Username;
                        logItem.UserFullName = uInfo.FullName;
                    }
                }
            }

            var schoolName = school?.Name ?? "Okul";
            var trCulture = new System.Globalization.CultureInfo("tr-TR");

            var timeStampStr = DateTime.UtcNow.AddHours(3).ToString("yyyyMMdd_HHmm");

            if (format.ToLowerInvariant() == "csv")
            {
                var sb = new StringBuilder();
                sb.Append('\uFEFF'); // UTF-8 BOM
                sb.AppendLine("Tarih ve Saat (TR);Cihaz;Platform;İşlem Başlığı;İşlemi Yapan (Ad Soyad);Kullanıcı Adı;Rol;İşlem Türü;Hedef/Varlık;Açıklama;Detaylar;IP Adresi");

                foreach (var log in logs)
                {
                    var trDate = log.Timestamp.AddHours(3).ToString("dd.MM.yyyy HH:mm:ss", trCulture);
                    var (deviceType, platformDetail) = ExtractDeviceFromDetails(log.DetailsJson, log.IpAddress);
                    if (deviceType == "Bilinmiyor")
                    {
                        if (log.Description != null && (log.Description.Contains("[Mobil]") || log.Description.Contains("[Mobile]")))
                        {
                            deviceType = "Mobil";
                            platformDetail = "Mobil Cihaz";
                        }
                        else if (log.Description != null && log.Description.Contains("[PC]"))
                        {
                            deviceType = "PC";
                            platformDetail = "PC (Web)";
                        }
                    }
                    var devLabel = deviceType == "Mobil" ? "Mobil" : (deviceType == "PC" ? "PC" : "Bilinmiyor");

                    var title = EscapeCsv(GetActionTitle(log.ActionType));
                    var fName = EscapeCsv(!string.IsNullOrEmpty(log.UserFullName) ? log.UserFullName : (log.UserName ?? "Sistem"));
                    var uName = EscapeCsv(log.UserName ?? "-");
                    var role = EscapeCsv(GetRoleLabel(log.UserRole));
                    var action = EscapeCsv(log.ActionType);
                    var entity = EscapeCsv($"{log.EntityName} ({log.EntityId ?? "-"})");
                    var desc = EscapeCsv(log.Description ?? log.ActionType);
                    var details = EscapeCsv(log.DetailsJson ?? "");
                    var ip = EscapeCsv(log.IpAddress ?? "-");

                    sb.AppendLine($"{trDate};{EscapeCsv(devLabel)};{EscapeCsv(platformDetail)};{title};{fName};{uName};{role};{action};{entity};{desc};{details};{ip}");
                }

                var bytes = Encoding.UTF8.GetBytes(sb.ToString());
                return (bytes, "text/csv; charset=utf-8", $"{SanitizeFileName(schoolName)}_islem_loglari_{timeStampStr}.csv");
            }
            else
            {
                var sb = new StringBuilder();
                sb.AppendLine("================================================================================");
                sb.AppendLine($"           {schoolName.ToUpperInvariant()} - SİSTEM VE İŞLEM DENETİM RAPORU");
                sb.AppendLine("================================================================================");
                sb.AppendLine($"Rapor Oluşturulma Tarihi: {DateTime.UtcNow.AddHours(3):dd MMMM yyyy, dddd HH:mm:ss} (TR)");
                sb.AppendLine($"Toplam Kayıt Sayısı: {logs.Count}");
                sb.AppendLine("--------------------------------------------------------------------------------");
                sb.AppendLine();

                foreach (var log in logs)
                {
                    var trDate = log.Timestamp.AddHours(3).ToString("dd MMMM yyyy, HH:mm:ss", trCulture);
                    var title = GetActionTitle(log.ActionType);
                    var userDisplay = !string.IsNullOrEmpty(log.UserFullName) ? log.UserFullName : (log.UserName ?? "Sistem");

                    var (deviceType, platformDetail) = ExtractDeviceFromDetails(log.DetailsJson, log.IpAddress);
                    if (deviceType == "Bilinmiyor")
                    {
                        if (log.Description != null && (log.Description.Contains("[Mobil]") || log.Description.Contains("[Mobile]")))
                        {
                            deviceType = "Mobil";
                            platformDetail = "Mobil Cihaz";
                        }
                        else if (log.Description != null && log.Description.Contains("[PC]"))
                        {
                            deviceType = "PC";
                            platformDetail = "PC (Web)";
                        }
                    }
                    string devLabel = deviceType == "Mobil" ? "📱 Mobil" : (deviceType == "PC" ? "💻 PC" : "❓ Bilinmiyor");

                    sb.AppendLine($"[{trDate}] {title} ({log.ActionType})");
                    sb.AppendLine($"    İşlemi Yapan : {userDisplay} (Kullanıcı Adı: {log.UserName ?? "-"} | Rol: {GetRoleLabel(log.UserRole)})");
                    sb.AppendLine($"    Cihaz / Ortam: {devLabel} ({platformDetail})");
                    sb.AppendLine($"    Açıklama     : {log.Description ?? log.ActionType}");
                    sb.AppendLine($"    Hedef/Varlık : {log.EntityName} (ID: {log.EntityId ?? "-"})");
                    if (!string.IsNullOrEmpty(log.DetailsJson))
                    {
                        sb.AppendLine($"    Teknik Detay : {log.DetailsJson}");
                    }
                    if (!string.IsNullOrEmpty(log.IpAddress))
                    {
                        sb.AppendLine($"    IP Adresi    : {log.IpAddress}");
                    }
                    sb.AppendLine(new string('-', 70));
                }

                var bytes = Encoding.UTF8.GetBytes(sb.ToString());
                return (bytes, "text/plain; charset=utf-8", $"{SanitizeFileName(schoolName)}_islem_loglari_{timeStampStr}.txt");
            }
        }

        private static string EscapeCsv(string val)
        {
            if (string.IsNullOrEmpty(val)) return "";
            if (val.Contains(';') || val.Contains('"') || val.Contains('\n') || val.Contains('\r'))
            {
                return $"\"{val.Replace("\"", "\"\"")}\"";
            }
            return val;
        }

        private static string SanitizeFileName(string name)
        {
            var invalid = Path.GetInvalidFileNameChars();
            var clean = new string(name.Where(c => !invalid.Contains(c) && c != ' ').ToArray());
            return string.IsNullOrEmpty(clean) ? "okul" : clean.ToLowerInvariant();
        }

        public static string GetRoleLabel(string? role)
        {
            if (string.IsNullOrWhiteSpace(role)) return "Kullanıcı";
            return role.ToUpperInvariant() switch
            {
                UserRoles.SuperAdmin => "Süper Yönetici",
                UserRoles.SchoolAdmin => "Okul Yöneticisi (Müdür)",
                UserRoles.Staff => "Müdür Yardımcısı / İdareci",
                UserRoles.Teacher => "Öğretmen",
                UserRoles.Student => "Öğrenci / Veli",
                _ => role
            };
        }

        public static string GetActionTitle(string? actionType)
        {
            if (string.IsNullOrWhiteSpace(actionType)) return "Sistem İşlemi";
            return actionType.ToUpperInvariant() switch
            {
                "LOGIN" => "🔑 Sisteme Giriş",
                "SESSION_ACTIVE" => "🟢 Oturum Yenilendi / Uygulama Açıldı",
                "QUERY_STUDENTS" => "🔍 Öğrenci Listesi Sorgulandı",
                "QUERY_SCHEDULE" => "📅 Ders Programı Sorgulandı",
                "QUERY_DUTY" => "🛡️ Nöbet / Görev Bilgisi Sorgulandı",
                "QUERY_EXAM_RESULTS" => "📊 Sınav Sonuçları Sorgulandı",
                "ATTENDANCE_SAVED" => "📋 Yoklama Kaydedildi",
                "DUTY_ASSIGNED" => "🛡️ Nöbetçi Görevi Atandı",
                "DUTY_DELETED" => "🗑️ Nöbetçi Görevi Silindi",
                "TEACHER_CREATED" => "👨‍🏫 Yeni Öğretmen Eklendi",
                "TEACHER_UPDATED" => "✏️ Öğretmen Bilgisi Güncellendi",
                "TEACHER_DELETED" => "🗑️ Öğretmen Kadrodan Silindi",
                "ALL_TEACHERS_DELETED" => "⚠️ Tüm Öğretmen Kadrosu Silindi",
                "TEACHER_REGISTERED" => "📝 Öğretmen Okula Kaydoldu",
                "BATCH_TEACHERS_SYNCED" => "📊 Öğretmen Kadrosu Excel Senkronizasyonu",
                "STUDENT_CREATED" => "🎓 Yeni Öğrenci Kaydedildi",
                "STUDENT_UPDATED" => "✏️ Öğrenci Bilgisi Güncellendi",
                "STUDENT_DELETED" => "🗑️ Öğrenci Sistemden Silindi",
                "ALL_STUDENTS_DELETED" => "⚠️ Tüm Öğrenci Kayıtları Silindi",
                "BATCH_STUDENTS_SYNCED" => "📊 Öğrenci Listesi Excel Senkronizasyonu",
                "BATCH_SCHEDULE_SYNCED" => "📅 Ders Programı Senkronizasyonu",
                "PASSWORD_RESET" => "🔒 Şifre Güncellendi / Sıfırlandı",
                "MESSAGE_SENT" => "💬 Okul İçi Mesaj Gönderildi",
                "PHOTOS_UPLOADED" => "📸 Öğrenci Fotoğrafları Yüklendi",
                "ASSIGNMENT_SYNCED" => "📚 Ödev Paylaşıldı / Güncellendi",
                "EVALUATION_CREATED" => "⭐ Öğrenci Değerlendirmesi Eklendi",
                "EVALUATION_UPDATED" => "✏️ Öğrenci Değerlendirmesi Güncellendi",
                "CLASS_CREATED" => "🏫 Yeni Şube / Sınıf Açıldı",
                "CLASS_DELETED" => "🗑️ Sınıf / Şube Silindi",
                "LESSON_CREATED" => "📖 Yeni Ders Tanımlandı",
                "LESSON_DELETED" => "🗑️ Ders Silindi",
                "SCHOOL_SETTINGS_UPDATED" => "⚙️ Okul Ayarları Güncellendi",
                "BACKUP_CREATED" => "💾 Veritabanı Yedeği Alındı",
                "BACKUP_DOWNLOADED" => "📥 Yedek Dosyası İndirildi",
                "BACKUP_UPLOADED" => "📤 Yedek Dosyası Yüklendi",
                "BACKUP_RESTORED" => "♻️ Veritabanı Yedekten Geri Yüklendi",
                "BACKUP_DELETED" => "🗑️ Yedek Dosyası Silindi",
                "OPTIK_FORM_SAVED" => "📋 Optik Form Şablonu Kaydedildi",
                "OPTIK_EXAM_SAVED" => "📝 Optik Sınav Tanımlandı / Güncellendi",
                "OPTIK_EXAM_EVALUATED" => "🎯 Optik Sınav Değerlendirildi",
                "OPTIK_VISIBILITY_UPDATED" => "👁️ Optik Sınav Görünürlük Ayarları Değiştirildi",
                _ => actionType
            };
        }
    }
}
