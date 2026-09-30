# Monolito Node.js con Nginx y Docker Compose

Implementacion local del laboratorio de balanceo de carga. La solucion usa un monolito Node.js replicado en tres contenedores, Nginx como punto de entrada Round Robin y archivos JSON compartidos para persistencia visible durante la practica.

## Arquitectura

```text
Cliente / navegador / Postman
            |
            v
      Nginx :8080
            |
      Round Robin
       /    |    \
      v     v     v
 backend1 backend2 backend3
  :3000    :3000    :3000
  :8081    :8082    :8083   <- puertos publicados en el equipo
            |
            v
       carpeta local data/
```

`3000` es el puerto interno de Node dentro de cada contenedor. Los puertos que se pueden abrir desde Windows son `8081`, `8082` y `8083`. Las solicitudes normales deben entrar por `http://localhost:8080`, que es Nginx.

## Requisitos

- Docker Desktop iniciado.
- Docker Compose incluido en Docker Desktop.
- Node.js 22 o superior solo si se desea ejecutar el backend directamente sin Docker.
- PowerShell, terminal Bash o Postman para las pruebas.

No se necesitan credenciales de AWS para ejecutar la parte local. El puerto `8080` no requiere permisos administrativos.

## Arranque con Docker

Desde la carpeta `Particiones_Balanceador`:

```powershell
docker compose up -d --build
```

Verificar los servicios:

```powershell
docker compose ps
```

El resultado esperado es:

```text
backend1   healthy
backend2   healthy
backend3   healthy
nginx      Up
```

Abrir la interfaz:

- Login: <http://localhost:8080/login>
- CRUD: <http://localhost:8080/productos>

El acceso de laboratorio es:

```text
Correo: admin@local.test
Clave:  Admin123!
```

## Puertos

| Puerto | Uso |
|---|---|
| `8080` | Entrada principal Nginx y URL recomendada para el cliente |
| `8081` | Acceso directo a backend-1 |
| `8082` | Acceso directo a backend-2 |
| `8083` | Acceso directo a backend-3 |
| `3000` | Puerto interno de Node dentro de cada contenedor |

Los puertos `8081`, `8082` y `8083` sirven para comprobar cada réplica directamente. Si se quiere demostrar el balanceador, se debe usar siempre `8080`.

## Rutas de la interfaz

- `GET /login`: formulario de login y creación de usuarios.
- `GET /productos`: panel protegido del CRUD.
- `GET /styles.css`: estilos separados del HTML.
- `GET /app.js`: navegación y comportamiento de la interfaz.

Después del login, la aplicación navega a `/productos` mediante `history.pushState`. Si se intenta abrir `/productos` sin sesión, la interfaz vuelve a `/login`.

## API

Todas las rutas API se prueban contra Nginx en `http://localhost:8080`.

| Método | Ruta | Autenticación | Función |
|---|---|---|---|
| `GET` | `/health` | No | Estado e instancia del backend |
| `POST` | `/api/auth/login` | No | Iniciar sesión y recibir JWT |
| `POST` | `/api/auth/register` | No | Crear usuario |
| `GET` | `/api/products` | JWT | Consultar productos |
| `POST` | `/api/products` | JWT | Crear producto |
| `PUT` | `/api/products/:id` | JWT | Actualizar producto |
| `DELETE` | `/api/products/:id` | JWT | Eliminar producto |
| `GET` | `/api/audit-log` | JWT | Consultar actividad registrada |

Las operaciones responden con un mensaje y el backend que las atendió. Ejemplo:

```json
{
  "message": "Producto creado correctamente",
  "backend": "backend-2"
}
```

## Crear un usuario

Desde la pantalla `/login`, seleccionar **Crear una cuenta**. También se puede usar PowerShell:

```powershell
$body = @{
    name = "Usuario Demo"
    email = "demo@local.test"
    password = "Demo12345!"
} | ConvertTo-Json

Invoke-RestMethod `
  -Uri "http://localhost:8080/api/auth/register" `
  -Method Post `
  -ContentType "application/json" `
  -Body $body
```

La contraseña debe tener al menos ocho caracteres. Se guarda como hash mediante `bcryptjs`.

## Probar login y CRUD

Login:

```powershell
$loginBody = @{
    email = "admin@local.test"
    password = "Admin123!"
} | ConvertTo-Json

$login = Invoke-RestMethod `
  -Uri "http://localhost:8080/api/auth/login" `
  -Method Post `
  -ContentType "application/json" `
  -Body $loginBody

$headers = @{ Authorization = "Bearer $($login.token)" }
```

Crear producto:

```powershell
$productBody = @{
    name = "Laptop Pro"
    description = "Producto de demostracion"
    price = 2500
} | ConvertTo-Json

Invoke-RestMethod `
  -Uri "http://localhost:8080/api/products" `
  -Method Post `
  -Headers $headers `
  -ContentType "application/json" `
  -Body $productBody
```

Consultar productos:

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:8080/api/products" `
  -Headers $headers
```

## Evidenciar Round Robin

Realizar varias solicitudes al balanceador:

```powershell
1..12 | ForEach-Object {
    (curl.exe -s http://localhost:8080/health | ConvertFrom-Json).backend
}
```

Deben aparecer respuestas de `backend-1`, `backend-2` y `backend-3`. El orden exacto puede variar según las conexiones activas de Nginx.

Para consultar cada réplica directamente:

```powershell
curl.exe http://localhost:8081/health
curl.exe http://localhost:8082/health
curl.exe http://localhost:8083/health
```

Estas tres pruebas no demuestran balanceo; solo confirman que cada backend funciona.

## Simular un fallo

Detener una réplica:

```powershell
docker compose stop backend2
```

Probar Nginx varias veces:

```powershell
1..10 | ForEach-Object {
    (curl.exe -s http://localhost:8080/health | ConvertFrom-Json).backend
}
```

El tráfico debe continuar con `backend-1` y `backend-3`. Restaurar la réplica:

```powershell
docker compose start backend2
```

## Persistencia JSON y auditoría

Las tres réplicas montan la carpeta local `data/` dentro de `/app/data`. Por eso las acciones aparecen en el workspace:

- `data/users.json`: usuarios y hashes de contraseñas.
- `data/products.json`: productos del CRUD.
- `data/audit-log.json`: login, registro y operaciones de productos.

Cada evento de auditoría incluye acción, usuario, backend y fecha. Los datos no se eliminan con `docker compose down`.

Para limpiar manualmente la práctica, editar los tres archivos JSON y conservar un arreglo vacío:

```json
[]
```

## Ejecutar sin Docker

Instalar dependencias:

```powershell
npm install
```

Desarrollo con Nodemon:

```powershell
npm run dev
```

Esta modalidad usa directamente `http://localhost:3000` y ejecuta una sola instancia. No demuestra Round Robin; para eso se debe utilizar Docker Compose y `http://localhost:8080`.

## Detener la solución

```powershell
docker compose down
```

No usar `docker compose down -v` para limpiar los datos, porque la persistencia actual está en la carpeta local `data/`.
