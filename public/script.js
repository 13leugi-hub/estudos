// ============================================================
// JORNADA ACADÊMICA — script.js
// Visual idêntico ao Controle de Frete
// ============================================================

const API_URL = window.location.origin + '/api';

let estudos = [];
let isOnline = false;
let currentMonth = new Date();
let calendarYear = new Date().getFullYear();

const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const mesesAbrev = ['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];

console.log('✅ Jornada Acadêmica iniciado');
console.log('📍 API URL:', API_URL);

// ============================================================
// INICIALIZAÇÃO
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    updateMonthLabel();
    inicializarApp();
    setTimeout(setupEventDelegation, 100);
});

async function inicializarApp() {
    await carregarEstudos();
    checkNotificacoes();
    setInterval(carregarEstudos, 60000);
}

// ============================================================
// EVENT DELEGATION — checkbox igual ao Controle de Frete
// ============================================================
function setupEventDelegation() {
    document.body.addEventListener('change', function(e) {
        if (e.target.type === 'checkbox' && e.target.classList.contains('styled-checkbox')) {
            const row = e.target.closest('tr[data-id]');
            if (row) {
                const id = row.getAttribute('data-id');
                handleCheckboxChange(id);
            }
        }
    });
}

// ============================================================
// CARREGAR / SINCRONIZAR
// ============================================================
async function carregarEstudos() {
    try {
        const res = await fetch(`${API_URL}/estudos`, { headers: { 'Accept': 'application/json' } });
        if (!res.ok) throw new Error('Erro de rede');
        estudos = await res.json();
        isOnline = true;
        updateConnectionStatus(true);
        localStorage.setItem('estudos_cache', JSON.stringify(estudos));
    } catch (error) {
        console.warn('Offline:', error.message);
        isOnline = false;
        updateConnectionStatus(false);
        const cached = localStorage.getItem('estudos_cache');
        if (cached) estudos = JSON.parse(cached);
    }
    updateDashboard();
    filterEstudos();
    updateCursoFilters();
}

window.sincronizar = async function() {
    await carregarEstudos();
    showToast('Dados sincronizados', 'success');
};

function updateConnectionStatus(online) {
    const el = document.getElementById('connectionStatus');
    if (!el) return;
    if (online) {
        el.className = 'connection-status online';
    } else {
        el.className = 'connection-status offline';
    }
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

    let pendente = 0, atraso = 0, concluido = 0, revisoesPend = 0, questoesPend = 0;

    doMes.forEach(e => {
        const s = getStatusAtual(e);
        if (s === 'PENDENTE') pendente++;
        else if (s === 'ATRASO') atraso++;
        else if (s === 'CONCLUIDO') concluido++;

        parseJSON(e.revisoes).forEach(r => {
            if (!r.feita && new Date(r.data + 'T00:00:00') <= hoje) revisoesPend++;
        });

        parseJSON(e.questoes).forEach(q => {
            if ((q.status || 'PENDENTE') === 'PENDENTE') questoesPend++;
        });
    });

    setText('statPendente', pendente);
    setText('statAtraso', atraso);
    setText('statConcluido', concluido);
    setText('statRevisoes', revisoesPend);
    setText('statQuestoes', questoesPend);

    // Alerta visual no card de atrasos (igual ao frete)
    const cardAtrasos = document.getElementById('cardAtrasos');
    if (cardAtrasos) {
        let badge = cardAtrasos.querySelector('.pulse-badge');
        if (atraso > 0) {
            cardAtrasos.classList.add('has-alert');
            if (!badge) {
                badge = document.createElement('div');
                badge.className = 'pulse-badge';
                cardAtrasos.style.position = 'relative';
                cardAtrasos.appendChild(badge);
            }
            badge.textContent = atraso;
        } else {
            cardAtrasos.classList.remove('has-alert');
            if (badge) badge.remove();
        }
    }
}

// ============================================================
// STATUS CALCULADO
// ============================================================
function getStatusAtual(estudo) {
    if (estudo.status === 'CONCLUIDO') return 'CONCLUIDO';
    if (estudo.data_termino) {
        const hoje = new Date(); hoje.setHours(0,0,0,0);
        const t = new Date(estudo.data_termino + 'T00:00:00');
        if (t < hoje) return 'ATRASO';
    }
    return 'PENDENTE';
}

// ============================================================
// FILTROS
// ============================================================
function updateCursoFilters() {
    const cursos = [...new Set(estudos.map(e => e.curso).filter(Boolean))].sort();
    ['filterCurso', 'filterQuestaoCurso'].forEach(id => {
        const sel = document.getElementById(id);
        if (!sel) return;
        const cur = sel.value;
        sel.innerHTML = `<option value="">${id === 'filterCurso' ? 'Todos os Cursos' : 'Todos os Cursos'}</option>` +
            cursos.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
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
        if (status && getStatusAtual(e) !== status) return false;
        if (q && !`${e.curso} ${e.unidade} ${e.conteudo}`.toLowerCase().includes(q)) return false;
        return true;
    });

    renderTabela(filtered);
};

