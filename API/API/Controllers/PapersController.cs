using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Hosting;
using System.IO;
using API.Data;
using API.Models;
using API.Models.DTOs;

namespace API.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class PapersController : ControllerBase
    {
        private readonly ApplicationDbContext _context;
        private readonly IWebHostEnvironment _environment;
        private readonly Microsoft.Extensions.Configuration.IConfiguration _configuration;

        public PapersController(ApplicationDbContext context, IWebHostEnvironment environment, Microsoft.Extensions.Configuration.IConfiguration configuration)
        {
            _context = context;
            _environment = environment;
            _configuration = configuration;
        }

        [HttpGet("dashboard-stats")]
        public async Task<IActionResult> GetProjectDashboardPapers(
            [FromQuery] int projectId,
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 10,
            [FromQuery] string search = "",
            [FromQuery] bool? isActive = null,
            [FromQuery] string sortField = "",
            [FromQuery] string sortOrder = "",
            [FromQuery] string statusFilter = "",
            [FromQuery] int? subjectId = null)
        {
            try
            {
                // Ensure pageSize is within reasonable bounds
                if (pageSize <= 0) pageSize = 10;
                if (pageSize > 100) pageSize = 100;
                if (page <= 0) page = 1;
                var query = _context.Papers
                    .Where(p => p.ProjectPapers.Any(pp => pp.ProjectId == projectId))
                    .AsQueryable();

                if (subjectId.HasValue)
                {
                    query = query.Where(p => p.SubjectPapers.Any(sp => sp.SubjectId == subjectId.Value));
                }

                if (isActive.HasValue)
                {
                    query = query.Where(p => p.IsActive == isActive.Value);
                }

                if (!string.IsNullOrWhiteSpace(search))
                {
                    query = query.Where(p => p.PaperName.Contains(search) || p.PaperCode.Contains(search) || p.ProjectPapers.Select(pp => pp.CatchNo).FirstOrDefault().Contains(search));
                }

                // Filter by card status
                if (!string.IsNullOrWhiteSpace(statusFilter))
                {
                    switch (statusFilter.ToLower())
                    {
                        case "pending":
                            query = query.Where(p => _context.Scripts.Count(s => s.ProjectPaper.PaperId == p.PaperId && (s.Status == "pending" || (s.Status != "completed" && !s.Allocations.Any()))) > 0);
                            break;
                        case "marking":
                            query = query.Where(p => _context.Scripts.Count(s => s.ProjectPaper.PaperId == p.PaperId && (s.Status == "allocated" || s.Status == "marking")) > 0);
                            break;
                        case "completed":
                            query = query.Where(p => _context.Scripts.Count(s => s.ProjectPaper.PaperId == p.PaperId && s.Status == "completed") > 0);
                            break;
                        case "unconfigured":
                            query = query.Where(p => !_context.Sections.Any(s => s.PaperId == p.PaperId));
                            break;
                        case "sections_missing":
                            query = query.Where(p => !_context.Sections.Any(s => s.PaperId == p.PaperId) || _context.Sections.Where(s => s.PaperId == p.PaperId).Sum(s => (int?)s.TotalMarks) != p.MaxMarks);
                            break;
                        case "pdf_missing":
                            query = query.Where(p => !p.ProjectPapers.Any(pp => pp.ProjectId == projectId && !string.IsNullOrEmpty(pp.QuestionPaperPdfUrl)));
                            break;
                        case "not_assigned":
                            query = query.Where(p => !_context.PaperExaminers.Any(pe => pe.PaperId == p.PaperId));
                            break;
                        case "ready_for_allocation":
                            query = query.Where(p => 
                                _context.Sections.Any(s => s.PaperId == p.PaperId) && 
                                _context.Sections.Where(s => s.PaperId == p.PaperId).Sum(s => (int?)s.TotalMarks) == p.MaxMarks &&
                                p.ProjectPapers.Any(pp => pp.ProjectId == projectId && !string.IsNullOrEmpty(pp.QuestionPaperPdfUrl)) &&
                                _context.PaperExaminers.Any(pe => pe.PaperId == p.PaperId) &&
                                _context.Scripts.Any(s => s.ProjectPaper.PaperId == p.PaperId && s.ProjectPaper.ProjectId == projectId && s.Status != "completed")
                            );
                            break;
                    }
                }

                // Sorting
                if (!string.IsNullOrWhiteSpace(sortField))
                {
                    bool isDesc = sortOrder?.ToLower() == "desc";
                    switch (sortField.ToLower())
                    {
                        case "papercode":
                            query = isDesc ? query.OrderByDescending(p => p.PaperCode) : query.OrderBy(p => p.PaperCode);
                            break;
                        case "papername":
                            query = isDesc ? query.OrderByDescending(p => p.PaperName) : query.OrderBy(p => p.PaperName);
                            break;
                        case "catchno":
                            query = isDesc ? query.OrderByDescending(p => p.ProjectPapers.Select(pp => pp.CatchNo).FirstOrDefault()) : query.OrderBy(p => p.ProjectPapers.Select(pp => pp.CatchNo).FirstOrDefault());
                            break;
                        case "subjectname":
                            query = isDesc 
                                ? query.OrderByDescending(p => p.SubjectPapers.Select(sp => sp.Subject.SubName).FirstOrDefault()) 
                                : query.OrderBy(p => p.SubjectPapers.Select(sp => sp.Subject.SubName).FirstOrDefault());
                            break;
                        case "totalscripts":
                            query = isDesc 
                                ? query.OrderByDescending(p => _context.Scripts.Count(s => s.ProjectPaper.PaperId == p.PaperId)) 
                                : query.OrderBy(p => _context.Scripts.Count(s => s.ProjectPaper.PaperId == p.PaperId));
                            break;
                        case "pendingscripts":
                            query = isDesc 
                                ? query.OrderByDescending(p => _context.Scripts.Count(s => s.ProjectPaper.PaperId == p.PaperId && (s.Status == "pending" || (s.Status != "completed" && !s.Allocations.Any())))) 
                                : query.OrderBy(p => _context.Scripts.Count(s => s.ProjectPaper.PaperId == p.PaperId && (s.Status == "pending" || (s.Status != "completed" && !s.Allocations.Any()))));
                            break;
                        case "allocatedscripts":
                            query = isDesc 
                                ? query.OrderByDescending(p => _context.Scripts.Count(s => s.ProjectPaper.PaperId == p.PaperId && (s.Status == "allocated" || s.Status == "marking"))) 
                                : query.OrderBy(p => _context.Scripts.Count(s => s.ProjectPaper.PaperId == p.PaperId && (s.Status == "allocated" || s.Status == "marking")));
                            break;
                        case "completedscripts":
                            query = isDesc 
                                ? query.OrderByDescending(p => _context.Scripts.Count(s => s.ProjectPaper.PaperId == p.PaperId && s.Status == "completed")) 
                                : query.OrderBy(p => _context.Scripts.Count(s => s.ProjectPaper.PaperId == p.PaperId && s.Status == "completed"));
                            break;
                        default:
                            query = isDesc ? query.OrderByDescending(p => p.PaperNumber) : query.OrderBy(p => p.PaperNumber);
                            break;
                    }
                }
                else
                {
                    query = query.OrderBy(p => p.PaperNumber);
                }

                var totalCount = await query.CountAsync();

                var items = await query
                    .Skip((page - 1) * pageSize)
                    .Take(pageSize)
                    .Select(p => new
                    {
                        paperId = p.PaperId,
                        paperCode = p.PaperCode,
                        paperName = p.PaperName,
                        catchNo = p.ProjectPapers.Where(pp => pp.ProjectId == projectId).Select(pp => pp.CatchNo).FirstOrDefault() ?? "",
                        questionPaperPdfUrl = p.ProjectPapers.Where(pp => pp.ProjectId == projectId).Select(pp => pp.QuestionPaperPdfUrl).FirstOrDefault() ?? "",
                        projectId = projectId,
                        maxMarks = p.MaxMarks,
                        totalQuestions = p.TotalQuestions,
                        isActive = p.IsActive,
                        subjectName = p.SubjectPapers.Select(sp => sp.Subject.SubName).FirstOrDefault() ?? "N/A",
                        subjectId = p.SubjectPapers.Select(sp => sp.SubjectId).FirstOrDefault(),
                        totalScripts = _context.Scripts.Count(s => s.ProjectPaper.PaperId == p.PaperId && s.ProjectPaper.ProjectId == projectId),
                        completedScripts = _context.Scripts.Count(s => s.ProjectPaper.PaperId == p.PaperId && s.ProjectPaper.ProjectId == projectId && s.Status == "completed"),
                        allocatedScripts = _context.Scripts.Count(s => s.ProjectPaper.PaperId == p.PaperId && s.ProjectPaper.ProjectId == projectId && (s.Status == "allocated" || s.Status == "marking")),
                        pendingScripts = _context.Scripts.Count(s => s.ProjectPaper.PaperId == p.PaperId && s.ProjectPaper.ProjectId == projectId && (s.Status == "pending" || (s.Status != "completed" && !s.Allocations.Any()))),
                        isSectionsConfigured = _context.Sections.Any(s => s.PaperId == p.PaperId),
                        sectionsCount = _context.Sections.Count(s => s.PaperId == p.PaperId),
                        configuredMarks = _context.Sections.Where(s => s.PaperId == p.PaperId).Sum(s => (int?)s.TotalMarks) ?? 0,
                        expertsCount = _context.PaperExaminers.Count(pe => pe.PaperId == p.PaperId)
                    })
                    .ToListAsync();

                var totalPages = (int)Math.Ceiling((double)totalCount / pageSize);

                return Ok(new
                {
                    items = items,
                    totalCount = totalCount,
                    page = page,
                    pageSize = pageSize,
                    totalPages = totalPages
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpGet("options")]
        public async Task<IActionResult> GetPaperOptions([FromQuery] int projectId)
        {
            try
            {
                if (projectId <= 0) return BadRequest(new { success = false, message = "Valid Project ID is required" });

                var options = await _context.ProjectPapers
                    .Where(pp => pp.ProjectId == projectId)
                    .Select(pp => new
                    {
                        paperId = pp.Paper.PaperId,
                        paperCode = pp.Paper.PaperCode,
                        paperName = pp.Paper.PaperName
                    })
                    .OrderBy(p => p.paperCode)
                    .ToListAsync();

                return Ok(options);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpGet]
        public async Task<ActionResult> GetPapers(
            [FromQuery] int? subjectId = null, 
            [FromQuery] int? projectId = null, 
            [FromQuery] int? universityId = null,
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 10,
            [FromQuery] string sortField = "",
            [FromQuery] string sortOrder = "asc",
            [FromQuery] bool isMaster = false,
            [FromQuery] string search = "")
        {
            try
            {
                // Validate pagination parameters
                if (pageSize <= 0) pageSize = 10;
                if (pageSize > 100) pageSize = 100;
                if (page <= 0) page = 1;

                var query = _context.Papers
                    .Include(p => p.SubjectPapers)
                        .ThenInclude(sp => sp.Subject)
                    .Include(p => p.ProjectPapers)
                        .ThenInclude(pp => pp.Project)
                    .Include(p => p.PaperSectionMasters)
                        .ThenInclude(psm => psm.SectionMaster)
                    .AsQueryable();

                if (subjectId.HasValue)
                {
                    query = query.Where(p =>
                        p.SubjectPapers.Any(sp => sp.SubjectId == subjectId.Value));
                }
                
                if (projectId.HasValue)
                    query = query.Where(p => p.ProjectPapers.Any(pp => pp.ProjectId == projectId.Value));

                // Filter by isMaster status vs university/project papers
                if (isMaster)
                {
                    // Master papers belong directly to a university
                    if (universityId.HasValue)
                    {
                        query = query.Where(p => p.UniversityId == universityId.Value);
                    }
                    else
                    {
                        query = query.Where(p => p.UniversityId.HasValue);
                    }
                }
                else if (universityId.HasValue && !projectId.HasValue)
                {
                    // Papers associated with this university or its projects
                    query = query.Where(p => p.UniversityId == universityId.Value || p.ProjectPapers.Any(pp => pp.Project.UniversityId == universityId.Value));
                }

                // Search filter
                if (!string.IsNullOrWhiteSpace(search))
                {
                    query = query.Where(p => p.PaperName.Contains(search) || p.PaperCode.Contains(search));
                }

                // Apply sorting
                if (!string.IsNullOrWhiteSpace(sortField))
                {
                    bool isDesc = sortOrder?.ToLower() == "desc";
                    switch (sortField.ToLower())
                    {
                        case "papercode":
                            query = isDesc ? query.OrderByDescending(p => p.PaperCode) : query.OrderBy(p => p.PaperCode);
                            break;
                        case "papername":
                            query = isDesc ? query.OrderByDescending(p => p.PaperName) : query.OrderBy(p => p.PaperName);
                            break;
                        default:
                            query = isDesc ? query.OrderByDescending(p => p.PaperNumber) : query.OrderBy(p => p.PaperNumber);
                            break;
                    }
                }
                else
                {
                    query = query.OrderBy(p => p.PaperNumber);
                }

                // Get total count before pagination
                var totalCount = await query.CountAsync();

                // Apply pagination
                var paginatedPapers = await query
                    .Skip((page - 1) * pageSize)
                    .Take(pageSize)
                    .ToListAsync();

                // Map to DTOs
                var paperDtos = paginatedPapers.Select(p => new PaperDto
                {
                    PaperId = p.PaperId,
                    PaperCode = p.PaperCode,
                    PaperName = p.PaperName,
                    PaperNumber = p.PaperNumber,
                    MaxMarks = p.MaxMarks,
                    TotalQuestions = p.TotalQuestions,
                    Description = p.Description,
                    IsActive = p.IsActive,
                    UniversityId = p.UniversityId,
                    ProjectId = projectId ?? p.ProjectPapers.Select(pp => (int?)pp.ProjectId).FirstOrDefault(),
                    CatchNo = projectId.HasValue ? p.ProjectPapers.Where(pp => pp.ProjectId == projectId.Value).Select(pp => pp.CatchNo).FirstOrDefault() ?? "" : p.ProjectPapers.Select(pp => pp.CatchNo).FirstOrDefault() ?? "",
                    QuestionPaperPdfUrl = projectId.HasValue ? p.ProjectPapers.Where(pp => pp.ProjectId == projectId.Value).Select(pp => pp.QuestionPaperPdfUrl).FirstOrDefault() ?? "" : p.ProjectPapers.Select(pp => pp.QuestionPaperPdfUrl).FirstOrDefault() ?? "",
                    SubjectIds = p.SubjectPapers
                        .Select(sp => sp.SubjectId)
                        .ToList(),
                    SubjectNames = p.SubjectPapers
                        .Select(sp => sp.Subject.SubName)
                        .ToList(),
                    MasterSectionIds = p.PaperSectionMasters
                        .Select(psm => psm.SectionMasterId)
                        .ToList(),
                    MasterSectionNames = p.PaperSectionMasters
                        .Where(psm => psm.SectionMaster != null)
                        .Select(psm => psm.SectionMaster.Name)
                        .ToList()
                }).ToList();

                var totalPages = (int)Math.Ceiling((double)totalCount / pageSize);

                return Ok(new
                {
                    items = paperDtos,
                    totalCount = totalCount,
                    page = page,
                    pageSize = pageSize,
                    totalPages = totalPages
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpGet("{id}")]
        public async Task<ActionResult<PaperDto>> GetPaper(int id)
        {
            try
            {
                var paper = await _context.Papers
                    .Include(p => p.Sections)
                    .Include(p => p.SubjectPapers)
                        .ThenInclude(sp => sp.Subject)
                    .Include(p => p.ProjectPapers)
                    .FirstOrDefaultAsync(p => p.PaperId == id);

                if (paper == null)
                    return NotFound(new { success = false, message = "Paper not found" });

                var firstProjectPaper = paper.ProjectPapers.FirstOrDefault();

                var paperDto = new PaperDto
                {
                    PaperId = paper.PaperId,
                    PaperCode = paper.PaperCode,
                    PaperName = paper.PaperName,
                    PaperNumber = paper.PaperNumber,
                    MaxMarks = paper.MaxMarks,
                    TotalQuestions = paper.TotalQuestions,
                    Description = paper.Description,
                    CatchNo = firstProjectPaper?.CatchNo ?? "",
                    QuestionPaperPdfUrl = firstProjectPaper?.QuestionPaperPdfUrl ?? "",
                    IsActive = paper.IsActive,
                    UniversityId = paper.UniversityId,
                    ProjectId = firstProjectPaper?.ProjectId,
                    SubjectIds = paper.SubjectPapers
                        .Select(sp => sp.SubjectId)
                        .ToList(),

                    SubjectNames = paper.SubjectPapers
                        .Select(sp => sp.Subject.SubName)
                        .ToList()
                };

                return Ok(paperDto);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpPost]
        [Authorize(Roles = "admin,coordinator")]
        public async Task<ActionResult<PaperDto>> CreatePaper(
            [FromBody] PaperDto paperDto)
        {
            try
            {
                Project? project = null;
                int? resolvedUniversityId = paperDto.UniversityId;

                // If ProjectId is provided, validate project exists and determine university
                if (paperDto.ProjectId.HasValue && paperDto.ProjectId.Value > 0)
                {
                    project = await _context.Projects.FindAsync(paperDto.ProjectId.Value);

                    if (project == null)
                    {
                        return BadRequest(new
                        {
                            success = false,
                            message = "Project not found"
                        });
                    }

                    if (!resolvedUniversityId.HasValue || resolvedUniversityId.Value <= 0)
                    {
                        resolvedUniversityId = project.UniversityId;
                    }
                }
                else
                {
                    // Academic / Master paper without a project requires UniversityId
                    if (!resolvedUniversityId.HasValue || resolvedUniversityId.Value <= 0)
                    {
                        return BadRequest(new
                        {
                            success = false,
                            message = "University ID is required for master paper"
                        });
                    }

                    var uniExists = await _context.Universities.AnyAsync(u => u.UniversityId == resolvedUniversityId.Value);
                    if (!uniExists)
                    {
                        return BadRequest(new
                        {
                            success = false,
                            message = "University not found"
                        });
                    }
                }

                // Validate subjects exist
                if (paperDto.SubjectIds == null || !paperDto.SubjectIds.Any())
                {
                    return BadRequest(new
                    {
                        success = false,
                        message = "At least one subject is required"
                    });
                }

                var subjects = await _context.Subjects
                    .Where(s => paperDto.SubjectIds.Contains(s.SubjectId))
                    .ToListAsync();

                if (subjects.Count != paperDto.SubjectIds.Count)
                {
                    return BadRequest(new
                    {
                        success = false,
                        message = "One or more subjects not found"
                    });
                }

                // Check duplicate paper code
                if (await _context.Papers
                    .AnyAsync(p => p.PaperCode == paperDto.PaperCode))
                {
                    return BadRequest(new
                    {
                        success = false,
                        message = "Paper code already exists"
                    });
                }

                var paper = new Paper
                {
                    PaperCode = paperDto.PaperCode,
                    PaperName = paperDto.PaperName,
                    PaperNumber = paperDto.PaperNumber,
                    MaxMarks = paperDto.MaxMarks,
                    TotalQuestions = paperDto.TotalQuestions,
                    Description = paperDto.Description,
                    UniversityId = resolvedUniversityId,
                    IsActive = paperDto.IsActive,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                };

                _context.Papers.Add(paper);
                await _context.SaveChangesAsync();

                // Create SubjectPaper mappings
                foreach (var subjectId in paperDto.SubjectIds)
                {
                    _context.SubjectPapers.Add(new SubjectPaper
                    {
                        SubjectId = subjectId,
                        PaperId = paper.PaperId
                    });
                }

                // Create ProjectPaper mapping if ProjectId is provided
                if (paperDto.ProjectId.HasValue && paperDto.ProjectId.Value > 0)
                {
                    _context.ProjectPapers.Add(new ProjectPaper
                    {
                        ProjectId = paperDto.ProjectId.Value,
                        PaperId = paper.PaperId,
                        CatchNo = paperDto.CatchNo ?? "",
                        QuestionPaperPdfUrl = paperDto.QuestionPaperPdfUrl ?? "",
                        IsActive = true,
                        CreatedAt = DateTime.UtcNow,
                        UpdatedAt = DateTime.UtcNow
                    });
                }

                await _context.SaveChangesAsync();

                paperDto.PaperId = paper.PaperId;
                paperDto.UniversityId = resolvedUniversityId;

                return CreatedAtAction(
                    nameof(GetPaper),
                    new { id = paper.PaperId },
                    paperDto);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new
                {
                    success = false,
                    message = ex.Message
                });
            }
        }

        [HttpPost("import")]
        [Authorize(Roles = "admin,coordinator")]
        public async Task<IActionResult> ImportPapers([FromBody] ImportPapersRequest request)
        {
            try
            {
                if (request == null || request.TargetProjectId <= 0 || request.SourcePaperIds == null || !request.SourcePaperIds.Any())
                {
                    return BadRequest(new { success = false, message = "Invalid import request parameters" });
                }

                var project = await _context.Projects.FindAsync(request.TargetProjectId);
                if (project == null)
                {
                    return NotFound(new { success = false, message = "Target project not found" });
                }

                int importedCount = 0;
                int sectionsConfiguredCount = 0;

                // Load explicit master sections if provided
                List<SectionMaster> explicitMasterSections = new List<SectionMaster>();
                if (request.MasterSectionIds != null && request.MasterSectionIds.Any())
                {
                    explicitMasterSections = await _context.SectionMasters
                        .Where(m => request.MasterSectionIds.Contains(m.Id))
                        .ToListAsync();
                }

                foreach (var paperId in request.SourcePaperIds.Distinct())
                {
                    var paper = await _context.Papers.FindAsync(paperId);
                    if (paper == null) continue;

                    var alreadyLinked = await _context.ProjectPapers
                        .AnyAsync(pp => pp.ProjectId == request.TargetProjectId && pp.PaperId == paperId);

                    if (!alreadyLinked)
                    {
                        var sourcePp = await _context.ProjectPapers
                            .Where(pp => pp.PaperId == paperId && !string.IsNullOrEmpty(pp.QuestionPaperPdfUrl))
                            .FirstOrDefaultAsync();

                        _context.ProjectPapers.Add(new ProjectPaper
                        {
                            ProjectId = request.TargetProjectId,
                            PaperId = paperId,
                            CatchNo = sourcePp?.CatchNo ?? "",
                            QuestionPaperPdfUrl = "",
                            IsActive = true,
                            CreatedAt = DateTime.UtcNow,
                            UpdatedAt = DateTime.UtcNow
                        });
                        importedCount++;
                    }

                    // Auto-import mapped or explicit master sections for this paper
                    var existingSections = await _context.Sections.Where(s => s.PaperId == paperId).ToListAsync();
                    var sectionsToCreate = new List<SectionMaster>();

                    if (explicitMasterSections.Any())
                    {
                        sectionsToCreate.AddRange(explicitMasterSections);
                    }
                    else
                    {
                        var mappedMasterSections = await _context.PaperSectionMasters
                            .Include(psm => psm.SectionMaster)
                            .Where(psm => psm.PaperId == paperId)
                            .Select(psm => psm.SectionMaster)
                            .ToListAsync();

                        if (mappedMasterSections.Any())
                        {
                            sectionsToCreate.AddRange(mappedMasterSections);
                        }
                    }

                    if (sectionsToCreate.Any())
                    {
                        int currentMaxQ = existingSections.Any() ? existingSections.Max(s => s.EndQuestion) : 0;

                        foreach (var master in sectionsToCreate)
                        {
                            if (existingSections.Any(s => s.Name.Equals(master.Name, StringComparison.OrdinalIgnoreCase))) continue;

                            int startQ = currentMaxQ > 0 ? currentMaxQ + 1 : (master.StartQuestion > 0 ? master.StartQuestion : 1);
                            int totalQ = master.TotalQuestions > 0 ? master.TotalQuestions : 10;
                            int endQ = startQ + totalQ - 1;
                            currentMaxQ = endQ;

                            var newSec = new Section
                            {
                                PaperId = paperId,
                                SectionMasterId = master.Id,
                                Name = master.Name,
                                Description = master.Description ?? "",
                                TotalQuestions = totalQ,
                                TotalMarks = master.TotalMarks > 0 ? master.TotalMarks : 100,
                                StartQuestion = startQ,
                                EndQuestion = endQ,
                                MaxQuestionsToAttempt = master.MaxQuestionsToAttempt > 0 ? master.MaxQuestionsToAttempt : totalQ,
                                CreatedAt = DateTime.UtcNow
                            };
                            _context.Sections.Add(newSec);
                            await _context.SaveChangesAsync();
                            sectionsConfiguredCount++;

                            // Generate default Question items for this section
                            decimal marksPerQ = totalQ > 0 ? (decimal)newSec.TotalMarks / totalQ : 1;
                            var questions = new List<Question>();
                            for (int qNo = startQ; qNo <= endQ; qNo++)
                            {
                                questions.Add(new Question
                                {
                                    SectionId = newSec.Id,
                                    QuestionNo = qNo.ToString(),
                                    Marks = marksPerQ,
                                    Type = "MCQ",
                                    IsOptional = false,
                                    CreatedAt = DateTime.UtcNow
                                });
                            }
                            _context.Questions.AddRange(questions);
                            await _context.SaveChangesAsync();
                        }
                    }
                }

                await _context.SaveChangesAsync();

                string responseMsg = $"{importedCount} paper(s) imported successfully";
                if (sectionsConfiguredCount > 0)
                {
                    responseMsg += $" with {sectionsConfiguredCount} section(s) configured automatically.";
                }

                return Ok(new { success = true, message = responseMsg });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpPut("{id}")]
        [Authorize(Roles = "admin,coordinator")]
        public async Task<IActionResult> UpdatePaper(int id, [FromBody] PaperDto paperDto)
        {
            try
            {
                var paper = await _context.Papers
                    .Include(p => p.SubjectPapers)
                    .Include(p => p.ProjectPapers)
                    .Include(p => p.PaperSectionMasters)
                        .ThenInclude(psm => psm.SectionMaster)
                    .FirstOrDefaultAsync(p => p.PaperId == id);
                if (paper == null)
                    return NotFound(new { success = false, message = "Paper not found" });

                // Validate if reducing TotalQuestions or MaxMarks conflicts with currently mapped master sections
                if (paper.PaperSectionMasters != null && paper.PaperSectionMasters.Any())
                {
                    List<SectionMaster> mappedSections;
                    if (paperDto.MasterSectionIds != null)
                    {
                        mappedSections = await _context.SectionMasters
                            .Where(sm => paperDto.MasterSectionIds.Contains(sm.Id))
                            .ToListAsync();
                    }
                    else
                    {
                        mappedSections = paper.PaperSectionMasters
                            .Where(psm => psm.SectionMaster != null)
                            .Select(psm => psm.SectionMaster)
                            .ToList();
                    }

                    int sumQuestions = mappedSections.Sum(sm => sm.TotalQuestions);
                    decimal sumMarks = mappedSections.Sum(sm => sm.TotalMarks);

                    if (paperDto.TotalQuestions > 0 && sumQuestions > paperDto.TotalQuestions)
                    {
                        return BadRequest(new { 
                            success = false, 
                            message = $"Cannot reduce total questions to {paperDto.TotalQuestions}. Mapped sections require at least {sumQuestions} questions." 
                        });
                    }

                    if (paperDto.MaxMarks > 0 && sumMarks > paperDto.MaxMarks)
                    {
                        return BadRequest(new { 
                            success = false, 
                            message = $"Cannot reduce max marks to {paperDto.MaxMarks}. Mapped sections require at least {sumMarks} marks." 
                        });
                    }
                }

                paper.PaperName = paperDto.PaperName;
                paper.MaxMarks = paperDto.MaxMarks;
                paper.TotalQuestions = paperDto.TotalQuestions;
                paper.Description = paperDto.Description;
                paper.IsActive = paperDto.IsActive;
                if (paperDto.UniversityId.HasValue && paperDto.UniversityId.Value > 0)
                {
                    paper.UniversityId = paperDto.UniversityId.Value;
                }
                paper.UpdatedAt = DateTime.UtcNow;

                // Update ProjectPaper details if projectId is provided
                if (paperDto.ProjectId.HasValue && paperDto.ProjectId.Value > 0)
                {
                    var pp = paper.ProjectPapers.FirstOrDefault(x => x.ProjectId == paperDto.ProjectId.Value);
                    if (pp != null)
                    {
                        if (paperDto.CatchNo != null) pp.CatchNo = paperDto.CatchNo;
                        if (paperDto.QuestionPaperPdfUrl != null) pp.QuestionPaperPdfUrl = paperDto.QuestionPaperPdfUrl;
                        pp.UpdatedAt = DateTime.UtcNow;
                    }
                    else
                    {
                        _context.ProjectPapers.Add(new ProjectPaper
                        {
                            ProjectId = paperDto.ProjectId.Value,
                            PaperId = paper.PaperId,
                            CatchNo = paperDto.CatchNo ?? "",
                            QuestionPaperPdfUrl = paperDto.QuestionPaperPdfUrl ?? "",
                            IsActive = true,
                            CreatedAt = DateTime.UtcNow,
                            UpdatedAt = DateTime.UtcNow
                        });
                    }
                }
                else if (paperDto.CatchNo != null && paper.ProjectPapers.Any())
                {
                    foreach (var pp in paper.ProjectPapers)
                    {
                        pp.CatchNo = paperDto.CatchNo;
                        pp.UpdatedAt = DateTime.UtcNow;
                    }
                }

                // Update subjects mapping if provided
                if (paperDto.SubjectIds != null && paperDto.SubjectIds.Any())
                {
                    _context.SubjectPapers.RemoveRange(paper.SubjectPapers);
                    foreach (var sId in paperDto.SubjectIds)
                    {
                        _context.SubjectPapers.Add(new SubjectPaper
                        {
                            PaperId = paper.PaperId,
                            SubjectId = sId
                        });
                    }
                }

                _context.Papers.Update(paper);
                await _context.SaveChangesAsync();

                return Ok(new { success = true, message = "Paper updated successfully" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpDelete("{id}")]
        [Authorize(Roles = "admin")]
        public async Task<IActionResult> DeletePaper(int id)
        {
            try
            {
                var paper = await _context.Papers.FirstOrDefaultAsync(p => p.PaperId == id);
                if (paper == null)
                    return NotFound(new { success = false, message = "Paper not found" });

                _context.Papers.Remove(paper);
                await _context.SaveChangesAsync();

                return Ok(new { success = true, message = "Paper deleted successfully" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpGet("{id}/sections")]
        public async Task<ActionResult<IEnumerable<Section>>> GetPaperSections(int id)
        {
            try
            {
                var sections = await _context.Sections
                    .Where(s => s.PaperId == id)
                    .Include(s => s.Questions)
                    .OrderBy(s => s.Id)
                    .ToListAsync();

                return Ok(sections);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpPost("{id}/question-paper")]
        [Authorize(Roles = "admin,coordinator")]
        public async Task<IActionResult> UploadQuestionPaper(int id, [FromQuery] int? projectId, IFormFile file)
        {
            try
            {
                if (file == null || file.Length == 0)
                    return BadRequest(new { success = false, message = "No file uploaded" });

                var paper = await _context.Papers
                    .Include(p => p.ProjectPapers)
                    .FirstOrDefaultAsync(p => p.PaperId == id);

                if (paper == null)
                    return NotFound(new { success = false, message = "Paper not found" });

                var basePath = _configuration["StorageSettings:BasePath"];
                var projFolder = (projectId.HasValue && projectId.Value > 0) ? projectId.Value.ToString() : "master";
                var targetFolder = Path.Combine(basePath, "OSM", projFolder, paper.PaperId.ToString(), "questionpaperpdf");
                if (!Directory.Exists(targetFolder))
                {
                    Directory.CreateDirectory(targetFolder);
                }

                var safeCode = string.Join("_", (paper.PaperCode ?? "QP").Split(Path.GetInvalidFileNameChars()));
                var uniqueFileName = $"QP_{safeCode}_{Guid.NewGuid():N}.pdf";
                var filePath = Path.Combine(targetFolder, uniqueFileName);

                using (var fileStream = new FileStream(filePath, FileMode.Create))
                {
                    await file.CopyToAsync(fileStream);
                }

                var fileUrl = $"/OSM/{projFolder}/{paper.PaperId}/questionpaperpdf/{uniqueFileName}";

                if (projectId.HasValue && projectId.Value > 0)
                {
                    var projectPaper = paper.ProjectPapers.FirstOrDefault(pp => pp.ProjectId == projectId.Value);
                    if (projectPaper != null)
                    {
                        projectPaper.QuestionPaperPdfUrl = fileUrl;
                        projectPaper.UpdatedAt = DateTime.UtcNow;
                    }
                    else
                    {
                        _context.ProjectPapers.Add(new ProjectPaper
                        {
                            ProjectId = projectId.Value,
                            PaperId = paper.PaperId,
                            QuestionPaperPdfUrl = fileUrl,
                            IsActive = true,
                            CreatedAt = DateTime.UtcNow,
                            UpdatedAt = DateTime.UtcNow
                        });
                    }
                }
                else
                {
                    if (paper.ProjectPapers.Any())
                    {
                        foreach (var pp in paper.ProjectPapers)
                        {
                            pp.QuestionPaperPdfUrl = fileUrl;
                            pp.UpdatedAt = DateTime.UtcNow;
                        }
                    }
                }

                await _context.SaveChangesAsync();

                return Ok(new { success = true, url = fileUrl, message = "Question paper PDF uploaded successfully" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpDelete("{id}/question-paper")]
        [Authorize(Roles = "admin,coordinator")]
        public async Task<IActionResult> RemoveQuestionPaper(int id, [FromQuery] int? projectId)
        {
            try
            {
                var paper = await _context.Papers
                    .Include(p => p.ProjectPapers)
                    .FirstOrDefaultAsync(p => p.PaperId == id);

                if (paper == null)
                    return NotFound(new { success = false, message = "Paper not found" });

                if (projectId.HasValue && projectId.Value > 0)
                {
                    var projectPaper = paper.ProjectPapers.FirstOrDefault(pp => pp.ProjectId == projectId.Value);
                    if (projectPaper != null)
                    {
                        projectPaper.QuestionPaperPdfUrl = null;
                        projectPaper.UpdatedAt = DateTime.UtcNow;
                    }
                }
                else
                {
                    foreach (var pp in paper.ProjectPapers)
                    {
                        pp.QuestionPaperPdfUrl = null;
                        pp.UpdatedAt = DateTime.UtcNow;
                    }
                }

                await _context.SaveChangesAsync();
                return Ok(new { success = true, message = "Question paper removed successfully" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpPost("bulk-upload-question-papers")]
        [Authorize(Roles = "admin,coordinator")]
        public async Task<IActionResult> BulkUploadQuestionPapers([FromQuery] int? projectId, List<IFormFile> files)
        {
            try
            {
                if (files == null || !files.Any())
                {
                    return BadRequest(new { success = false, message = "No files uploaded" });
                }

                var papersQuery = _context.Papers
                    .Include(p => p.ProjectPapers)
                    .AsQueryable();

                if (projectId.HasValue && projectId.Value > 0)
                {
                    papersQuery = papersQuery.Where(p => p.ProjectPapers.Any(pp => pp.ProjectId == projectId.Value));
                }

                var allPapers = await papersQuery.ToListAsync();

                var basePath = _configuration["StorageSettings:BasePath"] 
                    ?? _configuration["StorageSettings:BaseOsmPath"] 
                    ?? Path.Combine(_environment.WebRootPath ?? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot"), "storage");

                var projFolder = (projectId.HasValue && projectId.Value > 0) ? projectId.Value.ToString() : "master";

                var results = new List<object>();
                int matchedCount = 0;
                int unmatchedCount = 0;

                foreach (var file in files)
                {
                    if (file == null || file.Length == 0) continue;

                    var originalFileName = Path.GetFileName(file.FileName);
                    var fileNameWithoutExt = Path.GetFileNameWithoutExtension(originalFileName)?.Trim() ?? "";

                    string cleanFileName = fileNameWithoutExt;
                    if (cleanFileName.StartsWith("QP_", StringComparison.OrdinalIgnoreCase))
                        cleanFileName = cleanFileName.Substring(3);
                    else if (cleanFileName.StartsWith("QP-", StringComparison.OrdinalIgnoreCase))
                        cleanFileName = cleanFileName.Substring(3);
                    else if (cleanFileName.StartsWith("CATCH_", StringComparison.OrdinalIgnoreCase))
                        cleanFileName = cleanFileName.Substring(6);
                    else if (cleanFileName.StartsWith("CATCH-", StringComparison.OrdinalIgnoreCase))
                        cleanFileName = cleanFileName.Substring(6);
                    else if (cleanFileName.StartsWith("CATCH", StringComparison.OrdinalIgnoreCase))
                        cleanFileName = cleanFileName.Substring(5);

                    cleanFileName = cleanFileName.Trim('_', '-', ' ');

                    Paper? matchedPaper = null;
                    ProjectPaper? matchedProjectPaper = null;

                    if (projectId.HasValue && projectId.Value > 0)
                    {
                        matchedPaper = allPapers.FirstOrDefault(p =>
                            p.ProjectPapers.Any(pp => pp.ProjectId == projectId.Value &&
                                !string.IsNullOrEmpty(pp.CatchNo) &&
                                (pp.CatchNo.Trim().Equals(fileNameWithoutExt, StringComparison.OrdinalIgnoreCase) ||
                                 pp.CatchNo.Trim().Equals(cleanFileName, StringComparison.OrdinalIgnoreCase))
                            )
                        );

                        if (matchedPaper != null)
                        {
                            matchedProjectPaper = matchedPaper.ProjectPapers.FirstOrDefault(pp => pp.ProjectId == projectId.Value);
                        }
                    }

                    if (matchedPaper == null)
                    {
                        matchedPaper = allPapers.FirstOrDefault(p =>
                            p.ProjectPapers.Any(pp =>
                                !string.IsNullOrEmpty(pp.CatchNo) &&
                                (pp.CatchNo.Trim().Equals(fileNameWithoutExt, StringComparison.OrdinalIgnoreCase) ||
                                 pp.CatchNo.Trim().Equals(cleanFileName, StringComparison.OrdinalIgnoreCase))
                            )
                        );
                    }

                    if (matchedPaper == null)
                    {
                        matchedPaper = allPapers.FirstOrDefault(p =>
                            !string.IsNullOrEmpty(p.PaperCode) &&
                            (p.PaperCode.Trim().Equals(fileNameWithoutExt, StringComparison.OrdinalIgnoreCase) ||
                             p.PaperCode.Trim().Equals(cleanFileName, StringComparison.OrdinalIgnoreCase))
                        );
                    }

                    if (matchedPaper != null)
                    {
                        var targetFolder = Path.Combine(basePath, "osm", projFolder, matchedPaper.PaperId.ToString(), "questionpaperpdf");
                        if (!Directory.Exists(targetFolder))
                        {
                            Directory.CreateDirectory(targetFolder);
                        }

                        var safeCode = string.Join("_", (matchedPaper.PaperCode ?? "QP").Split(Path.GetInvalidFileNameChars()));
                        var uniqueFileName = $"QP_{safeCode}_{Guid.NewGuid():N}.pdf";
                        var filePath = Path.Combine(targetFolder, uniqueFileName);

                        using (var stream = new FileStream(filePath, FileMode.Create))
                        {
                            await file.CopyToAsync(stream);
                        }

                        var fileUrl = $"/osm/{projFolder}/{matchedPaper.PaperId}/questionpaperpdf/{uniqueFileName}";

                        if (projectId.HasValue && projectId.Value > 0)
                        {
                            if (matchedProjectPaper == null)
                            {
                                matchedProjectPaper = matchedPaper.ProjectPapers.FirstOrDefault(pp => pp.ProjectId == projectId.Value);
                            }

                            if (matchedProjectPaper != null)
                            {
                                matchedProjectPaper.QuestionPaperPdfUrl = fileUrl;
                                matchedProjectPaper.UpdatedAt = DateTime.UtcNow;
                            }
                            else
                            {
                                matchedProjectPaper = new ProjectPaper
                                {
                                    ProjectId = projectId.Value,
                                    PaperId = matchedPaper.PaperId,
                                    QuestionPaperPdfUrl = fileUrl,
                                    IsActive = true,
                                    CreatedAt = DateTime.UtcNow,
                                    UpdatedAt = DateTime.UtcNow
                                };
                                _context.ProjectPapers.Add(matchedProjectPaper);
                            }
                        }
                        else
                        {
                            foreach (var pp in matchedPaper.ProjectPapers)
                            {
                                pp.QuestionPaperPdfUrl = fileUrl;
                                pp.UpdatedAt = DateTime.UtcNow;
                            }
                        }

                        matchedCount++;
                        var matchedCatch = matchedProjectPaper?.CatchNo ?? matchedPaper.ProjectPapers.Select(pp => pp.CatchNo).FirstOrDefault() ?? "";

                        results.Add(new
                        {
                            fileName = originalFileName,
                            status = "Success",
                            message = $"Matched to Paper '{matchedPaper.PaperCode}' ({matchedPaper.PaperName})",
                            paperId = matchedPaper.PaperId,
                            paperCode = matchedPaper.PaperCode,
                            paperName = matchedPaper.PaperName,
                            catchNo = matchedCatch,
                            fileUrl = fileUrl
                        });
                    }
                    else
                    {
                        unmatchedCount++;
                        results.Add(new
                        {
                            fileName = originalFileName,
                            status = "Unmatched",
                            message = $"No paper found matching Catch No / Code '{fileNameWithoutExt}'",
                            paperId = (int?)null,
                            paperCode = "",
                            paperName = "",
                            catchNo = fileNameWithoutExt,
                            fileUrl = ""
                        });
                    }
                }

                await _context.SaveChangesAsync();

                return Ok(new
                {
                    success = true,
                    totalFiles = files.Count,
                    matchedCount = matchedCount,
                    unmatchedCount = unmatchedCount,
                    message = $"Processed {files.Count} files: {matchedCount} allocated to papers, {unmatchedCount} unmatched.",
                    results = results
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }
    }
}

