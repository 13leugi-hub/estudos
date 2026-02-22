// ============================================================
// JORNADA ACADÊMICA — script.js
// ============================================================

const DEVELOPMENT_MODE = false;
const PORTAL_URL = 'https://ir-comercio-portal-zcan.onrender.com';
const API_URL = 'https://jornada-academica.onrender.com/api'; // Altere para sua URL

let estudos = [];
let isOnline = false;
let sessionToken = null;
let currentMonth = new Date();
let currentView = 'estudos';

const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        const splash = document.getElementById('splashScreen');
        if (splash) {
            splash.style.opacity = '0';
            splash.style.transition = 'opacity 0.4s';
            setTimeout(() => splash.style.display = 'none', 400);
        }
    }, 2200);

    if (DEVELOPMENT_MODE) {
        sessionToken = 'dev-mode';
        inicializarApp();
    } else {
        verificarAutenticacao();
    }
});

// ============================================================
// AUTENTICAÇÃO
// ============================================================
async function verificarAutenticacao() {
    try {
        const params = new URLSearchParams(window.location.search);
        let token = params.get('token') || localStorage.getItem('sessionToken');

        if (!token) {
            const storedToken = sessionStorage.getItem('sessionToken');
            if (storedToken) token = storedToken;
        }

        if (!token) {
            window.location.href = `${PORTAL_URL}?redirect=${encodeURIComponent(window.location.href)}`;
            return;
        }

        const verifyResponse = await fetch(`${PORTAL_URL}/api/verify-session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionToken: token })
        });

        if (!verifyResponse.ok) {
            window.location.href = `${PORTAL_URL}?redirect=${encodeURIComponent(window.location.href)}`;
            return;
        }

        const sessionData = await verifyResponse.json();
        if (!sessionData.valid) {
            window.location.href = `${PORTAL_URL}?redirect=${encodeURIComponent(window.location.href)}`;
            return;
        }

        sessionToken = token;
        sessionStorage.setItem('sessionToken', token);
        inicializarApp();
    } catch (error) {
        console.error('Erro de autenticação:', error);
        // Em caso de erro de rede no portal, tenta continuar
        sessionToken = 'offline-mode';
        inicializarApp();
    }
}

// ============================================================
// INICIALIZAÇÃO
// ============================================================
async function inicializarApp() {
    updateMonthLabel();
    await carregarEstudos();
    checkNotificacoes();
    setInterval(sincronizar, 60000);
}

// ============================================================
// VIEWS
// ============================================================
window.switchView = function(viewName, el) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById('view-' + viewName)?.classList.add('active');
    el?.classList.add('active');
    currentView = viewName;

    if (viewName === 'revisoes') renderRevisoes();
    if (viewName === 'questoes') renderQuestoes();
};

// ============================================================
// CARREGAR / SINCRONIZAR
// ============================================================
async function carregarEstudos() {
    try {
        const res = await fetch(`${API_URL}/estudos`, {
            headers: { 'X-Session-Token': sessionToken, 'Accept': 'application/json' }
        });
        if (!res.ok) throw new Error('Erro de rede');
        const data = await res.json();
        estudos = data;
        isOnline = true;
        updateConnectionStatus(true);
        updateDashboard();
        filterEstudos();
        updateCursoFilters();
    } catch (error) {
        console.warn('Offline ou erro:', error);
        isOnline = false;
        updateConnectionStatus(false);
        // Tentar carregar do localStorage
        const cached = localStorage.getItem('estudos_cache');
        if (cached) { estudos = JSON.parse(cached); updateDashboard(); filterEstudos(); updateCursoFilters(); }
    }
}

window.sincronizar = async function() {
    await carregarEstudos();
    if (currentView === 'revisoes') renderRevisoes();
    if (currentView === 'questoes') renderQuestoes();
    showToast('Dados sincronizados', 'success');
};

function updateConnectionStatus(online) {
    const el = document.getElementById('connectionStatus');
    if (!el) return;
    el.className = 'conn-status' + (online ? ' online' : '');
    el.querySelector('.conn-label').textContent = online ? 'Online' : 'Offline';
    // Cache
    if (online) localStorage.setItem('estudos_cache', JSON.stringify(estudos));
}

// ============================================================
// DASHBOARD
// ============================================================
function updateDashboard() {
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const mes = currentMonth.getMonth();
    const ano = currentMonth.getFullYear();

    const doMes = estudos.filter(e => {
        const d = new Date(e.data_inicio + 'T00:00:00');
        return d.getMonth() === mes && d.getFullYear() === ano;
    });

    let pendente = 0, atraso = 0, concluido = 0, revisoesPend = 0;

    doMes.forEach(e => {
        const s = getStatusAtual(e);
        if (s === 'PENDENTE') pendente++;
        else if (s === 'ATRASO') atraso++;
        else if (s === 'CONCLUIDO') concluido++;

        // revisoes pendentes
        const revs = parseJSON(e.revisoes);
        revs.forEach(r => {
            if (!r.feita) {
                const rd = new Date(r.data + 'T00:00:00');
                if (rd <= hoje) revisoesPend++;
            }
        });
    });

    setText('statPendente', pendente);
    setText('statAtraso', atraso);
    setText('statConcluido', concluido);
    setText('statRevisoes', revisoesPend);

    // Atualiza badge na nav de revisoes
    const navRevs = document.querySelector('[data-view="revisoes"]');
    if (navRevs) {
        let badge = navRevs.querySelector('.notif-badge');
        if (revisoesPend > 0) {
            if (!badge) { badge = document.createElement('span'); badge.className = 'notif-badge'; navRevs.appendChild(badge); }
            badge.textContent = revisoesPend;
        } else if (badge) badge.remove();
    }
}

// ============================================================
// STATUS ATUAL (CALCULADO)
// ============================================================
function getStatusAtual(estudo) {
    if (estudo.status === 'CONCLUIDO') return 'CONCLUIDO';
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    if (estudo.data_termino) {
        const t = new Date(estudo.data_termino + 'T00:00:00');
        if (t < hoje) return 'ATRASO';
    }
    return 'PENDENTE';
}

// ============================================================
// FILTROS E RENDER
// ============================================================
function updateCursoFilters() {
    const cursos = [...new Set(estudos.map(e => e.curso).filter(Boolean))].sort();
    const selects = ['filterCurso', 'filterQuestaoCurso'];
    selects.forEach(id => {
        const sel = document.getElementById(id);
        if (!sel) return;
        const cur = sel.value;
        sel.innerHTML = `<option value="">Todos os Cursos</option>` + cursos.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
        if (cur) sel.value = cur;
    });
}

window.filterEstudos = function() {
    const q = (document.getElementById('searchInput')?.value || '').toLowerCase();
    const curso = document.getElementById('filterCurso')?.value || '';
    const status = document.getElementById('filterStatus')?.value || '';
    const mes = currentMonth.getMonth();
    const ano = currentMonth.getFullYear();

    const filtered = estudos.filter(e => {
        const d = new Date(e.data_inicio + 'T00:00:00');
        if (d.getMonth() !== mes || d.getFullYear() !== ano) return false;
        if (curso && e.curso !== curso) return false;
        const s = getStatusAtual(e);
        if (status && s !== status) return false;
        if (q && !`${e.curso} ${e.unidade} ${e.conteudo}`.toLowerCase().includes(q)) return false;
        return true;
    });

    renderEstudosTable(filtered);
};

function renderEstudosTable(list) {
    const container = document.getElementById('estudosContainer');
    if (!container) return;

    if (list.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📖</div>
                <p>Nenhum estudo encontrado</p>
                <button class="btn-primary" onclick="abrirFormEstudo()">Registrar Estudo</button>
            </div>`;
        return;
    }

    container.innerHTML = `
        <div class="table-wrap">
            <table>
                <thead>
                    <tr>
                        <th>✓</th>
                        <th>Curso</th>
                        <th>Unidade</th>
                        <th>Conteúdo</th>
                        <th>Início</th>
                        <th>Término</th>
                        <th>Status</th>
                        <th>Revisões</th>
                        <th>Ações</th>
                    </tr>
                </thead>
                <tbody>
                    ${list.map(e => {
                        const s = getStatusAtual(e);
                        const revs = parseJSON(e.revisoes);
                        const pendRevs = revs.filter(r => !r.feita).length;
                        return `
                        <tr data-id="${e.id}">
                            <td class="check-wrap">
                                <input type="checkbox" class="study-check"
                                    ${s === 'CONCLUIDO' ? 'checked' : ''}
                                    onchange="toggleConcluido('${e.id}', this.checked)"
                                    title="${s === 'CONCLUIDO' ? 'Marcar como pendente' : 'Marcar como concluído'}">
                            </td>
                            <td><strong>${esc(e.curso)}</strong></td>
                            <td>${esc(e.unidade || '—')}</td>
                            <td>${esc(e.conteudo)}</td>
                            <td style="white-space:nowrap">${formatDate(e.data_inicio)}</td>
                            <td style="white-space:nowrap">${formatDate(e.data_termino)}</td>
                            <td>${statusBadge(s)}</td>
                            <td>${pendRevs > 0 ? `<span class="badge badge-info">${pendRevs} pendente${pendRevs > 1 ? 's' : ''}</span>` : `<span style="color:var(--text-muted);font-size:.8rem">${revs.length > 0 ? '✓ ok' : '—'}</span>`}</td>
                            <td style="white-space:nowrap">
                                <button class="action-btn view" onclick="verEstudo('${e.id}')">Ver</button>
                                <button class="action-btn edit" onclick="editarEstudo('${e.id}')">Editar</button>
                                <button class="action-btn add" onclick="abrirFormRevisao('${e.id}')" title="Agendar revisão">Rev.</button>
                                <button class="action-btn delete" onclick="excluirEstudo('${e.id}')">✕</button>
                            </td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>`;
}

// ============================================================
// TOGGLE CONCLUÍDO
// ============================================================
window.toggleConcluido = async function(id, checked) {
    const estudo = estudos.find(e => String(e.id) === String(id));
    if (!estudo) return;

    const novoStatus = checked ? 'CONCLUIDO' : 'PENDENTE';
    const updateData = { status: novoStatus };

    // Atualiza local
    const idx = estudos.findIndex(e => String(e.id) === String(id));
    if (idx !== -1) estudos[idx].status = novoStatus;
    updateDashboard();
    filterEstudos();

    // Salva no servidor
    try {
        const res = await fetch(`${API_URL}/estudos/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'X-Session-Token': sessionToken },
            body: JSON.stringify(updateData)
        });
        if (!res.ok) throw new Error();
        const saved = await res.json();
        if (idx !== -1) estudos[idx] = saved;
        showToast(checked ? 'Estudo concluído! 🎉' : 'Estudo reaberto', 'success');
    } catch {
        // Reverte
        if (idx !== -1) estudos[idx].status = checked ? 'PENDENTE' : 'CONCLUIDO';
        updateDashboard(); filterEstudos();
        showToast('Erro ao salvar', 'error');
    }
};

