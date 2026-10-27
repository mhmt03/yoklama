using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using yoklamaWeb.Data;
using yoklamaWeb.Models;

namespace yoklamaWeb.Controllers
{
    [Authorize(Roles = "Admin,Idareci,SinavYoneticisi,SuperYoklamaci")]
    public class OptikModulController : Controller
    {
        private readonly AppDbContext _context;

        public OptikModulController(AppDbContext context)
        {
            _context = context;
        }

        // 1. OPTİK FORM TANIMLAMA & CRUD
        public async Task<IActionResult> FormTanimla()
        {
            var formlar = await _context.OptikFormlar.Include(f => f.Dersler).ToListAsync();
            return View(formlar);
        }

        [HttpPost]
        public async Task<IActionResult> FormKaydet(OptikForm model, string derslerJson)
        {
            if (ModelState.IsValid)
            {
                var dersler = JsonSerializer.Deserialize<List<OptikFormDers>>(derslerJson);
                model.Dersler = dersler;

                _context.OptikFormlar.Add(model);
                await _context.SaveChangesAsync();
                TempData["SuccessMessage"] = "Form başarıyla kaydedildi.";
                return RedirectToAction(nameof(FormTanimla));
            }
            return RedirectToAction(nameof(FormTanimla));
        }

        public async Task<IActionResult> FormDuzenle(int id)
        {
            var form = await _context.OptikFormlar.Include(f => f.Dersler).FirstOrDefaultAsync(f => f.Id == id);
            if (form == null) return NotFound();
            return View(form);
        }

        [HttpPost]
        public async Task<IActionResult> FormDuzenle(int id, OptikForm model, string derslerJson)
        {
            if (id != model.Id) return NotFound();

            var form = await _context.OptikFormlar.Include(f => f.Dersler).FirstOrDefaultAsync(f => f.Id == id);
            if (form == null) return NotFound();

            form.FormAdi = model.FormAdi;
            form.NumaraBaslangic = model.NumaraBaslangic;
            form.NumaraUzunluk = model.NumaraUzunluk;
            form.AdSoyadBaslangic = model.AdSoyadBaslangic;
            form.AdSoyadUzunluk = model.AdSoyadUzunluk;
            form.SinifBaslangic = model.SinifBaslangic;
            form.SinifUzunluk = model.SinifUzunluk;

            // Dersleri güncelle (eskileri sil, yenileri ekle)
            _context.OptikFormDersleri.RemoveRange(form.Dersler);
            
            if (!string.IsNullOrEmpty(derslerJson))
            {
                var dersler = JsonSerializer.Deserialize<List<OptikFormDers>>(derslerJson);
                form.Dersler = dersler;
            }

            await _context.SaveChangesAsync();
            TempData["SuccessMessage"] = "Form başarıyla güncellendi.";
            return RedirectToAction(nameof(FormTanimla));
        }

        [HttpPost]
        public async Task<IActionResult> FormSil(int id)
        {
            var form = await _context.OptikFormlar.FindAsync(id);
            if (form != null)
            {
                _context.OptikFormlar.Remove(form);
                await _context.SaveChangesAsync();
                TempData["SuccessMessage"] = "Form başarıyla silindi.";
            }
            return RedirectToAction(nameof(FormTanimla));
        }

        // 2. SINAV OLUŞTURMA & CRUD
        public async Task<IActionResult> SinavOlustur()
        {
            var sinavlar = await _context.OptikSinavlar.Include(s => s.Dersler).OrderByDescending(s => s.UygulamaTarihi).ToListAsync();
            ViewBag.Formlar = await _context.OptikFormlar.Include(f => f.Dersler).ToListAsync();
            return View(sinavlar);
        }

