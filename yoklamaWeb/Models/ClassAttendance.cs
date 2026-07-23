using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;

namespace yoklamaWeb.Models
{
    public class ClassAttendance
    {
        [Key]
        public int Id { get; set; }

        [Required]
        public string Name { get; set; } = null!;

        [Required]
        public DateTime ValidFrom { get; set; }

        [Required]
        public DateTime ValidTo { get; set; }

        [Required]
        public string BuildingNumber { get; set; } = null!;

        public TimeSpan? StartTime { get; set; }
        public TimeSpan? EndTime { get; set; }

        public bool OnlyCurrentDayAttendance { get; set; }

        public virtual List<ClassAttendanceStudent> Students { get; set; } = new();
    }
}