// ============================================================
// RENDER TABELA — idêntica ao Controle de Frete
// ============================================================
function renderTabela(list) {
    const container = document.getElementById('estudosContainer');
    if (!container) return;

    if (list.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📖</div>
                <p>Nenhum estudo encontrado neste mês</p>
                <button onclick="abrirFormEstudo()" class="register">+ Registrar Estudo</button>
            </div>`;
        return;
    }

    const hoje = new Date(); hoje.setHours(0,0,0,0);

    const rows = list.map(e => {
        const s = getStatusAtual(e);
        const revs = parseJSON(e.revisoes);
        const questoes = parseJSON(e.questoes);
        const pendRevs = revs.filter(r => !r.feita && new Date(r.data + 'T00:00:00') <= hoje).length;
        const pendQues = questoes.filter(q => (q.status || 'PENDENTE') === 'PENDENTE').length;

        const rowClass = s === 'CONCLUIDO' ? 'row-concluido' : s === 'ATRASO' ? 'row-atraso' : '';

        return `
        <tr data-id="${e.id}" class="${rowClass}">
            <td>
                <div class="checkbox-wrapper">
                    <input type="checkbox" class="styled-checkbox" id="chk_${e.id}"
                        ${s === 'CONCLUIDO' ? 'checked' : ''}>
                    <label class="checkbox-label-styled" for="chk_${e.id}"></label>
                </div>
            </td>
            <td><strong>${esc(e.curso)}</strong></td>
            <td>${esc(e.unidade || '—')}</td>
            <td>${esc(e.conteudo)}</td>
            <td style="white-space:nowrap">${formatDate(e.data_inicio)}</td>
            <td style="white-space:nowrap">${formatDate(e.data_termino)}</td>
            <td>${getStatusBadge(s)}</td>
            <td>
                ${pendRevs > 0
                    ? `<span class="badge revisao-pendente">⚠ ${pendRevs} rev.</span>`
                    : revs.length > 0
                        ? `<span class="badge badge-feita">✓ ${revs.filter(r=>r.feita).length}/${revs.length}</span>`
                        : '—'
                }
            </td>
            <td>
                ${pendQues > 0
                    ? `<span class="badge atraso">${pendQues} pend.</span>`
                    : questoes.length > 0
                        ? `<span class="badge badge-feita">✓ ${questoes.filter(q=>q.status==='FEITA').length}/${questoes.length}</span>`
                        : '—'
                }
            </td>
            <td class="actions-cell" style="text-align:center; white-space:nowrap;">
                <button class="action-btn view" onclick="verEstudo('${e.id}')" title="Ver detalhes">Ver</button>
                <button class="action-btn edit" onclick="editarEstudo('${e.id}')" title="Editar">Editar</button>
                <button class="action-btn add" onclick="abrirFormRevisao('${e.id}')" title="Agendar revisão">Rev.</button>
                <button class="action-btn delete" onclick="excluirEstudo('${e.id}')" title="Excluir">Excluir</button>
            </td>
        </tr>`;
    }).join('');

    container.innerHTML = `
        <div style="overflow-x:auto;">
            <table>
                <thead>
                    <tr>
                        <th style="width:50px">✓</th>
                        <th>Curso</th>
                        <th>Unidade</th>
                        <th>Conteúdo</th>
                        <th>Início</th>
                        <th>Término</th>
                        <th>Status</th>
                        <th>Revisões</th>
                        <th>Questões</th>
                        <th>Ações</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>`;
}

// ============================================================
// CHECKBOX HANDLER — idêntico ao Controle de Frete
// ============================================================
async function handleCheckboxChange(id) {
    const idStr = String(id);
    const estudo = estudos.find(e => String(e.id) === idStr);
    if (!estudo) return;

    const statusAtual = getStatusAtual(estudo);
    const novoStatus = statusAtual === 'CONCLUIDO' ? 'PENDENTE' : 'CONCLUIDO';

    // Atualiza local
    const idx = estudos.findIndex(e => String(e.id) === idStr);
    if (idx !== -1) estudos[idx].status = novoStatus;
    updateDashboard();
    filterEstudos();

    try {
        const res = await fetch(`${API_URL}/estudos/${idStr}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ status: novoStatus })
        });
        if (!res.ok) throw new Error();
        const saved = await res.json();
        if (idx !== -1) estudos[idx] = saved;
        updateDashboard();
        filterEstudos();
        showToast(novoStatus === 'CONCLUIDO' ? '🎉 Estudo concluído!' : 'Estudo reaberto', 'success');
    } catch {
        // Reverte
        if (idx !== -1) estudos[idx].status = statusAtual === 'CONCLUIDO' ? 'CONCLUIDO' : 'PENDENTE';
        updateDashboard(); filterEstudos();
        showToast('Erro ao salvar', 'error');
    }
}

