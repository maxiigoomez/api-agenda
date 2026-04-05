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

  try {
    // 1. Primero creamos al cliente (o lo buscamos)
    const cliente = await pool.query(
      'INSERT INTO clientes (nombre, telefono) VALUES ($1, $2) RETURNING id',
      [cliente_nombre, telefono]
    );

    // 2. Calculamos la fecha de fin y el pago límite (Lógica de negocio)
    // Para simplificar, aquí podrías llamar a una función que sume la duración del servicio
    
    // 3. Insertamos la cita
    const nuevaCita = await pool.query(
            `INSERT INTO citas (servicio_id, especialista_id, cliente_id, fecha_inicio, fecha_fin, codigo_corto) 
             VALUES ($1, $2, $3, $4, $4::timestamp + interval '1 hour', $5) RETURNING *`,
            [servicio_id, especialista_id, cliente_id, fecha_inicio, codigoUnico]
        );

        // 3. Devolvemos el código al frontend
        res.json({ 
            mensaje: "Reserva exitosa", 
            codigo: codigoUnico, 
            cita: nuevaCita.rows[0] 
        });
  } catch (err) {
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