using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OgretmenAjanda.Api.Data;
using OgretmenAjanda.Api.Helpers;
using OgretmenAjanda.Api.Models;
using OgretmenAjanda.Api.Services;

namespace OgretmenAjanda.Api.Controllers
{
    [ApiController]
    [Route("api/Optik")]
    [Authorize]
    public class OptikController : ControllerBase
    {
        private readonly AppDbContext _context;
        private readonly IAuditLogService _auditLog;

        public OptikController(AppDbContext context, IAuditLogService auditLog)
        {
            _context = context;
            _auditLog = auditLog;
        }

        private (Guid userId, string role, string? userName, string? fullName, Guid? claimSchoolId) GetCaller()
        {
            var userIdStr = User.FindFirstValue(ClaimTypes.NameIdentifier);
            Guid.TryParse(userIdStr, out var userId);
            var role = (User.FindFirstValue(ClaimTypes.Role) ?? string.Empty).ToUpperInvariant();
            var userName = User.FindFirstValue(ClaimTypes.Name);
            var fullName = User.FindFirstValue("FullName") ?? userName;
            var schoolIdStr = User.FindFirstValue("SchoolId");
            Guid? claimSchoolId = Guid.TryParse(schoolIdStr, out var sid) ? sid : null;

            return (userId, role, userName, fullName, claimSchoolId);
        }

        private static bool IsAdminOrStaff(string role) =>
            role == UserRoles.SuperAdmin ||
            role == UserRoles.InstitutionAdmin ||
            role == UserRoles.SchoolAdmin ||
            role == UserRoles.Staff;

        private async Task<(HashSet<string> allowedClasses, HashSet<string> allowedLessons)> GetTeacherScopeAsync(Guid teacherId, Guid schoolId)
        {
            var allowedClasses = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var allowedLessons = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            var user = await _context.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == teacherId);
            if (user != null)
            {
                if (!string.IsNullOrWhiteSpace(user.Branch))
                {
                    allowedLessons.Add(NormalizeLessonKey(user.Branch));
                }
                if (!string.IsNullOrWhiteSpace(user.CounselorClass))
                {
                    allowedClasses.Add(NormalizeClassKey(user.CounselorClass));
                }
                if (!string.IsNullOrWhiteSpace(user.AssignedClassesJson))
                {
                    try
                    {
                        var list = JsonSerializer.Deserialize<List<string>>(user.AssignedClassesJson);
                        if (list != null)
                        {
                            foreach (var c in list)
                                if (!string.IsNullOrWhiteSpace(c)) allowedClasses.Add(NormalizeClassKey(c));
                        }
                    }
                    catch { }
                }
                if (!string.IsNullOrWhiteSpace(user.AssignedLessonsJson))
                {
                    try
                    {
                        var list = JsonSerializer.Deserialize<List<string>>(user.AssignedLessonsJson);
                        if (list != null)
                        {
                            foreach (var l in list)
                                if (!string.IsNullOrWhiteSpace(l)) allowedLessons.Add(NormalizeLessonKey(l));
                        }
                    }
                    catch { }
                }
            }

            var schedules = await _context.ScheduleItems.AsNoTracking()
                .Where(s => s.SchoolId == schoolId && s.TeacherId == teacherId)
                .ToListAsync();

            foreach (var s in schedules)
            {
                var cls = $"{s.Grade}-{s.Section}";
                allowedClasses.Add(NormalizeClassKey(cls));
                if (!string.IsNullOrWhiteSpace(s.LessonName))
                    allowedLessons.Add(NormalizeLessonKey(s.LessonName));
            }

            return (allowedClasses, allowedLessons);
        }

        private static string NormalizeClassKey(string? raw)
        {
            if (string.IsNullOrWhiteSpace(raw)) return string.Empty;
            var (g, s) = GradeSectionNormalizer.Normalize(raw, "");
            if (!string.IsNullOrEmpty(g) && !string.IsNullOrEmpty(s))
                return $"{g}{s}".Replace(" ", "").Replace("-", "").Replace("/", "").ToUpperInvariant();
            return raw.Replace(" ", "").Replace("-", "").Replace("/", "").ToUpperInvariant();
        }

        private static string FormatClassDisplay(string? grade, string? section, string? fallback = null)
        {
            var (g, s) = GradeSectionNormalizer.Normalize(grade ?? "", section ?? "");
            if (!string.IsNullOrEmpty(g) && !string.IsNullOrEmpty(s))
                return $"{g}-{s}";
            if (!string.IsNullOrWhiteSpace(fallback))
            {
                var (fg, fs) = GradeSectionNormalizer.Normalize(fallback, "");
                if (!string.IsNullOrEmpty(fg) && !string.IsNullOrEmpty(fs))
                    return $"{fg}-{fs}";
                return fallback.Trim();
            }
            return "-";
        }

        private static string NormalizeLessonKey(string? raw)
        {
            if (string.IsNullOrWhiteSpace(raw)) return string.Empty;
            return raw.Trim()
                .Replace("İ", "I").Replace("ı", "i")
                .Replace("Ğ", "G").Replace("ğ", "g")
                .Replace("Ü", "U").Replace("ü", "u")
                .Replace("Ş", "S").Replace("ş", "s")
                .Replace("Ö", "O").Replace("ö", "o")
                .Replace("Ç", "C").Replace("ç", "c")
                .ToUpperInvariant();
        }

        private static bool DoesLessonMatchTeacher(string examLesson, HashSet<string> teacherLessons)
        {
            if (teacherLessons.Count == 0) return true; // Branş kısıtı tanımlı değilse tüm dersleri göster
            var normExam = NormalizeLessonKey(examLesson);
            foreach (var tl in teacherLessons)
            {
                if (string.IsNullOrEmpty(tl)) continue;
                if (normExam.Contains(tl) || tl.Contains(normExam))
                    return true;
            }
            return false;
        }

        // =====================================================================
        // 1. OPTİK FORM ŞABLONLARI (/api/Optik/forms)
        // =====================================================================

        [HttpGet("forms")]
        public async Task<IActionResult> GetForms([FromQuery] Guid? schoolId)
        {
            var caller = GetCaller();
            var targetSchoolId = schoolId ?? caller.claimSchoolId;
            if (!targetSchoolId.HasValue || targetSchoolId.Value == Guid.Empty)
                return BadRequest(new { message = "SchoolId gerekli." });

            var forms = await _context.OptikFormlar
                .Include(f => f.Dersler)
                .Where(f => f.SchoolId == targetSchoolId.Value)
                .OrderByDescending(f => f.CreatedAt)
                .ToListAsync();

            // Eğer okulda henüz hiç optik form şablonu yoksa 1 adet varsayılan standart şablon oluştur
            if (forms.Count == 0 && IsAdminOrStaff(caller.role))
            {
                var defaultForm = new OptikForm
                {
                    Id = Guid.NewGuid(),
                    SchoolId = targetSchoolId.Value,
                    FormAdi = "Standart Lise / Ortaokul Deneme Optik Formu",
                    NumaraBaslangic = 0,
                    NumaraUzunluk = 5,
                    AdSoyadBaslangic = 5,
                    AdSoyadUzunluk = 20,
                    SinifBaslangic = 25,
                    SinifUzunluk = 4,
                    KitapcikTuruBaslangic = 29,
                    KitapcikTuruUzunluk = 1,
                    SampleLine = "00101ALİ YILMAZ          09A AABCDABCDABCDABCDABCDABCDABCDABCDABCDABCDABCDABCDABCDABCDABCDABCDABCDABCDABCDABCD",
                    Dersler = new List<OptikFormDers>
                    {
                        new OptikFormDers { Id = Guid.NewGuid(), DersAdi = "Türk Dili ve Edebiyatı", BaslangicSutun = 30, KarakterSayisi = 20, SiraNo = 1 },
                        new OptikFormDers { Id = Guid.NewGuid(), DersAdi = "Matematik", BaslangicSutun = 50, KarakterSayisi = 20, SiraNo = 2 },
                        new OptikFormDers { Id = Guid.NewGuid(), DersAdi = "Fizik", BaslangicSutun = 70, KarakterSayisi = 10, SiraNo = 3 },
                        new OptikFormDers { Id = Guid.NewGuid(), DersAdi = "Kimya", BaslangicSutun = 80, KarakterSayisi = 10, SiraNo = 4 },
                        new OptikFormDers { Id = Guid.NewGuid(), DersAdi = "Biyoloji", BaslangicSutun = 90, KarakterSayisi = 10, SiraNo = 5 },
                        new OptikFormDers { Id = Guid.NewGuid(), DersAdi = "Tarih", BaslangicSutun = 100, KarakterSayisi = 10, SiraNo = 6 }
                    }
                };
                await _context.OptikFormlar.AddAsync(defaultForm);
                await _context.SaveChangesAsync();
                forms.Add(defaultForm);
            }

            foreach (var f in forms)
            {
                f.Dersler = f.Dersler.OrderBy(d => d.SiraNo).ThenBy(d => d.BaslangicSutun).ToList();
            }

            return Ok(forms);
        }

        public class SaveOptikFormDto
        {
            public Guid? Id { get; set; }
            public Guid SchoolId { get; set; }
            public string FormAdi { get; set; } = string.Empty;
            public int NumaraBaslangic { get; set; }
            public int NumaraUzunluk { get; set; }
            public int AdSoyadBaslangic { get; set; }
            public int AdSoyadUzunluk { get; set; }
            public int SinifBaslangic { get; set; }
            public int SinifUzunluk { get; set; }
            public int? KitapcikTuruBaslangic { get; set; }
            public int? KitapcikTuruUzunluk { get; set; }
            public string? FmtRawContent { get; set; }
            public string? SampleLine { get; set; }
            public List<SaveOptikFormDersDto> Dersler { get; set; } = new();
        }

        public class SaveOptikFormDersDto
        {
            public string DersAdi { get; set; } = string.Empty;
            public int BaslangicSutun { get; set; }
            public int KarakterSayisi { get; set; }
            public int SiraNo { get; set; }
        }