        [HttpGet]
        public async Task<IActionResult> GetSinifVeOgrenciler()
        {
            var ogrenciler = await _context.Ogrenciler
                .OrderBy(o => o.SinifDuzeyi)
                .ThenBy(o => o.Sube)
                .ThenBy(o => o.AdSoyad)
                .ToListAsync();

            var grouped = ogrenciler.GroupBy(o => o.SinifDuzeyi)
                .Select(g => new {
                    SinifDuzeyi = g.Key,
                    Subeler = g.GroupBy(s => s.Sube).Select(sg => new {
                        Sube = sg.Key,
                        Ogrenciler = sg.Select(ogr => new {
                            ogr.OgrenciNo,
                            ogr.AdSoyad
                        }).ToList()
                    }).ToList()
                }).ToList();

            return Json(grouped);
        }

        [HttpGet]
        public async Task<IActionResult> GetOgrencilerListesi()
        {
            var ogrenciler = await _context.Ogrenciler
                .Select(o => new { o.OgrenciNo, AdSoyad = o.AdSoyad, Sinif = o.SinifDuzeyi + o.Sube })
                .OrderBy(o => o.Sinif)
                .ThenBy(o => o.OgrenciNo)
                .ToListAsync();

            return Json(ogrenciler);
        }

        [HttpPost]
        public async Task<IActionResult> SinavKaydet(OptikSinav model, string derslerJson, List<string> SeciliSiniflar, List<string> SeciliOgrenciler)
        {
            if (ModelState.IsValid)
            {
                var dersler = JsonSerializer.Deserialize<List<OptikSinavDers>>(derslerJson);
                model.Dersler = dersler;
                
                if (SeciliSiniflar != null && SeciliSiniflar.Any())
                    model.HedefSiniflar = string.Join(",", SeciliSiniflar);

                if (SeciliOgrenciler != null && SeciliOgrenciler.Any())
                    model.HedefOgrenciler = string.Join(",", SeciliOgrenciler);

                _context.OptikSinavlar.Add(model);
                await _context.SaveChangesAsync();
                TempData["SuccessMessage"] = "Sınav başarıyla oluşturuldu.";
                return RedirectToAction(nameof(SinavOlustur));
            }
            return RedirectToAction(nameof(SinavOlustur));
        }

        public async Task<IActionResult> SinavDuzenle(int id)
        {
            var sinav = await _context.OptikSinavlar.Include(s => s.Dersler).FirstOrDefaultAsync(s => s.Id == id);
            if (sinav == null) return NotFound();
            ViewBag.Formlar = await _context.OptikFormlar.Include(f => f.Dersler).ToListAsync();
            return View(sinav);
        }

        [HttpGet]
        public async Task<IActionResult> GetOptikFormDersleri(int formId)
        {
            var form = await _context.OptikFormlar.Include(f => f.Dersler).FirstOrDefaultAsync(f => f.Id == formId);
            if (form == null) return NotFound();

            return Json(form.Dersler.Select(d => new {
                dersAdi = d.DersAdi,
                soruSayisi = d.KarakterSayisi
            }));
        }

        [HttpPost]
        public async Task<IActionResult> SinavDuzenle(int id, OptikSinav model, string derslerJson, List<string> SeciliSiniflar, List<string> SeciliOgrenciler)
        {
            if (id != model.Id) return NotFound();

            var sinav = await _context.OptikSinavlar.Include(s => s.Dersler).FirstOrDefaultAsync(s => s.Id == id);
            if (sinav == null) return NotFound();

            sinav.SinavAdi = model.SinavAdi;
            sinav.UygulamaTarihi = model.UygulamaTarihi;
            sinav.YanlisDogruyuGotururSayisi = model.YanlisDogruyuGotururSayisi;

            sinav.HedefSiniflar = SeciliSiniflar != null && SeciliSiniflar.Any() ? string.Join(",", SeciliSiniflar) : null;
            sinav.HedefOgrenciler = SeciliOgrenciler != null && SeciliOgrenciler.Any() ? string.Join(",", SeciliOgrenciler) : null;

            _context.OptikSinavDersleri.RemoveRange(sinav.Dersler);
            
            if (!string.IsNullOrEmpty(derslerJson))
            {
                var dersler = JsonSerializer.Deserialize<List<OptikSinavDers>>(derslerJson);
                sinav.Dersler = dersler;
            }

            await _context.SaveChangesAsync();
            TempData["SuccessMessage"] = "Sınav başarıyla güncellendi.";
            return RedirectToAction(nameof(SinavOlustur));
        }