// ============================================================
// VER ESTUDO (MODAL DETALHE COM ABAS)
// ============================================================
window.verEstudo = function(id) {
    const e = estudos.find(x => String(x.id) === String(id));
    if (!e) return;

    const revs = parseJSON(e.revisoes);
    const questoes = parseJSON(e.questoes);
    const obs = parseJSON(e.observacoes);
    const hoje = new Date(); hoje.setHours(0,0,0,0);

    // Informações gerais
    const infoHtml = `
        <div class="info-section">
            <h4>Dados do Estudo</h4>
            <p><strong>Curso:</strong> ${esc(e.curso)}</p>
            <p><strong>Unidade:</strong> ${esc(e.unidade || '—')}</p>
            <p><strong>Conteúdo:</strong> ${esc(e.conteudo)}</p>
            <p><strong>Início:</strong> ${formatDate(e.data_inicio)}</p>
            <p><strong>Término Previsto:</strong> ${formatDate(e.data_termino)}</p>
            <p><strong>Status:</strong> ${getStatusBadge(getStatusAtual(e))}</p>
        </div>
        ${obs.length > 0 ? `
        <div class="info-section">
            <h4>Observações</h4>
            <div class="observacoes-list">
                ${obs.map(o => `
                    <div class="observacao-item">
                        <div class="observacao-header">
                            <div class="observacao-info">
                                <span class="observacao-data">${formatDate(o.data?.split('T')[0] || '')}</span>
                            </div>
                        </div>
                        <p class="observacao-texto">${esc(o.texto || o)}</p>
                    </div>`).join('')}
            </div>
        </div>` : ''}`;

    // Revisões
    const revisoesHtml = `
        <div class="observacoes-section">
            <div class="observacoes-list">
                ${revs.length === 0
                    ? '<p style="text-align:center; color:var(--text-secondary); padding:2rem">Nenhuma revisão agendada.</p>'
                    : revs.map((r, i) => {
                        const rd = new Date(r.data + 'T00:00:00');
                        const atrasada = !r.feita && rd < hoje;
                        return `
                        <div class="observacao-item">
                            <div class="observacao-header">
                                <div class="observacao-info">
                                    <span class="observacao-data" style="${atrasada ? 'color:var(--danger-color)' : ''}">${formatDate(r.data)}</span>
                                    <span class="observacao-username">${tipoRevisaoLabel(r.tipo)}</span>
                                    ${atrasada ? '<span class="badge atraso" style="font-size:0.7rem">Atrasada</span>' : ''}
                                    ${r.feita ? '<span class="badge concluido" style="font-size:0.7rem">Feita</span>' : ''}
                                </div>
                                ${!r.feita ? `<button class="action-btn done small" onclick="marcarRevisaoFeita('${e.id}', ${i})" style="font-size:0.75rem; min-width:unset; padding:4px 8px">✓ Feita</button>` : ''}
                            </div>
                            ${r.nota ? `<p class="observacao-texto" style="font-style:italic">"${esc(r.nota)}"</p>` : ''}
                        </div>`;
                    }).join('')
                }
            </div>
            <div class="nova-observacao">
                <button onclick="fecharModalDetalhe(); abrirFormRevisao('${e.id}')" class="btn-add-obs small">+ Agendar Revisão</button>
            </div>
        </div>`;

    // Questões
    const questoesHtml = `
        <div class="observacoes-section">
            <div class="observacoes-list">
                ${questoes.length === 0
                    ? '<p style="text-align:center; color:var(--text-secondary); padding:2rem">Nenhuma questão registrada.</p>'
                    : questoes.map((q, i) => `
                        <div class="observacao-item" style="opacity:${q.status === 'FEITA' ? '0.5' : '1'}">
                            <div class="observacao-header">
                                <div class="observacao-info">
                                    <span class="badge ${q.status === 'FEITA' ? 'badge-feita' : 'pendente'}" style="font-size:0.7rem">${q.status === 'FEITA' ? 'Feita' : 'Pendente'}</span>
                                    <span class="observacao-username"><span class="diff-dot diff-${q.dificuldade || 'MEDIA'}"></span>${q.dificuldade || 'MEDIA'}</span>
                                </div>
                                ${q.status !== 'FEITA' ? `<button class="action-btn done small" onclick="marcarQuestaoFeita('${e.id}', ${i})" style="font-size:0.75rem; min-width:unset; padding:4px 8px">✓ Feita</button>` : ''}
                            </div>
                            <p class="observacao-texto" style="margin-top:0.5rem; font-weight:500">${esc(q.pergunta)}</p>
                            ${q.resposta ? `<p class="observacao-texto" style="margin-top:0.35rem; color:var(--text-secondary)">💡 ${esc(q.resposta)}</p>` : ''}
                        </div>`).join('')
                }
            </div>
            <div class="nova-observacao">
                <button onclick="fecharModalDetalhe(); abrirFormQuestaoParaEstudo('${e.id}')" class="btn-add-obs small">+ Registrar Questão</button>
            </div>
        </div>`;

    document.getElementById('detalheTitle').textContent = `${e.curso} — ${e.conteudo}`;
    document.getElementById('detalheBody').innerHTML = `
        <div class="tabs-container">
            <div class="tabs-nav">
                <button class="tab-btn active" onclick="switchTab(this, 'tabInfo')">Informações</button>
                <button class="tab-btn" onclick="switchTab(this, 'tabRevisoes')">Revisões (${revs.length})</button>
                <button class="tab-btn" onclick="switchTab(this, 'tabQuestoes')">Questões (${questoes.length})</button>
            </div>
            <div id="tabInfo" class="tab-content active">${infoHtml}</div>
            <div id="tabRevisoes" class="tab-content">${revisoesHtml}</div>
            <div id="tabQuestoes" class="tab-content">${questoesHtml}</div>
        </div>`;

    document.getElementById('btnEditarDetalhe').onclick = () => { fecharModalDetalhe(); editarEstudo(id); };
    document.getElementById('modalDetalhe').style.display = 'flex';
};

