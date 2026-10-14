using System;
using System.Collections.Generic;

namespace OgretmenAjanda.Api.DTOs
{
    public class StudentSyncItem
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public string StudentNumber { get; set; } = string.Empty;
        public string FullName { get; set; } = string.Empty;
        public string Grade { get; set; } = string.Empty;
        public string Section { get; set; } = string.Empty;
        public string? PhotoPath { get; set; }
        public string? ParentName { get; set; }
        public string? ParentPhone { get; set; }
        public string? StudentPhone { get; set; }
    }

    public class BatchStudentSyncRequest
    {
        public Guid SchoolId { get; set; }
        public List<StudentSyncItem> Students { get; set; } = new();
    }

    public class ScheduleSyncItem
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public string? TeacherName { get; set; }
        public int DayOfWeek { get; set; }
        public int LessonHour { get; set; }
        public string Grade { get; set; } = string.Empty;
        public string Section { get; set; } = string.Empty;
        public string LessonName { get; set; } = string.Empty;
        public string? Classroom { get; set; }
    }

    public class BatchScheduleSyncRequest
    {
        public Guid SchoolId { get; set; }
        public bool OverwriteAll { get; set; } = false;
        public bool SyncTeachers { get; set; } = true;
        public bool SyncClasses { get; set; } = true;
        public bool SyncLessons { get; set; } = true;
        public bool SyncSchedules { get; set; } = true;
        public List<string> Teachers { get; set; } = new();
        public List<string> Classes { get; set; } = new();
        public List<string> Lessons { get; set; } = new();
        public List<ScheduleSyncItem> Schedules { get; set; } = new();
    }

    public class YearlyPlanSyncItem
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public string LessonName { get; set; } = string.Empty;
        public string Grade { get; set; } = string.Empty;
        public int WeekNumber { get; set; }
        public string Subject { get; set; } = string.Empty;
        public string LearningOutcomes { get; set; } = string.Empty;
    }

    public class BatchYearlyPlanSyncRequest
    {
        public Guid SchoolId { get; set; }
        public List<YearlyPlanSyncItem> PlanItems { get; set; } = new();
    }

    public class AssignmentSyncRequest
    {
        public Guid Id { get; set; }
        public Guid SchoolId { get; set; }
        public string LessonName { get; set; } = string.Empty;
        public string Title { get; set; } = string.Empty;
        public string? Description { get; set; }
        public DateTime DueDate { get; set; }
        public string TargetGrade { get; set; } = string.Empty;
        public string TargetSection { get; set; } = string.Empty;
        public List<SubmissionSyncItem> Submissions { get; set; } = new();
    }

    public class SubmissionSyncItem
    {
        public Guid Id { get; set; }
        public Guid StudentId { get; set; }
        public string Status { get; set; } = "NOT_DONE";
        public string? Feedback { get; set; }
    }

    public class EvaluationSyncRequest
    {
        public Guid Id { get; set; }
        public Guid SchoolId { get; set; }
        public Guid StudentId { get; set; }
        public string Type { get; set; } = "NOTE";
        public string? Title { get; set; }
        public string Content { get; set; } = string.Empty;
        public double? Score { get; set; }
        public bool IsSharedWithParent { get; set; }
    }
}
