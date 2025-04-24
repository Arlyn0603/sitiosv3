const express = require('express');
const router = express.Router();
const { sql, poolPromise } = require('../config/db'); // Asegúrate de tener este archivo configurado

// Ruta para mostrar la billetera
router.get('/billetera', async (req, res) => {
    if (!req.session.user) {
        return res.redirect('/usuarios/login');
    }

    try {
        const pool = await poolPromise;
        const request = pool.request();
        request.input('CorreoElectronico', sql.VarChar(100), req.session.user.email);
        
        const result = await request.execute('ObtenerTarjetasPorEmail');
        
        console.log('Tarjetas obtenidas:', result.recordset); // Asegúrate de que Saldo esté presente
        
        res.render('billetera', { 
            user: req.session.user,
            tarjetas: result.recordset || []
        });
    } catch (err) {
        console.error('Error al obtener tarjetas:', err);
        res.render('billetera', { 
            user: req.session.user,
            tarjetas: [],
            error: 'Error al cargar los métodos de pago'
        });
    }
});



// Ruta para agregar una tarjeta (modificada para usar el procedimiento almacenado)
router.post('/billetera/agregar-tarjeta', async (req, res) => {
    console.log('Datos recibidos:', req.body);

    const { numeroTarjeta, nombreTitular, fechaExpiracion, codigoSeguridad, tipoTarjeta, saldo, userEmail } = req.body;

    if (!userEmail) {
        return res.status(401).json({ success: false, message: "Usuario no autenticado" });
    }

    try {
        const pool = await poolPromise;
        
        // Convertir fecha MM/YY a formato Date (primer día del mes)
        const [month, year] = fechaExpiracion.split('/');
        const expDate = new Date(`20${year}-${month}-01`);

        // Verificar que la fecha es válida
        if (isNaN(expDate.getTime())) {
            throw new Error('Fecha de expiración no válida');
        }

        // Ejecutar el procedimiento almacenado
        const request = pool.request();
        request.input('CorreoElectronico', sql.VarChar(100), userEmail);
        request.input('NumeroTarjeta', sql.VarChar(16), numeroTarjeta);
        request.input('NombreTitular', sql.NVarChar(100), nombreTitular);
        request.input('FechaExpiracion', sql.Date, expDate);
        request.input('CodigoSeguridad', sql.VarChar(3), codigoSeguridad);
        request.input('TipoTarjeta', sql.NVarChar(50), tipoTarjeta);
        request.input('Saldo', sql.Decimal(10, 2), saldo);

        await request.execute('GuardarTarjetaPorEmail');
        
        res.redirect('/billetera');
    } catch (err) {
        console.error('Error al guardar tarjeta:', err);
        
        // Mensaje más específico basado en el error
        let errorMessage = 'Error al guardar la tarjeta';
        if (err.message.includes('No se encontró un usuario')) {
            errorMessage = 'Usuario no encontrado. Por favor inicie sesión nuevamente.';
        } else if (err.message.includes('duplicate key')) {
            errorMessage = 'Esta tarjeta ya está registrada.';
        } else if (err.message.includes('Fecha de expiración no válida')) {
            errorMessage = 'Fecha de expiración no válida. Por favor verifica el formato (MM/YY).';
        }
        
        res.status(500).render('billetera', { 
            user: req.session.user,
            error: errorMessage
        });
    }
});
// Ruta para eliminar una tarjeta
// Ruta para eliminar una tarjeta
router.post('/billetera/eliminar-tarjeta', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, message: "No autorizado" });
    }

    const { numeroTarjeta } = req.body;

    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('NumeroTarjeta', sql.VarChar(16), numeroTarjeta)
            .input('CorreoElectronico', sql.VarChar(100), req.session.user.email)
            .query(`
                DELETE FROM Tarjetas
                WHERE NumeroTarjeta = @NumeroTarjeta
                AND UsuarioId IN (SELECT id FROM Usuarios WHERE CorreoElectronico = @CorreoElectronico)
            `);

        // Verificar si se eliminó alguna fila
        if (result.rowsAffected[0] > 0) {
            res.json({ success: true, message: "Tarjeta eliminada correctamente" });
        } else {
            res.json({ success: false, message: "No se encontró la tarjeta para eliminar" });
        }
    } catch (err) {
        console.error('Error al eliminar tarjeta:', err);
        res.status(500).json({ success: false, message: "Error al eliminar tarjeta" });
    }
});
module.exports = router;