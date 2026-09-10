using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using SolveStation.Common.Interfaces;
using SolveStation.Data.Context;
using SolveStation.Data.Repositories;
using SolveStation.Data.Seed;

namespace SolveStation.Data.Extensions;

public static class ServiceCollectionExtensions
{
    public static IServiceCollection AddDataLayer(this IServiceCollection services, string connectionString)
    {
        // Register Entity Framework DbContext with PostgreSQL
        services.AddDbContext<PharmacyDbContext>(options =>
        {
            options.UseNpgsql(connectionString, npgsqlOptions =>
                npgsqlOptions.MigrationsAssembly(typeof(PharmacyDbContext).Assembly.FullName));

            options.EnableSensitiveDataLogging();
            options.EnableDetailedErrors();
        });
        
        // Register Unit of Work
        services.AddScoped<IUnitOfWork, UnitOfWork>();

        // Register Repositories
        services.AddScoped<IDrugRepository, DrugRepository>();
        services.AddScoped<IPrescriptionRepository, PrescriptionRepository>();
        services.AddScoped<IUserRepository, UserRepository>();
        services.AddScoped<IRefreshTokenRepository, RefreshTokenRepository>();

        return services;
    }

    public static async Task MigrateDatabase(this IServiceProvider serviceProvider)
    {
        using var scope = serviceProvider.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<PharmacyDbContext>();
        var logger = scope.ServiceProvider.GetRequiredService<ILogger<PharmacyDbContext>>();

        try
        {
            logger.LogInformation("Applying PostgreSQL database migrations...");
            await context.Database.MigrateAsync();
            logger.LogInformation("PostgreSQL migrations applied successfully.");
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "An error occurred while migrating the database.");
            throw;
        }
    }

    public static async Task SeedDatabase(this IServiceProvider serviceProvider, Func<string, string>? hashPassword = null)
    {
        using var scope = serviceProvider.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<PharmacyDbContext>();
        await SeedData.SeedAsync(context, hashPassword);
    }
}