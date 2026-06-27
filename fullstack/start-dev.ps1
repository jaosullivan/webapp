$py = "C:\Users\johna\AppData\Local\Programs\Python\Python314\python.exe"
$root = "C:\MSDE\Webapp\fullstack"
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH

# Start Podman containers (PostgreSQL + Redis)
podman start fullstack-postgres fullstack-redis

Start-Sleep -Seconds 3

# Backend services (each in its own terminal)
Start-Process "pwsh.exe" -ArgumentList "-NoExit", "-Command", "Set-Location '$root\services\users'; & '$py' -m uvicorn app.main:app --reload --port 8001"
Start-Process "pwsh.exe" -ArgumentList "-NoExit", "-Command", "Set-Location '$root\services\orders'; & '$py' -m uvicorn app.main:app --reload --port 8002"
Start-Process "pwsh.exe" -ArgumentList "-NoExit", "-Command", "Set-Location '$root\services\payments'; & '$py' -m uvicorn app.main:app --reload --port 8003"

# Frontend
Start-Process "pwsh.exe" -ArgumentList "-NoExit", "-Command", "`$env:PATH = 'C:\Program Files\nodejs;' + `$env:PATH; Set-Location '$root\frontend'; npm run dev"

Write-Host "Starting all services... open http://localhost:3000 in a few seconds"
