using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace yoklamaWeb.Migrations
{
    public partial class AddOptikModul : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "OptikFormlar",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    FormAdi = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    AdSoyadBaslangic = table.Column<int>(type: "INTEGER", nullable: false),
                    AdSoyadUzunluk = table.Column<int>(type: "INTEGER", nullable: false),
                    NumaraBaslangic = table.Column<int>(type: "INTEGER", nullable: false),
                    NumaraUzunluk = table.Column<int>(type: "INTEGER", nullable: false),
                    SinifBaslangic = table.Column<int>(type: "INTEGER", nullable: false),
                    SinifUzunluk = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OptikFormlar", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "OptikFormDersleri",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    OptikFormId = table.Column<int>(type: "INTEGER", nullable: false),
                    DersAdi = table.Column<string>(type: "TEXT", maxLength: 50, nullable: false),
                    BaslangicSutun = table.Column<int>(type: "INTEGER", nullable: false),
                    KarakterSayisi = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OptikFormDersleri", x => x.Id);
                    table.ForeignKey(
                        name: "FK_OptikFormDersleri_OptikFormlar_OptikFormId",
                        column: x => x.OptikFormId,
                        principalTable: "OptikFormlar",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "OptikSinavlar",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    SinavAdi = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    UygulamaTarihi = table.Column<DateTime>(type: "TEXT", nullable: false),
                    HedefSiniflar = table.Column<string>(type: "TEXT", maxLength: 500, nullable: true),
                    YanlisDogruyuGotururSayisi = table.Column<double>(type: "REAL", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OptikSinavlar", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "OptikSinavDersleri",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    OptikSinavId = table.Column<int>(type: "INTEGER", nullable: false),
                    DersAdi = table.Column<string>(type: "TEXT", maxLength: 50, nullable: false),
                    SoruSayisi = table.Column<int>(type: "INTEGER", nullable: false),
                    CevapAnahtari = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OptikSinavDersleri", x => x.Id);
                    table.ForeignKey(
                        name: "FK_OptikSinavDersleri_OptikSinavlar_OptikSinavId",
                        column: x => x.OptikSinavId,
                        principalTable: "OptikSinavlar",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "OptikSinavSonuclari",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    OptikSinavId = table.Column<int>(type: "INTEGER", nullable: false),
                    OgrenciNo = table.Column<string>(type: "TEXT", maxLength: 20, nullable: false),
                    ToplamDogru = table.Column<int>(type: "INTEGER", nullable: false),
                    ToplamYanlis = table.Column<int>(type: "INTEGER", nullable: false),
                    ToplamBos = table.Column<int>(type: "INTEGER", nullable: false),
                    ToplamNet = table.Column<double>(type: "REAL", nullable: false),
                    OrijinalSatir = table.Column<string>(type: "TEXT", maxLength: 200, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OptikSinavSonuclari", x => x.Id);
                    table.ForeignKey(
                        name: "FK_OptikSinavSonuclari_Ogrenciler_OgrenciNo",
                        column: x => x.OgrenciNo,
                        principalTable: "Ogrenciler",
                        principalColumn: "OgrenciNo",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_OptikSinavSonuclari_OptikSinavlar_OptikSinavId",
                        column: x => x.OptikSinavId,
                        principalTable: "OptikSinavlar",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "OptikSinavSonucDersleri",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    OptikSinavSonucId = table.Column<int>(type: "INTEGER", nullable: false),
                    DersAdi = table.Column<string>(type: "TEXT", maxLength: 50, nullable: false),
                    Dogru = table.Column<int>(type: "INTEGER", nullable: false),
                    Yanlis = table.Column<int>(type: "INTEGER", nullable: false),
                    Bos = table.Column<int>(type: "INTEGER", nullable: false),
                    Net = table.Column<double>(type: "REAL", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OptikSinavSonucDersleri", x => x.Id);
                    table.ForeignKey(
                        name: "FK_OptikSinavSonucDersleri_OptikSinavSonuclari_OptikSinavSonucId",
                        column: x => x.OptikSinavSonucId,
                        principalTable: "OptikSinavSonuclari",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_OptikFormDersleri_OptikFormId",
                table: "OptikFormDersleri",
                column: "OptikFormId");

            migrationBuilder.CreateIndex(
                name: "IX_OptikSinavDersleri_OptikSinavId",
                table: "OptikSinavDersleri",
                column: "OptikSinavId");

            migrationBuilder.CreateIndex(
                name: "IX_OptikSinavSonucDersleri_OptikSinavSonucId",
                table: "OptikSinavSonucDersleri",
                column: "OptikSinavSonucId");

            migrationBuilder.CreateIndex(
                name: "IX_OptikSinavSonuclari_OgrenciNo",
                table: "OptikSinavSonuclari",
                column: "OgrenciNo");

            migrationBuilder.CreateIndex(
                name: "IX_OptikSinavSonuclari_OptikSinavId",
                table: "OptikSinavSonuclari",
                column: "OptikSinavId");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "OptikFormDersleri");
            migrationBuilder.DropTable(name: "OptikSinavSonucDersleri");
            migrationBuilder.DropTable(name: "OptikFormlar");
            migrationBuilder.DropTable(name: "OptikSinavSonuclari");
            migrationBuilder.DropTable(name: "OptikSinavDersleri");
            migrationBuilder.DropTable(name: "OptikSinavlar");
        }
    }
}
