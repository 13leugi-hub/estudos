require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ ERRO: SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configurados');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
console.log('✅ Supabase configurado:', supabaseUrl);

app.use(cors({ origin: '*', methods: ['GET','POST','PUT','DELETE','PATCH','OPTIONS'], allowedHeaders: ['Content-Type','Authorization','X-Session-Token'] }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => { console.log(`📥 ${new Date().toISOString()} - ${req.method} ${req.path}`); next(); });

const PORTAL_URL = process.env.PORTAL_URL || 'https://ir-comercio-portal-zcan.onrender.com';

async function verificarAutenticacao(req, res, next) {
    const publicPaths = ['/', '/health'];
    if (publicPaths.includes(req.path)) return next();
    const sessionToken = req.headers['x-session-token'];
    if (!sessionToken) return res.status(401).json({ error: 'Não autenticado' });
    try {
        const verifyResponse = await fetch(`${PORTAL_URL}/api/verify-session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionToken })
        });
        if (!verifyResponse.ok) return res.status(401).json({ error: 'Sessão inválida' });
        const sessionData = await verifyResponse.json();
        if (!sessionData.valid) return res.status(401).json({ error: 'Sessão inválida' });
        req.user = sessionData.session;
        req.sessionToken = sessionToken;
        next();
    } catch (error) {
        return res.status(500).json({ error: 'Erro ao verificar autenticação' });
    }
}

const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));

app.get('/health', async (req, res) => {
    try {
        const { error } = await supabase.from('estudos').select('count', { count: 'exact', head: true });
        res.json({ status: error ? 'unhealthy' : 'healthy', database: error ? 'disconnected' : 'connected', timestamp: new Date().toISOString() });
    } catch (error) {
        res.json({ status: 'unhealthy', error: error.message });
    }
});

app.use('/api', verificarAutenticacao);

// ======================== ESTUDOS ========================

app.get('/api/estudos', async (req, res) => {
    try {
        const { data, error } = await supabase.from('estudos').select('*').order('data_inicio', { ascending: false });
        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Erro ao buscar estudos', details: error.message });
    }
});

app.get('/api/estudos/:id', async (req, res) => {
    try {
        const { data, error } = await supabase.from('estudos').select('*').eq('id', req.params.id).single();
        if (error) throw error;
        if (!data) return res.status(404).json({ error: 'Estudo não encontrado' });
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Erro ao buscar estudo', details: error.message });
    }
});

app.post('/api/estudos', async (req, res) => {
    try {
        const { curso, unidade, conteudo, data_inicio, data_termino, observacoes, revisoes, questoes } = req.body;
        if (!curso || !conteudo || !data_inicio) return res.status(400).json({ error: 'Campos obrigatórios: curso, conteudo, data_inicio' });

        const hoje = new Date(); hoje.setHours(0,0,0,0);
        const termino = data_termino ? new Date(data_termino + 'T00:00:00') : null;
        let status = 'PENDENTE';
        if (termino && termino < hoje) status = 'ATRASO';

        const { data, error } = await supabase.from('estudos').insert([{
            curso, unidade: unidade || '', conteudo, data_inicio,
            data_termino: data_termino || null, status,
            observacoes: observacoes || '[]',
            revisoes: revisoes || '[]',
            questoes: questoes || '[]'
        }]).select().single();

        if (error) throw error;
        res.status(201).json(data);
    } catch (error) {
        res.status(500).json({ error: 'Erro ao criar estudo', details: error.message });
    }
});

app.put('/api/estudos/:id', async (req, res) => {
    try {
        const { curso, unidade, conteudo, data_inicio, data_termino, status, observacoes, revisoes, questoes } = req.body;

        const hoje = new Date(); hoje.setHours(0,0,0,0);
        const termino = data_termino ? new Date(data_termino + 'T00:00:00') : null;
        let novoStatus = status || 'PENDENTE';
        if (novoStatus !== 'CONCLUIDO') {
            if (termino && termino < hoje) novoStatus = 'ATRASO';
            else novoStatus = 'PENDENTE';
        }

        const { data, error } = await supabase.from('estudos').update({
            curso, unidade: unidade || '', conteudo, data_inicio,
            data_termino: data_termino || null, status: novoStatus,
            observacoes: observacoes || '[]',
            revisoes: revisoes || '[]',
            questoes: questoes || '[]'
        }).eq('id', req.params.id).select().single();

        if (error) throw error;
        if (!data) return res.status(404).json({ error: 'Estudo não encontrado' });
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Erro ao atualizar estudo', details: error.message });
    }
});

app.patch('/api/estudos/:id', async (req, res) => {
    try {
        const updateData = req.body;
        const { data, error } = await supabase.from('estudos').update(updateData).eq('id', req.params.id).select().single();
        if (error) throw error;
        if (!data) return res.status(404).json({ error: 'Estudo não encontrado' });
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Erro ao atualizar', details: error.message });
    }
});

app.delete('/api/estudos/:id', async (req, res) => {
    try {
        const { error } = await supabase.from('estudos').delete().eq('id', req.params.id);
        if (error) throw error;
        res.json({ message: 'Estudo excluído com sucesso' });
    } catch (error) {
        res.status(500).json({ error: 'Erro ao excluir estudo', details: error.message });
    }
});

app.get('/', (req, res) => res.json({ status: 'online', service: 'Jornada Acadêmica API', version: '1.0.0' }));
app.use((req, res) => res.status(404).json({ error: '404 - Rota não encontrada' }));
app.use((error, req, res, next) => res.status(500).json({ error: 'Erro interno', message: error.message }));

app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🎓 Jornada Acadêmica API v1.0.0`);
    console.log(`🚀 Porta: ${PORT}`);
    console.log(`🔗 Supabase: ${supabaseUrl}\n`);
});