// ============================================================
// VER ESTUDO
// ============================================================
window.verEstudo = function(id) {
    const e = estudos.find(x => String(x.id) === String(id));
    if (!e) return;

    const revs = parseJSON(e.revisoes);
    const questoes = parseJSON(e.questoes);
    const hoje = new Date(); hoje.setHours(0,0,0,0);

    const revsHtml = revs.length === 0 ? '<p style="color:var(--text-muted);font-size:.85rem">Nenhuma revisão agendada.</p>' : revs.map((r, i) => {
        const rd = new Date(r.data + 'T00:00:00');
        const atrasada = !r.feita && rd < hoje;
        return `
        <div class="revisao-item ${atrasada ? 'revisao-atrasada' : ''}">
            <div class="revisao-date">${formatDate(r.data)}</div>
            <div class="revisao-info">
                <div class="r-conteudo">${esc(tipoRevisaoLabel(r.tipo))}</div>
                ${r.nota ? `<div class="r-curso">${esc(r.nota)}</div>` : ''}
            </div>
            ${r.feita ? '<span class="badge badge-concluido">Feita</span>' : `<button class="action-btn done" onclick="marcarRevisaoFeita('${e.id}', ${i})">Feita</button>`}
        </div>`;
    }).join('');

    const questoesHtml = questoes.length === 0 ? '<p style="color:var(--text-muted);font-size:.85rem">Nenhuma questão registrada.</p>' : questoes.map((q, i) => `
        <div class="questao-card ${q.status === 'FEITA' ? 'feita' : ''}">
            <div class="questao-actions">
                ${q.status !== 'FEITA' ? `<button class="action-btn done" onclick="marcarQuestaoFeita('${e.id}', ${i})" title="Marcar como feita">✓</button>` : ''}
            </div>
            <div class="qc-pergunta">${esc(q.pergunta)}</div>
            ${q.resposta ? `<div class="qc-resposta">💡 ${esc(q.resposta)}</div>` : ''}
            <div class="qc-meta">
                <span class="badge ${q.status === 'FEITA' ? 'badge-concluido' : 'badge-pendente'}">${q.status === 'FEITA' ? 'Feita' : 'Pendente'}</span>
                <span class="badge badge-gray"><span class="diff-dot diff-${q.dificuldade || 'MEDIA'}"></span> ${q.dificuldade || 'MEDIA'}</span>
            </div>
        </div>`).join('');

    document.getElementById('detalheTitle').textContent = `${e.curso} — ${e.conteudo}`;
    document.getElementById('detalheBody').innerHTML = `
        <div class="detail-section">
            <div class="detail-section-title">Informações</div>
            <div class="detail-info-grid">
                <div class="detail-info-item"><label>Curso</label><span>${esc(e.curso)}</span></div>
                <div class="detail-info-item"><label>Unidade</label><span>${esc(e.unidade || '—')}</span></div>
                <div class="detail-info-item"><label>Conteúdo</label><span>${esc(e.conteudo)}</span></div>
                <div class="detail-info-item"><label>Início</label><span>${formatDate(e.data_inicio)}</span></div>
                <div class="detail-info-item"><label>Término</label><span>${formatDate(e.data_termino)}</span></div>
                <div class="detail-info-item"><label>Status</label><span>${statusBadge(getStatusAtual(e))}</span></div>
            </div>
        </div>
        <div class="detail-section">
            <div class="detail-section-title">
                Revisões (${revs.length})
                <button class="action-btn add" onclick="fecharModalDetalhe(); abrirFormRevisao('${e.id}')">+ Agendar</button>
            </div>
            ${revsHtml}
        </div>
        <div class="detail-section">
            <div class="detail-section-title">
                Banco de Questões (${questoes.length})
                <button class="action-btn add" onclick="fecharModalDetalhe(); abrirFormQuestaoParaEstudo('${e.id}')">+ Questão</button>
            </div>
            ${questoesHtml}
        </div>`;

    document.getElementById('btnEditarDetalhe').onclick = () => { fecharModalDetalhe(); editarEstudo(id); };
    document.getElementById('modalDetalhe').style.display = 'flex';
};

