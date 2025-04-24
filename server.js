const express = require("express");
const path = require("path");
const bodyParser = require("body-parser");
const session = require("express-session");
const { sql, poolPromise } = require("./config/db"); // Asegúrate de tener este archivo configurado
const cors = require('cors'); // Instálalo con npm install cors


const app = express();

const http = require('http').createServer(app);
const io = require('socket.io')(http);
// Habilitar CORS para todas las rutas
app.use(cors({
    origin: 'http://localhost:3000', // Ajusta según tu URL frontend
    credentials: true
}));

app.use(session({
    secret: 'SessionsEasyTicket',
    resave: false,
    saveUninitialized: true,
    cookie: { 
        secure: false, // Change to true if using HTTPS
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Middleware para archivos estáticos (CSS, imágenes, JS)
app.use(express.static(path.join(__dirname, "public")));

// Configurar el motor de vistas EJS
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Middleware para procesar datos de formularios
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
});

let carrito = [];

// Importar rutas
const eventosRoutes = require("./routes/evento");
app.use("/evento", eventosRoutes);

// Ruta principal
app.get("/", (req, res) => {
    res.redirect("/evento");
});

// Ruta para cerrar sesión
app.get("/logout", (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error("Error al cerrar sesión:", err);
            return res.status(500).send("Error al cerrar sesión");
        }
        res.redirect("/");
    });
});

// Ruta para agregar al carrito (modificada para manejar asientos)
app.post("/carrito/agregar", (req, res) => {
    if (!req.session.user) {
        return res.redirect('/usuarios/login');
    }

    const { eventoId, eventoNombre, bloqueId, bloqueNombre, precio, asientos } = req.body;
    
    // Convertir asientos a array si es un string (cuando solo se selecciona 1 asiento)
    const asientosArray = Array.isArray(asientos) ? asientos : [asientos];
    
    carrito.push({
        eventoId,
        eventoNombre,
        bloqueId,
        bloqueNombre,
        precio: parseFloat(precio),
        asientos: asientosArray,
        cantidad: asientosArray.length
    });
    
    res.redirect("/carrito");
});

// Ruta para mostrar el carrito
app.get("/carrito", async (req, res) => {
    if (!req.session.user) {
        return res.redirect('/usuarios/login');
    }

    try {
        const pool = await poolPromise;
        const request = pool.request();
        request.input('CorreoElectronico', sql.VarChar(100), req.session.user.email);
        const result = await request.execute('ObtenerTarjetasPorEmail');
        
        const tarjetas = result.recordset || [];
        const subtotal = carrito.reduce((acc, item) => acc + (item.cantidad * item.precio), 0);
        const impuestos = subtotal * 0.13;
        const total = subtotal + impuestos;
        
        res.render("carrito", { 
            carrito, 
            subtotal, 
            impuestos, 
            total, 
            tarjetas, 
            successMessage: null, 
            errorMessage: null 
        });
    } catch (err) {
        console.error('Error al obtener tarjetas:', err);
        res.render("carrito", { 
            carrito, 
            subtotal: 0, 
            impuestos: 0, 
            total: 0, 
            tarjetas: [], 
            successMessage: null, 
            errorMessage: 'Error al obtener tarjetas' 
        });
    }
});
// Rutas de preventa
// Ruta para preventa admin
app.get('/preventa-admin', async (req, res) => {
    try {
        const pool = await poolPromise;
        
        // Obtener eventos
        const eventosResult = await pool.request().query(`
            SELECT e.eventoId, e.nombre, e.tipo, e.fecha, 
                   l.nombre AS lugarNombre, l.id AS lugarId
            FROM Evento e
            JOIN Lugares l ON e.lugarId = l.id
            ORDER BY e.fecha DESC
        `);
        
        // Obtener lugares
        const lugaresResult = await pool.request().query(`
            SELECT id, nombre FROM Lugares ORDER BY nombre
        `);
        
        // Obtener métodos de pago disponibles
        const metodosPagoResult = await pool.request().query(`
            SELECT DISTINCT TipoTarjeta 
            FROM Tarjetas
            WHERE TipoTarjeta IN ('Visa', 'Mastercard', 'American Express')
        `);
        
        res.render('preventa-admin', {
            user: req.session.user || null,
            eventos: eventosResult.recordset,
            lugares: lugaresResult.recordset,
            metodosPagoDisponibles: metodosPagoResult.recordset,
            preventa: null // Inicialmente null, se puede cargar si hay un evento específico
        });
    } catch (error) {
        console.error('Error loading preventa admin page:', error);
        res.status(500).send('Error loading preventa admin page');
    }
});
// Agrega esto en tu server.js, preferiblemente con las otras rutas similares
// Con esta:
app.get('/configuracion', (req, res) => {
    res.render('configuracion'); // Esto renderizará views/configuracion.ejs
});


