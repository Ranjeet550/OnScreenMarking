using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace API.Models
{
    public class Subject
    {
        [Key]
        [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        public int SubjectId { get; set; }
        public string SubName { get; set; }
        public string SubCode { get; set; }
        public int UniversityId { get; set; }
        public bool Status { get; set; } = true;
        public DateTime created_at { get; set; } = DateTime.UtcNow;
        public DateTime updated_at { get; set; } = DateTime.UtcNow;
        public ICollection<DepartmentSubject> DepartmentSubjects { get; set; }
       = new List<DepartmentSubject>();

        public ICollection<SubjectPaper> SubjectPapers { get; set; }
            = new List<SubjectPaper>();
        // Navigation properties
        public ICollection<ExaminerExpertise> ExaminerExpertises { get; set; } = new List<ExaminerExpertise>();
        public ICollection<CourseSubject> CourseSubjects { get; set; } = new List<CourseSubject>();
    }
}