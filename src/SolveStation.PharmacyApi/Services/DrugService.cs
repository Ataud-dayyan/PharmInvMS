using SolveStation.PharmacyApi.Models.DTOs;
using SolveStation.Data.Models;
using SolveStation.Data.Repositories;
using SolveStation.Common.Interfaces;
using SolveStation.Common.Exceptions;

namespace SolveStation.PharmacyApi.Services;

public class DrugService : IDrugService
{
    private readonly IDrugRepository _drugRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly ILogger<DrugService> _logger;

    public DrugService(
        IDrugRepository drugRepository,
        IUnitOfWork unitOfWork,
        ILogger<DrugService> logger)
    {
        _drugRepository = drugRepository;
        _unitOfWork = unitOfWork;
        _logger = logger;
    }

    public async Task<PagedResult<DrugDto>> SearchDrugsAsync(DrugSearchRequest request, CancellationToken cancellationToken = default)
    {
        _logger.LogInformation("Searching drugs with criteria: {Request}", request);

        IEnumerable<Drug> drugs;

        if (!string.IsNullOrWhiteSpace(request.Name))
        {
            drugs = await _drugRepository.SearchByNameAsync(request.Name, cancellationToken);
        }
        else if (!string.IsNullOrWhiteSpace(request.Supplier))
        {
            drugs = await _drugRepository.GetBySupplierAsync(request.Supplier, cancellationToken);
        }
        else
        {
            drugs = await _drugRepository.GetAllAsync(cancellationToken);
        }

        if (request.IsExpired.HasValue)
        {
            drugs = request.IsExpired.Value ? drugs.Where(d => d.IsExpired()) : drugs.Where(d => !d.IsExpired());
        }

        if (request.IsLowStock.HasValue && request.IsLowStock.Value)
        {
            drugs = drugs.Where(d => d.IsLowStock());
        }

        var totalCount = drugs.Count();
        var pageItems = drugs
            .OrderBy(d => d.Name)
            .Skip((request.Page - 1) * request.PageSize)
            .Take(request.PageSize)
            .Select(MapToDrugDto)
            .ToList();

        return new PagedResult<DrugDto>
        {
            Items = pageItems,
            TotalCount = totalCount,
            Page = request.Page,
            PageSize = request.PageSize
        };
    }

    public async Task<DrugDto> GetDrugByIdAsync(Guid id, CancellationToken cancellationToken = default)
    {
        _logger.LogInformation("Getting drug with ID: {DrugId}", id);

        var drugId = new DrugId(id);
        var drug = await _drugRepository.GetByIdAsync(drugId, cancellationToken);

        if (drug == null)
            throw new NotFoundException($"Drug with ID {id} not found");

        return MapToDrugDto(drug);
    }

    public async Task<DrugDto> CreateDrugAsync(CreateDrugRequest request, CancellationToken cancellationToken = default)
    {
        _logger.LogInformation("Creating new drug: {DrugName}", request.Name);

        if (!await _drugRepository.IsNameUniqueAsync(request.Name, null, cancellationToken))
        {
            throw new SolveStation.Common.Exceptions.ValidationException($"Drug with name '{request.Name}' already exists");
        }

        var drug = new Drug(
            DrugId.NewId(),
            request.Name,
            request.Description,
            request.Price,
            request.StockQuantity,
            request.MinimumStockLevel,
            request.ExpiryDate,
            request.Supplier,
            request.BatchNumber,
            request.DrugCode
        );

        await _drugRepository.AddAsync(drug, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        _logger.LogInformation("Created drug {DrugId}", drug.Id);
        return MapToDrugDto(drug);
    }

    public async Task<DrugDto> UpdateDrugAsync(Guid id, UpdateDrugRequest request, CancellationToken cancellationToken = default)
    {
        _logger.LogInformation("Updating drug with ID: {DrugId}", id);

        var drugId = new DrugId(id);
        var drug = await _drugRepository.GetByIdAsync(drugId, cancellationToken);

        if (drug == null)
            throw new NotFoundException($"Drug with ID {id} not found");

        var updatedBy = new UserId(Guid.Empty);
        drug.UpdatePrice(request.Price, updatedBy);
        drug.UpdateExpiryDate(request.ExpiryDate);

        await _drugRepository.UpdateAsync(drug, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return MapToDrugDto(drug);
    }

    public async Task<DrugDto> UpdateStockAsync(Guid id, UpdateStockRequest request, CancellationToken cancellationToken = default)
    {
        _logger.LogInformation("Updating stock for drug ID: {DrugId} to {NewQuantity}", id, request.NewQuantity);

        var drugId = new DrugId(id);
        var drug = await _drugRepository.GetByIdAsync(drugId, cancellationToken);

        if (drug == null)
            throw new NotFoundException($"Drug with ID {id} not found");

        var updatedBy = new UserId(Guid.Empty);
        drug.UpdateStock(request.NewQuantity, request.Reason, updatedBy);

        await _drugRepository.UpdateAsync(drug, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return MapToDrugDto(drug);
    }

    public async Task<List<DrugDto>> GetLowStockDrugsAsync(CancellationToken cancellationToken = default)
    {
        _logger.LogInformation("Getting low stock drugs");

        var drugs = await _drugRepository.GetLowStockDrugsAsync(cancellationToken);
        return drugs.Select(MapToDrugDto).ToList();
    }

    public async Task<List<DrugDto>> GetExpiredDrugsAsync(CancellationToken cancellationToken = default)
    {
        _logger.LogInformation("Getting expired drugs");

        var drugs = await _drugRepository.GetExpiredDrugsAsync(cancellationToken);
        return drugs.Select(MapToDrugDto).ToList();
    }

    public async Task<bool> DeleteDrugAsync(Guid id, CancellationToken cancellationToken = default)
    {
        _logger.LogInformation("Deleting drug with ID: {DrugId}", id);

        var drugId = new DrugId(id);
        var drug = await _drugRepository.GetByIdAsync(drugId, cancellationToken);

        if (drug == null)
            return false;

        await _drugRepository.DeleteAsync(drugId, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return true;
    }

    private static DrugDto MapToDrugDto(Drug drug)
    {
        return new DrugDto
        {
            Id = drug.Id.Value,
            Name = drug.Name,
            Description = drug.Description,
            Price = drug.Price,
            StockQuantity = drug.StockQuantity,
            MinimumStockLevel = drug.MinimumStockLevel,
            ExpiryDate = drug.ExpiryDate,
            Supplier = drug.Supplier,
            BatchNumber = drug.BatchNumber,
            DrugCode = drug.DrugCode,
            IsLowStock = drug.IsLowStock(),
            IsExpired = drug.IsExpired(),
            CreatedAt = drug.CreatedAt,
            UpdatedAt = drug.UpdatedAt
        };
    }
}