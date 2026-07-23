using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace yoklamaWeb.Migrations
{
    /// <inheritdoc />
    public partial class AddPansiyonModule : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Odalar",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    OdaNo = table.Column<string>(type: "TEXT", maxLength: 20, nullable: false),
                    Kapasite = table.Column<int>(type: "INTEGER", nullable: false),
                    Kat = table.Column<int>(type: "INTEGER", nullable: false),
                    Cinsiyet = table.Column<string>(type: "TEXT", maxLength: 10, nullable: false),
                    Aciklama = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    Aktif = table.Column<bool>(type: "INTEGER", nullable: false),
                    OlusturmaTarihi = table.Column<DateTime>(type: "TEXT", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "BLOB", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Odalar", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "PansiyonGorevlileri",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    KullaniciAdi = table.Column<string>(type: "TEXT", maxLength: 50, nullable: false),
                    AdSoyad = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    Rol = table.Column<string>(type: "TEXT", maxLength: 20, nullable: false),
                    Telefon = table.Column<string>(type: "TEXT", maxLength: 11, nullable: false),
                    Email = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    Aktif = table.Column<bool>(type: "INTEGER", nullable: false),
                    KayitTarihi = table.Column<DateTime>(type: "TEXT", nullable: false),
                    SonGirisTarihi = table.Column<DateTime>(type: "TEXT", nullable: true),
                    RowVersion = table.Column<byte[]>(type: "BLOB", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PansiyonGorevlileri", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "PansiyonOgrenciler",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    OgrenciNo = table.Column<string>(type: "TEXT", maxLength: 20, nullable: false),
                    AdSoyad = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    SinifDuzeyi = table.Column<string>(type: "TEXT", maxLength: 20, nullable: false),
                    Sube = table.Column<string>(type: "TEXT", maxLength: 10, nullable: false),
                    Telefon = table.Column<string>(type: "TEXT", maxLength: 11, nullable: false),
                    VeliTelefon = table.Column<string>(type: "TEXT", maxLength: 11, nullable: false),
                    Adres = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    KayitTarihi = table.Column<DateTime>(type: "TEXT", nullable: false),
                    Aktif = table.Column<bool>(type: "INTEGER", nullable: false),
                    OdaId = table.Column<int>(type: "INTEGER", nullable: true),
                    RowVersion = table.Column<byte[]>(type: "BLOB", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PansiyonOgrenciler", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PansiyonOgrenciler_Odalar_OdaId",
                        column: x => x.OdaId,
                        principalTable: "Odalar",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "NobetciPlanlar",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    PansiyonGorevlisiId = table.Column<int>(type: "INTEGER", nullable: false),
                    BaslangicTarihi = table.Column<DateTime>(type: "TEXT", nullable: false),
                    BitisTarihi = table.Column<DateTime>(type: "TEXT", nullable: false),
                    Gun = table.Column<string>(type: "TEXT", maxLength: 20, nullable: false),
                    Aciklama = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    OlusturmaTarihi = table.Column<DateTime>(type: "TEXT", nullable: false),
                    OlusturanId = table.Column<int>(type: "INTEGER", nullable: true),
                    RowVersion = table.Column<byte[]>(type: "BLOB", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_NobetciPlanlar", x => x.Id);
                    table.ForeignKey(
                        name: "FK_NobetciPlanlar_PansiyonGorevlileri_OlusturanId",
                        column: x => x.OlusturanId,
                        principalTable: "PansiyonGorevlileri",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_NobetciPlanlar_PansiyonGorevlileri_PansiyonGorevlisiId",
                        column: x => x.PansiyonGorevlisiId,
                        principalTable: "PansiyonGorevlileri",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "IzinGirisleri",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    PansiyonOgrenciId = table.Column<int>(type: "INTEGER", nullable: false),
                    BaslangicTarihi = table.Column<DateTime>(type: "TEXT", nullable: false),
                    BitisTarihi = table.Column<DateTime>(type: "TEXT", nullable: false),
                    IzinTuru = table.Column<string>(type: "TEXT", maxLength: 20, nullable: false),
                    Aciklama = table.Column<string>(type: "TEXT", maxLength: 500, nullable: false),
                    KaydedenId = table.Column<int>(type: "INTEGER", nullable: false),
                    KayitZamani = table.Column<DateTime>(type: "TEXT", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "BLOB", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_IzinGirisleri", x => x.Id);
                    table.ForeignKey(
                        name: "FK_IzinGirisleri_PansiyonGorevlileri_KaydedenId",
                        column: x => x.KaydedenId,
                        principalTable: "PansiyonGorevlileri",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_IzinGirisleri_PansiyonOgrenciler_PansiyonOgrenciId",
                        column: x => x.PansiyonOgrenciId,
                        principalTable: "PansiyonOgrenciler",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "PansiyonYoklamalar",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    PansiyonOgrenciId = table.Column<int>(type: "INTEGER", nullable: false),
                    Tarih = table.Column<DateTime>(type: "TEXT", nullable: false),
                    Durum = table.Column<string>(type: "TEXT", maxLength: 20, nullable: false),
                    Aciklama = table.Column<string>(type: "TEXT", maxLength: 500, nullable: false),
                    YoklamaYapanId = table.Column<int>(type: "INTEGER", nullable: false),
                    KayitZamani = table.Column<DateTime>(type: "TEXT", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "BLOB", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PansiyonYoklamalar", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PansiyonYoklamalar_PansiyonGorevlileri_YoklamaYapanId",
                        column: x => x.YoklamaYapanId,
                        principalTable: "PansiyonGorevlileri",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PansiyonYoklamalar_PansiyonOgrenciler_PansiyonOgrenciId",
                        column: x => x.PansiyonOgrenciId,
                        principalTable: "PansiyonOgrenciler",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_IzinGirisleri_KaydedenId",
                table: "IzinGirisleri",
                column: "KaydedenId");

            migrationBuilder.CreateIndex(
                name: "IX_IzinGirisleri_PansiyonOgrenciId",
                table: "IzinGirisleri",
                column: "PansiyonOgrenciId");

            migrationBuilder.CreateIndex(
                name: "IX_NobetciPlanlar_OlusturanId",
                table: "NobetciPlanlar",
                column: "OlusturanId");

            migrationBuilder.CreateIndex(
                name: "IX_NobetciPlanlar_PansiyonGorevlisiId",
                table: "NobetciPlanlar",
                column: "PansiyonGorevlisiId");

            migrationBuilder.CreateIndex(
                name: "IX_Odalar_OdaNo",
                table: "Odalar",
                column: "OdaNo",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PansiyonGorevlileri_KullaniciAdi",
                table: "PansiyonGorevlileri",
                column: "KullaniciAdi",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PansiyonOgrenciler_OdaId",
                table: "PansiyonOgrenciler",
                column: "OdaId");

            migrationBuilder.CreateIndex(
                name: "IX_PansiyonOgrenciler_OgrenciNo",
                table: "PansiyonOgrenciler",
                column: "OgrenciNo",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PansiyonYoklamalar_PansiyonOgrenciId",
                table: "PansiyonYoklamalar",
                column: "PansiyonOgrenciId");

            migrationBuilder.CreateIndex(
                name: "IX_PansiyonYoklamalar_YoklamaYapanId",
                table: "PansiyonYoklamalar",
                column: "YoklamaYapanId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "IzinGirisleri");

            migrationBuilder.DropTable(
                name: "NobetciPlanlar");

            migrationBuilder.DropTable(
                name: "PansiyonYoklamalar");

            migrationBuilder.DropTable(
                name: "PansiyonGorevlileri");

            migrationBuilder.DropTable(
                name: "PansiyonOgrenciler");

            migrationBuilder.DropTable(
                name: "Odalar");
        }
    }
}