window.switchTab = function(btn, tabId) {
    btn.closest('.tabs-container').querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.closest('.tabs-container').querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(tabId)?.classList.add('active');
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
    setTimeout(() => document.getElementById('fCurso').focus(), 100);
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
    document.getElementById('fObservacao').value = obs[0]?.texto || '';
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
        status: 'PENDENTE'
    };
    if (!id) { payload.revisoes = '[]'; payload.questoes = '[]'; }

    try {
        const res = await fetch(id ? `${API_URL}/estudos/${id}` : `${API_URL}/estudos`, {
            method: id ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Erro'); }
        const saved = await res.json();
        if (id) {
            const idx = estudos.findIndex(e => String(e.id) === String(id));
            if (idx !== -1) estudos[idx] = saved;
        } else {
            estudos.unshift(saved);
        }
        updateDashboard(); filterEstudos(); updateCursoFilters();
        fecharModalEstudo();
        showToast(id ? 'Estudo atualizado!' : 'Estudo registrado! 📚', 'success');
    } catch (err) { showToast('Erro: ' + err.message, 'error'); }
};

// ============================================================
// EXCLUIR
// ============================================================
window.excluirEstudo = async function(id) {
    const e = estudos.find(x => String(x.id) === String(id));
    const confirmado = await showConfirm(`Tem certeza que deseja excluir "${e?.conteudo}"?`);
    if (!confirmado) return;

    const backup = [...estudos];
    estudos = estudos.filter(x => String(x.id) !== String(id));
    updateDashboard(); filterEstudos(); updateCursoFilters();
    showToast('Estudo excluído', 'success');

    try {
        await fetch(`${API_URL}/estudos/${id}`, { method: 'DELETE' });
    } catch {
        estudos = backup;
        updateDashboard(); filterEstudos();
        showToast('Erro ao excluir no servidor', 'error');
    }
};

// ============================================================
// REVISÕES
// ============================================================
function populateRevisaoSelect(preId) {
    const sel = document.getElementById('fRevisaoEstudo');
    if (!sel) return;
    sel.innerHTML = estudos.map(e =>
        `<option value="${e.id}" ${String(e.id) === String(preId) ? 'selected' : ''}>${esc(e.curso)} — ${esc(e.conteudo)}</option>`
    ).join('');
}

window.abrirFormRevisao = function(preEstudoId) {
    populateRevisaoSelect(preEstudoId);
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

    const revs = parseJSON(estudo.revisoes);
    revs.push({
        data: document.getElementById('fRevisaoData').value,
        tipo: document.getElementById('fRevisaoTipo').value,
        nota: document.getElementById('fRevisaoNota').value.trim(),
        feita: false,
        criada_em: new Date().toISOString()
    });

    try {
        const res = await fetch(`${API_URL}/estudos/${estudoId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ revisoes: JSON.stringify(revs) })
        });
        if (!res.ok) throw new Error();
        const saved = await res.json();
        const idx = estudos.findIndex(e => String(e.id) === String(estudoId));
        if (idx !== -1) estudos[idx] = saved;
        updateDashboard(); filterEstudos();
        fecharModalRevisao();
        showToast('Revisão agendada! 🔄', 'success');
    } catch { showToast('Erro ao agendar revisão', 'error'); }
};

window.marcarRevisaoFeita = async function(estudoId, idx) {
    const estudo = estudos.find(e => String(e.id) === String(estudoId));
    if (!estudo) return;
    const revs = parseJSON(estudo.revisoes);
    if (!revs[idx]) return;
    revs[idx].feita = true;
    revs[idx].feita_em = new Date().toISOString();

    try {
        const res = await fetch(`${API_URL}/estudos/${estudoId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ revisoes: JSON.stringify(revs) })
        });
        if (!res.ok) throw new Error();
        const saved = await res.json();
        const i = estudos.findIndex(e => String(e.id) === String(estudoId));
        if (i !== -1) estudos[i] = saved;
        updateDashboard(); filterEstudos();
        if (document.getElementById('modalDetalhe').style.display !== 'none') verEstudo(estudoId);
        if (document.getElementById('modalTodasRevisoes').style.display !== 'none') renderTodasRevisoes();
        showToast('Revisão concluída! ✅', 'success');
    } catch { showToast('Erro ao atualizar revisão', 'error'); }
};

