let token = '';
let editingId = null;
const currency = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' });
const elements = {
    loginView: document.querySelector('#login-view'),
    productsView: document.querySelector('#products-view'),
    loginForm: document.querySelector('#login-form'),
    registerForm: document.querySelector('#register-form'),
    showRegister: document.querySelector('#show-register'),
    authPrompt: document.querySelector('#auth-prompt'),
    loginError: document.querySelector('#login-error'),
    registerError: document.querySelector('#register-error'),
    productForm: document.querySelector('#product-form'),
    productError: document.querySelector('#product-error'),
    productList: document.querySelector('#product-list'),
    auditList: document.querySelector('#audit-list'),
    status: document.querySelector('#status'),
    identity: document.querySelector('#identity'),
    catalogSummary: document.querySelector('#catalog-summary'),
    formTitle: document.querySelector('#form-title'),
    saveButton: document.querySelector('#save-button'),
    cancelButton: document.querySelector('#cancel-button')
};

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

function setStatus(message, backend) {
    elements.status.innerHTML = `<strong>${escapeHtml(message)}</strong> <span>Servidor: ${escapeHtml(backend || 'no identificado')}</span>`;
}

async function request(url, options = {}) {
    const response = await fetch(url, {
        ...options,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options.headers || {}) }
    });
    const result = response.status === 204 ? null : await response.json();
    if (!response.ok) throw new Error(result?.error || 'No se pudo completar la operacion');
    return result;
}

function resetProductForm() {
    editingId = null;
    elements.productForm.reset();
    elements.formTitle.textContent = 'Nuevo producto';
    elements.saveButton.textContent = 'Crear';
    elements.cancelButton.classList.add('hidden');
}

function renderProducts(products) {
    elements.catalogSummary.textContent = `${products.length} producto${products.length === 1 ? '' : 's'} registrados`;
    elements.productList.innerHTML = products.length ? products.map((product) => `<tr><td><strong>${escapeHtml(product.name)}</strong></td><td>${escapeHtml(product.description)}</td><td class="price">${currency.format(product.price)}</td><td>${escapeHtml(product.createdBy || 'Administrador')}</td><td><div class="actions"><button class="secondary small" data-action="edit" data-id="${product.id}" type="button">Editar</button><button class="danger small" data-action="delete" data-id="${product.id}" type="button">Eliminar</button></div></td></tr>`).join('') : '<tr><td colspan="5" class="empty">No hay productos todavia.</td></tr>';
}

function renderAudit(events) {
    elements.auditList.innerHTML = events.length ? events.slice(0, 12).map((event) => `<div class="audit-item"><strong>${escapeHtml(event.action.replaceAll('_', ' '))}</strong><div class="audit-meta">${escapeHtml(event.user)} · ${escapeHtml(event.backend)}<br>${new Date(event.timestamp).toLocaleString('es-PE')}</div></div>`).join('') : '<p class="empty">Todavia no hay actividad registrada.</p>';
}

async function loadDashboard() {
    const [products, audit] = await Promise.all([request('/api/products'), request('/api/audit-log')]);
    renderProducts(products.data);
    renderAudit(audit.data);
    setStatus(products.message, products.backend);
}

function showRoute(route) {
    if (route === '/productos' && token) {
        elements.loginView.classList.add('hidden');
        elements.productsView.classList.remove('hidden');
        loadDashboard().catch((error) => setStatus(error.message));
        return;
    }
    elements.productsView.classList.add('hidden');
    elements.loginView.classList.remove('hidden');
    if (route === '/productos') history.replaceState({}, '', '/login');
}

elements.loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    elements.loginError.textContent = '';
    const body = Object.fromEntries(new FormData(event.target));
    try {
        const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'No se pudo iniciar sesion');
        token = result.token;
        elements.identity.textContent = `${result.user.name} · login atendido por ${result.backend}`;
        history.pushState({}, '', '/productos');
        showRoute('/productos');
    } catch (error) {
        elements.loginError.textContent = error.message;
    }
});

elements.showRegister.addEventListener('click', () => {
    if (elements.showRegister.dataset.mode === 'login') {
        elements.loginForm.classList.remove('hidden');
        elements.registerForm.classList.add('hidden');
        elements.authPrompt.textContent = '¿Primera vez aqui?';
        elements.showRegister.textContent = 'Crear una cuenta';
        elements.showRegister.dataset.mode = 'register';
        elements.registerError.textContent = '';
        return;
    }
    elements.loginForm.classList.add('hidden');
    elements.registerForm.classList.remove('hidden');
    elements.authPrompt.textContent = '¿Ya tienes una cuenta?';
    elements.showRegister.textContent = 'Volver a ingresar';
    elements.loginError.textContent = '';
    elements.registerError.textContent = '';
    elements.showRegister.dataset.mode = 'login';
});

elements.registerForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    elements.registerError.textContent = '';
    const body = Object.fromEntries(new FormData(event.target));
    try {
        const response = await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'No se pudo crear la cuenta');
        elements.loginForm.email.value = result.user.email;
        elements.loginForm.password.value = '';
        elements.loginForm.classList.remove('hidden');
        elements.registerForm.classList.add('hidden');
        elements.authPrompt.textContent = 'Cuenta lista';
        elements.showRegister.textContent = 'Crear otra cuenta';
        elements.showRegister.dataset.mode = 'register';
        elements.loginError.textContent = `${result.message} · ${result.backend}`;
        event.target.reset();
    } catch (error) {
        elements.registerError.textContent = error.message;
    }
});

elements.productForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    elements.productError.textContent = '';
    const body = Object.fromEntries(new FormData(elements.productForm));
    try {
        const result = await request(editingId ? `/api/products/${editingId}` : '/api/products', { method: editingId ? 'PUT' : 'POST', body: JSON.stringify(body) });
        setStatus(result.message, result.backend);
        resetProductForm();
        await loadDashboard();
    } catch (error) {
        elements.productError.textContent = error.message;
    }
});

elements.productList.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-id]');
    if (!button) return;
    const id = Number(button.dataset.id);
    if (button.dataset.action === 'edit') {
        const result = await request('/api/products');
        const product = result.data.find((item) => item.id === id);
        if (!product) return;
        editingId = id;
        elements.productForm.elements.name.value = product.name;
        elements.productForm.elements.description.value = product.description;
        elements.productForm.elements.price.value = product.price;
        elements.formTitle.textContent = 'Editar producto';
        elements.saveButton.textContent = 'Guardar cambios';
        elements.cancelButton.classList.remove('hidden');
        return;
    }
    if (!confirm('Eliminar este producto?')) return;
    try {
        const result = await request(`/api/products/${id}`, { method: 'DELETE' });
        setStatus(result.message, result.backend);
        await loadDashboard();
    } catch (error) {
        elements.productError.textContent = error.message;
    }
});

document.querySelector('#cancel-button').addEventListener('click', resetProductForm);
document.querySelector('#refresh-button').addEventListener('click', () => loadDashboard().catch((error) => setStatus(error.message)));
document.querySelector('#logout-button').addEventListener('click', () => { token = ''; history.pushState({}, '', '/login'); showRoute('/login'); });
window.addEventListener('popstate', () => showRoute(location.pathname));
showRoute(location.pathname === '/productos' ? '/productos' : '/login');
