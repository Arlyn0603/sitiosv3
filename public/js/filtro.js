document.getElementById("search-form").addEventListener("submit", function (e) {
    e.preventDefault();

    const fechaFiltro = document.getElementById("fecha").value;
    const ubicacionFiltro = document.getElementById("ubicacion").value;
    const tipoFiltro = document.getElementById("tipo").value;
    const precioFiltro = document.getElementById("precio").value;

    document.querySelectorAll(".event").forEach(evento => {
        const fechaEvento = evento.getAttribute("data-fecha");
        const ubicacionEvento = evento.getAttribute("data-ubicacion");
        const tipoEvento = evento.getAttribute("data-tipo");
        const precioEvento = parseFloat(evento.getAttribute("data-precio"));

        let mostrar = true;

        if (fechaFiltro && fechaEvento !== fechaFiltro) mostrar = false;
        if (ubicacionFiltro && ubicacionEvento !== ubicacionFiltro) mostrar = false;
        if (tipoFiltro && tipoEvento !== tipoFiltro) mostrar = false;
        if (precioFiltro && precioEvento > parseFloat(precioFiltro)) mostrar = false;

        evento.style.display = mostrar ? "block" : "none";
    });
});
