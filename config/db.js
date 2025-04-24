const sql = require("mssql");

const config = {
    user: "EventosDB",
    password: "EventosDB1.",
    server: "tiusr16pl.cuc-carrera-ti.ac.cr",
    database: "EventosDB",
    port: 1433, // Explicitly add this
    options: {
        encrypt: true,
        trustServerCertificate: true
    }
};

const poolPromise = new sql.ConnectionPool(config)
    .connect()
    .then(pool => {
        console.log("✅ Conexión a SQL Server exitosa");
        return pool;
    })
    .catch(err => {
        console.error("❌ Error en la conexión a SQL Server", err);
    });

module.exports = {
    sql, poolPromise
};
