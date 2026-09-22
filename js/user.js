const USUARIO_DEMO = {
    email: "admin@barrilete.com",
    password: "123456",
    name: "Admin"
};

export function inicializarSesion() {
    const sessionData = localStorage.getItem("session_barrilete");
    let isLoggedIn = false;
    if (sessionData && sessionData !== "null" && sessionData !== "undefined") {
        try {
            const parsed = JSON.parse(sessionData);
            if (parsed && parsed.isLoggedIn === true) {
                isLoggedIn = true;
            }
        } catch (e) {
            console.error("Error leyendo la sesión:", e);
            isLoggedIn = false;
        }
    }

    const publicButtons = document.querySelectorAll(".public-nav");
    const privateButtons = document.querySelectorAll(".private-nav");
    const logoutBtn = document.getElementById("btn-logout");

    if (isLoggedIn) {
        publicButtons.forEach(btn => btn.style.setProperty('display', 'none', 'important'));
        privateButtons.forEach(btn => btn.style.setProperty('display', 'flex', 'important'));
        if (logoutBtn) logoutBtn.style.setProperty('display', 'flex', 'important');
    } else {
        publicButtons.forEach(btn => btn.style.setProperty('display', 'flex', 'important'));
        privateButtons.forEach(btn => btn.style.setProperty('display', 'none', 'important'));
        if (logoutBtn) logoutBtn.style.setProperty('display', 'none', 'important');
    }

    if (logoutBtn) {
        const nuevoLogoutBtn = logoutBtn.cloneNode(true);
        logoutBtn.parentNode.replaceChild(nuevoLogoutBtn, logoutBtn);
        nuevoLogoutBtn.addEventListener("click", (e) => {
            e.preventDefault();
            localStorage.removeItem("session_barrilete");
            window.location.href = "index.html";
        });
    }
}

export function inicializarLogin() {
    const loginForm = document.getElementById("login-form");
    const errorBox = document.getElementById("error-box");

    if (!loginForm) return;
    loginForm.addEventListener("submit", (e) => {
        e.preventDefault();     
        const identificador = document.getElementById("login-email")?.value.trim();
        const password = document.getElementById("login-password")?.value.trim();
        const usuariosRegistrados = JSON.parse(localStorage.getItem("usuarios_barrilete")) || [];
        const coincideDemo = (
            (identificador === USUARIO_DEMO.email || identificador === USUARIO_DEMO.name) && 
            password === USUARIO_DEMO.password
        );

        const coincideRegistrado = usuariosRegistrados.find(u => 
            (u.email === identificador || u.name === identificador) && u.password === password
        );

        if (coincideDemo || coincideRegistrado) {
            const usuarioActivo = coincideDemo ? USUARIO_DEMO : coincideRegistrado;
            localStorage.setItem("session_barrilete", JSON.stringify({
                isLoggedIn: true,
                userName: usuarioActivo.name
            }));

            const filtroPendiente = localStorage.getItem("filtro_pendiente_barrilete");
            if (filtroPendiente) {
                localStorage.setItem("filtro_barrilete", filtroPendiente);
                localStorage.removeItem("filtro_pendiente_barrilete");
                window.location.href = "index_productos.html";
            } else {
                window.location.href = "index.html";
            }
        } else {
            if (errorBox) {
                errorBox.textContent = "El usuario/correo o la contraseña son incorrectos.";
                errorBox.classList.remove("hidden");
            }
        }
    });
}

export function inicializarRegistro() {
    const registerForm = document.getElementById("register-form");
    const errorBox = document.getElementById("error-box");
    if (!registerForm) return;
    registerForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const name = document.getElementById("reg-name").value.trim();
        const email = document.getElementById("reg-email").value.trim();
        const password = document.getElementById("reg-password").value.trim();
        const confirmPassword = document.getElementById("reg-confirm").value.trim();
        if (password.length < 6) {
            errorBox.textContent = "La contraseña debe tener al menos 6 caracteres.";
            errorBox.classList.remove("hidden");
            return;
        }
        if (password !== confirmPassword) {
            errorBox.textContent = "Las contraseñas no coinciden.";
            errorBox.classList.remove("hidden");
            return;
        }

        let usuariosRegistrados = JSON.parse(localStorage.getItem("usuarios_barrilete")) || [];
        if (email === USUARIO_DEMO.email || usuariosRegistrados.some(u => u.email === email)) {
            errorBox.textContent = "Este correo electrónico ya está registrado.";
            errorBox.classList.remove("hidden");
            return;
        }

        const nuevoUsuario = { name, email, password };
        usuariosRegistrados.push(nuevoUsuario);
        localStorage.setItem("usuarios_barrilete", JSON.stringify(usuariosRegistrados));
        localStorage.setItem("session_barrilete", JSON.stringify({
            isLoggedIn: true,
            userName: name
        }));

        const filtroPendiente = localStorage.getItem("filtro_pendiente_barrilete");
        if (filtroPendiente) {
            localStorage.setItem("filtro_barrilete", filtroPendiente);
            localStorage.removeItem("filtro_pendiente_barrilete");
            window.location.href = "index_productos.html";
        } else {
            window.location.href = "index.html";
        }
    });
}
