using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace yoklamaWeb.Models
{
    [Table("TemporaryProctors")]
    public class TemporaryProctor
    {
        [Key]
        public int Id { get; set; }

        // Exam to which this proctor belongs
        [ForeignKey("Exam")]
        public int ExamId { get; set; }
        public Exam Exam { get; set; } = null!;

        // Salon that the proctor will manage
        [Required]
        [MaxLength(100)]
        public string Room { get; set; } = "salonsuz";

        // Identity user representing the proctor (role Yoklamaci)
        [Required]
        public string UserId { get; set; } = null!;
        public Microsoft.AspNetCore.Identity.IdentityUser User { get; set; } = null!;

        [Required]
        [MaxLength(10)]
        public string Password { get; set; } = null!;

        [Required]
        public DateTime ValidFrom { get; set; }
        [Required]
        public DateTime ValidTo { get; set; }

        public TimeSpan? StartTime { get; set; }
        public TimeSpan? EndTime { get; set; }

        [MaxLength(100)]
        public string? ProctorName { get; set; }

        [MaxLength(500)]
        public string? ExamNote { get; set; }

        [MaxLength(500)]
        public string? RoomNote { get; set; }
    }
}