        [HttpPost("forms")]
        public async Task<IActionResult> SaveForm([FromBody] SaveOptikFormDto dto)
        {
            var caller = GetCaller();
            if (!IsAdminOrStaff(caller.role))
                return StatusCode(403, new { message = "Optik form tanımlama yetkiniz yok." });

            var schoolId = dto.SchoolId != Guid.Empty ? dto.SchoolId : (caller.claimSchoolId ?? Guid.Empty);
            if (schoolId == Guid.Empty)
                return BadRequest(new { message = "SchoolId gerekli." });

            if (string.IsNullOrWhiteSpace(dto.FormAdi))
                return BadRequest(new { message = "Form adı boş olamaz." });

            OptikForm? form = null;
            if (dto.Id.HasValue && dto.Id.Value != Guid.Empty)
            {
                form = await _context.OptikFormlar.Include(f => f.Dersler).FirstOrDefaultAsync(f => f.Id == dto.Id.Value && f.SchoolId == schoolId);
            }

            if (form == null)
            {
                form = new OptikForm
                {
                    Id = Guid.NewGuid(),
                    SchoolId = schoolId,
                    CreatedAt = DateTime.UtcNow
                };
                await _context.OptikFormlar.AddAsync(form);
            }
            else
            {
                _context.OptikFormDersleri.RemoveRange(form.Dersler);
                form.Dersler.Clear();
            }

            form.FormAdi = dto.FormAdi.Trim();
            form.NumaraBaslangic = Math.Max(0, dto.NumaraBaslangic);
            form.NumaraUzunluk = Math.Max(1, dto.NumaraUzunluk);
            form.AdSoyadBaslangic = Math.Max(0, dto.AdSoyadBaslangic);
            form.AdSoyadUzunluk = Math.Max(1, dto.AdSoyadUzunluk);
            form.SinifBaslangic = Math.Max(0, dto.SinifBaslangic);
            form.SinifUzunluk = Math.Max(0, dto.SinifUzunluk);
            form.KitapcikTuruBaslangic = dto.KitapcikTuruBaslangic;
            form.KitapcikTuruUzunluk = dto.KitapcikTuruUzunluk;
            form.FmtRawContent = dto.FmtRawContent;
            form.SampleLine = dto.SampleLine;

            int sira = 1;
            foreach (var d in dto.Dersler.Where(x => !string.IsNullOrWhiteSpace(x.DersAdi)))
            {
                form.Dersler.Add(new OptikFormDers
                {
                    Id = Guid.NewGuid(),
                    OptikFormId = form.Id,
                    DersAdi = d.DersAdi.Trim(),
                    BaslangicSutun = Math.Max(0, d.BaslangicSutun),
                    KarakterSayisi = Math.Max(1, d.KarakterSayisi),
                    SiraNo = d.SiraNo > 0 ? d.SiraNo : sira++
                });
            }

            await _auditLog.LogAsync(
                _context, schoolId, caller.userId, caller.userName, caller.fullName, caller.role,
                "OPTIK_FORM_SAVED", "OptikForm", form.Id.ToString(),
                $"Optik form şablonu kaydedildi: {form.FormAdi} ({form.Dersler.Count} ders)"
            );
            await _context.SaveChangesAsync();

            return Ok(new { success = true, message = "Optik form şablonu başarıyla kaydedildi.", form });
        }

        [HttpDelete("forms/{id}")]
        public async Task<IActionResult> DeleteForm(Guid id)
        {
            var caller = GetCaller();
            if (!IsAdminOrStaff(caller.role))
                return StatusCode(403, new { message = "Yetkisiz işlem." });

            var form = await _context.OptikFormlar.Include(f => f.Dersler).FirstOrDefaultAsync(f => f.Id == id);
            if (form == null)
                return NotFound(new { message = "Optik form bulunamadı." });

            _context.OptikFormlar.Remove(form);
            await _context.SaveChangesAsync();

            return Ok(new { success = true, message = "Optik form silindi." });
        }

        public class ParseFmtRequest
        {
            public string FmtContent { get; set; } = string.Empty;
            public string? FormName { get; set; }
        }

        [HttpPost("forms/parse-fmt")]
        public IActionResult ParseFmt([FromBody] ParseFmtRequest req)
        {
            if (string.IsNullOrWhiteSpace(req?.FmtContent))
                return BadRequest(new { message = ".fmt içeriği boş olamaz." });

            var lines = req.FmtContent
                .Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries)
                .Select(l => l.Trim())
                .Where(l => !string.IsNullOrWhiteSpace(l) && !l.StartsWith("#") && !l.StartsWith("//"))
                .ToList();

            var dto = new SaveOptikFormDto
            {
                FormAdi = !string.IsNullOrWhiteSpace(req.FormName) ? req.FormName! : "Otomatik Çözümlenen .FMT Formu",
                NumaraBaslangic = 0,
                NumaraUzunluk = 5,
                AdSoyadBaslangic = 5,
                AdSoyadUzunluk = 20,
                SinifBaslangic = 25,
                SinifUzunluk = 4,
                KitapcikTuruBaslangic = 29,
                KitapcikTuruUzunluk = 1,
                FmtRawContent = req.FmtContent,
                Dersler = new List<SaveOptikFormDersDto>()
            };

            // Yaygın .FMT formatları (Örn: ALAN_ADI=Baslangic,Uzunluk veya Baslangic:Uzunluk:AlanAdi)
            int sira = 1;
            var numRegex = new Regex(@"([A-Za-zÇĞİÖŞÜçğıöşü0-9_\-\s]{2,35})[\s:=\-;,\t]+(\d{1,3})[\s:,\-;,\t]+(\d{1,3})", RegexOptions.Compiled);

            foreach (var line in lines)
            {
                var m = numRegex.Match(line);
                if (!m.Success) continue;

                var label = m.Groups[1].Value.Trim();
                if (!int.TryParse(m.Groups[2].Value, out int startVal) || !int.TryParse(m.Groups[3].Value, out int lenVal))
                    continue;

                // 1-tabanlı .fmt dosyalarını 0-tabanlı indekse normalize et (eğer 1'den başlıyorsa)
                int start0 = startVal > 0 && lines.Any(x => Regex.IsMatch(x, @"[\s:=\t]1[\s:,\t]")) ? startVal - 1 : startVal;
                var upper = NormalizeLessonKey(label);

                if (upper.Contains("OGRENCINO") || upper.Contains("NUMARA") || upper == "NO" || upper.Contains("OGRNO"))
                {
                    dto.NumaraBaslangic = start0;
                    dto.NumaraUzunluk = lenVal;
                }
                else if (upper.Contains("ADSOYAD") || upper.Contains("ISIM") || upper.Contains("OGRENCIAD") || upper == "AD")
                {
                    dto.AdSoyadBaslangic = start0;
                    dto.AdSoyadUzunluk = lenVal;
                }
                else if (upper.Contains("SINIF") || upper.Contains("SUBE"))
                {
                    dto.SinifBaslangic = start0;
                    dto.SinifUzunluk = lenVal;
                }
                else if (upper.Contains("KITAPCIK") || upper.Contains("GRUP") || upper == "KT")
                {
                    dto.KitapcikTuruBaslangic = start0;
                    dto.KitapcikTuruUzunluk = lenVal;
                }
                else if (!upper.Contains("TCKIMLIK") && !upper.Contains("TELEFON") && !upper.Contains("CINSIYET") && lenVal >= 3)
                {
                    dto.Dersler.Add(new SaveOptikFormDersDto
                    {
                        DersAdi = label,
                        BaslangicSutun = start0,
                        KarakterSayisi = lenVal,
                        SiraNo = sira++
                    });
                }
            }