// Importar rutas de empleados
const empleadosRouter = require('./routes/empleados');
app.use('/empleados', empleadosRouter);

const chatbotRoutes = require('./routes/chatbot');
app.use('/api', chatbotRoutes);

// Ruta para eliminar un ítem del carrito
app.post("/carrito/eliminar", (req, res) => {
    const { index } = req.body;
    carrito.splice(index, 1);
    res.redirect("/carrito");
});

// Ruta para procesar la compra (modificada para manejar asientos)
app.post("/comprar", async (req, res) => {
    const { tarjeta } = req.body;

    if (!req.session.user) {
        return res.status(401).json({ success: false, message: "Usuario no autenticado" });
    }

    let transaction;

    try {
        const pool = await poolPromise;
        transaction = new sql.Transaction(pool);

        await transaction.begin();
        const request = new sql.Request(transaction);

        // 1. Verificar tarjeta y saldo
        request.input('NumeroTarjetaParam', sql.VarChar, tarjeta);
        const tarjetaResult = await request.query('SELECT Saldo FROM Tarjetas WHERE NumeroTarjeta = @NumeroTarjetaParam');
        
        if (tarjetaResult.recordset.length === 0) {
            await transaction.rollback();
            return res.status(400).json({ success: false, message: "Tarjeta no encontrada" });
        }

        const saldoActual = tarjetaResult.recordset[0].Saldo;
        const subtotal = carrito.reduce((acc, item) => acc + item.cantidad * item.precio, 0);
        const impuestos = subtotal * 0.13;
        const tarifaServicio = 5000;
        const totalCompra = subtotal + impuestos + tarifaServicio;

        if (saldoActual < totalCompra) {
            await transaction.rollback();
            return res.status(400).json({ success: false, message: "Saldo insuficiente" });
        }

        // 2. Preparar datos para la factura
        const detallesCompra = carrito.map(item => ({
            nombre: item.nombre,
            zona: item.zona,
            cantidad: item.cantidad,
            precioUnitario: item.precio,
            subtotal: item.cantidad * item.precio
        }));

        const datosFactura = {
            usuario: req.session.user,
            detalles: detallesCompra,
            subtotal,
            impuestos,
            tarifaServicio,
            total: totalCompra,
            metodoPago: `**** **** **** ${tarjeta.slice(-4)}`,
            fecha: new Date().toLocaleDateString('es-ES', { 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            }),
            numeroFactura: `FAC-${Date.now()}`
        };

        // 3. Registrar la compra en la base de datos

        for (const item of carrito) {
            await request
                .input('bloque', sql.NVarChar, item.bloqueNombre) // Asegúrate de que 'bloqueNombre' tenga un valor válido
                .input('cantidad', sql.Int, item.cantidad)
                .input('NumeroTarjetaCompra', sql.VarChar, tarjeta)
                .input('EmailCliente', sql.VarChar, req.session.user.email)
                .input('Total', sql.Decimal(10, 2), totalCompra)
                .input('nombreEvento', sql.NVarChar(255), item.eventoNombre)
                .input('ubicacion', sql.NVarChar(255), item.bloqueNombre)
                .query(`
                    INSERT INTO Compras (
                        Bloque, 
                        Cantidad, 
                        NumeroTarjeta, 
                        EmailCliente, 
                        Total,
                        nombreEvento,
                        ubicacion,
                        estado
                    ) 
                    VALUES (
                        @bloque, 
                        @cantidad, 
                        @NumeroTarjetaCompra, 
                        @EmailCliente, 
                        @Total,
                        @nombreEvento,
                        @ubicacion,
                        'Completado'
                    )
                `);
        }

        // Resto del código permanece igual...
        // 4. Actualizar saldo de la tarjeta
        await request
            .input('NuevoSaldo', sql.Decimal(10, 2), saldoActual - totalCompra)
            .input('NumeroTarjetaUpdate', sql.VarChar, tarjeta)
            .query('UPDATE Tarjetas SET Saldo = @NuevoSaldo WHERE NumeroTarjeta = @NumeroTarjetaUpdate');

        await transaction.commit();

        // 5. Enviar factura por correo (no bloqueante)
        fetch('http://localhost:3003/factura/enviar-factura', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ datosFactura })
        })
        .then(response => response.json())
        .then(data => console.log('Factura enviada:', data))
        .catch(err => console.error('Error al enviar factura:', err));

        // 6. Vaciar carrito y mostrar éxito
        carrito = [];
        
        // Obtener tarjetas actualizadas para la vista
        const tarjetasRequest = new sql.Request(pool);
        tarjetasRequest.input('CorreoElectronico', sql.VarChar(100), req.session.user.email);
        const tarjetasResult = await tarjetasRequest.execute('ObtenerTarjetasPorEmail');

        res.render("carrito", { 
            carrito, 
            subtotal: 0, 
            impuestos: 0, 
            total: 0, 
            tarjetas: tarjetasResult.recordset || [], 
            successMessage: "Compra realizada con éxito. Se ha enviado la factura a tu correo.", 
            errorMessage: null 
        });

    } catch (err) {
        console.error('Error al procesar la compra:', err);
        if (transaction) await transaction.rollback();
        
        res.status(500).render("carrito", { 
            carrito, 
            subtotal: 0, 
            impuestos: 0, 
            total: 0, 
            tarjetas: [], 
            successMessage: null, 
            errorMessage: 'Error al procesar la compra' 
        });
    }
});