window.fecharModalDetalhe = function() { document.getElementById('modalDetalhe').style.display = 'none'; };

// ============================================================
// FORM ESTUDO
// ============================================================
window.abrirFormEstudo = function() {
    document.getElementById('modalEstudoTitle').textContent = 'Registrar Estudo';
    document.getElementById('estudoId').value = '';
    document.getElementById('fCurso').value = '';
    document.getElementById('fUnidade').value = '';
    document.getElementById('fConteudo').value = '';
    document.getElementById('fDataInicio').value = new Date().toISOString().split('T')[0];
    document.getElementById('fDataTermino').value = '';
    document.getElementById('fObservacao').value = '';
    document.getElementById('modalEstudo').style.display = 'flex';
};

window.editarEstudo = function(id) {
    const e = estudos.find(x => String(x.id) === String(id));
    if (!e) return;
    document.getElementById('modalEstudoTitle').textContent = 'Editar Estudo';
    document.getElementById('estudoId').value = e.id;
    document.getElementById('fCurso').value = e.curso || '';
    document.getElementById('fUnidade').value = e.unidade || '';
    document.getElementById('fConteudo').value = e.conteudo || '';
    document.getElementById('fDataInicio').value = e.data_inicio || '';
    document.getElementById('fDataTermino').value = e.data_termino || '';
    const obs = parseJSON(e.observacoes);
    document.getElementById('fObservacao').value = obs[0]?.texto || obs[0] || '';
    document.getElementById('modalEstudo').style.display = 'flex';
};

