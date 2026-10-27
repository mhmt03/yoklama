using System;
using System.ComponentModel.DataAnnotations;

namespace yoklamaWeb.Models
{
    public class PlannerExam
    {
        [Key]
        public int Id { get; set; }

        [Required(ErrorMessage = "Sınav adı zorunludur.")]
        [MaxLength(200)]
        [Display(Name = "Sınav Adı")]
        public string Name { get; set; } = null!;

        [Required(ErrorMessage = "Tarih zorunludur.")]
        [DataType(DataType.Date)]
        [Display(Name = "Sınav Tarihi")]
        public DateTime ExamDate { get; set; }

        [Required(ErrorMessage = "Saat zorunludur.")]
        [Display(Name = "Başlangıç Saati")]
        public string StartTime { get; set; } = null!;

        [MaxLength(50)]
        [Display(Name = "Sınav Türü")]
        public string ExamType { get; set; } = "Deneme";
    }
}
