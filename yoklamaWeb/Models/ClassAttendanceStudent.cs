using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace yoklamaWeb.Models
{
    public class ClassAttendanceStudent
    {
        [Key]
        public int Id { get; set; }

        [ForeignKey(nameof(ClassAttendance))]
        public int ClassAttendanceId { get; set; }
        public ClassAttendance ClassAttendance { get; set; } = null!;

        [Required]
        [MaxLength(20)]
        public string OgrenciNo { get; set; } = null!;

        [Required]
        [MaxLength(20)]
        public string SinifDuzeyi { get; set; } = null!;

        [Required]
        [MaxLength(20)]
        public string Sube { get; set; } = null!;

        [Required]
        [MaxLength(200)]
        public string AdSoyad { get; set; } = null!;

        [MaxLength(20)]
        public string? Salon { get; set; }

        [MaxLength(20)]
        public string? Sira { get; set; }
    }
}
