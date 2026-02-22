/* ============================================================
   JORNADA ACADÊMICA — script.js v3
   ============================================================ */

const API_URL = window.location.origin + '/api';

let estudos = [];
let currentMonth = new Date();
let calYear = new Date().getFullYear();
let tipoQuestaoAtual = 'objetiva';
let _confirmResolve = null;

const MESES       = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const MESES_ABREV = ['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];

/* ============================================================
   MODAL MANAGER — um de cada vez, sem sobreposição
   ============================================================ */
const modalStack = [];

function abrirModal(id) {
    // Não empilhar o mesmo modal
    if (modalStack.includes(id)) return;

    // Se já há modal aberto e não é o de confirmação, fecha o topo antes
    // (exceto confirm que pode ficar em cima)
    if (modalStack.length > 0 && id !== 'modalConfirm') {
        // empilhar por cima sem fechar (permite confirm em cima)
    }

    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add('show');
    el.style.display = 'flex';
    modalStack.push(id);
    document.body.style.overflow = 'hidden';
}

function fecharModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('show');
    el.style.display = 'none';
    const idx = modalStack.indexOf(id);
    if (idx !== -1) modalStack.splice(idx, 1);
    if (modalStack.length === 0) document.body.style.overflow = '';
}

// Helper objects para cada modal
const modalAtraso         = { open: () => { renderAtrasosBody();    abrirModal('modalAtraso'); } };
const modalRevisoesAlert  = { open: () => { renderRevisoesAlert();  abrirModal('modalRevisoesAlert'); } };
const modalTodasRevisoes  = { open: () => { renderTodasRevisoes();  abrirModal('modalTodasRevisoes'); } };
const modalBancoQuestoes  = { open: () => { renderBancoQuestoes();  abrirModal('modalBancoQuestoes'); } };

// Fechar modal ao clicar no overlay (fundo escuro)
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay') && e.target.classList.contains('show')) {
        if (e.target.id !== 'modalConfirm') {
            fecharModal(e.target.id);
        }
    }
});

/* ============================================================
   CONFIRM DIALOG
   ============================================================ */
function showConfirm(msg) {
    return new Promise(resolve => {
        _confirmResolve = resolve;
        document.getElementById('confirmMsg').textContent = msg;
        abrirModal('modalConfirm');
    });
}
window.confirmResolve = function(val) {
    fecharModal('modalConfirm');
    if (_confirmResolve) { _confirmResolve(val); _confirmResolve = null; }
};

/* ============================================================
   INIT
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
    updateMonthLabel();
    renderCalendar();
    carregarEstudos();
    setInterval(carregarEstudos, 60000);
    // Checkbox via delegação
    document.body.addEventListener('change', e => {
        if (e.target.classList.contains('styled-checkbox')) {
            const tr = e.target.closest('tr[data-id]');
            if (tr) toggleConcluido(tr.dataset.id);
        }
    });
});

/* ============================================================
   API
   ============================================================ */