window.fecharModalEstudo = function() { document.getElementById('modalEstudo').style.display = 'none'; };

window.submitEstudo = async function(event) {
    event.preventDefault();
    const id = document.getElementById('estudoId').value;
    const obsText = document.getElementById('fObservacao').value.trim();
    const payload = {
        curso: document.getElementById('fCurso').value.trim(),
        unidade: document.getElementById('fUnidade').value.trim(),
        conteudo: document.getElementById('fConteudo').value.trim(),
        data_inicio: document.getElementById('fDataInicio').value,
        data_termino: document.getElementById('fDataTermino').value || null,
        observacoes: obsText ? JSON.stringify([{ texto: obsText, data: new Date().toISOString() }]) : '[]',
        revisoes: id ? undefined : '[]',
        questoes: id ? undefined : '[]',
        status: 'PENDENTE'
    };
    if (id) { delete payload.revisoes; delete payload.questoes; }

    try {
        const method = id ? 'PUT' : 'POST';
        const url = id ? `${API_URL}/estudos/${id}` : `${API_URL}/estudos`;
        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json', 'X-Session-Token': sessionToken },
            body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error();
        const saved = await res.json();
        if (id) { const idx = estudos.findIndex(e => String(e.id) === String(id)); if (idx !== -1) estudos[idx] = saved; }
        else estudos.unshift(saved);
        updateDashboard(); filterEstudos(); updateCursoFilters();
        fecharModalEstudo();
        showToast(id ? 'Estudo atualizado!' : 'Estudo registrado! 📚', 'success');
    } catch { showToast('Erro ao salvar estudo', 'error'); }
};

// ============================================================
// EXCLUIR ESTUDO
// ============================================================
window.excluirEstudo = async function(id) {
    const e = estudos.find(x => String(x.id) === String(id));
    const confirmed = await showConfirm(`Excluir o estudo "${e?.conteudo}"?`, { title: 'Confirmar Exclusão', type: 'danger' });
    if (!confirmed) return;

    estudos = estudos.filter(x => String(x.id) !== String(id));
    updateDashboard(); filterEstudos(); updateCursoFilters();
    showToast('Estudo excluído', 'success');

    try {
        await fetch(`${API_URL}/estudos/${id}`, {
            method: 'DELETE',
            headers: { 'X-Session-Token': sessionToken }
        });
    } catch { showToast('Erro ao excluir no servidor', 'error'); }
};

