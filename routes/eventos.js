const express = require("express");
const router = express.Router();
const { sql, poolPromise } = require("../config/db");

// Obtener todos los eventos
router.get("/", async (req, res) => {
    try {
        const user = req.session.user || null; // Obtén el usuario de la sesión
        const pool = await poolPromise;
        const result = await pool.request().query("SELECT * FROM Eventos");
        const eventos = result.recordset;
        res.render("index", { user, eventos }); // Pasa `user` y `eventos` a la vista
    } catch (err) {
        console.error("❌ Error al obtener eventos", err);
        res.status(500).send("Error en el servidor");
    }
});

// Obtener detalles de un evento por ID
router.get("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const pool = await poolPromise;
        const result = await pool.request()
            .input("id", sql.Int, id)
            .query("SELECT * FROM Eventos WHERE id = @id");

        if (result.recordset.length === 0) {
            return res.status(404).send("Evento no encontrado");
        }

        const evento = result.recordset[0];
        res.render("evento", { evento });
    } catch (err) {
        console.error("❌ Error al obtener evento", err);
        res.status(500).send("Error en el servidor");
    }
});

module.exports = router;
