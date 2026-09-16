const express = require('express');
const path = require('path');
const fs = require('fs');
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = 3000;

// Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// In-memory fallback for reservations if Supabase env vars are not yet entered
const localReservas = [];

// Supabase lazy client initialization
let supabaseClient = null;

function getSupabaseCredentials() {
  let rawUrl = (process.env.SUPABASE_URL || '').trim();
  let rawKey = (
    process.env.SUPABASE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    ''
  ).trim();

  // Strip wrapping quotes if user pasted with quotes
  rawUrl = rawUrl.replace(/^["']|["']$/g, '').trim();
  rawKey = rawKey.replace(/^["']|["']$/g, '').trim();

  if (!rawUrl || !rawKey) {
    return { url: null, key: null };
  }

  // Normalize URL
  let cleanUrl = rawUrl.replace(/\/+$/, '');

  try {
    if (cleanUrl.startsWith('http://') || cleanUrl.startsWith('https://')) {
      const parsed = new URL(cleanUrl);
      if (!parsed.hostname.includes('.')) {
        parsed.hostname = `${parsed.hostname}.supabase.co`;
        cleanUrl = parsed.origin;
      } else {
        cleanUrl = parsed.origin;
      }
    } else {
      if (!cleanUrl.includes('.')) {
        cleanUrl = `https://${cleanUrl}.supabase.co`;
      } else {
        cleanUrl = `https://${cleanUrl}`;
      }
    }
  } catch (err) {
    console.error('Error parseando SUPABASE_URL:', err.message);
  }

  return { url: cleanUrl, key: rawKey };
}

function getSupabase() {
  const { url: supabaseUrl, key: supabaseKey } = getSupabaseCredentials();

  if (!supabaseUrl || !supabaseKey) {
    return null;
  }

  if (!supabaseClient) {
    try {
      supabaseClient = createClient(supabaseUrl, supabaseKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      });
      console.log('Cliente de Supabase inicializado correctamente con URL:', supabaseUrl);
    } catch (err) {
      console.error('Error al inicializar cliente de Supabase:', err.message);
      return null;
    }
  }

  return supabaseClient;
}

// -------------------------------------------------------------
// API ENDPOINTS
// -------------------------------------------------------------

// 1. Health check & Supabase connection status
app.get('/api/status', async (req, res) => {
  const { url: supabaseUrl, key: supabaseKey } = getSupabaseCredentials();

  const isConfigured = Boolean(supabaseUrl && supabaseKey);
  let dbReachable = false;
  let errorDetail = null;

  if (isConfigured) {
    try {
      const client = getSupabase();
      if (client) {
        // Test query on 'reservas' table
        const { error } = await client.from('reservas').select('id').limit(1);
        if (!error) {
          dbReachable = true;
        } else {
          errorDetail = error.message;
        }
      }
    } catch (err) {
      errorDetail = err.message;
    }
  }

  return res.json({
    configured: isConfigured,
    dbReachable,
    hasUrl: Boolean(supabaseUrl),
    hasKey: Boolean(supabaseKey),
    normalizedUrl: supabaseUrl,
    error: errorDetail,
    message: isConfigured
      ? dbReachable
        ? 'Conectado exitosamente con Supabase.'
        : `Supabase configurado, pero hubo un detalle al conectar con la tabla "reservas": ${errorDetail || 'Verifica que la tabla exista'}`
      : 'Credenciales de Supabase no configuradas. Guardando en modo local temporal.',
  });
});

// 2. Crear nueva reserva
app.post('/api/reservas', async (req, res) => {
  try {
    const {
      nombre,
      email,
      telefono,
      fecha_entrada,
      fecha_salida,
      habitacion,
      huespedes,
      mensaje,
    } = req.body;

    // Validación básica
    if (!nombre || !email || !telefono || !fecha_entrada || !fecha_salida || !habitacion) {
      return res.status(400).json({
        success: false,
        message: 'Por favor completa todos los campos obligatorios.',
      });
    }

    const client = getSupabase();

    if (client) {
      // Guardar directamente en Supabase
      const payload = {
        nombre: String(nombre).trim(),
        email: String(email).trim(),
        telefono: String(telefono).trim(),
        fecha_entrada,
        fecha_salida,
        habitacion: String(habitacion).trim(),
        huespedes: parseInt(huespedes, 10) || 1,
        mensaje: mensaje ? String(mensaje).trim() : '',
        estado: 'pendiente',
      };

      const { data, error } = await client
        .from('reservas')
        .insert([payload])
        .select();

      if (error) {
        console.error('Error insertando en Supabase:', error);
        let hint = 'Revisa la consola del servidor para más detalles.';
        if (error.message && error.message.includes('fetch failed')) {
          hint = 'Hubo un error de conexión de red con Supabase. Verifica que SUPABASE_URL comience con https:// y termine en .supabase.co';
        } else if (error.message && (error.message.includes('relation') || error.message.includes('not found') || error.message.includes('does not exist'))) {
          hint = 'Verifica que la tabla "reservas" exista en tu base de datos Supabase ejecutando el script supabase-schema.sql en el SQL Editor';
        } else if (error.message && error.message.includes('policy')) {
          hint = 'Error de políticas RLS: Asegúrate de haber ejecutado las políticas CREATE POLICY de supabase-schema.sql';
        }
        return res.status(500).json({
          success: false,
          error: error.message,
          hint,
        });
      }

      const reservaCreada = Array.isArray(data) && data.length > 0 ? data[0] : payload;

      return res.status(201).json({
        success: true,
        message: '¡Reserva guardada exitosamente en Supabase!',
        storage: 'supabase',
        reserva: reservaCreada,
      });
    } else {
      // Almacenamiento local temporal si las variables de entorno aún no fueron añadidas
      const fallbackReserva = {
        id: Date.now(),
        nombre: String(nombre).trim(),
        email: String(email).trim(),
        telefono: String(telefono).trim(),
        fecha_entrada,
        fecha_salida,
        habitacion: String(habitacion).trim(),
        huespedes: parseInt(huespedes, 10) || 1,
        mensaje: mensaje ? String(mensaje).trim() : '',
        estado: 'pendiente',
        created_at: new Date().toISOString(),
      };

      localReservas.unshift(fallbackReserva);

      return res.status(201).json({
        success: true,
        message: 'Reserva registrada temporalmente (Modo local).',
        storage: 'local_fallback',
        warning:
          'Supabase aún no ha sido configurado en las variables de entorno (SUPABASE_URL y SUPABASE_KEY). Tu reserva se almacenó en memoria.',
        reserva: fallbackReserva,
      });
    }
  } catch (err) {
    console.error('Error procesando reserva:', err);
    return res.status(500).json({
      success: false,
      message: 'Ocurrió un error en el servidor al registrar la reserva.',
      error: err.message,
    });
  }
});

// 3. Listar reservas registradas
app.get('/api/reservas', async (req, res) => {
  try {
    const client = getSupabase();

    if (client) {
      const { data, error } = await client
        .from('reservas')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('Error obteniendo reservas de Supabase:', error);
        return res.status(500).json({
          success: false,
          error: error.message,
        });
      }

      return res.json({
        success: true,
        storage: 'supabase',
        reservas: data || [],
      });
    } else {
      return res.json({
        success: true,
        storage: 'local_fallback',
        reservas: localReservas,
      });
    }
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// 4. Actualizar estado de una reserva (ej: confirmar, cancelar)
app.patch('/api/reservas/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;

    if (!estado) {
      return res.status(400).json({ success: false, message: 'Estado requerido' });
    }

    const client = getSupabase();
    if (client) {
      const { data, error } = await client
        .from('reservas')
        .update({ estado })
        .eq('id', id)
        .select();

      if (error) {
        return res.status(500).json({ success: false, error: error.message });
      }

      return res.json({ success: true, reserva: data ? data[0] : null });
    } else {
      const item = localReservas.find((r) => String(r.id) === String(id));
      if (item) {
        item.estado = estado;
        return res.json({ success: true, reserva: item });
      }
      return res.status(404).json({ success: false, message: 'Reserva no encontrada' });
    }
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// -------------------------------------------------------------
// SERVIR ARCHIVOS ESTÁTICOS
// -------------------------------------------------------------
const candidateDir = path.join(__dirname, 'hotel 1103');
const staticDir = fs.existsSync(candidateDir) ? candidateDir : path.join(__dirname, 'dist');

app.use(express.static(staticDir));
app.use('/hotel 1103', express.static(staticDir));
app.use('/hotel%201103', express.static(staticDir));

// Fallback a index.html para cualquier ruta de navegación
app.get('*', (req, res) => {
  res.sendFile(path.join(staticDir, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor de Hotel Paraíso Tame corriendo en http://0.0.0.0:${PORT}`);
});