// View de todas revisões
window.abrirViewRevisoes = function() {
    renderTodasRevisoes();
    document.getElementById('modalTodasRevisoes').style.display = 'flex';
};

function renderTodasRevisoes() {
    const body = document.getElementById('todasRevisoesBody');
    if (!body) return;
    const hoje = new Date(); hoje.setHours(0,0,0,0);

    let todas = [];
    estudos.forEach(e => {
        parseJSON(e.revisoes).forEach((r, i) => {
            todas.push({ ...r, estudoId: e.id, rIdx: i, curso: e.curso, conteudo: e.conteudo });
        });
    });
    todas.sort((a, b) => {
        if (a.feita !== b.feita) return a.feita ? 1 : -1;
        return new Date(a.data) - new Date(b.data);
    });

    if (todas.length === 0) {
        body.innerHTML = '<div class="empty-state"><div class="empty-icon">🔄</div><p>Nenhuma revisão agendada.</p></div>';
        return;
    }

    const pendentes = todas.filter(r => !r.feita);
    const feitas = todas.filter(r => r.feita);

    const renderGroup = (list, label) => {
        if (!list.length) return '';
        return `
            <div style="margin-bottom:1.5rem;">
                <h4 style="color:var(--primary); margin-bottom:0.75rem; padding-bottom:0.5rem; border-bottom:2px solid var(--border-color);">${label} (${list.length})</h4>
                <div class="observacoes-list">
                    ${list.map(r => {
                        const atrasada = !r.feita && new Date(r.data + 'T00:00:00') < hoje;
                        return `
                        <div class="observacao-item">
                            <div class="observacao-header">
                                <div class="observacao-info">
                                    <span class="observacao-data" style="${atrasada ? 'color:var(--danger-color)' : ''}">${formatDate(r.data)}</span>
                                    <span class="observacao-username">${tipoRevisaoLabel(r.tipo)}</span>
                                    ${atrasada ? '<span class="badge atraso" style="font-size:0.7rem">Atrasada</span>' : ''}
                                    ${r.feita ? '<span class="badge concluido" style="font-size:0.7rem">Feita</span>' : ''}
                                </div>
                                ${!r.feita ? `<button class="action-btn done small" onclick="marcarRevisaoFeita('${r.estudoId}', ${r.rIdx})" style="font-size:0.75rem; min-width:unset; padding:4px 8px">✓ Feita</button>` : ''}
                            </div>
                            <p class="observacao-texto">${esc(r.conteudo)} <span style="color:var(--text-secondary)">— ${esc(r.curso)}</span></p>
                            ${r.nota ? `<p class="observacao-texto" style="margin-top:0.25rem; font-style:italic; color:var(--text-secondary)">"${esc(r.nota)}"</p>` : ''}
                        </div>`;
                    }).join('')}
                </div>
            </div>`;
    };

    body.innerHTML = renderGroup(pendentes, 'Pendentes') + renderGroup(feitas, 'Concluídas');
}

// ============================================================
// QUESTÕES
// ============================================================
function populateQuestaoSelect(preId) {
    const sel = document.getElementById('fQuestaoEstudo');
    if (!sel) return;
    sel.innerHTML = estudos.map(e =>
        `<option value="${e.id}" ${String(e.id) === String(preId) ? 'selected' : ''}>${esc(e.curso)} — ${esc(e.conteudo)}</option>`
    ).join('');
}

