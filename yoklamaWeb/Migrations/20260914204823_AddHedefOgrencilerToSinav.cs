using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace yoklamaWeb.Migrations
{
    /// <inheritdoc />
    public partial class AddHedefOgrencilerToSinav : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "HedefOgrenciler",
                table: "OptikSinavlar",
                type: "TEXT",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "HedefOgrenciler",
                table: "OptikSinavlar");
        }
    }
}
