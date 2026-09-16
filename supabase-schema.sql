-- ==============================================================================
-- SCHEMA SQL PARA SUPABASE - HOTEL PARAÍSO TAME
-- Copia y pega este contenido en el SQL Editor de tu proyecto en Supabase
-- (https://supabase.com/dashboard/project/_/sql)
-- ==============================================================================

-- 1. Tabla de Reservas
CREATE TABLE IF NOT EXISTS public.reservas (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    nombre TEXT NOT NULL,
    email TEXT NOT NULL,
    telefono TEXT NOT NULL,
    fecha_entrada DATE NOT NULL,
    fecha_salida DATE NOT NULL,
    habitacion TEXT NOT NULL,
    huespedes INTEGER DEFAULT 1 NOT NULL,
    mensaje TEXT DEFAULT '',
    estado TEXT DEFAULT 'pendiente' -- pendiente, confirmada, cancelada
);

-- 2. Índices para acelerar búsquedas
CREATE INDEX IF NOT EXISTS idx_reservas_email ON public.reservas(email);
CREATE INDEX IF NOT EXISTS idx_reservas_fecha_entrada ON public.reservas(fecha_entrada);
CREATE INDEX IF NOT EXISTS idx_reservas_estado ON public.reservas(estado);

-- 3. Habilitar Seguridad a Nivel de Fila (Row Level Security - RLS)
ALTER TABLE public.reservas ENABLE ROW LEVEL SECURITY;

-- 4. Políticas de Acceso (RLS)
-- Permitir a la web pública (clientes) enviar reservas
CREATE POLICY "Permitir a cualquier usuario crear reservas"
ON public.reservas
FOR INSERT
TO public
WITH CHECK (true);

-- Permitir consultar reservas (lectura)
CREATE POLICY "Permitir consultar reservas"
ON public.reservas
FOR SELECT
TO public
USING (true);

-- Permitir actualizar estado de reservas (si se desea)
CREATE POLICY "Permitir actualizar reservas"
ON public.reservas
FOR UPDATE
TO public
USING (true);

-- 5. Tabla opcional de Habitaciones (para gestionar precios y disponibilidad)
CREATE TABLE IF NOT EXISTS public.habitaciones (
    id BIGSERIAL PRIMARY KEY,
    nombre TEXT NOT NULL,
    categoria TEXT NOT NULL,
    precio NUMERIC NOT NULL,
    capacidad INTEGER NOT NULL,
    descripcion TEXT,
    imagen_url TEXT,
    disponible BOOLEAN DEFAULT true
);

-- Insertar las habitaciones predeterminadas del hotel
INSERT INTO public.habitaciones (nombre, categoria, precio, capacidad, descripcion, disponible)
VALUES 
    ('Habitación Individual', 'Individual', 80000, 1, 'Un espacio tranquilo y cómodo para descansar después de un largo día.', true),
    ('Habitación Doble', 'Doble', 120000, 2, 'Una habitación amplia para disfrutar cómodamente en pareja o con un acompañante.', true),
    ('Habitación Familiar', 'Familiar', 180000, 4, 'Amplio espacio diseñado para familias que desean comodidad durante su estadía.', true)
ON CONFLICT DO NOTHING;
