using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using yoklamaWeb.Models;


namespace yoklamaWeb.Data
{
    public class AppDbContext : IdentityDbContext<IdentityUser>
    {
        public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

        public override int SaveChanges(bool acceptAllChangesOnSuccess)
        {
            UpdateRowVersions();
            return base.SaveChanges(acceptAllChangesOnSuccess);
        }

        public override Task<int> SaveChangesAsync(bool acceptAllChangesOnSuccess, CancellationToken cancellationToken = default)
        {
            UpdateRowVersions();
            return base.SaveChangesAsync(acceptAllChangesOnSuccess, cancellationToken);
        }

        private void UpdateRowVersions()
        {
            var entries = ChangeTracker.Entries()
                .Where(e => e.State == EntityState.Added || e.State == EntityState.Modified);

            foreach (var entry in entries)
            {
                var rowVersionProp = entry.Metadata.FindProperty("RowVersion");
                if (rowVersionProp != null && rowVersionProp.ClrType == typeof(byte[]))
                {
                    var newBytes = new byte[8];
                    Random.Shared.NextBytes(newBytes);
                    entry.Property("RowVersion").CurrentValue = newBytes;
                }
            }
        }

        public DbSet<Admin> Adminler { get; set; }
        public DbSet<Yoklamaci> Yoklamacilar { get; set; }
        public DbSet<SuperYoklamaci> SuperYoklamacilar { get; set; }
        public DbSet<Ogrenci> Ogrenciler { get; set; }
        public DbSet<Sinav> Sinavlar { get; set; }
        public DbSet<Yoklama> Yoklamalar { get; set; }
        public DbSet<YoklamaciClass> YoklamaciClasses { get; set; }
        public DbSet<Sinif> Siniflar { get; set; }
        public DbSet<ClassAttendance> ClassAttendances { get; set; }
        public DbSet<ClassAttendanceStudent> ClassAttendanceStudents { get; set; }
        public DbSet<Exam> Exams { get; set; }
        public DbSet<ExamSeat> ExamSeats { get; set; }
        public DbSet<TemporaryProctor> TemporaryProctors { get; set; }
        // Pansiyon Module
        public DbSet<PansiyonOgrenci> PansiyonOgrenciler { get; set; }
        public DbSet<Oda> Odalar { get; set; }
        public DbSet<PansiyonGorevlisi> PansiyonGorevlileri { get; set; }
        public DbSet<NobetciPlan> NobetciPlanlar { get; set; }
        public DbSet<PansiyonYoklama> PansiyonYoklamalar { get; set; }
        public DbSet<IzinGirisi> IzinGirisleri { get; set; }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);
            // Configure entities, constraints, and relationships
            modelBuilder.Entity<Admin>(entity =>
            {
                entity.HasKey(e => e.Id);
                entity.HasIndex(e => e.KullaniciAdi).IsUnique();
            });
            modelBuilder.Entity<Yoklamaci>(entity =>
            {
                entity.HasKey(e => e.Id);
                entity.HasIndex(e => e.KullaniciAdi).IsUnique();
            });
            modelBuilder.Entity<SuperYoklamaci>(entity =>
            {
                entity.HasKey(e => e.Id);
                entity.HasIndex(e => e.KullaniciAdi).IsUnique();
            });
            modelBuilder.Entity<Ogrenci>(entity =>
            {
                entity.HasKey(e => e.OgrenciNo);
                entity.HasIndex(e => e.OgrenciNo).IsUnique();
            });
            modelBuilder.Entity<Sinav>(entity =>
            {
                entity.HasKey(e => e.Id);
            });
            modelBuilder.Entity<Yoklama>(entity =>
            {
                entity.HasKey(e => e.Id);
                entity.Property(e => e.RowVersion).IsConcurrencyToken();
                entity.HasOne(e => e.Sinav)
                    .WithMany()
                    .HasForeignKey(e => e.SinavId)
                    .OnDelete(DeleteBehavior.Cascade);
                entity.HasOne(e => e.Ogrenci)
                    .WithMany()
                    .HasForeignKey(e => e.OgrenciNo)
                    .OnDelete(DeleteBehavior.Restrict);
            });