// Ruta para cancelar compra
app.post("/compras/cancelar/:id", async (req, res) => {
    const { id } = req.params;
    const { razon } = req.body;
    
    if (razon.toLowerCase() !== "accidente") {
        return res.status(400).json({
            success: false,
            message: "La razón debe ser 'accidente' para cancelar la compra.",
        });
    }

    try {
        const pool = await poolPromise;
        const request = pool.request();
        request.input("id", sql.Int, id);
        request.input("estado", sql.NVarChar, "Cancelado");
        await request.query("UPDATE Compras SET Estado = @estado WHERE Id = @id");

        res.status(200).json({
            success: true,
            message: "Compra cancelada exitosamente.",
        });
    } catch (err) {
        console.error("Error al cancelar la compra:", err);
        res.status(500).json({
            success: false,
            message: "Error interno al cancelar la compra.",
        });
    }
});

// Ruta para ver historial de compras
app.get("/historial", async (req, res) => {
    if (!req.session.user) {
        return res.redirect('/usuarios/login');
    }

    try {
        const pool = await poolPromise;
        const request = pool.request();
        request.input('EmailCliente', sql.NVarChar(255), req.session.user.email);
        const result = await request.execute('ObtenerHistorialCompras');
        
        const historial = result.recordset || [];
        res.render("historial", { historial, errorMessage: null });
    } catch (err) {
        console.error('Error al obtener el historial de compras:', err);
        res.render("historial", { historial: [], errorMessage: 'Error al obtener el historial de compras' });
    }
});
// Función para obtener el precio de una zona
function obtenerPrecioZona(zona) {
    const precios = {
        "sombra-este": 45000,
        "palco-este": 50000,
        "platea-este": 55000,
        "sombra-oeste": 45000,
        "palco-oeste": 50000,
        "platea-oeste": 55000,
        "graderia-norte": 50000,
        "graderia-sur": 50000,
        "vip-nitro-1": 80000,
        "vip-nitro-2": 80000
    };
    return precios[zona] || 0;
}

