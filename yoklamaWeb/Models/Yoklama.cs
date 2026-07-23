using System;
using System.ComponentModel.DataAnnotations;

namespace yoklamaWeb.Models
{
    public class Yoklama
    {
        [Key]
        public int Id { get; set; }

        // Sınav referansı
        [Required]
        public int SinavId { get; set; }
        public Sinav Sinav { get; set; }

        // Öğrenci referansı
        [Required]
        [MaxLength(20)]
        public string OgrenciNo { get; set; }
        public Ogrenci Ogrenci { get; set; }

        // Salon ve sıra bilgileri
        [MaxLength(20)]
        public string Salon { get; set; }
        public int? Sira { get; set; }

        // Durum: Var, Yok, KontrolEdilmedi, Gec
        [Required]
        [MaxLength(20)]
        public string Durum { get; set; }

        // Not (varsa)
        public string Not { get; set; }

        // Yoklamayı yapan kullanıcı (Admin/Yoklamaci)
        public int? YoklamaYapanId { get; set; }
        public string YoklamaYapanKullaniciAdi { get; set; }

        public DateTime KayitZamani { get; set; } = DateTime.UtcNow;

        // Concurrency token
        public byte[] RowVersion { get; set; }
    }
}
