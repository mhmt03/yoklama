using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace yoklamaWeb.Migrations
{
    /// <inheritdoc />
    public partial class AddTemporaryProctors : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "TemporaryProctors",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    ExamId = table.Column<int>(type: "INTEGER", nullable: false),
                    Room = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    UserId = table.Column<string>(type: "TEXT", nullable: false),
                    Password = table.Column<string>(type: "TEXT", maxLength: 10, nullable: false),
                    ValidFrom = table.Column<DateTime>(type: "TEXT", nullable: false),
                    ValidTo = table.Column<DateTime>(type: "TEXT", nullable: false),
                    StartTime = table.Column<TimeSpan>(type: "TEXT", nullable: true),
                    EndTime = table.Column<TimeSpan>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TemporaryProctors", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TemporaryProctors_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_TemporaryProctors_Exams_ExamId",
                        column: x => x.ExamId,
                        principalTable: "Exams",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ExamSeats_OgrenciNo",
                table: "ExamSeats",
                column: "OgrenciNo");

            migrationBuilder.CreateIndex(
                name: "IX_TemporaryProctors_ExamId",
                table: "TemporaryProctors",
                column: "ExamId");

            migrationBuilder.CreateIndex(
                name: "IX_TemporaryProctors_UserId",
                table: "TemporaryProctors",
                column: "UserId");

            migrationBuilder.AddForeignKey(
                name: "FK_ExamSeats_Ogrenciler_OgrenciNo",
                table: "ExamSeats",
                column: "OgrenciNo",
                principalTable: "Ogrenciler",
                principalColumn: "OgrenciNo",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_ExamSeats_Ogrenciler_OgrenciNo",
                table: "ExamSeats");

            migrationBuilder.DropTable(
                name: "TemporaryProctors");

            migrationBuilder.DropIndex(
                name: "IX_ExamSeats_OgrenciNo",
                table: "ExamSeats");
        }
    }
}