window.abrirFormQuestao = function() {
    populateQuestaoSelect(null);
    document.getElementById('fQuestaoPergunta').value = '';
    document.getElementById('fQuestaoResposta').value = '';
    document.getElementById('fDificuldade').value = 'MEDIA';
    document.getElementById('modalQuestao').style.display = 'flex';
    setTimeout(() => document.getElementById('fQuestaoPergunta').focus(), 100);
};

window.abrirFormQuestaoParaEstudo = function(estudoId) {
    abrirFormQuestao();
    populateQuestaoSelect(estudoId);
};

window.fecharModalQuestao = function() { document.getElementById('modalQuestao').style.display = 'none'; };

window.submitQuestao = async function(event) {
    event.preventDefault();
    const estudoId = document.getElementById('fQuestaoEstudo').value;
    const estudo = estudos.find(e => String(e.id) === String(estudoId));
    if (!estudo) return;

    const questoes = parseJSON(estudo.questoes);
    questoes.push({
        pergunta: document.getElementById('fQuestaoPergunta').value.trim(),
        resposta: document.getElementById('fQuestaoResposta').value.trim(),
        dificuldade: document.getElementById('fDificuldade').value,
        status: 'PENDENTE',
        criada_em: new Date().toISOString()
    });

    try {
        const res = await fetch(`${API_URL}/estudos/${estudoId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ questoes: JSON.stringify(questoes) })
        });
        if (!res.ok) throw new Error();
        const saved = await res.json();
        const idx = estudos.findIndex(e => String(e.id) === String(estudoId));
        if (idx !== -1) estudos[idx] = saved;
        updateDashboard(); filterEstudos();
        fecharModalQuestao();
        showToast('Questão registrada! ❓', 'success');
    } catch { showToast('Erro ao salvar questão', 'error'); }
};

window.marcarQuestaoFeita = async function(estudoId, qIdx) {
    const estudo = estudos.find(e => String(e.id) === String(estudoId));
    if (!estudo) return;
    const questoes = parseJSON(estudo.questoes);
    if (!questoes[qIdx]) return;
    questoes[qIdx].status = 'FEITA';
    questoes[qIdx].feita_em = new Date().toISOString();

    try {
        const res = await fetch(`${API_URL}/estudos/${estudoId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ questoes: JSON.stringify(questoes) })
        });
        if (!res.ok) throw new Error();
        const saved = await res.json();
        const idx = estudos.findIndex(e => String(e.id) === String(estudoId));
        if (idx !== -1) estudos[idx] = saved;
        updateDashboard(); filterEstudos();
        if (document.getElementById('modalDetalhe').style.display !== 'none') verEstudo(estudoId);
        if (document.getElementById('modalBancoQuestoes').style.display !== 'none') renderBancoQuestoes();
        showToast('Questão feita! ✅', 'success');
    } catch { showToast('Erro ao atualizar questão', 'error'); }
};

window.abrirViewQuestoes = function() {
    updateCursoFilters();
    renderBancoQuestoes();
    document.getElementById('modalBancoQuestoes').style.display = 'flex';
};