async function carregarEstudos() {
    try {
        const res = await fetch(`${API_URL}/estudos`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        estudos = await res.json();
        localStorage.setItem('ja_cache', JSON.stringify(estudos));
        setOnline(true);
    } catch (err) {
        console.warn('Offline:', err.message);
        setOnline(false);
        const c = localStorage.getItem('ja_cache');
        if (c) estudos = JSON.parse(c);
    }
    updateDashboard();
    filterEstudos();
    updateCursoSelects();
}

window.sincronizar = async function() {
    await carregarEstudos();
    toast('Sincronizado com sucesso', 'success');
};

function setOnline(ok) {
    const el = document.getElementById('connectionStatus');
    if (!el) return;
    el.className = 'connection-status ' + (ok ? 'online' : 'offline');
}

async function apiPatch(id, body) {
    const res = await fetch(`${API_URL}/estudos/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

function updateLocal(saved) {
    const i = estudos.findIndex(e => String(e.id) === String(saved.id));
    if (i !== -1) estudos[i] = saved;
    else estudos.unshift(saved);
}

/* ============================================================
   DASHBOARD
   ============================================================ */
function updateDashboard() {
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const mes = currentMonth.getMonth(), ano = currentMonth.getFullYear();

    const doMes = estudos.filter(e => {
        const d = new Date((e.created_at || '2000-01-01').slice(0,10) + 'T00:00:00');
        return d.getMonth() === mes && d.getFullYear() === ano;
    });

    let pendente = 0, atraso = 0, concluido = 0, revPend = 0;
    doMes.forEach(e => {
        const s = statusAtual(e);
        if (s === 'PENDENTE') pendente++;
        else if (s === 'ATRASO') atraso++;
        else concluido++;
        parseJ(e.revisoes).forEach(r => {
            if (!r.feita && new Date(r.data + 'T00:00:00') <= hoje) revPend++;
        });
    });

    setText('statPendente', pendente);
    setText('statAtraso', atraso);
    setText('statConcluido', concluido);
    setText('statRevisoes', revPend);

    const cardA = document.getElementById('cardAtrasos');
    let badge = cardA.querySelector('.pulse-badge');
    if (atraso > 0) {
        cardA.classList.add('has-alert');
        if (!badge) { badge = document.createElement('div'); badge.className = 'pulse-badge'; cardA.appendChild(badge); }
        badge.textContent = atraso;
    } else {
        cardA.classList.remove('has-alert');
        if (badge) badge.remove();
    }
}

/* ============================================================
   FILTROS E TABELA
   ============================================================ */
function updateCursoSelects() {
    const cursos = [...new Set(estudos.map(e => e.curso).filter(Boolean))].sort();
    ['filterCurso', 'filterQuestaoCurso'].forEach(id => {
        const sel = document.getElementById(id);
        if (!sel) return;
        const cur = sel.value;
        sel.innerHTML = `<option value="">${id === 'filterCurso' ? 'Todos os Cursos' : 'Todos os Cursos'}</option>` +
            cursos.map(c => `<option value="${x(c)}">${x(c)}</option>`).join('');
        if (cur && [...sel.options].some(o => o.value === cur)) sel.value = cur;
    });
}

window.filterEstudos = function() {
    const q     = (document.getElementById('searchInput')?.value || '').toLowerCase();
    const curso = document.getElementById('filterCurso')?.value || '';
    const stat  = document.getElementById('filterStatus')?.value || '';
    const mes   = currentMonth.getMonth(), ano = currentMonth.getFullYear();

    const list = estudos.filter(e => {
        const d = new Date((e.created_at || '2000-01-01').slice(0,10) + 'T00:00:00');
        if (d.getMonth() !== mes || d.getFullYear() !== ano) return false;
        if (curso && e.curso !== curso) return false;
        if (stat  && statusAtual(e) !== stat) return false;
        if (q && !`${e.curso} ${e.unidade} ${e.conteudo}`.toLowerCase().includes(q)) return false;
        return true;
    });
    renderTabela(list);
};

function renderTabela(list) {
    const cont = document.getElementById('estudosContainer');
    if (!cont) return;

    if (list.length === 0) {
        cont.innerHTML = `<div class="empty-state">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
            <p>Nenhum estudo encontrado neste período</p>
            <button onclick="abrirFormEstudo()">Registrar Estudo</button>
        </div>`;
        return;
    }

    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const rows = list.map(e => {
        const s = statusAtual(e);
        const rc = s === 'CONCLUIDO' ? 'row-concluido' : s === 'ATRASO' ? 'row-atraso' : '';
        const revs = parseJ(e.revisoes);
        const pendRevs = revs.filter(r => !r.feita && new Date(r.data + 'T00:00:00') <= hoje).length;
        const totalRevs = revs.length;
        const feitaRevs = revs.filter(r => r.feita).length;
        return `<tr data-id="${e.id}" class="${rc}">
            <td>
                <div class="checkbox-wrapper">
                    <input type="checkbox" class="styled-checkbox" id="chk_${e.id}" ${s === 'CONCLUIDO' ? 'checked' : ''}>
                    <label class="checkbox-label-styled" for="chk_${e.id}"></label>
                </div>
            </td>
            <td><strong>${x(e.curso)}</strong></td>
            <td>${x(e.unidade || '—')}</td>
            <td>${x(e.conteudo)}</td>
            <td>${x(e.data_termino ? fmtDate(e.data_termino) : '—')}</td>
            <td>${badgeStatus(s)}</td>
            <td>${pendRevs > 0
                ? `<span class="badge info">${pendRevs} pend.</span>`
                : totalRevs > 0 ? `<span class="badge neutro">${feitaRevs}/${totalRevs}</span>` : '—'
            }</td>
            <td class="actions-cell">
                <button class="action-btn view"   onclick="verEstudo('${e.id}')">Ver</button>
                <button class="action-btn edit"   onclick="editarEstudo('${e.id}')">Editar</button>
                <button class="action-btn add-btn" onclick="abrirFormRevisao('${e.id}')">Rev.</button>
                <button class="action-btn delete" onclick="excluirEstudo('${e.id}')">Excluir</button>
            </td>
        </tr>`;
    }).join('');

    cont.innerHTML = `<div style="overflow-x:auto"><table>
        <thead><tr>
            <th style="width:46px">&#x2713;</th>
            <th>Curso</th><th>Unidade</th><th>Conteúdo</th>
            <th>Término</th><th>Status</th><th>Revisões</th><th>Ações</th>
        </tr></thead>
        <tbody>${rows}</tbody>
    </table></div>`;
}

/* ============================================================
   TOGGLE CONCLUÍDO
   ============================================================ */
async function toggleConcluido(id) {
    const e = findEstudo(id);
    if (!e) return;
    const novoStatus = statusAtual(e) === 'CONCLUIDO' ? 'PENDENTE' : 'CONCLUIDO';
    const prev = e.status;
    e.status = novoStatus;
    updateDashboard(); filterEstudos();
    try {
        const saved = await apiPatch(id, { status: novoStatus });
        updateLocal(saved);
        toast(novoStatus === 'CONCLUIDO' ? 'Estudo concluído' : 'Estudo reaberto', 'success');
    } catch {
        e.status = prev;
        updateDashboard(); filterEstudos();
        toast('Erro ao salvar', 'error');
    }
}

/* ============================================================
   VER ESTUDO
   ============================================================ */
window.verEstudo = function(id) {
    const e = findEstudo(id);
    if (!e) return;
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const revs  = parseJ(e.revisoes);
    const quests = parseJ(e.questoes);
    const obs   = parseJ(e.observacoes);

    // TAB INFO
    const infoHtml = `
        <div class="info-grid">
            <div class="info-item"><label>Curso</label><span>${x(e.curso)}</span></div>
            <div class="info-item"><label>Unidade</label><span>${x(e.unidade || '—')}</span></div>
            <div class="info-item"><label>Conteúdo</label><span>${x(e.conteudo)}</span></div>
            <div class="info-item"><label>Término</label><span>${e.data_termino ? fmtDate(e.data_termino) : '—'}</span></div>
            <div class="info-item"><label>Status</label><span>${badgeStatus(statusAtual(e))}</span></div>
        </div>
        ${obs.length ? `<div class="section-title">Observações</div>
        <div class="obs-list">${obs.map(o=>`<div class="obs-item"><div class="obs-meta">${x(fmtDate(o.data?.slice(0,10) || ''))}</div><div class="obs-texto">${x(o.texto)}</div></div>`).join('')}</div>` : ''}`;

    // TAB REVISÕES
    const revisoesHtml = revs.length === 0
        ? `<div class="empty-state"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg><p>Nenhuma revisão agendada</p></div>`
        : revs.map((r,i) => {
            const at = !r.feita && new Date(r.data+'T00:00:00') < hoje;
            return `<div class="revisao-item ${at ? 'revisao-atrasada' : ''}">
                <div class="revisao-date">${fmtDate(r.data)}</div>
                <div class="revisao-info">
                    <div class="r-tipo">${tipoRevLabel(r.tipo)}</div>
                    ${r.nota ? `<div class="r-nota">${x(r.nota)}</div>` : ''}
                    ${at ? `<span class="badge atraso">Atrasada</span>` : ''}
                    ${r.feita ? `<span class="badge concluido">Feita</span>` : ''}
                </div>
                ${!r.feita ? `<button class="action-btn done" onclick="marcarRevFeita('${e.id}',${i}); verEstudo('${e.id}')">Feita</button>` : ''}
            </div>`;
        }).join('');

    // TAB QUESTÕES
    const questoesHtml = quests.length === 0
        ? `<div class="empty-state"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg><p>Nenhuma questão registrada</p></div>`
        : quests.map((q,i) => renderQuestaoCard(q, e.id, i)).join('');

    document.getElementById('detalheTitle').textContent = `${e.curso} — ${e.conteudo}`;
    document.getElementById('detalheBody').innerHTML = `
        <div class="tabs-nav">
            <button class="tab-btn active" onclick="switchTab(this,'tabInfo')">Informações</button>
            <button class="tab-btn" onclick="switchTab(this,'tabRevs')">Revisões (${revs.length})</button>
            <button class="tab-btn" onclick="switchTab(this,'tabQuests')">Questões (${quests.length})</button>
        </div>
        <div id="tabInfo"   class="tab-content active">${infoHtml}</div>
        <div id="tabRevs"   class="tab-content">
            <div class="section-title">Revisões
                <button class="action-btn add-btn" onclick="fecharModal('modalDetalhe'); abrirFormRevisao('${e.id}')">Nova Revisão</button>
            </div>
            ${revisoesHtml}
        </div>
        <div id="tabQuests" class="tab-content">
            <div class="section-title">Questões
                <button class="action-btn add-btn" onclick="fecharModal('modalDetalhe'); abrirFormQuestaoParaEstudo('${e.id}')">Nova Questão</button>
            </div>
            ${questoesHtml}
        </div>`;

    document.getElementById('btnEditarDetalhe').onclick = () => { fecharModal('modalDetalhe'); editarEstudo(id); };
    abrirModal('modalDetalhe');
};

function renderQuestaoCard(q, estudoId, idx) {
    const alts = q.alternativas || [];
    const isObj = q.tipo === 'objetiva';
    const feita = q.status === 'FEITA';

    let corpo = '';
    if (isObj) {
        corpo = alts.map((a, ai) => {
            const letra = String.fromCharCode(65 + ai);
            const isCorreta = q.gabarito === letra;
            return `<div class="alt-display ${isCorreta ? 'correta' : ''}">
                <span class="l">${letra})</span>
                <span>${x(a)}</span>
            </div>`;
        }).join('');
        corpo += `<div class="gabarito-box">Gabarito: ${x(q.gabarito)}</div>`;
    } else {
        corpo = `<div class="gabarito-box">Resposta: ${x(q.gabarito || q.resposta || '—')}</div>`;
    }

    return `<div class="questao-card ${feita ? 'feita' : ''}">
        <div class="q-actions">
            ${!feita ? `<button class="action-btn done" style="font-size:.78rem;padding:5px 9px" onclick="marcarQuestaoFeita('${estudoId}',${idx}); verEstudo('${estudoId}')">Feita</button>` : ''}
        </div>
        <div class="q-badge" style="margin-bottom:.5rem">
            <span class="badge ${feita ? 'neutro' : 'pendente'}">${feita ? 'Feita' : 'Pendente'}</span>
            <span class="badge neutro">${isObj ? 'Objetiva' : 'Discursiva'}</span>
        </div>
        <div class="q-enunciado">${x(q.enunciado || q.pergunta || '')}</div>
        ${corpo}
    </div>`;
}

window.switchTab = function(btn, id) {
    const nav = btn.closest('.tabs-nav');
    nav.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const body = btn.closest('.modal-content') || btn.closest('.tab-content')?.parentElement;
    (body || document).querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    const t = document.getElementById(id);
    if (t) t.classList.add('active');
};

/* ============================================================
   FORM ESTUDO
   ============================================================ */
window.abrirFormEstudo = function() {
    document.getElementById('tituloFormEstudo').textContent = 'Registrar Estudo';
    document.getElementById('estudoId').value = '';
    document.getElementById('fCurso').value = '';
    document.getElementById('fUnidade').value = '';
    document.getElementById('fConteudo').value = '';
    document.getElementById('fDataTermino').value = '';
    document.getElementById('fObservacao').value = '';
    abrirModal('modalFormEstudo');
    setTimeout(() => document.getElementById('fCurso').focus(), 150);
};

window.editarEstudo = function(id) {
    const e = findEstudo(id);
    if (!e) return;
    document.getElementById('tituloFormEstudo').textContent = 'Editar Estudo';
    document.getElementById('estudoId').value = e.id;
    document.getElementById('fCurso').value = e.curso || '';
    document.getElementById('fUnidade').value = e.unidade || '';
    document.getElementById('fConteudo').value = e.conteudo || '';
    document.getElementById('fDataTermino').value = e.data_termino || '';
    const obs = parseJ(e.observacoes);
    document.getElementById('fObservacao').value = obs[0]?.texto || '';
    abrirModal('modalFormEstudo');
};

window.submitEstudo = async function(ev) {
    ev.preventDefault();
    const id = document.getElementById('estudoId').value;
    const obsText = document.getElementById('fObservacao').value.trim();
    const payload = {
        curso: document.getElementById('fCurso').value.trim(),
        unidade: document.getElementById('fUnidade').value.trim(),
        conteudo: document.getElementById('fConteudo').value.trim(),
        data_termino: document.getElementById('fDataTermino').value || null,
        observacoes: obsText ? JSON.stringify([{texto: obsText, data: new Date().toISOString()}]) : '[]',
        status: 'PENDENTE'
    };
    if (!id) { payload.revisoes = '[]'; payload.questoes = '[]'; }
    try {
        const res = await fetch(id ? `${API_URL}/estudos/${id}` : `${API_URL}/estudos`, {
            method: id ? 'PUT' : 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify(payload)
        });
        if (!res.ok) { const j = await res.json(); throw new Error(j.error || 'Erro'); }
        const saved = await res.json();
        updateLocal(saved);
        updateDashboard(); filterEstudos(); updateCursoSelects();
        fecharModal('modalFormEstudo');
        toast(id ? 'Estudo atualizado' : 'Estudo registrado', 'success');
    } catch (err) { toast('Erro: ' + err.message, 'error'); }
};

window.excluirEstudo = async function(id) {
    const e = findEstudo(id);
    const ok = await showConfirm(`Excluir "${e?.conteudo}"? Esta ação não pode ser desfeita.`);
    if (!ok) return;
    const bkp = [...estudos];
    estudos = estudos.filter(x => String(x.id) !== String(id));
    updateDashboard(); filterEstudos(); updateCursoSelects();
    toast('Estudo excluído', 'success');
    try {
        await fetch(`${API_URL}/estudos/${id}`, {method:'DELETE'});
    } catch {
        estudos = bkp;
        updateDashboard(); filterEstudos();
        toast('Erro ao excluir no servidor', 'error');
    }
};

/* ============================================================
   REVISÕES
   ============================================================ */
window.abrirFormRevisao = function(preId) {
    const sel = document.getElementById('fRevEstudo');
    sel.innerHTML = estudos.map(e =>
        `<option value="${e.id}" ${String(e.id)===String(preId)?'selected':''}>${x(e.curso)} — ${x(e.conteudo)}</option>`
    ).join('');
    document.getElementById('fRevData').value = '';
    document.getElementById('fRevTipo').value = 'REVISAO_1';
    document.getElementById('fRevNota').value = '';
    abrirModal('modalFormRevisao');
};

window.submitRevisao = async function(ev) {
    ev.preventDefault();
    const estudoId = document.getElementById('fRevEstudo').value;
    const e = findEstudo(estudoId);
    if (!e) return;
    const revs = parseJ(e.revisoes);
    revs.push({
        data: document.getElementById('fRevData').value,
        tipo: document.getElementById('fRevTipo').value,
        nota: document.getElementById('fRevNota').value.trim(),
        feita: false, criada_em: new Date().toISOString()
    });
    try {
        const saved = await apiPatch(estudoId, {revisoes: JSON.stringify(revs)});
        updateLocal(saved);
        updateDashboard(); filterEstudos();
        fecharModal('modalFormRevisao');
        toast('Revisão agendada', 'success');
    } catch { toast('Erro ao agendar', 'error'); }
};

window.marcarRevFeita = async function(estudoId, idx) {
    const e = findEstudo(estudoId);
    if (!e) return;
    const revs = parseJ(e.revisoes);
    if (!revs[idx]) return;
    revs[idx].feita = true;
    revs[idx].feita_em = new Date().toISOString();
    try {
        const saved = await apiPatch(estudoId, {revisoes: JSON.stringify(revs)});
        updateLocal(saved);
        updateDashboard(); filterEstudos();
        if (document.getElementById('modalTodasRevisoes').classList.contains('show')) renderTodasRevisoes();
        toast('Revisão concluída', 'success');
    } catch { toast('Erro ao atualizar', 'error'); }
};

function renderTodasRevisoes() {
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    let todas = [];
    estudos.forEach(e => {
        parseJ(e.revisoes).forEach((r,i) => todas.push({...r, estudoId:e.id, idx:i, curso:e.curso, conteudo:e.conteudo}));
    });
    todas.sort((a,b) => {
        if (a.feita !== b.feita) return a.feita ? 1 : -1;
        return new Date(a.data) - new Date(b.data);
    });

    const body = document.getElementById('todasRevisoesBody');
    if (todas.length === 0) {
        body.innerHTML = `<div class="empty-state"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg><p>Nenhuma revisão agendada</p></div>`;
        return;
    }

    const pend  = todas.filter(r => !r.feita);
    const feita = todas.filter(r => r.feita);

    const renderGrp = (list, title) => {
        if (!list.length) return '';
        return `<div style="margin-bottom:1.5rem">
            <div class="section-title">${title} (${list.length})</div>
            ${list.map(r => {
                const at = !r.feita && new Date(r.data+'T00:00:00') < hoje;
                return `<div class="revisao-item ${at?'revisao-atrasada':''}">
                    <div class="revisao-date">${fmtDate(r.data)}</div>
                    <div class="revisao-info">
                        <div class="r-tipo">${x(r.conteudo)} — ${tipoRevLabel(r.tipo)}</div>
                        <div class="r-nota">${x(r.curso)}${at ? ' · <span style="color:var(--danger-color);font-weight:600">Atrasada</span>' : ''}</div>
                        ${r.nota ? `<div class="r-nota">${x(r.nota)}</div>` : ''}
                        ${r.feita ? `<span class="badge concluido" style="margin-top:.25rem">Feita</span>` : ''}
                    </div>
                    ${!r.feita ? `<button class="action-btn done" onclick="marcarRevFeita('${r.estudoId}',${r.idx})">Feita</button>` : ''}
                </div>`;
            }).join('')}
        </div>`;
    };

    body.innerHTML = renderGrp(pend, 'Pendentes') + renderGrp(feita, 'Concluídas');
}

function renderAtrasosBody() {
    const atrasados = estudos.filter(e => statusAtual(e) === 'ATRASO');
    const body = document.getElementById('atrasosBody');
    body.innerHTML = atrasados.length === 0
        ? '<p style="text-align:center;padding:2rem;color:var(--text-secondary)">Nenhum estudo em atraso.</p>'
        : `<div style="overflow-x:auto"><table>
            <thead><tr><th>Curso</th><th>Conteúdo</th><th>Término</th></tr></thead>
            <tbody>${atrasados.map(e=>`<tr>
                <td><strong>${x(e.curso)}</strong></td>
                <td>${x(e.conteudo)}</td>
                <td style="color:var(--danger-color);font-weight:600">${fmtDate(e.data_termino)}</td>
            </tr>`).join('')}</tbody>
        </table></div>`;
}

function renderRevisoesAlert() {
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const pend = [];
    estudos.forEach(e => {
        parseJ(e.revisoes).forEach(r => {
            if (!r.feita && new Date(r.data+'T00:00:00') <= hoje) pend.push({...r, curso:e.curso, conteudo:e.conteudo});
        });
    });
    pend.sort((a,b) => new Date(a.data)-new Date(b.data));
    const body = document.getElementById('revisoesAlertBody');
    body.innerHTML = pend.length === 0
        ? '<p style="text-align:center;padding:2rem;color:var(--text-secondary)">Nenhuma revisão pendente.</p>'
        : `<div style="overflow-x:auto"><table>
            <thead><tr><th>Data</th><th>Curso</th><th>Conteúdo</th><th>Tipo</th></tr></thead>
            <tbody>${pend.map(r=>`<tr>
                <td style="color:var(--danger-color);font-weight:600;white-space:nowrap">${fmtDate(r.data)}</td>
                <td>${x(r.curso)}</td>
                <td>${x(r.conteudo)}</td>
                <td>${tipoRevLabel(r.tipo)}</td>
            </tr>`).join('')}</tbody>
        </table></div>`;
}

/* ============================================================
   QUESTÕES — Objetiva / Discursiva
   ============================================================ */
const LETRAS = ['A','B','C','D','E'];

window.setTipoQuestao = function(tipo) {
    tipoQuestaoAtual = tipo;
    document.getElementById('tabObjetiva').classList.toggle('active', tipo === 'objetiva');
    document.getElementById('tabDiscursiva').classList.toggle('active', tipo === 'discursiva');
    document.getElementById('blockoAlternativas').style.display = tipo === 'objetiva' ? '' : 'none';
    document.getElementById('blockoResposta').style.display = tipo === 'discursiva' ? '' : 'none';
};

function buildAlternativasUI() {
    const cont = document.getElementById('alternativasContainer');
    cont.innerHTML = LETRAS.map((l,i) => `
        <div class="alternativa-row">
            <div class="letra-circulo">${l}</div>
            <input type="text" id="alt_${l}" placeholder="Alternativa ${l}...">
            <label class="radio-correta">
                <input type="radio" name="gabaritoRadio" value="${l}" ${i===0?'checked':''}> Correta
            </label>
        </div>`).join('');
}

window.abrirFormQuestao = function() {
    const sel = document.getElementById('fQuestaoEstudo');
    sel.innerHTML = estudos.map(e =>
        `<option value="${e.id}">${x(e.curso)} — ${x(e.conteudo)}</option>`
    ).join('');
    document.getElementById('fEnunciado').value = '';
    document.getElementById('fRespostaDiscursiva').value = '';
    setTipoQuestao('objetiva');
    buildAlternativasUI();
    abrirModal('modalFormQuestao');
    setTimeout(() => document.getElementById('fEnunciado').focus(), 150);
};

window.abrirFormQuestaoParaEstudo = function(estudoId) {
    abrirFormQuestao();
    const sel = document.getElementById('fQuestaoEstudo');
    if (sel) [...sel.options].forEach(o => o.selected = String(o.value) === String(estudoId));
};

window.submitQuestao = async function(ev) {
    ev.preventDefault();
    const estudoId = document.getElementById('fQuestaoEstudo').value;
    const e = findEstudo(estudoId);
    if (!e) return;

    const enunciado = document.getElementById('fEnunciado').value.trim();
    let novaQ = { tipo: tipoQuestaoAtual, enunciado, status: 'PENDENTE', criada_em: new Date().toISOString() };

    if (tipoQuestaoAtual === 'objetiva') {
        const alts = LETRAS.map(l => (document.getElementById(`alt_${l}`)?.value || '').trim());
        const gab = document.querySelector('input[name="gabaritoRadio"]:checked')?.value || 'A';
        if (!alts[LETRAS.indexOf(gab)]) { toast('Preencha a alternativa correta', 'error'); return; }
        novaQ.alternativas = alts;
        novaQ.gabarito = gab;
    } else {
        const resp = document.getElementById('fRespostaDiscursiva').value.trim();
        if (!resp) { toast('Informe a resposta correta', 'error'); return; }
        novaQ.gabarito = resp;
    }

    const quests = parseJ(e.questoes);
    quests.push(novaQ);
    try {
        const saved = await apiPatch(estudoId, {questoes: JSON.stringify(quests)});
        updateLocal(saved);
        updateDashboard(); filterEstudos();
        fecharModal('modalFormQuestao');
        toast('Questão registrada', 'success');
    } catch { toast('Erro ao salvar questão', 'error'); }
};

window.marcarQuestaoFeita = async function(estudoId, idx) {
    const e = findEstudo(estudoId);
    if (!e) return;
    const qs = parseJ(e.questoes);
    if (!qs[idx]) return;
    qs[idx].status = 'FEITA';
    qs[idx].feita_em = new Date().toISOString();
    try {
        const saved = await apiPatch(estudoId, {questoes: JSON.stringify(qs)});
        updateLocal(saved);
        updateDashboard(); filterEstudos();
        if (document.getElementById('modalBancoQuestoes').classList.contains('show')) renderBancoQuestoes();
        toast('Questão marcada como feita', 'success');
    } catch { toast('Erro ao atualizar', 'error'); }
};

window.renderBancoQuestoes = function() {
    const body = document.getElementById('bancoQuestoesBody');
    if (!body) return;
    const q    = (document.getElementById('searchQuestao')?.value || '').toLowerCase();
    const stat = document.getElementById('filterQuestaoStatus')?.value || '';
    const curs = document.getElementById('filterQuestaoCurso')?.value || '';

    let todas = [];
    estudos.forEach(e => {
        parseJ(e.questoes).forEach((qt,i) => {
            todas.push({...qt, estudoId:e.id, idx:i, curso:e.curso, conteudo:e.conteudo, unidade:e.unidade});
        });
    });
    if (curs) todas = todas.filter(t => t.curso === curs);
    if (stat) todas = todas.filter(t => (t.status||'PENDENTE') === stat);
    if (q) todas = todas.filter(t => `${t.enunciado||''} ${t.curso} ${t.conteudo}`.toLowerCase().includes(q));
    todas.sort((a,b) => { if(a.status!==b.status) return a.status==='PENDENTE'?-1:1; return 0; });

    if (!todas.length) {
        body.innerHTML = `<div class="empty-state"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg><p>Nenhuma questão encontrada</p></div>`;
        return;
    }

    body.innerHTML = `<p style="color:var(--text-secondary);font-size:.85rem;margin-bottom:1rem">${todas.length} questão(ões) · ${todas.filter(t=>t.status!=='FEITA').length} pendente(s)</p>
        ${todas.map(q => renderQuestaoCard(q, q.estudoId, q.idx) + `<p style="font-size:.78rem;color:var(--text-secondary);margin:-0.5rem 0 1rem .25rem">${x(q.curso)} — ${x(q.conteudo)}</p>`).join('')}`;
};

/* ============================================================
   GERAR PDF
   ============================================================ */
window.gerarPDF = function() {
    const cursoFiltro = document.getElementById('filterCurso')?.value;
    if (!cursoFiltro) { toast('Selecione um curso no filtro para gerar o PDF', 'info'); return; }

    // Agrupa por unidade-conteudo
    const estudosDoCurso = estudos.filter(e => e.curso === cursoFiltro);
    if (!estudosDoCurso.length) { toast('Nenhum estudo encontrado para este curso', 'error'); return; }

    // Coleta todas as questões agrupadas por unidade+conteúdo
    const grupos = {};
    estudosDoCurso.forEach(e => {
        const key = `${e.unidade || 'Sem Unidade'}||${e.conteudo}`;
        if (!grupos[key]) grupos[key] = { unidade: e.unidade || '', conteudo: e.conteudo, questoes: [] };
        parseJ(e.questoes).forEach(q => grupos[key].questoes.push(q));
    });

    const gruposList = Object.values(grupos).filter(g => g.questoes.length > 0);
    if (!gruposList.length) { toast('Nenhuma questão encontrada para este curso', 'info'); return; }

    // jsPDF
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const W = 210, ML = 18, MR = 18, MT = 20;
    const CW = W - ML - MR; // content width = 174
    let y = MT;

    const checkPage = (needed = 10) => {
        if (y + needed > 277) { doc.addPage(); y = MT; }
    };

    // Fonts helpers
    const setFont = (style, size) => { doc.setFont('helvetica', style); doc.setFontSize(size); };

    // ---- TÍTULO DO CURSO ----
    setFont('bold', 18);
    doc.setTextColor(30, 30, 30);
    const tituloLines = doc.splitTextToSize(cursoFiltro.toUpperCase(), CW);
    doc.text(tituloLines, W / 2, y, { align: 'center' });
    y += tituloLines.length * 8 + 4;

    // linha separadora
    doc.setDrawColor(204, 112, 0);
    doc.setLineWidth(0.8);
    doc.line(ML, y, W - MR, y);
    y += 10;

    // ---- QUESTÕES POR GRUPO ----
    const gabaritoMap = {}; // chave = "unidade||conteudo", valor = [{num, tipo, gabarito}]
    let qNumGlobal = 1;

    gruposList.forEach((grp, gi) => {
        const key = `${grp.unidade}||${grp.conteudo}`;
        gabaritoMap[key] = [];

        // Cabeçalho do grupo
        checkPage(14);
        const cabecalho = grp.unidade ? `[${grp.unidade}] — ${grp.conteudo}` : grp.conteudo;
        setFont('bold', 12);
        doc.setTextColor(204, 112, 0);
        const cabLines = doc.splitTextToSize(cabecalho, CW);
        doc.text(cabLines, ML, y);
        y += cabLines.length * 6 + 3;

        // Linha abaixo do cabeçalho
        doc.setDrawColor(230, 230, 230);
        doc.setLineWidth(0.3);
        doc.line(ML, y, W - MR, y);
        y += 5;

        // Questões
        grp.questoes.forEach((q, qi) => {
            const isObj = q.tipo === 'objetiva';
            const enunciado = q.enunciado || q.pergunta || '';
            const alts = q.alternativas || [];

            // Enunciado
            checkPage(12);
            setFont('bold', 10);
            doc.setTextColor(30, 30, 30);
            const numStr = `${qNumGlobal}. `;
            const enuncLines = doc.splitTextToSize(numStr + enunciado, CW);
            doc.text(enuncLines, ML, y);
            y += enuncLines.length * 5.5 + 2;

            // Alternativas (objetiva)
            if (isObj) {
                alts.forEach((alt, ai) => {
                    if (!alt) return;
                    checkPage(7);
                    const letra = String.fromCharCode(65 + ai);
                    setFont('normal', 9.5);
                    doc.setTextColor(60, 60, 60);
                    const altLines = doc.splitTextToSize(`  ${letra}) ${alt}`, CW - 6);
                    doc.text(altLines, ML + 4, y);
                    y += altLines.length * 5 + 1;
                });
            }

            y += 4;

            // Gabarito para o sumário
            gabaritoMap[key].push({
                num: qNumGlobal,
                tipo: isObj ? 'objetiva' : 'discursiva',
                gabarito: q.gabarito || '—',
                enunciado: enunciado.slice(0, 60) + (enunciado.length > 60 ? '...' : '')
            });
            qNumGlobal++;
        });

        if (gi < gruposList.length - 1) y += 6;
    });

    // ---- GABARITO ----
    doc.addPage();
    y = MT;

    setFont('bold', 16);
    doc.setTextColor(30, 30, 30);
    doc.text('GABARITO', W / 2, y, { align: 'center' });
    y += 5;
    doc.setDrawColor(204, 112, 0);
    doc.setLineWidth(0.8);
    doc.line(ML, y, W - MR, y);
    y += 10;

    gruposList.forEach(grp => {
        const key = `${grp.unidade}||${grp.conteudo}`;
        const items = gabaritoMap[key] || [];
        if (!items.length) return;

        checkPage(12);
        const cabecalho = grp.unidade ? `[${grp.unidade}] — ${grp.conteudo}` : grp.conteudo;
        setFont('bold', 11);
        doc.setTextColor(204, 112, 0);
        doc.text(cabecalho, ML, y);
        y += 6;
        doc.setDrawColor(230, 230, 230);
        doc.setLineWidth(0.3);
        doc.line(ML, y, W - MR, y);
        y += 4;

        items.forEach(it => {
            checkPage(7);
            setFont('bold', 9.5);
            doc.setTextColor(30, 30, 30);
            doc.text(`Q${it.num}.`, ML, y);
            setFont('normal', 9.5);
            doc.setTextColor(60, 60, 60);
            if (it.tipo === 'objetiva') {
                doc.text(`Gabarito: ${it.gabarito}`, ML + 10, y);
            } else {
                const gabLines = doc.splitTextToSize(`Resposta: ${it.gabarito}`, CW - 14);
                doc.text(gabLines, ML + 10, y);
                y += (gabLines.length - 1) * 4.5;
            }
            y += 6;
        });
        y += 4;
    });

    doc.save(`Jornada_Academica_${cursoFiltro.replace(/\s+/g,'_')}.pdf`);
    toast('PDF gerado com sucesso', 'success');
};

/* ============================================================
   CALENDÁRIO
   ============================================================ */
window.toggleCalendar = function() {
    const m = document.getElementById('calendarModal');
    if (m.classList.contains('show')) {
        m.classList.remove('show');
    } else {
        calYear = currentMonth.getFullYear();
        renderCalendar();
        m.classList.add('show');
    }
};

window.renderCalendar = function() {
    document.getElementById('calendarYear').textContent = calYear;
    document.getElementById('calendarMonths').innerHTML = MESES.map((nm, i) => {
        const isCur = i === currentMonth.getMonth() && calYear === currentMonth.getFullYear();
        return `<div class="calendar-month ${isCur?'current':''}" onclick="selectCalMonth(${i})">${nm}</div>`;
    }).join('');
};

window.selectCalMonth = function(i) {
    currentMonth = new Date(calYear, i, 1);
    updateMonthLabel();
    filterEstudos();
    updateDashboard();
    document.getElementById('calendarModal').classList.remove('show');
};

window.changeMonth = function(dir) {
    currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + dir, 1);
    updateMonthLabel();
    filterEstudos();
    updateDashboard();
};

function updateMonthLabel() {
    const el = document.getElementById('currentMonthLabel');
    if (el) el.textContent = `${MESES[currentMonth.getMonth()]} ${currentMonth.getFullYear()}`;
}

// Fechar calendário ao clicar fora
document.addEventListener('click', e => {
    const cal = document.getElementById('calendarModal');
    if (cal && cal.classList.contains('show')) {
        if (!cal.querySelector('.calendar-content').contains(e.target) &&
            !e.target.closest('.calendar-btn')) {
            cal.classList.remove('show');
        }
    }
});

/* ============================================================
   HELPERS
   ============================================================ */
function findEstudo(id) {
    return estudos.find(e => String(e.id) === String(id));
}

function statusAtual(e) {
    if (e.status === 'CONCLUIDO') return 'CONCLUIDO';
    if (e.data_termino) {
        const hoje = new Date(); hoje.setHours(0,0,0,0);
        if (new Date(e.data_termino + 'T00:00:00') < hoje) return 'ATRASO';
    }
    return 'PENDENTE';
}

function badgeStatus(s) {
    const m = { PENDENTE:['pendente','Pendente'], ATRASO:['atraso','Fora do Prazo'], CONCLUIDO:['concluido','Concluído'] };
    const [cls, txt] = m[s] || ['neutro', s];
    return `<span class="badge ${cls}">${txt}</span>`;
}

function tipoRevLabel(t) {
    return { REVISAO_1:'1ª Revisão', REVISAO_2:'2ª Revisão', REVISAO_3:'3ª Revisão', REVISAO_FINAL:'Revisão Final' }[t] || t || 'Revisão';
}

function fmtDate(d) {
    if (!d) return '—';
    const [y,m,day] = String(d).slice(0,10).split('-');
    return `${day}/${m}/${y}`;
}

function parseJ(val) {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    try { return JSON.parse(val); } catch { return []; }
}

function x(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function setText(id, v) {
    const el = document.getElementById(id);
    if (el) el.textContent = v;
}

function toast(msg, type = 'info') {
    document.querySelectorAll('.floating-message').forEach(m => m.remove());
    const el = document.createElement('div');
    el.className = `floating-message ${type}`;
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => {
        el.style.animation = 'slideOutBottom .3s ease forwards';
        setTimeout(() => el.remove(), 320);
    }, 3200);
}

console.log('Jornada Academica v3 pronto');
