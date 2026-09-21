param([string]$PostgresSource = '.test-tools/pgsql', [int]$Port = 55432)
$ErrorActionPreference = 'Stop'

# Creates only a fresh, ASCII-only temporary cluster. No existing data is removed.
$source = (Resolve-Path -LiteralPath $PostgresSource).Path
$testRoot = Join-Path ([System.IO.Path]::GetTempPath()) ('pdv-postgres-tests-' + [guid]::NewGuid().ToString('N'))
if ($testRoot -match '[^\x00-\x7F]') { throw 'Use um diretório TEMP sem acentos para o PostgreSQL portátil.' }
$probe = [System.Net.Sockets.TcpClient]::new()
try {
    $connected = $probe.ConnectAsync('127.0.0.1', $Port)
    try { $connected.Wait(1000) | Out-Null } catch { }
    if ($probe.Connected) { throw "Porta $Port ocupada; nenhum servidor existente será usado ou encerrado." }
} finally { $probe.Dispose() }
New-Item -ItemType Directory -Path $testRoot | Out-Null
foreach ($part in @('bin', 'lib', 'share')) {
    Copy-Item -LiteralPath (Join-Path $source $part) -Destination $testRoot -Recurse
}
& "$testRoot/bin/initdb.exe" -D "$testRoot/data" -U postgres --auth=trust --encoding=UTF8 --locale=C
if ($LASTEXITCODE -ne 0) { throw "Falha ao inicializar cluster sintético: $testRoot" }
$ctl = Start-Process -FilePath "$testRoot/bin/pg_ctl.exe" -ArgumentList @(
    '-D', "$testRoot/data", '-l', "$testRoot/server.log", '-o', "`"-h 127.0.0.1 -p $Port`"", '-w', 'start'
) -WindowStyle Hidden -PassThru
if (-not $ctl.WaitForExit(30000)) { throw "Timeout ao iniciar cluster; consulte $testRoot/server.log" }
if ($ctl.ExitCode -ne 0) { throw "Falha de inicialização; consulte $testRoot/server.log" }
& "$testRoot/bin/createdb.exe" -h 127.0.0.1 -p $Port -U postgres pdv_test
if ($LASTEXITCODE -ne 0) { throw 'Falha ao criar banco sintético.' }
Write-Output "Cluster: $testRoot"
Write-Output "TEST_DATABASE_URL=postgresql+psycopg2://postgres@127.0.0.1:$Port/pdv_test"
Write-Output "Para encerrar somente este cluster: & '$testRoot/bin/pg_ctl.exe' -D '$testRoot/data' -m fast -w stop"