            modelBuilder.Entity<TemporaryProctor>(entity =>
            {
                entity.ToTable("TemporaryProctors");
                entity.HasKey(e => e.Id);
                entity.Property(e => e.Room).IsRequired().HasMaxLength(100);
                entity.Property(e => e.Password).IsRequired().HasMaxLength(10);
                entity.HasOne(e => e.Exam)
                    .WithMany()
                    .HasForeignKey(e => e.ExamId)
                    .OnDelete(DeleteBehavior.Cascade);
                entity.HasOne(e => e.User)
                    .WithMany()
                    .HasForeignKey(e => e.UserId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            modelBuilder.Entity<ClassAttendance>(entity =>
            {
                entity.HasKey(e => e.Id);
                entity.Property(e => e.Name).IsRequired();
                entity.Property(e => e.BuildingNumber).IsRequired();
                entity.HasMany(e => e.Students)
                    .WithOne(s => s.ClassAttendance)
                    .HasForeignKey(s => s.ClassAttendanceId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            modelBuilder.Entity<ClassAttendanceStudent>(entity =>
            {
                entity.HasKey(e => e.Id);
                entity.Property(e => e.OgrenciNo).IsRequired().HasMaxLength(20);
                entity.Property(e => e.SinifDuzeyi).IsRequired().HasMaxLength(20);
                entity.Property(e => e.Sube).IsRequired().HasMaxLength(20);
                entity.Property(e => e.AdSoyad).IsRequired().HasMaxLength(200);
            });

            // Pansiyon Module Configurations
            modelBuilder.Entity<PansiyonOgrenci>(entity =>
            {
                entity.HasKey(e => e.Id);
                entity.HasIndex(e => e.OgrenciNo).IsUnique();
                entity.Property(e => e.OgrenciNo).IsRequired().HasMaxLength(20);
                entity.Property(e => e.AdSoyad).IsRequired().HasMaxLength(100);
                entity.Property(e => e.SinifDuzeyi).HasMaxLength(20);
                entity.Property(e => e.Sube).HasMaxLength(10);
                entity.Property(e => e.Telefon).HasMaxLength(11);
                entity.Property(e => e.VeliTelefon).HasMaxLength(11);
                entity.Property(e => e.Adres).HasMaxLength(200);
                entity.Property(e => e.KayitTarihi).IsRequired();
                entity.Property(e => e.Aktif).IsRequired();
                entity.Property(e => e.RowVersion).IsConcurrencyToken();
                entity.HasOne(e => e.Oda)
                    .WithMany(o => o.Ogrenciler)
                    .HasForeignKey(e => e.OdaId)
                    .OnDelete(DeleteBehavior.SetNull);
            });

            modelBuilder.Entity<Oda>(entity =>
            {
                entity.HasKey(e => e.Id);
                entity.HasIndex(e => e.OdaNo).IsUnique();
                entity.Property(e => e.OdaNo).IsRequired().HasMaxLength(20);
                entity.Property(e => e.Kapasite).IsRequired();
                entity.Property(e => e.Kat).IsRequired();
                entity.Property(e => e.Cinsiyet).IsRequired().HasMaxLength(10);
                entity.Property(e => e.Aciklama).HasMaxLength(200);
                entity.Property(e => e.Aktif).IsRequired();
                entity.Property(e => e.OlusturmaTarihi).IsRequired();
                entity.Property(e => e.RowVersion).IsConcurrencyToken();
            });

            modelBuilder.Entity<PansiyonGorevlisi>(entity =>
            {
                entity.HasKey(e => e.Id);
                entity.HasIndex(e => e.KullaniciAdi).IsUnique();
                entity.Property(e => e.KullaniciAdi).IsRequired().HasMaxLength(50);
                entity.Property(e => e.AdSoyad).IsRequired().HasMaxLength(100);
                entity.Property(e => e.Rol).IsRequired().HasMaxLength(20);
                entity.Property(e => e.Telefon).HasMaxLength(11);
                entity.Property(e => e.Email).HasMaxLength(100);
                entity.Property(e => e.Aktif).IsRequired();
                entity.Property(e => e.KayitTarihi).IsRequired();
                entity.Property(e => e.SonGirisTarihi);
                entity.Property(e => e.RowVersion).IsConcurrencyToken();
                entity.HasMany(e => e.NobetciPlanlari)
                    .WithOne(n => n.PansiyonGorevlisi)
                    .HasForeignKey(n => n.PansiyonGorevlisiId)
                    .OnDelete(DeleteBehavior.Cascade);
                entity.HasMany(e => e.Yoklamalar)
                    .WithOne(y => y.YoklamaYapan)
                    .HasForeignKey(y => y.YoklamaYapanId)
                    .OnDelete(DeleteBehavior.Restrict);
                entity.HasMany(e => e.IzinGirisleri)
                    .WithOne(i => i.Onaylayan)
                    .HasForeignKey(i => i.OnaylayanId)
                    .OnDelete(DeleteBehavior.Restrict);
            });

            modelBuilder.Entity<NobetciPlan>(entity =>
            {
                entity.HasKey(e => e.Id);
                entity.Property(e => e.PansiyonGorevlisiId).IsRequired();
                entity.Property(e => e.BaslangicTarihi).IsRequired();
                entity.Property(e => e.BitisTarihi).IsRequired();
                entity.Property(e => e.Gun).IsRequired().HasMaxLength(20);
                entity.Property(e => e.Aciklama).HasMaxLength(200);
                entity.Property(e => e.OlusturmaTarihi).IsRequired();
                entity.Property(e => e.OlusturanId);
                entity.Property(e => e.RowVersion).IsConcurrencyToken();
                entity.HasOne(e => e.PansiyonGorevlisi)
                    .WithMany(g => g.NobetciPlanlari)
                    .HasForeignKey(e => e.PansiyonGorevlisiId)
                    .OnDelete(DeleteBehavior.Cascade);
                entity.HasOne(e => e.Olusturan)
                    .WithMany()
                    .HasForeignKey(e => e.OlusturanId)
                    .OnDelete(DeleteBehavior.Restrict);
            });

            modelBuilder.Entity<PansiyonYoklama>(entity =>
            {
                entity.HasKey(e => e.Id);
                entity.Property(e => e.PansiyonOgrenciId).IsRequired();
                entity.Property(e => e.Tarih).IsRequired();
                entity.Property(e => e.Durum).IsRequired().HasMaxLength(20);
                entity.Property(e => e.Aciklama).HasMaxLength(500);
                entity.Property(e => e.YoklamaYapanId).IsRequired();
                entity.Property(e => e.RowVersion).IsConcurrencyToken();
                entity.HasOne(e => e.PansiyonOgrenci)
                    .WithMany(o => o.Yoklamalar)
                    .HasForeignKey(e => e.PansiyonOgrenciId)
                    .OnDelete(DeleteBehavior.Cascade);
                entity.HasOne(e => e.YoklamaYapan)
                    .WithMany(g => g.Yoklamalar)
                    .HasForeignKey(e => e.YoklamaYapanId)
                    .OnDelete(DeleteBehavior.Restrict);
            });

            modelBuilder.Entity<IzinGirisi>(entity =>
            {
                entity.HasKey(e => e.Id);
                entity.Property(e => e.OgrenciId).IsRequired();
                entity.Property(e => e.BaslangicTarihi).IsRequired();
                entity.Property(e => e.BitisTarihi).IsRequired();
                entity.Property(e => e.GunSayisi).IsRequired();
                entity.Property(e => e.Aciklama).HasMaxLength(500);
                entity.Property(e => e.RowVersion).IsConcurrencyToken();
                entity.HasOne(e => e.Ogrenci)
                    .WithMany(o => o.IzinGirisleri)
                    .HasForeignKey(e => e.OgrenciId)
                    .OnDelete(DeleteBehavior.Cascade);
                entity.HasOne(e => e.Onaylayan)
                    .WithMany()
                    .HasForeignKey(e => e.OnaylayanId)
                    .OnDelete(DeleteBehavior.Restrict);
            });
        }
    }
}
