using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace yoklamaWeb.Migrations
{
    /// <inheritdoc />
    public partial class AddMissingExamSeatAndTemporaryProctorColumns : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            using var connection = new SqliteConnection("Data Source=yoklama.db");
            connection.Open();

            if (!TableHasColumn(connection, "TemporaryProctors", "ExamNote"))
            {
                migrationBuilder.AddColumn<string>(
                    name: "ExamNote",
                    table: "TemporaryProctors",
                    type: "TEXT",
                    maxLength: 500,
                    nullable: true);
            }

            if (!TableHasColumn(connection, "TemporaryProctors", "ProctorName"))
            {
                migrationBuilder.AddColumn<string>(
                    name: "ProctorName",
                    table: "TemporaryProctors",
                    type: "TEXT",
                    maxLength: 100,
                    nullable: true);
            }

            if (!TableHasColumn(connection, "TemporaryProctors", "RoomNote"))
            {
                migrationBuilder.AddColumn<string>(
                    name: "RoomNote",
                    table: "TemporaryProctors",
                    type: "TEXT",
                    maxLength: 500,
                    nullable: true);
            }

            if (!TableHasColumn(connection, "ExamSeats", "Note"))
            {
                migrationBuilder.AddColumn<string>(
                    name: "Note",
                    table: "ExamSeats",
                    type: "TEXT",
                    maxLength: 200,
                    nullable: true);
            }
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ExamNote",
                table: "TemporaryProctors");

            migrationBuilder.DropColumn(
                name: "ProctorName",
                table: "TemporaryProctors");

            migrationBuilder.DropColumn(
                name: "RoomNote",
                table: "TemporaryProctors");

            migrationBuilder.DropColumn(
                name: "Note",
                table: "ExamSeats");
        }

        private static bool TableHasColumn(SqliteConnection connection, string tableName, string columnName)
        {
            using var command = connection.CreateCommand();
            command.CommandText = $"PRAGMA table_info('{tableName}')";
            using var reader = command.ExecuteReader();
            while (reader.Read())
            {
                if (reader.GetString(reader.GetOrdinal("name")).Equals(columnName, StringComparison.OrdinalIgnoreCase))
                {
                    return true;
                }
            }
            return false;
        }
    }
}
