// Referencias a elementos del DOM
const authSection = document.getElementById('auth-section');
const dashboardSection = document.getElementById('dashboard-section');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const btnToggleAuth = document.getElementById('btn-toggle-auth');
const btnToggleLogin = document.getElementById('btn-toggle-login');
const authMessage = document.getElementById('auth-message');
const dashboardMessage = document.getElementById('dashboard-message');
const breakTimerDisplay = document.getElementById('break-timer-display');

const userDisplay = document.getElementById('user-display');
const btnLogout = document.getElementById('btn-logout');

const timerDisplay = document.getElementById('timer-display');
const statusBadge = document.getElementById('status-badge');
const btnStart = document.getElementById('btn-start');
const btnPause = document.getElementById('btn-pause');
const btnResume = document.getElementById('btn-resume');
const btnEnd = document.getElementById('btn-end');

const historyList = document.getElementById('history-list');

// Estado global
let currentUser = null;
let currentSession = null;
let currentPauses = [];
let timerInterval = null;

// ─── INICIALIZACIÓN ───────────────────────────────────────────────────────
async function init() {
    try {
        const { data: { session } } = await sb.auth.getSession();
        handleSession(session);

        sb.auth.onAuthStateChange((_event, session) => {
            handleSession(session);
        });
    } catch (error) {
        console.error('Error inicializando:', error);
    }
}

function handleSession(session) {
    if (session) {
        currentUser = session.user;
        userDisplay.textContent = currentUser.email;
        showDashboard();
        loadCurrentState();
        loadHistory();
    } else {
        currentUser = null;
        showAuth();
    }
}

// ─── PANTALLAS ────────────────────────────────────────────────────────────
function showAuth() {
    authSection.classList.remove('hidden');
    dashboardSection.classList.add('hidden');
    authMessage.textContent = '';
}

function showDashboard() {
    authSection.classList.add('hidden');
    dashboardSection.classList.remove('hidden');
}

// ─── AUTENTICACIÓN ────────────────────────────────────────────────────────
btnToggleAuth.addEventListener('click', () => {
    loginForm.classList.add('hidden');
    registerForm.classList.remove('hidden');
    authMessage.textContent = '';
});

btnToggleLogin.addEventListener('click', () => {
    registerForm.classList.add('hidden');
    loginForm.classList.remove('hidden');
    authMessage.textContent = '';
});

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    authMessage.textContent = 'Iniciando sesión...';
    authMessage.style.color = 'var(--text-secondary)';

    try {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        authMessage.textContent = '';
    } catch (err) {
        authMessage.textContent = err.message || 'Error al iniciar sesión';
        authMessage.style.color = 'var(--danger)';
    }
});

registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;

    authMessage.textContent = 'Creando cuenta...';
    authMessage.style.color = 'var(--text-secondary)';

    try {
        const { error } = await sb.auth.signUp({ email, password });
        if (error) throw error;

        authMessage.textContent = '¡Registro exitoso! Ahora inicia sesión.';
        authMessage.style.color = 'var(--success)';
        registerForm.classList.add('hidden');
        loginForm.classList.remove('hidden');
    } catch (err) {
        authMessage.textContent = err.message || 'Error en el registro';
        authMessage.style.color = 'var(--danger)';
    }
});

btnLogout.addEventListener('click', async () => {
    await sb.auth.signOut();
});

// ─── CARGA ESTADO ACTUAL ──────────────────────────────────────────────────
async function loadCurrentState() {
    if (!currentUser) return;

    try {
        const { data, error } = await sb
            .from('jornadas')
            .select(`
                *,
                pausas (*)
            `)
            .eq('usuario_id', currentUser.id)
            .is('fin', null)
            .maybeSingle();

        if (error) throw error;

        if (data) {
            currentSession = data;
            currentPauses = data.pausas || [];
            
            if (data.estado === 'activa' || data.estado === 'pausada') {
                startTimer();
            }
        } else {
            currentSession = null;
            currentPauses = [];
            stopTimer();
            timerDisplay.textContent = '00:00:00';
        }
        
        updateControls();
    } catch (err) {
        console.error('Error cargando estado:', err);
    }
}