const usersRouter = require("./routes/usuarios");
app.use("/usuarios", usersRouter);

const billeteraRoutes = require('./routes/billetera');
app.use('/', billeteraRoutes);

const facturaRoutes = require('./routes/factura');
app.use('/factura', facturaRoutes)

const atencionRoutes = require('./routes/atencion');
app.use('/atencion', atencionRoutes);
app.get('/usuario', (req, res) => {
    res.render('usuario'); // Asegúrate de que 'usuario.ejs' esté en la carpeta 'views'
});

app.get('/administrador', (req, res) => {
    res.render('administrador'); // Asegúrate de que 'usuario.ejs' esté en la carpeta 'views'
});

app.get('/informacion_u', (req, res) => {
    if (req.session.user) { // Verifica si el usuario está autenticado
        res.render('informacion_u', { user: req.session.user }); // Pasa la información del usuario al EJS
    } else {
        res.redirect('/usuarios/login'); // Redirige al login si no está autenticado
    }
});

app.get('/usuario/informacion', (req, res) => {
    if (req.isAuthenticated()) { // Verifica si el usuario está autenticado
        res.render('informacion_u', { user: req.user }); // Pasa la información del usuario al EJS
    } else {
        res.redirect('/login'); // Redirige al login si no está autenticado
    }
});

app.post('/usuario/actualizar', (req, res) => {
    const { firstName, lastName, email, password } = req.body;

    // Actualiza la información del usuario en la base de datos
    User.findByIdAndUpdate(req.user._id, {
        firstName,
        lastName,
        email,
        ...(password && { password }) // Solo actualiza la contraseña si se proporciona
    }, { new: true }, (err, updatedUser) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Error al actualizar la información del usuario.');
        }
        res.redirect('/usuario/informacion'); // Redirige a la misma página después de guardar
    });
});
// Configuración de Socket.io
io.on('connection', (socket) => {
    console.log('Usuario conectado al chat');
    
    socket.on('mensaje_cliente', (data) => {
        // Guardar mensaje en BD
        const pool = poolPromise;
        pool.request()
            .input('usuario', sql.VarChar, data.usuario)
            .input('mensaje', sql.Text, data.mensaje)
            .query('INSERT INTO ChatMensajes (usuario, mensaje) VALUES (@usuario, @mensaje)');
        
        // Reenviar a agentes de soporte
        socket.broadcast.emit('mensaje_agente', data);
    });
    
    socket.on('disconnect', () => {
        console.log('Usuario desconectado del chat');
    });
});
 
const analisisRoutes = require('./routes/analisis');
app.use('/', analisisRoutes); // Cambia '/analisis' por '/'




// Importar rutas
const edificacionesRoutes = require("./routes/edificaciones");
app.use("/edificaciones", edificacionesRoutes);

// Ruta principal
app.get('/edificaciones', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query("SELECT * FROM Lugares");
        const lugares = result.recordset;

        res.render('edificaciones', { lugares }); // Pasa los lugares a la vista
    } catch (err) {
        console.error("Error al obtener los lugares:", err);
        res.status(500).send("Error al cargar la página de edificaciones.");
    }
});

const eventoRoutes = require("./routes/evento");

// filepath: c:\Users\arlin\Downloads\EasyTicket Header\EasyTicket administrador\EasyTicket v2\server.js
app.use(async (req, res, next) => {
    try {
        const pool = await poolPromise; // Obtén la conexión al pool
        await pool.request()
            .input('ruta', sql.VarChar, req.originalUrl)
            .input('usuario', sql.VarChar, req.session.user ? req.session.user.email : 'Anónimo')
            .input('fecha', sql.DateTime, new Date())
            .query('INSERT INTO RegistroEventos (ruta, usuario, fecha) VALUES (@ruta, @usuario, @fecha)');
    } catch (err) {
        console.error('Error al registrar evento:', err);
    }
    next();
});

// Configuración correcta de las rutas
app.use("/evento", eventoRoutes);

const comentariosRoutes = require('./routes/comentarios');
app.use('/comentarios', comentariosRoutes);

// Iniciar el servidor
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
    console.log(carrito);
})