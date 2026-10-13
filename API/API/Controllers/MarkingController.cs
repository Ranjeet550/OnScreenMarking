using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using API.Data;
using API.Models;
using API.Models.DTOs;
using Microsoft.Extensions.Caching.Distributed;
using System.Text.Json;

namespace API.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class MarkingController : ControllerBase
    {
        private readonly ApplicationDbContext _context;
        private readonly IDistributedCache _cache;

        public MarkingController(ApplicationDbContext context, IDistributedCache cache)
        {
            _context = context;
            _cache = cache;
        }

        [HttpPost]
        [Authorize(Roles = "examiner")]
        public async Task<ActionResult<MarkingDto>> CreateMarking([FromBody] SubmitMarkingRequest request)
        {
            try
            {
                // Verify allocation exists
                var allocation = await _context.Allocations
                    .Include(a => a.Script)
                        .ThenInclude(s => s.ProjectPaper).ThenInclude(pp => pp.Paper)
                    .FirstOrDefaultAsync(a => a.AllocationId == request.AllocationId);

                if (allocation == null)
                    return BadRequest(new { success = false, message = "Allocation not found" });

                if (allocation.ExaminerId != request.ExaminerId)
                    return BadRequest(new { success = false, message = "Allocation not assigned to this examiner" });

                var existingMarking = await _context.Markings
                    .FirstOrDefaultAsync(m => m.AllocationId == request.AllocationId);

                if (existingMarking != null)
                {
                    var existingMarkingDto = new MarkingDto
                    {
                        Id = existingMarking.Id,
                        ScriptId = existingMarking.ScriptId,
                        ExaminerId = existingMarking.ExaminerId,
                        AllocationId = existingMarking.AllocationId,
                        TotalMarks = existingMarking.TotalMarks,
                        Percentage = existingMarking.Percentage,
                        Remarks = existingMarking.Remarks,
                        Status = existingMarking.Status,
                        StartedAt = existingMarking.StartedAt
                    };
                    return Ok(existingMarkingDto);
                }

                decimal maxMarks = allocation.Script?.ProjectPaper?.Paper?.MaxMarks ?? 100;
                if (maxMarks <= 0) maxMarks = 100;

                var marking = new Marking
                {
                    ScriptId = allocation.ScriptId,
                    ExaminerId = request.ExaminerId,
                    AllocationId = request.AllocationId,
                    TotalMarks = request.TotalMarks,
                    Percentage = (request.TotalMarks / maxMarks) * 100,
                    Remarks = request.Remarks ?? "",
                    Status = "draft",
                    StartedAt = DateTime.UtcNow,
                    EvaluatedPdfUrl = "" // Avoid Column 'EvaluatedPdfUrl' cannot be null error
                };

                _context.Markings.Add(marking);
                await _context.SaveChangesAsync();

                var markingDto = new MarkingDto
                {
                    Id = marking.Id,
                    ScriptId = marking.ScriptId,
                    ExaminerId = marking.ExaminerId,
                    AllocationId = marking.AllocationId,
                    TotalMarks = marking.TotalMarks,
                    Percentage = marking.Percentage,
                    Remarks = marking.Remarks,
                    Status = marking.Status,
                    StartedAt = marking.StartedAt
                };

                return CreatedAtAction(nameof(GetMarking), new { id = marking.Id }, markingDto);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpGet("{id}")]
        public async Task<ActionResult<MarkingDto>> GetMarking(int id)
        {
            try
            {
                var marking = await _context.Markings
                    .Include(m => m.Script)
                    .Include(m => m.Examiner)
                    .Include(m => m.Allocation)
                    .FirstOrDefaultAsync(m => m.Id == id);

                if (marking == null)
                    return NotFound(new { success = false, message = "Marking not found" });

                var loggedInUserType = User.FindFirst("userType")?.Value;
                var loggedInUserIdStr = User.FindFirst("id")?.Value;

                if (loggedInUserType == "examiner")
                {
                    if (string.IsNullOrEmpty(loggedInUserIdStr) || marking.ExaminerId != int.Parse(loggedInUserIdStr))
                    {
                        return StatusCode(403, new { success = false, message = "You do not have permission to view this marking." });
                    }
                }

                var markingDto = new MarkingDto
                {
                    Id = marking.Id,
                    ScriptId = marking.ScriptId,
                    ExaminerId = marking.ExaminerId,
                    AllocationId = marking.AllocationId,
                    TotalMarks = marking.TotalMarks,
                    Percentage = marking.Percentage,
                    Remarks = marking.Remarks,
                    Status = marking.Status,
                    StartedAt = marking.StartedAt,
                    SubmittedAt = marking.SubmittedAt
                };

                return Ok(markingDto);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpPut("{id}")]
        [Authorize(Roles = "examiner")]
        public async Task<IActionResult> UpdateMarking(int id, [FromBody] SubmitMarkingRequest request)
        {
            try
            {
                var existingMarking = await _context.Markings
                    .Include(m => m.Script)
                        .ThenInclude(s => s.ProjectPaper).ThenInclude(pp => pp.Paper)
                    .FirstOrDefaultAsync(m => m.Id == id);

                if (existingMarking == null)
                    return NotFound(new { success = false, message = "Marking not found" });

                if (existingMarking.Status == "submitted")
                    return BadRequest(new { success = false, message = "Cannot update submitted marking" });

                decimal maxMarks = existingMarking.Script?.ProjectPaper?.Paper?.MaxMarks ?? 100;
                if (maxMarks <= 0) maxMarks = 100;

                existingMarking.TotalMarks = request.TotalMarks;
                existingMarking.Percentage = (request.TotalMarks / maxMarks) * 100;
                existingMarking.Remarks = request.Remarks;
                existingMarking.EvaluatedPdfUrl = request.EvaluatedPdfUrl ?? "";
                existingMarking.UpdatedAt = DateTime.UtcNow;

                _context.Markings.Update(existingMarking);
                await _context.SaveChangesAsync();

                return Ok(new { success = true, message = "Marking updated successfully" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpPost("{scriptId}/draft")]
        [Authorize(Roles = "examiner")]
        public async Task<IActionResult> SaveDraftMarks(int scriptId, [FromBody] DraftMarksRequest request)
        {
            try
            {
                // 1. Save to Redis Cache (for fast in-memory access)
                try
                {
                    var cacheKey = $"draft_marks_{scriptId}_{request.ExaminerId}";
                    var serializedData = JsonSerializer.Serialize(request.DraftData);
                    
                    var options = new DistributedCacheEntryOptions()
                        .SetAbsoluteExpiration(TimeSpan.FromDays(7));
                    
                    await _cache.SetStringAsync(cacheKey, serializedData, options);
                }
                catch (Exception)
                {
                    // Ignore cache errors so database persistence continues
                }

                // 2. Persist Draft Question Marks to MySQL Database
                try
                {
                    var marking = await _context.Markings
                        .Include(m => m.QuestionMarks)
                        .Include(m => m.Script)
                            .ThenInclude(s => s.ProjectPaper).ThenInclude(pp => pp.Paper)
                        .FirstOrDefaultAsync(m => m.ScriptId == scriptId && m.ExaminerId == request.ExaminerId);

                    if (marking == null)
                    {
                        var allocation = await _context.Allocations
                            .FirstOrDefaultAsync(a => a.ScriptId == scriptId && a.ExaminerId == request.ExaminerId);

                        if (allocation != null)
                        {
                            marking = new Marking
                            {
                                ScriptId = scriptId,
                                ExaminerId = request.ExaminerId,
                                AllocationId = allocation.AllocationId,
                                TotalMarks = 0,
                                Percentage = 0,
                                Remarks = "",
                                Status = "draft",
                                StartedAt = DateTime.UtcNow,
                                EvaluatedPdfUrl = ""
                            };
                            _context.Markings.Add(marking);
                            await _context.SaveChangesAsync();
                        }
                    }

                    if (marking != null && marking.Status != "submitted")
                    {
                        var parsedQuestionMarks = new List<(int QuestionId, decimal MarksAwarded, bool IsSkipped, string Remarks, bool IsAttempted)>();

                        if (request.DraftData.ValueKind == JsonValueKind.Object)
                        {
                            foreach (var prop in request.DraftData.EnumerateObject())
                            {
                                if (int.TryParse(prop.Name, out int qId))
                                {
                                    var item = prop.Value;
                                    decimal marksAwarded = item.TryGetProperty("marksAwarded", out var mp) && mp.ValueKind == JsonValueKind.Number ? mp.GetDecimal() : 0;
                                    bool isSkipped = item.TryGetProperty("isSkipped", out var sp) && (sp.ValueKind == JsonValueKind.True || sp.ValueKind == JsonValueKind.False) && sp.GetBoolean();
                                    string remarks = item.TryGetProperty("remarks", out var rp) && rp.ValueKind == JsonValueKind.String ? rp.GetString() ?? "" : "";
                                    bool isAttempted = item.TryGetProperty("isAttempted", out var ap) && (ap.ValueKind == JsonValueKind.True || ap.ValueKind == JsonValueKind.False) && ap.GetBoolean();

                                    parsedQuestionMarks.Add((qId, marksAwarded, isSkipped, remarks, isAttempted));
                                }
                            }
                        }
                        else if (request.DraftData.ValueKind == JsonValueKind.Array)
                        {
                            foreach (var item in request.DraftData.EnumerateArray())
                            {
                                int qId = item.TryGetProperty("questionId", out var qp) && qp.ValueKind == JsonValueKind.Number ? qp.GetInt32() : 0;
                                if (qId > 0)
                                {
                                    decimal marksAwarded = item.TryGetProperty("marksAwarded", out var mp) && mp.ValueKind == JsonValueKind.Number ? mp.GetDecimal() : 0;
                                    bool isSkipped = item.TryGetProperty("isSkipped", out var sp) && (sp.ValueKind == JsonValueKind.True || sp.ValueKind == JsonValueKind.False) && sp.GetBoolean();
                                    string remarks = item.TryGetProperty("remarks", out var rp) && rp.ValueKind == JsonValueKind.String ? rp.GetString() ?? "" : "";
                                    bool isAttempted = item.TryGetProperty("isAttempted", out var ap) && (ap.ValueKind == JsonValueKind.True || ap.ValueKind == JsonValueKind.False) && ap.GetBoolean();

                                    parsedQuestionMarks.Add((qId, marksAwarded, isSkipped, remarks, isAttempted));
                                }
                            }
                        }

                        if (parsedQuestionMarks.Any())
                        {
                            var existingMap = marking.QuestionMarks.ToDictionary(qm => qm.QuestionId);
                            decimal totalMarks = 0;

                            foreach (var qm in parsedQuestionMarks)
                            {
                                if (existingMap.TryGetValue(qm.QuestionId, out var existingQm))
                                {
                                    existingQm.MarksAwarded = qm.MarksAwarded;
                                    existingQm.IsSkipped = qm.IsSkipped;
                                    existingQm.Remarks = qm.Remarks ?? "";
                                    existingQm.IsAttempted = qm.IsAttempted;
                                    _context.Entry(existingQm).State = EntityState.Modified;
                                }
                                else
                                {
                                    var newQm = new QuestionMark
                                    {
                                        MarkingId = marking.Id,
                                        QuestionId = qm.QuestionId,
                                        MarksAwarded = qm.MarksAwarded,
                                        IsSkipped = qm.IsSkipped,
                                        Remarks = qm.Remarks ?? "",
                                        IsAttempted = qm.IsAttempted
                                    };
                                    _context.QuestionMarks.Add(newQm);
                                }

                                if (!qm.IsSkipped)
                                {
                                    totalMarks += qm.MarksAwarded;
                                }
                            }

                            decimal maxMarks = marking.Script?.ProjectPaper?.Paper?.MaxMarks ?? 100;
                            if (maxMarks <= 0) maxMarks = 100;

                            marking.TotalMarks = totalMarks;
                            marking.Percentage = (totalMarks / maxMarks) * 100;
                            marking.UpdatedAt = DateTime.UtcNow;

                            _context.Markings.Update(marking);
                            await _context.SaveChangesAsync();
                        }
                    }
                }
                catch (Exception)
                {
                    // Ignore DB errors in background draft save so response is fast
                }

                return Ok(new { success = true, message = "Draft saved successfully" });
            }
            catch (Exception ex)
            {
                // Return success=true to ignore errors
                return Ok(new { success = true, message = "Draft save skipped due to error", error = ex.Message });
            }
        }

        [HttpGet("{scriptId}/draft/{examinerId}")]
        [Authorize(Roles = "examiner")]
        public async Task<IActionResult> GetDraftMarks(int scriptId, int examinerId)
        {
            try
            {
                // 1. Try Redis cache first
                var cacheKey = $"draft_marks_{scriptId}_{examinerId}";
                string draftDataStr = null;
                try
                {
                    draftDataStr = await _cache.GetStringAsync(cacheKey);
                }
                catch {}

                if (!string.IsNullOrEmpty(draftDataStr))
                {
                    var draftData = JsonSerializer.Deserialize<JsonElement>(draftDataStr);
                    return Ok(new { success = true, draftData });
                }

                // 2. Fallback to Database QuestionMarks if cache is empty or unavailable
                var marking = await _context.Markings
                    .Include(m => m.QuestionMarks)
                        .ThenInclude(qm => qm.Question)
                    .FirstOrDefaultAsync(m => m.ScriptId == scriptId && m.ExaminerId == examinerId);

                if (marking != null && marking.QuestionMarks.Any())
                {
                    var dbDraft = new Dictionary<string, object>();
                    foreach (var qm in marking.QuestionMarks)
                    {
                        dbDraft[qm.QuestionId.ToString()] = new
                        {
                            marksAwarded = qm.MarksAwarded,
                            isSkipped = qm.IsSkipped,
                            remarks = qm.Remarks ?? "",
                            isAttempted = qm.IsAttempted,
                            maxMarks = qm.Question?.Marks ?? 0,
                            questionNo = qm.Question?.QuestionNo ?? ""
                        };
                    }
                    return Ok(new { success = true, draftData = dbDraft });
                }

                return Ok(new { success = true, draftData = (object)null });
            }
            catch (Exception ex)
            {
                return Ok(new { success = true, draftData = (object)null, error = ex.Message });
            }
        }

        [HttpPut("{id}/submit")]
        [Authorize(Roles = "examiner")]
        public async Task<IActionResult> SubmitMarking(int id)
        {
            try
            {
                var marking = await _context.Markings
                    .Include(m => m.Script)
                    .FirstOrDefaultAsync(m => m.Id == id);

                if (marking == null)
                    return NotFound(new { success = false, message = "Marking not found" });

                marking.Status = "submitted";
                marking.SubmittedAt = DateTime.UtcNow;
                marking.UpdatedAt = DateTime.UtcNow;

                _context.Markings.Update(marking);

                // Update script status
                var script = marking.Script;
                if (script != null)
                {
                    script.Status = "completed";
                    script.TotalMarks = marking.TotalMarks;
                    script.Percentage = marking.Percentage;
                    script.Remarks = marking.Remarks;
                    script.SubmittedAt = DateTime.UtcNow;
                    script.UpdatedAt = DateTime.UtcNow;
                    _context.Scripts.Update(script);
                }

                await _context.SaveChangesAsync();

                // Clear the draft from Redis
                var cacheKey = $"draft_marks_{script.Id}_{marking.ExaminerId}";
                await _cache.RemoveAsync(cacheKey);

                return Ok(new { success = true, message = "Marking submitted successfully" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpGet("examiner/{examinerId}")]
        public async Task<ActionResult<IEnumerable<MarkingDto>>> GetExaminerMarkings(
            int examinerId,
            [FromQuery] string status = null,
            [FromQuery] int page = 1,
            [FromQuery] int limit = 10)
        {
            try
            {
                var loggedInUserType = User.FindFirst("userType")?.Value;
                var loggedInUserIdStr = User.FindFirst("id")?.Value;

                if (loggedInUserType == "examiner")
                {
                    if (string.IsNullOrEmpty(loggedInUserIdStr) || examinerId != int.Parse(loggedInUserIdStr))
                    {
                        return StatusCode(403, new { success = false, message = "You can only view your own markings." });
                    }
                }

                var query = _context.Markings
                    .Where(m => m.ExaminerId == examinerId)
                    .AsQueryable();

                if (!string.IsNullOrEmpty(status))
                    query = query.Where(m => m.Status == status);

                var total = await query.CountAsync();
                var markings = await query
                    .Include(m => m.Script)
                    .Include(m => m.Examiner)
                    .Include(m => m.Allocation)
                    .Skip((page - 1) * limit)
                    .Take(limit)
                    .OrderByDescending(m => m.CreatedAt)
                    .ToListAsync();

                var markingDtos = markings.Select(m => new MarkingDto
                {
                    Id = m.Id,
                    ScriptId = m.ScriptId,
                    ExaminerId = m.ExaminerId,
                    AllocationId = m.AllocationId,
                    TotalMarks = m.TotalMarks,
                    Percentage = m.Percentage,
                    Remarks = m.Remarks,
                    Status = m.Status,
                    StartedAt = m.StartedAt,
                    SubmittedAt = m.SubmittedAt
                }).ToList();

                Response.Headers.Add("X-Total-Count", total.ToString());

                return Ok(markingDtos);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpGet("script/{scriptId}")]
        public async Task<ActionResult<MarkingDto>> GetScriptMarking(int scriptId)
        {
            try
            {
                var marking = await _context.Markings
                    .Include(m => m.Script)
                    .Include(m => m.Examiner)
                    .Include(m => m.Allocation)
                    .FirstOrDefaultAsync(m => m.ScriptId == scriptId);

                if (marking == null)
                    return NotFound(new { success = false, message = "Marking not found for this script" });

                var loggedInUserType = User.FindFirst("userType")?.Value;
                var loggedInUserIdStr = User.FindFirst("id")?.Value;

                if (loggedInUserType == "examiner")
                {
                    if (string.IsNullOrEmpty(loggedInUserIdStr) || marking.ExaminerId != int.Parse(loggedInUserIdStr))
                    {
                        return StatusCode(403, new { success = false, message = "You do not have permission to view this marking." });
                    }
                }

                var markingDto = new MarkingDto
                {
                    Id = marking.Id,
                    ScriptId = marking.ScriptId,
                    ExaminerId = marking.ExaminerId,
                    AllocationId = marking.AllocationId,
                    TotalMarks = marking.TotalMarks,
                    Percentage = marking.Percentage,
                    Remarks = marking.Remarks,
                    Status = marking.Status,
                    StartedAt = marking.StartedAt,
                    SubmittedAt = marking.SubmittedAt
                };

                return Ok(markingDto);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpGet("{markingId}/details")]
        public async Task<ActionResult<object>> GetMarkingDetails(int markingId)
        {
            try
            {
                var marking = await _context.Markings
                    .Include(m => m.Script)
                        .ThenInclude(s => s.ProjectPaper).ThenInclude(pp => pp.Paper)
                            .ThenInclude(p => p.Sections)
                                .ThenInclude(sec => sec.Questions)
                    .Include(m => m.Examiner)
                    .Include(m => m.Allocation)
                    .Include(m => m.QuestionMarks)
                        .ThenInclude(qm => qm.Question)
                    .FirstOrDefaultAsync(m => m.Id == markingId);

                if (marking == null)
                    return NotFound(new { success = false, message = "Marking not found" });

                var loggedInUserType = User.FindFirst("userType")?.Value;
                var loggedInUserIdStr = User.FindFirst("id")?.Value;

                if (loggedInUserType == "examiner")
                {
                    if (string.IsNullOrEmpty(loggedInUserIdStr) || marking.ExaminerId != int.Parse(loggedInUserIdStr))
                    {
                        return StatusCode(403, new { success = false, message = "You do not have permission to view this marking." });
                    }
                }

                var sections = marking.Script.ProjectPaper.Paper.Sections.Select(s => new
                {
                    id = s.Id,
                    name = s.Name,
                    description = s.Description,
                    totalQuestions = s.TotalQuestions,
                    totalMarks = s.TotalMarks,
                    startQuestion = s.StartQuestion,
                    endQuestion = s.EndQuestion,
                    questions = s.Questions.Select(q => new
                    {
                        questionId = q.QuestionId,
                        questionNo = q.QuestionNo,
                        marks = q.Marks,
                        type = q.Type,
                        isOptional = q.IsOptional,
                        optionalGroupCode = q.OptionalGroupCode,
                        marksAwarded = marking.QuestionMarks
                            .FirstOrDefault(qm => qm.QuestionId == q.QuestionId)?.MarksAwarded ?? 0,
                        isSkipped = marking.QuestionMarks
                            .FirstOrDefault(qm => qm.QuestionId == q.QuestionId)?.IsSkipped ?? false,
                        remarks = marking.QuestionMarks
                            .FirstOrDefault(qm => qm.QuestionId == q.QuestionId)?.Remarks ?? "",
                        isAttempted = marking.QuestionMarks
                            .FirstOrDefault(qm => qm.QuestionId == q.QuestionId)?.IsAttempted ?? false
                    }).ToList()
                }).ToList();

                return Ok(new
                {
                    marking = new
                    {
                        id = marking.Id,
                        scriptId = marking.ScriptId,
                        examinerId = marking.ExaminerId,
                        examinerName = marking.Examiner.Name,
                        allocationId = marking.AllocationId,
                        totalMarks = marking.TotalMarks,
                        percentage = marking.Percentage,
                        remarks = marking.Remarks,
                        status = marking.Status,
                        startedAt = marking.StartedAt,
                        submittedAt = marking.SubmittedAt
                    },
                    script = new
                    {
                        id = marking.Script.Id,
                        paperId = marking.Script.ProjectPaper.PaperId,
                        cleanPdfUrl = marking.Script.CleanPdfUrl,
                        status = marking.Script.Status,
                    },
                    sections = sections
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpPost("{markingId}/question-marks")]
        [Authorize(Roles = "examiner")]
        public async Task<IActionResult> SaveQuestionMarks(int markingId, [FromBody] List<QuestionMarkDto> questionMarks)
        {
            try
            {
                var marking = await _context.Markings
                    .Include(m => m.QuestionMarks)
                    .Include(m => m.Script)
                        .ThenInclude(s => s.ProjectPaper).ThenInclude(pp => pp.Paper)
                    .FirstOrDefaultAsync(m => m.Id == markingId);

                if (marking == null)
                    return NotFound(new { success = false, message = "Marking not found" });

                var loggedInUserIdStr = User.FindFirst("id")?.Value;
                if (string.IsNullOrEmpty(loggedInUserIdStr) || marking.ExaminerId != int.Parse(loggedInUserIdStr))
                {
                    return StatusCode(403, new { success = false, message = "You do not have permission to modify this marking." });
                }

                if (marking.Status == "submitted")
                    return BadRequest(new { success = false, message = "Cannot update submitted marking" });

                var questionIds = questionMarks.Select(qm => qm.QuestionId).ToList();
                var questions = await _context.Questions
                    .Include(q => q.Section)
                    .Where(q => questionIds.Contains(q.QuestionId))
                    .ToListAsync();

                // 1. Question-wise validation
                foreach (var qm in questionMarks)
                {
                    if (qm.IsSkipped) continue;

                    var question = questions.FirstOrDefault(q => q.QuestionId == qm.QuestionId);
                    if (question == null)
                        return BadRequest(new { success = false, message = $"Question with ID {qm.QuestionId} not found" });

                    if (qm.MarksAwarded < 0 || qm.MarksAwarded > question.Marks)
                    {
                        return BadRequest(new { 
                            success = false, 
                            message = $"Marks awarded for Question {question.QuestionNo} ({qm.MarksAwarded}) must be between 0 and maximum allowed ({question.Marks})" 
                        });
                    }
                }

                // 2. Section-wise validation
                var marksBySection = new Dictionary<int, decimal>();
                foreach (var qm in questionMarks)
                {
                    if (qm.IsSkipped) continue;

                    var question = questions.FirstOrDefault(q => q.QuestionId == qm.QuestionId);
                    if (question != null)
                    {
                        if (!marksBySection.ContainsKey(question.SectionId))
                        {
                            marksBySection[question.SectionId] = 0;
                        }
                        marksBySection[question.SectionId] += qm.MarksAwarded;
                    }
                }

                foreach (var entry in marksBySection)
                {
                    var firstQuestionInSection = questions.First(q => q.SectionId == entry.Key);
                    var section = firstQuestionInSection.Section;
                    if (section != null && entry.Value > section.TotalMarks)
                    {
                        return BadRequest(new { 
                            success = false, 
                            message = $"Total marks in Section '{section.Name}' ({entry.Value}) cannot exceed the maximum section marks ({section.TotalMarks})" 
                        });
                    }
                }

                // 3. Max attempted questions validation per section
                var attemptedCountBySection = new Dictionary<int, int>();
                foreach (var qm in questionMarks)
                {
                    if (qm.IsSkipped) continue;

                    var question = questions.FirstOrDefault(q => q.QuestionId == qm.QuestionId);
                    if (question != null)
                    {
                        var isAttempted = qm.IsAttempted || qm.MarksAwarded > 0;
                        if (isAttempted)
                        {
                            if (!attemptedCountBySection.ContainsKey(question.SectionId))
                            {
                                attemptedCountBySection[question.SectionId] = 0;
                            }
                            attemptedCountBySection[question.SectionId]++;
                        }
                    }
                }

                foreach (var entry in attemptedCountBySection)
                {
                    var firstQuestionInSection = questions.First(q => q.SectionId == entry.Key);
                    var section = firstQuestionInSection.Section;
                    if (section != null && section.MaxQuestionsToAttempt > 0 && entry.Value > section.MaxQuestionsToAttempt)
                    {
                        return BadRequest(new { 
                            success = false, 
                            message = $"You have attempted {entry.Value} questions in Section '{section.Name}', which exceeds the maximum allowed attempts of {section.MaxQuestionsToAttempt}." 
                        });
                    }
                }

                // Remove existing question marks
                _context.QuestionMarks.RemoveRange(marking.QuestionMarks);

                // Add new question marks
                decimal totalMarks = 0;
                foreach (var qm in questionMarks)
                {
                    var question = questions.FirstOrDefault(q => q.QuestionId == qm.QuestionId);
                    if (question == null)
                        continue;

                    var questionMark = new QuestionMark
                    {
                        MarkingId = markingId,
                        QuestionId = qm.QuestionId,
                        MarksAwarded = qm.MarksAwarded,
                        IsSkipped = qm.IsSkipped,
                        Remarks = qm.Remarks ?? "",
                        IsAttempted = qm.IsAttempted
                    };

                    _context.QuestionMarks.Add(questionMark);
                    if (!qm.IsSkipped)
                        totalMarks += qm.MarksAwarded;
                }

                // Update marking totals
                decimal maxMarks = marking.Script?.ProjectPaper?.Paper?.MaxMarks ?? 100;
                if (maxMarks <= 0) maxMarks = 100;

                marking.TotalMarks = totalMarks;
                marking.Percentage = (totalMarks / maxMarks) * 100;
                marking.UpdatedAt = DateTime.UtcNow;

                _context.Markings.Update(marking);
                await _context.SaveChangesAsync();

                return Ok(new { success = true, message = "Question marks saved successfully", totalMarks = totalMarks });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        [HttpGet("{markingId}/question-marks")]
        public async Task<ActionResult<List<QuestionMarkDto>>> GetQuestionMarks(int markingId)
        {
            try
            {
                var marking = await _context.Markings.FindAsync(markingId);
                if (marking == null)
                    return NotFound(new { success = false, message = "Marking not found" });

                var loggedInUserType = User.FindFirst("userType")?.Value;
                var loggedInUserIdStr = User.FindFirst("id")?.Value;

                if (loggedInUserType == "examiner")
                {
                    if (string.IsNullOrEmpty(loggedInUserIdStr) || marking.ExaminerId != int.Parse(loggedInUserIdStr))
                    {
                        return StatusCode(403, new { success = false, message = "You do not have permission to view this marking's question marks." });
                    }
                }

                var questionMarks = await _context.QuestionMarks
                    .Where(qm => qm.MarkingId == markingId)
                    .Include(qm => qm.Question)
                    .Select(qm => new QuestionMarkDto
                    {
                        QuestionId = qm.QuestionId,
                        QuestionNo = qm.Question.QuestionNo,
                        MarksAwarded = qm.MarksAwarded,
                        IsSkipped = qm.IsSkipped,
                        Remarks = qm.Remarks,
                        IsAttempted = qm.IsAttempted
                    })
                    .ToListAsync();

                return Ok(questionMarks);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }
    }
}