// ─── CONTROLES (CORREGIDO) ────────────────────────────────────────────────
function updateControls() {
    // Reset todos los botones
    btnStart.classList.add('hidden');
    btnPause.classList.add('hidden');
    btnResume.classList.add('hidden');
    btnEnd.classList.add('hidden');
    
    btnResume.disabled = false;
    breakTimerDisplay.classList.add('hidden');

    if (!currentSession) {
        // NO HAY JORNADA ACTIVA
        btnStart.classList.remove('hidden');
        statusBadge.textContent = 'Inactivo';
        statusBadge.style.color = 'var(--text-secondary)';
        return;
    }

    // HAY JORNADA ACTIVA
    if (currentSession.estado === 'activa') {
        statusBadge.textContent = 'Activo';
        statusBadge.style.color = 'var(--success)';
        
        if (currentPauses.length === 0) {
            // NO HA TOMADO BREAK - puede pausar
            btnPause.classList.remove('hidden');
        } else {
            // YA TOMÓ BREAK - puede finalizar
            btnEnd.classList.remove('hidden');
        }
        
    } else if (currentSession.estado === 'pausada') {
        statusBadge.textContent = 'En Break';
        statusBadge.style.color = 'var(--warning)';
        
        updateBreakTimer(); // Actualizar timer de break inmediatamente
        
        btnResume.classList.remove('hidden');
    }
}

function updateBreakTimer() {
    if (!currentSession || currentSession.estado !== 'pausada') {
        breakTimerDisplay.classList.add('hidden');
        return;
    }

    breakTimerDisplay.classList.remove('hidden');

    // Buscar pausa activa
    const activePause = currentPauses.find(p => !p.fin);
    if (activePause) {
        const now = new Date();
        const pauseStart = new Date(activePause.inicio);
        const elapsed = now - pauseStart;
        const required = 45 * 60 * 1000;
        const remaining = required - elapsed;
        
        if (remaining > 0) {
            btnResume.disabled = true;
            const { m, s } = msToHms(remaining);
            breakTimerDisplay.textContent = `Break: ${pad(m)}:${pad(s)}`;
            breakTimerDisplay.classList.remove('finished');
        } else {
            btnResume.disabled = false;
            breakTimerDisplay.textContent = '✓ Break completado';
            breakTimerDisplay.classList.add('finished');
        }
    }
}

// ─── TEMPORIZADOR ─────────────────────────────────────────────────────────
function startTimer() {
    stopTimer();
    timerInterval = setInterval(updateTimerDisplay, 1000);
    updateTimerDisplay();
}

function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}

function updateTimerDisplay() {
    if (!currentSession) {
        timerDisplay.textContent = '00:00:00';
        return;
    }

    // Actualizar también el timer de break si estamos en pausa
    if (currentSession.estado === 'pausada') {
        updateBreakTimer();
    }

    const now = new Date();
    const start = new Date(currentSession.inicio);
    let totalElapsed = now - start;

    // Calcular tiempo de pausas
    let totalPauseTime = 0;
    currentPauses.forEach(p => {
        const pStart = new Date(p.inicio);
        const pEnd = p.fin ? new Date(p.fin) : now;
        totalPauseTime += (pEnd - pStart);
    });

    let workedMs = totalElapsed - totalPauseTime;
    if (workedMs < 0) workedMs = 0;

    const { h, m, s } = msToHms(workedMs);
    timerDisplay.textContent = `${pad(h)}:${pad(m)}:${pad(s)}`;
}

// ─── ACCIONES (CORREGIDAS) ────────────────────────────────────────────────
btnStart.addEventListener('click', async () => {
    try {
        const { data, error } = await sb
            .from('jornadas')
            .insert([{
                usuario_id: currentUser.id,
                estado: 'activa',
                inicio: new Date().toISOString()
            }])
            .select()
            .single();

        if (error) throw error;

        currentSession = data;
        currentPauses = [];
        updateControls();
        startTimer();
        showDashboardMessage('Jornada iniciada', 'success');
        
    } catch (err) {
        showDashboardMessage('Error: ' + err.message, 'error');
    }
});

btnPause.addEventListener('click', async () => {
    try {
        const now = new Date().toISOString();
        
        // 1. Actualizar jornada a pausada
        const { error: jornadaError } = await sb
            .from('jornadas')
            .update({ estado: 'pausada' })
            .eq('id', currentSession.id);
        
        if (jornadaError) throw jornadaError;

        // 2. Crear pausa
        const { data: pauseData, error: pauseError } = await sb
            .from('pausas')
            .insert([{
                jornada_id: currentSession.id,
                inicio: now
            }])
            .select()
            .single();

        if (pauseError) throw pauseError;

        // 3. Actualizar estado local
        currentSession.estado = 'pausada';
        currentPauses.push(pauseData);
        
        updateControls();
        showDashboardMessage('Break iniciado. Espera 45 minutos.', 'info');
        
    } catch (err) {
        showDashboardMessage('Error: ' + err.message, 'error');
    }
});

