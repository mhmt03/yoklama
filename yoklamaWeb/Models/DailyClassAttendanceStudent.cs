using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace yoklamaWeb.Models
{
    public class DailyClassAttendanceStudent
    {
        [Key]
        public int Id { get; set; }

        [Required]
        public int DailyClassAttendanceId { get; set; }

        [ForeignKey(nameof(DailyClassAttendanceId))]
        public virtual DailyClassAttendance DailyClassAttendance { get; set; } = null!;

        [Required]
        [MaxLength(20)]
        public string OgrenciNo { get; set; } = null!;

        [Required]
        [MaxLength(200)]
        public string AdSoyad { get; set; } = null!;

        [Required]
        [MaxLength(20)]
        public string SinifDuzeyi { get; set; } = null!;

        [Required]
        [MaxLength(20)]
        public string Sube { get; set; } = null!;

        [MaxLength(20)]
        public string? Salon { get; set; }

        [MaxLength(20)]
        public string? Sira { get; set; }

        [Required]
        [MaxLength(20)]
        public string Durum { get; set; } = "Belirsiz"; // "Var", "Yok", "Gec", "Belirsiz"

        [Required]
        public int OturumNo { get; set; }

        [MaxLength(200)]
        public string? Not { get; set; }

        public string? YoklamaYapanKullaniciAdi { get; set; }

        public DateTime? KayitZamani { get; set; }
    }
}
