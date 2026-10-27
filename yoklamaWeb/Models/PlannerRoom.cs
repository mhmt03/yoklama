using System.ComponentModel.DataAnnotations;

namespace yoklamaWeb.Models
{
    public class PlannerRoom
    {
        [Key]
        public int Id { get; set; }

        [Required(ErrorMessage = "Salon adı zorunludur.")]
        [MaxLength(100)]
        [Display(Name = "Salon Adı")]
        public string RoomName { get; set; } = null!;

        [Required(ErrorMessage = "Kapasite zorunludur.")]
        [Range(1, 1000, ErrorMessage = "Kapasite 1 ile 1000 arasında olmalıdır.")]
        [Display(Name = "Kapasite")]
        public int Capacity { get; set; }

        [MaxLength(50)]
        [Display(Name = "Grup")]
        public string? RoomGroup { get; set; }
    }
}
