$ErrorActionPreference = 'Stop'
$projectDirectory = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$releaseDirectory = Join-Path $projectDirectory 'releases'
[System.IO.Directory]::CreateDirectory($releaseDirectory) | Out-Null
$manifest = Get-Content -LiteralPath (Join-Path $projectDirectory 'manifest.json') -Raw | ConvertFrom-Json
$releaseName = 'kk-tachuan-' + $manifest.version
$releasePath = Join-Path $releaseDirectory ($releaseName + '.zip')
Add-Type -AssemblyName System.IO.Compression
$stream = [System.IO.File]::Open($releasePath, [System.IO.FileMode]::Create)
$archive = [System.IO.Compression.ZipArchive]::new($stream, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($relativeName in @('manifest.json', 'background.js', 'core.js', 'panel-adapter.js', 'vendor/canvas-confetti.js', 'vendor/canvas-confetti.LICENSE.txt', 'vendor/README.md', 'celebration.js', 'content.js', 'icons/icon-16.png', 'icons/icon-32.png', 'icons/icon-48.png', 'icons/icon-128.png', 'README.md', 'LICENSE', 'PRIVACY.md', 'CHANGELOG.md', 'docs/compatibility.md', 'docs/compatibility-v13.1.0.jpg')) {
        $sourcePath = Join-Path $projectDirectory $relativeName
        # The store requires manifest.json directly at the ZIP root.
        $entry = $archive.CreateEntry($relativeName, [System.IO.Compression.CompressionLevel]::Optimal)
        $entryStream = $entry.Open()
        $sourceStream = [System.IO.File]::OpenRead($sourcePath)
        try { $sourceStream.CopyTo($entryStream) } finally { $sourceStream.Dispose(); $entryStream.Dispose() }
    }
} finally { $archive.Dispose(); $stream.Dispose() }
Get-Item -LiteralPath $releasePath | Select-Object FullName, Length
$releaseHash = (Get-FileHash -LiteralPath $releasePath -Algorithm SHA256).Hash.ToLowerInvariant()
[System.IO.File]::WriteAllText((Join-Path $releaseDirectory ($releaseName + '.sha256')), "$releaseHash  $releaseName.zip`n", [System.Text.UTF8Encoding]::new($false))
$releaseHash
