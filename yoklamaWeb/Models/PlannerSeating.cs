using System.ComponentModel.DataAnnotations;

namespace yoklamaWeb.Models
{
    public class PlannerSeating
    {
        [Key]
        public int Id { get; set; }

        [Required]
        public int PlannerExamId { get; set; }
        public PlannerExam? PlannerExam { get; set; }

        [Required]
        [MaxLength(20)]
        public string OgrenciNo { get; set; } = null!;

        [Required]
        [MaxLength(100)]
        public string AdSoyad { get; set; } = null!;

        [Required]
        [MaxLength(20)]
        public string SinifDuzeyi { get; set; } = null!;

        [Required]
        [MaxLength(20)]
        public string Sube { get; set; } = null!;

        [Required]
        [MaxLength(100)]
        public string RoomName { get; set; } = null!;

        [Required]
        public int SeatNumber { get; set; }

        [Required]
        public int Sira { get; set; }

        [MaxLength(100)]
        [Display(Name = "Yazılı Dersi")]
        public string? Ders { get; set; }

        [MaxLength(20)]
        [Display(Name = "Alanı")]
        public string? Alan { get; set; }
    }
}