        [HttpPost]
        public async Task<IActionResult> SinavSil(int id)
        {
            var sinav = await _context.OptikSinavlar.FindAsync(id);
            if (sinav != null)
            {
                _context.OptikSinavlar.Remove(sinav);
                await _context.SaveChangesAsync();
                TempData["SuccessMessage"] = "Sınav başarıyla silindi.";
            }
            return RedirectToAction(nameof(SinavOlustur));
        }

        // 3. SINAV DEĞERLENDİRME & DİNAMİK EŞLEŞTİRME
        public async Task<IActionResult> SinavDegerlendir()
        {
            ViewBag.Sinavlar = await _context.OptikSinavlar.OrderByDescending(s => s.UygulamaTarihi).ToListAsync();
            ViewBag.Formlar = await _context.OptikFormlar.ToListAsync();
            return View();
        }

        [HttpGet]
        public async Task<IActionResult> GetSinavVeFormDersleri(int sinavId, int formId)
        {
            var sinav = await _context.OptikSinavlar.Include(s => s.Dersler).FirstOrDefaultAsync(s => s.Id == sinavId);
            var form = await _context.OptikFormlar.Include(f => f.Dersler).FirstOrDefaultAsync(f => f.Id == formId);

            if (sinav == null || form == null) return NotFound();

            return Json(new {
                SinavDersleri = sinav.Dersler.Select(d => d.DersAdi).ToList(),
                FormDersleri = form.Dersler.Select(d => d.DersAdi).ToList()
            });
        }

