using Microsoft.EntityFrameworkCore;
using OgretmenAjanda.Api.Models;

namespace OgretmenAjanda.Api.Data
{
    public class AppDbContext : DbContext
    {
        public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
        {
        }

        public DbSet<Institution> Institutions => Set<Institution>();
        public DbSet<School> Schools => Set<School>();
        public DbSet<User> Users => Set<User>();
        public DbSet<Student> Students => Set<Student>();
        public DbSet<Assignment> Assignments => Set<Assignment>();
        public DbSet<AssignmentSubmission> AssignmentSubmissions => Set<AssignmentSubmission>();
        public DbSet<StudentEvaluation> StudentEvaluations => Set<StudentEvaluation>();
        public DbSet<ScheduleItem> ScheduleItems => Set<ScheduleItem>();
        public DbSet<YearlyPlanItem> YearlyPlanItems => Set<YearlyPlanItem>();
        public DbSet<AppMessage> AppMessages => Set<AppMessage>();
        public DbSet<AuditLog> AuditLogs => Set<AuditLog>();
        public DbSet<SchoolClass> SchoolClasses => Set<SchoolClass>();
        public DbSet<SchoolLesson> SchoolLessons => Set<SchoolLesson>();
        public DbSet<TeacherDuty> TeacherDuties => Set<TeacherDuty>();

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            // Kurum Kodu Benzersiz (Unique)
            modelBuilder.Entity<Institution>()
                .HasIndex(i => i.Code)
                .IsUnique();

            // Okul Kodu Benzersiz (Unique)
            modelBuilder.Entity<School>()
                .HasIndex(s => s.Code)
                .IsUnique();

            // Kullanıcı adı Kurum (CustomerId) bazında indeks
            modelBuilder.Entity<User>()
                .HasIndex(u => new { u.CustomerId, u.Username });

            // Öğrenci numarası aynı okul içinde benzersiz
            modelBuilder.Entity<Student>()
                .HasIndex(s => new { s.SchoolId, s.StudentNumber })
                .IsUnique();

            // Ödev teslim kaydı tekil olmalı
            modelBuilder.Entity<AssignmentSubmission>()
                .HasIndex(sub => new { sub.AssignmentId, sub.StudentId })
                .IsUnique();

            // Audit log için index
            modelBuilder.Entity<AuditLog>()
                .HasIndex(a => new { a.SchoolId, a.Timestamp });
        }
    }
}
