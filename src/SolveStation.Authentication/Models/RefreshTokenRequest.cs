namespace SolveStation.Authentication.Models;
using System.ComponentModel.DataAnnotations;

public record RefreshTokenRequest(
    [Required] string Token);
