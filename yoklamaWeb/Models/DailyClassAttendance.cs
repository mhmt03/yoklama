using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace yoklamaWeb.Models
{
    public class DailyClassAttendance
    {
        [Key]
        public int Id { get; set; }

        [Required]
        public int ClassAttendanceId { get; set; }
        
        [ForeignKey(nameof(ClassAttendanceId))]
        public virtual ClassAttendance ClassAttendance { get; set; } = null!;

        [Required]
        public DateTime Tarih { get; set; }



        [MaxLength(500)]
        public string? SalonNotu { get; set; }

        [MaxLength(500)]
        public string? GozetmenNotu { get; set; }

        public string? YoklamaYapanKullaniciAdi { get; set; }

        public DateTime KayitZamani { get; set; } = DateTime.UtcNow;

        public virtual List<DailyClassAttendanceStudent> Students { get; set; } = new();
    }
}