        [HttpPost]
        [IgnoreAntiforgeryToken]
        public async Task<IActionResult> TxtOku(int sinavId, int formId, IFormFile txtFile, string dersEslesmeleriJson)
        {
            if (txtFile == null || txtFile.Length == 0)
                return Json(new { success = false, message = "Dosya seçilmedi." });

            var sinav = await _context.OptikSinavlar.Include(s => s.Dersler).FirstOrDefaultAsync(s => s.Id == sinavId);
            var form = await _context.OptikFormlar.Include(f => f.Dersler).FirstOrDefaultAsync(f => f.Id == formId);
            
            if (sinav == null || form == null)
                return Json(new { success = false, message = "Sınav veya form bulunamadı." });

            // Eşleştirmeler dict: Key = SinavDersi, Value = FormDersi
            var dersEslesmeleri = new Dictionary<string, string>();
            if (!string.IsNullOrEmpty(dersEslesmeleriJson))
            {
                dersEslesmeleri = JsonSerializer.Deserialize<Dictionary<string, string>>(dersEslesmeleriJson) ?? new Dictionary<string, string>();
            }

            var hedeflenenSiniflar = string.IsNullOrEmpty(sinav.HedefSiniflar) 
                ? new List<string>() 
                : sinav.HedefSiniflar.Split(',').Select(x => x.Trim()).ToList();
                
            var hedeflenenOgrenciler = string.IsNullOrEmpty(sinav.HedefOgrenciler) 
                ? new List<string>() 
                : sinav.HedefOgrenciler.Split(',').Select(x => x.Trim()).ToList();

            var sonuclar = new List<object>();

            using (var reader = new StreamReader(txtFile.OpenReadStream()))
            {
                string line;
                while ((line = await reader.ReadLineAsync()) != null)
                {
                    if (string.IsNullOrWhiteSpace(line)) continue;

                    try
                    {
                        string ogrenciNo = "";
                        if (line.Length >= form.NumaraBaslangic + form.NumaraUzunluk)
                            ogrenciNo = line.Substring(form.NumaraBaslangic, form.NumaraUzunluk).Trim();

                        string sinif = "";
                        if (line.Length >= form.SinifBaslangic + form.SinifUzunluk)
                            sinif = line.Substring(form.SinifBaslangic, form.SinifUzunluk).Trim();

                        string adSoyad = "";
                        if (line.Length >= form.AdSoyadBaslangic + form.AdSoyadUzunluk)
                            adSoyad = line.Substring(form.AdSoyadBaslangic, form.AdSoyadUzunluk).Trim();

                        string kitapcikTuru = "A"; // Varsayılan
                        if (form.KitapcikTuruBaslangic.HasValue && form.KitapcikTuruUzunluk.HasValue)
                        {
                            if (line.Length >= form.KitapcikTuruBaslangic.Value + form.KitapcikTuruUzunluk.Value)
                            {
                                string okunanKitapcik = line.Substring(form.KitapcikTuruBaslangic.Value, form.KitapcikTuruUzunluk.Value).Trim().ToUpper();
                                if (okunanKitapcik == "A" || okunanKitapcik == "B" || okunanKitapcik == "C" || okunanKitapcik == "D")
                                {
                                    kitapcikTuru = okunanKitapcik;
                                }
                            }
                        }

                        // DB'den öğrenciyi bul (Filtrelemeden önce buluyoruz ki optikte sınıfını yanlış kodlayanları gerçek sınıfından yakalayabilelim)
                        var ogrenci = await _context.Ogrenciler.FirstOrDefaultAsync(o => o.OgrenciNo == ogrenciNo);
                        string ogrenciDbDurum = ogrenci != null ? "Bulundu" : "Bulunamadı";
                        string ogrenciDbAd = ogrenci != null ? ogrenci.AdSoyad : adSoyad;

                        // Sınıf metinlerini standardize et (boşlukları ve tireleri kaldır, büyük harf yap)
                        string cleanSinif = sinif.Replace(" ", "").Replace("-", "").ToUpper();
                        var cleanHedefSiniflar = hedeflenenSiniflar.Select(x => x.Replace(" ", "").Replace("-", "").ToUpper()).ToList();

                        // Filtre kontrolü (Sınıf veya Öğrenci)
                        bool shouldEvaluate = false;
                        if (!cleanHedefSiniflar.Any() && !hedeflenenOgrenciler.Any()) {
                            shouldEvaluate = true; // Kısıtlama yok
                        } else {
                            if (cleanHedefSiniflar.Contains(cleanSinif)) shouldEvaluate = true; // Kodlanan sınıf hedeflerde var
                            if (hedeflenenOgrenciler.Contains(ogrenciNo)) shouldEvaluate = true; // Kodlanan no hedeflerde var
                            
                            // Eğer öğrenci veritabanında bulunduysa ve veritabanındaki gerçek sınıfı hedefler arasındaysa, 
                            // çocuk optiğe sınıfını yanlış kodlamış olsa bile değerlendirmeye al!
                            if (ogrenci != null)
                            {
                                string cleanDbSinif = $"{ogrenci.SinifDuzeyi}{ogrenci.Sube}".Replace(" ", "").Replace("-", "").ToUpper();
                                string cleanDbSinifSlash = $"{ogrenci.SinifDuzeyi}/{ogrenci.Sube}".Replace(" ", "").Replace("-", "").ToUpper();
                                if (cleanHedefSiniflar.Contains(cleanDbSinif) || cleanHedefSiniflar.Contains(cleanDbSinifSlash)) shouldEvaluate = true;
                            }
                        }

                        if (!shouldEvaluate) continue;

                        // Ders hesaplamaları
                        int toplamDogru = 0, toplamYanlis = 0, toplamBos = 0;
                        double toplamNet = 0;
                        var dersSonuclari = new List<object>();

                        foreach (var sinavDers in sinav.Dersler)
                        {
                            // Eşleştirilmiş form dersi adını bul
                            if (!dersEslesmeleri.TryGetValue(sinavDers.DersAdi, out var formDersAdi)) 
                                continue;

                            var formDers = form.Dersler.FirstOrDefault(d => d.DersAdi == formDersAdi);
                            if (formDers == null) continue;

                            string ogrenciCevaplari = "";
                            if (line.Length >= formDers.BaslangicSutun + formDers.KarakterSayisi)
                                ogrenciCevaplari = line.Substring(formDers.BaslangicSutun, formDers.KarakterSayisi);
                            else if (line.Length > formDers.BaslangicSutun)
                                ogrenciCevaplari = line.Substring(formDers.BaslangicSutun);
                            
                            ogrenciCevaplari = ogrenciCevaplari.PadRight(sinavDers.SoruSayisi, ' ');

                            int dDogru = 0, dYanlis = 0, dBos = 0;

                            string seciliAnahtar = sinavDers.CevapAnahtari;
                            if (kitapcikTuru == "B" && !string.IsNullOrEmpty(sinavDers.CevapAnahtariB)) seciliAnahtar = sinavDers.CevapAnahtariB;
                            if (kitapcikTuru == "C" && !string.IsNullOrEmpty(sinavDers.CevapAnahtariC)) seciliAnahtar = sinavDers.CevapAnahtariC;
                            if (kitapcikTuru == "D" && !string.IsNullOrEmpty(sinavDers.CevapAnahtariD)) seciliAnahtar = sinavDers.CevapAnahtariD;

                            if (string.IsNullOrEmpty(seciliAnahtar) || seciliAnahtar.Length < sinavDers.SoruSayisi)
                            {
                                // Anahtar yoksa veya eksikse bu dersi değerlendirme
                                continue;
                            }

                            for (int i = 0; i < sinavDers.SoruSayisi && i < seciliAnahtar.Length && i < ogrenciCevaplari.Length; i++)
                            {
                                char cvp = ogrenciCevaplari[i];
                                char anahtar = seciliAnahtar[i];

                                if (anahtar == 'X')
                                {
                                    // Soru iptal, dahil etme
                                    continue;
                                }
                                else if (anahtar == 'H')
                                {
                                    // Herkes için doğru
                                    dDogru++;
                                }
                                else if (cvp == ' ' || cvp == '*') 
                                {
                                    dBos++;
                                }
                                else if (cvp == anahtar) 
                                {
                                    dDogru++;
                                }
                                else 
                                {
                                    dYanlis++;
                                }
                            }

                            double dNet = dDogru;
                            if (sinav.YanlisDogruyuGotururSayisi > 0)
                            {
                                dNet = dDogru - (dYanlis / sinav.YanlisDogruyuGotururSayisi);
                            }

                            toplamDogru += dDogru;
                            toplamYanlis += dYanlis;
                            toplamBos += dBos;
                            toplamNet += dNet;

                            dersSonuclari.Add(new { 
                                DersAdi = sinavDers.DersAdi,
                                Kodlama = ogrenciCevaplari,
                                Dogru = dDogru,
                                Yanlis = dYanlis,
                                Bos = dBos,
                                Net = dNet
                            });
                        }

                        sonuclar.Add(new
                        {
                            OgrenciNo = ogrenciNo,
                            AdSoyad = ogrenciDbAd,
                            Sinif = sinif,
                            Durum = ogrenciDbDurum,
                            ToplamDogru = toplamDogru,
                            ToplamYanlis = toplamYanlis,
                            ToplamBos = toplamBos,
                            ToplamNet = Math.Round(toplamNet, 2),
                            KitapcikTuru = kitapcikTuru,
                            DersSonuclari = dersSonuclari,
                            OrijinalSatir = line
                        });

                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine("Satır Okuma Hatası: " + ex.Message);
                    }
                }
            }

            return Json(new { success = true, data = sonuclar, sinavDersleri = sinav.Dersler.Select(d => d.DersAdi).ToList() });
        }