window.renderBancoQuestoes = function() {
    const body = document.getElementById('bancoQuestoesBody');
    if (!body) return;

    const q = (document.getElementById('searchQuestao')?.value || '').toLowerCase();
    const status = document.getElementById('filterQuestaoStatus')?.value || '';
    const curso = document.getElementById('filterQuestaoCurso')?.value || '';

    let todas = [];
    estudos.forEach(e => {
        parseJSON(e.questoes).forEach((questao, i) => {
            todas.push({ ...questao, estudoId: e.id, qIdx: i, curso: e.curso, conteudo: e.conteudo });
        });
    });

    if (curso) todas = todas.filter(x => x.curso === curso);
    if (status) todas = todas.filter(x => (x.status || 'PENDENTE') === status);
    if (q) todas = todas.filter(x => `${x.pergunta} ${x.resposta} ${x.conteudo} ${x.curso}`.toLowerCase().includes(q));
    todas.sort((a, b) => {
        if (a.status !== b.status) return a.status === 'PENDENTE' ? -1 : 1;
        const d = { ALTA: 0, MEDIA: 1, BAIXA: 2 };
        return (d[a.dificuldade] ?? 1) - (d[b.dificuldade] ?? 1);
    });

    if (todas.length === 0) {
        body.innerHTML = '<div class="empty-state"><div class="empty-icon">❓</div><p>Nenhuma questão encontrada.</p></div>';
        return;
    }

    body.innerHTML = `
        <p style="color:var(--text-secondary); font-size:0.85rem; margin-bottom:1rem;">${todas.length} questão(ões) · ${todas.filter(x=>x.status!=='FEITA').length} pendente(s)</p>
        <div class="observacoes-list">
            ${todas.map(q => `
                <div class="observacao-item" style="opacity:${q.status === 'FEITA' ? '0.55' : '1'}">
                    <div class="observacao-header">
                        <div class="observacao-info">
                            <span class="badge ${q.status === 'FEITA' ? 'badge-feita' : 'pendente'}" style="font-size:0.7rem">${q.status === 'FEITA' ? 'Feita' : 'Pendente'}</span>
                            <span class="observacao-username"><span class="diff-dot diff-${q.dificuldade || 'MEDIA'}"></span>${q.dificuldade || 'MEDIA'}</span>
                            <span class="observacao-data">${esc(q.curso)} — ${esc(q.conteudo)}</span>
                        </div>
                        ${q.status !== 'FEITA' ? `<button class="action-btn done small" onclick="marcarQuestaoFeita('${q.estudoId}', ${q.qIdx})" style="font-size:0.75rem; min-width:unset; padding:4px 8px">✓ Feita</button>` : ''}
                    </div>
                    <p class="observacao-texto" style="margin-top:0.5rem; font-weight:500">${esc(q.pergunta)}</p>
                    ${q.resposta ? `<p class="observacao-texto" style="margin-top:0.35rem; color:var(--text-secondary)">💡 ${esc(q.resposta)}</p>` : ''}
                </div>`).join('')}
        </div>`;
};

// ============================================================
// MODAIS DE ALERTAS
// ============================================================
window.showAtrasosModal = function() {
    const atrasados = estudos.filter(e => getStatusAtual(e) === 'ATRASO');
    const body = document.getElementById('atrasosBody');
    if (!body) return;

    body.innerHTML = atrasados.length === 0
        ? '<div style="text-align:center; padding:2rem; color:var(--text-secondary)"><p style="font-size:1.1rem; font-weight:600">Nenhum estudo em atraso! 🎉</p></div>'
        : `<div style="overflow-x:auto;"><table>
                <thead><tr><th>Curso</th><th>Conteúdo</th><th>Término</th></tr></thead>
                <tbody>
                    ${atrasados.map(e => `
                        <tr>
                            <td><strong>${esc(e.curso)}</strong></td>
                            <td>${esc(e.conteudo)}</td>
                            <td style="color:var(--danger-color); font-weight:600; white-space:nowrap">${formatDate(e.data_termino)}</td>
                        </tr>`).join('')}
                </tbody>
            </table></div>`;

    document.getElementById('modalAtrasos').style.display = 'flex';
};

window.showRevisoesModal = function() {
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const pendentes = [];
    estudos.forEach(e => {
        parseJSON(e.revisoes).forEach(r => {
            if (!r.feita && new Date(r.data + 'T00:00:00') <= hoje)
                pendentes.push({ ...r, curso: e.curso, conteudo: e.conteudo });
        });
    });
    pendentes.sort((a, b) => new Date(a.data) - new Date(b.data));

    const body = document.getElementById('revisoesPendentesBody');
    if (!body) return;

    body.innerHTML = pendentes.length === 0
        ? '<div style="text-align:center; padding:2rem; color:var(--text-secondary)"><p style="font-size:1.1rem; font-weight:600">Nenhuma revisão pendente! 🎉</p></div>'
        : `<div style="overflow-x:auto;"><table>
                <thead><tr><th>Data</th><th>Curso</th><th>Conteúdo</th><th>Tipo</th></tr></thead>
                <tbody>
                    ${pendentes.map(r => `
                        <tr>
                            <td style="color:var(--danger-color); font-weight:600; white-space:nowrap">${formatDate(r.data)}</td>
                            <td><strong>${esc(r.curso)}</strong></td>
                            <td>${esc(r.conteudo)}</td>
                            <td>${tipoRevisaoLabel(r.tipo)}</td>
                        </tr>`).join('')}
                </tbody>
            </table></div>`;

    document.getElementById('modalRevisoesPendentes').style.display = 'flex';
};

// ============================================================
// NOTIFICAÇÕES WEB PUSH
// ============================================================
function checkNotificacoes() {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
        Notification.requestPermission().then(p => { if (p === 'granted') disparaNotificacoes(); });
    } else if (Notification.permission === 'granted') {
        disparaNotificacoes();
    }
    setInterval(disparaNotificacoes, 3600000);
}

