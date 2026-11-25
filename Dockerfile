FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /app

COPY src/ ./src/
RUN dotnet restore ./src/SolveStation.PharmacyApi/SolveStation.PharmacyApi.csproj
RUN dotnet publish ./src/SolveStation.PharmacyApi/SolveStation.PharmacyApi.csproj -c Release -o /app/publish --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app
COPY --from=build /app/publish .

EXPOSE 10000
ENTRYPOINT ["sh", "-c", "dotnet SolveStation.PharmacyApi.dll --urls http://0.0.0.0:${PORT:-10000}"]