// ============================================================
// REVISÕES
// ============================================================
function populateRevisaoEstudoSelect(preSelectedId) {
    const sel = document.getElementById('fRevisaoEstudo');
    if (!sel) return;
    sel.innerHTML = estudos
        .filter(e => getStatusAtual(e) !== 'CONCLUIDO')
        .map(e => `<option value="${e.id}" ${String(e.id) === String(preSelectedId) ? 'selected' : ''}>${esc(e.curso)} — ${esc(e.conteudo)}</option>`)
        .join('');
}

window.abrirFormRevisao = function(preEstudoId) {
    populateRevisaoEstudoSelect(preEstudoId);
    document.getElementById('revisaoEstudoId').value = preEstudoId || '';
    document.getElementById('revisaoIndex').value = -1;
    document.getElementById('fRevisaoData').value = '';
    document.getElementById('fRevisaoTipo').value = 'REVISAO_1';
    document.getElementById('fRevisaoNota').value = '';
    document.getElementById('modalRevisao').style.display = 'flex';
};

window.fecharModalRevisao = function() { document.getElementById('modalRevisao').style.display = 'none'; };

window.submitRevisao = async function(event) {
    event.preventDefault();
    const estudoId = document.getElementById('fRevisaoEstudo').value;
    const estudo = estudos.find(e => String(e.id) === String(estudoId));
    if (!estudo) return;

    const novaRevisao = {
        data: document.getElementById('fRevisaoData').value,
        tipo: document.getElementById('fRevisaoTipo').value,
        nota: document.getElementById('fRevisaoNota').value.trim(),
        feita: false,
        criada_em: new Date().toISOString()
    };

    const revs = parseJSON(estudo.revisoes);
    revs.push(novaRevisao);

    try {
        const res = await fetch(`${API_URL}/estudos/${estudoId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'X-Session-Token': sessionToken },
            body: JSON.stringify({ revisoes: JSON.stringify(revs) })
        });
        if (!res.ok) throw new Error();
        const saved = await res.json();
        const idx = estudos.findIndex(e => String(e.id) === String(estudoId));
        if (idx !== -1) estudos[idx] = saved;
        updateDashboard(); renderRevisoes();
        fecharModalRevisao();
        showToast('Revisão agendada! 🔄', 'success');
    } catch { showToast('Erro ao agendar revisão', 'error'); }
};

function renderRevisoes() {
    const container = document.getElementById('revisoesContainer');
    if (!container) return;
    const hoje = new Date(); hoje.setHours(0,0,0,0);

    // Coletar todas as revisões com referência ao estudo
    let todasRevisoes = [];
    estudos.forEach(e => {
        const revs = parseJSON(e.revisoes);
        revs.forEach((r, i) => {
            todasRevisoes.push({ ...r, estudoId: e.id, estudoIdx: i, curso: e.curso, conteudo: e.conteudo });
        });
    });

    // Ordenar: pendentes primeiro, depois por data
    todasRevisoes.sort((a, b) => {
        if (a.feita !== b.feita) return a.feita ? 1 : -1;
        return new Date(a.data) - new Date(b.data);
    });

    if (todasRevisoes.length === 0) {
        container.innerHTML = `<div class="empty-state"><div class="empty-icon">🔄</div><p>Nenhuma revisão agendada</p><button class="btn-primary" onclick="abrirFormRevisao()">Agendar Revisão</button></div>`;
        return;
    }

    const pendentes = todasRevisoes.filter(r => !r.feita);
    const feitas = todasRevisoes.filter(r => r.feita);

    const renderSection = (list, title) => list.length === 0 ? '' : `
        <div style="padding: 1rem 1.5rem; border-bottom: 1px solid var(--border); font-size: .8rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: .06em;">${title}</div>
        <div style="padding: 0 1.5rem;">
        ${list.map(r => {
            const rd = new Date(r.data + 'T00:00:00');
            const atrasada = !r.feita && rd < hoje;
            return `
            <div class="revisao-item ${atrasada ? 'revisao-atrasada' : ''}">
                <div class="revisao-date">${formatDate(r.data)}</div>
                <div class="revisao-info">
                    <div class="r-conteudo">${esc(r.conteudo)}</div>
                    <div class="r-curso">${esc(r.curso)} · ${tipoRevisaoLabel(r.tipo)}${atrasada ? ' · <span style="color:var(--danger)">Atrasada</span>' : ''}</div>
                    ${r.nota ? `<div class="r-curso" style="margin-top:.25rem;font-style:italic">"${esc(r.nota)}"</div>` : ''}
                </div>
                ${r.feita
                    ? '<span class="badge badge-concluido">Feita</span>'
                    : `<button class="action-btn done" onclick="marcarRevisaoFeita('${r.estudoId}', ${r.estudoIdx})">✓ Feita</button>`
                }
            </div>`;
        }).join('')}
        </div>`;

    container.innerHTML = renderSection(pendentes, `Pendentes (${pendentes.length})`) + renderSection(feitas, `Concluídas (${feitas.length})`);
}

window.marcarRevisaoFeita = async function(estudoId, revisaoIdx) {
    const estudo = estudos.find(e => String(e.id) === String(estudoId));
    if (!estudo) return;
    const revs = parseJSON(estudo.revisoes);
    if (!revs[revisaoIdx]) return;
    revs[revisaoIdx].feita = true;
    revs[revisaoIdx].feita_em = new Date().toISOString();

    try {
        const res = await fetch(`${API_URL}/estudos/${estudoId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'X-Session-Token': sessionToken },
            body: JSON.stringify({ revisoes: JSON.stringify(revs) })
        });
        if (!res.ok) throw new Error();
        const saved = await res.json();
        const idx = estudos.findIndex(e => String(e.id) === String(estudoId));
        if (idx !== -1) estudos[idx] = saved;
        updateDashboard(); renderRevisoes();
        // Se modal detalhe estiver aberto, reabrir
        if (document.getElementById('modalDetalhe').style.display !== 'none') verEstudo(estudoId);
        showToast('Revisão concluída! ✅', 'success');
    } catch { showToast('Erro ao atualizar revisão', 'error'); }
};

