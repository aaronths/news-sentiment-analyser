[CmdletBinding()]
param()

# Use this in cmd to run script.

# cd services/data-retrieval
# powershell -NoProfile -ExecutionPolicy Bypass -File .\run-charts.ps1

$ServiceRoot = (Resolve-Path $PSScriptRoot).Path
$OutputDir = Join-Path $ServiceRoot "chart-output"

# Edit this block before running.
$Keyword = "trump"
$Year = (Get-Date).Year
$Timeframe = "30d"
$SourceLimit = 6
$Width = 1600
$Height = 900
$OpenImages = $false

# Data source selection.
# "local" uses the JSON file below.
# "s3" uses the configured bucket and key below.
$DataSourceMode = "s3"
$InputPath = "../../data/clean-articles.json"
$S3Bucket = "news-sentiment-analyzer-data-v1"
$S3CleanKey = "clean/clean-articles.json"
$S3Region = "us-east-1"

# API export mode.
# When $true, this script starts its own retrieval API process so the endpoint
# exports always use the same data source as the script charts.
$UseManagedApiProcess = $true
$ApiPort = 8010
$ApiBaseUrl = if ($UseManagedApiProcess) { "http://localhost:$ApiPort/api" } else { "http://localhost:8001/api" }

# Toggle chart groups on or off.
$RunScriptCharts = $true
$RunSentimentTrendJson = $true
$RunSourcesCompareJson = $true
$RunMonthlyMentionsJson = $true
$RunMonthlyMentionsPng = $true

function Assert-LastExitCode {
  param(
    [Parameter(Mandatory = $true)]
    [string]$StepName
  )

  if ($LASTEXITCODE -ne 0) {
    throw "$StepName failed with exit code $LASTEXITCODE."
  }
}

function Resolve-LocalInputPath {
  $resolved = Resolve-Path (Join-Path $ServiceRoot $InputPath) -ErrorAction SilentlyContinue
  if (-not $resolved) {
    throw "Local input file not found: $InputPath"
  }

  return $resolved.Path
}

function Invoke-Build {
  & npm run build --silent
  Assert-LastExitCode -StepName "npm run build"
}

function Get-DataSourceEnvironment {
  $mode = ([string]$DataSourceMode).Trim().ToLowerInvariant()

  switch ($mode) {
    "local" {
      return @{
        NEWS_DATA_LOCAL_CLEAN_PATH = (Resolve-LocalInputPath)
        NEWS_DATA_BUCKET = $null
        NEWS_DATA_CLEAN_KEY = $null
        AWS_REGION = $null
      }
    }
    "s3" {
      if ([string]::IsNullOrWhiteSpace($S3Bucket)) {
        throw "S3Bucket must be set when DataSourceMode is 's3'."
      }
      if ([string]::IsNullOrWhiteSpace($S3Region)) {
        throw "S3Region must be set when DataSourceMode is 's3'."
      }

      return @{
        NEWS_DATA_LOCAL_CLEAN_PATH = $null
        NEWS_DATA_BUCKET = $S3Bucket
        NEWS_DATA_CLEAN_KEY = $(if ([string]::IsNullOrWhiteSpace($S3CleanKey)) { "clean/clean-articles.json" } else { $S3CleanKey })
        AWS_REGION = $S3Region
      }
    }
    default {
      throw "DataSourceMode must be 'local' or 's3'. Current value: $DataSourceMode"
    }
  }
}

function Save-EnvironmentValues {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Keys
  )

  $saved = @{}
  foreach ($key in $Keys) {
    if (Test-Path "Env:$key") {
      $saved[$key] = (Get-Item "Env:$key").Value
    }
    else {
      $saved[$key] = $null
    }
  }

  return $saved
}

function Set-EnvironmentValues {
  param(
    [Parameter(Mandatory = $true)]
    [hashtable]$Values
  )

  foreach ($entry in $Values.GetEnumerator()) {
    $key = [string]$entry.Key
    $value = $entry.Value

    if ($null -eq $value -or ([string]$value).Length -eq 0) {
      Remove-Item "Env:$key" -ErrorAction SilentlyContinue
      continue
    }

    Set-Item "Env:$key" -Value ([string]$value)
  }
}

function Restore-EnvironmentValues {
  param(
    [Parameter(Mandatory = $true)]
    [hashtable]$Values
  )

  Set-EnvironmentValues -Values $Values
}

function Get-HealthUrl {
  param(
    [Parameter(Mandatory = $true)]
    [string]$BaseUrl
  )

  return (($BaseUrl -replace "/api/?$", "") + "/health")
}

function Ensure-ApiAvailable {
  param(
    [Parameter(Mandatory = $true)]
    [string]$BaseUrl
  )

  $healthUrl = Get-HealthUrl -BaseUrl $BaseUrl

  try {
    Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 5 | Out-Null
  }
  catch {
    throw "Retrieval API is not running at $BaseUrl. Start it with: cd services/data-retrieval; `$env:PORT=8001; npm run dev"
  }
}

function Save-JsonFromApi {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RelativePath,
    [Parameter(Mandatory = $true)]
    [string]$FilePath,
    [Parameter(Mandatory = $true)]
    [string]$BaseUrl
  )

  $response = Invoke-RestMethod -Uri "$BaseUrl/$RelativePath" -Method Get
  $response | ConvertTo-Json -Depth 20 | Set-Content -Path $FilePath -Encoding UTF8
}

