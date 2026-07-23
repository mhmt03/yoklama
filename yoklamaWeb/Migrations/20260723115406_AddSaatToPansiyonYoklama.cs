using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace yoklamaWeb.Migrations
{
    /// <inheritdoc />
    public partial class AddSaatToPansiyonYoklama : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_IzinGirisleri_PansiyonGorevlileri_KaydedenId",
                table: "IzinGirisleri");

            migrationBuilder.DropForeignKey(
                name: "FK_IzinGirisleri_PansiyonOgrenciler_PansiyonOgrenciId",
                table: "IzinGirisleri");

            migrationBuilder.DropIndex(
                name: "IX_IzinGirisleri_PansiyonOgrenciId",
                table: "IzinGirisleri");

            migrationBuilder.DropColumn(
                name: "IzinTuru",
                table: "IzinGirisleri");

            migrationBuilder.RenameColumn(
                name: "PansiyonOgrenciId",
                table: "IzinGirisleri",
                newName: "Tur");

            migrationBuilder.RenameColumn(
                name: "KayitZamani",
                table: "IzinGirisleri",
                newName: "OlusturmaTarihi");

            migrationBuilder.RenameColumn(
                name: "KaydedenId",
                table: "IzinGirisleri",
                newName: "OgrenciId");

            migrationBuilder.RenameIndex(
                name: "IX_IzinGirisleri_KaydedenId",
                table: "IzinGirisleri",
                newName: "IX_IzinGirisleri_OgrenciId");

            migrationBuilder.AddColumn<TimeSpan>(
                name: "Saat",
                table: "PansiyonYoklamalar",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "Durum",
                table: "IzinGirisleri",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "GunSayisi",
                table: "IzinGirisleri",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<DateTime>(
                name: "OnayTarihi",
                table: "IzinGirisleri",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "OnaylayanId",
                table: "IzinGirisleri",
                type: "INTEGER",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "PansiyonGorevlisiId",
                table: "IzinGirisleri",
                type: "INTEGER",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_IzinGirisleri_OnaylayanId",
                table: "IzinGirisleri",
                column: "OnaylayanId");

            migrationBuilder.CreateIndex(
                name: "IX_IzinGirisleri_PansiyonGorevlisiId",
                table: "IzinGirisleri",
                column: "PansiyonGorevlisiId");

            migrationBuilder.AddForeignKey(
                name: "FK_IzinGirisleri_PansiyonGorevlileri_OnaylayanId",
                table: "IzinGirisleri",
                column: "OnaylayanId",
                principalTable: "PansiyonGorevlileri",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_IzinGirisleri_PansiyonGorevlileri_PansiyonGorevlisiId",
                table: "IzinGirisleri",
                column: "PansiyonGorevlisiId",
                principalTable: "PansiyonGorevlileri",
                principalColumn: "Id");

            migrationBuilder.AddForeignKey(
                name: "FK_IzinGirisleri_PansiyonOgrenciler_OgrenciId",
                table: "IzinGirisleri",
                column: "OgrenciId",
                principalTable: "PansiyonOgrenciler",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_IzinGirisleri_PansiyonGorevlileri_OnaylayanId",
                table: "IzinGirisleri");

            migrationBuilder.DropForeignKey(
                name: "FK_IzinGirisleri_PansiyonGorevlileri_PansiyonGorevlisiId",
                table: "IzinGirisleri");

            migrationBuilder.DropForeignKey(
                name: "FK_IzinGirisleri_PansiyonOgrenciler_OgrenciId",
                table: "IzinGirisleri");

            migrationBuilder.DropIndex(
                name: "IX_IzinGirisleri_OnaylayanId",
                table: "IzinGirisleri");

            migrationBuilder.DropIndex(
                name: "IX_IzinGirisleri_PansiyonGorevlisiId",
                table: "IzinGirisleri");

            migrationBuilder.DropColumn(
                name: "Saat",
                table: "PansiyonYoklamalar");

            migrationBuilder.DropColumn(
                name: "Durum",
                table: "IzinGirisleri");

            migrationBuilder.DropColumn(
                name: "GunSayisi",
                table: "IzinGirisleri");

            migrationBuilder.DropColumn(
                name: "OnayTarihi",
                table: "IzinGirisleri");

            migrationBuilder.DropColumn(
                name: "OnaylayanId",
                table: "IzinGirisleri");

            migrationBuilder.DropColumn(
                name: "PansiyonGorevlisiId",
                table: "IzinGirisleri");

            migrationBuilder.RenameColumn(
                name: "Tur",
                table: "IzinGirisleri",
                newName: "PansiyonOgrenciId");

            migrationBuilder.RenameColumn(
                name: "OlusturmaTarihi",
                table: "IzinGirisleri",
                newName: "KayitZamani");

            migrationBuilder.RenameColumn(
                name: "OgrenciId",
                table: "IzinGirisleri",
                newName: "KaydedenId");

            migrationBuilder.RenameIndex(
                name: "IX_IzinGirisleri_OgrenciId",
                table: "IzinGirisleri",
                newName: "IX_IzinGirisleri_KaydedenId");

            migrationBuilder.AddColumn<string>(
                name: "IzinTuru",
                table: "IzinGirisleri",
                type: "TEXT",
                maxLength: 20,
                nullable: false,
                defaultValue: "");

            migrationBuilder.CreateIndex(
                name: "IX_IzinGirisleri_PansiyonOgrenciId",
                table: "IzinGirisleri",
                column: "PansiyonOgrenciId");

            migrationBuilder.AddForeignKey(
                name: "FK_IzinGirisleri_PansiyonGorevlileri_KaydedenId",
                table: "IzinGirisleri",
                column: "KaydedenId",
                principalTable: "PansiyonGorevlileri",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_IzinGirisleri_PansiyonOgrenciler_PansiyonOgrenciId",
                table: "IzinGirisleri",
                column: "PansiyonOgrenciId",
                principalTable: "PansiyonOgrenciler",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }
    }
}