// ============================================================
// QUESTÕES
// ============================================================
function populateQuestaoEstudoSelect(preId) {
    const sel = document.getElementById('fQuestaoEstudo');
    if (!sel) return;
    sel.innerHTML = estudos.map(e =>
        `<option value="${e.id}" ${String(e.id) === String(preId) ? 'selected' : ''}>${esc(e.curso)} — ${esc(e.conteudo)}</option>`
    ).join('');
}

window.abrirFormQuestao = function() {
    populateQuestaoEstudoSelect(null);
    document.getElementById('questaoEstudoId').value = '';
    document.getElementById('questaoIndex').value = -1;
    document.getElementById('fQuestaoPergunta').value = '';
    document.getElementById('fQuestaoResposta').value = '';
    document.getElementById('fDificuldade').value = 'MEDIA';
    document.getElementById('modalQuestao').style.display = 'flex';
};

window.abrirFormQuestaoParaEstudo = function(estudoId) {
    abrirFormQuestao();
    populateQuestaoEstudoSelect(estudoId);
};

window.fecharModalQuestao = function() { document.getElementById('modalQuestao').style.display = 'none'; };

window.submitQuestao = async function(event) {
    event.preventDefault();
    const estudoId = document.getElementById('fQuestaoEstudo').value;
    const estudo = estudos.find(e => String(e.id) === String(estudoId));
    if (!estudo) return;

    const novaQuestao = {
        pergunta: document.getElementById('fQuestaoPergunta').value.trim(),
        resposta: document.getElementById('fQuestaoResposta').value.trim(),
        dificuldade: document.getElementById('fDificuldade').value,
        status: 'PENDENTE',
        criada_em: new Date().toISOString()
    };

    const questoes = parseJSON(estudo.questoes);
    questoes.push(novaQuestao);

    try {
        const res = await fetch(`${API_URL}/estudos/${estudoId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'X-Session-Token': sessionToken },
            body: JSON.stringify({ questoes: JSON.stringify(questoes) })
        });
        if (!res.ok) throw new Error();
        const saved = await res.json();
        const idx = estudos.findIndex(e => String(e.id) === String(estudoId));
        if (idx !== -1) estudos[idx] = saved;
        renderQuestoes(); fecharModalQuestao();
        showToast('Questão registrada! ❓', 'success');
    } catch { showToast('Erro ao salvar questão', 'error'); }
};

function renderQuestoes() {
    const container = document.getElementById('questoesContainer');
    if (!container) return;

    const q = (document.getElementById('searchQuestao')?.value || '').toLowerCase();
    const status = document.getElementById('filterQuestaoStatus')?.value || '';
    const curso = document.getElementById('filterQuestaoCurso')?.value || '';

    let todasQuestoes = [];
    estudos.forEach(e => {
        const qs = parseJSON(e.questoes);
        qs.forEach((questao, i) => {
            todasQuestoes.push({ ...questao, estudoId: e.id, questaoIdx: i, curso: e.curso, conteudo: e.conteudo });
        });
    });

    if (curso) todasQuestoes = todasQuestoes.filter(x => x.curso === curso);
    if (status) todasQuestoes = todasQuestoes.filter(x => (x.status || 'PENDENTE') === status);
    if (q) todasQuestoes = todasQuestoes.filter(x => `${x.pergunta} ${x.resposta} ${x.conteudo}`.toLowerCase().includes(q));

    todasQuestoes.sort((a, b) => {
        if (a.status !== b.status) return a.status === 'PENDENTE' ? -1 : 1;
        const diffOrder = { ALTA: 0, MEDIA: 1, BAIXA: 2 };
        return (diffOrder[a.dificuldade] || 1) - (diffOrder[b.dificuldade] || 1);
    });

    if (todasQuestoes.length === 0) {
        container.innerHTML = `<div class="empty-state"><div class="empty-icon">❓</div><p>Nenhuma questão encontrada</p><button class="btn-primary" onclick="abrirFormQuestao()">Registrar Questão</button></div>`;
        return;
    }

    container.innerHTML = `
        <div style="padding:1rem 1.5rem; color:var(--text-secondary); font-size:.85rem; border-bottom:1px solid var(--border);">
            ${todasQuestoes.length} questão(ões) encontrada(s)
        </div>
        <div style="padding:1rem 1.5rem;">
        ${todasQuestoes.map((q, _) => `
            <div class="questao-card ${q.status === 'FEITA' ? 'feita' : ''}">
                <div class="questao-actions">
                    ${q.status !== 'FEITA' ? `<button class="action-btn done" onclick="marcarQuestaoFeita('${q.estudoId}', ${q.questaoIdx})" title="Marcar como feita">✓</button>` : ''}
                </div>
                <div class="qc-pergunta">${esc(q.pergunta)}</div>
                ${q.resposta ? `<div class="qc-resposta">💡 ${esc(q.resposta)}</div>` : ''}
                <div class="qc-meta">
                    <span class="badge ${q.status === 'FEITA' ? 'badge-concluido' : 'badge-pendente'}">${q.status === 'FEITA' ? 'Feita' : 'Pendente'}</span>
                    <span class="badge badge-gray"><span class="diff-dot diff-${q.dificuldade || 'MEDIA'}"></span> ${q.dificuldade || 'MEDIA'}</span>
                    <span style="font-size:.8rem;color:var(--text-muted)">${esc(q.curso)} — ${esc(q.conteudo)}</span>
                </div>
            </div>
        `).join('')}
        </div>`;
}

window.filterQuestoes = function() { renderQuestoes(); };

window.marcarQuestaoFeita = async function(estudoId, questaoIdx) {
    const estudo = estudos.find(e => String(e.id) === String(estudoId));
    if (!estudo) return;
    const questoes = parseJSON(estudo.questoes);
    if (!questoes[questaoIdx]) return;
    questoes[questaoIdx].status = 'FEITA';
    questoes[questaoIdx].feita_em = new Date().toISOString();

    try {
        const res = await fetch(`${API_URL}/estudos/${estudoId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'X-Session-Token': sessionToken },
            body: JSON.stringify({ questoes: JSON.stringify(questoes) })
        });
        if (!res.ok) throw new Error();
        const saved = await res.json();
        const idx = estudos.findIndex(e => String(e.id) === String(estudoId));
        if (idx !== -1) estudos[idx] = saved;
        renderQuestoes();
        if (document.getElementById('modalDetalhe').style.display !== 'none') verEstudo(estudoId);
        showToast('Questão marcada como feita! ✅', 'success');
    } catch { showToast('Erro ao atualizar questão', 'error'); }
};

