# Kill processes listening on frontend (5174) and backend (5001)
$ports = @(5174, 5001)
foreach ($port in $ports) {
  $conns = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
  foreach ($c in $conns) {
    $procId = $c.OwningProcess
    if ($procId) {
      Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
      Write-Host "Killed PID $procId on port $port"
    }
  }
}
Write-Host "Done. Ports 5174 and 5001 cleared."
