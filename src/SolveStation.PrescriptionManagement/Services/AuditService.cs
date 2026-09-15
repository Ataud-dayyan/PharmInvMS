// using SolveStation.Data.Models;
// using System.Threading;
// using System.Threading.Tasks;

// namespace SolveStation.PrescriptionManagement.Services;

// public interface IAuditService
// {
//     Task LogAsync(string action, string details, string performedBy, string userRole, CancellationToken cancellationToken = default);
// }

// public class AuditService : IAuditService
// {
//     private readonly PharmacyDbContext _context;

//     public AuditService(PharmacyDbContext context)
//     {
//         _context = context;
//     }

//     public async Task LogAsync(string action, string details, string performedBy, string userRole, CancellationToken cancellationToken = default)
//     {
//         var log = new AuditLog
//         {
//             Action = action,
//             Details = details,
//             PerformedBy = string.IsNullOrWhiteSpace(performedBy) ? "System" : performedBy,
//             UserRole = string.IsNullOrWhiteSpace(userRole) ? "System" : userRole,
//             Timestamp = DateTime.UtcNow
//         };

//         _context.AuditLogs.Add(log);
//         await _context.SaveChangesAsync(cancellationToken);
//     }
// }