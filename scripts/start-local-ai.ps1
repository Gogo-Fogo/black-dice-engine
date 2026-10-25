param(
  [Parameter(Mandatory=$true)][string]$ComfyRoot,
  [Parameter(Mandatory=$true)][string]$OllamaExe,
  [Parameter(Mandatory=$true)][string]$OllamaModels
)
$ErrorActionPreference='Stop'
$taskRoot=Split-Path -Parent $PSScriptRoot
$taskOutput=Join-Path $taskRoot '_data\generated'
$taskInput=Join-Path $taskRoot '_data\local-ai-inputs'
$taskLogs=Join-Path $taskRoot '_data\local-ai-logs'
foreach($taskPath in @($taskOutput,$taskInput,$taskLogs)){New-Item -ItemType Directory -Force -Path $taskPath | Out-Null}
foreach($taskPath in @((Join-Path $ComfyRoot 'python_embeded\python.exe'),(Join-Path $ComfyRoot 'ComfyUI\main.py'),$OllamaExe,$OllamaModels)){if(!(Test-Path -LiteralPath $taskPath)){throw "Required existing path missing: $taskPath"}}
function Test-LocalPort([int]$Port){
  $taskClient=New-Object System.Net.Sockets.TcpClient
  try{$taskClient.Connect('127.0.0.1',$Port);return $true}catch{return $false}finally{$taskClient.Dispose()}
}
if(Test-LocalPort 8188){Write-Output 'Port 8188 is already in use; leaving its owner unchanged. Verify ComfyUI output directory matches _data/generated.'}
else{
  $taskArgs=@('-s','ComfyUI\main.py','--windows-standalone-build','--listen','127.0.0.1','--port','8188','--disable-all-custom-nodes','--output-directory',('"'+$taskOutput+'"'),'--input-directory',('"'+$taskInput+'"'))
  $taskProcess=Start-Process -FilePath (Join-Path $ComfyRoot 'python_embeded\python.exe') -ArgumentList $taskArgs -WorkingDirectory $ComfyRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $taskLogs 'comfy.stdout.log') -RedirectStandardError (Join-Path $taskLogs 'comfy.stderr.log') -PassThru
  Write-Output "ComfyUI started with PID $($taskProcess.Id); startup readiness is pending."
}
if(Test-LocalPort 11434){Write-Output 'Port 11434 is already in use; leaving its owner unchanged. Verify Ollama version and installed models.'}
else{
  $env:OLLAMA_MODELS=(Resolve-Path -LiteralPath $OllamaModels).Path
  $env:OLLAMA_HOST='127.0.0.1:11434'
  $env:OLLAMA_NO_CLOUD='1'
  $taskProcess=Start-Process -FilePath (Resolve-Path -LiteralPath $OllamaExe).Path -ArgumentList 'serve' -WindowStyle Hidden -RedirectStandardOutput (Join-Path $taskLogs 'ollama.stdout.log') -RedirectStandardError (Join-Path $taskLogs 'ollama.stderr.log') -PassThru
  Write-Output "Ollama started with PID $($taskProcess.Id); startup readiness is pending."
}
