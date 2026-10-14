using Microsoft.EntityFrameworkCore;
using OgretmenAjanda.Api.Models;

namespace OgretmenAjanda.Api.Data
{
    public class AppDbContext : DbContext
    {
        public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
        {
        }

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

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            // Okul Kodu Benzersiz (Unique)
            modelBuilder.Entity<School>()
                .HasIndex(s => s.Code)
                .IsUnique();

            // Kullanıcı adı Okul bazında veya globalde benzersiz
            modelBuilder.Entity<User>()
                .HasIndex(u => u.Username)
                .IsUnique();

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
