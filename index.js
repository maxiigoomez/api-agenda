const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors()); // Permite que tu web se conecte a la API
app.use(express.json()); // Permite que la API entienda datos en formato JSON

// Configuración de la conexión a PostgreSQL
// Los datos reales los pondremos en Easypanel más tarde
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// RUTA 1: Obtener la lista de servicios
app.get('/servicios', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM servicios WHERE activo = true');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// RUTA 2: Crear una reserva (El botón de "Agendar")
app.post('/reservar', async (req, res) => {
    const { cliente_nombre, telefono, servicio_id, especialista_id, fecha_inicio } = req.body;
    const codigoUnico = generarCodigoLinkia(); 

    try {
        // 1. UPSERT: Inserta si no existe, o simplemente ignora si ya existe el teléfono
        // Usamos 'RETURNING id' para tener siempre el ID del cliente (nuevo o viejo)
        let resCliente = await pool.query(
            `INSERT INTO clientes (nombre, telefono) 
             VALUES ($1, $2) 
             ON CONFLICT (telefono) DO UPDATE SET nombre = EXCLUDED.nombre
             RETURNING id`,
            [cliente_nombre, telefono]
        );

        // Si por alguna razón el UPDATE no devolvió filas (raro), buscamos el ID
        const cliente_id = resCliente.rows[0].id;

        // 2. Insertamos la cita (con la lógica de duración que ya teníamos)
        const queryCita = `
            INSERT INTO citas (servicio_id, especialista_id, cliente_id, fecha_inicio, fecha_fin, codigo_corto) 
            SELECT $1, $2, $3, $4::timestamp, ($4::timestamp + (duracion_minutos || ' minutes')::interval), $5
            FROM servicios WHERE id = $1
            RETURNING *;
        `;

        const nuevaCita = await pool.query(queryCita, [
            servicio_id, especialista_id, cliente_id, fecha_inicio, codigoUnico
        ]);

        res.json({ 
            mensaje: "Reserva exitosa", 
            codigo: codigoUnico,
            cliente_id: cliente_id // Ahora puedes saber si es recurrente
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/disponibilidad', async (req, res) => {
    const { fecha, servicio_id } = req.query; // Ejemplo: ?fecha=2026-04-10&servicio_id=1

    try {
        // 1. Obtener la duración del servicio que el cliente quiere
        const servRes = await pool.query('SELECT duracion_minutos FROM servicios WHERE id = $1', [servicio_id]);
        if (servRes.rows.length === 0) return res.status(400).json({ error: "Servicio no encontrado" });
        const duracionNueva = servRes.rows[0].duracion_minutos;

        // 2. Obtener todas las citas ya reservadas para ese día
        const citasRes = await pool.query(
            `SELECT fecha_inicio, fecha_fin FROM citas 
             WHERE fecha_inicio::date = $1::date AND estado != 'cancelada'
             ORDER BY fecha_inicio ASC`, 
            [fecha]
        );
        const citasOcupadas = citasRes.rows;

        // 3. Definir el rango de trabajo (ejemplo: 09:00 a 19:00)
        // Podrías traer esto de tu tabla 'horarios_atencion'
        let horariosPosibles = [];
        let horaActual = new Date(`${fecha}T09:00:00`);
        const horaCierre = new Date(`${fecha}T19:00:00`);

        // 4. Generar slots cada 30 minutos y validar cada uno
        while (horaActual < horaCierre) {
            const inicioPropuesto = new Date(horaActual);
            const finPropuesto = new Date(inicioPropuesto.getTime() + duracionNueva * 60000);

            // Validar si el fin propuesto no se pasa del cierre
            if (finPropuesto <= horaCierre) {
                // VALIDACIÓN CLAVE: ¿Choca con alguna cita existente?
                const choca = citasOcupadas.some(cita => {
                    const citaInicio = new Date(cita.fecha_inicio);
                    const citaFin = new Date(cita.fecha_fin);
                    
                    // Lógica de solapamiento:
                    // (InicioNuevo < FinExistente) Y (FinNuevo > InicioExistente)
                    return (inicioPropuesto < citaFin && finPropuesto > citaInicio);
                });

                if (!choca) {
                    horariosPosibles.push(inicioPropuesto.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }));
                }
            }
            
            // Avanzar el puntero 30 minutos para el siguiente slot
            horaActual.setMinutes(horaActual.getMinutes() + 30);
        }

        res.json(horariosPosibles);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Función para generar un código tipo LK-123
function generarCodigoLinkia() {
    const letras = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // Evitamos O e I para no confundir con 0 y 1
    const numeros = "23456789";
    
    let result = "LK-"; // Prefijo de tu marca
    for (let i = 0; i < 2; i++) {
        result += letras.charAt(Math.floor(Math.random() * letras.length));
    }
    for (let i = 0; i < 3; i++) {
        result += numeros.charAt(Math.floor(Math.random() * numeros.length));
    }
    return result; // Ejemplo: LK-RF458
}

// Iniciar el servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});