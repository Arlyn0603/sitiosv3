document.getElementById("search-form").addEventListener("submit", function (e) {
    e.preventDefault();

    const fecha = document.getElementById("fecha").value;
    const ubicacion = document.getElementById("ubicacion").value;  // 🔄 Corregido aquí
    const tipo = document.getElementById("tipo").value;
    const precio = document.getElementById("precio").value;

    fetch(`/eventos/buscar?fecha=${fecha}&ubicacion=${ubicacion}&tipo=${tipo}&precio=${precio}`) // 🔄 También corregido aquí
        .then(response => response.json())
        .then(data => {
            let resultadosHTML = "";
            data.forEach(evento => {
                resultadosHTML += `
                    <div class="event">
                        <img src="${evento.imagen}" alt="${evento.nombre}">
                        <div class="event-info">
                            <h3>${evento.nombre}</h3>
                            <p>${evento.ubicacion} - ${evento.fecha}</p>
                            <p>Precio: ₡${evento.precio}</p>
                            <button onclick="seleccionarEvento('${evento.id}')">Ver detalles</button>
                        </div>
                    </div>
                `;
            });
            document.getElementById("eventos-lista").innerHTML = resultadosHTML;
        })
        .catch(error => {
            console.error("Error en la búsqueda:", error);
            document.getElementById("eventos-lista").innerHTML = "<p>Error al cargar los eventos</p>";
        });
});
