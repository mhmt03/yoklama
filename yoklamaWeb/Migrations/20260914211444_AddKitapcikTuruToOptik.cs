using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace yoklamaWeb.Migrations
{
    /// <inheritdoc />
    public partial class AddKitapcikTuruToOptik : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "KitapcikTuru",
                table: "OptikSinavSonuclari",
                type: "TEXT",
                maxLength: 5,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "KitapcikTurleri",
                table: "OptikSinavlar",
                type: "TEXT",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CevapAnahtariB",
                table: "OptikSinavDersleri",
                type: "TEXT",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CevapAnahtariC",
                table: "OptikSinavDersleri",
                type: "TEXT",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CevapAnahtariD",
                table: "OptikSinavDersleri",
                type: "TEXT",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "KitapcikTuruBaslangic",
                table: "OptikFormlar",
                type: "INTEGER",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "KitapcikTuruUzunluk",
                table: "OptikFormlar",
                type: "INTEGER",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "KitapcikTuru",
                table: "OptikSinavSonuclari");

            migrationBuilder.DropColumn(
                name: "KitapcikTurleri",
                table: "OptikSinavlar");

            migrationBuilder.DropColumn(
                name: "CevapAnahtariB",
                table: "OptikSinavDersleri");

            migrationBuilder.DropColumn(
                name: "CevapAnahtariC",
                table: "OptikSinavDersleri");

            migrationBuilder.DropColumn(
                name: "CevapAnahtariD",
                table: "OptikSinavDersleri");

            migrationBuilder.DropColumn(
                name: "KitapcikTuruBaslangic",
                table: "OptikFormlar");

            migrationBuilder.DropColumn(
                name: "KitapcikTuruUzunluk",
                table: "OptikFormlar");
        }
    }
}
