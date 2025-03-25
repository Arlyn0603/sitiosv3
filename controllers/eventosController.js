const eventos = [
    { id: 1, nombre: "Camilo Nuestro Lugar Feliz Tour", ubicacion: "Alajuela", fecha: "2025-04-10", precio: 25000, imagen: "/img/camilo.jpg" },
    { id: 2, nombre: "Chayanne Bailemos Otra Vez Tour", ubicacion: "San José", fecha: "2025-05-15", precio: 30000, imagen: "/img/chayanne.jpg" },
    { id: 3, nombre: "Shawn Mendes For Friends And Family Only", ubicacion: "Alajuela", fecha: "2025-06-20", precio: 28000, imagen: "/img/shawnmendes.jpg" },
    { id: 4, nombre: "Melendi Gira 20 Años", ubicacion: "Alajuela", fecha: "2025-07-05", precio: 20000, imagen: "/img/melendi.jpg" }
];

// Controlador para mostrar todos los eventos
exports.listarEventos = (req, res) => {
    res.render("index", { eventos });
};

// Controlador para filtrar eventos según los parámetros de búsqueda
exports.buscarEventos = (req, res) => {
    let { fecha, destino, tipo, precio } = req.query;

    let eventosFiltrados = eventos.filter(evento => {
        return (!fecha || evento.fecha === fecha) &&
               (!destino || evento.ubicacion === destino) &&
               (!precio || evento.precio <= parseInt(precio));
    });

    res.json(eventosFiltrados);
};
