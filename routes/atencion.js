const express = require('express');
const router = express.Router();
const { sql, poolPromise } = require('../config/db');
const nodemailer = require('nodemailer');

// Configuración de nodemailer (usando el mismo que factura.js)
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'officialeasyticket1@gmail.com',
        pass: 'ajub egsz gwof nvzw'
    }
});

// Obtener todas las FAQs
router.get('/faqs', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .query('SELECT * FROM PreguntasFrecuentes ORDER BY orden, categoria, pregunta');
        
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Agregar nueva FAQ (solo admin)
router.post('/faqs', async (req, res) => {
    if (!req.session.user || !req.session.user.esAdmin) {
        return res.status(403).json({ error: 'No autorizado' });
    }

    const { pregunta, respuesta, categoria, orden } = req.body;
    
    try {
        const pool = await poolPromise;
        await pool.request()
            .input('pregunta', sql.NVarChar, pregunta)
            .input('respuesta', sql.Text, respuesta)
            .input('categoria', sql.NVarChar, categoria)
            .input('orden', sql.Int, orden || 0)
            .query('INSERT INTO PreguntasFrecuentes (pregunta, respuesta, categoria, orden) VALUES (@pregunta, @respuesta, @categoria, @orden)');
        
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Enviar consulta de soporte
// Enviar consulta de soporte
router.post('/enviar-consulta', async (req, res) => {
    const { email, mensaje } = req.body;
    const usuario = req.session.user ? req.session.user.email : 'Anónimo';
    
    try {
        // 1. Primero guardamos en la base de datos (funcionalidad existente)
        const pool = await poolPromise;
        await pool.request()
            .input('email', sql.VarChar, email)
            .input('asunto', sql.VarChar, 'Consulta desde formulario')
            .input('descripcion', sql.Text, mensaje)
            .query(`
                INSERT INTO TicketsSoporte 
                (usuario_email, asunto, descripcion) 
                VALUES (@email, @asunto, @descripcion)
            `);

        // 2. Luego enviamos el correo (nueva funcionalidad)
        const mailOptions = {
            from: 'soporte@easyticket.com',
            to: 'officialeasyticket1@gmail.com', // Correo de Easy Ticket
            subject: `Nueva consulta de ${usuario}`,
            html: `
                <p><strong>Usuario:</strong> ${usuario}</p>
                <p><strong>Correo:</strong> ${email}</p>
                <p><strong>Mensaje:</strong> ${mensaje}</p>
                <p><strong>Fecha:</strong> ${new Date().toLocaleString()}</p>
            `
        };

        // Envío no bloqueante (no afecta la respuesta al usuario)
        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.error('Error al enviar correo:', error);
            } else {
                console.log('Correo enviado:', info.response);
            }
        });

        // 3. Mantenemos la misma respuesta al cliente (funcionalidad existente)
        res.json({ 
            success: true, 
            message: 'Tu consulta ha sido enviada. Te responderemos pronto.' 
        });
        
    } catch (err) {
        console.error('Error al enviar consulta:', err);
        res.status(500).json({ 
            error: 'Error al enviar la consulta',
            details: err.message
        });
    }
});

// Crear nuevo ticket
router.post('/tickets', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Debes iniciar sesión' });
    }

    const { asunto, descripcion } = req.body;
    
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('email', sql.VarChar, req.session.user.email)
            .input('asunto', sql.VarChar, asunto)
            .input('descripcion', sql.Text, descripcion)
            .query('INSERT INTO TicketsSoporte (usuario_email, asunto, descripcion) OUTPUT INSERTED.id VALUES (@email, @asunto, @descripcion)');
        
        res.json({ 
            success: true, 
            ticketId: result.recordset[0].id,
            message: 'Ticket creado con éxito' 
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// En routes/atencion.js
router.get('/tickets', async (req, res) => {
    // Asegúrate de establecer el Content-Type primero
    res.setHeader('Content-Type', 'application/json');
    
    if (!req.session.user) {
        return res.status(401).json({ error: 'Debes iniciar sesión' }); // No usar redirect
    }

    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('email', sql.VarChar, req.session.user.email)
            .query('SELECT * FROM TicketsSoporte WHERE usuario_email = @email ORDER BY fecha_creacion DESC');
        
        res.json(result.recordset);
    } catch (err) {
        console.error('Error en GET /tickets:', err);
        res.status(500).json({ 
            error: 'Error al obtener tickets',
            details: err.message
        });
    }
});

router.get('/tickets/vista', async (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('email', sql.VarChar, req.session.user.email)
            .query(`
                SELECT t.*, 
                (SELECT COUNT(*) FROM RespuestasTicket WHERE ticket_id = t.id) as respuestas_count
                FROM TicketsSoporte t 
                WHERE usuario_email = @email 
                ORDER BY fecha_creacion DESC
            `);
        
        res.render('tickets', { 
            user: req.session.user,
            tickets: result.recordset 
        });
    } catch (err) {
        console.error('Error al cargar tickets:', err);
        res.render('tickets', { 
            user: req.session.user,
            error: 'Error al cargar los tickets' 
        });
    }
});
// Obtener detalles de un ticket
router.get('/tickets/:id', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Debes iniciar sesión' });
    }

    try {
        const pool = await poolPromise;
        
        // Verificar que el ticket pertenece al usuario
        const ticketResult = await pool.request()
            .input('id', sql.Int, req.params.id)
            .input('email', sql.VarChar, req.session.user.email)
            .query('SELECT * FROM TicketsSoporte WHERE id = @id AND usuario_email = @email');
        
        if (ticketResult.recordset.length === 0) {
            return res.status(404).json({ error: 'Ticket no encontrado' });
        }
        
        // Obtener mensajes
        const mensajesResult = await pool.request()
            .input('ticket_id', sql.Int, req.params.id)
            .query('SELECT * FROM RespuestasTicket WHERE ticket_id = @ticket_id ORDER BY fecha_envio');
        
        res.json({
            ticket: ticketResult.recordset[0],
            mensajes: mensajesResult.recordset
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Enviar mensaje en ticket
router.post('/tickets/:id/mensajes', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Debes iniciar sesión' });
    }

    const { mensaje } = req.body;
    
    try {
        const pool = await poolPromise;
        
        // Verificar que el ticket pertenece al usuario
        const ticketResult = await pool.request()
            .input('id', sql.Int, req.params.id)
            .input('email', sql.VarChar, req.session.user.email)
            .query('SELECT id FROM TicketsSoporte WHERE id = @id AND usuario_email = @email');
        
        if (ticketResult.recordset.length === 0) {
            return res.status(404).json({ error: 'Ticket no encontrado' });
        }
        
        // Insertar mensaje
        await pool.request()
            .input('ticket_id', sql.Int, req.params.id)
            .input('remitente', sql.VarChar, req.session.user.email)
            .input('mensaje', sql.Text, mensaje)
            .query('INSERT INTO RespuestasTicket (ticket_id, remitente, mensaje) VALUES (@ticket_id, @remitente, @mensaje)');
        
        // Actualizar fecha de modificación del ticket
        await pool.request()
            .input('id', sql.Int, req.params.id)
            .query('UPDATE TicketsSoporte SET fecha_actualizacion = GETDATE() WHERE id = @id');
        
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;