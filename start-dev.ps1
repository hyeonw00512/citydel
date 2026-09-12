$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$nodeExecutable = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
$serverRunner = Join-Path $projectRoot "server\node_modules\tsx\dist\cli.mjs"
$clientRunner = Join-Path $projectRoot "client\node_modules\vite\bin\vite.js"

if (-not (Test-Path -LiteralPath $nodeExecutable)) {
  throw "Codex 내장 Node.js를 찾을 수 없습니다. Node.js LTS를 설치한 뒤 npm run dev를 실행해 주세요."
}

if (-not (Test-Path -LiteralPath $serverRunner) -or -not (Test-Path -LiteralPath $clientRunner)) {
  throw "의존성이 설치되지 않았습니다. 먼저 pnpm install을 실행해 주세요."
}

$serverJob = Start-Job -ArgumentList $nodeExecutable, $serverRunner, $projectRoot -ScriptBlock {
  param($node, $runner, $root)
  Set-Location -LiteralPath $root
  & $node $runner watch "server/src/index.ts"
}

$clientJob = Start-Job -ArgumentList $nodeExecutable, $clientRunner, $projectRoot -ScriptBlock {
  param($node, $runner, $root)
  Set-Location -LiteralPath $root
  & $node $runner --host "0.0.0.0" --config "client/vite.config.ts" "client"
}

$jobs = @($serverJob, $clientJob)
Write-Host "게임 실행 중: http://localhost:5173" -ForegroundColor Cyan
Write-Host "종료하려면 Ctrl+C를 누르세요." -ForegroundColor DarkGray

try {
  $jobs | Receive-Job -Wait
}
finally {
  $jobs | Stop-Job -ErrorAction SilentlyContinue
  $jobs | Remove-Job -Force -ErrorAction SilentlyContinue
}