        public class RecalculateRowDto
        {
            public int SinavId { get; set; }
            public string YeniOgrenciNo { get; set; }
            public string YeniKitapcikTuru { get; set; }
            public Dictionary<string, string> Kodlamalar { get; set; }
            public string OrijinalSatir { get; set; }
        }

        [HttpPost]
        [IgnoreAntiforgeryToken]
        public async Task<IActionResult> RecalculateRow([FromBody] RecalculateRowDto dto)
        {
            var sinav = await _context.OptikSinavlar.Include(s => s.Dersler).FirstOrDefaultAsync(s => s.Id == dto.SinavId);
            if (sinav == null) return Json(new { success = false, message = "Sınav bulunamadı." });

            var ogrenci = await _context.Ogrenciler.FirstOrDefaultAsync(o => o.OgrenciNo == dto.YeniOgrenciNo);
            string ogrenciDbDurum = ogrenci != null ? "Bulundu" : "Bulunamadı";
            string ogrenciDbAd = ogrenci != null ? ogrenci.AdSoyad : "Bilinmiyor";
            string sinif = ogrenci != null ? ogrenci.SinifDuzeyi + ogrenci.Sube : "-";
            string kitapcikTuru = dto.YeniKitapcikTuru ?? "A";

            int toplamDogru = 0, toplamYanlis = 0, toplamBos = 0;
            double toplamNet = 0;
            var dersSonuclari = new List<object>();

            foreach (var sinavDers in sinav.Dersler)
            {
                if (!dto.Kodlamalar.TryGetValue(sinavDers.DersAdi, out var ogrenciCevaplari))
                    continue; // Formda eşleştirilmemiş veya kodu silinmişse değerlendirme

                ogrenciCevaplari = ogrenciCevaplari.PadRight(sinavDers.SoruSayisi, ' ');
                int dDogru = 0, dYanlis = 0, dBos = 0;

                string seciliAnahtar = sinavDers.CevapAnahtari;
                if (kitapcikTuru == "B" && !string.IsNullOrEmpty(sinavDers.CevapAnahtariB)) seciliAnahtar = sinavDers.CevapAnahtariB;
                if (kitapcikTuru == "C" && !string.IsNullOrEmpty(sinavDers.CevapAnahtariC)) seciliAnahtar = sinavDers.CevapAnahtariC;
                if (kitapcikTuru == "D" && !string.IsNullOrEmpty(sinavDers.CevapAnahtariD)) seciliAnahtar = sinavDers.CevapAnahtariD;

                if (string.IsNullOrEmpty(seciliAnahtar) || seciliAnahtar.Length < sinavDers.SoruSayisi)
                    continue;

                for (int i = 0; i < sinavDers.SoruSayisi && i < seciliAnahtar.Length && i < ogrenciCevaplari.Length; i++)
                {
                    char cvp = ogrenciCevaplari[i];
                    char anahtar = seciliAnahtar[i];

                    if (anahtar == 'X') continue;
                    else if (anahtar == 'H') dDogru++;
                    else if (cvp == ' ' || cvp == '*') dBos++;
                    else if (cvp == anahtar) dDogru++;
                    else dYanlis++;
                }

                double dNet = dDogru;
                if (sinav.YanlisDogruyuGotururSayisi > 0)
                {
                    dNet = dDogru - ((double)dYanlis / sinav.YanlisDogruyuGotururSayisi);
                }

                toplamDogru += dDogru;
                toplamYanlis += dYanlis;
                toplamBos += dBos;
                toplamNet += dNet;

                dersSonuclari.Add(new { 
                    DersAdi = sinavDers.DersAdi,
                    Kodlama = ogrenciCevaplari,
                    Dogru = dDogru,
                    Yanlis = dYanlis,
                    Bos = dBos,
                    Net = dNet
                });
            }

            var result = new
            {
                OgrenciNo = dto.YeniOgrenciNo,
                AdSoyad = ogrenciDbAd,
                Sinif = sinif,
                Durum = ogrenciDbDurum,
                ToplamDogru = toplamDogru,
                ToplamYanlis = toplamYanlis,
                ToplamBos = toplamBos,
                ToplamNet = Math.Round(toplamNet, 2),
                KitapcikTuru = kitapcikTuru,
                DersSonuclari = dersSonuclari,
                OrijinalSatir = dto.OrijinalSatir // TODO: Eğer orijinal satırı güncellemek istersek yapabiliriz
            };

            return Json(new { success = true, data = result });
        }

