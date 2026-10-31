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
        public DbSet<ExamHall> ExamHalls => Set<ExamHall>();
        public DbSet<WrittenExam> WrittenExams => Set<WrittenExam>();
        public DbSet<ExamSeating> ExamSeatings => Set<ExamSeating>();
        public DbSet<OptikForm> OptikFormlar => Set<OptikForm>();
        public DbSet<OptikFormDers> OptikFormDersleri => Set<OptikFormDers>();
        public DbSet<OptikSinav> OptikSinavlar => Set<OptikSinav>();
        public DbSet<OptikSinavDers> OptikSinavDersleri => Set<OptikSinavDers>();
        public DbSet<OptikSoruKazanim> OptikSoruKazanimlari => Set<OptikSoruKazanim>();
        public DbSet<OptikSinavSonuc> OptikSinavSonuclari => Set<OptikSinavSonuc>();
        public DbSet<OptikSinavSonucDers> OptikSinavSonucDersleri => Set<OptikSinavSonucDers>();
        public DbSet<OptikSinavSonucKazanim> OptikSinavSonucKazanimlari => Set<OptikSinavSonucKazanim>();
        public DbSet<ClassAttendanceDefinition> ClassAttendanceDefinitions => Set<ClassAttendanceDefinition>();
        public DbSet<DailyClassAttendance> DailyClassAttendances => Set<DailyClassAttendance>();

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

            // Sınav salonları okul bazında indeks
            modelBuilder.Entity<ExamHall>()
                .HasIndex(h => new { h.SchoolId, h.RoomName });

            // Sınav oturma kayıtları indeks
            modelBuilder.Entity<ExamSeating>()
                .HasIndex(s => new { s.WrittenExamId, s.StudentNumber });

            modelBuilder.Entity<ExamSeating>()
                .HasIndex(s => new { s.SchoolId, s.WrittenExamId });

            // Optik Modül İlişkiler ve İndeksler
            modelBuilder.Entity<OptikForm>()
                .HasIndex(f => f.SchoolId);

            modelBuilder.Entity<OptikForm>()
                .HasMany(f => f.Dersler)
                .WithOne()
                .HasForeignKey(d => d.OptikFormId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<OptikSinav>()
                .HasIndex(s => new { s.SchoolId, s.UygulamaTarihi });

            modelBuilder.Entity<OptikSinav>()
                .HasMany(s => s.Dersler)
                .WithOne()
                .HasForeignKey(d => d.OptikSinavId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<OptikSoruKazanim>()
                .HasIndex(k => new { k.OptikSinavId, k.DersAdi, k.SoruNo });

            modelBuilder.Entity<OptikSinavSonuc>()
                .HasIndex(r => new { r.OptikSinavId, r.OgrenciNo });

            modelBuilder.Entity<OptikSinavSonuc>()
                .HasIndex(r => new { r.SchoolId, r.OptikSinavId });

            modelBuilder.Entity<OptikSinavSonuc>()
                .HasMany(r => r.DersSonuclari)
                .WithOne()
                .HasForeignKey(d => d.OptikSinavSonucId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<OptikSinavSonucKazanim>()
                .HasIndex(k => new { k.OptikSinavId, k.OgrenciNo });
        }
    }
}