// ============================================================
// MODAIS DE ALERTAS
// ============================================================
window.showAtrasosModal = function() {
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const atrasados = estudos.filter(e => getStatusAtual(e) === 'ATRASO');
    const body = document.getElementById('atrasosBody');
    if (!body) return;
    if (atrasados.length === 0) {
        body.innerHTML = `<div class="empty-state"><div class="empty-icon">🎉</div><p>Nenhum estudo em atraso!</p></div>`;
    } else {
        body.innerHTML = `<div style="padding:1rem 1.5rem;">` + atrasados.map(e => `
            <div style="padding:.75rem 0; border-bottom:1px solid var(--border); display:flex; gap:1rem; align-items:center;">
                <div style="flex:1;">
                    <div style="font-weight:600">${esc(e.conteudo)}</div>
                    <div style="font-size:.8rem; color:var(--text-secondary)">${esc(e.curso)}</div>
                </div>
                <div style="color:var(--danger); font-size:.85rem; font-weight:600">Prazo: ${formatDate(e.data_termino)}</div>
            </div>`).join('') + '</div>';
    }
    document.getElementById('modalAtrasos').style.display = 'flex';
};

window.showRevisoesModal = function() {
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const pendentes = [];
    estudos.forEach(e => {
        const revs = parseJSON(e.revisoes);
        revs.forEach(r => {
            if (!r.feita && new Date(r.data + 'T00:00:00') <= hoje) {
                pendentes.push({ ...r, curso: e.curso, conteudo: e.conteudo });
            }
        });
    });
    const body = document.getElementById('revisoesPendentesBody');
    if (!body) return;
    if (pendentes.length === 0) {
        body.innerHTML = `<div class="empty-state"><div class="empty-icon">🎉</div><p>Nenhuma revisão pendente!</p></div>`;
    } else {
        body.innerHTML = `<div style="padding:1rem 1.5rem;">` + pendentes.map(r => `
            <div style="padding:.75rem 0; border-bottom:1px solid var(--border); display:flex; gap:1rem; align-items:center;">
                <div style="flex:1;">
                    <div style="font-weight:600">${esc(r.conteudo)}</div>
                    <div style="font-size:.8rem; color:var(--text-secondary)">${esc(r.curso)} · ${tipoRevisaoLabel(r.tipo)}</div>
                </div>
                <div style="color:var(--danger); font-size:.85rem; font-weight:600">${formatDate(r.data)}</div>
            </div>`).join('') + '</div>';
    }
    document.getElementById('modalRevisoesPendentes').style.display = 'flex';
};

