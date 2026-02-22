require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const { createClient } = require('@supabase/supabase-js');

const app  = express();
const PORT = process.env.PORT || 3000;

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('ERRO: Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

app.use(cors({ origin: '*', methods: ['GET','POST','PUT','DELETE','PATCH','OPTIONS'], allowedHeaders: ['Content-Type'] }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use((req, _res, next) => { console.log(`${new Date().toISOString()} ${req.method} ${req.path}`); next(); });
app.use(express.static(path.join(__dirname, 'public')));

/* HEALTH */
app.get('/health', async (_req, res) => {
    try {
        const { error } = await supabase.from('estudos').select('count', { count:'exact', head:true });
        res.json({ status: error ? 'unhealthy' : 'healthy', db: error ? error.message : 'ok' });
    } catch (e) {
        res.status(500).json({ status: 'unhealthy', error: e.message });
    }
});

/* LIST */
app.get('/api/estudos', async (_req, res) => {
    const { data, error } = await supabase.from('estudos').select('*').order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

/* GET ONE */
app.get('/api/estudos/:id', async (req, res) => {
    const { data, error } = await supabase.from('estudos').select('*').eq('id', req.params.id).single();
    if (error) return res.status(404).json({ error: error.message });
    res.json(data);
});

/* CREATE */
app.post('/api/estudos', async (req, res) => {
    const { curso, unidade, conteudo, data_termino, observacoes, revisoes, questoes } = req.body;
    if (!curso || !conteudo) return res.status(400).json({ error: 'curso e conteudo são obrigatórios' });

    // Auto-status
    let status = 'PENDENTE';
    if (data_termino) {
        const hoje = new Date(); hoje.setHours(0,0,0,0);
        if (new Date(data_termino + 'T00:00:00') < hoje) status = 'ATRASO';
    }

    const { data, error } = await supabase.from('estudos').insert([{
        curso, unidade: unidade || '', conteudo,
        data_termino: data_termino || null,
        status,
        observacoes: observacoes || '[]',
        revisoes:    revisoes    || '[]',
        questoes:    questoes    || '[]'
    }]).select().single();

    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json(data);
});

/* UPDATE FULL */
app.put('/api/estudos/:id', async (req, res) => {
    const { curso, unidade, conteudo, data_termino, status, observacoes, revisoes, questoes } = req.body;

    let novoStatus = status || 'PENDENTE';
    if (novoStatus !== 'CONCLUIDO' && data_termino) {
        const hoje = new Date(); hoje.setHours(0,0,0,0);
        novoStatus = new Date(data_termino + 'T00:00:00') < hoje ? 'ATRASO' : 'PENDENTE';
    }

    const { data, error } = await supabase.from('estudos').update({
        curso, unidade: unidade || '', conteudo,
        data_termino: data_termino || null,
        status: novoStatus,
        observacoes, revisoes, questoes
    }).eq('id', req.params.id).select().single();

    if (error) return res.status(500).json({ error: error.message });
    if (!data)  return res.status(404).json({ error: 'Não encontrado' });
    res.json(data);
});

/* PATCH */
app.patch('/api/estudos/:id', async (req, res) => {
    const { data, error } = await supabase.from('estudos')
        .update(req.body).eq('id', req.params.id).select().single();
    if (error) return res.status(500).json({ error: error.message });
    if (!data)  return res.status(404).json({ error: 'Não encontrado' });
    res.json(data);
});

/* DELETE */
app.delete('/api/estudos/:id', async (req, res) => {
    const { error } = await supabase.from('estudos').delete().eq('id', req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true });
});

app.get('/', (_req, res) => res.json({ service: 'Jornada Acadêmica API', version: '3.0.0' }));
app.use((_req, res) => res.status(404).json({ error: 'Não encontrado' }));

app.listen(PORT, '0.0.0.0', () => {
    console.log(`\nJornada Academica v3.0.0 — porta ${PORT}`);
    console.log(`Supabase: ${supabaseUrl}\n`);
});
