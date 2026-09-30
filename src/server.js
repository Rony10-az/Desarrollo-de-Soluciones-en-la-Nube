const express = require('express');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const port = Number(process.env.PORT || 3000);
const instanceName = process.env.INSTANCE_NAME || 'backend-local';
const jwtSecret = process.env.JWT_SECRET || 'development-secret';
const dataDirectory = path.join(__dirname, '..', 'data');

app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get(['/login', '/productos'], (request, response) => {
    response.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

function dataPath(fileName) {
    return path.join(dataDirectory, fileName);
}

function readData(fileName) {
    return JSON.parse(fs.readFileSync(dataPath(fileName), 'utf8'));
}

function writeData(fileName, value) {
    const target = dataPath(fileName);
    const temporary = `${target}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(value, null, 2));
    fs.renameSync(temporary, target);
}

function ensureDataFile(fileName, defaultValue = []) {
    const target = dataPath(fileName);
    if (!fs.existsSync(target)) writeData(fileName, defaultValue);
}

function nextId(items) {
    return items.reduce((highest, item) => Math.max(highest, item.id), 0) + 1;
}

function recordAudit(action, request, details = {}) {
    const auditLog = readData('audit-log.json');
    auditLog.unshift({
        id: nextId(auditLog),
        action,
        user: request.user?.email || request.body?.email || 'anonymous',
        backend: instanceName,
        timestamp: new Date().toISOString(),
        ...details
    });
    writeData('audit-log.json', auditLog.slice(0, 100));
}

function authenticate(request, response, next) {
    const token = request.headers.authorization?.replace('Bearer ', '');
    if (!token) return response.status(401).json({ error: 'Token requerido' });

    try {
        request.user = jwt.verify(token, jwtSecret);
        next();
    } catch {
        response.status(401).json({ error: 'Token inválido o expirado' });
    }
}

function ensureSeedUser() {
    const users = readData('users.json');
    if (users.length > 0) return;

    users.push({
        id: 1,
        name: 'Administrador',
        email: 'admin@local.test',
        passwordHash: bcrypt.hashSync('Admin123!', 10),
        createdAt: new Date().toISOString()
    });
    writeData('users.json', users);
}

app.get('/health', (request, response) => {
    response.json({ status: 'ok', message: 'Backend disponible', backend: instanceName });
});

app.post('/api/auth/login', (request, response) => {
    const { email, password } = request.body;
    const normalizedEmail = email?.trim().toLowerCase();
    const user = readData('users.json').find((candidate) => candidate.email === normalizedEmail);

    if (!user || !bcrypt.compareSync(password || '', user.passwordHash)) {
        recordAudit('LOGIN_FAILED', request, { success: false });
        return response.status(401).json({ error: 'Credenciales incorrectas', backend: instanceName });
    }

    const token = jwt.sign({ id: user.id, name: user.name, email: user.email }, jwtSecret, { expiresIn: '2h' });
    recordAudit('LOGIN', request, { success: true });
    response.json({ message: 'Login realizado correctamente', token, user: { id: user.id, name: user.name, email: user.email }, backend: instanceName });
});

app.post('/api/auth/register', (request, response) => {
    const { name, email, password } = request.body;
    const normalizedEmail = email?.trim().toLowerCase();
    if (!name?.trim() || !normalizedEmail || !password || password.length < 8) {
        return response.status(400).json({ error: 'Nombre, correo y una contraseña de 8 caracteres son requeridos', backend: instanceName });
    }

    const users = readData('users.json');
    if (users.some((candidate) => candidate.email === normalizedEmail)) {
        return response.status(409).json({ error: 'Ese correo ya está registrado', backend: instanceName });
    }

    const user = { id: nextId(users), name: name.trim(), email: normalizedEmail, passwordHash: bcrypt.hashSync(password, 10), role: 'user', createdAt: new Date().toISOString() };
    users.push(user);
    writeData('users.json', users);
    recordAudit('REGISTER', request, { success: true });
    response.status(201).json({ message: 'Usuario creado correctamente', user: { id: user.id, name: user.name, email: user.email }, backend: instanceName });
});

app.get('/api/products', authenticate, (request, response) => {
    response.json({ message: 'Productos consultados correctamente', data: readData('products.json'), backend: instanceName });
});

app.get('/api/audit-log', authenticate, (request, response) => {
    response.json({ message: 'Actividad consultada correctamente', data: readData('audit-log.json'), backend: instanceName });
});

app.post('/api/products', authenticate, (request, response) => {
    const { name, description = '', price } = request.body;
    const numericPrice = Number(price);
    if (!name?.trim() || !Number.isFinite(numericPrice) || numericPrice < 0) {
        return response.status(400).json({ error: 'Nombre y precio válido son requeridos' });
    }

    const products = readData('products.json');
    const product = { id: nextId(products), name: name.trim(), description: description.trim(), price: numericPrice, createdBy: request.user.email, createdAt: new Date().toISOString() };
    products.push(product);
    writeData('products.json', products);
    recordAudit('PRODUCT_CREATED', request, { productId: product.id, productName: product.name, success: true });
    response.status(201).json({ message: 'Producto creado correctamente', data: product, backend: instanceName });
});

app.put('/api/products/:id', authenticate, (request, response) => {
    const products = readData('products.json');
    const product = products.find((item) => item.id === Number(request.params.id));
    if (!product) return response.status(404).json({ error: 'Producto no encontrado' });

    const { name, description = '', price } = request.body;
    const numericPrice = Number(price);
    if (!name?.trim() || !Number.isFinite(numericPrice) || numericPrice < 0) {
        return response.status(400).json({ error: 'Nombre y precio válido son requeridos' });
    }
    Object.assign(product, { name: name.trim(), description: description.trim(), price: numericPrice, updatedAt: new Date().toISOString() });
    writeData('products.json', products);
    recordAudit('PRODUCT_UPDATED', request, { productId: product.id, productName: product.name, success: true });
    response.json({ message: 'Producto actualizado correctamente', data: product, backend: instanceName });
});

app.delete('/api/products/:id', authenticate, (request, response) => {
    const products = readData('products.json');
    const remaining = products.filter((item) => item.id !== Number(request.params.id));
    if (remaining.length === products.length) return response.status(404).json({ error: 'Producto no encontrado' });
    writeData('products.json', remaining);
    recordAudit('PRODUCT_DELETED', request, { productId: Number(request.params.id), success: true });
    response.json({ message: 'Producto eliminado correctamente', backend: instanceName });
});

ensureDataFile('audit-log.json');
ensureSeedUser();
app.listen(port, () => console.log(`Servidor escuchando en http://localhost:${port} (instancia: ${instanceName})`));