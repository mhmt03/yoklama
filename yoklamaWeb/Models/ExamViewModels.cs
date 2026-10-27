using System;

namespace yoklamaWeb.Models
{
    public class AttendanceReportPreviewItem
    {
        public string OgrenciNo { get; set; } = string.Empty;
        public string AdSoyad { get; set; } = string.Empty;
        public string SinifDuzeyi { get; set; } = string.Empty;
        public string Sube { get; set; } = string.Empty;
        public string ExamName { get; set; } = string.Empty;
        public string ExamDate { get; set; } = string.Empty;
        public string Status { get; set; } = string.Empty;
        public int YoklamaNo { get; set; }
    }
}
