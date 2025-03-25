const express = require('express');
const router = express.Router();
const pdf = require('html-pdf');
const { sql, poolPromise } = require('../config/db');
const nodemailer = require('nodemailer');

// Configuración del transporter de correo
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'officialeasyticket1@gmail.com',
        pass: 'ajub egsz gwof nvzw'
    }
});

// Función para generar el HTML de la factura
function generarHTMLFactura(datos) {
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body { font-family: Arial, sans-serif; margin: 0; padding: 20px; color: #333; }
                .container { max-width: 800px; margin: 0 auto; }
                .header { text-align: center; margin-bottom: 20px; }
                .logo { max-width: 150px; }
                .factura-info { display: flex; justify-content: space-between; margin-bottom: 20px; }
                .datos-cliente { background: #f9f9f9; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
                table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
                th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
                th { background-color: #2c3e50; color: white; }
                .totales { background: #f5f5f5; padding: 15px; border-radius: 5px; }
                .footer { margin-top: 30px; text-align: center; font-size: 12px; color: #777; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>EasyTicket</h1>
                    <h2>Factura #${datos.numeroFactura}</h2>
                    <p>Fecha: ${datos.fecha}</p>
                </div>
                
                <div class="datos-cliente">
                    <h3>Datos del Cliente</h3>
                    <p><strong>Nombre:</strong> ${datos.usuario.firstName} ${datos.usuario.lastName}</p>
                    <p><strong>Email:</strong> ${datos.usuario.email}</p>
                    <p><strong>Método de pago:</strong> ${datos.metodoPago}</p>
                </div>
                
                <table>
                    <thead>
                        <tr>
                            <th>Evento</th>
                            <th>Zona</th>
                            <th>Cantidad</th>
                            <th>Precio Unitario</th>
                            <th>Subtotal</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${datos.detalles.map(item => `
                            <tr>
                                <td>${item.nombre}</td>
                                <td>${item.zona}</td>
                                <td>${item.cantidad}</td>
                                <td>₡${item.precioUnitario.toLocaleString()}</td>
                                <td>₡${item.subtotal.toLocaleString()}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                
                <div class="totales">
                    <p><strong>Subtotal:</strong> ₡${datos.subtotal.toLocaleString()}</p>
                    <p><strong>Impuestos (13%):</strong> ₡${datos.impuestos.toLocaleString()}</p>
                    <p><strong>Tarifa de servicio:</strong> ₡${datos.tarifaServicio.toLocaleString()}</p>
                    <p><strong>Total:</strong> ₡${datos.total.toLocaleString()}</p>
                </div>
                
                <div class="footer">
                    <p>Gracias por su compra</p>
                    <p>EasyTicket - Todos los derechos reservados</p>
                </div>
            </div>
        </body>
        </html>
    `;
}

// Función para generar y enviar la factura
router.post('/enviar-factura', async (req, res) => {
    const { datosFactura } = req.body;

    try {
        const html = generarHTMLFactura(datosFactura);
        
        const pdfBuffer = await new Promise((resolve, reject) => {
            const opcionesPDF = {
                format: 'Letter',
                border: {
                    top: '0.5in',
                    right: '0.5in',
                    bottom: '0.5in',
                    left: '0.5in'
                }
            };

            pdf.create(html, opcionesPDF).toBuffer((err, buffer) => {
                if (err) return reject(err);
                resolve(buffer);
            });
        });

        const mailOptions = {
            from: 'EasyTicket <officialeasyticket1@gmail.com>',
            to: datosFactura.usuario.email,
            subject: `Factura de compra #${datosFactura.numeroFactura}`,
            text: 'Adjunto encontrará su factura de compra',
            attachments: [{
                filename: `factura-${datosFactura.numeroFactura}.pdf`,
                content: pdfBuffer
            }]
        };

        await transporter.sendMail(mailOptions);
        
        res.status(200).json({ 
            success: true, 
            message: 'Factura enviada con éxito' 
        });
    } catch (error) {
        console.error('Error al generar/enviar factura:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error al procesar la factura',
            error: error.message 
        });
    }
});

module.exports = router;