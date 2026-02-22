require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// CONFIGURAÇÃO DO SUPABASE
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ ERRO: SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configurados no .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
console.log('✅ Supabase conectado:', supabaseUrl);

// MIDDLEWARES
app.use(cors({ origin: '*', methods: ['GET','POST','PUT','DELETE','PATCH','OPTIONS'], allowedHeaders: ['Content-Type','Authorization'] }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
    console.log(`📥 ${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// SERVIR ARQUIVOS ESTÁTICOS
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));

// HEALTH CHECK
app.get('/health', async (req, res) => {
    try {
        const { error } = await supabase.from('estudos').select('count', { count: 'exact', head: true });
        res.json({
            status: error ? 'unhealthy' : 'healthy',
            database: error ? 'disconnected' : 'connected',
            service: 'Jornada Acadêmica API',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.json({ status: 'unhealthy', error: error.message });
    }
});

// ======================== API ESTUDOS ========================

// GET - Listar todos
app.get('/api/estudos', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('estudos')
            .select('*')
            .order('data_inicio', { ascending: false });
        if (error) throw error;
        res.json(data);
    } catch (error) {
        console.error('❌ Erro ao buscar estudos:', error);
        res.status(500).json({ error: 'Erro ao buscar estudos', details: error.message });
    }
});

// GET - Buscar por ID
app.get('/api/estudos/:id', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('estudos')
            .select('*')
            .eq('id', req.params.id)
            .single();
        if (error) throw error;
        if (!data) return res.status(404).json({ error: 'Estudo não encontrado' });
        res.json(data);
    } catch (error) {
        console.error('❌ Erro ao buscar estudo:', error);
        res.status(500).json({ error: 'Erro ao buscar estudo', details: error.message });
    }
});

// POST - Criar estudo
app.post('/api/estudos', async (req, res) => {
    try {
        const { curso, unidade, conteudo, data_inicio, data_termino, observacoes, revisoes, questoes } = req.body;

        if (!curso || !conteudo || !data_inicio) {
            return res.status(400).json({ error: 'Campos obrigatórios: curso, conteudo, data_inicio' });
        }

        const hoje = new Date(); hoje.setHours(0,0,0,0);
        const termino = data_termino ? new Date(data_termino + 'T00:00:00') : null;
        let status = 'PENDENTE';
        if (termino && termino < hoje) status = 'ATRASO';

        const { data, error } = await supabase
            .from('estudos')
            .insert([{
                curso,
                unidade: unidade || '',
                conteudo,
                data_inicio,
                data_termino: data_termino || null,
                status,
                observacoes: observacoes || '[]',
                revisoes: revisoes || '[]',
                questoes: questoes || '[]'
            }])
            .select()
            .single();

        if (error) throw error;
        console.log('✅ Estudo criado:', data.id);
        res.status(201).json(data);
    } catch (error) {
        console.error('❌ Erro ao criar estudo:', error);
        res.status(500).json({ error: 'Erro ao criar estudo', details: error.message });
    }
});

// PUT - Atualizar estudo completo
app.put('/api/estudos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { curso, unidade, conteudo, data_inicio, data_termino, status, observacoes, revisoes, questoes } = req.body;

        const hoje = new Date(); hoje.setHours(0,0,0,0);
        const termino = data_termino ? new Date(data_termino + 'T00:00:00') : null;
        let novoStatus = status || 'PENDENTE';
        if (novoStatus !== 'CONCLUIDO') {
            novoStatus = (termino && termino < hoje) ? 'ATRASO' : 'PENDENTE';
        }

        const { data, error } = await supabase
            .from('estudos')
            .update({ curso, unidade: unidade || '', conteudo, data_inicio, data_termino: data_termino || null, status: novoStatus, observacoes, revisoes, questoes })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        if (!data) return res.status(404).json({ error: 'Estudo não encontrado' });
        console.log('✅ Estudo atualizado:', id);
        res.json(data);
    } catch (error) {
        console.error('❌ Erro ao atualizar estudo:', error);
        res.status(500).json({ error: 'Erro ao atualizar estudo', details: error.message });
    }
});

// PATCH - Atualização parcial (status, revisoes, questoes)
app.patch('/api/estudos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;

        const { data, error } = await supabase
            .from('estudos')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        if (!data) return res.status(404).json({ error: 'Estudo não encontrado' });
        res.json(data);
    } catch (error) {
        console.error('❌ Erro ao atualizar:', error);
        res.status(500).json({ error: 'Erro ao atualizar', details: error.message });
    }
});

// DELETE - Excluir estudo
app.delete('/api/estudos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase.from('estudos').delete().eq('id', id);
        if (error) throw error;
        console.log('✅ Estudo excluído:', id);
        res.json({ message: 'Estudo excluído com sucesso' });
    } catch (error) {
        console.error('❌ Erro ao excluir:', error);
        res.status(500).json({ error: 'Erro ao excluir estudo', details: error.message });
    }
});

// HOME
app.get('/', (req, res) => {
    res.json({ status: 'online', service: 'Jornada Acadêmica API', version: '1.0.0', timestamp: new Date().toISOString() });
});

// 404
app.use((req, res) => res.status(404).json({ error: '404 - Rota não encontrada', path: req.path }));

// Error handler
app.use((error, req, res, next) => {
    console.error('💥 Erro no servidor:', error);
    res.status(500).json({ error: 'Erro interno do servidor', message: error.message });
});

// INICIAR
app.listen(PORT, '0.0.0.0', () => {
    console.log('\n🎓 ================================');
    console.log(`🎓 Jornada Acadêmica API v1.0.0`);
    console.log(`🚀 Rodando na porta ${PORT}`);
    console.log(`🔗 Supabase: ${supabaseUrl}`);
    console.log(`📁 Estáticos: ${publicPath}`);
    console.log(`🔓 Acesso direto (sem autenticação)`);
    console.log('🎓 ================================\n');
});
