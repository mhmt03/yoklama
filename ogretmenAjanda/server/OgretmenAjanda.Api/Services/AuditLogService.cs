using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
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
            int limit = 200
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
            DateTime? endDate = null
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

        public async Task<object> GetSchoolLogsAsync(
            AppDbContext context,
            Guid schoolId,
            Guid? userId = null,
            string? userRole = null,
            string? actionType = null,
            string? search = null,
            DateTime? startDate = null,
            DateTime? endDate = null,
            int limit = 200
        )
        {
            var query = context.AuditLogs.Where(l => l.SchoolId == schoolId);

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
                .Where(l => l.SchoolId == schoolId && l.Timestamp >= todayUtcStart)
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

            // Filtre dropdownları için okuldaki kullanıcılar
            var schoolUsers = await context.Users
                .Where(u => u.SchoolId == schoolId || u.Role == UserRoles.SchoolAdmin)
                .Select(u => new
                {
                    id = u.Id,
                    username = u.Username,
                    fullName = u.FullName,
                    role = u.Role
                })
                .ToListAsync();

            // Okulda gerçekleşen tüm işlem türleri listesi
            var distinctActionTypes = await context.AuditLogs
                .Where(l => l.SchoolId == schoolId)
                .Select(l => l.ActionType)
                .Distinct()
                .ToListAsync();

            return new
            {
                total = totalCount,
                todayCount = todayCount,
                logs = logs.Select(l => new
                {
                    l.Id,
                    l.SchoolId,
                    l.UserId,
                    l.UserName,
                    l.UserFullName,
                    l.UserRole,
                    l.ActionType,
                    l.EntityName,
                    l.EntityId,
                    l.Description,
                    l.DetailsJson,
                    timestamp = l.Timestamp,
                    localTimeString = l.Timestamp.AddHours(3).ToString("yyyy-MM-dd HH:mm:ss"),
                    l.IpAddress
                }),
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
            DateTime? endDate = null
        )
        {
            var query = context.AuditLogs.Where(l => l.SchoolId == schoolId);

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

            var logs = await query.OrderByDescending(l => l.Timestamp).Take(1000).ToListAsync();
            var school = await context.Schools.FindAsync(schoolId);
            var schoolName = school?.Name ?? "Okul";

            var timeStampStr = DateTime.UtcNow.AddHours(3).ToString("yyyyMMdd_HHmm");

            if (format.ToLowerInvariant() == "csv")
            {
                var sb = new StringBuilder();
                // UTF-8 BOM
                sb.Append('\uFEFF');
                sb.AppendLine("Tarih/Saat (TR);Kullanıcı Adı;Ad Soyad;Rol;İşlem Türü;Varlık;Açıklama;Detay;IP Adresi");

                foreach (var log in logs)
                {
                    var trDate = log.Timestamp.AddHours(3).ToString("yyyy-MM-dd HH:mm:ss");
                    var uName = EscapeCsv(log.UserName ?? "-");
                    var fName = EscapeCsv(log.UserFullName ?? "-");
                    var role = EscapeCsv(log.UserRole);
                    var action = EscapeCsv(log.ActionType);
                    var entity = EscapeCsv($"{log.EntityName} ({log.EntityId ?? "-"})");
                    var desc = EscapeCsv(log.Description ?? "-");
                    var details = EscapeCsv(log.DetailsJson ?? "");
                    var ip = EscapeCsv(log.IpAddress ?? "-");

                    sb.AppendLine($"{trDate};{uName};{fName};{role};{action};{entity};{desc};{details};{ip}");
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
                sb.AppendLine($"Rapor Oluşturulma Tarihi: {DateTime.UtcNow.AddHours(3):yyyy-MM-dd HH:mm:ss} (TR)");
                sb.AppendLine($"Toplam Kayıt Sayısı: {logs.Count}");
                sb.AppendLine("--------------------------------------------------------------------------------");
                sb.AppendLine();

                foreach (var log in logs)
                {
                    var trDate = log.Timestamp.AddHours(3).ToString("yyyy-MM-dd HH:mm:ss");
                    sb.AppendLine($"[{trDate}] [{log.ActionType}] {log.Description ?? log.ActionType}");
                    sb.AppendLine($"    Kullanıcı : {log.UserFullName ?? log.UserName ?? "Sistem"} ({log.UserName ?? "-"}) - Rol: {log.UserRole}");
                    sb.AppendLine($"    Varlık    : {log.EntityName} (ID: {log.EntityId ?? "-"})");
                    if (!string.IsNullOrEmpty(log.DetailsJson))
                    {
                        sb.AppendLine($"    Detay     : {log.DetailsJson}");
                    }
                    if (!string.IsNullOrEmpty(log.IpAddress))
                    {
                        sb.AppendLine($"    IP Adresi : {log.IpAddress}");
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
    }
}
