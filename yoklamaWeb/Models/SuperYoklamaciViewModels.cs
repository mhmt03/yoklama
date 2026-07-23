using System;
using System.Collections.Generic;

namespace yoklamaWeb.Models
{
    public class SuperYoklamaciExamItemViewModel
    {
        public int ExamId { get; set; }
        public string ExamName { get; set; } = string.Empty;
        public DateTime ApplicationDate { get; set; }
        public string BuildingNumber { get; set; } = string.Empty;
        public DateTime ValidFrom { get; set; }
        public DateTime ValidTo { get; set; }
        public TimeSpan? StartTime { get; set; }
        public TimeSpan? EndTime { get; set; }
        public bool IsAccessible { get; set; }
    }

    public class SuperYoklamaciRoomsViewModel
    {
        public int ExamId { get; set; }
        public string ExamName { get; set; } = string.Empty;
        public DateTime ApplicationDate { get; set; }
        public List<SuperYoklamaciRoomItem> Rooms { get; set; } = new();
    }

    public class SuperYoklamaciRoomItem
    {
        public string RoomName { get; set; } = string.Empty;
        public int StudentCount { get; set; }
        public string? ProctorName { get; set; }
    }

    public class SuperYoklamaciTakeAttendanceViewModel
    {
        public int ExamId { get; set; }
        public string ExamName { get; set; } = string.Empty;
        public DateTime ApplicationDate { get; set; }
        public string Room { get; set; } = string.Empty;
        public List<AttendanceSeatRow> Seats { get; set; } = new();
        public string SortBy { get; set; } = "Sira";
        public string FilterStatus { get; set; } = "Tumu";
        public bool IsTimeValid { get; set; }
        public string? ProctorName { get; set; }
        public string? ExamNote { get; set; }
    }
}
