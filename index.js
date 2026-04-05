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
    
    // Generamos el código único para la gestión
    const codigoUnico = generarCodigoLinkia(); 

    try {
        // 1. Insertamos el cliente y OBTENEMOS su ID
        const resultadoCliente = await pool.query(
            'INSERT INTO clientes (nombre, telefono) VALUES ($1, $2) RETURNING id',
            [cliente_nombre, telefono]
        );

        // AQUÍ ESTABA EL ERROR: Extraemos el ID del resultado
        const cliente_id = resultadoCliente.rows[0].id;

        // 2. Ahora sí, insertamos la cita usando el cliente_id que acabamos de crear
        const nuevaCita = await pool.query(
            `INSERT INTO citas (
                servicio_id, 
                especialista_id, 
                cliente_id, 
                fecha_inicio, 
                fecha_fin, 
                codigo_corto,
                pago_limite
            ) 
            VALUES ($1, $2, $3, $4, $4::timestamp + interval '1 hour', $5, now() + interval '24 hours') 
            RETURNING *`,
            [servicio_id, especialista_id, cliente_id, fecha_inicio, codigoUnico]
        );

        // 3. Devolvemos la respuesta exitosa con el código para el cliente
        res.json({ 
            mensaje: "Reserva creada con éxito", 
            codigo: codigoUnico,
            cita: nuevaCita.rows[0] 
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Error al reservar: " + err.message });
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