            return Ok(new
            {
                success = true,
                message = dto.Dersler.Count > 0
                    ? $".FMT dosyası başarıyla çözümlendi: Genel koordinatlar ve {dto.Dersler.Count} ders tespit edildi."
                    : ".FMT dosyasından temel koordinatlar alındı, ders sütunlarını kontrol ediniz.",
                parsedForm = dto
            });
        }

        // =====================================================================
        // 2. OPTİK SINAVLAR & GÖRÜNÜRLÜK (/api/Optik/exams)
        // =====================================================================

        [HttpGet("exams")]
        public async Task<IActionResult> GetExams([FromQuery] Guid? schoolId, [FromQuery] string? studentNumber)
        {
            var caller = GetCaller();
            var targetSchoolId = schoolId ?? caller.claimSchoolId;
            if (!targetSchoolId.HasValue || targetSchoolId.Value == Guid.Empty)
                return BadRequest(new { message = "SchoolId gerekli." });

            var query = _context.OptikSinavlar
                .Include(e => e.Dersler)
                .Where(e => e.SchoolId == targetSchoolId.Value)
                .AsQueryable();

            if (caller.role == UserRoles.Teacher)
            {
                query = query.Where(e => e.IsVisibleToTeachers);
            }
            else if (caller.role == UserRoles.Student || caller.role == UserRoles.Parent)
            {
                query = query.Where(e => e.IsPublishedToStudents);
            }

            var exams = await query.OrderByDescending(e => e.UygulamaTarihi).ThenByDescending(e => e.CreatedAt).ToListAsync();
            var examIds = exams.Select(e => e.Id).ToList();

            // Katılımcı sayıları ve ortalama net özetleri
            var resultSummaries = await _context.OptikSinavSonuclari.AsNoTracking()
                .Where(r => examIds.Contains(r.OptikSinavId))
                .GroupBy(r => r.OptikSinavId)
                .Select(g => new
                {
                    ExamId = g.Key,
                    Count = g.Count(),
                    AvgNet = g.Average(x => x.ToplamNet),
                    AvgScore = g.Average(x => x.Puan)
                })
                .ToDictionaryAsync(x => x.ExamId);

            var kazanimCounts = await _context.OptikSoruKazanimlari.AsNoTracking()
                .Where(k => examIds.Contains(k.OptikSinavId))
                .GroupBy(k => k.OptikSinavId)
                .Select(g => new { ExamId = g.Key, Count = g.Count() })
                .ToDictionaryAsync(x => x.ExamId, x => x.Count);

            // Öğrenci/Veli ise kendi sınav sonuçlarını da iliştir
            Dictionary<Guid, OptikSinavSonuc>? studentOwnResults = null;
            if (caller.role == UserRoles.Student || caller.role == UserRoles.Parent || !string.IsNullOrWhiteSpace(studentNumber))
            {
                var ogrNo = !string.IsNullOrWhiteSpace(studentNumber) ? studentNumber.Trim() : caller.userName;
                if (!string.IsNullOrWhiteSpace(ogrNo))
                {
                    var trimmed = ogrNo.TrimStart('0');
                    var ownList = await _context.OptikSinavSonuclari.AsNoTracking()
                        .Include(r => r.DersSonuclari)
                        .Where(r => examIds.Contains(r.OptikSinavId) &&
                                    (r.OgrenciNo == ogrNo || (!string.IsNullOrEmpty(trimmed) && r.OgrenciNo == trimmed) || r.StudentId == caller.userId))
                        .ToListAsync();

                    studentOwnResults = ownList.GroupBy(r => r.OptikSinavId).ToDictionary(g => g.Key, g => g.First());
                }
            }

            var responseList = exams.Select(e =>
            {
                resultSummaries.TryGetValue(e.Id, out var stat);
                kazanimCounts.TryGetValue(e.Id, out var kCount);
                OptikSinavSonuc? myRes = null;
                studentOwnResults?.TryGetValue(e.Id, out myRes);

                object? myResultDto = null;
                if (myRes != null)
                {
                    myResultDto = new
                    {
                        id = myRes.Id,
                        ogrenciNo = myRes.OgrenciNo,
                        adSoyad = myRes.AdSoyad,
                        sinif = myRes.Sinif,
                        kitapcikTuru = myRes.KitapcikTuru,
                        toplamDogru = myRes.ToplamDogru,
                        toplamYanlis = myRes.ToplamYanlis,
                        toplamBos = myRes.ToplamBos,
                        toplamNet = Math.Round(myRes.ToplamNet, 2),
                        puan = Math.Round(myRes.Puan, 2),
                        okulSirasi = e.ShowRankingToStudents ? (int?)myRes.OkulSirasi : null,
                        sinifSirasi = e.ShowRankingToStudents ? (int?)myRes.SinifSirasi : null,
                        toplamKatilimci = e.ShowRankingToStudents ? (int?)myRes.ToplamKatilimci : null,
                        sinifKatilimci = e.ShowRankingToStudents ? (int?)myRes.SinifKatilimci : null,
                        dersSonuclari = myRes.DersSonuclari.Select(d => new
                        {
                            d.DersAdi,
                            d.DogruSayisi,
                            d.YanlisSayisi,
                            d.BosSayisi,
                            net = Math.Round(d.Net, 2)
                        }).ToList()
                    };
                }

                return new
                {
                    e.Id,
                    e.SchoolId,
                    e.SinavAdi,
                    e.UygulamaTarihi,
                    e.YanlisDogruyuGotururSayisi,
                    e.HedefSiniflar,
                    e.KitapcikTurleri,
                    e.OptikFormId,
                    e.TabanPuan,
                    e.ToplamPuan,
                    e.IsPublishedToStudents,
                    e.ShowRankingToStudents,
                    e.IsVisibleToTeachers,
                    hasKazanimAnalysis = e.HasKazanimAnalysis || kCount > 0,
                    kazanimCount = kCount,
                    participantCount = stat?.Count ?? 0,
                    averageNet = stat != null ? Math.Round(stat.AvgNet, 2) : 0,
                    averageScore = stat != null ? Math.Round(stat.AvgScore, 2) : 0,
                    dersler = e.Dersler.OrderBy(d => d.SiraNo).Select(d => new
                    {
                        d.Id,
                        d.DersAdi,
                        d.SoruSayisi,
                        d.Katsayi,
                        d.SiraNo,
                        cevapAnahtariA = IsAdminOrStaff(caller.role) || caller.role == UserRoles.Teacher ? d.CevapAnahtariA : null,
                        cevapAnahtariB = IsAdminOrStaff(caller.role) || caller.role == UserRoles.Teacher ? d.CevapAnahtariB : null,
                        cevapAnahtariC = IsAdminOrStaff(caller.role) || caller.role == UserRoles.Teacher ? d.CevapAnahtariC : null,
                        cevapAnahtariD = IsAdminOrStaff(caller.role) || caller.role == UserRoles.Teacher ? d.CevapAnahtariD : null
                    }).ToList(),
                    myResult = myResultDto
                };
            }).ToList();

            return Ok(responseList);
        }

        public class SaveOptikSinavDto
        {
            public Guid? Id { get; set; }
            public Guid SchoolId { get; set; }
            public string SinavAdi { get; set; } = string.Empty;
            public DateTime? UygulamaTarihi { get; set; }
            public double YanlisDogruyuGotururSayisi { get; set; } = 4.0;
            public string? HedefSiniflar { get; set; }
            public string? KitapcikTurleri { get; set; } = "A,B";
            public Guid? OptikFormId { get; set; }
            public double TabanPuan { get; set; } = 100.0;
            public double ToplamPuan { get; set; } = 500.0;
            public bool IsPublishedToStudents { get; set; } = false;
            public bool ShowRankingToStudents { get; set; } = false;
            public bool IsVisibleToTeachers { get; set; } = true;
            public bool HasKazanimAnalysis { get; set; } = false;
            public List<SaveOptikSinavDersDto> Dersler { get; set; } = new();
        }

        public class SaveOptikSinavDersDto
        {
            public string DersAdi { get; set; } = string.Empty;
            public int SoruSayisi { get; set; } = 20;
            public double Katsayi { get; set; } = 1.0;
            public int SiraNo { get; set; } = 1;
            public string CevapAnahtariA { get; set; } = string.Empty;
            public string? CevapAnahtariB { get; set; }
            public string? CevapAnahtariC { get; set; }
            public string? CevapAnahtariD { get; set; }
        }

        [HttpPost("exams")]
        public async Task<IActionResult> SaveExam([FromBody] SaveOptikSinavDto dto)
        {
            var caller = GetCaller();
            if (!IsAdminOrStaff(caller.role))
                return StatusCode(403, new { message = "Sınav oluşturma/düzenleme yetkiniz yok." });

            var schoolId = dto.SchoolId != Guid.Empty ? dto.SchoolId : (caller.claimSchoolId ?? Guid.Empty);
            if (schoolId == Guid.Empty)
                return BadRequest(new { message = "SchoolId gerekli." });

            if (string.IsNullOrWhiteSpace(dto.SinavAdi))
                return BadRequest(new { message = "Sınav adı boş olamaz." });

            OptikSinav? sinav = null;
            if (dto.Id.HasValue && dto.Id.Value != Guid.Empty)
            {
                sinav = await _context.OptikSinavlar.Include(e => e.Dersler).FirstOrDefaultAsync(e => e.Id == dto.Id.Value && e.SchoolId == schoolId);
            }

            if (sinav == null)
            {
                sinav = new OptikSinav
                {
                    Id = Guid.NewGuid(),
                    SchoolId = schoolId,
                    CreatedAt = DateTime.UtcNow
                };
                await _context.OptikSinavlar.AddAsync(sinav);
            }
            else
            {
                _context.OptikSinavDersleri.RemoveRange(sinav.Dersler);
                sinav.Dersler.Clear();
            }

            sinav.SinavAdi = dto.SinavAdi.Trim();
            sinav.UygulamaTarihi = dto.UygulamaTarihi ?? DateTime.Today;
            sinav.YanlisDogruyuGotururSayisi = dto.YanlisDogruyuGotururSayisi >= 0 ? dto.YanlisDogruyuGotururSayisi : 4.0;
            sinav.HedefSiniflar = dto.HedefSiniflar;
            sinav.KitapcikTurleri = dto.KitapcikTurleri ?? "A,B";
            sinav.OptikFormId = dto.OptikFormId;
            sinav.TabanPuan = dto.TabanPuan;
            sinav.ToplamPuan = dto.ToplamPuan > dto.TabanPuan ? dto.ToplamPuan : 500.0;
            sinav.IsPublishedToStudents = dto.IsPublishedToStudents;
            sinav.ShowRankingToStudents = dto.ShowRankingToStudents;
            sinav.IsVisibleToTeachers = dto.IsVisibleToTeachers;
            sinav.HasKazanimAnalysis = dto.HasKazanimAnalysis;

            int sira = 1;
            foreach (var d in dto.Dersler.Where(x => !string.IsNullOrWhiteSpace(x.DersAdi)))
            {
                sinav.Dersler.Add(new OptikSinavDers
                {
                    Id = Guid.NewGuid(),
                    OptikSinavId = sinav.Id,
                    DersAdi = d.DersAdi.Trim(),
                    SoruSayisi = Math.Max(1, d.SoruSayisi),
                    Katsayi = d.Katsayi > 0 ? d.Katsayi : 1.0,
                    SiraNo = d.SiraNo > 0 ? d.SiraNo : sira++,
                    CevapAnahtariA = (d.CevapAnahtariA ?? string.Empty).Trim().ToUpperInvariant(),
                    CevapAnahtariB = string.IsNullOrWhiteSpace(d.CevapAnahtariB) ? null : d.CevapAnahtariB.Trim().ToUpperInvariant(),
                    CevapAnahtariC = string.IsNullOrWhiteSpace(d.CevapAnahtariC) ? null : d.CevapAnahtariC.Trim().ToUpperInvariant(),
                    CevapAnahtariD = string.IsNullOrWhiteSpace(d.CevapAnahtariD) ? null : d.CevapAnahtariD.Trim().ToUpperInvariant()
                });
            }

            await _auditLog.LogAsync(
                _context, schoolId, caller.userId, caller.userName, caller.fullName, caller.role,
                "OPTIK_EXAM_SAVED", "OptikSinav", sinav.Id.ToString(),
                $"Optik sınav kaydedildi: {sinav.SinavAdi} ({sinav.Dersler.Count} ders)"
            );
            await _context.SaveChangesAsync();

            return Ok(new { success = true, message = "Optik sınav başarıyla kaydedildi.", exam = sinav });
        }

        public class UpdateVisibilityDto
        {
            public bool? IsPublishedToStudents { get; set; }
            public bool? ShowRankingToStudents { get; set; }
            public bool? IsVisibleToTeachers { get; set; }
            public bool? HasKazanimAnalysis { get; set; }
        }

        [HttpPut("exams/{id}/visibility")]
        public async Task<IActionResult> UpdateVisibility(Guid id, [FromBody] UpdateVisibilityDto dto)
        {
            var caller = GetCaller();
            if (!IsAdminOrStaff(caller.role))
                return StatusCode(403, new { message = "Sınav görünürlük ayarlarını yalnızca okul yönetimi değiştirebilir." });

            var sinav = await _context.OptikSinavlar.FirstOrDefaultAsync(e => e.Id == id);
            if (sinav == null)
                return NotFound(new { message = "Optik sınav bulunamadı." });

            if (dto.IsPublishedToStudents.HasValue) sinav.IsPublishedToStudents = dto.IsPublishedToStudents.Value;
            if (dto.ShowRankingToStudents.HasValue) sinav.ShowRankingToStudents = dto.ShowRankingToStudents.Value;
            if (dto.IsVisibleToTeachers.HasValue) sinav.IsVisibleToTeachers = dto.IsVisibleToTeachers.Value;
            if (dto.HasKazanimAnalysis.HasValue) sinav.HasKazanimAnalysis = dto.HasKazanimAnalysis.Value;

            await _auditLog.LogAsync(
                _context, sinav.SchoolId, caller.userId, caller.userName, caller.fullName, caller.role,
                "OPTIK_VISIBILITY_UPDATED", "OptikSinav", sinav.Id.ToString(),
                $"'{sinav.SinavAdi}' görünürlük izinleri güncellendi (Öğrenci/Veli: {(sinav.IsPublishedToStudents ? "Açık" : "Kapalı")}, Sıralama: {(sinav.ShowRankingToStudents ? "Açık" : "Kapalı")}, Öğretmen: {(sinav.IsVisibleToTeachers ? "Açık" : "Kapalı")})"
            );
            await _context.SaveChangesAsync();

            return Ok(new
            {
                success = true,
                message = "Sınav görünürlük ve yetki ayarları güncellendi.",
                isPublishedToStudents = sinav.IsPublishedToStudents,
                showRankingToStudents = sinav.ShowRankingToStudents,
                isVisibleToTeachers = sinav.IsVisibleToTeachers,
                hasKazanimAnalysis = sinav.HasKazanimAnalysis
            });
        }

        [HttpDelete("exams/{id}")]
        public async Task<IActionResult> DeleteExam(Guid id)
        {
            var caller = GetCaller();
            if (!IsAdminOrStaff(caller.role))
                return StatusCode(403, new { message = "Yetkisiz işlem." });

            var sinav = await _context.OptikSinavlar.Include(e => e.Dersler).FirstOrDefaultAsync(e => e.Id == id);
            if (sinav == null)
                return NotFound(new { message = "Sınav bulunamadı." });

            var results = await _context.OptikSinavSonuclari.Include(r => r.DersSonuclari).Where(r => r.OptikSinavId == id).ToListAsync();
            var kazanimlar = await _context.OptikSoruKazanimlari.Where(k => k.OptikSinavId == id).ToListAsync();
            var sonucKazanimlar = await _context.OptikSinavSonucKazanimlari.Where(k => k.OptikSinavId == id).ToListAsync();

            _context.OptikSinavSonucKazanimlari.RemoveRange(sonucKazanimlar);
            _context.OptikSinavSonuclari.RemoveRange(results);
            _context.OptikSoruKazanimlari.RemoveRange(kazanimlar);
            _context.OptikSinavlar.Remove(sinav);

            await _context.SaveChangesAsync();
            return Ok(new { success = true, message = "Optik sınav ve ilişkili tüm sonuçları silindi." });
        }

        // =====================================================================
        // 3. KONU VE KAZANIM TANIMLARI (/api/Optik/exams/{id}/kazanimlar)
        // =====================================================================

        [HttpGet("exams/{id}/kazanimlar")]
        public async Task<IActionResult> GetKazanimlar(Guid id)
        {
            var list = await _context.OptikSoruKazanimlari.AsNoTracking()
                .Where(k => k.OptikSinavId == id)
                .OrderBy(k => k.DersAdi)
                .ThenBy(k => k.SoruNo)
                .ToListAsync();

            return Ok(list);
        }

        public class SaveKazanimItemDto
        {
            public string DersAdi { get; set; } = string.Empty;
            public int SoruNo { get; set; }
            public int? BSoruNo { get; set; }
            public int? CSoruNo { get; set; }
            public int? DSoruNo { get; set; }
            public string KonuAdi { get; set; } = string.Empty;
            public string? KazanimKodu { get; set; }
            public string? KazanimAciklamasi { get; set; }
        }

        public class SaveKazanimListRequest
        {
            public List<SaveKazanimItemDto> Items { get; set; } = new();
        }

        [HttpPost("exams/{id}/kazanimlar")]
        public async Task<IActionResult> SaveKazanimlar(Guid id, [FromBody] SaveKazanimListRequest req)
        {
            var caller = GetCaller();
            if (!IsAdminOrStaff(caller.role) && caller.role != UserRoles.Teacher)
                return StatusCode(403, new { message = "Kazanım tanımlama yetkiniz yok." });

            var sinav = await _context.OptikSinavlar.Include(e => e.Dersler).FirstOrDefaultAsync(e => e.Id == id);
            if (sinav == null)
                return NotFound(new { message = "Optik sınav bulunamadı." });

            var existing = await _context.OptikSoruKazanimlari.Where(k => k.OptikSinavId == id).ToListAsync();
            _context.OptikSoruKazanimlari.RemoveRange(existing);

            var newEntities = new List<OptikSoruKazanim>();
            foreach (var item in req.Items.Where(x => !string.IsNullOrWhiteSpace(x.DersAdi) && !string.IsNullOrWhiteSpace(x.KonuAdi) && x.SoruNo > 0))
            {
                newEntities.Add(new OptikSoruKazanim
                {
                    Id = Guid.NewGuid(),
                    SchoolId = sinav.SchoolId,
                    OptikSinavId = sinav.Id,
                    DersAdi = item.DersAdi.Trim(),
                    SoruNo = item.SoruNo,
                    BSoruNo = item.BSoruNo,
                    CSoruNo = item.CSoruNo,
                    DSoruNo = item.DSoruNo,
                    KonuAdi = item.KonuAdi.Trim(),
                    KazanimKodu = item.KazanimKodu?.Trim(),
                    KazanimAciklamasi = item.KazanimAciklamasi?.Trim()
                });
            }

            if (newEntities.Count > 0)
            {
                await _context.OptikSoruKazanimlari.AddRangeAsync(newEntities);
                sinav.HasKazanimAnalysis = true;
            }
            else
            {
                sinav.HasKazanimAnalysis = false;
            }

            await _context.SaveChangesAsync();

            // Mevcut sınav sonuçları varsa öğrenci kazanım karnelerini yeniden hesapla
            await RebuildStudentKazanimResultsAsync(sinav, newEntities);

            return Ok(new
            {
                success = true,
                message = $"{newEntities.Count} adet soru-konu/kazanım eşleştirmesi kaydedildi ve öğrenci karneleri güncellendi.",
                count = newEntities.Count
            });
        }

        // =====================================================================
        // 4. OPTİK DOSYA OKUMA VE DEĞERLENDİRME MOTORU (/api/Optik/evaluate)
        // =====================================================================

        public class EvaluateOptikRequest
        {
            public Guid SinavId { get; set; }
            public Guid? FormId { get; set; }
            public string TxtContent { get; set; } = string.Empty;
            public bool SaveResults { get; set; } = true;
            public bool SinifFiltresiUygula { get; set; } = false;
            public bool NumarasizlariDahilEt { get; set; } = true;
            public Dictionary<string, string>? DersEslesmeleri { get; set; }
            public SaveOptikFormDto? DinamikForm { get; set; }
            public bool OptikFormuGuncelle { get; set; } = false;
        }

        [HttpPost("evaluate")]
        public async Task<IActionResult> Evaluate([FromBody] EvaluateOptikRequest req)
        {
            var caller = GetCaller();
            if (!IsAdminOrStaff(caller.role))
                return StatusCode(403, new { message = "Optik sınav değerlendirme yetkisi yalnızca okul yönetimine aittir." });

            if (req == null || string.IsNullOrWhiteSpace(req.TxtContent))
                return BadRequest(new { message = "Değerlendirilecek optik veri satırları (TXT/DAT) boş olamaz." });

            var sinav = await _context.OptikSinavlar
                .Include(e => e.Dersler)
                .FirstOrDefaultAsync(e => e.Id == req.SinavId);

            if (sinav == null)
                return NotFound(new { message = "Değerlendirilecek sınav bulunamadı." });

            var formId = req.FormId ?? sinav.OptikFormId;
            OptikForm? form = null;
            if (formId.HasValue && formId.Value != Guid.Empty)
            {
                form = await _context.OptikFormlar.Include(f => f.Dersler).FirstOrDefaultAsync(f => f.Id == formId.Value);
            }
            if (form == null)
            {
                form = await _context.OptikFormlar.Include(f => f.Dersler)
                    .Where(f => f.SchoolId == sinav.SchoolId)
                    .OrderByDescending(f => f.CreatedAt)
                    .FirstOrDefaultAsync();
            }

            if (form == null && req.DinamikForm == null)
                return BadRequest(new { message = "Optik form şablonu bulunamadı. Lütfen önce bir optik form şablonu seçin veya tanımlayın." });

            // Dinamik form koordinatları gönderildiyse uygula
            int numBas = req.DinamikForm?.NumaraBaslangic ?? form!.NumaraBaslangic;
            int numUz = req.DinamikForm?.NumaraUzunluk ?? form!.NumaraUzunluk;
            int adBas = req.DinamikForm?.AdSoyadBaslangic ?? form!.AdSoyadBaslangic;
            int adUz = req.DinamikForm?.AdSoyadUzunluk ?? form!.AdSoyadUzunluk;
            int sinifBas = req.DinamikForm?.SinifBaslangic ?? form!.SinifBaslangic;
            int sinifUz = req.DinamikForm?.SinifUzunluk ?? form!.SinifUzunluk;
            int? kitBas = req.DinamikForm != null ? req.DinamikForm.KitapcikTuruBaslangic : form!.KitapcikTuruBaslangic;
            int? kitUz = req.DinamikForm != null ? req.DinamikForm.KitapcikTuruUzunluk : form!.KitapcikTuruUzunluk;

            var formDersList = req.DinamikForm != null && req.DinamikForm.Dersler.Any()
                ? req.DinamikForm.Dersler.Select(d => new OptikFormDers
                {
                    DersAdi = d.DersAdi,
                    BaslangicSutun = d.BaslangicSutun,
                    KarakterSayisi = d.KarakterSayisi,
                    SiraNo = d.SiraNo
                }).ToList()
                : form!.Dersler.OrderBy(d => d.SiraNo).ToList();

            if (req.OptikFormuGuncelle && form != null && req.DinamikForm != null)
            {
                form.NumaraBaslangic = numBas;
                form.NumaraUzunluk = numUz;
                form.AdSoyadBaslangic = adBas;
                form.AdSoyadUzunluk = adUz;
                form.SinifBaslangic = sinifBas;
                form.SinifUzunluk = sinifUz;
                form.KitapcikTuruBaslangic = kitBas;
                form.KitapcikTuruUzunluk = kitUz;
                _context.OptikFormDersleri.RemoveRange(form.Dersler);
                form.Dersler = formDersList.Select((d, idx) => new OptikFormDers
                {
                    Id = Guid.NewGuid(),
                    OptikFormId = form.Id,
                    DersAdi = d.DersAdi,
                    BaslangicSutun = d.BaslangicSutun,
                    KarakterSayisi = d.KarakterSayisi,
                    SiraNo = idx + 1
                }).ToList();
                await _context.SaveChangesAsync();
            }

            // Okuldaki öğrencileri hafızaya al (hızlı eşleştirme)
            var schoolStudents = await _context.Students.AsNoTracking()
                .Where(s => s.SchoolId == sinav.SchoolId)
                .ToListAsync();

            var studentByNo = new Dictionary<string, Student>(StringComparer.OrdinalIgnoreCase);
            foreach (var st in schoolStudents)
            {
                if (!string.IsNullOrWhiteSpace(st.StudentNumber))
                {
                    var rawNo = st.StudentNumber.Trim();
                    studentByNo[rawNo] = st;
                    var trimmed = rawNo.TrimStart('0');
                    if (!string.IsNullOrEmpty(trimmed))
                        studentByNo[trimmed] = st;
                }
            }

            var cleanHedefSiniflar = string.IsNullOrWhiteSpace(sinav.HedefSiniflar)
                ? new HashSet<string>(StringComparer.OrdinalIgnoreCase)
                : sinav.HedefSiniflar.Split(',', StringSplitOptions.RemoveEmptyEntries)
                    .Select(NormalizeClassKey)
                    .Where(x => !string.IsNullOrEmpty(x))
                    .ToHashSet(StringComparer.OrdinalIgnoreCase);

            var orderedSinavDersler = sinav.Dersler.OrderBy(d => d.SiraNo).ToList();
            double totalPossibleWeightedNet = orderedSinavDersler.Sum(d => d.SoruSayisi * (d.Katsayi > 0 ? d.Katsayi : 1.0));
            if (totalPossibleWeightedNet <= 0) totalPossibleWeightedNet = 100;

            var lines = req.TxtContent.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
            var evaluatedResults = new List<OptikSinavSonuc>();

            foreach (var rawLine in lines)
            {
                if (string.IsNullOrWhiteSpace(rawLine)) continue;
                var line = rawLine.TrimEnd('\r', '\n');

                string ogrenciNo = SubstringSafe(line, numBas, numUz).Trim();
                string rawSinif = SubstringSafe(line, sinifBas, sinifUz).Trim();
                string rawAdSoyad = SubstringSafe(line, adBas, adUz).Trim();

                string kitapcik = "A";
                if (kitBas.HasValue && kitUz.HasValue && kitUz.Value > 0)
                {
                    var okunanKit = SubstringSafe(line, kitBas.Value, kitUz.Value).Trim().ToUpperInvariant();
                    if (okunanKit == "A" || okunanKit == "B" || okunanKit == "C" || okunanKit == "D")
                        kitapcik = okunanKit;
                }

                Student? matchedStudent = null;
                if (!string.IsNullOrEmpty(ogrenciNo))
                {
                    if (!studentByNo.TryGetValue(ogrenciNo, out matchedStudent))
                    {
                        var trimmed = ogrenciNo.TrimStart('0');
                        if (!string.IsNullOrEmpty(trimmed))
                            studentByNo.TryGetValue(trimmed, out matchedStudent);
                    }
                }

                if (matchedStudent == null && !req.NumarasizlariDahilEt)
                    continue;

                string finalNo = matchedStudent != null ? matchedStudent.StudentNumber : (string.IsNullOrEmpty(ogrenciNo) ? $"OPT-{evaluatedResults.Count + 1}" : ogrenciNo);
                string finalAd = matchedStudent != null ? matchedStudent.FullName : (string.IsNullOrWhiteSpace(rawAdSoyad) ? "Bilinmeyen Öğrenci" : rawAdSoyad);
                string finalSinif = matchedStudent != null
                    ? FormatClassDisplay(matchedStudent.Grade, matchedStudent.Section, rawSinif)
                    : FormatClassDisplay("", "", rawSinif);

                if (req.SinifFiltresiUygula && cleanHedefSiniflar.Count > 0)
                {
                    var normSinif = NormalizeClassKey(finalSinif);
                    if (!cleanHedefSiniflar.Contains(normSinif))
                        continue;
                }

                int topDogru = 0, topYanlis = 0, topBos = 0;
                double topNet = 0;
                double weightedNetSum = 0;
                var dersSonucList = new List<OptikSinavSonucDers>();

                for (int dIdx = 0; dIdx < orderedSinavDersler.Count; dIdx++)
                {
                    var sinavDers = orderedSinavDersler[dIdx];
                    OptikFormDers? formDers = null;

                    if (req.DersEslesmeleri != null && req.DersEslesmeleri.TryGetValue(sinavDers.DersAdi, out var mappedName))
                    {
                        formDers = formDersList.FirstOrDefault(fd => string.Equals(fd.DersAdi, mappedName, StringComparison.OrdinalIgnoreCase));
                    }
                    formDers ??= formDersList.FirstOrDefault(fd => NormalizeLessonKey(fd.DersAdi) == NormalizeLessonKey(sinavDers.DersAdi));
                    if (formDers == null && dIdx < formDersList.Count)
                    {
                        formDers = formDersList[dIdx];
                    }

                    if (formDers == null) continue;

                    string ogrCevaplar = SubstringSafe(line, formDers.BaslangicSutun, formDers.KarakterSayisi).ToUpperInvariant();
                    ogrCevaplar = ogrCevaplar.PadRight(sinavDers.SoruSayisi, ' ');

                    string anahtar = sinavDers.CevapAnahtariA ?? string.Empty;
                    if (kitapcik == "B" && !string.IsNullOrWhiteSpace(sinavDers.CevapAnahtariB)) anahtar = sinavDers.CevapAnahtariB!;
                    else if (kitapcik == "C" && !string.IsNullOrWhiteSpace(sinavDers.CevapAnahtariC)) anahtar = sinavDers.CevapAnahtariC!;
                    else if (kitapcik == "D" && !string.IsNullOrWhiteSpace(sinavDers.CevapAnahtariD)) anahtar = sinavDers.CevapAnahtariD!;

                    anahtar = anahtar.PadRight(sinavDers.SoruSayisi, ' ');

                    int dDogru = 0, dYanlis = 0, dBos = 0;
                    for (int q = 0; q < sinavDers.SoruSayisi; q++)
                    {
                        char cvp = q < ogrCevaplar.Length ? ogrCevaplar[q] : ' ';
                        char keyChar = q < anahtar.Length ? anahtar[q] : ' ';

                        if (keyChar == 'X') continue; // İptal edilen soru
                        if (keyChar == 'H')
                        {
                            dDogru++;
                        }
                        else if (cvp == ' ' || cvp == '*' || cvp == '-' || cvp == '.')
                        {
                            dBos++;
                        }
                        else if (cvp == keyChar)
                        {
                            dDogru++;
                        }
                        else
                        {
                            dYanlis++;
                        }
                    }

                    double dNet = sinav.YanlisDogruyuGotururSayisi > 0
                        ? dDogru - (dYanlis / sinav.YanlisDogruyuGotururSayisi)
                        : dDogru;

                    dNet = Math.Round(dNet, 2);
                    topDogru += dDogru;
                    topYanlis += dYanlis;
                    topBos += dBos;
                    topNet += dNet;
                    weightedNetSum += Math.Max(0, dNet) * (sinavDers.Katsayi > 0 ? sinavDers.Katsayi : 1.0);

                    dersSonucList.Add(new OptikSinavSonucDers
                    {
                        Id = Guid.NewGuid(),
                        DersAdi = sinavDers.DersAdi,
                        DogruSayisi = dDogru,
                        YanlisSayisi = dYanlis,
                        BosSayisi = dBos,
                        Net = dNet,
                        OgrenciCevaplari = ogrCevaplar.Substring(0, Math.Min(ogrCevaplar.Length, sinavDers.SoruSayisi)),
                        CevapAnahtari = anahtar.Substring(0, Math.Min(anahtar.Length, sinavDers.SoruSayisi))
                    });
                }

                double puanRange = Math.Max(0, sinav.ToplamPuan - sinav.TabanPuan);
                double puan = sinav.TabanPuan + (weightedNetSum / totalPossibleWeightedNet) * puanRange;
                puan = Math.Round(Math.Clamp(puan, 0, sinav.ToplamPuan), 2);

                var sonuc = new OptikSinavSonuc
                {
                    Id = Guid.NewGuid(),
                    SchoolId = sinav.SchoolId,
                    OptikSinavId = sinav.Id,
                    StudentId = matchedStudent?.Id,
                    OgrenciNo = finalNo,
                    AdSoyad = finalAd,
                    Sinif = finalSinif,
                    KitapcikTuru = kitapcik,
                    ToplamDogru = topDogru,
                    ToplamYanlis = topYanlis,
                    ToplamBos = topBos,
                    ToplamNet = Math.Round(topNet, 2),
                    Puan = puan,
                    OrijinalSatir = line,
                    CreatedAt = DateTime.UtcNow,
                    DersSonuclari = dersSonucList
                };

                foreach (var ds in sonuc.DersSonuclari)
                {
                    ds.OptikSinavSonucId = sonuc.Id;
                }

                evaluatedResults.Add(sonuc);
            }

            // Okul ve Sınıf Sıralamalarını (Dereceleri) Hesapla
            CalculateRankings(evaluatedResults);

            if (req.SaveResults && evaluatedResults.Count > 0)
            {
                var oldResults = await _context.OptikSinavSonuclari
                    .Include(r => r.DersSonuclari)
                    .Where(r => r.OptikSinavId == sinav.Id)
                    .ToListAsync();
                if (oldResults.Count > 0)
                {
                    _context.OptikSinavSonuclari.RemoveRange(oldResults);
                }

                var oldKazanimResults = await _context.OptikSinavSonucKazanimlari
                    .Where(k => k.OptikSinavId == sinav.Id)
                    .ToListAsync();
                if (oldKazanimResults.Count > 0)
                {
                    _context.OptikSinavSonucKazanimlari.RemoveRange(oldKazanimResults);
                }

                await _context.OptikSinavSonuclari.AddRangeAsync(evaluatedResults);
                await _context.SaveChangesAsync();

                // Konu-Kazanım tanımları varsa her öğrenci için kazanım karnesini hesapla ve kaydet
                var kazanimDefs = await _context.OptikSoruKazanimlari.AsNoTracking()
                    .Where(k => k.OptikSinavId == sinav.Id)
                    .ToListAsync();

                if (kazanimDefs.Count > 0)
                {
                    await RebuildStudentKazanimResultsAsync(sinav, kazanimDefs, evaluatedResults);
                }

                await _auditLog.LogAsync(
                    _context, sinav.SchoolId, caller.userId, caller.userName, caller.fullName, caller.role,
                    "OPTIK_EXAM_EVALUATED", "OptikSinav", sinav.Id.ToString(),
                    $"'{sinav.SinavAdi}' optik sınavı değerlendirildi ve kaydedildi ({evaluatedResults.Count} öğrenci)."
                );
                await _context.SaveChangesAsync();
            }

            return Ok(new
            {
                success = true,
                saved = req.SaveResults,
                message = req.SaveResults
                    ? $"{evaluatedResults.Count} öğrencinin optik sınav sonucu değerlendirildi, dereceler ve kazanım karneleri kaydedildi."
                    : $"{evaluatedResults.Count} satır önizleme olarak değerlendirildi.",
                totalEvaluated = evaluatedResults.Count,
                matchedInDbCount = evaluatedResults.Count(r => r.StudentId.HasValue),
                averageNet = evaluatedResults.Count > 0 ? Math.Round(evaluatedResults.Average(r => r.ToplamNet), 2) : 0,
                averageScore = evaluatedResults.Count > 0 ? Math.Round(evaluatedResults.Average(r => r.Puan), 2) : 0,
                results = evaluatedResults.OrderBy(r => r.OkulSirasi).ToList()
            });
        }

        private static void CalculateRankings(List<OptikSinavSonuc> results)
        {
            int total = results.Count;
            var orderedSchool = results
                .OrderByDescending(r => r.Puan)
                .ThenByDescending(r => r.ToplamNet)
                .ThenByDescending(r => r.ToplamDogru)
                .ToList();

            for (int i = 0; i < orderedSchool.Count; i++)
            {
                if (i > 0 &&
                    Math.Abs(orderedSchool[i].Puan - orderedSchool[i - 1].Puan) < 0.001 &&
                    Math.Abs(orderedSchool[i].ToplamNet - orderedSchool[i - 1].ToplamNet) < 0.001)
                {
                    orderedSchool[i].OkulSirasi = orderedSchool[i - 1].OkulSirasi;
                }
                else
                {
                    orderedSchool[i].OkulSirasi = i + 1;
                }
                orderedSchool[i].ToplamKatilimci = total;
            }

            var byClass = results.GroupBy(r => NormalizeClassKey(r.Sinif));
            foreach (var grp in byClass)
            {
                var classList = grp
                    .OrderByDescending(r => r.Puan)
                    .ThenByDescending(r => r.ToplamNet)
                    .ThenByDescending(r => r.ToplamDogru)
                    .ToList();

                int classCount = classList.Count;
                for (int i = 0; i < classList.Count; i++)
                {
                    if (i > 0 &&
                        Math.Abs(classList[i].Puan - classList[i - 1].Puan) < 0.001 &&
                        Math.Abs(classList[i].ToplamNet - classList[i - 1].ToplamNet) < 0.001)
                    {
                        classList[i].SinifSirasi = classList[i - 1].SinifSirasi;
                    }
                    else
                    {
                        classList[i].SinifSirasi = i + 1;
                    }
                    classList[i].SinifKatilimci = classCount;
                }
            }
        }

        private async Task RebuildStudentKazanimResultsAsync(
            OptikSinav sinav,
            List<OptikSoruKazanim> kazanimDefs,
            List<OptikSinavSonuc>? preloadedResults = null)
        {
            var old = await _context.OptikSinavSonucKazanimlari.Where(k => k.OptikSinavId == sinav.Id).ToListAsync();
            if (old.Count > 0)
            {
                _context.OptikSinavSonucKazanimlari.RemoveRange(old);
                await _context.SaveChangesAsync();
            }

            if (kazanimDefs.Count == 0) return;

            var results = preloadedResults ?? await _context.OptikSinavSonuclari
                .Include(r => r.DersSonuclari)
                .Where(r => r.OptikSinavId == sinav.Id)
                .ToListAsync();

            if (results.Count == 0) return;

            var newKazanimRecords = new List<OptikSinavSonucKazanim>();

            foreach (var studentRes in results)
            {
                foreach (var dersRes in studentRes.DersSonuclari)
                {
                    var lessonKazanimlar = kazanimDefs
                        .Where(k => NormalizeLessonKey(k.DersAdi) == NormalizeLessonKey(dersRes.DersAdi))
                        .ToList();

                    if (lessonKazanimlar.Count == 0) continue;

                    string ogrCevap = dersRes.OgrenciCevaplari ?? string.Empty;
                    string anahtar = dersRes.CevapAnahtari ?? string.Empty;

                    // Konu bazında grupla
                    var groupedByTopic = lessonKazanimlar.GroupBy(k => new
                    {
                        Konu = k.KonuAdi.Trim(),
                        Kod = k.KazanimKodu ?? "",
                        Aciklama = k.KazanimAciklamasi ?? ""
                    });

                    foreach (var topicGrp in groupedByTopic)
                    {
                        int tSoru = 0, tDogru = 0, tYanlis = 0, tBos = 0;

                        foreach (var qDef in topicGrp)
                        {
                            int qNumber = qDef.SoruNo;
                            if (studentRes.KitapcikTuru == "B" && qDef.BSoruNo.HasValue && qDef.BSoruNo.Value > 0)
                                qNumber = qDef.BSoruNo.Value;
                            else if (studentRes.KitapcikTuru == "C" && qDef.CSoruNo.HasValue && qDef.CSoruNo.Value > 0)
                                qNumber = qDef.CSoruNo.Value;
                            else if (studentRes.KitapcikTuru == "D" && qDef.DSoruNo.HasValue && qDef.DSoruNo.Value > 0)
                                qNumber = qDef.DSoruNo.Value;

                            int idx = qNumber - 1;
                            if (idx < 0) continue;

                            char cvp = idx < ogrCevap.Length ? ogrCevap[idx] : ' ';
                            char keyChar = idx < anahtar.Length ? anahtar[idx] : ' ';

                            if (keyChar == 'X') continue;
                            tSoru++;

                            if (keyChar == 'H') tDogru++;
                            else if (cvp == ' ' || cvp == '*' || cvp == '-' || cvp == '.') tBos++;
                            else if (cvp == keyChar) tDogru++;
                            else tYanlis++;
                        }

                        if (tSoru <= 0) continue;
                        double basari = Math.Round((tDogru * 100.0) / tSoru, 1);

                        newKazanimRecords.Add(new OptikSinavSonucKazanim
                        {
                            Id = Guid.NewGuid(),
                            SchoolId = sinav.SchoolId,
                            OptikSinavId = sinav.Id,
                            OptikSinavSonucId = studentRes.Id,
                            StudentId = studentRes.StudentId,
                            OgrenciNo = studentRes.OgrenciNo,
                            Sinif = studentRes.Sinif,
                            DersAdi = dersRes.DersAdi,
                            KonuAdi = topicGrp.Key.Konu,
                            KazanimKodu = string.IsNullOrEmpty(topicGrp.Key.Kod) ? null : topicGrp.Key.Kod,
                            KazanimAciklamasi = string.IsNullOrEmpty(topicGrp.Key.Aciklama) ? null : topicGrp.Key.Aciklama,
                            ToplamSoru = tSoru,
                            DogruSayisi = tDogru,
                            YanlisSayisi = tYanlis,
                            BosSayisi = tBos,
                            BasariYuzdesi = basari
                        });
                    }
                }
            }

            if (newKazanimRecords.Count > 0)
            {
                await _context.OptikSinavSonucKazanimlari.AddRangeAsync(newKazanimRecords);
                await _context.SaveChangesAsync();
            }
        }

        private static string SubstringSafe(string line, int start, int length)
        {
            if (string.IsNullOrEmpty(line) || start < 0 || length <= 0 || start >= line.Length)
                return string.Empty;
            int safeLen = Math.Min(length, line.Length - start);
            return line.Substring(start, safeLen);
        }

        // =====================================================================
        // 5. SINAV SONUÇLARI (/api/Optik/exams/{id}/results) - ROL FİLTRELİ
        // =====================================================================

        [HttpGet("exams/{id}/results")]
        public async Task<IActionResult> GetExamResults(Guid id, [FromQuery] string? sinif, [FromQuery] string? search)
        {
            var caller = GetCaller();
            var sinav = await _context.OptikSinavlar.AsNoTracking()
                .Include(e => e.Dersler)
                .FirstOrDefaultAsync(e => e.Id == id);

            if (sinav == null)
                return NotFound(new { message = "Optik sınav bulunamadı." });

            if (caller.role == UserRoles.Teacher && !sinav.IsVisibleToTeachers)
                return StatusCode(403, new { message = "Bu sınavın sonuçları henüz öğretmen erişimine açılmamıştır." });

            if ((caller.role == UserRoles.Student || caller.role == UserRoles.Parent) && !sinav.IsPublishedToStudents)
                return StatusCode(403, new { message = "Bu sınavın sonuçları henüz öğrenci ve veli erişimine açılmamıştır." });

            var results = await _context.OptikSinavSonuclari.AsNoTracking()
                .Include(r => r.DersSonuclari)
                .Where(r => r.OptikSinavId == id)
                .OrderBy(r => r.OkulSirasi)
                .ToListAsync();

            HashSet<string>? teacherClasses = null;
            HashSet<string>? teacherLessons = null;

            if (caller.role == UserRoles.Teacher)
            {
                var scope = await GetTeacherScopeAsync(caller.userId, sinav.SchoolId);
                teacherClasses = scope.allowedClasses;
                teacherLessons = scope.allowedLessons;

                if (teacherClasses.Count > 0)
                {
                    results = results.Where(r => teacherClasses.Contains(NormalizeClassKey(r.Sinif))).ToList();
                }
            }
            else if (caller.role == UserRoles.Student || caller.role == UserRoles.Parent)
            {
                var ogrNo = caller.userName ?? "";
                var trimmed = ogrNo.TrimStart('0');
                results = results.Where(r =>
                    r.StudentId == caller.userId ||
                    r.OgrenciNo == ogrNo ||
                    (!string.IsNullOrEmpty(trimmed) && r.OgrenciNo == trimmed)).ToList();
            }

            if (!string.IsNullOrWhiteSpace(sinif) && sinif != "ALL")
            {
                var normFilter = NormalizeClassKey(sinif);
                results = results.Where(r => NormalizeClassKey(r.Sinif) == normFilter).ToList();
            }

            if (!string.IsNullOrWhiteSpace(search))
            {
                var q = search.Trim().ToLowerInvariant();
                results = results.Where(r =>
                    r.AdSoyad.ToLowerInvariant().Contains(q) ||
                    r.OgrenciNo.ToLowerInvariant().Contains(q) ||
                    r.Sinif.ToLowerInvariant().Contains(q)).ToList();
            }

            bool hideRanking = (caller.role == UserRoles.Student || caller.role == UserRoles.Parent) && !sinav.ShowRankingToStudents;

            var formatted = results.Select(r => new
            {
                r.Id,
                r.StudentId,
                r.OgrenciNo,
                r.AdSoyad,
                r.Sinif,
                r.KitapcikTuru,
                r.ToplamDogru,
                r.ToplamYanlis,
                r.ToplamBos,
                toplamNet = Math.Round(r.ToplamNet, 2),
                puan = Math.Round(r.Puan, 2),
                okulSirasi = hideRanking ? (int?)null : r.OkulSirasi,
                sinifSirasi = hideRanking ? (int?)null : r.SinifSirasi,
                toplamKatilimci = hideRanking ? (int?)null : r.ToplamKatilimci,
                sinifKatilimci = hideRanking ? (int?)null : r.SinifKatilimci,
                dersSonuclari = r.DersSonuclari
                    .Where(d => teacherLessons == null || DoesLessonMatchTeacher(d.DersAdi, teacherLessons))
                    .Select(d => new
                    {
                        d.DersAdi,
                        d.DogruSayisi,
                        d.YanlisSayisi,
                        d.BosSayisi,
                        net = Math.Round(d.Net, 2),
                        d.OgrenciCevaplari
                    }).ToList()
            }).ToList();

            return Ok(new
            {
                exam = new
                {
                    sinav.Id,
                    sinav.SinavAdi,
                    sinav.UygulamaTarihi,
                    sinav.IsPublishedToStudents,
                    sinav.ShowRankingToStudents,
                    sinav.IsVisibleToTeachers,
                    sinav.HasKazanimAnalysis
                },
                teacherFiltered = caller.role == UserRoles.Teacher,
                teacherClasses = teacherClasses?.ToList(),
                teacherLessons = teacherLessons?.ToList(),
                totalCount = formatted.Count,
                results = formatted
            });
        }

        // =====================================================================
        // 6. ZENGİN GÖRSEL İSTATİSTİKLER & ANALİTİKLER (/api/Optik/exams/{id}/statistics)
        // =====================================================================

        [HttpGet("exams/{id}/statistics")]
        public async Task<IActionResult> GetStatistics(Guid id)
        {
            var caller = GetCaller();
            if (caller.role == UserRoles.Student || caller.role == UserRoles.Parent)
                return StatusCode(403, new { message = "Genel okul istatistik paneli idare ve öğretmenlere özeldir." });

            var sinav = await _context.OptikSinavlar.AsNoTracking()
                .Include(e => e.Dersler)
                .FirstOrDefaultAsync(e => e.Id == id);

            if (sinav == null)
                return NotFound(new { message = "Sınav bulunamadı." });

            if (caller.role == UserRoles.Teacher && !sinav.IsVisibleToTeachers)
                return StatusCode(403, new { message = "Bu sınavın istatistikleri öğretmen erişimine kapalıdır." });

            var allResults = await _context.OptikSinavSonuclari.AsNoTracking()
                .Include(r => r.DersSonuclari)
                .Where(r => r.OptikSinavId == id)
                .ToListAsync();

            var kazanimDefs = await _context.OptikSoruKazanimlari.AsNoTracking()
                .Where(k => k.OptikSinavId == id)
                .ToListAsync();

            var allKazanimResults = await _context.OptikSinavSonucKazanimlari.AsNoTracking()
                .Where(k => k.OptikSinavId == id)
                .ToListAsync();

            HashSet<string>? teacherClasses = null;
            HashSet<string>? teacherLessons = null;

            if (caller.role == UserRoles.Teacher)
            {
                var scope = await GetTeacherScopeAsync(caller.userId, sinav.SchoolId);
                teacherClasses = scope.allowedClasses;
                teacherLessons = scope.allowedLessons;
            }

            // Öğretmen ise kendi sınıflarına filtrele (okul genel ortalamasını kıyas için ayrıca tut)
            var scopedResults = (teacherClasses != null && teacherClasses.Count > 0)
                ? allResults.Where(r => teacherClasses.Contains(NormalizeClassKey(r.Sinif))).ToList()
                : allResults;

            int totalStudentsInSchool = await _context.Students.AsNoTracking().CountAsync(s => s.SchoolId == sinav.SchoolId);

            // 1. Okul Genel Özeti
            var schoolSummary = new
            {
                participantCount = scopedResults.Count,
                totalSchoolStudents = totalStudentsInSchool,
                participationRate = totalStudentsInSchool > 0 ? Math.Round((allResults.Count * 100.0) / totalStudentsInSchool, 1) : 100.0,
                averageNet = scopedResults.Count > 0 ? Math.Round(scopedResults.Average(r => r.ToplamNet), 2) : 0,
                schoolWideAverageNet = allResults.Count > 0 ? Math.Round(allResults.Average(r => r.ToplamNet), 2) : 0,
                maxNet = scopedResults.Count > 0 ? Math.Round(scopedResults.Max(r => r.ToplamNet), 2) : 0,
                minNet = scopedResults.Count > 0 ? Math.Round(scopedResults.Min(r => r.ToplamNet), 2) : 0,
                averageScore = scopedResults.Count > 0 ? Math.Round(scopedResults.Average(r => r.Puan), 2) : 0,
                maxScore = scopedResults.Count > 0 ? Math.Round(scopedResults.Max(r => r.Puan), 2) : 0,
                scoreDistribution = new[]
                {
                    new { label = "400 - 500 Puan", count = scopedResults.Count(r => r.Puan >= 400), color = "#10B981" },
                    new { label = "300 - 399 Puan", count = scopedResults.Count(r => r.Puan >= 300 && r.Puan < 400), color = "#3B82F6" },
                    new { label = "200 - 299 Puan", count = scopedResults.Count(r => r.Puan >= 200 && r.Puan < 300), color = "#F59E0B" },
                    new { label = "0 - 199 Puan", count = scopedResults.Count(r => r.Puan < 200), color = "#EF4444" }
                }
            };

            // 2. Ders Bazında Ortalamalar
            var orderedDersler = sinav.Dersler
                .OrderBy(d => d.SiraNo)
                .Where(d => teacherLessons == null || DoesLessonMatchTeacher(d.DersAdi, teacherLessons))
                .ToList();

            var lessonAverages = orderedDersler.Select(d =>
            {
                var dList = scopedResults.SelectMany(r => r.DersSonuclari)
                    .Where(x => NormalizeLessonKey(x.DersAdi) == NormalizeLessonKey(d.DersAdi))
                    .ToList();

                var schoolWideDList = allResults.SelectMany(r => r.DersSonuclari)
                    .Where(x => NormalizeLessonKey(x.DersAdi) == NormalizeLessonKey(d.DersAdi))
                    .ToList();

                double avgDogru = dList.Count > 0 ? Math.Round(dList.Average(x => x.DogruSayisi), 2) : 0;
                double avgYanlis = dList.Count > 0 ? Math.Round(dList.Average(x => x.YanlisSayisi), 2) : 0;
                double avgBos = dList.Count > 0 ? Math.Round(dList.Average(x => x.BosSayisi), 2) : 0;
                double avgNet = dList.Count > 0 ? Math.Round(dList.Average(x => x.Net), 2) : 0;
                double schoolAvgNet = schoolWideDList.Count > 0 ? Math.Round(schoolWideDList.Average(x => x.Net), 2) : 0;
                double successPct = d.SoruSayisi > 0 ? Math.Round((avgDogru * 100.0) / d.SoruSayisi, 1) : 0;

                return new
                {
                    dersAdi = d.DersAdi,
                    soruSayisi = d.SoruSayisi,
                    ortalamaDogru = avgDogru,
                    ortalamaYanlis = avgYanlis,
                    ortalamaBos = avgBos,
                    ortalamaNet = avgNet,
                    okulOrtalamaNet = schoolAvgNet,
                    basariYuzdesi = successPct
                };
            }).ToList();

            // 3. Sınıf / Şube Karşılaştırmalı Analiz
            var classComparisons = scopedResults
                .GroupBy(r => string.IsNullOrWhiteSpace(r.Sinif) ? "Belirsiz" : r.Sinif)
                .Select(grp =>
                {
                    var topStudent = grp.OrderByDescending(x => x.Puan).ThenByDescending(x => x.ToplamNet).FirstOrDefault();
                    var dersOrt = orderedDersler.Select(d =>
                    {
                        var dl = grp.SelectMany(r => r.DersSonuclari)
                            .Where(x => NormalizeLessonKey(x.DersAdi) == NormalizeLessonKey(d.DersAdi))
                            .ToList();
                        return new
                        {
                            dersAdi = d.DersAdi,
                            ortalamaNet = dl.Count > 0 ? Math.Round(dl.Average(x => x.Net), 2) : 0,
                            basariYuzdesi = (dl.Count > 0 && d.SoruSayisi > 0)
                                ? Math.Round((dl.Average(x => x.DogruSayisi) * 100.0) / d.SoruSayisi, 1)
                                : 0
                        };
                    }).ToList();

                    return new
                    {
                        sinif = grp.Key,
                        katilimciSayisi = grp.Count(),
                        ortalamaNet = Math.Round(grp.Average(x => x.ToplamNet), 2),
                        ortalamaPuan = Math.Round(grp.Average(x => x.Puan), 2),
                        enYuksekNet = Math.Round(grp.Max(x => x.ToplamNet), 2),
                        birinciOgrenci = topStudent != null ? $"{topStudent.AdSoyad} ({topStudent.ToplamNet:F2} Net)" : "-",
                        dersOrtalamalari = dersOrt
                    };
                })
                .OrderByDescending(c => c.ortalamaNet)
                .ToList();

            // 4. Ders Ders Soru Zorluk İndeksi & Çeldirici (Şık Dağılımı) Analizi
            var lessonItemAnalyses = orderedDersler.Select(d =>
            {
                var dResults = scopedResults
                    .Select(r => new
                    {
                        r.KitapcikTuru,
                        Ders = r.DersSonuclari.FirstOrDefault(x => NormalizeLessonKey(x.DersAdi) == NormalizeLessonKey(d.DersAdi))
                    })
                    .Where(x => x.Ders != null)
                    .ToList();

                var lessonKazanimMap = kazanimDefs
                    .Where(k => NormalizeLessonKey(k.DersAdi) == NormalizeLessonKey(d.DersAdi))
                    .GroupBy(k => k.SoruNo)
                    .ToDictionary(g => g.Key, g => g.First());

                var questions = new List<object>();
                for (int q = 1; q <= d.SoruSayisi; q++)
                {
                    int idx = q - 1;
                    int cDogru = 0, cYanlis = 0, cBos = 0;
                    int optA = 0, optB = 0, optC = 0, optD = 0, optE = 0;

                    foreach (var item in dResults)
                    {
                        var dr = item.Ders!;
                        char cvp = idx < dr.OgrenciCevaplari.Length ? dr.OgrenciCevaplari[idx] : ' ';
                        string keyStr = dr.CevapAnahtari ?? d.CevapAnahtariA ?? "";
                        char keyChar = idx < keyStr.Length ? keyStr[idx] : ' ';

                        if (cvp == 'A') optA++;
                        else if (cvp == 'B') optB++;
                        else if (cvp == 'C') optC++;
                        else if (cvp == 'D') optD++;
                        else if (cvp == 'E') optE++;

                        if (keyChar == 'X') continue;
                        if (keyChar == 'H') cDogru++;
                        else if (cvp == ' ' || cvp == '*' || cvp == '-') cBos++;
                        else if (cvp == keyChar) cDogru++;
                        else cYanlis++;
                    }

                    int totalAns = cDogru + cYanlis + cBos;
                    double dogruPct = totalAns > 0 ? Math.Round((cDogru * 100.0) / totalAns, 1) : 0;
                    lessonKazanimMap.TryGetValue(q, out var kDef);

                    char aKeyChar = (q - 1) < (d.CevapAnahtariA?.Length ?? 0) ? d.CevapAnahtariA![q - 1] : '-';

                    questions.Add(new
                    {
                        soruNo = q,
                        dogruCevapA = aKeyChar.ToString(),
                        konuAdi = kDef?.KonuAdi ?? $"Soru #{q}",
                        kazanimAciklamasi = kDef?.KazanimAciklamasi,
                        dogruSayisi = cDogru,
                        yanlisSayisi = cYanlis,
                        bosSayisi = cBos,
                        dogruYuzdesi = dogruPct,
                        zorlukDuzeyi = dogruPct >= 75 ? "Kolay" : (dogruPct >= 45 ? "Orta" : "Zor / Çok Fire Verilen"),
                        secenekDagilimi = new { A = optA, B = optB, C = optC, D = optD, E = optE, Bos = cBos }
                    });
                }

                return new
                {
                    dersAdi = d.DersAdi,
                    soruSayisi = d.SoruSayisi,
                    sorular = questions
                };
            }).ToList();

            // 5. Konu / Kazanım Başarı Özeti (En Çok Fire Verilen Konular)
            var scopedResultIds = scopedResults.Select(r => r.Id).ToHashSet();
            var topicSummaries = allKazanimResults
                .Where(k => scopedResultIds.Contains(k.OptikSinavSonucId) &&
                            (teacherLessons == null || DoesLessonMatchTeacher(k.DersAdi, teacherLessons)))
                .GroupBy(k => new { k.DersAdi, k.KonuAdi, k.KazanimAciklamasi })
                .Select(g =>
                {
                    int topSoru = g.Sum(x => x.ToplamSoru);
                    int topDogru = g.Sum(x => x.DogruSayisi);
                    int topYanlis = g.Sum(x => x.YanlisSayisi);
                    int topBos = g.Sum(x => x.BosSayisi);
                    double pct = topSoru > 0 ? Math.Round((topDogru * 100.0) / topSoru, 1) : 0;
                    return new
                    {
                        dersAdi = g.Key.DersAdi,
                        konuAdi = g.Key.KonuAdi,
                        kazanimAciklamasi = g.Key.KazanimAciklamasi,
                        ogrenciSayisi = g.Count(),
                        toplamSoru = topSoru,
                        toplamDogru = topDogru,
                        toplamYanlis = topYanlis,
                        toplamBos = topBos,
                        basariYuzdesi = pct,
                        durum = pct >= 75 ? "Başarılı" : (pct >= 50 ? "Orta Düzey" : "Tekrar Edilmeli (Eksik Kazanım)")
                    };
                })
                .OrderBy(t => t.basariYuzdesi)
                .ToList();

            return Ok(new
            {
                exam = new
                {
                    sinav.Id,
                    sinav.SinavAdi,
                    sinav.UygulamaTarihi,
                    sinav.IsPublishedToStudents,
                    sinav.ShowRankingToStudents,
                    sinav.IsVisibleToTeachers,
                    sinav.HasKazanimAnalysis
                },
                schoolSummary,
                lessonAverages,
                classComparisons,
                lessonItemAnalyses,
                topicSummaries
            });
        }

        // =====================================================================
        // 7. DETAYLI ÖĞRENCİ KARNESİ (/api/Optik/exams/{id}/student-report/{studentKey})
        // =====================================================================

        [HttpGet("exams/{id}/student-report/{studentKey}")]
        public async Task<IActionResult> GetStudentReport(Guid id, string studentKey)
        {
            var caller = GetCaller();
            var sinav = await _context.OptikSinavlar.AsNoTracking()
                .Include(e => e.Dersler)
                .FirstOrDefaultAsync(e => e.Id == id);

            if (sinav == null)
                return NotFound(new { message = "Sınav bulunamadı." });

            if (caller.role == UserRoles.Teacher && !sinav.IsVisibleToTeachers)
                return StatusCode(403, new { message = "Bu sınavın karneleri öğretmen erişimine kapalıdır." });

            if ((caller.role == UserRoles.Student || caller.role == UserRoles.Parent) && !sinav.IsPublishedToStudents)
                return StatusCode(403, new { message = "Bu sınavın sonuçları henüz açıklanmamıştır." });

            var allResults = await _context.OptikSinavSonuclari.AsNoTracking()
                .Include(r => r.DersSonuclari)
                .Where(r => r.OptikSinavId == id)
                .ToListAsync();

            OptikSinavSonuc? targetResult = null;
            if (Guid.TryParse(studentKey, out var parsedGuid))
            {
                targetResult = allResults.FirstOrDefault(r => r.Id == parsedGuid || r.StudentId == parsedGuid);
            }
            if (targetResult == null)
            {
                var trimmed = studentKey.Trim().TrimStart('0');
                targetResult = allResults.FirstOrDefault(r =>
                    string.Equals(r.OgrenciNo, studentKey.Trim(), StringComparison.OrdinalIgnoreCase) ||
                    (!string.IsNullOrEmpty(trimmed) && string.Equals(r.OgrenciNo, trimmed, StringComparison.OrdinalIgnoreCase)));
            }

            if (targetResult == null)
                return NotFound(new { message = "Öğrenciye ait sınav karnesi bulunamadı." });

            // Öğrenci/Veli yalnızca kendi karnesini görebilir
            if (caller.role == UserRoles.Student || caller.role == UserRoles.Parent)
            {
                var callerNo = (caller.userName ?? "").Trim();
                var callerTrimmed = callerNo.TrimStart('0');
                bool isSelf = targetResult.StudentId == caller.userId ||
                              string.Equals(targetResult.OgrenciNo, callerNo, StringComparison.OrdinalIgnoreCase) ||
                              (!string.IsNullOrEmpty(callerTrimmed) && string.Equals(targetResult.OgrenciNo, callerTrimmed, StringComparison.OrdinalIgnoreCase));

                if (!isSelf)
                    return StatusCode(403, new { message = "Yalnızca kendi sınav karnenizi görüntüleyebilirsiniz." });
            }

            HashSet<string>? teacherLessons = null;
            if (caller.role == UserRoles.Teacher)
            {
                var scope = await GetTeacherScopeAsync(caller.userId, sinav.SchoolId);
                teacherLessons = scope.allowedLessons;
            }

            var classPeers = allResults.Where(r => NormalizeClassKey(r.Sinif) == NormalizeClassKey(targetResult.Sinif)).ToList();

            var kazanimDefs = await _context.OptikSoruKazanimlari.AsNoTracking()
                .Where(k => k.OptikSinavId == id)
                .ToListAsync();

            var studentKazanimlar = await _context.OptikSinavSonucKazanimlari.AsNoTracking()
                .Where(k => k.OptikSinavSonucId == targetResult.Id)
                .ToListAsync();

            bool showRanking = IsAdminOrStaff(caller.role) || caller.role == UserRoles.Teacher || sinav.ShowRankingToStudents;

            var orderedDersler = sinav.Dersler
                .OrderBy(d => d.SiraNo)
                .Where(d => teacherLessons == null || DoesLessonMatchTeacher(d.DersAdi, teacherLessons))
                .ToList();

            var lessonBreakdowns = orderedDersler.Select(d =>
            {
                var stuDers = targetResult.DersSonuclari.FirstOrDefault(x => NormalizeLessonKey(x.DersAdi) == NormalizeLessonKey(d.DersAdi));
                var schoolLessonList = allResults.SelectMany(r => r.DersSonuclari).Where(x => NormalizeLessonKey(x.DersAdi) == NormalizeLessonKey(d.DersAdi)).ToList();
                var classLessonList = classPeers.SelectMany(r => r.DersSonuclari).Where(x => NormalizeLessonKey(x.DersAdi) == NormalizeLessonKey(d.DersAdi)).ToList();

                double schoolAvgNet = schoolLessonList.Count > 0 ? Math.Round(schoolLessonList.Average(x => x.Net), 2) : 0;
                double classAvgNet = classLessonList.Count > 0 ? Math.Round(classLessonList.Average(x => x.Net), 2) : 0;

                string ogrCevap = stuDers?.OgrenciCevaplari ?? "";
                string anahtar = stuDers?.CevapAnahtari ?? d.CevapAnahtariA ?? "";

                var lessonKazanimList = kazanimDefs
                    .Where(k => NormalizeLessonKey(k.DersAdi) == NormalizeLessonKey(d.DersAdi))
                    .ToList();

                var soruAnalizi = new List<object>();
                for (int q = 1; q <= d.SoruSayisi; q++)
                {
                    int idx = q - 1;
                    char cvp = idx < ogrCevap.Length ? ogrCevap[idx] : ' ';
                    char keyChar = idx < anahtar.Length ? anahtar[idx] : ' ';

                    string durum = "BOS";
                    if (keyChar == 'X') durum = "IPTAL";
                    else if (keyChar == 'H' || cvp == keyChar) durum = "DOGRU";
                    else if (cvp == ' ' || cvp == '*' || cvp == '-') durum = "BOS";
                    else durum = "YANLIS";

                    var kDef = lessonKazanimList.FirstOrDefault(k =>
                        (targetResult.KitapcikTuru == "B" && k.BSoruNo == q) ||
                        (targetResult.KitapcikTuru == "C" && k.CSoruNo == q) ||
                        (targetResult.KitapcikTuru == "D" && k.DSoruNo == q) ||
                        k.SoruNo == q);

                    soruAnalizi.Add(new
                    {
                        soruNo = q,
                        dogruCevap = keyChar.ToString(),
                        ogrenciCevabi = cvp == ' ' ? "-" : cvp.ToString(),
                        durum = durum,
                        konuAdi = kDef?.KonuAdi,
                        kazanimKodu = kDef?.KazanimKodu,
                        kazanimAciklamasi = kDef?.KazanimAciklamasi
                    });
                }

                int dogru = stuDers?.DogruSayisi ?? 0;
                int yanlis = stuDers?.YanlisSayisi ?? 0;
                int bos = stuDers?.BosSayisi ?? d.SoruSayisi;
                double net = stuDers != null ? Math.Round(stuDers.Net, 2) : 0;
                double basariPct = d.SoruSayisi > 0 ? Math.Round((dogru * 100.0) / d.SoruSayisi, 1) : 0;

                return new
                {
                    dersAdi = d.DersAdi,
                    soruSayisi = d.SoruSayisi,
                    dogruSayisi = dogru,
                    yanlisSayisi = yanlis,
                    bosSayisi = bos,
                    net = net,
                    sinifOrtalamaNet = classAvgNet,
                    okulOrtalamaNet = schoolAvgNet,
                    basariYuzdesi = basariPct,
                    sorular = soruAnalizi
                };
            }).ToList();

            var filteredKazanimlar = studentKazanimlar
                .Where(k => teacherLessons == null || DoesLessonMatchTeacher(k.DersAdi, teacherLessons))
                .Select(k => new
                {
                    k.DersAdi,
                    k.KonuAdi,
                    k.KazanimKodu,
                    k.KazanimAciklamasi,
                    k.ToplamSoru,
                    k.DogruSayisi,
                    k.YanlisSayisi,
                    k.BosSayisi,
                    basariYuzdesi = Math.Round(k.BasariYuzdesi, 1),
                    durum = k.BasariYuzdesi >= 75 ? "Başarılı" : (k.BasariYuzdesi >= 50 ? "Geliştirilmeli" : "Eksik Kazanım")
                })
                .OrderBy(k => k.DersAdi)
                .ThenBy(k => k.basariYuzdesi)
                .ToList();

            return Ok(new
            {
                exam = new
                {
                    sinav.Id,
                    sinav.SinavAdi,
                    sinav.UygulamaTarihi,
                    sinav.YanlisDogruyuGotururSayisi,
                    sinav.ShowRankingToStudents,
                    sinav.HasKazanimAnalysis
                },
                student = new
                {
                    targetResult.Id,
                    targetResult.StudentId,
                    targetResult.OgrenciNo,
                    targetResult.AdSoyad,
                    targetResult.Sinif,
                    targetResult.KitapcikTuru,
                    targetResult.ToplamDogru,
                    targetResult.ToplamYanlis,
                    targetResult.ToplamBos,
                    toplamNet = Math.Round(targetResult.ToplamNet, 2),
                    puan = Math.Round(targetResult.Puan, 2),
                    sinifOrtalamaNet = classPeers.Count > 0 ? Math.Round(classPeers.Average(x => x.ToplamNet), 2) : 0,
                    okulOrtalamaNet = allResults.Count > 0 ? Math.Round(allResults.Average(x => x.ToplamNet), 2) : 0,
                    okulSirasi = showRanking ? (int?)targetResult.OkulSirasi : null,
                    toplamKatilimci = showRanking ? (int?)targetResult.ToplamKatilimci : null,
                    sinifSirasi = showRanking ? (int?)targetResult.SinifSirasi : null,
                    sinifKatilimci = showRanking ? (int?)targetResult.SinifKatilimci : null
                },
                lessons = lessonBreakdowns,
                kazanimAnalizi = filteredKazanimlar
            });
        }
    }
}