function disparaNotificacoes() {
    if (Notification.permission !== 'granted') return;
    const key = `notif_${new Date().toDateString()}`;
    if (sessionStorage.getItem(key)) return;
    const hoje = new Date(); hoje.setHours(0,0,0,0);

    let totalAtrasos = 0, totalRevPend = 0;
    estudos.forEach(e => {
        if (getStatusAtual(e) === 'ATRASO') totalAtrasos++;
        parseJSON(e.revisoes).forEach(r => {
            if (!r.feita && new Date(r.data + 'T00:00:00') <= hoje) totalRevPend++;
        });
    });

    if (totalAtrasos > 0 || totalRevPend > 0) {
        sessionStorage.setItem(key, '1');
        let msg = '';
        if (totalAtrasos > 0) msg += `${totalAtrasos} estudo(s) em atraso! `;
        if (totalRevPend > 0) msg += `${totalRevPend} revisão(ões) para fazer!`;
        new Notification('🎓 Jornada Acadêmica', { body: msg.trim() });
    }
}

// ============================================================
// MÊS E CALENDÁRIO
// ============================================================
window.changeMonth = function(dir) {
    currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + dir, 1);
    updateMonthLabel();
    filterEstudos();
    updateDashboard();
};

function updateMonthLabel() {
    const el = document.getElementById('currentMonthLabel');
    if (el) el.textContent = `${meses[currentMonth.getMonth()]} de ${currentMonth.getFullYear()}`;
}

// CALENDÁRIO — idêntico ao Controle de Frete (usa calendar.js)
window.toggleCalendar = function() {
    const modal = document.getElementById('calendarModal');
    if (modal.classList.contains('show')) {
        modal.classList.remove('show');
    } else {
        calendarYear = currentMonth.getFullYear();
        updateCalendarView();
        modal.classList.add('show');
    }
};

window.changeCalendarYear = function(direction) {
    calendarYear += direction;
    updateCalendarView();
};

function updateCalendarView() {
    document.getElementById('calendarYear').textContent = calendarYear;
    const monthsContainer = document.getElementById('calendarMonths');
    monthsContainer.innerHTML = meses.map((mes, index) => {
        const isCurrent = index === currentMonth.getMonth() && calendarYear === currentMonth.getFullYear();
        return `<div class="calendar-month ${isCurrent ? 'current' : ''}" onclick="selectMonth(${index})">${mes}</div>`;
    }).join('');
}

window.selectMonth = function(monthIndex) {
    currentMonth = new Date(calendarYear, monthIndex, 1);
    updateMonthLabel();
    filterEstudos();
    updateDashboard();
    toggleCalendar();
};

document.addEventListener('click', e => {
    const cal = document.getElementById('calendarModal');
    const btn = document.querySelector('.calendar-btn');
    if (cal && cal.classList.contains('show')) {
        if (!cal.contains(e.target) && btn && !btn.contains(e.target)) toggleCalendar();
    }

    // Fechar modais overlay ao clicar fora do conteúdo
    ['modalEstudo','modalDetalhe','modalRevisao','modalQuestao','modalTodasRevisoes','modalBancoQuestoes'].forEach(id => {
        const modal = document.getElementById(id);
        if (modal && modal.style.display !== 'none' && e.target === modal) {
            modal.style.display = 'none';
        }
    });
});

// ============================================================
// MODAL CONFIRM — idêntico ao Controle de Frete
// ============================================================
window.showConfirm = function(message, options = {}) {
    return new Promise(resolve => {
        document.getElementById('confirmMessage').textContent = message;
        const modal = document.getElementById('confirmModal');
        modal.style.display = 'flex';
        document.getElementById('confirmOk').onclick = () => { modal.style.display = 'none'; resolve(true); };
        document.getElementById('confirmCancel').onclick = () => { modal.style.display = 'none'; resolve(false); };
    });
};

// ============================================================
// UTILS
// ============================================================
function getStatusBadge(s) {
    const map = {
        PENDENTE:  ['pendente',  'Pendente'],
        ATRASO:    ['atraso',    'Fora do Prazo'],
        CONCLUIDO: ['concluido', 'Concluído']
    };
    const [cls, txt] = map[s] || ['badge-feita', s];
    return `<span class="badge ${cls}">${txt}</span>`;
}

function tipoRevisaoLabel(tipo) {
    return { REVISAO_1:'1ª Revisão', REVISAO_2:'2ª Revisão', REVISAO_3:'3ª Revisão', REVISAO_FINAL:'Revisão Final' }[tipo] || tipo || 'Revisão';
}

function formatDate(d) {
    if (!d) return '—';
    return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR');
}

function parseJSON(val) {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    try { return JSON.parse(val); } catch { return []; }
}

function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
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

window.addEventListener('beforeunload', () => sessionStorage.removeItem('alertShown'));

console.log('✅ Script completo carregado!');
