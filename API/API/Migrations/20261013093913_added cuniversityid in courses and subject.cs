using System;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace API.Migrations
{
    /// <inheritdoc />
    public partial class addedcuniversityidincoursesandsubject : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "UniversityId",
                table: "Subjects",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AlterColumn<decimal>(
                name: "TotalMarks",
                table: "Sections",
                type: "decimal(65,30)",
                nullable: false,
                oldClrType: typeof(int),
                oldType: "int");

            migrationBuilder.AlterColumn<decimal>(
                name: "TotalMarks",
                table: "SectionMasters",
                type: "decimal(65,30)",
                nullable: false,
                oldClrType: typeof(int),
                oldType: "int");

            migrationBuilder.AddColumn<int>(
                name: "UniversityId",
                table: "Courses",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.CreateTable(
                name: "PaperSectionMasters",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("MySql:ValueGenerationStrategy", MySqlValueGenerationStrategy.IdentityColumn),
                    PaperId = table.Column<int>(type: "int", nullable: false),
                    SectionMasterId = table.Column<int>(type: "int", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PaperSectionMasters", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PaperSectionMasters_Papers_PaperId",
                        column: x => x.PaperId,
                        principalTable: "Papers",
                        principalColumn: "PaperId",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_PaperSectionMasters_SectionMasters_SectionMasterId",
                        column: x => x.SectionMasterId,
                        principalTable: "SectionMasters",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                })
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.CreateIndex(
                name: "IX_PaperSectionMasters_PaperId_SectionMasterId",
                table: "PaperSectionMasters",
                columns: new[] { "PaperId", "SectionMasterId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PaperSectionMasters_SectionMasterId",
                table: "PaperSectionMasters",
                column: "SectionMasterId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PaperSectionMasters");

            migrationBuilder.DropColumn(
                name: "UniversityId",
                table: "Subjects");

            migrationBuilder.DropColumn(
                name: "UniversityId",
                table: "Courses");

            migrationBuilder.AlterColumn<int>(
                name: "TotalMarks",
                table: "Sections",
                type: "int",
                nullable: false,
                oldClrType: typeof(decimal),
                oldType: "decimal(65,30)");

            migrationBuilder.AlterColumn<int>(
                name: "TotalMarks",
                table: "SectionMasters",
                type: "int",
                nullable: false,
                oldClrType: typeof(decimal),
                oldType: "decimal(65,30)");
        }
    }
}