        [HttpPost]
        [IgnoreAntiforgeryToken]
        public async Task<IActionResult> SonuclariKaydet(int sinavId, string sonuclarJson)
        {
            try
            {
                var sonuclar = JsonDocument.Parse(sonuclarJson).RootElement;

                var mevcutSonuclar = await _context.OptikSinavSonuclari
                    .Where(s => s.OptikSinavId == sinavId)
                    .ToListAsync();
                if (mevcutSonuclar.Any())
                {
                    _context.OptikSinavSonuclari.RemoveRange(mevcutSonuclar);
                    await _context.SaveChangesAsync();
                }

                foreach (var item in sonuclar.EnumerateArray())
                {
                    if (item.GetProperty("Durum").GetString() == "Bulunamadı")
                        continue;

                    var sonuc = new OptikSinavSonuc
                    {
                        OptikSinavId = sinavId,
                        OgrenciNo = item.GetProperty("OgrenciNo").GetString(),
                        ToplamDogru = item.GetProperty("ToplamDogru").GetInt32(),
                        ToplamYanlis = item.GetProperty("ToplamYanlis").GetInt32(),
                        ToplamBos = item.GetProperty("ToplamBos").GetInt32(),
                        ToplamNet = item.GetProperty("ToplamNet").GetDouble(),
                        OrijinalSatir = item.GetProperty("OrijinalSatir").GetString()
                    };

                    foreach (var d in item.GetProperty("DersSonuclari").EnumerateArray())
                    {
                        sonuc.DersSonuclari.Add(new OptikSinavSonucDers
                        {
                            DersAdi = d.GetProperty("DersAdi").GetString(),
                            Dogru = d.GetProperty("Dogru").GetInt32(),
                            Yanlis = d.GetProperty("Yanlis").GetInt32(),
                            Bos = d.GetProperty("Bos").GetInt32(),
                            Net = d.GetProperty("Net").GetDouble()
                        });
                    }

                    _context.OptikSinavSonuclari.Add(sonuc);
                }

                await _context.SaveChangesAsync();
                return Json(new { success = true });
            }
            catch (Exception ex)
            {
                return Json(new { success = false, message = ex.Message });
            }
        }

        // 4. SINAV SONUÇLARI
        public async Task<IActionResult> SinavSonuclari(int? sinavId, string ogrenciNo)
        {
            ViewBag.Sinavlar = await _context.OptikSinavlar.OrderByDescending(s => s.UygulamaTarihi).ToListAsync();
            ViewBag.SeciliSinavId = sinavId;
            ViewBag.SeciliOgrenciNo = ogrenciNo;

            var query = _context.OptikSinavSonuclari
                .Include(s => s.Ogrenci)
                .Include(s => s.DersSonuclari)
                .Include(s => s.OptikSinav)
                .AsQueryable();

            if (sinavId.HasValue && sinavId > 0)
            {
                query = query.Where(s => s.OptikSinavId == sinavId.Value);
            }

            if (!string.IsNullOrEmpty(ogrenciNo))
            {
                query = query.Where(s => s.OgrenciNo == ogrenciNo);
            }

            var sonuclar = await query.OrderByDescending(s => s.ToplamNet).ToListAsync();
            return View(sonuclar);
        }
    }
}
