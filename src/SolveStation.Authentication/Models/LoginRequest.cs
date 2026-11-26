namespace SolveStation.Authentication.Models;
using System.ComponentModel.DataAnnotations;

public record LoginRequest(
    [Required] string Email,
    [Required] string Password);
