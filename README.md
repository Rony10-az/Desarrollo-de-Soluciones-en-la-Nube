# Monolito Node.js con balanceo de carga (Local + AWS)

Laboratorio de balanceo de carga implementado en dos variantes sobre el mismo monolito Node.js:

- **Parte A — Local:** 3 contenedores Docker replicados, balanceados con Nginx (Round Robin).
- **Parte B — AWS:** 2 instancias EC2 con el mismo contenedor, balanceadas con un Application Load Balancer (ALB).

## Índice

- [Parte A — Local con Docker Compose y Nginx](#parte-a--local-con-docker-compose-y-nginx)
  - [Arquitectura](#arquitectura)
  - [Requisitos](#requisitos)
  - [Arranque con Docker](#arranque-con-docker)
  - [Puertos](#puertos)
  - [Rutas de la interfaz](#rutas-de-la-interfaz)
  - [API](#api)
  - [Crear un usuario](#crear-un-usuario)
  - [Probar login y CRUD](#probar-login-y-crud)
  - [Evidenciar Round Robin](#evidenciar-round-robin)
  - [Simular un fallo](#simular-un-fallo)
  - [Persistencia JSON y auditoría](#persistencia-json-y-auditoría)
  - [Ejecutar sin Docker](#ejecutar-sin-docker)
  - [Detener la solución](#detener-la-solución)
- [Parte B — Despliegue en AWS (Application Load Balancer)](#parte-b--despliegue-en-aws-application-load-balancer)
  - [Arquitectura desplegada](#arquitectura-desplegada)
  - [Recursos creados](#recursos-creados)
  - [Publicar la imagen en Docker Hub](#publicar-la-imagen-en-docker-hub)
  - [Probar el balanceo](#probar-el-balanceo)
  - [Prueba de tolerancia a fallos](#prueba-de-tolerancia-a-fallos)
  - [Evidencias para el entregable](#evidencias-para-el-entregable-capturas-a-incluir)
  - [Problemas encontrados y solución](#problemas-encontrados-y-solución-bitácora)
  - [Notas y limitaciones conocidas](#notas-y-limitaciones-conocidas)
  - [Limpieza de recursos](#limpieza-de-recursos-aws)

---

# Parte A — Local con Docker Compose y Nginx

Implementación local del laboratorio de balanceo de carga. La solución usa un monolito Node.js replicado en tres contenedores, Nginx como punto de entrada Round Robin y archivos JSON compartidos para persistencia visible durante la práctica.

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

---

# Parte B — Despliegue en AWS (Application Load Balancer)

Implementación en la nube del mismo monolito, usando 2 instancias EC2 detrás de un Application Load Balancer, siguiendo el diagrama de referencia del laboratorio.

## Arquitectura desplegada

```text
Internet
    |
    v
alb-lab-web (ALB, puerto 80)
Security Group: Seguridad-alb (80 desde 0.0.0.0/0)
    |
    v  forward a tg-lab-web (HTTP:3000, health check /health)
    |
   / \
  v   v
web-server-1          web-server-2
us-east-2a            us-east-2b
t3.micro               t3.micro
Docker: rony10az/monolito-balanceador:1.0
Security Group: seguridad_web
  - 3000 solo desde Seguridad-alb
  - SSH 22 desde Mi IP (no usado; se accedió por Session Manager)
```

**VPC:** `laboratorio-vpc` (`10.0.0.0/16`), 2 subredes públicas en `us-east-2a` y `us-east-2b`, con Internet Gateway y tabla de rutas pública.

**Imagen Docker:** [`rony10az/monolito-balanceador:1.0`](https://hub.docker.com/r/rony10az/monolito-balanceador), publicada en Docker Hub a partir del mismo `Dockerfile` usado en la Parte A.

**Acceso administrativo a las instancias:** AWS Systems Manager Session Manager, con el rol IAM `ROL-SSM-EC2` (política `AmazonSSMManagedInstanceCore`) asignado a ambas EC2. Se usó en vez de SSH / EC2 Instance Connect porque la red local bloqueaba las conexiones salientes a los puertos 22 y 3000; Session Manager funciona sobre HTTPS (443).

## Recursos creados

| Recurso | Nombre | Detalle |
|---|---|---|
| VPC | `laboratorio-vpc` | CIDR `10.0.0.0/16`, 2 AZ (`us-east-2a`, `us-east-2b`) |
| Security Group | `Seguridad-alb` | Entrada HTTP 80 desde `0.0.0.0/0` |
| Security Group | `seguridad_web` | Entrada TCP 3000 desde `Seguridad-alb`; SSH 22 desde Mi IP |
| Instancia EC2 | `web-server-1` | `t3.micro`, `us-east-2a`, contenedor Docker en :3000 |
| Instancia EC2 | `web-server-2` | `t3.micro`, `us-east-2b`, contenedor Docker en :3000 |
| Target Group | `tg-lab-web` | HTTP:3000, health check en `/health`, umbral 2/2, intervalo 30s |
| Application Load Balancer | `alb-lab-web` | Internet-facing, listener HTTP:80 → `tg-lab-web` |
| Rol IAM | `ROL-SSM-EC2` | Política `AmazonSSMManagedInstanceCore`, acceso vía Session Manager |

## Publicar la imagen en Docker Hub

Desde la carpeta `Particiones_Balanceador`, con Docker Desktop iniciado:

```powershell
docker login
docker build -t rony10az/monolito-balanceador:1.0 .
docker push rony10az/monolito-balanceador:1.0
```

> El nombre de usuario y del repositorio deben ir siempre en **minúsculas** (Docker Hub rechaza mayúsculas con el error `invalid reference format`).

## Correr el contenedor dentro de cada instancia EC2

Instaladas vía User Data (Amazon Linux 2023) o manualmente si el User Data falló:

```bash
sudo dnf install -y docker
sudo systemctl enable --now docker

sudo docker rm -f app 2>/dev/null
sudo docker pull rony10az/monolito-balanceador:1.0
sudo docker run -d --restart always --name app \
  -p 3000:3000 \
  -e PORT=3000 \
  -e INSTANCE_NAME=web-server-1 \
  -e JWT_SECRET=lab-balanceador-2026 \
  rony10az/monolito-balanceador:1.0
```

En `web-server-2` se repite el mismo comando cambiando `INSTANCE_NAME=web-server-2`. **El `JWT_SECRET` debe ser idéntico en ambas instancias**, de lo contrario un token emitido por una no es válido en la otra.

Verificación dentro de cada instancia:

```bash
sudo docker ps
curl -v http://localhost:3000/health
```

## Probar el balanceo

> Reemplaza la URL por el DNS real de tu ALB (**EC2 → Load Balancers → `alb-lab-web`**).

```powershell
curl http://alb-lab-web-850448343.us-east-2.elb.amazonaws.com/health
```

Respuesta esperada:

```json
{"status":"ok","message":"Backend disponible","backend":"web-server-1"}
```

Para evidenciar Round Robin entre las dos instancias:

```powershell
1..10 | % { curl -s http://alb-lab-web-850448343.us-east-2.elb.amazonaws.com/health }
```

Debe alternar entre `web-server-1` y `web-server-2`.

Para ver la interfaz completa en el navegador, abrir directamente (sin `/health`):

```text
http://alb-lab-web-850448343.us-east-2.elb.amazonaws.com/
```

> El ALB solo tiene listener **HTTP** (puerto 80), sin certificado SSL. Si el navegador fuerza `https://` automáticamente (ver [Problemas encontrados](#problemas-encontrados-y-solución-bitácora)), la conexión da timeout.

## Prueba de tolerancia a fallos

1. Detener `web-server-1` desde la consola EC2 (**Instance state → Stop instance**).
2. Esperar ~1 minuto y repetir el comando de balanceo: todas las respuestas deben venir de `web-server-2`.
3. En el Target Group (`tg-lab-web` → Destinos), `web-server-1` debe figurar como `unhealthy`.
4. Reiniciar `web-server-1` y confirmar que vuelve a `healthy` y el tráfico vuelve a alternar.

## Evidencias para el entregable (capturas a incluir)

Listado de capturas mínimas que respaldan cada parte del despliegue. Tomarlas **antes** de la limpieza de recursos, porque después ya no se pueden volver a generar.

1. **VPC** — Mapa de recursos de `laboratorio-vpc` mostrando las 2 subredes, tabla de rutas e Internet Gateway.
2. **Security Groups** — Reglas de entrada de `Seguridad-alb` (HTTP 80 público) y de `seguridad_web` (3000 solo desde `Seguridad-alb`, SSH desde Mi IP).
3. **Instancias EC2** — Listado de `web-server-1` y `web-server-2` con estado "En ejecución", tipo `t3.micro`, IP pública y zona de disponibilidad.
4. **Dentro de cada instancia** — Salida de `sudo docker ps` mostrando el contenedor `app` corriendo, y `curl -v http://localhost:3000/health` con respuesta `200 OK`.
5. **Target Group** — Pestaña "Destinos" de `tg-lab-web` con ambas instancias en estado **`healthy`**.
6. **Load Balancer** — Detalles de `alb-lab-web` con estado **Active**, DNS name visible, y el listener HTTP:80 → `tg-lab-web`.
7. **Prueba de balanceo** — Terminal con la salida del comando `1..10 | % { curl -s http://DNS-DEL-ALB/health }` mostrando respuestas alternadas de `web-server-1` y `web-server-2`.
8. **Navegador** — Captura de `http://DNS-DEL-ALB/` mostrando la pantalla de login servida desde AWS.
9. **Prueba de tolerancia a fallos** — Tres capturas: (a) Target Group con `web-server-1` en `unhealthy` tras detenerla, (b) terminal mostrando que todas las respuestas vienen de `web-server-2`, (c) Target Group de vuelta con ambas en `healthy` tras reiniciar `web-server-1`.
10. **Docker Hub** (opcional) — Página del repositorio `rony10az/monolito-balanceador` con el tag `1.0` publicado.

## Problemas encontrados y solución (bitácora)

Documentado como evidencia de troubleshooting real durante el despliegue — útil para justificar decisiones no contempladas en el lab original.

| # | Problema | Causa | Solución |
|---|---|---|---|
| 1 | `EC2 Instance Connect`: *"Error establishing SSH connection"* | La regla de entrada SSH (22) en `seguridad_web` tenía una IP de origen desactualizada (IP pública dinámica del cliente). | Editar la regla y volver a seleccionar "Mi IP" para refrescar el valor. |
| 2 | `curl` directo a `IP:3000/health` fallaba con timeout aun con el Security Group correcto | La red local (institucional) bloquea conexiones salientes a puertos no estándar como 22 y 3000. | Se descartó la prueba directa por IP/puerto 3000 y se validó todo a través del ALB en el puerto 80, que sí está permitido. |
| 3 | Instancias lanzadas como `t8i.small` (fuera de Free Tier) | Tipo de instancia por defecto en el asistente de lanzamiento. | Detener la instancia → **Actions → Instance settings → Change instance type** → `t3.micro` → iniciar de nuevo. |
| 4 | Al reiniciar tras el cambio de tipo, Status checks en `0/2` | Comportamiento normal tras un (re)inicio; toma 2-3 minutos en completarse. | Esperar y refrescar la consola. |
| 5 | `docker push` fallaba con `invalid reference format: repository name must be lowercase` | Se usó un nombre de repositorio con mayúsculas. | Renombrar la imagen en minúsculas (`rony10az/monolito-balanceador:1.0`) y repetir `build`/`push`. |
| 6 | Target Group mostraba ambas instancias `unhealthy`, ALB respondía `502 Bad Gateway` | El contenedor corría con una imagen construida antes de corregir el nombre del repositorio, o nunca llegó a descargarse. | Entrar a cada instancia y recrear el contenedor (`docker rm -f app` + `docker pull` + `docker run`) con la imagen correcta ya publicada en Docker Hub. |
| 7 | `web-server-2` no aparecía en **Systems Manager → Fleet Manager** | El rol IAM `ROL-SSM-EC2` se asignó con la instancia ya en ejecución; el agente SSM no refrescó credenciales solo. | **Instance state → Reboot instance** para forzar al agente a releer el rol. |
| 8 | Dentro de `web-server-2`, `docker: command not found` | El User Data de esa instancia no llegó a instalar Docker (fallo silencioso en el primer arranque). | Instalar manualmente: `sudo dnf install -y docker && sudo systemctl enable --now docker`. |
| 9 | Navegador (Brave) con `ERR_CONNECTION_TIMED_OUT` al abrir el DNS del ALB, aunque `curl` por PowerShell sí funcionaba | El navegador forzaba `https://` automáticamente (HTTPS-upgrade), intentando el puerto 443, que no tiene listener ni regla abierta en el ALB. | Desactivar "Always use secure connections" en la configuración de privacidad del navegador, o escribir explícitamente `http://` y evitar la redirección automática. |

## Notas y limitaciones conocidas

- **Persistencia no compartida:** a diferencia de la Parte A (Docker Compose con volumen `./data` compartido), cada instancia EC2 tiene su propio disco. Un usuario o producto creado a través de `web-server-1` no aparece en `web-server-2`. Con Round Robin esto genera datos inconsistentes entre instancias — limitación esperada para este laboratorio; la solución real requeriría mover la persistencia a un almacenamiento compartido (RDS, DynamoDB o EFS), fuera del alcance de esta práctica.
- **Sin HTTPS:** el ALB solo expone el listener HTTP:80. Agregar HTTPS requeriría un certificado en AWS Certificate Manager y un dominio propio, fuera del alcance de este lab.
- **Acceso administrativo:** se usó Session Manager en vez de SSH porque la red local bloqueaba conexiones salientes a los puertos 22 y 3000 (típico en redes institucionales). Session Manager usa HTTPS (443) y no requiere abrir el puerto 22 a Internet.

## Limpieza de recursos AWS

Para evitar cobros, eliminar **en este orden**:

1. Application Load Balancer (`alb-lab-web`).
2. Target Group (`tg-lab-web`).
3. Terminar las instancias EC2 (`web-server-1`, `web-server-2`).
4. Rol IAM `ROL-SSM-EC2` (opcional, si no se reutiliza).
5. VPC `laboratorio-vpc` (arrastra Internet Gateway, subredes y tablas de ruta).
