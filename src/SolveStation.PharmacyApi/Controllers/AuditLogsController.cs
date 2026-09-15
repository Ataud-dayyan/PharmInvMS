// using Microsoft.AspNetCore.Authorization;
// using Microsoft.AspNetCore.Mvc;
// using Microsoft.EntityFrameworkCore;
// using SolveStation.Data;
// using System.Linq;
// using System.Threading;
// using System.Threading.Tasks;

// namespace SolveStation.PharmacyApi.Controllers;

// [ApiController]
// [Route("api/[controller]")]
// [Authorize(Roles = "Admin")]
// public class AuditLogsController : ControllerBase
// {
//     private readonly PharmacyDbContext _context;

//     public AuditLogsController(PharmacyDbContext context)
//     {
//         _context = context;
//     }

//     [HttpGet]
//     public async Task<IActionResult> GetLogs([FromQuery] int limit = 50, CancellationToken cancellationToken = default)
//     {
//         var logs = await _context.AuditLogs
//             .OrderByDescending(l => l.Timestamp)
//             .Take(limit)
//             .ToListAsync(cancellationToken);

//         return Ok(logs);
//     }
// }