function Start-ManagedApiProcess {
  param(
    [Parameter(Mandatory = $true)]
    [hashtable]$DataEnvironment
  )

  $stdoutPath = Join-Path $OutputDir "managed-api.stdout.log"
  $stderrPath = Join-Path $OutputDir "managed-api.stderr.log"
  Remove-Item $stdoutPath, $stderrPath -Force -ErrorAction SilentlyContinue

  $processEnvironment = @{}
  foreach ($entry in $DataEnvironment.GetEnumerator()) {
    $processEnvironment[$entry.Key] = $entry.Value
  }
  $processEnvironment["PORT"] = [string]$ApiPort
  $processEnvironment["RUNTIME_CACHE_TTL_SECONDS"] = "0"

  $savedEnvironment = Save-EnvironmentValues -Keys @($processEnvironment.Keys)

  try {
    Set-EnvironmentValues -Values $processEnvironment
    $process = Start-Process -FilePath "node" -ArgumentList "dist/src/main.js" -WorkingDirectory $ServiceRoot -PassThru -WindowStyle Hidden -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath
  }
  finally {
    Restore-EnvironmentValues -Values $savedEnvironment
  }

  return @{
    Process = $process
    StdoutPath = $stdoutPath
    StderrPath = $stderrPath
  }
}

function Wait-ForManagedApi {
  param(
    [Parameter(Mandatory = $true)]
    [System.Diagnostics.Process]$Process,
    [Parameter(Mandatory = $true)]
    [string]$BaseUrl,
    [Parameter(Mandatory = $true)]
    [string]$StderrPath
  )

  $healthUrl = Get-HealthUrl -BaseUrl $BaseUrl
  $deadline = (Get-Date).AddSeconds(15)

  while ((Get-Date) -lt $deadline) {
    try {
      Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 2 | Out-Null
      return
    }
    catch {
      if ($Process.HasExited) {
        $stderr = if (Test-Path $StderrPath) { Get-Content $StderrPath -Raw } else { "" }
        throw "Managed retrieval API exited before becoming healthy. $stderr".Trim()
      }

      Start-Sleep -Milliseconds 500
    }
  }

  $stderr = if (Test-Path $StderrPath) { Get-Content $StderrPath -Raw } else { "" }
  throw "Timed out waiting for retrieval API at $healthUrl. $stderr".Trim()
}

function Invoke-ScriptCharts {
  param(
    [Parameter(Mandatory = $true)]
    [hashtable]$DataEnvironment
  )

  $savedEnvironment = Save-EnvironmentValues -Keys @($DataEnvironment.Keys)

  try {
    Set-EnvironmentValues -Values $DataEnvironment

    $scriptArgs = @("dist/src/scripts/generate-charts.js", $Keyword)
    if ($DataSourceMode.Trim().ToLowerInvariant() -eq "local") {
      $scriptArgs += @("--input", $InputPath)
    }
    if ($OpenImages) {
      $scriptArgs += "--open"
    }

    & node @scriptArgs
    Assert-LastExitCode -StepName "generate-charts.js"
  }
  finally {
    Restore-EnvironmentValues -Values $savedEnvironment
  }
}

Push-Location $ServiceRoot

try {
  New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

  # Match the UTC date format used by generate-charts.ts so filenames stay aligned.
  $DateStamp = [DateTime]::UtcNow.ToString("yyyy-MM-dd")
  $NeedsApi = $RunSentimentTrendJson -or $RunSourcesCompareJson -or $RunMonthlyMentionsJson -or $RunMonthlyMentionsPng
  $DataEnvironment = Get-DataSourceEnvironment
  $managedApi = $null

  if ($RunScriptCharts -or ($NeedsApi -and $UseManagedApiProcess)) {
    Invoke-Build
  }

  if ($RunScriptCharts) {
    Invoke-ScriptCharts -DataEnvironment $DataEnvironment
  }

  if ($NeedsApi) {
    if ($UseManagedApiProcess) {
      $managedApi = Start-ManagedApiProcess -DataEnvironment $DataEnvironment
      Wait-ForManagedApi -Process $managedApi.Process -BaseUrl $ApiBaseUrl -StderrPath $managedApi.StderrPath
    }
    else {
      Ensure-ApiAvailable -BaseUrl $ApiBaseUrl
    }

    if ($RunSentimentTrendJson) {
      Save-JsonFromApi -RelativePath "chart/sentiment/trend?keyword=$Keyword&timeframe=$Timeframe" -FilePath (Join-Path $OutputDir "$DateStamp-$Keyword-chart-sentiment-trend.json") -BaseUrl $ApiBaseUrl
    }

    if ($RunSourcesCompareJson) {
      Save-JsonFromApi -RelativePath "chart/sources/compare?keyword=$Keyword&timeframe=$Timeframe" -FilePath (Join-Path $OutputDir "$DateStamp-$Keyword-chart-sources-compare.json") -BaseUrl $ApiBaseUrl
    }

    if ($RunMonthlyMentionsJson) {
      Save-JsonFromApi -RelativePath "chart/mentions/monthly?keyword=$Keyword&year=$Year&sourceLimit=$SourceLimit" -FilePath (Join-Path $OutputDir "$DateStamp-$Keyword-chart-mentions-monthly.json") -BaseUrl $ApiBaseUrl
    }

    if ($RunMonthlyMentionsPng) {
      Invoke-WebRequest -Uri "$ApiBaseUrl/chart/mentions/monthly.png?keyword=$Keyword&year=$Year&sourceLimit=$SourceLimit&width=$Width&height=$Height" -OutFile (Join-Path $OutputDir "$DateStamp-$Keyword-chart-mentions-monthly.png")
    }
  }

  Get-ChildItem $OutputDir |
    Where-Object { $_.Name -like "$DateStamp-$Keyword-*" } |
    Sort-Object Name |
    Select-Object Name, Length, LastWriteTime
}
finally {
  if ($managedApi -and $managedApi.Process -and -not $managedApi.Process.HasExited) {
    Stop-Process -Id $managedApi.Process.Id -Force
  }
  Pop-Location
}