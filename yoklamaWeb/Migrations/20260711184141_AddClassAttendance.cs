using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace yoklamaWeb.Migrations
{
    /// <inheritdoc />
    public partial class AddClassAttendance : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ClassAttendances",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    Name = table.Column<string>(type: "TEXT", nullable: false),
                    ValidFrom = table.Column<DateTime>(type: "TEXT", nullable: false),
                    ValidTo = table.Column<DateTime>(type: "TEXT", nullable: false),
                    BuildingNumber = table.Column<string>(type: "TEXT", nullable: false),
                    StartTime = table.Column<TimeSpan>(type: "TEXT", nullable: true),
                    EndTime = table.Column<TimeSpan>(type: "TEXT", nullable: true),
                    OnlyCurrentDayAttendance = table.Column<bool>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ClassAttendances", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "ClassAttendanceStudents",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    ClassAttendanceId = table.Column<int>(type: "INTEGER", nullable: false),
                    OgrenciNo = table.Column<string>(type: "TEXT", maxLength: 20, nullable: false),
                    SinifDuzeyi = table.Column<string>(type: "TEXT", maxLength: 20, nullable: false),
                    Sube = table.Column<string>(type: "TEXT", maxLength: 20, nullable: false),
                    AdSoyad = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ClassAttendanceStudents", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ClassAttendanceStudents_ClassAttendances_ClassAttendanceId",
                        column: x => x.ClassAttendanceId,
                        principalTable: "ClassAttendances",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ClassAttendanceStudents_ClassAttendanceId",
                table: "ClassAttendanceStudents",
                column: "ClassAttendanceId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ClassAttendanceStudents");

            migrationBuilder.DropTable(
                name: "ClassAttendances");
        }
    }
}
