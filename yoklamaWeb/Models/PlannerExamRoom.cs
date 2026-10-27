using System.ComponentModel.DataAnnotations;

namespace yoklamaWeb.Models
{
    public class PlannerExamRoom
    {
        [Key]
        public int Id { get; set; }

        [Required]
        public int PlannerExamId { get; set; }
        public PlannerExam? PlannerExam { get; set; }

        [Required]
        public int PlannerRoomId { get; set; }
        public PlannerRoom? PlannerRoom { get; set; }
    }
}
