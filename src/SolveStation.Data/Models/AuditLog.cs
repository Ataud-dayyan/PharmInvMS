// using System;

// namespace SolveStation.Data.Models;

// public class AuditLog
// {
//     public Guid Id { get; set; } = Guid.NewGuid();
//     public string Action { get; set; } = string.Empty;       // e.g., "PRESCRIPTION_FILLED", "STOCK_UPDATED"
//     public string Details { get; set; } = string.Empty;      // Human-readable summary
//     public string PerformedBy { get; set; } = string.Empty;  // User ID or Name
//     public string UserRole { get; set; } = string.Empty;     // Doctor, Pharmacist, Admin
//     public DateTime Timestamp { get; set; } = DateTime.UtcNow;
// }