// ============================================================
// NOTIFICAÇÕES (Push Web Notifications)
// ============================================================
function checkNotificacoes() {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
        Notification.requestPermission();
    }
    verificarAlertas();
    setInterval(verificarAlertas, 3600000); // verifica a cada hora
}

function verificarAlertas() {
    if (Notification.permission !== 'granted') return;
    const hoje = new Date(); hoje.setHours(0,0,0,0);

    let totalAtrasos = 0, totalRevisoes = 0;

    estudos.forEach(e => {
        if (getStatusAtual(e) === 'ATRASO') totalAtrasos++;
        const revs = parseJSON(e.revisoes);
        revs.forEach(r => {
            if (!r.feita && new Date(r.data + 'T00:00:00') <= hoje) totalRevisoes++;
        });
    });

    const key = `notif_${new Date().toDateString()}`;
    if ((totalAtrasos > 0 || totalRevisoes > 0) && !sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, '1');
        let msg = '';
        if (totalAtrasos > 0) msg += `${totalAtrasos} estudo(s) em atraso! `;
        if (totalRevisoes > 0) msg += `${totalRevisoes} revisão(ões) pendente(s)!`;
        new Notification('🎓 Jornada Acadêmica', { body: msg, icon: '/favicon.ico' });
    }
}

// ============================================================
// MÊS
// ============================================================
window.changeMonth = function(dir) {
    currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + dir, 1);
    updateMonthLabel();
    filterEstudos();
    updateDashboard();
};

function updateMonthLabel() {
    const label = document.getElementById('currentMonthLabel');
    if (label) label.textContent = `${meses[currentMonth.getMonth()]} ${currentMonth.getFullYear()}`;
}

// ============================================================
// CONFIRM MODAL
// ============================================================
window.showConfirm = function(message, options = {}) {
    return new Promise(resolve => {
        const { title = 'Confirmar', confirmText = 'Confirmar', cancelText = 'Cancelar' } = options;
        document.getElementById('confirmTitle').textContent = title;
        document.getElementById('confirmMessage').textContent = message;
        document.getElementById('confirmOk').textContent = confirmText;
        document.getElementById('confirmCancel').textContent = cancelText;
        document.getElementById('confirmModal').style.display = 'flex';
        document.getElementById('confirmOk').onclick = () => { document.getElementById('confirmModal').style.display = 'none'; resolve(true); };
        document.getElementById('confirmCancel').onclick = () => { document.getElementById('confirmModal').style.display = 'none'; resolve(false); };
    });
};

// ============================================================
// HELPERS
// ============================================================
function formatDate(d) {
    if (!d) return '—';
    const date = new Date(d + 'T00:00:00');
    return date.toLocaleDateString('pt-BR');
}

function statusBadge(s) {
    const map = { PENDENTE: ['badge-pendente', '⏳ Pendente'], ATRASO: ['badge-atraso', '⚠️ Atraso'], CONCLUIDO: ['badge-concluido', '✅ Concluído'] };
    const [cls, txt] = map[s] || ['badge-gray', s];
    return `<span class="badge ${cls}">${txt}</span>`;
}

function tipoRevisaoLabel(tipo) {
    const m = { REVISAO_1: '1ª Revisão', REVISAO_2: '2ª Revisão', REVISAO_3: '3ª Revisão', REVISAO_FINAL: 'Revisão Final' };
    return m[tipo] || tipo || 'Revisão';
}

function parseJSON(val) {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    try { return JSON.parse(val); } catch { return []; }
}

function esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}

function showToast(message, type = 'info') {
    document.querySelectorAll('.floating-message').forEach(m => m.remove());
    const el = document.createElement('div');
    el.className = `floating-message ${type}`;
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => {
        el.style.animation = 'slideOutBottom 0.3s ease forwards';
        setTimeout(() => el.remove(), 300);
    }, 3000);
}

// Fechar modais clicando fora
document.addEventListener('click', e => {
    const modais = ['modalEstudo', 'modalDetalhe', 'modalRevisao', 'modalQuestao', 'modalAtrasos', 'modalRevisoesPendentes'];
    modais.forEach(id => {
        const modal = document.getElementById(id);
        if (modal && modal.style.display !== 'none' && e.target === modal) {
            modal.style.display = 'none';
        }
    });
});

console.log('✅ Jornada Acadêmica carregado!');
