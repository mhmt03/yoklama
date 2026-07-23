using System;
using System.ComponentModel.DataAnnotations;
using System.Collections.Generic;

namespace yoklamaWeb.Models
{
    public class Exam
    {
        [Key]
        public int Id { get; set; }

        [Required]
        public string Name { get; set; }

        [Required]
        public DateTime ApplicationDate { get; set; }

        [Required]
        public string BuildingNumber { get; set; }

        // Validity period for attendance
        [Required]
        public DateTime ValidFrom { get; set; }
        [Required]
        public DateTime ValidTo { get; set; }

        // Optional time range for attendance within a day
        public TimeSpan? StartTime { get; set; }
        public TimeSpan? EndTime { get; set; }

        // Navigation property for seat assignments
        public virtual ICollection<ExamSeat> ExamSeats { get; set; } = new List<ExamSeat>();

        // Automatically true on creation
        public bool IsActive { get; set; } = true;
    }
}