btnResume.addEventListener('click', async () => {
    if (btnResume.disabled) {
        showDashboardMessage('Debes completar los 45 minutos de break', 'error');
        return;
    }

    try {
        const now = new Date().toISOString();

        // 1. Actualizar jornada a activa
        const { error: jornadaError } = await sb
            .from('jornadas')
            .update({ estado: 'activa' })
            .eq('id', currentSession.id);
        
        if (jornadaError) throw jornadaError;

        // 2. Cerrar pausa activa
        const activePause = currentPauses.find(p => !p.fin);
        if (activePause) {
            const { error: pauseError } = await sb
                .from('pausas')
                .update({ fin: now })
                .eq('id', activePause.id);
            
            if (pauseError) throw pauseError;
            
            // Actualizar localmente
            activePause.fin = now;
        }

        // 3. Actualizar estado local
        currentSession.estado = 'activa';
        updateControls();
        showDashboardMessage('Jornada reanudada', 'success');
        
    } catch (err) {
        showDashboardMessage('Error: ' + err.message, 'error');
    }
});

btnEnd.addEventListener('click', async () => {
    if (!confirm('¿Estás seguro de finalizar la jornada?')) return;

    try {
        const now = new Date().toISOString();

        // 1. Cerrar pausa activa si existe
        const activePause = currentPauses.find(p => !p.fin);
        if (activePause) {
            await sb
                .from('pausas')
                .update({ fin: now })
                .eq('id', activePause.id);
        }

        // 2. Finalizar jornada
        const { error } = await sb
            .from('jornadas')
            .update({
                fin: now,
                estado: 'completada'
            })
            .eq('id', currentSession.id);

        if (error) throw error;

        // 3. Resetear estado local
        currentSession = null;
        currentPauses = [];
        stopTimer();
        timerDisplay.textContent = '00:00:00';
        
        updateControls();
        loadHistory();
        showDashboardMessage('Jornada finalizada', 'success');
        
    } catch (err) {
        showDashboardMessage('Error: ' + err.message, 'error');
    }
});

// ─── UTILIDADES ───────────────────────────────────────────────────────────
function showDashboardMessage(msg, type = 'info') {
    dashboardMessage.textContent = msg;
    dashboardMessage.style.color = 
        type === 'error' ? 'var(--danger)' :
        type === 'success' ? 'var(--success)' : 'var(--warning)';
    
    setTimeout(() => {
        dashboardMessage.textContent = '';
    }, 3000);
}

function msToHms(ms) {
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor(ms / (1000 * 60 * 60));
    return { h: hours, m: minutes, s: seconds };
}

function pad(num) {
    return num.toString().padStart(2, '0');
}

// ─── HISTORIAL ────────────────────────────────────────────────────────────
async function loadHistory() {
    if (!currentUser) return;

    try {
        const { data: jornadas, error } = await sb
            .from('jornadas')
            .select(`*, pausas (*)`)
            .eq('usuario_id', currentUser.id)
            .order('inicio', { ascending: false })
            .limit(10);

        if (error) throw error;

        historyList.innerHTML = '';

        jornadas.forEach(j => {
            const row = document.createElement('tr');
            const start = new Date(j.inicio);
            const end = j.fin ? new Date(j.fin) : null;

            // Calcular tiempo trabajado (restando pausas)
            let totalMs = end ? (end - start) : 0;
            let pauseMs = 0;
            
            if (j.pausas) {
                j.pausas.forEach(p => {
                    const pStart = new Date(p.inicio);
                    const pEnd = p.fin ? new Date(p.fin) : (end || new Date());
                    pauseMs += (pEnd - pStart);
                });
            }
            
            let workedMs = totalMs - pauseMs;
            if (workedMs < 0) workedMs = 0;
            
            const { h, m } = msToHms(workedMs);
            const totalStr = end ? `${pad(h)}:${pad(m)}` : 'En curso';

            // Formatear fechas
            const dateStr = start.toLocaleDateString('es-ES');
            const startStr = start.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
            const endStr = end ? end.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '-';
            
            // Pausas
            let breakStart = '-';
            let breakEnd = '-';
            
            if (j.pausas && j.pausas.length > 0) {
                const primera = j.pausas[0];
                breakStart = new Date(primera.inicio).toLocaleTimeString('es-ES', { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                });
                breakEnd = primera.fin 
                    ? new Date(primera.fin).toLocaleTimeString('es-ES', { 
                        hour: '2-digit', 
                        minute: '2-digit' 
                    })
                    : '...';
            }

            row.innerHTML = `
                <td>${dateStr}</td>
                <td>${startStr}</td>
                <td>${breakStart}</td>
                <td>${breakEnd}</td>
                <td>${endStr}</td>
                <td>${totalStr}</td>
            `;
            historyList.appendChild(row);
        });
    } catch (err) {
        console.error('Error cargando historial:', err);
    }
}

// ─── INICIAR APLICACIÓN ───────────────────────────────────────────────────
init();